/**
 * Mountain Surface Kernel
 * 
 * Based on the original Infinigen mountain surface characteristics:
 * infinigen/terrain/source/common/surfaces/mountain.h
 * infinigen/assets/materials/rock.py
 * 
 * Creates realistic high-altitude mountain terrain with:
 * - Ridged multifractal noise for craggy peaks
 * - Altitude-based snow line blending
 * - Stratified rock layer patterns
 * - Sharp, angular features typical of alpine environments
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceVar, surfaceKernelRegistry } from './SurfaceKernel';
import { noise3D, ridgedMultifractal } from '../../util/MathUtils';

/**
 * Mountain surface parameters
 */
export interface MountainParams {
  // Base altitude where mountains begin
  baseAltitude: number;
  
  // Overall height scale
  heightScale: number;
  
  // Roughness controls surface irregularity
  roughness: number;
  
  // Craginess controls sharpness of features
  craginess: number;
  
  // Number of noise octaves for detail
  octaves: number;
  
  // Lacunarity (frequency multiplier per octave)
  lacunarity: number;
  
  // Gain (amplitude multiplier per octave)
  gain: number;
  
  // Altitude where snow begins
  snowLine: number;
  
  // Width of snow transition zone
  snowTransition: number;
  
  // Snow coverage intensity
  snowCoverage: number;
  
  // Stratification layer spacing
  stratification: number;
  
  // Stratification layer contrast
  stratContrast: number;
  
  // Layer tilt angle
  layerTilt: number;
  
  // Erosion simulation factor
  erosionFactor: number;
  
  // Cliff formation threshold
  cliffThreshold: number;
  
  // Peak sharpness
  peakSharpness: number;
}

/**
 * Default mountain parameters
 * Tuned for realistic alpine terrain
 */
const DEFAULT_MOUNTAIN_PARAMS: MountainParams = {
  baseAltitude: 0.0,
  heightScale: 1.0,
  roughness: 0.75,
  craginess: 0.85,
  octaves: 6,
  lacunarity: 2.0,
  gain: 0.5,
  snowLine: 0.7,
  snowTransition: 0.15,
  snowCoverage: 0.6,
  stratification: 0.1,
  stratContrast: 0.4,
  layerTilt: 0.1,
  erosionFactor: 0.3,
  cliffThreshold: 0.6,
  peakSharpness: 0.9,
};

/**
 * Mountain surface kernel implementation
 */
export class MountainSurface extends SurfaceKernel {
  constructor() {
    super('mountain', 'mountain_weight', 'cpu');
    
    // Initialize with default parameters
    this.initializeParams();
  }

  /**
   * Initialize default parameters
   */
  private initializeParams(): void {
    Object.entries(DEFAULT_MOUNTAIN_PARAMS).forEach(([key, value]) => {
      this.setParam(key, value as number);
    });
  }

