import * as THREE from 'three';
/**
 * Detail Placement System
 *
 * Sophisticated algorithms for placing small decorative objects and details:
 * - Clustering for natural grouping (books, utensils, tools)
 * - Surface conformity (objects conform to surface topology)
 * - Semantic placement rules (books on shelves, cups on tables)
 * - Collision-free micro-adjustments
 * - Variation generation (rotation, scale, offset)
 *
 * @module DetailPlacementSystem
 */
/**
 * Types of detail placement strategies
 */
export declare enum DetailStrategy {
    /** Random scattering with collision avoidance */
    SCATTER = "scatter",
    /** Clustered placement for grouped items */
    CLUSTER = "cluster",
    /** Linear arrangement along edges/paths */
    LINEAR = "linear",
    /** Grid-based organized placement */
    GRID = "grid",
    /** Edge-following placement */
    EDGE = "edge",
    /** Corner-focused placement */
    CORNER = "corner",
    /** Surface-conforming distribution */
    SURFACE = "surface"
}
/**
 * Configuration for detail placement
 */
export interface DetailConfig {
    /** Placement strategy to use */
    strategy: DetailStrategy;
    /** Number of objects to place */
    count: number;
    /** Target surface mesh */
    surface: THREE.Mesh | null;
    /** Bounding area for placement */
    bounds?: THREE.Box3;
    /** Minimum distance between objects */
    minSpacing?: number;
    /** Maximum distance from surface */
    maxDistanceFromSurface?: number;
    /** Rotation constraints */
    rotation?: RotationConstraint;
    /** Scale variation */
    scale?: ScaleConstraint;
    /** Alignment preferences */
    alignment?: AlignmentConfig;
    /** Exclusion zones */
    exclusionZones?: THREE.Box3[];
    /** Inclusion zones (must be within these) */
    inclusionZones?: THREE.Box3[];
    /** Semantic tags for valid placement surfaces */
    requiredTags?: string[];
    /** Tags that invalidate placement */
    forbiddenTags?: string[];
}
/**
 * Rotation constraint configuration
 */
export interface RotationConstraint {
    /** Allow random rotation around Y axis */
    randomY?: boolean;
    /** Fixed rotation around Y */
    fixedY?: number;
    /** Min/max rotation around X */
    xRange?: [number, number];
    /** Min/max rotation around Z */
    zRange?: [number, number];
    /** Align to surface normal */
    alignToNormal?: boolean;
}
/**
 * Scale constraint configuration
 */
export interface ScaleConstraint {
    /** Uniform scale range [min, max] */
    uniform?: [number, number];
    /** Per-axis scale ranges */
    perAxis?: {
        x: [number, number];
        y: [number, number];
        z: [number, number];
    };
}
/**
 * Alignment configuration
 */
export interface AlignmentConfig {
    /** Align to world up */
    worldUp?: boolean;
    /** Align to surface normal */
    surfaceNormal?: boolean;
    /** Prefer cardinal directions */
    cardinalDirections?: boolean;
    /** Snap to grid */
    snapToGrid?: boolean;
    /** Grid size for snapping */
    gridSize?: number;
}
/**
 * Cluster configuration for grouped placements
 */
export interface ClusterConfig {
    /** Number of clusters to create */
    clusterCount: number;
    /** Objects per cluster (or range) */
    objectsPerCluster: number | [number, number];
    /** Cluster radius */
    clusterRadius: number;
    /** Cluster centers (optional, will generate if not provided) */
    clusterCenters?: THREE.Vector3[];
}
/**
 * Linear arrangement configuration
 */
export interface LinearConfig {
    /** Start point */
    start: THREE.Vector3;
    /** End point */
    end: THREE.Vector3;
    /** Spacing between objects */
    spacing: number;
    /** Offset from line */
    offset?: number;
    /** Randomize along line */
    randomize?: boolean;
    /** Randomization amount */
    randomAmount?: number;
}
/**
 * Result of a detail placement operation
 */
export interface PlacementInstance {
    /** Position in world space */
    position: THREE.Vector3;
    /** Rotation as Euler angles */
    rotation: THREE.Euler;
    /** Scale vector */
    scale: THREE.Vector3;
    /** Surface normal at position */
    normal?: THREE.Vector3;
    /** Distance from surface */
    surfaceDistance?: number;
    /** Cluster ID (if clustered) */
    clusterId?: number;
    /** Metadata */
    metadata?: Record<string, any>;
}
/**
 * Complete detail placement result
 */
export interface DetailPlacementResult {
    /** All placed instances */
    instances: PlacementInstance[];
    /** Success rate (placed / requested) */
    successRate: number;
    /** Placement statistics */
    statistics: {
        totalRequested: number;
        totalPlaced: number;
        collisionsAvoided: number;
        excludedByZones: number;
        excludedByTags: number;
        averageSpacing: number;
        boundingBox: THREE.Box3;
    };
}
/**
 * Detail Placement System Class
 *
 * Handles sophisticated placement of small objects and decorative details
 * in indoor scenes.
 */
export declare class DetailPlacementSystem {
    /** Default minimum spacing */
    private static readonly DEFAULT_MIN_SPACING;
    /** Default max distance from surface */
    private static readonly DEFAULT_MAX_SURFACE_DISTANCE;
    /** Raycaster for surface detection */
    private raycaster;
    /** Spatial hash grid for collision detection */
    private spatialGrid;
    /** Grid cell size */
    private gridSize;
    constructor();
    /**
     * Execute detail placement based on configuration
     */
    place(config: DetailConfig): DetailPlacementResult;
    /**
     * Generate candidate positions based on strategy
     */
    private generateCandidates;
    /**
     * Generate scatter candidates
     */
    private generateScatterCandidates;
    /**
     * Generate cluster candidates
     */
    private generateClusterCandidates;
    /**
     * Generate linear candidates
     */
    private generateLinearCandidates;
    /**
     * Generate grid candidates
     */
    private generateGridCandidates;
    /**
     * Generate edge candidates (along boundaries)
     */
    private generateEdgeCandidates;
    /**
     * Generate corner candidates
     */
    private generateCornerCandidates;
    /**
     * Generate surface-conforming candidates
     */
    private generateSurfaceCandidates;
    /**
     * Project point to surface using raycasting
     */
    private projectToSurface;
    /**
     * Check if point is in exclusion zone
     */
    private isInExclusionZone;
    /**
     * Check if point is in inclusion zone
     */
    private isInInclusionZone;
    /**
     * Check spacing against existing instances
     */
    private checkSpacing;
    /**
     * Create placement instance with transforms
     */
    private createInstance;
    /**
     * Raycast to surface and get hit info
     */
    private raycastSurface;
    /**
     * Add instance to spatial grid
     */
    private addToSpatialGrid;
    /**
     * Get grid cell key for position
     */
    private getGridCellKey;
    /**
     * Get nearby grid cells for collision checking
     */
    private getNearbyGridCells;
    /**
     * Visualize placements as points
     */
    visualize(result: DetailPlacementResult, color?: number): THREE.Points;
    /**
     * Export placements to JSON
     */
    toJSON(result: DetailPlacementResult): string;
}
export default DetailPlacementSystem;
//# sourceMappingURL=DetailPlacementSystem.d.ts.map