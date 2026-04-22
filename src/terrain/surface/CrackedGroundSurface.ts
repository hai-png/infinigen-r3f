/**
 * Cracked Ground Surface Kernel
 * Generates dried, cracked earth patterns
 * 
 * Based on original Infinigen cracked_ground surface implementation
 */

import { Vector3 } from 'three';
import { SurfaceKernel, SurfaceOutput, KernelRegistry } from './SurfaceKernel';
import { voronoi2D, noise3D } from '../../util/MathUtils';

export interface CrackedGroundParams {
  scale: number;
  crackDepth: number;
  crackWidth: number;
  crackDensity: number;
  moisture: number;
  roughness: number;
  colorBase: Vector3;
  colorCrack: Vector3;
  colorDry: Vector3;
}

@KernelRegistry.register('cracked_ground')
export class CrackedGroundSurface extends SurfaceKernel<CrackedGroundParams> {
  protected defaultParams: CrackedGroundParams = {
    scale: 3.0,
    crackDepth: 0.15,
    crackWidth: 0.02,
    crackDensity: 1.0,
    moisture: 0.3,
    roughness: 0.8,
    colorBase: new Vector3(0.55, 0.45, 0.35),
    colorCrack: new Vector3(0.25, 0.20, 0.15),
    colorDry: new Vector3(0.65, 0.55, 0.45),
  };

  constructor(params?: Partial<CrackedGroundParams>) {
    super();
    this.params = { ...this.defaultParams, ...params };
  }

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const { 
      scale, crackDepth, crackWidth, crackDensity,
      moisture, roughness,
      colorBase, colorCrack, colorDry
    } = this.params;

    const output: SurfaceOutput = {
      offset: new Vector3(0, 0, 0),
      displacement: 0,
      color: colorBase.clone(),
      roughness,
      metallic: 0.0,
      normalMap: new Vector3(0, 0, 1),
    };

    const noiseScale = position.clone().multiplyScalar(scale * crackDensity);

    // Generate crack pattern using Voronoi with multiple scales
    const voronoiLarge = voronoi2D(noiseScale.x, noiseScale.z, 1.0);
    const voronoiMedium = voronoi2D(noiseScale.x * 2.5, noiseScale.z * 2.5, 2.5);
    const voronoiSmall = voronoi2D(noiseScale.x * 6.0, noiseScale.z * 6.0, 6.0);

    // Combine Voronoi distances for multi-scale cracking
    const crackDistance = Math.min(
      voronoiLarge.distance,
      voronoiMedium.distance * 0.6,
      voronoiSmall.distance * 0.3
    );

    // Create crack depth profile (wider cracks are deeper)
    const crackSharpness = 2.0 / crackWidth;
    const crackFactor = Math.exp(-crackDistance * crackSharpness);
    
    // Primary crack displacement
    const primaryCrackDepth = crackFactor * crackDepth;

    // Add secondary micro-cracks
    const microCrackNoise = noise3D(noiseScale.x * 10, noiseScale.y * 0.1, noiseScale.z * 10);
    const microCracks = Math.max(0, microCrackNoise) * crackFactor * crackDepth * 0.3;

    // Total displacement (negative = depression)
    output.displacement = -(primaryCrackDepth + microCracks);

    // Color variation based on crack depth and moisture
    // Cracks are darker (shadowed)
    const crackColorFactor = crackFactor * (1 - moisture);
    output.color.lerp(colorCrack, crackColorFactor);

    // Dry areas between cracks are lighter
    const dryFactor = Math.exp(-crackDistance * 3.0) * moisture;
    if (dryFactor < 0.5) {
      output.color.lerp(colorDry, (0.5 - dryFactor) * 2.0 * (1 - crackFactor));
    }

    // Moisture affects overall color saturation
    output.color.lerp(new Vector3(0.3, 0.25, 0.2), moisture * 0.3);

    // Roughness increases in cracked areas
    output.roughness += crackFactor * 0.2;

    // Offset position along normal (downward into cracks)
    const offsetDir = normal.clone().lerp(new Vector3(0, -1, 0), 0.5);
    output.offset.copy(offsetDir).multiplyScalar(output.displacement);

    return output;
  }
}
