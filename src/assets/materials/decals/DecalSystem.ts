/**
 * Decal Application System - Logo placement, labels, projected decals
 */
import { Texture, CanvasTexture, Color, Vector3 } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';

export interface DecalParams {
  type: 'logo' | 'label' | 'warning' | 'custom';
  color: Color;
  opacity: number;
  scale: Vector3;
  rotation: number;
  text?: string;
}

export interface DecalPlacement {
  position: Vector3;
  normal: Vector3;
  rotation: number;
  scale: number;
}

export class DecalSystem {
  generateDecal(params: DecalParams, seed: number): Texture {
    const rng = new SeededRandom(seed);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    switch (params.type) {
      case 'logo':
        this.drawLogo(ctx, size, params, rng);
        break;
      case 'label':
        this.drawLabel(ctx, size, params, rng);
        break;
      case 'warning':
        this.drawWarning(ctx, size, params, rng);
        break;
      case 'custom':
        this.drawCustom(ctx, size, params, rng);
        break;
    }

    return new CanvasTexture(canvas);
  }

  private drawLogo(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOGO', 0, 0);

    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Label background
    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    const w = size * 0.8;
    const h = size * 0.3;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Label border
    ctx.strokeStyle = `rgba(0, 0, 0, ${params.opacity * 0.5})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Label text
    ctx.fillStyle = '#000000';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(params.text || 'LABEL', 0, 0);

    ctx.restore();
  }

  private drawWarning(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Yellow triangle
    ctx.fillStyle = `rgba(255, 255, 0, ${params.opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${params.opacity})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.35);
    ctx.lineTo(size * 0.3, size * 0.3);
    ctx.lineTo(-size * 0.3, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Exclamation mark
    ctx.fillStyle = `rgba(0, 0, 0, ${params.opacity})`;
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 10);

    ctx.restore();
  }

  private drawCustom(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Custom decal: rounded rectangle with text
    const w = size * 0.7;
    const h = size * 0.5;
    const radius = 20;

    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + radius, -h / 2);
    ctx.lineTo(w / 2 - radius, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
    ctx.lineTo(w / 2, h / 2 - radius);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
    ctx.lineTo(-w / 2 + radius, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
    ctx.lineTo(-w / 2, -h / 2 + radius);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(params.text || 'CUSTOM', 0, 0);

    ctx.restore();
  }

  calculatePlacement(surfaceNormal: Vector3, offset: number, seed: number = 0): DecalPlacement {
    const rng = new SeededRandom(seed);
    return {
      position: surfaceNormal.clone().normalize().multiplyScalar(offset),
      normal: surfaceNormal.clone().normalize(),
      rotation: rng.nextFloat() * Math.PI * 2,
      scale: 1.0,
    };
  }

  getDefaultParams(): DecalParams {
    return {
      type: 'label',
      color: new Color(0xffffff),
      opacity: 0.9,
      scale: new Vector3(1, 1, 1),
      rotation: 0,
    };
  }
}
