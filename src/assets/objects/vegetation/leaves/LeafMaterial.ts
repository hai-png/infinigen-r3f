/**
 * LeafMaterial.ts — Procedural Leaf Texture and Material System
 *
 * Generates canvas-based leaf textures with:
 * - Vein pattern (dark lines on lighter green)
 * - Color variation (green gradient with brown edges)
 * - Subsurface scattering for thin leaf appearance
 *
 * This provides materials that complement the LeafGenerator geometries,
 * giving leaves a realistic organic appearance with procedural textures.
 *
 * Ported from: infinigen/terrain/objects/leaves/leaf.py (shader/material sections)
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Leaf color scheme */
export interface LeafColorScheme {
  /** Base leaf color (default green) */
  baseColor: THREE.Color;
  /** Highlight/vein color */
  veinColor: THREE.Color;
  /** Edge/damage color (brown) */
  edgeColor: THREE.Color;
  /** Tip color (yellowish) */
  tipColor: THREE.Color;
}

/** Leaf material parameters */
export interface LeafMaterialParams {
  /** Texture resolution (default 256) */
  resolution: number;
  /** Vein darkness factor 0–1 (default 0.6) */
  veinDarkness: number;
  /** Edge brown extent 0–1 (default 0.15) */
  edgeExtent: number;
  /** Color variation amount 0–1 (default 0.2) */
  colorVariation: number;
  /** Subsurface scattering strength (default 0.3) */
  subsurfaceStrength: number;
  /** Roughness (default 0.6) */
  roughness: number;
  /** Whether the leaf is double-sided (default true) */
  doubleSided: boolean;
  /** Color scheme */
  colorScheme: LeafColorScheme;
  /** Random seed (default 42) */
  seed: number;
  /** Season: affects colors (default 'summer') */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_COLOR_SCHEME: LeafColorScheme = {
  baseColor: new THREE.Color(0.2, 0.5, 0.15),
  veinColor: new THREE.Color(0.12, 0.35, 0.08),
  edgeColor: new THREE.Color(0.4, 0.3, 0.15),
  tipColor: new THREE.Color(0.35, 0.5, 0.15),
};

const SEASON_COLOR_SCHEMES: Record<string, Partial<LeafColorScheme>> = {
  spring: {
    baseColor: new THREE.Color(0.25, 0.55, 0.18),
    tipColor: new THREE.Color(0.4, 0.55, 0.2),
  },
  summer: {
    baseColor: new THREE.Color(0.2, 0.5, 0.15),
    tipColor: new THREE.Color(0.35, 0.5, 0.15),
  },
  autumn: {
    baseColor: new THREE.Color(0.6, 0.4, 0.1),
    veinColor: new THREE.Color(0.4, 0.25, 0.05),
    edgeColor: new THREE.Color(0.5, 0.2, 0.05),
    tipColor: new THREE.Color(0.7, 0.3, 0.05),
  },
  winter: {
    baseColor: new THREE.Color(0.35, 0.35, 0.25),
    veinColor: new THREE.Color(0.25, 0.25, 0.18),
    edgeColor: new THREE.Color(0.3, 0.25, 0.15),
    tipColor: new THREE.Color(0.4, 0.35, 0.2),
  },
};

const DEFAULT_LEAF_MATERIAL_PARAMS: LeafMaterialParams = {
  resolution: 256,
  veinDarkness: 0.6,
  edgeExtent: 0.15,
  colorVariation: 0.2,
  subsurfaceStrength: 0.3,
  roughness: 0.6,
  doubleSided: true,
  colorScheme: { ...DEFAULT_COLOR_SCHEME },
  seed: 42,
  season: 'summer',
};

// ============================================================================
// LeafMaterialGenerator
// ============================================================================

/**
 * LeafMaterialGenerator creates procedural leaf textures and materials
 * using canvas-based texture generation.
 *
 * The texture includes:
 * - Vein pattern rendered as dark lines on a green background
 * - Color gradient from base (dark) to tip (lighter)
 * - Brown edge damage effect
 * - Random color variation for organic feel
 *
 * Usage:
 *   const gen = new LeafMaterialGenerator({ season: 'autumn', seed: 42 });
 *   const material = gen.generate();
 */
export class LeafMaterialGenerator {
  private params: LeafMaterialParams;
  private rng: SeededRandom;

  constructor(params: Partial<LeafMaterialParams> = {}) {
    const season = params.season ?? 'summer';
    const seasonColors = SEASON_COLOR_SCHEMES[season] ?? {};

    this.params = {
      ...DEFAULT_LEAF_MATERIAL_PARAMS,
      ...params,
      colorScheme: {
        ...DEFAULT_COLOR_SCHEME,
        ...seasonColors,
        ...(params.colorScheme ?? {}),
      },
    };
    this.rng = new SeededRandom(this.params.seed);
  }

  /**
   * Generate the leaf material with procedural texture.
   *
   * @returns THREE.MeshStandardMaterial configured for leaf rendering
   */
  generate(): THREE.MeshStandardMaterial {
    const { resolution, roughness, doubleSided, subsurfaceStrength } = this.params;

    // Generate diffuse texture
    const diffuseTexture = this.generateDiffuseTexture();

    // Generate normal map (vein bump)
    const normalMap = this.generateNormalMap();

    const material = new THREE.MeshStandardMaterial({
      map: diffuseTexture,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness,
      metalness: 0.0,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      transparent: true,
      alphaTest: 0.1,
    });

    // Store subsurface info in userData for shader access
    material.userData = {
      subsurfaceStrength,
      isLeafMaterial: true,
    };

    return material;
  }

