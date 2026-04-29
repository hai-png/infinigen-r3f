/**
 * Surface Generation System
 * Ports core surface generation logic from Infinigen's surface.py (16KB)
 * Handles procedural surface creation, displacement, and detail mapping
 */
import { Vector3, BufferGeometry, Mesh, Shape } from 'three';
export interface SurfaceConfig {
    seed: number;
    resolution: number;
    displacementScale: number;
    displacementDetail: number;
    roughness: number;
    detailFrequency: number;
    detailAmplitude: number;
    boundaryType: 'open' | 'closed' | 'periodic';
}
export interface DisplacementField {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
}
export declare enum SurfacePrimitive {
    PLANE = "plane",
    SPHERE = "sphere",
    CYLINDER = "cylinder",
    BOX = "box",
    TORUS = "torus",
    CUSTOM = "custom"
}
export interface SurfacePrimitiveParams {
    type: SurfacePrimitive;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    radiusTop?: number;
    radiusBottom?: number;
    segments?: number;
    thetaStart?: number;
    thetaLength?: number;
    phiStart?: number;
    phiLength?: number;
    heightSegments?: number;
    radialSegments?: number;
    openEnded?: boolean;
    arc?: number;
    tube?: number;
    tubularSegments?: number;
}
/**
 * Main Surface Generator Class
 * Generates displaced surfaces with configurable detail and boundary conditions
 */
export declare class SurfaceGenerator {
    private rng;
    private config;
    constructor(config?: Partial<SurfaceConfig>);
    /**
     * Generate a base primitive geometry
     */
    generateBasePrimitive(params: SurfacePrimitiveParams): BufferGeometry;
    /**
     * Apply displacement to geometry using noise-based field
     */
    applyDisplacement(geometry: BufferGeometry, intensity?: number): BufferGeometry;
    /**
     * Generate displacement field based on noise functions
     */
    private generateDisplacementField;
    private calculateGradientX;
    private calculateGradientY;
    private noise3D;
    private fade;
    private lerp;
    private pHash;
    private grad;
    generateSurface(primitiveParams: SurfacePrimitiveParams, applyDisplacement?: boolean, displacementIntensity?: number): Mesh;
    private createDefaultMaterial;
    generateExtrudedSurface(shape: Shape, depth?: number): Mesh;
    generateSweptSurface(points: Vector3[], profileShape: Shape, closed?: boolean): Mesh;
    applyBoundaryConditions(geometry: BufferGeometry): void;
    private applyPeriodicBoundary;
    private closeBoundaries;
    subdivide(geometry: BufferGeometry, iterations?: number): BufferGeometry;
    getConfig(): SurfaceConfig;
    setConfig(config: Partial<SurfaceConfig>): void;
}
export default SurfaceGenerator;
//# sourceMappingURL=SurfaceGenerator.d.ts.map