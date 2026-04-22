/**
 * Decor Items Generator - Phase 2B
 * 
 * Procedural generation of decorative items for indoor scenes
 * Based on original InfiniGen decor generators
 * 
 * Categories:
 * - Lamps (ceiling, floor, table, classic)
 * - Rugs (area rugs, runners)
 * - Wall Art (frames, canvases, balloons)
 * - Vases (decorative vessels)
 * - Books (single and stacks)
 */

import * as THREE from 'three';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters } from './BaseAssetGenerator';
import { SeededRandom } from '../../utils/SeededRandom';

export interface DecorParameters extends AssetParameters {
  // Common parameters
  scale?: number;
  
  // Lamp-specific
  lampType?: 'ceiling' | 'floor' | 'table' | 'desk' | 'pendant';
  shadeStyle?: 'cone' | 'cylinder' | 'empire' | 'coolie' | 'globe' | 'bell';
  baseStyle?: 'cylindrical' | 'conical' | 'tiered' | 'tripod' | 'architectural';
  bulbVisible?: boolean;
  lightColor?: [number, number, number];
  cordLength?: number;
  
  // Rug-specific
  rugShape?: 'rectangle' | 'square' | 'round' | 'oval' | 'runner';
  rugWidth?: number;
  rugLength?: number;
  rugPattern?: 'solid' | 'striped' | 'geometric' | 'oriental' | 'shag';
  pileHeight?: number;
  fringe?: boolean;
  
  // Wall art-specific
  artType?: 'frame' | 'canvas' | 'poster' | 'balloon' | 'skirting';
  frameWidth?: number;
  frameDepth?: number;
  artWidth?: number;
  artHeight?: number;
  matBorder?: boolean;
  glassCover?: boolean;
  
  // Vase-specific
  vaseStyle?: 'cylinder' | 'bulb' | 'flask' | 'amphora' | 'pitcher' | ' urn';
  vaseHeight?: number;
  vaseOpening?: number;
  handleCount?: number;
  decorativeElements?: boolean;
  
  // Book-specific
  bookFormat?: 'hardcover' | 'paperback' | 'magazine';
  bookThickness?: number;
  bookWidth?: number;
  bookHeight?: number;
  stackCount?: number;
  curvedPages?: boolean;
  bookmark?: boolean;
}

export class DecorGenerator extends BaseAssetGenerator<DecorParameters> {
  protected getDefaultParameters(): DecorParameters {
    return {
      scale: 1.0,
      
      // Lamp defaults
      lampType: 'floor',
      shadeStyle: 'empire',
      baseStyle: 'cylindrical',
      bulbVisible: false,
      lightColor: [1.0, 0.95, 0.8],
      cordLength: 1.5,
      
      // Rug defaults
      rugShape: 'rectangle',
      rugWidth: 2.0,
      rugLength: 3.0,
      rugPattern: 'geometric',
      pileHeight: 0.02,
      fringe: false,
      
      // Wall art defaults
      artType: 'frame',
      frameWidth: 0.05,
      frameDepth: 0.03,
      artWidth: 0.6,
      artHeight: 0.8,
      matBorder: true,
      glassCover: false,
      
      // Vase defaults
      vaseStyle: 'bulb',
      vaseHeight: 0.4,
      vaseOpening: 0.1,
      handleCount: 0,
      decorativeElements: false,
      
      // Book defaults
      bookFormat: 'hardcover',
      bookThickness: 0.03,
      bookWidth: 0.15,
      bookHeight: 0.22,
      stackCount: 1,
      curvedPages: false,
      bookmark: false,
    };
  }

  generate(params: DecorParameters = {}, seed?: number): GeneratedAsset {
    const rng = new SeededRandom(seed);
    const mergedParams = { ...this.getDefaultParameters(), ...params };
    const { scale = 1.0 } = mergedParams;
    
    // Determine decor type based on parameters or random selection
    const decorTypes = ['lamp', 'rug', 'wallArt', 'vase', 'book'];
    const selectedType = params.lampType ? 'lamp' :
                         params.rugShape ? 'rug' :
                         params.artType ? 'wallArt' :
                         params.vaseStyle ? 'vase' :
                         params.bookFormat ? 'book' :
                         decorTypes[Math.floor(rng.next() * decorTypes.length)];
    
    let geometry: THREE.BufferGeometry;
    let bbox: THREE.Box3;
    let tags: string[] = [];
    let materialZones: Record<string, string[]> = {};
    
    switch (selectedType) {
      case 'lamp':
        ({ geometry, bbox, tags, materialZones } = this.generateLamp(mergedParams, rng));
        break;
      case 'rug':
        ({ geometry, bbox, tags, materialZones } = this.generateRug(mergedParams, rng));
        break;
      case 'wallArt':
        ({ geometry, bbox, tags, materialZones } = this.generateWallArt(mergedParams, rng));
        break;
      case 'vase':
        ({ geometry, bbox, tags, materialZones } = this.generateVase(mergedParams, rng));
        break;
      case 'book':
        ({ geometry, bbox, tags, materialZones } = this.generateBook(mergedParams, rng));
        break;
      default:
        ({ geometry, bbox, tags, materialZones } = this.generateLamp(mergedParams, rng));
    }
    
    // Apply global scale
    geometry.scale(scale, scale, scale);
    bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    // Generate LODs
    const lods = this.generateLODs(geometry, bbox);
    const collisionGeometry = this.createCollisionGeometry(geometry, bbox);
    
    return {
      geometry,
      bbox,
      tags: [
        'decor',
        `decor_${selectedType}`,
        ...tags,
        ...(scale < 0.5 ? ['small'] : scale > 1.5 ? ['large'] : ['medium']),
      ],
      parameters: mergedParams,
      lod: lods,
      collisionGeometry,
      metadata: {
        generator: 'DecorGenerator',
        decorType: selectedType,
        seed: seed ?? Math.random(),
      },
    };
  }

