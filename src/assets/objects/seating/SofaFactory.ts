/**
 * SofaFactory - Procedural sofa generator
 * 
 * Ported from Infinigen's SofaFactory (Princeton VL)
 * Generates varied sofa designs with configurable sections, arms, backs, and cushions
 */

import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../../core/util/MathUtils';
import { MeshUtils } from '../../utils/mesh';

export type SofaStyle = 'modern' | 'traditional' | 'sectional' | 'loveseat';
export type ArmStyle = 'rounded' | 'square' | 'rolled' | 'track';

export interface SofaConfig {
  // Dimensions
  width: number;
  depth: number;
  height: number;
  seatHeight: number;
  
  // Style
  sofaStyle: SofaStyle;
  armStyle: ArmStyle;
  
  // Sections
  sectionCount: number;
  hasChaise: boolean;
  
  // Cushions
  cushionThickness: number;
  cushionSegments: number;
  backCushionCount: number;
  
  // Arms
  armWidth: number;
  armHeight: number;
  
  // Legs
  legStyle: 'wood' | 'metal' | 'hidden';
  legHeight: number;
  legDiameter: number;
  
  // Materials
  fabricColor: THREE.Color;
}

export class SofaFactory extends AssetFactory {
  protected config: SofaConfig;
  
  private static readonly SOFA_STYLES: SofaStyle[] = ['modern', 'traditional', 'sectional', 'loveseat'];
  private static readonly ARM_STYLES: ArmStyle[] = ['rounded', 'square', 'rolled', 'track'];

  constructor(factorySeed?: number, coarse: boolean = false) {
    super(factorySeed, coarse);
    this.config = this.generateConfig();
  }

  /**
   * Generate random sofa configuration
   */
  protected generateConfig(): SofaConfig {
    const rng = new SeededRandom(this.factorySeed);
    
    // Determine sofa style
    const sofaStyle = weightedSample(SofaFactory.SOFA_STYLES) as SofaStyle;
    const armStyle = weightedSample(SofaFactory.ARM_STYLES) as ArmStyle;
    
    // Basic dimensions based on style
    let width: number, depth: number, height: number, sectionCount: number;
    
    switch (sofaStyle) {
      case 'loveseat':
        width = rng.uniform(1.4, 1.8);
        depth = rng.uniform(0.8, 1.0);
        height = rng.uniform(0.75, 0.85);
        sectionCount = 2;
        break;
      case 'sectional':
        width = rng.uniform(2.5, 3.5);
        depth = rng.uniform(1.5, 2.5);
        height = rng.uniform(0.75, 0.9);
        sectionCount = Math.floor(rng.uniform(3, 5));
        break;
      case 'traditional':
        width = rng.uniform(2.0, 2.8);
        depth = rng.uniform(0.9, 1.2);
        height = rng.uniform(0.8, 0.95);
        sectionCount = 3;
        break;
      case 'modern':
      default:
        width = rng.uniform(1.8, 2.6);
        depth = rng.uniform(0.85, 1.1);
        height = rng.uniform(0.7, 0.85);
        sectionCount = 3;
        break;
    }
    
    const seatHeight = rng.uniform(0.4, 0.5);
    const hasChaise = sofaStyle === 'sectional' && rng.uniform() < 0.7;
    
    // Cushion parameters
    const cushionThickness = rng.uniform(0.12, 0.2);
    const cushionSegments = Math.floor(rng.uniform(4, 8));
    const backCushionCount = sectionCount;
    
    // Arm parameters
    const armWidth = rng.uniform(0.15, 0.3);
    const armHeight = rng.uniform(0.6, 0.75);
    
    // Leg parameters
    const legStyles: SofaConfig['legStyle'][] = ['wood', 'metal', 'hidden'];
    const legStyle = weightedSample(legStyles) as SofaConfig['legStyle'];
    const legHeight = legStyle === 'hidden' ? 0 : rng.uniform(0.05, 0.15);
    const legDiameter = rng.uniform(0.04, 0.08);
    
    // Fabric color
    const hue = rng.uniform();
    const saturation = rng.uniform(0.1, 0.5);
    const value = rng.uniform(0.3, 0.7);
    const fabricColor = new THREE.Color().setHSL(hue, saturation, value);
    
    return {
      width, depth, height, seatHeight,
      sofaStyle, armStyle,
      sectionCount, hasChaise,
      cushionThickness, cushionSegments, backCushionCount,
      armWidth, armHeight,
      legStyle, legHeight, legDiameter,
      fabricColor
    };
  }

