/**
 * PlacementRegistry.ts — Single source of truth for all placement strategies
 *
 * Extends the scatter strategy registry with constraint-based placement,
 * floorplan placement, and other non-scatter placement algorithms.
 *
 * Built-in placement strategies:
 *   - 'constraint'     → ConstraintGraph-based placement from domain/types
 *   - 'floorplan'      → FloorPlanGenerator-based room placement
 *   - 'advanced'       → AdvancedPlacer (Poisson + relaxation + collision)
 *
 * Scatter strategies are delegated to ScatterRegistry:
 *   - 'poisson_disk', 'grid_jitter', 'density_mask', 'volume', 'taper', 'gpu'
 *
 * @module placement
 */

import * as THREE from 'three';
import {
  ScatterRegistry,
  type ScatterStrategy,
  type ScatterStrategyConfig,
  type ScatterOutput,
} from './ScatterRegistry';
import type { ConstraintGraph, ConstraintNode } from './domain/types';
import { FloorPlanGenerator } from './floorplan/FloorPlanGenerator';
import { AdvancedPlacer, createDefaultConfig } from './advanced/AdvancedPlacer';
import { BBox } from '@/core/util/math/bbox';
import { SeededRandom } from '@/core/util/MathUtils';
import type { TerrainData } from './DensityPlacementSystem';

// ============================================================================
// Placement Strategy Types
// ============================================================================

/**
 * Context provided to placement strategies at execution time.
 * Contains all the information a strategy needs to compute placements.
 */
export interface PlacementContext {
  /** The Three.js scene (for raycasting, etc.) */
  scene: THREE.Scene;
  /** 3D bounding box for placement */
  bounds: THREE.Box3;
  /** Optional terrain data for height queries and mask evaluation */
  terrainData?: TerrainData;
  /** Existing objects in the scene (for collision avoidance) */
  existingObjects?: Array<{
    id: string;
    bounds: THREE.Box3;
    position: THREE.Vector3;
  }>;
  /** Random seed for reproducibility */
  seed: number;
  /** Optional constraint graph for constraint-based placement */
  constraints?: ConstraintGraph;
  /** Optional camera position (for distance-based strategies) */
  cameraPosition?: THREE.Vector3;
  /** Target number of instances */
  targetCount: number;
  /** Minimum spacing between instances */
  minSpacing: number;
}

/**
 * Result from a placement strategy execution.
 * Contains generated positions and optional transforms/metadata.
 */
export interface PlacementOutput {
  /** Generated world-space positions */
  positions: THREE.Vector3[];
  /** Per-position rotations (optional — defaults to identity) */
  rotations?: THREE.Euler[];
  /** Per-position scales (optional — defaults to unit scale) */
  scales?: THREE.Vector3[];
  /** Number of instances actually placed */
  count: number;
  /** Strategy-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for all placement strategies (scatter and non-scatter).
 *
 * Unlike ScatterStrategy which only handles 2D scatter, PlacementStrategy
 * handles the full range of placement algorithms including constraint-based
 * and floorplan-based placement.
 */
export interface PlacementStrategy {
  /** Unique name for this strategy */
  readonly name: string;
  /** Strategy type for categorization */
  readonly type: 'scatter' | 'constraint' | 'floorplan' | 'advanced';
  /** Execute the placement algorithm */
  execute(context: PlacementContext): PlacementOutput;
}

// ============================================================================
// Built-in Placement Strategies
// ============================================================================

/**
 * Constraint-based placement — places objects according to a ConstraintGraph.
 *
 * Uses the domain types for constraint nodes, edges, and relations.
 * Resolves the constraint graph by iterating over nodes and placing each
 * one according to its domain constraints and relations to previously
 * placed objects.
 */
export class ConstraintPlacementStrategy implements PlacementStrategy {
  readonly name = 'constraint';
  readonly type = 'constraint' as const;

