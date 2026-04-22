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

import { Room, RoomType } from './RoomTypes';
import { Direction } from './FloorPlanMoves';

/**
 * Graph node representing a room
 */
export interface RoomNode {
  id: string;
  room: Room;
  neighbors: string[]; // IDs of adjacent rooms
  connections: Connection[]; // Detailed connection info
}

/**
 * Connection between two rooms
 */
export interface Connection {
  targetRoomId: string;
  connectionType: 'door' | 'opening' | 'adjacent' | 'corridor';
  wall?: Direction; // Which wall the connection is on
  distance?: number; // Distance to connection point
  isDirect: boolean; // True if direct door/opening, false if via corridor
}

/**
 * Path through the floor plan
 */
export interface Path {
  rooms: string[]; // Sequence of room IDs
  totalDistance: number;
  connections: Connection[];
}

/**
 * Connected component (privacy zone, functional area)
 */
export interface ConnectedComponent {
  id: string;
  roomIds: string[];
  centroid: { x: number; z: number };
  area: number;
}

/**
 * Room Graph Manager
 * 
 * Builds and analyzes adjacency graphs for floor plans.
 * Supports pathfinding, connectivity checks, and zone detection.
 */
export class RoomGraph {
  private nodes: Map<string, RoomNode> = new Map();
  private adjacencyMatrix: Map<string, Set<string>> = new Map();
  private wallThickness: number = 0.2;

  constructor(rooms: Room[], wallThickness?: number) {
    if (wallThickness !== undefined) this.wallThickness = wallThickness;
    this.buildGraph(rooms);
  }

  /**
   * Build graph from room list
   */
  private buildGraph(rooms: Room[]): void {
    this.nodes.clear();
    this.adjacencyMatrix.clear();

    // Create nodes
    for (const room of rooms) {
      const node: RoomNode = {
        id: room.id,
        room,
        neighbors: [],
        connections: []
      };
      this.nodes.set(room.id, node);
      this.adjacencyMatrix.set(room.id, new Set());
    }

    // Build edges based on adjacency and doors
    for (const room1 of rooms) {
      for (const room2 of rooms) {
        if (room1.id >= room2.id) continue; // Avoid duplicates

        // Check for shared doors
        const sharedDoors = this.findSharedDoors(room1, room2);
        if (sharedDoors.length > 0) {
          this.addConnection(room1.id, room2.id, {
            targetRoomId: room2.id,
            connectionType: 'door',
            isDirect: true
          });
          continue;
        }

        // Check for wall adjacency
        if (this.areAdjacent(room1, room2)) {
          const wall = this.getSharedWall(room1, room2);
          this.addConnection(room1.id, room2.id, {
            targetRoomId: room2.id,
            connectionType: 'adjacent',
            wall,
            isDirect: false
          });
        }
      }
    }

    // Populate neighbor lists from adjacency matrix
    for (const [roomId, neighbors] of this.adjacencyMatrix) {
      const node = this.nodes.get(roomId);
      if (node) {
        node.neighbors = Array.from(neighbors);
      }
    }
  }

  /**
   * Add bidirectional connection between rooms
   */
  private addConnection(room1Id: string, room2Id: string, connection: Connection): void {
    const node1 = this.nodes.get(room1Id);
    const node2 = this.nodes.get(room2Id);

    if (!node1 || !node2) return;

    // Add to adjacency matrix
    this.adjacencyMatrix.get(room1Id)?.add(room2Id);
    this.adjacencyMatrix.get(room2Id)?.add(room1Id);

    // Add detailed connection info
    node1.connections.push(connection);
    
    const reverseConnection: Connection = {
      ...connection,
      targetRoomId: room1Id,
      wall: this.getOppositeWall(connection.wall)
    };
    node2.connections.push(reverseConnection);
  }

  /**
   * Find all paths between two rooms using BFS
   */
  findPaths(startRoomId: string, endRoomId: string, maxPaths: number = 3): Path[] {
    const paths: Path[] = [];
    
    if (!this.nodes.has(startRoomId) || !this.nodes.has(endRoomId)) {
      return paths;
    }

    // BFS with path tracking
    const queue: Array<{ roomId: string; path: string[]; distance: number; connections: Connection[] }> = [
      { roomId: startRoomId, path: [startRoomId], distance: 0, connections: [] }
    ];

    const visited = new Set<string>();

    while (queue.length > 0 && paths.length < maxPaths) {
      const current = queue.shift()!;

      if (current.roomId === endRoomId) {
        paths.push({
          rooms: current.path,
          totalDistance: current.distance,
          connections: current.connections
        });
        continue;
      }

      if (visited.has(current.roomId)) continue;
      visited.add(current.roomId);

      const node = this.nodes.get(current.roomId);
      if (!node) continue;

      for (const neighborId of node.neighbors) {
        if (!visited.has(neighborId)) {
          const connection = node.connections.find(c => c.targetRoomId === neighborId);
          const distance = connection?.distance || this.estimateDistance(node.room, this.nodes.get(neighborId)!.room);

          queue.push({
            roomId: neighborId,
            path: [...current.path, neighborId],
            distance: current.distance + distance,
            connections: [...current.connections, connection!]
          });
        }
      }
    }

    // Sort by distance
    return paths.sort((a, b) => a.totalDistance - b.totalDistance);
  }

