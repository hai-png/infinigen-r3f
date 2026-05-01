/**
 * Weathering Effects - Rust, oxidation, moss, water stains, UV damage, dirt/fading
 */
import { Texture, CanvasTexture, Color, RepeatWrapping } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
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
    const rng = new SeededRandom(seed);

    return {
      colorMap: this.generateColorWeathering(params, rng),
      roughnessMap: this.generateRoughnessWeathering(params, rng),
      normalMap: this.generateNormalWeathering(params, rng),
    };
  }

  private generateColorWeathering(params: WeatheringParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);

    // Add rust patches
    if (params.rustIntensity > 0) {
      for (let i = 0; i < params.rustIntensity * 100; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 10 + rng.nextFloat() * 40;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${180 + Math.floor(rng.nextFloat() * 40)}, ${60 + Math.floor(rng.nextFloat() * 40)}, 20, 0.8)`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Add moss patches
    if (params.mossCoverage > 0) {
      for (let i = 0; i < params.mossCoverage * 50; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 5 + rng.nextFloat() * 20;

        ctx.fillStyle = `rgba(${40 + Math.floor(rng.nextFloat() * 40)}, ${100 + Math.floor(rng.nextFloat() * 50)}, ${20 + Math.floor(rng.nextFloat() * 20)}, 0.6)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Add water stains (drip marks)
    if (params.waterStains > 0) {
      for (let i = 0; i < params.waterStains * 20; i++) {
        const x = rng.nextFloat() * size;
        const startY = rng.nextFloat() * size * 0.5;
        const length = 50 + rng.nextFloat() * 150;
        const width = 10 + rng.nextFloat() * 30;

        ctx.fillStyle = `rgba(${100 + Math.floor(rng.nextFloat() * 50)}, ${100 + Math.floor(rng.nextFloat() * 50)}, ${120 + Math.floor(rng.nextFloat() * 50)}, 0.4)`;
        ctx.beginPath();
        ctx.ellipse(x, startY + length / 2, width, length, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Add UV damage (fading/discoloration)
    if (params.uvDamage > 0) {
      const imgData = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = noise.perlin(x / 80, y / 80, 0);
          if (n > (1 - params.uvDamage * 2)) {
            const idx = (y * size + x) * 4;
            // UV fading desaturates and lightens
            const avg = (imgData.data[idx] + imgData.data[idx + 1] + imgData.data[idx + 2]) / 3;
            const fadeAmount = params.uvDamage * 0.4;
            imgData.data[idx] = Math.floor(imgData.data[idx] * (1 - fadeAmount) + avg * fadeAmount + 30 * fadeAmount);
            imgData.data[idx + 1] = Math.floor(imgData.data[idx + 1] * (1 - fadeAmount) + avg * fadeAmount + 25 * fadeAmount);
            imgData.data[idx + 2] = Math.floor(imgData.data[idx + 2] * (1 - fadeAmount) + avg * fadeAmount + 20 * fadeAmount);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Add dirt buildup in crevices
    if (params.dirtBuildup > 0) {
      const dirtNoise = new Noise3D(rng.seed + 77);
      const imgData = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const n = dirtNoise.perlin(x / 40, y / 40, 0);
          if (n > (1 - params.dirtBuildup * 1.5)) {
            const idx = (y * size + x) * 4;
            const dirtAmount = params.dirtBuildup * 0.5;
            imgData.data[idx] = Math.floor(imgData.data[idx] * (1 - dirtAmount) + 60 * dirtAmount);
            imgData.data[idx + 1] = Math.floor(imgData.data[idx + 1] * (1 - dirtAmount) + 45 * dirtAmount);
            imgData.data[idx + 2] = Math.floor(imgData.data[idx + 2] * (1 - dirtAmount) + 30 * dirtAmount);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateRoughnessWeathering(params: WeatheringParams, rng: SeededRandom): Texture {
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
        const variation = n * (params.rustIntensity + params.mossCoverage + params.dirtBuildup) * 50;
        const value = Math.max(50, Math.min(200, baseValue + variation));
        ctx.fillStyle = `rgb(${Math.floor(value)},${Math.floor(value)},${Math.floor(value)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalWeathering(params: WeatheringParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Add normal perturbation for weathering features
    const noise = new Noise3D(rng.seed);

    // Rust bumps
    if (params.rustIntensity > 0) {
      for (let i = 0; i < params.rustIntensity * 60; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 8 + rng.nextFloat() * 25;

        // Rust creates raised bumps
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, '#a0a0ff');
        gradient.addColorStop(0.5, '#9090ff');
        gradient.addColorStop(1, '#8080ff');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Moss creates softer bumps
    if (params.mossCoverage > 0) {
      for (let i = 0; i < params.mossCoverage * 30; i++) {
        const x = rng.nextFloat() * size;
        const y = rng.nextFloat() * size;
        const r = 5 + rng.nextFloat() * 15;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, '#9595ff');
        gradient.addColorStop(1, '#8080ff');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Water stain depressions
    if (params.waterStains > 0) {
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const n = noise.perlin(x / 60, y / 60, 0);
          if (n > 0.5) {
            const amount = (n - 0.5) * params.waterStains * 15;
            const r = Math.max(0, Math.min(255, 128 - amount));
            const g = Math.max(0, Math.min(255, 128 - amount));
            ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
            ctx.fillRect(x, y, 4, 4);
          }
        }
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
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
