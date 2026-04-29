import * as THREE from 'three';
/**
 * Density-Based Placement System
 *
 * Places objects based on density fields and distribution maps:
 * - Heat map driven placement (higher density = more objects)
 * - Gradient-based distribution
 * - Multi-region density control
 * - Attraction/repulsion fields
 * - Procedural density functions (noise, radial, custom)
 *
 * @module DensityPlacementSystem
 */
/**
 * Types of density functions
 */
export declare enum DensityFunctionType {
    /** Constant density everywhere */
    CONSTANT = "constant",
    /** Radial falloff from center point */
    RADIAL = "radial",
    /** Gradient along an axis */
    GRADIENT = "gradient",
    /** Perlin/Simplex noise based */
    NOISE = "noise",
    /** Multiple Gaussian peaks */
    GAUSSIAN = "gaussian",
    /** Custom function provided by user */
    CUSTOM = "custom",
    /** From texture/heightmap */
    TEXTURE = "texture"
}
/**
 * Density field configuration
 */
export interface DensityField {
    /** Type of density function */
    type: DensityFunctionType;
    /** Center point for radial/gaussian */
    center?: THREE.Vector3;
    /** Radius of influence */
    radius?: number;
    /** Direction for gradient */
    direction?: THREE.Vector3;
    /** Scale/multiplier for density */
    scale?: number;
    /** Offset to add to density */
    offset?: number;
    /** Noise parameters */
    noiseParams?: {
        scale: number;
        octaves: number;
        persistence: number;
        lacunarity: number;
    };
    /** Gaussian parameters */
    gaussianParams?: {
        sigma: number;
        amplitude: number;
    }[];
    /** Custom density function */
    customFunction?: (position: THREE.Vector3) => number;
    /** Texture for texture-based density */
    texture?: THREE.Texture;
    /** Texture mapping bounds */
    textureBounds?: THREE.Box2;
}
/**
 * Configuration for density-based placement
 */
export interface DensityPlacementConfig {
    /** Bounding region for placement */
    bounds: THREE.Box3;
    /** Target number of objects */
    targetCount: number;
    /** Density fields that define distribution */
    densityFields: DensityField[];
    /** Surface mesh to place on (optional) */
    surface?: THREE.Mesh;
    /** Minimum spacing between objects */
    minSpacing?: number;
    /** Maximum attempts per object */
    maxAttempts?: number;
    /** Density threshold below which placement is rejected */
    minDensityThreshold?: number;
    /** Use rejection sampling vs weighted sampling */
    samplingMethod?: 'rejection' | 'weighted';
    /** Seed for reproducibility */
    seed?: number;
}
/**
 * Placement result from density-based system
 */
export interface DensityPlacementInstance {
    /** Position in world space */
    position: THREE.Vector3;
    /** Density value at this position */
    density: number;
    /** Which density field contributed most */
    primaryFieldIndex: number;
    /** Normal if placed on surface */
    normal?: THREE.Vector3;
}
/**
 * Complete density placement result
 */
export interface DensityPlacementResult {
    /** All placed instances */
    instances: DensityPlacementInstance[];
    /** Actual count placed */
    actualCount: number;
    /** Requested count */
    requestedCount: number;
    /** Success rate */
    successRate: number;
    /** Density statistics */
    statistics: {
        averageDensity: number;
        maxDensity: number;
        minDensity: number;
        densityVariance: number;
        coveragePercentage: number;
        boundingBox: THREE.Box3;
    };
    /** Total attempts made */
    totalAttempts: number;
}
/**
 * Density-Based Placement System Class
 *
 * Generates object placements based on density fields and distribution functions.
 */
export declare class DensityPlacementSystem {
    /** Default minimum spacing */
    private static readonly DEFAULT_MIN_SPACING;
    /** Default max attempts */
    private static readonly DEFAULT_MAX_ATTEMPTS;
    /** Default density threshold */
    private static readonly DEFAULT_MIN_DENSITY;
    /** RNG instance */
    private rng;
    /** Noise generator */
    private noise;
    /** Spatial grid for collision detection */
    private spatialGrid;
    /** Grid cell size */
    private gridSize;
    /** Raycaster for surface projection */
    private raycaster;
    constructor();
    /**
     * Execute density-based placement
     */
    place(config: DensityPlacementConfig): DensityPlacementResult;
    /**
     * Calculate density at a position from all fields
     */
    private calculateDensity;
    /**
     * Evaluate a single density field at a position
     */
    private evaluateField;
    /**
     * Generate random position within bounds
     */
    private randomPositionInBounds;
    /**
     * Generate weighted samples for efficient sampling
     */
    private generateWeightedSamples;
    /**
     * Check spacing against existing instances
     */
    private checkSpacing;
    /**
     * Project position to surface
     */
    private projectToSurface;
    /**
     * Add instance to spatial grid
     */
    private addToSpatialGrid;
    /**
     * Get grid cell key
     */
    private getGridCellKey;
    /**
     * Get nearby grid cells
     */
    private getNearbyGridCells;
    /**
     * Calculate placement statistics
     */
    private calculateStatistics;
    /**
     * Visualize density field as points
     */
    visualize(result: DensityPlacementResult, colorFn?: (density: number) => number): THREE.Points;
    /**
     * Export to JSON
     */
    toJSON(result: DensityPlacementResult): string;
}
export default DensityPlacementSystem;
//# sourceMappingURL=DensityPlacementSystem.d.ts.map