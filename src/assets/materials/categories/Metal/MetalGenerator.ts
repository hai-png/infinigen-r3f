/**
 * Metal Material Generator - Steel, aluminum, brass, copper, iron with patina/rust
 * Uses MeshStandardMaterial with high metalness
 */
import { Color, Texture, CanvasTexture, MeshStandardMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface MetalParams {
  [key: string]: unknown;
  type: 'steel' | 'aluminum' | 'brass' | 'copper' | 'iron' | 'gold' | 'silver';
  color: Color;
  roughness: number;
  metalness: number;
  oxidation: number;
  brushed: boolean;
  brushedDirection: number;
}

export class MetalGenerator extends BaseMaterialGenerator<MetalParams> {
  private static readonly DEFAULT_PARAMS: MetalParams = {
    type: 'steel',
    color: new Color(0x888888),
    roughness: 0.3,
    metalness: 1.0,
    oxidation: 0.0,
    brushed: false,
    brushedDirection: 0,
  };

  constructor() { super(); }
  getDefaultParams(): MetalParams { return { ...MetalGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshStandardMaterial with high metalness
   */
  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 1.0,
    });
  }

  generate(params: Partial<MetalParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(MetalGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial();

    material.metalness = finalParams.metalness;
    material.roughness = finalParams.roughness;
    material.color = finalParams.color;

    // Generate base metal color map with subtle variation
    material.map = this.generateMetalColorMap(finalParams, rng);

    if (finalParams.brushed) {
      material.normalMap = this.generateBrushedNormal(finalParams, rng);
    } else {
      material.normalMap = this.generateNormalMap(finalParams, rng);
    }

    // Apply oxidation / rust
    if (finalParams.oxidation > 0) {
      this.applyOxidation(material, finalParams, rng);
    }

    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);

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

  private generateMetalColorMap(params: MetalParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Fill base metal color
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    // Add subtle noise variation for metallic surface
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 60, y / 60, 0) * 15;
        const r = Math.max(0, Math.min(255, Math.floor(params.color.r * 255 + n)));
        const g = Math.max(0, Math.min(255, Math.floor(params.color.g * 255 + n)));
        const b = Math.max(0, Math.min(255, Math.floor(params.color.b * 255 + n)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateBrushedNormal(params: MetalParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Brushed metal has fine parallel lines
    const noise = new Noise3D(rng.seed);
    const dir = params.brushedDirection;
    const isVertical = Math.abs(Math.sin(dir)) > Math.abs(Math.cos(dir));

    for (let i = 0; i < size; i += 1) {
      const brightness = 128 + Math.sin(i / 3) * 8 + noise.perlin(i / 20, 0, 0) * 5;
      const r = Math.max(0, Math.min(255, Math.floor(isVertical ? 128 : brightness)));
      const g = Math.max(0, Math.min(255, Math.floor(isVertical ? brightness : 128)));
      ctx.fillStyle = `rgb(${r},${g},255)`;

      if (isVertical) {
        ctx.fillRect(i, 0, 1, size);
      } else {
        ctx.fillRect(0, i, size, 1);
      }
    }

    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: MetalParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Subtle normal variation for smooth metal
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 80, y / 80, 0) * 8;
        const r = Math.max(0, Math.min(255, Math.floor(128 + n)));
        const g = Math.max(0, Math.min(255, Math.floor(128 + n)));
        ctx.fillStyle = `rgb(${r},${g},255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    return new CanvasTexture(canvas);
  }

  private applyOxidation(material: MeshStandardMaterial, params: MetalParams, rng: SeededRandom): void {
    // Oxidation increases roughness
    material.roughness = Math.min(1.0, material.roughness + params.oxidation * 0.4);

    // Generate rust overlay on the color map
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Start with existing map or base color
    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = `#${params.color.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
    }

    // Paint rust patches using noise threshold
    const noise = new Noise3D(rng.seed + 42);
    const imgData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = noise.perlin(x / 40, y / 40, 0);
        if (n > (1 - params.oxidation * 2)) {
          const idx = (y * size + x) * 4;
          // Rust colors: reddish-brown
          const rustR = 140 + Math.floor(rng.nextFloat() * 60);
          const rustG = 50 + Math.floor(rng.nextFloat() * 30);
          const rustB = 10 + Math.floor(rng.nextFloat() * 20);
          const blendFactor = params.oxidation * 0.8;
          imgData.data[idx] = Math.floor(imgData.data[idx] * (1 - blendFactor) + rustR * blendFactor);
          imgData.data[idx + 1] = Math.floor(imgData.data[idx + 1] * (1 - blendFactor) + rustG * blendFactor);
          imgData.data[idx + 2] = Math.floor(imgData.data[idx + 2] * (1 - blendFactor) + rustB * blendFactor);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    material.map = texture;
  }

  private generateRoughnessMap(params: MetalParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const base = Math.floor(params.roughness * 255);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, size, size);

    // Add noise variation to roughness
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 40, y / 40, 0) * 20;
        const value = Math.max(0, Math.min(255, base + n));
        ctx.fillStyle = `rgb(${Math.floor(value)},${Math.floor(value)},${Math.floor(value)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    return new CanvasTexture(canvas);
  }

  getVariations(count: number): MetalParams[] {
    const variations: MetalParams[] = [];
    const types: MetalParams['type'][] = ['steel', 'aluminum', 'brass', 'copper', 'iron', 'gold', 'silver'];
    for (let i = 0; i < count; i++) {
      const type = types[this.rng.nextInt(0, types.length - 1)];
      let color = new Color(0x888888);
      if (type === 'brass') color = new Color(0xffd700);
      else if (type === 'copper') color = new Color(0xb87333);
      else if (type === 'gold') color = new Color(0xffd700);
      else if (type === 'silver') color = new Color(0xc0c0c0);
      else if (type === 'aluminum') color = new Color(0xd4d4d4);
      else if (type === 'iron') color = new Color(0x6e6e6e);

      variations.push({
        type,
        color,
        roughness: 0.1 + this.rng.nextFloat() * 0.4,
        metalness: 0.8 + this.rng.nextFloat() * 0.2,
        oxidation: this.rng.nextFloat() * 0.5,
        brushed: this.rng.nextFloat() > 0.5,
        brushedDirection: this.rng.nextFloat() * Math.PI,
      });
    }
    return variations;
  }
}
