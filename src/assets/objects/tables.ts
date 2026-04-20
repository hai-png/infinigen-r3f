/**
 * Table Generators - Phase 1B: Furniture Assets
 * 
 * Procedural table generation system ported from InfiniGen's tables module.
 * Implements parametric tables with variations for tops, legs, and stretchers.
 * 
 * Original Python: infinigen/assets/objects/tables/dining_table.py, cocktail_table.py
 * 
 * Features:
 * - Multiple table types (dining, cocktail, desk)
 * - Various leg styles (straight, single-stand, square)
 * - Parametric table tops (round, rectangular, oval)
 * - Optional stretchers/crossbars
 * - Material assignment points
 */

import { Vector3, BufferGeometry, BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, CircleGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters } from './furniture';
import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export type TableType = 'dining' | 'cocktail' | 'desk' | 'side' | 'coffee';
export type LegStyle = 'straight' | 'single-stand' | 'square' | 'pedestal';
export type TopShape = 'rectangular' | 'round' | 'oval' | 'square';

export interface TableParameters extends AssetParameters {
  tableType?: TableType;
  legStyle?: LegStyle;
  topShape?: TopShape;
  
  // Dimensions
  width?: number;        // 0.6 - 1.8m typical
  depth?: number;        // 0.6 - 1.0m typical  
  height?: number;       // 0.45 - 0.75m typical
  topThickness?: number; // 0.03 - 0.08m
  
  // Leg parameters
  legCount?: number;     // 1, 4, or more
  legDiameter?: number;  // 0.04 - 0.15m
  hasStretchers?: boolean;
  
  // Style options
  isRoundTop?: boolean;
  
  // Variation
  seed?: number;
}

// ============================================================================
// Table Generator
// ============================================================================

export class TableGenerator extends BaseAssetGenerator {
  private static readonly LEG_STYLES: LegStyle[] = ['straight', 'single-stand', 'square', 'pedestal'];
  private static readonly TOP_SHAPES: TopShape[] = ['rectangular', 'round', 'oval', 'square'];
  
  constructor() {
    super('furniture');
  }
  
  getSupportedTypes(): string[] {
    return ['table'];
  }
  
  getDefaultParameters(type: string): TableParameters {
    return {
      tableType: 'dining',
      legStyle: 'straight',
      topShape: 'rectangular',
      width: 1.2,
      depth: 0.8,
      height: 0.75,
      topThickness: 0.04,
      legCount: 4,
      legDiameter: 0.06,
      hasStretchers: true,
      style: 'modern',
      lod: 'medium',
      seed: Math.random()
    };
  }
  
