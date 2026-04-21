/**
 * Dirt Surface Kernel
 * 
 * Based on the original Infinigen dirt surface from:
 * infinigen/assets/materials/dirt.py
 * infinigen/terrain/source/common/surfaces/dirt.h
 * 
 * Creates realistic dirt/soil surface displacement with:
 * - Noise-based micro-displacement
 * - Voronoi cracking patterns
 * - Multi-scale detail layers
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Dirt surface parameters
 */
export interface DirtParams {
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
  
  // Roughness for each layer
  roughness0: number;
  roughness1: number;
  roughness2: number;
  
  // Noise texture scales
  noiseTexture1W: number;
  noiseTexture2W: number;
  noiseTexture3W: number;
  noiseTexture4W: number;
  
  // Crack parameters
  scalCrack: number;
  
  // Color ramp controls
  colorRamp1: number;
  colorRamp2A: number;
  colorRamp2B: number;
  
  // Value controls
  value001: number;
  value002: number;
  value003: number;
  value: number;
}

/**
 * Default dirt parameters
 */
const DEFAULT_DIRT_PARAMS: DirtParams = {
  scale0: 1.0,
  scale1: 2.5,
  scale2: 5.0,
  zscale0: 0.1,
  zscale1: 0.05,
  zscale2: 0.025,
  detail0: 1.0,
  detail1: 0.5,
  detail2: 0.25,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.5, 0.5, 0),
  positionShift2: new Vector3(1.0, 1.0, 0),
  roughness0: 0.8,
  roughness1: 0.6,
  roughness2: 0.4,
  noiseTexture1W: 0.5,
  noiseTexture2W: 2.5,
  noiseTexture3W: 8.0,
  noiseTexture4W: 16.0,
  scalCrack: 4.0,
  colorRamp1: 0.3,
  colorRamp2A: 0.0,
  colorRamp2B: 1.0,
  value001: 0.5,
  value002: 0.3,
  value003: 0.7,
  value: 1.0,
};

/**
 * Dirt surface kernel implementation
 */
export class DirtSurface extends SurfaceKernel {
  constructor() {
    super('dirt', 'dirt_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_DIRT_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate dirt surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_DIRT_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_DIRT_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_DIRT_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_DIRT_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_DIRT_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_DIRT_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_DIRT_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_DIRT_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_DIRT_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_DIRT_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_DIRT_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_DIRT_PARAMS.positionShift2;
    
    const noise2W = this.getParam('noiseTexture2W') as number ?? DEFAULT_DIRT_PARAMS.noiseTexture2W;
    const noise1W = this.getParam('noiseTexture1W') as number ?? DEFAULT_DIRT_PARAMS.noiseTexture1W;
    const scalCrack = this.getParam('scalCrack') as number ?? DEFAULT_DIRT_PARAMS.scalCrack;
    const colorRamp1 = this.getParam('colorRamp1') as number ?? DEFAULT_DIRT_PARAMS.colorRamp1;
    const colorRamp2A = this.getParam('colorRamp2A') as number ?? DEFAULT_DIRT_PARAMS.colorRamp2A;
    const colorRamp2B = this.getParam('colorRamp2B') as number ?? DEFAULT_DIRT_PARAMS.colorRamp2B;

    // Layer 1: Base noise displacement
    const pos0 = position.clone().add(shift0).multiplyScalar(scale0);
    const noise0 = noise3D(pos0.x, pos0.y, pos0.z, noise2W);
    const disp0 = noise0 * zscale0 * detail0;

    // Layer 2: Mid-frequency detail
    const pos1 = position.clone().add(shift1).multiplyScalar(scale1);
    const noise1 = noise3D(pos1.x, pos1.y, pos1.z, noise1W);
    const disp1 = noise1 * zscale1 * detail1;

    // Layer 3: High-frequency detail
    const pos2 = position.clone().add(shift2).multiplyScalar(scale2);
    const noise2 = noise3D(pos2.x, pos2.y, pos2.z, noise2W * 2);
    const disp2 = noise2 * zscale2 * detail2;

    // Voronoi cracking pattern
    const voronoiPos = position.clone().multiplyScalar(noise1W);
    const voronoiDist = voronoi2D(voronoiPos.x, voronoiPos.y, scalCrack);
    
    // Map voronoi distance through color ramp
    const crackFactor = MathUtils.clamp(
      MathUtils.mapLinear(voronoiDist, 0, colorRamp1, 0, 1),
      0, 1
    );

    // Combine displacement layers
    const totalDisplacement = disp0 + disp1 * crackFactor + disp2;

    // Calculate offset along normal
    const offset = normal.clone().multiplyScalar(totalDisplacement);

    // Calculate roughness variation
    const roughness = 0.5 + 0.5 * noise3D(position.x, position.y, position.z, 1.0);

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Displacement]: totalDisplacement,
    };
  }

  /**
   * Update dirt parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<DirtParams>): this {
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

// Auto-register the dirt surface kernel
surfaceKernelRegistry.register('dirt', DirtSurface);
