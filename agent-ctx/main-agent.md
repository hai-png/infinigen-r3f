# Task: Fix Creature Generators, Architectural Generators, and Physics

## Summary

All three parts have been completed successfully. Type checking passes with zero errors in our modified files (only pre-existing errors in core/util remain).

### Part A: Creature Generators (8 files)
- **CreatureBase.ts**: Fixed `generate()` to return visible body with head and eyes. Fixed `createFinGeometry()` (now returns a proper triangular tapered shape using BufferGeometry), `createEarGeometry()` (now returns a cone-based ear shape), `createShellGeometry()` (now returns a hemisphere dome shape).
- **MammalGenerator.ts**: Added 4 legs with upper/lower segments + paws. Fixed `generateAppendages()` to return ears + tail. Fixed `createFurMaterial()` to use roughness based on fur length and pattern-based color adjustments.
- **BirdGenerator.ts**: Added elongated body, head with beak (cone), flat wings, legs with 3 toes + back toe, fan-shaped tail with 5 feathers.
- **FishGenerator.ts**: Added tapered body, tail fin (forked/rounded/square types), dorsal fin, pectoral fins, eyes, mouth.
- **ReptileGenerator.ts**: Added flat body, triangular head with jaw, 4 splayed legs with feet, tapered tail with 6 segments, scale material with roughness based on pattern. Shell for turtle.
- **InsectGenerator.ts**: Added 3 body segments (head/thorax/abdomen), 6 legs (3 pairs) with upper/lower segments, antennae with tips, optional wings (transparent ellipsoids).
- **AmphibianGenerator.ts**: Added smooth body, wide flat head with mouth, large eyes with pupils, 4 legs (hind larger with thigh), webbed feet with triangular toe shapes, optional tail.
- **UnderwaterGenerator.ts**: Added jellyfish (bell dome + 8 tentacles with segments + 4 oral arms), octopus (mantle + 8 tentacles with suction cups), crab (shell dome + claws + 8 walking legs + eye stalks), starfish (5 arms), cetacean (torpedo body + dorsal fin + flukes + pectoral fins).

### Part B: Architectural Generators (8 files)
- **WindowGenerator.ts**: Fixed all frame bars, glass panes, mullions to be proper `Mesh(geometry, material)` objects instead of empty Groups. Added positions, names, and shadow settings.
- **WallGenerator.ts**: Added proper `MeshStandardMaterial` with material-specific configs (concrete, brick, stone, wood, glass, drywall).
- **FloorGenerator.ts**: Added proper materials. Added plank lines for hardwood and tile lines for tile floors. Fixed border material reference.
- **CeilingGenerator.ts**: Added proper materials. Added coffered ceiling with grid beams, tray ceiling with recessed panel and lips, proper molding pieces (4 sides).
- **RoofGenerator.ts**: Added gable (with ridge board and gable end triangles), hip (4 slopes), flat (with parapet), shed, mansard (double-pitched), gambrel (barn-style). All with proper materials.
- **StaircaseGenerator.ts**: Added proper materials for all elements. Added railing with balusters at each step and handrails on both sides.
- **ColumnGenerator.ts**: Added base with plinth, torus, upper base. Added capital details: Doric (echinus + abacus), Ionic (volutes + egg-and-dart band + abacus), Corinthian (basket + acanthus leaves + abacus), Tuscan. Added necking ring.
- **DoorGenerator.ts**: Complete rewrite. All geometries now wrapped in `Mesh(geometry, material)`. Frame: left/right jamb + header. Panels: single, french (2 panels), revolving (4 panels + pivot). Handle: knob (sphere + rose), lever (cylinder + backplate), pull (box). Hinges: proper box meshes. Glass: transparent pane. Decorative panels.

### Part C: Physics System (7 files)
- **PhysicsWorld.ts**: Full implementation with body/collider/joint management, fixed timestep with accumulator, complete collision pipeline (integrate → update AABBs → broad phase → narrow phase → resolve → solve joints), collision response with friction (Coulomb model) and restitution, positional correction (Baumgarte stabilization), raycasting, collision callbacks.
- **RigidBody.ts**: Full implementation with position/rotation/velocity, force/torque accumulation, semi-implicit Euler integration, sleep system, velocity at point calculation, body types (static/dynamic/kinematic).
- **Collider.ts**: Box, sphere, cylinder shapes with half-extents/radius/height, AABB computation, layer-based collision filtering, friction/restitution per-collider.
- **Joint.ts**: Hinge (positional + axis constraint + motor + limits), ball-socket (positional only), prismatic (sliding along axis + motor + limits), fixed (position + rotation). All with position-based dynamics solving and break force support.
- **BroadPhase.ts**: Sweep-and-prune implementation, sorted by X-axis, full 3-axis AABB overlap test.
- **NarrowPhase.ts**: SAT-based detection for box-box, sphere-sphere, sphere-box, sphere-cylinder, box-cylinder (approximated). Returns contact points with normal, depth, and position.
- **CollisionFilter.ts**: Layer-based collision filtering with configurable interaction masks.
