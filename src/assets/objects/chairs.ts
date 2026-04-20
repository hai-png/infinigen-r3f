/**
 * Chair Generators - Phase 1A: Furniture Assets
 * 
 * Procedural chair generation system ported from InfiniGen's seating/chairs module.
 * Implements parametric chairs with variations for legs, backrest, armrests, and seats.
 * 
 * Original Python: infinigen/assets/objects/seating/chairs/chair.py
 * 
 * Features:
 * - Multiple leg types (vertical, straight, curved)
 * - Backrest variations (whole, partial, horizontal-bar, vertical-bar)
 * - Optional armrests
 * - Parametric seat shapes
 * - Material assignment points
 * - LOD support
 */

import { Vector3, BufferGeometry, BoxGeometry, CylinderGeometry, CatmullRomCurve3, ExtrudeGeometry, Shape, TubeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters } from './furniture';
import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export type ChairType = 'office' | 'bar' | 'generic' | 'dining' | 'armchair';
export type LegType = 'vertical' | 'straight' | 'up-curved' | 'down-curved';
export type BackType = 'whole' | 'partial' | 'horizontal-bar' | 'vertical-bar';

export interface ChairParameters extends AssetParameters {
  chairType?: ChairType;
  legType?: LegType;
  backType?: BackType;
  
  // Dimensions
  width?: number;        // 0.4 - 0.5m typical
  depth?: number;        // 0.38 - 0.45m typical
  height?: number;       // 0.85 - 1.0m total
  seatHeight?: number;   // 0.45 - 0.5m
  
  // Proportions
  legThickness?: number;     // 0.04 - 0.06m
  backThickness?: number;    // 0.04 - 0.05m
  seatThickness?: number;    // 0.04 - 0.08m
  
  // Style options
  hasArmrests?: boolean;
  isSeatRound?: boolean;
  isLegRound?: boolean;
  hasLegBars?: boolean;
  
  // Variation
  seed?: number;
}

// ============================================================================
// Chair Generator
// ============================================================================

export class ChairGenerator extends BaseAssetGenerator {
  private static readonly LEG_TYPES: LegType[] = ['vertical', 'straight', 'up-curved', 'down-curved'];
  private static readonly BACK_TYPES: BackType[] = ['whole', 'partial', 'horizontal-bar', 'vertical-bar'];
  
  constructor() {
    super('furniture');
  }
  
  getSupportedTypes(): string[] {
    return ['chair'];
  }
  
  getDefaultParameters(type: string): ChairParameters {
    return {
      chairType: 'generic',
      legType: 'vertical',
      backType: 'whole',
      width: 0.45,
      depth: 0.42,
      height: 0.9,
      seatHeight: 0.47,
      legThickness: 0.05,
      backThickness: 0.045,
      seatThickness: 0.06,
      hasArmrests: false,
      isSeatRound: true,
      isLegRound: true,
      hasLegBars: true,
      style: 'modern',
      lod: 'medium',
      seed: Math.random()
    };
  }
  
  generate(params: ChairParameters): GeneratedAsset {
    const rng = new SeededRandom(params.seed ?? Date.now());
    
    // Randomize parameters if not specified
    const width = params.width ?? 0.4 + rng.nextFloat(0, 0.1);
    const depth = params.depth ?? 0.38 + rng.nextFloat(0, 0.07);
    const seatHeight = params.seatHeight ?? 0.45 + rng.nextFloat(0, 0.05);
    const totalHeight = params.height ?? 0.85 + rng.nextFloat(0, 0.15);
    const legThickness = params.legThickness ?? 0.04 + rng.nextFloat(0, 0.02);
    const backThickness = params.backThickness ?? 0.04 + rng.nextFloat(0, 0.01);
    const seatThickness = params.seatThickness ?? 0.04 + rng.nextFloat(0, 0.04);
    
    const legType = params.legType ?? rng.choice(ChairGenerator.LEG_TYPES);
    const backType = params.backType ?? rng.choice(ChairGenerator.BACK_TYPES);
    const hasArmrests = params.hasArmrests ?? rng.next() < 0.7;
    const isSeatRound = params.isSeatRound ?? rng.next() < 0.6;
    const isLegRound = params.isLegRound ?? rng.next() < 0.5;
    const hasLegBars = params.hasLegBars ?? rng.next() < 0.6;
    
    // Generate components
    const geometries: BufferGeometry[] = [];
    
    // 1. Seat
    const seatGeom = this.createSeat(width, depth, seatThickness, isSeatRound);
    geometries.push(seatGeom);
    
    // 2. Legs (4 legs)
    const legHeight = seatHeight - seatThickness / 2;
    const legPositions = [
      new Vector3(-width / 2 + legThickness / 2, -depth / 2 + legThickness / 2, 0),
      new Vector3(width / 2 - legThickness / 2, -depth / 2 + legThickness / 2, 0),
      new Vector3(-width / 2 + legThickness / 2, depth / 2 - legThickness / 2, 0),
      new Vector3(width / 2 - legThickness / 2, depth / 2 - legThickness / 2, 0)
    ];
    
    for (const pos of legPositions) {
      const legGeom = this.createLeg(legHeight, legThickness, legType, isLegRound);
      legGeom.translate(pos.x, pos.y, pos.z - legHeight / 2);
      geometries.push(legGeom);
    }
    
    // 3. Backrest
    const backHeight = totalHeight - seatHeight;
    if (backHeight > 0.1 && backType !== 'none') {
      const backGeom = this.createBackrest(width, backHeight, backThickness, backType, isSeatRound);
      backGeom.translate(0, depth / 2 - backThickness / 2, seatHeight + backHeight / 2 - seatThickness / 2);
      geometries.push(backGeom);
    }
    
    // 4. Armrests (optional)
    if (hasArmrests) {
      const armrestGeom = this.createArmrests(depth, backHeight, legThickness, seatThickness);
      armrestGeom.translate(0, 0, seatHeight);
      geometries.push(armrestGeom);
    }
    
    // 5. Leg bars (optional)
    if (hasLegBars) {
      const barGeom = this.createLegBars(width, depth, legHeight, legThickness);
      geometries.push(barGeom);
    }
    
    // Merge all geometries
    const mergedGeometry = mergeGeometries(geometries);
    mergedGeometry.computeVertexNormals();
    
    // Calculate bounding box
    const bbox = BBox.fromGeometry(mergedGeometry);
    
    // Create tags
    const tags = {
      semantics: 'chair' as SemanticsTag,
      material: ['wood', 'metal'] as MaterialTag[],
      size: this.determineSizeTag(totalHeight, width) as SizeTag,
      style: (params.style ?? 'modern') as StyleTag
    };
    
    return {
      geometry: mergedGeometry,
      bbox,
      tags,
      parameters: params,
      lod: params.lod ?? 'medium'
    };
  }
  
