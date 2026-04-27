/**
 * CurtainGenerator - Procedural curtain generation with various styles
 * Generates drapes, sheers, valances, and different curtain types
 */
import {
  Group,
  Mesh,
  PlaneGeometry,
  CylinderGeometry,
  TorusGeometry,
  SphereGeometry,
  Material,
  MeshStandardMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  MathUtils
} from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { NoiseUtils } from '../../utils/NoiseUtils';

export type CurtainStyle = 'drapes' | 'sheer' | 'valance' | 'cafe' | 'pencil' | 'grommet' | 'rod_pocket';
export type CurtainMaterialType = 'cotton' | 'linen' | 'silk' | 'velvet' | 'polyester' | 'lace';
export type CurtainPattern = 'solid' | 'striped' | 'floral' | 'geometric' | 'damask';

export interface CurtainConfig {
  style: CurtainStyle;
  materialType: CurtainMaterialType;
  pattern: CurtainPattern;
  width: number;
  height: number;
  folds: number;
  hasValance: boolean;
  hasTieback: boolean;
  seed?: number;
}

export class CurtainGenerator extends BaseObjectGenerator<CurtainConfig> {
  protected readonly defaultParams: CurtainConfig = {
    style: 'drapes',
    materialType: 'cotton',
    pattern: 'solid',
    width: 2.0,
    height: 2.4,
    folds: 10,
    hasValance: false,
    hasTieback: false,
    seed: undefined
  };

  private noise: NoiseUtils;

  constructor() {
    super();
    this.noise = new NoiseUtils();
  }

  getDefaultConfig(): CurtainConfig {
    return { ...this.defaultParams };
  }

  generate(params: Partial<CurtainConfig> = {}): Group {
    const finalParams = { ...this.defaultParams, ...params };
    if (finalParams.seed !== undefined) {
      this.noise.setSeed(finalParams.seed);
    }

    const group = new Group();
    
    // Generate curtain panels
    this.createCurtainPanels(group, finalParams);
    
    // Add rod
    this.createCurtainRod(group, finalParams);
    
    // Add valance if requested
    if (finalParams.hasValance) {
      this.createValance(group, finalParams);
    }
    
    // Add tiebacks if requested
    if (finalParams.hasTieback) {
      this.createTiebacks(group, finalParams);
    }

    return group;
  }

  private createCurtainPanels(group: Group, params: CurtainConfig): void {
    const material = this.getMaterialByType(params.materialType, params.pattern);
    
    // Create folded curtain geometry
    const geometry = this.createFoldedCurtainGeometry(
      params.width,
      params.height,
      params.folds,
      params.style
    );
    
    const curtain = new Mesh(geometry, material);
    curtain.position.y = params.height / 2;
    group.add(curtain);
  }

