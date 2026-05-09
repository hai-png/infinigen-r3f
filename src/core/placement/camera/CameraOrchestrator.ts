/**
 * CameraOrchestrator — Unified camera placement and composition system
 *
 * Combines three previously separate camera subsystems:
 *   - CameraSystem — Camera placement with constraints
 *   - CameraPoseProposer — Candidate camera position generation
 *   - CameraPoseSearchEngine — Iterative pose search with validation/scoring
 *
 * The orchestrator provides a single API for:
 *   - Finding optimal camera positions (search-based)
 *   - Generating candidate poses for composition scoring
 *   - Creating camera trajectories for animation
 *   - Managing camera types and properties
 *
 * @module placement/camera
 */

import * as THREE from 'three';
import {
  CameraPoseSearchEngine,
  type CameraConstraint,
  type CameraPoseResult,
} from './CameraPoseSearchEngine';
import {
  CameraPoseProposer,
  type CameraPoseProposerConfig,
  type CameraPose,
  DEFAULT_POSE_PROPOSER_CONFIG,
} from './CameraPoseProposer';
import { CameraRegistry } from './CameraRegistry';
import type {
  CameraProperties,
  FilmFormat,
} from './CameraProperties';
import {
  DEFAULT_CAMERA_PROPERTIES,
  calculateHorizontalFOV,
  SENSOR_DIMENSIONS,
} from './CameraProperties';
import type {
  CameraType,
  ShotSize,
  CameraAngle,
  CameraMovement,
  CameraPlacementConfig,
  TrajectoryConfig,
  TrajectoryKeyframe,
} from './CameraSystem';
import {
  SHOT_SIZE_DISTANCES,
  CAMERA_ANGLE_ELEVATIONS,
  calculateOptimalPosition,
  generateTrajectoryKeyframes,
} from './CameraSystem';

// ============================================================================
// Types
// ============================================================================

/** Result of trajectory validation */
export interface TrajectoryValidationResult {
  /** Whether all segments are obstacle-free */
  valid: boolean;
  /** Indices of segments (between consecutive point pairs) where
   *  the ray hit an obstacle. Segment i connects points[i] → points[i+1]. */
  invalidSegments: number[];
}

export interface CameraOrchestratorConfig {
  /** Search method: 'search' for iterative search, 'propose' for candidate generation */
  method: 'search' | 'propose';
  /** Search engine config (when method='search') */
  searchConstraints?: CameraConstraint[];
  /** Proposer config (when method='propose') */
  proposerConfig?: Partial<CameraPoseProposerConfig>;
  /** Maximum search iterations */
  maxIterations?: number;
  /** Random seed */
  seed?: number;
  /** Optional bounds for camera position search */
  bounds?: THREE.Box3;
  /** Optional subject point for view-angle constraints */
  subject?: THREE.Vector3;
  /** Camera properties to apply to the result */
  cameraProperties?: Partial<CameraProperties>;
  /** Placement config for optimal position calculation */
  placementConfig?: CameraPlacementConfig;
  /** Desired shot size */
  shotSize?: ShotSize;
  /** Desired camera angle */
  cameraAngle?: CameraAngle;
}

export interface CameraOrchestratorResult {
  /** Best camera position */
  position: THREE.Vector3;
  /** Camera look-at direction or target */
  direction: THREE.Vector3;
  /** Target point the camera looks at */
  target: THREE.Vector3;
  /** Field of view in radians */
  fovRad: number;
  /** Field of view in degrees */
  fovDeg: number;
  /** Quality score (0-1) */
  score: number;
  /** Camera properties */
  properties: CameraProperties;
  /** Method used */
  method: 'search' | 'propose';
  /** Number of candidates evaluated */
  candidatesEvaluated: number;
  /** Whether a valid pose was found */
  found: boolean;
}

// ============================================================================
// CameraOrchestrator
// ============================================================================

export class CameraOrchestrator {
  private searchEngine: CameraPoseSearchEngine;
  private proposer: CameraPoseProposer;
  private registry: CameraRegistry;
  private scene: THREE.Scene | null = null;
  private raycaster: THREE.Raycaster;

