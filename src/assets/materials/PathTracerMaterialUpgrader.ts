/**
 * PathTracerMaterialUpgrader — P6.1: Material Upgrade Strategy
 *
 * Upgrades existing material generators to fully utilise MeshPhysicalMaterial
 * properties for physically-based path-traced rendering.
 *
 * Category-specific upgrade rules:
 *  - Water:  transmission, ior=1.33, attenuationColor, attenuationDistance
 *  - Glass:  transmission=1.0, ior=1.5, roughness=0.0, thinFilm for thin glass
 *  - Plant/bark: sheen for velvet-like leaf surfaces, clearcoat for waxy leaves
 *  - Metal:  metalness=1.0, roughness from generator, specularColor for tinted metals
 *  - Skin:   attenuationColor=skinTint, attenuationDistance for subsurface effect
 *
 * Phase 6 — P6.1: Material Upgrade Strategy
 *
 * @module assets/materials
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Preset identifiers for path-tracer-ready material types.
 */
export type PathTracerMaterialPreset =
  | 'water-ocean'
  | 'water-river'
  | 'water-lake'
  | 'water-shallow'
  | 'glass-clear'
  | 'glass-frosted'
  | 'glass-thin'
  | 'glass-stained'
  | 'plant-leaf'
  | 'plant-waxy-leaf'
  | 'plant-bark'
  | 'metal-steel'
  | 'metal-copper'
  | 'metal-brass'
  | 'metal-chrome'
  | 'metal-tinted'
  | 'skin-light'
  | 'skin-medium'
  | 'skin-dark';

/**
 * Configuration passed to the upgrade function.
 * Determines which upgrade path to apply and provides optional overrides.
 */
export interface MaterialUpgradeConfig {
  /** Target material category for the upgrade */
  category: 'water' | 'glass' | 'plant' | 'metal' | 'skin' | 'auto';
  /** Named preset within the category (overrides category defaults) */
  preset?: PathTracerMaterialPreset;
  /** Whether path tracing is available (enables transmission-based features) */
  pathTracingAvailable: boolean;
  /** Optional overrides applied on top of the preset */
  overrides?: Partial<{
    color: THREE.Color;
    roughness: number;
    metalness: number;
    transmission: number;
    ior: number;
    thickness: number;
    attenuationColor: THREE.Color;
    attenuationDistance: number;
    specularColor: THREE.Color;
    specularIntensity: number;
    clearcoat: number;
    clearcoatRoughness: number;
    sheen: number;
    sheenRoughness: number;
    sheenColor: THREE.Color;
    transparent: boolean;
    opacity: number;
    side: THREE.Side;
    depthWrite: boolean;
    envMapIntensity: number;
  }>;
}

// ============================================================================
// Preset Definitions
// ============================================================================

interface PresetConfig {
  color: THREE.Color;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  thickness: number;
  attenuationColor: THREE.Color;
  attenuationDistance: number;
  specularColor: THREE.Color;
  specularIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: THREE.Color;
  transparent: boolean;
  opacity: number;
  side: THREE.Side;
  depthWrite: boolean;
  envMapIntensity: number;
}

const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

