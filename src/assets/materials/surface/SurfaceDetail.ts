/**
 * Microsurface Detail Generator - Bump, normal, displacement maps
 */
import { Texture, CanvasTexture } from 'three';
import { FixedSeed } from '../../../core/util/math/utils';
import { Noise3D } from '../../../core/util/math/noise';

export interface SurfaceParams {
  bumpScale: number;
  normalStrength: number;
  displacementScale: number;
  detailFrequency: number;
  detailAmplitude: number;
}

export class SurfaceDetailGenerator {
  generate(params: SurfaceParams, seed: number): { bumpMap: Texture; normalMap: Texture; displacementMap: Texture } {
    const rng = new FixedSeed(seed);
    
    return {
      bumpMap: this.generateBumpMap(params, rng),
      normalMap: this.generateNormalMap(params, rng),
      displacementMap: this.generateDisplacementMap(params, rng),
    };
  }

  private generateBumpMap(params: SurfaceParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin(x / 50 * params.detailFrequency, y / 50 * params.detailFrequency, 0);
        const value = 128 + n * params.detailAmplitude * params.bumpScale * 127;
        const v = Math.max(0, Math.min(255, value));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: SurfaceParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const nx = noise.perlin(x / 40, y / 40, 0) * params.normalStrength * 30;
        const ny = noise.perlin(x / 40, y / 40, 100) * params.normalStrength * 30;
        const r = 128 + nx;
        const g = 128 + ny;
        ctx.fillStyle = `rgb(${Math.max(0,Math.min(255,r))}, ${Math.max(0,Math.min(255,g))}, 255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateDisplacementMap(params: SurfaceParams, rng: FixedSeed): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 30 * params.detailFrequency, y / 30 * params.detailFrequency, 0);
        const value = 128 + n * params.displacementScale * 127;
        const v = Math.max(0, Math.min(255, value));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  getDefaultParams(): SurfaceParams {
    return {
      bumpScale: 0.5,
      normalStrength: 0.5,
      displacementScale: 0.1,
      detailFrequency: 1.0,
      detailAmplitude: 1.0,
    };
  }
}
