# TypeScript Error Resolution - Comprehensive Implementation Plan

**Document Created:** 2025-06-18  
**Repository:** https://github.com/hai-png/infinigen-r3f  
**Current Status:** ~2,964 errors remaining (from ~3,500 starting)  
**Goal:** Systematically eliminate all TypeScript errors with root cause analysis  

---

## Executive Summary

This plan provides a systematic approach to resolving all remaining TypeScript errors in the infinigen-r3f codebase. The strategy prioritizes fixes based on:

1. **Dependency Order**: Fix base types before dependent implementations
2. **Error Concentration**: Target files/directories with highest error density
3. **Root Cause Elimination**: Address systemic issues rather than symptom-by-symptom fixes
4. **Verification Gates**: Validate progress after each phase

---

## Current Codebase Structure Analysis

### Directory Overview
```
src/
├── assets/           (17 subdirs) - Materials, objects, lighting, particles
├── core/            (7 subdirs)  - Nodes, constraints, rendering, utilities
├── datagen/         (2 subdirs)  - Data generation pipeline
├── editor/          (1 dir)      - Scene editor components
├── integration/     (2 subdirs)  - React hooks, solver integration
├── sim/             (8 subdirs)  - Physics simulation modules
├── terrain/         (12 subdirs) - Terrain generation system
├── tools/           (1 dir)      - Development tools
├── types/           (1 dir)      - Global type definitions
└── ui/              (4 subdirs)  - React UI components
```

**Total TypeScript Files:** 522 files

### Completed Work (Phases 1-2)
- ✅ Material Generator Infrastructure (11 files, ~235 errors fixed)
- ✅ Module System & Core Types (15 files, ~301 errors fixed)
- ✅ Node Base Classes & Interfaces (~150 errors fixed)

---

## Phase 3: Core Node System Infrastructure (~1,050 errors)

### 3.1 Vector & Math Nodes (Priority: HIGH)
**Files:** `src/core/nodes/vector/*.ts`, `src/core/util/math/*.ts`  
**Estimated Errors:** ~400  
**Root Causes:**
- Three.js `Vector3`/`Vector4` type mismatches with tuple representations
- Missing operator overload definitions
- Inconsistent return types between node operations

**Fix Strategy:**
1. Create unified vector type wrappers
2. Standardize input/output socket types
3. Add type guards for math operations

**Implementation Steps:**
```typescript
// Step 1: Define wrapper types in src/core/nodes/core/types.ts
export type Vector3Tuple = [number, number, number];
export type Vector4Tuple = [number, number, number, number];

export interface VectorConversion {
  toTuple(v: Vector3): Vector3Tuple;
  fromTuple(t: Vector3Tuple): Vector3;
}

// Step 2: Update VectorNodes.ts base interfaces
export interface VectorNodeBase extends NodeBase {
  readonly nodeType: NodeType.VectorMath | NodeType.VectorRotate | NodeType.VectorTransform;
  inputs: {
    vector?: Vector3Tuple;
    vector2?: Vector3Tuple;
    value?: number;
    [key: string]: any;
  };
  outputs: {
    vector: Vector3Tuple;
    value: number;
  };
}

// Step 3: Fix implementation files
// - VectorNodes.ts
// - VectorNodesExtended.ts
```

**Files to Modify:**
1. `src/core/nodes/core/types.ts` - Add vector conversion utilities
2. `src/core/nodes/vector/VectorNodes.ts` - Update type signatures
3. `src/core/nodes/vector/VectorNodesExtended.ts` - Fix extended operations
4. `src/core/nodes/vector/index.ts` - Verify exports

**Verification:**
```bash
npx tsc --noEmit src/core/nodes/vector/*.ts 2>&1 | grep "error TS" | wc -l
# Target: <50 errors in vector directory
```

---

### 3.2 Texture & Material Nodes (Priority: HIGH)
**Files:** `src/core/nodes/texture/*.ts`, `src/assets/materials/**/*.ts`  
**Estimated Errors:** ~650  
**Root Causes:**
- `MeshPhysicalMaterial` property type incompatibilities
- Missing texture coordinate propagation types
- Color type mismatches (Three.js `Color` vs tuple)

**Fix Strategy:**
1. Align node outputs with Three.js material property types
2. Implement proper UV coordinate type handling
3. Create texture sampler type definitions

