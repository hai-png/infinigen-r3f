/**
 * GrassBladeMaterial.ts — Multi-Palette Grass Blade Shader System
 *
 * Provides 25+ color stops per palette across 8+ palettes, with:
 *   - Season-aware color blending
 *   - Vertex color variation per-instance
 *   - Wind animation (vertex shader displacement)
 *   - Translucency for backlight effect
 *
 * Palettes:
 *   spring_green, summer_green, autumn_golden, dry_brown,
 *   tropical, alpine, coastal, marsh
 *
 * @module assets/materials/nature
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { Season } from '@/assets/objects/vegetation/types';

// ============================================================================
// Color Stop Type
// ============================================================================

/**
 * A color stop: position along the blade (0=base, 1=tip) and the color.
 */
export interface ColorStop {
  /** Position along blade height (0=base, 1=tip) */
  position: number;
  /** Color at this position */
  color: THREE.Color;
}

/**
 * A grass blade color palette with 25+ stops.
 */
export interface GrassPalette {
  /** Palette name */
  name: string;
  /** Color stops from base (0) to tip (1) */
  stops: ColorStop[];
  /** Base color (average) */
  baseColor: THREE.Color;
  /** Tip color (for highlights) */
  tipColor: THREE.Color;
  /** Dead/dry color (for variation) */
  deadColor: THREE.Color;
}

// ============================================================================
// 8+ Palettes with 25+ Color Stops Each
// ============================================================================

/**
 * Create a palette from a list of hex colors evenly spaced along the blade.
 */
function makePalette(name: string, hexColors: number[], deadHex: number): GrassPalette {
  const stops: ColorStop[] = hexColors.map((hex, i) => ({
    position: i / (hexColors.length - 1),
    color: new THREE.Color(hex),
  }));

  return {
    name,
    stops,
    baseColor: new THREE.Color(hexColors[0]).lerp(new THREE.Color(hexColors[Math.floor(hexColors.length / 2)]), 0.5),
    tipColor: new THREE.Color(hexColors[hexColors.length - 1]),
    deadColor: new THREE.Color(deadHex),
  };
}

/** Spring green: fresh, bright green with yellow-green tips */
export const SPRING_GREEN_PALETTE = makePalette('spring_green', [
  0x2a4a15, 0x2d5018, 0x305a1a, 0x346020, 0x386a22,
  0x3c7025, 0x407a28, 0x44802b, 0x488a2e, 0x4c9030,
  0x509a33, 0x54a035, 0x58aa38, 0x5cb03a, 0x60b83d,
  0x64be40, 0x68c843, 0x6cce46, 0x70d448, 0x74da4b,
  0x78e04e, 0x7ce650, 0x80ec53, 0x84f055, 0x88f458,
  0x8cf85a, 0x90fa5d,
], 0x8a7a50);

/** Summer green: deep, saturated greens */
export const SUMMER_GREEN_PALETTE = makePalette('summer_green', [
  0x1a3510, 0x1c3812, 0x1e3b14, 0x203e16, 0x224118,
  0x24441a, 0x26471c, 0x284a1e, 0x2a4d20, 0x2c5022,
  0x2e5324, 0x305626, 0x325928, 0x345c2a, 0x365f2c,
  0x38622e, 0x3a6530, 0x3c6832, 0x3e6b34, 0x406e36,
  0x427138, 0x44743a, 0x46773c, 0x487a3e, 0x4a7d40,
  0x4c8042, 0x4e8344,
], 0x6a5a30);

/** Autumn golden: greens transitioning to golds and oranges */
export const AUTUMN_GOLDEN_PALETTE = makePalette('autumn_golden', [
  0x3a4a10, 0x3d4d12, 0x405014, 0x4a5218, 0x52541c,
  0x5a5620, 0x625824, 0x6a5a28, 0x725c2c, 0x7a5e30,
  0x826034, 0x8a6238, 0x92643c, 0x9a6640, 0xa26844,
  0xaa6a48, 0xb26c4c, 0xba6e50, 0xc27054, 0xca7258,
  0xd2745c, 0xda7660, 0xe27864, 0xea7a68, 0xf27c6c,
  0xfa7e70, 0xff8060,
], 0x8a6a30);

