/**
 * VegetationP2Features.ts — P2 Vegetation: Root Systems, KDTree Collision,
 * Mushroom Cluster Placement, and Season-Aware Selection
 *
 * Implements advanced vegetation generation features ported from the original
 * Infinigen Python/Blender pipeline:
 *
 * 1. RootSystemGenerator — Space colonization on the ground plane (2D)
 *    with tapered cylinder geometry per segment.
 * 2. KDTree2D — Balanced KD-tree for O(log n) 2D nearest-neighbor queries,
 *    used for mushroom collision avoidance.
 * 3. MushroomClusterPlacer — Collision-free mushroom cluster placement
 *    using KDTree, with bend deformation (SIMPLE_DEFORM equivalent).
 * 4. SeasonAwareSelector — Season-weighted species selection with
 *    flowering/fruiting/evergreen bias per season.
 *
 * All geometries use THREE.Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 *
 * @module vegetation
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Root System Types
// ============================================================================

/**
 * Configuration for root system generation.
 */
export interface RootSystemConfig {
  /** Number of primary roots emanating from the trunk base (default 5) */
  rootCount: number;
  /** Maximum branching depth (0 = primary only, 1 = first sub-roots, etc.) (default 3) */
  maxDepth: number;
  /** Horizontal spread radius on the ground plane (default 2.0) */
  spreadRadius: number;
  /** Maximum angle between root branches in radians (default PI/4) */
  branchAngle: number;
  /** Number of attraction points for space colonization (default 200) */
  attractorCount: number;
  /** Kill radius — attractors within this distance are removed (default 0.15) */
  killRadius: number;
  /** Influence radius — roots grow toward attractors within this distance (default 1.0) */
  influenceRadius: number;
  /** Growth step per iteration (default 0.1) */
  growthStep: number;
  /** Maximum iterations for space colonization (default 80) */
  maxIterations: number;
  /** Branching probability when attractors are clustered (default 0.4) */
  branchProbability: number;
  /** Thickness at trunk base (default 0.12) */
  baseThickness: number;
  /** Thickness decay per depth level (default 0.55) */
  thicknessDecay: number;
  /** Vertical depth below ground (default 0.3) */
  rootDepth: number;
  /** Taper: 1.0 = linear taper, 0.0 = no taper (default 0.8) */
  taperStrength: number;
}

/**
 * Default root system configuration.
 */
export const DEFAULT_ROOT_SYSTEM_CONFIG: RootSystemConfig = {
  rootCount: 5,
  maxDepth: 3,
  spreadRadius: 2.0,
  branchAngle: Math.PI / 4,
  attractorCount: 200,
  killRadius: 0.15,
  influenceRadius: 1.0,
  growthStep: 0.1,
  maxIterations: 80,
  branchProbability: 0.4,
  baseThickness: 0.12,
  thicknessDecay: 0.55,
  rootDepth: 0.3,
  taperStrength: 0.8,
};

/**
 * A single node in the root skeleton produced by space colonization.
 */
export interface RootNode {
  /** Unique index */
  index: number;
  /** 3D position (Y is below ground for roots) */
  position: THREE.Vector3;
  /** Growth direction */
  direction: THREE.Vector3;
  /** Branching depth (0 = primary root from trunk) */
  depth: number;
  /** Radius at this node */
  radius: number;
  /** Parent node index (-1 for root nodes) */
  parentIndex: number;
  /** Whether this is a terminal (tip) node */
  isTerminal: boolean;
}

// ============================================================================
// RootSystemGenerator
// ============================================================================

/**
 * Generates root systems using space colonization on the ground plane.
 *
 * The algorithm distributes attraction points in a hemisphere around the
 * trunk base, then grows root segments toward those attractors. Each
 * segment becomes a tapered cylinder — thick near the trunk, thin at tips.
 *
 * Usage:
 * ```ts
 * const gen = new RootSystemGenerator();
 * const roots = gen.generateRoots(
 *   new THREE.Vector3(0, 0, 0),  // basePosition
 *   0.3,                           // trunkRadius
 *   0,                             // groundHeight
 *   DEFAULT_ROOT_SYSTEM_CONFIG,
 *   new SeededRandom(42),
 * );
 * scene.add(roots);
 * ```
 */
