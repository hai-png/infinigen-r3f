/**
 * Node Compatibility Layer — Barrel Export
 *
 * Re-exports the public API from `CompatibilityLayer.ts` so that consumers
 * can import from a single path:
 *
 * ```ts
 * import {
 *   applyCompatibility,
 *   hasCompatibilityHandler,
 *   getRegisteredCompatibilityTypes,
 *   isSocketReference,
 *   resolveDeferredRef,
 *   resolveAllDeferred,
 *   mapDictKeys,
 * } from './compatibility';
 * ```
 *
 * @module core/nodes/compatibility
 */

export {
  // ── Main API ───────────────────────────────────────────────────────────
  applyCompatibility,
  hasCompatibilityHandler,
  getRegisteredCompatibilityTypes,
  resolveDeferredRef,
  resolveAllDeferred,

  // ── Utilities ──────────────────────────────────────────────────────────
  isSocketReference,
  mapDictKeys,
} from './CompatibilityLayer';

export type {
  // ── Types ──────────────────────────────────────────────────────────────
  CompatibilityResult,
  DeferredNodeSpec,
} from './CompatibilityLayer';