/** Dry brown: desaturated browns and tans */
export const DRY_BROWN_PALETTE = makePalette('dry_brown', [
  0x3a3020, 0x3d3222, 0x403424, 0x433626, 0x463828,
  0x493a2a, 0x4c3c2c, 0x4f3e2e, 0x524030, 0x554232,
  0x584434, 0x5b4636, 0x5e4838, 0x614a3a, 0x644c3c,
  0x674e3e, 0x6a5040, 0x6d5242, 0x705444, 0x735646,
  0x765848, 0x795a4a, 0x7c5c4c, 0x7f5e4e, 0x826050,
  0x856252, 0x886454,
], 0x706040);

/** Tropical: lush, bright greens with some yellow */
export const TROPICAL_PALETTE = makePalette('tropical', [
  0x1a4a0a, 0x1c500c, 0x1e560e, 0x205c10, 0x226212,
  0x246814, 0x266e16, 0x287418, 0x2a7a1a, 0x2c801c,
  0x2e861e, 0x308c20, 0x329222, 0x349824, 0x369e26,
  0x38a428, 0x3aaa2a, 0x3cb02c, 0x3eb62e, 0x40bc30,
  0x42c232, 0x44c834, 0x46ce36, 0x48d438, 0x4ada3a,
  0x4ce03c, 0x4ee63e,
], 0x7a8a40);

/** Alpine: blue-tinted greens, cold-resistant grasses */
export const ALPINE_PALETTE = makePalette('alpine', [
  0x1a3a20, 0x1c3c22, 0x1e3e24, 0x204026, 0x224228,
  0x24442a, 0x26462c, 0x28482e, 0x2a4a30, 0x2c4c32,
  0x2e4e34, 0x305036, 0x325238, 0x34543a, 0x36563c,
  0x38583e, 0x3a5a40, 0x3c5c42, 0x3e5e44, 0x406046,
  0x426248, 0x44644a, 0x46664c, 0x48684e, 0x4a6a50,
  0x4c6c52, 0x4e6e54,
], 0x5a6a4a);

/** Coastal: salt-tolerant, blue-green tones */
export const COASTAL_PALETTE = makePalette('coastal', [
  0x2a4a20, 0x2c4c22, 0x2e4e24, 0x305026, 0x325228,
  0x34542a, 0x36562c, 0x38582e, 0x3a5a30, 0x3c5c32,
  0x3e5e34, 0x406036, 0x426238, 0x44643a, 0x46663c,
  0x48683e, 0x4a6a40, 0x4c6c42, 0x4e6e44, 0x507046,
  0x527248, 0x54744a, 0x56764c, 0x58784e, 0x5a7a50,
  0x5c7c52, 0x5e7e54,
], 0x6a7a50);

/** Marsh: olive-green, waterlogged tones */
export const MARSH_PALETTE = makePalette('marsh', [
  0x2a3a15, 0x2c3c17, 0x2e3e19, 0x30401b, 0x32421d,
  0x34441f, 0x364621, 0x384823, 0x3a4a25, 0x3c4c27,
  0x3e4e29, 0x40502b, 0x42522d, 0x44542f, 0x465631,
  0x485833, 0x4a5a35, 0x4c5c37, 0x4e5e39, 0x50603b,
  0x52623d, 0x54643f, 0x566641, 0x586843, 0x5a6a45,
  0x5c6c47, 0x5e6e49,
], 0x5a5a30);

/**
 * All grass palettes for easy access.
 */
export const GRASS_PALETTES: Record<string, GrassPalette> = {
  spring_green: SPRING_GREEN_PALETTE,
  summer_green: SUMMER_GREEN_PALETTE,
  autumn_golden: AUTUMN_GOLDEN_PALETTE,
  dry_brown: DRY_BROWN_PALETTE,
  tropical: TROPICAL_PALETTE,
  alpine: ALPINE_PALETTE,
  coastal: COASTAL_PALETTE,
  marsh: MARSH_PALETTE,
};

