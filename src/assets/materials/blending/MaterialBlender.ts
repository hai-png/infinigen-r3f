/**
 * Material Blending System - Multi-material mixing, gradient blends, mask-based blending
 */
import { Material, Texture, CanvasTexture, Color } from 'three';
import { FixedSeed } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface BlendParams {
  material1: Material;
  material2: Material;
  blendFactor: number;
  blendType: 'linear' | 'gradient' | 'noise' | 'mask';
  noiseScale: number;
  gradientDirection: 'horizontal' | 'vertical' | 'radial';
}

export class MaterialBlender {
  blend(params: BlendParams, seed: number): { blendedMaterial: Material; blendMap: Texture } {
    const rng = new FixedSeed(seed);
    const blendMap = this.generateBlendMap(params, rng);
    
    // In a full implementation, we would create a shader material that blends the two materials
    // For now, we return the blend map which can be used in custom shaders
    return {
      blendedMaterial: params.material1,
      blendMap,
    };
  }

  private generateBlendMap(params: BlendParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    switch (params.blendType) {
      case 'linear':
        this.generateLinearBlend(ctx, size, params);
        break;
      case 'gradient':
        this.generateGradientBlend(ctx, size, params);
        break;
      case 'noise':
        this.generateNoiseBlend(ctx, size, params, rng);
        break;
      case 'mask':
        this.generateMaskBlend(ctx, size, params);
        break;
    }
    
    return new CanvasTexture(canvas);
  }

  private generateLinearBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(params.blendFactor, '#808080');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateGradientBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    let gradient: CanvasGradient;
    
    if (params.gradientDirection === 'vertical') {
      gradient = ctx.createLinearGradient(0, 0, 0, size);
    } else if (params.gradientDirection === 'radial') {
      gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    } else {
      gradient = ctx.createLinearGradient(0, 0, size, 0);
    }
    
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateNoiseBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams, rng: FixedSeed): void {
    const noise = new Noise3D(rng.seed);
    
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50 * params.noiseScale, y / 50 * params.noiseScale, 0);
        const value = Math.floor((n + 1) / 2 * 255);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  private generateMaskBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    
    // Draw circular mask
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size * params.blendFactor * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  getDefaultParams(material1: Material, material2: Material): BlendParams {
    return {
      material1,
      material2,
      blendFactor: 0.5,
      blendType: 'noise',
      noiseScale: 1.0,
      gradientDirection: 'horizontal',
    };
  }
}