**Implementation Steps:**
```typescript
// Step 1: Enhance texture node types
export interface TextureNodeBase extends NodeBase {
  readonly nodeType: NodeType.TextureCoordinate | NodeType.Mapping | NodeType.ImageTexture | ...;
  inputs: {
    vector?: Vector3Tuple;
    scale?: number;
    [key: string]: any;
  };
  outputs: {
    color: Color;  // Use Three.js Color type
    float: number;
  };
}

// Step 2: Fix material generator parameter types
interface MaterialGeneratorParams {
  roughness?: number;
  metalness?: number;
  normalScale?: Vector3Tuple;
  [key: string]: unknown;  // Index signature for flexibility
}

// Step 3: Update texture node implementations
// - TextureNodes.ts - Fix all texture generator functions
```

**Files to Modify:**
1. `src/core/nodes/texture/TextureNodes.ts` - Complete type overhaul
2. `src/core/nodes/texture/index.ts` - Verify exports
3. `src/assets/materials/BaseMaterialGenerator.ts` - Fix base class
4. All material generators in `src/assets/materials/categories/*/`

**Verification:**
```bash
npx tsc --noEmit src/core/nodes/texture/*.ts 2>&1 | grep "error TS" | wc -l
# Target: <100 errors in texture directory
```

---

### 3.3 Geometry & Mesh Nodes (Priority: MEDIUM)
**Files:** `src/core/nodes/geometry/*.ts`, `src/core/nodes/mesh/*.ts`  
**Estimated Errors:** ~350  
**Root Causes:**
- `BufferGeometry` type inconsistencies
- Missing attribute data structure definitions
- Instance data type mismatches

**Fix Strategy:**
1. Standardize geometry socket types
2. Define attribute data structures
3. Fix instance handling types

**Files to Modify:**
1. `src/core/nodes/geometry/*.ts` - Review and fix
2. `src/core/nodes/groups/*.ts` - Fix group operations
3. `src/core/util/GeometryUtils.ts` - Fix utility functions

---

## Phase 4: Terrain Generation System (~800 errors)

### 4.1 Heightmap & Biome Systems (Priority: HIGH)
**Files:** `src/terrain/core/*.ts`, `src/terrain/biomes/**/*.ts`  
**Estimated Errors:** ~400  
**Root Causes:**
- Missing `HeightmapData` interface (currently using raw `Float32Array`)
- Incorrect noise function return types
- Biome mask type inconsistencies (`MaskMap` = `Uint8Array`)

**Fix Strategy:**
1. Create proper heightmap data interfaces
2. Standardize noise function signatures
3. Fix biome generation type chains

**Implementation Steps:**
```typescript
// Step 1: Define terrain data interfaces in src/terrain/core/TerrainGenerator.ts
export interface HeightmapData {
  data: Float32Array;
  width: number;
  height: number;
  minHeight: number;
  maxHeight: number;
}

export interface BiomeMask {
  data: Uint8Array;
  biomeTypes: string[];
  resolution: { x: number; y: number };
}

// Step 2: Update noise functions
export interface NoiseFunction {
  (x: number, y: number): number;
  readonly octaveCount: number;
  readonly persistence: number;
}

// Step 3: Fix terrain generator methods
class TerrainGenerator {
  private generateBaseHeightMap(): HeightmapData {
    // Return proper interface, not raw array
  }
}
```

**Files to Modify:**
1. `src/terrain/core/TerrainGenerator.ts` - Add interfaces, fix methods
2. `src/terrain/biomes/core/*.ts` - Fix biome generators
3. `src/terrain/generator/*.ts` - Fix generation pipeline
4. `src/terrain/utils/*.ts` - Fix utility functions

**Verification:**
```bash
npx tsc --noEmit src/terrain/core/*.ts 2>&1 | grep "error TS" | wc -l
# Target: <50 errors in terrain core
```

---

### 4.2 Erosion & SDF Systems (Priority: MEDIUM)
**Files:** `src/terrain/erosion/*.ts`, `src/terrain/sdf/*.ts`  
**Estimated Errors:** ~250  
**Root Causes:**
- Hydraulic erosion simulation type errors
- Signed distance field calculation mismatches
- Async operation return type issues

**Fix Strategy:**
1. Define erosion simulation state types
2. Standardize SDF computation signatures
3. Fix async/await type annotations

