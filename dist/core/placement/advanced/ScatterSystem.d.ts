/**
 * Scatter System for InfiniGen R3F
 *
 * Provides advanced scattering capabilities:
 * - Distribution maps (density, exclusion zones)
 * - Clumping and grouping behaviors
 * - Instance variation (scale, rotation, mesh selection)
 * - LOD-based culling
 * - Semantic-aware scattering
 */
import { Vector3, Mesh } from 'three';
import { BBox } from '../util/math/bbox';
export interface ScatterConfig {
    /** Base density (instances per square unit) */
    density: number;
    /** Minimum distance between instances */
    minDistance: number;
    /** Maximum number of instances */
    maxInstances: number;
    /** Scale variation range [min, max] */
    scaleRange: [number, number];
    /** Rotation variation (radians) around Y axis */
    rotationVariation: number;
    /** Whether to align to surface normal */
    alignToSurface: boolean;
    /** Distribution map for density control */
    distributionMap?: DensityMap;
    /** Clumping configuration */
    clumping?: ClumpingConfig;
    /** Exclusion zones */
    exclusionZones?: BBox[];
    /** Mesh variants to choose from */
    meshVariants?: Mesh[];
    /** LOD distances */
    lodDistances?: [number, number, number];
}
export interface ClumpingConfig {
    /** Number of clumps */
    numClumps: number;
    /** Clump radius */
    clumpRadius: number;
    /** Instances per clump (average) */
    instancesPerClump: number;
    /** Clump centers (if predefined) */
    clumpCenters?: Vector3[];
}
export interface DensityMap {
    /** Map resolution */
    resolution: [number, number];
    /** Density values (0-1) */
    values: Float32Array;
    /** Bounds of the map */
    bounds: BBox;
}
export interface ScatteredInstance {
    position: Vector3;
    rotation: Vector3;
    scale: Vector3;
    meshIndex: number;
    lodLevel: number;
}
export declare class DensityMapGenerator {
    private resolution;
    private values;
    private bounds;
    constructor(resolution: [number, number], bounds: BBox);
    /**
     * Set density value at grid position
     */
    setValue(x: number, y: number, value: number): void;
    /**
     * Get density value at world position
     */
    getValue(worldPos: Vector3): number;
    /**
     * Create gradient density map
     */
    createGradient(direction: 'x' | 'z', startValue: number, endValue: number): void;
    /**
     * Create radial density map from center points
     */
    createRadial(centers: Vector3[], maxRadius: number, falloff?: 'linear' | 'exponential'): void;
    /**
     * Create noise-based density map
     */
    createNoise(noiseFn: (x: number, y: number) => number, scale?: number): void;
    getDensityMap(): DensityMap;
}
export declare class ClumpingSystem {
    private config;
    private clumpCenters;
    constructor(config: ClumpingConfig);
    private generateClumpCenters;
    /**
     * Generate positions with clumping behavior
     */
    generatePositions(totalCount: number): Vector3[];
    getClumpCenters(): Vector3[];
}
export declare class VariationEngine {
    private scaleRange;
    private rotationVariation;
    private meshVariants;
    constructor(scaleRange: [number, number], rotationVariation: number, meshVariants?: Mesh[]);
    /**
     * Generate random scale
     */
    generateScale(seed?: number): Vector3;
    /**
     * Generate random rotation (primarily around Y axis)
     */
    generateRotation(alignToSurface: boolean, normal?: Vector3, seed?: number): Vector3;
    /**
     * Select mesh variant
     */
    selectMesh(seed?: number): number;
    /**
     * Generate complete instance data
     */
    generateInstance(position: Vector3, normal?: Vector3, seed?: number): ScatteredInstance;
}
export declare class LODManager {
    private lodDistances;
    constructor(lodDistances?: [number, number, number]);
    /**
     * Determine LOD level based on camera distance
     */
    getLODLevel(cameraPosition: Vector3, instancePosition: Vector3): number;
    /**
     * Update LOD levels for all instances
     */
    updateLODs(instances: ScatteredInstance[], cameraPosition: Vector3): number;
}
export interface ScatterOptions {
    config: ScatterConfig;
    bounds: BBox;
    meshes?: Mesh[];
    cameraPosition?: Vector3;
}
export declare class ScatterSystem {
    private config;
    private bounds;
    private placer;
    private clumpingSystem;
    private variationEngine;
    private lodManager;
    constructor(options: ScatterOptions);
    /**
     * Generate scattered instances
     */
    scatter(cameraPosition?: Vector3): Promise<ScatteredInstance[]>;
    /**
     * Update LODs for existing instances
     */
    updateLODs(instances: ScatteredInstance[], cameraPosition: Vector3): number;
    /**
     * Get statistics about the scatter
     */
    getStatistics(instances: ScatteredInstance[]): ScatterStats;
}
export interface ScatterStats {
    totalInstances: number;
    visibleInstances: number;
    culledInstances: number;
    lodBreakdown: {
        high: number;
        medium: number;
        low: number;
        culled: number;
    };
}
/**
 * Create default scatter configuration
 */
export declare function createDefaultScatterConfig(): ScatterConfig;
/**
 * Quick scatter helper
 */
export declare function quickScatter(count: number, bounds: BBox, options?: Partial<ScatterConfig>): Promise<ScatteredInstance[]>;
//# sourceMappingURL=ScatterSystem.d.ts.map