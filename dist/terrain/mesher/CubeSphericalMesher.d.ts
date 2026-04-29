/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Cube Spherical Mesher for Hybrid Planet/Cube Mapping
 *
 * Based on original: infinigen/terrain/mesher/cube_spherical_mesher.py
 * Combines spherical and cube mapping for reduced distortion at poles
 */
import { Vector3, BufferGeometry } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';
export interface CubeSphericalConfig extends SphericalMesherConfig {
    cubeMapResolution: number;
    blendFactor: number;
    cornerSmoothing: number;
}
export declare class CubeSphericalMesher extends SphericalMesher {
    protected cubeConfig: CubeSphericalConfig;
    constructor(cameraPose: CameraPose, bounds: [number, number, number, number, number, number], config?: Partial<CubeSphericalConfig>);
    /**
     * Generate mesh using cube-sphere hybrid mapping
     * Projects sphere onto cube faces for more uniform sampling
     */
    generateMesh(kernels: SDFKernel[]): BufferGeometry;
    /**
     * Convert cube face coordinates to spherical direction
     * Uses blend factor to interpolate between cube and sphere projection
     */
    protected cubeToSphere(normal: Vector3, right: Vector3, up: Vector3, x: number, y: number, blend: number): Vector3;
    /**
     * Smooth cube corners to reduce sharp edges
     */
    protected smoothCorners(direction: Vector3, normal: Vector3, right: Vector3, up: Vector3, x: number, y: number, smoothing: number): Vector3;
}
//# sourceMappingURL=CubeSphericalMesher.d.ts.map