export class RootSystemGenerator {
  /**
   * Generate a root system using 2D space colonization on the ground plane.
   *
   * @param basePosition  Center of the trunk at ground level
   * @param trunkRadius   Radius of the trunk (determines root start thickness)
   * @param groundHeight  Y coordinate of the ground plane
   * @param config        Root system configuration
   * @param rng           Seeded random number generator
   * @returns THREE.Group containing root mesh geometry
   */
  generateRoots(
    basePosition: THREE.Vector3,
    trunkRadius: number,
    groundHeight: number,
    config: Partial<RootSystemConfig> = {},
    rng: SeededRandom,
  ): THREE.Group {
    const cfg = { ...DEFAULT_ROOT_SYSTEM_CONFIG, ...config };
    const group = new THREE.Group();

    // Generate attraction points in a hemisphere on the ground plane
    const attractors = this.generateAttractors(basePosition, groundHeight, cfg, rng);

    // Build the root skeleton via space colonization
    const skeleton = this.createRootSkeleton(basePosition, trunkRadius, groundHeight, attractors, cfg, rng);

    // Convert skeleton to mesh geometry
    const mesh = this.skeletonToMesh(skeleton, cfg);
    group.add(mesh);

    group.userData.tags = ['vegetation', 'roots'];
    return group;
  }

  /**
   * Generate attraction points distributed in a ring around the trunk base.
   * Points are placed on the ground plane (XZ) with slight Y variation for
   * subsurface root depth.
   */
  private generateAttractors(
    basePos: THREE.Vector3,
    groundY: number,
    cfg: RootSystemConfig,
    rng: SeededRandom,
  ): THREE.Vector3[] {
    const attractors: THREE.Vector3[] = [];

    for (let i = 0; i < cfg.attractorCount; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      // Bias toward outer ring for natural root spread
      const r = cfg.spreadRadius * (0.3 + 0.7 * Math.sqrt(rng.next()));
      const y = groundY - rng.uniform(0, cfg.rootDepth);

      attractors.push(new THREE.Vector3(
        basePos.x + Math.cos(angle) * r,
        y,
        basePos.z + Math.sin(angle) * r,
      ));
    }

    return attractors;
  }

