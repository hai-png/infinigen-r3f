/**
 * Atmosphere Module Index for Infinigen R3F
 * 
 * Consolidated atmospheric effects including:
 * - Rayleigh/Mie scattering
 * - Sky rendering
 * - Volumetric clouds
 * 
 * @module atmosphere
 */

export { AtmosphericSky } from './AtmosphericSky';
export type { AtmosphereParams } from './AtmosphericSky';
export { VolumetricClouds } from './VolumetricClouds';
export type { CloudLayer, CloudParams } from './VolumetricClouds';
export { AtmosphericScattering } from './AtmosphericScattering';
export type { AtmosphereConfig, CloudConfig } from './AtmosphericScattering';
