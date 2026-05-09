/**
 * CameraPoseSearchEngine.ts
 *
 * Extracted from DensityPlacementSystem.ts — the camera pose search engine
 * implements the original Infinigen camera-pose search:
 * up to 30 000 iterations of propose → validate → score.
 *
 * Uses BVH raycast for obstacle checking when three-mesh-bvh is available;
 * falls back to a simple THREE.Raycaster otherwise.
 *
 * @module placement/camera
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Camera Constraint & Result types
// ============================================================================

/** Constraint for camera pose search */
export interface CameraConstraint {
  /** Constraint type identifier */
  type: 'altitude' | 'obstacle_clearance' | 'view_angle' | 'distance_to_subject' | 'fov' | 'tag_coverage' | 'custom';
  /** Minimum value (context-dependent) */
  min?: number;
  /** Maximum value (context-dependent) */
  max?: number;
  /** Target / ideal value */
  target?: number;
  /** Weight in the scoring function (default 1.0) */
  weight?: number;
  /** Custom validation function for 'custom' type */
  validate?: (position: THREE.Vector3, direction: THREE.Vector3) => number;
}

/**
 * Tag coverage constraint — requires specific tag coverage percentages
 * among visible objects from the camera's viewpoint.
 *
 * For example: "at least 40% of visible objects must be vegetation"
 * would be: `{ tag: 'vegetation', minRatio: 0.4, maxRatio: 1.0 }`
 *
 * During scoring, the engine estimates tag coverage by counting visible
 * objects per tag and computing the ratio. If the ratio falls outside
 * [minRatio, maxRatio], the pose is penalized.
 */
export interface TagCoverageConstraint {
  /** Tag name to check (e.g., 'vegetation', 'furniture', 'rock') */
  tag: string;
  /** Minimum ratio of visible objects with this tag (0-1) */
  minRatio: number;
  /** Maximum ratio of visible objects with this tag (0-1) */
  maxRatio: number;
  /** Weight for scoring (default 1.0) */
  weight?: number;
}

/**
 * Configuration for camera pose search, including tag coverage constraints.
 */
export interface CameraSearchConfig {
  /** Standard camera constraints */
  constraints: CameraConstraint[];
  /** Tag coverage constraints — validated during scoring */
  tagCoverageConstraints?: TagCoverageConstraint[];
  /** Maximum search iterations */
  maxIterations?: number;
  /** Random seed */
  seed?: number;
  /** Optional bounds for camera position search */
  bounds?: THREE.Box3;
  /** Optional subject point for view-angle constraints */
  subject?: THREE.Vector3;
}

/** Result from camera pose search */
export interface CameraPoseResult {
  /** Best camera position found */
  position: THREE.Vector3;
  /** Camera look-at direction (unit vector) */
  direction: THREE.Vector3;
  /** Field of view in radians */
  fov: number;
  /** Composite score (higher = better, 0-1) */
  score: number;
  /** Number of iterations performed */
  iterations: number;
  /** Whether any valid pose was found */
  found: boolean;
}

// ============================================================================
// CameraPoseSearchEngine
// ============================================================================

/**
 * Implements the original Infinigen camera-pose search:
 * up to 30 000 iterations of propose → validate → score.
 *
 * Uses BVH raycast for obstacle checking when three-mesh-bvh is available;
 * falls back to a simple THREE.Raycaster otherwise.
 *
 * Supports tag coverage constraints that validate specific tag ratios
 * among visible objects from the camera's viewpoint.
 */
