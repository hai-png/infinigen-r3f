/**
 * Atmosphere Module Index for Infinigen R3F
 *
 * Consolidated atmospheric effects including:
 * - Rayleigh/Mie scattering (AtmosphericScattering)
 * - Volumetric clouds (VolumetricClouds)
 * - Cloud type variety (CloudTypes — Cumulus, Cumulonimbus, Stratocumulus, Altocumulus)
 *
 * REMOVED:
 * - AtmosphericSky.ts (duplicate of AtmosphericScattering — consolidated into UnifiedSkySystem)
 *
 * @module atmosphere
 */

export { VolumetricClouds } from './VolumetricClouds';
export type { CloudLayer, CloudParams } from './VolumetricClouds';
export { AtmosphericScattering } from './AtmosphericScattering';
export type { AtmosphereConfig, CloudConfig } from './AtmosphericScattering';

// ── Cloud Type Variety ──────────────────────────────────────────────────────
export {
  CumulusCloud,
  CumulonimbusCloud,
  StratocumulusCloud,
  AltocumulusCloud,
  createCloudByType,
  getCloudLayerForType,
  CLOUD_TYPE_NAMES,
  CLOUD_ALTITUDE_RANGES,
  CLOUD_DENSITY_RANGES,
  CLOUD_OPACITY_RANGES,
} from './CloudTypes';
export type {
  CloudTypeConfig,
  CloudTypeName,
  CumulusCloudConfig,
  CumulonimbusCloudConfig,
  StratocumulusCloudConfig,
  AltocumulusCloudConfig,
} from './CloudTypes';