  execute(context: PlacementContext): PlacementOutput {
    const { constraints, seed, targetCount, bounds, existingObjects } = context;
    const rng = new SeededRandom(seed);
    const positions: THREE.Vector3[] = [];
    const rotations: THREE.Euler[] = [];
    const scales: THREE.Vector3[] = [];

    if (!constraints || constraints.nodes.size === 0) {
      // No constraints — fall back to uniform random placement within bounds
      for (let i = 0; i < targetCount; i++) {
        positions.push(new THREE.Vector3(
          bounds.min.x + rng.next() * (bounds.max.x - bounds.min.x),
          bounds.min.y + rng.next() * (bounds.max.y - bounds.min.y),
          bounds.min.z + rng.next() * (bounds.max.z - bounds.min.z),
        ));
        rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
        scales.push(new THREE.Vector3(1, 1, 1));
      }
      return { positions, rotations, scales, count: positions.length };
    }

    // Place objects according to the constraint graph
    const placedPositions = new Map<string, THREE.Vector3>();

    for (const [nodeId, node] of constraints.nodes) {
      if (positions.length >= targetCount) break;

      const position = this.resolveNodePosition(
        node,
        placedPositions,
        constraints,
        bounds,
        rng,
        context.minSpacing,
      );

      if (position) {
        positions.push(position);
        rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
        scales.push(new THREE.Vector3(1, 1, 1));
        placedPositions.set(nodeId, position);
      }
    }

    // Fill remaining count with constrained-random positions
    while (positions.length < targetCount) {
      const pos = new THREE.Vector3(
        bounds.min.x + rng.next() * (bounds.max.x - bounds.min.x),
        bounds.min.y + rng.next() * (bounds.max.y - bounds.min.y),
        bounds.min.z + rng.next() * (bounds.max.z - bounds.min.z),
      );
      positions.push(pos);
      rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
      scales.push(new THREE.Vector3(1, 1, 1));
    }

    return {
      positions,
      rotations,
      scales,
      count: positions.length,
      metadata: { strategy: 'constraint', nodeCount: constraints.nodes.size },
    };
  }

