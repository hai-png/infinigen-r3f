/**
 * Sand Surface Kernel
 * 
 * Based on the original Infinigen sand surface from:
 * infinigen/assets/materials/sand.py
 * infinigen/terrain/source/common/surfaces/sand.h
 * 
 * Creates realistic sand surface displacement with:
 * - Fine grain patterns
 * - Dune formation
 * - Wind ripple effects
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Sand surface parameters
 */
export interface SandParams {
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
  
  // Grain size and distribution
  grainSize: number;
  grainDensity: number;
  grainVariation: number;
  
  // Dune formation
  duneScale: number;
  duneHeight: number;
  duneFrequency: number;
  
  // Wind ripple effects
  windDirection: Vector3;
  windStrength: number;
  rippleSpacing: number;
  rippleAmplitude: number;
  
  // Color and material
  baseColor: number;
  colorVariation: number;
  moistureLevel: number;
}

/**
 * Default sand parameters
 */
const DEFAULT_SAND_PARAMS: SandParams = {
  scale0: 5.0,
  scale1: 10.0,
  scale2: 20.0,
  zscale0: 0.05,
  zscale1: 0.03,
  zscale2: 0.015,
  detail0: 1.0,
  detail1: 0.6,
  detail2: 0.3,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.3, 0.7, 0),
  positionShift2: new Vector3(0.9, 1.2, 0),
  grainSize: 0.02,
  grainDensity: 50.0,
  grainVariation: 0.4,
  duneScale: 1.0,
  duneHeight: 0.3,
  duneFrequency: 0.2,
  windDirection: new Vector3(1, 0, 0),
  windStrength: 0.5,
  rippleSpacing: 0.1,
  rippleAmplitude: 0.02,
  baseColor: 0.7,
  colorVariation: 0.15,
  moistureLevel: 0.0,
};

/**
 * Sand surface kernel implementation
 */
export class SandSurface extends SurfaceKernel {
  constructor() {
    super('sand', 'sand_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_SAND_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate sand surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_SAND_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_SAND_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_SAND_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_SAND_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_SAND_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_SAND_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_SAND_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_SAND_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_SAND_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_SAND_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_SAND_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_SAND_PARAMS.positionShift2;
    
    const grainSize = this.getParam('grainSize') as number ?? DEFAULT_SAND_PARAMS.grainSize;
    const grainDensity = this.getParam('grainDensity') as number ?? DEFAULT_SAND_PARAMS.grainDensity;
    const grainVariation = this.getParam('grainVariation') as number ?? DEFAULT_SAND_PARAMS.grainVariation;
    
    const duneScale = this.getParam('duneScale') as number ?? DEFAULT_SAND_PARAMS.duneScale;
    const duneHeight = this.getParam('duneHeight') as number ?? DEFAULT_SAND_PARAMS.duneHeight;
    const duneFrequency = this.getParam('duneFrequency') as number ?? DEFAULT_SAND_PARAMS.duneFrequency;
    
    const windDirection = this.getParam('windDirection') as Vector3 ?? DEFAULT_SAND_PARAMS.windDirection;
    const windStrength = this.getParam('windStrength') as number ?? DEFAULT_SAND_PARAMS.windStrength;
    const rippleSpacing = this.getParam('rippleSpacing') as number ?? DEFAULT_SAND_PARAMS.rippleSpacing;
    const rippleAmplitude = this.getParam('rippleAmplitude') as number ?? DEFAULT_SAND_PARAMS.rippleAmplitude;
    
    const moistureLevel = this.getParam('moistureLevel') as number ?? DEFAULT_SAND_PARAMS.moistureLevel;

    // Layer 1: Large-scale dune formation
    const dunePos = position.clone().multiplyScalar(duneFrequency);
    const duneNoise = noise3D(dunePos.x, dunePos.y, dunePos.z, 1.0);
    const duneDisplacement = Math.pow(Math.abs(duneNoise), duneScale) * duneHeight * detail0;

    // Layer 2: Mid-frequency wind ripples
    const windDot = position.dot(windDirection);
    const ripplePhase = windDot / rippleSpacing;
    const rippleDisplacement = Math.sin(ripplePhase * Math.PI * 2) * rippleAmplitude * detail1;
    
    // Add noise variation to ripples
    const rippleNoise = noise3D(position.x * scale1, position.y * scale1, 0, 2.0);
    const variedRipple = rippleDisplacement * (1.0 + 0.3 * rippleNoise);

    // Layer 3: Fine grain detail
    const grainPos = position.clone().add(shift2).multiplyScalar(grainDensity);
    const grainNoise = noise3D(grainPos.x, grainPos.y, grainPos.z, 3.0);
    const grainDisplacement = grainNoise * grainSize * grainVariation * detail2;

    // Combine displacement layers
    const totalDisplacement = duneDisplacement + variedRipple + grainDisplacement;

    // Apply slope-based settling (sand settles at angle of repose)
    const slopeFactor = Math.max(0, normal.y);
    const settledDisplacement = totalDisplacement * (0.5 + 0.5 * slopeFactor);

    // Calculate offset along normal
    const offset = normal.clone().multiplyScalar(settledDisplacement);

    // Calculate color with moisture darkening
    const baseColor = this.getParam('baseColor') as number ?? DEFAULT_SAND_PARAMS.baseColor;
    const colorVar = this.getParam('colorVariation') as number ?? DEFAULT_SAND_PARAMS.colorVariation;
    
    const colorNoise = noise3D(position.x * 0.5, position.y * 0.5, position.z * 0.5, 1.0);
    let color = baseColor + colorNoise * colorVar;
    
    // Moisture darkens sand
    color *= (1.0 - moistureLevel * 0.4);

    // Roughness (dry sand is rough, wet sand is smoother)
    const roughness = 0.9 - moistureLevel * 0.4;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Displacement]: settledDisplacement,
      [SurfaceVar.Color]: color,
    };
  }

  /**
   * Update sand parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<SandParams>): this {
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

// Auto-register the sand surface kernel
surfaceKernelRegistry.register('sand', SandSurface);
