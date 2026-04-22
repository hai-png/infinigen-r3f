/**
 * Lighting Module - Procedural Lighting System for R3F
 * Based on Infinigen's lighting system
 */

export { 
  createHDRILighting, 
  addHDRILighting,
  registerHDRIResource,
  getAvailableHDRIs,
} from './hdri-lighting';
export type { HDRILightingConfig, HDRIResource } from './hdri-lighting';

export { 
  createSkyLighting, 
  addSkyLighting,
  animateSunPosition,
} from './sky-lighting';
export type { SkyLightingConfig } from './sky-lighting';

// Indoor lighting presets
export {
  createThreePointLighting,
  createAreaLighting,
  createEmissiveLighting,
  createWindowLight,
  createPracticalLight,
  createIndoorPreset,
  kelvinToRGB,
} from './indoor-lighting';
export type { 
  ThreePointLightingConfig, 
  AreaLightConfig, 
  EmissiveLightConfig,
} from './indoor-lighting';

// Re-export environments (to be implemented)
// export * from './environments';

// Re-export fixtures (to be implemented)
// export * from './fixtures';

// Re-export presets (to be implemented)
// export * from './presets';

export default {
  hdri: {
    createHDRILighting,
    addHDRILighting,
    registerHDRIResource,
    getAvailableHDRIs,
  },
  sky: {
    createSkyLighting,
    addSkyLighting,
    animateSunPosition,
  },
  indoor: {
    createThreePointLighting,
    createAreaLighting,
    createEmissiveLighting,
    createWindowLight,
    createPracticalLight,
    createIndoorPreset,
    kelvinToRGB,
  },
};
