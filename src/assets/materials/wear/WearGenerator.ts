/**
 * Wear and Tear Generator - Scratches, scuffs, dents, edge wear
 */
import { Texture, CanvasTexture, Color } from 'three';
import { FixedSeed } from '../../../core/util/math/utils';
import { Noise3D } from '../../../core/util/math/noise';

export interface WearParams {
  scratchDensity: number;
  scratchLength: number;
  scratchDepth: number;
  scuffDensity: number;
  edgeWear: number;
  dentCount: number;
  dirtAccumulation: number;
}

export class WearGenerator {
  generateWearMap(params: WearParams, seed: number): { roughnessMap: Texture; normalMap: Texture; aoMap: Texture } {
    const rng = new FixedSeed(seed);
    
    return {
      roughnessMap: this.generateRoughnessWear(params, rng),
      normalMap: this.generateNormalWear(params, rng),
      aoMap: this.generateAOWear(params, rng),
    };
  }

  private generateRoughnessWear(params: WearParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    
    // Add scratches
    for (let i = 0; i < params.scratchDensity * 100; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const length = params.scratchLength * 50;
      const angle = rng.nextFloat() * Math.PI * 2;
      
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 1 + rng.nextFloat() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    
    // Add scuffs
    for (let i = 0; i < params.scuffDensity * 50; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const r = 5 + rng.nextFloat() * 15;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, '#606060');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return new CanvasTexture(canvas);
  }

  private generateNormalWear(params: WearParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    
    // Add dents
    for (let i = 0; i < params.dentCount; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const r = 10 + rng.nextFloat() * 30;
      
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, '#6060c0');
      gradient.addColorStop(1, '#8080ff');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return new CanvasTexture(canvas);
  }

  private generateAOWear(params: WearParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Add dirt in crevices
    if (params.dirtAccumulation > 0) {
      const noise = new Noise3D(rng.seed);
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const n = noise.perlin(x / 50, y / 50, 0);
          if (n > 0.7) {
            const value = 255 - Math.floor(n * params.dirtAccumulation * 100);
            ctx.fillStyle = `rgb(${value},${value},${value})`;
            ctx.fillRect(x, y, 4, 4);
          }
        }
      }
    }
    
    return new CanvasTexture(canvas);
  }

  getDefaultParams(): WearParams {
    return {
      scratchDensity: 0.3,
      scratchLength: 1.0,
      scratchDepth: 0.5,
      scuffDensity: 0.2,
      edgeWear: 0.3,
      dentCount: 5,
      dirtAccumulation: 0.2,
    };
  }
}
