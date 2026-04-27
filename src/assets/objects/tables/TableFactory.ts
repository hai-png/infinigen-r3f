/**
 * TableFactory - Procedural table generator
 * 
 * Ported from Infinigen's DiningTable/CocktailTable factories (Princeton VL)
 * Generates varied table designs with configurable tops, legs, and stretchers
 */

import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../../core/util/math/index';
import { BezierCurveGenerator } from '../../utils/curves';
import { MeshUtils } from '../../utils/mesh';

export type LegStyle = 'straight' | 'square' | 'single_stand' | 'wheeled';
export type TopShape = 'rectangle' | 'round' | 'oval' | 'square';

export interface TableConfig {
  // Dimensions
  width: number;
  depth: number;
  height: number;
  
  // Top parameters
  topShape: TopShape;
  topThickness: number;
  topOverhang: number;
  topProfileAspect: number;
  
  // Leg parameters
  legStyle: LegStyle;
  legCount: number;
  legDiameter: number;
  legHeight: number;
  legPlacementTopScale: number;
  legPlacementBottomScale: number;
  legNGon: number;
  
  // Stretcher parameters
  hasStretcher: boolean;
  stretcherRelativePos: number;
  stretcherIncrement: number;
  stretcherWidth: number;
  
  // Materials
  topMaterialColor: THREE.Color;
  legMaterialColor: THREE.Color;
}

export class TableFactory extends AssetFactory {
  protected config: TableConfig;
  protected curveGenerator: BezierCurveGenerator;
  
  private static readonly LEG_STYLES: LegStyle[] = ['straight', 'square', 'single_stand'];
  private static readonly TOP_SHAPES: TopShape[] = ['rectangle', 'round', 'oval', 'square'];

  constructor(factorySeed?: number, coarse: boolean = false) {
    super(factorySeed, coarse);
    this.curveGenerator = new BezierCurveGenerator();
    this.config = this.generateConfig();
  }

  /**
   * Generate random table configuration
   */
  protected generateConfig(): TableConfig {
    const rng = new SeededRandom(this.factorySeed);
    
    // Basic dimensions based on table type
    const isDiningTable = rng.uniform() < 0.6;
    
    let width: number, depth: number, height: number;
    if (isDiningTable) {
      width = rng.uniform(1.2, 2.0);
      depth = rng.uniform(0.8, 1.2);
      height = rng.uniform(0.72, 0.78);
    } else {
      // Cocktail/coffee table
      width = rng.uniform(0.8, 1.4);
      depth = rng.uniform(0.5, 0.9);
      height = rng.uniform(0.35, 0.45);
    }
    
    // Top parameters
    const topShape = weightedSample(TableFactory.TOP_SHAPES) as TopShape;
    const topThickness = rng.uniform(0.03, 0.08);
    const topOverhang = rng.uniform(0.02, 0.15);
    const topProfileAspect = rng.uniform(0.8, 1.5);
    
    // Leg parameters
    const legStyle = weightedSample(TableFactory.LEG_STYLES) as LegStyle;
    let legCount = 4;
    if (legStyle === 'single_stand') {
      legCount = 1;
    } else if (topShape === 'round' || topShape === 'oval') {
      legCount = rng.uniform() < 0.5 ? 3 : 4;
    } else {
      legCount = 4;
    }
    
    const legDiameter = rng.uniform(0.04, 0.12);
    const legHeight = height - topThickness;
    const legPlacementTopScale = rng.uniform(0.7, 0.95);
    const legPlacementBottomScale = rng.uniform(0.6, 1.0);
    const legNGon = Math.floor(rng.uniform(4, 9));
    
    // Stretcher parameters
    const hasStretcher = legStyle !== 'single_stand' && rng.uniform() < 0.7;
    const stretcherRelativePos = rng.uniform(0.2, 0.5);
    const stretcherIncrement = hasStretcher ? Math.floor(rng.uniform(1, 3)) : 0;
    const stretcherWidth = legDiameter * rng.uniform(0.4, 0.7);
    
    // Material colors
    const topHue = rng.uniform(0.05, 0.15); // Wood tones
    const topSat = rng.uniform(0.3, 0.7);
    const topVal = rng.uniform(0.3, 0.7);
    const topMaterialColor = new THREE.Color().setHSL(topHue, topSat, topVal);
    
    const legHue = rng.uniform() < 0.5 ? topHue : rng.uniform(0.0, 0.1);
    const legSat = rng.uniform(0.2, 0.6);
    const legVal = rng.uniform(0.2, 0.5);
    const legMaterialColor = new THREE.Color().setHSL(legHue, legSat, legVal);
    
    return {
      width, depth, height,
      topShape, topThickness, topOverhang, topProfileAspect,
      legStyle, legCount, legDiameter, legHeight,
      legPlacementTopScale, legPlacementBottomScale, legNGon,
      hasStretcher, stretcherRelativePos, stretcherIncrement, stretcherWidth,
      topMaterialColor, legMaterialColor
    };
  }