const PRESETS: Record<PathTracerMaterialPreset, PresetConfig> = {
  // ─── Water ───────────────────────────────────────────
  'water-ocean': {
    color: c(1, 1, 1),
    roughness: 0.05,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.33,
    thickness: 4.0,
    attenuationColor: c(0.0, 0.094, 0.188),
    attenuationDistance: 2.5,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.5,
  },
  'water-river': {
    color: c(1, 1, 1),
    roughness: 0.08,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.33,
    thickness: 1.5,
    attenuationColor: c(0.04, 0.24, 0.165),
    attenuationDistance: 1.8,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.3,
  },
  'water-lake': {
    color: c(1, 1, 1),
    roughness: 0.06,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.33,
    thickness: 3.0,
    attenuationColor: c(0.04, 0.184, 0.298),
    attenuationDistance: 2.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.07,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.93,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.4,
  },
  'water-shallow': {
    color: c(1, 1, 1),
    roughness: 0.1,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.33,
    thickness: 0.5,
    attenuationColor: c(0.125, 0.667, 0.439),
    attenuationDistance: 3.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.2,
  },

  // ─── Glass ───────────────────────────────────────────
  'glass-clear': {
    color: c(1, 1, 1),
    roughness: 0.0,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 0.5,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 100.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.0,
  },
  'glass-frosted': {
    color: c(0.95, 0.95, 0.98),
    roughness: 0.4,
    metalness: 0.0,
    transmission: 0.7,
    ior: 1.52,
    thickness: 0.5,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 50.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.8,
  },
  'glass-thin': {
    color: c(1, 1, 1),
    roughness: 0.0,
    metalness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 0.01,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 200.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.0,
  },
  'glass-stained': {
    color: c(0.6, 0.2, 0.3),
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.8,
    ior: 1.52,
    thickness: 0.3,
    attenuationColor: c(0.6, 0.2, 0.3),
    attenuationDistance: 5.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.0,
  },

  // ─── Plant ───────────────────────────────────────────
  'plant-leaf': {
    color: c(0.15, 0.42, 0.1),
    roughness: 0.6,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.2,
    attenuationColor: c(0.0, 0.3, 0.0),
    attenuationDistance: 0.5,
    specularColor: c(1, 1, 1),
    specularIntensity: 0.5,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColor: c(0.2, 0.5, 0.15),
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: true,
    envMapIntensity: 0.5,
  },
  'plant-waxy-leaf': {
    color: c(0.12, 0.38, 0.08),
    roughness: 0.4,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.3,
    attenuationColor: c(0.0, 0.25, 0.0),
    attenuationDistance: 0.4,
    specularColor: c(1, 1, 1),
    specularIntensity: 0.7,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    sheen: 0.2,
    sheenRoughness: 0.5,
    sheenColor: c(0.15, 0.45, 0.1),
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: true,
    envMapIntensity: 0.6,
  },
  'plant-bark': {
    color: c(0.25, 0.15, 0.08),
    roughness: 0.95,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 1.0,
    attenuationColor: c(0.15, 0.08, 0.02),
    attenuationDistance: 2.0,
    specularColor: c(0.5, 0.5, 0.5),
    specularIntensity: 0.3,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.1,
    sheenRoughness: 0.8,
    sheenColor: c(0.3, 0.2, 0.12),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 0.3,
  },

  // ─── Metal ───────────────────────────────────────────
  'metal-steel': {
    color: c(0.75, 0.75, 0.78),
    roughness: 0.2,
    metalness: 1.0,
    transmission: 0.0,
    ior: 2.5,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.0,
  },
  'metal-copper': {
    color: c(0.72, 0.45, 0.2),
    roughness: 0.3,
    metalness: 1.0,
    transmission: 0.0,
    ior: 2.5,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
    specularColor: c(0.95, 0.65, 0.35),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.2,
  },
  'metal-brass': {
    color: c(0.78, 0.65, 0.3),
    roughness: 0.15,
    metalness: 1.0,
    transmission: 0.0,
    ior: 2.5,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
    specularColor: c(0.9, 0.8, 0.45),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.1,
  },
  'metal-chrome': {
    color: c(0.9, 0.9, 0.92),
    roughness: 0.02,
    metalness: 1.0,
    transmission: 0.0,
    ior: 3.0,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
    specularColor: c(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.5,
  },
  'metal-tinted': {
    color: c(0.6, 0.55, 0.5),
    roughness: 0.35,
    metalness: 1.0,
    transmission: 0.0,
    ior: 2.5,
    thickness: 0.0,
    attenuationColor: c(1, 1, 1),
    attenuationDistance: 0.0,
    specularColor: c(0.8, 0.7, 0.6),
    specularIntensity: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.0,
  },

  // ─── Skin ────────────────────────────────────────────
  'skin-light': {
    color: c(0.95, 0.78, 0.68),
    roughness: 0.5,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.4,
    thickness: 0.5,
    attenuationColor: c(0.7, 0.25, 0.15),
    attenuationDistance: 0.4,
    specularColor: c(0.5, 0.5, 0.5),
    specularIntensity: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: c(0.85, 0.6, 0.5),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 0.5,
  },
  'skin-medium': {
    color: c(0.75, 0.52, 0.38),
    roughness: 0.55,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.4,
    thickness: 0.5,
    attenuationColor: c(0.55, 0.18, 0.08),
    attenuationDistance: 0.35,
    specularColor: c(0.5, 0.5, 0.5),
    specularIntensity: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: c(0.65, 0.4, 0.3),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 0.5,
  },
  'skin-dark': {
    color: c(0.3, 0.18, 0.1),
    roughness: 0.6,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.4,
    thickness: 0.6,
    attenuationColor: c(0.35, 0.08, 0.03),
    attenuationDistance: 0.25,
    specularColor: c(0.5, 0.5, 0.5),
    specularIntensity: 0.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    sheen: 0.15,
    sheenRoughness: 0.5,
    sheenColor: c(0.35, 0.2, 0.12),
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 0.5,
  },
};

// ============================================================================
// Lazy Path-Tracer Import
// ============================================================================

let pathTracerAvailable: boolean | null = null;

/**
 * Check whether three-gpu-pathtracer is available.
 * Result is cached after the first check.
 */
async function checkPathTracerAvailable(): Promise<boolean> {
  if (pathTracerAvailable !== null) return pathTracerAvailable;
  try {
    await import('three-gpu-pathtracer');
    pathTracerAvailable = true;
  } catch (err) {
    // Silently fall back - three-gpu-pathtracer not available
    if (process.env.NODE_ENV === 'development') console.debug('[PathTracerMaterialUpgrader] three-gpu-pathtracer import fallback:', err);
    pathTracerAvailable = false;
  }
  return pathTracerAvailable;
}

// ============================================================================
// Auto-Detection Helpers
// ============================================================================

/**
 * Heuristically detect material category from an existing material's properties.
 * Used when `category: 'auto'` is specified in the upgrade config.
 */
function detectCategory(material: THREE.Material): MaterialUpgradeConfig['category'] {
  if (material instanceof THREE.MeshPhysicalMaterial) {
    if ((material as THREE.MeshPhysicalMaterial).transmission > 0.5) {
      if ((material as THREE.MeshPhysicalMaterial).ior < 1.4) return 'water';
      return 'glass';
    }
    if ((material as THREE.MeshPhysicalMaterial).metalness > 0.8) return 'metal';
    if ((material as THREE.MeshPhysicalMaterial).sheen > 0.1) return 'plant';
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    if (material.metalness > 0.8) return 'metal';
  }

  // Fallback: inspect name
  const name = (material.name || '').toLowerCase();
  if (name.includes('water') || name.includes('ocean') || name.includes('river')) return 'water';
  if (name.includes('glass') || name.includes('window')) return 'glass';
  if (name.includes('leaf') || name.includes('bark') || name.includes('plant')) return 'plant';
  if (name.includes('metal') || name.includes('steel') || name.includes('chrome')) return 'metal';
  if (name.includes('skin') || name.includes('flesh')) return 'skin';

  return 'water'; // sensible default for unknown
}

// ============================================================================
// Upgrade Logic
// ============================================================================

/**
 * Upgrade an existing material for path-traced rendering.
 *
 * This function takes any THREE.Material and upgrades it to a fully-featured
 * MeshPhysicalMaterial optimised for the three-gpu-pathtracer pipeline.
 * The original material is **not** modified; a new MeshPhysicalMaterial is
 * returned with properties set according to the detected or specified category.
 *
 * When `pathTracingAvailable` is true, transmission-based properties are
 * enabled (water, glass, skin SSS). When false, a rasterization-compatible
 * approximation is used instead.
 *
 * @param material The source material to upgrade
 * @param config   Upgrade configuration specifying category, preset, and overrides
 * @returns A new MeshPhysicalMaterial configured for path tracing
 *
 * @example
 * ```ts
 * const upgraded = upgradeMaterialForPathTracing(existingMat, {
 *   category: 'water',
 *   preset: 'water-ocean',
 *   pathTracingAvailable: true,
 * });
 * ```
 */
export function upgradeMaterialForPathTracing(
  material: THREE.Material,
  config: MaterialUpgradeConfig,
): THREE.MeshPhysicalMaterial {
  const category = config.category === 'auto'
    ? detectCategory(material)
    : config.category;

  // Pick a default preset if none specified
  const preset = config.preset ?? getDefaultPreset(category);

  const presetValues = PRESETS[preset] ?? PRESETS['water-ocean'];

  // Merge preset values with overrides
  const overrides = config.overrides ?? {};
  const merged: PresetConfig = {
    ...presetValues,
    ...overrides,
  };

  // When path tracing is not available, reduce transmission and add fallback settings
  const pt = config.pathTracingAvailable;

  const upgraded = new THREE.MeshPhysicalMaterial({
    // Base PBR
    color: merged.color,
    roughness: merged.roughness,
    metalness: merged.metalness,

    // Transmission (path-trace key)
    transmission: pt ? merged.transmission : merged.transmission * 0.3,
    thickness: merged.thickness,
    ior: merged.ior,

    // Volumetric attenuation — only fully effective in path-traced mode
    attenuationColor: merged.attenuationColor,
    attenuationDistance: pt ? merged.attenuationDistance : merged.attenuationDistance * 0.5,

    // Specular
    specularColor: merged.specularColor,
    specularIntensity: merged.specularIntensity,

    // Clearcoat (wet surface sheen)
    clearcoat: merged.clearcoat,
    clearcoatRoughness: merged.clearcoatRoughness,

    // Sheen (velvet/fabric-like surfaces)
    sheen: merged.sheen,
    sheenRoughness: merged.sheenRoughness,
    sheenColor: merged.sheenColor,

    // Rendering hints
    transparent: merged.transparent,
    opacity: merged.opacity,
    side: merged.side,
    depthWrite: merged.depthWrite,
    envMapIntensity: merged.envMapIntensity,
  });

  // Copy over textures from the source material if it's a textured material
  if (material instanceof THREE.MeshStandardMaterial) {
    if (material.map) upgraded.map = material.map;
    if (material.normalMap) upgraded.normalMap = material.normalMap;
    if (material.roughnessMap) upgraded.roughnessMap = material.roughnessMap;
    if (material.metalnessMap) upgraded.metalnessMap = material.metalnessMap;
    if (material.aoMap) upgraded.aoMap = material.aoMap;
    if (material.emissiveMap) upgraded.emissiveMap = material.emissiveMap;
    if (material.emissive) upgraded.emissive.copy(material.emissive);
    if (material.emissiveIntensity) upgraded.emissiveIntensity = material.emissiveIntensity;
  }

  upgraded.name = `pt-upgraded-${category}-${preset}`;

  return upgraded;
}

/**
 * Get the default preset name for a given material category.
 */
function getDefaultPreset(category: MaterialUpgradeConfig['category']): PathTracerMaterialPreset {
  switch (category) {
    case 'water': return 'water-ocean';
    case 'glass': return 'glass-clear';
    case 'plant': return 'plant-leaf';
    case 'metal': return 'metal-steel';
    case 'skin':  return 'skin-medium';
    default:      return 'water-ocean';
  }
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a glass material configured for path tracing.
 *
 * Sets transmission=1.0, ior=1.5 (configurable), roughness=0.0 by default.
 * For thin glass (window panes) set `thinFilm: true` to reduce thickness.
 *
 * @param config Override defaults for the glass material
 * @returns MeshPhysicalMaterial configured for glass
 */
export function createGlassMaterial(config: {
  /** IOR (default 1.5 for standard glass) */
  ior?: number;
  /** Roughness (default 0.0 for clear glass) */
  roughness?: number;
  /** Transmission (default 1.0) */
  transmission?: number;
  /** Thickness (default 0.5; use ~0.01 for thin film glass) */
  thickness?: number;
  /** Tint color applied via attenuationColor */
  tintColor?: THREE.Color;
  /** How quickly the tint absorbs through the volume */
  attenuationDistance?: number;
  /** Whether this is thin-film glass (overrides thickness to near-zero) */
  thinFilm?: boolean;
} = {}): THREE.MeshPhysicalMaterial {
  const thickness = config.thinFilm ? 0.01 : (config.thickness ?? 0.5);
  const tintColor = config.tintColor ?? new THREE.Color(1, 1, 1);
  const attenuationDistance = config.attenuationDistance ?? (tintColor.equals(new THREE.Color(1, 1, 1)) ? 100.0 : 5.0);

  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1, 1, 1),
    roughness: config.roughness ?? 0.0,
    metalness: 0.0,
    transmission: config.transmission ?? 1.0,
    ior: config.ior ?? 1.52,
    thickness,
    attenuationColor: tintColor,
    attenuationDistance,
    specularColor: new THREE.Color(1, 1, 1),
    specularIntensity: 1.0,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.0,
  });
}

