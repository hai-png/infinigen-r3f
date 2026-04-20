/**
 * Sofa Generator - Phase 1C: Seating Furniture
 * 
 * Procedural sofa generation with parametric components:
 * - Multiple sofa types (loveseat, 3-seater, sectional, L-shaped)
 * - Configurable arms (square, round, angular)
 * - Adjustable backrest angles
 * - Optional footrest/ottoman
 * - Various leg styles
 * 
 * Based on original InfiniGen: assets/objects/seating/sofa.py
 */

import { Vector3, Box3, BufferGeometry } from 'three';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters, AssetType } from './furniture';

// ============================================================================
// Type Definitions
// ============================================================================

export type SofaType = 'loveseat' | 'three-seater' | 'sectional' | 'l-shaped' | 'chaise';
export type ArmType = 'square' | 'round' | 'angular' | 'rolled' | 'track';
export type LegType = 'wooden' | 'metal' | 'hidden' | 'block' | 'spindle';
export type BackStyle = 'tight' | 'cushioned' | 'pillow';

export interface SofaParameters extends AssetParameters {
  // Sofa configuration
  sofaType?: SofaType;
  seatingCapacity?: number;
  
  // Dimensions
  width?: number;
  depth?: number;
  height?: number;
  seatHeight?: number;
  seatDepth?: number;
  
  // Arm configuration
  armType?: ArmType;
  armWidth?: number;
  armHeight?: number;
  hasArms?: boolean;
  
  // Back configuration
  backStyle?: BackStyle;
  backrestAngle?: number;
  backrestHeight?: number;
  backrestThickness?: number;
  
  // Cushion configuration
  seatCushionCount?: number;
  backCushionCount?: number;
  cushionThickness?: number;
  
  // Legs
  legType?: LegType;
  legHeight?: number;
  legCount?: number;
  
  // Additional features
  hasFootrest?: boolean;
  isReclining?: boolean;
  isSectional?: boolean;
  sectionalDirection?: 'left' | 'right';
  
  // Materials
  upholsteryMaterial?: string;
  frameMaterial?: string;
  legMaterial?: string;
  
  // Variation
  seed?: number;
}

// Standard sofa dimensions
const SOFA_SIZES: Record<SofaType, { width: number; depth: number; height: number }> = {
  'loveseat': { width: 1.5, depth: 0.9, height: 0.85 },
  'three-seater': { width: 2.2, depth: 0.95, height: 0.85 },
  'sectional': { width: 3.0, depth: 2.0, height: 0.85 },
  'l-shaped': { width: 2.8, depth: 1.8, height: 0.85 },
  'chaise': { width: 2.5, depth: 1.6, height: 0.85 }
};

// ============================================================================
// Sofa Generator Class
// ============================================================================

export class SofaGenerator extends BaseAssetGenerator {
  constructor() {
    super('furniture');
  }

  getSupportedTypes(): AssetType[] {
    return ['sofa'];
  }

  getDefaultParameters(type: AssetType): SofaParameters {
    return {
      sofaType: 'three-seater',
      seatingCapacity: 3,
      width: SOFA_SIZES['three-seater'].width,
      depth: SOFA_SIZES['three-seater'].depth,
      height: SOFA_SIZES['three-seater'].height,
      seatHeight: 0.45,
      seatDepth: 0.55,
      armType: 'square',
      armWidth: 0.15,
      armHeight: 0.65,
      hasArms: true,
      backStyle: 'cushioned',
      backrestAngle: -0.2,
      backrestHeight: 0.4,
      backrestThickness: 0.2,
      seatCushionCount: 3,
      backCushionCount: 3,
      cushionThickness: 0.15,
      legType: 'wooden',
      legHeight: 0.15,
      legCount: 6,
      hasFootrest: false,
      isReclining: false,
      isSectional: false,
      sectionalDirection: 'right',
      upholsteryMaterial: 'fabric',
      frameMaterial: 'wood',
      legMaterial: 'wood',
      style: 'modern',
      lod: 'medium',
      seed: Math.random(),
    };
  }

