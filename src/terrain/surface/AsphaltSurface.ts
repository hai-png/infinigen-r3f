/**
 * AsphaltSurface.ts
 * 
 * Road/pavement surface with aggregate texture and weathering
 * Inspired by common terrain surfaces in Infinigen
 * 
 * Features:
 * - Aggregate stone texture
 * - Tar/binder coloration
 * - Weathering and wear patterns
 * - Crack formation
 * - Oil stain variations
 */

import { SurfaceKernel, SurfaceOutput, SurfaceParams } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';
import { Vector3 } from 'three';

export interface AsphaltParams extends SurfaceParams {
  /** Base scale of aggregate stones */
  aggregateScale: number;
  /** Aggregate size variation */
  aggregateSize: number;
  /** Tar darkness [0-1] */
  tarDarkness: number;
  /** Weathering amount */
  weathering: number;
  /** Crack density */
  crackDensity: number;
  /** Crack width */
  crackWidth: number;
  /** Oil stain probability */
  oilStains: number;
  /** Surface roughness */
  roughness: number;
  /** Aggregate color [R, G, B] */
  aggregateColor: [number, number, number];
  /** Tar color [R, G, B] */
  tarColor: [number, number, number];
  /** Weathered color [R, G, B] */
  weatheredColor: [number, number, number];
}

export class AsphaltSurface extends SurfaceKernel<AsphaltParams> {
  name = 'asphalt';
  
  defaultParams: AsphaltParams = {
    aggregateScale: 15.0,
    aggregateSize: 0.3,
    tarDarkness: 0.7,
    weathering: 0.2,
    crackDensity: 0.5,
    crackWidth: 0.01,
    oilStains: 0.1,
    roughness: 0.85,
    aggregateColor: [0.5, 0.5, 0.55],
    tarColor: [0.15, 0.15, 0.18],
    weatheredColor: [0.6, 0.58, 0.55],
  };

  paramRanges = {
    aggregateScale: [5.0, 30.0],
    aggregateSize: [0.1, 0.6],
    tarDarkness: [0.4, 0.9],
    weathering: [0.0, 0.6],
    crackDensity: [0.0, 2.0],
    crackWidth: [0.002, 0.05],
    oilStains: [0.0, 0.4],
    roughness: [0.6, 0.95],
    aggregateColor: [[0, 0, 0], [1, 1, 1]],
    tarColor: [[0, 0, 0], [1, 1, 1]],
    weatheredColor: [[0, 0, 0], [1, 1, 1]],
  };

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const p = this.params;
    
    const scaledPos = new Vector3(
      position.x * p.aggregateScale,
      position.y * p.aggregateScale * 0.1,
      position.z * p.aggregateScale
    );
    
    // Generate aggregate stone pattern using Voronoi
    const voronoi = voronoi2D(scaledPos.x, scaledPos.z, 1.0);
    const cellId = Math.floor(voronoi * 100) / 100;
    
    // Individual stone sizes
    const stoneNoise = noise3D(scaledPos.x * 0.5, 0, scaledPos.z * 0.5);
    const stoneSize = p.aggregateSize * (0.5 + 0.5 * stoneNoise);
    
    // Determine if this is aggregate or tar binder
    const aggregateThreshold = 0.6 + cellId * 0.2;
    const isAggregate = voronoi > aggregateThreshold;
    
    // Create crack network
    let crackPattern = 0;
    if (p.crackDensity > 0) {
      const crackVoronoi = voronoi2D(
        position.x * p.crackDensity,
        position.z * p.crackDensity,
        1.0
      );
      // Thin cracks
      crackPattern = Math.pow(crackVoronoi, 0.3);
      crackPattern = 1.0 - crackPattern;
      crackPattern *= p.crackWidth * 10;
      crackPattern = Math.min(1, crackPattern);
    }
    
    // Weathering pattern
    const weatherNoise = noise3D(
      position.x * 0.2,
      position.y * 0.5,
      position.z * 0.2
    );
    const weatherAmount = (weatherNoise + 1) * 0.5 * p.weathering;
    
    // Oil stains
    let oilAmount = 0;
    if (p.oilStains > 0) {
      const oilNoise1 = noise3D(position.x * 0.3, 0, position.z * 0.3);
      const oilNoise2 = noise3D(position.x * 0.6, 0, position.z * 0.6) * 0.5;
      const oilPattern = (oilNoise1 + oilNoise2) / 1.5;
      oilAmount = Math.max(0, oilPattern) * p.oilStains;
    }
    