  /**
   * Build root skeleton using 2D space colonization.
   *
   * For each primary root direction, grow a branch tip toward attractors.
   * Branch when multiple attractor clusters are detected.
   */
  createRootSkeleton(
    basePos: THREE.Vector3,
    trunkRadius: number,
    groundY: number,
    attractors: THREE.Vector3[],
    cfg: RootSystemConfig,
    rng: SeededRandom,
  ): RootNode[] {
    const nodes: RootNode[] = [];
    const activeAttractors = [...attractors];

    // Create the base node at the trunk
    const baseNode: RootNode = {
      index: 0,
      position: basePos.clone(),
      direction: new THREE.Vector3(0, -1, 0),
      depth: 0,
      radius: cfg.baseThickness * (trunkRadius / 0.3),
      parentIndex: -1,
      isTerminal: false,
    };
    nodes.push(baseNode);

    // Initialize primary root tips evenly spaced around the trunk
    const tips: { nodeIndex: number; position: THREE.Vector3; depth: number; radius: number }[] = [];

    for (let r = 0; r < cfg.rootCount; r++) {
      const angle = (r / cfg.rootCount) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
      const startOffset = trunkRadius * 1.1;
      const startPos = new THREE.Vector3(
        basePos.x + Math.cos(angle) * startOffset,
        groundY - 0.02,
        basePos.z + Math.sin(angle) * startOffset,
      );

      const tipNode: RootNode = {
        index: nodes.length,
        position: startPos,
        direction: new THREE.Vector3(Math.cos(angle), -0.2, Math.sin(angle)).normalize(),
        depth: 0,
        radius: cfg.baseThickness * (trunkRadius / 0.3) * 0.8,
        parentIndex: 0,
        isTerminal: true,
      };
      nodes.push(tipNode);

      tips.push({
        nodeIndex: tipNode.index,
        position: startPos.clone(),
        depth: 0,
        radius: tipNode.radius,
      });
    }

    // Space colonization iterations
    let iteration = 0;
    while (activeAttractors.length > 0 && iteration < cfg.maxIterations) {
      iteration++;

      // Map each attractor to the nearest tip
      const tipAttractors = new Map<number, THREE.Vector3[]>();
      for (const tip of tips) {
        tipAttractors.set(tip.nodeIndex, []);
      }

      const attractorsToRemove = new Set<number>();

      for (let ai = 0; ai < activeAttractors.length; ai++) {
        const attractor = activeAttractors[ai];

        // Check kill radius
        let killed = false;
        for (const tip of tips) {
          if (attractor.distanceTo(tip.position) < cfg.killRadius) {
            attractorsToRemove.add(ai);
            killed = true;
            break;
          }
        }
        if (killed) continue;

        // Find nearest tip within influence radius
        let nearestTip: typeof tips[0] | null = null;
        let nearestDist = Infinity;
        for (const tip of tips) {
          const dist = attractor.distanceTo(tip.position);
          if (dist < cfg.influenceRadius && dist < nearestDist) {
            nearestDist = dist;
            nearestTip = tip;
          }
        }

        if (nearestTip) {
          const list = tipAttractors.get(nearestTip.nodeIndex);
          if (list) list.push(attractor.clone());
        }
      }

      // Remove killed attractors (reverse order)
      const sortedRemovals = Array.from(attractorsToRemove).sort((a, b) => b - a);
      for (const idx of sortedRemovals) {
        activeAttractors.splice(idx, 1);
      }

      // Check if any tips have influencing attractors
      let totalInfluencing = 0;
      for (const [, list] of tipAttractors) {
        totalInfluencing += list.length;
      }
      if (totalInfluencing === 0) break;

      // Grow each tip toward its associated attractors
      const newTips: typeof tips = [];
      const tipsToRemove: number[] = [];

      for (const tip of tips) {
        const associated = tipAttractors.get(tip.nodeIndex);
        if (!associated || associated.length === 0) continue;

        // Average direction toward associated attractors
        const avgDir = new THREE.Vector3();
        for (const at of associated) {
          avgDir.add(at.clone().sub(tip.position).normalize());
        }
        avgDir.normalize();

        // Roots tend to stay near ground / go slightly downward
        avgDir.y = Math.min(avgDir.y, 0.1);
        avgDir.normalize();

        // Add noise
        avgDir.x += rng.uniform(-0.1, 0.1);
        avgDir.z += rng.uniform(-0.1, 0.1);
        avgDir.normalize();

        const newPos = tip.position.clone().add(avgDir.clone().multiplyScalar(cfg.growthStep));
        const newRadius = tip.radius * cfg.thicknessDecay;

        const newNode: RootNode = {
          index: nodes.length,
          position: newPos,
          direction: avgDir.clone(),
          depth: tip.depth,
          radius: Math.max(newRadius, 0.005),
          parentIndex: tip.nodeIndex,
          isTerminal: true,
        };
        nodes.push(newNode);
        nodes[tip.nodeIndex].isTerminal = false;

        newTips.push({
          nodeIndex: newNode.index,
          position: newPos.clone(),
          depth: tip.depth,
          radius: newRadius,
        });
        tipsToRemove.push(tips.indexOf(tip));

        // Branch if enough attractors and depth allows
        if (associated.length >= 3 && tip.depth < cfg.maxDepth && rng.next() < cfg.branchProbability) {
          const branchAngle = rng.uniform(cfg.branchAngle * 0.5, cfg.branchAngle);
          const branchRotY = rng.uniform(0, Math.PI * 2);

          const branchDir = avgDir.clone();
          // Rotate around Y axis
          const cosA = Math.cos(branchRotY);
          const sinA = Math.sin(branchRotY);
          const bx = branchDir.x * cosA - branchDir.z * sinA;
          const bz = branchDir.x * sinA + branchDir.z * cosA;
          branchDir.x = bx;
          branchDir.z = bz;
          // Apply spread angle
          branchDir.y -= Math.sin(branchAngle) * 0.3;
          branchDir.normalize();

          const branchPos = tip.position.clone().add(branchDir.clone().multiplyScalar(cfg.growthStep));
          const branchRadius = tip.radius * cfg.thicknessDecay * 0.7;

          const branchNode: RootNode = {
            index: nodes.length,
            position: branchPos,
            direction: branchDir.clone(),
            depth: tip.depth + 1,
            radius: Math.max(branchRadius, 0.005),
            parentIndex: tip.nodeIndex,
            isTerminal: true,
          };
          nodes.push(branchNode);

          newTips.push({
            nodeIndex: branchNode.index,
            position: branchPos.clone(),
            depth: tip.depth + 1,
            radius: branchRadius,
          });
        }
      }

      // Update tips list
      const removedSet = new Set(tipsToRemove);
      const survivingTips = tips.filter((_, i) => !removedSet.has(i));
      tips.length = 0;
      tips.push(...survivingTips, ...newTips);

      if (nodes.length > 5000) break; // safety
    }

    return nodes;
  }