  private generateLamp(params: DecorParameters, rng: SeededRandom): {
    geometry: THREE.BufferGeometry;
    bbox: THREE.Box3;
    tags: string[];
    materialZones: Record<string, string[]>;
  } {
    const {
      lampType = 'floor',
      shadeStyle = 'empire',
      baseStyle = 'cylindrical',
      bulbVisible = false,
      lightColor = [1.0, 0.95, 0.8],
      cordLength = 1.5,
    } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const tags: string[] = ['lamp', 'lighting', `lamp_${lampType}`, `shade_${shadeStyle}`, `base_${baseStyle}`];
    const materialZones: Record<string, string[]> = {};
    
    // Dimensions based on lamp type
    let totalHeight: number;
    let baseHeight: number;
    let poleHeight: number;
    
    switch (lampType) {
      case 'ceiling':
        totalHeight = 0.3 + rng.next() * 0.3;
        baseHeight = 0.05;
        poleHeight = cordLength;
        break;
      case 'floor':
        totalHeight = 1.4 + rng.next() * 0.4;
        baseHeight = 0.05 + rng.next() * 0.05;
        poleHeight = totalHeight * 0.6;
        break;
      case 'table':
      case 'desk':
        totalHeight = 0.4 + rng.next() * 0.2;
        baseHeight = 0.03 + rng.next() * 0.03;
        poleHeight = totalHeight * 0.4;
        break;
      case 'pendant':
        totalHeight = 0.2 + rng.next() * 0.2;
        baseHeight = 0.02;
        poleHeight = cordLength;
        break;
      default:
        totalHeight = 1.5;
        baseHeight = 0.05;
        poleHeight = 0.9;
    }
    
    const shadeHeight = totalHeight * 0.25;
    const shadeRadius = shadeHeight * (0.6 + rng.next() * 0.4);
    
    // 1. Base
    const baseGeometry = this.createLampBase(baseStyle, baseHeight, rng);
    baseGeometry.translate(0, baseHeight / 2, 0);
    geometries.push(baseGeometry);
    materialZones['base'] = ['metal_brushed', 'metal_painted', 'ceramic_glazed', 'wood_turned'];
    
    // 2. Pole/Stem
    if (lampType !== 'ceiling' && lampType !== 'pendant') {
      const poleRadius = 0.01 + rng.next() * 0.015;
      const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius * 0.8, poleHeight, 8);
      poleGeometry.translate(0, baseHeight + poleHeight / 2, 0);
      geometries.push(poleGeometry);
      materialZones['pole'] = ['metal_brushed', 'metal_chrome', 'wood_dark'];
    } else if (lampType === 'ceiling' || lampType === 'pendant') {
      // Cord
      const cordRadius = 0.003;
      const cordGeometry = new THREE.CylinderGeometry(cordRadius, cordRadius, cordLength, 6);
      cordGeometry.translate(0, cordLength / 2, 0);
      geometries.push(cordGeometry);
      materialZones['cord'] = ['fabric_black', 'rubber'];
    }
    
    // 3. Shade
    const shadeGeometry = this.createLampShade(shadeStyle, shadeHeight, shadeRadius, rng);
    const shadeY = baseHeight + poleHeight + shadeHeight / 2;
    shadeGeometry.translate(0, shadeY, 0);
    geometries.push(shadeGeometry);
    materialZones['shade'] = ['fabric_linen', 'fabric_silk', 'paper_rice', 'glass_frosted', 'plastic_translucent'];
    
    // 4. Bulb (if visible)
    if (bulbVisible) {
      const bulbRadius = 0.04 + rng.next() * 0.02;
      const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
      const bulbY = baseHeight + poleHeight + shadeHeight * 0.3;
      bulbGeometry.translate(0, bulbY, 0);
      geometries.push(bulbGeometry);
      materialZones['bulb'] = ['glass_clear', 'glass_frosted'];
      tags.push('visible_bulb');
    }
    
    // 5. Ceiling mount (for ceiling/pendant lamps)
    if (lampType === 'ceiling' || lampType === 'pendant') {
      const mountRadius = 0.08;
      const mountHeight = 0.02;
      const mountGeometry = new THREE.CylinderGeometry(mountRadius, mountRadius, mountHeight, 12);
      mountGeometry.translate(0, cordLength + mountHeight / 2, 0);
      geometries.push(mountGeometry);
      materialZones['mount'] = ['metal_white', 'plastic_white'];
      tags.push('ceiling_mounted');
    }
    
    // Merge geometries
    const geometry = this.mergeGeometries(geometries);
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    if (lampType === 'floor') tags.push('floor_standing');
    if (lampType === 'table' || lampType === 'desk') tags.push('tabletop');
    
