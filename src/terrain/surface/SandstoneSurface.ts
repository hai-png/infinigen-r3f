/**
 * Sandstone Surface Kernel
 * Generates layered sedimentary rock with erosion patterns
 * 
 * Based on original Infinigen sandstone surface implementation
 */

import { Vector3 } from 'three';
import { SurfaceKernel, SurfaceOutput, KernelRegistry } from './SurfaceKernel';
import { noise3D } from '../../util/MathUtils';

export interface SandstoneParams {
  scale: number;
  zscale: number;
  layerThickness: number;
  layerVariation: number;
  erosionDepth: number;
  windErosion: number;
  roughness: number;
  metallic: number;
  colorBase: Vector3;
  colorLayer: Vector3;
  colorEroded: Vector3;
}

@KernelRegistry.register('sandstone')
export class SandstoneSurface extends SurfaceKernel<SandstoneParams> {
  protected defaultParams: SandstoneParams = {
    scale: 2.0,
    zscale: 0.5,
    layerThickness: 0.15,
    layerVariation: 0.3,
    erosionDepth: 0.4,
    windErosion: 0.2,
    roughness: 0.7,
    metallic: 0.0,
    colorBase: new Vector3(0.76, 0.70, 0.58),
    colorLayer: new Vector3(0.65, 0.58, 0.48),
    colorEroded: new Vector3(0.82, 0.76, 0.68),
  };

  constructor(params?: Partial<SandstoneParams>) {
    super();
    this.params = { ...this.defaultParams, ...params };
  }

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const { 
      scale, zscale, layerThickness, layerVariation,
      erosionDepth, windErosion, roughness, metallic,
      colorBase, colorLayer, colorEroded
    } = this.params;

    const output: SurfaceOutput = {
      offset: new Vector3(0, 0, 0),
      displacement: 0,
      color: colorBase.clone(),
      roughness,
      metallic,
      normalMap: new Vector3(0, 0, 1),
    };

    const noiseScale = position.clone().multiplyScalar(scale);

    // Generate sedimentary layers
    const layerNoise = noise3D(noiseScale.x * 0.5, noiseScale.y * 2.0, noiseScale.z * 0.5);
    const layerHeight = position.y + layerNoise * layerVariation;
    const layerPhase = (layerHeight / layerThickness) % 1.0;
    
    // Create layered appearance with color variation
    const layerFactor = Math.sin(layerPhase * Math.PI * 2) * 0.5 + 0.5;
    output.color.lerp(colorLayer, layerFactor * 0.6);

    // Base displacement from layered noise
    const baseDisplacement = layerNoise * zscale * 0.5;

    // Add differential erosion (softer layers erode faster)
    const erosionResistance = 0.5 + 0.5 * Math.cos(layerPhase * Math.PI * 4);
    const erodedDisplacement = -erosionDepth * (1 - erosionResistance) * zscale;

    // Wind erosion on exposed surfaces (creates hoodoos and fins)
    const exposure = Math.max(0, normal.y);
    const slope = 1.0 - Math.abs(normal.y);
    const windEffect = windErosion * slope * exposure;
    const windDisplacement = -windEffect * zscale * 0.3;

    // Combine all displacement components
    output.displacement = baseDisplacement + erodedDisplacement + windDisplacement;

    // Color weathering on eroded areas
    const erosionFactor = Math.max(0, -erodedDisplacement / (erosionDepth * zscale));
    output.color.lerp(colorEroded, erosionFactor * 0.4);

    // Add surface roughness variation based on layers
    output.roughness += layerFactor * 0.15;

    // Offset position along normal
    output.offset.copy(normal).multiplyScalar(output.displacement);

    return output;
  }
}