  /**
   * Convert a root skeleton (array of RootNodes) into a merged THREE.BufferGeometry.
   *
   * Each segment (parent → child) becomes a tapered cylinder.
   * Thick near the trunk, thin at tips, with configurable taper.
   */
  skeletonToMesh(skeleton: RootNode[], config: Partial<RootSystemConfig> = {}): THREE.Mesh {
    const cfg = { ...DEFAULT_ROOT_SYSTEM_CONFIG, ...config };
    const geometries: THREE.BufferGeometry[] = [];

    for (const node of skeleton) {
      if (node.parentIndex < 0) continue;
      const parent = skeleton[node.parentIndex];
      if (!parent) continue;

      const start = parent.position;
      const end = node.position;
      const startRadius = parent.radius * (1 - cfg.taperStrength * 0.3);
      const endRadius = node.radius;

      // Skip degenerate segments
      if (start.distanceTo(end) < 0.001) continue;

      const segmentGeo = this.createTaperedCylinder(start, end, startRadius, endRadius);
      geometries.push(segmentGeo);
    }

    if (geometries.length === 0) {
      return new THREE.Mesh(new THREE.BufferGeometry());
    }

    const merged = this.mergeGeometries(geometries);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f,
      roughness: 0.9,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create a tapered cylinder between two 3D points.
   */
  private createTaperedCylinder(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radiusTop: number,
    radiusBottom: number,
    segments: number = 6,
  ): THREE.CylinderGeometry {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    const rTop = Math.max(radiusTop, 0.002);
    const rBottom = Math.max(radiusBottom, 0.002);

    const geo = new THREE.CylinderGeometry(rTop, rBottom, length, segments, 1, false);

    // Orient cylinder from start to end
    const axis = new THREE.Vector3(0, 1, 0);
    const dir = direction.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir);

    geo.applyMatrix4(
      new THREE.Matrix4()
        .compose(
          start.clone().add(end).multiplyScalar(0.5),
          quaternion,
          new THREE.Vector3(1, 1, 1),
        ),
    );

    return geo;
  }

  /**
   * Merge multiple BufferGeometries into one.
   * Delegates to the canonical GeometryPipeline.mergeGeometries.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// KDTree2D — for mushroom collision avoidance
// ============================================================================

/**
 * A 2D point for KD-tree storage.
 */
export interface KDPoint2D {
  /** X coordinate */
  x: number;
  /** Z coordinate (Z in world = Y in 2D KD tree) */
  z: number;
  /** Optional associated data */
  data?: unknown;
}

/**
 * Balanced KD-tree for efficient 2D nearest-neighbor queries.
 *
 * Used for mushroom cluster collision avoidance: before placing a new
 * mushroom, query the KD-tree to ensure minimum distance from existing
 * placements.
 *
 * Construction is O(n log n) via median-based balanced partitioning.
 * Queries are O(log n) on average.
 *
 * Usage:
 * ```ts
 * const tree = new KDTree2D([{x: 1, z: 2}, {x: 3, z: 4}]);
 * const nearest = tree.findClosest({x: 1.5, z: 2.5}, 5.0);
 * if (nearest) console.log('Closest:', nearest.distance);
 * ```
 */
export class KDTree2D {
  private root: KDTreeNode | null;

  /**
   * Construct a balanced KD-tree from the given points.
   *
   * @param points  Array of 2D points to index
   */
  constructor(points: KDPoint2D[] = []) {
    this.root = points.length > 0
      ? this.buildBalanced(points, 0, 0, points.length - 1)
      : null;
  }