  /**
   * Create placeholder bounding box
   */
  createPlaceholder(): THREE.Object3D {
    const c = this.config;
    const geometry = new THREE.BoxGeometry(c.width, c.depth, c.height);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x888888, 
      wireframe: true 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = c.height / 2;
    return mesh;
  }

  /**
   * Create complete table asset
   */
  createAsset(params?: AssetParameters): THREE.Object3D {
    const group = new THREE.Group();
    
    // Create table top
    const top = this.makeTableTop();
    group.add(top);
    
    // Create legs
    const legs = this.makeLegs();
    legs.forEach(leg => group.add(leg));
    
    // Create stretchers if enabled
    if (this.config.hasStretcher) {
      const stretchers = this.makeStretchers(legs);
      stretchers.forEach(stretcher => group.add(stretcher));
    }
    
    // Center the group
    MeshUtils.centerGeometry(group);
    
    return group;
  }

  /**
   * Generate table top mesh
   */
  protected makeTableTop(): THREE.Mesh {
    const c = this.config;
    
    let geometry: THREE.BufferGeometry;
    
    switch (c.topShape) {
      case 'round':
        geometry = new THREE.CylinderGeometry(
          c.width / 2 + c.topOverhang,
          c.width / 2 + c.topOverhang,
          c.topThickness,
          32
        );
        break;
        
      case 'oval':
        geometry = this.createOvalTop();
        break;
        
      case 'square':
        geometry = new THREE.BoxGeometry(
          c.width + c.topOverhang * 2,
          c.topThickness,
          c.width + c.topOverhang * 2
        );
        break;
        
      case 'rectangle':
      default:
        geometry = new THREE.BoxGeometry(
          c.width + c.topOverhang * 2,
          c.topThickness,
          c.depth + c.topOverhang * 2
        );
        break;
    }
    
    // Position top at correct height
    geometry.translate(0, c.height - c.topThickness / 2, 0);
    
    const material = new THREE.MeshStandardMaterial({
      color: c.topMaterialColor,
      roughness: 0.6,
      metalness: 0.1
    });
    
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create oval table top using curve extrusion
   */
  protected createOvalTop(): THREE.BufferGeometry {
    const c = this.config;
    const rx = (c.width + c.topOverhang * 2) / 2;
    const ry = (c.depth + c.topOverhang * 2) / 2;
    
    // Create oval shape
    const shape = new THREE.Shape();
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry;
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: c.topThickness,
      bevelEnabled: false
    });
    
    // Rotate to lie flat
    geometry.rotateX(Math.PI / 2);
    
