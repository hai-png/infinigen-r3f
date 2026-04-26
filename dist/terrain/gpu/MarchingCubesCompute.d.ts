/**
 * Infinigen R3F Port - GPU Compute Shader Implementation
 * WebGPU-based Marching Cubes for Real-time Mesh Generation
 */
import { BufferGeometry } from 'three';
export interface GPUComputeConfig {
    voxelSize: number;
    gridSize: number;
    isoLevel: number;
    useNormals: boolean;
}
export interface MarchingCubesResult {
    vertices: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    vertexCount: number;
    triangleCount: number;
}
/**
 * GPU-accelerated Marching Cubes using WebGPU compute shaders
 * Provides real-time volumetric mesh generation
 */
export declare class MarchingCubesCompute {
    private device;
    private pipeline;
    private bindGroupLayout;
    private config;
    private initialized;
    private static readonly edgeTable;
    private static readonly triTableData;
    private static readonly triTable;
    constructor(config?: Partial<GPUComputeConfig>);
    /**
     * Initialize WebGPU device and compute pipeline
     */
    initialize(): Promise<boolean>;
    /**
     * WGSL compute shader for Marching Cubes
     */
    private getWGSLShader;
    /**
     * Execute GPU marching cubes on voxel data
     */
    execute(voxelData: Float32Array): Promise<MarchingCubesResult>;
    /**
     * Fallback CPU implementation when WebGPU is not available
     */
    executeCPU(voxelData: Float32Array): MarchingCubesResult;
    /**
     * Convert result to Three.js geometry
     */
    toGeometry(result: MarchingCubesResult): BufferGeometry;
    /**
     * Check if WebGPU is available
     */
    static isWebGPUSupported(): boolean;
}
//# sourceMappingURL=MarchingCubesCompute.d.ts.map