/**
 * Create a water material configured for path tracing.
 *
 * Sets transmission, ior=1.33, attenuationColor and attenuationDistance
 * for realistic depth-dependent colour absorption.
 *
 * @param config Override defaults for the water material
 * @returns MeshPhysicalMaterial configured for water
 */
export function createWaterMaterial(config: {
  /** IOR (default 1.33 for water) */
  ior?: number;
  /** Roughness (default 0.05) */
  roughness?: number;
  /** Transmission (default 1.0) */
  transmission?: number;
  /** Thickness in world units (default 2.0) */
  thickness?: number;
  /** Colour absorbed per unit distance (the deep-water colour) */
  attenuationColor?: THREE.Color;
  /** Distance at which attenuation reaches ~63% (default 1.0) */
  attenuationDistance?: number;
  /** Clearcoat intensity for wet surface sheen (default 1.0) */
  clearcoat?: number;
} = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1, 1, 1),
    roughness: config.roughness ?? 0.05,
    metalness: 0.0,
    transmission: config.transmission ?? 1.0,
    ior: config.ior ?? 1.33,
    thickness: config.thickness ?? 2.0,
    attenuationColor: config.attenuationColor ?? new THREE.Color(0.0, 0.094, 0.188),
    attenuationDistance: config.attenuationDistance ?? 1.0,
    specularColor: new THREE.Color(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: config.clearcoat ?? 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.5,
  });
}

