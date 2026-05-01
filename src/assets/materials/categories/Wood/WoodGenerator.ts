/**
 * Wood Material Generator - Hardwood, softwood, plywood, reclaimed
 * Procedural wood grain via canvas texture
 */
import { Color, Texture, CanvasTexture, MeshStandardMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface WoodParams {
  [key: string]: unknown;
  type: 'oak' | 'pine' | 'walnut' | 'mahogany' | 'plywood' | 'reclaimed';
  color: Color;
  grainIntensity: number;
  grainScale: number;
  roughness: number;
  knotDensity: number;
  finishType: 'matte' | 'satin' | 'gloss';
}

export class WoodGenerator extends BaseMaterialGenerator<WoodParams> {
  private static readonly DEFAULT_PARAMS: WoodParams = {
    type: 'oak',
    color: new Color(0x8b6f47),
    grainIntensity: 0.6,
    grainScale: 1.0,
    roughness: 0.5,
    knotDensity: 0.3,
    finishType: 'satin',
  };

  constructor() { super(); }
  getDefaultParams(): WoodParams { return { ...WoodGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshStandardMaterial for wood
   */
  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x8b6f47,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  generate(params: Partial<WoodParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(WoodGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial();

    material.color = finalParams.color;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;

    // Apply finish type to roughness
    if (finalParams.finishType === 'gloss') material.roughness = 0.15;
    else if (finalParams.finishType === 'matte') material.roughness = 0.7;

    // Generate procedural wood grain texture via canvas
    material.map = this.generateGrainTexture(finalParams, rng);
    material.normalMap = this.generateNormalMap(finalParams, rng);
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);

    // Plywood has layered grain
    if (finalParams.type === 'plywood') {
      material.map = this.generatePlywoodTexture(finalParams, rng);
    }

    // Reclaimed has extra wear
    if (finalParams.type === 'reclaimed') {
      material.roughness = Math.min(1.0, material.roughness + 0.15);
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

  private generateGrainTexture(params: WoodParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Fill base color
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);

    // Draw grain lines using perlin noise for organic warping
    for (let y = 0; y < size; y += 2) {
      const offset = noise.perlin(0, y / 50 * params.grainScale, 0) * 20 * params.grainIntensity;
      for (let x = 0; x < size; x += 2) {
        const grainX = x + offset;
        const n = noise.perlin(grainX / 100, y / 100, 0) * params.grainIntensity * 40;
        const r = Math.max(0, Math.min(255, Math.floor(params.color.r * 255 + n)));
        const g = Math.max(0, Math.min(255, Math.floor(params.color.g * 255 + n * 0.8)));
        const b = Math.max(0, Math.min(255, Math.floor(params.color.b * 255 + n * 0.6)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Add knots as darker radial spots
    if (params.knotDensity > 0) {
      const numKnots = Math.floor(params.knotDensity * 10);
      for (let i = 0; i < numKnots; i++) {
        const kx = rng.nextFloat() * size;
        const ky = rng.nextFloat() * size;
        const kr = 10 + rng.nextFloat() * 30;

        const gradient = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
        gradient.addColorStop(0, '#3d2817');
        gradient.addColorStop(0.6, '#5a3a20');
        gradient.addColorStop(1, `#${params.color.getHexString()}`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(kx, ky, kr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generatePlywoodTexture(params: WoodParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);
    const layerHeight = 20 + rng.nextFloat() * 30;

    // Draw alternating grain layers for plywood
    for (let y = 0; y < size; y += 2) {
      const layerIndex = Math.floor(y / layerHeight);
      const isAltLayer = layerIndex % 2 === 1;
      const grainDir = isAltLayer ? 1 : 0;

      for (let x = 0; x < size; x += 2) {
        const nx = grainDir ? y : x;
        const ny = grainDir ? x : y;
        const n = noise.perlin(nx / 80, ny / 80, layerIndex * 0.5) * params.grainIntensity * 25;
        const layerTint = isAltLayer ? 15 : -10;
        const r = Math.max(0, Math.min(255, Math.floor(params.color.r * 255 + n + layerTint)));
        const g = Math.max(0, Math.min(255, Math.floor(params.color.g * 255 + n * 0.8 + layerTint)));
        const b = Math.max(0, Math.min(255, Math.floor(params.color.b * 255 + n * 0.6 + layerTint)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalMap(params: WoodParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);
    // Normal map with grain direction perturbation
    for (let y = 0; y < size; y += 4) {
      const offset = noise.perlin(0, y / 50, 0) * 10;
      for (let x = 0; x < size; x += 4) {
        const nx = noise.perlin((x + offset) / 80, y / 80, 0);
        const ny = noise.perlin((x + offset) / 80, y / 80, 100);
        const r = Math.max(0, Math.min(255, 128 + nx * 25));
        const g = Math.max(0, Math.min(255, 128 + ny * 10));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  private generateRoughnessMap(params: WoodParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const baseValue = Math.floor(params.roughness * 255);
    ctx.fillStyle = `rgb(${baseValue},${baseValue},${baseValue})`;
    ctx.fillRect(0, 0, size, size);

    // Add grain-based roughness variation
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 100, y / 100, 0) * 30;
        const value = Math.max(0, Math.min(255, baseValue + n));
        ctx.fillStyle = `rgb(${Math.floor(value)},${Math.floor(value)},${Math.floor(value)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): WoodParams[] {
    const variations: WoodParams[] = [];
    const types: WoodParams['type'][] = ['oak', 'pine', 'walnut', 'mahogany', 'plywood', 'reclaimed'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(0.05 + this.rng.nextFloat() * 0.1, 0.4 + this.rng.nextFloat() * 0.3, 0.3 + this.rng.nextFloat() * 0.4),
        grainIntensity: 0.4 + this.rng.nextFloat() * 0.5,
        grainScale: 0.5 + this.rng.nextFloat() * 1.5,
        roughness: 0.3 + this.rng.nextFloat() * 0.4,
        knotDensity: this.rng.nextFloat() * 0.5,
        finishType: ['matte', 'satin', 'gloss'][this.rng.nextInt(0, 2)] as WoodParams['finishType'],
      });
    }
    return variations;
  }
}
