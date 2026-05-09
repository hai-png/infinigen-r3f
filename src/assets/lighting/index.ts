/**
 * Lighting Module Exports
 *
 * Canonical exports:
 * - UnifiedSkySystem — consolidated sky system (Nishita + AtmosphericScattering)
 * - AtmospherePipeline — unified sky → fog → exposure pipeline
 * - LightingOrchestrator — high-level preset-based lighting setup
 * - LightingRegistry — strategy pattern registry for lighting presets
 * - NodeLightBridge — connects node executor lights to the orchestrator
 * - CascadedShadowMaps — CSM for large outdoor scenes
 * - HDRISystem — Enhanced HDRI loading with EXR support, rotation, preview
 * - SkyLightingSystem — Nishita-integrated, physically-based sky
 * - LightingSystem — General lighting system
 * - ThreePointLightingSystem — Studio lighting
 *
 * Deprecated files REMOVED:
 * - SkyLighting.ts (deprecated re-export of SkyLightingSystem)
 * - sky-lighting.ts (deprecated function-based utility)
 */

// ── Unified Sky System (consolidated Nishita + Scattering) ──────────────────
export { UnifiedSkySystem, createUnifiedSky } from './UnifiedSkySystem';
export type { SkyMode, UnifiedSkyConfig, SkyResult } from './UnifiedSkySystem';

// ── Unified Atmosphere Pipeline ─────────────────────────────────────────────
export {
  AtmospherePipeline,
  DEFAULT_ATMOSPHERE_CONFIG,
  type AtmospherePipelineConfig,
  type AtmospherePipelineResult,
  type TimeOfDay,
} from './AtmospherePipeline';

// ── Lighting Orchestrator ───────────────────────────────────────────────────
export {
  LightingOrchestrator,
  LIGHTING_PRESETS,
  type LightingPresetType,
  type LightingPreset,
} from './LightingOrchestrator';

// ── Lighting Registry (Strategy Pattern) ────────────────────────────────────
export {
  LightingRegistry,
  IndoorLightingStrategy,
  OutdoorLightingStrategy,
  StudioLightingStrategy,
  DramaticLightingStrategy,
  NaturalLightingStrategy,
} from './LightingRegistry';
export type {
  LightingPresetStrategy,
  LightingPresetResult,
} from './LightingRegistry';

// ── Node Light Bridge ───────────────────────────────────────────────────────
export {
  NodeLightBridge,
  bridgeLightNode,
} from './NodeLightBridge';
export type {
  NodeLightType,
  NodeLightResult,
} from './NodeLightBridge';

// ── Cascaded Shadow Maps ────────────────────────────────────────────────────
export { CascadedShadowMaps, createCSM } from './CascadedShadowMaps';
export type { CSMConfig, CascadeData } from './CascadedShadowMaps';

// ── HDRI System (EXR + HDR loading, rotation, preview) ──────────────────────
export { HDRISystem, createHDRISystem } from './HDRISystem';
export type { HDRIConfig } from './HDRISystem';

// ── Nishita-integrated sky lighting (primary sky solution) ──────────────────
export { SkyLightingSystem, createSkyLighting } from './SkyLightingSystem';
export type { SkyLightingSystemConfig } from './SkyLightingSystem';

// ── General lighting system ─────────────────────────────────────────────────
export { LightingSystem } from './LightingSystem';
export type { LightingConfig, LightPreset } from './LightingSystem';

// ── Three-point studio lighting ─────────────────────────────────────────────
export { ThreePointLightingSystem } from './ThreePointLighting';
export type { ThreePointLightingConfig } from './ThreePointLighting';

// ── Blackbody Temperature Shader ────────────────────────────────────────────
export {
  blackbodyToRGB,
  blackbodyToHex,
  createBlackbodyLight,
  createBlackbodySpotLight,
  createBlackbodyDirectionalLight,
  updateLightTemperature,
  getLuminousEfficacy,
  BlackbodyLightPresets,
  COLOR_TEMPERATURES,
} from './BlackbodyShader';
