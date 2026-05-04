/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Complete suite of terrain meshing algorithms with LOD support
 */

export { TerrainMesher } from './TerrainMesher';
export type { MeshConfig, ChunkData } from './TerrainMesher';

export { SphericalMesher, OpaqueSphericalMesher, TransparentSphericalMesher } from './SphericalMesher';
export type { SphericalMesherConfig, CameraPose } from './SphericalMesher';

export { UniformMesher } from './UniformMesher';
export type { UniformMesherConfig } from './UniformMesher';

export { FrontViewSphericalMesher } from './FrontViewSphericalMesher';
export type { FrontViewConfig } from './FrontViewSphericalMesher';

export { CubeSphericalMesher } from './CubeSphericalMesher';
export type { CubeSphericalConfig } from './CubeSphericalMesher';

export { LODMesher } from './LODMesher';
export type { LODConfig, LODChunk } from './LODMesher';

/**
 * @deprecated Use `TerrainLODConfigFields` from `@/assets/core/LODSystem` instead.
 * Alias kept for backward compatibility — re-exported from canonical location.
 */
export type { TerrainLODConfigFields } from '@/assets/core/LODSystem';

// Chunked terrain system with LOD management
export { ChunkedTerrainSystem, LODLevel } from './ChunkedTerrainSystem';
export type { ChunkedTerrainConfig, TerrainChunk } from './ChunkedTerrainSystem';

// Occlusion-aware mesher for wide-FOV cameras
export { OcclusionMesher, OpaqueOcMesher, TransparentOcMesher, CollectiveOcMesher, OctreeNode } from './OcMesher';
export type { OcMesherConfig, OcMesherResult } from './OcMesher';
export { DEFAULT_OC_MESHER_CONFIG } from './OcMesher';