/**
 * Create a metal material configured for path tracing.
 *
 * Sets metalness=1.0, roughness from parameter, specularColor for tinted metals.
 *
 * @param config Override defaults for the metal material
 * @returns MeshPhysicalMaterial configured for metal
 */
export function createMetalMaterial(config: {
  /** Base colour of the metal surface */
  color?: THREE.Color;
  /** Roughness (default 0.2) */
  roughness?: number;
  /** Specular tint for coloured metals like copper/brass (default white) */
  specularColor?: THREE.Color;
  /** Clearcoat for lacquered metals (default 0) */
  clearcoat?: number;
} = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: config.color ?? new THREE.Color(0.75, 0.75, 0.78),
    roughness: config.roughness ?? 0.2,
    metalness: 1.0,
    transmission: 0.0,
    ior: 2.5,
    thickness: 0.0,
    specularColor: config.specularColor ?? new THREE.Color(1, 1, 1),
    specularIntensity: 1.0,
    clearcoat: config.clearcoat ?? 0.0,
    clearcoatRoughness: 0.1,
    transparent: false,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 1.0,
  });
}

/**
 * Create a skin material configured for subsurface scattering via
 * attenuation properties.
 *
 * In path-traced mode: transmission through thin geometry provides real SSS.
 * In rasterized mode: attenuationColor + attenuationDistance provide a
 * rough approximation; use SSSPostProcess from SubsurfaceScatteringMaterial
 * for a better screen-space result.
 *
 * @param config Override defaults for the skin material
 * @returns MeshPhysicalMaterial configured for skin
 */
