/**
 * Fabric Material Generator
 * Generates procedural fabric materials including cotton, linen, wool, velvet, denim
 * Woven pattern via canvas texture
 */

import { Color, Texture, CanvasTexture, MeshStandardMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface FabricParams {
  [key: string]: unknown;
  type: 'cotton' | 'linen' | 'wool' | 'velvet' | 'denim' | 'silk' | 'canvas';
  color: Color;
  weaveType: 'plain' | 'twill' | 'satin' | 'knit';
  weaveScale: number;
  roughness: number;
  fuzziness: number;
  patternType: 'none' | 'striped' | 'checkered' | 'floral' | 'paisley';
  patternScale: number;
  wearLevel: number;
  stainIntensity: number;
}

export class FabricGenerator extends BaseMaterialGenerator<FabricParams> {
  private static readonly DEFAULT_PARAMS: FabricParams = {
    type: 'cotton',
    color: new Color(0x888888),
    weaveType: 'plain',
    weaveScale: 1.0,
    roughness: 0.7,
    fuzziness: 0.2,
    patternType: 'none',
    patternScale: 1.0,
    wearLevel: 0.0,
    stainIntensity: 0.0,
  };

  constructor() { super(); }
  getDefaultParams(): FabricParams { return { ...FabricGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshStandardMaterial for fabric
   */
  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
      metalness: 0.0,
    });
  }

  generate(params: Partial<FabricParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(FabricGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    const material = this.createBaseMaterial();
    material.metalness = 0.0;
    material.color = finalParams.color;

    // Adjust roughness by fabric type
    switch (finalParams.type) {
      case 'silk':
        material.roughness = 0.3;
        break;
      case 'velvet':
        material.roughness = 0.9;
        break;
      case 'denim':
        material.roughness = 0.8;
        break;
      case 'wool':
        material.roughness = 0.85;
        break;
      case 'linen':
        material.roughness = 0.65;
        break;
      default:
        material.roughness = finalParams.roughness;
    }

    // Generate woven pattern texture
    const weaveTexture = this.generateWeavePattern(finalParams, rng);
    material.map = weaveTexture;

    // Add patterns on top of weave
    if (finalParams.patternType !== 'none') {
      this.applyPattern(material, finalParams, rng);
    }

    // Generate roughness map with noise variation
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);

    // Generate normal map for weave detail
    material.normalMap = this.generateNormalMap(finalParams, rng);

    // Wear increases roughness
    if (finalParams.wearLevel > 0) {
      material.roughness = Math.min(1.0, material.roughness + finalParams.wearLevel * 0.2);
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

  private generateWeavePattern(params: FabricParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return new CanvasTexture(canvas);

    const threadCount = Math.floor(20 * params.weaveScale);
    const threadSpacing = size / threadCount;

    // Fill background
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    // Draw weave based on type
    switch (params.weaveType) {
      case 'plain':
        this.drawPlainWeave(ctx, size, threadSpacing, params.color, rng);
        break;
      case 'twill':
        this.drawTwillWeave(ctx, size, threadSpacing, params.color, rng);
        break;
      case 'satin':
        this.drawSatinWeave(ctx, size, threadSpacing, params.color, rng);
        break;
      case 'knit':
        this.drawKnitWeave(ctx, size, threadSpacing, params.color, rng);
        break;
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private drawPlainWeave(ctx: CanvasRenderingContext2D, size: number, spacing: number, color: Color, rng: SeededRandom): void {
    for (let y = 0; y < size; y += spacing) {
      for (let x = 0; x < size; x += spacing) {
        const isWarp = (Math.floor(x / spacing) + Math.floor(y / spacing)) % 2 === 0;
        const brightness = isWarp ? 1.08 : 0.92;
        ctx.fillStyle = color.clone().multiplyScalar(brightness).getStyle();
        ctx.fillRect(x, y, spacing, spacing);
      }
    }
  }

  private drawTwillWeave(ctx: CanvasRenderingContext2D, size: number, spacing: number, color: Color, rng: SeededRandom): void {
    for (let y = 0; y < size; y += spacing) {
      for (let x = 0; x < size; x += spacing) {
        const offset = Math.floor(y / spacing);
        const isDiagonal = (Math.floor(x / spacing) + offset) % 4 < 2;
        const brightness = isDiagonal ? 1.05 : 0.95;
        ctx.fillStyle = color.clone().multiplyScalar(brightness).getStyle();
        ctx.fillRect(x, y, spacing, spacing);
      }
    }
  }

  private drawSatinWeave(ctx: CanvasRenderingContext2D, size: number, spacing: number, color: Color, rng: SeededRandom): void {
    // Satin has a smooth sheen with sparse interlocking
    ctx.fillStyle = color.clone().multiplyScalar(1.15).getStyle();
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < size; i += spacing * 2) {
      ctx.fillStyle = color.clone().multiplyScalar(0.9).getStyle();
      ctx.fillRect(i, 0, spacing / 2, size);
    }
  }

  private drawKnitWeave(ctx: CanvasRenderingContext2D, size: number, spacing: number, color: Color, rng: SeededRandom): void {
    for (let row = 0; row < size; row += spacing) {
      for (let col = 0; col < size; col += spacing / 2) {
        const x = col + (row % (spacing * 2) === 0 ? 0 : spacing / 4);
        ctx.beginPath();
        ctx.arc(x, row, spacing / 3, 0, Math.PI * 2);
        ctx.fillStyle = color.clone().multiplyScalar(1.0 + (rng.next() - 0.5) * 0.1).getStyle();
        ctx.fill();
      }
    }
  }

  private applyPattern(material: MeshStandardMaterial, params: FabricParams, rng: SeededRandom): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Copy existing texture
    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    }

    const patternColor = params.color.clone().multiplyScalar(0.7);

    switch (params.patternType) {
      case 'striped':
        this.drawStripes(ctx, size, patternColor, params.patternScale, rng);
        break;
      case 'checkered':
        this.drawCheckers(ctx, size, patternColor, params.patternScale, rng);
        break;
      case 'floral':
        this.drawFloral(ctx, size, patternColor, params.patternScale, rng);
        break;
      case 'paisley':
        this.drawPaisley(ctx, size, patternColor, params.patternScale, rng);
        break;
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    material.map = texture;
  }

  private drawStripes(ctx: CanvasRenderingContext2D, size: number, color: Color, scale: number, rng: SeededRandom): void {
    const stripeWidth = 50 / scale;
    ctx.fillStyle = color.getStyle();
    for (let i = 0; i < size; i += stripeWidth * 2) {
      ctx.fillRect(i, 0, stripeWidth, size);
    }
  }

  private drawCheckers(ctx: CanvasRenderingContext2D, size: number, color: Color, scale: number, rng: SeededRandom): void {
    const checkerSize = 60 / scale;
    ctx.fillStyle = color.getStyle();
    for (let row = 0; row < size; row += checkerSize) {
      for (let col = 0; col < size; col += checkerSize) {
        if ((Math.floor(row / checkerSize) + Math.floor(col / checkerSize)) % 2 === 0) {
          ctx.fillRect(col, row, checkerSize, checkerSize);
        }
      }
    }
  }

  private drawFloral(ctx: CanvasRenderingContext2D, size: number, color: Color, scale: number, rng: SeededRandom): void {
    const flowers = Math.floor(10 * scale);
    for (let i = 0; i < flowers; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const radius = 20 + rng.nextFloat() * 30;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color.getStyle();
      ctx.fill();
    }
  }

  private drawPaisley(ctx: CanvasRenderingContext2D, size: number, color: Color, scale: number, rng: SeededRandom): void {
    const shapes = Math.floor(8 * scale);
    for (let i = 0; i < shapes; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;

      ctx.beginPath();
      ctx.ellipse(x, y, 30, 50, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = color.getStyle();
      ctx.fill();
    }
  }

  private generateRoughnessMap(params: FabricParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return new CanvasTexture(canvas);

    const baseValue = Math.floor(params.roughness * 255);
    ctx.fillStyle = `rgb(${baseValue}, ${baseValue}, ${baseValue})`;
    ctx.fillRect(0, 0, size, size);

    // Add noise variation
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50, y / 50, 0) * 40;
        const value = Math.max(0, Math.min(255, baseValue + n));
        ctx.fillStyle = `rgb(${Math.floor(value)}, ${Math.floor(value)}, ${Math.floor(value)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalMap(params: FabricParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Weave-specific normal perturbation
    const noise = new Noise3D(rng.seed);
    const threadCount = Math.floor(20 * params.weaveScale);
    const threadSpacing = size / threadCount;

    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        // Thread crossing creates normal perturbation
        const threadX = (x % threadSpacing) / threadSpacing;
        const threadY = (y % threadSpacing) / threadSpacing;
        const nx = (threadX - 0.5) * 20;
        const ny = (threadY - 0.5) * 20;
        const n = noise.perlin(x / 30, y / 30, 0) * 8;
        const r = Math.max(0, Math.min(255, 128 + nx + n));
        const g = Math.max(0, Math.min(255, 128 + ny + n));
        ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, 255)`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    return new CanvasTexture(canvas);
  }

  getVariations(count: number): FabricParams[] {
    const variations: FabricParams[] = [];
    const types: FabricParams['type'][] = ['cotton', 'linen', 'wool', 'velvet', 'denim', 'silk', 'canvas'];
    const weaves: FabricParams['weaveType'][] = ['plain', 'twill', 'satin', 'knit'];
    const patterns: FabricParams['patternType'][] = ['none', 'striped', 'checkered', 'floral', 'paisley'];

    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat(), 0.5, 0.4 + this.rng.nextFloat() * 0.3),
        weaveType: weaves[this.rng.nextInt(0, weaves.length - 1)],
        weaveScale: 0.5 + this.rng.nextFloat() * 1.5,
        roughness: 0.5 + this.rng.nextFloat() * 0.4,
        fuzziness: this.rng.nextFloat() * 0.5,
        patternType: patterns[this.rng.nextInt(0, patterns.length - 1)],
        patternScale: 0.5 + this.rng.nextFloat() * 1.5,
        wearLevel: this.rng.nextFloat() * 0.4,
        stainIntensity: this.rng.nextFloat() * 0.3,
      });
    }

    return variations;
  }
}
