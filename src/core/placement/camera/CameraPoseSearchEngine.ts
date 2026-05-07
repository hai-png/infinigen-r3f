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
  type: 'altitude' | 'obstacle_clearance' | 'view_angle' | 'distance_to_subject' | 'fov' | 'custom';
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
 */
export class CameraPoseSearchEngine {
  private raycaster: THREE.Raycaster;

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
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
    _scene: THREE.Scene,
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

    return totalWeight > 0 ? score / totalWeight : 0;
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
