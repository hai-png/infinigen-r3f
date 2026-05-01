# Task: Fix Material Generators and Data Pipeline in infinigen-r3f

## Task ID: 1-main-developer

## Summary of Changes

### Part A: Material Generators (14 files fixed)

**Critical Fix: `createBaseMaterial()` override**
The `BaseMaterialGenerator.createBaseMaterial()` throws an error, but most generators called it without overriding. Every generator now properly overrides it with the correct material type.

1. **WoodGenerator.ts** - Override `createBaseMaterial()` → `MeshStandardMaterial`, added plywood texture, roughness map, RepeatWrapping on all textures
2. **MetalGenerator.ts** - Override `createBaseMaterial()` → `MeshStandardMaterial` with `metalness: 1.0`, added rust texture generation (noise-threshold rust patches overlaid on color map), brushed normal map with direction support, metal color map with noise variation
3. **FabricGenerator.ts** - Override `createBaseMaterial()` → `MeshStandardMaterial`, added fabric-type roughness adjustments (silk=0.3, velvet=0.9, etc.), weave-specific normal map perturbation
4. **CeramicGenerator.ts** - Override `createBaseMaterial()` → `MeshStandardMaterial`, fixed tile grout rendering (per-tile color variation), proper crackle multi-segment lines
5. **GlassGenerator.ts** - Already correct (MeshPhysicalMaterial with transmission/IOR), added frosted roughness map, textured normal map, pattern normal map improvements
6. **LeatherGenerator.ts** - Override `createBaseMaterial()` → `MeshStandardMaterial`, added suede vs full-grain grain patterns, wear spot generation via pixel manipulation
7. **TileGenerator.ts** - NEW FILE: BaseMaterialGenerator with tile grid + grout lines, 5 patterns (straight, herringbone, offset, diagonal, basketweave), per-tile color variation, grout normal depression, grout roughness contrast
8. **SurfaceDetail.ts** - Added `generateNormalDetail()` method with multi-octave normal perturbation, RepeatWrapping on all textures
9. **CoatingGenerator.ts** - Already correct (MeshPhysicalMaterial with clearcoat), verified
10. **Weathering.ts** - Added normal map perturbation (rust bumps, moss bumps, water stain depressions), UV damage fading (desaturation + lightening), dirt buildup in crevices via pixel manipulation
11. **WearGenerator.ts** - Added scratch normal perturbation (grooves with perpendicular normal offset), multi-segment scratch lines with slight curves, edge wear AO darkening
12. **PatternGenerator.ts** - Added RepeatWrapping, extended draw range for rotation support, added triangle geometric shape
13. **MaterialBlender.ts** - Implemented actual material property blending (color lerp, roughness/metalness/clearcoat/transmission/IOR interpolation), creates proper MeshStandardMaterial or MeshPhysicalMaterial based on inputs
14. **DecalSystem.ts** - Fixed `SeededRandom.nextFloat()` usage (was calling `rng.uniform()` which works but `nextFloat()` is clearer), added custom decal type with rounded rectangle

**Also fixed:**
- **BaseMaterialGenerator.ts** - Fixed `createTextureFromColor()` to return actual `CanvasTexture` instead of `{} as Texture`
- **CeramicTileMaterial.ts** - Fixed `NoiseUtils.perlin2D` reference (now uses `perlin2D` from MathUtils)
- **Tile index.ts** - Added exports for TileGenerator
- **materials/index.ts** - Added exports for all generators (Coating, Surface, Weathering, Wear, Pattern, Blender, Decal, Tile, Leather, Ceramic, Glass)

### Part B: Data Pipeline + HybridBridge

1. **DataPipeline.ts** - All `render*Image()` methods now use OffscreenCanvas + WebGLRenderer:
   - `renderColorImage()` - Standard scene render
   - `renderDepthImage()` - MeshDepthMaterial override scene
   - `renderNormalImage()` - MeshNormalMaterial override scene  
   - `renderSegmentationImage()` - Unique color per object instance
   - `renderAlbedoImage()` - MeshBasicMaterial with base color only
   - Extracted `createOffscreenRenderer()` and `canvasToImageUrl()` helpers

2. **HybridBridge.ts** - Major improvements:
   - Auto-reconnect with exponential backoff (1s → 30s max)
   - Per-request timeout handling with cleanup
   - Max pending requests limit (100)
   - Browser-only fallbacks for ALL methods:
     - `exportMjcf()` → generates basic MJCF XML
     - `generateProcedural()` → creates simple primitives (terrain heightmap, tree, box)
   - `getStatus()` method for connection diagnostics
   - Proper cleanup on disconnect (rejects all pending, clears queue)
   - Configurable via `HybridBridgeConfig` interface
   - `intentionallyClosed` flag prevents reconnect after manual disconnect