  /**
   * Find the closest point to the query within a maximum distance.
   *
   * @param query       Query point
   * @param maxDistance  Maximum search distance (return null if none found within)
   * @returns Closest point with distance, or null if none within maxDistance
   */
  findClosest(query: KDPoint2D, maxDistance: number): { point: KDPoint2D; distance: number } | null {
    let best: { point: KDPoint2D; distance: number } | null = null;
    this.findClosestRecursive(this.root, query, 0, maxDistance, (result) => { best = result; });
    return best;
  }

  /**
   * Find all points within a given radius of the query.
   *
   * @param query   Center point
   * @param radius  Search radius
   * @returns Array of points within the radius
   */
  findInRange(query: KDPoint2D, radius: number): KDPoint2D[] {
    const results: KDPoint2D[] = [];
    this.findInRangeRecursive(this.root, query, radius, 0, results);
    return results;
  }

  /**
   * Insert a new point into the KD-tree.
   *
   * Note: This does NOT rebalance the tree. For bulk inserts, prefer
   * constructing a new KDTree2D with all points at once.
   *
   * @param point  Point to insert
   */
  insert(point: KDPoint2D): void {
    this.root = this.insertRecursive(this.root, point, 0);
  }

  // --- Private implementation ---

  /**
   * Build a balanced subtree by sorting on the current axis and
   * selecting the median as the root.
   */
  private buildBalanced(
    points: KDPoint2D[],
    depth: number,
    left: number,
    right: number,
  ): KDTreeNode {
    const axis = depth % 2; // 0 = X, 1 = Z

    // Sort the subarray by the current axis
    const sorted = points.slice(left, right + 1).sort((a, b) => {
      return axis === 0 ? a.x - b.x : a.z - b.z;
    });

    // Replace the original range with sorted values
    for (let i = 0; i < sorted.length; i++) {
      points[left + i] = sorted[i];
    }

    const mid = Math.floor(sorted.length / 2);
    const medianPoint = sorted[mid];

    const node: KDTreeNode = { point: medianPoint, left: null, right: null };

    if (mid > 0) {
      node.left = this.buildBalanced(points, depth + 1, left, left + mid - 1);
    }
    if (mid < sorted.length - 1) {
      node.right = this.buildBalanced(points, depth + 1, left + mid + 1, right);
    }

    return node;
  }

  /**
   * Recursive nearest-neighbor search.
   */
  private findClosestRecursive(
    node: KDTreeNode | null,
    query: KDPoint2D,
    depth: number,
    maxDist: number,
    callback: (result: { point: KDPoint2D; distance: number }) => void,
  ): void {
    if (!node) return;

    const dx = query.x - node.point.x;
    const dz = query.z - node.point.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= maxDist) {
      callback({ point: node.point, distance: dist });
    }

    const axis = depth % 2;
    const diff = axis === 0 ? dx : dz;

    // Search the closer side first
    const closer = diff < 0 ? node.left : node.right;
    const further = diff < 0 ? node.right : node.left;

    this.findClosestRecursive(closer, query, depth + 1, maxDist, callback);

    // Only search the further side if it could contain a closer point
    if (Math.abs(diff) <= maxDist) {
      this.findClosestRecursive(further, query, depth + 1, maxDist, callback);
    }
  }

  /**
   * Recursive range search.
   */
  private findInRangeRecursive(
    node: KDTreeNode | null,
    query: KDPoint2D,
    radius: number,
    depth: number,
    results: KDPoint2D[],
  ): void {
    if (!node) return;

    const dx = query.x - node.point.x;
    const dz = query.z - node.point.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= radius) {
      results.push(node.point);
    }

    const axis = depth % 2;
    const diff = axis === 0 ? dx : dz;

    const closer = diff < 0 ? node.left : node.right;
    const further = diff < 0 ? node.right : node.left;

    this.findInRangeRecursive(closer, query, radius, depth + 1, results);

    if (Math.abs(diff) <= radius) {
      this.findInRangeRecursive(further, query, radius, depth + 1, results);
    }
  }

  /**
   * Recursive insertion.
   */
  private insertRecursive(
    node: KDTreeNode | null,
    point: KDPoint2D,
    depth: number,
  ): KDTreeNode {
    if (!node) {
      return { point, left: null, right: null };
    }

    const axis = depth % 2;
    const diff = axis === 0
      ? point.x - node.point.x
      : point.z - node.point.z;

    if (diff < 0) {
      node.left = this.insertRecursive(node.left, point, depth + 1);
    } else {
      node.right = this.insertRecursive(node.right, point, depth + 1);
    }

    return node;
  }
}

