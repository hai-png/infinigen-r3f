# Task: FruitGenerator Implementation

## Task ID: fruit-generator

## Agent: main

## Summary

Implemented standalone FruitGeometry generators for the infinigen-r3f project. Created 15 procedurally generated fruit types plus a FruitBowlGenerator, all with seeded random for deterministic generation.

## Files Created

1. **`src/assets/objects/food/FruitGenerator.ts`** (~1400 lines)
   - `FruitGenerator` class with `generate()` and `generateCollection()` methods
   - `FruitBowlGenerator` class with bowl geometry and fruit placement
   - `createFruit()` factory function
   - `createFruitBowl()` factory function
   - 15 individual fruit generator functions, each producing visually distinct geometry
   - Per-fruit configuration with HSV colors, scale multipliers, and stem/leaf options
   - Helper utilities: `applyNoiseDisplacement()`, `applyDimpleDisplacement()`, `createBasicStem()`, `createCalyxStem()`, `createLeaf()`

2. **`src/assets/objects/food/index.ts`**
   - Re-exports all public types, classes, and factory functions
   - Uses `export type` for type-only exports (isolatedModules compliance)

3. **`src/assets/objects/ObjectRegistry.ts`** (modified)
   - Added import of `FruitGenerator`, `FruitBowlGenerator`, `FRUIT_TYPES` from `./food`
   - Registered `FruitGenerator` under category `food/fruit`
   - Registered all 15 fruit types as `Fruit_{Type}` entries
   - Registered `FruitBowlGenerator` under category `food/fruit-bowl`

## Fruit Types Implemented

| Fruit | Geometry Approach | Key Features |
|-------|------------------|--------------|
| Apple | LatheGeometry + vertex displacement | Top/bottom indentations, stem, leaf |
| Strawberry | LatheGeometry + dimple displacement | Seed bumps, green calyx cap |
| Starfruit | ExtrudeGeometry (star shape) | 5-point star cross-section, tapered |
| Coconut | LatheGeometry + noise + dimples | Fibrous surface texture, husk cap |
| Durian | LatheGeometry + cone spikes | Spike protrusions on surface |
| Pineapple | LatheGeometry + diamond pattern | Faceted diamond eye pattern, leaf crown |
| Blackberry | Cluster of spheres | Drupelet aggregation, small stem |
| Banana | TubeGeometry + tapering | Curved arc, tapered ends |
| Orange | SphereGeometry + dimples | Pebbled peel texture, navel |
| Lemon | LatheGeometry (pointed oval) | Elongated with pointed tips |
| Peach | SphereGeometry + crease | Vertical crease indentation, fuzzy noise |
| Pear | LatheGeometry (pear profile) | Wide bottom, narrow top, stem + leaf |
| Cherry | SphereGeometry + curved tube stem | Small sphere with arched stem |
| Grape | Cluster of small spheres | Triangular berry arrangement |
| Mango | LatheGeometry + asymmetry | Asymmetric oval, one side flatter |

## Ported Logic from Original Python

- Apple shape control points from `apple.py:sample_shape_params`
- Strawberry shape control points from `strawberry.py:sample_shape_params`
- Starfruit star cross-section from `starfruit.py:sample_cross_section_params`
- Coconut shape + noise from `coconutgreen.py:sample_cross_section_params`
- Durian shape + spike displacement from `durian.py:sample_surface_params`
- HSV color parameters from all fruit files' `sample_surface_params`
- Stem parameters from all fruit files' `sample_stem_params`
- Surface bump/dimple utilities from `fruit_utils.py:nodegroup_surface_bump`
- Calyx stem from `fruit_utils.py:calyx_stem` reference

## TypeScript Compilation

Verified clean compilation with `npx tsc --noEmit` — exit code 0.
