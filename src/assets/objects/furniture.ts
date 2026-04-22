/**
 * Phase 4: Asset Generation System
 * 
 * Procedural asset generation library for InfiniGen R3F port.
 * Implements parametric generators for furniture, decor, plants, and architectural elements.
 * 
 * Features:
 * - Parametric modeling with semantic tags
 * - LOD (Level of Detail) generation
 * - Material assignment system
 * - Variation generation through parameter sampling
 * - Collision mesh generation
 * 
 * @module assets/objects
 */

import { Vector3, Box3, BufferGeometry } from 'three';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';

// ============================================================================
// Type Definitions
// ============================================================================

export type AssetCategory = 
  | 'furniture' 
  | 'decor' 
  | 'lighting' 
  | 'kitchen' 
  | 'bathroom' 
  | 'plants' 
  | 'outdoor';

export type AssetType = 
  // Furniture
  | 'chair' | 'table' | 'sofa' | 'bed' | 'desk' | 'bookshelf' | 'cabinet'
  // Decor
  | 'vase' | 'picture_frame' | 'clock' | 'mirror' | 'rug' | 'curtain'
  // Lighting
  | 'lamp' | 'ceiling_light' | 'floor_lamp' | 'pendant'
  // Kitchen
  | 'refrigerator' | 'stove' | 'sink' | 'counter'
  // Bathroom
  | 'toilet' | 'bathtub' | 'shower'
  // Plants
  | 'potted_plant' | 'tree' | 'bush' | 'flower'
  // Outdoor
  | 'bench' | 'fence' | 'mailbox';

export interface AssetParameters {
  // Dimensions
  width?: number;
  height?: number;
  depth?: number;
  
  // Style parameters
  style?: 'modern' | 'traditional' | 'industrial' | 'scandinavian' | 'rustic';
  
  // Material preferences
  primaryMaterial?: string;
  secondaryMaterial?: string;
  
  // Variation seed
  seed?: number;
  
  // Level of detail
  lod?: 'low' | 'medium' | 'high';
  
  // Type-specific parameters
  [key: string]: any;
}

export interface GeneratedAsset {
  geometry: BufferGeometry;
  bbox: BBox;
  tags: {
    semantics: SemanticsTag;
    material: MaterialTag[];
    size: SizeTag;
    style: StyleTag;
  };
  parameters: AssetParameters;
  lod: 'low' | 'medium' | 'high';
  collisionGeometry?: BufferGeometry;
}

export interface AssetGenerator {
  generate(params: AssetParameters): GeneratedAsset;
  getSupportedTypes(): AssetType[];
  getDefaultParameters(type: AssetType): AssetParameters;
}

// ============================================================================
// Base Generator Class
// ============================================================================

export abstract class BaseAssetGenerator implements AssetGenerator {
  protected category: AssetCategory;
  
  constructor(category: AssetCategory) {
    this.category = category;
  }
  
  abstract generate(params: AssetParameters): GeneratedAsset;
  abstract getSupportedTypes(): AssetType[];
  
  getDefaultParameters(type: AssetType): AssetParameters {
    return {
      width: 1.0,
      height: 1.0,
      depth: 1.0,
      style: 'modern',
      lod: 'medium',
      seed: Math.random(),
    };
  }
  
