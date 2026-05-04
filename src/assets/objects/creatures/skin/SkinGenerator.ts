/**
 * SkinGenerator - Procedural skin generation system for creatures
 *
 * Generates procedural skin textures with species-appropriate patterns
 * and produces complete PBR material sets. Supports five skin types
 * (scales, fur, feathers, chitin, smooth) with canvas-based texture
 * generation for albedo, normal, roughness, and metallic maps.
 *
 * Key features:
 * - Five skin types: scales, fur, feathers, chitin, smooth
 * - Pattern generators: solid, spotted, striped, mottled, gradient, countershading
 * - Canvas-based PBR texture set: albedo, normal, roughness, metallic
 * - Age-based skin variation (wrinkles, spots, color changes)
 * - Shell texture fur integration for mammal fur rendering
 * - Scale patterns: overlapping semicircle rows with ridged normal maps
 * - Deterministic generation via SeededRandom
 * - Integrates with MaterialPipeline for advanced material composition
 */

import * as THREE from 'three';
import { SeededRandom, seededNoise2D, seededFbm } from '@/core/util/MathUtils';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import {
  ShellTextureFurConfig,
  ShellTextureFurRenderer,
  createFurConfig,
  DEFAULT_FUR_CONFIG,
} from '../../../materials/categories/Fur/ShellTextureFur';

// ── Type Definitions ──────────────────────────────────────────────────

/**
 * Skin type classification based on species characteristics.
 */
export type SkinType = 'scales' | 'fur' | 'feathers' | 'chitin' | 'smooth';

/**
 * Pattern type for skin coloration.
 */
export type PatternType = 'solid' | 'spotted' | 'striped' | 'mottled' | 'gradient' | 'countershading';

/**
 * Scale sub-type for reptile and fish skin.
 */
export type ScaleSubType = 'overlapping' | 'mosaic' | 'ridge' | 'diamond' | 'granular';

/**
 * Parameters for skin generation.
 */
export interface SkinParams {
  /** Species identifier, e.g. "feline_tiger" */
  species: string;
  /** Primary skin type */
  skinType: SkinType;
  /** Color pattern type */
  pattern: PatternType;
  /** Base color (RGB 0-1) */
  primaryColor: THREE.Color;
  /** Secondary color for patterns */
  secondaryColor: THREE.Color;
  /** Accent color for highlights */
  accentColor: THREE.Color;
  /** Age factor: 0 = juvenile, 1 = elderly (default 0.3) */
  age: number;
  /** Roughness override (default depends on skin type) */
  roughness?: number;
  /** Metallic override (default depends on skin type) */
  metallic?: number;
  /** Pattern scale factor (default 8) */
  patternScale?: number;
  /** Pattern contrast 0-1 (default 0.5) */
  patternContrast?: number;
  /** Texture resolution in pixels (default 512) */
  textureResolution?: number;
  /** Scale sub-type for scale skin */
  scaleSubType?: ScaleSubType;
  /** Fur length for fur skin type (default 0.05) */
  furLength?: number;
  /** Fur density 0-1 (default 0.8) */
  furDensity?: number;
  /** Normal map strength (default 1.0) */
  normalStrength?: number;
  /** Seed for deterministic generation */
  seed?: number;
}

/**
 * Result of skin generation containing PBR textures and material.
 */
export interface SkinResult {
  /** The configured MeshStandardMaterial with all texture maps */
  material: THREE.MeshStandardMaterial;
  /** PBR albedo (diffuse) texture */
  albedoMap: THREE.CanvasTexture;
  /** Normal map texture */
  normalMap: THREE.CanvasTexture;
  /** Roughness map texture */
  roughnessMap: THREE.CanvasTexture;
  /** Metallic map texture */
  metallicMap: THREE.CanvasTexture;
  /** Optional fur renderer for fur skin type */
  furRenderer?: ShellTextureFurRenderer;
  /** The parameters used for generation */
  params: SkinParams;
}

// ── Default Parameters ────────────────────────────────────────────────

const DEFAULT_SKIN_PARAMS: Partial<SkinParams> = {
  age: 0.3,
  patternScale: 8,
  patternContrast: 0.5,
  textureResolution: 512,
  scaleSubType: 'overlapping',
  furLength: 0.05,
  furDensity: 0.8,
  normalStrength: 1.0,
  seed: 42,
};

