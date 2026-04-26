/**
 * Room Graph - Adjacency graph for room connectivity analysis
 *
 * Represents floor plan as a graph where:
 * - Nodes: Rooms
 * - Edges: Adjacency relationships (shared walls, doors, corridors)
 *
 * Used for:
 * - Connectivity validation (all rooms reachable)
 * - Circulation path optimization
 * - Emergency egress analysis
 * - Privacy zone clustering
 *
 * @packageDocumentation
 */
import { Room } from './RoomTypes';
import { Direction } from './FloorPlanMoves';
/**
 * Graph node representing a room
 */
export interface RoomNode {
    id: string;
    room: Room;
    neighbors: string[];
    connections: Connection[];
}
/**
 * Connection between two rooms
 */
export interface Connection {
    targetRoomId: string;
    connectionType: 'door' | 'opening' | 'adjacent' | 'corridor';
    wall?: Direction;
    distance?: number;
    isDirect: boolean;
}
/**
 * Path through the floor plan
 */
export interface Path {
    rooms: string[];
    totalDistance: number;
    connections: Connection[];
}
/**
 * Connected component (privacy zone, functional area)
 */
export interface ConnectedComponent {
    id: string;
    roomIds: string[];
    centroid: {
        x: number;
        z: number;
    };
    area: number;
}
/**
 * Room Graph Manager
 *
 * Builds and analyzes adjacency graphs for floor plans.
 * Supports pathfinding, connectivity checks, and zone detection.
 */
export declare class RoomGraph {
    private nodes;
    private adjacencyMatrix;
    private wallThickness;
    constructor(rooms: Room[], wallThickness?: number);
    /**
     * Build graph from room list
     */
    private buildGraph;
    /**
     * Add bidirectional connection between rooms
     */
    private addConnection;
    /**
     * Find all paths between two rooms using BFS
     */
    findPaths(startRoomId: string, endRoomId: string, maxPaths?: number): Path[];
    /**
     * Check if all rooms are connected (single connected component)
     */
    isConnected(): boolean;
    /**
     * Find connected components (functional zones)
     */
    findConnectedComponents(): ConnectedComponent[];
    /**
     * Find shortest path between two rooms (Dijkstra's algorithm)
     */
    findShortestPath(startRoomId: string, endRoomId: string): Path | null;
    /**
     * Get degree centrality for each room (number of connections)
     */
    getDegreeCentrality(): Map<string, number>;
    /**
     * Find rooms that are articulation points (removing them disconnects the graph)
     */
    findArticulationPoints(): string[];
    /**
     * Export graph as adjacency list
     */
    exportAdjacencyList(): Record<string, string[]>;
    /**
     * Get all nodes
     */
    getNodes(): Map<string, RoomNode>;
    /**
     * DFS traversal helper
     */
    private dfs;
    /**
     * Calculate centroid of rooms
     */
    private calculateCentroid;
    /**
     * Estimate distance between room centers
     */
    private estimateDistance;
    /**
     * Find shared doors between two rooms
     */
    private findSharedDoors;
    /**
     * Check if two rooms are adjacent
     */
    private areAdjacent;
    /**
     * Get shared wall direction
     */
    private getSharedWall;
    /**
     * Get opposite wall direction
     */
    private getOppositeWall;
}
export default RoomGraph;
//# sourceMappingURL=RoomGraph.d.ts.map