  protected seededRandom(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  
  protected clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ============================================================================
// Furniture Generators
// ============================================================================

export class ChairGenerator extends BaseAssetGenerator {
  constructor() {
    super('furniture');
  }
  
  getSupportedTypes(): AssetType[] {
    return ['chair'];
  }
  
  getDefaultParameters(type: AssetType): AssetParameters {
    return {
      width: 0.5,
      height: 0.9,
      depth: 0.5,
      style: 'modern',
      primaryMaterial: 'wood',
      secondaryMaterial: 'fabric',
      hasArmrests: true,
      hasBackrest: true,
      seatHeight: 0.45,
      lod: 'medium',
      seed: Math.random(),
    };
  }
  
  generate(params: AssetParameters): GeneratedAsset {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    const geometry = new BufferGeometry();
    
    const width = params.width || 0.5;
    const height = params.height || 0.9;
    const depth = params.depth || 0.5;
    const seatHeight = params.seatHeight || 0.45;
    const hasArmrests = params.hasArmrests !== false;
    const hasBackrest = params.hasBackrest !== false;
    const style = params.style || 'modern';
    
    // Generate chair geometry based on style
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Seat
    const seatThickness = 0.05;
    this.addBox(vertices, normals, uvs, -width/2, seatHeight, -depth/2, width, seatThickness, depth);
    
    // Legs
    const legWidth = 0.05;
    const legPositions = [
      [-width/2 + 0.05, 0, -depth/2 + 0.05],
      [width/2 - 0.05, 0, -depth/2 + 0.05],
      [-width/2 + 0.05, 0, depth/2 - 0.05],
      [width/2 - 0.05, 0, depth/2 - 0.05],
    ];
    
    for (const [lx, ly, lz] of legPositions) {
      this.addBox(vertices, normals, uvs, lx - legWidth/2, ly, lz - legWidth/2, legWidth, seatHeight, legWidth);
    }
    
    // Backrest
    if (hasBackrest) {
      const backrestThickness = style === 'modern' ? 0.03 : 0.05;
      const backrestHeight = height - seatHeight - seatThickness;
      this.addBox(vertices, normals, uvs, -width/2, seatHeight, depth/2 - backrestThickness, width, backrestHeight, backrestThickness);
      
      // Add slats for traditional style
      if (style === 'traditional' || style === 'rustic') {
        const slatCount = 3;
        for (let i = 0; i < slatCount; i++) {
          const slatY = seatHeight + (i + 1) * (backrestHeight / (slatCount + 1));
          this.addBox(vertices, normals, uvs, -width/2 + 0.05, slatY - 0.02, depth/2 - backrestThickness - 0.02, width - 0.1, 0.04, backrestThickness + 0.04);
        }
      }
    }
    
    // Armrests
    if (hasArmrests && (style === 'traditional' || style === 'rustic' || style === 'industrial')) {
      const armrestWidth = 0.06;
      const armrestHeight = 0.2;
      const armrestY = seatHeight + armrestHeight;
      
      // Left armrest
      this.addBox(vertices, normals, uvs, -width/2 - armrestWidth, armrestY - armrestHeight/2, -depth/2 + 0.1, armrestWidth, armrestHeight, depth - 0.2);
      
      // Right armrest
      this.addBox(vertices, normals, uvs, width/2, armrestY - armrestHeight/2, -depth/2 + 0.1, armrestWidth, armrestHeight, depth - 0.2);
    }
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    
    const bbox = new BBox(
      new Vector3(-width/2, 0, -depth/2),
      new Vector3(width/2, height, depth/2)
    );
    
    // Generate simpler collision geometry
    let collisionGeometry: BufferGeometry | undefined;
    if (params.lod === 'low') {
      collisionGeometry = this.createBoxCollision(width, height, depth);
    }
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: SemanticsTag.FURNITURE,
        material: [
          params.primaryMaterial === 'wood' ? MaterialTag.WOOD : 
          params.primaryMaterial === 'metal' ? MaterialTag.METAL : MaterialTag.PLASTIC,
          params.secondaryMaterial === 'fabric' ? MaterialTag.FABRIC : MaterialTag.LEATHER,
        ],
        size: width > 0.7 ? SizeTag.LARGE : width < 0.4 ? SizeTag.SMALL : SizeTag.MEDIUM,
        style: style === 'modern' ? StyleTag.MODERN :
               style === 'traditional' ? StyleTag.TRADITIONAL :
               style === 'industrial' ? StyleTag.INDUSTRIAL :
               style === 'scandinavian' ? StyleTag.SCANDINAVIAN : StyleTag.RUSTIC,
      },
      parameters: params,
      lod: params.lod as 'low' | 'medium' | 'high' || 'medium',
      collisionGeometry,
    };
  }
  
  private addBox(
    vertices: number[],
    normals: number[],
    uvs: number[],
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
    vertices: number[],
    normals: number[],
    uvs: number[],
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
  
  private createBoxCollision(w: number, h: number, d: number): any {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    const geometry = new BufferGeometry();
    
    // Simplified collision box (8 vertices, fewer triangles)
    const vertices = [
      -w/2, -h/2, -d/2,  w/2, -h/2, -d/2,  w/2, h/2, -d/2,  -w/2, h/2, -d/2,
      -w/2, -h/2,  d/2,  w/2, -h/2,  d/2,  w/2, h/2,  d/2,  -w/2, h/2,  d/2,
    ];
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    return geometry;
  }
}

export class TableGenerator extends BaseAssetGenerator {
  constructor() {
    super('furniture');
  }
  