// ── Species-to-Skin Mapping ───────────────────────────────────────────

/**
 * Resolve default skin type for a species.
 */
function speciesToSkinType(species: string): SkinType {
  if (species.startsWith('feline') || species.startsWith('canine') || species.startsWith('herbivore') || species.startsWith('carnivore')) return 'fur';
  if (species.startsWith('bird')) return 'feathers';
  if (species.startsWith('fish')) return 'scales';
  if (species.startsWith('insect') || species.startsWith('arthropod')) return 'chitin';
  if (species.startsWith('reptile') || species.startsWith('snake') || species.startsWith('lizard') || species.startsWith('crocodile')) return 'scales';
  if (species.startsWith('amphibian') || species.startsWith('frog') || species.startsWith('salamander')) return 'smooth';
  return 'fur';
}

/**
 * Resolve default pattern for a species.
 */
function speciesToPattern(species: string): PatternType {
  if (species.includes('tiger') || species.includes('zebra')) return 'striped';
  if (species.includes('cheetah') || species.includes('leopard') || species.includes('giraffe')) return 'spotted';
  if (species.includes('cow') || species.includes('horse')) return 'mottled';
  if (species.includes('shark') || species.includes('dolphin') || species.includes('penguin')) return 'countershading';
  return 'solid';
}

/**
 * Resolve default colors for a species.
 */
function speciesToColors(species: string): { primary: THREE.Color; secondary: THREE.Color; accent: THREE.Color } {
  if (species.startsWith('feline')) {
    return { primary: new THREE.Color(0x8b7355), secondary: new THREE.Color(0xd2b48c), accent: new THREE.Color(0x5d4037) };
  }
  if (species.startsWith('bird')) {
    return { primary: new THREE.Color(0x8b7355), secondary: new THREE.Color(0xd2b48c), accent: new THREE.Color(0xf5a623) };
  }
  if (species.startsWith('fish')) {
    return { primary: new THREE.Color(0xc0c0c0), secondary: new THREE.Color(0xe8e8e8), accent: new THREE.Color(0x4682b4) };
  }
  if (species.startsWith('insect')) {
    return { primary: new THREE.Color(0x1a1a1a), secondary: new THREE.Color(0x333333), accent: new THREE.Color(0x8b0000) };
  }
  if (species.startsWith('reptile')) {
    return { primary: new THREE.Color(0x2e8b57), secondary: new THREE.Color(0x3cb371), accent: new THREE.Color(0x006400) };
  }
  if (species.startsWith('amphibian')) {
    return { primary: new THREE.Color(0x2e8b57), secondary: new THREE.Color(0x90ee90), accent: new THREE.Color(0xffd700) };
  }
  return { primary: new THREE.Color(0x8b7355), secondary: new THREE.Color(0xd2b48c), accent: new THREE.Color(0x5d4037) };
}

/**
 * Get default roughness for a skin type.
 */
function getDefaultRoughness(skinType: SkinType): number {
  switch (skinType) {
    case 'fur':      return 0.85;
    case 'scales':   return 0.5;
    case 'feathers': return 0.65;
    case 'chitin':   return 0.4;
    case 'smooth':   return 0.3;
  }
}

/**
 * Get default metallic for a skin type.
 */
function getDefaultMetallic(skinType: SkinType): number {
  switch (skinType) {
    case 'fur':      return 0.0;
    case 'scales':   return 0.15;
    case 'feathers': return 0.05;
    case 'chitin':   return 0.2;
    case 'smooth':   return 0.0;
  }
}

// ── SkinGenerator Class ───────────────────────────────────────────────

/**
 * Generates procedural skin textures and PBR materials for creatures.
 *
 * Usage:
 * ```ts
 * const generator = new SkinGenerator(42);
 * const result = generator.generateSkin('feline_tiger', {
 *   species: 'feline_tiger',
 *   skinType: 'fur',
 *   pattern: 'striped',
 *   primaryColor: new THREE.Color(0x8b7355),
 *   secondaryColor: new THREE.Color(0x222222),
 *   accentColor: new THREE.Color(0xd2b48c),
 * });
 * const mesh = new THREE.Mesh(geometry, result.material);
 * ```
 */
