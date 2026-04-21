/**
 * Snow Surface Kernel
 * 
 * Based on the original Infinigen snow surface from:
 * infinigen/assets/materials/snow.py
 * infinigen/terrain/source/common/surfaces/snow.h
 * 
 * Creates realistic snow surface displacement with:
 * - Soft, accumulated snow layers
 * - Wind-driven drift patterns
 * - Subsurface scattering approximation
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Snow surface parameters
 */
export interface SnowParams {
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
  
  // Snow accumulation controls
  accumulationRate: number;
  windDirection: Vector3;
  windStrength: number;
  
  // Drift parameters
  driftScale: number;
  driftIntensity: number;
  driftFrequency: number;
  
  // Softness controls
  softness: number;
  compaction: number;
  
  // Color and albedo
  albedo: number;
  colorVariation: number;
  
  // Subsurface scattering approximation
  subsurfaceWeight: number;
  subsurfaceRadius: number;
}

/**
 * Default snow parameters
 */
const DEFAULT_SNOW_PARAMS: SnowParams = {
  scale0: 0.5,
  scale1: 1.5,
  scale2: 3.0,
  zscale0: 0.15,
  zscale1: 0.08,
  zscale2: 0.04,
  detail0: 1.0,
  detail1: 0.6,
  detail2: 0.3,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.7, 0.3, 0),
  positionShift2: new Vector3(1.3, 0.9, 0),
  accumulationRate: 1.0,
  windDirection: new Vector3(1, 0, 0),
  windStrength: 0.3,
  driftScale: 2.0,
  driftIntensity: 0.5,
  driftFrequency: 0.5,
  softness: 0.8,
  compaction: 0.5,
  albedo: 0.9,
  colorVariation: 0.05,
  subsurfaceWeight: 0.6,
  subsurfaceRadius: 0.3,
};

/**
 * Snow surface kernel implementation
 */
export class SnowSurface extends SurfaceKernel {
  constructor() {
    super('snow', 'snow_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_SNOW_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate snow surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_SNOW_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_SNOW_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_SNOW_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_SNOW_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_SNOW_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_SNOW_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_SNOW_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_SNOW_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_SNOW_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_SNOW_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_SNOW_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_SNOW_PARAMS.positionShift2;
    
    const accumulationRate = this.getParam('accumulationRate') as number ?? DEFAULT_SNOW_PARAMS.accumulationRate;
    const windDirection = this.getParam('windDirection') as Vector3 ?? DEFAULT_SNOW_PARAMS.windDirection;
    const windStrength = this.getParam('windStrength') as number ?? DEFAULT_SNOW_PARAMS.windStrength;
    
    const driftScale = this.getParam('driftScale') as number ?? DEFAULT_SNOW_PARAMS.driftScale;
    const driftIntensity = this.getParam('driftIntensity') as number ?? DEFAULT_SNOW_PARAMS.driftIntensity;
    const driftFrequency = this.getParam('driftFrequency') as number ?? DEFAULT_SNOW_PARAMS.driftFrequency;
    
    const softness = this.getParam('softness') as number ?? DEFAULT_SNOW_PARAMS.softness;
    const compaction = this.getParam('compaction') as number ?? DEFAULT_SNOW_PARAMS.compaction;

    // Layer 1: Base snow accumulation
    const pos0 = position.clone().add(shift0).multiplyScalar(scale0);
    const noise0 = noise3D(pos0.x, pos0.y, pos0.z, 1.0);
    const disp0 = noise0 * zscale0 * detail0 * accumulationRate;

    // Layer 2: Wind-driven drift patterns
    const windOffset = windDirection.clone().multiplyScalar(windStrength * position.dot(windDirection));
    const pos1 = position.clone().add(windOffset).add(shift1).multiplyScalar(scale1);
    const noise1 = noise3D(pos1.x, pos1.y, pos1.z, driftFrequency);
    const driftPattern = Math.pow(Math.abs(noise1), driftScale);
    const disp1 = driftPattern * zscale1 * detail1 * driftIntensity;

    // Layer 3: Fine snow detail
    const pos2 = position.clone().add(shift2).multiplyScalar(scale2);
    const noise2 = noise3D(pos2.x, pos2.y, pos2.z, 2.0);
    const disp2 = noise2 * zscale2 * detail2;

    // Slope-based accumulation (snow accumulates more on flat surfaces)
    const slopeFactor = Math.max(0, normal.y);
    const slopeAccumulation = Math.pow(slopeFactor, 1.0 - compaction);

    // Combine displacement layers with slope factor
    const totalDisplacement = (disp0 + disp1 + disp2) * slopeAccumulation * softness;

    // Calculate offset along normal (snow builds up outward)
    const offset = normal.clone().multiplyScalar(totalDisplacement);

    // Calculate albedo variation for color
    const albedoBase = this.getParam('albedo') as number ?? DEFAULT_SNOW_PARAMS.albedo;
    const colorVar = this.getParam('colorVariation') as number ?? DEFAULT_SNOW_PARAMS.colorVariation;
    const albedoVariation = albedoBase + noise3D(position.x * 0.5, position.y * 0.5, position.z * 0.5, 1.0) * colorVar;

    // Roughness (snow is generally rough but can be compacted)
    const roughness = 0.7 + 0.3 * (1.0 - softness) * compaction;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Displacement]: totalDisplacement,
      [SurfaceVar.Color]: albedoVariation,
    };
  }

  /**
   * Update snow parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<SnowParams>): this {
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

// Auto-register the snow surface kernel
surfaceKernelRegistry.register('snow', SnowSurface);