  private createSeat(width: number, depth: number, thickness: number, isRound: boolean): BufferGeometry {
    if (isRound) {
      // Rounded seat with slight curvature
      const shape = new Shape();
      const rx = width / 2;
      const ry = depth / 2;
      const segments = 32;
      
      shape.absarc(0, 0, rx, 0, Math.PI * 2, false);
      
      const extrudeSettings = {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: thickness * 0.1,
        bevelSize: thickness * 0.1,
        bevelSegments: 3
      };
      
      return new ExtrudeGeometry(shape, extrudeSettings);
    } else {
      // Square seat with rounded edges
      const geometry = new BoxGeometry(width, depth, thickness, 8, 8, 2);
      
      // Apply rounding to edges
      const positions = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        // Round corners in XY plane
        const cornerRadius = Math.min(width, depth) * 0.1;
        // Simple approximation - could use more sophisticated rounding
      }
      
      return geometry;
    }
  }
  
  private createLeg(height: number, thickness: number, legType: LegType, isRound: boolean): BufferGeometry {
    if (isRound) {
      if (legType === 'vertical') {
        // Simple cylindrical leg
        return new CylinderGeometry(thickness / 2, thickness / 2, height, 8);
      } else {
        // Curved leg using CatmullRom spline
        const points: Vector3[] = [];
        const curveAmount = 0.05;
        
        points.push(new Vector3(0, 0, 0));
        
        if (legType === 'straight') {
          points.push(new Vector3(0, -height * 0.5, 0));
          points.push(new Vector3(0, -height, 0));
        } else if (legType === 'up-curved') {
          points.push(new Vector3(curveAmount, -height * 0.3, 0));
          points.push(new Vector3(curveAmount, -height * 0.7, 0));
          points.push(new Vector3(0, -height, 0));
        } else if (legType === 'down-curved') {
          points.push(new Vector3(-curveAmount, -height * 0.3, 0));
          points.push(new Vector3(-curveAmount, -height * 0.7, 0));
          points.push(new Vector3(0, -height, 0));
        }
        
        const curve = new CatmullRomCurve3(points);
        const tubeGeom = new TubeGeometry(curve, 20, thickness / 2, 8, false);
        return tubeGeom;
      }
    } else {
      // Square leg
      return new BoxGeometry(thickness, thickness, height, 2, 2, 8);
    }
  }
  
  private createBackrest(width: number, height: number, thickness: number, backType: BackType, isSeatRound: boolean): BufferGeometry {
    switch (backType) {
      case 'whole':
        // Solid backrest
        const shape = new Shape();
        if (isSeatRound) {
          // Rounded top
          shape.moveTo(-width / 2, 0);
          shape.lineTo(-width / 2, height * 0.7);
          shape.quadraticCurveTo(-width / 2, height, 0, height);
          shape.quadraticCurveTo(width / 2, height, width / 2, height * 0.7);
          shape.lineTo(width / 2, 0);
          shape.lineTo(-width / 2, 0);
        } else {
          shape.moveTo(-width / 2, 0);
          shape.lineTo(-width / 2, height);
          shape.lineTo(width / 2, height);
          shape.lineTo(width / 2, 0);
        }
        
        return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
        
      case 'partial':
        // Partial backrest with cutouts
        const partialGeom = new BoxGeometry(width, height, thickness, 4, 4, 1);
        // Could add cutouts here with CSG operations
        return partialGeom;
        
      case 'horizontal-bar':
        // Horizontal slats
        const geoms: BufferGeometry[] = [];
        const numBars = 3;
        const barHeight = thickness * 1.5;
        const spacing = height / (numBars + 1);
        
        for (let i = 1; i <= numBars; i++) {
          const bar = new BoxGeometry(width, barHeight, thickness);
          bar.translate(0, 0, -height / 2 + i * spacing);
          geoms.push(bar);
        }
        
        return mergeGeometries(geoms);
        
      case 'vertical-bar':
        // Vertical slats
        const vGeoms: BufferGeometry[] = [];
        const numVertical = 5;
        const barWidth = thickness * 1.5;
        const vSpacing = width / (numVertical + 1);
        
        for (let i = 1; i <= numVertical; i++) {
          const bar = new BoxGeometry(barWidth, height, thickness);
          bar.translate(-width / 2 + i * vSpacing, 0, 0);
          vGeoms.push(bar);
        }
        
        return mergeGeometries(vGeoms);
        
      default:
        return new BoxGeometry(width, height, thickness);
    }
  }
  
  private createArmrests(depth: number, backHeight: number, legThickness: number, seatThickness: number): BufferGeometry {
    const armrestLength = depth * 0.8;
    const armrestWidth = legThickness * 1.5;
    const armrestHeight = legThickness;
    const armrestYOffset = depth / 2 - armrestWidth / 2;
    const armrestZOffset = seatThickness + backHeight * 0.4;
    
    const geoms: BufferGeometry[] = [];
    
    // Left armrest
    const leftArm = new BoxGeometry(armrestWidth, armrestLength, armrestHeight);
    leftArm.translate(-0.2, armrestYOffset, armrestZOffset);
    geoms.push(leftArm);
    
    // Right armrest
    const rightArm = new BoxGeometry(armrestWidth, armrestLength, armrestHeight);
    rightArm.translate(0.2, armrestYOffset, armrestZOffset);
    geoms.push(rightArm);
    
    return mergeGeometries(geoms);
  }
  
  private createLegBars(width: number, depth: number, legHeight: number, legThickness: number): BufferGeometry {
    const geoms: BufferGeometry[] = [];
    const barHeight = legHeight * 0.3;
    const barThickness = legThickness * 0.8;
    
    // X-direction bars
    const frontBarX = new BoxGeometry(width - legThickness, barThickness, barThickness);
    frontBarX.translate(0, -depth / 2 + legThickness, -barHeight);
    geoms.push(frontBarX);
    
    const backBarX = new BoxGeometry(width - legThickness, barThickness, barThickness);
    backBarX.translate(0, depth / 2 - legThickness, -barHeight);
    geoms.push(backBarX);
    
    // Y-direction bars
    const leftBarY = new BoxGeometry(barThickness, depth - legThickness, barThickness);
    leftBarY.translate(-width / 2 + legThickness, 0, -barHeight);
    geoms.push(leftBarY);
    
    const rightBarY = new BoxGeometry(barThickness, depth - legThickness, barThickness);
    rightBarY.translate(width / 2 - legThickness, 0, -barHeight);
    geoms.push(rightBarY);
    
    return mergeGeometries(geoms);
  }
  
  private determineSizeTag(height: number, width: number): SizeTag {
    if (height < 0.5) return 'small';
    if (height > 1.0) return 'large';
    return 'medium';
  }
}

