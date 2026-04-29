/**
 * Advanced Placement System for InfiniGen R3F
 *
 * Provides sophisticated object placement algorithms including:
 * - Poisson Disk Sampling for blue-noise distribution
 * - Relaxation algorithms for even spacing
 * - Surface projection with alignment
 * - Collision avoidance and semantic filtering
 * - Constraint-based placement validation
 */
import { Vector3, Mesh, Matrix4 } from 'three';
import { BBox } from '../util/math/bbox';
import { TagQuery } from '../tags';
export interface PlacementConfig {
    /** Minimum distance between placed objects (for Poisson disk) */
    minDistance: number;
    /** Maximum attempts to place an object before giving up */
    maxAttempts: number;
    /** Grid cell size for spatial acceleration */
    gridSize: number;
    /** Whether to align objects to surface normals */
    alignToSurface: boolean;
    /** Whether to avoid collisions with existing objects */
    avoidCollisions: boolean;
    /** Margin for collision avoidance */
    collisionMargin: number;
    /** Semantic tags that must be present on target surfaces */
    requiredSurfaceTags?: TagQuery;
    /** Semantic tags that must NOT be present on target surfaces */
    forbiddenSurfaceTags?: TagQuery;
    /** Height range for valid placement */
    heightRange?: [number, number];
    /** Slope tolerance in radians (0 = flat only, PI/2 = any slope) */
    maxSlope: number;
}
export interface PlacementCandidate {
    position: Vector3;
    normal: Vector3;
    surfaceTag: string | null;
    score: number;
}
export interface PlacementResult {
    success: boolean;
    position: Vector3 | null;
    rotation: Vector3 | null;
    reason?: string;
}
/**
 * Implements Bridson's algorithm for Poisson disk sampling
 * Generates points with minimum separation distance
 */
export declare class PoissonDiskSampler {
    private width;
    private height;
    private depth;
    private radius;
    private cellSize;
    private grid;
    private samples;
    private activeList;
    constructor(width: number, height: number, depth: number, radius: number);
    /**
     * Generate Poisson disk distributed points
     * @param numPoints Target number of points (may generate more/fewer)
     * @returns Array of sampled positions
     */
    sample(numPoints: number): Vector3[];
    private addSample;
    private isValid;
    private gridKey;
}
/**
 * Applies Lloyd's relaxation to evenly distribute points
 * Uses Voronoi-like iteration to move points toward centroid of their region
 */
export declare class RelaxationSolver {
    private points;
    private bounds;
    private k;
    constructor(points: Vector3[], bounds: BBox, iterations?: number);
    /**
     * Run relaxation iterations
     * @returns Relaxed point positions
     */
    relax(): Vector3[];
    private relaxationStep;
    private getNeighbors;
    private gridKey;
}
export interface SurfaceHit {
    position: Vector3;
    normal: Vector3;
    distance: number;
    object: Mesh | null;
    tag: string | null;
}
/**
 * Projects points onto surfaces and aligns them properly
 */
export declare class SurfaceProjector {
    private raycaster;
    private meshes;
    constructor(meshes?: Mesh[]);
    addMesh(mesh: Mesh): void;
    clearMeshes(): void;
    /**
     * Project a point downward onto the nearest surface
     * @param point Starting point
     * @param maxDistance Maximum ray distance
     * @returns Hit information or null if no surface found
     */
    projectDown(point: Vector3, maxDistance?: number): SurfaceHit | null;
    /**
     * Project a point in a custom direction
     */
    project(point: Vector3, direction: Vector3, maxDistance?: number): SurfaceHit | null;
    /**
     * Calculate rotation matrix to align object to surface normal
     * @param upVector Object's local up vector (default: Y-up)
     * @param targetNormal Surface normal to align to
     * @returns Rotation matrix
     */
    calculateAlignment(upVector: Vector3 | undefined, targetNormal: Vector3): Matrix4;
    private getObjectTag;
}
export interface CollisionShape {
    type: 'sphere' | 'box' | 'capsule';
    position: Vector3;
    size: Vector3 | number;
}
/**
 * Detects and resolves collisions during placement
 */
export declare class CollisionAvoidance {
    private shapes;
    private margin;
    constructor(margin?: number);
    addShape(shape: CollisionShape): void;
    clearShapes(): void;
    /**
     * Check if a position collides with any existing shape
     * @param position Position to check
     * @param radius Radius of object at position
     * @returns True if collision detected
     */
    hasCollision(position: Vector3, radius: number): boolean;
    /**
     * Find a non-colliding position near the target
     * @param target Desired position
     * @param radius Object radius
     * @param maxSearchRadius Maximum distance to search
     * @param maxAttempts Maximum placement attempts
     * @returns Non-colliding position or null
     */
    findValidPosition(target: Vector3, radius: number, maxSearchRadius?: number, maxAttempts?: number): Vector3 | null;
    /**
     * Add bounding box from mesh as collision shape
     */
    addMesh(mesh: Mesh): void;
}
/**
 * Filters placement candidates based on semantic constraints
 */
export declare class SemanticFilter {
    private requiredTags;
    private forbiddenTags;
    constructor();
    addRequiredTag(tag: string): void;
    addForbiddenTag(tag: string): void;
    clear(): void;
    /**
     * Test if a surface meets semantic requirements
     * @param surfaceTags Tags present on the surface
     * @returns True if surface passes all filters
     */
    test(surfaceTags: string[]): boolean;
}
export interface AdvancedPlacementOptions {
    config: PlacementConfig;
    bounds: BBox;
    targetCount: number;
    meshes?: Mesh[];
    existingPositions?: Vector3[];
}
export declare class AdvancedPlacer {
    private config;
    private bounds;
    private projector;
    private collider;
    private filter;
    constructor(options: AdvancedPlacementOptions);
    /**
     * Generate advanced placements using multiple strategies
     * @returns Array of valid placement positions
     */
    generatePlacements(): Promise<Vector3[]>;
    private projectToSurface;
    /**
     * Calculate optimal placement for a single object
     */
    placeSingle(preferredPosition: Vector3, objectRadius: number): Promise<PlacementResult>;
    private getRandomOffset;
    private calculateRotation;
}
/**
 * Create default placement configuration
 */
export declare function createDefaultConfig(): PlacementConfig;
/**
 * Batch placement helper
 */
export declare function batchPlace(count: number, bounds: BBox, options?: Partial<PlacementConfig>): Promise<Vector3[]>;
//# sourceMappingURL=AdvancedPlacer.d.ts.map