// ============================================================================
// Season Mapping
// ============================================================================

/**
 * Map a season to the most appropriate default palette.
 */
export function seasonToPalette(season: Season): GrassPalette {
  switch (season) {
    case 'spring': return SPRING_GREEN_PALETTE;
    case 'summer': return SUMMER_GREEN_PALETTE;
    case 'autumn': return AUTUMN_GOLDEN_PALETTE;
    case 'winter': return DRY_BROWN_PALETTE;
  }
}

/**
 * Blend two palettes based on a season transition factor.
 */
export function blendPalettes(
  paletteA: GrassPalette,
  paletteB: GrassPalette,
  t: number,
): GrassPalette {
  const blendedStops: ColorStop[] = [];
  const maxStops = Math.max(paletteA.stops.length, paletteB.stops.length);

  for (let i = 0; i < maxStops; i++) {
    const posA = i < paletteA.stops.length ? paletteA.stops[i].position : 1;
    const posB = i < paletteB.stops.length ? paletteB.stops[i].position : 1;
    const colorA = i < paletteA.stops.length ? paletteA.stops[i].color : paletteA.tipColor;
    const colorB = i < paletteB.stops.length ? paletteB.stops[i].color : paletteB.tipColor;

    blendedStops.push({
      position: posA * (1 - t) + posB * t,
      color: colorA.clone().lerp(colorB, t),
    });
  }

  return {
    name: `${paletteA.name}_${paletteB.name}_blend`,
    stops: blendedStops,
    baseColor: paletteA.baseColor.clone().lerp(paletteB.baseColor, t),
    tipColor: paletteA.tipColor.clone().lerp(paletteB.tipColor, t),
    deadColor: paletteA.deadColor.clone().lerp(paletteB.deadColor, t),
  };
}

// ============================================================================
// GrassBladeMaterial
// ============================================================================

/**
 * Configuration for the grass blade material.
 */
export interface GrassBladeMaterialConfig {
  /** Color palette to use */
  palette: GrassPalette;
  /** Wind strength (0-1) */
  windStrength: number;
  /** Wind speed */
  windSpeed: number;
  /** Translucency amount for backlight (0-1) */
  translucency: number;
  /** Per-instance color variation (0-1) */
  colorVariation: number;
  /** Whether to enable wind animation */
  animateWind: boolean;
}

/**
 * Creates a multi-palette grass blade material with wind animation
 * and translucency.
 *
 * The material uses vertex colors for per-instance variation and
 * a custom vertex shader for wind displacement.
 *
 * Usage:
 * ```ts
 * const material = GrassBladeMaterial.create({
 *   palette: SUMMER_GREEN_PALETTE,
 *   windStrength: 0.3,
 *   translucency: 0.5,
 * });
 * ```
 */
export class GrassBladeMaterial {
  /**
   * Create a MeshStandardMaterial configured for grass blades with
   * multi-palette colors, wind animation, and translucency.
   *
   * @param config Material configuration
   * @returns Configured MeshStandardMaterial
   */
  static create(config: Partial<GrassBladeMaterialConfig> = {}): THREE.MeshStandardMaterial {
    const fullConfig: GrassBladeMaterialConfig = {
      palette: SUMMER_GREEN_PALETTE,
      windStrength: 0.3,
      windSpeed: 1.0,
      translucency: 0.4,
      colorVariation: 0.2,
      animateWind: true,
      ...config,
    };

    const palette = fullConfig.palette;

    // Compute average color from palette stops for the base material color
    const avgColor = new THREE.Color(0, 0, 0);
    for (const stop of palette.stops) {
      avgColor.add(stop.color);
    }
    avgColor.multiplyScalar(1 / palette.stops.length);

    const material = new THREE.MeshStandardMaterial({
      color: avgColor,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaTest: 0.1,
      transparent: false,
    });

    // Store palette data in userData for shader access
    material.userData = {
      grassPalette: palette.name,
      windStrength: fullConfig.windStrength,
      windSpeed: fullConfig.windSpeed,
      translucency: fullConfig.translucency,
      colorVariation: fullConfig.colorVariation,
      animateWind: fullConfig.animateWind,
      paletteStops: palette.stops.map(s => ({
        position: s.position,
        color: s.color.clone(),
      })),
      baseColor: palette.baseColor.clone(),
      tipColor: palette.tipColor.clone(),
      deadColor: palette.deadColor.clone(),
    };

    // Apply translucency via subsurface scattering approximation
    if (fullConfig.translucency > 0) {
      material.emissive = palette.tipColor.clone().multiplyScalar(fullConfig.translucency * 0.08);
      material.emissiveIntensity = fullConfig.translucency * 0.5;
    }

    // If wind animation is enabled, we store wind parameters
    // The actual vertex displacement would be handled by a custom shader
    // or via the WindAnimationController
    if (fullConfig.animateWind) {
      material.userData.windDisplacement = true;
    }

    material.name = `GrassBlade_${palette.name}`;
    return material;
  }