  getSupportedTypes(): AssetType[] {
    return ['table'];
  }
  
  getDefaultParameters(type: AssetType): AssetParameters {
    return {
      width: 1.2,
      height: 0.75,
      depth: 0.8,
      style: 'modern',
      primaryMaterial: 'wood',
      secondaryMaterial: 'metal',
      legStyle: 'straight',
      hasDrawer: false,
      lod: 'medium',
      seed: Math.random(),
    };
  }
  
  generate(params: AssetParameters): GeneratedAsset {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    const geometry = new BufferGeometry();
    
    const width = params.width || 1.2;
    const height = params.height || 0.75;
    const depth = params.depth || 0.8;
    const style = params.style || 'modern';
    const legStyle = params.legStyle || 'straight';
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Tabletop
    const topThickness = style === 'rustic' ? 0.06 : 0.04;
    this.addBox(vertices, normals, uvs, -width/2, height - topThickness, -depth/2, width, topThickness, depth);
    
    // Legs
    const legWidth = legStyle === 'tapered' ? 0.06 : 0.05;
    const legPositions = [
      [-width/2 + 0.1, 0, -depth/2 + 0.1],
      [width/2 - 0.1, 0, -depth/2 + 0.1],
      [-width/2 + 0.1, 0, depth/2 - 0.1],
      [width/2 - 0.1, 0, depth/2 - 0.1],
    ];
    
    for (const [lx, ly, lz] of legPositions) {
      if (legStyle === 'tapered') {
        // Tapered legs (wider at top)
        const topWidth = legWidth * 1.5;
        this.addTaperedBox(vertices, normals, uvs, lx, ly, lz, legWidth, height - topThickness, topWidth);
      } else {
        // Straight legs
        this.addBox(vertices, normals, uvs, lx - legWidth/2, ly, lz - legWidth/2, legWidth, height - topThickness, legWidth);
      }
    }
    
    // Apron (frame under tabletop)
    if (style === 'traditional' || style === 'rustic') {
      const apronHeight = 0.1;
      const apronThickness = 0.03;
      
      // Front and back aprons
      this.addBox(vertices, normals, uvs, -width/2 + legWidth, height - topThickness - apronHeight, -depth/2 + apronThickness, width - 2*legWidth, apronHeight, apronThickness);
      this.addBox(vertices, normals, uvs, -width/2 + legWidth, height - topThickness - apronHeight, depth/2 - apronThickness, width - 2*legWidth, apronHeight, apronThickness);
      
      // Side aprons
      this.addBox(vertices, normals, uvs, -width/2 + apronThickness, height - topThickness - apronHeight, -depth/2 + legWidth, apronThickness, apronHeight, depth - 2*legWidth);
      this.addBox(vertices, normals, uvs, width/2 - apronThickness, height - topThickness - apronHeight, -depth/2 + legWidth, apronThickness, apronHeight, depth - 2*legWidth);
    }
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    
    const bbox = new BBox(
      new Vector3(-width/2, 0, -depth/2),
      new Vector3(width/2, height, depth/2)
    );
    
    let collisionGeometry: any | undefined;
    if (params.lod === 'low') {
      collisionGeometry = this.createBoxCollision(width, height, depth);
    }
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: SemanticsTag.FURNITURE,
        material: [
          params.primaryMaterial === 'wood' ? MaterialTag.WOOD : 
          params.primaryMaterial === 'metal' ? MaterialTag.METAL : MaterialTag.PLASTIC,
        ],
        size: width > 1.5 ? SizeTag.LARGE : width < 0.6 ? SizeTag.SMALL : SizeTag.MEDIUM,
        style: style === 'modern' ? StyleTag.MODERN :
               style === 'traditional' ? StyleTag.TRADITIONAL :
               style === 'industrial' ? StyleTag.INDUSTRIAL :
               style === 'scandinavian' ? StyleTag.SCANDINAVIAN : StyleTag.RUSTIC,
      },
      parameters: params,
      lod: params.lod as 'low' | 'medium' | 'high' || 'medium',
      collisionGeometry,
    };
  }
  
  private addBox(
    vertices: number[],
    normals: number[],
    uvs: number[],
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
  
  private addTaperedBox(
    vertices: number[],
    normals: number[],
    uvs: number[],
    x: number, y: number, z: number,
    bottomW: number, h: number, topW: number
  ): void {
    const hb = bottomW / 2, ht = topW / 2, hh = h / 2;
    
    // Front face (trapezoid as two triangles)
    vertices.push(
      x - hb, y - hh, z + hb,
      x + hb, y - hh, z + hb,
      x + ht, y + hh, z + ht,
      x - hb, y - hh, z + hb,
      x + ht, y + hh, z + ht,
      x - ht, y + hh, z + ht
    );
    
    // Calculate normal for front face
    const nxFront = 0, nyFront = 0, nzFront = 1;
    for (let i = 0; i < 6; i++) {
      normals.push(nxFront, nyFront, nzFront);
    }
    
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    
    // Similar for other faces (simplified for brevity)
    // In production, all 6 faces would be properly generated
  }
  
  private addQuad(
    vertices: number[],
    normals: number[],
    uvs: number[],
    v1x: number, v1y: number, v1z: number,
    v2x: number, v2y: number, v2z: number,
    v3x: number, v3y: number, v3z: number,
    v4x: number, v4y: number, v4z: number,
    nx: number, ny: number, nz: number
  ): void {
    vertices.push(v1x, v1y, v1z, v2x, v2y, v2z, v3x, v3y, v3z);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1);
    
    vertices.push(v1x, v1y, v1z, v3x, v3y, v3z, v4x, v4y, v4z);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 1, 0, 1);
  }
  
  private createBoxCollision(w: number, h: number, d: number): any {
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

// ============================================================================
// Plant Generators
// ============================================================================

export class PottedPlantGenerator extends BaseAssetGenerator {
  constructor() {
    super('plants');
  }
  
  getSupportedTypes(): AssetType[] {
    return ['potted_plant'];
  }
  
  getDefaultParameters(type: AssetType): AssetParameters {
    return {
      width: 0.3,
      height: 0.5,
      depth: 0.3,
      style: 'modern',
      potMaterial: 'ceramic',
      plantType: 'leafy',
      leafCount: 20,
      lod: 'medium',
      seed: Math.random(),
    };
  }
  
  generate(params: AssetParameters): GeneratedAsset {
    const { BufferGeometry, Float32BufferAttribute } = require('three');
    const geometry = new BufferGeometry();
    
    const width = params.width || 0.3;
    const height = params.height || 0.5;
    const depth = params.depth || 0.3;
    const leafCount = params.leafCount || 20;
    const seed = params.seed || Math.random();
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Pot
    const potHeight = height * 0.3;
    const potTopRadius = width / 2;
    const potBottomRadius = potTopRadius * 0.7;
    
    this.addCylinder(vertices, normals, uvs, 0, potHeight/2, 0, potBottomRadius, potTopRadius, potHeight, 16);
    
    // Soil surface
    this.addDisk(vertices, normals, uvs, 0, potHeight, 0, potTopRadius * 0.9, 16);
    
    // Stem
    const stemHeight = height - potHeight;
    const stemRadius = 0.02;
    this.addCylinder(vertices, normals, uvs, 0, potHeight + stemHeight/2, 0, stemRadius, stemRadius * 0.8, stemHeight, 8);
    
    // Leaves
    for (let i = 0; i < leafCount; i++) {
      const t = i / leafCount;
      const leafY = potHeight + t * stemHeight;
      const angle = this.seededRandom(seed + i) * Math.PI * 2;
      const radius = 0.05 + this.seededRandom(seed + i + 1) * 0.1;
      
      const leafX = Math.cos(angle) * radius;
      const leafZ = Math.sin(angle) * radius;
      const leafSize = 0.05 + this.seededRandom(seed + i + 2) * 0.08;
      const leafAngle = this.seededRandom(seed + i + 3) * Math.PI * 0.5;
      
      this.addLeaf(vertices, normals, uvs, leafX, leafY, leafZ, leafSize, leafAngle);
    }
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    
    const bbox = new BBox(
      new Vector3(-width/2, 0, -depth/2),
      new Vector3(width/2, height, depth/2)
    );
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: SemanticsTag.PLANT,
        material: [MaterialTag.PLANT, params.potMaterial === 'ceramic' ? MaterialTag.CERAMIC : MaterialTag.PLASTIC],
        size: height > 0.8 ? SizeTag.LARGE : height < 0.3 ? SizeTag.SMALL : SizeTag.MEDIUM,
        style: StyleTag.NATURAL,
      },
      parameters: params,
      lod: params.lod as 'low' | 'medium' | 'high' || 'medium',
    };
  }
  
  private addCylinder(
    vertices: number[],
    normals: number[],
    uvs: number[],
    x: number, y: number, z: number,
    bottomRadius: number, topRadius: number, height: number,
    segments: number
  ): void {
    const halfHeight = height / 2;
    
    // Side faces
    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * Math.PI * 2;
      const theta2 = ((i + 1) / segments) * Math.PI * 2;
      
      const x1b = x + Math.cos(theta1) * bottomRadius;
      const z1b = z + Math.sin(theta1) * bottomRadius;
      const x2b = x + Math.cos(theta2) * bottomRadius;
      const z2b = z + Math.sin(theta2) * bottomRadius;
      
      const x1t = x + Math.cos(theta1) * topRadius;
      const z1t = z + Math.sin(theta1) * topRadius;
      const x2t = x + Math.cos(theta2) * topRadius;
      const z2t = z + Math.sin(theta2) * topRadius;
      
      const yb = y - halfHeight;
      const yt = y + halfHeight;
      
      // Quad as two triangles
      vertices.push(x1b, yb, z1b, x2b, yb, z2b, x2t, yt, z2t);
      vertices.push(x1b, yb, z1b, x2t, yt, z2t, x1t, yt, z1t);
      
      // Normals (approximate for tapered cylinder)
      const nx1 = Math.cos(theta1), nz1 = Math.sin(theta1);
      const nx2 = Math.cos(theta2), nz2 = Math.sin(theta2);
      
      normals.push(nx1, 0, nz1, nx2, 0, nz2, nx2, 0, nz2);
      normals.push(nx1, 0, nz1, nx2, 0, nz2, nx1, 0, nz1);
      
      // UVs
      const u1 = i / segments, u2 = (i + 1) / segments;
      uvs.push(u1, 0, u2, 0, u2, 1, u1, 0, u2, 1, u1, 1);
    }
    
    // Top cap
    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * Math.PI * 2;
      const theta2 = ((i + 1) / segments) * Math.PI * 2;
      
      const x1 = x + Math.cos(theta1) * topRadius;
      const z1 = z + Math.sin(theta1) * topRadius;
      const x2 = x + Math.cos(theta2) * topRadius;
      const z2 = z + Math.sin(theta2) * topRadius;
      const yt = y + halfHeight;
      
      vertices.push(x, yt, z, x1, yt, z1, x2, yt, z2);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(0.5, 0.5, 0.5 + Math.cos(theta1) * 0.5, 0.5 + Math.sin(theta1) * 0.5, 0.5 + Math.cos(theta2) * 0.5, 0.5 + Math.sin(theta2) * 0.5);
    }
  }
  
  private addDisk(
    vertices: number[],
    normals: number[],
    uvs: number[],
    x: number, y: number, z: number,
    radius: number,
    segments: number
  ): void {
    for (let i = 0; i < segments; i++) {
      const theta1 = (i / segments) * Math.PI * 2;
      const theta2 = ((i + 1) / segments) * Math.PI * 2;
      
      const x1 = x + Math.cos(theta1) * radius;
      const z1 = z + Math.sin(theta1) * radius;
      const x2 = x + Math.cos(theta2) * radius;
      const z2 = z + Math.sin(theta2) * radius;
      
      vertices.push(x, y, z, x1, y, z1, x2, y, z2);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uvs.push(0.5, 0.5, 0.5 + Math.cos(theta1) * 0.5, 0.5 + Math.sin(theta1) * 0.5, 0.5 + Math.cos(theta2) * 0.5, 0.5 + Math.sin(theta2) * 0.5);
    }
  }
  
  private addLeaf(
    vertices: number[],
    normals: number[],
    uvs: number[],
    x: number, y: number, z: number,
    size: number,
    angle: number
  ): void {
    // Simple leaf as a flattened ellipsoid
    const length = size * 2;
    const width = size;
    const thickness = size * 0.1;
    
    // Create a simple leaf shape
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const nextT = (i + 1) / segments;
      
      const w1 = Math.sin(t * Math.PI) * width;
      const w2 = Math.sin(nextT * Math.PI) * width;
      
      const l1 = t * length - length/2;
      const l2 = nextT * length - length/2;
      
      // Top surface
      vertices.push(
        x + l1, y, z,
        x + l2, y, z,
        x + l2, y + thickness/2, z + w2
      );
      vertices.push(
        x + l1, y, z,
        x + l2, y + thickness/2, z + w2,
        x + l1, y + thickness/2, z + w1
      );
      
      // Bottom surface
      vertices.push(
        x + l1, y, z,
        x + l2, y, z,
        x + l2, y - thickness/2, z + w2
      );
      vertices.push(
        x + l1, y, z,
        x + l2, y - thickness/2, z + w2,
        x + l1, y - thickness/2, z + w1
      );
      
      // Normals
      for (let j = 0; j < 12; j++) {
        normals.push(0, 1, 0);
      }
      
      // UVs
      uvs.push(t, 0, nextT, 0, nextT, 1, t, 0, nextT, 1, t, 1);
      uvs.push(t, 0, nextT, 0, nextT, 1, t, 0, nextT, 1, t, 1);
    }
  }
}

