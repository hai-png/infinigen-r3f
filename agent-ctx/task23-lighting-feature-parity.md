# Task 23: Lighting Feature Parity

## Summary
Implemented 5 feature parity items for the infinigen-r3f project: Cascaded Shadow Maps, HDRI Enhancement, Floating Objects on Water, Near-Camera Point Sampling, and barrel export updates.

## Files Created
1. `src/assets/lighting/CascadedShadowMaps.ts` (~380 lines) — CSM system with practical split scheme, PCF soft shadows
2. `src/assets/lighting/HDRISystem.ts` (~430 lines) — HDRI loading with EXR support, rotation, random selection, preview

## Files Modified
3. `src/core/placement/DensityPlacementSystem.ts` — Added `makePlaceholdersFloat()` method
4. `src/core/placement/ScatterRegistry.ts` — Added `NearCameraScatterConfig`, `NearCameraScatterStrategy`, registered as `'near_camera'`
5. `src/core/placement/index.ts` — Added exports for NearCameraScatterStrategy and NearCameraScatterConfig
6. `src/assets/lighting/index.ts` — Added CSM and HDRI exports

## TypeScript Verification
- Zero new errors introduced
- Pre-existing @/ path alias errors in DensityPlacementSystem.ts and ScatterRegistry.ts remain unchanged
