/**
 * Room Solver - Main constraint-based room layout solver
 *
 * Ports: core/indoor/room_solver/solver.py (algorithmic logic only)
 *
 * Uses simulated annealing to optimize room layouts based on:
 * - Adjacency constraints (rooms that should be neighbors)
 * - Size constraints (minimum/maximum areas)
 * - Shape constraints (aspect ratios, compactness)
 * - Topological constraints (connectivity, planarity)
 */
import { RoomGraph, NeighborType } from './base.js';
import { FloorPlanConfig } from './floor-plan.js';
import { Vector2 } from 'three';
export interface RoomConstraint {
    roomA: string;
    roomB: string;
    type: NeighborType;
    weight: number;
}
export interface SizeConstraint {
    room: string;
    minArea: number;
    maxArea: number;
    targetArea?: number;
    weight: number;
}
export interface ShapeConstraint {
    room: string;
    minAspectRatio: number;
    maxAspectRatio: number;
    targetCompactness?: number;
    weight: number;
}
export interface RoomSolverConfig {
    floorPlan: FloorPlanConfig;
    adjacencyWeight: number;
    sizeWeight: number;
    shapeWeight: number;
    topologyWeight: number;
    temperature: number;
    coolingRate: number;
    maxIterations: number;
    minTemperature: number;
}
export interface RoomLayout {
    rooms: Map<string, Vector2[]>;
    graph: RoomGraph;
    energy: number;
}
export declare class RoomSolver {
    private config;
    private floorPlanGen;
    private contourOps;
    constructor(config?: Partial<RoomSolverConfig>);
    /**
     * Solve room layout from adjacency graph and constraints
     */
    solve(initialGraph: RoomGraph, adjacencyConstraints: RoomConstraint[], sizeConstraints: SizeConstraint[], shapeConstraints: ShapeConstraint[]): RoomLayout;
    /**
     * Initialize layout from room graph
     */
    private initializeLayout;
    /**
     * Position rooms using force-directed algorithm
     */
    private positionRooms;
    /**
     * Generate neighbor state by modifying graph or layout
     */
    private generateNeighbor;
    /**
     * Update layout based on modified graph
     */
    private updateLayout;
    /**
     * Compute total energy from all constraints
     */
    private computeEnergy;
    /**
     * Energy from adjacency constraints
     */
    private computeAdjacencyEnergy;
    /**
     * Energy from size constraints
     */
    private computeSizeEnergy;
    /**
     * Energy from shape constraints
     */
    private computeShapeEnergy;
    /**
     * Energy from topological constraints
     */
    private computeTopologyEnergy;
    /**
     * Utility: Compute centroid of contour
     */
    private computeCentroid;
    /**
     * Utility: Compute area of polygon
     */
    private computeArea;
    /**
     * Utility: Compute bounding box
     */
    private computeBoundingBox;
    /**
     * Utility: Compute compactness (4π * area / perimeter²)
     */
    private computeCompactness;
}
//# sourceMappingURL=solver.d.ts.map