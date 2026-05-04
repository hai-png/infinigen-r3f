# Phase 2 Items 5 & 8: Polygon Booleans & Fluid Scale/Materials

## Task ID: 005-polygon-booleans-fluid-scale
## Agent: main

## Summary

Implemented two Phase 2 features for the Infinigen R3F project:

### Part A: Exact Polygon Booleans (Item 5)

Created the Martinez-Rueda-Feito polygon clipping algorithm for exact 2D boolean operations, replacing the grid-sampling approximation in the floor plan generator.

**New Files:**
- `src/core/util/geometry/MartinezPolygonClipping.ts` - Full MRF algorithm implementation with:
  - `union()`, `intersection()`, `difference()`, `xor()` operations
  - Sweep-line status structure with priority queue
  - Intersection point classification (entering/exiting)
  - Support for non-convex polygons and floating-point precision (epsilon = 1e-10)
  - Performance monitoring for 1000+ vertex polygons

- `src/core/util/geometry/Polygon2DOperations.ts` - High-level polygon operations API:
  - Boolean operations via Martinez algorithm
  - `area()`, `centroid()`, `contains()`, `intersects()`, `perimeter()`, `compactness()`
  - `buffer()`/`offset()` with arc segment insertion
  - `simplify()` via Douglas-Peucker
  - `convexHull()` via Quickhull algorithm
  - `bounds()`, `ensureCCW()`, `ensureCW()`, `rect()`, `distance()`

- `src/core/util/geometry/index.ts` - Re-exports

**Modified Files:**
- `src/core/placement/floorplan/FloorPlanGenerator.ts` - Integrated exact polygon operations:
  - `mergePolygons()` now uses `PolygonOps.union()` with fallback to convex hull
  - `splitPolygon()` now uses `PolygonOps.intersection()` with half-planes, with fallback
  - `approximateSharedBoundary()` now uses `PolygonOps.intersection()` for exact overlap detection

### Part B: Fluid Scale and Materials (Item 8)

**Modified Files:**
- `src/sim/fluid/FLIPFluidSolver.ts`:
  - Default maxParticles: 10,000 → 20,000
  - Added `DomainSize`, `particlesPerMeter`, `particleDensity`, `adaptiveTimeStep` config options
  - Auto-compute particle count from domain size
  - CFL-based adaptive time-stepping

- `src/sim/fluid/SPHSurfaceExtractor.ts`:
  - Added `targetParticleCount` config option (default 2000, up from implicit 500)

- `src/sim/fluid/FluidSurfaceRenderer.ts`:
  - Added `FluidRenderIntegration` class with:
    - `createFluidMesh()` - direct mesh output from FLIP to renderer
    - `addWhitewaterLayer()` - foam/spray/bubble overlay via instanced meshes
    - `createUnderwaterEffect()` - depth-based refraction shader

**New Files:**
- `src/sim/fluid/LavaFlowPatterns.ts` - Lava-specific simulation:
  - `LavaFlowSimulation` class with temperature field per particle
  - Stefan-Boltzmann radiative cooling model
  - Arrhenius-type viscosity relationship
  - Three flow patterns: Pahoehoe (smooth/ropy), Aa (rough/blocky), Columnar (hexagonal)
  - Temperature data texture for LavaShader integration
  - Surface displacement computation for each flow type

- `src/sim/fluid/WhitewaterGenerator.ts` - Whitewater generation system:
  - `WhitewaterSystem` class with spray, foam, and bubble particles
  - Source detection from velocity and vorticity thresholds
  - Spray: ballistic trajectories with gravity and wind
  - Foam: surface advection with fluid velocity
  - Bubbles: buoyancy-driven rise with fluid drag
  - `getRenderData()` for InstancedMesh rendering

- `src/sim/fluid/index.ts` - Updated exports for all new modules

## Compilation Status
- All new files compile without TypeScript errors
- No new lint errors introduced
- Dev server running successfully