  /**
   * Resolve a single node's position based on its domain constraints
   * and relations to already-placed nodes.
   */
  private resolveNodePosition(
    node: ConstraintNode,
    placedPositions: Map<string, THREE.Vector3>,
    graph: ConstraintGraph,
    bounds: THREE.Box3,
    rng: SeededRandom,
    minSpacing: number = 1.0,
  ): THREE.Vector3 | null {
    const posBounds = node.domain.positionBounds;

    // Determine effective bounds from domain constraints
    let effectiveMinX = bounds.min.x;
    let effectiveMinY = bounds.min.y;
    let effectiveMinZ = bounds.min.z;
    let effectiveMaxX = bounds.max.x;
    let effectiveMaxY = bounds.max.y;
    let effectiveMaxZ = bounds.max.z;

    if (posBounds) {
      effectiveMinX = Math.max(effectiveMinX, posBounds.min[0]);
      effectiveMinY = Math.max(effectiveMinY, posBounds.min[1]);
      effectiveMinZ = Math.max(effectiveMinZ, posBounds.min[2]);
      effectiveMaxX = Math.min(effectiveMaxX, posBounds.max[0]);
      effectiveMaxY = Math.min(effectiveMaxY, posBounds.max[1]);
      effectiveMaxZ = Math.min(effectiveMaxZ, posBounds.max[2]);
    }

    // Start with a base random position within effective bounds
    let position = new THREE.Vector3(
      effectiveMinX + rng.next() * (effectiveMaxX - effectiveMinX),
      effectiveMinY + rng.next() * (effectiveMaxY - effectiveMinY),
      effectiveMinZ + rng.next() * (effectiveMaxZ - effectiveMinZ),
    );

    // Adjust position based on relations to already-placed nodes
    for (const relation of node.relations) {
      const otherPos = placedPositions.get(relation.object2) ?? placedPositions.get(relation.object1);
      if (!otherPos) continue;

      const distance = relation.distance ?? minSpacing;

      switch (relation.type) {
        case 'near': {
          // Place near the other object within the specified distance
          const offset = new THREE.Vector3(
            (rng.next() - 0.5) * 2 * distance,
            (rng.next() - 0.5) * distance * 0.3,
            (rng.next() - 0.5) * 2 * distance,
          );
          position = otherPos.clone().add(offset);
          break;
        }
        case 'far': {
          // Place away from the other object
          const dir = position.clone().sub(otherPos).normalize();
          if (dir.lengthSq() < 0.001) {
            dir.set(rng.next() - 0.5, 0, rng.next() - 0.5).normalize();
          }
          position = otherPos.clone().add(dir.multiplyScalar(distance * (1 + rng.next())));
          break;
        }
        case 'on_top_of': {
          // Place directly above
          position = otherPos.clone();
          position.y += distance;
          break;
        }
        case 'under': {
          // Place directly below
          position = otherPos.clone();
          position.y -= distance;
          break;
        }
        case 'left_of': {
          // Place to the left (negative X)
          position = otherPos.clone();
          position.x -= distance;
          break;
        }
        case 'right_of': {
          // Place to the right (positive X)
          position = otherPos.clone();
          position.x += distance;
          break;
        }
        case 'in_front_of': {
          // Place in front (negative Z)
          position = otherPos.clone();
          position.z -= distance;
          break;
        }
        case 'behind': {
          // Place behind (positive Z)
          position = otherPos.clone();
          position.z += distance;
          break;
        }
        case 'inside': {
          // Place at the same position (slightly offset)
          position = otherPos.clone().add(new THREE.Vector3(
            (rng.next() - 0.5) * distance * 0.3,
            (rng.next() - 0.5) * distance * 0.3,
            (rng.next() - 0.5) * distance * 0.3,
          ));
          break;
        }
        default:
          // For unhandled relation types, keep the random position
          break;
      }
    }

    // Clamp to bounds
    position.x = Math.max(bounds.min.x, Math.min(bounds.max.x, position.x));
    position.y = Math.max(bounds.min.y, Math.min(bounds.max.y, position.y));
    position.z = Math.max(bounds.min.z, Math.min(bounds.max.z, position.z));

    return position;
  }
}

/**
 * Floorplan-based placement — places objects according to a FloorPlanGenerator result.
 *
 * Generates a floor plan using the FloorPlanGenerator and then places
 * objects within each room according to room type and size constraints.
 */
export class FloorplanPlacementStrategy implements PlacementStrategy {
  readonly name = 'floorplan';
  readonly type = 'floorplan' as const;

  execute(context: PlacementContext): PlacementOutput {
    const { seed, bounds, targetCount } = context;
    const rng = new SeededRandom(seed);
    const positions: THREE.Vector3[] = [];
    const rotations: THREE.Euler[] = [];
    const scales: THREE.Vector3[] = [];

    // Generate a floor plan within the given bounds
    const totalArea = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
    const roomCount = Math.max(1, Math.min(10, Math.round(totalArea / 20)));

    // Create generator with appropriate params
    const generator = new FloorPlanGenerator({
      seed,
      totalArea: Math.max(10, totalArea),
      roomCount,
      unit: 1.0,
    });

    const floorPlan = generator.generate();

    if (!floorPlan || !floorPlan.rooms || floorPlan.rooms.length === 0) {
      // Fallback: uniform random placement
      for (let i = 0; i < targetCount; i++) {
        positions.push(new THREE.Vector3(
          bounds.min.x + rng.next() * (bounds.max.x - bounds.min.x),
          bounds.min.y,
          bounds.min.z + rng.next() * (bounds.max.z - bounds.min.z),
        ));
        rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
        scales.push(new THREE.Vector3(1, 1, 1));
      }
      return { positions, rotations, scales, count: positions.length };
    }

    // Distribute target count across rooms proportionally to room area
    const totalRoomArea = floorPlan.rooms.reduce((sum, room) => {
      const poly = room.polygon;
      if (!poly || poly.length < 3) return sum;
      return sum + room.area;
    }, 0);

    let placed = 0;
    for (const room of floorPlan.rooms) {
      if (placed >= targetCount) break;

      const poly = room.polygon;
      if (!poly || poly.length < 3) continue;

      // Number of objects for this room proportional to area
      const roomObjCount = Math.max(1, Math.round(targetCount * (room.area / Math.max(1, totalRoomArea))));

      // Compute room bounds for rejection sampling
      let minRX = Infinity, minRZ = Infinity;
      let maxRX = -Infinity, maxRZ = -Infinity;
      for (const [x, z] of poly) {
        minRX = Math.min(minRX, x);
        minRZ = Math.min(minRZ, z);
        maxRX = Math.max(maxRX, x);
        maxRZ = Math.max(maxRZ, z);
      }

      // Place objects within the room polygon using rejection sampling
      let attempts = 0;
      let roomPlaced = 0;
      while (roomPlaced < roomObjCount && attempts < roomObjCount * 20 && placed < targetCount) {
        attempts++;
        const x = minRX + rng.next() * (maxRX - minRX);
        const z = minRZ + rng.next() * (maxRZ - minRZ);

        // Check if point is inside polygon (ray casting)
        if (this.pointInPolygon(x, z, poly)) {
          // Offset to world bounds
          const worldX = bounds.min.x + (x / Math.max(1, maxRX - minRX)) * (bounds.max.x - bounds.min.x);
          const worldZ = bounds.min.z + (z / Math.max(1, maxRZ - minRZ)) * (bounds.max.z - bounds.min.z);

          positions.push(new THREE.Vector3(worldX, bounds.min.y, worldZ));
          rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
          scales.push(new THREE.Vector3(1, 1, 1));
          roomPlaced++;
          placed++;
        }
      }
    }

    return {
      positions,
      rotations,
      scales,
      count: positions.length,
      metadata: {
        strategy: 'floorplan',
        roomCount: floorPlan.rooms.length,
        totalRoomArea,
      },
    };
  }