  generate(params: TableParameters): GeneratedAsset {
    const rng = new SeededRandom(params.seed ?? Date.now());
    
    // Randomize parameters if not specified
    const width = params.width ?? 0.8 + rng.nextFloat(0, 1.0);
    const depth = params.depth ?? 0.6 + rng.nextFloat(0, 0.4);
    const height = params.height ?? 0.45 + rng.nextFloat(0, 0.3);
    const topThickness = params.topThickness ?? 0.03 + rng.nextFloat(0, 0.05);
    const legDiameter = params.legDiameter ?? 0.04 + rng.nextFloat(0, 0.11);
    
    const legStyle = params.legStyle ?? rng.choice(TableGenerator.LEG_STYLES);
    const topShape = params.topShape ?? rng.choice(TableGenerator.TOP_SHAPES);
    const legCount = params.legCount ?? (legStyle === 'single-stand' || legStyle === 'pedestal' ? 1 : 4);
    const hasStretchers = params.hasStretchers ?? rng.next() < 0.6;
    
    // Generate components
    const geometries: BufferGeometry[] = [];
    
    // 1. Table top
    const topGeom = this.createTableTop(width, depth, topThickness, topShape);
    topGeom.translate(0, 0, height - topThickness / 2);
    geometries.push(topGeom);
    
    // 2. Legs
    const legHeight = height - topThickness;
    const legGeoms = this.createLegs(legHeight, legDiameter, legStyle, legCount, width, depth);
    geometries.push(...legGeoms);
    
    // 3. Stretchers (optional)
    if (hasStretchers && legCount >= 4 && legStyle !== 'single-stand' && legStyle !== 'pedestal') {
      const stretcherGeom = this.createStretchers(width, depth, legDiameter, legHeight);
      geometries.push(stretcherGeom);
    }
    
    // Merge all geometries
    const mergedGeometry = mergeGeometries(geometries);
    mergedGeometry.computeVertexNormals();
    
    // Calculate bounding box
    const bbox = BBox.fromGeometry(mergedGeometry);
    
    // Create tags
    const tags = {
      semantics: 'table' as SemanticsTag,
      material: ['wood', 'metal'] as MaterialTag[],
      size: this.determineSizeTag(height, width) as SizeTag,
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
  
  private createTableTop(width: number, depth: number, thickness: number, shape: TopShape): BufferGeometry {
    switch (shape) {
      case 'round':
        const radius = Math.max(width, depth) / 2;
        const circleShape = new Shape();
        circleShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
        
        return new ExtrudeGeometry(circleShape, {
          depth: thickness,
          bevelEnabled: true,
          bevelThickness: thickness * 0.2,
          bevelSize: thickness * 0.2,
          bevelSegments: 3
        });
        
      case 'oval':
        const ovalShape = new Shape();
        const rx = width / 2;
        const ry = depth / 2;
        // Draw oval using arcs
        ovalShape.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2, false);
        
        return new ExtrudeGeometry(ovalShape, {
          depth: thickness,
          bevelEnabled: true,
          bevelThickness: thickness * 0.2,
          bevelSize: thickness * 0.2,
          bevelSegments: 3
        });
        
      case 'square':
        const squareSize = Math.min(width, depth);
        return new BoxGeometry(squareSize, squareSize, thickness, 8, 8, 2);
        
      case 'rectangular':
      default:
        return new BoxGeometry(width, depth, thickness, 8, 8, 2);
    }
  }
  
  private createLegs(height: number, diameter: number, style: LegStyle, count: number, width: number, depth: number): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    
    if (style === 'single-stand' || style === 'pedestal') {
      // Single central pedestal leg
      const pedestalGeom = this.createPedestalLeg(height, diameter, style === 'pedestal');
      geometries.push(pedestalGeom);
    } else {
      // Multiple legs at corners
      const positions = this.getLegPositions(count, width, depth);
      
      for (const pos of positions) {
        let legGeom: BufferGeometry;
        
        if (style === 'straight') {
          legGeom = new CylinderGeometry(diameter / 2, diameter / 2, height, 8);
        } else if (style === 'square') {
          legGeom = new BoxGeometry(diameter, diameter, height, 4, 4, 8);
        } else {
          // Default to straight
          legGeom = new CylinderGeometry(diameter / 2, diameter / 2, height, 8);
        }
        
        legGeom.translate(pos.x, pos.y, -height / 2);
        geometries.push(legGeom);
      }
    }
    
    return geometries;
  }
  
  private createPedestalLeg(height: number, diameter: number, isWide: boolean): BufferGeometry {
    if (isWide) {
      // Wide pedestal base
      const baseGeom = new CylinderGeometry(diameter * 1.5, diameter * 2, height * 0.3, 16);
      baseGeom.translate(0, 0, -height + height * 0.15);
      
      const columnGeom = new CylinderGeometry(diameter * 0.8, diameter, height * 0.7, 16);
      columnGeom.translate(0, 0, -height * 0.5);
      
      const topGeom = new CylinderGeometry(diameter, diameter * 1.2, height * 0.2, 16);
      topGeom.translate(0, 0, -height * 0.1);
      
      return mergeGeometries([baseGeom, columnGeom, topGeom]);
    } else {
      // Simple single stand
      return new CylinderGeometry(diameter * 0.8, diameter, height, 16);
    }
  }
  
