# infinigen-r3f Overhaul Guide

## Background

This codebase is an R3F (React Three Fiber) port of Princeton's Infinigen procedural generation system. After completing Waves 1–2 of feature implementation and a code audit that identified structural issues (duplication, fractures, inconsistencies between old enum/type system and new registry pattern), we are performing a **full clean overhaul** — building system by system from scratch rather than patching.

**Completed Systems:**
- ✅ **System 1: Node System & Execution Pipeline** — Registry-based architecture with O(1) alias resolution, fixed MeshBoolean, clean executor dispatch, proper NodeEvaluator with topological sort
- ✅ **System 2: Terrain & Landscape System** — (done in prior sessions)
- ✅ **System 3: Constraint & Solver System** — (done in prior sessions)
- ✅ **System 4: Material & Shader System** — (done in prior sessions)
- ✅ **System A: Placement, Camera & Scene Composition** — (done in this session)
- ✅ **System B: Vegetation & Plant System** — (done in this session)
- ✅ **System C: Lighting & Atmosphere System** — (done in this session)

**All overhaul targets are COMPLETE.**

---

## System A: Placement, Camera & Scene Composition

### Current Architecture

```
src/core/placement/
├── DensityPlacementSystem.ts     (890 lines) — Two-phase scatter+populate, CameraPoseSearchEngine
├── GPUScatterSystem.ts           — GPU-accelerated scatter
├── RRTPathFinder.ts              — Path planning
├── ScatterP2Features.ts          — Phase 2 scatter features
├── SurfaceGenerator.ts           — Surface sampling
├── TaperDensitySystem.ts         — Tapered density
├── VolumeScatterDensity.ts       — Volume scatter
├── density.ts                    — Density utility functions
├── instance-scatter.ts           — Instance scatter
├── advanced/
│   ├── AdvancedPlacer.ts         (875 lines) — Poisson disk, relaxation, collision avoidance
│   ├── DensityPlacementSystem.ts — DUPLICATE of top-level DensityPlacementSystem.ts
│   ├── DetailPlacementSystem.ts  — Detail-level placement
│   ├── OcclusionMesher.ts        — Occlusion meshing
│   └── ScatterSystem.ts          — Scatter system
├── camera/
│   ├── CameraSystem.ts           (606 lines) — Camera placement with constraints
│   ├── CameraPoseProposer.ts     (297 lines) — Candidate camera positions
│   ├── CameraParameterExporter.ts — Camera export
│   ├── CameraProperties.ts       — Camera property types
│   ├── CameraTypes.ts            — Camera type definitions
│   ├── DepthOfField.ts           — DOF system
│   ├── techniques/               — AutoPlacement, RuleOfThirds, Framing, LeadingLines, ViewpointSelection
│   └── trajectories/             — Crane, Dolly, Handheld, Orbit, Pan, Tracking shots
├── floorplan/
│   ├── FloorPlanGenerator.ts     — Indoor floor plans
│   └── types.ts
└── domain/
    ├── types.ts
    └── index.ts

src/assets/composition/
├── CompositionEngine.ts          (1462 lines) — Scene composition rules, constraints, templates
├── NatureSceneComposer.ts        (1095 lines) — Full nature scene pipeline
├── IndoorSceneComposer.ts        — Indoor scene composition
├── SceneObjectFactory.ts         — Object factory for scene elements
├── ExpandedScenePresets.ts        — Extended scene presets
├── ScenePresets.ts               — Scene preset definitions
├── PlacementMaskSystem.ts        — Placement mask evaluation
├── VisibilityCuller.ts           — Visibility culling
├── rules/BasicRules.ts           — Composition rules
└── templates/InteriorTemplates.ts — Interior templates
```

### Issues Found

1. **DUPLICATE: `DensityPlacementSystem.ts`** exists at BOTH `src/core/placement/` and `src/core/placement/advanced/` — 890 lines each, likely diverged
2. **FRAGMENTED: Camera pose search** — `CameraPoseSearchEngine` is embedded in `DensityPlacementSystem.ts` instead of the `camera/` directory
3. **FRAGMENTED: Scatter systems** — `GPUScatterSystem`, `ScatterSystem`, `instance-scatter`, `VolumeScatterDensity`, `TaperDensitySystem`, `ScatterP2Features` all overlap
4. **INCONSISTENT: Tag system** — `CameraSystem.ts` imports from old `constraints/tags/index` instead of new `UnifiedTagSystem`
5. **MISPLACED: PlacementMaskSystem** — lives in `assets/composition/` but is a core placement concern
6. **GOD CLASS: CompositionEngine** — 1462 lines doing too many things (rules, spatial queries, templates, scoring)
7. **GOD CLASS: NatureSceneComposer** — 1095 lines, tightly coupled to terrain, biomes, vegetation
8. **DEPRECATED: sky-lighting.ts** — still exists as compatibility shim
9. **DUPLICATE: `SceneGraphNode`** — defined locally in CompositionEngine instead of using a shared type

