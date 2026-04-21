/**
 * LavaSurface.ts
 * 
 * Volcanic lava surface with flowing, glowing patterns
 * Based on infinigen/assets/materials/fluid/lava.py
 * 
 * Features:
 * - Animated flow patterns
 * - Temperature-based color gradients
 * - Crust formation with cracks
 * - Emissive glow effects
 * - Viscous flow displacement
 */

import { SurfaceKernel, SurfaceOutput, SurfaceParams } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';
import { Vector3 } from 'three';

export interface LavaParams extends SurfaceParams {
  /** Flow speed multiplier */
  flowSpeed: number;
  /** Base temperature (affects color) */
  baseTemperature: number;
  /** Temperature variation */
  temperatureVariation: number;
  /** Viscosity - higher = slower, thicker flow */
  viscosity: number;
  /** Crust formation factor */
  crustFactor: number;
  /** Crack density in crust */
  crackDensity: number;
  /** Crack width */
  crackWidth: number;
  /** Flow turbulence */
  turbulence: number;
  /** Flow direction angle (radians) */
  flowDirection: number;
  /** Emission intensity */
  emissionIntensity: number;
  /** Hot color [R, G, B] - brightest/ hottest areas */
  hotColor: [number, number, number];
  /** Warm color [R, G, B] - medium temperature */
  warmColor: [number, number, number];
  /** Cool color [R, G, B] - crust/cooler areas */
  coolColor: [number, number, number];
  /** Time offset for animation */
  timeOffset: number;
}

export class LavaSurface extends SurfaceKernel<LavaParams> {
  name = 'lava';
  
  defaultParams: LavaParams = {
    flowSpeed: 0.5,
    baseTemperature: 1200,
    temperatureVariation: 400,
    viscosity: 0.6,
    crustFactor: 0.3,
    crackDensity: 1.5,
    crackWidth: 0.02,
    turbulence: 0.8,
    flowDirection: 0,
    emissionIntensity: 2.0,
    hotColor: [1.0, 0.3, 0.0],
    warmColor: [0.8, 0.15, 0.0],
    coolColor: [0.1, 0.05, 0.05],
    timeOffset: 0,
  };

  paramRanges = {
    flowSpeed: [0.0, 2.0],
    baseTemperature: [800, 1500],
    temperatureVariation: [100, 600],
    viscosity: [0.1, 1.0],
    crustFactor: [0.0, 0.7],
    crackDensity: [0.5, 3.0],
    crackWidth: [0.005, 0.1],
    turbulence: [0.0, 2.0],
    flowDirection: [0, Math.PI * 2],
    emissionIntensity: [0.5, 5.0],
    hotColor: [[0, 0, 0], [1, 1, 1]],
    warmColor: [[0, 0, 0], [1, 1, 1]],
    coolColor: [[0, 0, 0], [1, 1, 1]],
    timeOffset: [0, 1000],
  };

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const p = this.params;
    
    // Animate flow over time
    const time = p.timeOffset;
    const flowDirX = Math.cos(p.flowDirection);
    const flowDirZ = Math.sin(p.flowDirection);
    
    // Advect position along flow direction
    const advectedX = position.x + flowDirX * p.flowSpeed * time * 0.01;
    const advectedZ = position.z + flowDirZ * p.flowSpeed * time * 0.01;
    
    const scaledPos = new Vector3(
      advectedX * 0.5,
      position.y * 0.1,
      advectedZ * 0.5
    );
    
    // Multi-scale turbulence for flow patterns
    const turb1 = noise3D(scaledPos.x, scaledPos.y, scaledPos.z) * 1.0;
    const turb2 = noise3D(scaledPos.x * 2, scaledPos.y * 2, scaledPos.z * 2) * 0.5;
    const turb3 = noise3D(scaledPos.x * 4, scaledPos.y * 4, scaledPos.z * 4) * 0.25;
    const turbulence = (turb1 + turb2 * p.turbulence + turb3 * p.turbulence) / 1.75;
    
    // Create flow bands using directional noise
    const flowProjection = advectedX * flowDirX + advectedZ * flowDirZ;
    const flowBands = Math.sin(flowProjection * 2 + turbulence * 4) * 0.5 + 0.5;
    
    // Temperature distribution based on flow patterns
    const tempNoise = noise3D(
      scaledPos.x * 0.3,
      scaledPos.y * 0.3,
      scaledPos.z * 0.3
    );
    const temperature = p.baseTemperature + 
      (tempNoise + turbulence) * p.temperatureVariation * flowBands;
    
    // Crust formation - cooler areas form solid crust
    const crustThreshold = (p.baseTemperature - 200) / 1500;
    const normalizedTemp = (temperature - 800) / 1000;
    const isCrust = normalizedTemp < crustThreshold * p.crustFactor;
    
