/**
 * Mud Surface Kernel
 * 
 * Based on the original Infinigen mud surface from:
 * infinigen/assets/materials/mud.py
 * infinigen/terrain/source/common/surfaces/mud.h
 * 
 * Creates realistic mud surface displacement with:
 * - Wet, viscous appearance
 * - Cracked dry patterns
 * - Puddle formation
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

/**
 * Mud surface parameters
 */
export interface MudParams {
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
  
  // Wetness controls
  wetness: number;
  viscosity: number;
  waterContent: number;
  
  // Drying and cracking
  dryness: number;
  crackDensity: number;
  crackDepth: number;
  crackScale: number;
  
  // Color and material
  baseColor: number;
  colorVariation: number;
  specularLevel: number;
}

/**
 * Default mud parameters
 */
const DEFAULT_MUD_PARAMS: MudParams = {
  scale0: 1.0,
  scale1: 2.0,
  scale2: 4.0,
  zscale0: 0.12,
  zscale1: 0.06,
  zscale2: 0.03,
  detail0: 1.0,
  detail1: 0.6,
  detail2: 0.3,
  positionShift0: new Vector3(0, 0, 0),
  positionShift1: new Vector3(0.5, 0.5, 0),
  positionShift2: new Vector3(1.0, 1.0, 0),
  wetness: 0.7,
  viscosity: 0.5,
  waterContent: 0.4,
  dryness: 0.2,
  crackDensity: 4.0,
  crackDepth: 0.08,
  crackScale: 3.0,
  baseColor: 0.25,
  colorVariation: 0.15,
  specularLevel: 0.6,
};

/**
 * Mud surface kernel implementation
 */
export class MudSurface extends SurfaceKernel {
  constructor() {
    super('mud', 'mud_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_MUD_PARAMS).forEach(([key, value]) => {
      if (value instanceof Vector3) {
        this.setParam(key, value.clone());
      } else {
        this.setParam(key, value as number);
      }
    });
  }

  /**
   * Evaluate mud surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const scale0 = this.getParam('scale0') as number ?? DEFAULT_MUD_PARAMS.scale0;
    const scale1 = this.getParam('scale1') as number ?? DEFAULT_MUD_PARAMS.scale1;
    const scale2 = this.getParam('scale2') as number ?? DEFAULT_MUD_PARAMS.scale2;
    
    const zscale0 = this.getParam('zscale0') as number ?? DEFAULT_MUD_PARAMS.zscale0;
    const zscale1 = this.getParam('zscale1') as number ?? DEFAULT_MUD_PARAMS.zscale1;
    const zscale2 = this.getParam('zscale2') as number ?? DEFAULT_MUD_PARAMS.zscale2;
    
    const detail0 = this.getParam('detail0') as number ?? DEFAULT_MUD_PARAMS.detail0;
    const detail1 = this.getParam('detail1') as number ?? DEFAULT_MUD_PARAMS.detail1;
    const detail2 = this.getParam('detail2') as number ?? DEFAULT_MUD_PARAMS.detail2;
    
    const shift0 = this.getParam('positionShift0') as Vector3 ?? DEFAULT_MUD_PARAMS.positionShift0;
    const shift1 = this.getParam('positionShift1') as Vector3 ?? DEFAULT_MUD_PARAMS.positionShift1;
    const shift2 = this.getParam('positionShift2') as Vector3 ?? DEFAULT_MUD_PARAMS.positionShift2;
    
    const wetness = this.getParam('wetness') as number ?? DEFAULT_MUD_PARAMS.wetness;
    const viscosity = this.getParam('viscosity') as number ?? DEFAULT_MUD_PARAMS.viscosity;
    const dryness = this.getParam('dryness') as number ?? DEFAULT_MUD_PARAMS.dryness;
    const crackDensity = this.getParam('crackDensity') as number ?? DEFAULT_MUD_PARAMS.crackDensity;
    const crackDepth = this.getParam('crackDepth') as number ?? DEFAULT_MUD_PARAMS.crackDepth;
    const crackScale = this.getParam('crackScale') as number ?? DEFAULT_MUD_PARAMS.crackScale;

    // Layer 1: Base mud undulation (viscous flow pattern)
    const pos0 = position.clone().add(shift0).multiplyScalar(scale0);
    const noise0 = noise3D(pos0.x, pos0.y, pos0.z, 1.0);
    const flowPattern = Math.pow(Math.abs(noise0), 1.0 / viscosity);
    const disp0 = flowPattern * zscale0 * detail0 * wetness;

    // Layer 2: Mid-frequency puddle formation
    const pos1 = position.clone().add(shift1).multiplyScalar(scale1);
    const noise1 = noise3D(pos1.x, pos1.y, pos1.z, 1.5);
    const puddleDepth = Math.max(0, noise1) * zscale1 * detail1 * waterContent;
    const disp1 = puddleDepth;

    // Layer 3: Drying cracks using Voronoi
    const crackPos = position.clone().multiplyScalar(crackScale);
    const voronoiDist = voronoi2D(crackPos.x, crackPos.y, crackDensity);
    
    // Create crack pattern (dry mud cracks along cell boundaries)
    const crackThreshold = 0.25 * (1.0 - wetness);
    const isCrack = voronoiDist < crackThreshold ? 1.0 : 0.0;
    const crackDisplacement = -isCrack * crackDepth * dryness;
    
    const pos2 = position.clone().add(shift2).multiplyScalar(scale2);
    const noise2 = noise3D(pos2.x, pos2.y, pos2.z, 3.0);
    const disp2 = noise2 * zscale2 * detail2 + crackDisplacement;

    // Combine displacement layers
    const totalDisplacement = disp0 + disp1 + disp2;

    // Apply slope-based flow (mud flows downhill)
    const slopeFactor = Math.max(0, normal.y);
    const flowAdjusted = totalDisplacement * (0.3 + 0.7 * slopeFactor * wetness);

    // Calculate offset along normal
    const offset = normal.clone().multiplyScalar(flowAdjusted);

    // Calculate color with wetness darkening
    const baseColor = this.getParam('baseColor') as number ?? DEFAULT_MUD_PARAMS.baseColor;
    const colorVar = this.getParam('colorVariation') as number ?? DEFAULT_MUD_PARAMS.colorVariation;
    
    const colorNoise = noise3D(position.x * 0.5, position.y * 0.5, position.z * 0.5, 1.0);
    let color = baseColor + colorNoise * colorVar;
    
    // Wet mud is darker
    color *= (1.0 - wetness * 0.3);

    // Roughness (wet mud is smoother, dry cracked mud is rougher)
    const roughness = 0.5 + 0.4 * dryness - 0.3 * wetness;

    // Specular (wet mud has higher specular)
    const specularLevel = this.getParam('specularLevel') as number ?? DEFAULT_MUD_PARAMS.specularLevel;
    const metallic = specularLevel * wetness * 0.1;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Metallic]: metallic,
      [SurfaceVar.Displacement]: flowAdjusted,
      [SurfaceVar.Color]: color,
    };
  }

  /**
   * Update mud parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<MudParams>): this {
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

// Auto-register the mud surface kernel
surfaceKernelRegistry.register('mud', MudSurface);