export function createSkinMaterial(config: {
  /** Surface colour (epidermis) */
  color?: THREE.Color;
  /** Subsurface tint (dermis / blood — the colour seen through the skin) */
  skinTint?: THREE.Color;
  /** Attenuation distance — lower values make SSS more visible (default 0.4) */
  attenuationDistance?: number;
  /** Roughness (default 0.5) */
  roughness?: number;
  /** Whether path tracing is active (enables transmission-based SSS) */
  pathTracingAvailable?: boolean;
} = {}): THREE.MeshPhysicalMaterial {
  const pt = config.pathTracingAvailable ?? false;

  return new THREE.MeshPhysicalMaterial({
    color: config.color ?? new THREE.Color(0.75, 0.52, 0.38),
    roughness: config.roughness ?? 0.5,
    metalness: 0.0,
    // In path-traced mode, a small transmission value enables real light
    // transport through thin geometry, producing physically correct SSS.
    transmission: pt ? 0.15 : 0.0,
    ior: 1.4,
    thickness: 0.5,
    attenuationColor: config.skinTint ?? new THREE.Color(0.55, 0.18, 0.08),
    attenuationDistance: config.attenuationDistance ?? 0.35,
    specularColor: new THREE.Color(0.5, 0.5, 0.5),
    specularIntensity: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: (config.color ?? new THREE.Color(0.75, 0.52, 0.38)).clone().multiplyScalar(0.7),
    transparent: pt,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: true,
    envMapIntensity: 0.5,
  });
}