    // Generate crack patterns in crust using Voronoi
    let crackPattern = 0;
    if (isCrust && p.crustFactor > 0) {
      crackPattern = voronoi2D(
        advectedX * p.crackDensity,
        advectedZ * p.crackDensity,
        1.0
      );
      // Sharpen cracks
      crackPattern = Math.pow(crackPattern, 0.5);
    }
    
    // Displacement - viscous bulging in hot areas, flat crust
    let displacement = 0;
    let offset = new Vector3(0, 0, 0);
    
    if (!isCrust || crackPattern < 1.0 - p.crackWidth) {
      // Hot lava bulges and flows
      const bulge = (normalizedTemp * 0.3 + turbulence * 0.2) * (1 - p.crustFactor);
      displacement = bulge;
      
      // Flow offset along direction
      const flowOffset = p.flowSpeed * 0.1 * (1 - p.viscosity);
      offset = new Vector3(
        flowDirX * flowOffset,
        bulge * 0.5,
        flowDirZ * flowOffset
      );
    } else {
      // Crust is relatively flat with slight crack displacement
      displacement = -crackPattern * p.crackWidth * 0.1;
    }
    
    // Color based on temperature (blackbody-like gradient)
    let color: Vector3;
    if (isCrust && crackPattern >= 1.0 - p.crackWidth) {
      // Glowing cracks in crust
      const crackGlow = (crackPattern - (1.0 - p.crackWidth)) / p.crackWidth;
      color = this.mixColors(p.coolColor, p.hotColor, crackGlow * 0.8);
    } else {
      // Temperature-based color gradient
      const tempT = Math.max(0, Math.min(1, (temperature - 800) / 700));
      
      if (tempT < 0.5) {
        // Cool to warm transition
        const t = tempT * 2;
        color = this.mixColors(p.coolColor, p.warmColor, t);
      } else {
        // Warm to hot transition
        const t = (tempT - 0.5) * 2;
        color = this.mixColors(p.warmColor, p.hotColor, t);
      }
      
      // Add turbulence-based variation
      const varAmount = turbulence * 0.15;
      color = new Vector3(
        color.x * (1 + varAmount),
        color.y * (1 + varAmount),
        color.z * (1 + varAmount)
      );
    }
    
    // Roughness - crust is rougher, liquid lava is smoother
    const roughness = isCrust ? 0.9 - crackPattern * 0.3 : 0.2 + turbulence * 0.2;
    
    // Metallic - lava has slight metallic sheen when hot
    const metallic = isCrust ? 0.0 : 0.3 * normalizedTemp;
    
    // Normal perturbation for flow direction
    const normalTilt = new Vector3(
      flowDirX * turbulence * 0.3,
      1.0,
      flowDirZ * turbulence * 0.3
    ).normalize();
    
    return {
      offset,
      displacement,
      color,
      roughness,
      metallic,
      normalMap: normalTilt,
    };
  }

  private mixColors(c1: [number, number, number], c2: [number, number, number], t: number): Vector3 {
    return new Vector3(
      c1[0] * (1 - t) + c2[0] * t,
      c1[1] * (1 - t) + c2[1] * t,
      c1[2] * (1 - t) + c2[2] * t
    );
  }

  generateRandomParams(seed?: number): LavaParams {
    const rand = this.seededRandom(seed);
    return {
      flowSpeed: rand.range(0.2, 1.5),
      baseTemperature: rand.range(1000, 1400),
      temperatureVariation: rand.range(200, 500),
      viscosity: rand.range(0.3, 0.9),
      crustFactor: rand.range(0.1, 0.5),
      crackDensity: rand.range(1.0, 2.5),
      crackWidth: rand.range(0.01, 0.05),
      turbulence: rand.range(0.5, 1.5),
      flowDirection: rand.range(0, Math.PI * 2),
      emissionIntensity: rand.range(1.5, 3.5),
      hotColor: [
        rand.range(0.8, 1.0),
        rand.range(0.1, 0.4),
        rand.range(0.0, 0.2),
      ],
      warmColor: [
        rand.range(0.6, 0.9),
        rand.range(0.1, 0.3),
        rand.range(0.0, 0.1),
      ],
      coolColor: [
        rand.range(0.05, 0.2),
        rand.range(0.02, 0.1),
        rand.range(0.02, 0.1),
      ],
      timeOffset: rand.range(0, 100),
    };
  }
}

// Auto-register the kernel
import { surfaceKernelRegistry } from './SurfaceKernel';
surfaceKernelRegistry.register('lava', LavaSurface);
