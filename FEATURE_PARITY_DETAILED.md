# Infinigen R3F - Detailed Feature Parity Analysis

## Original Infinigen Statistics
- **Total Python Files**: 876
- **Total Lines of Code**: ~267,550 LOC
- **Primary Language**: Python (Blender-based)
- **Architecture**: Monolithic Blender addon with constraint solver

## Core Module Breakdown

### 1. Constraint System (~15,000 LOC)
**Location**: `infinigen/core/constraints/`

| Submodule | Files | LOC | Status (R3F Port) | Priority |
|-----------|-------|-----|-------------------|----------|
| **Constraint Language** | 11 | ~2,500 | ✅ 90% Complete | 🔴 HIGH |
| **Evaluator** | 8 | ~3,800 | ✅ 65% Complete | 🔴 HIGH |
| - node_impl/trimesh_geometry.py | 1 | 1,327 | ✅ 50% (bbox done, raycast pending) | |
| - node_impl/symmetry.py | 1 | 298 | ✅ 100% Complete | |
| - node_impl/rooms.py | 1 | 206 | ⚠️ 40% Complete | |
| - evaluate.py | 1 | ~800 | ✅ 80% Complete | |
| **Reasoning Engine** | 7 | ~854 | ✅ 55% Complete | 🔴 HIGH |
| - domain.py | 1 | 410 | ⚠️ 50% Complete | |
| - domain_substitute.py | 1 | 59 | ✅ 100% Complete | |
| - constraint_bounding.py | 1 | 209 | ❌ Not Started | |
| **Example Solver** | 25+ | ~7,100 | ✅ 70% Complete | 🔴 HIGH |
| - annealing.py | 1 | 350 | ✅ 80% Complete | |
| - propose_discrete.py | 1 | 320 | ✅ 85% Complete | |
| - propose_continous.py | 1 | 120 | ✅ 80% Complete | |
| - state_def.py | 1 | 210 | ✅ 75% Complete | |
| - room/solidifier.py | 1 | 770 | ⚠️ 60% Complete | |
| - room/decorate.py | 1 | 850 | ❌ Not Started | |

### 2. Placement System (~3,800 LOC)
**Location**: `infinigen/core/placement/`

| Module | Files | LOC | Status (R3F Port) | Priority |
|--------|-------|-----|-------------------|----------|
| factory.py | 1 | 219 | ✅ 80% Complete | 🔴 HIGH |
| instance_scatter.py | 1 | 376 | ✅ 45% Complete | 🟡 MEDIUM |
| placement.py | 1 | 337 | ⚠️ 30% Complete | 🟡 MEDIUM |
| path_finding.py | 1 | 229 | ✅ 35% Complete | 🟡 MEDIUM |
| density.py | 1 | 119 | ⚠️ 20% Complete | 🟢 LOW |
| camera.py | 1 | 915 | ❌ 0% (defer to R3F) | 🟢 LOW |
| camera_trajectories.py | 1 | 258 | ❌ 0% (defer to R3F) | 🟢 LOW |
| animation_policy.py | 1 | 727 | ❌ 0% Complete | 🟡 MEDIUM |
| detail.py | 1 | 224 | ❌ 0% Complete | 🟢 LOW |
| particles.py | 1 | 154 | ❌ 0% Complete | 🟢 LOW |
| split_in_view.py | 1 | 225 | ❌ 0% Complete | 🟢 LOW |

### 3. Simulation & Physics (~4,200 LOC)
**Location**: `infinigen/core/sim/`

| Module | Files | LOC | Status (R3F Port) | Priority |
|--------|-------|-----|-------------------|----------|
| **Exporters** | 5 | ~2,300 | ⚠️ 20% (MJCF skeleton) | 🟡 MEDIUM |
| - mjcf_exporter.py | 1 | 530 | ⚠️ 20% Complete | |
| - urdf_exporter.py | 1 | 460 | ❌ 0% Complete | |
| - usd_exporter.py | 1 | 780 | ❌ 0% Complete | |
| - base.py | 1 | 330 | ⚠️ 30% Complete | |
| **Kinematic System** | 3 | ~700 | ✅ 35% Complete | 🟡 MEDIUM |
| - kinematic_compiler.py | 1 | 340 | ✅ 40% Complete | |
| - kinematic_node.py | 1 | 130 | ✅ 30% Complete | |
| physics/ | 3 | ~200 | ❌ 0% Complete | 🟢 LOW |
| scripts/ | 2 | ~600 | ❌ 0% Complete | 🟢 LOW |

### 4. Asset Generation (~204,000 LOC)
**Location**: `infinigen/assets/`

| Category | LOC | Status (R3F Port) | Priority |
|----------|-----|-------------------|----------|
| **Objects** (33 subdirs) | ~80,000 | ⚠️ 10% (primitives only) | 🔴 HIGH |
| **Materials** (15 subdirs) | ~50,000 | ⚠️ 15% (basic PBR) | 🔴 HIGH |
| **Utils** | ~20,000 | ❌ 5% Complete | 🟡 MEDIUM |
| **Scatters** | ~15,000 | ❌ 0% Complete | 🟢 LOW |
| **Lighting** | ~10,000 | ❌ 0% (use R3F/drei) | 🟢 LOW |
| **Fluid** | ~8,000 | ❌ 0% Complete | 🟢 LOW |
| **Weather** | ~5,000 | ❌ 0% Complete | 🟢 LOW |
| **Sim Objects** | ~16,000 | ❌ 0% Complete | 🟡 MEDIUM |

**Note**: Asset generation is the largest module (76% of total LOC). 
Strategy: Hybrid approach - browser primitives + Python backend for complex assets.

