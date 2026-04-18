# Infinigen R3F Port - Complete Analysis & Porting Plan

## Executive Summary

**Total Codebase**: 812 Python files  
**Portable (No bpy)**: 515 files (63.4%)  
**Non-Portable (Has bpy)**: 297 files (36.6%)  

**bpy API Usage**:
- `bpy.ops` calls: 931
- `bpy.context` calls: 678
- `bpy.data` calls: 348
- `bpy.types` calls: 312

## Complete Module Breakdown

### ✅ FULLY PORTABLE MODULES (100% portable)

| Module | Files | LOC | Priority | Status |
|--------|-------|-----|----------|--------|
| `core/constraints/reasoning/` | 7 | ~800 | P0 | ✅ DONE |
| `core/constraints/example_solver/greedy/` | 4 | ~500 | P0 | ✅ DONE |
| `core/tags.py` | 1 | 332 | P0 | ✅ DONE |
| `core/util/math.py` | 1 | 375 | P0 | ✅ DONE |
| `core/util/color.py` | 1 | ~150 | P1 | ⏳ TODO |
| `core/util/random.py` | 1 | ~200 | P1 | ⏳ TODO |
| `datagen/` | 16 | ~1200 | P3 | ⏳ TODO |
| `tools/ground_truth/` | 6 | ~800 | P3 | ⏳ TODO |
| `tools/perceptual/` | 4 | ~400 | P3 | ⏳ TODO |
| `tools/results/` | 13 | ~1500 | P3 | ⏳ TODO |

### ⚠️ PARTIALLY PORTABLE MODULES (50-95% portable)

| Module | Total | Portable | % | Key Portable Files |
|--------|-------|----------|---|-------------------|
| `core/constraints/constraint_language/` | 11 | 10 | 91% | All except `util.py` |
| `core/constraints/evaluator/` | 5 | 4 | 80% | `evaluate.py`, `domain_contains.py`, `eval_memo.py`, `node_impl/*` |
| `core/constraints/example_solver/moves/` | 7 | 6 | 86% | All except `addition.py` |
| `core/placement/` | 13 | 3 | 23% | `path_finding.py`, `density.py` |
| `core/sim/` | 9 | 7 | 78% | Exporters, physics definitions |
| `assets/materials/` | 150+ | 128 | 85% | Material shader logic |
| `assets/utils/` | 39 | 20 | 51% | Geometry utils, nodegroups |

### ❌ NON-PORTABLE MODULES (<20% portable)

| Module | % Portable | Reason |
|--------|-----------|---------|
| `tableware/` | 5% | Heavy bpy mesh ops |
| `shelves/` | 7% | Geometry nodes |
| `leaves/` | 12.5% | Mesh generation |
| `small_plants/` | 12.5% | Procedural generation |
| `lighting/` | 14.3% | Blender lamps |
| `seating/` | 16.7% | Complex modeling |
| `trees/` | 16.7% | Growth algorithms |

## Detailed Porting Status

### Phase 1: Core Type System ✅ COMPLETE
**Files**: `constraint_language/{types,expression,relations,set_reasoning,geometry,constants,gather,result}.py`
- **LOC**: ~2,500 Python → ~3,500 TypeScript
- **Status**: Fully ported to `/workspace/infinigen-r3f/src/constraint-language/`

### Phase 2: Constraint Reasoning ✅ COMPLETE
**Files**: `reasoning/{domain,constraint_domain,constraint_constancy,constraint_bounding,expr_equal,domain_substitute}.py`
- **LOC**: ~800 Python → ~1,000 TypeScript
- **Status**: Fully ported to `/workspace/infinigen-r3f/src/reasoning/`

### Phase 3: Solver Core ✅ COMPLETE
**Files**: 
- `moves/{moves,pose,swap,reassignment,deletion}.py` (6 files)
- `greedy/{constraint_partition,all_substitutions,active_for_stage}.py` (3 files)
- Solver frameworks (SimulatedAnnealing, Greedy)
- **LOC**: ~1,200 Python → ~1,500 TypeScript
- **Status**: Fully ported to `/workspace/infinigen-r3f/src/solver/`

