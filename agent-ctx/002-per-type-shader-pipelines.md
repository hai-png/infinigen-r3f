# Phase 2, Item 2: Per-Type Shader Pipelines

## Task ID
002-per-type-shader-pipelines

## Agent
shader-pipeline-agent

## Summary
Created specialized per-type shader pipeline generators that replace the generic noise-varied approach. Each pipeline uses custom GLSL shaders for the best visual quality.

## Files Created (3,871 lines total)

### Shared GLSL Utilities (`src/assets/shaders/common/`)
| File | Lines | Purpose |
|------|-------|---------|
| `NoiseGLSL.ts` | 450 | 3D Simplex noise, 2D Simplex noise, Perlin 3D, FBM, Musgrave variants (fBm, multifractal, ridged, hetero-terrain), domain warping, HSV↔RGB, value noise |
| `VoronoiGLSL.ts` | 251 | 2D/3D Voronoi with F1/F2/edge distance, animated Voronoi with time parameter, fast edge-only computation |
| `BlackbodyGLSL.ts` | 83 | Planck's law approximation for blackbody color temperature → RGB conversion (1000-40000K) |
| `PBRGLSL.ts` | 140 | Cook-Torrance PBR (GGX NDF, Smith geometry, Fresnel-Schlick), anisotropic GGX BRDF |
| `index.ts` | 32 | Re-exports all GLSL snippets |

### Wood Ring Pattern Shader (`src/assets/materials/wood/`)
| File | Lines | Purpose |
|------|-------|---------|
| `WoodRingShader.ts` | 624 | `WoodRingMaterialFactory` with 8 species presets (oak, pine, walnut, mahogany, cherry, birch, maple, teak), concentric ring patterns via `sin(dist * freq + noise)`, medullary rays, HSV color variation, noise-driven roughness, normal perturbation, canvas-based texture baking |

### Metal Shader Pipelines (`src/assets/materials/metal/`)
| File | Lines | Purpose |
|------|-------|---------|
| `BrushedMetalShader.ts` | 428 | `BrushedMetalFactory` with 4 metal type presets (stainless steel, aluminum, titanium, nickel), 4 brush directions (horizontal, vertical, radial, cross-hatched), anisotropic GGX BRDF, colored Fresnel for metals, brush line density/variation, normal map generation |
| `HammeredMetalShader.ts` | 372 | `HammeredMetalFactory` with Voronoi dimple pattern, variable dimple depth/size, tarnish/patina between dimples, canvas-based normal map baking |

### Terrain Surface Pipeline (`src/assets/materials/terrain/`)
| File | Lines | Purpose |
|------|-------|---------|
| `TerrainSurfaceShaderPipeline.ts` | 806 | `TerrainSurfaceFactory` supporting 12 terrain types (stone, sand, soil, dirt, mud, snow, ice, cobblestone, grass, water, lava, sand_dune), per-surface-type dedicated GLSL fragments, runtime blending between types, triplanar projection support |

### Lava Shader (`src/assets/materials/fluid/`)
| File | Lines | Purpose |
|------|-------|---------|
| `LavaShader.ts` | 379 | `LavaShaderFactory` with 5 presets (pahoehoe, aa, basaltic, andesitic, rhyolitic), 2-layer animated Voronoi DISTANCE_TO_EDGE, time-driven animation, blackbody emission (1000-2500K), noise-driven emission strength, crack width variation |

### Whitewater/Foam Shader (`src/assets/materials/fluid/`)
| File | Lines | Purpose |
|------|-------|---------|
| `WhitewaterShader.ts` | 306 | `WhitewaterMaterialFactory` with 5 presets (rapid, breaker, wake, boil, splash), MeshPhysicalMaterial with transmission/thickness/SSS, white base + blue SSS tint, IOR 1.1, volume scattering, procedural bubble texture |

## Key Design Decisions
1. **Shared GLSL utilities**: All noise/voronoi/PBR functions are in `src/assets/shaders/common/` to avoid duplication across shaders
2. **Factory pattern**: Each shader type uses a Factory class that takes presets and seeds, generates ShaderMaterial or MeshPhysicalMaterial
3. **Fallback baking**: Wood and metal factories include `generateTextures()` / `generateNormalMap()` methods for canvas-based fallback rendering
4. **PBR in-shader**: All custom ShaderMaterials include full PBR lighting (Fresnel, GGX, geometry) so they render correctly without the Three.js lighting pipeline
5. **Tone mapping + gamma**: All fragment shaders include Reinhard tone mapping and gamma correction for consistent output
6. **TypeScript types**: All configuration interfaces are fully typed with JSDoc comments

## Compilation Status
- All new files compile without TypeScript errors
- Pre-existing errors in `NURBSToArmature.ts` are unrelated
