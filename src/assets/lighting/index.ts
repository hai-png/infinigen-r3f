/**
 * Lighting Module Exports
 *
 * Canonical exports:
 * - SkyLightingSystem (from ./SkyLightingSystem) — Nishita-integrated, physically-based
 * - LightingSystem — General lighting system
 * - ThreePointLightingSystem — Studio lighting
 *
 * Deprecated exports (retained for backward compatibility):
 * - LegacySkyLightingSystem (from ./SkyLighting) — old HemisphereLight + gradient sky
 * - setupSkyLighting, LegacySkyLighting (from ./sky-lighting) — function-based utility
 * - SkyConfig (from ./sky-lighting) — legacy config type
 */

// ── Canonical: Nishita-integrated sky lighting (primary sky solution) ──────
export { SkyLightingSystem, createSkyLighting } from './SkyLightingSystem';
export type { SkyLightingSystemConfig } from './SkyLightingSystem';

// ── Canonical: General lighting system ─────────────────────────────────────
export { LightingSystem } from './LightingSystem';
export type { LightingConfig, LightPreset } from './LightingSystem';

// ── Canonical: Three-point studio lighting ─────────────────────────────────
export { ThreePointLightingSystem } from './ThreePointLighting';
export type { ThreePointLightingConfig } from './ThreePointLighting';

// ── Deprecated: Legacy sky lighting (gradient sphere + HemisphereLight) ────
/**
 * @deprecated Use `SkyLightingSystem` from `./SkyLightingSystem` instead.
 * Re-exported as `LegacySkyLightingSystem` to avoid name collision.
 */
export { SkyLightingSystem as LegacySkyLightingSystem, type SkyLightingConfig as LegacySkyLightingConfig } from './SkyLighting';

// ── Deprecated: Function-based sky lighting utility ────────────────────────
export { setupSkyLighting, LegacySkyLighting } from './sky-lighting';
export type { SkyConfig } from './sky-lighting';