  /**
   * Create placeholder bounding box
   */
  createPlaceholder(): THREE.Object3D {
    const c = this.config;
    const geometry = new THREE.BoxGeometry(c.width, c.height, c.depth);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x888888, 
      wireframe: true 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = c.height / 2;
    return mesh;
  }

  /**
   * Create complete sofa asset
   */
  createAsset(params?: AssetParameters): THREE.Object3D {
    const group = new THREE.Group();
    
    // Create base frame
    const base = this.makeBase();
    group.add(base);
    
    // Create seat cushions
    const seatCushions = this.makeSeatCushions();
    seatCushions.forEach(cushion => group.add(cushion));
    
    // Create back cushions
    const backCushions = this.makeBackCushions();
    backCushions.forEach(cushion => group.add(cushion));
    
    // Create arms
    const arms = this.makeArms();
    arms.forEach(arm => group.add(arm));
    
    // Create legs if not hidden
    if (this.config.legStyle !== 'hidden') {
      const legs = this.makeLegs();
      legs.forEach(leg => group.add(leg));
    }
    
    // Add chaise if sectional
    if (this.config.hasChaise) {
      const chaise = this.makeChaise();
      group.add(chaise);
    }
    
    // Center the group
    MeshUtils.centerGeometry(group);
    
    return group;
  }

  /**
   * Generate sofa base frame
   */
  protected makeBase(): THREE.Mesh {
    const c = this.config;
    
    const baseWidth = c.width - c.armWidth * 2;
    const baseDepth = c.depth;
    const baseHeight = c.seatHeight;
    
    const geometry = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
    const material = new THREE.MeshStandardMaterial({
      color: c.fabricColor,
      roughness: 0.8,
      metalness: 0.0
    });
    
    const base = new THREE.Mesh(geometry, material);
    base.position.y = baseHeight / 2;
    
    return base;
  }

  /**
   * Generate seat cushions
   */
  protected makeSeatCushions(): THREE.Mesh[] {
    const c = this.config;
    const cushions: THREE.Mesh[] = [];
    
    const cushionWidth = (c.width - c.armWidth * 2) / c.sectionCount;
    const cushionDepth = c.depth - 0.1;
    const cushionHeight = c.cushionThickness;
    
    for (let i = 0; i < c.sectionCount; i++) {
      const geometry = new THREE.BoxGeometry(cushionWidth - 0.02, cushionHeight, cushionDepth);
      const material = new THREE.MeshStandardMaterial({
        color: c.fabricColor,
        roughness: 0.7,
        metalness: 0.0
      });
      
      const cushion = new THREE.Mesh(geometry, material);
      cushion.position.set(
        -c.width / 2 + c.armWidth + cushionWidth / 2 + i * cushionWidth,
        c.seatHeight + cushionHeight / 2,
        0
      );
      
      cushions.push(cushion);
    }
    
    return cushions;
  }

  /**
   * Generate back cushions
   */
  protected makeBackCushions(): THREE.Mesh[] {
    const c = this.config;
    const cushions: THREE.Mesh[] = [];
    
    const cushionWidth = (c.width - c.armWidth * 2) / c.backCushionCount;
    const cushionDepth = 0.15;
    const cushionHeight = c.height - c.seatHeight - 0.1;
    
    for (let i = 0; i < c.backCushionCount; i++) {
      const geometry = new THREE.BoxGeometry(cushionWidth - 0.02, cushionHeight, cushionDepth);
      const material = new THREE.MeshStandardMaterial({
        color: c.fabricColor,
        roughness: 0.7,
        metalness: 0.0
      });
      
      const cushion = new THREE.Mesh(geometry, material);
      cushion.position.set(
        -c.width / 2 + c.armWidth + cushionWidth / 2 + i * cushionWidth,
        c.seatHeight + cushionHeight / 2 + 0.05,
        -c.depth / 2 + cushionDepth / 2 + 0.05
      );
      
      cushions.push(cushion);
    }
    
    return cushions;
  }