// ============================================================================
// Specialized Chair Variants
// ============================================================================

export class OfficeChairGenerator extends ChairGenerator {
  getDefaultParameters(type: string): ChairParameters {
    return {
      ...super.getDefaultParameters(type),
      chairType: 'office',
      hasArmrests: true,
      isSeatRound: true,
      style: 'modern',
      height: 1.1, // Taller with headrest option
      seatHeight: 0.5 // Adjustable
    };
  }
}

export class BarChairGenerator extends ChairGenerator {
  getDefaultParameters(type: string): ChairParameters {
    return {
      ...super.getDefaultParameters(type),
      chairType: 'bar',
      hasArmrests: false,
      height: 1.1, // Bar height
      seatHeight: 0.75, // Bar seat height
      legType: 'straight'
    };
  }
}

export class DiningChairGenerator extends ChairGenerator {
  getDefaultParameters(type: string): ChairParameters {
    return {
      ...super.getDefaultParameters(type),
      chairType: 'dining',
      backType: 'whole',
      style: 'traditional',
      isSeatRound: false
    };
  }
}

// ============================================================================
// Export factory function
// ============================================================================

export function createChairGenerator(): ChairGenerator {
  return new ChairGenerator();
}

export function createOfficeChairGenerator(): OfficeChairGenerator {
  return new OfficeChairGenerator();
}

export function createBarChairGenerator(): BarChairGenerator {
  return new BarChairGenerator();
}

export function createDiningChairGenerator(): DiningChairGenerator {
  return new DiningChairGenerator();
}