  generate(params: SofaParameters): GeneratedAsset {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    
    // Resolve sofa type and dimensions
    const sofaType = params.sofaType || 'three-seater';
    const width = params.width || SOFA_SIZES[sofaType].width;
    const depth = params.depth || SOFA_SIZES[sofaType].depth;
    const height = params.height || SOFA_SIZES[sofaType].height;
    
    // Configuration
    const seatHeight = params.seatHeight || 0.45;
    const seatDepth = params.seatDepth || 0.55;
    const armType = params.armType || 'square';
    const armWidth = params.armWidth || 0.15;
    const armHeight = params.armHeight || 0.65;
    const hasArms = params.hasArms !== false;
    const backStyle = params.backStyle || 'cushioned';
    const backrestAngle = params.backrestAngle ?? -0.2;
    const backrestHeight = params.backrestHeight || 0.4;
    const backrestThickness = params.backrestThickness || 0.2;
    const seatCushionCount = params.seatCushionCount ?? 3;
    const backCushionCount = params.backCushionCount ?? 3;
    const cushionThickness = params.cushionThickness || 0.15;
    const legType = params.legType || 'wooden';
    const legHeight = params.legHeight || 0.15;
    const hasFootrest = params.hasFootrest === true;
    const isSectional = params.isSectional === true || sofaType === 'sectional' || sofaType === 'l-shaped';
    const sectionalDirection = params.sectionalDirection || 'right';
    
    const seed = params.seed || Math.random();
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Generate base frame
    this.generateBaseFrame(
      vertices, normals, uvs,
      width, depth, height, seatHeight,
      legType, legHeight, seed
    );
    
    // Generate seat cushions
    this.generateSeatCushions(
      vertices, normals, uvs,
      width, depth, seatHeight, seatDepth,
      armWidth, hasArms, seatCushionCount, cushionThickness,
      seed
    );
    
    // Generate backrest
    this.generateBackrest(
      vertices, normals, uvs,
      width, depth, height, seatHeight, seatDepth,
      backStyle, backrestAngle, backrestHeight, backrestThickness,
      backCushionCount, cushionThickness,
      seed
    );
    
    // Generate arms
    if (hasArms) {
      this.generateArms(
        vertices, normals, uvs,
        width, depth, seatHeight,
        armType, armWidth, armHeight,
        seed
      );
    }
    
    // Generate sectional extension
    if (isSectional) {
      this.generateSectionalExtension(
        vertices, normals, uvs,
        width, depth, seatHeight,
        sectionalDirection, armWidth,
        seed
      );
    }
    
    // Generate footrest
    if (hasFootrest) {
      this.generateFootrest(
        vertices, normals, uvs,
        width, depth, seatHeight,
        armWidth, seed
      );
    }
    
    // Create geometry
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    
    const bbox = new BBox(
      new Vector3(-width / 2 - (isSectional ? 0.8 : 0), 0, -depth / 2),
      new Vector3(width / 2 + (isSectional ? 0.8 : 0), height, depth / 2 + (hasFootrest ? 0.6 : 0))
    );
    
    // Collision geometry for LOD
    let collisionGeometry: BufferGeometry | undefined;
    if (params.lod === 'low') {
      collisionGeometry = this.createBoxCollision(
        width + (isSectional ? 1.6 : 0),
        height,
        depth + (hasFootrest ? 1.2 : 0)
      );
    }
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: SemanticsTag.FURNITURE,
        material: [
          params.upholsteryMaterial === 'fabric' ? MaterialTag.FABRIC :
          params.upholsteryMaterial === 'leather' ? MaterialTag.LEATHER : MaterialTag.PLASTIC,
          params.frameMaterial === 'wood' ? MaterialTag.WOOD :
          params.frameMaterial === 'metal' ? MaterialTag.METAL : MaterialTag.PLASTIC,
        ],
        size: width > 2.5 ? SizeTag.LARGE : width < 1.6 ? SizeTag.MEDIUM : SizeTag.LARGE,
        style: params.style === 'modern' ? StyleTag.MODERN :
               params.style === 'traditional' ? StyleTag.TRADITIONAL :
               params.style === 'industrial' ? StyleTag.INDUSTRIAL :
               params.style === 'scandinavian' ? StyleTag.SCANDINAVIAN : StyleTag.RUSTIC,
      },
      parameters: params,
      lod: params.lod as 'low' | 'medium' | 'high' || 'medium',
      collisionGeometry,
    };
  }

  private generateBaseFrame(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, height: number, seatHeight: number,
    legType: string, legHeight: number, seed: number
  ): void {
    const baseThickness = 0.08;
    const baseY = legHeight;
    
    // Main base platform
    this.addBox(vertices, normals, uvs,
      0, baseY + baseThickness / 2, 0,
      width, baseThickness, depth
    );
    
    // Generate legs
    if (legType !== 'hidden') {
      const legPositions = this.getLegPositions(width, depth, seed);
      
      for (const [lx, lz] of legPositions) {
        if (legType === 'wooden' || legType === 'block') {
          const legWidth = legType === 'block' ? 0.12 : 0.06;
          this.addBox(vertices, normals, uvs,
            lx, legHeight / 2, lz,
            legWidth, legHeight, legWidth
          );
        } else if (legType === 'metal') {
          // Tapered metal legs
          this.addTaperedBox(vertices, normals, uvs,
            lx, 0, lz,
            0.04, legHeight, 0.06
          );
        } else if (legType === 'spindle') {
          // Turned spindle legs
          this.addSpindleLeg(vertices, normals, uvs, lx, lz, legHeight, 0.05, seed);
        }
      }
    }
    
    // Base skirt/platform cover
    const skirtHeight = 0.1;
    this.addBox(vertices, normals, uvs,
      0, legHeight + baseThickness + skirtHeight / 2, 0,
      width + 0.02, skirtHeight, depth + 0.02
    );
  }

  private generateSeatCushions(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, seatHeight: number, seatDepth: number,
    armWidth: number, hasArms: boolean, cushionCount: number, cushionThickness: number,
    seed: number
  ): void {
    const cushionY = seatHeight + 0.05;
    const availableWidth = hasArms ? width - 2 * armWidth : width;
    const cushionWidth = (availableWidth - (cushionCount - 1) * 0.05) / cushionCount;
    const startX = hasArms ? -width / 2 + armWidth : -width / 2;
    
    for (let i = 0; i < cushionCount; i++) {
      const cushionX = startX + (i + 0.5) * cushionWidth + i * 0.025;
      
      // Main cushion body (slightly rounded top)
      this.addBox(vertices, normals, uvs,
        cushionX, cushionY + cushionThickness / 2, -depth / 2 + 0.05,
        cushionWidth - 0.02, cushionThickness, seatDepth - 0.1
      );
      
      // Cushion piping/edge detail
      this.addBox(vertices, normals, uvs,
        cushionX, cushionY + cushionThickness, -depth / 2 + 0.05,
        cushionWidth - 0.04, 0.03, 0.03
      );
      
      // Slight puff in center
      this.addBox(vertices, normals, uvs,
        cushionX, cushionY + cushionThickness * 1.1, -depth / 2 + seatDepth / 2,
        cushionWidth * 0.6, 0.02, seatDepth * 0.4
      );
    }
  }

  private generateBackrest(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, height: number, seatHeight: number, seatDepth: number,
    backStyle: string, backrestAngle: number, backrestHeight: number, backrestThickness: number,
    backCushionCount: number, cushionThickness: number,
    seed: number
  ): void {
    const backrestY = seatHeight + cushionThickness + 0.05;
    const backrestZ = -depth / 2 + backrestThickness / 2;
    
    if (backStyle === 'tight') {
      // Tight back - single solid piece
      this.addBox(vertices, normals, uvs,
        0, backrestY + backrestHeight / 2, backrestZ,
        width, backrestHeight, backrestThickness
      );
      
      // Add slight angle
      if (backrestAngle !== 0) {
        // Approximate angle with offset layers
        const layers = 5;
        for (let i = 1; i < layers; i++) {
          const layerY = backrestY + (i / layers) * backrestHeight;
          const xOffset = (i / layers) * backrestAngle * 0.1;
          this.addBox(vertices, normals, uvs,
            xOffset, layerY, backrestZ - 0.02,
            width * 0.9, backrestHeight / layers, backrestThickness * 0.5
          );
        }
      }
    } else if (backStyle === 'cushioned') {
      // Individual back cushions
      const cushionWidth = width / backCushionCount - 0.03;
      const cushionHeight = backrestHeight / backCushionCount - 0.02;
      
      for (let i = 0; i < backCushionCount; i++) {
        const cushionX = -width / 2 + (i + 0.5) * (cushionWidth + 0.03);
        const cushionY = backrestY + (i + 0.5) * cushionHeight + i * 0.01;
        
        this.addBox(vertices, normals, uvs,
          cushionX, cushionY, backrestZ,
          cushionWidth, cushionHeight, backrestThickness + 0.05
        );
        
        // Cushion rounding
        this.addBox(vertices, normals, uvs,
          cushionX, cushionY + cushionHeight / 2, backrestZ + backrestThickness / 2,
          cushionWidth * 0.8, cushionHeight * 0.3, 0.03
        );
      }
    } else if (backStyle === 'pillow') {
      // Loose back pillows
      const pillowWidth = width / backCushionCount - 0.05;
      const pillowHeight = backrestHeight * 0.7;
      
      for (let i = 0; i < backCushionCount; i++) {
        const pillowX = -width / 2 + (i + 0.5) * (pillowWidth + 0.05);
        const pillowY = backrestY + pillowHeight / 2;
        
        // Pillow body
        this.addBox(vertices, normals, uvs,
          pillowX, pillowY, backrestZ,
          pillowWidth, pillowHeight, backrestThickness + 0.08
        );
        
        // Pillow fold at bottom
        this.addBox(vertices, normals, uvs,
          pillowX, pillowY - pillowHeight / 2 + 0.05, backrestZ + backrestThickness / 2,
          pillowWidth * 0.9, 0.08, 0.05
        );
      }
    }
  }

  private generateArms(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, seatHeight: number,
    armType: string, armWidth: number, armHeight: number,
    seed: number
  ): void {
    const armLength = depth - 0.1;
    const armTopY = seatHeight + armHeight;
    const armZ = 0;
    
    // Left arm
    this.createArm(
      vertices, normals, uvs,
      -width / 2 - armWidth / 2, armTopY, armZ,
      armWidth, armHeight, armLength,
      armType, seed
    );
    
    // Right arm
    this.createArm(
      vertices, normals, uvs,
      width / 2 + armWidth / 2, armTopY, armZ,
      armWidth, armHeight, armLength,
      armType, seed
    );
    
    // Arm top padding
    this.addBox(vertices, normals, uvs,
      -width / 2 - armWidth / 2, armTopY + 0.05, armZ,
      armWidth, 0.1, armLength
    );
    this.addBox(vertices, normals, uvs,
      width / 2 + armWidth / 2, armTopY + 0.05, armZ,
      armWidth, 0.1, armLength
    );
  }

  private createArm(
    vertices: number[], normals: number[], uvs: number[],
    x: number, y: number, z: number,
    width: number, height: number, length: number,
    armType: string, seed: number
  ): void {
    if (armType === 'square' || armType === 'track') {
      // Square/track arm - simple box
      this.addBox(vertices, normals, uvs,
        x, y - height / 2, z,
        width, height, length
      );
    } else if (armType === 'round' || armType === 'rolled') {
      // Round/rolled arm - curved profile
      const segments = 6;
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const segHeight = height / segments;
        const segY = y - height + (i + 0.5) * segHeight;
        const segWidth = width * (0.6 + 0.4 * Math.sin(t * Math.PI));
        
        this.addBox(vertices, normals, uvs,
          x, segY, z,
          segWidth, segHeight, length
        );
      }
    } else if (armType === 'angular') {
      // Angular arm - tapered profile
      this.addTaperedBox(vertices, normals, uvs,
        x, y - height / 2, z,
        width * 0.7, height, width
      );
    }
  }

  private generateSectionalExtension(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, seatHeight: number,
    direction: 'left' | 'right', armWidth: number,
    seed: number
  ): void {
    const extensionWidth = 0.8;
    const extensionDepth = depth - 0.2;
    const extensionLength = 1.2;
    
    const offsetX = direction === 'right' ? width / 2 + armWidth : -width / 2 - armWidth - extensionWidth;
    
    // Extension base
    this.addBox(vertices, normals, uvs,
      offsetX + extensionWidth / 2, seatHeight / 2, 0,
      extensionWidth, seatHeight, extensionDepth
    );
    
    // Extension cushion
    this.addBox(vertices, normals, uvs,
      offsetX + extensionWidth / 2, seatHeight + 0.1, 0,
      extensionWidth - 0.05, 0.15, extensionDepth - 0.1
    );
    
    // Extension back
    this.addBox(vertices, normals, uvs,
      offsetX + extensionWidth / 2, seatHeight + 0.3, -extensionDepth / 2 + 0.1,
      extensionWidth, 0.4, 0.15
    );
  }

  private generateFootrest(
    vertices: number[], normals: number[], uvs: number[],
    width: number, depth: number, seatHeight: number,
    armWidth: number, seed: number
  ): void {
    const footrestWidth = 0.6;
    const footrestDepth = 0.5;
    const footrestHeight = 0.4;
    
    // Position in front of sofa
    const footrestZ = depth / 2 + 0.3;
    
    // Footrest base
    this.addBox(vertices, normals, uvs,
      0, footrestHeight / 2, footrestZ,
      footrestWidth, footrestHeight, footrestDepth
    );
    
    // Footrest cushion
    this.addBox(vertices, normals, uvs,
      0, footrestHeight + 0.075, footrestZ,
      footrestWidth - 0.05, 0.15, footrestDepth - 0.05
    );
  }

  private getLegPositions(width: number, depth: number, seed: number): [number, number][] {
    // Standard 6-leg configuration for sofas
    return [
      [-width / 2 + 0.1, -depth / 2 + 0.1],
      [width / 2 - 0.1, -depth / 2 + 0.1],
      [-width / 2 + 0.1, 0],
      [width / 2 - 0.1, 0],
      [-width / 2 + 0.1, depth / 2 - 0.1],
      [width / 2 - 0.1, depth / 2 - 0.1],
    ];
  }

  private addSpindleLeg(
    vertices: number[], normals: number[], uvs: number[],
    x: number, z: number, height: number,
    radius: number, seed: number
  ): void {
    // Turned spindle leg with varying radius
    const segments = 8;
    const radii = [radius * 0.8, radius, radius * 0.6, radius * 0.9, radius * 0.7, radius, radius * 0.8, radius];
    
    for (let i = 0; i < segments; i++) {
      const segHeight = height / segments;
      const segY = (i + 0.5) * segHeight;
      const segRadius = radii[i] || radius;
      
      // Approximate cylinder with box
      this.addBox(vertices, normals, uvs,
        x, segY, z,
        segRadius * 2, segHeight, segRadius * 2
      );
    }
  }

  // Helper methods
  private addBox(
    vertices: number[], normals: number[], uvs: number[],
    x: number, y: number, z: number,
    w: number, h: number, d: number
  ): void {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    
    // Front face
    this.addQuad(vertices, normals, uvs,
      x - hw, y - hh, z + hd,
      x + hw, y - hh, z + hd,
      x + hw, y + hh, z + hd,
      x - hw, y + hh, z + hd,
      0, 0, 1
    );
    
    // Back face
    this.addQuad(vertices, normals, uvs,
      x + hw, y - hh, z - hd,
      x - hw, y - hh, z - hd,
      x - hw, y + hh, z - hd,
      x + hw, y + hh, z - hd,
      0, 0, -1
    );
    
    // Top face
    this.addQuad(vertices, normals, uvs,
      x - hw, y + hh, z - hd,
      x + hw, y + hh, z - hd,
      x + hw, y + hh, z + hd,
      x - hw, y + hh, z + hd,
      0, 1, 0
    );
    
    // Bottom face
    this.addQuad(vertices, normals, uvs,
      x - hw, y - hh, z + hd,
      x + hw, y - hh, z + hd,
      x + hw, y - hh, z - hd,
      x - hw, y - hh, z - hd,
      0, -1, 0
    );
    
    // Left face
    this.addQuad(vertices, normals, uvs,
      x - hw, y - hh, z - hd,
      x - hw, y - hh, z + hd,
      x - hw, y + hh, z + hd,
      x - hw, y + hh, z - hd,
      -1, 0, 0
    );
    
    // Right face
    this.addQuad(vertices, normals, uvs,
      x + hw, y - hh, z + hd,
      x + hw, y - hh, z - hd,
      x + hw, y + hh, z - hd,
      x + hw, y + hh, z + hd,
      1, 0, 0
    );
  }

  private addQuad(
    vertices: number[], normals: number[], uvs: number[],
    v1x: number, v1y: number, v1z: number,
    v2x: number, v2y: number, v2z: number,
    v3x: number, v3y: number, v3z: number,
    v4x: number, v4y: number, v4z: number,
    nx: number, ny: number, nz: number
  ): void {
    // Triangle 1
    vertices.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1);
    
    // Triangle 2
    vertices.push(v1x, v1y, v1z, v3x, v3y, v3z, v4x, v4y, v4z);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 1, 0, 1);
  }

  private addTaperedBox(
    vertices: number[], normals: number[], uvs: number[],
    x: number, y: number, z: number,
    bottomWidth: number, height: number, topWidth: number
  ): void {
    const slices = 4;
    for (let i = 0; i < slices; i++) {
      const t = i / slices;
      const sliceHeight = height / slices;
      const sliceY = y - height / 2 + (t + 0.5) * sliceHeight;
      const sliceWidth = bottomWidth + (topWidth - bottomWidth) * (t + 0.5) / slices;
      
      this.addBox(vertices, normals, uvs,
        x, sliceY, z,
        sliceWidth, sliceHeight, sliceWidth
      );
    }
  }

  private createBoxCollision(w: number, h: number, d: number): BufferGeometry {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    const geometry = new BufferGeometry();
    
    const vertices = [
      -w/2, -h/2, -d/2,  w/2, -h/2, -d/2,  w/2, h/2, -d/2,  -w/2, h/2, -d/2,
      -w/2, -h/2,  d/2,  w/2, -h/2,  d/2,  w/2, h/2,  d/2,  -w/2, h/2,  d/2,
    ];
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    return geometry;
  }
}
