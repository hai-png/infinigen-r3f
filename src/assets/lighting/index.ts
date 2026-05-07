/**
 * Lighting Module Exports
 *
 * Canonical exports:
 * - AtmospherePipeline — unified sky → fog → exposure pipeline
 * - LightingOrchestrator — high-level preset-based lighting setup
 * - SkyLightingSystem — Nishita-integrated, physically-based sky
 * - LightingSystem — General lighting system
 * - ThreePointLightingSystem — Studio lighting
 *
 * Deprecated files REMOVED:
 * - SkyLighting.ts (deprecated re-export of SkyLightingSystem)
 * - sky-lighting.ts (deprecated function-based utility)
 */

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

// ── Nishita-integrated sky lighting (primary sky solution) ──────────────────
export { SkyLightingSystem, createSkyLighting } from './SkyLightingSystem';
export type { SkyLightingSystemConfig } from './SkyLightingSystem';

// ── General lighting system ─────────────────────────────────────────────────
export { LightingSystem } from './LightingSystem';
export type { LightingConfig, LightPreset } from './LightingSystem';

// ── Three-point studio lighting ─────────────────────────────────────────────
export { ThreePointLightingSystem } from './ThreePointLighting';
export type { ThreePointLightingConfig } from './ThreePointLighting';