    // Displacement - aggregate protrudes slightly
    let displacement = 0;
    if (isAggregate) {
      displacement = stoneSize * 0.05;
    }
    
    // Add crack displacement
    displacement -= crackPattern * 0.02;
    
    // Subtle surface variation
    const surfaceNoise = noise3D(scaledPos.x * 0.3, 0, scaledPos.z * 0.3) * 0.01;
    displacement += surfaceNoise;
    
    const offset = new Vector3(0, displacement * normal.y, 0);
    
    // Color calculation
    let color: Vector3;
    
    if (isAggregate) {
      // Stone aggregate color with variation
      const stoneVar = cellId * 0.2;
      color = new Vector3(
        p.aggregateColor[0] * (1 + stoneVar),
        p.aggregateColor[1] * (1 + stoneVar),
        p.aggregateColor[2] * (1 + stoneVar)
      );
    } else {
      // Tar binder
      const tarVar = noise3D(scaledPos.x * 0.2, 0, scaledPos.z * 0.2) * 0.1;
      color = new Vector3(
        p.tarColor[0] * (1 - p.tarDarkness + tarVar),
        p.tarColor[1] * (1 - p.tarDarkness + tarVar),
        p.tarColor[2] * (1 - p.tarDarkness + tarVar)
      );
    }
    
    // Apply weathering
    if (weatherAmount > 0) {
      color = new Vector3(
        color.x * (1 - weatherAmount) + p.weatheredColor[0] * weatherAmount,
        color.y * (1 - weatherAmount) + p.weatheredColor[1] * weatherAmount,
        color.z * (1 - weatherAmount) + p.weatheredColor[2] * weatherAmount
      );
    }
    
    // Apply oil stains (darker, slightly iridescent)
    if (oilAmount > 0) {
      const oilDarkness = 0.3 + oilAmount * 0.5;
      color = new Vector3(
        color.x * (1 - oilAmount) + color.x * oilDarkness * oilAmount,
        color.y * (1 - oilAmount) + color.y * oilDarkness * oilAmount,
        color.z * (1 - oilAmount) + color.z * oilDarkness * oilAmount
      );
    }
    
    // Apply crack coloration (darker in cracks)
    if (crackPattern > 0) {
      const crackDarkness = 0.5;
      color = new Vector3(
        color.x * (1 - crackPattern) + color.x * crackDarkness * crackPattern,
        color.y * (1 - crackPattern) + color.y * crackDarkness * crackPattern,
        color.z * (1 - crackPattern) + color.z * crackDarkness * crackPattern
      );
    }
    
    // Roughness - aggregate is rougher than tar
    const baseRoughness = isAggregate ? p.roughness : p.roughness * 0.7;
    const roughness = baseRoughness * (1 - oilAmount * 0.5);
    
    // Metallic - minimal for asphalt
    const metallic = 0.0;
    
    // Normal perturbation for aggregate texture
    const normalNoise = noise3D(scaledPos.x * 0.5, 0, scaledPos.z * 0.5);
    const normalMap = new Vector3(
      normalNoise * 0.1,
      1.0,
      normalNoise * 0.1
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

  generateRandomParams(seed?: number): AsphaltParams {
    const rand = this.seededRandom(seed);
    return {
      aggregateScale: rand.range(10.0, 25.0),
      aggregateSize: rand.range(0.2, 0.5),
      tarDarkness: rand.range(0.5, 0.85),
      weathering: rand.range(0.0, 0.4),
      crackDensity: rand.range(0.0, 1.5),
      crackWidth: rand.range(0.005, 0.03),
      oilStains: rand.range(0.0, 0.3),
      roughness: rand.range(0.75, 0.95),
      aggregateColor: [
        rand.range(0.4, 0.6),
        rand.range(0.4, 0.6),
        rand.range(0.45, 0.65),
      ],
      tarColor: [
        rand.range(0.1, 0.2),
        rand.range(0.1, 0.2),
        rand.range(0.12, 0.22),
      ],
      weatheredColor: [
        rand.range(0.55, 0.7),
        rand.range(0.5, 0.65),
        rand.range(0.5, 0.6),
      ],
    };
  }
}

// Auto-register the kernel
import { surfaceKernelRegistry } from './SurfaceKernel';
surfaceKernelRegistry.register('asphalt', AsphaltSurface);
