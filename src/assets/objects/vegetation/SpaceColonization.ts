/**
 * SpaceColonization.ts — P4.1: Space Colonization Algorithm
 *
 * Implements the space colonization tree branching algorithm from the original
 * Princeton Infinigen. The algorithm grows tree branches by iteratively
 * extending branch tips toward nearby attractor points, producing naturalistic
 * branching structures that fill a target volume.
 *
 * Algorithm overview:
 *   1. Generate attractor points in a target volume (sphere, cone, cube, etc.)
 *   2. Initialize branch tips (typically at the base of the trunk)
 *   3. Each iteration:
 *      a. For each attractor, find the nearest branch tip
 *      b. Move each branch tip toward its associated attractors
 *      c. Remove attractors within the kill radius of any branch tip
 *      d. Optionally branch: if a tip has multiple attractor clusters, split
 *   4. Continue until no attractors remain or max iterations reached
 *
 * Ported from: infinigen/terrain/objects/tree/space_colonization.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/** Shape of the attractor volume */
export type AttractorVolumeShape = 'sphere' | 'cone' | 'cylinder' | 'cube' | 'hemisphere';

/**
 * Configuration for the space colonization algorithm.
 */
export interface SpaceColonizationConfig {
  /** Number of attractor points to generate (default 500) */
  attractorCount: number;
  /** Kill radius: attractors within this distance of a tip are removed (default 0.5) */
  killRadius: number;
  /** Influence radius: tips only respond to attractors within this distance (default 3.0) */
  influenceRadius: number;
  /** Growth step: distance a tip moves per iteration (default 0.3) */
  growthStep: number;
  /** Maximum branching angle in radians when splitting (default PI/6) */
  branchingAngle: number;
  /** Maximum number of iterations (default 100) */
  maxIterations: number;
  /** Minimum number of attractors that must influence a tip to trigger branching (default 3) */
  branchThreshold: number;
  /** Probability of branching when threshold is met (default 0.5) */
  branchProbability: number;
  /** Shape of the attractor volume (default 'sphere') */
  volumeShape: AttractorVolumeShape;
  /** Center of the attractor volume in local space (default [0, 5, 0]) */
  volumeCenter: THREE.Vector3;
  /** Radius / half-extent of the attractor volume (default 4.0) */
  volumeRadius: number;
  /** Height parameter for cone/cylinder shapes (default 8.0) */
  volumeHeight: number;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Trunk starting points (if empty, defaults to single point at volumeCenter - height/2) */
  initialTips: THREE.Vector3[];
  /** Whether to add slight randomness to growth direction (default true) */
  addNoiseToGrowth: boolean;
  /** Noise amplitude added to growth direction (default 0.1) */
  growthNoiseAmplitude: number;
  /** Thickness at the trunk base (default 0.5) */
  baseThickness: number;
  /** Thickness decay per branching generation (default 0.65) */
  thicknessDecay: number;
}

/**
 * A single vertex in the tree skeleton.
 */
export interface TreeVertex {
  /** Unique index */
  index: number;
  /** 3D position */
  position: THREE.Vector3;
  /** Direction this vertex was growing (for orientation) */
  direction: THREE.Vector3;
  /** Branch generation (0 = trunk, 1 = first branch, etc.) */
  generation: number;
  /** Radius at this vertex */
  radius: number;
  /** Whether this is a terminal (leaf) vertex */
  isTerminal: boolean;
}

/**
 * An edge connecting two vertices in the tree skeleton.
 */
export interface TreeEdge {
  /** Index of the parent vertex */
  parent: number;
  /** Index of the child vertex */
  child: number;
}

/**
 * The complete tree skeleton produced by space colonization.
 */