  /**
   * Generate only the diffuse texture (canvas-based).
   */
  generateDiffuseTexture(): THREE.CanvasTexture {
    const { resolution, colorScheme, veinDarkness, edgeExtent, colorVariation } = this.params;
    this.rng = new SeededRandom(this.params.seed);

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;

    // Base color fill with vertical gradient (base → tip)
    const gradient = ctx.createLinearGradient(0, resolution, 0, 0);
    gradient.addColorStop(0, this.colorToCSS(colorScheme.baseColor));
    gradient.addColorStop(0.7, this.colorToCSS(colorScheme.tipColor));
    gradient.addColorStop(1, this.colorToCSS(colorScheme.edgeColor));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, resolution, resolution);

    // Draw main vein (center, vertical)
    ctx.strokeStyle = this.colorToCSS(colorScheme.veinColor, veinDarkness);
    ctx.lineWidth = Math.max(1, resolution * 0.02);
    ctx.beginPath();
    ctx.moveTo(resolution * 0.5, resolution);
    ctx.lineTo(resolution * 0.5, 0);
    ctx.stroke();

    // Draw secondary veins
    const veinCount = 6;
    for (let i = 1; i <= veinCount; i++) {
      const startY = resolution * (1 - i / (veinCount + 1));
      const endY = startY - resolution * 0.15;

      ctx.lineWidth = Math.max(1, resolution * 0.008);

      // Left vein
      ctx.beginPath();
      ctx.moveTo(resolution * 0.5, startY);
      ctx.quadraticCurveTo(
        resolution * 0.25, startY - resolution * 0.05,
        resolution * 0.05 + this.rng.next() * resolution * 0.05,
        endY
      );
      ctx.stroke();

      // Right vein
      ctx.beginPath();
      ctx.moveTo(resolution * 0.5, startY);
      ctx.quadraticCurveTo(
        resolution * 0.75, startY - resolution * 0.05,
        resolution * 0.9 + this.rng.next() * resolution * 0.05,
        endY
      );
      ctx.stroke();
    }

    // Edge browning effect
    const edgeGradient = ctx.createRadialGradient(
      resolution * 0.5, resolution * 0.5, resolution * 0.3,
      resolution * 0.5, resolution * 0.5, resolution * 0.55
    );
    edgeGradient.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGradient.addColorStop(1, `rgba(80,50,20,${edgeExtent})`);
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, resolution, resolution);

    // Add random color variation spots
    for (let i = 0; i < 20; i++) {
      const x = this.rng.next() * resolution;
      const y = this.rng.next() * resolution;
      const r = this.rng.next() * resolution * 0.05;
      const alpha = this.rng.next() * colorVariation * 0.3;

      ctx.fillStyle = `rgba(${50 + this.rng.nextInt(0, 50)}, ${80 + this.rng.nextInt(0, 40)}, ${20 + this.rng.nextInt(0, 30)}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false;

    return texture;
  }

  /**
   * Generate a normal map from the vein pattern for bump detail.
   */
  generateNormalMap(): THREE.CanvasTexture {
    const { resolution } = this.params;
    this.rng = new SeededRandom(this.params.seed + 100);

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;

    // Base neutral normal (0.5, 0.5, 1.0)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, resolution, resolution);

    // Draw vein bumps as slightly raised normals
    ctx.strokeStyle = '#a0a0ff';
    ctx.lineWidth = Math.max(1, resolution * 0.015);

    // Main vein
    ctx.beginPath();
    ctx.moveTo(resolution * 0.5, resolution);
    ctx.lineTo(resolution * 0.5, 0);
    ctx.stroke();

    // Secondary veins
    const veinCount = 6;
    for (let i = 1; i <= veinCount; i++) {
      const startY = resolution * (1 - i / (veinCount + 1));
      const endY = startY - resolution * 0.15;

      ctx.lineWidth = Math.max(1, resolution * 0.006);

      ctx.beginPath();
      ctx.moveTo(resolution * 0.5, startY);
      ctx.quadraticCurveTo(
        resolution * 0.25, startY - resolution * 0.05,
        resolution * 0.08, endY
      );
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(resolution * 0.5, startY);
      ctx.quadraticCurveTo(
        resolution * 0.75, startY - resolution * 0.05,
        resolution * 0.92, endY
      );
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false;

    return texture;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Convert a THREE.Color to CSS color string.
   */
  private colorToCSS(color: THREE.Color, darknessFactor: number = 1.0): string {
    const r = Math.round(color.r * 255 * darknessFactor);
    const g = Math.round(color.g * 255 * darknessFactor);
    const b = Math.round(color.b * 255 * darknessFactor);
    return `rgb(${r},${g},${b})`;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a leaf material.
 */
export function generateLeafMaterial(
  season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer',
  seed: number = 42
): THREE.MeshStandardMaterial {
  const gen = new LeafMaterialGenerator({ season, seed });
  return gen.generate();
}