  constructor() {
    this.searchEngine = new CameraPoseSearchEngine();
    this.proposer = new CameraPoseProposer();
    this.registry = new CameraRegistry();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = 1000;
  }

  /**
   * Set the scene for obstacle raycast and visibility checks.
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  /**
   * Find the optimal camera position using the configured method.
   */
  findCamera(config: CameraOrchestratorConfig): CameraOrchestratorResult {
    if (config.method === 'search') {
      return this.searchForCamera(config);
    } else {
      return this.proposeForCamera(config);
    }
  }

  /**
   * Use iterative search engine to find optimal camera position.
   */
  private searchForCamera(config: CameraOrchestratorConfig): CameraOrchestratorResult {
    if (!this.scene) {
      throw new Error('[CameraOrchestrator] Scene not set. Call setScene() first.');
    }

    const result: CameraPoseResult = this.searchEngine.search(
      this.scene,
      config.searchConstraints ?? [],
      config.maxIterations ?? 30000,
      config.seed ?? 42,
      config.bounds,
      config.subject,
    );

    const fovRad = result.fov;
    const fovDeg = fovRad * (180 / Math.PI);
    const subject = config.subject ?? new THREE.Vector3(0, 0, 0);

    return {
      position: result.position,
      direction: result.direction,
      target: result.position.clone().add(result.direction.clone().multiplyScalar(10)),
      fovRad,
      fovDeg,
      score: result.score,
      properties: this.buildProperties(config.cameraProperties, fovDeg),
      method: 'search',
      candidatesEvaluated: result.iterations,
      found: result.found,
    };
  }

  /**
   * Use candidate generation to propose camera positions.
   */
  private proposeForCamera(config: CameraOrchestratorConfig): CameraOrchestratorResult {
    if (config.proposerConfig) {
      this.proposer = new CameraPoseProposer(config.proposerConfig);
    }

    const poses: CameraPose[] = this.proposer.propose();
    if (poses.length === 0) {
      const defaultFovDeg = 60;
      return {
        position: new THREE.Vector3(0, 10, 0),
        direction: new THREE.Vector3(0, 0, -1),
        target: new THREE.Vector3(0, 5, -10),
        fovRad: defaultFovDeg * (Math.PI / 180),
        fovDeg: defaultFovDeg,
        score: 0,
        properties: this.buildProperties(config.cameraProperties, defaultFovDeg),
        method: 'propose',
        candidatesEvaluated: 0,
        found: false,
      };
    }

    // Pick the highest-scoring pose
    const best = poses.reduce((a, b) => (a.score > b.score ? a : b));
    const direction = new THREE.Vector3()
      .subVectors(best.target, best.position)
      .normalize();
    const fovDeg = best.fov; // CameraPose.fov is already in degrees
    const fovRad = fovDeg * (Math.PI / 180);

    return {
      position: best.position,
      direction,
      target: best.target,
      fovRad,
      fovDeg,
      score: best.score,
      properties: this.buildProperties(config.cameraProperties, fovDeg, best.focalLength, best.fStop),
      method: 'propose',
      candidatesEvaluated: poses.length,
      found: true,
    };
  }

  /**
   * Calculate an optimal camera position using composition rules.
   * Uses CameraSystem.calculateOptimalPosition internally.
   */
  findOptimalPosition(
    subjectPosition: THREE.Vector3,
    subjectDirection: THREE.Vector3,
    config: CameraPlacementConfig,
  ): THREE.Vector3 {
    return calculateOptimalPosition(subjectPosition, subjectDirection, config);
  }

  /**
   * Generate trajectory keyframes for a camera movement.
   * Uses CameraSystem.generateTrajectoryKeyframes internally.
   */
  generateKeyframes(
    config: TrajectoryConfig,
    startPosition: THREE.Vector3,
    startTarget: THREE.Vector3,
  ): TrajectoryKeyframe[] {
    return generateTrajectoryKeyframes(config, startPosition, startTarget);
  }