// ============================================================================
// Async Helper
// ============================================================================

/**
 * Asynchronously upgrade a material with automatic path-tracer availability
 * detection. Checks whether three-gpu-pathtracer is installed and adjusts
 * the upgrade accordingly.
 *
 * @param material The source material
 * @param config   Upgrade configuration (pathTracingAvailable is auto-detected)
 */
export async function upgradeMaterialAsync(
  material: THREE.Material,
  config: Omit<MaterialUpgradeConfig, 'pathTracingAvailable'>,
): Promise<THREE.MeshPhysicalMaterial> {
  const available = await checkPathTracerAvailable();
  return upgradeMaterialForPathTracing(material, {
    ...config,
    pathTracingAvailable: available,
  });
}

// ============================================================================
// Preset Lookup
// ============================================================================

/**
 * Return the full preset configuration for a named preset.
 */
export function getPresetConfig(
  preset: PathTracerMaterialPreset,
): PresetConfig {
  return { ...PRESETS[preset] };
}

/**
 * List all available preset names.
 */
export function listPresets(): PathTracerMaterialPreset[] {
  return Object.keys(PRESETS) as PathTracerMaterialPreset[];
}

/**
 * Get presets filtered by category prefix.
 */
export function getPresetsByCategory(category: 'water' | 'glass' | 'plant' | 'metal' | 'skin'): PathTracerMaterialPreset[] {
  return (Object.keys(PRESETS) as PathTracerMaterialPreset[])
    .filter(k => k.startsWith(category));
}