### Phase 4: Math & Utilities ✅ COMPLETE
**Files**: `util/{math,tags}.py`
- **LOC**: ~700 Python → ~900 TypeScript
- **Status**: Fully ported to `/workspace/infinigen-r3f/src/math/` and `/workspace/infinigen-r3f/src/tags/`

### Phase 5: Placement Algorithms ✅ COMPLETE
**Files**: `placement/{path_finding,density}.py`
- **LOC**: ~350 Python → ~500 TypeScript
- **Status**: Fully ported to `/workspace/infinigen-r3f/src/placement/`

---

## Remaining High-Priority Ports (P0)

### 1. Constraint Evaluator (NEW - Critical)
**Location**: `core/constraints/evaluator/`
**Portable Files**:
- `evaluate.py` - Main evaluation engine (~400 LOC)
- `domain_contains.py` - Domain membership testing (~100 LOC)
- `eval_memo.py` - Memoization (~150 LOC)
- `node_impl/*.py` - Node implementations (~500 LOC)

**Why Important**: Runtime constraint satisfaction checking
**Dependencies**: Only uses constraint_language + reasoning (already ported)
**Estimated Effort**: 2-3 days

### 2. Room Solver Framework (NEW)
**Location**: `core/constraints/example_solver/room/`
**Portable Files**:
- `base.py`, `solver.py`, `graph.py` - Core abstractions
- `floor_plan.py`, `contour.py`, `segment.py` - Floor plan generation
- `predefined.py`, `utils.py` - Utilities
- **Total**: ~1,500 LOC

**Why Important**: Indoor scene layout generation
**Estimated Effort**: 3-4 days

### 3. Geometry Validity Checks (NEW)
**Location**: `core/constraints/example_solver/geometry/validity.py`
**LOC**: ~200
**Why Important**: Collision detection, stability checks
**Estimated Effort**: 1 day

### 4. SIM Exporters (MEDIUM Priority)
**Location**: `core/sim/`
**Portable Files**:
- `exporters/factory.py` - Export pipeline
- `kinematic_node.py` - Kinematic chain representation
- `physics/joint_dynamics.py`, `material_definitions.py` - Physics defs
- **Total**: ~800 LOC

**Why Important**: Physics simulation export (MuJoCo, URDF)
**Estimated Effort**: 2 days

---

## Medium Priority Ports (P1-P2)

### 5. Animation Policy System
**Location**: `core/placement/animation_policy.py`
**Status**: Has bpy imports but mostly for visualization
**Portable Core**: Policy abstractions, trajectory scoring
**Estimated Effort**: 2 days (with adaptation)

### 6. Asset Utils
**Location**: `assets/utils/`
**Portable Files**:
- `geometry/{lofting,skin_ops}.py` - Mesh operations (use trimesh)
- `joints.py`, `laplacian.py` - Math utilities
- `nodegroups/*.py` - Geometry node definitions
- `reaction_diffusion.py` - Pattern generation
- **Total**: ~1,200 LOC

**Estimated Effort**: 3-4 days

### 7. Material Shader Logic
**Location**: `assets/materials/` (128 portable files)
**Note**: These define procedural materials using math/node logic
**Adaptation Strategy**: Convert to three.js shader materials / node graphs
**Estimated Effort**: 1-2 weeks (large volume but repetitive)

---

## Low Priority Ports (P3)

### 8. Datagen Infrastructure
**Location**: `datagen/` (16 files)
**Purpose**: Distributed rendering job management
**Use Case**: Not needed for browser-based R3F
**Decision**: Skip or port only schema definitions

### 9. Tools Suite
**Location**: `tools/` (40+ files)
**Categories**:
- Ground truth generation (6 files) - Skip
- Perceptual studies (4 files) - Skip  
- Results analysis (13 files) - Some useful viz tools
- Terrain tools (4 files) - Skip

---

## Implementation Roadmap

### Sprint 1 (Week 1-2): Constraint Evaluator
- [ ] Port `evaluate.py` - Main eval engine
- [ ] Port `domain_contains.py` - Domain membership
- [ ] Port `eval_memo.py` - Caching layer
- [ ] Port `node_impl/` - Relation implementations
- [ ] Write integration tests

