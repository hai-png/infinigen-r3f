// Nishita-integrated sky lighting (primary sky solution)
export { SkyLightingSystem } from './SkyLightingSystem';
export type { SkyLightingSystemConfig } from './SkyLightingSystem';

// Legacy sky lighting (gradient sphere + DirectionalLight fallback)
export { setupSkyLighting, LegacySkyLighting } from './sky-lighting';
export type { SkyConfig } from './sky-lighting';

// General lighting system
export { LightingSystem } from './LightingSystem';
export type { LightingConfig, LightPreset } from './LightingSystem';

// Three-point studio lighting
export { ThreePointLightingSystem } from './ThreePointLighting';
export type { ThreePointLightingConfig } from './ThreePointLighting';
