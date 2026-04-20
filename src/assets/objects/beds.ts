/**
 * Bed Generator - Phase 1C: Seating Furniture
 * 
 * Procedural bed generation with parametric components:
 * - Bed frames (multiple styles)
 * - Mattresses (coiled, wrapped)
 * - Headboards (various designs)
 * - Bedding (quilts, comforters, sheets)
 * - Pillows
 * 
 * Based on original InfiniGen: assets/objects/seating/bed.py, bedframe.py
 */

import { Vector3, Box3, BufferGeometry } from 'three';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters, AssetType } from './furniture';

// ============================================================================
// Type Definitions
// ============================================================================

export type BedSize = 'twin' | 'full' | 'queen' | 'king' | 'california-king';
export type MattressType = 'coiled' | 'wrapped';
export type SheetType = 'quilt' | 'comforter' | 'box-comforter' | 'none';
export type HeadboardStyle = 'coiled' | 'pad' | 'whole' | 'horizontal-bar' | 'vertical-bar' | 'none';
export type LegDecorType = 'coiled' | 'pad' | 'plain' | 'legs' | 'none';

export interface BedParameters extends AssetParameters {
  // Size specifications
  bedSize?: BedSize;
  width?: number;
  length?: number;
  
  // Frame parameters
  frameStyle?: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'scandinavian';
  headboardStyle?: HeadboardStyle;
  hasFootboard?: boolean;
  legStyle?: 'vertical' | 'tapered' | 'curved' | 'storage';
  legHeight?: number;
  legDecorType?: LegDecorType;
  
  // Mattress parameters
  mattressType?: MattressType;
  mattressThickness?: number;
  
  // Bedding parameters
  sheetType?: SheetType;
  hasComforter?: boolean;
  comforterFolded?: boolean;
  pillowCount?: number;
  hasPillows?: boolean;
  
  // Material preferences
  frameMaterial?: string;
  upholsteryMaterial?: string;
  beddingMaterial?: string;
  
  // Variation
  seed?: number;
}

// Standard bed dimensions in meters
const BED_SIZES: Record<BedSize, { width: number; length: number }> = {
  'twin': { width: 0.99, length: 1.91 },
  'full': { width: 1.37, length: 1.91 },
  'queen': { width: 1.52, length: 2.03 },
  'king': { width: 1.93, length: 2.03 },
  'california-king': { width: 1.83, length: 2.13 }
};

// ============================================================================
// Bed Generator Class
// ============================================================================

export class BedGenerator extends BaseAssetGenerator {
  constructor() {
    super('furniture');
  }

  getSupportedTypes(): AssetType[] {
    return ['bed'];
  }

  getDefaultParameters(type: AssetType): BedParameters {
    return {
      bedSize: 'queen',
      width: BED_SIZES['queen'].width,
      length: BED_SIZES['queen'].length,
      frameStyle: 'modern',
      headboardStyle: 'pad',
      hasFootboard: false,
      legStyle: 'vertical',
      legHeight: 0.3,
      legDecorType: 'plain',
      mattressType: 'wrapped',
      mattressThickness: 0.25,
      sheetType: 'comforter',
      hasComforter: true,
      comforterFolded: false,
      pillowCount: 2,
      hasPillows: true,
      frameMaterial: 'wood',
      upholsteryMaterial: 'fabric',
      beddingMaterial: 'cotton',
      style: 'modern',
      lod: 'medium',
      seed: Math.random(),
    };
  }