  private createFoldedCurtainGeometry(
    width: number,
    height: number,
    folds: number,
    style: CurtainStyle
  ): BufferGeometry {
    const segments = folds * 4;
    const geometry = new PlaneGeometry(width, height, segments, Math.floor(height * 10));
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Apply folds based on style
    const foldDepth = style === 'pencil' ? 0.08 : style === 'grommet' ? 0.1 : 0.05;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Create vertical folds
      const foldPhase = (x / width + 0.5) * folds * Math.PI;
      let zOffset = Math.sin(foldPhase) * foldDepth;
      
      // Add some variation based on style
      if (style === 'drapes' || style === 'velvet') {
        zOffset += Math.sin(foldPhase * 2) * foldDepth * 0.3;
      }
      
      // Add slight sag at bottom
      const sagFactor = Math.pow(y / height + 0.5, 2);
      zOffset *= (1 - sagFactor * 0.2);
      
      positions[i + 2] = zOffset;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createCurtainRod(group: Group, params: CurtainConfig): void {
    const rodLength = params.width * 1.2;
    const rodRadius = 0.02;
    
    // Main rod
    const rodGeom = new CylinderGeometry(rodRadius, rodRadius, rodLength, 16);
    rodGeom.rotateZ(Math.PI / 2);
    const rodMat = new MeshStandardMaterial({ 
      color: 0x8B4513, 
      metalness: 0.6, 
      roughness: 0.3 
    });
    const rod = new Mesh(rodGeom, rodMat);
    rod.position.y = params.height + rodRadius;
    group.add(rod);
    
    // End caps/finials
    const finialGeom = new SphereGeometry(rodRadius * 2, 16, 16);
    const finialMat = new MeshStandardMaterial({ 
      color: 0xffd700, 
      metalness: 0.8, 
      roughness: 0.2 
    });
    
    const leftFinial = new Mesh(finialGeom, finialMat);
    leftFinial.position.set(-rodLength / 2, params.height + rodRadius, 0);
    group.add(leftFinial);
    
    const rightFinial = new Mesh(finialGeom, finialMat);
    rightFinial.position.set(rodLength / 2, params.height + rodRadius, 0);
    group.add(rightFinial);
    
    // Mounting brackets
    const bracketGeom = new CylinderGeometry(0.015, 0.015, 0.08, 8);
    const bracketMat = new MeshStandardMaterial({ color: 0x666666, metalness: 0.7 });
    
    const bracketPositions = [
      [-rodLength / 2 + 0.1, params.height],
      [rodLength / 2 - 0.1, params.height]
    ];
    
    bracketPositions.forEach(pos => {
      const bracket = new Mesh(bracketGeom, bracketMat);
      bracket.position.set(pos[0], pos[1], 0);
      group.add(bracket);
    });
  }

  private createValance(group: Group, params: CurtainConfig): void {
    const valanceHeight = params.height * 0.15;
    const valanceDepth = 0.15;
    
    const valanceGeom = this.createSwagValanceGeometry(params.width, valanceHeight, valanceDepth);
    const valanceMat = this.getMaterialByType(params.materialType, params.pattern);
    
    const valance = new Mesh(valanceGeom, valanceMat);
    valance.position.y = params.height + 0.04;
    group.add(valance);
  }

  private createSwagValanceGeometry(
    width: number,
    height: number,
    depth: number
  ): BufferGeometry {
    const segments = 20;
    const geometry = new PlaneGeometry(width, height, segments, 5);
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Create swag/drape effect
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const normalizedX = (x / width + 0.5);
      
      // Create scalloped bottom edge
      const waveCount = 3;
      const wavePhase = normalizedX * waveCount * Math.PI;
      const yOffset = Math.sin(wavePhase) * height * 0.3;
      
      positions[i + 1] += yOffset;
      
      // Add depth variation
      positions[i + 2] = Math.abs(Math.sin(wavePhase)) * depth;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createTiebacks(group: Group, params: CurtainConfig): void {
    const tiebackY = params.height * 0.4;
    const tiebackOffset = params.width * 0.35;
    
    const tiebackGeom = new TorusGeometry(0.08, 0.015, 8, 16, Math.PI);
    const tiebackMat = new MeshStandardMaterial({ 
      color: 0xDAA520, 
      metalness: 0.5, 
      roughness: 0.4 
    });
    
    // Left tieback
    const leftTieback = new Mesh(tiebackGeom, tiebackMat);
    leftTieback.position.set(-tiebackOffset, tiebackY, 0.1);
    leftTieback.rotation.z = Math.PI / 2;
    group.add(leftTieback);
    
    // Right tieback
    const rightTieback = new Mesh(tiebackGeom, tiebackMat);
    rightTieback.position.set(tiebackOffset, tiebackY, 0.1);
    rightTieback.rotation.z = -Math.PI / 2;
    group.add(rightTieback);
    
    // Wall mounts for tiebacks
    const mountGeom = new CylinderGeometry(0.02, 0.02, 0.05, 8);
    const mountMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.6 });
    
    const leftMount = new Mesh(mountGeom, mountMat);
    leftMount.position.set(-tiebackOffset - 0.05, tiebackY, 0);
    leftMount.rotation.x = Math.PI / 2;
    group.add(leftMount);
    
    const rightMount = new Mesh(mountGeom, mountMat);
    rightMount.position.set(tiebackOffset + 0.05, tiebackY, 0);
    rightMount.rotation.x = Math.PI / 2;
    group.add(rightMount);
  }

  private getMaterialByType(type: CurtainMaterialType, pattern: CurtainPattern): Material {
    let baseColor: number;
    let roughness: number;
    let metalness: number;
    let transparent: boolean = false;
    let opacity: number = 1.0;
    
    switch (type) {
      case 'cotton':
        baseColor = 0xf5f5dc;
        roughness = 0.8;
        metalness = 0.0;
        break;
      case 'linen':
        baseColor = 0xe8dcc5;
        roughness = 0.7;
        metalness = 0.0;
        break;
      case 'silk':
        baseColor = 0xffd700;
        roughness = 0.3;
        metalness = 0.1;
        break;
      case 'velvet':
        baseColor = 0x8B0000;
        roughness = 0.9;
        metalness = 0.0;
        break;
      case 'polyester':
        baseColor = 0xffffff;
        roughness = 0.5;
        metalness = 0.0;
        break;
      case 'lace':
        baseColor = 0xfffff0;
        roughness = 0.6;
        metalness = 0.0;
        transparent = true;
        opacity = 0.7;
        break;
      default:
        baseColor = 0xf5f5dc;
        roughness = 0.7;
        metalness = 0.0;
    }
    
    // Adjust color based on pattern
    if (pattern === 'striped') {
      // Striped pattern would need custom shader or texture
      // For now, use base color
    } else if (pattern === 'floral') {
      baseColor = 0xffb6c1;
    } else if (pattern === 'geometric') {
      baseColor = 0x4169e1;
    } else if (pattern === 'damask') {
      baseColor = 0x8B0000;
    }
    
    return new MeshStandardMaterial({
      color: baseColor,
      roughness,
      metalness,
      transparent,
      opacity,
      side: 2 // DoubleSide
    });
  }

  getVariations(): CurtainConfig[] {
    const styles: CurtainStyle[] = ['drapes', 'sheer', 'valance', 'cafe', 'pencil', 'grommet', 'rod_pocket'];
    const materials: CurtainMaterialType[] = ['cotton', 'linen', 'silk', 'velvet', 'polyester', 'lace'];
    const patterns: CurtainPattern[] = ['solid', 'striped', 'floral', 'geometric', 'damask'];
    
    return styles.flatMap(style =>
      materials.map(material => ({
        style,
        materialType: material,
        pattern: patterns[Math.floor(Math.random() * patterns.length)],
        width: 1.5 + Math.random() * 2.0,
        height: 2.0 + Math.random() * 1.0,
        folds: 8 + Math.floor(Math.random() * 12),
        hasValance: Math.random() > 0.7,
        hasTieback: Math.random() > 0.5,
        seed: Math.floor(Math.random() * 10000)
      }))
    );
  }
}
