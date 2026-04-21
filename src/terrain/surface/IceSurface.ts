/**
 * Ice Surface Kernel
 * 
 * Based on the original Infinigen ice surface from:
 * infinigen/assets/materials/ice.py
 * infinigen/terrain/source/common/surfaces/ice.h
 * 
 * Creates realistic ice surface displacement with:
 * - Smooth, glassy surfaces
 * - Crystalline structures
 * - Refraction and transparency effects
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Ice surface parameters
 */
export interface IceParams {
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
  
  // Ice formation controls
  crystalSize: number;
  crystalDensity: number;
  clarity: number;
  
  // Surface smoothness
  smoothness: number;
  frostAmount: number;
  frostScale: number;
  
  // Color and optical properties
  baseColor: number;
  absorption: number;
  refractionIndex: number;
}

/**
 * Default ice parameters
 */
const DEFAULT_ICE_PARAMS: IceParams = {
  scale0: 1.0,
  scale1: 2.5,
  scale2: 5.0,
  zscale0: 0.08,
  zscale1: 0.04,
  zscale2: 0.02,
  detail0: 1.0,
  detail1: 0.5,
  detail2: 0.25,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.5, 0.5, 0),
  positionShift2: new Vector3(1.0, 1.0, 0),
  crystalSize: 0.5,
  crystalDensity: 2.0,
  clarity: 0.9,
  smoothness: 0.95,
  frostAmount: 0.1,
  frostScale: 10.0,
  baseColor: 0.95,
  absorption: 0.1,
  refractionIndex: 1.31,
};

/**
 * Ice surface kernel implementation
 */
export class IceSurface extends SurfaceKernel {
  constructor() {
    super('ice', 'ice_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_ICE_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate ice surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_ICE_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_ICE_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_ICE_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_ICE_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_ICE_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_ICE_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_ICE_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_ICE_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_ICE_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_ICE_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_ICE_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_ICE_PARAMS.positionShift2;
    
    const crystalSize = this.getParam('crystalSize') as number ?? DEFAULT_ICE_PARAMS.crystalSize;
    const crystalDensity = this.getParam('crystalDensity') as number ?? DEFAULT_ICE_PARAMS.crystalDensity;
    const smoothness = this.getParam('smoothness') as number ?? DEFAULT_ICE_PARAMS.smoothness;
    const frostAmount = this.getParam('frostAmount') as number ?? DEFAULT_ICE_PARAMS.frostAmount;
    const frostScale = this.getParam('frostScale') as number ?? DEFAULT_ICE_PARAMS.frostScale;

    // Layer 1: Base ice surface (very smooth)
    const pos0 = position.clone().add(shift0).multiplyScalar(scale0);
    const noise0 = noise3D(pos0.x, pos0.y, pos0.z, 0.5);
    const disp0 = noise0 * zscale0 * detail0;

    // Layer 2: Crystalline structure using Voronoi
    const crystalPos = position.clone().multiplyScalar(crystalDensity);
    const voronoiDist = voronoi2D(crystalPos.x, crystalPos.y, crystalDensity);
    const crystalPattern = Math.pow(voronoiDist, 0.5) * crystalSize;
    const disp1 = crystalPattern * zscale1 * detail1;

    // Layer 3: Frost pattern (high frequency)
    const frostPos = position.clone().multiplyScalar(frostScale);
    const frostNoise = noise3D(frostPos.x, frostPos.y, frostPos.z, 2.0);
    const frostPattern = Math.max(0, frostNoise) * frostAmount;
    const disp2 = frostPattern * zscale2 * detail2;

    // Combine displacement layers
    const totalDisplacement = (disp0 + disp1 + disp2) * smoothness;

    // Calculate offset along normal (ice forms smooth layers)
    const offset = normal.clone().multiplyScalar(totalDisplacement);

    // Calculate color/transparency
    const baseColor = this.getParam('baseColor') as number ?? DEFAULT_ICE_PARAMS.baseColor;
    const clarity = this.getParam('clarity') as number ?? DEFAULT_ICE_PARAMS.clarity;
    
    // Ice color with slight blue tint variation
    const colorNoise = noise3D(position.x * 0.3, position.y * 0.3, position.z * 0.3, 1.0);
    const color = baseColor + colorNoise * 0.05;

    // Roughness (ice is very smooth, increased by frost)
    const roughness = (1.0 - smoothness) + frostAmount * 0.3;

    // Metallic (ice is non-metallic but has specular reflections)
    const metallic = 0.0;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Metallic]: metallic,
      [SurfaceVar.Displacement]: totalDisplacement,
      [SurfaceVar.Color]: color,
    };
  }

  /**
   * Update ice parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<IceParams>): this {
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

// Auto-register the ice surface kernel
surfaceKernelRegistry.register('ice', IceSurface);