**Files to Modify:**
1. `src/terrain/erosion/*.ts` - All erosion modules
2. `src/terrain/sdf/*.ts` - SDF generators
3. `src/terrain/caves/*.ts` - Cave generation

---

### 4.3 GPU & Compute Shaders (Priority: LOW)
**Files:** `src/terrain/gpu/*.ts`  
**Estimated Errors:** ~150  
**Root Causes:**
- WebGL compute shader type definitions missing
- Buffer binding type mismatches
- Shader program compilation types

**Fix Strategy:**
1. Add WebGL compute type definitions
2. Fix buffer management types
3. Standardize shader program interfaces

---

## Phase 5: Data Generation Pipeline (~500 errors)

### 5.1 Metadata & Schema Systems (Priority: HIGH)
**Files:** `src/datagen/pipeline/types.ts`, `src/datagen/pipeline/*.ts`  
**Estimated Errors:** ~250  
**Root Causes:**
- Inconsistent metadata schema definitions
- Missing asset loader type unions
- Serialization/deserialization type mismatches

**Fix Strategy:**
1. Create unified metadata schema interface
2. Define asset loader type registry
3. Fix JSON serialization types

**Implementation Steps:**
```typescript
// Step 1: Define metadata schema in src/datagen/pipeline/types.ts
export interface AssetMetadata {
  id: string;
  type: 'object' | 'material' | 'lighting' | 'animation';
  version: string;
  properties: Record<string, unknown>;
  dependencies?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SceneMetadata {
  assets: AssetMetadata[];
  configuration: SceneConfig;
  statistics: GenerationStatistics;
}

// Step 2: Fix pipeline components
class DataPipeline {
  exportScene(metadata: SceneMetadata): Promise<void> {
    // Properly typed export
  }
}
```

**Files to Modify:**
1. `src/datagen/pipeline/types.ts` - Complete type overhaul
2. `src/datagen/pipeline/DataPipeline.ts` - Fix pipeline logic
3. `src/datagen/pipeline/SceneExporter.ts` - Fix export functions
4. `src/datagen/pipeline/AnnotationGenerator.ts` - Fix annotation types

**Verification:**
```bash
npx tsc --noEmit src/datagen/pipeline/*.ts 2>&1 | grep "error TS" | wc -l
# Target: <50 errors in datagen pipeline
```

---

### 5.2 Export & Serialization (Priority: MEDIUM)
**Files:** `src/datagen/pipeline/exports/*.ts`, `src/datagen/pipeline/MeshExportTask.ts`  
**Estimated Errors:** ~150  
**Root Causes:**
- GLTF export type mismatches
- Binary buffer handling errors
- File I/O type inconsistencies

**Fix Strategy:**
1. Standardize GLTF export interfaces
2. Fix buffer management types
3. Add proper file handle types

**Files to Modify:**
1. `src/datagen/pipeline/exports/*.ts` - All export modules
2. `src/datagen/pipeline/MeshExportTask.ts` - Fix mesh export

---

### 5.3 Batch Processing & Job Management (Priority: MEDIUM)
**Files:** `src/datagen/pipeline/BatchProcessor.ts`, `src/datagen/pipeline/JobManager.ts`  
**Estimated Errors:** ~100  
**Root Causes:**
- Async task queue type errors
- Promise chain type mismatches
- Worker thread communication types

**Fix Strategy:**
1. Define task queue interfaces
2. Fix promise resolution types
3. Standardize worker message types

---

## Phase 6: UI & React Integration (~300 errors)

### 6.1 Component Props & State (Priority: HIGH)
**Files:** `src/ui/components/*.tsx`, `src/ui/types.ts`  
**Estimated Errors:** ~180  
**Root Causes:**
- React component prop type mismatches
- Missing event handler signatures
- State management type inconsistencies

**Fix Strategy:**
1. Create unified component prop interfaces
2. Standardize event handler types
3. Fix state hook type annotations

**Implementation Steps:**
```typescript
// Step 1: Define component prop bases in src/ui/types.ts
export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface PanelProps extends BaseComponentProps {
  title: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onClose?: () => void;
}

// Step 2: Fix component implementations
interface PropertyPanelProps extends PanelProps {
  object: any;  // Should be more specific
  onChange?: (path: string, value: any) => void;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({ object, onChange, ... }) => {
  // Properly typed component
};
```

