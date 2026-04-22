/**
 * Chunky Rock Surface Kernel
 * Generates blocky, fractured rock formations
 * 
 * Based on original Infinigen chunky_rock surface implementation
 */

import { Vector3 } from 'three';
import { SurfaceKernel, SurfaceOutput, KernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

export interface ChunkyRockParams {
  scale: number;
  zscale: number;
  blockSize: number;
  fractureIntensity: number;
  weathering: number;
  roughness: number;
  metallic: number;
  colorBase: Vector3;
  colorWeathered: Vector3;
}

@KernelRegistry.register('chunky_rock')
export class ChunkyRockSurface extends SurfaceKernel<ChunkyRockParams> {
  protected defaultParams: ChunkyRockParams = {
    scale: 1.5,
    zscale: 0.8,
    blockSize: 0.3,
    fractureIntensity: 0.6,
    weathering: 0.4,
    roughness: 0.9,
    metallic: 0.1,
    colorBase: new Vector3(0.45, 0.42, 0.38),
    colorWeathered: new Vector3(0.55, 0.50, 0.45),
  };

  constructor(params?: Partial<ChunkyRockParams>) {
    super();
    this.params = { ...this.defaultParams, ...params };
  }

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const { 
      scale, zscale, blockSize, fractureIntensity,
      weathering, roughness, metallic,
      colorBase, colorWeathered 
    } = this.params;

    const output: SurfaceOutput = {
      offset: new Vector3(0, 0, 0),
      displacement: 0,
      color: colorBase.clone(),
      roughness,
      metallic,
      normalMap: new Vector3(0, 0, 1),
    };

    // Generate blocky structure using stepped noise
    const noiseScale = position.clone().multiplyScalar(scale);
    
    // Create block pattern with Voronoi cells
    const voronoi = voronoi2D(noiseScale.x, noiseScale.z, 1.0 / blockSize);
    const cellId = Math.floor(voronoi.cellX) + Math.floor(voronoi.cellZ) * 1000;
    
    // Pseudo-random offset per cell for blocky appearance
    const cellRandom = this.hash(cellId);
    const blockOffset = (cellRandom - 0.5) * 0.2;
    
    // Base displacement with block stepping
    const baseNoise = noise3D(noiseScale.x, noiseScale.y, noiseScale.z);
    const steppedNoise = Math.round(baseNoise / blockSize) * blockSize;
    
    // Add fracture lines at cell boundaries
    const distanceToEdge = Math.min(
      voronoi.distanceX,
      voronoi.distanceZ
    );
    const fractureFactor = Math.exp(-distanceToEdge * 20 * fractureIntensity);
    const fractureDisplacement = -fractureFactor * zscale * 0.5;
    
    // Combine displacements
    output.displacement = (steppedNoise + blockOffset) * zscale + fractureDisplacement;
    
    // Apply weathering to exposed surfaces
    const exposure = Math.max(0, normal.y);
    const weatheringFactor = weathering * exposure * (1 - fractureFactor);
    output.color.lerp(colorWeathered, weatheringFactor);
    
    // Add micro-roughness to fractured areas
    output.roughness += fractureFactor * 0.2;
    
    // Offset position along normal
    output.offset.copy(normal).multiplyScalar(output.displacement);

    return output;
  }

  private hash(n: number): number {
    const sinVal = Math.sin(n * 12.9898);
    return sinVal - Math.floor(sinVal);
  }
}
