/**
 * Cobblestone Surface Kernel
 * Generates cobblestone and gravel surfaces
 * 
 * Based on original Infinigen cobblestone surface implementation
 */

import { Vector3 } from 'three';
import { SurfaceKernel, SurfaceOutput, KernelRegistry } from './SurfaceKernel';
import { noise3D, voronoi2D } from '../../util/MathUtils';

export interface CobblestoneParams {
  scale: number;
  zscale: number;
  stoneSize: number;
  stoneVariation: number;
  groutWidth: number;
  groutDepth: number;
  roughness: number;
  colorStone: Vector3;
  colorGrout: Vector3;
  colorWeathered: Vector3;
}

@KernelRegistry.register('cobblestone')
export class CobblestoneSurface extends SurfaceKernel<CobblestoneParams> {
  protected defaultParams: CobblestoneParams = {
    scale: 4.0,
    zscale: 0.08,
    stoneSize: 0.15,
    stoneVariation: 0.3,
    groutWidth: 0.02,
    groutDepth: 0.03,
    roughness: 0.7,
    colorStone: new Vector3(0.50, 0.48, 0.45),
    colorGrout: new Vector3(0.35, 0.33, 0.30),
    colorWeathered: new Vector3(0.55, 0.53, 0.50),
  };

  constructor(params?: Partial<CobblestoneParams>) {
    super();
    this.params = { ...this.defaultParams, ...params };
  }

  evaluate(position: Vector3, normal: Vector3): SurfaceOutput {
    const { 
      scale, zscale, stoneSize, stoneVariation,
      groutWidth, groutDepth, roughness,
      colorStone, colorGrout, colorWeathered
    } = this.params;

    const output: SurfaceOutput = {
      offset: new Vector3(0, 0, 0),
      displacement: 0,
      color: colorStone.clone(),
      roughness,
      metallic: 0.0,
      normalMap: new Vector3(0, 0, 1),
    };

    const noiseScale = position.clone().multiplyScalar(scale);

    // Generate cobblestone pattern using Voronoi cells
    const voronoi = voronoi2D(noiseScale.x, noiseScale.z, 1.0 / stoneSize);
    
    // Distance to nearest cell edge (grout lines)
    const distanceToEdge = Math.min(voronoi.distanceX, voronoi.distanceZ);
    
    // Create individual stone variation
    const cellId = Math.floor(voronoi.cellX) + Math.floor(voronoi.cellZ) * 1000;
    const stoneRandom = this.hash(cellId);
    const stoneHeight = (stoneRandom - 0.5) * stoneVariation * zscale;
    
    // Grout line depth profile
    const groutSharpness = 3.0 / groutWidth;
    const groutFactor = Math.exp(-distanceToEdge * groutSharpness);
    const groutDisplacement = -groutFactor * groutDepth;
    
    // Combine stone height and grout depth
    output.displacement = stoneHeight + groutDisplacement;
    
    // Color stones differently based on cell ID
    const stoneColorVar = (stoneRandom - 0.5) * 0.15;
    output.color.r += stoneColorVar;
    output.color.g += stoneColorVar * 0.9;
    output.color.b += stoneColorVar * 0.8;
    
    // Grout is darker
    output.color.lerp(colorGrout, groutFactor * 0.7);
    
    // Weathering on exposed stone surfaces
    const exposure = Math.max(0, normal.y);
    const weatheringFactor = exposure * (1 - groutFactor) * 0.3;
    output.color.lerp(colorWeathered, weatheringFactor);
    
    // Roughness varies (grout is rougher)
    output.roughness = roughness + groutFactor * 0.25;
    
    // Add micro-roughness to stones
    const microNoise = noise3D(noiseScale.x * 20, noiseScale.y * 10, noiseScale.z * 20);
    output.displacement += microNoise * 0.02 * (1 - groutFactor);
    
    // Offset position along normal
    output.offset.copy(normal).multiplyScalar(output.displacement);

    return output;
  }

  private hash(n: number): number {
    const sinVal = Math.sin(n * 12.9898);
    return sinVal - Math.floor(sinVal);
  }
}
