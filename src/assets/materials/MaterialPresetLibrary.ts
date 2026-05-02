/**
 * MaterialPresetLibrary - 50+ material presets organized by category
 *
 * Each preset produces a MeshPhysicalMaterial with proper PBR textures
 * Uses the TextureBakePipeline for texture generation
 * Parameters for variation (age, wear, moisture, color shift)
 */

import * as THREE from 'three';
import { TextureBakePipeline, type BakeResolution, type PBRTextureSet, type MaterialPBRParams } from './textures/TextureBakePipeline';

// ============================================================================
// Types
// ============================================================================

export interface MaterialPreset {
  id: string;
  name: string;
  category: MaterialCategory;
  description: string;
  params: MaterialPBRParams;
  /** Physical material overrides */
  physicalOverrides?: Partial<{
    clearcoat: number;
    clearcoatRoughness: number;
    transmission: number;
    ior: number;
    thickness: number;
    sheen: number;
    sheenRoughness: number;
    sheenColor: THREE.Color;
    transparent: boolean;
    opacity: number;
    side: THREE.Side;
    flatShading: boolean;
  }>;
}

export type MaterialCategory =
  | 'terrain'
  | 'wood'
  | 'metal'
  | 'ceramic'
  | 'fabric'
  | 'plastic'
  | 'glass'
  | 'nature'
  | 'creature'
  | 'fluid'
  | 'tile';

export interface PresetVariation {
  age: number;       // 0 = new, 1 = very old
  wear: number;      // 0 = pristine, 1 = heavily worn
  moisture: number;  // 0 = dry, 1 = wet
  colorShift: number; // 0 = original, 1 = shifted hue
}

// ============================================================================
// Preset Definitions (50+)
// ============================================================================

const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