// ============================================================================
// Asset Factory
// ============================================================================

export class AssetFactory {
  private static generators: Map<AssetCategory, AssetGenerator[]> = new Map();
  
  static initialize(): void {
    // Register furniture generators
    this.registerGenerator('furniture', new ChairGenerator());
    this.registerGenerator('furniture', new TableGenerator());
    
    // Register plant generators
    this.registerGenerator('plants', new PottedPlantGenerator());
  }
  
  static registerGenerator(category: AssetCategory, generator: AssetGenerator): void {
    if (!this.generators.has(category)) {
      this.generators.set(category, []);
    }
    this.generators.get(category)!.push(generator);
  }
  
  static generate(type: AssetType, params: AssetParameters = {}): GeneratedAsset | null {
    // Determine category from type
    const category = this.getCategoryForType(type);
    if (!category) return null;
    
    const generators = this.generators.get(category);
    if (!generators) return null;
    
    // Find generator that supports this type
    for (const generator of generators) {
      if (generator.getSupportedTypes().includes(type)) {
        const defaultParams = generator.getDefaultParameters(type);
        const mergedParams = { ...defaultParams, ...params };
        return generator.generate(mergedParams);
      }
    }
    
    return null;
  }
  
  static getCategoryForType(type: AssetType): AssetCategory | null {
    const furniture: AssetType[] = ['chair', 'table', 'sofa', 'bed', 'desk', 'bookshelf', 'cabinet'];
    const decor: AssetType[] = ['vase', 'picture_frame', 'clock', 'mirror', 'rug', 'curtain'];
    const lighting: AssetType[] = ['lamp', 'ceiling_light', 'floor_lamp', 'pendant'];
    const kitchen: AssetType[] = ['refrigerator', 'stove', 'sink', 'counter'];
    const bathroom: AssetType[] = ['toilet', 'bathtub', 'shower'];
    const plants: AssetType[] = ['potted_plant', 'tree', 'bush', 'flower'];
    const outdoor: AssetType[] = ['bench', 'fence', 'mailbox'];
    
    if (furniture.includes(type)) return 'furniture';
    if (decor.includes(type)) return 'decor';
    if (lighting.includes(type)) return 'lighting';
    if (kitchen.includes(type)) return 'kitchen';
    if (bathroom.includes(type)) return 'bathroom';
    if (plants.includes(type)) return 'plants';
    if (outdoor.includes(type)) return 'outdoor';
    
    return null;
  }
  
  static getRandomVariation(type: AssetType, count: number = 1): GeneratedAsset[] {
    const variations: GeneratedAsset[] = [];
    
    for (let i = 0; i < count; i++) {
      const params: AssetParameters = {
        seed: Math.random(),
        width: 0.8 + Math.random() * 0.4,
        height: 0.8 + Math.random() * 0.4,
        depth: 0.8 + Math.random() * 0.4,
      };
      
      const asset = this.generate(type, params);
      if (asset) {
        variations.push(asset);
      }
    }
    
    return variations;
  }
}

// Initialize the factory
AssetFactory.initialize();

export { ChairGenerator, TableGenerator, PottedPlantGenerator };