/** Internal KD-tree node */
interface KDTreeNode {
  point: KDPoint2D;
  left: KDTreeNode | null;
  right: KDTreeNode | null;
}

// ============================================================================
// MushroomClusterPlacer
// ============================================================================

/**
 * Result of a single mushroom placement within a cluster.
 */
export interface MushroomPlacement {
  /** World-space position */
  position: THREE.Vector3;
  /** Y-axis rotation */
  rotationY: number;
  /** Scale multiplier (slight variation within cluster) */
  scale: number;
  /** Species name */
  species: string;
}

/**
 * Places mushroom clusters with collision-free spacing using KDTree.
 *
 * After placement, applies a bend deformation (SIMPLE_DEFORM bend equivalent)
 * to the cluster for a natural curved look, as in the original Infinigen
 * which uses Blender's Simple Deform modifier on mushroom groups.
 *
 * Usage:
 * ```ts
 * const placer = new MushroomClusterPlacer();
 * const placements = placer.placeCluster('agaric', 15, bounds, rng);
 * ```
 */
export class MushroomClusterPlacer {
  /**
   * Place a cluster of mushrooms with collision-free spacing.
   *
   * Uses KDTree2D to ensure minimum distance between mushrooms.
   * Applies slight size variation for natural clustering.
   *
   * @param species  Mushroom species name
   * @param count    Target number of mushrooms in the cluster
   * @param bounds   Bounding box for the cluster (min/max XZ)
   * @param rng      Seeded random number generator
   * @param minDistance  Minimum distance between mushrooms (default 0.08)
   * @returns Array of mushroom placements
   */
  placeCluster(
    species: string,
    count: number,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    rng: SeededRandom,
    minDistance: number = 0.08,
  ): MushroomPlacement[] {
    const placements: MushroomPlacement[] = [];
    const placedPoints: KDPoint2D[] = [];
    const tree = new KDTree2D([]);

    const maxAttempts = count * 20;

    for (let attempt = 0; attempt < maxAttempts && placements.length < count; attempt++) {
      const x = rng.uniform(bounds.minX, bounds.maxX);
      const z = rng.uniform(bounds.minZ, bounds.maxZ);

      const candidate: KDPoint2D = { x, z };

      // Check minimum distance via KD-tree
      const closest = tree.findClosest(candidate, minDistance);
      if (closest !== null) {
        continue; // Too close to an existing mushroom
      }

      // Place the mushroom
      const placement: MushroomPlacement = {
        position: new THREE.Vector3(x, 0, z), // Y will be set by terrain sampling
        rotationY: rng.uniform(0, Math.PI * 2),
        scale: rng.uniform(0.6, 1.3),
        species,
      };

      placements.push(placement);
      placedPoints.push(candidate);
      tree.insert(candidate);
    }

    return placements;
  }

