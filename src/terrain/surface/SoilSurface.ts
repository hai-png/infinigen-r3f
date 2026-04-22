/**
 * Soil Surface Kernel
 * Generates natural soil with organic variation
 * 
 * Based on original Infinigen soil surface implementation
 */

import { Vector3 } from 'three';
import { SurfaceKernel, SurfaceOutput, KernelRegistry } from './SurfaceKernel';
import { noise3D } from '../../util/MathUtils';

export interface SoilParams {
  scale: number;
  zscale: number;
  organicMatter: number;
  compaction: number;
  roughness: number;
  colorTopsoil: Vector3;
  colorSubsoil: Vector3;
  colorClay: Vector3;
}

@KernelRegistry.register('soil')
export class SoilSurface extends SurfaceKernel<SoilParams> {
  protected defaultParams: SoilParams = {
    scale: 2.5,
    zscale: 0.1,
    organicMatter: 0.6,
    compaction: 0.4,
    roughness: 0.9,
    colorTopsoil: new Vector3(0.25, 0.20, 0.15),
    colorSubsoil: new Vector3(0.45, 0.35, 0.25),
    colorClay: new Vector3(0.55, 0.40, 0.30),
  };

  constructor(params?: Partial<SoilParams>) {
    super();
    this.params = { ...this.defaultParams, ...params };
  }

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const { 
      scale, zscale, organicMatter, compaction,
      roughness, colorTopsoil, colorSubsoil, colorClay
    } = this.params;

    const output: SurfaceOutput = {
      offset: new Vector3(0, 0, 0),
      displacement: 0,
      color: colorTopsoil.clone(),
      roughness,
      metallic: 0.0,
      normalMap: new Vector3(0, 0, 1),
    };

    const noiseScale = position.clone().multiplyScalar(scale);

    // Generate soil texture with multiple scales of noise
    const baseNoise = noise3D(noiseScale.x, noiseScale.y * 0.5, noiseScale.z);
    const detailNoise = noise3D(noiseScale.x * 4, noiseScale.y * 2, noiseScale.z * 4) * 0.25;
    const microNoise = noise3D(noiseScale.x * 12, noiseScale.y * 6, noiseScale.z * 12) * 0.1;

    // Combine noise for natural soil variation
    const combinedNoise = baseNoise + detailNoise + microNoise;
    
    // Displacement based on soil clumping
    output.displacement = combinedNoise * zscale * (1 - compaction);

    // Color layering based on depth (simulated by y-position and noise)
    const depthFactor = Math.max(0, -position.y * 0.1);
    const organicGradient = organicMatter * Math.exp(-depthFactor * 3);
    
    // Base color is topsoil with organic matter
    output.color.copy(colorTopsoil);
    
    // Transition to subsoil with depth
    if (depthFactor > 0.2) {
      const subsoilFactor = Math.min(1, (depthFactor - 0.2) * 2);
      output.color.lerp(colorSubsoil, subsoilFactor * (1 - organicGradient));
    }
    
    // Clay patches in compacted areas
    if (compaction > 0.5) {
      const clayNoise = noise3D(noiseScale.x * 0.8, noiseScale.y * 0.3, noiseScale.z * 0.8);
      const clayFactor = Math.max(0, clayNoise) * compaction * 0.4;
      output.color.lerp(colorClay, clayFactor);
    }

    // Organic matter darkens the soil
    const darknessFactor = organicMatter * 0.3;
    output.color.multiplyScalar(1 - darknessFactor);

    // Roughness varies with compaction (more compacted = smoother)
    output.roughness = roughness * (1 - compaction * 0.3);

    // Add small clumps and aggregates
    const clumpNoise = noise3D(noiseScale.x * 6, noiseScale.y * 3, noiseScale.z * 6);
    const clumpFactor = Math.max(0, clumpNoise) * 0.05;
    output.displacement += clumpFactor * zscale;

    // Offset position along normal
    output.offset.copy(normal).multiplyScalar(output.displacement);

    return output;
  }
}