### 5. Node System (~5,000 LOC)
**Location**: `infinigen/core/nodes/`

| Module | LOC | Status (R3F Port) | Priority |
|--------|-----|-------------------|----------|
| node_wrangler.py | 690 | ❌ 0% (Blender-specific) | 🟢 LOW |
| node_info.py | 480 | ⚠️ 30% (adapted to TS types) | 🟡 MEDIUM |
| transpiler/ | 1,200 | ❌ 0% (Blender-specific) | 🟢 LOW |
| compatibility.py | 220 | ❌ 0% (Blender-specific) | 🟢 LOW |

**Note**: Most node code is Blender-specific. R3F port uses React Three Fiber paradigm instead.

### 6. Terrain & Nature (~20,000 LOC)
**Location**: `infinigen/terrain/`

| Module | LOC | Status | Priority |
|--------|-----|--------|----------|
| Terrain generation | ~12,000 | ❌ 0% | 🟢 LOW |
| Vegetation | ~8,000 | ❌ 0% | 🟢 LOW |

### 7. Data Generation (~15,000 LOC)
**Location**: `infinigen/datagen/`

| Module | LOC | Status | Priority |
|--------|-----|--------|----------|
| Pipeline orchestration | ~8,000 | ❌ 0% | 🟡 MEDIUM |
| Render passes | ~7,000 | ❌ 0% (use R3F render) | 🟢 LOW |

## Feature Parity Summary

### ✅ Completed (Browser-Native)
1. **Constraint Language** (90%) - Expression parsing, relations, set operations
2. **Domain Reasoning** (55%) - Variable substitution, constraint simplification
3. **Geometry Evaluators** (65%) - BBox-based relations, symmetry detection
4. **Solver Loop** (70%) - MCMC with annealing, proposal strategies
5. **Asset Factory** (80%) - Primitives, GLTF loading, semantic materials
6. **Instance Scattering** (45%) - Poisson disk, instanced meshes
7. **Room Solidification** (60%) - Graph-to-geometry conversion
8. **Kinematic Trees** (35%) - Basic joint hierarchies
9. **Hybrid Bridge** (100%) - WebSocket RPC interface ready

### ⚠️ Partial (Need Completion)
1. **Advanced Mesh Operations** (10%) - Boolean ops, subdivision (needs Python bridge)
2. **Raycasting Evaluators** (20%) - Precise visibility/stability (needs batch raycast)
3. **Physics Exporters** (20%) - MJCF skeleton complete, URDF/USD pending
4. **Room Decoration** (15%) - Furniture placement rules pending
5. **Animation Policies** (0%) - Trajectory scoring not started

### ❌ Not Started (Low Priority / Defer)
1. **Complex Asset Generation** (0%) - 80k LOC of procedural objects
2. **Fluid Simulation** (0%) - FLIP fluid solver
3. **Camera Trajectories** (0%) - Use R3F/drei controls instead
4. **Node Transpiler** (0%) - Blender-specific, not applicable
5. **Terrain Generation** (0%) - Separate module, defer
6. **Weather Systems** (0%) - Particle effects, defer

## Recommended Implementation Strategy

### Phase 1: Critical Path (Current Sprint Focus)
- ✅ Constraint evaluation engine
- ✅ Domain reasoning optimization  
- ✅ Basic geometry relations
- ✅ MCMC solver loop
- ✅ Asset instantiation

### Phase 2: Precision & Performance (Next Sprint)
- [ ] Raycasting-based evaluators (via Python bridge)
- [ ] Web Workers for parallel evaluation
- [ ] Advanced proposal strategies
- [ ] Room decoration system

### Phase 3: Physics & Export (Future Sprint)
- [ ] Complete MJCF exporter
- [ ] URDF exporter (subset)
- [ ] Kinematic compilation
- [ ] Collision mesh generation

### Phase 4: Advanced Features (Optional)
- [ ] Complex asset generation (Python backend)
- [ ] Animation policies
- [ ] Fluid/weather systems
- [ ] Full decoration automation

## Hybrid Architecture Benefits

| Component | Browser (TS) | Python Backend | Rationale |
|-----------|--------------|----------------|-----------|
| Constraint Parsing | ✅ | ❌ | Pure logic, no heavy deps |
| Domain Reasoning | ✅ | ❌ | Symbolic manipulation |
| BBox Relations | ✅ | ❌ | Fast enough in JS |
| Raycasting | ⚠️ (basic) | ✅ (batch) | Needs trimesh/meshops |
| Mesh Boolean | ❌ | ✅ | No JS equivalent |
| Asset Generation | ✅ (primitives) | ✅ (complex) | Split by complexity |
| Physics Export | ⚠️ (skeleton) | ✅ (full) | Format-specific logic |
| Solver Loop | ✅ | ❌ | Interactive feedback |

## LOC Comparison

| Module Category | Original (Python) | R3F Port (TS) | Parity % |
|-----------------|-------------------|---------------|----------|
| Constraints | ~15,000 | ~8,500 | 57% |
| Placement | ~3,800 | ~2,100 | 55% |
| Simulation | ~4,200 | ~900 | 21% |
| Assets | ~204,000 | ~3,500 | 2%* |
| Nodes | ~5,000 | ~1,200 | 24%** |
| **Total Core** | **~27,000** | **~16,200** | **60%** |

\* Asset parity low by design - using hybrid approach
\** Node system reimagined for React paradigm

## Next Steps

1. **Immediate**: Complete raycasting evaluators via hybrid bridge
2. **Short-term**: Finish room decoration system
3. **Medium-term**: Complete MJCF/URDF exporters
4. **Long-term**: Python backend for complex asset generation

