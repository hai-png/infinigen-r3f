/**
 * Infinigen R3F Port - Uniform Mesher
 * Regular grid-based meshing with automatic subdivision
 *
 * Based on original: infinigen/terrain/mesher/uniform_mesher.py
 */
import { BufferGeometry } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';
export interface UniformMesherConfig {
    subdivisions: [number, number, number];
    upscale: number;
    enclosed: boolean;
    bisectionIters: number;
    verbose: boolean;
}
export declare class UniformMesher {
    private config;
    private bounds;
    private xN;
    private yN;
    private zN;
    private voxelSize;
    constructor(bounds: [number, number, number, number, number, number], config?: Partial<UniformMesherConfig>);
    /**
     * Generate mesh from SDF kernels using uniform grid sampling
     */
    generateMesh(kernels: SDFKernel[]): BufferGeometry;
    /**
     * Sample SDF values on uniform grid
     */
    private sampleSDFGrid;
    /**
     * Run marching cubes on SDF grid
     */
    private runMarchingCubes;
    /**
     * Refine surface intersection using bisection
     */
    private refineWithBisection;
    /**
     * Process intersecting cube and generate triangles
     */
    private processIntersectingCube;
    /**
     * Enclose mesh to create watertight volume
     */
    private encloseMesh;
    private calculateCubeIndex;
}
//# sourceMappingURL=UniformMesher.d.ts.map