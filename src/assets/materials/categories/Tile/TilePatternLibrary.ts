/**
 * TilePatternLibrary.ts
 *
 * 9 procedural tile pattern generators ported from infinigen's tile materials.
 * Each pattern generates a canvas-based texture and returns a THREE.MeshStandardMaterial
 * with map, roughnessMap, and normalMap.
 *
 * Patterns: BasketWeave, Brick, Chevron, Diamond, Herringbone, Hexagon,
 *           Shell, SpanishBound, Star, Triangle
 *
 * @module materials/categories/tile/patterns
 */

import * as THREE from 'three';
import { createCanvas } from '../../../utils/CanvasUtils';
import { SeededRandom } from '../../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Configuration common to all tile pattern generators */
export interface TilePatternOptions {
  /** Primary tile color */
  tileColor: THREE.Color;
  /** Secondary tile color (for two-tone patterns; defaults to slight hue shift of tileColor) */
  tileColor2?: THREE.Color;
  /** Mortar / grout line color */
  groutColor: THREE.Color;
  /** Width of mortar lines as fraction of tile size (0.01 – 0.12) */
  groutWidth: number;
  /** Surface roughness of tiles (0–1) */
  roughness: number;
  /** Metalness of tiles (0–1) */
  metalness: number;
  /** Texture resolution in pixels (default 1024) */
  resolution: number;
  /** Random seed for deterministic variation */
  seed: number;
  /** Per-tile color variation strength (0–1) */
  colorVariation: number;
  /** Flatness of tile surface (0 = deep bevels, 1 = flat) */
  flatness: number;
}

/** A named preset for a tile pattern */
export interface TilePatternPreset {
  name: string;
  options: Partial<TilePatternOptions>;
}

/** Union of all pattern type keys */
export type TilePatternType =
  | 'basketweave'
  | 'brick'
  | 'chevron'
  | 'diamond'
  | 'herringbone'
  | 'hexagon'
  | 'shell'
  | 'spanishbound'
  | 'star'
  | 'triangle';

// ============================================================================
// Internal Helpers
// ============================================================================

const DEFAULT_TILE_COLOR = new THREE.Color(0xf5f0e8);
const DEFAULT_GROUT_COLOR = new THREE.Color(0x8a8a82);
const DEFAULT_OPTIONS: TilePatternOptions = {
  tileColor: DEFAULT_TILE_COLOR,
  groutColor: DEFAULT_GROUT_COLOR,
  groutWidth: 0.04,
  roughness: 0.35,
  metalness: 0.0,
  resolution: 1024,
  seed: 42,
  colorVariation: 0.06,
  flatness: 0.9,
};

function mergeOptions(overrides: Partial<TilePatternOptions>): TilePatternOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/** Create a seeded per-tile color with slight variation */
function varyTileColor(base: THREE.Color, rng: SeededRandom, strength: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const dh = (rng.next() - 0.5) * strength * 0.3;
  const ds = (rng.next() - 0.5) * strength * 0.4;
  const dl = (rng.next() - 0.5) * strength;
  return new THREE.Color().setHSL(
    (hsl.h + dh + 1) % 1,
    Math.max(0, Math.min(1, hsl.s + ds)),
    Math.max(0, Math.min(1, hsl.l + dl)),
  );
}

