/**
 * GPUSurfaceShaders.ts
 *
 * WebGL compute shaders for parallel surface displacement calculations.
 * Provides GPU-accelerated evaluation of surface kernel functions.
 *
 * Based on original Infinigen's GPU surface evaluation system.
 */
import { ShaderMaterial, DataTexture } from 'three';
export interface SurfaceShaderConfig {
    maxKernelCount: number;
    textureSize: number;
    enableParallelEvaluation: boolean;
    precision: 'highp' | 'mediump' | 'lowp';
}
/**
 * Manages GPU surface shader programs and execution
 */
export declare class GPUSurfaceShaders {
    private config;
    private surfaceMaterial;
    private computeProgram;
    private kernelParamTexture;
    constructor(config?: Partial<SurfaceShaderConfig>);
    /**
     * Initialize shader materials and programs
     */
    initialize(): void;
    /**
     * Initialize compute fallback using fragment shaders (WebGL 1.0 compatible)
     */
    private initializeComputeFallback;
    /**
     * Patch shader code with correct precision qualifiers
     */
    private patchShaderPrecision;
    /**
     * Upload kernel parameters to GPU texture
     */
    uploadKernelParameters(kernels: Array<{
        amplitude: number;
        frequency: number;
        lacunarity: number;
        persistence: number;
        offsetX: number;
        offsetZ: number;
        octaves: number;
        type: number;
    }>): void;
    /**
     * Get configured surface material
     */
    getSurfaceMaterial(): ShaderMaterial | null;
    /**
     * Update shader uniforms
     */
    updateUniforms(uniforms: {
        heightMap?: any;
        displacementScale?: number;
        baseColor?: [number, number, number];
        roughness?: number;
        metalness?: number;
    }): void;
    /**
     * Execute GPU kernel evaluation
     */
    executeKernelEvaluation(inputPositions: DataTexture, outputTarget: any): void;
    /**
     * Cleanup resources
     */
    dispose(): void;
    /**
     * Check if GPU compute is supported
     */
    static isGPUSupported(renderer: any): boolean;
}
export default GPUSurfaceShaders;
//# sourceMappingURL=GPUSurfaceShaders.d.ts.map