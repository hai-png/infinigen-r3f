# Sprint 6: Room Decoration & Physics Export

## Analysis Summary from Original Infinigen

### Key Files Analyzed:
1. **solidifier.py** (693 LOC) - Graph-to-geometry room conversion
2. **decorate.py** (682 LOC) - Furniture placement rules
3. **trimesh_geometry.py** (1,327 LOC) - Advanced mesh relations
4. **mjcf_exporter.py** (530 LOC) - MuJoCo physics export

### Critical Insights:

#### Room Decoration System (decorate.py)
- Uses rule-based furniture placement with semantic tags
- Supports: beds, desks, chairs, sofas, tables, shelves
- Placement strategies: wall-aligned, corner, centered, paired
- Handles clearance zones and accessibility paths
- **Implementation Strategy**: Port core rules to TypeScript, defer complex asset selection

#### MJCF Exporter (mjcf_exporter.py)  
- Exports scene hierarchy with collision meshes
- Supports joints, actuators, sensors
- Material properties mapping (friction, density)
- **Implementation Strategy**: Complete skeleton already in port, add full mesh export

#### Advanced Geometry (trimesh_geometry.py)
- Uses trimesh for precise collision detection
- Implements: penetration depth, contact points, stability margins
- Shapely for 2D projections (coverage, alignment)
- **Implementation Strategy**: Hybrid bridge for batch operations

## Sprint 6 Goals

### Priority 1: Room Decoration System (~400 LOC TS)
- [ ] Port furniture placement rules from decorate.py
- [ ] Implement semantic tag matching
- [ ] Wall/corner/center placement strategies
- [ ] Clearance zone validation
- File: `src/placement/room-decorate.ts`

### Priority 2: Complete MJCF Exporter (~200 LOC TS)
- [ ] Add full mesh geometry export
- [ ] Joint hierarchy serialization
- [ ] Material property mapping
- [ ] Collision mesh simplification
- File: `src/sim/mjcf-exporter.ts` (enhance existing)

### Priority 3: Hybrid Bridge Python Backend (~300 LOC Python)
- [ ] WebSocket server implementation
- [ ] Batch raycasting endpoint
- [ ] Mesh boolean operations
- [ ] Stability analysis service
- File: `python_backend/server.py`

### Priority 4: Raycasting Evaluators (~250 LOC TS)
- [ ] PreciseVisible with occlusion testing
- [ ] PreciseSupported with contact points
- [ ] PreciseTouching with penetration depth
- File: `src/evaluator/node_impl/raycast-relations.ts` (enhance existing)

## Expected Outcomes
- **Feature Parity**: 78% → 85%
- **New LOC**: ~1,150 (TS + Python)
- **Demo**: Fully decorated single-room scene with physics export

## Timeline
- Day 1-2: Room decoration system
- Day 3: MJCF exporter completion
- Day 4: Hybrid bridge backend
- Day 5: Raycasting evaluators + integration testing