/** Fill entire canvas with grout color */
function fillGrout(ctx: CanvasRenderingContext2D, size: number, groutColor: THREE.Color): void {
  ctx.fillStyle = `#${groutColor.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
}

/** Create a CanvasTexture with RepeatWrapping */
function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Generate a roughness map where grout = rougher, tiles = smoother */
function generateRoughnessMap(
  size: number,
  tileRoughness: number,
  groutRoughness: number,
  groutCheck: (x: number, y: number) => boolean,
): THREE.CanvasTexture {
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const tileVal = Math.floor(tileRoughness * 255);
  const groutVal = Math.floor(Math.min(1, groutRoughness) * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = groutCheck(x / size, y / size) ? groutVal : tileVal;
      imgData.data[idx] = v;
      imgData.data[idx + 1] = v;
      imgData.data[idx + 2] = v;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return makeTexture(canvas);
}

/** Generate a basic normal map: flat tiles with indented grout lines */
function generateNormalMap(
  size: number,
  groutCheck: (x: number, y: number) => boolean,
): THREE.CanvasTexture {
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Default flat normal: (128, 128, 255) for tangent space
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (groutCheck(x / size, y / size)) {
        // Indented grout – push normal slightly down
        imgData.data[idx] = 128;
        imgData.data[idx + 1] = 128;
        imgData.data[idx + 2] = 220;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return makeTexture(canvas);
}

/** Build a MeshStandardMaterial from a color-map canvas + options */
function buildMaterial(
  mapCanvas: HTMLCanvasElement,
  opts: TilePatternOptions,
  groutCheck: (x: number, y: number) => boolean,
): THREE.MeshStandardMaterial {
  const map = makeTexture(mapCanvas);
  const roughSize = Math.max(64, Math.floor(opts.resolution / 4));
  const normalSize = Math.max(128, Math.floor(opts.resolution / 2));
  const roughnessMap = generateRoughnessMap(roughSize, opts.roughness, Math.min(1, opts.roughness + 0.25), groutCheck);
  const normalMap = generateNormalMap(normalSize, groutCheck);
  return new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    normalMap,
    roughness: opts.roughness,
    metalness: opts.metalness,
  });
}

// ============================================================================
// Pattern: BasketWeave
// Interlocking rectangular tiles in a basket weave pattern
// ============================================================================

export function generateBasketWeave(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const tileSize = size / 8;
  const g = Math.floor(opts.groutWidth * tileSize);
  const halfTile = tileSize / 2;

  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const isHorizontal = (Math.floor(row / 2) + Math.floor(col / 2)) % 2 === 0;
      const baseX = col * halfTile;
      const baseY = row * halfTile;
      const color = varyTileColor(opts.tileColor, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;

      if (isHorizontal) {
        ctx.fillRect(baseX + g / 2, baseY + g / 2, tileSize - g, halfTile - g);
      } else {
        ctx.fillRect(baseX + g / 2, baseY + g / 2, halfTile - g, tileSize - g);
      }
    }
  }

  // Simple grout check for roughness/normal maps
  const groutCheck = (u: number, v: number): boolean => {
    const px = u * size;
    const py = v * size;
    const col = Math.floor(px / halfTile);
    const row = Math.floor(py / halfTile);
    const lx = px - col * halfTile;
    const ly = py - row * halfTile;
    const isHorizontal = (Math.floor(row / 2) + Math.floor(col / 2)) % 2 === 0;
    if (isHorizontal) {
      return lx < g / 2 || lx > tileSize - g / 2 || ly < g / 2 || ly > halfTile - g / 2;
    } else {
      return lx < g / 2 || lx > halfTile - g / 2 || ly < g / 2 || ly > tileSize - g / 2;
    }
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const BASKETWEAVE_PRESETS: TilePatternPreset[] = [
  { name: 'cream_basketweave', options: { tileColor: new THREE.Color(0xf5f0e8), groutColor: new THREE.Color(0x8a8a82), roughness: 0.3, seed: 1 } },
  { name: 'gray_basketweave', options: { tileColor: new THREE.Color(0xb0b0a8), groutColor: new THREE.Color(0x606058), roughness: 0.45, seed: 2 } },
  { name: 'terracotta_basketweave', options: { tileColor: new THREE.Color(0xc4613a), groutColor: new THREE.Color(0x6b5440), roughness: 0.6, seed: 3 } },
  { name: 'dark_basketweave', options: { tileColor: new THREE.Color(0x3a3a38), groutColor: new THREE.Color(0x1a1a18), roughness: 0.5, seed: 4 } },
];

// ============================================================================
// Pattern: Brick
// Running bond brick pattern with mortar lines
// ============================================================================

export function generateBrick(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const brickW = size / 6;
  const brickH = size / 12;
  const g = Math.floor(opts.groutWidth * brickH);

  for (let row = 0; row < 14; row++) {
    const offset = (row % 2) * brickW / 2;
    for (let col = -1; col < 8; col++) {
      const x = col * brickW + offset;
      const y = row * brickH;
      const color = varyTileColor(opts.tileColor, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.fillRect(x + g / 2, y + g / 2, brickW - g, brickH - g);
    }
  }

  const groutCheck = (u: number, v: number): boolean => {
    const px = u * size;
    const py = v * size;
    const row = Math.floor(py / brickH);
    const offset = (row % 2) * brickW / 2;
    const localX = ((px - offset) % brickW + brickW) % brickW;
    const localY = py % brickH;
    return localX < g / 2 || localX > brickW - g / 2 || localY < g / 2 || localY > brickH - g / 2;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const BRICK_PRESETS: TilePatternPreset[] = [
  { name: 'red_brick', options: { tileColor: new THREE.Color(0x8b3a2a), groutColor: new THREE.Color(0x8a8878), roughness: 0.75, colorVariation: 0.1, seed: 10 } },
  { name: 'white_subway', options: { tileColor: new THREE.Color(0xf0ece4), groutColor: new THREE.Color(0xa0a098), roughness: 0.25, seed: 11 } },
  { name: 'brown_brick', options: { tileColor: new THREE.Color(0x7a5c3a), groutColor: new THREE.Color(0x9a9888), roughness: 0.8, colorVariation: 0.12, seed: 12 } },
  { name: 'blue_brick', options: { tileColor: new THREE.Color(0x4a6a8a), groutColor: new THREE.Color(0xc0c0b8), roughness: 0.35, seed: 13 } },
  { name: 'aged_brick', options: { tileColor: new THREE.Color(0x7a4a3a), groutColor: new THREE.Color(0x7a7868), roughness: 0.85, colorVariation: 0.15, seed: 14 } },
];

// ============================================================================
// Pattern: Chevron
// V-shaped zigzag pattern
// ============================================================================

export function generateChevron(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const stripeWidth = size / 8;
  const stripeHeight = size / 6;
  const g = Math.floor(opts.groutWidth * stripeWidth);
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.05, 0, -0.08);

  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 18; col++) {
      const isEvenStripe = (col % 2 === 0);
      const color = varyTileColor(isEvenStripe ? opts.tileColor : tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;

      const baseX = col * stripeWidth / 2;
      const baseY = row * stripeHeight;
      const offsetY = (col % 2 === 0) ? 0 : stripeHeight / 2;

      ctx.beginPath();
      ctx.moveTo(baseX + g / 2, baseY + offsetY + g / 2);
      ctx.lineTo(baseX + stripeWidth / 2 - g / 2, baseY + offsetY + stripeHeight / 2);
      ctx.lineTo(baseX + g / 2, baseY + offsetY + stripeHeight - g / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(baseX + stripeWidth / 2 + g / 2, baseY + offsetY + g / 2);
      ctx.lineTo(baseX + stripeWidth - g / 2, baseY + offsetY + stripeHeight / 2);
      ctx.lineTo(baseX + stripeWidth / 2 + g / 2, baseY + offsetY + stripeHeight - g / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    // Approximate: check if near any chevron edge
    const px = _u * size;
    const py = _v * size;
    const col = Math.floor(px / (stripeWidth / 2));
    const row = Math.floor(py / stripeHeight);
    const offsetY = (col % 2 === 0) ? 0 : stripeHeight / 2;
    const localY = (py - row * stripeHeight - offsetY + stripeHeight) % stripeHeight;
    const localX = (px - col * stripeWidth / 2 + stripeWidth) % (stripeWidth / 2);
    // Distance from V center line
    const distFromCenter = Math.abs(localX - stripeWidth / 4) / (stripeWidth / 4);
    const yRatio = localY / stripeHeight;
    const chevronDist = Math.abs(distFromCenter - (1 - 2 * Math.abs(yRatio - 0.5)));
    return chevronDist < (g / stripeWidth) * 2;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const CHEVRON_PRESETS: TilePatternPreset[] = [
  { name: 'wood_chevron', options: { tileColor: new THREE.Color(0x8a6a42), tileColor2: new THREE.Color(0x6a4a2a), groutColor: new THREE.Color(0x4a3a22), roughness: 0.6, seed: 20 } },
  { name: 'white_chevron', options: { tileColor: new THREE.Color(0xf2ede4), tileColor2: new THREE.Color(0xd8d0c0), groutColor: new THREE.Color(0x9a9a92), roughness: 0.3, seed: 21 } },
  { name: 'gray_chevron', options: { tileColor: new THREE.Color(0x8a8a88), tileColor2: new THREE.Color(0x6a6a68), groutColor: new THREE.Color(0x505048), roughness: 0.45, seed: 22 } },
  { name: 'marble_chevron', options: { tileColor: new THREE.Color(0xe8e0d4), tileColor2: new THREE.Color(0xc8b8a4), groutColor: new THREE.Color(0x908878), roughness: 0.2, seed: 23 } },
];

// ============================================================================
// Pattern: Diamond
// Diamond/rhombus shaped tiles
// ============================================================================

export function generateDiamond(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const diamondW = size / 8;
  const diamondH = size / 6;
  const g = Math.floor(opts.groutWidth * Math.min(diamondW, diamondH));
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.08, 0, -0.1);

  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 12; col++) {
      const cx = col * diamondW + (row % 2) * diamondW / 2;
      const cy = row * diamondH / 2;
      const isAlternate = (row + col) % 2 === 0;
      const color = varyTileColor(isAlternate ? opts.tileColor : tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;

      ctx.beginPath();
      ctx.moveTo(cx, cy - diamondH / 2 + g / 2);
      ctx.lineTo(cx + diamondW / 2 - g / 2, cy);
      ctx.lineTo(cx, cy + diamondH / 2 - g / 2);
      ctx.lineTo(cx - diamondW / 2 + g / 2, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const row = Math.round(py / (diamondH / 2));
    const col = Math.round((px - (row % 2) * diamondW / 2) / diamondW);
    const cx = col * diamondW + (row % 2) * diamondW / 2;
    const cy = row * diamondH / 2;
    const dx = Math.abs(px - cx) / (diamondW / 2);
    const dy = Math.abs(py - cy) / (diamondH / 2);
    return dx + dy > 1 - (g / Math.min(diamondW, diamondH));
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const DIAMOND_PRESETS: TilePatternPreset[] = [
  { name: 'white_diamond', options: { tileColor: new THREE.Color(0xf0ece0), tileColor2: new THREE.Color(0xd0c8b8), groutColor: new THREE.Color(0x888880), roughness: 0.25, seed: 30 } },
  { name: 'black_diamond', options: { tileColor: new THREE.Color(0x2a2a28), tileColor2: new THREE.Color(0x3a3a38), groutColor: new THREE.Color(0x1a1a18), roughness: 0.4, seed: 31 } },
  { name: 'terracotta_diamond', options: { tileColor: new THREE.Color(0xb85830), tileColor2: new THREE.Color(0x8a4020), groutColor: new THREE.Color(0x5a3828), roughness: 0.65, seed: 32 } },
  { name: 'blue_diamond', options: { tileColor: new THREE.Color(0x4a7090), tileColor2: new THREE.Color(0x3a5878), groutColor: new THREE.Color(0x607080), roughness: 0.3, seed: 33 } },
];

// ============================================================================
// Pattern: Herringbone
// 90-degree zigzag pattern (like parquet flooring)
// ============================================================================

export function generateHerringbone(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const tileLong = size / 4;
  const tileShort = size / 8;
  const g = Math.floor(opts.groutWidth * tileShort);
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.03, 0, -0.05);

  for (let blockRow = 0; blockRow < 8; blockRow++) {
    for (let blockCol = 0; blockCol < 8; blockCol++) {
      const bx = blockCol * tileLong;
      const by = blockRow * tileShort;

      // Vertical piece
      const c1 = varyTileColor(opts.tileColor, rng, opts.colorVariation);
      ctx.fillStyle = `#${c1.getHexString()}`;
      ctx.fillRect(bx + g / 2, by + g / 2, tileShort - g, tileLong - g);

      // Horizontal piece
      const c2 = varyTileColor(tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${c2.getHexString()}`;
      ctx.fillRect(bx + tileShort + g / 2, by + g / 2, tileLong - g, tileShort - g);
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const blockCol = Math.floor(px / tileLong);
    const blockRow = Math.floor(py / tileShort);
    const lx = px - blockCol * tileLong;
    const ly = py - blockRow * tileShort;

    // Check if in vertical strip or horizontal strip
    const inVertical = lx < tileShort;
    if (inVertical) {
      return lx < g / 2 || lx > tileShort - g / 2 || ly < g / 2 || ly > tileLong - g / 2;
    } else {
      return lx < tileShort + g / 2 || lx > tileShort + tileLong - g / 2 || ly < g / 2 || ly > tileShort - g / 2;
    }
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const HERRINGBONE_PRESETS: TilePatternPreset[] = [
  { name: 'gray_herringbone', options: { tileColor: new THREE.Color(0xa8a8a0), tileColor2: new THREE.Color(0x908880), groutColor: new THREE.Color(0x606058), roughness: 0.4, seed: 40 } },
  { name: 'wood_herringbone', options: { tileColor: new THREE.Color(0x8a6840), tileColor2: new THREE.Color(0x705830), groutColor: new THREE.Color(0x4a3820), roughness: 0.55, seed: 41 } },
  { name: 'white_herringbone', options: { tileColor: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe0d8cc), groutColor: new THREE.Color(0x9a9a92), roughness: 0.2, seed: 42 } },
  { name: 'dark_herringbone', options: { tileColor: new THREE.Color(0x3a3a38), tileColor2: new THREE.Color(0x2a2a28), groutColor: new THREE.Color(0x1a1a18), roughness: 0.5, seed: 43 } },
  { name: 'marble_herringbone', options: { tileColor: new THREE.Color(0xe8e0d8), tileColor2: new THREE.Color(0xd8ccc0), groutColor: new THREE.Color(0xa09888), roughness: 0.15, seed: 44 } },
];

// ============================================================================
// Pattern: Hexagon
// Honeycomb hexagonal tiles
// ============================================================================

export function generateHexagon(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const hexRadius = size / 12;
  const hexW = hexRadius * 2;
  const hexH = hexRadius * Math.sqrt(3);
  const g = Math.floor(opts.groutWidth * hexRadius);
  const innerRadius = hexRadius - g / 2;
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.06, 0, -0.06);

  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 14; col++) {
      const cx = col * hexW * 0.75;
      const cy = row * hexH + (col % 2) * hexH / 2;
      const isAlt = (row + col) % 2 === 0;
      const color = varyTileColor(isAlt ? opts.tileColor : tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i - Math.PI / 6;
        const hx = cx + innerRadius * Math.cos(angle);
        const hy = cy + innerRadius * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const col = Math.round(px / (hexW * 0.75));
    const row = Math.round((py - (col % 2) * hexH / 2) / hexH);
    const cx = col * hexW * 0.75;
    const cy = row * hexH + (col % 2) * hexH / 2;
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    // Hexagonal distance check
    const dist = Math.max(dx * Math.sqrt(3) / 2 + dy / 2, dy);
    return dist > innerRadius;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const HEXAGON_PRESETS: TilePatternPreset[] = [
  { name: 'white_hexagon', options: { tileColor: new THREE.Color(0xf0ece4), groutColor: new THREE.Color(0x8a8a82), roughness: 0.2, seed: 50 } },
  { name: 'honey_hexagon', options: { tileColor: new THREE.Color(0xd4a030), tileColor2: new THREE.Color(0xb8882a), groutColor: new THREE.Color(0x6a5a30), roughness: 0.35, seed: 51 } },
  { name: 'green_hexagon', options: { tileColor: new THREE.Color(0x5a8a5a), tileColor2: new THREE.Color(0x4a7a4a), groutColor: new THREE.Color(0x3a4a3a), roughness: 0.4, seed: 52 } },
  { name: 'black_white_hexagon', options: { tileColor: new THREE.Color(0xf0f0f0), tileColor2: new THREE.Color(0x2a2a2a), groutColor: new THREE.Color(0x6a6a6a), roughness: 0.3, seed: 53 } },
];

// ============================================================================
// Pattern: Shell
// Shell/fan-shaped curved tiles (scallop pattern)
// ============================================================================

export function generateShell(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const shellRadius = size / 10;
  const g = Math.floor(opts.groutWidth * shellRadius);
  const innerR = shellRadius - g / 2;
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.04, 0, -0.05);

  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 14; col++) {
      const cx = col * shellRadius * 2 + (row % 2) * shellRadius;
      const cy = row * shellRadius * 1.5;

      // Upper fan (shell shape)
      const isAlt = (row + col) % 2 === 0;
      const color = varyTileColor(isAlt ? opts.tileColor : tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${color.getHexString()}`;

      // Draw a fan/arc shape
      ctx.beginPath();
      ctx.arc(cx, cy + shellRadius * 0.2, innerR, Math.PI * 1.15, Math.PI * 1.85, false);
      ctx.lineTo(cx, cy - shellRadius * 0.3);
      ctx.closePath();
      ctx.fill();

      // Add subtle radial lines for shell texture
      ctx.strokeStyle = `#${opts.tileColor.clone().offsetHSL(0, 0, -0.05).getHexString()}`;
      ctx.lineWidth = 0.5;
      for (let r = 0; r < 5; r++) {
        const angle = Math.PI * 1.15 + (Math.PI * 0.7) * r / 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - shellRadius * 0.3);
        ctx.lineTo(cx + innerR * 0.9 * Math.cos(angle), cy + shellRadius * 0.2 + innerR * 0.9 * Math.sin(angle));
        ctx.stroke();
      }
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const row = Math.round(py / (shellRadius * 1.5));
    const col = Math.round((px - (row % 2) * shellRadius) / (shellRadius * 2));
    const cx = col * shellRadius * 2 + (row % 2) * shellRadius;
    const cy = row * shellRadius * 1.5;
    const dx = px - cx;
    const dy = py - (cy + shellRadius * 0.2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Check if outside the fan arc
    const angle = Math.atan2(dy, dx);
    const inArc = angle > Math.PI * 1.15 && angle < Math.PI * 1.85;
    return !inArc || dist > innerR;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const SHELL_PRESETS: TilePatternPreset[] = [
  { name: 'cream_shell', options: { tileColor: new THREE.Color(0xf0e8d8), groutColor: new THREE.Color(0x8a8070), roughness: 0.35, seed: 60 } },
  { name: 'pink_shell', options: { tileColor: new THREE.Color(0xe8b0a0), tileColor2: new THREE.Color(0xd8a090), groutColor: new THREE.Color(0x9a8880), roughness: 0.3, seed: 61 } },
  { name: 'aqua_shell', options: { tileColor: new THREE.Color(0x88c8c0), tileColor2: new THREE.Color(0x78b8b0), groutColor: new THREE.Color(0x5a8880), roughness: 0.25, seed: 62 } },
  { name: 'gold_shell', options: { tileColor: new THREE.Color(0xd4a848), tileColor2: new THREE.Color(0xc49838), groutColor: new THREE.Color(0x7a6830), roughness: 0.3, seed: 63 } },
];

// ============================================================================
// Pattern: SpanishBound
// Spanish bond (alternating square and rectangle tiles)
// ============================================================================

export function generateSpanishBound(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const squareSize = size / 6;
  const rectW = squareSize;
  const rectH = squareSize / 2;
  const g = Math.floor(opts.groutWidth * squareSize);
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.06, 0, -0.08);

  // Spanish bond: rows alternate between full-length squares and half-height rectangles
  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 8; col++) {
      if (row % 3 === 1) {
        // Row of half-height rectangular tiles (headers)
        const x = col * rectW;
        const y = row * rectH;
        const color = varyTileColor(tileColor2, rng, opts.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;
        ctx.fillRect(x + g / 2, y + g / 2, rectW - g, rectH - g);
      } else {
        // Row of square tiles (stretchers) with offset
        const offset = (row % 3 === 2) ? squareSize / 2 : 0;
        const x = col * squareSize + offset;
        const y = row * rectH;
        const color = varyTileColor(opts.tileColor, rng, opts.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;
        ctx.fillRect(x + g / 2, y + g / 2, squareSize - g, squareSize - g);
      }
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const row = Math.floor(py / rectH);
    if (row % 3 === 1) {
      // Header row
      const col = Math.floor(px / rectW);
      const lx = px - col * rectW;
      const ly = py - row * rectH;
      return lx < g / 2 || lx > rectW - g / 2 || ly < g / 2 || ly > rectH - g / 2;
    } else {
      // Stretcher row
      const offset = (row % 3 === 2) ? squareSize / 2 : 0;
      const col = Math.floor((px - offset) / squareSize);
      const lx = px - col * squareSize - offset;
      const ly = py - row * rectH;
      return lx < g / 2 || lx > squareSize - g / 2 || ly < g / 2 || ly > squareSize - g / 2;
    }
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const SPANISHBOUND_PRESETS: TilePatternPreset[] = [
  { name: 'terracotta_spanish', options: { tileColor: new THREE.Color(0xb85030), tileColor2: new THREE.Color(0xa04020), groutColor: new THREE.Color(0x6a5040), roughness: 0.65, seed: 70 } },
  { name: 'stone_spanish', options: { tileColor: new THREE.Color(0xb0a898), tileColor2: new THREE.Color(0x908878), groutColor: new THREE.Color(0x606058), roughness: 0.55, seed: 71 } },
  { name: 'white_spanish', options: { tileColor: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe0d8cc), groutColor: new THREE.Color(0x9a9a90), roughness: 0.25, seed: 72 } },
  { name: 'dark_spanish', options: { tileColor: new THREE.Color(0x4a4a48), tileColor2: new THREE.Color(0x3a3a38), groutColor: new THREE.Color(0x2a2a28), roughness: 0.5, seed: 73 } },
];

// ============================================================================
// Pattern: Star
// Star-shaped tile pattern (8-pointed stars with cross fills)
// ============================================================================

export function generateStar(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const starRadius = size / 8;
  const g = Math.floor(opts.groutWidth * starRadius);
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.1, 0, -0.12);

  /** Draw an 8-pointed star */
  function drawStar(cx: number, cy: number, outerR: number, innerR: number, fillColor: string): void {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI / 8) * i - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  const outerR = starRadius - g / 2;
  const innerR = outerR * 0.45;

  for (let row = -1; row < 12; row++) {
    for (let col = -1; col < 12; col++) {
      const cx = col * starRadius * 2;
      const cy = row * starRadius * 2;
      const color = varyTileColor(opts.tileColor, rng, opts.colorVariation);
      drawStar(cx, cy, outerR, innerR, `#${color.getHexString()}`);

      // Fill cross-shapes between stars
      const crossColor = varyTileColor(tileColor2, rng, opts.colorVariation);
      ctx.fillStyle = `#${crossColor.getHexString()}`;
      // Small diamond fills in corners
      const dSize = starRadius * 0.6 - g / 2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const fx = cx + dx * starRadius;
        const fy = cy + dy * starRadius;
        ctx.beginPath();
        ctx.moveTo(fx, fy - dSize);
        ctx.lineTo(fx + dSize, fy);
        ctx.lineTo(fx, fy + dSize);
        ctx.lineTo(fx - dSize, fy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    // Simplified: check distance from nearest star center
    const px = _u * size;
    const py = _v * size;
    const col = Math.round(px / (starRadius * 2));
    const row = Math.round(py / (starRadius * 2));
    const cx = col * starRadius * 2;
    const cy = row * starRadius * 2;
    const dx = (px - cx) / outerR;
    const dy = (py - cy) / outerR;
    // Approximate star shape check using L1 + L∞ mix
    const l1 = Math.abs(dx) + Math.abs(dy);
    const linf = Math.max(Math.abs(dx), Math.abs(dy));
    const starDist = (l1 + linf) / 2;
    return starDist > 0.85;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const STAR_PRESETS: TilePatternPreset[] = [
  { name: 'moroccan_star', options: { tileColor: new THREE.Color(0xf0e8d0), tileColor2: new THREE.Color(0x2a7a5a), groutColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 80 } },
  { name: 'blue_star', options: { tileColor: new THREE.Color(0xf0f0f0), tileColor2: new THREE.Color(0x3a5a8a), groutColor: new THREE.Color(0x808890), roughness: 0.25, seed: 81 } },
  { name: 'terracotta_star', options: { tileColor: new THREE.Color(0xc85830), tileColor2: new THREE.Color(0xf0e0c8), groutColor: new THREE.Color(0x7a6050), roughness: 0.55, seed: 82 } },
  { name: 'gold_star', options: { tileColor: new THREE.Color(0xd4a848), tileColor2: new THREE.Color(0x2a2a28), groutColor: new THREE.Color(0x5a5040), roughness: 0.3, seed: 83 } },
];

// ============================================================================
// Pattern: Triangle
// Equilateral triangle tessellation
// ============================================================================

export function generateTriangle(overrides: Partial<TilePatternOptions> = {}): THREE.MeshStandardMaterial {
  const opts = mergeOptions(overrides);
  const size = opts.resolution;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new SeededRandom(opts.seed);

  fillGrout(ctx, size, opts.groutColor);

  const triSide = size / 8;
  const triHeight = triSide * Math.sqrt(3) / 2;
  const g = Math.floor(opts.groutWidth * triSide);
  const tileColor2 = opts.tileColor2 ?? opts.tileColor.clone().offsetHSL(0.07, 0, -0.1);

  function drawTriangle(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    color: string,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  for (let row = -1; row < 16; row++) {
    for (let col = -1; col < 12; col++) {
      const baseX = col * triSide;
      const baseY = row * triHeight;
      const offset = (row % 2) * triSide / 2;
      const bx = baseX + offset;
      const shrink = g / 2;

      // Upward-pointing triangle
      const c1 = varyTileColor(opts.tileColor, rng, opts.colorVariation);
      drawTriangle(
        bx + triSide / 2, baseY + shrink,
        bx + shrink, baseY + triHeight - shrink,
        bx + triSide - shrink, baseY + triHeight - shrink,
        `#${c1.getHexString()}`,
      );

      // Downward-pointing triangle
      const c2 = varyTileColor(tileColor2, rng, opts.colorVariation);
      drawTriangle(
        bx + triSide / 2, baseY + triHeight - shrink,
        bx - triSide / 2 + shrink, baseY + shrink,
        bx + triSide + triSide / 2 - shrink, baseY + shrink,
        `#${c2.getHexString()}`,
      );
    }
  }

  const groutCheck = (_u: number, _v: number): boolean => {
    const px = _u * size;
    const py = _v * size;
    const row = Math.floor(py / triHeight);
    const offset = (row % 2) * triSide / 2;
    const lx = ((px - offset) % triSide + triSide) % triSide;
    const ly = py % triHeight;
    // Distance from triangle edges
    const isUpper = ly < triHeight * (1 - 2 * Math.abs(lx / triSide - 0.5));
    const edgeDist = isUpper
      ? Math.min(ly, Math.abs(lx - triSide / 2) * triHeight / (triSide / 2) - (triHeight - ly))
      : Math.min(triHeight - ly, Math.abs(lx - triSide / 2) * triHeight / (triSide / 2) - ly);
    return edgeDist < g;
  };

  return buildMaterial(canvas, opts, groutCheck);
}

export const TRIANGLE_PRESETS: TilePatternPreset[] = [
  { name: 'white_triangle', options: { tileColor: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xd8d0c4), groutColor: new THREE.Color(0x8a8a82), roughness: 0.25, seed: 90 } },
  { name: 'color_triangle', options: { tileColor: new THREE.Color(0x5a9a8a), tileColor2: new THREE.Color(0xd4a040), groutColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 91 } },
  { name: 'dark_triangle', options: { tileColor: new THREE.Color(0x4a4a48), tileColor2: new THREE.Color(0x2a2a28), groutColor: new THREE.Color(0x1a1a18), roughness: 0.5, seed: 92 } },
  { name: 'pastel_triangle', options: { tileColor: new THREE.Color(0xe8b8a8), tileColor2: new THREE.Color(0xa8c8d8), groutColor: new THREE.Color(0xb0b0a8), roughness: 0.3, seed: 93 } },
];

// ============================================================================
// Preset Registry
// ============================================================================

/** All presets indexed by pattern type */
export const ALL_TILE_PRESETS: Record<TilePatternType, TilePatternPreset[]> = {
  basketweave: BASKETWEAVE_PRESETS,
  brick: BRICK_PRESETS,
  chevron: CHEVRON_PRESETS,
  diamond: DIAMOND_PRESETS,
  herringbone: HERRINGBONE_PRESETS,
  hexagon: HEXAGON_PRESETS,
  shell: SHELL_PRESETS,
  spanishbound: SPANISHBOUND_PRESETS,
  star: STAR_PRESETS,
  triangle: TRIANGLE_PRESETS,
};

// ============================================================================
// Convenience Function
// ============================================================================

const PATTERN_GENERATORS: Record<TilePatternType, (opts: Partial<TilePatternOptions>) => THREE.MeshStandardMaterial> = {
  basketweave: generateBasketWeave,
  brick: generateBrick,
  chevron: generateChevron,
  diamond: generateDiamond,
  herringbone: generateHerringbone,
  hexagon: generateHexagon,
  shell: generateShell,
  spanishbound: generateSpanishBound,
  star: generateStar,
  triangle: generateTriangle,
};

/**
 * Create a tile material for the given pattern type.
 *
 * @param pattern - One of the 9 pattern type keys
 * @param options - Optional overrides for colors, grout, roughness, etc.
 * @returns A MeshStandardMaterial with procedural map, roughnessMap, and normalMap
 */
export function createTileMaterial(
  pattern: TilePatternType,
  options: Partial<TilePatternOptions> = {},
): THREE.MeshStandardMaterial {
  const generator = PATTERN_GENERATORS[pattern];
  if (!generator) {
    throw new Error(`Unknown tile pattern: ${pattern}. Available: ${Object.keys(PATTERN_GENERATORS).join(', ')}`);
  }
  return generator(options);
}

/**
 * Create a tile material from a named preset.
 *
 * @param pattern - Pattern type key
 * @param presetName - Named preset within that pattern
 * @returns A MeshStandardMaterial
 */
export function createTileMaterialFromPreset(
  pattern: TilePatternType,
  presetName: string,
): THREE.MeshStandardMaterial | null {
  const presets = ALL_TILE_PRESETS[pattern];
  if (!presets) return null;
  const preset = presets.find(p => p.name === presetName);
  if (!preset) return null;
  return createTileMaterial(pattern, preset.options);
}