**Files to Modify:**
1. `src/ui/types.ts` - Add comprehensive prop types
2. `src/ui/components/PropertyPanel.tsx` - Fix property panel
3. `src/ui/components/ConstraintEditor.tsx` - Fix constraint editor
4. `src/ui/components/AssetBrowser.tsx` - Fix asset browser
5. All other `.tsx` component files

**Verification:**
```bash
npx tsc --noEmit src/ui/components/*.tsx 2>&1 | grep "error TS" | wc -l
# Target: <30 errors in UI components
```

---

### 6.2 State Management & Hooks (Priority: MEDIUM)
**Files:** `src/ui/hooks/*.ts`, `src/ui/state/*.ts`  
**Estimated Errors:** ~80  
**Root Causes:**
- Zustand/Redux store type mismatches
- Hook return type inconsistencies
- Context provider type errors

**Fix Strategy:**
1. Define store state interfaces
2. Standardize hook signatures
3. Fix context type definitions

**Files to Modify:**
1. `src/ui/hooks/*.ts` - All custom hooks
2. `src/ui/state/*.ts` - State management files

---

### 6.3 Canvas & Rendering UI (Priority: LOW)
**Files:** `src/ui/canvas/*.tsx` (if exists)  
**Estimated Errors:** ~40  
**Root Causes:**
- Three.js canvas ref type errors
- Render loop type mismatches
- Camera control type inconsistencies

---

## Phase 7: Constraints & Solver System (~400 errors)

### 7.1 Constraint Core Types (Priority: HIGH)
**Files:** `src/core/constraints/core/*.ts`, `src/core/constraints/types.ts`  
**Estimated Errors:** ~200  
**Root Causes:**
- Missing constraint interface definitions
- Solver state type inconsistencies
- Evaluation result type mismatches

**Fix Strategy:**
1. Define constraint base interfaces
2. Standardize solver state types
3. Fix evaluation result unions

**Implementation Steps:**
```typescript
// Step 1: Define constraint interfaces
export interface Constraint {
  id: string;
  type: ConstraintType;
  priority: number;
  evaluate(state: SolverState): ConstraintEvaluation;
}

export interface SolverState {
  variables: Map<string, Variable>;
  constraints: Constraint[];
  iteration: number;
}

export interface ConstraintEvaluation {
  satisfied: boolean;
  violation: number;
  gradient?: Vector3;
}

// Step 2: Fix constraint implementations
class DistanceConstraint implements Constraint {
  evaluate(state: SolverState): ConstraintEvaluation {
    // Properly typed evaluation
  }
}
```

**Files to Modify:**
1. `src/core/constraints/core/*.ts` - Core constraint files
2. `src/core/constraints/evaluator/*.ts` - Evaluation logic
3. `src/core/constraints/solver/*.ts` - Solver implementations

**Verification:**
```bash
npx tsc --noEmit src/core/constraints/core/*.ts 2>&1 | grep "error TS" | wc -l
# Target: <50 errors in constraints core
```

---

### 7.2 DSL & Language Features (Priority: MEDIUM)
**Files:** `src/core/constraints/language/*.ts`, `src/core/constraints/dsl/*.ts`  
**Estimated Errors:** ~120  
**Root Causes:**
- DSL builder type errors
- Query language type mismatches
- Expression evaluation type inconsistencies

**Fix Strategy:**
1. Define DSL builder interfaces
2. Standardize query types
3. Fix expression type chains

**Files to Modify:**
1. `src/core/constraints/language/*.ts` - Language features
2. `src/core/constraints/dsl/*.ts` - DSL builders

---

### 7.3 Room & Spatial Constraints (Priority: MEDIUM)
**Files:** `src/core/constraints/room/*.ts`, `src/core/constraints/room-solver/*.ts`  
**Estimated Errors:** ~80  
**Root Causes:**
- Spatial relationship type errors
- Room layout calculation mismatches
- Boundary condition type inconsistencies

---

## Phase 8: Simulation Systems (~250 errors)

### 8.1 Physics Simulation Core (Priority: HIGH)
**Files:** `src/sim/physics/**/*.ts`  
**Estimated Errors:** ~120  
**Root Causes:**
- Rigid body type mismatches
- Collision detection type errors
- Force application type inconsistencies

**Fix Strategy:**
1. Define physics body interfaces
2. Standardize collision types
3. Fix force/torque types