### Overhaul Plan

#### Phase A: Placement Registry & Unified Scatter
- Create `PlacementRegistry` — single source of truth for placement strategies
- Consolidate all scatter systems into `UnifiedScatterSystem` with strategy pattern
- Merge the two `DensityPlacementSystem.ts` files
- Move `PlacementMaskSystem` from composition → placement
- Create shared `GeometryMerger` utility (stop copy-pasting `mergeGeometries`)

#### Phase B: Camera System Unification
- Extract `CameraPoseSearchEngine` from `DensityPlacementSystem.ts` → `camera/CameraPoseSearchEngine.ts`
- Unify `CameraSystem`, `CameraPoseProposer`, `CameraPoseSearchEngine` into `CameraOrchestrator`
- Fix tag imports to use `UnifiedTagSystem`
- Create `CameraRegistry` for trajectory types (strategy pattern)

#### Phase C: Composition Refactoring
- Split `CompositionEngine` into: `CompositionRules`, `SpatialIndex`, `CompositionScorer`
- Define shared `SceneGraphNode` type in `core/types.ts`
- Simplify `NatureSceneComposer` to delegate to subsystems rather than doing everything
- Wire everything through the pipeline cleanly

---

## System B: Vegetation & Plant System

### Current Architecture

~25,000 lines across 54 files in `src/assets/objects/vegetation/` plus ~20 related files elsewhere.

### Issues Found

1. **CRITICAL: 10+ copies of `mergeGeometries()`** — copy-pasted across TreeGenerator, LSystemTreeGenerator, LSystemEngine, BranchSkinner, TreeSkeletonMeshBuilder, ShrubGenerator, VegetationP2Features, ForestFloorScatter, etc.
2. **DUPLICATE: Two L-system implementations** — `LSystemTreeGenerator.ts` (808 lines) and `LSystemEngine.ts` (745 lines) with different type interfaces, different presets, different class hierarchies
3. **DUPLICATE: Two RootSystemGenerator** — in `VegetationP2Features.ts` and `trees/RootSystemGenerator.ts`
4. **DUPLICATE: Season types** — `'spring' | 'summer' | 'autumn' | 'winter'` redefined 5+ times
5. **DUPLICATE: Tree species presets** — exist in 5 different places with different schemas
6. **MISPLACED: Non-vegetation** — jellyfish, dragonfly, beetle, crustacean in `vegetation/` directory
7. **FRAGMENTED: Grass** — 3+ grass systems (GrassGenerator, GrasslandGenerator, GrassScatterSystem)
8. **UNUSED: SpatialGrid** in SpaceColonization — constructed but never used
9. **FRAGMENTED: Scatter** — spread across 4 locations

### Overhaul Plan

#### Phase A: Shared Utilities & Deduplication
- Create `src/assets/utils/GeometryMergePipeline.ts` — single `mergeGeometries()` for the whole project
- Replace all 10+ copies with import from the shared utility
- Create `src/assets/vegetation/types.ts` — shared Season type, VegetationCategory, etc.
- Create `src/assets/vegetation/SpeciesRegistry.ts` — single source of truth for tree/plant species presets

#### Phase B: L-System Unification
- Keep `LSystemEngine.ts` as the canonical L-system engine
- Refactor `LSystemTreeGenerator.ts` to delegate to `LSystemEngine` (thin adapter)
- Remove duplicate types and turtle implementations

#### Phase C: Generator Consolidation
- Merge duplicate `RootSystemGenerator` — keep the 1006-line version
- Merge duplicate `SeasonAwareSelector` — keep the 1215-line version in scatter/seasonal
- Consolidate grass into single `GrassSystem` (GrassGenerator + GrassScatterSystem)
- Move misplaced creatures (jellyfish, dragonfly, beetle, crustacean) to `objects/creatures/`
- Fix `SpatialGrid` in SpaceColonization to actually accelerate queries