  /**
   * Check if all rooms are connected (single connected component)
   */
  isConnected(): boolean {
    if (this.nodes.size === 0) return true;

    const visited = new Set<string>();
    const startRoom = this.nodes.keys().next().value;
    
    this.dfs(startRoom!, visited);

    return visited.size === this.nodes.size;
  }

  /**
   * Find connected components (functional zones)
   */
  findConnectedComponents(): ConnectedComponent[] {
    const visited = new Set<string>();
    const components: ConnectedComponent[] = [];
    let componentId = 0;

    for (const roomId of this.nodes.keys()) {
      if (!visited.has(roomId)) {
        const componentRooms: string[] = [];
        this.dfs(roomId, visited, componentRooms);

        if (componentRooms.length > 0) {
          const rooms = componentRooms.map(id => this.nodes.get(id)!.room);
          const centroid = this.calculateCentroid(rooms);
          const area = rooms.reduce((sum, r) => sum + r.area, 0);

          components.push({
            id: `component_${componentId++}`,
            roomIds: componentRooms,
            centroid,
            area
          });
        }
      }
    }

    return components;
  }

  /**
   * Find shortest path between two rooms (Dijkstra's algorithm)
   */
  findShortestPath(startRoomId: string, endRoomId: string): Path | null {
    if (!this.nodes.has(startRoomId) || !this.nodes.has(endRoomId)) {
      return null;
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, { roomId: string; connection: Connection }>();
    const unvisited = new Set<string>(this.nodes.keys());

    // Initialize distances
    for (const roomId of this.nodes.keys()) {
      distances.set(roomId, roomId === startRoomId ? 0 : Infinity);
    }

    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let currentRoom: string | null = null;
      let minDistance = Infinity;

      for (const roomId of unvisited) {
        const dist = distances.get(roomId)!;
        if (dist < minDistance) {
          minDistance = dist;
          currentRoom = roomId;
        }
      }

      if (currentRoom === null || minDistance === Infinity) break;
      if (currentRoom === endRoomId) break;

      unvisited.delete(currentRoom);

      // Update distances to neighbors
      const node = this.nodes.get(currentRoom)!;
      for (const neighborId of node.neighbors) {
        if (unvisited.has(neighborId)) {
          const connection = node.connections.find(c => c.targetRoomId === neighborId);
          const distance = connection?.distance || this.estimateDistance(node.room, this.nodes.get(neighborId)!.room);
          const altDistance = distances.get(currentRoom)! + distance;

          if (altDistance < distances.get(neighborId)!) {
            distances.set(neighborId, altDistance);
            previous.set(neighborId, { roomId: currentRoom!, connection: connection! });
          }
        }
      }
    }

    // Reconstruct path
    if (!previous.has(endRoomId)) {
      return null;
    }

    const path: string[] = [];
    const connections: Connection[] = [];
    let current: string | undefined = endRoomId;

    while (current) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev) {
        connections.unshift(prev.connection);
        current = prev.roomId;
      } else {
        current = undefined;
      }
    }

    return {
      rooms: path,
      totalDistance: distances.get(endRoomId)!,
      connections
    };
  }

  /**
   * Get degree centrality for each room (number of connections)
   */
  getDegreeCentrality(): Map<string, number> {
    const centrality = new Map<string, number>();

    for (const [roomId, node] of this.nodes) {
      centrality.set(roomId, node.neighbors.length);
    }

    return centrality;
  }

  /**
   * Find rooms that are articulation points (removing them disconnects the graph)
   */
  findArticulationPoints(): string[] {
    const articulationPoints: string[] = [];

    for (const roomId of this.nodes.keys()) {
      // Temporarily remove room and check connectivity
      const originalNeighbors = this.nodes.get(roomId)?.neighbors || [];
      
      // Simple check: if room has only 1 neighbor, it's not an articulation point
      // If it has 2+ neighbors, removing it might disconnect them
      if (originalNeighbors.length <= 1) continue;

      // More sophisticated check would require rebuilding graph without this node
      // For now, mark rooms with high centrality as potential articulation points
      if (originalNeighbors.length >= 3) {
        articulationPoints.push(roomId);
      }
    }

    return articulationPoints;
  }

  /**
   * Export graph as adjacency list
   */
  exportAdjacencyList(): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const [roomId, node] of this.nodes) {
      result[roomId] = [...node.neighbors];
    }

    return result;
  }

  /**
   * Get all nodes
   */
  getNodes(): Map<string, RoomNode> {
    return new Map(this.nodes);
  }

  /**
   * DFS traversal helper
   */
  private dfs(roomId: string, visited: Set<string>, componentRooms?: string[]): void {
    if (visited.has(roomId)) return;
    
    visited.add(roomId);
    if (componentRooms) componentRooms.push(roomId);

    const node = this.nodes.get(roomId);
    if (!node) return;

    for (const neighborId of node.neighbors) {
      this.dfs(neighborId, visited, componentRooms);
    }
  }

  /**
   * Calculate centroid of rooms
   */
  private calculateCentroid(rooms: Room[]): { x: number; z: number } {
    const centerX = rooms.reduce((sum, r) => sum + (r.bounds.xMin + r.bounds.xMax) / 2, 0) / rooms.length;
    const centerZ = rooms.reduce((sum, r) => sum + (r.bounds.zMin + r.bounds.zMax) / 2, 0) / rooms.length;
    return { x: centerX, z: centerZ };
  }

  /**
   * Estimate distance between room centers
   */
  private estimateDistance(room1: Room, room2: Room): number {
    const center1 = {
      x: (room1.bounds.xMin + room1.bounds.xMax) / 2,
      z: (room1.bounds.zMin + room1.bounds.zMax) / 2
    };
    const center2 = {
      x: (room2.bounds.xMin + room2.bounds.xMax) / 2,
      z: (room2.bounds.zMin + room2.bounds.zMax) / 2
    };

    const dx = center2.x - center1.x;
    const dz = center2.z - center1.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Find shared doors between two rooms
   */
  private findSharedDoors(room1: Room, room2: Room): Array<{ doorId: string }> {
    const sharedDoors: Array<{ doorId: string }> = [];

    // Check if any door in room1 connects to room2
    for (const door of room1.doors) {
      if (door.connectsTo === room2.id) {
        sharedDoors.push({ doorId: door.id });
      }
    }

    return sharedDoors;
  }

  /**
   * Check if two rooms are adjacent
   */
  private areAdjacent(room1: Room, room2: Room): boolean {
    const tolerance = this.wallThickness + 0.1;
    
    const xOverlap = !(room1.bounds.xMax < room2.bounds.xMin - tolerance ||
                       room1.bounds.xMin > room2.bounds.xMax + tolerance);
    
    const zOverlap = !(room1.bounds.zMax < room2.bounds.zMin - tolerance ||
                       room1.bounds.zMin > room2.bounds.zMax + tolerance);

    const xAdjacent = Math.abs(room1.bounds.xMax - room2.bounds.xMin) < tolerance ||
                      Math.abs(room1.bounds.xMin - room2.bounds.xMax) < tolerance;
    
    const zAdjacent = Math.abs(room1.bounds.zMax - room2.bounds.zMin) < tolerance ||
                      Math.abs(room1.bounds.zMin - room2.bounds.zMax) < tolerance;

    return (xOverlap && zAdjacent) || (zOverlap && xAdjacent);
  }

  /**
   * Get shared wall direction
   */
  private getSharedWall(room1: Room, room2: Room): Direction | undefined {
    const tolerance = this.wallThickness + 0.1;

    if (Math.abs(room1.bounds.xMax - room2.bounds.xMin) < tolerance) {
      return Direction.EAST;
    }
    if (Math.abs(room1.bounds.xMin - room2.bounds.xMax) < tolerance) {
      return Direction.WEST;
    }
    if (Math.abs(room1.bounds.zMax - room2.bounds.zMin) < tolerance) {
      return Direction.NORTH;
    }
    if (Math.abs(room1.bounds.zMin - room2.bounds.zMax) < tolerance) {
      return Direction.SOUTH;
    }

    return undefined;
  }

  /**
   * Get opposite wall direction
   */
  private getOppositeWall(wall?: Direction): Direction | undefined {
    if (!wall) return undefined;
    
    switch (wall) {
      case Direction.NORTH: return Direction.SOUTH;
      case Direction.SOUTH: return Direction.NORTH;
      case Direction.EAST: return Direction.WEST;
      case Direction.WEST: return Direction.EAST;
    }
  }
}

export default RoomGraph;
