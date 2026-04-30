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

import { RoomGraph, RoomNode, NeighborType } from './base';
import { FloorPlanGenerator, FloorPlanConfig } from './floor-plan';
import { ContourOperations } from './contour';
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
  rooms: Map<string, Vector2[]>; // room id -> contour points
  graph: RoomGraph;
  energy: number;
}

export class RoomSolver {
  private config: RoomSolverConfig;
  private floorPlanGen: FloorPlanGenerator;
  private contourOps: ContourOperations;

  constructor(config: Partial<RoomSolverConfig> = {}) {
    this.config = {
      floorPlan: {
        gridSize: config.floorPlan?.gridSize ?? 0.5,
        minRoomArea: config.floorPlan?.minRoomArea ?? 4.0,
        maxRooms: config.floorPlan?.maxRooms ?? 20,
        complexity: config.floorPlan?.complexity ?? 'medium',
      },
      adjacencyWeight: config.adjacencyWeight ?? 1.0,
      sizeWeight: config.sizeWeight ?? 1.0,
      shapeWeight: config.shapeWeight ?? 0.5,
      topologyWeight: config.topologyWeight ?? 0.8,
      temperature: config.temperature ?? 100.0,
      coolingRate: config.coolingRate ?? 0.95,
      maxIterations: config.maxIterations ?? 10000,
      minTemperature: config.minTemperature ?? 0.1,
    };

    this.floorPlanGen = new FloorPlanGenerator(this.config.floorPlan);
    this.contourOps = new ContourOperations();
  }

  /**
   * Solve room layout from adjacency graph and constraints
   */
  solve(
    initialGraph: RoomGraph,
    adjacencyConstraints: RoomConstraint[],
    sizeConstraints: SizeConstraint[],
    shapeConstraints: ShapeConstraint[]
  ): RoomLayout {
    let currentGraph = initialGraph.clone();
    let currentLayout = this.initializeLayout(currentGraph);
    let currentEnergy = this.computeEnergy(
      currentLayout,
      adjacencyConstraints,
      sizeConstraints,
      shapeConstraints
    );

    let bestLayout = { ...currentLayout, energy: currentEnergy };
    let bestEnergy = currentEnergy;

    let temperature = this.config.temperature;

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      // Generate neighbor state
      const neighborGraph = this.generateNeighbor(currentGraph);
      const neighborLayout = this.updateLayout(currentLayout, neighborGraph);
      
      const neighborEnergy = this.computeEnergy(
        neighborLayout,
        adjacencyConstraints,
        sizeConstraints,
        shapeConstraints
      );

      // Accept or reject based on simulated annealing
      const deltaE = neighborEnergy - currentEnergy;
      const acceptanceProb = deltaE < 0 ? 1.0 : Math.exp(-deltaE / temperature);

      if (Math.random() < acceptanceProb) {
        currentGraph = neighborGraph;
        currentLayout = neighborLayout;
        currentEnergy = neighborEnergy;

        // Update best solution
        if (currentEnergy < bestEnergy) {
          bestLayout = { ...currentLayout, energy: currentEnergy };
          bestEnergy = currentEnergy;
        }
      }

      // Cool down
      temperature *= this.config.coolingRate;
      
      if (temperature < this.config.minTemperature) {
        break;
      }
    }