---

## System C: Lighting & Atmosphere System

### Current Architecture

```
src/assets/lighting/
├── LightingSystem.ts             (417 lines) — Procedural lighting presets
├── SkyLighting.ts                (219 lines) — DEPRECATED, re-exports SkyLightingSystem
├── SkyLightingSystem.ts          (694 lines) — Nishita-integrated sky + lighting
├── ThreePointLighting.ts         (260 lines) — Studio lighting
├── sky-lighting.ts               (116 lines) — DEPRECATED legacy shim
└── index.ts                      (36 lines)

src/assets/weather/
├── FogSystem.ts                  (333 lines) — Volumetric fog
├── LightningSystem.ts            (375 lines) — Lightning effects
├── NishitaSky.ts                 (648 lines) — Physical sky model
└── atmosphere/
    ├── AtmosphericScattering.ts  (434 lines) — Rayleigh/Mie scattering
    ├── AtmosphericSky.ts         (495 lines) — Another sky implementation
    └── VolumetricClouds.ts       (761 lines) — Raymarched clouds

src/core/rendering/lighting/
├── ExposureControl.ts            (327 lines) — Auto exposure + tone mapping
└── LightProbeSystem.ts           (535 lines) — SH irradiance volume

src/core/nodes/light/
├── LightNodes.ts                 — Light node type definitions
└── index.ts
```

### Issues Found

1. **DUPLICATE: Three sky implementations** — `SkyLightingSystem` (Nishita-backed), `AtmosphericSky` (Rayleigh/Mie), `AtmosphericScattering` (also Rayleigh/Mie)
2. **DUPLICATE: Two atmospheric scattering implementations** — `AtmosphericScattering.ts` and `AtmosphericSky.ts` both implement Rayleigh/Mie with different interfaces
3. **DEPRECATED: Two legacy files** — `SkyLighting.ts` and `sky-lighting.ts` both marked deprecated but still exist
4. **FRAGMENTED: Lighting spread across 4 directories** — `assets/lighting/`, `assets/weather/`, `assets/weather/atmosphere/`, `core/rendering/lighting/`
5. **DISCONNECTED: Node executor lights** — ShaderNodeEmission_PointLight/SpotLight/SunLight/AreaLight executors exist but aren't connected to the lighting system
6. **MISSING: Light scene integration** — No single orchestrator connecting sky → lighting → fog → atmosphere → exposure

### Overhaul Plan

#### Phase A: Sky Unification
- Consolidate three sky systems into `UnifiedSkySystem`
  - Nishita sky as the primary physical model
  - AtmosphericScattering as fallback/simplified mode
  - Remove AtmosphericSky (duplicate of AtmosphericScattering)
- Delete both deprecated files (`SkyLighting.ts`, `sky-lighting.ts`)

#### Phase B: Lighting Architecture
- Create `LightingOrchestrator` — single class connecting sky, lights, exposure, fog
- Create `LightingRegistry` — strategy pattern for light presets (indoor/outdoor/studio/dramatic)
- Wire node executor lights (PointLight, SpotLight, etc.) into the lighting system
- Move `ThreePointLighting` → become a `LightingPreset` in the registry

#### Phase C: Atmosphere Pipeline
- Create `AtmospherePipeline` — unified pipeline: sky → scattering → fog → clouds → exposure
- Keep `VolumetricClouds` as a subsystem (it's well-implemented)
- Keep `ExposureControl` and `LightProbeSystem` as subsystems
- Integrate fog system with atmosphere pipeline (height-based density linked to scattering)
- Delete deprecated shims

---

## Overhaul Principles

1. **Registry Pattern** — Every extensible system gets a registry (node types, executors, placement strategies, lighting presets, species presets)
2. **Single Source of Truth** — No duplicate type definitions, no copy-pasted utilities, no diverged files
3. **Strategy Pattern** — Pluggable algorithms (scatter strategies, camera trajectories, lighting presets)
4. **No Deprecated Shims** — Clean break, no backward-compatibility wrappers
5. **Test as You Go** — Each phase should result in a compilable codebase
6. **Barrel Exports** — Clean `index.ts` files for each module

## Implementation Order

1. **System A first** — Placement, Camera & Composition (foundation for everything else)
2. **System B second** — Vegetation (biggest system, needs placement to work)
3. **System C third** — Lighting & Atmosphere (needs placement for light positioning)

