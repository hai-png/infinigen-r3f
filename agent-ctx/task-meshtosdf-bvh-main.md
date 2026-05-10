# Task: Implement BVH-Accelerated mesh_to_sdf Conversion

## Agent: Main Developer

## Summary

Implemented `/home/z/my-project/infinigen-r3f/src/terrain/sdf/MeshToSDF.ts` with the following components:

### 1. MeshToSDF Class (BVH-Accelerated)
- Uses `three-mesh-bvh`'s `MeshBVH` for O(n×log(triangles)) spatial queries
- Accepts `THREE.BufferGeometry` or `THREE.Mesh` as input
- Builds a MeshBVH from geometry with configurable strategy (CENTER/AVERAGE/SAH)
- **Single-point query** (`queryPoint()`): Returns signed distance, closest point, face index, inside/outside flag
- **Batch query** (`queryPointsBatch()`): Efficient batch evaluation with warm BVH cache
- **Full grid computation** (`computeSDFGrid()`): Returns an SDFGrid with signed distances at every voxel
- **Sign determination** via ray-cast intersection counting: Casts multiple rays, majority vote determines inside/outside

### 2. OccupancyVolume Class
- 3D grid of occupancy values (0.0 = solid, 1.0 = tunnel/open)
- Factory methods: `fromMesh()` (BVH-accelerated) and `fromTunnelData()` (L-system rasterization)
- **Trilinear interpolation** (`sample()`) for smooth SDF evaluation
- **Tricubic interpolation** (`sampleCubic()`) using Catmull-Rom splines for higher quality
- **Voronoi-tiled placement** with rotation: `sampleTiled()` and `sampleVoronoiTiled()`
- Threshold parameter for wall thickness control
- `toSDF()` method converts occupancy to signed distance

### 3. SDFGrid Class
- General-purpose 3D SDF storage with AABB bounds and configurable resolution
- Trilinear interpolation for smooth evaluation
- Gradient computation (central differences) for surface normals
- Composition via combinators: union, intersection, difference, smooth-union
- `offset()` for SDF surface offsetting
- `toEvaluator()` returns a function compatible with SDFPrimitives.SDFEvaluator
- **Serialization/deserialization** via base64-encoded Float32Array

### 4. Cave Integration
- `generateTunnelMesh()`: Creates tube geometry from L-system path with variable radius, proper tangent frames, and end caps
- `caveTunnelToSDF()`: Full pipeline — L-system → tunnel mesh → MeshToSDF → OccupancyVolume
- Supports two paths: BVH-accelerated (higher quality) and direct occupancy (faster)
- `createCaveSDFEvaluator()`: Convenience function returning an SDF evaluator for TerrainElementSystem

### Updated Files
- Created: `src/terrain/sdf/MeshToSDF.ts`
- Updated: `src/terrain/sdf/index.ts` (added `export * from './MeshToSDF'`)

### TypeScript Verification
- No TypeScript compilation errors in MeshToSDF.ts
- All pre-existing errors are in unrelated files (SnowSystem.ts)
