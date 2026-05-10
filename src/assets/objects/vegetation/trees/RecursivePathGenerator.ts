/**
 * RecursivePathGenerator.ts — Recursive Path Tree Trunk Generation
 *
 * Implements the `recursive_path()` + `rand_path()` algorithms from original
 * Infinigen for trunk/branch generation with momentum, gravity pull, size decay,
 * and symmetry. This provides a third tree generation strategy alongside
 * Space Colonization and L-System.
 *
 * Algorithm overview:
 *   1. Start from trunk base, grow upward with momentum (previous direction)
 *   2. At each step, direction is influenced by:
 *      - Previous direction (momentum factor)
 *      - Gravity (downward pull toward ground)
 *      - Random perturbation (curvature variation)
 *   3. Branch at each node with probability based on depth and radius
 *   4. Branch radius decays: childRadius = parentRadius * branchRadiusDecay
 *   5. Branch length decays: childLength = parentLength * branchLengthDecay
 *   6. Recursive: each branch can spawn sub-branches up to maxDepth
 *   7. Symmetry: bilateral mirrors across trunk plane; radial rotates around trunk axis
 *
 * Output is a TreeSkeleton compatible with TreeSkeletonMeshBuilder.
 *
 * Ported from: infinigen/terrain/objects/tree/recursive_path.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { TreeSkeleton, TreeVertex, TreeEdge } from '../SpaceColonization';

// ============================================================================
// Configuration
// ============================================================================

/** Symmetry mode for the recursive path tree */
export type SymmetryMode = 'none' | 'bilateral' | 'radial';

/** Configuration for the RecursivePathGenerator */
export interface RecursivePathConfig {
  /** Length of the main trunk (default 6.0) */
  trunkLength: number;
  /** Radius at the trunk base (default 0.5) */
  trunkRadius: number;
  /** Angle at which branches diverge from parent (radians, default PI/4) */
  branchAngle: number;
  /** Length decay factor per generation (default 0.7) */
  branchLengthDecay: number;
  /** Radius decay factor per generation (default 0.65) */
  branchRadiusDecay: number;
  /** Strength of gravity pulling branches downward (default 0.15) */
  gravityStrength: number;
  /** How much the previous direction influences the next step (0-1, default 0.85) */
  momentumFactor: number;
  /** Maximum recursion depth for sub-branching (default 5) */
  maxDepth: number;
  /** Symmetry mode (default 'none') */
  symmetry: SymmetryMode;
  /** Number of main branches at each node (default 2) */
  numBranches: number;
  /** Random curvature variation per step (default 0.2) */
  curvatureVariation: number;
  /** Probability of branching at any given node (default 0.6) */
  branchProbability: number;
  /** Minimum radius to continue branching (default 0.02) */
  minBranchRadius: number;
  /** Step size for the random walk (default 0.5) */
  stepSize: number;
  /** Number of radial symmetry copies (only if symmetry='radial', default 5) */
  radialCopies: number;
  /** Random seed (default 42) */
  seed: number;
}

/** Default configuration */
export const DEFAULT_RECURSIVE_PATH_CONFIG: RecursivePathConfig = {
  trunkLength: 6.0,
  trunkRadius: 0.5,
  branchAngle: Math.PI / 4,
  branchLengthDecay: 0.7,
  branchRadiusDecay: 0.65,
  gravityStrength: 0.15,
  momentumFactor: 0.85,
  maxDepth: 5,
  symmetry: 'none',
  numBranches: 2,
  curvatureVariation: 0.2,
  branchProbability: 0.6,
  minBranchRadius: 0.02,
  stepSize: 0.5,
  radialCopies: 5,
  seed: 42,
};

// ============================================================================
// Species Presets
// ============================================================================

/** Broadleaf recursive path preset — spreading canopy, thick trunk */
export const BROADLEAF_RECURSIVE_PRESET: Partial<RecursivePathConfig> = {
  trunkLength: 8.0,
  trunkRadius: 0.6,
  branchAngle: Math.PI / 3.5,
  branchLengthDecay: 0.72,
  branchRadiusDecay: 0.6,
  gravityStrength: 0.12,
  momentumFactor: 0.82,
  maxDepth: 5,
  symmetry: 'radial',
  numBranches: 3,
  curvatureVariation: 0.25,
  branchProbability: 0.55,
  stepSize: 0.6,
  radialCopies: 5,
};

