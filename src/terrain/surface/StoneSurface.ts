/**
 * Stone Surface Kernel
 * 
 * Based on the original Infinigen stone surface from:
 * infinigen/assets/materials/stone.py
 * infinigen/terrain/source/common/surfaces/stone.h
 * 
 * Creates realistic stone/rock surface displacement with:
 * - Cracked rock patterns
 * - Weathering and erosion effects
 * - Multi-scale surface detail
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Stone surface parameters
 */
export interface StoneParams {
  // Scale parameters for each detail layer
  scale0: number;
  scale1: number;
  scale2: number;
  
  // Z-axis scaling (vertical displacement)
  zscale0: number;
  zscale1: number;
  zscale2: number;
  
  // Detail intensity
  detail0: number;
  detail1: number;
  detail2: number;
  
  // Position shifts for each layer
  positionShift0: Vector3;
  positionShift1: Vector3;
  positionShift2: Vector3;
  
  // Rock formation controls
  rockSize: number;
  rockVariation: number;
  fractureDensity: number;
  fractureDepth: number;
  
  // Weathering controls
  weatheringIntensity: number;
  erosionRate: number;
  smoothness: number;
  
  // Color and material
  baseColor: number;
  colorVariation: number;
  mineralVeins: number;
}

/**
 * Default stone parameters
 */
const DEFAULT_STONE_PARAMS: StoneParams = {
  scale0: 1.0,
  scale1: 2.0,
  scale2: 4.0,
  zscale0: 0.2,
  zscale1: 0.1,
  zscale2: 0.05,
  detail0: 1.0,
  detail1: 0.7,
  detail2: 0.4,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.5, 0.5, 0),
  positionShift2: new Vector3(1.0, 1.0, 0),
  rockSize: 1.5,
  rockVariation: 0.3,
  fractureDensity: 3.0,
  fractureDepth: 0.15,
  weatheringIntensity: 0.5,
  erosionRate: 0.3,
  smoothness: 0.4,
  baseColor: 0.5,
  colorVariation: 0.2,
  mineralVeins: 0.1,
};

/**
 * Stone surface kernel implementation
 */
export class StoneSurface extends SurfaceKernel {
  constructor() {
    super('stone', 'stone_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_STONE_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate stone surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_STONE_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_STONE_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_STONE_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_STONE_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_STONE_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_STONE_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_STONE_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_STONE_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_STONE_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_STONE_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_STONE_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_STONE_PARAMS.positionShift2;
    
    const rockSize = this.getParam('rockSize') as number ?? DEFAULT_STONE_PARAMS.rockSize;
    const rockVariation = this.getParam('rockVariation') as number ?? DEFAULT_STONE_PARAMS.rockVariation;
    const fractureDensity = this.getParam('fractureDensity') as number ?? DEFAULT_STONE_PARAMS.fractureDensity;
    const fractureDepth = this.getParam('fractureDepth') as number ?? DEFAULT_STONE_PARAMS.fractureDepth;
    
    const weatheringIntensity = this.getParam('weatheringIntensity') as number ?? DEFAULT_STONE_PARAMS.weatheringIntensity;
    const smoothness = this.getParam('smoothness') as number ?? DEFAULT_STONE_PARAMS.smoothness;

    // Layer 1: Base rock formation using Voronoi cells
    const voronoiScale = 1.0 / rockSize;
    const voronoiPos = position.clone().multiplyScalar(voronoiScale);
    const voronoiDist = voronoi2D(voronoiPos.x, voronoiPos.y, fractureDensity);
    
    // Create rock cell boundaries (fractures)
    const fractureThreshold = 0.3 + rockVariation * noise3D(position.x, position.y, position.z, 1.0);
    const isFracture = voronoiDist < fractureThreshold ? 1.0 : 0.0;
    const fractureDisplacement = -isFracture * fractureDepth;

    // Layer 2: Mid-frequency rock detail
    const pos1 = position.clone().add(shift1).multiplyScalar(scale1);
    const noise1 = noise3D(pos1.x, pos1.y, pos1.z, 1.5);
    const disp1 = noise1 * zscale1 * detail1;

    // Layer 3: High-frequency surface roughness
    const pos2 = position.clone().add(shift2).multiplyScalar(scale2);
    const noise2 = noise3D(pos2.x, pos2.y, pos2.z, 3.0);
    const disp2 = noise2 * zscale2 * detail2;

    // Apply weathering (smoothes sharp features)
    const weatheringFactor = 1.0 - weatheringIntensity * smoothness;
    const totalDisplacement = (fractureDisplacement + disp1 + disp2) * weatheringFactor;

    // Add erosion effect based on normal direction
    const erosionEffect = erosionRate * Math.max(0, -normal.y) * 0.1;
    const finalDisplacement = totalDisplacement - erosionEffect;

    // Calculate offset along normal
    const offset = normal.clone().multiplyScalar(finalDisplacement);

    // Calculate color variation with mineral veins
    const baseColor = this.getParam('baseColor') as number ?? DEFAULT_STONE_PARAMS.baseColor;
    const colorVar = this.getParam('colorVariation') as number ?? DEFAULT_STONE_PARAMS.colorVariation;
    const mineralVeins = this.getParam('mineralVeins') as number ?? DEFAULT_STONE_PARAMS.mineralVeins;
    
    // Mineral vein pattern using noise
    const veinNoise = noise3D(position.x * 0.3, position.y * 0.3, position.z * 0.3, 2.0);
    const veinPattern = Math.pow(Math.abs(veinNoise), 3.0) * mineralVeins;
    
    const color = baseColor + noise3D(position.x, position.y, position.z, 0.5) * colorVar + veinPattern;

    // Roughness (stone is generally rough, smoother when weathered)
    const roughness = 0.8 - 0.3 * weatheringIntensity * smoothness;

    // Metallic (stone is non-metallic)
    const metallic = 0.0;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Metallic]: metallic,
      [SurfaceVar.Displacement]: finalDisplacement,
      [SurfaceVar.Color]: color,
    };
  }

  /**
   * Update stone parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<StoneParams>): this {
    Object.entries(params).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
    return this;
  }
}

// Auto-register the stone surface kernel
surfaceKernelRegistry.register('stone', StoneSurface);