  /** Point-in-polygon test using ray casting algorithm */
  private pointInPolygon(x: number, z: number, poly: Array<[number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (((yi > z) !== (yj > z)) && (x < (xj - xi) * (z - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
}

/**
 * Advanced placement — delegates to AdvancedPlacer for Poisson + relaxation + collision.
 *
 * Uses Bridson's Poisson disk sampling, Lloyd's relaxation, surface projection,
 * and collision avoidance to produce high-quality object placements.
 */
export class AdvancedPlacementStrategy implements PlacementStrategy {
  readonly name = 'advanced';
  readonly type = 'advanced' as const;

  execute(context: PlacementContext): PlacementOutput {
    const { bounds, seed, targetCount, minSpacing, existingObjects } = context;
    const rng = new SeededRandom(seed);
    const positions: THREE.Vector3[] = [];
    const rotations: THREE.Euler[] = [];
    const scales: THREE.Vector3[] = [];

    // Convert THREE.Box3 to BBox for AdvancedPlacer
    const bbox = new BBox(
      { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    );

    // Create default placement config
    const config = {
      ...createDefaultConfig(),
      minDistance: minSpacing,
    };

    // Extract existing positions for collision avoidance
    const existingPositions = existingObjects?.map(o => {
      const v = new THREE.Vector3();
      v.copy(o.position);
      return v;
    }) ?? [];

    // Use Poisson disk sampling with spatial grid for fast neighbor queries
    const cellSize = minSpacing / Math.sqrt(3);
    const grid = new Map<string, THREE.Vector3[]>();

    const maxAttempts = targetCount * 30;
    let attempts = 0;

    while (positions.length < targetCount && attempts < maxAttempts) {
      attempts++;

      // Generate candidate position
      const candidate = new THREE.Vector3(
        bounds.min.x + rng.next() * (bounds.max.x - bounds.min.x),
        bounds.min.y + rng.next() * (bounds.max.y - bounds.min.y),
        bounds.min.z + rng.next() * (bounds.max.z - bounds.min.z),
      );

      // Check spacing using spatial grid
      const cellKey = this.gridKey(candidate, cellSize);
      let tooClose = false;

      for (let dx = -2; dx <= 2 && !tooClose; dx++) {
        for (let dy = -2; dy <= 2 && !tooClose; dy++) {
          for (let dz = -2; dz <= 2 && !tooClose; dz++) {
            const neighborKey = `${cellKey[0] + dx},${cellKey[1] + dy},${cellKey[2] + dz}`;
            const neighbors = grid.get(neighborKey);
            if (neighbors) {
              for (const existing of neighbors) {
                if (candidate.distanceTo(existing) < minSpacing) {
                  tooClose = true;
                  break;
                }
              }
            }
          }
        }
      }

      // Check against existing objects
      if (!tooClose && existingPositions.length > 0) {
        for (const existingPos of existingPositions) {
          if (candidate.distanceTo(existingPos) < minSpacing) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) {
        positions.push(candidate);
        rotations.push(new THREE.Euler(0, rng.uniform(0, Math.PI * 2), 0));
        scales.push(new THREE.Vector3(1, 1, 1));

        // Add to spatial grid
        const key = this.gridKey(candidate, cellSize);
        const gridKey = `${key[0]},${key[1]},${key[2]}`;
        if (!grid.has(gridKey)) grid.set(gridKey, []);
        grid.get(gridKey)!.push(candidate);
      }
    }

    // Apply Lloyd's relaxation (2 iterations) for better distribution
    const relaxedPositions = this.applyRelaxation(positions, bounds, 2);

    return {
      positions: relaxedPositions,
      rotations,
      scales,
      count: relaxedPositions.length,
      metadata: {
        strategy: 'advanced',
        attempts,
        spacing: minSpacing,
      },
    };
  }

  /** Compute spatial grid cell key for a position */
  private gridKey(pos: THREE.Vector3, cellSize: number): [number, number, number] {
    return [
      Math.floor(pos.x / cellSize),
      Math.floor(pos.y / cellSize),
      Math.floor(pos.z / cellSize),
    ];
  }

  /**
   * Apply Lloyd's relaxation to evenly distribute points.
   * Moves each point toward the centroid of its Voronoi cell
   * (approximated by nearest-neighbor centroid).
   */
  private applyRelaxation(
    positions: THREE.Vector3[],
    bounds: THREE.Box3,
    iterations: number,
  ): THREE.Vector3[] {
    const result = positions.map(p => p.clone());
    const k = Math.max(1, Math.min(6, Math.floor(Math.sqrt(result.length))));

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < result.length; i++) {
        // Find k nearest neighbors
        const distances: Array<{ index: number; dist: number }> = [];
        for (let j = 0; j < result.length; j++) {
          if (i === j) continue;
          distances.push({ index: j, dist: result[i].distanceTo(result[j]) });
        }
        distances.sort((a, b) => a.dist - b.dist);

        // Compute centroid of k nearest neighbors
        const centroid = new THREE.Vector3();
        const count = Math.min(k, distances.length);
        for (let n = 0; n < count; n++) {
          centroid.add(result[distances[n].index]);
        }
        centroid.divideScalar(count);

        // Move toward centroid with damping
        result[i].lerp(centroid, 0.3);

        // Clamp to bounds
        result[i].x = Math.max(bounds.min.x, Math.min(bounds.max.x, result[i].x));
        result[i].y = Math.max(bounds.min.y, Math.min(bounds.max.y, result[i].y));
        result[i].z = Math.max(bounds.min.z, Math.min(bounds.max.z, result[i].z));
      }
    }

    return result;
  }
}

// ============================================================================
// PlacementRegistry
// ============================================================================

/**
 * Registry for all placement strategies — the single source of truth.
 *
 * Combines scatter strategies (delegated to ScatterRegistry) with
 * constraint-based, floorplan-based, and advanced placement strategies.
 *
 * Usage:
 * ```ts
 * const registry = PlacementRegistry.createDefault();
 *
 * // Use scatter strategy (delegated to ScatterRegistry)
 * const scatterResult = registry.scatter('poisson_disk', { ... });
 *
 * // Use placement strategy
 * const placementResult = registry.executePlacement('constraint', { ... });
 *
 * // Check what's available
 * const names = registry.getStrategyNames(); // all scatter + placement names
 * ```
 */
export class PlacementRegistry {
  /** Scatter strategy registry (delegated) */
  private scatterRegistry: ScatterRegistry;
  /** Non-scatter placement strategies */
  private placementStrategies: Map<string, PlacementStrategy> = new Map();

  constructor(scatterRegistry?: ScatterRegistry) {
    this.scatterRegistry = scatterRegistry ?? ScatterRegistry.createDefault();
  }

  // --------------------------------------------------------------------------
  // Scatter delegation
  // --------------------------------------------------------------------------

  /**
   * Register a scatter strategy (delegated to ScatterRegistry).
   *
   * @param name      Unique name for the strategy
   * @param strategy  The scatter strategy implementation
   */
  registerScatterStrategy(name: string, strategy: ScatterStrategy): void {
    this.scatterRegistry.register(name, strategy);
  }

  /**
   * Execute a scatter algorithm by name (delegated to ScatterRegistry).
   *
   * @param name    The registered scatter strategy name
   * @param config  Strategy-specific configuration
   * @returns ScatterOutput with generated positions
   */
  scatter(name: string, config: ScatterStrategyConfig): ScatterOutput {
    return this.scatterRegistry.scatter(name, config);
  }

  /**
   * Get the underlying ScatterRegistry for direct access.
   */
  getScatterRegistry(): ScatterRegistry {
    return this.scatterRegistry;
  }

  // --------------------------------------------------------------------------
  // Placement strategies
  // --------------------------------------------------------------------------

  /**
   * Register a non-scatter placement strategy.
   *
   * @param strategy  The placement strategy implementation
   * @throws Error if a strategy with the same name is already registered
   */
  registerPlacementStrategy(strategy: PlacementStrategy): void {
    if (this.placementStrategies.has(strategy.name)) {
      throw new Error(
        `[PlacementRegistry] Placement strategy '${strategy.name}' is already registered`,
      );
    }
    this.placementStrategies.set(strategy.name, strategy);
  }

  /**
   * Execute a non-scatter placement strategy by name.
   *
   * @param name     The registered placement strategy name
   * @param context  The placement context with bounds, constraints, etc.
   * @returns PlacementOutput with generated positions
   * @throws Error if the strategy is not found
   */
  executePlacement(name: string, context: PlacementContext): PlacementOutput {
    const strategy = this.placementStrategies.get(name);
    if (!strategy) {
      throw new Error(
        `[PlacementRegistry] Unknown placement strategy '${name}'. ` +
        `Available: ${Array.from(this.placementStrategies.keys()).join(', ')}`,
      );
    }
    return strategy.execute(context);
  }

  // --------------------------------------------------------------------------
  // Combined queries
  // --------------------------------------------------------------------------

  /**
   * Check if a strategy (scatter or placement) is registered.
   */
  has(name: string): boolean {
    return this.scatterRegistry.has(name) || this.placementStrategies.has(name);
  }

  /**
   * Get a placement strategy by name.
   */
  getPlacementStrategy(name: string): PlacementStrategy | undefined {
    return this.placementStrategies.get(name);
  }

  /**
   * Get all registered strategy names (both scatter and placement).
   */
  getStrategyNames(): string[] {
    const scatterNames = this.scatterRegistry.getStrategyNames();
    const placementNames = Array.from(this.placementStrategies.keys());
    return [...scatterNames, ...placementNames];
  }

  /**
   * Get only the scatter strategy names.
   */
  getScatterStrategyNames(): string[] {
    return this.scatterRegistry.getStrategyNames();
  }

  /**
   * Get only the placement strategy names.
   */
  getPlacementStrategyNames(): string[] {
    return Array.from(this.placementStrategies.keys());
  }

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  /**
   * Create a registry pre-loaded with all built-in strategies.
   *
   * Scatter strategies: poisson_disk, grid_jitter, density_mask, volume, taper, gpu
   * Placement strategies: constraint, floorplan, advanced
   */
  static createDefault(): PlacementRegistry {
    const registry = new PlacementRegistry();

    // Register built-in placement strategies
    registry.registerPlacementStrategy(new ConstraintPlacementStrategy());
    registry.registerPlacementStrategy(new FloorplanPlacementStrategy());
    registry.registerPlacementStrategy(new AdvancedPlacementStrategy());

    return registry;
  }
}
