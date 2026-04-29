/**
 * Cave Generation System
 * Implements asset-based cave generation with decorations, stalactites/stalagmites, and lighting
 */
import * as THREE from 'three';
export interface CaveParams {
    /** Cave density (0-1) */
    density: number;
    /** Average cave size in meters */
    caveSize: number;
    /** Cave complexity/noise scale */
    complexity: number;
    /** Enable stalactites (ceiling formations) */
    enableStalactites: boolean;
    /** Enable stalagmites (floor formations) */
    enableStalagmites: boolean;
    /** Stalactite density */
    stalactiteDensity: number;
    /** Stalagmite density */
    stalagmiteDensity: number;
    /** Enable cave decorations (crystals, rocks, etc.) */
    enableDecorations: boolean;
    /** Decoration density */
    decorationDensity: number;
    /** Enable cave lighting */
    enableLighting: boolean;
    /** Light intensity */
    lightIntensity: number;
    /** Light color */
    lightColor: THREE.Color;
}
export interface CaveDecoration {
    type: 'stalactite' | 'stalagmite' | 'crystal' | 'rock' | 'puddle';
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    material?: THREE.Material;
}
export declare class CaveGenerator {
    private params;
    private sdfOps;
    private decorations;
    constructor(params?: Partial<CaveParams>);
    /**
     * Generate cave SDF by subtracting from terrain SDF
     */
    generateCaves(terrainSDF: Float32Array, width: number, height: number, depth: number): Float32Array;
    /**
     * Generate cave decorations
     */
    generateDecorations(caveMesh: THREE.Mesh, bounds: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    }): CaveDecoration[];
    private generateStalactites;
    private generateStalagmites;
    private generateAdditionalDecorations;
    /**
     * Create geometry for decorations
     */
    createDecorationGeometry(decoration: CaveDecoration): THREE.BufferGeometry;
    /**
     * Create instanced mesh for all decorations
     */
    createInstancedMesh(scene: THREE.Scene): THREE.InstancedMesh;
    /**
     * Create cave lighting
     */
    createLighting(scene: THREE.Scene, bounds: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    }): void;
    /**
     * Update parameters
     */
    setParams(params: Partial<CaveParams>): void;
    /**
     * Get decorations
     */
    getDecorations(): CaveDecoration[];
    /**
     * Simple Perlin-like noise function
     */
    private perlinNoise;
    private fade;
    private lerp;
    private grad;
    private perm;
}
export default CaveGenerator;
//# sourceMappingURL=CaveGenerator.d.ts.map