/**
 * ClaySurface.ts
 * 
 * Clay/earth surface with drying patterns and color variation
 * Inspired by natural terrain surfaces in Infinigen
 * 
 * Features:
 * - Drying crack patterns (mud cracks)
 * - Color stratification
 * - Moisture-based appearance
 * - Fine grain texture
 * - Erosion patterns
 */

import { SurfaceKernel, SurfaceOutput, SurfaceParams } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';
import { Vector3 } from 'three';

export interface ClayParams extends SurfaceParams {
  /** Base scale of clay features */
  scale: number;
  /** Moisture content [0-1] - affects color and cracking */
  moisture: number;
  /** Crack density when dry */
  crackDensity: number;
  /** Crack depth */
  crackDepth: number;
  /** Clay hardness */
  hardness: number;
  /** Color variation amplitude */
  colorVariation: number;
  /** Layer stratification */
  stratification: number;
  /** Primary clay color [R, G, B] */
  baseColor: [number, number, number];
  /** Secondary clay color [R, G, B] */
  secondaryColor: [number, number, number];
  /** Dry/baked color [R, G, B] */
  dryColor: [number, number, number];
  /** Wet/dark color [R, G, B] */
  wetColor: [number, number, number];
}

export class ClaySurface extends SurfaceKernel<ClayParams> {
  name = 'clay';
  
  defaultParams: ClayParams = {
    scale: 8.0,
    moisture: 0.4,
    crackDensity: 1.2,
    crackDepth: 0.03,
    hardness: 0.5,
    colorVariation: 0.15,
    stratification: 0.3,
    baseColor: [0.65, 0.45, 0.35],
    secondaryColor: [0.55, 0.4, 0.3],
    dryColor: [0.75, 0.55, 0.45],
    wetColor: [0.35, 0.25, 0.2],
  };

  paramRanges = {
    scale: [3.0, 15.0],
    moisture: [0.0, 1.0],
    crackDensity: [0.0, 3.0],
    crackDepth: [0.01, 0.1],
    hardness: [0.1, 0.9],
    colorVariation: [0.05, 0.4],
    stratification: [0.0, 0.8],
    baseColor: [[0, 0, 0], [1, 1, 1]],
    secondaryColor: [[0, 0, 0], [1, 1, 1]],
    dryColor: [[0, 0, 0], [1, 1, 1]],
    wetColor: [[0, 0, 0], [1, 1, 1]],
  };

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const p = this.params;
    
    const scaledPos = new Vector3(
      position.x * p.scale,
      position.y * p.scale * 0.1,
      position.z * p.scale
    );
    
    // Fine grain texture using high-frequency noise
    const grainNoise1 = noise3D(scaledPos.x, scaledPos.y, scaledPos.z) * 0.5;
    const grainNoise2 = noise3D(scaledPos.x * 2, scaledPos.y * 2, scaledPos.z * 2) * 0.25;
    const grainNoise3 = noise3D(scaledPos.x * 4, scaledPos.y * 4, scaledPos.z * 4) * 0.125;
    const grainTexture = (grainNoise1 + grainNoise2 + grainNoise3) / 0.875;
    
    // Moisture variation across surface
    const moistureNoise = noise3D(
      position.x * 0.3,
      position.y * 0.5,
      position.z * 0.3
    );
    const localMoisture = Math.max(0, Math.min(1, 
      p.moisture + moistureNoise * 0.2
    ));
    
    // Stratification layers
    let layerEffect = 0;
    if (p.stratification > 0) {
      const layerFreq = 2.0;
      const layerNoise = Math.sin(position.y * layerFreq + grainNoise1);
      layerEffect = (layerNoise + 1) * 0.5 * p.stratification;
    }
    
    // Cracking pattern - only forms when moisture is low
    let crackPattern = 0;
    const dryness = 1.0 - localMoisture;
    if (dryness > 0.3 && p.crackDensity > 0) {
      // Generate mud crack pattern using Voronoi
      const crackVoronoi = voronoi2D(
        position.x * p.crackDensity,
        position.z * p.crackDensity,
        1.0
      );
      
      // Create sharp crack edges
      crackPattern = Math.pow(crackVoronoi, 0.4);
      crackPattern = 1.0 - crackPattern;
      
      // Scale by dryness and hardness
      const crackIntensity = (dryness - 0.3) * (1.0 - p.hardness * 0.5);
      crackPattern *= Math.max(0, crackIntensity);
      crackPattern = Math.min(1, crackPattern * 1.5);
    }
    