const PRESETS: MaterialPreset[] = [
  // ───────────────────────────────────────
  // TERRAIN (12)
  // ───────────────────────────────────────
  {
    id: 'mud',
    name: 'Mud',
    category: 'terrain',
    description: 'Wet, muddy ground',
    params: {
      baseColor: c(0.3, 0.22, 0.14), roughness: 0.95, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.03, normalStrength: 1.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 6, distortion: 0.4, warpStrength: 0.5,
    },
  },
  {
    id: 'cracked_ground',
    name: 'Cracked Ground',
    category: 'terrain',
    description: 'Dry, cracked earth',
    params: {
      baseColor: c(0.45, 0.35, 0.22), roughness: 0.9, metallic: 0.0,
      aoStrength: 0.8, heightScale: 0.04, normalStrength: 2.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 5, distortion: 0.5, warpStrength: 0.3,
    },
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    category: 'terrain',
    description: 'Layered sedimentary rock',
    params: {
      baseColor: c(0.76, 0.62, 0.42), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.02, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.0, noiseDetail: 5, distortion: 0.2, warpStrength: 0.4,
    },
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    category: 'terrain',
    description: 'Rounded cobble paving',
    params: {
      baseColor: c(0.45, 0.42, 0.38), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.7, heightScale: 0.04, normalStrength: 1.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'dirt',
    name: 'Dirt',
    category: 'terrain',
    description: 'Loose soil and dirt',
    params: {
      baseColor: c(0.35, 0.25, 0.15), roughness: 0.95, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.02, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'mountain_rock',
    name: 'Mountain Rock',
    category: 'terrain',
    description: 'Exposed mountain rock face',
    params: {
      baseColor: c(0.48, 0.45, 0.4), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.7, heightScale: 0.05, normalStrength: 2.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 7, distortion: 0.4, warpStrength: 0.5,
    },
  },
  {
    id: 'soil',
    name: 'Soil',
    category: 'terrain',
    description: 'Rich, dark garden soil',
    params: {
      baseColor: c(0.25, 0.18, 0.1), roughness: 0.92, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.015, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'ice',
    name: 'Ice',
    category: 'terrain',
    description: 'Frozen surface',
    params: {
      baseColor: c(0.7, 0.82, 0.9), roughness: 0.15, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.1,
    },
    physicalOverrides: { transmission: 0.3, ior: 1.31, thickness: 0.5, transparent: true, opacity: 0.85 },
  },
  {
    id: 'sand',
    name: 'Sand',
    category: 'terrain',
    description: 'Fine desert or beach sand',
    params: {
      baseColor: c(0.82, 0.72, 0.52), roughness: 0.9, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 15.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.1,
    },
  },
  {
    id: 'chunky_rock',
    name: 'Chunky Rock',
    category: 'terrain',
    description: 'Rough, angular rock surface',
    params: {
      baseColor: c(0.42, 0.4, 0.36), roughness: 0.88, metallic: 0.0,
      aoStrength: 0.8, heightScale: 0.06, normalStrength: 2.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.5, noiseDetail: 6, distortion: 0.5, warpStrength: 0.6,
    },
  },
  {
    id: 'lava',
    name: 'Lava',
    category: 'terrain',
    description: 'Cooled lava with glowing cracks',
    params: {
      baseColor: c(0.15, 0.08, 0.05), roughness: 0.85, metallic: 0.1,
      aoStrength: 0.7, heightScale: 0.04, normalStrength: 1.8,
      emissionColor: c(1.0, 0.4, 0.05), emissionStrength: 2.0,
      noiseScale: 3.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'mossy_stone',
    name: 'Mossy Stone',
    category: 'terrain',
    description: 'Stone covered in moss',
    params: {
      baseColor: c(0.3, 0.38, 0.2), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.03, normalStrength: 1.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 6, distortion: 0.3, warpStrength: 0.4,
    },
  },

  // ───────────────────────────────────────
  // WOOD (8)
  // ───────────────────────────────────────
  {
    id: 'oak',
    name: 'Oak',
    category: 'wood',
    description: 'Warm oak wood',
    params: {
      baseColor: c(0.45, 0.3, 0.15), roughness: 0.65, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.015, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.5, noiseDetail: 6, distortion: 0.4, warpStrength: 0.6,
    },
  },
  {
    id: 'pine',
    name: 'Pine',
    category: 'wood',
    description: 'Light pine wood',
    params: {
      baseColor: c(0.6, 0.45, 0.25), roughness: 0.7, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.5,
    },
  },
  {
    id: 'birch',
    name: 'Birch',
    category: 'wood',
    description: 'White birch wood',
    params: {
      baseColor: c(0.8, 0.75, 0.65), roughness: 0.6, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.008, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 4, distortion: 0.2, warpStrength: 0.3,
    },
  },
  {
    id: 'mahogany',
    name: 'Mahogany',
    category: 'wood',
    description: 'Dark, rich mahogany',
    params: {
      baseColor: c(0.3, 0.12, 0.06), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.0, noiseDetail: 6, distortion: 0.3, warpStrength: 0.5,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.2 },
  },
  {
    id: 'plywood',
    name: 'Plywood',
    category: 'wood',
    description: 'Generic plywood surface',
    params: {
      baseColor: c(0.65, 0.5, 0.3), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 1.5, noiseDetail: 3, distortion: 0.1, warpStrength: 0.1,
    },
  },
  {
    id: 'hardwood_floor',
    name: 'Hardwood Floor',
    category: 'wood',
    description: 'Polished hardwood floor',
    params: {
      baseColor: c(0.5, 0.35, 0.18), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.5, noiseDetail: 5, distortion: 0.2, warpStrength: 0.3,
    },
    physicalOverrides: { clearcoat: 0.5, clearcoatRoughness: 0.1 },
  },
  {
    id: 'old_wood',
    name: 'Old Wood',
    category: 'wood',
    description: 'Weathered, aged wood',
    params: {
      baseColor: c(0.4, 0.35, 0.28), roughness: 0.92, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.03, normalStrength: 1.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 6, distortion: 0.5, warpStrength: 0.6,
    },
  },
  {
    id: 'bark',
    name: 'Bark',
    category: 'wood',
    description: 'Tree bark surface',
    params: {
      baseColor: c(0.25, 0.15, 0.08), roughness: 0.95, metallic: 0.0,
      aoStrength: 0.8, heightScale: 0.04, normalStrength: 2.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 7, distortion: 0.4, warpStrength: 0.5,
    },
  },

  // ───────────────────────────────────────
  // METAL (7)
  // ───────────────────────────────────────
  {
    id: 'steel',
    name: 'Steel',
    category: 'metal',
    description: 'Brushed steel',
    params: {
      baseColor: c(0.75, 0.75, 0.78), roughness: 0.2, metallic: 1.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 20.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
  },
  {
    id: 'aluminum',
    name: 'Aluminum',
    category: 'metal',
    description: 'Lightweight aluminum',
    params: {
      baseColor: c(0.85, 0.85, 0.87), roughness: 0.25, metallic: 1.0,
      aoStrength: 0.2, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 15.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
  },
  {
    id: 'copper',
    name: 'Copper',
    category: 'metal',
    description: 'Warm copper with patina potential',
    params: {
      baseColor: c(0.72, 0.45, 0.2), roughness: 0.3, metallic: 1.0,
      aoStrength: 0.3, heightScale: 0.005, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 12.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.2,
    },
  },
  {
    id: 'brass',
    name: 'Brass',
    category: 'metal',
    description: 'Polished brass',
    params: {
      baseColor: c(0.78, 0.65, 0.3), roughness: 0.15, metallic: 1.0,
      aoStrength: 0.2, heightScale: 0.003, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 18.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
  },
  {
    id: 'chrome',
    name: 'Chrome',
    category: 'metal',
    description: 'Mirror-like chrome',
    params: {
      baseColor: c(0.9, 0.9, 0.92), roughness: 0.02, metallic: 1.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 25.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.0,
    },
  },
  {
    id: 'rusted_iron',
    name: 'Rusted Iron',
    category: 'metal',
    description: 'Iron with rust spots',
    params: {
      baseColor: c(0.45, 0.3, 0.18), roughness: 0.8, metallic: 0.4,
      aoStrength: 0.6, heightScale: 0.02, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'brushed_metal',
    name: 'Brushed Metal',
    category: 'metal',
    description: 'Directionally brushed metal',
    params: {
      baseColor: c(0.7, 0.7, 0.72), roughness: 0.35, metallic: 1.0,
      aoStrength: 0.2, heightScale: 0.005, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 25.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.1,
    },
  },

  // ───────────────────────────────────────
  // CERAMIC (5)
  // ───────────────────────────────────────
  {
    id: 'porcelain',
    name: 'Porcelain',
    category: 'ceramic',
    description: 'Smooth, white porcelain',
    params: {
      baseColor: c(0.95, 0.94, 0.9), roughness: 0.1, metallic: 0.0,
      aoStrength: 0.15, heightScale: 0.001, normalStrength: 0.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.05,
    },
    physicalOverrides: { clearcoat: 0.8, clearcoatRoughness: 0.05 },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    category: 'ceramic',
    description: 'Earthy terracotta clay',
    params: {
      baseColor: c(0.7, 0.38, 0.22), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.015, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'marble',
    name: 'Marble',
    category: 'ceramic',
    description: 'Veined marble surface',
    params: {
      baseColor: c(0.92, 0.9, 0.87), roughness: 0.2, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.003, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.0, noiseDetail: 5, distortion: 0.5, warpStrength: 0.7,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.1 },
  },
  {
    id: 'glazed_tile',
    name: 'Glazed Tile',
    category: 'ceramic',
    description: 'Glossy glazed ceramic tile',
    params: {
      baseColor: c(0.8, 0.82, 0.78), roughness: 0.08, metallic: 0.0,
      aoStrength: 0.15, heightScale: 0.001, normalStrength: 0.15,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 1.0, clearcoatRoughness: 0.02 },
  },
  {
    id: 'pottery',
    name: 'Pottery',
    category: 'ceramic',
    description: 'Handmade pottery surface',
    params: {
      baseColor: c(0.6, 0.4, 0.28), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.02, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 5, distortion: 0.2, warpStrength: 0.3,
    },
  },

  // ───────────────────────────────────────
  // FABRIC (6)
  // ───────────────────────────────────────
  {
    id: 'cotton',
    name: 'Cotton',
    category: 'fabric',
    description: 'Soft cotton fabric',
    params: {
      baseColor: c(0.85, 0.82, 0.78), roughness: 0.9, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 30.0, noiseDetail: 3, distortion: 0.0, warpStrength: 0.0,
    },
    physicalOverrides: { sheen: 0.2, sheenRoughness: 0.8, sheenColor: c(0.9, 0.9, 0.9) },
  },
  {
    id: 'silk',
    name: 'Silk',
    category: 'fabric',
    description: 'Smooth, shiny silk',
    params: {
      baseColor: c(0.85, 0.8, 0.75), roughness: 0.4, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.001, normalStrength: 0.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 25.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.0,
    },
    physicalOverrides: { sheen: 0.8, sheenRoughness: 0.3, sheenColor: c(0.95, 0.92, 0.88) },
  },
  {
    id: 'velvet',
    name: 'Velvet',
    category: 'fabric',
    description: 'Deep, plush velvet',
    params: {
      baseColor: c(0.5, 0.1, 0.15), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 35.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.0,
    },
    physicalOverrides: { sheen: 0.5, sheenRoughness: 0.6, sheenColor: c(0.6, 0.15, 0.2) },
  },
  {
    id: 'leather',
    name: 'Leather',
    category: 'fabric',
    description: 'Tanned leather hide',
    params: {
      baseColor: c(0.4, 0.25, 0.15), roughness: 0.7, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.01, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'denim',
    name: 'Denim',
    category: 'fabric',
    description: 'Sturdy denim weave',
    params: {
      baseColor: c(0.2, 0.25, 0.45), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.005, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 25.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.0,
    },
  },
  {
    id: 'canvas',
    name: 'Canvas',
    category: 'fabric',
    description: 'Heavy canvas fabric',
    params: {
      baseColor: c(0.7, 0.65, 0.55), roughness: 0.92, metallic: 0.0,
      aoStrength: 0.35, heightScale: 0.008, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 28.0, noiseDetail: 3, distortion: 0.0, warpStrength: 0.0,
    },
  },

  // ───────────────────────────────────────
  // PLASTIC (4)
  // ───────────────────────────────────────
  {
    id: 'glossy_plastic',
    name: 'Glossy Plastic',
    category: 'plastic',
    description: 'Shiny plastic surface',
    params: {
      baseColor: c(0.8, 0.1, 0.1), roughness: 0.1, metallic: 0.0,
      aoStrength: 0.15, heightScale: 0.001, normalStrength: 0.15,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 0.8, clearcoatRoughness: 0.05 },
  },
  {
    id: 'matte_plastic',
    name: 'Matte Plastic',
    category: 'plastic',
    description: 'Dull matte plastic',
    params: {
      baseColor: c(0.6, 0.6, 0.58), roughness: 0.7, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.002, normalStrength: 0.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 2, distortion: 0.03, warpStrength: 0.05,
    },
  },
  {
    id: 'rubber',
    name: 'Rubber',
    category: 'plastic',
    description: 'Flexible rubber surface',
    params: {
      baseColor: c(0.15, 0.15, 0.15), roughness: 0.9, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 12.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.1,
    },
  },
  {
    id: 'translucent_plastic',
    name: 'Translucent Plastic',
    category: 'plastic',
    description: 'Semi-transparent plastic',
    params: {
      baseColor: c(0.9, 0.9, 0.85), roughness: 0.2, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { transmission: 0.5, ior: 1.45, thickness: 0.3, transparent: true, opacity: 0.8 },
  },

  // ───────────────────────────────────────
  // GLASS (3)
  // ───────────────────────────────────────
  {
    id: 'clear_glass',
    name: 'Clear Glass',
    category: 'glass',
    description: 'Transparent clear glass',
    params: {
      baseColor: c(0.98, 0.98, 1.0), roughness: 0.02, metallic: 0.0,
      aoStrength: 0.05, heightScale: 0.0005, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 15.0, noiseDetail: 2, distortion: 0.0, warpStrength: 0.0,
    },
    physicalOverrides: { transmission: 1.0, ior: 1.52, thickness: 0.5, transparent: true, opacity: 1.0, side: THREE.DoubleSide },
  },
  {
    id: 'frosted_glass',
    name: 'Frosted Glass',
    category: 'glass',
    description: 'Frosted translucent glass',
    params: {
      baseColor: c(0.95, 0.95, 0.98), roughness: 0.4, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 20.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.05,
    },
    physicalOverrides: { transmission: 0.7, ior: 1.52, thickness: 0.5, transparent: true, opacity: 0.9, side: THREE.DoubleSide },
  },
  {
    id: 'stained_glass',
    name: 'Stained Glass',
    category: 'glass',
    description: 'Colored stained glass',
    params: {
      baseColor: c(0.6, 0.2, 0.3), roughness: 0.1, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.15,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 4, distortion: 0.3, warpStrength: 0.4,
    },
    physicalOverrides: { transmission: 0.8, ior: 1.52, thickness: 0.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide },
  },

  // ───────────────────────────────────────
  // NATURE (8)
  // ───────────────────────────────────────
  {
    id: 'grass',
    name: 'Grass',
    category: 'nature',
    description: 'Green grass surface',
    params: {
      baseColor: c(0.2, 0.45, 0.12), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.02, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'leaves',
    name: 'Leaves',
    category: 'nature',
    description: 'Leaf surface with veins',
    params: {
      baseColor: c(0.15, 0.42, 0.1), roughness: 0.6, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.01, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 5, distortion: 0.2, warpStrength: 0.3,
    },
  },
  {
    id: 'bark_birch',
    name: 'Birch Bark',
    category: 'nature',
    description: 'White birch bark with peeling',
    params: {
      baseColor: c(0.82, 0.8, 0.72), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.02, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.5, noiseDetail: 6, distortion: 0.3, warpStrength: 0.5,
    },
  },
  {
    id: 'moss',
    name: 'Moss',
    category: 'nature',
    description: 'Soft, green moss',
    params: {
      baseColor: c(0.22, 0.38, 0.12), roughness: 0.95, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.03, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'lichen',
    name: 'Lichen',
    category: 'nature',
    description: 'Crusty lichen growth',
    params: {
      baseColor: c(0.55, 0.55, 0.3), roughness: 0.9, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.015, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 7.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.5,
    },
  },
  {
    id: 'snow',
    name: 'Snow',
    category: 'nature',
    description: 'Fresh snow surface',
    params: {
      baseColor: c(0.92, 0.94, 0.98), roughness: 0.7, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.2, warpStrength: 0.3,
    },
  },
  {
    id: 'ice_crystal',
    name: 'Ice Crystal',
    category: 'nature',
    description: 'Crystalline ice formation',
    params: {
      baseColor: c(0.75, 0.85, 0.95), roughness: 0.05, metallic: 0.0,
      aoStrength: 0.15, heightScale: 0.005, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.15,
    },
    physicalOverrides: { transmission: 0.5, ior: 1.31, thickness: 0.3, transparent: true, opacity: 0.85 },
  },
  {
    id: 'coral',
    name: 'Coral',
    category: 'nature',
    description: 'Textured coral surface',
    params: {
      baseColor: c(0.85, 0.45, 0.35), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.7, heightScale: 0.03, normalStrength: 1.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 6, distortion: 0.3, warpStrength: 0.4,
    },
  },

  // ───────────────────────────────────────
  // CREATURE (19)
  // ───────────────────────────────────────
  {
    id: 'snake_scale',
    name: 'Snake Scale',
    category: 'creature',
    description: 'Smooth, overlapping snake scales with iridescence',
    params: {
      baseColor: c(0.3, 0.35, 0.2), roughness: 0.4, metallic: 0.1,
      aoStrength: 0.5, heightScale: 0.01, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 12.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.15,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.15 },
  },
  {
    id: 'fish_scale',
    name: 'Fish Scale',
    category: 'creature',
    description: 'Iridescent fish scales',
    params: {
      baseColor: c(0.5, 0.55, 0.45), roughness: 0.25, metallic: 0.15,
      aoStrength: 0.4, heightScale: 0.008, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
    physicalOverrides: { clearcoat: 0.6, clearcoatRoughness: 0.1 },
  },
  {
    id: 'feathers',
    name: 'Feathers',
    category: 'creature',
    description: 'Soft feathered surface',
    params: {
      baseColor: c(0.5, 0.45, 0.35), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.01, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
    physicalOverrides: { sheen: 0.3, sheenRoughness: 0.7, sheenColor: c(0.6, 0.55, 0.45) },
  },
  {
    id: 'fur',
    name: 'Fur',
    category: 'creature',
    description: 'Dense fur texture',
    params: {
      baseColor: c(0.45, 0.35, 0.25), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.015, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 15.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
  },
  {
    id: 'chitin',
    name: 'Chitin',
    category: 'creature',
    description: 'Hard insect chitin shell',
    params: {
      baseColor: c(0.3, 0.25, 0.15), roughness: 0.35, metallic: 0.05,
      aoStrength: 0.5, heightScale: 0.015, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.2 },
  },
  {
    id: 'tiger',
    name: 'Tiger',
    category: 'creature',
    description: 'Orange-black tiger stripe pattern',
    params: {
      baseColor: c(0.85, 0.55, 0.15), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.01, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 5, distortion: 0.4, warpStrength: 0.5,
    },
    physicalOverrides: { sheen: 0.1, sheenRoughness: 0.8, sheenColor: c(0.9, 0.6, 0.2) },
  },
  {
    id: 'fish_body',
    name: 'Fish Body',
    category: 'creature',
    description: 'Iridescent fish body with lateral line',
    params: {
      baseColor: c(0.2, 0.3, 0.15), roughness: 0.25, metallic: 0.15,
      aoStrength: 0.4, heightScale: 0.008, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
    physicalOverrides: { clearcoat: 0.6, clearcoatRoughness: 0.1 },
  },
  {
    id: 'fish_eye',
    name: 'Fish Eye',
    category: 'creature',
    description: 'Spherical lens with iris and pupil',
    params: {
      baseColor: c(0.6, 0.5, 0.2), roughness: 0.05, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 0.95, clearcoatRoughness: 0.02 },
  },
  {
    id: 'reptile',
    name: 'Reptile',
    category: 'creature',
    description: 'Brown circle/geometric reptile pattern',
    params: {
      baseColor: c(0.45, 0.3, 0.15), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.012, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 5, distortion: 0.2, warpStrength: 0.3,
    },
    physicalOverrides: { clearcoat: 0.2, clearcoatRoughness: 0.3 },
  },
  {
    id: 'eyeball',
    name: 'Eyeball',
    category: 'creature',
    description: 'Wet glossy eye with iris and pupil',
    params: {
      baseColor: c(0.9, 0.88, 0.82), roughness: 0.03, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 1.0, clearcoatRoughness: 0.01 },
  },
  {
    id: 'horn',
    name: 'Horn',
    category: 'creature',
    description: 'Keratin horn with growth rings',
    params: {
      baseColor: c(0.38, 0.24, 0.12), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.008, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.15 },
  },
  {
    id: 'bone',
    name: 'Bone',
    category: 'creature',
    description: 'Off-white porous bone surface',
    params: {
      baseColor: c(0.85, 0.82, 0.75), roughness: 0.45, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.01, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 4, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'tongue',
    name: 'Tongue',
    category: 'creature',
    description: 'Pink/red wet muscle tissue',
    params: {
      baseColor: c(0.8, 0.06, 0.044), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
    physicalOverrides: { clearcoat: 0.5, clearcoatRoughness: 0.1 },
  },
  {
    id: 'giraffe',
    name: 'Giraffe',
    category: 'creature',
    description: 'Brown patches on tan background',
    params: {
      baseColor: c(0.93, 0.75, 0.45), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.008, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.2, warpStrength: 0.3,
    },
  },
  {
    id: 'two_color_spots',
    name: 'Two-Color Spots',
    category: 'creature',
    description: 'Two-color spotted Voronoi pattern',
    params: {
      baseColor: c(0.95, 0.93, 0.88), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.008, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 4, distortion: 0.3, warpStrength: 0.4,
    },
  },
  {
    id: 'beak',
    name: 'Beak',
    category: 'creature',
    description: 'Hard keratin beak material',
    params: {
      baseColor: c(0.4, 0.3, 0.15), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.005, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.15,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.15 },
  },
  {
    id: 'nose',
    name: 'Nose',
    category: 'creature',
    description: 'Soft wet nose material',
    params: {
      baseColor: c(0.15, 0.1, 0.1), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.005, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.1,
    },
    physicalOverrides: { clearcoat: 0.8, clearcoatRoughness: 0.05 },
  },

  // ───────────────────────────────────────
  // FLUID (6)
  // ───────────────────────────────────────
  {
    id: 'river_water',
    name: 'River Water',
    category: 'fluid',
    description: 'Freshwater with green tint, shallower depth scattering, sediment',
    params: {
      baseColor: c(0.03, 0.27, 0.67), roughness: 0.0, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 11.6, noiseDetail: 6, distortion: 0.2, warpStrength: 0.3,
    },
    physicalOverrides: { transmission: 0.85, ior: 1.33, thickness: 2.0, transparent: true, opacity: 0.92, side: THREE.DoubleSide },
  },
  {
    id: 'waterfall',
    name: 'Waterfall',
    category: 'fluid',
    description: 'White/foamy transparent water with mist spray appearance',
    params: {
      baseColor: c(0.69, 0.94, 1.0), roughness: 0.0, metallic: 0.26,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.3, noiseDetail: 8, distortion: 0.3, warpStrength: 0.4,
    },
    physicalOverrides: { transmission: 0.82, ior: 1.333, thickness: 1.0, clearcoat: 0.3, clearcoatRoughness: 0.0, transparent: true, opacity: 0.9, side: THREE.DoubleSide },
  },
  {
    id: 'whitewater',
    name: 'Whitewater',
    category: 'fluid',
    description: 'Bubble-laden turbulent water, high opacity white',
    params: {
      baseColor: c(1.0, 1.0, 1.0), roughness: 0.15, metallic: 0.0,
      aoStrength: 0.1, heightScale: 0.001, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 10.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
    physicalOverrides: { transmission: 0.5, ior: 1.1, thickness: 0.5, clearcoat: 1.0, clearcoatRoughness: 0.0, sheen: 0.3, sheenRoughness: 0.5, sheenColor: c(0.71, 0.61, 0.80), transparent: true, opacity: 0.95, side: THREE.DoubleSide },
  },
  {
    id: 'smoke',
    name: 'Smoke',
    category: 'fluid',
    description: 'Volumetric density shader, gray/black gradient',
    params: {
      baseColor: c(0.38, 0.38, 0.38), roughness: 1.0, metallic: 0.0,
      aoStrength: 0.0, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 6, distortion: 0.5, warpStrength: 0.6,
    },
    physicalOverrides: { transparent: true, opacity: 0.6, side: THREE.DoubleSide },
  },
  {
    id: 'atmosphere_haze',
    name: 'Atmosphere Haze',
    category: 'fluid',
    description: 'Volume scatter for aerial perspective, light blue',
    params: {
      baseColor: c(0.65, 0.75, 0.88), roughness: 1.0, metallic: 0.0,
      aoStrength: 0.0, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 2.0, noiseDetail: 3, distortion: 0.1, warpStrength: 0.1,
    },
    physicalOverrides: { transparent: true, opacity: 0.15, side: THREE.DoubleSide },
  },
  {
    id: 'blackbody',
    name: 'Blackbody',
    category: 'fluid',
    description: 'Emissive gas for fire/lava glow, temperature-based color',
    params: {
      baseColor: c(0.36, 0.36, 0.36), roughness: 1.0, metallic: 0.0,
      aoStrength: 0.0, heightScale: 0.001, normalStrength: 0.1,
      emissionColor: c(1.0, 0.6, 0.1), emissionStrength: 0.7,
      noiseScale: 3.0, noiseDetail: 5, distortion: 0.4, warpStrength: 0.5,
    },
    physicalOverrides: { transparent: true, opacity: 0.9, side: THREE.DoubleSide },
  },

  // ───────────────────────────────────────
  // TILE PATTERNS (36)
  // ───────────────────────────────────────
  // BasketWeave
  {
    id: 'cream_basketweave',
    name: 'Cream Basketweave',
    category: 'tile',
    description: 'Cream ceramic basketweave tile',
    params: {
      baseColor: c(0.96, 0.94, 0.91), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.003, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
  },
  {
    id: 'gray_basketweave',
    name: 'Gray Basketweave',
    category: 'tile',
    description: 'Gray stone basketweave tile',
    params: {
      baseColor: c(0.69, 0.69, 0.66), roughness: 0.45, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.005, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.08, warpStrength: 0.1,
    },
  },
  {
    id: 'terracotta_basketweave',
    name: 'Terracotta Basketweave',
    category: 'tile',
    description: 'Warm terracotta basketweave tile',
    params: {
      baseColor: c(0.77, 0.38, 0.23), roughness: 0.6, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.008, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
  },
  {
    id: 'dark_basketweave',
    name: 'Dark Basketweave',
    category: 'tile',
    description: 'Dark slate basketweave tile',
    params: {
      baseColor: c(0.23, 0.23, 0.22), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
  },
  // Brick
  {
    id: 'red_brick',
    name: 'Red Brick',
    category: 'tile',
    description: 'Classic red brick pattern with mortar',
    params: {
      baseColor: c(0.55, 0.23, 0.17), roughness: 0.75, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.008, normalStrength: 1.2,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 5, distortion: 0.2, warpStrength: 0.3,
    },
  },
  {
    id: 'white_subway',
    name: 'White Subway',
    category: 'tile',
    description: 'Clean white subway brick tile',
    params: {
      baseColor: c(0.94, 0.93, 0.89), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 8.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.1 },
  },
  {
    id: 'brown_brick',
    name: 'Brown Brick',
    category: 'tile',
    description: 'Weathered brown brick',
    params: {
      baseColor: c(0.48, 0.36, 0.23), roughness: 0.8, metallic: 0.0,
      aoStrength: 0.6, heightScale: 0.01, normalStrength: 1.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 5, distortion: 0.25, warpStrength: 0.35,
    },
  },
  {
    id: 'blue_brick',
    name: 'Blue Brick',
    category: 'tile',
    description: 'Glazed blue brick tile',
    params: {
      baseColor: c(0.29, 0.42, 0.54), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.08 },
  },
  {
    id: 'aged_brick',
    name: 'Aged Brick',
    category: 'tile',
    description: 'Old, weathered brick with mortar wear',
    params: {
      baseColor: c(0.48, 0.29, 0.23), roughness: 0.85, metallic: 0.0,
      aoStrength: 0.7, heightScale: 0.012, normalStrength: 1.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 6, distortion: 0.3, warpStrength: 0.4,
    },
  },
  // Chevron
  {
    id: 'wood_chevron',
    name: 'Wood Chevron',
    category: 'tile',
    description: 'Wooden chevron parquet flooring',
    params: {
      baseColor: c(0.54, 0.42, 0.26), roughness: 0.6, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.006, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 5, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'white_chevron',
    name: 'White Chevron',
    category: 'tile',
    description: 'White ceramic chevron tile',
    params: {
      baseColor: c(0.95, 0.93, 0.89), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.002, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 7.0, noiseDetail: 2, distortion: 0.03, warpStrength: 0.05,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.1 },
  },
  {
    id: 'gray_chevron',
    name: 'Gray Chevron',
    category: 'tile',
    description: 'Gray stone chevron tile',
    params: {
      baseColor: c(0.54, 0.54, 0.53), roughness: 0.45, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.08, warpStrength: 0.12,
    },
  },
  {
    id: 'marble_chevron',
    name: 'Marble Chevron',
    category: 'tile',
    description: 'Polished marble chevron tile',
    params: {
      baseColor: c(0.91, 0.88, 0.83), roughness: 0.2, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.003, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.08 },
  },
  // Diamond
  {
    id: 'white_diamond',
    name: 'White Diamond',
    category: 'tile',
    description: 'White diamond-shaped tile',
    params: {
      baseColor: c(0.94, 0.93, 0.88), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.002, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'black_diamond',
    name: 'Black Diamond',
    category: 'tile',
    description: 'Black diamond-shaped tile',
    params: {
      baseColor: c(0.17, 0.17, 0.16), roughness: 0.4, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
  },
  {
    id: 'terracotta_diamond',
    name: 'Terracotta Diamond',
    category: 'tile',
    description: 'Terracotta diamond tile',
    params: {
      baseColor: c(0.72, 0.35, 0.19), roughness: 0.65, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.008, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
  },
  {
    id: 'blue_diamond',
    name: 'Blue Diamond',
    category: 'tile',
    description: 'Blue glazed diamond tile',
    params: {
      baseColor: c(0.29, 0.44, 0.57), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.25, heightScale: 0.002, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.06 },
  },
  // Herringbone
  {
    id: 'gray_herringbone',
    name: 'Gray Herringbone',
    category: 'tile',
    description: 'Gray stone herringbone tile',
    params: {
      baseColor: c(0.66, 0.66, 0.63), roughness: 0.4, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.08, warpStrength: 0.12,
    },
  },
  {
    id: 'wood_herringbone',
    name: 'Wood Herringbone',
    category: 'tile',
    description: 'Wooden herringbone parquet',
    params: {
      baseColor: c(0.54, 0.41, 0.25), roughness: 0.55, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.006, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 5, distortion: 0.15, warpStrength: 0.2,
    },
  },
  {
    id: 'white_herringbone',
    name: 'White Herringbone',
    category: 'tile',
    description: 'White ceramic herringbone tile',
    params: {
      baseColor: c(0.94, 0.93, 0.89), roughness: 0.2, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 7.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.05 },
  },
  {
    id: 'dark_herringbone',
    name: 'Dark Herringbone',
    category: 'tile',
    description: 'Dark slate herringbone tile',
    params: {
      baseColor: c(0.23, 0.23, 0.22), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'marble_herringbone',
    name: 'Marble Herringbone',
    category: 'tile',
    description: 'Polished marble herringbone tile',
    params: {
      baseColor: c(0.91, 0.88, 0.85), roughness: 0.15, metallic: 0.0,
      aoStrength: 0.2, heightScale: 0.003, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3.0, noiseDetail: 5, distortion: 0.25, warpStrength: 0.35,
    },
    physicalOverrides: { clearcoat: 0.5, clearcoatRoughness: 0.05 },
  },
  // Hexagon
  {
    id: 'white_hexagon',
    name: 'White Hexagon',
    category: 'tile',
    description: 'White honeycomb hexagonal tile',
    params: {
      baseColor: c(0.94, 0.93, 0.89), roughness: 0.2, metallic: 0.0,
      aoStrength: 0.25, heightScale: 0.002, normalStrength: 0.3,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 7.0, noiseDetail: 2, distortion: 0.02, warpStrength: 0.03,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'honey_hexagon',
    name: 'Honey Hexagon',
    category: 'tile',
    description: 'Warm honey-colored hexagonal tile',
    params: {
      baseColor: c(0.83, 0.63, 0.19), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'green_hexagon',
    name: 'Green Hexagon',
    category: 'tile',
    description: 'Muted green hexagonal tile',
    params: {
      baseColor: c(0.35, 0.54, 0.35), roughness: 0.4, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 4, distortion: 0.08, warpStrength: 0.12,
    },
  },
  {
    id: 'black_white_hexagon',
    name: 'Black & White Hexagon',
    category: 'tile',
    description: 'Classic black and white hexagonal tile',
    params: {
      baseColor: c(0.94, 0.94, 0.94), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
  },
  // Shell
  {
    id: 'cream_shell',
    name: 'Cream Shell',
    category: 'tile',
    description: 'Cream scallop shell tile',
    params: {
      baseColor: c(0.94, 0.91, 0.85), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'pink_shell',
    name: 'Pink Shell',
    category: 'tile',
    description: 'Pink scallop shell tile',
    params: {
      baseColor: c(0.91, 0.69, 0.63), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.35, heightScale: 0.004, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
    physicalOverrides: { clearcoat: 0.2, clearcoatRoughness: 0.1 },
  },
  {
    id: 'aqua_shell',
    name: 'Aqua Shell',
    category: 'tile',
    description: 'Aqua/turquoise shell tile',
    params: {
      baseColor: c(0.53, 0.78, 0.75), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'gold_shell',
    name: 'Gold Shell',
    category: 'tile',
    description: 'Gold/amber shell tile',
    params: {
      baseColor: c(0.83, 0.66, 0.28), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.35, heightScale: 0.004, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
  },
  // SpanishBound
  {
    id: 'terracotta_spanish',
    name: 'Terracotta Spanish Bond',
    category: 'tile',
    description: 'Terracotta Spanish bond tile pattern',
    params: {
      baseColor: c(0.72, 0.31, 0.19), roughness: 0.65, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.008, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
  },
  {
    id: 'stone_spanish',
    name: 'Stone Spanish Bond',
    category: 'tile',
    description: 'Stone Spanish bond tile pattern',
    params: {
      baseColor: c(0.69, 0.66, 0.6), roughness: 0.55, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.006, normalStrength: 0.9,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.1, warpStrength: 0.15,
    },
  },
  {
    id: 'white_spanish',
    name: 'White Spanish Bond',
    category: 'tile',
    description: 'White ceramic Spanish bond tile',
    params: {
      baseColor: c(0.94, 0.93, 0.89), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.002, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'dark_spanish',
    name: 'Dark Spanish Bond',
    category: 'tile',
    description: 'Dark stone Spanish bond tile',
    params: {
      baseColor: c(0.29, 0.29, 0.28), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  // Star
  {
    id: 'moroccan_star',
    name: 'Moroccan Star',
    category: 'tile',
    description: 'Moroccan-style star tile pattern',
    params: {
      baseColor: c(0.94, 0.91, 0.82), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.005, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'blue_star',
    name: 'Blue Star',
    category: 'tile',
    description: 'Blue and white star tile',
    params: {
      baseColor: c(0.94, 0.94, 0.94), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'terracotta_star',
    name: 'Terracotta Star',
    category: 'tile',
    description: 'Terracotta star tile with light fills',
    params: {
      baseColor: c(0.78, 0.35, 0.19), roughness: 0.55, metallic: 0.0,
      aoStrength: 0.5, heightScale: 0.006, normalStrength: 0.9,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4.0, noiseDetail: 4, distortion: 0.08, warpStrength: 0.12,
    },
  },
  {
    id: 'gold_star',
    name: 'Gold Star',
    category: 'tile',
    description: 'Gold star tile with dark background',
    params: {
      baseColor: c(0.83, 0.66, 0.28), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.35, heightScale: 0.004, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.05, warpStrength: 0.08,
    },
    physicalOverrides: { clearcoat: 0.4, clearcoatRoughness: 0.06 },
  },
  // Triangle
  {
    id: 'white_triangle',
    name: 'White Triangle',
    category: 'tile',
    description: 'White triangular tile tessellation',
    params: {
      baseColor: c(0.94, 0.93, 0.89), roughness: 0.25, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.002, normalStrength: 0.4,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
    physicalOverrides: { clearcoat: 0.3, clearcoatRoughness: 0.08 },
  },
  {
    id: 'color_triangle',
    name: 'Color Triangle',
    category: 'tile',
    description: 'Teal and gold triangle tile tessellation',
    params: {
      baseColor: c(0.35, 0.6, 0.54), roughness: 0.35, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.6,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'dark_triangle',
    name: 'Dark Triangle',
    category: 'tile',
    description: 'Dark triangle tile tessellation',
    params: {
      baseColor: c(0.29, 0.29, 0.28), roughness: 0.5, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.004, normalStrength: 0.7,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 5.0, noiseDetail: 3, distortion: 0.06, warpStrength: 0.1,
    },
  },
  {
    id: 'pastel_triangle',
    name: 'Pastel Triangle',
    category: 'tile',
    description: 'Pastel pink and blue triangle tile',
    params: {
      baseColor: c(0.91, 0.72, 0.66), roughness: 0.3, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.003, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6.0, noiseDetail: 3, distortion: 0.04, warpStrength: 0.06,
    },
  },
];

// ============================================================================
// MaterialPresetLibrary
// ============================================================================

export class MaterialPresetLibrary {
  private presets: Map<string, MaterialPreset>;
  private pipeline: TextureBakePipeline;
  private textureCache: Map<string, PBRTextureSet>;

  constructor(resolution: BakeResolution = 512) {
    this.presets = new Map(PRESETS.map(p => [p.id, p]));
    this.pipeline = new TextureBakePipeline(resolution);
    this.textureCache = new Map();
  }

  /**
   * Get a material by preset ID. Returns a MeshPhysicalMaterial with PBR textures.
   */
  getMaterial(presetId: string, variation: Partial<PresetVariation> = {}): THREE.MeshPhysicalMaterial | null {
    const preset = this.presets.get(presetId);
    if (!preset) return null;

    // Apply variation to params
    const variedParams = this.applyVariation(preset, variation);

    // Get or create texture set
    const cacheKey = `${presetId}_${JSON.stringify(variation)}`;
    let textures = this.textureCache.get(cacheKey);
    if (!textures) {
      textures = this.pipeline.bakePBRSet(variedParams, { category: preset.category });
      this.textureCache.set(cacheKey, textures);
    }

    // Create material with textures and physical overrides
    const material = this.pipeline.createMaterial(textures, variedParams);
    material.name = `Preset_${preset.name}`;

    // Apply physical overrides
    if (preset.physicalOverrides) {
      const overrides = preset.physicalOverrides;
      if (overrides.clearcoat !== undefined) material.clearcoat = overrides.clearcoat;
      if (overrides.clearcoatRoughness !== undefined) material.clearcoatRoughness = overrides.clearcoatRoughness;
      if (overrides.transmission !== undefined) material.transmission = overrides.transmission;
      if (overrides.ior !== undefined) material.ior = overrides.ior;
      if (overrides.thickness !== undefined) material.thickness = overrides.thickness;
      if (overrides.sheen !== undefined) material.sheen = overrides.sheen;
      if (overrides.sheenRoughness !== undefined) material.sheenRoughness = overrides.sheenRoughness;
      if (overrides.sheenColor !== undefined) material.sheenColor = overrides.sheenColor;
      if (overrides.transparent !== undefined) material.transparent = overrides.transparent;
      if (overrides.opacity !== undefined) material.opacity = overrides.opacity;
      if (overrides.side !== undefined) material.side = overrides.side;
      if (overrides.flatShading !== undefined) material.flatShading = overrides.flatShading;
    }

    material.needsUpdate = true;
    return material;
  }

  /**
   * Get a simple material without textures (for performance)
   */
  getSimpleMaterial(presetId: string, variation: Partial<PresetVariation> = {}): THREE.MeshPhysicalMaterial | null {
    const preset = this.presets.get(presetId);
    if (!preset) return null;

    const variedParams = this.applyVariation(preset, variation);

    const material = new THREE.MeshPhysicalMaterial({
      color: variedParams.baseColor,
      roughness: variedParams.roughness,
      metalness: variedParams.metallic,
    });

    material.name = `SimplePreset_${preset.name}`;

    if (preset.physicalOverrides) {
      const o = preset.physicalOverrides;
      if (o.clearcoat !== undefined) material.clearcoat = o.clearcoat;
      if (o.clearcoatRoughness !== undefined) material.clearcoatRoughness = o.clearcoatRoughness;
      if (o.transmission !== undefined) material.transmission = o.transmission;
      if (o.ior !== undefined) material.ior = o.ior;
      if (o.thickness !== undefined) material.thickness = o.thickness;
      if (o.sheen !== undefined) material.sheen = o.sheen;
      if (o.sheenRoughness !== undefined) material.sheenRoughness = o.sheenRoughness;
      if (o.sheenColor !== undefined) material.sheenColor = o.sheenColor;
      if (o.transparent !== undefined) material.transparent = o.transparent;
      if (o.opacity !== undefined) material.opacity = o.opacity;
      if (o.side !== undefined) material.side = o.side;
      if (o.flatShading !== undefined) material.flatShading = o.flatShading;
    }

    return material;
  }

  /**
   * Apply variation parameters to a preset
   */
  private applyVariation(preset: MaterialPreset, variation: Partial<PresetVariation>): MaterialPBRParams {
    const params = { ...preset.params, baseColor: preset.params.baseColor.clone() };
    const age = variation.age ?? 0;
    const wear = variation.wear ?? 0;
    const moisture = variation.moisture ?? 0;
    const colorShift = variation.colorShift ?? 0;

    // Age: darken and desaturate
    if (age > 0) {
      const hsl = { h: 0, s: 0, l: 0 };
      params.baseColor.getHSL(hsl);
      params.baseColor.setHSL(
        hsl.h,
        Math.max(0, hsl.s * (1 - age * 0.5)),
        Math.max(0, hsl.l * (1 - age * 0.3))
      );
      params.roughness = Math.min(1, params.roughness + age * 0.2);
      params.aoStrength = Math.min(1, params.aoStrength + age * 0.2);
    }

    // Wear: increase roughness, reduce normal detail
    if (wear > 0) {
      params.roughness = Math.min(1, params.roughness + wear * 0.3);
      params.normalStrength = Math.max(0, params.normalStrength * (1 - wear * 0.5));
      params.heightScale = Math.max(0, params.heightScale * (1 - wear * 0.5));
    }

    // Moisture: darken slightly, reduce roughness
    if (moisture > 0) {
      params.baseColor.multiplyScalar(1 - moisture * 0.15);
      params.roughness = Math.max(0, params.roughness * (1 - moisture * 0.4));
    }

    // Color shift: rotate hue
    if (colorShift > 0) {
      const hsl2 = { h: 0, s: 0, l: 0 };
      params.baseColor.getHSL(hsl2);
      params.baseColor.setHSL(
        (hsl2.h + colorShift * 0.2) % 1,
        hsl2.s,
        hsl2.l
      );
    }

    return params;
  }

  /**
   * Get all presets in a category
   */
  getPresetsByCategory(category: MaterialCategory): MaterialPreset[] {
    return PRESETS.filter(p => p.category === category);
  }

  /**
   * Get all presets
   */
  getAllPresets(): MaterialPreset[] {
    return [...PRESETS];
  }

  /**
   * Get preset info by ID
   */
  getPreset(id: string): MaterialPreset | undefined {
    return this.presets.get(id);
  }

  /**
   * Get all category names
   */
  getCategories(): MaterialCategory[] {
    return ['terrain', 'wood', 'metal', 'ceramic', 'fabric', 'plastic', 'glass', 'nature', 'creature'];
  }

  /**
   * Get count of presets
   */
  getPresetCount(): number {
    return this.presets.size;
  }

  /**
   * Dispose all cached textures
   */
  dispose(): void {
    for (const [, textures] of this.textureCache) {
      textures.albedo.dispose();
      textures.normal.dispose();
      textures.roughness.dispose();
      textures.metallic.dispose();
      textures.ao.dispose();
      textures.height.dispose();
      textures.emission?.dispose();
    }
    this.textureCache.clear();
  }
}

// Export singleton for convenience
let _defaultLibrary: MaterialPresetLibrary | null = null;

export function getDefaultLibrary(resolution: BakeResolution = 512): MaterialPresetLibrary {
  if (!_defaultLibrary) {
    _defaultLibrary = new MaterialPresetLibrary(resolution);
  }
  return _defaultLibrary;
}
