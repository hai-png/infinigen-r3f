# Task 001: GPU Surface Shader Pipeline Integration

## Summary

Connected the existing GPU Surface Shader pipeline (`TerrainSurfaceShaderPipeline`) to the terrain generation pipeline in the infinigen-r3f project.

## Files Modified

1. **`src/terrain/core/TerrainGenerator.ts`** — Main integration point
   - Added `surfaceShaderConfig?: Partial<TerrainSurfaceConfig>` to `TerrainConfig` interface
   - Added `surfaceShaderPipeline` and `surfaceShaderInitialized` private fields
   - Pipeline is created in constructor when `surfaceShaderConfig` is provided
   - Added `initializeSurfaceShader(device?)` — async GPU initialization
   - Added `applySurfaceDisplacement(geometry, sdf)` — applies displacement via pipeline
   - Added `buildTerrainSDF(heightScale, worldSize, sdfResolution)` — converts heightmap to 3D SDF
   - Added `setSurfaceShaderConfig()` / `getSurfaceShaderConfig()` — runtime configuration
   - Added `isSurfaceShaderReady()` / `isSurfaceShaderEnabled()` / `getSurfaceShaderPipeline()`
   - Added `dispose()` — cleanup pipeline resources
   - All new code is additive — no breaking changes

2. **`src/terrain/mesher/TerrainMesher.ts`** — Mesher-level integration
   - Added `surfaceShaderPipeline` private field
   - Added `setSurfaceShaderPipeline(pipeline)` — attach/detach pipeline
   - Added `isSurfaceShaderReady()` — check pipeline status
   - Added `generateMeshWithDisplacement(terrainData, sdf?)` — async mesh gen + displacement
   - Added `generateChunkedMeshWithDisplacement(terrainData, cameraPos, sdf?)` — async chunked + displacement
   - Added `applyDisplacementToChunks(sdf)` — apply displacement to existing chunks in-place
   - Added `disposeSurfaceShader()` — detach pipeline reference
   - Displaced geometry properly replaces original in ChunkData with recomputed bounding volumes

3. **`src/terrain/mesher/ChunkedTerrainSystem.ts`** — Chunked terrain integration
   - Added `surfaceShaderPipeline` private field
   - Added `setSurfaceShaderPipeline(pipeline)` — attach/detach pipeline
   - Added `isSurfaceShaderReady()` — check pipeline status
   - Added `generateWithDisplacement(sdf?)` — async chunk generation + displacement
   - Added `applyDisplacementToChunks(sdf)` — apply displacement to existing chunks
   - Mesh geometry is updated after displacement, seams are re-stitched

4. **`src/terrain/core/index.ts`** — Barrel export
   - Re-exported `TerrainSurfaceConfig` type from core module for convenience

## Design Decisions

- **Opt-in by default**: The pipeline is only created when `surfaceShaderConfig` is provided in `TerrainConfig`. Without it, terrain generation behaves exactly as before.
- **Async initialization**: GPU pipeline init is async (`initializeSurfaceShader()`). CPU fallback works synchronously.
- **Graceful fallback**: If WebGPU is not available, the pipeline falls back to CPU-based displacement automatically. If displacement fails entirely, the original geometry is returned.
- **SDF from heightmap**: `buildTerrainSDF()` converts the 2D heightmap to a 3D SDF using vertical-distance approximation, which is efficient and works well for displacement refinement.
- **Ownership**: `TerrainGenerator` owns the pipeline instance. `TerrainMesher` and `ChunkedTerrainSystem` hold references (not ownership).
- **No breaking changes**: All existing synchronous methods (`generate()`, `generateMesh()`, `generateChunkedMesh()`) are unchanged. New async methods are additions.

## TypeScript

- Compiles cleanly with `tsc --noEmit` (no errors).