export interface TreeSkeleton {
  /** All vertices */
  vertices: TreeVertex[];
  /** All edges connecting vertices */
  edges: TreeEdge[];
  /** Root vertex index (always 0) */
  rootIndex: number;
  /** Terminal vertex indices (for leaf placement) */
  terminalIndices: number[];
  /** Bounding box of the skeleton */
  boundingBox: THREE.Box3;
  /** Maximum generation depth */
  maxGeneration: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SPACE_COLONIZATION_CONFIG: SpaceColonizationConfig = {
  attractorCount: 500,
  killRadius: 0.5,
  influenceRadius: 3.0,
  growthStep: 0.3,
  branchingAngle: Math.PI / 6,
  maxIterations: 100,
  branchThreshold: 3,
  branchProbability: 0.5,
  volumeShape: 'sphere',
  volumeCenter: new THREE.Vector3(0, 5, 0),
  volumeRadius: 4.0,
  volumeHeight: 8.0,
  seed: 42,
  initialTips: [],
  addNoiseToGrowth: true,
  growthNoiseAmplitude: 0.1,
  baseThickness: 0.5,
  thicknessDecay: 0.65,
};

// ============================================================================
// Space Colonization Implementation
// ============================================================================

/**
 * SpaceColonization implements the attractor-driven tree branching algorithm.
 *
 * Usage:
 *   const sc = new SpaceColonization(myConfig);
 *   const skeleton = sc.generate();
 *   // skeleton.vertices, skeleton.edges contain the tree structure
 */
export class SpaceColonization {
  private config: SpaceColonizationConfig;
  private rng: SeededRandom;