    return geometry;
  }

  /**
   * Generate leg meshes
   */
  protected makeLegs(): THREE.Mesh[] {
    const c = this.config;
    const legs: THREE.Mesh[] = [];
    
    if (c.legStyle === 'single_stand') {
      // Single central pedestal
      const leg = this.makeSingleStandLeg();
      legs.push(leg);
    } else {
      // Multiple legs at corners/edges
      const legPositions = this.getLegPositions();
      
      for (const pos of legPositions) {
        const leg = this.makeIndividualLeg(pos);
        legs.push(leg);
      }
    }
    
    return legs;
  }

  /**
   * Get leg positions based on table config
   */
  protected getLegPositions(): THREE.Vector3[] {
    const c = this.config;
    const positions: THREE.Vector3[] = [];
    
    const topScale = c.legPlacementTopScale;
    const halfW = (c.width / 2) * topScale;
    const halfD = (c.depth / 2) * topScale;
    
    switch (c.legCount) {
      case 1:
        positions.push(new THREE.Vector3(0, 0, 0));
        break;
        
      case 3:
        // Triangle arrangement
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
          positions.push(new THREE.Vector3(
            Math.cos(angle) * halfW,
            0,
            Math.sin(angle) * halfD
          ));
        }
        break;
        
      case 4:
      default:
        // Four corners
        positions.push(new THREE.Vector3(-halfW, 0, -halfD));
        positions.push(new THREE.Vector3(halfW, 0, -halfD));
        positions.push(new THREE.Vector3(halfW, 0, halfD));
        positions.push(new THREE.Vector3(-halfW, 0, halfD));
        break;
    }
    
    return positions;
  }

  /**
   * Create single pedestal leg
   */
  protected makeSingleStandLeg(): THREE.Mesh {
    const c = this.config;
    
    // Tapered cylinder for pedestal
    const topRadius = c.legDiameter * 0.6;
    const bottomRadius = c.legDiameter * 1.2;
    
    const geometry = new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      c.legHeight,
      16
    );
    
    geometry.translate(0, c.legHeight / 2, 0);
    
    const material = new THREE.MeshStandardMaterial({
      color: c.legMaterialColor,
      roughness: 0.7,
      metalness: 0.2
    });
    
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create individual leg at position
   */
  protected makeIndividualLeg(position: THREE.Vector3): THREE.Mesh {
    const c = this.config;
    let geometry: THREE.BufferGeometry;
    
    switch (c.legStyle) {
      case 'square':
        geometry = new THREE.BoxGeometry(
          c.legDiameter,
          c.legHeight,
          c.legDiameter
        );
        break;
        
      case 'straight':
      default:
        // Tapered leg
        const topRad = c.legDiameter * 0.7;
        const bottomRad = c.legDiameter;
        geometry = new THREE.CylinderGeometry(
          topRad,
          bottomRad,
          c.legHeight,
          c.legNGon
        );
        break;
    }
    
    geometry.translate(position.x, c.legHeight / 2, position.z);
    
    const material = new THREE.MeshStandardMaterial({
      color: c.legMaterialColor,
      roughness: 0.7,
      metalness: 0.2
    });
    
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Generate stretcher bars between legs
   */
  protected makeStretchers(legs: THREE.Mesh[]): THREE.Mesh[] {
    const c = this.config;
    const stretchers: THREE.Mesh[] = [];
    
    if (legs.length < 2) return stretchers;
    
    const stretcherHeight = c.legHeight * c.stretcherRelativePos;
    const stretcherGeo = new THREE.BoxGeometry(
      c.stretcherWidth,
      c.stretcherWidth,
      1 // Will be scaled per stretcher
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: c.legMaterialColor,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Create stretchers between adjacent legs
    for (let i = 0; i < legs.length; i++) {
      const leg1 = legs[i];
      const leg2 = legs[(i + 1) % legs.length];
      
      const midPoint = new THREE.Vector3()
        .addVectors(leg1.position, leg2.position)
        .multiplyScalar(0.5);
      
      const distance = leg1.position.distanceTo(leg2.position);
      
      const stretcher = new THREE.Mesh(stretcherGeo.clone(), material);
      stretcher.position.set(midPoint.x, stretcherHeight, midPoint.z);
      stretcher.scale.set(1, 1, distance - c.legDiameter);
      stretcher.lookAt(leg2.position.x, stretcherHeight, leg2.position.z);
      stretcher.rotateX(Math.PI / 2);
      
      stretchers.push(stretcher);
    }
    
    return stretchers;
  }
}