/** Pine recursive path preset — narrow conical shape, small branches */
export const PINE_RECURSIVE_PRESET: Partial<RecursivePathConfig> = {
  trunkLength: 14.0,
  trunkRadius: 0.4,
  branchAngle: Math.PI / 6,
  branchLengthDecay: 0.65,
  branchRadiusDecay: 0.55,
  gravityStrength: 0.08,
  momentumFactor: 0.9,
  maxDepth: 4,
  symmetry: 'radial',
  numBranches: 4,
  curvatureVariation: 0.1,
  branchProbability: 0.7,
  stepSize: 0.4,
  radialCopies: 6,
};

/** Palm recursive path preset — tall thin trunk with crown at top */
export const PALM_RECURSIVE_PRESET: Partial<RecursivePathConfig> = {
  trunkLength: 10.0,
  trunkRadius: 0.35,
  branchAngle: Math.PI / 2.5,
  branchLengthDecay: 0.8,
  branchRadiusDecay: 0.5,
  gravityStrength: 0.25,
  momentumFactor: 0.7,
  maxDepth: 2,
  symmetry: 'radial',
  numBranches: 8,
  curvatureVariation: 0.15,
  branchProbability: 0.9,
  stepSize: 0.8,
  radialCopies: 8,
};

/** All recursive path species presets */
export const RECURSIVE_PATH_PRESETS: Record<string, Partial<RecursivePathConfig>> = {
  broadleaf_recursive: BROADLEAF_RECURSIVE_PRESET,
  pine_recursive: PINE_RECURSIVE_PRESET,
  palm_recursive: PALM_RECURSIVE_PRESET,
};

// ============================================================================
// Internal Types
// ============================================================================

/** A single point along a branch path with direction and radius */
interface PathPoint {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
}

/** Result of a single rand_path() call */
interface BranchPath {
  points: PathPoint[];
  depth: number;
}

// ============================================================================
// RecursivePathTree
// ============================================================================

/**
 * RecursivePathTree generates a tree skeleton using the recursive path algorithm
 * with momentum, gravity, and symmetry.
 *
 * This is the Infinigen `recursive_path()` + `rand_path()` approach where:
 *   - The trunk is a single random walk upward
 *   - Branches are spawned at each node recursively
 *   - Each branch follows a `rand_path()` — a random walk influenced by
 *     momentum (previous direction), gravity, and curvature variation
 *
 * Usage:
 *   const tree = new RecursivePathTree(config);
 *   const skeleton = tree.generate();
 *   // skeleton is compatible with TreeSkeletonMeshBuilder
 */
export class RecursivePathTree {
  private config: RecursivePathConfig;
  private rng: SeededRandom;
  private vertices: TreeVertex[];
  private edges: TreeEdge[];
  private terminalIndices: number[];
  private vertexIndex: number;

