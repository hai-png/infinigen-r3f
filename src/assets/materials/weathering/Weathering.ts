/**
 * Weathering Effects - Rust, oxidation, moss, water stains, UV damage
 */
import { Texture, CanvasTexture, Color } from 'three';
import { FixedSeed } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface WeatheringParams {
  rustIntensity: number;
  mossCoverage: number;
  waterStains: number;
  uvDamage: number;
  dirtBuildup: number;
}

export class WeatheringGenerator {
  generate(params: WeatheringParams, seed: number): { colorMap: Texture; roughnessMap: Texture; normalMap: Texture } {
    const rng = new FixedSeed(seed);
    
    return {
      colorMap: this.generateColorWeathering(params, rng),
      roughnessMap: this.generateRoughnessWeathering(params, rng),
      normalMap: this.generateNormalWeathering(params, rng),
    };
  }

  private generateColorWeathering(params: WeatheringParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    
    // Add rust
    if (params.rustIntensity > 0) {
      for (let i = 0; i < params.rustIntensity * 100; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 10 + rng.nextFloat() * 40;
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${180 + rng.nextFloat()*40}, ${60 + rng.nextFloat()*40}, 20, 0.8)`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Add moss
    if (params.mossCoverage > 0) {
      for (let i = 0; i < params.mossCoverage * 50; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 5 + rng.nextFloat() * 20;
        
        ctx.fillStyle = `rgba(${40 + rng.nextFloat()*40}, ${100 + rng.nextFloat()*50}, ${20 + rng.nextFloat()*20}, 0.6)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Add water stains
    if (params.waterStains > 0) {
      for (let i = 0; i < params.waterStains * 20; i++) {
        const x = rng.nextFloat() * size;
        const startY = rng.nextFloat() * size * 0.5;
        const length = 50 + rng.nextFloat() * 150;
        const width = 10 + rng.nextFloat() * 30;
        
        ctx.fillStyle = `rgba(${100 + rng.nextFloat()*50}, ${100 + rng.nextFloat()*50}, ${120 + rng.nextFloat()*50}, 0.4)`;
        ctx.beginPath();
        ctx.ellipse(x, startY + length/2, width, length, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    return new CanvasTexture(canvas);
  }

  private generateRoughnessWeathering(params: WeatheringParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    const baseValue = 128;
    ctx.fillStyle = `rgb(${baseValue},${baseValue},${baseValue})`;
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50, y / 50, 0);
        const variation = n * (params.rustIntensity + params.mossCoverage) * 50;
        const value = Math.max(50, Math.min(200, baseValue + variation));
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    
    return new CanvasTexture(canvas);
  }

  private generateNormalWeathering(params: WeatheringParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    
    return new CanvasTexture(canvas);
  }

  getDefaultParams(): WeatheringParams {
    return {
      rustIntensity: 0.3,
      mossCoverage: 0.2,
      waterStains: 0.2,
      uvDamage: 0.1,
      dirtBuildup: 0.3,
    };
  }
}
