/**
 * Leather Material Generator - Full-grain, top-grain, suede, distressed
 * Grain pattern via canvas texture
 */
import { Color, Texture, CanvasTexture, MeshStandardMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface LeatherParams {
  [key: string]: unknown;
  type: 'full-grain' | 'top-grain' | 'suede' | 'distressed' | 'patent';
  color: Color;
  roughness: number;
  grainIntensity: number;
  wearLevel: number;
  sheen: number;
}

export class LeatherGenerator extends BaseMaterialGenerator<LeatherParams> {
  private static readonly DEFAULT_PARAMS: LeatherParams = {
    type: 'full-grain',
    color: new Color(0x4a3728),
    roughness: 0.4,
    grainIntensity: 0.5,
    wearLevel: 0.0,
    sheen: 0.2,
  };

  constructor() { super(); }
  getDefaultParams(): LeatherParams { return { ...LeatherGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshStandardMaterial for leather
   * Patent leather uses clearcoat via MeshPhysicalMaterial, handled in generate()
   */
  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.4,
      metalness: 0.0,
    });
  }

  generate(params: Partial<LeatherParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(LeatherGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial();

    material.color = finalParams.color;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;

    // Type-specific adjustments
    if (finalParams.type === 'suede') {
      material.roughness = 0.8;
    } else if (finalParams.type === 'patent') {
      material.roughness = 0.1;
    } else if (finalParams.type === 'distressed') {
      material.roughness = 0.7;
    } else if (finalParams.type === 'top-grain') {
      material.roughness = 0.35;
    }

    // Generate procedural grain texture
    material.map = this.generateGrainTexture(finalParams, rng);
    material.normalMap = this.generateNormalMap(finalParams, rng);
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);

    // Apply wear
    if (finalParams.wearLevel > 0) {
      this.applyWear(material, finalParams, rng);
    }

    return {
      material,
      maps: {
        map: material.map,
        roughnessMap: material.roughnessMap,
        normalMap: material.normalMap,
      },
      params: finalParams,
    };
  }

  private generateGrainTexture(params: LeatherParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);

    if (params.type === 'suede') {
      // Suede has fine, uniform directional grain
      for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
          const n = noise.perlin(x / 15, y / 30, 0) * params.grainIntensity * 15;
          const r = Math.max(0, Math.min(255, Math.floor(params.color.r * 255 + n)));
          const g = Math.max(0, Math.min(255, Math.floor(params.color.g * 255 + n)));
          const b = Math.max(0, Math.min(255, Math.floor(params.color.b * 255 + n)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    } else {
      // Full-grain leather has organic cell-like grain pattern
      for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
          const n1 = noise.perlin(x / 20, y / 20, 0) * params.grainIntensity * 30;
          const n2 = noise.perlin(x / 8, y / 8, 10) * params.grainIntensity * 10;
          const n = n1 + n2;
          const r = Math.max(0, Math.min(255, Math.floor(params.color.r * 255 + n)));
          const g = Math.max(0, Math.min(255, Math.floor(params.color.g * 255 + n)));
          const b = Math.max(0, Math.min(255, Math.floor(params.color.b * 255 + n)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalMap(params: LeatherParams, rng: SeededRandom): Texture {
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
        const nx = noise.perlin(x / 25, y / 25, 0) * params.grainIntensity * 25;
        const ny = noise.perlin(x / 25, y / 25, 50) * params.grainIntensity * 25;
        const r = Math.max(0, Math.min(255, 128 + nx));
        const g = Math.max(0, Math.min(255, 128 + ny));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    return new CanvasTexture(canvas);
  }

  private generateRoughnessMap(params: LeatherParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const base = Math.floor(params.roughness * 255);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, size, size);

    // Add grain-based roughness variation
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 40, y / 40, 0) * 25;
        const value = Math.max(0, Math.min(255, base + n));
        ctx.fillStyle = `rgb(${Math.floor(value)},${Math.floor(value)},${Math.floor(value)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private applyWear(material: MeshStandardMaterial, params: LeatherParams, rng: SeededRandom): void {
    material.roughness = Math.min(1.0, material.roughness + params.wearLevel * 0.2);

    // Wear lightens the leather color at worn spots
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = `#${params.color.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
    }

    // Add worn spots (lighter areas)
    const noise = new Noise3D(rng.seed + 99);
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = noise.perlin(x / 30, y / 30, 0);
        if (n > (1 - params.wearLevel)) {
          const idx = (y * size + x) * 4;
          imgData.data[idx] = Math.min(255, imgData.data[idx] + 40);
          imgData.data[idx + 1] = Math.min(255, imgData.data[idx + 1] + 30);
          imgData.data[idx + 2] = Math.min(255, imgData.data[idx + 2] + 20);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    material.map = new CanvasTexture(canvas);
  }

  getVariations(count: number): LeatherParams[] {
    const variations: LeatherParams[] = [];
    const types: LeatherParams['type'][] = ['full-grain', 'top-grain', 'suede', 'distressed', 'patent'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(0.05 + this.rng.nextFloat() * 0.1, 0.4 + this.rng.nextFloat() * 0.3, 0.2 + this.rng.nextFloat() * 0.4),
        roughness: 0.2 + this.rng.nextFloat() * 0.5,
        grainIntensity: 0.3 + this.rng.nextFloat() * 0.5,
        wearLevel: this.rng.nextFloat() * 0.4,
        sheen: this.rng.nextFloat() * 0.4,
      });
    }
    return variations;
  }
}