  constructor(config: Partial<RecursivePathConfig> = {}) {
    this.config = { ...DEFAULT_RECURSIVE_PATH_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.vertices = [];
    this.edges = [];
    this.terminalIndices = [];
    this.vertexIndex = 0;
  }

  /**
   * Generate the complete tree skeleton.
   *
   * @returns A TreeSkeleton compatible with TreeSkeletonMeshBuilder
   */
  generate(): TreeSkeleton {
    this.vertices = [];
    this.edges = [];
    this.terminalIndices = [];
    this.vertexIndex = 0;
    this.rng = new SeededRandom(this.config.seed);

    // Generate the trunk as a single upward path
    const trunkPath = this.randPath(
      new THREE.Vector3(0, 0, 0), // Start at origin
      new THREE.Vector3(0, 1, 0), // Grow upward
      this.config.trunkLength,
      this.config.trunkRadius,
      0 // depth 0 = trunk
    );

    // Add trunk vertices
    let parentIdx = -1;
    for (const point of trunkPath.points) {
      const vIdx = this.addVertex(point.position, point.direction, point.radius, 0);
      if (parentIdx >= 0) {
        this.addEdge(parentIdx, vIdx);
      }
      parentIdx = vIdx;
    }

    // The last trunk vertex is the trunk tip
    const trunkTipIdx = parentIdx;

    // Recursively generate branches from the trunk
    this.generateBranchesRecursive(trunkPath.points, 1);

    // Apply symmetry
    if (this.config.symmetry === 'bilateral') {
      this.applyBilateralSymmetry();
    } else if (this.config.symmetry === 'radial') {
      this.applyRadialSymmetry();
    }

    // Compute bounding box
    const positions = this.vertices.map(v => v.position);
    const boundingBox = new THREE.Box3().setFromPoints(
      positions.length > 0 ? positions : [new THREE.Vector3()]
    );

    // Find max generation
    const maxGeneration = this.vertices.reduce((max, v) => Math.max(max, v.generation), 0);

    return {
      vertices: this.vertices,
      edges: this.edges,
      rootIndex: 0,
      terminalIndices: this.terminalIndices,
      boundingBox,
      maxGeneration,
    };
  }

  // --------------------------------------------------------------------------
  // rand_path() — Single random walk for a branch
  // --------------------------------------------------------------------------

  /**
   * Generate a random walk path for a single branch.
   *
   * At each step, the direction is influenced by:
   *   1. Previous direction (momentum factor)
   *   2. Gravity (downward pull)
   *   3. Random perturbation (curvature variation)
   *
   * This is the core of the `rand_path()` function from original Infinigen.
   *
   * @param startPos Starting position of the branch
   * @param startDir Initial growth direction
   * @param length Total length of this branch
   * @param radius Starting radius of the branch
   * @param depth Current recursion depth (0 = trunk)
   * @returns A BranchPath with all points along the path
   */
  private randPath(
    startPos: THREE.Vector3,
    startDir: THREE.Vector3,
    length: number,
    radius: number,
    depth: number
  ): BranchPath {
    const points: PathPoint[] = [];
    const stepCount = Math.max(2, Math.ceil(length / this.config.stepSize));
    const stepLength = length / stepCount;

    let currentPos = startPos.clone();
    let currentDir = startDir.clone().normalize();
    let currentRadius = radius;

    // Add starting point
    points.push({
      position: currentPos.clone(),
      direction: currentDir.clone(),
      radius: currentRadius,
    });

    for (let i = 0; i < stepCount; i++) {
      // Taper radius along the branch
      const t = (i + 1) / stepCount;
      currentRadius = radius * (1 - t * 0.3); // 30% taper over branch length
      currentRadius = Math.max(currentRadius, this.config.minBranchRadius);

      // Compute next direction with momentum + gravity + random perturbation
      const perturbation = new THREE.Vector3(
        this.rng.uniform(-1, 1),
        this.rng.uniform(-1, 1),
        this.rng.uniform(-1, 1)
      ).multiplyScalar(this.config.curvatureVariation);

      // Gravity: pull downward, stronger for thinner/higher branches
      const gravity = new THREE.Vector3(0, -this.config.gravityStrength * (1 + depth * 0.2), 0);

      // Momentum: blend previous direction with new direction
      const newDir = currentDir.clone()
        .multiplyScalar(this.config.momentumFactor)
        .add(perturbation.multiplyScalar(1 - this.config.momentumFactor))
        .add(gravity);

      // For the trunk (depth=0), enforce upward growth bias
      if (depth === 0 && newDir.y < 0.1) {
        newDir.y = 0.1;
      }

      newDir.normalize();
      currentDir = newDir;

      // Move forward
      currentPos = currentPos.clone().add(currentDir.clone().multiplyScalar(stepLength));

      points.push({
        position: currentPos.clone(),
        direction: currentDir.clone(),
        radius: currentRadius,
      });
    }

    return { points, depth };
  }

  // --------------------------------------------------------------------------
  // Recursive Branch Generation
  // --------------------------------------------------------------------------

  /**
   * Recursively generate branches from a parent path.
   * At each node along the path, there's a probability of spawning sub-branches.
   * Each sub-branch calls rand_path() and then recursively generates its own branches.
   *
   * @param parentPoints Points along the parent branch
   * @param depth Current recursion depth
   */
  private generateBranchesRecursive(parentPoints: PathPoint[], depth: number): void {
    if (depth > this.config.maxDepth) return;

    // Radius and length decay per generation
    const lengthDecay = Math.pow(this.config.branchLengthDecay, depth);
    const radiusDecay = Math.pow(this.config.branchRadiusDecay, depth);

    // Find the parent vertex indices for this path
    // (they were already added, so we need to match positions)
    const parentVertexIndices: number[] = [];
    for (const point of parentPoints) {
      const matchIdx = this.vertices.findIndex(
        v => v.position.distanceTo(point.position) < 0.001
      );
      parentVertexIndices.push(matchIdx >= 0 ? matchIdx : -1);
    }

    // At each node, potentially spawn branches
    // Skip the first and last few points (base and tip)
    const branchStartIdx = Math.max(1, Math.floor(parentPoints.length * 0.2));
    for (let i = branchStartIdx; i < parentPoints.length; i++) {
      const point = parentPoints[i];
      const parentVIdx = parentVertexIndices[i];
      if (parentVIdx < 0) continue;

      // Branch probability decreases with depth and increases with radius
      const radiusFactor = Math.min(1, point.radius / this.config.trunkRadius);
      const depthFactor = 1 - (depth / this.config.maxDepth) * 0.5;
      const prob = this.config.branchProbability * depthFactor * Math.max(0.2, radiusFactor);

      if (this.rng.next() > prob) continue;

      // Number of branches at this node
      const numBranches = Math.min(
        this.config.numBranches,
        Math.max(1, Math.floor(this.config.numBranches * radiusFactor))
      );

      for (let b = 0; b < numBranches; b++) {
        // Compute branch direction: rotate parent direction by branch angle
        const branchDir = this.computeBranchDirection(
          point.direction,
          this.config.branchAngle
        );

        // Branch length and radius
        const branchLength = this.config.trunkLength * lengthDecay * this.rng.uniform(0.6, 1.0);
        const branchRadius = point.radius * radiusDecay;

        if (branchRadius < this.config.minBranchRadius) continue;

        // Generate branch path
        const branchPath = this.randPath(
          point.position,
          branchDir,
          branchLength,
          branchRadius,
          depth
        );

        // Add branch vertices and edges
        let branchParentIdx = parentVIdx;
        for (const bp of branchPath.points) {
          const vIdx = this.addVertex(bp.position, bp.direction, bp.radius, depth);
          this.addEdge(branchParentIdx, vIdx);
          branchParentIdx = vIdx;
        }

        // Recursively generate sub-branches from this branch
        if (depth < this.config.maxDepth) {
          this.generateBranchesRecursive(branchPath.points, depth + 1);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Branch Direction Computation
  // --------------------------------------------------------------------------

  /**
   * Compute a branch direction by rotating the parent direction by the
   * branching angle around a random perpendicular axis.
   */
  private computeBranchDirection(
    parentDir: THREE.Vector3,
    branchAngle: number
  ): THREE.Vector3 {
    // Find a perpendicular vector
    const arbitrary = Math.abs(parentDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);

    const perp = new THREE.Vector3().crossVectors(parentDir, arbitrary).normalize();

    // Rotate around perpendicular axis by branch angle
    // Then rotate around parent axis by a random angle for 3D spread
    const rotAngle = this.rng.uniform(0, Math.PI * 2);

    const branchQuat = new THREE.Quaternion().setFromAxisAngle(perp, branchAngle);
    const spreadQuat = new THREE.Quaternion().setFromAxisAngle(parentDir, rotAngle);

    const result = parentDir.clone().applyQuaternion(branchQuat).applyQuaternion(spreadQuat);
    return result.normalize();
  }

  // --------------------------------------------------------------------------
  // Symmetry
  // --------------------------------------------------------------------------

  /**
   * Apply bilateral symmetry: mirror the tree across the XZ plane (Y-axis).
   * Creates a mirrored copy of all branches on the other side.
   */
  private applyBilateralSymmetry(): void {
    const originalVertexCount = this.vertices.length;
    const originalEdgeCount = this.edges.length;
    const indexOffset = originalVertexCount;

    // Mirror all vertices except the trunk (generation 0)
    for (let i = 0; i < originalVertexCount; i++) {
      const v = this.vertices[i];
      if (v.generation === 0) continue; // Skip trunk vertices

      const mirroredPos = v.position.clone();
      mirroredPos.x = -mirroredPos.x; // Mirror across XZ plane

      const mirroredDir = v.direction.clone();
      mirroredDir.x = -mirroredDir.x;

      this.addVertex(mirroredPos, mirroredDir, v.radius, v.generation);
    }

    // Mirror edges for non-trunk branches
    for (let i = 0; i < originalEdgeCount; i++) {
      const e = this.edges[i];
      const parentV = this.vertices[e.parent];
      const childV = this.vertices[e.child];

      // Skip trunk edges
      if (parentV.generation === 0 && childV.generation === 0) continue;

      const newParentIdx = parentV.generation === 0 ? e.parent : e.parent + indexOffset;
      const newChildIdx = childV.generation === 0 ? e.child : e.child + indexOffset;

      this.addEdge(newParentIdx, newChildIdx);
    }
  }

  /**
   * Apply radial symmetry: rotate copies around the trunk axis (Y-axis).
   * Creates evenly spaced rotational copies of all branches.
   */
  private applyRadialSymmetry(): void {
    const copies = this.config.radialCopies;
    const originalVertices = [...this.vertices];
    const originalEdges = [...this.edges];
    const originalTerminals = [...this.terminalIndices];

    // We already have one copy (the original). Add copies - 1 more.
    for (let c = 1; c < copies; c++) {
      const angle = (c / copies) * Math.PI * 2;
      const rotation = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle
      );

      const indexOffset = this.vertices.length;
      const vertexMap: Map<number, number> = new Map();

      // Add rotated copies of non-trunk vertices
      for (let i = 0; i < originalVertices.length; i++) {
        const v = originalVertices[i];
        if (v.generation === 0) {
          // Trunk vertices are shared — map to original
          vertexMap.set(i, i);
          continue;
        }

        const rotatedPos = v.position.clone().applyQuaternion(rotation);
        const rotatedDir = v.direction.clone().applyQuaternion(rotation);

        const newIdx = this.addVertex(rotatedPos, rotatedDir, v.radius, v.generation);
        vertexMap.set(i, newIdx);
      }

      // Add rotated edges
      for (const e of originalEdges) {
        const parentV = originalVertices[e.parent];
        const childV = originalVertices[e.child];

        if (parentV.generation === 0 && childV.generation === 0) continue;

        const newParent = vertexMap.get(e.parent) ?? e.parent;
        const newChild = vertexMap.get(e.child) ?? e.child;

        this.addEdge(newParent, newChild);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Vertex / Edge Helpers
  // --------------------------------------------------------------------------

  private addVertex(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    generation: number
  ): number {
    const idx = this.vertexIndex++;
    const isTerminal = true; // Will be updated as edges are added

    this.vertices.push({
      index: idx,
      position: position.clone(),
      direction: direction.clone().normalize(),
      generation,
      radius: Math.max(radius, 0.01),
      isTerminal,
    });

    this.terminalIndices.push(idx);
    return idx;
  }

  private addEdge(parent: number, child: number): void {
    // Mark parent as non-terminal
    const parentVertex = this.vertices[parent];
    if (parentVertex && parentVertex.isTerminal) {
      parentVertex.isTerminal = false;
      const termIdx = this.terminalIndices.indexOf(parent);
      if (termIdx >= 0) {
        this.terminalIndices.splice(termIdx, 1);
      }
    }

    this.edges.push({ parent, child });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a tree skeleton using the recursive path algorithm.
 *
 * @param presetName Species preset name or custom config overrides
 * @param seed Random seed
 * @returns A TreeSkeleton compatible with TreeSkeletonMeshBuilder
 */
export function generateRecursivePathTree(
  presetName?: string,
  seed: number = 42
): TreeSkeleton {
  const preset = presetName ? RECURSIVE_PATH_PRESETS[presetName] ?? {} : {};
  const tree = new RecursivePathTree({ ...preset, seed });
  return tree.generate();
}