  /**
   * Create a trajectory animation for the camera using the registry.
   */
  createTrajectory(
    type: string,
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number = 5,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const generator = this.registry.getTrajectory(type);
    if (!generator) {
      // Fallback: linear interpolation
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        points.push(new THREE.Vector3().lerpVectors(startPos, endPos, eased));
      }
      return points;
    }
    return generator.generate(startPos, endPos, duration, options);
  }

  /**
   * Get the camera registry for trajectory management.
   */
  getRegistry(): CameraRegistry {
    return this.registry;
  }

  /**
   * Get the search engine for direct access.
   */
  getSearchEngine(): CameraPoseSearchEngine {
    return this.searchEngine;
  }

  /**
   * Get the proposer for direct access.
   */
  getProposer(): CameraPoseProposer {
    return this.proposer;
  }

  // ==========================================================================
  // Trajectory Validation
  // ==========================================================================

  /**
   * Validate a trajectory by raycasting between consecutive point pairs.
   *
   * Ports the original Infinigen freespace ray-check validation between
   * keyframes. For each consecutive pair of points, a ray is cast from
   * point[i] toward point[i+1]. If the ray hits an obstacle before
   * reaching the next point, that segment is marked as invalid.
   *
   * @param points Array of trajectory points (at least 2)
   * @param scene  The scene to raycast against (uses this.scene if not provided)
   * @returns Validation result with list of invalid segment indices
   */
  validateTrajectory(
    points: THREE.Vector3[],
    scene?: THREE.Scene,
  ): TrajectoryValidationResult {
    const targetScene = scene ?? this.scene;
    if (!targetScene) {
      throw new Error(
        '[CameraOrchestrator] No scene available for validation. ' +
          'Call setScene() first or pass a scene argument.',
      );
    }

    if (points.length < 2) {
      // A single point or empty trajectory is trivially valid
      return { valid: true, invalidSegments: [] };
    }

    const invalidSegments: number[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const direction = new THREE.Vector3().subVectors(end, start);
      const distance = direction.length();

      if (distance < 1e-6) {
        // Coincident points — skip (not a real segment)
        continue;
      }

      direction.normalize();

      // Cast a ray from start toward end
      this.raycaster.set(start, direction);
      this.raycaster.near = 0.1; // avoid self-intersection
      this.raycaster.far = distance; // only check up to the next point

      const hits = this.raycaster.intersectObjects(targetScene.children, true);

      if (hits.length > 0) {
        // An obstacle was hit between these two points
        invalidSegments.push(i);
      }
    }

    return {
      valid: invalidSegments.length === 0,
      invalidSegments,
    };
  }

  /**
   * Build CameraProperties from config overrides and computed FOV.
   *
   * Merges user-provided overrides with DEFAULT_CAMERA_PROPERTIES from
   * CameraProperties.ts, optionally setting focalLength and fStop from
   * the proposer result.
   */
  private buildProperties(
    overrides?: Partial<CameraProperties>,
    fovDeg?: number,
    focalLength?: number,
    fStop?: number,
  ): CameraProperties {
    const base = { ...DEFAULT_CAMERA_PROPERTIES };

    // If focalLength is provided (from proposer), derive FOV from it
    if (focalLength !== undefined) {
      base.focalLength = focalLength;
    }

    // If fStop is provided (from proposer), use it
    if (fStop !== undefined) {
      base.fStop = fStop;
    }

    // Merge overrides
    const props = { ...base, ...overrides };

    // If no focalLength was set via overrides or proposer, compute from FOV
    if (fovDeg !== undefined && focalLength === undefined && !overrides?.focalLength) {
      // Reverse-calculate focal length from horizontal FOV
      const sensorWidth =
        overrides?.sensorWidth ??
        SENSOR_DIMENSIONS[base.filmFormat]?.width ??
        36;
      props.focalLength = sensorWidth / (2 * Math.tan((fovDeg * Math.PI) / 360));
    }

    return props;
  }
}
