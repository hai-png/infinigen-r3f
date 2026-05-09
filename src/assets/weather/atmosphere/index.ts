/**
 * Atmosphere Module Index for Infinigen R3F
 *
 * Consolidated atmospheric effects including:
 * - Rayleigh/Mie scattering (AtmosphericScattering)
 * - Volumetric clouds (VolumetricClouds)
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