  /**
   * Evaluate mountain surface displacement at a vertex
   * @param vertex - Input vertex data
   * @returns Displacement offset and attributes
   */
  public evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3> {
    const { position, normal } = vertex;

    // Get parameters
    const baseAltitude = this.getParam('baseAltitude') as number ?? DEFAULT_MOUNTAIN_PARAMS.baseAltitude;
    const heightScale = this.getParam('heightScale') as number ?? DEFAULT_MOUNTAIN_PARAMS.heightScale;
    const roughness = this.getParam('roughness') as number ?? DEFAULT_MOUNTAIN_PARAMS.roughness;
    const craginess = this.getParam('craginess') as number ?? DEFAULT_MOUNTAIN_PARAMS.craginess;
    const octaves = this.getParam('octaves') as number ?? DEFAULT_MOUNTAIN_PARAMS.octaves;
    const lacunarity = this.getParam('lacunarity') as number ?? DEFAULT_MOUNTAIN_PARAMS.lacunarity;
    const gain = this.getParam('gain') as number ?? DEFAULT_MOUNTAIN_PARAMS.gain;
    const snowLine = this.getParam('snowLine') as number ?? DEFAULT_MOUNTAIN_PARAMS.snowLine;
    const snowTransition = this.getParam('snowTransition') as number ?? DEFAULT_MOUNTAIN_PARAMS.snowTransition;
    const snowCoverage = this.getParam('snowCoverage') as number ?? DEFAULT_MOUNTAIN_PARAMS.snowCoverage;
    const stratification = this.getParam('stratification') as number ?? DEFAULT_MOUNTAIN_PARAMS.stratification;
    const stratContrast = this.getParam('stratContrast') as number ?? DEFAULT_MOUNTAIN_PARAMS.stratContrast;
    const layerTilt = this.getParam('layerTilt') as number ?? DEFAULT_MOUNTAIN_PARAMS.layerTilt;
    const erosionFactor = this.getParam('erosionFactor') as number ?? DEFAULT_MOUNTAIN_PARAMS.erosionFactor;
    const cliffThreshold = this.getParam('cliffThreshold') as number ?? DEFAULT_MOUNTAIN_PARAMS.cliffThreshold;
    const peakSharpness = this.getParam('peakSharpness') as number ?? DEFAULT_MOUNTAIN_PARAMS.peakSharpness;

    // Calculate altitude factor (normalized height)
    const altitude = Math.max(0, position.y - baseAltitude) / heightScale;

    // Generate base mountain shape using ridged multifractal
    // This creates the characteristic sharp, craggy mountain peaks
    const ridgeFreq = 1.0 / heightScale;
    const baseRidge = ridgedMultifractal(
      position.x * ridgeFreq,
      position.y * ridgeFreq,
      position.z * ridgeFreq,
      octaves,
      lacunarity,
      gain,
      roughness
    );

    // Add craginess for sharper features
    const cragDetail = ridgedMultifractal(
      position.x * ridgeFreq * 2,
      position.y * ridgeFreq * 2,
      position.z * ridgeFreq * 2,
      Math.floor(octaves * 0.7),
      lacunarity * 1.2,
      gain * 0.8,
      craginess
    );

    // Combine base and crag details
    let displacement = baseRidge * 0.7 + cragDetail * 0.3;

    // Apply peak sharpness (exponential falloff for sharper peaks)
    if (peakSharpness > 0) {
      displacement = Math.pow(Math.abs(displacement), peakSharpness) * Math.sign(displacement);
    }

    // Add stratification (rock layer patterns)
    if (stratification > 0) {
      const layerNoise = noise3D(
        position.x * 2,
        position.y * stratification + layerTilt * position.x,
        position.z * 2,
        1.0
      );
      const stratPattern = Math.sin(layerNoise * Math.PI * 4) * stratContrast;
      displacement += stratPattern * (1 - altitude);
    }

    // Simulate erosion (more erosion at lower altitudes)
    if (erosionFactor > 0) {
      const erosionNoise = noise3D(
        position.x * 0.5,
        position.y * 0.5,
        position.z * 0.5,
        2.0
      );
      const erosionAmount = erosionFactor * (1 - altitude) * 0.5;
      displacement -= erosionNoise * erosionAmount;
    }

    // Create cliffs where slope is steep
    if (cliffThreshold > 0) {
      const slopeFactor = Math.abs(normal.y);
      if (slopeFactor < cliffThreshold) {
        // Steep areas get additional displacement for cliff faces
        const cliffDetail = ridgedMultifractal(
          position.x * 3,
          position.y * 3,
          position.z * 3,
          4,
          2.0,
          0.5,
          0.8
        );
        displacement += cliffDetail * (1 - slopeFactor / cliffThreshold) * 0.3;
      }
    }

    // Scale final displacement
    displacement *= heightScale;

    // Calculate offset along normal
    const offset = normal.clone().multiplyScalar(displacement);

    // Calculate snow factor based on altitude
    let snowFactor = 0;
    if (altitude > snowLine) {
      const snowNoise = noise3D(position.x * 0.5, position.y * 0.5, position.z * 0.5, 1.0);
      const altitudeBlend = MathUtils.clamp((altitude - snowLine) / snowTransition, 0, 1);
      snowFactor = altitudeBlend * snowCoverage * (0.5 + 0.5 * snowNoise);
    }

    // Calculate roughness (smoother at higher altitudes due to snow)
    const baseRoughness = 0.7 + 0.3 * noise3D(position.x, position.y, position.z, 0.5);
    const roughness = baseRoughness * (1 - snowFactor * 0.5);

    // Calculate color variation (darker at bottom, lighter at top)
    const colorVariation = 0.3 + 0.4 * altitude + 0.3 * snowFactor;

    return {
      [SurfaceVar.Offset]: offset,
      [SurfaceVar.Displacement]: displacement,
      [SurfaceVar.Roughness]: roughness,
      [SurfaceVar.Color]: new Vector3(colorVariation, colorVariation * 0.95, colorVariation * 0.9),
    };
  }

  /**
   * Update mountain parameters
   * @param params - Partial parameters to update
   */
  public updateParams(params: Partial<MountainParams>): this {
    Object.entries(params).forEach(([key, value]) => {
      this.setParam(key, value as number);
    });
    return this;
  }

  /**
   * Create preset configurations for different mountain types
   */
  public static presets = {
    /** Alpine peaks - sharp, snowy mountains */
    alpine: (): MountainParams => ({
      ...DEFAULT_MOUNTAIN_PARAMS,
      craginess: 0.9,
      roughness: 0.8,
      snowLine: 0.6,
      peakSharpness: 0.95,
      heightScale: 1.5,
    }),

    /** Rolling hills - gentler, rounded mountains */
    rollingHills: (): MountainParams => ({
      ...DEFAULT_MOUNTAIN_PARAMS,
      craginess: 0.4,
      roughness: 0.5,
      snowLine: 0.9,
      peakSharpness: 0.5,
      heightScale: 0.5,
      erosionFactor: 0.5,
    }),

    /** Desert mesas - flat-topped, eroded mountains */
    desertMesa: (): MountainParams => ({
      ...DEFAULT_MOUNTAIN_PARAMS,
      craginess: 0.6,
      roughness: 0.6,
      snowLine: 1.0,
      snowCoverage: 0,
      stratification: 0.15,
      stratContrast: 0.6,
      erosionFactor: 0.4,
      cliffThreshold: 0.7,
      heightScale: 0.8,
    }),

    /** Volcanic peaks - conical, rugged mountains */
    volcanic: (): MountainParams => ({
      ...DEFAULT_MOUNTAIN_PARAMS,
      craginess: 0.85,
      roughness: 0.9,
      snowLine: 0.8,
      peakSharpness: 0.8,
      heightScale: 1.8,
      octaves: 5,
      erosionFactor: 0.2,
    }),

    /** Karst landscape - heavily eroded, dramatic peaks */
    karst: (): MountainParams => ({
      ...DEFAULT_MOUNTAIN_PARAMS,
      craginess: 0.95,
      roughness: 0.85,
      snowLine: 0.75,
      peakSharpness: 0.9,
      erosionFactor: 0.6,
      cliffThreshold: 0.5,
      stratification: 0.2,
      heightScale: 1.2,
    }),
  };
}

// Auto-register the mountain surface kernel
surfaceKernelRegistry.register('mountain', MountainSurface);