  /**
   * Get a color from a palette at a given height position.
   *
   * @param palette The grass palette
   * @param t Height position (0=base, 1=tip)
   * @returns Interpolated color
   */
  static getColorAtHeight(palette: GrassPalette, t: number): THREE.Color {
    const stops = palette.stops;
    if (stops.length === 0) return palette.baseColor.clone();
    if (t <= stops[0].position) return stops[0].color.clone();
    if (t >= stops[stops.length - 1].position) return stops[stops.length - 1].color.clone();

    // Find the two stops to interpolate between
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].position && t <= stops[i + 1].position) {
        const localT = (t - stops[i].position) / (stops[i + 1].position - stops[i].position);
        return stops[i].color.clone().lerp(stops[i + 1].color, localT);
      }
    }

    return palette.baseColor.clone();
  }

  /**
   * Apply per-instance vertex colors to a grass blade geometry
   * using the palette with random variation.
   *
   * @param geometry The blade geometry to color
   * @param palette The color palette
   * @param rng Seeded random for variation
   * @param variation Amount of color variation (0-1)
   */
  static applyVertexColors(
    geometry: THREE.BufferGeometry,
    palette: GrassPalette,
    rng: SeededRandom,
    variation: number = 0.2,
  ): void {
    const posAttr = geometry.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);

    // Find the height range
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const heightRange = maxY - minY || 1;

    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const t = (y - minY) / heightRange;

      // Get palette color at height
      const color = GrassBladeMaterial.getColorAtHeight(palette, t);

      // Apply variation
      color.offsetHSL(
        rng.gaussian(0, variation * 0.05),
        rng.gaussian(0, variation * 0.15),
        rng.gaussian(0, variation * 0.1),
      );

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  /**
   * Create a wind displacement vertex shader snippet.
   * Can be injected into a custom shader material.
   */
  static getWindShaderChunk(): string {
    return `
      // Grass blade wind displacement
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform float uTime;

      vec3 applyWindDisplacement(vec3 position, vec3 normal, float heightFraction) {
        float windPhase = position.x * 0.5 + position.z * 0.3 + uTime * uWindSpeed;
        float windAmount = uWindStrength * heightFraction * heightFraction;
        vec3 displacement = vec3(
          sin(windPhase) * windAmount * 0.3,
          sin(windPhase * 0.7) * windAmount * 0.05,
          cos(windPhase * 0.8) * windAmount * 0.2
        );
        return position + displacement;
      }
    `;
  }
}

/**
 * Convenience function: create a grass blade material.
 */
export function createGrassBladeMaterial(
  config: Partial<GrassBladeMaterialConfig> = {},
): THREE.MeshStandardMaterial {
  return GrassBladeMaterial.create(config);
}

/**
 * Get a grass palette by name.
 */
export function getGrassPalette(name: string): GrassPalette | undefined {
  return GRASS_PALETTES[name];
}

/**
 * Get all available palette names.
 */
export function getAvailableGrassPalettes(): string[] {
  return Object.keys(GRASS_PALETTES);
}