**Files to Modify:**
1. `src/sim/physics/*.ts` - Core physics
2. `src/sim/physics/collision/*.ts` - Collision system
3. `src/sim/physics/materials/*.ts` - Material properties

---

### 8.2 Cloth & Soft Body (Priority: MEDIUM)
**Files:** `src/sim/cloth/*.ts`, `src/sim/softbody/*.ts`  
**Estimated Errors:** ~80  
**Root Causes:**
- Particle system type errors
- Spring constraint type mismatches
- Deformation calculation type inconsistencies

**Files to Modify:**
1. `src/sim/cloth/*.ts` - Cloth simulation
2. `src/sim/softbody/*.ts` - Soft body dynamics

---

### 8.3 Fluid & Destruction (Priority: LOW)
**Files:** `src/sim/fluid/*.ts`, `src/sim/destruction/*.ts`  
**Estimated Errors:** ~50  
**Root Causes:**
- Fluid particle type errors
- Fracture pattern type mismatches

---

## Phase 9: Assets & Objects (~200 errors)

### 9.1 Object Generators (Priority: MEDIUM)
**Files:** `src/assets/objects/**/*.ts`  
**Estimated Errors:** ~120  
**Root Causes:**
- Generator function return type errors
- Parameter interface inconsistencies
- LOD system type mismatches

**Files to Modify:**
1. `src/assets/objects/*/*.ts` - All object generators

---

### 9.2 Lighting & Cameras (Priority: LOW)
**Files:** `src/assets/lighting/*.ts`, `src/core/nodes/camera/*.ts`  
**Estimated Errors:** ~50  
**Root Causes:**
- Light configuration type errors
- Camera rig type mismatches

---

### 9.3 Particles & Effects (Priority: LOW)
**Files:** `src/assets/particles/*.ts`  
**Estimated Errors:** ~30  
**Root Causes:**
- Particle system type errors
- Effect emitter type mismatches

---

## Phase 10: Integration & Editor (~150 errors)

### 10.1 React Integration Hooks (Priority: MEDIUM)
**Files:** `src/integration/*.ts`, `src/integration/hooks/*.ts`  
**Estimated Errors:** ~80  
**Root Causes:**
- Custom hook type errors
- Bridge communication type mismatches
- Event subscription type inconsistencies

**Files to Modify:**
1. `src/integration/use-solver.js` - Convert to TypeScript, fix types
2. `src/integration/useCamera.d.ts` - Fix camera hook
3. `src/integration/CinematicControls.d.ts` - Fix controls

---

### 10.2 Scene Editor (Priority: MEDIUM)
**Files:** `src/editor/*.ts`  
**Estimated Errors:** ~50  
**Root Causes:**
- Editor state type errors
- Tool interaction type mismatches

**Files to Modify:**
1. `src/editor/SceneEditor.ts` - Fix editor logic
2. `src/editor/index.ts` - Fix exports

---

### 10.3 Bridge & Hybrid Systems (Priority: LOW)
**Files:** `src/integration/bridge/*.ts`  
**Estimated Errors:** ~20  
**Root Causes:**
- Bridge protocol type errors
- Message passing type mismatches

---

## Execution Timeline

### Week 1: Core Infrastructure (Phases 3.1-3.3)
- **Days 1-2**: Vector & Math Nodes (~400 errors)
- **Days 3-4**: Texture & Material Nodes (~650 errors)
- **Day 5**: Geometry & Mesh Nodes (~350 errors)
- **Target**: Reduce errors to ~1,500 (-1,464 errors)

### Week 2: Terrain & Data (Phases 4-5)
- **Days 1-3**: Terrain Generation (~800 errors)
- **Days 4-5**: Data Pipeline (~500 errors)
- **Target**: Reduce errors to ~200 (-1,300 errors)

### Week 3: UI & Constraints (Phases 6-7)
- **Days 1-2**: UI Components (~300 errors)
- **Days 3-4**: Constraint System (~400 errors)
- **Day 5**: Buffer & cleanup
- **Target**: Reduce errors to ~50 (-150 errors)

### Week 4: Final Push (Phases 8-10)
- **Days 1-2**: Simulation Systems (~250 errors)
- **Day 3**: Assets & Objects (~200 errors)
- **Day 4**: Integration & Editor (~150 errors)
- **Day 5**: Final verification and edge cases
- **Target**: <10 residual errors

---

## Verification Protocol