    return { geometry, bbox, tags, materialZones };
  }
  
  private createLampBase(style: string, height: number, rng: SeededRandom): THREE.BufferGeometry {
    const baseRadius = 0.1 + rng.next() * 0.1;
    
    switch (style) {
      case 'cylindrical': {
        return new THREE.CylinderGeometry(baseRadius, baseRadius * 0.9, height, 12);
      }
      case 'conical': {
        return new THREE.CylinderGeometry(baseRadius * 1.2, baseRadius * 0.7, height, 12);
      }
      case 'tiered': {
        const group = new THREE.Group();
        const tiers = 2 + Math.floor(rng.next() * 2);
        let y = 0;
        for (let i = 0; i < tiers; i++) {
          const tierHeight = height / tiers;
          const tierRadius = baseRadius * (1 - i / tiers * 0.3);
          const tierGeo = new THREE.CylinderGeometry(tierRadius, tierRadius * 0.9, tierHeight, 12);
          tierGeo.translate(0, y + tierHeight / 2, 0);
          const mesh = new THREE.Mesh(tierGeo);
          group.add(mesh);
          y += tierHeight;
        }
        group.updateMatrixWorld(true);
        const merged = this.mergeGroupGeometries(group);
        return merged;
      }
      case 'tripod': {
        const group = new THREE.Group();
        const legLength = height;
        const legRadius = 0.015;
        const spreadAngle = Math.PI / 6;
        
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2;
          const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.7, legLength, 8);
          legGeo.rotateX(spreadAngle);
          legGeo.rotateY(angle);
          legGeo.translate(Math.sin(angle) * baseRadius * 0.5, legLength * 0.4, Math.cos(angle) * baseRadius * 0.5);
          const mesh = new THREE.Mesh(legGeo);
          group.add(mesh);
        }
        
        // Top plate
        const plateGeo = new THREE.CylinderGeometry(baseRadius * 0.3, baseRadius * 0.3, 0.03, 8);
        plateGeo.translate(0, height - 0.015, 0);
        group.add(new THREE.Mesh(plateGeo));
        
        group.updateMatrixWorld(true);
        return this.mergeGroupGeometries(group);
      }
      case 'architectural': {
        // Square base with beveled edges
        const size = baseRadius * 1.5;
        return new THREE.BoxGeometry(size, height, size, 4, 4, 4);
      }
      default:
        return new THREE.CylinderGeometry(baseRadius, baseRadius * 0.9, height, 12);
    }
  }
  
  private createLampShade(style: string, height: number, radius: number, rng: SeededRandom): THREE.BufferGeometry {
    const topRadius = radius * (0.5 + rng.next() * 0.3);
    const bottomRadius = radius * (0.8 + rng.next() * 0.4);
    
    switch (style) {
      case 'cone': {
        return new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16, 1, true);
      }
      case 'cylinder': {
        return new THREE.CylinderGeometry(radius, radius, height, 16, 1, true);
      }
      case 'empire': {
        // Classic empire shape: slightly curved sides
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(topRadius, height / 2, 0),
          new THREE.Vector3((topRadius + bottomRadius) * 0.5, 0, 0),
          new THREE.Vector3(bottomRadius, -height / 2, 0),
        ]);
        return new THREE.TubeGeometry(curve, 16, 0.01, 16, false);
      }
      case 'coolie': {
        // Asian-style conical shade
        return new THREE.CylinderGeometry(topRadius * 0.7, bottomRadius * 1.2, height, 16, 1, true);
      }
      case 'globe': {
        // Spherical shade
        const sphereRadius = height * 0.6;
        const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
        // Cut open top and bottom
        return geometry;
      }
      case 'bell': {
        // Bell-shaped with curved profile
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const y = (t - 0.5) * height;
          const r = topRadius + (bottomRadius - topRadius) * Math.sin(t * Math.PI);
          points.push(new THREE.Vector3(r, y, 0));
        }
        const geometry = new THREE.LatheGeometry(points, 16);
        return geometry;
      }
      default:
        return new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16, 1, true);
    }
  }

  private generateRug(params: DecorParameters, rng: SeededRandom): {
    geometry: THREE.BufferGeometry;
    bbox: THREE.Box3;
    tags: string[];
    materialZones: Record<string, string[]>;
  } {
    const {
      rugShape = 'rectangle',
      rugWidth = 2.0,
      rugLength = 3.0,
      rugPattern = 'geometric',
      pileHeight = 0.02,
      fringe = false,
    } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const tags: string[] = ['rug', 'floor_covering', `rug_${rugShape}`, `pattern_${rugPattern}`];
    const materialZones: Record<string, string[]> = {};
    
    const thickness = pileHeight * 2;
    
    switch (rugShape) {
      case 'rectangle':
      case 'square': {
        const width = rugShape === 'square' ? rugWidth : rugWidth;
        const length = rugShape === 'square' ? rugWidth : rugLength;
        
        const mainGeo = new THREE.BoxGeometry(width, thickness, length, 8, 1, 8);
        geometries.push(mainGeo);
        
        // Fringe on short ends
        if (fringe) {
          const fringeLength = 0.05;
          const fringeThickness = 0.01;
          
          // Front fringe
          const frontFringeGeo = new THREE.BoxGeometry(width, fringeThickness, fringeLength, 12, 1, 4);
          frontFringeGeo.translate(0, -thickness / 2 - fringeThickness / 2, length / 2 + fringeLength / 2);
          geometries.push(frontFringeGeo);
          
          // Back fringe
          const backFringeGeo = new THREE.BoxGeometry(width, fringeThickness, fringeLength, 12, 1, 4);
          backFringeGeo.translate(0, -thickness / 2 - fringeThickness / 2, -length / 2 - fringeLength / 2);
          geometries.push(backFringeGeo);
          
          tags.push('fringe');
        }
        
        tags.push('rectangular');
        break;
      }
      case 'round': {
        const radius = rugWidth / 2;
        const segments = 32;
        const mainGeo = new THREE.CylinderGeometry(radius, radius, thickness, segments, 1);
        geometries.push(mainGeo);
        tags.push('circular', 'round');
        break;
      }
      case 'oval': {
        // Create oval by scaling a cylinder
        const radiusX = rugWidth / 2;
        const radiusZ = rugLength / 2;
        const mainGeo = new THREE.CylinderGeometry(1, 1, thickness, 32, 1);
        mainGeo.scale(radiusX, 1, radiusZ);
        geometries.push(mainGeo);
        tags.push('oval', 'elliptical');
        break;
      }
      case 'runner': {
        const runnerWidth = 0.6;
        const runnerLength = rugLength || 2.5;
        const mainGeo = new THREE.BoxGeometry(runnerWidth, thickness, runnerLength, 4, 1, 12);
        geometries.push(mainGeo);
        
        if (fringe) {
          const fringeLength = 0.04;
          const fringeThickness = 0.008;
          
          const frontFringeGeo = new THREE.BoxGeometry(runnerWidth, fringeThickness, fringeLength, 8, 1, 3);
          frontFringeGeo.translate(0, -thickness / 2 - fringeThickness / 2, runnerLength / 2 + fringeLength / 2);
          geometries.push(frontFringeGeo);
          
          const backFringeGeo = new THREE.BoxGeometry(runnerWidth, fringeThickness, fringeLength, 8, 1, 3);
          backFringeGeo.translate(0, -thickness / 2 - fringeThickness / 2, -runnerLength / 2 - fringeLength / 2);
          geometries.push(backFringeGeo);
          
          tags.push('fringe');
        }
        
        tags.push('runner', 'hallway');
        break;
      }
    }
    
    // Add pattern details (subtle displacement via additional geometry layers)
    if (rugPattern === 'striped' || rugPattern === 'geometric' || rugPattern === 'oriental') {
      // Pattern would be implemented via texture in practice
      // For geometry, we add subtle border
      const borderHeight = thickness * 0.3;
      const borderWidth = 0.05;
      
      if (rugShape === 'rectangle' || rugShape === 'square' || rugShape === 'runner') {
        const borderGeo = new THREE.BoxGeometry(rugWidth - borderWidth * 2, borderHeight, borderWidth, 4, 1, 4);
        borderGeo.translate(0, thickness / 2 + borderHeight / 2, (rugLength || rugWidth) / 2 - borderWidth / 2);
        geometries.push(borderGeo);
      }
      
      tags.push(`pattern_${rugPattern}`);
    }
    
    if (rugPattern === 'shag') {
      tags.push('shag', 'high_pile', 'textured');
      materialZones['surface'] = ['fabric_shag', 'wool_thick'];
    } else if (rugPattern === 'oriental') {
      tags.push('oriental', 'traditional', 'decorative');
      materialZones['surface'] = ['fabric_oriental', 'wool_patterned'];
    } else {
      materialZones['surface'] = ['fabric_wool', 'fabric_synthetic', 'cotton'];
    }
    
    const geometry = this.mergeGeometries(geometries);
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    return { geometry, bbox, tags, materialZones };
  }

  private generateWallArt(params: DecorParameters, rng: SeededRandom): {
    geometry: THREE.BufferGeometry;
    bbox: THREE.Box3;
    tags: string[];
    materialZones: Record<string, string[]>;
  } {
    const {
      artType = 'frame',
      frameWidth = 0.05,
      frameDepth = 0.03,
      artWidth = 0.6,
      artHeight = 0.8,
      matBorder = true,
      glassCover = false,
    } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const tags: string[] = ['wall_art', 'decoration', `art_${artType}`];
    const materialZones: Record<string, string[]> = {};
    
    switch (artType) {
      case 'frame': {
        // Frame border
        const frameThickness = frameDepth;
        const outerWidth = artWidth + frameWidth * 2;
        const outerHeight = artHeight + frameWidth * 2;
        
        // Create frame using box geometries for each side
        // Top
        const topFrame = new THREE.BoxGeometry(outerWidth, frameWidth, frameThickness);
        topFrame.translate(0, artHeight / 2 + frameWidth / 2, 0);
        geometries.push(topFrame);
        
        // Bottom
        const bottomFrame = new THREE.BoxGeometry(outerWidth, frameWidth, frameThickness);
        bottomFrame.translate(0, -artHeight / 2 - frameWidth / 2, 0);
        geometries.push(bottomFrame);
        
        // Left
        const leftFrame = new THREE.BoxGeometry(frameWidth, artHeight, frameThickness);
        leftFrame.translate(-artWidth / 2 - frameWidth / 2, 0, 0);
        geometries.push(leftFrame);
        
        // Right
        const rightFrame = new THREE.BoxGeometry(frameWidth, artHeight, frameThickness);
        rightFrame.translate(artWidth / 2 + frameWidth / 2, 0, 0);
        geometries.push(rightFrame);
        
        materialZones['frame'] = ['wood_dark', 'wood_light', 'metal_gold', 'metal_silver', 'plastic_white'];
        tags.push('framed', 'picture_frame');
        
        // Mat border (optional)
        if (matBorder) {
          const matWidth = frameWidth * 0.6;
          const matOuterWidth = artWidth + matWidth * 2;
          const matOuterHeight = artHeight + matWidth * 2;
          
          const topMat = new THREE.BoxGeometry(matOuterWidth, matWidth, frameThickness * 0.5);
          topMat.translate(0, artHeight / 2 + matWidth / 2, frameThickness * 0.25);
          geometries.push(topMat);
          
          const bottomMat = new THREE.BoxGeometry(matOuterWidth, matWidth, frameThickness * 0.5);
          bottomMat.translate(0, -artHeight / 2 - matWidth / 2, frameThickness * 0.25);
          geometries.push(bottomMat);
          
          const leftMat = new THREE.BoxGeometry(matWidth, artHeight, frameThickness * 0.5);
          leftMat.translate(-artWidth / 2 - matWidth / 2, 0, frameThickness * 0.25);
          geometries.push(leftMat);
          
          const rightMat = new THREE.BoxGeometry(matWidth, artHeight, frameThickness * 0.5);
          rightMat.translate(artWidth / 2 + matWidth / 2, 0, frameThickness * 0.25);
          geometries.push(rightMat);
          
          materialZones['mat'] = ['paper_white', 'paper_cream', 'paper_black'];
          tags.push('mat_border');
        }
        
        // Art surface (canvas/paper)
        const artSurface = new THREE.PlaneGeometry(artWidth, artHeight);
        artSurface.translate(0, 0, frameThickness * 0.5);
        geometries.push(artSurface);
        materialZones['art'] = ['canvas', 'paper_photo', 'paper_print'];
        
        // Glass cover (optional)
        if (glassCover) {
          const glass = new THREE.PlaneGeometry(outerWidth, outerHeight);
          glass.translate(0, 0, frameThickness);
          geometries.push(glass);
          materialZones['glass'] = ['glass_clear', 'glass_acrylic'];
          tags.push('glass_covered');
        }
        
        tags.push('rectangular');
        break;
      }
      
      case 'canvas': {
        // Stretched canvas with wooden frame backing
        const canvasDepth = 0.04;
        const canvasGeo = new THREE.BoxGeometry(artWidth, artHeight, canvasDepth);
        geometries.push(canvasGeo);
        
        materialZones['canvas'] = ['canvas_blank', 'canvas_painted'];
        materialZones['frame_back'] = ['wood_rough'];
        tags.push('canvas', 'stretched');
        break;
      }
      
      case 'poster': {
        // Simple poster (thin plane)
        const posterDepth = 0.002;
        const posterGeo = new THREE.PlaneGeometry(artWidth, artHeight);
        geometries.push(posterGeo);
        
        materialZones['poster'] = ['paper_glossy', 'paper_matte'];
        tags.push('poster', 'paper');
        break;
      }
      
      case 'balloon': {
        // Decorative balloon (sphere with string)
        const balloonRadius = 0.15 + rng.next() * 0.1;
        const balloonGeo = new THREE.SphereGeometry(balloonRadius, 16, 16);
        geometries.push(balloonGeo);
        
        // String
        const stringLength = 0.5 + rng.next() * 0.3;
        const stringGeo = new THREE.CylinderGeometry(0.002, 0.002, stringLength, 6);
        stringGeo.translate(0, -balloonRadius - stringLength / 2, 0);
        geometries.push(stringGeo);
        
        materialZones['balloon'] = ['latex_red', 'latex_blue', 'latex_gold', 'latex_silver'];
        materialZones['string'] = ['thread'];
        tags.push('balloon', 'party', 'floating');
        break;
      }
      
      case 'skirting': {
        // Decorative wall skirting/molding
        const skirtHeight = 0.1;
        const skirtDepth = 0.03;
        const skirtLength = artWidth;
        
        // Profile molding shape
        const skirtGeo = new THREE.BoxGeometry(skirtLength, skirtHeight, skirtDepth);
        geometries.push(skirtGeo);
        
        materialZones['skirting'] = ['wood_painted', 'wood_stained', 'plastic_white'];
        tags.push('skirting', 'molding', 'wall_trim');
        break;
      }
    }
    
    const geometry = this.mergeGeometries(geometries);
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    return { geometry, bbox, tags, materialZones };
  }

  private generateVase(params: DecorParameters, rng: SeededRandom): {
    geometry: THREE.BufferGeometry;
    bbox: THREE.Box3;
    tags: string[];
    materialZones: Record<string, string[]>;
  } {
    const {
      vaseStyle = 'bulb',
      vaseHeight = 0.4,
      vaseOpening = 0.1,
      handleCount = 0,
      decorativeElements = false,
    } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const tags: string[] = ['vase', 'container', `vase_${vaseStyle}`];
    const materialZones: Record<string, string[]> = {};
    
    const baseRadius = vaseHeight * 0.3;
    const neckRadius = vaseOpening / 2;
    
    switch (vaseStyle) {
      case 'cylinder': {
        // Simple cylindrical vase
        const bodyGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.9, vaseHeight * 0.8, 16, 1, true);
        bodyGeo.translate(0, vaseHeight * 0.4, 0);
        geometries.push(bodyGeo);
        
        // Neck
        const neckGeo = new THREE.CylinderGeometry(neckRadius, baseRadius, vaseHeight * 0.2, 16, 1, true);
        neckGeo.translate(0, vaseHeight * 0.9, 0);
        geometries.push(neckGeo);
        
        // Rim
        const rimGeo = new THREE.TorusGeometry(neckRadius + 0.01, 0.005, 8, 24);
        rimGeo.rotateX(Math.PI / 2);
        rimGeo.translate(0, vaseHeight, 0);
        geometries.push(rimGeo);
        
        tags.push('cylindrical', 'modern');
        break;
      }
      
      case 'bulb': {
        // Bulbous vase with wide middle
        const points: THREE.Vector3[] = [];
        const segments = 20;
        
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const y = t * vaseHeight;
          
          // Bulb profile: narrow at top and bottom, wide in middle
          let radius: number;
          if (t < 0.2) {
            radius = neckRadius + (baseRadius - neckRadius) * (t / 0.2);
          } else if (t < 0.5) {
            radius = baseRadius + (baseRadius * 0.3) * ((t - 0.2) / 0.3);
          } else if (t < 0.8) {
            radius = baseRadius * 1.3 - (baseRadius * 0.4) * ((t - 0.5) / 0.3);
          } else {
            radius = baseRadius * 0.9 - (baseRadius * 0.3) * ((t - 0.8) / 0.2);
          }
          
          points.push(new THREE.Vector3(radius, y, 0));
        }
        
        const bodyGeo = new THREE.LatheGeometry(points, 16);
        geometries.push(bodyGeo);
        
        // Rim
        const rimGeo = new THREE.TorusGeometry(neckRadius + 0.01, 0.005, 8, 24);
        rimGeo.rotateX(Math.PI / 2);
        rimGeo.translate(0, vaseHeight, 0);
        geometries.push(rimGeo);
        
        tags.push('bulbous', 'classic');
        break;
      }
      
      case 'flask': {
        // Flask-shaped vase (narrow neck, round body)
        const bodyRadius = baseRadius * 1.2;
        const neckHeight = vaseHeight * 0.4;
        const bodyHeight = vaseHeight - neckHeight;
        
        // Body (sphere-like)
        const bodyGeo = new THREE.SphereGeometry(bodyRadius, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
        bodyGeo.scale(1, 1.2, 1);
        bodyGeo.translate(0, bodyHeight * 0.5, 0);
        geometries.push(bodyGeo);
        
        // Neck
        const neckGeo = new THREE.CylinderGeometry(neckRadius, neckRadius * 1.2, neckHeight, 16, 1, true);
        neckGeo.translate(0, bodyHeight + neckHeight / 2, 0);
        geometries.push(neckGeo);
        
        // Rim
        const rimGeo = new THREE.TorusGeometry(neckRadius + 0.008, 0.004, 8, 24);
        rimGeo.rotateX(Math.PI / 2);
        rimGeo.translate(0, vaseHeight, 0);
        geometries.push(rimGeo);
        
        tags.push('flask', 'narrow_neck');
        break;
      }
      
      case 'amphora': {
        // Classical amphora with two handles
        const points: THREE.Vector3[] = [];
        const segments = 25;
        
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const y = t * vaseHeight;
          
          // Amphora profile
          let radius: number;
          if (t < 0.1) {
            radius = baseRadius * 0.6 + (baseRadius - baseRadius * 0.6) * (t / 0.1);
          } else if (t < 0.3) {
            radius = baseRadius + (baseRadius * 0.4) * ((t - 0.1) / 0.2);
          } else if (t < 0.7) {
            radius = baseRadius * 1.4 - (baseRadius * 0.5) * ((t - 0.3) / 0.4);
          } else if (t < 0.9) {
            radius = baseRadius * 0.9 - (baseRadius * 0.3) * ((t - 0.7) / 0.2);
          } else {
            radius = neckRadius + (baseRadius * 0.6 - neckRadius) * ((t - 0.9) / 0.1);
          }
          
          points.push(new THREE.Vector3(radius, y, 0));
        }
        
        const bodyGeo = new THREE.LatheGeometry(points, 16);
        geometries.push(bodyGeo);
        
        // Handles
        if (handleCount >= 2 || handleCount === 0) {
          const handleRadius = 0.01;
          const handleCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(baseRadius * 0.8, vaseHeight * 0.7, 0),
            new THREE.Vector3(baseRadius * 1.5, vaseHeight * 0.5, 0),
            new THREE.Vector3(baseRadius * 1.6, vaseHeight * 0.3, 0),
            new THREE.Vector3(baseRadius * 0.9, vaseHeight * 0.2, 0),
          ]);
          
          const handleGeo1 = new THREE.TubeGeometry(handleCurve, 16, handleRadius, 8, false);
          handleGeo1.rotateY(0);
          geometries.push(handleGeo1);
          
          const handleGeo2 = new THREE.TubeGeometry(handleCurve, 16, handleRadius, 8, false);
          handleGeo2.rotateY(Math.PI);
          geometries.push(handleGeo2);
          
          tags.push('handles', 'amphora', 'classical');
        }
        
        tags.push('ancient', 'decorative');
        break;
      }
      
      case 'pitcher': {
        // Pitcher with spout and handle
        const bodyHeight = vaseHeight * 0.7;
        const neckHeight = vaseHeight * 0.3;
        
        // Body
        const bodyGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.8, bodyHeight, 16, 1, true);
        bodyGeo.translate(0, bodyHeight / 2, 0);
        geometries.push(bodyGeo);
        
        // Neck
        const neckGeo = new THREE.CylinderGeometry(neckRadius * 1.5, baseRadius * 0.8, neckHeight, 16, 1, true);
        neckGeo.translate(0, bodyHeight + neckHeight / 2, 0);
        geometries.push(neckGeo);
        
        // Spout
        const spoutGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.1, 8);
        spoutGeo.rotateZ(-Math.PI / 4);
        spoutGeo.translate(neckRadius * 1.5 + 0.05, bodyHeight + neckHeight * 0.7, 0);
        geometries.push(spoutGeo);
        
        // Handle
        const handleCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-baseRadius * 0.8, bodyHeight * 0.8, 0),
          new THREE.Vector3(-baseRadius * 1.3, bodyHeight * 0.6, 0),
          new THREE.Vector3(-baseRadius * 1.4, bodyHeight * 0.4, 0),
          new THREE.Vector3(-baseRadius * 0.9, bodyHeight * 0.2, 0),
        ]);
        const handleGeo = new THREE.TubeGeometry(handleCurve, 16, 0.012, 8, false);
        geometries.push(handleGeo);
        
        tags.push('pitcher', 'spout', 'handle', 'functional');
        break;
      }
      
      default:
        // Default to bulb style
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const y = t * vaseHeight;
          let radius = baseRadius + Math.sin(t * Math.PI) * baseRadius * 0.3;
          if (t > 0.8) radius *= 0.5;
          points.push(new THREE.Vector3(radius, y, 0));
        }
        const bodyGeo = new THREE.LatheGeometry(points, 16);
        geometries.push(bodyGeo);
    }
    
    // Decorative elements (optional)
    if (decorativeElements) {
      const bandRadius = baseRadius * 1.05;
      const bandY = vaseHeight * 0.5;
      const bandGeo = new THREE.TorusGeometry(bandRadius, 0.008, 8, 24);
      bandGeo.rotateX(Math.PI / 2);
      bandGeo.translate(0, bandY, 0);
      geometries.push(bandGeo);
      tags.push('decorative_band');
    }
    
    // Material zones
    materialZones['body'] = ['ceramic_glazed', 'ceramic_terracotta', 'glass_clear', 'glass_colored', 'metal_brass'];
    
    const geometry = this.mergeGeometries(geometries);
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    return { geometry, bbox, tags, materialZones };
  }

  private generateBook(params: DecorParameters, rng: SeededRandom): {
    geometry: THREE.BufferGeometry;
    bbox: THREE.Box3;
    tags: string[];
    materialZones: Record<string, string[]>;
  } {
    const {
      bookFormat = 'hardcover',
      bookThickness = 0.03,
      bookWidth = 0.15,
      bookHeight = 0.22,
      stackCount = 1,
      curvedPages = false,
      bookmark = false,
    } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const tags: string[] = ['book', 'reading', `format_${bookFormat}`];
    const materialZones: Record<string, string[]> = {};
    
    if (stackCount === 1) {
      // Single book
      switch (bookFormat) {
        case 'hardcover': {
          // Cover boards (slightly larger than pages)
          const coverThickness = 0.003;
          const coverOverhang = 0.003;
          
          // Front cover
          const frontCover = new THREE.BoxGeometry(bookWidth + coverOverhang * 2, bookHeight + coverOverhang * 2, coverThickness);
          frontCover.translate(0, 0, bookThickness / 2 + coverThickness / 2);
          geometries.push(frontCover);
          
          // Back cover
          const backCover = new THREE.BoxGeometry(bookWidth + coverOverhang * 2, bookHeight + coverOverhang * 2, coverThickness);
          backCover.translate(0, 0, -bookThickness / 2 - coverThickness / 2);
          geometries.push(backCover);
          
          // Spine
          const spineHeight = bookHeight + coverOverhang * 2;
          const spineGeo = new THREE.BoxGeometry(coverThickness, spineHeight, bookThickness);
          spineGeo.translate(-bookWidth / 2 - coverOverhang - coverThickness / 2, 0, 0);
          geometries.push(spineGeo);
          
          // Pages block
          const pageBlockThickness = bookThickness - coverThickness * 2;
          const pageBlock = new THREE.BoxGeometry(bookWidth, bookHeight - 0.002, pageBlockThickness);
          pageBlock.translate(0, 0, 0);
          
          if (curvedPages) {
            // Slightly curved page edge
            const positions = pageBlock.attributes.position;
            for (let i = 0; i < positions.count; i++) {
              const x = positions.getX(i);
              const z = positions.getZ(i);
              if (x > bookWidth / 2 - 0.01 && Math.abs(z) < pageBlockThickness / 2) {
                positions.setX(i, x + Math.sin((z + pageBlockThickness / 2) / pageBlockThickness * Math.PI) * 0.005);
              }
            }
            pageBlock.attributes.position.needsUpdate = true;
          }
          
          geometries.push(pageBlock);
          
          materialZones['cover'] = ['cloth_hardcover', 'leather_bound', 'paper_dustjacket'];
          materialZones['pages'] = ['paper_book'];
          materialZones['spine'] = ['cloth_hardcover', 'leather_bound'];
          
          tags.push('hardcover', 'rigid');
          break;
        }
        
        case 'paperback': {
          // Simple paperback (single box with rounded corners simulated)
          const bookGeo = new THREE.BoxGeometry(bookWidth, bookHeight, bookThickness);
          
          if (curvedPages) {
            // Curved spine effect
            const positions = bookGeo.attributes.position;
            for (let i = 0; i < positions.count; i++) {
              const x = positions.getX(i);
              const z = positions.getZ(i);
              if (x < -bookWidth / 2 + 0.01) {
                positions.setX(i, x - Math.sin((z + bookThickness / 2) / bookThickness * Math.PI) * 0.003);
              }
            }
            bookGeo.attributes.position.needsUpdate = true;
          }
          
          geometries.push(bookGeo);
          
          materialZones['cover'] = ['paper_paperback', 'paper_glossy'];
          materialZones['pages'] = ['paper_book'];
          
          tags.push('paperback', 'flexible');
          break;
        }
        
        case 'magazine': {
          // Thin magazine
          const magThickness = 0.005;
          const magWidth = bookWidth * 1.3;
          const magHeight = bookHeight * 1.2;
          
          const magGeo = new THREE.BoxGeometry(magWidth, magHeight, magThickness);
          geometries.push(magGeo);
          
          materialZones['cover'] = ['paper_glossy', 'paper_magazine'];
          
          tags.push('magazine', 'periodical', 'glossy');
          break;
        }
      }
      
      // Bookmark (optional)
      if (bookmark) {
        const bookmarkWidth = 0.02;
        const bookmarkLength = 0.08;
        const bookmarkThickness = 0.001;
        
        const bookmarkGeo = new THREE.BoxGeometry(bookmarkWidth, bookmarkLength, bookmarkThickness);
        bookmarkGeo.translate(bookWidth / 2 + bookmarkWidth / 2, 0, 0);
        geometries.push(bookmarkGeo);
        
        materialZones['bookmark'] = ['ribbon', 'paper_cardstock'];
        tags.push('bookmark');
      }
    } else {
      // Stack of books
      for (let i = 0; i < stackCount; i++) {
        const variation = 0.9 + rng.next() * 0.2;
        const stackThickness = bookThickness * variation;
        const stackWidth = bookWidth * (0.9 + rng.next() * 0.2);
        const stackHeight = bookHeight * (0.9 + rng.next() * 0.2);
        
        const bookGeo = new THREE.BoxGeometry(stackWidth, stackHeight, stackThickness);
        bookGeo.translate(0, 0, (i - (stackCount - 1) / 2) * (bookThickness * 1.05));
        
        // Slight rotation for natural look
        if (i > 0) {
          bookGeo.rotateZ((rng.next() - 0.5) * 0.1);
          bookGeo.rotateX((rng.next() - 0.5) * 0.05);
        }
        
        geometries.push(bookGeo);
      }
      
      materialZones['covers'] = ['cloth_hardcover', 'paper_paperback', 'leather_bound'];
      materialZones['pages'] = ['paper_book'];
      
      tags.push('stack', `count_${stackCount}`);
    }
    
    const geometry = this.mergeGeometries(geometries);
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    
    return { geometry, bbox, tags, materialZones };
  }

  getSupportedTypes(): string[] {
    return [
      'lamp_ceiling',
      'lamp_floor',
      'lamp_table',
      'lamp_desk',
      'lamp_pendant',
      'rug_rectangle',
      'rug_square',
      'rug_round',
      'rug_oval',
      'rug_runner',
      'wallart_frame',
      'wallart_canvas',
      'wallart_poster',
      'wallart_balloon',
      'wallart_skirting',
      'vase_cylinder',
      'vase_bulb',
      'vase_flask',
      'vase_amphora',
      'vase_pitcher',
      'book_hardcover',
      'book_paperback',
      'book_magazine',
      'book_stack',
    ];
  }

  protected mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    if (geometries.length === 1) {
      return geometries[0];
    }
    
    // Use BufferGeometryUtils if available, otherwise simple merge
    const merged = geometries[0].clone();
    for (let i = 1; i < geometries.length; i++) {
      const geo = geometries[i];
      const tempMesh = new THREE.Mesh(geo);
      tempMesh.updateMatrixWorld(true);
      geo.applyMatrix4(tempMesh.matrixWorld);
      
      const mergedPositions = merged.attributes.position.array;
      const geoPositions = geo.attributes.position.array;
      
      const newPositions = new Float32Array(mergedPositions.length + geoPositions.length);
      newPositions.set(mergedPositions);
      newPositions.set(geoPositions, mergedPositions.length);
      
      merged.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    }
    
    merged.computeVertexNormals();
    return merged;
  }
  
  protected mergeGroupGeometries(group: THREE.Group): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.updateMatrixWorld(true);
        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);
        geometries.push(geo);
      }
    });
    return this.mergeGeometries(geometries);
  }
}