  /**
   * Apply a bend deformation to a mesh, equivalent to Blender's SIMPLE_DEFORM bend.
   *
   * Bends the mesh around the specified axis by the given angle.
   * Vertices are displaced along a circular arc.
   *
   * @param mesh       The mesh to deform
   * @param bendAngle  Bend angle in radians (positive = bend in +axis direction)
   * @param bendAxis   Axis to bend around: 'x', 'y', or 'z' (default 'x')
   */
  applyBendDeform(mesh: THREE.Mesh, bendAngle: number, bendAxis: 'x' | 'y' | 'z' = 'x'): void {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');

    if (bendAngle === 0) return;

    // Compute bend radius from the bend angle and object height
    const bbox = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Height along the bend axis
    let height: number;
    let axisIndex: number;

    switch (bendAxis) {
      case 'x':
        height = size.x;
        axisIndex = 0;
        break;
      case 'y':
        height = size.y;
        axisIndex = 1;
        break;
      case 'z':
        height = size.z;
        axisIndex = 2;
        break;
    }

    if (Math.abs(bendAngle) < 0.001 || height < 0.001) return;

    const bendRadius = height / bendAngle;
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Get the position along the bend axis relative to center
      const axisValue = [x, y, z][axisIndex] - center.getComponent(axisIndex);
      const t = axisValue / height; // Normalized [−0.5, 0.5]

      // Angle offset along the arc
      const theta = t * bendAngle;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Displacement perpendicular to the bend axis
      // The perpendicular direction depends on the bend axis
      switch (bendAxis) {
        case 'x': {
          // Bend around X: displace in Y/Z
          const dy = y - center.y;
          const dz = z - center.z;
          const perpDist = dz;
          const newY = center.y + dy * cosT - (bendRadius + perpDist) * sinT + bendRadius * sinT;
          const newZ = center.z + dy * sinT + (bendRadius + perpDist) * cosT - bendRadius * cosT;
          positions.setY(i, newY);
          positions.setZ(i, newZ);
          break;
        }
        case 'y': {
          // Bend around Y: displace in X/Z
          const dx = x - center.x;
          const dz = z - center.z;
          const perpDist = dz;
          const newX = center.x + dx * cosT + (bendRadius + perpDist) * sinT - bendRadius * sinT;
          const newZ = center.z - dx * sinT + (bendRadius + perpDist) * cosT - bendRadius * cosT;
          positions.setX(i, newX);
          positions.setZ(i, newZ);
          break;
        }
        case 'z': {
          // Bend around Z: displace in X/Y
          const dx = x - center.x;
          const dy = y - center.y;
          const perpDist = dx;
          const newX = center.x + (bendRadius + perpDist) * cosT - bendRadius * cosT - dy * sinT;
          const newY = center.y + (bendRadius + perpDist) * sinT - bendRadius * sinT + dy * cosT;
          positions.setX(i, newX);
          positions.setY(i, newY);
          break;
        }
      }
    }

