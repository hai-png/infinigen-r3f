# P3-7: CSG Solidification Pipeline

## Task
Create `src/core/constraints/indoor/CSGSolidificationPipeline.ts` with BSP-based CSG boolean operations for cutting door/window openings in 3D wall geometry.

## What Was Done

### Analysis
- Reviewed `BlueprintSolidifier.ts` (1230 lines) — confirmed CSG subtraction was stubbed (frame meshes created but wall geometry not actually cut)
- Reviewed `CSGFracture.ts` — noted existing CSG patterns using `three-bvh-csg` library
- Reviewed `RoomSolvingPipeline.ts` — understood `FloorPlanSolution`, `Polygon2D`, `LineSegment2D` types

### Implementation — New File (1971 lines)

**Core CSG Engine (BSP-based):**

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| `CSGVertex` | Lightweight vertex with pos/normal/UV | `lerp()` for plane splitting |
| `CSGPolygon` | Convex polygon with plane | `flip()`, `triangulate()` |
| `CSGBSP` | BSP tree node | `build()`, `splitPolygon()`, `clipPolygons()`, `invert()`, `classifyPoint()` |
| `CSGBoolean` | High-level CSG ops | `subtract()`, `union()`, `intersect()`, `geometryToPolygons()`, `polygonsToGeometry()` |
| `BSPTree` | Public BSP API | `buildFromMesh()`, `clipPolygons()`, `classifyPoint()`, `invert()` |

**Pipeline:**

| Class/Type | Purpose |
|------------|---------|
| `CSGSolidificationPipeline` | Full 2D→3D with CSG openings |
| `OpeningType` enum | DOOR, WINDOW, ARCHWAY, PASSAGE |
| `OpeningConfig` interface | Position, dimensions, frame style, glass, etc. |
| `StaircaseConfig` interface | Tread/riser/handrail parameters |
| `FloorPlanConfig` interface | Wall thickness, heights, opening defaults |
| `OpeningResult` interface | Modified wall geometry + frame/glass meshes |

### CSG Algorithms

- **subtract(A, B)**: Build BSP from B → invert → clip A against inverted B (keep A outside B) → build BSP from clipped A → clip B against A (internal faces) → flip B faces → combine
- **union(A, B)**: Clip A against B (keep A outside B) → clip B against A (keep B outside A) → combine
- **intersect(A, B)**: Invert B → clip A (keep A inside B) → invert A → clip B (keep B inside A) → flip B faces → combine

### BSP Tree Implementation

- Epsilon-based vertex classification (COPLANAR=0, FRONT=1, BACK=2, SPANNING=3)
- Polygon splitting with linear interpolation of position, normal, and UV
- Coplanar polygons classified by normal alignment with partition plane
- Maximum depth cap of 128 levels for safety
- Tree inversion swaps front/back children and flips all planes/polygons

### TypeScript Fixes
- `Partial<T>` spread into required `T` fields — used explicit field-by-field construction with `??` fallback chains
- `BufferAttribute.getComponent()` removed — replaced with direct `indexAttr.array[i]` access

## Files
- **Created**: `src/core/constraints/indoor/CSGSolidificationPipeline.ts` (1971 lines)
- **No existing files modified** (avoids circular deps with BlueprintSolidifier)

## Compilation
Zero TypeScript errors from the new file (verified with `npx tsc --noEmit`).
