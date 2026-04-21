/**
 * GrassSurface.ts
 * 
 * Grass-like surface with blade-like displacement patterns
 * Based on infinigen/assets/scatters/grass.py and terrain surface patterns
 * 
 * Features:
 * - Anisotropic blade-like displacement
 * - Wind-influenced orientation
 * - Multi-scale detail for grass clumps
 * - Color variation for natural appearance
 */

import { SurfaceKernel, SurfaceOutput, SurfaceParams } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';
import { Vector3 } from 'three';

export interface GrassParams extends SurfaceParams {
  /** Base scale of grass clumps */
  scale: number;
  /** Height multiplier for grass blades */
  height: number;
  /** Density of grass blades */
  density: number;
  /** Wind influence direction/strength */
  windStrength: number;
  /** Wind direction angle (radians) */
  windDirection: number;
  /** Variation in blade height */
  heightVariation: number;
  /** Blade width/thickness */
  bladeWidth: number;
  /** Clumping factor - higher = more clustered */
  clumpFactor: number;
  /** Color variation amplitude */
  colorVariation: number;
  /** Base grass color [R, G, B] */
  baseColor: [number, number, number];
  /** Secondary color for variation [R, G, B] */
  secondaryColor: [number, number, number];
}

export class GrassSurface extends SurfaceKernel<GrassParams> {
  name = 'grass';
  
  defaultParams: GrassParams = {
    scale: 0.5,
    height: 0.3,
    density: 1.0,
    windStrength: 0.2,
    windDirection: 0,
    heightVariation: 0.4,
    bladeWidth: 0.02,
    clumpFactor: 0.6,
    colorVariation: 0.15,
    baseColor: [0.2, 0.6, 0.1],
    secondaryColor: [0.3, 0.7, 0.2],
  };

  paramRanges = {
    scale: [0.1, 2.0],
    height: [0.05, 1.0],
    density: [0.1, 3.0],
    windStrength: [0.0, 1.0],
    windDirection: [0, Math.PI * 2],
    heightVariation: [0.0, 1.0],
    bladeWidth: [0.005, 0.1],
    clumpFactor: [0.0, 1.0],
    colorVariation: [0.0, 0.5],
    baseColor: [[0, 0, 0], [1, 1, 1]],
    secondaryColor: [[0, 0, 0], [1, 1, 1]],
  };

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const p = this.params;
    
    // Scale position for noise sampling
    const scaledPos = new Vector3(
      position.x * p.scale,
      position.y * p.scale,
      position.z * p.scale
    );
    
    // Generate clumping pattern using Voronoi
    const clumpNoise = voronoi2D(
      scaledPos.x,
      scaledPos.z,
      p.clumpFactor * 10
    );
    
    // Determine if this point should have grass based on density
    const densityThreshold = 1.0 - p.density;
    if (clumpNoise < densityThreshold) {
      return {
        offset: new Vector3(0, 0, 0),
        displacement: 0,
        color: new Vector3(...p.baseColor),
        roughness: 0.9,
        metallic: 0.0,
        normalMap: new Vector3(0, 0, 1),
      };
    }
    
    // Multi-scale noise for blade positioning
    const noise1 = noise3D(scaledPos.x, scaledPos.y * 0.1, scaledPos.z);
    const noise2 = noise3D(scaledPos.x * 2, scaledPos.y * 0.2, scaledPos.z * 2) * 0.5;
    const noise3 = noise3D(scaledPos.x * 4, scaledPos.y * 0.4, scaledPos.z * 4) * 0.25;
    const combinedNoise = (noise1 + noise2 + noise3) / 1.75;
    
    // Calculate blade height with variation
    const heightVar = 1.0 + (combinedNoise * p.heightVariation);
    const baseHeight = p.height * clumpNoise * heightVar;
    
    // Create anisotropic blade shape using directional noise
    const windDirX = Math.cos(p.windDirection);
    const windDirZ = Math.sin(p.windDirection);
    
    // Project position onto wind direction
    const windProjection = scaledPos.x * windDirX + scaledPos.z * windDirZ;
    const windPerp = -scaledPos.x * windDirZ + scaledPos.z * windDirX;
    
    // Blade profile - narrow at base, wider in middle, narrow at tip
    const bladeProfile = this.bladeProfile(combinedNoise);
    
    // Apply wind bending
    const windBend = p.windStrength * baseHeight * (combinedNoise + 0.5);
    const windOffsetX = windDirX * windBend;
    const windOffsetZ = windDirZ * windBend;
    
    // Calculate final displacement along normal
    const displacement = baseHeight * bladeProfile * p.bladeWidth;
    
    // Offset vector with wind influence
    const offset = new Vector3(
      windOffsetX * p.bladeWidth,
      displacement * normal.y, // Primarily vertical
      windOffsetZ * p.bladeWidth
    );
    
    // Color variation based on position and height
    const colorNoise = noise3D(
      scaledPos.x * 0.5,
      scaledPos.y * 0.5,
      scaledPos.z * 0.5
    );
    const colorMix = (colorNoise + 1) * 0.5 * p.colorVariation;
    
    const r = p.baseColor[0] * (1 - colorMix) + p.secondaryColor[0] * colorMix;
    const g = p.baseColor[1] * (1 - colorMix) + p.secondaryColor[1] * colorMix;
    const b = p.baseColor[2] * (1 - colorMix) + p.secondaryColor[2] * colorMix;
    
    // Roughness varies with height (tips are rougher)
    const roughness = 0.7 + 0.3 * combinedNoise;
    
    // Normal perturbation for blade orientation
    const normalTilt = new Vector3(
      -windDirX * p.windStrength * 0.5,
      1.0,
      -windDirZ * p.windStrength * 0.5
    ).normalize();
    
    return {
      offset,
      displacement,
      color: new Vector3(r, g, b),
      roughness,
      metallic: 0.0,
      normalMap: normalTilt,
    };
  }

  /**
   * Blade profile function - creates grass blade shape
   * Returns 0-1 value representing blade width at given height
   */
  private bladeProfile(t: number): number {
    // Normalize t to 0-1 range
    const normalized = (t + 1) * 0.5;
    
    // Grass blade is narrow at base, widens, then narrows at tip
    // Using polynomial curve for natural shape
    if (normalized < 0.1) {
      // Very narrow at base
      return normalized * 10 * 0.3;
    } else if (normalized < 0.7) {
      // Widens in lower section
      return 0.3 + (normalized - 0.1) * 1.0;
    } else {
      // Narrows toward tip
      return 1.0 - (normalized - 0.7) * 2.5;
    }
  }

  generateRandomParams(seed?: number): GrassParams {
    const rand = this.seededRandom(seed);
    return {
      scale: rand.range(0.3, 1.5),
      height: rand.range(0.15, 0.6),
      density: rand.range(0.5, 2.0),
      windStrength: rand.range(0.1, 0.5),
      windDirection: rand.range(0, Math.PI * 2),
      heightVariation: rand.range(0.2, 0.6),
      bladeWidth: rand.range(0.01, 0.05),
      clumpFactor: rand.range(0.4, 0.8),
      colorVariation: rand.range(0.1, 0.3),
      baseColor: [
        rand.range(0.1, 0.4),
        rand.range(0.4, 0.8),
        rand.range(0.1, 0.3),
      ],
      secondaryColor: [
        rand.range(0.2, 0.5),
        rand.range(0.5, 0.9),
        rand.range(0.1, 0.4),
      ],
    };
  }
}

// Auto-register the kernel
import { surfaceKernelRegistry } from './SurfaceKernel';
surfaceKernelRegistry.register('grass', GrassSurface);