  private getLegPositions(count: number, width: number, depth: number): Vector3[] {
    const positions: Vector3[] = [];
    const inset = 0.05; // Inset from edge
    
    if (count === 4) {
      // Standard 4-leg configuration
      positions.push(new Vector3(-width / 2 + inset, -depth / 2 + inset, 0));
      positions.push(new Vector3(width / 2 - inset, -depth / 2 + inset, 0));
      positions.push(new Vector3(-width / 2 + inset, depth / 2 - inset, 0));
      positions.push(new Vector3(width / 2 - inset, depth / 2 - inset, 0));
    } else if (count === 3) {
      // Tripod configuration
      const radius = Math.min(width, depth) * 0.35;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        positions.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      }
    } else if (count === 6) {
      // 6-leg configuration (long tables)
      const xInset = inset;
      const yInset = inset;
      positions.push(new Vector3(-width / 2 + xInset, -depth / 2 + yInset, 0));
      positions.push(new Vector3(0, -depth / 2 + yInset, 0));
      positions.push(new Vector3(width / 2 - xInset, -depth / 2 + yInset, 0));
      positions.push(new Vector3(-width / 2 + xInset, depth / 2 - yInset, 0));
      positions.push(new Vector3(0, depth / 2 - yInset, 0));
      positions.push(new Vector3(width / 2 - xInset, depth / 2 - yInset, 0));
    } else {
      // Default to 4 legs
      return this.getLegPositions(4, width, depth);
    }
    
    return positions;
  }
  
  private createStretchers(width: number, depth: number, legDiameter: number, legHeight: number): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    const stretcherHeight = legHeight * 0.3;
    const stretcherThickness = legDiameter * 0.8;
    const inset = 0.05;
    
    // X-direction stretchers (front and back)
    const frontStretcherX = new BoxGeometry(width - legDiameter * 2, stretcherThickness, stretcherThickness);
    frontStretcherX.translate(0, -depth / 2 + legDiameter, -stretcherHeight);
    geometries.push(frontStretcherX);
    
    const backStretcherX = new BoxGeometry(width - legDiameter * 2, stretcherThickness, stretcherThickness);
    backStretcherX.translate(0, depth / 2 - legDiameter, -stretcherHeight);
    geometries.push(backStretcherX);
    
    // Y-direction stretchers (left and right)
    const leftStretcherY = new BoxGeometry(stretcherThickness, depth - legDiameter * 2, stretcherThickness);
    leftStretcherY.translate(-width / 2 + legDiameter, 0, -stretcherHeight);
    geometries.push(leftStretcherY);
    
    const rightStretcherY = new BoxGeometry(stretcherThickness, depth - legDiameter * 2, stretcherThickness);
    rightStretcherY.translate(width / 2 - legDiameter, 0, -stretcherHeight);
    geometries.push(rightStretcherY);
    
    return mergeGeometries(geometries);
  }
  
  private determineSizeTag(height: number, width: number): SizeTag {
    if (height < 0.5) return 'small';
    if (height > 0.9 || width > 1.5) return 'large';
    return 'medium';
  }
}

// ============================================================================
// Specialized Table Variants
// ============================================================================

export class DiningTableGenerator extends TableGenerator {
  getDefaultParameters(type: string): TableParameters {
    return {
      ...super.getDefaultParameters(type),
      tableType: 'dining',
      width: 1.4,
      depth: 0.9,
      height: 0.75,
      legCount: 4,
      legStyle: 'straight',
      hasStretchers: true,
      style: 'traditional'
    };
  }
}

export class CocktailTableGenerator extends TableGenerator {
  getDefaultParameters(type: string): TableParameters {
    return {
      ...super.getDefaultParameters(type),
      tableType: 'cocktail',
      width: 0.8,
      depth: 0.5,
      height: 0.45,
      legStyle: 'single-stand',
      topShape: 'oval',
      hasStretchers: false,
      style: 'modern'
    };
  }
}

export class DeskGenerator extends TableGenerator {
  getDefaultParameters(type: string): TableParameters {
    return {
      ...super.getDefaultParameters(type),
      tableType: 'desk',
      width: 1.2,
      depth: 0.7,
      height: 0.75,
      legStyle: 'square',
      hasStretchers: false,
      style: 'industrial'
    };
  }
}

// ============================================================================
// Export factory functions
// ============================================================================

export function createTableGenerator(): TableGenerator {
  return new TableGenerator();
}

export function createDiningTableGenerator(): DiningTableGenerator {
  return new DiningTableGenerator();
}

export function createCocktailTableGenerator(): CocktailTableGenerator {
  return new CocktailTableGenerator();
}

export function createDeskGenerator(): DeskGenerator {
  return new DeskGenerator();
}
