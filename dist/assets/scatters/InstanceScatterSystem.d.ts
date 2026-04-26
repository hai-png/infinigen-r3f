/**
 * InstanceScatterSystem
 *
 * Procedural scattering system for distributing objects (vegetation, rocks, debris)
 * across surfaces with advanced placement rules, collision avoidance, and LOD support.
 *
 * Features:
 * - Surface-based scattering with normal alignment
 * - Density maps and gradient-based distribution
 * - Collision detection and overlap prevention
 * - Scale, rotation, and position randomization
 * - LOD (Level of Detail) instance management
 * - Biome-based distribution rules
 * - Poisson disk sampling for natural distribution
 */
import { Object3D, Vector3, Quaternion, Matrix4, BufferGeometry, InstancedMesh, Box3, Sphere } from 'three';
export type ScatterMode = 'random' | 'poisson' | 'grid' | 'paint';
export type AlignmentMode = 'normal' | 'up' | 'look_at' | 'random';
export type DistributionType = 'uniform' | 'gradient' | 'texture' | 'custom';
export interface ScatterInstance {
    id: string;
    position: Vector3;
    rotation: Quaternion;
    scale: Vector3;
    objectId: string;
    metadata?: {
        biome?: string;
        density?: number;
        height?: number;
        slope?: number;
        custom?: Record<string, any>;
    };
}
export interface ScatterObject {
    id: string;
    mesh: Object3D | BufferGeometry;
    material?: any;
    weight: number;
    minScale: Vector3;
    maxScale: Vector3;
    lodLevels?: {
        distance: number;
        mesh: Object3D | BufferGeometry;
    }[];
}
export interface ScatterRules {
    minDistance: number;
    maxDistance: number;
    alignToNormal: boolean;
    alignUpVector: Vector3;
    avoidCollisions: boolean;
    collisionRadius: number;
    slopeLimit: number;
    heightRange: {
        min: number;
        max: number;
    };
    densityMap?: number[][];
    exclusionZones?: Box3[] | Sphere[];
    inclusionZones?: Box3[] | Sphere[];
}
export interface ScatterConfig {
    mode: ScatterMode;
    distribution: DistributionType;
    count: number;
    seed?: number;
    poissonRadius?: number;
    gridSize?: number;
    randomRotation: {
        enabled: boolean;
        minYaw: number;
        maxYaw: number;
        minPitch: number;
        maxPitch: number;
        minRoll: number;
        maxRoll: number;
    };
    randomScale: {
        enabled: boolean;
        min: Vector3;
        max: Vector3;
    };
    alignment: AlignmentMode;
    lookAtTarget?: Vector3;
}
export interface ScatterResult {
    success: boolean;
    instances: ScatterInstance[];
    rejectedCount: number;
    computationTime: number;
    statistics: {
        averageDensity: number;
        coverageArea: number;
        boundingBox: Box3;
    };
}
export interface Biome {
    id: string;
    name: string;
    objects: {
        objectId: string;
        weight: number;
        minSlope: number;
        maxSlope: number;
    }[];
    density: number;
    rules: Partial<ScatterRules>;
}
export declare class InstanceScatterSystem {
    private config;
    private rules;
    private objects;
    private biomes;
    private instances;
    private raycaster;
    private seed;
    private currentPositions;
    constructor(config?: Partial<ScatterConfig>, rules?: Partial<ScatterRules>);
    /**
     * Register a scatterable object
     */
    registerObject(obj: ScatterObject): void;
    /**
     * Remove a registered object
     */
    removeObject(id: string): void;
    /**
     * Register a biome
     */
    registerBiome(biome: Biome): void;
    /**
     * Set scatter configuration
     */
    setConfig(config: Partial<ScatterConfig>): void;
    /**
     * Set scatter rules
     */
    setRules(rules: Partial<ScatterRules>): void;
    /**
     * Clear all instances
     */
    clearInstances(): void;
    /**
     * Get all current instances
     */
    getInstances(): Map<string, ScatterInstance>;
    /**
     * Scatter objects on a surface geometry
     */
    scatterOnSurface(geometry: BufferGeometry, transform: Matrix4, activeBiome?: string): ScatterResult;
    /**
     * Scatter objects on a terrain with height map
     */
    scatterOnTerrain(width: number, depth: number, heightFunction: (x: number, z: number) => number, normalFunction?: (x: number, z: number) => Vector3): ScatterResult;
    /**
     * Create an InstancedMesh from scattered instances
     */
    createInstancedMesh(baseGeometry: BufferGeometry, material: any, objectIds?: string[]): InstancedMesh;
    /**
     * Remove instances in a region
     */
    removeInstancesInRegion(region: Box3 | Sphere): number;
    /**
     * Get statistics
     */
    getStatistics(): {
        totalInstances: number;
        objectsPerType: Map<string, number>;
        averageScale: Vector3;
        boundingBox: Box3;
    };
    /**
     * Export instances to JSON
     */
    exportToJSON(): string;
    /**
     * Import instances from JSON
     */
    importFromJSON(json: string): void;
    /**
     * Generate sample points based on configured mode
     */
    private generateSamplePoints;
    /**
     * Select objects based on biome
     */
    private selectObjectsForBiome;
    /**
     * Select a random object based on weights
     */
    private selectRandomObject;
    /**
     * Validate placement against rules
     */
    private validatePlacement;
    /**
     * Calculate rotation for an instance
     */
    private calculateRotation;
    /**
     * Calculate scale for an instance
     */
    private calculateScale;
}
export default InstanceScatterSystem;
//# sourceMappingURL=InstanceScatterSystem.d.ts.map