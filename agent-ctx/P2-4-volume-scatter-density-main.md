# P2-4: Volume Scatter Density with SDF Queries

**Task ID**: P2-4  
**Agent**: Main Agent  
**Date**: 2026-05-05  
**Status**: Completed

## Summary

Created `/home/z/my-project/infinigen-r3f/src/core/placement/VolumeScatterDensity.ts` — a ~1168-line file implementing 3D volumetric density sampling for the scatter placement system using SDF queries from TerrainElementSystem.

## What was implemented

### 1. `VolumeDensityField` class
- Constructor takes 3D bounding box, resolution tuple `[resX, resY, resZ]`, and optional SDF evaluator
- `evaluate(worldPos)` — returns density at a 3D point considering under-canopy boost, underwater suppression, cave interior variation, and slope-based density
- `buildField()` — evaluates density on a 3D grid, returns flat Float32Array
- `sampleDensity(x, y, z)` — trilinear interpolation from the pre-built field
- `toDataTexture()` — converts to `THREE.Data3DTexture` for GPU consumption
- SDF evaluator is optional — falls back to height-only queries if not provided
- All density values clamped to [0, 2] range
- Internal terrain height estimation via binary search on SDF
- Slope estimation via finite differences on terrain height

### 2. `VolumeDensityModifiers` — collection of density modifier functions
- `underCanopyBoost(params)` — increases density below canopy height
- `underwaterSuppression(params)` — reduces land plant density below water; invertible for aquatic
- `caveInteriorBoost(params)` — increases mushroom/lichen density inside caves (uses SDF auxiliary data)
- `caveGrassSuppression(params)` — companion function suppressing grass in caves
- `slopeDensityModifier(params)` — reduces density on steep slopes
- `altitudeFalloff(params)` — reduces density at high elevations

### 3. `VolumeScatterConfig` interface
- `baseDensity: number` — base density multiplier
- `modifiers: VolumeDensityModifierConfig[]` — array of modifier configs (tagged union)
- `resolution: [number, number, number]` — 3D grid resolution
- `bounds: THREE.Box3` — world-space bounds

### 4. Biome factory: `createVolumeDensityForBiome()`
- `'forest'`: under-canopy boost + slope modifier
- `'underwater'`: underwater suppression inverted for aquatic plants
- `'cave'`: cave interior boost
- `'desert'`: slope modifier only
- `'mountain'`: slope modifier + altitude falloff

### 5. `integrateWithScatterSystem()` function
- Takes a built VolumeDensityField and wires it into an InstanceScatterSystem
- Overrides the density function with 3D-aware version
- Optionally projects the 3D field to a 2D densityMap for the scatter system
- Uses trilinear interpolation if field is pre-built, falls back to direct evaluation

### Additional utilities
- `sampleDensityMap()` — bilinear interpolation on projected 2D density maps
- `evaluateBatch()` — batch density evaluation
- `computeFieldStats()` — statistics (min, max, mean, stdDev, empty/high fractions)

## Type-checking
The file passes TypeScript type-checking (`npx tsc --noEmit` from the `infinigen-r3f` directory shows zero errors for this file).

## Design decisions
- SDF evaluator is optional (type `SDFEvaluator | null`) to avoid hard dependency on TerrainElementSystem
- Modifier configs are a tagged union (discriminated on `type`) for type safety
- Density values in [0, 2] as specified: 1 = base, 0 = nothing, 2 = double
- Terrain height estimated via 16-iteration binary search on the SDF
- Caches for terrain height and slope are bounded (10K entries) with LRU-style eviction
- `Data3DTexture` uses `RedFormat` with `FloatType` and `LinearFilter` for smooth sampling
