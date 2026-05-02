# CactusGenerator Implementation

## Task ID
Task: Implement CactusGenerator for infinigen-r3f

## Summary
Created a comprehensive procedural cactus generator ported from the original Python infinigen cactus system. The implementation follows the existing R3F project patterns (TreeGenerator, ObjectRegistry) and supports 7 visually distinct cactus variants.

## Files Created

### 1. `/home/z/my-project/infinigen-r3f/src/assets/objects/vegetation/cactus/CactusGenerator.ts`
- **~1180 lines** of TypeScript
- `CactusGenerator` class with seeded random generation
- `createCactus()` factory function
- 7 variant-specific generator functions:
  - `generateColumnar()` - Tall branching columns with star cross-section (ported from ColumnarBaseCactusFactory)
  - `generateGlobular()` - Rounded globe with star cross-section (ported from GlobularBaseCactusFactory)
  - `generateKalidium()` - Coral-like branching lattice (ported from KalidiumBaseCactusFactory)
  - `generatePricklyPear()` - Flat pad cactus stacked recursively (ported from PrickyPearBaseCactusFactory)
  - `generateSpike()` - Tall thin many-ribbed column
  - `generateBarrel()` - Short wide prominently ribbed barrel shape
  - `generateSaguaro()` - Classic tall column with upward-curving arms
- Geometry helpers: `columnarProfilePoints()`, `globularProfilePoints()`, `applyRibDisplacement()`, `applyNoiseDisplacement()`
- Spine generation: `generateSpines()` - distributed thin cones on surface (ported from spike.py)
- Flower generation: `generateFlower()` - optional top flower with petals
- Material caching for body, spine, and flower materials
- `generateField()` method for scattering multiple cacti
- Proper TypeScript types: `CactusVariant`, `CactusVariantConfig`, `CactusGeneratorOptions`

### 2. `/home/z/my-project/infinigen-r3f/src/assets/objects/vegetation/cactus/index.ts`
- Re-exports all public types and factory function

### 3. Modified: `/home/z/my-project/infinigen-r3f/src/assets/objects/ObjectRegistry.ts`
- Added import of `CactusGenerator` and `CACTUS_VARIANTS`
- Auto-registers `CactusGenerator` under `vegetation/cactus` category
- Auto-registers each variant as `Cactus_Columnar`, `Cactus_Globular`, etc.

## Key Design Decisions
- Used `LatheGeometry` for columnar/globular/barrel bodies (matching original's curve-to-mesh approach)
- Used `SphereGeometry` scaled for PricklyPear pads (matching original's circular profile sweep)
- Used recursive cylinder placement for Kalidium (approximating original's volumetric grid approach)
- Rib displacement via angle-based vertex displacement (approximating original's star profile curve)
- All randomness via `SeededRandom` from `@/core/util/math/index`
- Material caching by color hex for performance
- No `any` types - fully typed

## TypeScript Compilation
- Verified with `tsc --noEmit` - zero errors