// Specialized generators for convenience

export class LampGenerator extends DecorGenerator {
  generate(params: Omit<DecorParameters, 'rugShape' | 'rugWidth' | 'rugLength' | 'rugPattern' | 'pileHeight' | 'fringe' | 'artType' | 'frameWidth' | 'frameDepth' | 'artWidth' | 'artHeight' | 'matBorder' | 'glassCover' | 'vaseStyle' | 'vaseHeight' | 'vaseOpening' | 'handleCount' | 'decorativeElements' | 'bookFormat' | 'bookThickness' | 'bookWidth' | 'bookHeight' | 'stackCount' | 'curvedPages' | 'bookmark'> & { lampType: DecorParameters['lampType'] } = {} as any, seed?: number): GeneratedAsset {
    return super.generate(params as DecorParameters, seed);
  }
}

export class RugGenerator extends DecorGenerator {
  generate(params: Omit<DecorParameters, 'lampType' | 'shadeStyle' | 'baseStyle' | 'bulbVisible' | 'lightColor' | 'cordLength' | 'artType' | 'frameWidth' | 'frameDepth' | 'artWidth' | 'artHeight' | 'matBorder' | 'glassCover' | 'vaseStyle' | 'vaseHeight' | 'vaseOpening' | 'handleCount' | 'decorativeElements' | 'bookFormat' | 'bookThickness' | 'bookWidth' | 'bookHeight' | 'stackCount' | 'curvedPages' | 'bookmark'> & { rugShape: DecorParameters['rugShape'] } = {} as any, seed?: number): GeneratedAsset {
    return super.generate(params as DecorParameters, seed);
  }
}