  /**
   * Generate armrests
   */
  protected makeArms(): THREE.Mesh[] {
    const c = this.config;
    const arms: THREE.Mesh[] = [];
    
    let armGeometry: THREE.BufferGeometry;
    
    switch (c.armStyle) {
      case 'rounded':
        armGeometry = new THREE.CylinderGeometry(c.armWidth / 2, c.armWidth / 2, c.depth, 16);
        armGeometry.rotateX(Math.PI / 2);
        break;
      case 'rolled':
        armGeometry = new THREE.TorusGeometry(c.armWidth / 2, c.depth / 2, 8, 16, Math.PI);
        armGeometry.rotateZ(Math.PI / 2);
        break;
      case 'square':
      case 'track':
      default:
        armGeometry = new THREE.BoxGeometry(c.armWidth, c.armHeight, c.depth);
        break;
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: c.fabricColor,
      roughness: 0.8,
      metalness: 0.0
    });
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry.clone(), material);
    leftArm.position.set(-c.width / 2 + c.armWidth / 2, c.armHeight / 2, 0);
    arms.push(leftArm);
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry.clone(), material);
    rightArm.position.set(c.width / 2 - c.armWidth / 2, c.armHeight / 2, 0);
    arms.push(rightArm);
    
    return arms;
  }

  /**
   * Generate legs
   */
  protected makeLegs(): THREE.Mesh[] {
    const c = this.config;
    const legs: THREE.Mesh[] = [];
    
    let legGeometry: THREE.BufferGeometry;
    
    if (c.legStyle === 'wood') {
      legGeometry = new THREE.CylinderGeometry(c.legDiameter * 0.8, c.legDiameter, c.legHeight, 8);
    } else {
      // Metal legs - thinner
      legGeometry = new THREE.CylinderGeometry(c.legDiameter * 0.5, c.legDiameter * 0.5, c.legHeight, 8);
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: c.legStyle === 'wood' ? 0x654321 : 0x333333,
      roughness: c.legStyle === 'wood' ? 0.6 : 0.3,
      metalness: c.legStyle === 'wood' ? 0.1 : 0.8
    });
    
    const legPositions = [
      new THREE.Vector3(-c.width / 2 + 0.1, 0, -c.depth / 2 + 0.1),
      new THREE.Vector3(c.width / 2 - 0.1, 0, -c.depth / 2 + 0.1),
      new THREE.Vector3(-c.width / 2 + 0.1, 0, c.depth / 2 - 0.1),
      new THREE.Vector3(c.width / 2 - 0.1, 0, c.depth / 2 - 0.1)
    ];
    
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, material);
      leg.position.copy(pos);
      leg.position.y = c.legHeight / 2;
      legs.push(leg);
    }
    
    return legs;
  }

  /**
   * Generate chaise section for sectional sofas
   */
  protected makeChaise(): THREE.Object3D {
    const c = this.config;
    const group = new THREE.Group();
    
    const chaiseWidth = c.depth;
    const chaiseDepth = c.width * 0.6;
    const chaiseHeight = c.seatHeight;
    
    // Chaise base
    const baseGeometry = new THREE.BoxGeometry(chaiseWidth, chaiseHeight, chaiseDepth);
    const material = new THREE.MeshStandardMaterial({
      color: c.fabricColor,
      roughness: 0.8,
      metalness: 0.0
    });
    const base = new THREE.Mesh(baseGeometry, material);
    base.position.y = chaiseHeight / 2;
    group.add(base);
    
    // Chaise cushion
    const cushionGeometry = new THREE.BoxGeometry(chaiseWidth - 0.05, c.cushionThickness, chaiseDepth - 0.05);
    const cushion = new THREE.Mesh(cushionGeometry, material);
    cushion.position.set(0, chaiseHeight + c.cushionThickness / 2, 0);
    group.add(cushion);
    
    // Position chaise extending from side
    group.position.set(c.width / 2, 0, -chaiseDepth / 2 + c.depth / 2);
    
    return group;
  }
}