  generate(params: BedParameters): GeneratedAsset {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    
    // Resolve bed size
    const bedSize = params.bedSize || 'queen';
    const width = params.width || BED_SIZES[bedSize].width;
    const length = params.length || BED_SIZES[bedSize].length;
    
    // Frame parameters
    const frameStyle = params.frameStyle || 'modern';
    const headboardStyle = params.headboardStyle || 'pad';
    const hasFootboard = params.hasFootboard !== false;
    const legStyle = params.legStyle || 'vertical';
    const legHeight = params.legHeight || 0.3;
    const legDecorType = params.legDecorType || 'plain';
    
    // Mattress parameters
    const mattressType = params.mattressType || 'wrapped';
    const mattressThickness = params.mattressThickness || 0.25;
    
    // Bedding parameters
    const sheetType = params.sheetType || 'comforter';
    const hasComforter = params.hasComforter !== false;
    const comforterFolded = params.comforterFolded === true;
    const pillowCount = params.pillowCount ?? 2;
    const hasPillows = params.hasPillows !== false;
    
    const seed = params.seed || Math.random();
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Generate bed frame
    this.generateFrame(
      vertices, normals, uvs,
      width, length, legHeight,
      frameStyle, headboardStyle, hasFootboard,
      legStyle, legDecorType, seed
    );
    
    // Generate mattress
    const mattressY = legHeight + 0.05; // Frame top
    this.generateMattress(
      vertices, normals, uvs,
      width, length, mattressThickness,
      mattressType, mattressY, seed
    );
    
    // Generate bedding
    if (sheetType !== 'none') {
      const sheetY = mattressY + mattressThickness;
      this.generateBedding(
        vertices, normals, uvs,
        width, length,
        sheetType, hasComforter, comforterFolded,
        sheetY, frameStyle, seed
      );
    }
    
    // Generate pillows
    if (hasPillows && pillowCount > 0) {
      const pillowY = mattressY + mattressThickness + 0.02;
      this.generatePillows(
        vertices, normals, uvs,
        width, length,
        pillowCount, headboardStyle,
        pillowY, seed
      );
    }
    
    // Create geometry
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    
    const bbox = new BBox(
      new Vector3(-width / 2, 0, -length / 2),
      new Vector3(width / 2, this.getTotalHeight(legHeight, mattressThickness, headboardStyle), length / 2)
    );
    
    // Collision geometry for LOD
    let collisionGeometry: BufferGeometry | undefined;
    if (params.lod === 'low') {
      collisionGeometry = this.createBoxCollision(width, this.getTotalHeight(legHeight, mattressThickness, headboardStyle), length);
    }
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: SemanticsTag.FURNITURE,
        material: [
          params.frameMaterial === 'wood' ? MaterialTag.WOOD :
          params.frameMaterial === 'metal' ? MaterialTag.METAL : MaterialTag.PLASTIC,
          params.upholsteryMaterial === 'fabric' ? MaterialTag.FABRIC :
          params.upholsteryMaterial === 'leather' ? MaterialTag.LEATHER : MaterialTag.FABRIC,
        ],
        size: width > 1.8 ? SizeTag.LARGE : width < 1.2 ? SizeTag.MEDIUM : SizeTag.LARGE,
        style: frameStyle === 'modern' ? StyleTag.MODERN :
               frameStyle === 'traditional' ? StyleTag.TRADITIONAL :
               frameStyle === 'industrial' ? StyleTag.INDUSTRIAL :
               frameStyle === 'scandinavian' ? StyleTag.SCANDINAVIAN : StyleTag.RUSTIC,
      },
      parameters: params,
      lod: params.lod as 'low' | 'medium' | 'high' || 'medium',
      collisionGeometry,
    };
  }

  private getTotalHeight(legHeight: number, mattressThickness: number, headboardStyle: HeadboardStyle): number {
    const baseHeight = legHeight + mattressThickness + 0.3; // bedding
    const headboardHeight = headboardStyle === 'none' ? 0 :
                           headboardStyle === 'whole' ? 1.3 :
                           headboardStyle === 'coiled' || headboardStyle === 'pad' ? 1.0 : 0.8;
    return Math.max(baseHeight, headboardHeight);
  }

  private generateFrame(
    vertices: number[], normals: number[], uvs: number[],
    width: number, length: number, legHeight: number,
    style: string, headboardStyle: HeadboardStyle, hasFootboard: boolean,
    legStyle: string, legDecorType: string, seed: number
  ): void {
    const frameThickness = style === 'rustic' ? 0.06 : 0.04;
    const sideRailWidth = 0.15;
    const endRailWidth = style === 'traditional' ? 0.2 : 0.15;
    
    // Side rails
    this.addBox(vertices, normals, uvs,
      -width / 2, legHeight / 2, -length / 2 + endRailWidth / 2,
      sideRailWidth, legHeight, length - endRailWidth
    );
    this.addBox(vertices, normals, uvs,
      width / 2, legHeight / 2, -length / 2 + endRailWidth / 2,
      sideRailWidth, legHeight, length - endRailWidth
    );
    
    // Foot rail
    if (hasFootboard) {
      this.addBox(vertices, normals, uvs,
        -width / 2 + sideRailWidth / 2, legHeight / 2, length / 2 - endRailWidth / 2,
        width - sideRailWidth, legHeight, endRailWidth
      );
    }
    
    // Legs
    const legWidth = legStyle === 'tapered' ? 0.08 : 0.06;
    const legPositions = [
      [-width / 2 + sideRailWidth / 2, 0, -length / 2 + endRailWidth / 2],
      [width / 2 - sideRailWidth / 2, 0, -length / 2 + endRailWidth / 2],
      [-width / 2 + sideRailWidth / 2, 0, length / 2 - endRailWidth / 2],
      [width / 2 - sideRailWidth / 2, 0, length / 2 - endRailWidth / 2],
    ];
    
    for (const [lx, ly, lz] of legPositions) {
      if (legStyle === 'tapered') {
        this.addTaperedBox(vertices, normals, uvs, lx, ly, lz, legWidth * 0.8, legHeight, legWidth);
      } else if (legStyle === 'curved') {
        this.addCurvedLeg(vertices, normals, uvs, lx, lz, legHeight, legWidth, seed);
      } else {
        this.addBox(vertices, normals, uvs,
          lx - legWidth / 2, ly, lz - legWidth / 2,
          legWidth, legHeight, legWidth
        );
      }
      
      // Leg decorations
      if (legDecorType === 'coiled' || legDecorType === 'pad') {
        this.addLegDecor(vertices, normals, uvs, lx, legHeight, lz, legWidth, legDecorType, seed);
      }
    }
    
    // Headboard
    if (headboardStyle !== 'none') {
      const headboardThickness = style === 'rustic' ? 0.08 : 0.05;
      const headboardHeight = headboardStyle === 'whole' ? 1.3 :
                             headboardStyle === 'coiled' || headboardStyle === 'pad' ? 1.0 : 0.8;
      
      this.addBox(vertices, normals, uvs,
        -width / 2, legHeight + headboardHeight / 2, -length / 2 - headboardThickness / 2,
        width, headboardHeight, headboardThickness
      );
      
      // Headboard details based on style
      if (headboardStyle === 'pad') {
        // Add padded panel
        this.addBox(vertices, normals, uvs,
          -width / 2 + 0.05, legHeight + headboardHeight / 2, -length / 2 - headboardThickness - 0.02,
          width - 0.1, headboardHeight - 0.1, 0.05
        );
      } else if (headboardStyle === 'horizontal-bar') {
        // Add horizontal slats
        const slatCount = 4;
        for (let i = 0; i < slatCount; i++) {
          const slatY = legHeight + (i + 1) * (headboardHeight / (slatCount + 1));
          this.addBox(vertices, normals, uvs,
            -width / 2 + 0.05, slatY, -length / 2 - headboardThickness - 0.03,
            width - 0.1, 0.05, headboardThickness + 0.06
          );
        }
      } else if (headboardStyle === 'vertical-bar') {
        // Add vertical slats
        const slatCount = 6;
        for (let i = 0; i < slatCount; i++) {
          const slatX = -width / 2 + (i + 1) * (width / (slatCount + 1));
          this.addBox(vertices, normals, uvs,
            slatX, legHeight + headboardHeight / 2, -length / 2 - headboardThickness - 0.03,
            0.05, headboardHeight, headboardThickness + 0.06
          );
        }
      }
    }
    
    // Center support legs for larger beds
    if (width > 1.5) {
      const centerLegPositions = [
        [0, 0, -length / 4],
        [0, 0, length / 4],
      ];
      for (const [lx, ly, lz] of centerLegPositions) {
        this.addBox(vertices, normals, uvs,
          lx - 0.04, ly, lz - 0.04,
          0.08, legHeight, 0.08
        );
      }
    }
  }

  private generateMattress(
    vertices: number[], normals: number[], uvs: number[],
    width: number, length: number, thickness: number,
    type: MattressType, y: number, seed: number
  ): void {
    // Main mattress body
    this.addBox(vertices, normals, uvs,
      -width / 2, y, -length / 2,
      width, thickness, length
    );
    
    // Mattress detailing
    if (type === 'coiled') {
      // Add tufting pattern
      const tuftSpacing = 0.3;
      const tuftRows = Math.floor(length / tuftSpacing);
      const tuftCols = Math.floor(width / tuftSpacing);
      
      for (let row = 1; row < tuftRows; row++) {
        for (let col = 1; col < tuftCols; col++) {
          const tx = -width / 2 + col * tuftSpacing;
          const tz = -length / 2 + row * tuftSpacing;
          // Small depression for tuft
          this.addBox(vertices, normals, uvs,
            tx - 0.03, y + thickness - 0.02, tz - 0.03,
            0.06, 0.02, 0.06
          );
        }
      }
    } else if (type === 'wrapped') {
      // Add edge piping
      const pipingSize = 0.03;
      // Top edge
      this.addBox(vertices, normals, uvs,
        -width / 2, y + thickness, -length / 2,
        width, pipingSize, pipingSize
      );
      this.addBox(vertices, normals, uvs,
        -width / 2, y + thickness, length / 2 - pipingSize,
        width, pipingSize, pipingSize
      );
      this.addBox(vertices, normals, uvs,
        -width / 2, y + thickness, -length / 2 + pipingSize,
        pipingSize, pipingSize, length - 2 * pipingSize
      );
      this.addBox(vertices, normals, uvs,
        width / 2 - pipingSize, y + thickness, -length / 2 + pipingSize,
        pipingSize, pipingSize, length - 2 * pipingSize
      );
    }
  }

  private generateBedding(
    vertices: number[], normals: number[], uvs: number[],
    width: number, length: number,
    sheetType: SheetType, hasComforter: boolean, comforterFolded: boolean,
    y: number, style: string, seed: number
  ): void {
    const beddingThickness = sheetType === 'quilt' ? 0.03 : 0.08;
    
    // Base sheet
    const sheetOverhang = 0.15;
    this.addBox(vertices, normals, uvs,
      -width / 2 - sheetOverhang / 2, y, -length / 2 - sheetOverhang / 2,
      width + sheetOverhang, beddingThickness, length + sheetOverhang
    );
    
    // Comforter or quilt
    if (hasComforter && sheetType !== 'none') {
      const comforterWidth = width * (sheetType === 'box-comforter' ? 1.6 : 1.4);
      const comforterLength = length * (sheetType === 'box-comforter' ? 1.1 : 0.9);
      
      if (comforterFolded) {
        // Folded at foot of bed
        const foldY = y + beddingThickness * 3;
        this.addBox(vertices, normals, uvs,
          -width / 2 - sheetOverhang / 2, foldY, length / 2 - 0.3,
          width + sheetOverhang, beddingThickness * 2, 0.3
        );
      } else {
        // Full comforter
        const comforterY = y + beddingThickness;
        this.addBox(vertices, normals, uvs,
          -width / 2 - sheetOverhang / 2, comforterY, -length / 2 + 0.2,
          width + sheetOverhang, beddingThickness * 2, comforterLength
        );
        
        // Box comforter sides
        if (sheetType === 'box-comforter') {
          const sideDrop = 0.3;
          // Left side
          this.addBox(vertices, normals, uvs,
            -width / 2 - sheetOverhang / 2, comforterY - sideDrop / 2, -length / 2 + 0.2,
            0.05, sideDrop, comforterLength
          );
          // Right side
          this.addBox(vertices, normals, uvs,
            width / 2 + sheetOverhang / 2 - 0.05, comforterY - sideDrop / 2, -length / 2 + 0.2,
            0.05, sideDrop, comforterLength
          );
          // Foot side
          this.addBox(vertices, normals, uvs,
            -width / 2 - sheetOverhang / 2, comforterY - sideDrop / 2, -length / 2 + 0.2 - sideDrop,
            width + sheetOverhang, sideDrop, 0.05
          );
        }
      }
    }
  }

  private generatePillows(
    vertices: number[], normals: number[], uvs: number[],
    width: number, length: number,
    count: number, headboardStyle: HeadboardStyle,
    y: number, seed: number
  ): void {
    const pillowWidth = 0.65;
    const pillowLength = 0.45;
    const pillowThickness = 0.15;
    
    // Position pillows at head of bed
    const zOffset = length / 2 - pillowLength / 2 - 0.1;
    
    for (let i = 0; i < count; i++) {
      const xOffset = (i - (count - 1) / 2) * (pillowWidth * 0.9);
      const pillowY = y + (i % 2) * 0.03; // Slight stagger
      
      // Pillow body (slightly rounded)
      this.addBox(vertices, normals, uvs,
        xOffset - pillowWidth / 2, pillowY, zOffset - pillowLength / 2,
        pillowWidth, pillowThickness, pillowLength
      );
      
      // Pillow case fold
      this.addBox(vertices, normals, uvs,
        xOffset - pillowWidth / 2 + 0.05, pillowY + pillowThickness, zOffset + pillowLength / 2 - 0.1,
        pillowWidth - 0.1, 0.05, 0.1
      );
    }
  }

  private addLegDecor(
    vertices: number[], normals: number[], uvs: number[],
    x: number, height: number, z: number,
    legWidth: number, decorType: string, seed: number
  ): void {
    const decorHeight = height * 0.3;
    const decorY = height - decorHeight;
    
    if (decorType === 'coiled') {
      // Spiral decoration
      const coilRadius = legWidth * 0.6;
      const coilTurns = 3;
      for (let i = 0; i < coilTurns; i++) {
        const coilY = decorY + (i + 0.5) * (decorHeight / coilTurns);
        this.addBox(vertices, normals, uvs,
          x - coilRadius / 2, coilY, z - coilRadius / 2,
          coilRadius, decorHeight / coilTurns / 2, coilRadius
        );
      }
    } else if (decorType === 'pad') {
      // Padded foot
      this.addBox(vertices, normals, uvs,
        x - legWidth * 0.7, decorY, z - legWidth * 0.7,
        legWidth * 1.4, decorHeight / 2, legWidth * 1.4
      );
    }
  }

  private addCurvedLeg(
    vertices: number[], normals: number[], uvs: number[],
    x: number, z: number, height: number,
    width: number, seed: number
  ): void {
    // Approximate curved leg with stacked boxes
    const segments = 8;
    const curveAmount = width * 0.3;
    
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const segHeight = height / segments;
      const segY = t * height;
      const segWidth = width * (0.8 + 0.2 * Math.sin(t * Math.PI));
      const segOffset = curveAmount * Math.sin(t * Math.PI / 2);
      
      this.addBox(vertices, normals, uvs,
        x - segWidth / 2 + segOffset, segY, z - segWidth / 2,
        segWidth, segHeight, segWidth
      );
    }
  }

  // Helper methods from furniture.ts
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
    // Simplified tapered box using multiple slices
    const slices = 4;
    for (let i = 0; i < slices; i++) {
      const t = i / slices;
      const sliceHeight = height / slices;
      const sliceY = y + t * sliceHeight + sliceHeight / 2;
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