export class WallArtGenerator extends DecorGenerator {
  generate(params: Omit<DecorParameters, 'lampType' | 'shadeStyle' | 'baseStyle' | 'bulbVisible' | 'lightColor' | 'cordLength' | 'rugShape' | 'rugWidth' | 'rugLength' | 'rugPattern' | 'pileHeight' | 'fringe' | 'vaseStyle' | 'vaseHeight' | 'vaseOpening' | 'handleCount' | 'decorativeElements' | 'bookFormat' | 'bookThickness' | 'bookWidth' | 'bookHeight' | 'stackCount' | 'curvedPages' | 'bookmark'> & { artType: DecorParameters['artType'] } = {} as any, seed?: number): GeneratedAsset {
    return super.generate(params as DecorParameters, seed);
  }
}

export class VaseGenerator extends DecorGenerator {
  generate(params: Omit<DecorParameters, 'lampType' | 'shadeStyle' | 'baseStyle' | 'bulbVisible' | 'lightColor' | 'cordLength' | 'rugShape' | 'rugWidth' | 'rugLength' | 'rugPattern' | 'pileHeight' | 'fringe' | 'artType' | 'frameWidth' | 'frameDepth' | 'artWidth' | 'artHeight' | 'matBorder' | 'glassCover' | 'bookFormat' | 'bookThickness' | 'bookWidth' | 'bookHeight' | 'stackCount' | 'curvedPages' | 'bookmark'> & { vaseStyle: DecorParameters['vaseStyle'] } = {} as any, seed?: number): GeneratedAsset {
    return super.generate(params as DecorParameters, seed);
  }
}

export class BookGenerator extends DecorGenerator {
  generate(params: Omit<DecorParameters, 'lampType' | 'shadeStyle' | 'baseStyle' | 'bulbVisible' | 'lightColor' | 'cordLength' | 'rugShape' | 'rugWidth' | 'rugLength' | 'rugPattern' | 'pileHeight' | 'fringe' | 'artType' | 'frameWidth' | 'frameDepth' | 'artWidth' | 'artHeight' | 'matBorder' | 'glassCover' | 'vaseStyle' | 'vaseHeight' | 'vaseOpening' | 'handleCount' | 'decorativeElements'> & { bookFormat: DecorParameters['bookFormat'] } = {} as any, seed?: number): GeneratedAsset {
    return super.generate(params as DecorParameters, seed);
  }
}
