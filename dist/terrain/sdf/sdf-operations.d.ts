/**
 * SDF (Signed Distance Field) Operations
 *
 * Ports: infinigen/terrain/mesh_to_sdf/
 *
 * Provides mesh-to-SDF conversion and SDF boolean operations
 * for advanced terrain manipulation.
 */
import * as THREE from 'three';
export interface SDFConfig {
    resolution: number;
    bounds: THREE.Box3;
    maxDistance?: number;
}
export type SDFData = Float32Array;
/**
 * Signed Distance Field representation
 */
export declare class SignedDistanceField {
    data: SDFData;
    resolution: number;
    bounds: THREE.Box3;
    gridSize: [number, number, number];
    voxelSize: THREE.Vector3;
    constructor(config: SDFConfig);
    /**
     * Get index in the flat array from 3D coordinates
     */
    getIndex(x: number, y: number, z: number): number;
    /**
     * Get SDF value at world position
     */
    getValue(position: THREE.Vector3): number;
    /**
     * Set SDF value at world position
     */
    setValue(position: THREE.Vector3, value: number): void;
    /**
     * Check if position is inside the SDF (negative distance)
     */
    isInside(position: THREE.Vector3): boolean;
    /**
     * Get world position from grid coordinates
     */
    getPosition(gx: number, gy: number, gz: number): THREE.Vector3;
    /**
     * Sample SDF with trilinear interpolation
     */
    sample(position: THREE.Vector3): number;
    private getSafeValue;
}
/**
 * Convert a mesh to SDF
 */
export declare function meshToSDF(geometry: THREE.BufferGeometry, config: SDFConfig): SignedDistanceField;
/**
 * Boolean operation on two SDFs
 */
export declare function sdfBoolean(sdf1: SignedDistanceField, sdf2: SignedDistanceField, operation: 'union' | 'intersection' | 'difference'): SignedDistanceField;
/**
 * Smooth union of two SDFs
 */
export declare function sdfSmoothUnion(sdf1: SignedDistanceField, sdf2: SignedDistanceField, k?: number): SignedDistanceField;
/**
 * Offset/Surface SDF by a distance
 */
export declare function sdfOffset(sdf: SignedDistanceField, distance: number): SignedDistanceField;
/**
 * Extract isosurface from SDF using Marching Cubes
 */
export declare function extractIsosurface(sdf: SignedDistanceField, isolevel?: number): THREE.BufferGeometry;
/**
 * Create SDF from primitive shapes
 */
export declare function createPrimitiveSDF(type: 'sphere' | 'box' | 'cylinder' | 'plane', bounds: THREE.Box3, resolution: number, params: any): SignedDistanceField;
//# sourceMappingURL=sdf-operations.d.ts.map