  constructor(config: Partial<SpaceColonizationConfig> = {}) {
    this.config = { ...DEFAULT_SPACE_COLONIZATION_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Run the space colonization algorithm and return the tree skeleton.
   */
  generate(): TreeSkeleton {
    const cfg = this.config;
    const rng = new SeededRandom(cfg.seed);

    // Step 1: Generate attractor points
    const attractors = this.generateAttractors(rng);

    // Step 2: Initialize branch tips
    const tips: BranchTip[] = [];
    const vertices: TreeVertex[] = [];
    const edges: TreeEdge[] = [];

    // Default starting point: bottom of the volume
    const startPos = cfg.initialTips.length > 0
      ? cfg.initialTips[0]
      : new THREE.Vector3(
          cfg.volumeCenter.x,
          cfg.volumeCenter.y - cfg.volumeHeight * 0.5,
          cfg.volumeCenter.z
        );

    // Create root vertex
    const rootVertex: TreeVertex = {
      index: 0,
      position: startPos.clone(),
      direction: new THREE.Vector3(0, 1, 0),
      generation: 0,
      radius: cfg.baseThickness,
      isTerminal: true,
    };
    vertices.push(rootVertex);

    // Initialize tips
    if (cfg.initialTips.length > 0) {
      for (let i = 0; i < cfg.initialTips.length; i++) {
        const tipPos = cfg.initialTips[i];
        const tipVertex: TreeVertex = {
          index: vertices.length,
          position: tipPos.clone(),
          direction: new THREE.Vector3(0, 1, 0),
          generation: 0,
          radius: cfg.baseThickness,
          isTerminal: true,
        };
        vertices.push(tipVertex);
        edges.push({ parent: 0, child: tipVertex.index });
        tips.push({
          vertexIndex: tipVertex.index,
          position: tipPos.clone(),
          generation: 0,
          radius: cfg.baseThickness,
        });
      }
    } else {
      tips.push({
        vertexIndex: 0,
        position: startPos.clone(),
        generation: 0,
        radius: cfg.baseThickness,
      });
    }

    // Step 3: Iterate
    let iteration = 0;
    while (attractors.length > 0 && iteration < cfg.maxIterations) {
      iteration++;

      // Build spatial index for attractors (simple grid)
      const attractorGrid = new SpatialGrid(cfg.influenceRadius);

      for (let i = 0; i < attractors.length; i++) {
        attractorGrid.insert(attractors[i], i);
      }

      // For each tip, query the spatial grid for nearby attractors
      // This replaces the O(N×M) brute-force with O(M × K) where K ≪ N
      // is the average number of attractors per grid neighborhood.
      const tipAttractors: Map<number, THREE.Vector3[]> = new Map();
      for (const tip of tips) {
        tipAttractors.set(tip.vertexIndex, []);
      }

      const attractorToRemove = new Set<number>();

      // Track the nearest tip for each attractor (by index)
      const attractorNearestTip: Map<number, { tip: BranchTip; dist: number }> = new Map();

      for (const tip of tips) {
        // Use spatial grid to find attractors within influence radius
        const nearbyIndices = attractorGrid.query(tip.position, cfg.influenceRadius);

        for (const ai of nearbyIndices) {
          if (attractorToRemove.has(ai)) continue;

          const attractor = attractors[ai];
          const dist = attractor.distanceTo(tip.position);

          // Check if within kill radius
          if (dist < cfg.killRadius) {
            attractorToRemove.add(ai);
            continue;
          }

          // Track the nearest tip for this attractor
          const current = attractorNearestTip.get(ai);
          if (!current || dist < current.dist) {
            attractorNearestTip.set(ai, { tip, dist });
          }
        }
      }

      // Build tipAttractors from the nearest-tip assignments
      for (const [ai, nearest] of attractorNearestTip) {
        if (!attractorToRemove.has(ai)) {
          const list = tipAttractors.get(nearest.tip.vertexIndex);
          if (list) {
            list.push(attractors[ai].clone());
          }
        }
      }

      // Remove killed attractors (iterate in reverse to maintain indices)
      const sortedRemovals = Array.from(attractorToRemove).sort((a, b) => b - a);
      for (const idx of sortedRemovals) {
        attractors.splice(idx, 1);
      }

      // If no attractors are influencing any tips, stop
      let totalInfluencing = 0;
      for (const [, atList] of tipAttractors) {
        totalInfluencing += atList.length;
      }
      if (totalInfluencing === 0) break;

      // Grow each tip toward its associated attractors
      const newTips: BranchTip[] = [];
      const tipsToRemove: number[] = [];

      for (const tip of tips) {
        const associated = tipAttractors.get(tip.vertexIndex);
        if (!associated || associated.length === 0) continue;

        // Compute average direction toward associated attractors
        const avgDir = new THREE.Vector3();
        for (const at of associated) {
          avgDir.add(at.clone().sub(tip.position).normalize());
        }
        avgDir.normalize();

        // Add noise to growth direction
        if (cfg.addNoiseToGrowth) {
          avgDir.x += rng.uniform(-cfg.growthNoiseAmplitude, cfg.growthNoiseAmplitude);
          avgDir.y += rng.uniform(-cfg.growthNoiseAmplitude * 0.3, cfg.growthNoiseAmplitude * 0.3);
          avgDir.z += rng.uniform(-cfg.growthNoiseAmplitude, cfg.growthNoiseAmplitude);
          avgDir.normalize();
        }

        // Ensure growth is predominantly upward for early generations
        if (tip.generation === 0 && avgDir.y < 0) {
          avgDir.y = Math.abs(avgDir.y);
          avgDir.normalize();
        }

        // Create new vertex
        const newPos = tip.position.clone().add(avgDir.clone().multiplyScalar(cfg.growthStep));
        const newGeneration = tip.generation;
        const newRadius = tip.radius * cfg.thicknessDecay;

        const newVertex: TreeVertex = {
          index: vertices.length,
          position: newPos,
          direction: avgDir.clone(),
          generation: newGeneration,
          radius: Math.max(newRadius, 0.02),
          isTerminal: true,
        };
        vertices.push(newVertex);

        // Mark previous vertex as non-terminal
        vertices[tip.vertexIndex].isTerminal = false;

        // Create edge
        edges.push({ parent: tip.vertexIndex, child: newVertex.index });

        // Add as new tip
        newTips.push({
          vertexIndex: newVertex.index,
          position: newPos.clone(),
          generation: newGeneration,
          radius: newRadius,
        });

        tipsToRemove.push(tips.indexOf(tip));

        // Check if we should branch
        if (associated.length >= cfg.branchThreshold && rng.next() < cfg.branchProbability) {
          // Create a branch: offset direction by branching angle
          const branchDir = this.computeBranchDirection(avgDir, cfg.branchingAngle, rng);
          const branchPos = tip.position.clone().add(branchDir.clone().multiplyScalar(cfg.growthStep));
          const branchGeneration = tip.generation + 1;
          const branchRadius = tip.radius * cfg.thicknessDecay;

          const branchVertex: TreeVertex = {
            index: vertices.length,
            position: branchPos,
            direction: branchDir.clone(),
            generation: branchGeneration,
            radius: Math.max(branchRadius, 0.02),
            isTerminal: true,
          };
          vertices.push(branchVertex);
          edges.push({ parent: tip.vertexIndex, child: branchVertex.index });

          newTips.push({
            vertexIndex: branchVertex.index,
            position: branchPos.clone(),
            generation: branchGeneration,
            radius: branchRadius,
          });
        }
      }

      // Update tips: remove old ones, add new ones
      const removedSet = new Set(tipsToRemove);
      const survivingTips = tips.filter((_, i) => !removedSet.has(i));
      tips.length = 0;
      tips.push(...survivingTips, ...newTips);

      // Safety: prevent runaway
      if (vertices.length > 10000) break;
    }

    // Collect terminal indices
    const terminalIndices = vertices
      .filter(v => v.isTerminal)
      .map(v => v.index);

    // Compute bounding box
    const positions = vertices.map(v => v.position);
    const boundingBox = new THREE.Box3().setFromPoints(positions.length > 0 ? positions : [new THREE.Vector3()]);

    // Find max generation
    const maxGeneration = vertices.reduce((max, v) => Math.max(max, v.generation), 0);

    return {
      vertices,
      edges,
      rootIndex: 0,
      terminalIndices,
      boundingBox,
      maxGeneration,
    };
  }

  // --------------------------------------------------------------------------
  // Attractor Generation
  // --------------------------------------------------------------------------

  /**
   * Generate attractor points in the configured volume shape.
   */
  private generateAttractors(rng: SeededRandom): THREE.Vector3[] {
    const { attractorCount, volumeShape, volumeCenter, volumeRadius, volumeHeight } = this.config;
    const attractors: THREE.Vector3[] = [];

    for (let i = 0; i < attractorCount; i++) {
      let point: THREE.Vector3;

      switch (volumeShape) {
        case 'sphere':
          point = this.randomPointInSphere(volumeCenter, volumeRadius, rng);
          break;
        case 'cone':
          point = this.randomPointInCone(volumeCenter, volumeRadius, volumeHeight, rng);
          break;
        case 'cylinder':
          point = this.randomPointInCylinder(volumeCenter, volumeRadius, volumeHeight, rng);
          break;
        case 'cube':
          point = this.randomPointInCube(volumeCenter, volumeRadius, rng);
          break;
        case 'hemisphere':
          point = this.randomPointInHemisphere(volumeCenter, volumeRadius, rng);
          break;
        default:
          point = this.randomPointInSphere(volumeCenter, volumeRadius, rng);
      }

      attractors.push(point);
    }

    return attractors;
  }

  /**
   * Generate a random point uniformly distributed inside a sphere.
   */
  private randomPointInSphere(center: THREE.Vector3, radius: number, rng: SeededRandom): THREE.Vector3 {
    const u = rng.next();
    const v = rng.next();
    const w = rng.next();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(w);

    return new THREE.Vector3(
      center.x + r * Math.sin(phi) * Math.cos(theta),
      center.y + r * Math.sin(phi) * Math.sin(theta),
      center.z + r * Math.cos(phi)
    );
  }

  /**
   * Generate a random point uniformly distributed inside a cone.
   * Cone apex is at center.y + height/2, base at center.y - height/2.
   */
  private randomPointInCone(center: THREE.Vector3, radius: number, height: number, rng: SeededRandom): THREE.Vector3 {
    // Uniform point in cone: sample height uniformly, radius proportional to height
    const t = rng.next(); // 0 = base, 1 = apex
    const y = center.y - height / 2 + t * height;
    const maxR = radius * (1 - t); // Radius decreases linearly toward apex
    const angle = rng.uniform(0, Math.PI * 2);
    const r = maxR * Math.sqrt(rng.next());

    return new THREE.Vector3(
      center.x + r * Math.cos(angle),
      y,
      center.z + r * Math.sin(angle)
    );
  }

  /**
   * Generate a random point uniformly distributed inside a cylinder.
   */
  private randomPointInCylinder(center: THREE.Vector3, radius: number, height: number, rng: SeededRandom): THREE.Vector3 {
    const angle = rng.uniform(0, Math.PI * 2);
    const r = radius * Math.sqrt(rng.next());
    const y = center.y - height / 2 + rng.next() * height;

    return new THREE.Vector3(
      center.x + r * Math.cos(angle),
      y,
      center.z + r * Math.sin(angle)
    );
  }

  /**
   * Generate a random point uniformly distributed inside a cube.
   */
  private randomPointInCube(center: THREE.Vector3, halfExtent: number, rng: SeededRandom): THREE.Vector3 {
    return new THREE.Vector3(
      center.x + rng.uniform(-halfExtent, halfExtent),
      center.y + rng.uniform(-halfExtent, halfExtent),
      center.z + rng.uniform(-halfExtent, halfExtent)
    );
  }

  /**
   * Generate a random point in the upper hemisphere.
   */
  private randomPointInHemisphere(center: THREE.Vector3, radius: number, rng: SeededRandom): THREE.Vector3 {
    const u = rng.next();
    const v = rng.next();
    const w = rng.next();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(v); // Only upper hemisphere: phi in [0, PI/2]
    const r = radius * Math.cbrt(w);

    return new THREE.Vector3(
      center.x + r * Math.sin(phi) * Math.cos(theta),
      center.y + r * Math.cos(phi), // Y is up
      center.z + r * Math.sin(phi) * Math.sin(theta)
    );
  }

  // --------------------------------------------------------------------------
  // Branch Direction
  // --------------------------------------------------------------------------

  /**
   * Compute a branch direction by rotating the parent direction by the
   * branching angle around a random perpendicular axis.
   */
  private computeBranchDirection(
    parentDir: THREE.Vector3,
    branchAngle: number,
    rng: SeededRandom
  ): THREE.Vector3 {
    // Find a perpendicular vector
    const arbitrary = Math.abs(parentDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);

    const perp = new THREE.Vector3().crossVectors(parentDir, arbitrary).normalize();

    // Rotate around perpendicular axis by branch angle
    // Then rotate around parent axis by a random angle for 3D spread
    const rotAngle = rng.uniform(0, Math.PI * 2);

    const branchQuat = new THREE.Quaternion().setFromAxisAngle(perp, branchAngle);
    const spreadQuat = new THREE.Quaternion().setFromAxisAngle(parentDir, rotAngle);

    const result = parentDir.clone().applyQuaternion(branchQuat).applyQuaternion(spreadQuat);
    return result.normalize();
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface BranchTip {
  vertexIndex: number;
  position: THREE.Vector3;
  generation: number;
  radius: number;
}

// ============================================================================
// Simple Spatial Grid for Accelerating Nearest-Tip Queries
// ============================================================================

class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, { point: THREE.Vector3; index: number }[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  insert(point: THREE.Vector3, index: number): void {
    const key = this.cellKey(point);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push({ point, index });
  }

  /**
   * Query for all points within `radius` of `center`.
   * Searches the cell containing `center` plus all neighboring cells
   * that could contain points within the radius, then filters by
   * actual Euclidean distance.
   *
   * @returns Array of indices of points within the radius
   */
  query(center: THREE.Vector3, radius: number): number[] {
    const result: number[] = [];
    const radiusSq = radius * radius;

    // Determine the range of cells to check
    const minCx = Math.floor((center.x - radius) / this.cellSize);
    const maxCx = Math.floor((center.x + radius) / this.cellSize);
    const minCy = Math.floor((center.y - radius) / this.cellSize);
    const maxCy = Math.floor((center.y + radius) / this.cellSize);
    const minCz = Math.floor((center.z - radius) / this.cellSize);
    const maxCz = Math.floor((center.z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = `${cx},${cy},${cz}`;
          const cell = this.cells.get(key);
          if (!cell) continue;

          for (const entry of cell) {
            const dx = entry.point.x - center.x;
            const dy = entry.point.y - center.y;
            const dz = entry.point.z - center.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq <= radiusSq) {
              result.push(entry.index);
            }
          }
        }
      }
    }

    return result;
  }

  private cellKey(p: THREE.Vector3): string {
    const cx = Math.floor(p.x / this.cellSize);
    const cy = Math.floor(p.y / this.cellSize);
    const cz = Math.floor(p.z / this.cellSize);
    return `${cx},${cy},${cz}`;
  }
}