export class SkinGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a procedural skin for the given species and parameters.
   *
   * Produces a full PBR texture set (albedo, normal, roughness, metallic)
   * and a configured MeshStandardMaterial. For fur skin type, also
   * generates a ShellTextureFurRenderer.
   *
   * @param species - Species identifier
   * @param params - Skin generation parameters
   * @returns SkinResult with material, textures, and optional fur renderer
   */
  generateSkin(species: string, params: SkinParams): SkinResult {
    // Merge with defaults
    const resolved: SkinParams = {
      ...DEFAULT_SKIN_PARAMS,
      ...params,
      species,
    };

    const size = resolved.textureResolution!;
    const rng = new SeededRandom(resolved.seed ?? 42);

    // Generate PBR texture set
    const albedoCanvas = this.generateAlbedoMap(resolved, rng);
    const normalCanvas = this.generateNormalMap(resolved, rng);
    const roughnessCanvas = this.generateRoughnessMap(resolved, rng);
    const metallicCanvas = this.generateMetallicMap(resolved, rng);

    // Create Three.js textures
    const albedoMap = this.createCanvasTexture(albedoCanvas);
    const normalMap = this.createCanvasTexture(normalCanvas);
    const roughnessMap = this.createCanvasTexture(roughnessCanvas);
    const metallicMap = this.createCanvasTexture(metallicCanvas);

    // Configure wrap mode for seamless tiling
    [albedoMap, normalMap, roughnessMap, metallicMap].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
    });

    // Create material
    const roughness = resolved.roughness ?? getDefaultRoughness(resolved.skinType);
    const metallic = resolved.metallic ?? getDefaultMetallic(resolved.skinType);

    const material = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(resolved.normalStrength!, resolved.normalStrength!),
      roughnessMap: roughnessMap,
      roughness,
      metalnessMap: metallicMap,
      metalness: metallic,
      side: THREE.DoubleSide,
    });

    // Generate fur renderer if needed
    let furRenderer: ShellTextureFurRenderer | undefined;
    if (resolved.skinType === 'fur') {
      const furConfig = createFurConfig({
        furLength: resolved.furLength,
        furDensity: resolved.furDensity,
        furColor: resolved.primaryColor,
        tipColor: resolved.accentColor,
        undercoatColor: resolved.secondaryColor,
        seed: resolved.seed,
      });
      furRenderer = new ShellTextureFurRenderer(furConfig);
    }

    return {
      material,
      albedoMap,
      normalMap,
      roughnessMap,
      metallicMap,
      furRenderer,
      params: resolved,
    };
  }

  /**
   * Generate skin with automatic species-appropriate defaults.
   * Infers skin type, pattern, and colors from the species name.
   *
   * @param species - Species identifier
   * @param overrides - Optional parameter overrides
   * @returns SkinResult with generated skin
   */
  generateSkinFromSpecies(
    species: string,
    overrides?: Partial<SkinParams>,
  ): SkinResult {
    const skinType = speciesToSkinType(species);
    const pattern = speciesToPattern(species);
    const colors = speciesToColors(species);

    const params: SkinParams = {
      species,
      skinType,
      pattern,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      accentColor: colors.accent,
      age: 0.3,
      roughness: getDefaultRoughness(skinType),
      metallic: getDefaultMetallic(skinType),
      patternScale: 8,
      patternContrast: 0.5,
      textureResolution: 512,
      scaleSubType: 'overlapping',
      furLength: 0.05,
      furDensity: 0.8,
      normalStrength: 1.0,
      seed: 42,
      ...overrides,
    };

    return this.generateSkin(species, params);
  }

  // ── Albedo Map Generation ───────────────────────────────────────────

  /**
   * Generate the albedo (diffuse color) texture.
   */
  private generateAlbedoMap(params: SkinParams, rng: SeededRandom): HTMLCanvasElement {
    const size = params.textureResolution!;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with primary color
    this.fillWithColor(ctx, size, params.primaryColor);

    // Apply pattern
    const scale = params.patternScale!;
    const contrast = params.patternContrast!;

    switch (params.pattern) {
      case 'solid':
        // No additional pattern
        break;
      case 'spotted':
        this.drawSpotsPattern(ctx, size, scale, params.secondaryColor, contrast, rng);
        break;
      case 'striped':
        this.drawStripesPattern(ctx, size, scale, params.secondaryColor, contrast, rng);
        break;
      case 'mottled':
        this.drawMottledPattern(ctx, size, scale, params.secondaryColor, contrast, rng);
        break;
      case 'gradient':
        this.drawGradientPattern(ctx, size, params.secondaryColor);
        break;
      case 'countershading':
        this.drawCountershadingPattern(ctx, size, params.secondaryColor, params.accentColor);
        break;
    }

    // Apply skin-type-specific detail
    switch (params.skinType) {
      case 'scales':
        this.drawScaleAlbedo(ctx, size, params.scaleSubType!, rng);
        break;
      case 'feathers':
        this.drawFeatherAlbedo(ctx, size, rng);
        break;
      case 'chitin':
        this.drawChitinAlbedo(ctx, size, rng);
        break;
    }

    // Apply age variation
    if (params.age > 0.3) {
      this.applyAgeAlbedo(ctx, size, params.age, rng);
    }

    return canvas;
  }

  /**
   * Draw spotted pattern using Poisson-like disk sampling.
   */
  private drawSpotsPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    color: THREE.Color,
    contrast: number,
    rng: SeededRandom,
  ): void {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    ctx.fillStyle = `rgba(${r},${g},${b},${contrast})`;
    const cellSize = size / scale;

    for (let x = 0; x < scale; x++) {
      for (let y = 0; y < scale; y++) {
        if (rng.boolean(0.4)) {
          const cx = x * cellSize + cellSize / 2;
          const cy = y * cellSize + cellSize / 2;
          const radius = cellSize * (0.15 + rng.next() * 0.3);

          // Draw spot with soft edge
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          gradient.addColorStop(0, `rgba(${r},${g},${b},${contrast})`);
          gradient.addColorStop(0.7, `rgba(${r},${g},${b},${contrast * 0.6})`);
          gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw striped pattern using sine waves with noise perturbation.
   */
  private drawStripesPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    color: THREE.Color,
    contrast: number,
    rng: SeededRandom,
  ): void {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const frequency = scale * Math.PI * 2 / size;
    const perturbScale = rng.nextFloat(0.5, 2.0);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Sine wave with noise perturbation for organic stripes
        const noisePerturb = seededNoise2D(x * 0.01, y * 0.01, perturbScale, rng.seed) * 15;
        const stripeValue = Math.sin(y * frequency + noisePerturb);

        // Only paint where stripe is positive (creates alternating bands)
        if (stripeValue > 0) {
          const idx = (y * size + x) * 4;
          const alpha = contrast * stripeValue;
          data[idx]     = Math.round(data[idx] * (1 - alpha) + r * alpha);
          data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + g * alpha);
          data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + b * alpha);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw mottled pattern using Voronoi-like cells.
   */
  private drawMottledPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    color: THREE.Color,
    contrast: number,
    rng: SeededRandom,
  ): void {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const cellSize = size / scale;

    // Generate Voronoi seed points
    const seeds: { x: number; y: number }[] = [];
    for (let i = 0; i < scale * scale; i++) {
      seeds.push({
        x: rng.next() * size,
        y: rng.next() * size,
      });
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Find nearest and second-nearest seed
        let minDist = Infinity;
        let secondDist = Infinity;

        for (const seed of seeds) {
          const dx = x - seed.x;
          const dy = y - seed.y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            secondDist = minDist;
            minDist = dist;
          } else if (dist < secondDist) {
            secondDist = dist;
          }
        }

        // Edge detection: high ratio = cell boundary
        const edgeFactor = 1 - minDist / (secondDist + 1);
        const idx = (y * size + x) * 4;

        if (edgeFactor < 0.3) {
          const alpha = contrast * (1 - edgeFactor / 0.3) * 0.5;
          data[idx]     = Math.round(data[idx] * (1 - alpha) + r * alpha);
          data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + g * alpha);
          data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + b * alpha);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw gradient pattern (top-to-bottom color transition).
   */
  private drawGradientPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    color: THREE.Color,
  ): void {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.3)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0.05)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  /**
   * Draw countershading pattern (darker on top, lighter on bottom).
   * Very common in nature for camouflage.
   */
  private drawCountershadingPattern(
    ctx: CanvasRenderingContext2D,
    size: number,
    darkColor: THREE.Color,
    lightColor: THREE.Color,
  ): void {
    const dr = Math.round(darkColor.r * 255);
    const dg = Math.round(darkColor.g * 255);
    const db = Math.round(darkColor.b * 255);
    const lr = Math.round(lightColor.r * 255);
    const lg = Math.round(lightColor.g * 255);
    const lb = Math.round(lightColor.b * 255);

    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, `rgb(${dr},${dg},${db})`);
    gradient.addColorStop(0.4, `rgb(${Math.round((dr + lr) / 2)},${Math.round((dg + lg) / 2)},${Math.round((db + lb) / 2)})`);
    gradient.addColorStop(1, `rgb(${lr},${lg},${lb})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // ── Scale Detail ────────────────────────────────────────────────────

  /**
   * Draw scale pattern on albedo map.
   * Overlapping semicircle rows that create realistic scale appearance.
   */
  private drawScaleAlbedo(
    ctx: CanvasRenderingContext2D,
    size: number,
    scaleSubType: ScaleSubType,
    rng: SeededRandom,
  ): void {
    const rows = 12;
    const cols = 14;
    const scaleW = size / cols;
    const scaleH = size / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : scaleW * 0.5;
        const cx = col * scaleW + offsetX + scaleW * 0.5;
        const cy = row * scaleH + scaleH * 0.5;

        // Subtle color variation per scale
        const variation = (rng.next() - 0.5) * 15;
        const baseV = 128 + variation;
        const v = Math.round(Math.max(0, Math.min(255, baseV)));

        ctx.strokeStyle = `rgba(${v},${v},${v},0.15)`;
        ctx.lineWidth = 1;

        ctx.beginPath();
        switch (scaleSubType) {
          case 'overlapping':
            ctx.ellipse(cx, cy, scaleW * 0.48, scaleH * 0.38, 0, 0, Math.PI * 2);
            break;
          case 'mosaic':
            ctx.rect(cx - scaleW * 0.45, cy - scaleH * 0.38, scaleW * 0.9, scaleH * 0.76);
            break;
          case 'ridge':
            ctx.moveTo(cx - scaleW * 0.5, cy);
            ctx.lineTo(cx, cy - scaleH * 0.38);
            ctx.lineTo(cx + scaleW * 0.5, cy);
            ctx.lineTo(cx, cy + scaleH * 0.38);
            ctx.closePath();
            break;
          case 'diamond':
            ctx.moveTo(cx, cy - scaleH * 0.4);
            ctx.lineTo(cx + scaleW * 0.4, cy);
            ctx.lineTo(cx, cy + scaleH * 0.4);
            ctx.lineTo(cx - scaleW * 0.4, cy);
            ctx.closePath();
            break;
          case 'granular':
            ctx.arc(cx, cy, scaleW * 0.2, 0, Math.PI * 2);
            break;
        }
        ctx.stroke();

        // Inner highlight for depth
        if (scaleSubType === 'overlapping') {
          const hlGrad = ctx.createRadialGradient(cx, cy - scaleH * 0.1, 0, cx, cy, scaleW * 0.3);
          hlGrad.addColorStop(0, `rgba(255,255,255,0.04)`);
          hlGrad.addColorStop(1, `rgba(0,0,0,0.02)`);
          ctx.fillStyle = hlGrad;
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw feather detail on albedo map.
   */
  private drawFeatherAlbedo(
    ctx: CanvasRenderingContext2D,
    size: number,
    rng: SeededRandom,
  ): void {
    const rows = 8;
    const cols = 10;
    const featherW = size / cols;
    const featherH = size / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = row % 2 === 0 ? 0 : featherW * 0.3;
        const cx = col * featherW + offsetX + featherW * 0.5;
        const cy = row * featherH * 0.75 + featherH * 0.3;

        // Feather outline
        const v = Math.round(130 + (rng.next() - 0.5) * 20);
        ctx.strokeStyle = `rgba(${v},${v},${v},0.1)`;
        ctx.lineWidth = 0.5;

        ctx.beginPath();
        ctx.ellipse(cx, cy, featherW * 0.42, featherH * 0.2, Math.PI * 0.08, 0, Math.PI * 2);
        ctx.stroke();

        // Central rachis line
        ctx.beginPath();
        ctx.moveTo(cx - featherW * 0.3, cy);
        ctx.lineTo(cx + featherW * 0.3, cy);
        ctx.strokeStyle = `rgba(${v + 15},${v + 15},${v + 15},0.08)`;
        ctx.stroke();
      }
    }
  }

  /**
   * Draw chitin segment detail on albedo map.
   */
  private drawChitinAlbedo(
    ctx: CanvasRenderingContext2D,
    size: number,
    rng: SeededRandom,
  ): void {
    const cellSize = size / 10;

    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 12; col++) {
        const x = col * cellSize;
        const y = row * cellSize;
        const v = Math.round(120 + (rng.next() - 0.5) * 30);

        // Segment border
        ctx.strokeStyle = `rgba(${v},${v},${v},0.12)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize - 1, cellSize - 1);

        // Inner sheen
        const sheenV = Math.round(v + 20);
        ctx.fillStyle = `rgba(${sheenV},${sheenV},${sheenV},0.03)`;
        ctx.fillRect(x + 1, y + 1, cellSize * 0.5, cellSize * 0.5);
      }
    }
  }

  /**
   * Apply age-based albedo variation.
   * Adds wrinkles, age spots, and color fading.
   */
  private applyAgeAlbedo(
    ctx: CanvasRenderingContext2D,
    size: number,
    age: number,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const ageFactor = Math.max(0, (age - 0.3) / 0.7); // Normalize age > 0.3

    for (let i = 0; i < data.length; i += 4) {
      // Desaturation with age
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const desatAmount = ageFactor * 0.2;
      data[i]     = Math.round(r * (1 - desatAmount) + gray * desatAmount);
      data[i + 1] = Math.round(g * (1 - desatAmount) + gray * desatAmount);
      data[i + 2] = Math.round(b * (1 - desatAmount) + gray * desatAmount);

      // Slight darkening
      const darken = ageFactor * 0.08;
      data[i]     = Math.round(data[i] * (1 - darken));
      data[i + 1] = Math.round(data[i + 1] * (1 - darken));
      data[i + 2] = Math.round(data[i + 2] * (1 - darken));
    }

    // Age spots (random brownish spots)
    const spotCount = Math.round(ageFactor * 15);
    for (let s = 0; s < spotCount; s++) {
      const sx = rng.next() * size;
      const sy = rng.next() * size;
      const sr = rng.nextFloat(3, 12);
      const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gradient.addColorStop(0, `rgba(100,70,40,${ageFactor * 0.3})`);
      gradient.addColorStop(1, `rgba(100,70,40,0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Normal Map Generation ───────────────────────────────────────────

  /**
   * Generate the normal map texture.
   * Uses skin-type-specific detail to create convincing surface relief.
   */
  private generateNormalMap(params: SkinParams, rng: SeededRandom): HTMLCanvasElement {
    const size = params.textureResolution!;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with neutral normal (0.5, 0.5, 1.0 = flat surface facing +Z)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const strength = params.normalStrength! * 0.5;

    switch (params.skinType) {
      case 'scales':
        this.drawScaleNormals(ctx, size, strength, params.scaleSubType!, rng);
        break;
      case 'fur':
        this.drawFurNormals(ctx, size, strength, rng);
        break;
      case 'feathers':
        this.drawFeatherNormals(ctx, size, strength, rng);
        break;
      case 'chitin':
        this.drawChitinNormals(ctx, size, strength, rng);
        break;
      case 'smooth':
        this.drawSmoothNormals(ctx, size, strength, rng);
        break;
    }

    return canvas;
  }

  /**
   * Draw scale normal map detail.
   * Creates overlapping semicircle rows with ridged normal detail.
   */
  private drawScaleNormals(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    scaleSubType: ScaleSubType,
    rng: SeededRandom,
  ): void {
    const rows = 12;
    const cols = 14;
    const scaleW = size / cols;
    const scaleH = size / rows;

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / scaleH);
        const offsetX = row % 2 === 0 ? 0 : scaleW * 0.5;
        const col = Math.floor((x - offsetX) / scaleW);

        // Local coordinates within scale
        const lx = ((x - offsetX) % scaleW) / scaleW - 0.5;
        const ly = (y % scaleH) / scaleH - 0.5;

        // Distance from scale center
        let dist: number;
        switch (scaleSubType) {
          case 'overlapping':
            dist = Math.sqrt((lx * 1.5) ** 2 + (ly * 1.8) ** 2);
            break;
          case 'diamond':
            dist = Math.abs(lx) + Math.abs(ly);
            break;
          default:
            dist = Math.sqrt(lx * lx + ly * ly);
        }

        // Normal perturbation: raised center, lower edges
        const normalScale = Math.max(0, 1 - dist * 2) * strength;
        const nx = -lx * normalScale * 2;
        const ny = -ly * normalScale * 2;

        const idx = (y * size + x) * 4;
        data[idx]     = Math.round(128 + nx * 255); // R = tangent X
        data[idx + 1] = Math.round(128 + ny * 255); // G = tangent Y
        data[idx + 2] = Math.round(255 - normalScale * 40); // B = Z
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw fur normal map detail.
   * Hair direction creates anisotropic normal perturbation.
   */
  private drawFurNormals(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const pixelIdx = i / 4;
      const x = pixelIdx % size;
      const y = Math.floor(pixelIdx / size);

      // Fur direction bias: slight upward normal perturbation
      const noise = (rng.next() - 0.5) * strength * 0.3;
      const directionalBias = -0.1 * strength; // Slight upward bias

      data[i]     = Math.round(128 + noise * 40);
      data[i + 1] = Math.round(128 + (directionalBias + noise * 0.5) * 40);
      data[i + 2] = Math.round(255 - Math.abs(noise) * 15);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw feather normal map detail.
   */
  private drawFeatherNormals(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const rows = 8;
    const cols = 10;
    const featherW = size / cols;
    const featherH = size / rows;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / (featherH * 0.75));
        const offsetX = row % 2 === 0 ? 0 : featherW * 0.3;
        const lx = ((x - offsetX) % featherW) / featherW - 0.5;
        const ly = (y % (featherH * 0.75)) / (featherH * 0.75) - 0.5;

        // Barbs create lateral normal perturbation
        const barbFreq = 20;
        const barbNormal = Math.sin(lx * barbFreq * Math.PI) * strength * 0.3;

        const idx = (y * size + x) * 4;
        data[idx]     = Math.round(128 + barbNormal * 80);
        data[idx + 1] = Math.round(128 - ly * strength * 30);
        data[idx + 2] = Math.round(255 - Math.abs(barbNormal) * 20);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw chitin normal map detail.
   * Segment boundaries create step-like normal changes.
   */
  private drawChitinNormals(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const cellSize = size / 10;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const lx = (x % cellSize) / cellSize;
        const ly = (y % cellSize) / cellSize;

        // Edge detection for segment boundaries
        const edgeX = Math.min(lx, 1 - lx) * 2;
        const edgeY = Math.min(ly, 1 - ly) * 2;
        const edge = Math.min(edgeX, edgeY);

        // Step normal at edges
        const stepStrength = edge < 0.15 ? strength * 0.5 : 0;
        const nx = edge < 0.15 ? (lx < 0.5 ? -1 : 1) * stepStrength : 0;
        const ny = edge < 0.15 ? (ly < 0.5 ? -1 : 1) * stepStrength : 0;

        const idx = (y * size + x) * 4;
        data[idx]     = Math.round(128 + nx * 128);
        data[idx + 1] = Math.round(128 + ny * 128);
        data[idx + 2] = Math.round(255 - stepStrength * 30);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Draw smooth skin normal map detail.
   * Very subtle fine-scale wrinkling.
   */
  private drawSmoothNormals(
    ctx: CanvasRenderingContext2D,
    size: number,
    strength: number,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (rng.next() - 0.5) * strength * 0.15;
      data[i]     = Math.round(128 + noise * 30);
      data[i + 1] = Math.round(128 + noise * 30);
      data[i + 2] = Math.round(255 - Math.abs(noise) * 8);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Roughness Map Generation ────────────────────────────────────────

  /**
   * Generate the roughness map texture.
   * Different skin types have characteristic roughness patterns.
   */
  private generateRoughnessMap(params: SkinParams, rng: SeededRandom): HTMLCanvasElement {
    const size = params.textureResolution!;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const baseRoughness = params.roughness ?? getDefaultRoughness(params.skinType);
    const baseV = Math.round(baseRoughness * 255);

    // Fill with base roughness
    ctx.fillStyle = `rgb(${baseV},${baseV},${baseV})`;
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Add micro-variation
      const noise = (rng.next() - 0.5) * 30;
      let v = baseV + noise;

      // Skin-type-specific roughness variation
      switch (params.skinType) {
        case 'scales':
          // Scales have smooth surfaces with rough edges
          v += (rng.next() - 0.5) * 40;
          break;
        case 'fur':
          // Fur is consistently high roughness
          v = Math.max(v, 180 + (rng.next() - 0.5) * 30);
          break;
        case 'feathers':
          // Feathers: smooth rachis, rougher barbs
          v += (rng.next() - 0.5) * 25;
          break;
        case 'chitin':
          // Chitin is relatively smooth with glossy highlights
          v = Math.min(v, 120 + (rng.next() - 0.5) * 30);
          break;
        case 'smooth':
          // Smooth: very little variation
          v += (rng.next() - 0.5) * 15;
          break;
      }

      // Age increases roughness
      v += params.age * 20;

      v = Math.max(0, Math.min(255, Math.round(v)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // ── Metallic Map Generation ─────────────────────────────────────────

  /**
   * Generate the metallic map texture.
   * Most organic materials are non-metallic, but some have slight
   * iridescent or reflective properties.
   */
  private generateMetallicMap(params: SkinParams, rng: SeededRandom): HTMLCanvasElement {
    const size = params.textureResolution!;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const baseMetallic = params.metallic ?? getDefaultMetallic(params.skinType);
    const baseV = Math.round(baseMetallic * 255);

    // Fill with base metallic
    ctx.fillStyle = `rgb(${baseV},${baseV},${baseV})`;
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let v = baseV;

      switch (params.skinType) {
        case 'scales':
          // Some scales have slight iridescence
          v += Math.round((rng.next() - 0.5) * 20);
          break;
        case 'chitin':
          // Insect shells can be quite reflective
          v += Math.round((rng.next() - 0.5) * 30);
          break;
        default:
          // Most organic materials: very low metallic
          v += Math.round((rng.next() - 0.5) * 5);
          break;
      }

      v = Math.max(0, Math.min(255, v));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // ── Utility Methods ─────────────────────────────────────────────────

  /**
   * Fill canvas with a Three.js Color.
   */
  private fillWithColor(ctx: CanvasRenderingContext2D, size: number, color: THREE.Color): void {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);
  }

  /**
   * Create a CanvasTexture from an HTMLCanvasElement.
   */
  private createCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Get the default skin type for a species.
   */
  getDefaultSkinType(species: string): SkinType {
    return speciesToSkinType(species);
  }

  /**
   * Get the default pattern for a species.
   */
  getDefaultPattern(species: string): PatternType {
    return speciesToPattern(species);
  }

  /**
   * Get default colors for a species.
   */
  getDefaultColors(species: string): { primary: THREE.Color; secondary: THREE.Color; accent: THREE.Color } {
    return speciesToColors(species);
  }

  /**
   * Create SkinParams with automatic defaults for a species.
   */
  static createDefaultParams(species: string, overrides?: Partial<SkinParams>): SkinParams {
    const skinType = speciesToSkinType(species);
    const pattern = speciesToPattern(species);
    const colors = speciesToColors(species);

    return {
      species,
      skinType,
      pattern,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      accentColor: colors.accent,
      age: 0.3,
      roughness: getDefaultRoughness(skinType),
      metallic: getDefaultMetallic(skinType),
      patternScale: 8,
      patternContrast: 0.5,
      textureResolution: 512,
      scaleSubType: 'overlapping',
      furLength: 0.05,
      furDensity: 0.8,
      normalStrength: 1.0,
      seed: 42,
      ...overrides,
    };
  }
}
