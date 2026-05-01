# Task: Fix Node System Stubs & Implement Articulated Objects

## Summary

Completed both Part A (29 node stub fixes across 5 files) and Part B (18 articulated object generators).

## Part A: Node System Stub Fixes

### File 1: src/core/nodes/attribute/AttributeNodes.ts (12 stubs fixed)
- **StoreNamedAttributeNode**: Now uses `geometry.setAttribute()` to create proper `THREE.BufferAttribute` arrays based on data type (float/vec3/color/boolean/integer). Clones geometry before mutation.
- **CaptureAttributeNode**: Now reads existing named attributes from geometry (e.g., 'position' for point domain) and returns arrays of values. Falls back to replicating input value.
- **RemoveAttributeNode**: Now uses `geometry.deleteAttribute()` after cloning geometry. Handles missing attributes gracefully.
- **NamedAttributeNode**: Now uses `geometry.hasAttribute()` and `geometry.getAttribute()` to return real `exists` boolean and attribute data arrays. Reads item sizes 1-4 correctly.
- **PositionInputNode**: Now reads from `geometry.attributes.position` when a `THREE.BufferGeometry` is passed. Returns first vertex position.
- **NormalInputNode**: Now reads from `geometry.attributes.normal`. Computes normals via `computeVertexNormals()` if missing.
- **TangentInputNode**: Now computes tangent using Gram-Schmidt orthogonalization from normal + UV. Falls back to cross product with up vector.
- **UVMapInputNode**: Now reads from `geometry.attributes.uv`, with fallback to `uv1`/`uv2`.
- **ColorInputNode**: Now reads from `geometry.attributes.color` or `color0`.
- **RadiusInputNode**: Now reads from `geometry.attributes.radius`, with fallback to bounding sphere radius.
- **IdInputNode**: Now reads from `geometry.attributes.id`.
- **IndexInputNode**: Now returns `geometry.attributes.position.count` (vertex count).

### File 2: src/core/nodes/output/OutputNodes.ts (10 stubs fixed)
- **ImageOutputNode**: Now encodes to base64 PNG via canvas. Handles ImageData, Uint8ClampedArray, Uint8Array, ArrayBuffer, and structured pixel data objects. Falls back for SSR.
- **BoundingBoxOutputNode**: Now computes actual bounding box from geometry using `geometry.computeBoundingBox()`. Creates visible `THREE.LineSegments` via `THREE.EdgesGeometry`. Also handles Object3D inputs.
- **DepthOutputNode**: Now extracts depth values from geometry positions (Z-component). Supports normalization and min/max tracking.
- **NormalOutputNode**: Now reads normals from geometry, encodes [-1,1] → [0,1] for texture storage, annotates with space type.
- **UVOutputNode**: Now reads UV data from geometry attributes (uv/uv1/uv2).
- **AlbedoOutputNode**: Now extracts vertex colors from geometry (color/color0 attributes). Falls back to material color.
- **ShadowOutputNode**: Now computes N·L shadow values per vertex using light direction and vertex normals.
- **AmbientOcclusionOutputNode**: Now computes hemisphere AO sampling per vertex using cosine-weighted sampling in tangent frame.
- **WireframeOutputNode**: Now creates `THREE.LineSegments` via `THREE.EdgesGeometry` with configurable color/opacity.
- **DebugOutputNode**: Now produces structured debug output with type info, timestamp, and label.

### File 3: src/core/nodes/simulation/SimulationNodes.ts (5 stubs fixed)
- **SoftBodySetupNode**: Now builds a proper `SoftBodyConfig` object with derived parameters (springStiffness, solverIterations computed from stiffness).
- **ParticleCollisionNode**: Now builds a proper `ParticleCollisionConfig` object with derived parameters (margin, maxCollisions, killOnCollision computed from bounce/stickiness).
- **FluidFlowNode**: Now builds a proper `FluidFlowConfig` object with derived parameters (density, temperature, fuel computed from velocity/flowType/volume).
- **ClothSetupNode**: Now builds a proper `ClothConfig` object with derived parameters (shearStiffness, airDrag, pinStiffness, selfCollisionDistance computed from primary inputs).
- **ClothPinGroupNode**: Now builds a proper `ClothPinGroupConfig` object with derived parameters (isAbsolute, targetOffset computed from pinStrength).

### File 4: src/core/nodes/geometry/AttributeNodes.ts (1 stub fixed)
- **executeRaycast**: Now implements full Möller-Trumbore ray-triangle intersection algorithm. Iterates all triangles (indexed and non-indexed geometry), finds closest hit, computes barycentric interpolation for hit position and cross-product face normal.

### File 5: src/core/nodes/camera/CameraNodes.ts (1 stub fixed)
- **CameraDataNode**: Now computes actual depth (projection of target-camera vector onto camera forward axis) and distance (Euclidean distance from camera to target). Falls back to near/far midpoint when no target provided. Added `targetPosition` parameter.

## Part B: Articulated Objects

Created `src/assets/objects/articulated/` with 20 files:

### Types (types.ts)
- `JointInfo` interface with id, type, axis, limits, childMesh, parentMesh, anchor, damping, friction, actuated, motor
- `ArticulatedObjectConfig` with seed, style, scale, materialOverrides
- `ArticulatedObjectResult` with group, joints, category, config, toMJCF()
- `generateMJCF()` function for MJCF XML export
- `ArticulatedObjectBase` abstract class with createBox, createCylinder, createJoint helpers

### 18 Generators
1. **DoorGenerator** - Hinged door with frame and handle
2. **DrawerGenerator** - Sliding drawer in cabinet
3. **CabinetGenerator** - Hinged cabinet with shelf
4. **WindowGenerator** - Casement window (hinged)
5. **ToasterGenerator** - Toaster with sliding lever
6. **RefrigeratorGenerator** - Dual hinged doors (freezer + fridge)
7. **OvenGenerator** - Drop-down hinged oven door
8. **MicrowaveGenerator** - Side-hinged microwave door
9. **DishwasherGenerator** - Drop-down hinged dishwasher door
10. **LampGenerator** - Articulated desk lamp with ball joints
11. **TrashCanGenerator** - Hinged lid trash can
12. **BoxGenerator** - Hinged lid storage box
13. **FaucetGenerator** - Faucet with lever handle
14. **PepperGrinderGenerator** - Rotating knob pepper grinder
15. **DoorHandleGenerator** - Lever-style door handle
16. **PliersGenerator** - Hinged jaw pliers
17. **CooktopGenerator** - Cooktop with 4 rotating knobs
18. **SoapDispenserGenerator** - Pump-action soap dispenser

### Index (index.ts)
- Exports all types, base class, and 18 generators
- Registers all generators with ObjectRegistry
- Provides `createArticulatedObject()` convenience function
- Provides `getArticulatedObjectNames()` utility

### Integration
- Added `export * from './articulated'` to `src/assets/objects/index.ts`

## Verification
- 0 TypeScript errors across the entire project after all changes