### Sprint 2 (Week 3-4): Room Solver
- [ ] Port room graph representations
- [ ] Port floor plan generation
- [ ] Port contour/segment algorithms
- [ ] Integrate with existing solver

### Sprint 3 (Week 5-6): SIM & Physics
- [ ] Port kinematic node system
- [ ] Port joint dynamics
- [ ] Port material physics definitions
- [ ] Create R3F physics integration (rapier.js)

### Sprint 4 (Week 7-8): Asset Utils
- [ ] Port geometry utilities
- [ ] Port reaction-diffusion patterns
- [ ] Create three.js equivalents for lofting/skinning
- [ ] Build asset factory framework

### Sprint 5 (Week 9-10): Polish & Integration
- [ ] Performance optimization (Web Workers, WASM)
- [ ] R3F component library
- [ ] Example scenes
- [ ] Documentation

---

## File Inventory by Priority

### P0 - Critical (Port Now)
```
core/constraints/evaluator/evaluate.py          (400 LOC)
core/constraints/evaluator/domain_contains.py   (100 LOC)
core/constraints/evaluator/eval_memo.py         (150 LOC)
core/constraints/evaluator/node_impl/*.py       (500 LOC)
core/constraints/example_solver/room/*.py       (1500 LOC)
core/constraints/example_solver/geometry/validity.py (200 LOC)
core/sim/*.py                                   (800 LOC)
```
**Total**: ~3,650 LOC → ~5,000 LOC TypeScript

### P1 - Important (Port Next)
```
core/util/color.py                              (150 LOC)
core/util/random.py                             (200 LOC)
core/placement/animation_policy.py              (300 LOC, adapt)
assets/utils/geometry/*.py                      (400 LOC)
assets/utils/nodegroups/*.py                    (500 LOC)
assets/utils/reaction_diffusion.py              (200 LOC)
```
**Total**: ~1,750 LOC → ~2,500 LOC TypeScript

### P2 - Useful (Port Later)
```
assets/materials/**/*.py                        (8,000+ LOC)
tools/results/*.py                              (1,500 LOC)
terrain/**/*.py                                 (selective, 1,000 LOC)
```
**Total**: ~10,500 LOC → ~15,000 LOC TypeScript

---

## Technical Debt & Considerations

### Already Resolved
✅ No circular dependencies in ported code  
✅ ES module structure maintained  
✅ Type safety preserved  
✅ Test coverage strategy defined  

### Known Challenges
⚠️ **Evaluator State Management**: Python's `State` class uses bpy.objects - need R3F scene graph adapter  
⚠️ **Geometry Predicates**: Distance, collision require three.js raycasting/BVH  
⚠️ **Performance**: Constraint evaluation in browser needs Web Workers  
⚠️ **Memory**: Large scenes may hit JS heap limits  

### Dependencies to Add
```json
{
  "dependencies": {
    "@react-three/fiber": "^8.x",
    "@react-three/drei": "^9.x",
    "@react-three/rapier": "^1.x",
    "three": "^0.160.x",
    "ndarray": "^1.x",
    "graphology": "^0.25.x",
    "simplex-noise": "^4.x"
  }
}
```

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Portable files ported | 515 | ~50 (10%) |
| Core constraint system | 100% | ✅ 100% |
| Solver functionality | 100% | ✅ 100% |
| Evaluator (P0) | 100% | ❌ 0% |
| Room solver (P0) | 100% | ❌ 0% |
| Overall completion | 100% | ~15% |

---

## Conclusion

The Infinigen codebase has been thoroughly analyzed:
- **515 files (63.4%) are fully portable** with no bpy dependencies
- **Core algorithmic components** (constraint language, reasoning, solver, math) are already ported
- **Next priority**: Constraint evaluator and room solver (~3,650 LOC)
- **Remaining effort**: ~8-10 weeks for full P0+P1 port

The architecture is sound, and the porting strategy is validated. The remaining work is systematic translation following established patterns.