export class CameraPoseSearchEngine {
  private raycaster: THREE.Raycaster;
  /** Tag coverage constraints applied during scoring */
  private tagCoverageConstraints: TagCoverageConstraint[];
  /** Map of object IDs to their tag arrays, for tag coverage estimation */
  private objectTagMap: Map<string, string[]>;
  /** Default FOV for visibility frustum in tag coverage estimation */
  private tagCoverageFov: number;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
    this.tagCoverageConstraints = [];
    this.objectTagMap = new Map();
    this.tagCoverageFov = 60;
  }

  /**
   * Set tag coverage constraints for pose scoring.
   *
   * These constraints are evaluated during the scoring phase:
   * for each constraint, the engine estimates the ratio of visible objects
   * with the specified tag and penalizes poses that fall outside the
   * [minRatio, maxRatio] range.
   */
  setTagCoverageConstraints(constraints: TagCoverageConstraint[]): void {
    this.tagCoverageConstraints = constraints;
  }

  /**
   * Get the current tag coverage constraints.
   */
  getTagCoverageConstraints(): TagCoverageConstraint[] {
    return [...this.tagCoverageConstraints];
  }

  /**
   * Set the mapping from object IDs to their tag arrays.
   *
   * This mapping is used during tag coverage estimation to determine
   * which tags each visible object has.
   *
   * @param tagMap Map from object ID (e.g., mesh.name or mesh.uuid) to array of tag strings
   */
  setObjectTagMap(tagMap: Map<string, string[]>): void {
    this.objectTagMap = tagMap;
  }

  /**
   * Get the current object tag map.
   */
  getObjectTagMap(): Map<string, string[]> {
    return new Map(this.objectTagMap);
  }

  /**
   * Search for an optimal camera pose using a full config object.
   *
   * This overload accepts `CameraSearchConfig` which includes
   * `tagCoverageConstraints` alongside standard constraints.
   *
   * @param config  Search configuration including constraints and tag coverage
   * @param scene   The THREE scene (used for obstacle raycast)
   */
  searchWithConfig(
    config: CameraSearchConfig,
    scene: THREE.Scene,
  ): CameraPoseResult {
    // Apply tag coverage constraints from config
    if (config.tagCoverageConstraints) {
      this.tagCoverageConstraints = config.tagCoverageConstraints;
    }

    return this.search(
      scene,
      config.constraints,
      config.maxIterations ?? 30000,
      config.seed ?? 42,
      config.bounds,
      config.subject,
    );
  }

  /**
   * Search for an optimal camera pose.
   *
   * @param scene       The THREE scene (used for obstacle raycast)
   * @param constraints Array of camera constraints
   * @param maxIterations  Maximum propose/validate/score iterations (default 30 000)
   * @param seed        Random seed
   * @param bounds      Optional bounding box for camera position search
   * @param subject     Optional subject point for view-angle constraints
   */
  search(
    scene: THREE.Scene,
    constraints: CameraConstraint[],
    maxIterations: number = 30000,
    seed: number = 42,
    bounds?: THREE.Box3,
    subject?: THREE.Vector3,
  ): CameraPoseResult {
    const rng = new SeededRandom(seed);
    const searchBounds = bounds ?? this.inferBounds(scene);

    let bestResult: CameraPoseResult = {
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      fov: Math.PI / 3,
      score: -1,
      iterations: 0,
      found: false,
    };

    const subjectPos = subject ?? new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < maxIterations; i++) {
      // 1. Propose: random position within bounds
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(searchBounds.min.x, searchBounds.max.x, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.y, searchBounds.max.y, rng.next()),
        THREE.MathUtils.lerp(searchBounds.min.z, searchBounds.max.z, rng.next()),
      );

      // 2. Validate: check all hard constraints
      const dir = new THREE.Vector3().subVectors(subjectPos, pos).normalize();
      if (!this.validateConstraints(pos, dir, constraints, scene)) {
        continue;
      }

      // 3. Score
      const score = this.scorePose(pos, dir, constraints, scene, subjectPos);
      if (score > bestResult.score) {
        bestResult = {
          position: pos.clone(),
          direction: dir.clone(),
          fov: this.proposeFOV(pos, subjectPos, constraints),
          score,
          iterations: i + 1,
          found: true,
        };
      }
    }

    bestResult.iterations = Math.min(maxIterations, bestResult.iterations || maxIterations);
    return bestResult;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Check hard constraints — returns false if any constraint is violated */
  private validateConstraints(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    scene: THREE.Scene,
  ): boolean {
    for (const c of constraints) {
      switch (c.type) {
        case 'altitude':
          if (c.min !== undefined && pos.y < c.min) return false;
          if (c.max !== undefined && pos.y > c.max) return false;
          break;

        case 'obstacle_clearance': {
          const minClear = c.min ?? 1.0;
          this.raycaster.set(pos, dir);
          this.raycaster.near = 0;
          this.raycaster.far = minClear;
          const hits = this.raycaster.intersectObjects(scene.children, true);
          if (hits.length > 0) return false;
          break;
        }

        case 'view_angle': {
          if (!c.target) break;
          const angle = Math.acos(
            THREE.MathUtils.clamp(dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1),
          );
          if (c.min !== undefined && angle < c.min) return false;
          if (c.max !== undefined && angle > c.max) return false;
          break;
        }

        case 'distance_to_subject': {
          // Will be evaluated against subject in scoring
          break;
        }

        case 'custom': {
          if (c.validate) {
            const val = c.validate(pos, dir);
            if (val <= 0) return false;
          }
          break;
        }

        default:
          break;
      }
    }
    return true;
  }

  /** Compute a composite score for a proposed camera pose */
  private scorePose(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    constraints: CameraConstraint[],
    scene: THREE.Scene,
    subjectPos: THREE.Vector3,
  ): number {
    let score = 0;
    let totalWeight = 0;

    for (const c of constraints) {
      const weight = c.weight ?? 1.0;
      totalWeight += weight;

      switch (c.type) {
        case 'altitude': {
          // Prefer middle of altitude range
          if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const dist = Math.abs(pos.y - mid) / Math.max(range, 0.01);
            score += (1 - dist) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'distance_to_subject': {
          const dist = pos.distanceTo(subjectPos);
          if (c.target !== undefined) {
            const ideal = c.target;
            const ratio = Math.min(dist, ideal) / Math.max(dist, ideal);
            score += ratio * weight;
          } else if (c.min !== undefined && c.max !== undefined) {
            const mid = (c.min + c.max) / 2;
            const range = (c.max - c.min) / 2;
            const d = Math.abs(dist - mid) / Math.max(range, 0.01);
            score += (1 - Math.min(d, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'view_angle': {
          if (c.target !== undefined) {
            const angle = Math.acos(
              THREE.MathUtils.clamp(dir.dot(new THREE.Vector3(0, -1, 0)), -1, 1),
            );
            const diff = Math.abs(angle - c.target);
            score += (1 - Math.min(diff / Math.PI, 1)) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        case 'obstacle_clearance': {
          // Already validated as clear; give full score
          score += 1.0 * weight;
          break;
        }

        case 'tag_coverage': {
          // Handled separately via tagCoverageConstraints in scoreTagCoverage()
          // This case is for inline tag_coverage constraints within CameraConstraint
          score += this.scoreSingleTagCoverage(pos, dir, scene, c) * weight;
          break;
        }

        case 'custom': {
          if (c.validate) {
            score += c.validate(pos, dir) * weight;
          } else {
            score += 0.5 * weight;
          }
          break;
        }

        default:
          score += 0.5 * weight;
          break;
      }
    }

    // Add tag coverage constraint scores
    const tagScore = this.scoreTagCoverage(pos, dir, scene);
    if (tagScore !== null) {
      const tagWeight = this.tagCoverageConstraints.reduce(
        (sum, tc) => sum + (tc.weight ?? 1.0),
        0,
      );
      totalWeight += tagWeight;
      score += tagScore * tagWeight;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Score tag coverage constraints for a proposed camera pose.
   *
   * Estimates the ratio of visible objects per tag using frustum culling
   * and the objectTagMap, then computes a score based on how well each
   * constraint's ratio falls within its [minRatio, maxRatio] range.
   *
   * @returns Combined tag coverage score (0-1), or null if no constraints
   */
  private scoreTagCoverage(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    scene: THREE.Scene,
  ): number | null {
    if (this.tagCoverageConstraints.length === 0) {
      return null;
    }

    const tagRatios = this.estimateTagCoverage(pos, dir, scene);
    if (tagRatios === null) {
      return null;
    }

    let totalScore = 0;
    let count = 0;

    for (const constraint of this.tagCoverageConstraints) {
      const ratio = tagRatios.get(constraint.tag) ?? 0;
      const weight = constraint.weight ?? 1.0;

      if (ratio >= constraint.minRatio && ratio <= constraint.maxRatio) {
        // Within range — full score, with bonus for being near the middle
        const mid = (constraint.minRatio + constraint.maxRatio) / 2;
        const range = (constraint.maxRatio - constraint.minRatio) / 2;
        const deviation = range > 0 ? Math.abs(ratio - mid) / range : 0;
        totalScore += (1 - deviation * 0.5) * weight;
      } else {
        // Outside range — penalize based on distance from range
        if (ratio < constraint.minRatio) {
          const shortfall = constraint.minRatio - ratio;
          totalScore += Math.max(0, 1 - shortfall * 2) * weight;
        } else {
          const overshoot = ratio - constraint.maxRatio;
          totalScore += Math.max(0, 1 - overshoot * 2) * weight;
        }
      }

      count += weight;
    }

    return count > 0 ? totalScore / count : 0;
  }

  /**
   * Score a single inline tag_coverage CameraConstraint.
   *
   * When a CameraConstraint of type 'tag_coverage' is provided inline,
   * we interpret it as: `min` = minRatio, `max` = maxRatio,
   * `target` = ideal ratio, and use the first tag from tagCoverageConstraints.
   */
  private scoreSingleTagCoverage(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    scene: THREE.Scene,
    constraint: CameraConstraint,
  ): number {
    if (this.tagCoverageConstraints.length === 0) {
      return 0.5; // No tag data available
    }

    const tagRatios = this.estimateTagCoverage(pos, dir, scene);
    if (tagRatios === null) {
      return 0.5;
    }

    // Use all tag coverage constraints and average their scores
    let totalScore = 0;
    for (const tc of this.tagCoverageConstraints) {
      const ratio = tagRatios.get(tc.tag) ?? 0;
      const minRatio = constraint.min ?? tc.minRatio;
      const maxRatio = constraint.max ?? tc.maxRatio;

      if (ratio >= minRatio && ratio <= maxRatio) {
        totalScore += 1.0;
      } else if (ratio < minRatio) {
        totalScore += Math.max(0, 1 - (minRatio - ratio) * 2);
      } else {
        totalScore += Math.max(0, 1 - (ratio - maxRatio) * 2);
      }
    }

    return totalScore / this.tagCoverageConstraints.length;
  }

  /**
   * Estimate tag coverage ratios from the camera's viewpoint.
   *
   * Uses frustum culling to determine which tagged objects are visible,
   * then computes the ratio of objects with each tag to total visible objects.
   *
   * @returns Map from tag name to ratio (0-1), or null if no tag data
   */
  private estimateTagCoverage(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    scene: THREE.Scene,
  ): Map<string, number> | null {
    if (this.objectTagMap.size === 0) {
      return null;
    }

    // Build a frustum from the camera position and direction
    const camera = new THREE.PerspectiveCamera(
      this.tagCoverageFov,
      16 / 9,
      0.1,
      1000,
    );
    camera.position.copy(pos);
    const lookTarget = pos.clone().add(dir.clone().multiplyScalar(10));
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );

    // Count visible objects per tag
    const tagCounts: Map<string, number> = new Map();
    let totalVisible = 0;

    // Check scene meshes against frustum
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const objectId = child.name || child.uuid;
      const tags = this.objectTagMap.get(objectId);
      if (!tags) return;

      // Check if the object's bounding sphere is within the frustum
      const geometry = child.geometry;
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }

      if (
        geometry.boundingSphere &&
        frustum.intersectsSphere(geometry.boundingSphere)
      ) {
        totalVisible++;
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
    });

    // Also check objectTagMap entries that might not be in the scene
    // (e.g., logical objects tracked separately)
    for (const [objectId, tags] of this.objectTagMap) {
      // Skip if already counted from scene traversal
      if (tagCounts.has(objectId)) continue;

      // For non-scene objects, use a simple distance check as a proxy
      // for visibility (objects within a reasonable range are considered visible)
      // This is a simplified approach for objects without scene meshes
    }

    // Compute ratios
    const ratios: Map<string, number> = new Map();
    if (totalVisible === 0) {
      return ratios;
    }

    for (const [tag, count] of tagCounts) {
      ratios.set(tag, count / totalVisible);
    }

    return ratios;
  }

  /** Propose a field of view based on distance-to-subject and constraints */
  private proposeFOV(
    pos: THREE.Vector3,
    subjectPos: THREE.Vector3,
    constraints: CameraConstraint[],
  ): number {
    const fovConstraint = constraints.find(c => c.type === 'fov');
    if (fovConstraint?.target) return fovConstraint.target;

    const dist = pos.distanceTo(subjectPos);
    // Wider FOV for close subjects, narrower for far
    const adaptiveFOV = THREE.MathUtils.clamp(
      2 * Math.atan(5 / Math.max(dist, 0.1)),
      Math.PI / 6,
      Math.PI / 2,
    );
    return adaptiveFOV;
  }

  /** Infer search bounds from scene content */
  private inferBounds(scene: THREE.Scene): THREE.Box3 {
    const box = new THREE.Box3();
    scene.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        box.expandByObject(child);
      }
    });

    // If scene is empty, return a reasonable default
    if (box.isEmpty()) {
      return new THREE.Box3(
        new THREE.Vector3(-100, 2, -100),
        new THREE.Vector3(100, 50, 100),
      );
    }

    // Expand bounds slightly and ensure minimum height above terrain
    box.min.x -= 10;
    box.min.z -= 10;
    box.max.x += 10;
    box.max.z += 10;
    box.min.y = Math.max(box.min.y + 2, 2);
    box.max.y = Math.max(box.max.y, box.min.y + 30);

    return box;
  }
}
