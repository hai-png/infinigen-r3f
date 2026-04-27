/**
 * Procedural Pattern Generator - Stripes, checks, dots, geometric, organic
 */
import { Texture, CanvasTexture, Color } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';

export interface PatternParams {
  type: 'stripes' | 'checkers' | 'dots' | 'geometric' | 'organic';
  color1: Color;
  color2: Color;
  scale: number;
  rotation: number;
  randomness: number;
}

export class PatternGenerator {
  generate(params: PatternParams, seed: number): Texture {
    const rng = new SeededRandom(seed);
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);
    
    // Apply rotation
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);
    ctx.translate(-size / 2, -size / 2);
    
    switch (params.type) {
      case 'stripes':
        this.drawStripes(ctx, size, params, rng);
        break;
      case 'checkers':
        this.drawCheckers(ctx, size, params, rng);
        break;
      case 'dots':
        this.drawDots(ctx, size, params, rng);
        break;
      case 'geometric':
        this.drawGeometric(ctx, size, params, rng);
        break;
      case 'organic':
        this.drawOrganic(ctx, size, params, rng);
        break;
    }
    
    return new CanvasTexture(canvas);
  }

  private drawStripes(ctx: CanvasRenderingContext2D, size: number, params: PatternParams, rng: SeededRandom): void {
    const stripeWidth = 50 * params.scale;
    for (let x = 0; x < size; x += stripeWidth * 2) {
      ctx.fillStyle = `#${params.color1.getHexString()}`;
      ctx.fillRect(x, 0, stripeWidth, size);
      ctx.fillStyle = `#${params.color2.getHexString()}`;
      ctx.fillRect(x + stripeWidth, 0, stripeWidth, size);
    }
  }

  private drawCheckers(ctx: CanvasRenderingContext2D, size: number, params: PatternParams, rng: SeededRandom): void {
    const checkerSize = 60 * params.scale;
    for (let y = 0; y < size; y += checkerSize) {
      for (let x = 0; x < size; x += checkerSize) {
        const isEven = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
        ctx.fillStyle = `#${isEven ? params.color1.getHexString() : params.color2.getHexString()}`;
        ctx.fillRect(x, y, checkerSize, checkerSize);
      }
    }
  }

  private drawDots(ctx: CanvasRenderingContext2D, size: number, params: PatternParams, rng: SeededRandom): void {
    ctx.fillStyle = `#${params.color1.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const dotSpacing = 80 * params.scale;
    const dotRadius = dotSpacing * 0.3;
    
    for (let y = 0; y < size; y += dotSpacing) {
      for (let x = 0; x < size; x += dotSpacing) {
        const offsetX = (rng.nextFloat() - 0.5) * params.randomness * dotSpacing;
        const offsetY = (rng.nextFloat() - 0.5) * params.randomness * dotSpacing;
        
        ctx.fillStyle = `#${params.color2.getHexString()}`;
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGeometric(ctx: CanvasRenderingContext2D, size: number, params: PatternParams, rng: SeededRandom): void {
    ctx.fillStyle = `#${params.color1.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const shapes = 20;
    const shapeSize = size / shapes;
    
    for (let row = 0; row < shapes; row++) {
      for (let col = 0; col < shapes; col++) {
        const x = col * shapeSize;
        const y = row * shapeSize;
        
        ctx.fillStyle = `#${(row + col) % 2 === 0 ? params.color1.getHexString() : params.color2.getHexString()}`;
        
        if ((row + col) % 3 === 0) {
          ctx.fillRect(x + 5, y + 5, shapeSize - 10, shapeSize - 10);
        } else {
          ctx.beginPath();
          ctx.arc(x + shapeSize / 2, y + shapeSize / 2, shapeSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawOrganic(ctx: CanvasRenderingContext2D, size: number, params: PatternParams, rng: SeededRandom): void {
    ctx.fillStyle = `#${params.color1.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    const blobs = 30;
    for (let i = 0; i < blobs; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const rx = 50 * params.scale * (0.5 + rng.nextFloat());
      const ry = 50 * params.scale * (0.5 + rng.nextFloat());
      
      ctx.fillStyle = `#${params.color2.getHexString()}`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng.nextFloat() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  getDefaultParams(): PatternParams {
    return {
      type: 'stripes',
      color1: new Color(0xffffff),
      color2: new Color(0x000000),
      scale: 1.0,
      rotation: 0,
      randomness: 0.2,
    };
  }
}