    geometry.computeVertexNormals();
    (positions as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ============================================================================
// Season-Aware Selection
// ============================================================================

/**
 * Season enum for seasonal vegetation behavior.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Species descriptor with seasonal weights.
 */
export interface SeasonalSpecies {
  /** Unique species name */
  name: string;
  /** Category: 'flowering', 'fruiting', 'evergreen', 'deciduous', 'herbaceous' */
  category: 'flowering' | 'fruiting' | 'evergreen' | 'deciduous' | 'herbaceous';
  /** Seasonal weight multipliers: how likely this species is to appear in each season */
  seasonalWeights: Record<Season, number>;
}

/**
 * Default species database with seasonal weights.
 *
 * Weighted per season:
 * - Spring: flowering species weighted higher
 * - Summer: all species roughly equal
 * - Autumn: fruiting species weighted higher
 * - Winter: evergreen species weighted higher
 */
export const DEFAULT_SEASONAL_SPECIES: SeasonalSpecies[] = [
  // Flowering
  { name: 'cherry_blossom', category: 'flowering', seasonalWeights: { spring: 3.0, summer: 0.5, autumn: 0.1, winter: 0.0 } },
  { name: 'dandelion', category: 'flowering', seasonalWeights: { spring: 2.5, summer: 1.5, autumn: 0.3, winter: 0.0 } },
  { name: 'wild_rose', category: 'flowering', seasonalWeights: { spring: 1.0, summer: 2.0, autumn: 0.5, winter: 0.0 } },
  { name: 'bluebell', category: 'flowering', seasonalWeights: { spring: 3.0, summer: 0.3, autumn: 0.0, winter: 0.0 } },
  { name: 'sunflower', category: 'flowering', seasonalWeights: { spring: 0.2, summer: 2.5, autumn: 1.0, winter: 0.0 } },
  // Fruiting
  { name: 'apple', category: 'fruiting', seasonalWeights: { spring: 1.0, summer: 1.5, autumn: 3.0, winter: 0.2 } },
  { name: 'blackberry', category: 'fruiting', seasonalWeights: { spring: 0.5, summer: 1.5, autumn: 2.5, winter: 0.1 } },
  { name: 'plum', category: 'fruiting', seasonalWeights: { spring: 0.8, summer: 1.2, autumn: 2.8, winter: 0.1 } },
  // Evergreen
  { name: 'pine', category: 'evergreen', seasonalWeights: { spring: 1.0, summer: 1.0, autumn: 1.5, winter: 3.0 } },
  { name: 'spruce', category: 'evergreen', seasonalWeights: { spring: 1.0, summer: 1.0, autumn: 1.5, winter: 2.5 } },
  { name: 'holly', category: 'evergreen', seasonalWeights: { spring: 0.8, summer: 0.8, autumn: 2.0, winter: 3.0 } },
  // Deciduous
  { name: 'oak', category: 'deciduous', seasonalWeights: { spring: 1.5, summer: 1.5, autumn: 2.0, winter: 0.3 } },
  { name: 'maple', category: 'deciduous', seasonalWeights: { spring: 1.5, summer: 1.0, autumn: 2.5, winter: 0.2 } },
  { name: 'birch', category: 'deciduous', seasonalWeights: { spring: 2.0, summer: 1.0, autumn: 1.5, winter: 0.5 } },
  // Herbaceous
  { name: 'fern', category: 'herbaceous', seasonalWeights: { spring: 2.0, summer: 2.0, autumn: 1.0, winter: 0.1 } },
  { name: 'moss', category: 'herbaceous', seasonalWeights: { spring: 1.5, summer: 1.5, autumn: 1.5, winter: 1.0 } },
  { name: 'mushroom', category: 'herbaceous', seasonalWeights: { spring: 1.5, summer: 1.0, autumn: 2.5, winter: 0.5 } },
];

/**
 * Selects vegetation species based on season with weighted random selection.
 *
 * In the original Infinigen, seasonal appearance controls which species
 * are generated (flowering in spring, fruiting in autumn, evergreen in
 * winter). This class implements the same weighted selection logic.
 *
 * Usage:
 * ```ts
 * const selector = new SeasonAwareSelector();
 * const season = selector.randomSeason({ spring: 0.4, summer: 0.3, autumn: 0.2, winter: 0.1 }, rng);
 * const species = selector.randomSpecies(season, DEFAULT_SEASONAL_SPECIES, rng);
 * ```
 */
export class SeasonAwareSelector {
  /**
   * Randomly select a season based on the given weights.
   *
   * @param weights  Probability weights per season (need not sum to 1)
   * @param rng      Seeded random number generator
   * @returns Selected season
   */
  randomSeason(weights: Partial<Record<Season, number>>, rng: SeededRandom): Season {
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const w = seasons.map(s => weights[s] ?? 1.0);
    return this.weightedChoice(seasons, w, rng);
  }

  /**
   * Select a species for the given season, weighted by seasonal preference.
   *
   * - Spring: flowering species weighted higher
   * - Summer: all species roughly equal (full growth)
   * - Autumn: fruiting species weighted higher
   * - Winter: evergreen species weighted higher
   *
   * @param season            Current season
   * @param availableSpecies  Pool of species to choose from
   * @param rng               Seeded random number generator
   * @returns Name of the selected species
   */
  randomSpecies(season: Season, availableSpecies: SeasonalSpecies[], rng: SeededRandom): string {
    if (availableSpecies.length === 0) {
      return 'oak'; // sensible default
    }

    const weights = availableSpecies.map(sp => sp.seasonalWeights[season] ?? 1.0);
    const chosen = this.weightedChoice(availableSpecies, weights, rng);
    return chosen.name;
  }

  /**
   * Get species filtered by category.
   *
   * @param species  Full species list
   * @param category Category to filter by
   * @returns Filtered species list
   */
  filterByCategory(species: SeasonalSpecies[], category: SeasonalSpecies['category']): SeasonalSpecies[] {
    return species.filter(sp => sp.category === category);
  }

  /**
   * Get the dominant species category for a given season.
   *
   * @param season  The season
   * @returns The dominant category for that season
   */
  getDominantCategory(season: Season): SeasonalSpecies['category'] {
    switch (season) {
      case 'spring': return 'flowering';
      case 'summer': return 'deciduous';
      case 'autumn': return 'fruiting';
      case 'winter': return 'evergreen';
    }
  }

  /**
   * Weighted random choice from an array.
   */
  private weightedChoice<T>(items: T[], weights: number[], rng: SeededRandom): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) return items[0];

    let r = rng.next() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }

    return items[items.length - 1];
  }
}