    // Displacement - subtle grain texture plus cracks
    const displacement = grainTexture * 0.02 - crackPattern * p.crackDepth;
    const offset = new Vector3(0, displacement * normal.y, 0);
    
    // Color calculation based on moisture and layers
    let color: Vector3;
    
    // Base color with grain variation
    const colorVar = grainTexture * p.colorVariation;
    color = new Vector3(
      p.baseColor[0] * (1 + colorVar),
      p.baseColor[1] * (1 + colorVar),
      p.baseColor[2] * (1 + colorVar)
    );
    
    // Mix in secondary color based on position
    const secondaryMix = (grainNoise1 + 1) * 0.5 * 0.3;
    color = new Vector3(
      color.x * (1 - secondaryMix) + p.secondaryColor[0] * secondaryMix,
      color.y * (1 - secondaryMix) + p.secondaryColor[1] * secondaryMix,
      color.z * (1 - secondaryMix) + p.secondaryColor[2] * secondaryMix
    );
    
    // Apply stratification
    if (layerEffect > 0) {
      color = new Vector3(
        color.x * (1 - layerEffect) + p.secondaryColor[0] * layerEffect,
        color.y * (1 - layerEffect) + p.secondaryColor[1] * layerEffect,
        color.z * (1 - layerEffect) + p.secondaryColor[2] * layerEffect
      );
    }
    
    // Apply moisture-based darkening
    const wetDarkness = (1.0 - localMoisture) * 0.4;
    const moistColor = new Vector3(
      p.wetColor[0] * localMoisture + color.x * (1 - localMoisture * 0.6),
      p.wetColor[1] * localMoisture + color.y * (1 - localMoisture * 0.6),
      p.wetColor[2] * localMoisture + color.z * (1 - localMoisture * 0.6)
    );
    color = moistColor;
    
    // Apply dry color in cracked areas
    if (crackPattern > 0) {
      const dryMix = crackPattern * dryness;
      color = new Vector3(
        color.x * (1 - dryMix) + p.dryColor[0] * dryMix,
        color.y * (1 - dryMix) + p.dryColor[1] * dryMix,
        color.z * (1 - dryMix) + p.dryColor[2] * dryMix
      );
    }
    
    // Darken crack interiors
    if (crackPattern > 0.5) {
      const crackShadow = (crackPattern - 0.5) * 0.6;
      color = new Vector3(
        color.x * (1 - crackShadow),
        color.y * (1 - crackShadow),
        color.z * (1 - crackShadow)
      );
    }
    
    // Roughness - wet clay is smoother, dry/cracked is rougher
    const baseRoughness = 0.6 + dryness * 0.3;
    const roughness = baseRoughness + crackPattern * 0.2;
    
    // Metallic - clay is non-metallic
    const metallic = 0.0;
    
    // Normal perturbation for grain texture
    const normalDetail = noise3D(scaledPos.x * 0.8, 0, scaledPos.z * 0.8);
    const normalMap = new Vector3(
      normalDetail * 0.15,
      1.0,
      normalDetail * 0.15
    ).normalize();
    
    return {
      offset,
      displacement,
      color,
      roughness,
      metallic,
      normalMap,
    };
  }

  generateRandomParams(seed?: number): ClayParams {
    const rand = this.seededRandom(seed);
    return {
      scale: rand.range(5.0, 12.0),
      moisture: rand.range(0.1, 0.7),
      crackDensity: rand.range(0.5, 2.5),
      crackDepth: rand.range(0.02, 0.06),
      hardness: rand.range(0.3, 0.8),
      colorVariation: rand.range(0.1, 0.25),
      stratification: rand.range(0.1, 0.5),
      baseColor: [
        rand.range(0.55, 0.75),
        rand.range(0.35, 0.55),
        rand.range(0.25, 0.45),
      ],
      secondaryColor: [
        rand.range(0.45, 0.65),
        rand.range(0.3, 0.5),
        rand.range(0.2, 0.4),
      ],
      dryColor: [
        rand.range(0.65, 0.85),
        rand.range(0.45, 0.65),
        rand.range(0.35, 0.55),
      ],
      wetColor: [
        rand.range(0.25, 0.45),
        rand.range(0.15, 0.35),
        rand.range(0.1, 0.3),
      ],
    };
  }
}

// Auto-register the kernel
import { surfaceKernelRegistry } from './SurfaceKernel';
surfaceKernelRegistry.register('clay', ClaySurface);
