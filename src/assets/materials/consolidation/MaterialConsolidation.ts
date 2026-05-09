/**
 * MaterialConsolidation — Unified exports for duplicate material implementations
 *
 * The codebase has two LeafMaterial implementations and two creature skin
 * implementations in different locations. This module provides a single
 * canonical export for each, marking duplicates as @deprecated with
 * redirect comments.
 *
 * Canonical locations:
 * - Leaf material: src/assets/materials/categories/Plant/LeafMaterial.ts
 * - Creature skin: src/assets/materials/categories/Creature/SkinMaterial.ts
 *
 * Duplicate locations (deprecated):
 * - Leaf material: src/assets/objects/vegetation/leaves/LeafMaterial.ts
 * - Creature skin: (none currently — only one implementation exists)
 */

// ============================================================================
// Leaf Material Consolidation
// ============================================================================

/**
 * Canonical LeafMaterial — procedural leaf texture with translucency and veins.
 *
 * Location: src/assets/materials/categories/Plant/LeafMaterial.ts
 *
 * This is the primary implementation with:
 * - Full LeafMaterialConfig interface
 * - Health-based color adjustment
 * - Vein pattern generation
 * - Edge damage/dew effects
 * - MeshPhysicalMaterial with transmission
 */
export { LeafMaterial, type LeafMaterialConfig, type LeafParams, type LeafPreset } from '../categories/Plant/LeafMaterial';

/**
 * @deprecated Use LeafMaterial from 'materials/categories/Plant/LeafMaterial' instead.
 *
 * This is the legacy LeafMaterialGenerator from the vegetation/leaves directory.
 * It generates simpler leaf textures without translucency support.
 * Kept for backward compatibility only.
 *
 * Location: src/assets/objects/vegetation/leaves/LeafMaterial.ts
 * Redirect: Use `import { LeafMaterial } from '../categories/Plant/LeafMaterial'`
 */
export { LeafMaterialGenerator as LeafMaterialGeneratorLegacy, generateLeafMaterial as generateLeafMaterialLegacy } from '../../objects/vegetation/leaves/LeafMaterial';
export type { LeafMaterialParams as LeafMaterialParamsLegacy, LeafColorScheme as LeafColorSchemeLegacy } from '../../objects/vegetation/leaves/LeafMaterial';

// ============================================================================
// Creature Skin Consolidation
// ============================================================================

/**
 * Canonical SkinMaterial — realistic skin with subsurface scattering.
 *
 * Location: src/assets/materials/categories/Creature/SkinMaterial.ts
 *
 * This is the primary implementation with:
 * - Subsurface scattering via MeshPhysicalMaterial
 * - Freckle and wrinkle detail
 * - Multiple skin type presets (fair, medium, dark, alien, zombie)
 * - Dynamic config updates
 */
export { SkinMaterial, type SkinMaterialConfig, type SkinParams, type SkinPreset } from '../categories/Creature/SkinMaterial';

// ============================================================================
// Convenience: Unified factory functions
// ============================================================================

import * as THREE from 'three';
import { LeafMaterial as CanonicalLeafMaterial, type LeafMaterialConfig } from '../categories/Plant/LeafMaterial';
import { SkinMaterial as CanonicalSkinMaterial, type SkinMaterialConfig } from '../categories/Creature/SkinMaterial';

/**
 * Create a canonical leaf material with the given config.
 * Always uses the primary LeafMaterial implementation.
 */
export function createLeafMaterial(config?: Partial<LeafMaterialConfig>): THREE.MeshPhysicalMaterial {
  const leaf = new CanonicalLeafMaterial(config);
  return leaf.getMaterial();
}

/**
 * Create a canonical skin material with the given config.
 * Always uses the primary SkinMaterial implementation.
 */
export function createSkinMaterial(config?: Partial<SkinMaterialConfig>): THREE.MeshPhysicalMaterial {
  const skin = new CanonicalSkinMaterial(config);
  return skin.getMaterial();
}

/**
 * Quick-create a leaf material by preset name.
 */
export function createLeafPreset(preset: 'healthy' | 'autumn' | 'withered' | 'tropical' | 'succulent'): THREE.MeshPhysicalMaterial {
  return CanonicalLeafMaterial.createPreset(preset).getMaterial();
}

/**
 * Quick-create a skin material by preset name.
 */
export function createSkinPreset(preset: 'fair' | 'medium' | 'dark' | 'alien' | 'zombie'): THREE.MeshPhysicalMaterial {
  return CanonicalSkinMaterial.createPreset(preset).getMaterial();
}