    return bestLayout;
  }

  /**
   * Initialize layout from room graph
   */
  private initializeLayout(graph: RoomGraph): Omit<RoomLayout, 'energy'> {
    const rooms = new Map<string, Vector2[]>();
    
    // Generate initial contours based on room connectivity
    const adjacencyList = graph.getAdjacencyList();
    
    for (const [roomId, node] of graph.rooms) {
      // Start with simple rectangular contour
      const area = node.metadata?.targetArea ?? 12.0;
      const aspectRatio = 1.0 + Math.random() * 0.5;
      
      const width = Math.sqrt(area * aspectRatio);
      const height = area / width;
      
      // Create rectangle centered at origin (will be positioned later)
      const contour: Vector2[] = [
        new Vector2(-width/2, -height/2),
        new Vector2(width/2, -height/2),
        new Vector2(width/2, height/2),
        new Vector2(-width/2, height/2),
      ];
      
      rooms.set(roomId, contour);
    }

    // Position rooms using force-directed layout
    this.positionRooms(rooms, new Map(Array.from(adjacencyList.entries()).map(([k, v]) => [k, Array.from(v)])));

    return { rooms, graph };
  }

  /**
   * Position rooms using force-directed algorithm
   */
  private positionRooms(
    rooms: Map<string, Vector2[]>,
    adjacencyList: Map<string, string[]>
  ): void {
    const iterations = 50;
    const learningRate = 0.1;

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, Vector2>();

      // Compute repulsive forces between all rooms
      for (const [roomIdA, contourA] of rooms) {
        const centerA = this.computeCentroid(contourA);
        
        for (const [roomIdB, contourB] of rooms) {
          if (roomIdA === roomIdB) continue;
          
          const centerB = this.computeCentroid(contourB);
          const direction = new Vector2().subVectors(centerA, centerB);
          const distance = direction.length();
          
          if (distance < 0.1) continue;
          
          direction.normalize();
          const force = direction.multiplyScalar(1.0 / (distance * distance));
          
          if (!forces.has(roomIdA)) {
            forces.set(roomIdA, new Vector2());
          }
          forces.get(roomIdA)!.add(force);
        }
      }

      // Compute attractive forces for adjacent rooms
      for (const [roomIdA, neighbors] of adjacencyList) {
        const centerA = this.computeCentroid(rooms.get(roomIdA)!);
        
        for (const roomIdB of neighbors) {
          const centerB = this.computeCentroid(rooms.get(roomIdB)!);
          const direction = new Vector2().subVectors(centerB, centerA);
          const distance = direction.length();
          
          if (distance < 0.1) continue;
          
          direction.normalize();
          const force = direction.multiplyScalar(distance * 0.01);
          
          forces.get(roomIdA)!.add(force);
        }
      }

      // Apply forces
      for (const [roomId, force] of forces) {
        const contour = rooms.get(roomId)!;
        force.multiplyScalar(learningRate);
        
        for (const point of contour) {
          point.add(force);
        }
      }
    }
  }

  /**
   * Generate neighbor state by modifying graph or layout
   */
  private generateNeighbor(graph: RoomGraph): RoomGraph {
    const neighbor = graph.clone();
    const moveType = Math.random();

    if (moveType < 0.3) {
      // Swap two room positions
      const roomIds = neighbor.rooms.map(r => r.id);
      if (roomIds.length >= 2) {
        const i = Math.floor(Math.random() * roomIds.length);
        const j = Math.floor(Math.random() * roomIds.length);
        if (i !== j) {
          // Swap metadata that affects positioning
          const temp = neighbor.rooms.get(roomIds[i])!.metadata;
          neighbor.rooms.get(roomIds[i])!.metadata = neighbor.rooms.get(roomIds[j])!.metadata;
          neighbor.rooms.get(roomIds[j])!.metadata = temp;
        }
      }
    } else if (moveType < 0.6) {
      // Add/remove adjacency edge
      const roomIds = neighbor.rooms.map(r => r.id);
      if (roomIds.length >= 2) {
        const i = Math.floor(Math.random() * roomIds.length);
        const j = Math.floor(Math.random() * roomIds.length);
        if (i !== j) {
          const hasEdge = neighbor.areNeighbors(roomIds[i], roomIds[j]);
          if (hasEdge) {
            neighbor.removeEdge(roomIds[i], roomIds[j]);
          } else {
            neighbor.addEdge(roomIds[i], roomIds[j], NeighborType.ADJACENT);
          }
        }
      }
    } else {
      // Modify room properties
      const roomIds = neighbor.rooms.map(r => r.id);
      const roomId = roomIds[Math.floor(Math.random() * roomIds.length)];
      const node = neighbor.rooms.get(roomId)!;
      
      if (node.metadata) {
        node.metadata.targetArea = (node.metadata.targetArea ?? 12.0) * (0.9 + Math.random() * 0.2);
      }
    }

    return neighbor;
  }

  /**
   * Update layout based on modified graph
   */
  private updateLayout(
    layout: Omit<RoomLayout, 'energy'>,
    graph: RoomGraph
  ): Omit<RoomLayout, 'energy'> {
    // Clone existing contours
    const rooms = new Map(layout.rooms);
    
    // Re-position based on new adjacency
    const adjacencyList = graph.getAdjacencyList();
    this.positionRooms(rooms, new Map(Array.from(adjacencyList.entries()).map(([k, v]) => [k, Array.from(v)])));

    return { rooms, graph };
  }

  /**
   * Compute total energy from all constraints
   */
  private computeEnergy(
    layout: Omit<RoomLayout, 'energy'>,
    adjacencyConstraints: RoomConstraint[],
    sizeConstraints: SizeConstraint[],
    shapeConstraints: ShapeConstraint[]
  ): number {
    let energy = 0.0;

    // Adjacency energy
    energy += this.computeAdjacencyEnergy(layout, adjacencyConstraints);

    // Size energy
    energy += this.computeSizeEnergy(layout, sizeConstraints);

    // Shape energy
    energy += this.computeShapeEnergy(layout, shapeConstraints);

    // Topology energy
    energy += this.computeTopologyEnergy(layout);

    return energy;
  }

  /**
   * Energy from adjacency constraints
   */
  private computeAdjacencyEnergy(
    layout: Omit<RoomLayout, 'energy'>,
    constraints: RoomConstraint[]
  ): number {
    let energy = 0.0;

    for (const constraint of constraints) {
      const areAdjacent = layout.graph.areNeighbors(constraint.roomA, constraint.roomB);
      const shouldAdjacent = constraint.type === NeighborType.ADJACENT;

      if (areAdjacent !== shouldAdjacent) {
        energy += constraint.weight;
      }
    }

    return energy * this.config.adjacencyWeight;
  }

  /**
   * Energy from size constraints
   */
  private computeSizeEnergy(
    layout: Omit<RoomLayout, 'energy'>,
    constraints: SizeConstraint[]
  ): number {
    let energy = 0.0;

    for (const constraint of constraints) {
      const contour = layout.rooms.get(constraint.room);
      if (!contour) continue;

      const area = this.computeArea(contour);
      
      if (area < constraint.minArea) {
        energy += constraint.weight * (constraint.minArea - area);
      } else if (area > constraint.maxArea) {
        energy += constraint.weight * (area - constraint.maxArea);
      } else if (constraint.targetArea !== undefined) {
        energy += constraint.weight * Math.abs(area - constraint.targetArea) * 0.1;
      }
    }

    return energy * this.config.sizeWeight;
  }

  /**
   * Energy from shape constraints
   */
  private computeShapeEnergy(
    layout: Omit<RoomLayout, 'energy'>,
    constraints: ShapeConstraint[]
  ): number {
    let energy = 0.0;

    for (const constraint of constraints) {
      const contour = layout.rooms.get(constraint.room);
      if (!contour) continue;

      const bbox = this.computeBoundingBox(contour);
      const aspectRatio = bbox.width / bbox.height;
      
      if (aspectRatio < constraint.minAspectRatio || aspectRatio > constraint.maxAspectRatio) {
        energy += constraint.weight;
      }

      if (constraint.targetCompactness !== undefined) {
        const compactness = this.computeCompactness(contour);
        energy += constraint.weight * Math.abs(compactness - constraint.targetCompactness);
      }
    }

    return energy * this.config.shapeWeight;
  }

  /**
   * Energy from topological constraints
   */
  private computeTopologyEnergy(layout: Omit<RoomLayout, 'energy'>): number {
    let energy = 0.0;

    // Check planarity
    if (!layout.graph.isPlanar()) {
      energy += 10.0;
    }

    // Check connectivity
    if (!layout.graph.isConnected()) {
      energy += 5.0;
    }

    return energy * this.config.topologyWeight;
  }

  /**
   * Utility: Compute centroid of contour
   */
  private computeCentroid(contour: Vector2[]): Vector2 {
    const sum = new Vector2();
    for (const point of contour) {
      sum.add(point);
    }
    return sum.divideScalar(contour.length);
  }

  /**
   * Utility: Compute area of polygon
   */
  private computeArea(contour: Vector2[]): number {
    let area = 0.0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      area += contour[i].x * contour[j].y;
      area -= contour[j].x * contour[i].y;
    }
    return Math.abs(area) / 2.0;
  }

  /**
   * Utility: Compute bounding box
   */
  private computeBoundingBox(contour: Vector2[]): { min: Vector2; max: Vector2; width: number; height: number } {
    const min = new Vector2(Infinity, Infinity);
    const max = new Vector2(-Infinity, -Infinity);

    for (const point of contour) {
      min.x = Math.min(min.x, point.x);
      min.y = Math.min(min.y, point.y);
      max.x = Math.max(max.x, point.x);
      max.y = Math.max(max.y, point.y);
    }

    return {
      min,
      max,
      width: max.x - min.x,
      height: max.y - min.y,
    };
  }

  /**
   * Utility: Compute compactness (4π * area / perimeter²)
   */
  private computeCompactness(contour: Vector2[]): number {
    const area = this.computeArea(contour);
    let perimeter = 0.0;

    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      perimeter += contour[i].distanceTo(contour[j]);
    }

    if (perimeter === 0) return 0;
    return (4 * Math.PI * area) / (perimeter * perimeter);
  }
}