### After Each Phase
```bash
# Count remaining errors
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

# Generate error report by directory
npx tsc --noEmit 2>&1 | grep "error TS" | cut -d':' -f1 | sort | uniq -c | sort -rn

# Verify no new errors introduced in fixed files
git diff --name-only HEAD~1 | grep '\.ts$' | xargs npx tsc --noEmit
```

### Quality Gates
1. **No `any` types** introduced as quick fixes
2. **All interfaces documented** with JSDoc comments
3. **Type safety maintained** - no unsafe type assertions
4. **Backward compatibility** - existing APIs preserved

---

## Risk Mitigation

### High-Risk Areas
1. **Three.js Type Compatibility**: May require version alignment
2. **React 18 Type Changes**: Ensure @types/react version match
3. **Circular Dependencies**: Watch for import cycles

### Contingency Plans
1. If Three.js types are too restrictive: Create wrapper types
2. If error count stalls: Re-evaluate tsconfig strictness
3. If breaking changes needed: Create migration guide

---

## Success Metrics

| Metric | Current | Week 1 | Week 2 | Week 3 | Week 4 |
|--------|---------|--------|--------|--------|--------|
| Total Errors | ~2,964 | ~1,500 | ~200 | ~50 | <10 |
| % Complete | 19% | 50% | 93% | 98% | 99.7% |
| Files Fixed | 26 | ~100 | ~250 | ~400 | ~522 |
| Build Time | N/A | <30s | <30s | <30s | <30s |

---

## Appendix A: Common Fix Patterns

### Pattern 1: Three.js Type Casting
```typescript
// ❌ Before
const material = new MeshPhysicalMaterial(params);

// ✅ After
const material = new MeshPhysicalMaterial({
  ...(params as MeshPhysicalMaterialParameters),
});
```

### Pattern 2: Generic Constraints
```typescript
// ❌ Before
function process<T>(data: T): T { ... }

// ✅ After
function process<T extends NodeBase>(data: T): T { ... }
```

### Pattern 3: Union Type Guards
```typescript
// ❌ Before
if (node.type === 'vector') { ... }

// ✅ After
function isVectorNode(node: Node): node is VectorNode {
  return node.nodeType === NodeType.VectorMath;
}

if (isVectorNode(node)) { ... }
```

### Pattern 4: Index Signatures
```typescript
// ❌ Before
interface Params {
  roughness: number;
  metalness: number;
}

// ✅ After
interface Params {
  roughness: number;
  metalness: number;
  [key: string]: unknown;
}
```

---

## Appendix B: File Priority Matrix

| Priority | Directory | Files | Errors | Impact |
|----------|-----------|-------|--------|--------|
| P0 | `src/core/nodes/vector/` | 3 | ~400 | Critical |
| P0 | `src/core/nodes/texture/` | 2 | ~650 | Critical |
| P0 | `src/terrain/core/` | 2 | ~400 | Critical |
| P1 | `src/datagen/pipeline/` | 12 | ~250 | High |
| P1 | `src/ui/components/` | 14 | ~180 | High |
| P1 | `src/core/constraints/core/` | ~20 | ~200 | High |
| P2 | `src/terrain/biomes/` | ~10 | ~250 | Medium |
| P2 | `src/sim/physics/` | ~15 | ~120 | Medium |
| P2 | `src/assets/objects/` | ~50 | ~120 | Medium |
| P3 | Remaining directories | ~400 | ~394 | Low |

---

## Appendix C: Git Workflow

### Branch Strategy
```bash
# Create feature branch for each phase
git checkout -b fix/phase-3-vector-nodes
git checkout -b fix/phase-3-texture-nodes
git checkout -b fix/phase-4-terrain-core

# Commit frequently with descriptive messages
git commit -m "fix(vector-nodes): Add Vector3Tuple type and conversion utilities"
git commit -m "fix(vector-nodes): Standardize VectorMath node input/output types"
git commit -m "fix(vector-nodes): Fix VectorRotate implementation types"

# Merge to main after verification
git checkout main
git merge --no-ff fix/phase-3-vector-nodes
```

### Commit Message Convention
```
fix(<scope>): <description>

- Root cause: <explanation>
- Solution: <approach>
- Impact: <errors fixed>
```

---

**Document Status:** Ready for Implementation  
**Next Action:** Begin Phase 3.1 (Vector & Math Nodes)  
**Estimated Completion:** 4 weeks from start date
