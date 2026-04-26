/**
 * RRTPathFinder
 *
 * Rapidly-exploring Random Tree (RRT) pathfinding algorithm for object placement
 * and navigation in 3D scenes. Provides collision-free path planning with
 * configurable constraints and optimization strategies.
 *
 * Features:
 * - Standard RRT and RRT* (optimal) algorithms
 * - 3D configuration space with obstacles
 * - Custom distance metrics and steering functions
 * - Path smoothing and optimization
 * - Dynamic obstacle avoidance
 * - Multi-query support with cached trees
 * - Configurable sampling strategies
 */
import { Vector3, Box3, Sphere, Object3D } from 'three';
export interface RRTNode {
    id: string;
    position: Vector3;
    parent: string | null;
    children: string[];
    cost: number;
    heuristic: number;
    totalCost: number;
    metadata?: Record<string, any>;
}
export interface RRTConfig {
    maxIterations: number;
    stepSize: number;
    goalThreshold: number;
    maxStepSize: number;
    minStepSize: number;
    useRRStar: boolean;
    rewireRadius: number;
    pathSmoothing: boolean;
    randomSeed?: number;
}
export interface Obstacle {
    type: 'box' | 'sphere' | 'mesh' | 'custom';
    box?: Box3;
    sphere?: Sphere;
    mesh?: Object3D;
    check?: (position: Vector3) => boolean;
}
export interface PathFindingResult {
    success: boolean;
    path: Vector3[];
    nodes: number;
    iterations: number;
    computationTime: number;
    message?: string;
}
export interface SamplingStrategy {
    name: 'uniform' | 'gaussian' | 'obstacle_aware' | 'goal_bias';
    goalBiasProbability: number;
    customSampler?: () => Vector3;
}
export declare class RRTPathFinder {
    private config;
    private nodes;
    private root;
    private goal;
    private obstacles;
    private bounds;
    private raycaster;
    private samplingStrategy;
    private seed;
    constructor(config?: Partial<RRTConfig>);
    /**
     * Set the configuration space bounds
     */
    setBounds(min: Vector3, max: Vector3): void;
    /**
     * Add an obstacle to the scene
     */
    addObstacle(obstacle: Obstacle): void;
    /**
     * Remove an obstacle
     */
    removeObstacle(index: number): void;
    /**
     * Clear all obstacles
     */
    clearObstacles(): void;
    /**
     * Add obstacles from scene objects
     */
    addObstaclesFromScene(objects: Object3D[]): void;
    /**
     * Set the sampling strategy
     */
    setSamplingStrategy(strategy: Partial<SamplingStrategy>): void;
    /**
     * Reset the tree
     */
    reset(): void;
    /**
     * Plan a path from start to goal
     */
    plan(start: Vector3, goal: Vector3): PathFindingResult;
    /**
     * Get the current tree nodes
     */
    getNodes(): Map<string, RRTNode>;
    /**
     * Get statistics about the tree
     */
    getStatistics(): {
        totalNodes: number;
        treeDepth: number;
        avgBranchingFactor: number;
        coverage: number;
    };
    /**
     * Export tree to JSON
     */
    exportToJSON(): string;
    /**
     * Import tree from JSON
     */
    importFromJSON(json: string): void;
    /**
     * Sample a configuration space point
     */
    private sampleConfigurationSpace;
}
export default RRTPathFinder;
//# sourceMappingURL=RRTPathFinder.d.ts.map