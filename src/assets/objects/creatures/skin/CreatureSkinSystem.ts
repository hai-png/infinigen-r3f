/**
 * CreatureSkinSystem - Procedural skin/texture generation for creatures
 *
 * Supports:
 * - Shell-texture fur (builds on existing ShellTextureFur.ts)
 * - Scale patterns (overlapping, mosaic, ridge)
 * - Feather textures
 * - Smooth skin (with bump detail)
 * - Pattern generators: stripes, spots, rosettes, bands, gradient
 * - Color palettes per species (naturalistic: browns, greens, grays)
 * - Generates textures using createCanvas() from CanvasUtils
 */

import {
  MeshStandardMaterial,
  Color,
  CanvasTexture,
  RepeatWrapping,
  Vector3,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import type { BodyPlanType } from '../BodyPlanSystem';

// ── Skin Types ──────────────────────────────────────────────────────

export type SkinType = 'fur' | 'scales' | 'feathers' | 'smooth' | 'shell';
export type PatternType = 'solid' | 'stripes' | 'spots' | 'rosettes' | 'bands' | 'gradient';

export interface CreatureSkinConfig {
  skinType: SkinType;
  pattern: PatternType;
  primaryColor: Color;
  secondaryColor: Color;
  accentColor: Color;
  roughness: number;
  metalness: number;
  bumpStrength: number;
  patternScale: number;
  patternContrast: number;
  furLength?: number;       // For fur type
  furDensity?: number;      // For fur type
  scaleType?: 'overlapping' | 'mosaic' | 'ridge';
  textureResolution: number;
}

// ── Naturalistic Color Palettes ─────────────────────────────────────

export interface ColorPalette {
  name: string;
  primary: Color;
  secondary: Color;
  accent: Color;
}

const NATURAL_PALETTES: Record<string, ColorPalette[]> = {
  mammal: [
    { name: 'brown',      primary: new Color(0x8b7355), secondary: new Color(0xd2b48c), accent: new Color(0x5d4037) },
    { name: 'gray',       primary: new Color(0x696969), secondary: new Color(0xa9a9a9), accent: new Color(0x3d3d3d) },
    { name: 'reddish',    primary: new Color(0x8b4513), secondary: new Color(0xcd853f), accent: new Color(0x5c2e0e) },
    { name: 'tawny',      primary: new Color(0xd2a679), secondary: new Color(0xf5deb3), accent: new Color(0x8b6914) },
    { name: 'dark_brown', primary: new Color(0x3e2723), secondary: new Color(0x5d4037), accent: new Color(0x1a0e0a) },
  ],
  bird: [
    { name: 'drab',       primary: new Color(0x8b7355), secondary: new Color(0xd2b48c), accent: new Color(0xf5a623) },
    { name: 'tropical',   primary: new Color(0x228b22), secondary: new Color(0x32cd32), accent: new Color(0xff4500) },
    { name: 'waterfowl',  primary: new Color(0x2f4f4f), secondary: new Color(0x708090), accent: new Color(0x006400) },
    { name: 'raptor',     primary: new Color(0x2f1810), secondary: new Color(0x8b7355), accent: new Color(0xf5a623) },
  ],
  reptile: [
    { name: 'green',      primary: new Color(0x2e8b57), secondary: new Color(0x3cb371), accent: new Color(0x006400) },
    { name: 'brown',      primary: new Color(0x8b7355), secondary: new Color(0xa0522d), accent: new Color(0x5d4037) },
    { name: 'sand',       primary: new Color(0xc2b280), secondary: new Color(0xd2b48c), accent: new Color(0x8b7355) },
    { name: 'olive',      primary: new Color(0x556b2f), secondary: new Color(0x6b8e23), accent: new Color(0x2e4a1e) },
  ],
  fish: [
    { name: 'silver',     primary: new Color(0xc0c0c0), secondary: new Color(0xe8e8e8), accent: new Color(0x4682b4) },
    { name: 'tropical',   primary: new Color(0xff6347), secondary: new Color(0xffd700), accent: new Color(0x000080) },
    { name: 'deep',       primary: new Color(0x191970), secondary: new Color(0x2f4f4f), accent: new Color(0x00bfff) },
    { name: 'koi',        primary: new Color(0xff4500), secondary: new Color(0xffffff), accent: new Color(0x111111) },
  ],
  insect: [
    { name: 'black',      primary: new Color(0x1a1a1a), secondary: new Color(0x333333), accent: new Color(0x8b0000) },
    { name: 'green',      primary: new Color(0x228b22), secondary: new Color(0x32cd32), accent: new Color(0x000000) },
    { name: 'yellow',     primary: new Color(0xffd700), secondary: new Color(0xff8c00), accent: new Color(0x111111) },
    { name: 'iridescent', primary: new Color(0x4b0082), secondary: new Color(0x2e8b57), accent: new Color(0xff1493) },
  ],
  amphibian: [
    { name: 'green',      primary: new Color(0x2e8b57), secondary: new Color(0x90ee90), accent: new Color(0xffd700) },
    { name: 'brown',      primary: new Color(0x8b7355), secondary: new Color(0xa0522d), accent: new Color(0xffd700) },
    { name: 'red',        primary: new Color(0xcc3333), secondary: new Color(0xff6666), accent: new Color(0x111111) },
  ],
};

// ── CreatureSkinSystem ──────────────────────────────────────────────

export class CreatureSkinSystem {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a complete skin configuration for a creature
   */
  createSkinConfig(bodyPlanType: BodyPlanType, overrides?: Partial<CreatureSkinConfig>): CreatureSkinConfig {
    const paletteCategory = this.getPaletteCategory(bodyPlanType);
    const palette = this.rng.choice(NATURAL_PALETTES[paletteCategory] ?? NATURAL_PALETTES.mammal);

    const skinType = this.getDefaultSkinType(bodyPlanType);
    const pattern = this.getDefaultPattern(bodyPlanType);

    return {
      skinType,
      pattern,
      primaryColor: overrides?.primaryColor ?? palette.primary.clone(),
      secondaryColor: overrides?.secondaryColor ?? palette.secondary.clone(),
      accentColor: overrides?.accentColor ?? palette.accent.clone(),
      roughness: this.getDefaultRoughness(skinType),
      metalness: skinType === 'scales' ? 0.15 : 0.0,
      bumpStrength: this.rng.nextFloat(0.3, 0.8),
      patternScale: this.rng.nextFloat(4, 12),
      patternContrast: this.rng.nextFloat(0.3, 0.7),
      furLength: this.rng.nextFloat(0.02, 0.08),
      furDensity: this.rng.nextFloat(0.6, 0.9),
      scaleType: this.rng.choice(['overlapping', 'mosaic', 'ridge'] as const),
      textureResolution: 512,
      ...overrides,
    };
  }

  /**
   * Generate a MeshStandardMaterial with procedural textures.
   *
   * For fur skin type, always generates a diffuse texture (even for solid
   * pattern) to produce visible fur strand color variation rather than just
   * roughness changes. Non-fur types with solid pattern skip the diffuse
   * texture to avoid unnecessary overhead.
   */
  generateMaterial(config: CreatureSkinConfig): MeshStandardMaterial {
    const materialConfig: Record<string, any> = {
      color: config.primaryColor,
      roughness: config.roughness,
      metalness: config.metalness,
    };

    // Generate diffuse texture:
    // - Always for non-solid patterns
    // - Always for fur skin type (even solid) so fur strands are visible
    if (config.pattern !== 'solid' || config.skinType === 'fur') {
      const diffuseCanvas = this.generatePatternTexture(config);
      const diffuseTex = new CanvasTexture(diffuseCanvas);
      diffuseTex.wrapS = RepeatWrapping;
      diffuseTex.wrapT = RepeatWrapping;
      materialConfig.map = diffuseTex;
    }

    // Generate bump map for skin detail
    const bumpCanvas = this.generateBumpTexture(config);
    const bumpTex = new CanvasTexture(bumpCanvas);
    bumpTex.wrapS = RepeatWrapping;
    bumpTex.wrapT = RepeatWrapping;
    materialConfig.bumpMap = bumpTex;
    materialConfig.bumpScale = config.bumpStrength * 0.02;

    // Generate normal map from the bump/height data using Sobel filter
    // Normal maps provide superior lighting detail compared to bump maps
    const normalCanvas = this.generateNormalMapFromBump(bumpCanvas, config.bumpStrength);
    const normalTex = new CanvasTexture(normalCanvas);
    normalTex.wrapS = RepeatWrapping;
    normalTex.wrapT = RepeatWrapping;
    materialConfig.normalMap = normalTex;
    // When a normal map is present, reduce bump strength to avoid double-displacement
    materialConfig.bumpScale = config.bumpStrength * 0.005;

    return new MeshStandardMaterial(materialConfig);
  }

  /**
   * Get a random naturalistic palette for the given body plan type
   */
  getRandomPalette(bodyPlanType: BodyPlanType): ColorPalette {
    const category = this.getPaletteCategory(bodyPlanType);
    const palettes = NATURAL_PALETTES[category] ?? NATURAL_PALETTES.mammal;
    return this.rng.choice(palettes);
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private getPaletteCategory(type: BodyPlanType): string {
    switch (type) {
      case 'quadruped':  return 'mammal';
      case 'biped':      return 'mammal';
      case 'serpentine': return 'reptile';
      case 'avian':      return 'bird';
      case 'insectoid':  return 'insect';
      case 'aquatic':    return 'fish';
    }
  }

  private getDefaultSkinType(type: BodyPlanType): SkinType {
    switch (type) {
      case 'quadruped':  return 'fur';
      case 'biped':      return 'smooth';
      case 'serpentine': return 'scales';
      case 'avian':      return 'feathers';
      case 'insectoid':  return 'shell';
      case 'aquatic':    return 'scales';
    }
  }

  private getDefaultPattern(type: BodyPlanType): PatternType {
    switch (type) {
      case 'quadruped':  return this.rng.choice(['solid', 'stripes', 'spots', 'gradient'] as PatternType[]);
      case 'biped':      return 'solid';
      case 'serpentine': return this.rng.choice(['solid', 'bands', 'gradient'] as PatternType[]);
      case 'avian':      return this.rng.choice(['solid', 'stripes', 'spots'] as PatternType[]);
      case 'insectoid':  return 'solid';
      case 'aquatic':    return this.rng.choice(['solid', 'stripes', 'spots', 'gradient'] as PatternType[]);
    }
  }

  private getDefaultRoughness(skinType: SkinType): number {
    switch (skinType) {
      case 'fur':      return 0.85;
      case 'scales':   return 0.5;
      case 'feathers': return 0.65;
      case 'smooth':   return 0.3;
      case 'shell':    return 0.4;
    }
  }

  // ── Pattern Texture Generation ───────────────────────────────────

  private generatePatternTexture(config: CreatureSkinConfig): HTMLCanvasElement {
    const size = config.textureResolution;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with primary color
    const pr = Math.round(config.primaryColor.r * 255);
    const pg = Math.round(config.primaryColor.g * 255);
    const pb = Math.round(config.primaryColor.b * 255);
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.fillRect(0, 0, size, size);

    const sr = Math.round(config.secondaryColor.r * 255);
    const sg = Math.round(config.secondaryColor.g * 255);
    const sb = Math.round(config.secondaryColor.b * 255);

    const scale = config.patternScale;

    switch (config.pattern) {
      case 'stripes':
        this.drawStripes(ctx, size, scale, sr, sg, sb, config.patternContrast);
        break;
      case 'spots':
        this.drawSpots(ctx, size, scale, sr, sg, sb, config.patternContrast);
        break;
      case 'rosettes':
        this.drawRosettes(ctx, size, scale, sr, sg, sb, config.patternContrast);
        break;
      case 'bands':
        this.drawBands(ctx, size, scale, sr, sg, sb, config.patternContrast);
        break;
      case 'gradient':
        this.drawGradient(ctx, size, sr, sg, sb);
        break;
      case 'solid':
      default:
        // For fur skin type, add subtle strand color variation even on
        // "solid" pattern so the fur texture is visible, not just flat color
        if (config.skinType === 'fur') {
          this.drawFurColorVariation(ctx, size, config);
        }
        break;
    }

    return canvas;
  }

  private drawStripes(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    r: number, g: number, b: number,
    contrast: number,
  ): void {
    ctx.fillStyle = `rgba(${r},${g},${b},${contrast})`;
    const stripeWidth = size / scale;
    for (let i = 0; i < scale; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(0, i * stripeWidth, size, stripeWidth * 0.6);
      }
    }
  }

  private drawSpots(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    r: number, g: number, b: number,
    contrast: number,
  ): void {
    ctx.fillStyle = `rgba(${r},${g},${b},${contrast})`;
    const cellSize = size / scale;
    for (let x = 0; x < scale; x++) {
      for (let y = 0; y < scale; y++) {
        if (this.rng.boolean(0.4)) {
          const cx = x * cellSize + cellSize / 2;
          const cy = y * cellSize + cellSize / 2;
          const radius = cellSize * (0.2 + this.rng.next() * 0.3);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawRosettes(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    r: number, g: number, b: number,
    contrast: number,
  ): void {
    const cellSize = size / scale;
    for (let x = 0; x < scale; x++) {
      for (let y = 0; y < scale; y++) {
        if (this.rng.boolean(0.35)) {
          const cx = x * cellSize + cellSize / 2;
          const cy = y * cellSize + cellSize / 2;
          const outerR = cellSize * (0.25 + this.rng.next() * 0.2);
          const innerR = outerR * 0.5;

          // Outer ring
          ctx.strokeStyle = `rgba(${r},${g},${b},${contrast})`;
          ctx.lineWidth = outerR * 0.3;
          ctx.beginPath();
          ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
          ctx.stroke();

          // Inner spot (darker)
          ctx.fillStyle = `rgba(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)},${contrast})`;
          ctx.beginPath();
          ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawBands(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    r: number, g: number, b: number,
    contrast: number,
  ): void {
    ctx.fillStyle = `rgba(${r},${g},${b},${contrast})`;
    const bandWidth = size / scale;
    for (let i = 0; i < scale * 2; i++) {
      if (i % 2 === 0) {
        // Diagonal bands
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-size, (i - scale) * bandWidth, size * 2, bandWidth * 0.5);
        ctx.restore();
      }
    }
  }

  private drawGradient(
    ctx: CanvasRenderingContext2D,
    size: number,
    r: number, g: number, b: number,
  ): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0.1)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  /**
   * Draw subtle fur strand color variation for solid-pattern fur.
   * Adds fine directional color variation (darker roots, lighter tips)
   * and per-strand hue shift so that solid fur still looks like fur
   * rather than a flat colored surface.
   */
  private drawFurColorVariation(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: CreatureSkinConfig,
  ): void {
    const pr = Math.round(config.primaryColor.r * 255);
    const pg = Math.round(config.primaryColor.g * 255);
    const pb = Math.round(config.primaryColor.b * 255);
    const sr = Math.round(config.secondaryColor.r * 255);
    const sg = Math.round(config.secondaryColor.g * 255);
    const sb = Math.round(config.secondaryColor.b * 255);

    // Fur density controls how many strand groups are visible
    const density = config.furDensity ?? 0.75;
    const strandGroups = Math.round(density * 40);

    // Draw directional fur strand streaks (root → tip follows Y axis)
    for (let i = 0; i < strandGroups; i++) {
      const x = this.rng.next() * size;
      const y = this.rng.next() * size;
      const length = size * (0.02 + this.rng.next() * 0.06);
      const width = size * (0.003 + this.rng.next() * 0.006);

      // Slight color variation per strand (mix primary and secondary)
      const mix = this.rng.next() * 0.4;
      const cr = Math.round(pr * (1 - mix) + sr * mix);
      const cg = Math.round(pg * (1 - mix) + sg * mix);
      const cb = Math.round(pb * (1 - mix) + sb * mix);

      // Subtle alpha for natural blending
      const alpha = 0.15 + this.rng.next() * 0.2;

      // Root is slightly darker, tip slightly lighter
      const tipMix = 0.15;
      const tr = Math.min(255, Math.round(cr * (1 + tipMix)));
      const tg = Math.min(255, Math.round(cg * (1 + tipMix)));
      const tb = Math.min(255, Math.round(cb * (1 + tipMix)));

      const gradient = ctx.createLinearGradient(x, y, x, y + length);
      gradient.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
      gradient.addColorStop(1, `rgba(${tr},${tg},${tb},${alpha * 0.5})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x - width / 2, y, width, length);
    }

    // Add fine-grained per-pixel noise for strand-level color variation
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (this.rng.next() - 0.5) * 25;
      data[i]     = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // ── Bump Texture Generation ──────────────────────────────────────

  private generateBumpTexture(config: CreatureSkinConfig): HTMLCanvasElement {
    const size = Math.min(config.textureResolution, 256);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with neutral gray
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    switch (config.skinType) {
      case 'fur':
        this.drawFurBump(ctx, size, config.bumpStrength);
        break;
      case 'scales':
        this.drawScaleBump(ctx, size, config.bumpStrength, config.scaleType ?? 'overlapping');
        break;
      case 'feathers':
        this.drawFeatherBump(ctx, size, config.bumpStrength);
        break;
      case 'smooth':
        this.drawSmoothBump(ctx, size, config.bumpStrength);
        break;
      case 'shell':
        this.drawShellBump(ctx, size, config.bumpStrength);
        break;
    }

    return canvas;
  }

  private drawFurBump(ctx: CanvasRenderingContext2D, size: number, strength: number): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (this.rng.next() - 0.5) * strength * 80;
      const v = Math.max(0, Math.min(255, 128 + noise));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawScaleBump(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    scaleType: string,
  ): void {
    const scaleSize = size / 8;
    const offset = scaleSize * 0.5;

    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const x = col * scaleSize + (row % 2 === 0 ? 0 : offset);
        const y = row * scaleSize * 0.85;

        const v = Math.round(128 + strength * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();

        if (scaleType === 'overlapping') {
          ctx.ellipse(x, y, scaleSize * 0.5, scaleSize * 0.35, 0, 0, Math.PI * 2);
        } else if (scaleType === 'mosaic') {
          ctx.rect(x - scaleSize * 0.45, y - scaleSize * 0.35, scaleSize * 0.9, scaleSize * 0.7);
        } else {
          // Ridge
          ctx.moveTo(x - scaleSize * 0.5, y);
          ctx.lineTo(x, y - scaleSize * 0.35);
          ctx.lineTo(x + scaleSize * 0.5, y);
          ctx.lineTo(x, y + scaleSize * 0.35);
        }
        ctx.fill();

        // Highlight edge
        const edgeV = Math.round(128 - strength * 30);
        ctx.strokeStyle = `rgb(${edgeV},${edgeV},${edgeV})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private drawFeatherBump(ctx: CanvasRenderingContext2D, size: number, strength: number): void {
    const featherSize = size / 6;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const x = col * featherSize + (row % 2 === 0 ? 0 : featherSize * 0.3);
        const y = row * featherSize * 0.7;

        const v = Math.round(128 + strength * 25);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.ellipse(x, y, featherSize * 0.45, featherSize * 0.2, Math.PI * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Central rachis
        const rachisV = Math.round(128 + strength * 50);
        ctx.strokeStyle = `rgb(${rachisV},${rachisV},${rachisV})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - featherSize * 0.3, y);
        ctx.lineTo(x + featherSize * 0.3, y);
        ctx.stroke();
      }
    }
  }

  private drawSmoothBump(ctx: CanvasRenderingContext2D, size: number, strength: number): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (this.rng.next() - 0.5) * strength * 20;
      const v = Math.max(0, Math.min(255, 128 + noise));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawShellBump(ctx: CanvasRenderingContext2D, size: number, strength: number): void {
    const cellSize = size / 10;
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const x = col * cellSize;
        const y = row * cellSize;
        const v = Math.round(128 + (this.rng.next() - 0.5) * strength * 60);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      }
    }
  }

  // ── Normal Map Generation from Bump/Height Data ────────────────────

  /**
   * Generate a normal map from a bump/height canvas using a Sobel filter.
   *
   * The Sobel operator computes the gradient of the height field in X and Y,
   * producing a normal vector at each pixel. The normal is encoded as RGB
   * where R = (normal.x + 1) / 2, G = (normal.y + 1) / 2, B = (normal.z + 1) / 2.
   *
   * This provides much better per-pixel lighting than a bump map alone,
   * especially for detailed surface features like scales, fur, and feathers.
   *
   * @param bumpCanvas - The bump/height map canvas (grayscale values represent height)
   * @param strength - Controls the intensity of the normal perturbation
   */
  private generateNormalMapFromBump(bumpCanvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
    const width = bumpCanvas.width;
    const height = bumpCanvas.height;

    // Read the bump canvas pixel data (height field)
    const bumpCtx = bumpCanvas.getContext('2d')!;
    const bumpImageData = bumpCtx.getImageData(0, 0, width, height);
    const bumpData = bumpImageData.data;

    // Extract grayscale height values into a Float32Array
    const heightField = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      // Average RGB for grayscale (all channels should be equal for a bump map)
      heightField[i] = (bumpData[i * 4] + bumpData[i * 4 + 1] + bumpData[i * 4 + 2]) / (3.0 * 255.0);
    }

    // Create output normal map canvas
    const normalCanvas = createCanvas();
    normalCanvas.width = width;
    normalCanvas.height = height;
    const normalCtx = normalCanvas.getContext('2d')!;
    const normalImageData = normalCtx.createImageData(width, height);
    const normalData = normalImageData.data;

    // Sobel filter strength — scale the gradient by this factor to control
    // how pronounced the surface detail appears in the normal map
    const strengthScale = strength * 2.0;

    // Apply Sobel filter to compute normal vectors from the height field
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Sample 3x3 neighborhood with clamp-to-edge boundary handling
        const getPixel = (px: number, py: number): number => {
          const cx = Math.max(0, Math.min(width - 1, px));
          const cy = Math.max(0, Math.min(height - 1, py));
          return heightField[cy * width + cx];
        };

        // Sobel X kernel:
        //  -1  0  +1
        //  -2  0  +2
        //  -1  0  +1
        const sobelX =
          -1.0 * getPixel(x - 1, y - 1) + 1.0 * getPixel(x + 1, y - 1) +
          -2.0 * getPixel(x - 1, y)     + 2.0 * getPixel(x + 1, y) +
          -1.0 * getPixel(x - 1, y + 1) + 1.0 * getPixel(x + 1, y + 1);

        // Sobel Y kernel:
        //  -1  -2  -1
        //   0   0   0
        //  +1  +2  +1
        const sobelY =
          -1.0 * getPixel(x - 1, y - 1) - 2.0 * getPixel(x, y - 1) - 1.0 * getPixel(x + 1, y - 1) +
           1.0 * getPixel(x - 1, y + 1) + 2.0 * getPixel(x, y + 1) + 1.0 * getPixel(x + 1, y + 1);

        // Compute normal from the gradient:
        // The height field H has gradient (dH/dx, dH/dy).
        // The surface is defined as Z = H(x, y), so the normal is:
        //   N = normalize((-dH/dx, -dH/dy, 1))
        // We scale the gradient by strengthScale to control the bump intensity.
        const nx = -sobelX * strengthScale;
        const ny = -sobelY * strengthScale;
        const nz = 1.0;

        // Normalize the normal vector
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const nnx = nx / len;
        const nny = ny / len;
        const nnz = nz / len;

        // Encode normal to RGB: map from [-1, 1] to [0, 255]
        const idx = (y * width + x) * 4;
        normalData[idx]     = Math.round((nnx * 0.5 + 0.5) * 255); // R = normal.x
        normalData[idx + 1] = Math.round((nny * 0.5 + 0.5) * 255); // G = normal.y
        normalData[idx + 2] = Math.round((nnz * 0.5 + 0.5) * 255); // B = normal.z
        normalData[idx + 3] = 255; // A = fully opaque
      }
    }

    normalCtx.putImageData(normalImageData, 0, 0);
    return normalCanvas;
  }
}
