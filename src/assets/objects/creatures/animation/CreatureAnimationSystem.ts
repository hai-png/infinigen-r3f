/**
 * CreatureAnimationSystem.ts — P1 Creature Animation: Floor Snapping, NURBS Path Run Cycles, Wiggle Animation
 *
 * Implements five core systems for procedural creature animation:
 *
 * 1. FloorSnapper   — Raycast-based floor snapping for grounding feet on terrain
 * 2. NURBSPathFollower — NURBS curve path following with run cycle generation
 * 3. WiggleAnimator — Sinusoidal lateral displacement for fish/snakes/eels
 * 4. GaitSystem     — Gait pattern generation (walk, trot, gallop, biped, tripod, swim, slither)
 * 5. IKRig          — Analytical 2-joint IK + FABRIK spine IK + floor constraints
 *
 * All classes produce THREE.AnimationClip instances compatible with THREE.AnimationMixer.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { findKnotSpan, evaluateBasis } from '../nurbs/NURBSSurface';

// ============================================================================
// FloorSnapper — Terrain-aware foot grounding
// ============================================================================

/**
 * Configuration for floor snapping behavior.
 */
export interface FloorSnapConfig {
  /** Direction to cast rays (default: -Y / downward) */
  snapDirection: THREE.Vector3;
  /** Maximum ray distance to search for terrain (default: 10) */
  maxRayDistance: number;
  /** Vertical offset above terrain surface (default: 0 — foot sits on terrain) */
  offsetPadding: number;
  /** Names of foot joints to snap (supports regex-like matching) */
  footJointNames: string[];
  /** Whether to propagate height adjustment to hips/head via IK chain */
  propagateToBody: boolean;
  /** Body center averaging method: 'average' or 'min' of foot heights */
  bodyHeightMethod: 'average' | 'min';
}

/** Default floor snap configuration */
export const DEFAULT_FLOOR_SNAP_CONFIG: FloorSnapConfig = {
  snapDirection: new THREE.Vector3(0, -1, 0),
  maxRayDistance: 10,
  offsetPadding: 0,
  footJointNames: ['foot', 'hand', 'tarsus'],
  propagateToBody: true,
  bodyHeightMethod: 'average',
};

/**
 * Result of a floor snap operation.
 */
export interface SnapResult {
  /** Per-foot snap results: joint name → adjusted world position */
  footPositions: Map<string, THREE.Vector3>;
  /** Body center height after averaging foot heights */
  bodyCenterY: number;
  /** Total vertical offset applied to the creature group */
  verticalOffset: number;
  /** Whether any feet failed to find terrain */
  hasUnsnappedFeet: boolean;
}

/**
 * FloorSnapper — Snaps creature feet to terrain surface using raycasting.
 *
 * Casts rays downward from each foot joint and adjusts positions to terrain.
 * Propagates the offset to the body center (hip/head/tail) via IK chain
 * so the entire creature stays grounded on uneven terrain.
 *
 * Usage:
 * ```ts
 * const snapper = new FloorSnapper();
 * const result = snapper.snapToFloor(creatureGroup, terrainBVH, config);
 * ```
 */
export class FloorSnapper {
  private raycaster: THREE.Raycaster;

  constructor() {
    this.raycaster = new THREE.Raycaster();
  }

  /**
   * Snap a creature's feet to the floor using BVH raycast.
   *
   * @param creatureGroup - The creature's Object3D group containing the skeleton
   * @param terrainBVH - The terrain mesh or BVH structure for raycasting
   * @param config - Snap configuration
   * @returns Snap result with adjusted foot positions and body center
   */
  snapToFloor(
    creatureGroup: THREE.Object3D,
    terrainBVH: THREE.Object3D | THREE.Mesh,
    config: Partial<FloorSnapConfig> = {},
  ): SnapResult {
    const cfg: FloorSnapConfig = { ...DEFAULT_FLOOR_SNAP_CONFIG, ...config };
    const result: SnapResult = {
      footPositions: new Map(),
      bodyCenterY: 0,
      verticalOffset: 0,
      hasUnsnappedFeet: false,
    };

    // Find foot joints in the creature group
    const footJoints = this.findFootJoints(creatureGroup, cfg.footJointNames);
    if (footJoints.length === 0) {
      return result;
    }

    const footHeights: number[] = [];
    this.raycaster.far = cfg.maxRayDistance;

    for (const joint of footJoints) {
      // Get the world position of the foot joint
      const worldPos = new THREE.Vector3();
      joint.getWorldPosition(worldPos);

      // Set ray origin slightly above the joint and cast downward
      const rayOrigin = worldPos.clone().sub(cfg.snapDirection.clone().multiplyScalar(-0.1));
      this.raycaster.set(rayOrigin, cfg.snapDirection);

      // Cast ray against terrain
      const intersects = this.raycaster.intersectObject(terrainBVH, true);

      if (intersects.length > 0) {
        const terrainPoint = intersects[0].point;
        const adjustedPos = terrainPoint.clone().add(
          cfg.snapDirection.clone().multiplyScalar(-cfg.offsetPadding),
        );
        result.footPositions.set(joint.name, adjustedPos);
        footHeights.push(adjustedPos.y);
      } else {
        // No terrain found — keep current position
        result.footPositions.set(joint.name, worldPos.clone());
        footHeights.push(worldPos.y);
        result.hasUnsnappedFeet = true;
      }
    }

    // Compute body center height
    if (footHeights.length > 0) {
      if (cfg.bodyHeightMethod === 'min') {
        result.bodyCenterY = Math.min(...footHeights);
      } else {
        result.bodyCenterY = footHeights.reduce((a, b) => a + b, 0) / footHeights.length;
      }
    }

    // Propagate height offset to body center
    if (cfg.propagateToBody && footHeights.length > 0) {
      const currentBodyY = creatureGroup.position.y;
      result.verticalOffset = result.bodyCenterY - currentBodyY;
      creatureGroup.position.y = result.bodyCenterY;
    }

    return result;
  }

  /**
   * Batch snap all creatures using a height sampler function.
   * Simpler API for heightmap terrain where a full BVH isn't available.
   *
   * @param creatures - Array of creature groups to snap
   * @param terrainHeightSampler - Function that returns terrain height at (x, z)
   */
  snapAllCreatures(
    creatures: THREE.Object3D[],
    terrainHeightSampler: (x: number, z: number) => number,
  ): void {
    for (const creature of creatures) {
      const pos = creature.position;
      const terrainY = terrainHeightSampler(pos.x, pos.z);
      creature.position.y = terrainY;
    }
  }

  /**
   * Create a bilinear interpolation height sampler from terrain height data.
   *
   * @param heightData - 1D array of height values (row-major)
   * @param dimensions - { width, height } of the height grid
   * @param bounds - Optional world-space bounds { minX, maxX, minZ, maxZ }
   * @returns A function that returns interpolated height at any (x, z)
   */
  static createTerrainHeightSampler(
    heightData: Float32Array | number[],
    dimensions: { width: number; height: number },
    bounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): (x: number, z: number) => number {
    const { width, height } = dimensions;
    const minX = bounds?.minX ?? 0;
    const maxX = bounds?.maxX ?? width - 1;
    const minZ = bounds?.minZ ?? 0;
    const maxZ = bounds?.maxZ ?? height - 1;

    return (x: number, z: number): number => {
      // Map world coords to grid coords
      const gx = ((x - minX) / (maxX - minX)) * (width - 1);
      const gz = ((z - minZ) / (maxZ - minZ)) * (height - 1);

      // Clamp to grid bounds
      const cx = Math.max(0, Math.min(width - 2, Math.floor(gx)));
      const cz = Math.max(0, Math.min(height - 2, Math.floor(gz)));

      // Fractional parts
      const fx = gx - cx;
      const fz = gz - cz;

      // Bilinear interpolation
      const i00 = heightData[cz * width + cx];
      const i10 = heightData[cz * width + cx + 1];
      const i01 = heightData[(cz + 1) * width + cx];
      const i11 = heightData[(cz + 1) * width + cx + 1];

      const top = i00 * (1 - fx) + i10 * fx;
      const bottom = i01 * (1 - fx) + i11 * fx;

      return top * (1 - fz) + bottom * fz;
    };
  }

  /**
   * Find foot joints in a creature group by name pattern.
   */
  private findFootJoints(
    group: THREE.Object3D,
    namePatterns: string[],
  ): THREE.Bone[] {
    const joints: THREE.Bone[] = [];

    group.traverse((child) => {
      if (child instanceof THREE.Bone) {
        const nameLower = child.name.toLowerCase();
        for (const pattern of namePatterns) {
          if (nameLower.includes(pattern.toLowerCase())) {
            joints.push(child);
            break;
          }
        }
      }
    });

    return joints;
  }
}

// ============================================================================
// NURBSPathFollower — NURBS curve path following + run cycle generation
// ============================================================================

/**
 * Configuration for path following behavior.
 */
export interface PathFollowConfig {
  /** Banking amount on turns (0 = no banking, 1 = full banking) */
  bankAmount: number;
  /** Height offset above the path */
  heightOffset: number;
  /** Whether to orient the creature along the path tangent */
  orientAlongPath: boolean;
  /** Smoothing factor for orientation (0 = instant, 1 = very smooth) */
  orientationSmoothing: number;
}

/** Default path follow configuration */
export const DEFAULT_PATH_FOLLOW_CONFIG: PathFollowConfig = {
  bankAmount: 0.3,
  heightOffset: 0,
  orientAlongPath: true,
  orientationSmoothing: 0.1,
};

/**
 * Foot path generation configuration.
 */
export interface FootPathConfig {
  /** Step length along the body path */
  stepLength: number;
  /** Lateral offset from body center for each foot */
  footOffset: number;
  /** Maximum foot lift height during swing phase */
  liftHeight: number;
  /** Number of points per step arc */
  arcResolution: number;
}

/** Default foot path configuration */
export const DEFAULT_FOOT_PATH_CONFIG: FootPathConfig = {
  stepLength: 0.4,
  footOffset: 0.15,
  liftHeight: 0.08,
  arcResolution: 8,
};

/**
 * NURBSPathFollower — Creates NURBS curves for creature path following
 * and generates run cycle animation clips.
 *
 * Provides:
 * - NURBS curve creation from control points
 * - Foot lift-place path generation from body center path
 * - Smooth body path generation through waypoints
 * - Path following with orientation and banking
 * - Full run cycle clip generation with gait phase offsets
 *
 * Usage:
 * ```ts
 * const follower = new NURBSPathFollower();
 * const path = follower.createNURBSCurve(controlPoints, weights, knots);
 * const clip = follower.createRunCycleClip(path, legJoints, 1.0, 30);
 * ```
 */
export class NURBSPathFollower {
  /**
   * Create a NURBS curve from control points with proper knot vector.
   *
   * @param controlPoints - Array of 3D control points
   * @param weights - Optional weights for each control point (default: all 1)
   * @param knots - Optional knot vector (auto-generated if not provided)
   * @returns THREE.CurvePath containing the NURBS curve
   */
  createNURBSCurve(
    controlPoints: THREE.Vector3[],
    weights?: number[],
    knots?: number[],
  ): THREE.CurvePath<THREE.Vector3> {
    const degree = Math.min(3, controlPoints.length - 1);
    const n = controlPoints.length;
    const w = weights ?? new Array(n).fill(1.0);
    const curvePath = new THREE.CurvePath<THREE.Vector3>();

    // Build NURBS curve using a custom curve class
    const nurbsCurve = new NURBSCurve(controlPoints, w, degree, knots);
    curvePath.add(nurbsCurve);

    return curvePath;
  }

  /**
   * Generate foot lift-place paths from a body center path.
   *
   * Each step: lift foot, arc forward, place down.
   * Foot trajectory uses parabolic arc for the lift phase.
   *
   * @param bodyPath - The NURBS body center path
   * @param config - Foot path configuration
   * @returns Array of foot position curves (one per step)
   */
  generateFootPath(
    bodyPath: THREE.CurvePath<THREE.Vector3>,
    config: Partial<FootPathConfig> = {},
  ): THREE.CurvePath<THREE.Vector3>[] {
    const cfg: FootPathConfig = { ...DEFAULT_FOOT_PATH_CONFIG, ...config };
    const totalLength = bodyPath.getLength();
    const stepCount = Math.max(1, Math.floor(totalLength / cfg.stepLength));
    const footPaths: THREE.CurvePath<THREE.Vector3>[] = [];

    for (let step = 0; step < stepCount; step++) {
      const startT = step / stepCount;
      const endT = (step + 1) / stepCount;

      const startPos = bodyPath.getPointAt(startT);
      const endPos = bodyPath.getPointAt(Math.min(endT, 1.0));
      const startTangent = bodyPath.getTangentAt(startT);
      const endTangent = bodyPath.getTangentAt(Math.min(endT, 1.0));

      // Compute lateral offset (perpendicular to path tangent)
      const up = new THREE.Vector3(0, 1, 0);
      const lateral = new THREE.Vector3().crossVectors(startTangent, up).normalize();

      // Generate arc points for the foot trajectory
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= cfg.arcResolution; i++) {
        const t = i / cfg.arcResolution;
        // Interpolate position along path
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        // Add lateral offset
        pos.add(lateral.clone().multiplyScalar(cfg.footOffset));
        // Parabolic arc for lift height
        const lift = cfg.liftHeight * 4 * t * (1 - t);
        pos.y += lift;
        points.push(pos);
      }

      // Create a CatmullRom curve through the arc points
      const footCurve = new THREE.CurvePath<THREE.Vector3>();
      if (points.length >= 2) {
        footCurve.add(new THREE.CatmullRomCurve3(points));
      }
      footPaths.push(footCurve);
    }

    return footPaths;
  }

  /**
   * Generate a smooth body path through waypoints using CatmullRom or NURBS.
   *
   * @param waypoints - Array of 3D waypoints to pass through
   * @param smoothing - Smoothing factor (0 = sharp corners, 1 = very smooth)
   * @returns Smooth CurvePath through the waypoints
   */
  generateBodyPathFromWaypoints(
    waypoints: THREE.Vector3[],
    smoothing: number = 0.5,
  ): THREE.CurvePath<THREE.Vector3> {
    if (waypoints.length < 2) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      path.add(new THREE.LineCurve3(
        waypoints[0] ?? new THREE.Vector3(),
        waypoints[waypoints.length - 1] ?? new THREE.Vector3(),
      ));
      return path;
    }

    const curvePath = new THREE.CurvePath<THREE.Vector3>();

    // Use CatmullRom for smooth interpolation through all waypoints
    const tension = 0.5 * (1 - smoothing); // Higher smoothing = lower tension
    const catmullRom = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', tension);
    curvePath.add(catmullRom);

    return curvePath;
  }

  /**
   * Position and orient a creature along a path at parameter t.
   *
   * @param creatureGroup - The creature group to position
   * @param path - The CurvePath to follow
   * @param t - Parameter along the path [0, 1]
   * @param config - Path following configuration
   */
  followPath(
    creatureGroup: THREE.Object3D,
    path: THREE.CurvePath<THREE.Vector3>,
    t: number,
    config: Partial<PathFollowConfig> = {},
  ): void {
    const cfg: PathFollowConfig = { ...DEFAULT_PATH_FOLLOW_CONFIG, ...config };
    const clampedT = Math.max(0, Math.min(1, t));

    // Get position on path
    const position = path.getPointAt(clampedT);
    position.y += cfg.heightOffset;
    creatureGroup.position.copy(position);

    if (cfg.orientAlongPath) {
      // Get tangent for orientation
      const tangent = path.getTangentAt(clampedT);

      // Compute banking on turns
      const lookTarget = position.clone().add(tangent);
      const lookMatrix = new THREE.Matrix4().lookAt(position, lookTarget, new THREE.Vector3(0, 1, 0));
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);

      // Apply banking by rolling into turns
      if (cfg.bankAmount > 0 && clampedT > 0.01 && clampedT < 0.99) {
        const prevTangent = path.getTangentAt(Math.max(0, clampedT - 0.01));
        const curvature = new THREE.Vector3().crossVectors(prevTangent, tangent).y;
        const bankAngle = curvature * cfg.bankAmount * Math.PI * 0.5;
        const bankQuat = new THREE.Quaternion().setFromAxisAngle(tangent, bankAngle);
        targetQuat.multiply(bankQuat);
      }

      // Smooth orientation
      if (cfg.orientationSmoothing > 0) {
        creatureGroup.quaternion.slerp(targetQuat, 1 - cfg.orientationSmoothing);
      } else {
        creatureGroup.quaternion.copy(targetQuat);
      }
    }
  }

  /**
   * Generate a full run cycle animation clip using body path and leg joints.
   *
   * @param bodyPath - The NURBS body center path
   * @param legJoints - Names of leg joint bones (e.g., ['femur_L', 'femur_R', ...])
   * @param duration - Duration of one complete cycle in seconds
   * @param fps - Frames per second for keyframe density
   * @returns Playable AnimationClip with position and rotation tracks
   */
  createRunCycleClip(
    bodyPath: THREE.CurvePath<THREE.Vector3>,
    legJoints: string[],
    duration: number = 1.0,
    fps: number = 30,
  ): THREE.AnimationClip {
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const totalFrames = Math.ceil(duration * fps);
    const dt = duration / totalFrames;

    // Phase offsets for quadruped walk gait
    const legCount = legJoints.length;
    const phaseOffsets = this.computeLegPhaseOffsets(legCount, 'walk');

    // Body position along path
    const posTimes: number[] = [];
    const posX: number[] = [];
    const posY: number[] = [];
    const posZ: number[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = i * dt;
      const pathT = (t / duration) % 1.0;
      const point = bodyPath.getPointAt(pathT);

      posTimes.push(t);
      posX.push(point.x);
      posY.push(point.y);
      posZ.push(point.z);
    }

    tracks.push(new THREE.NumberKeyframeTrack('root.position[x]', posTimes, posX));
    tracks.push(new THREE.NumberKeyframeTrack('root.position[y]', posTimes, posY));
    tracks.push(new THREE.NumberKeyframeTrack('root.position[z]', posTimes, posZ));

    // Body orientation along path
    const rotTimes: number[] = [];
    const rotY: number[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = i * dt;
      const pathT = (t / duration) % 1.0;
      const tangent = bodyPath.getTangentAt(pathT);
      const angle = Math.atan2(tangent.x, tangent.z);

      rotTimes.push(t);
      rotY.push(angle);
    }

    tracks.push(new THREE.NumberKeyframeTrack('root.rotation[y]', rotTimes, rotY));

    // Per-leg swing/stance rotation
    for (let legIdx = 0; legIdx < legCount; legIdx++) {
      const jointName = legJoints[legIdx];
      const phase = phaseOffsets[legIdx] ?? (legIdx / legCount);

      const hipTimes: number[] = [];
      const hipRotX: number[] = [];
      const kneeTimes: number[] = [];
      const kneeRotX: number[] = [];

      for (let i = 0; i <= totalFrames; i++) {
        const t = i * dt;
        const cyclePhase = (t / duration + phase) % 1.0;

        // Hip: sinusoidal forward/backward swing
        const hipAngle = 0.5 * Math.sin(2 * Math.PI * cyclePhase);
        hipTimes.push(t);
        hipRotX.push(hipAngle);

        // Knee: flex during swing phase (first half of cycle)
        const swingPhase = Math.sin(Math.PI * cyclePhase);
        const kneeAngle = -0.3 * Math.max(0, swingPhase);
        kneeTimes.push(t);
        kneeRotX.push(kneeAngle);
      }

      tracks.push(new THREE.NumberKeyframeTrack(
        `${jointName}.rotation[x]`, hipTimes, hipRotX,
      ));
      tracks.push(new THREE.NumberKeyframeTrack(
        `${jointName}_lower.rotation[x]`, kneeTimes, kneeRotX,
      ));
    }

    // Body vertical bob (2x gait frequency)
    const bobTimes: number[] = [];
    const bobY: number[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = i * dt;
      const phase = t / duration;
      bobTimes.push(t);
      bobY.push(0.02 * Math.abs(Math.sin(2 * Math.PI * phase * 2)));
    }

    tracks.push(new THREE.NumberKeyframeTrack('root.position[y]', bobTimes, bobY));

    return new THREE.AnimationClip('runCycle', duration, tracks);
  }

  /**
   * Compute phase offsets for different leg configurations.
   */
  private computeLegPhaseOffsets(legCount: number, gaitType: string): number[] {
    const offsets: number[] = [];

    switch (gaitType) {
      case 'biped':
        // Alternating: L at 0, R at 0.5
        for (let i = 0; i < legCount; i++) {
          offsets.push(i % 2 === 0 ? 0.0 : 0.5);
        }
        break;
      case 'trot':
        // Diagonal pairs simultaneous
        for (let i = 0; i < legCount; i++) {
          offsets.push(i % 2 === 0 ? 0.0 : 0.5);
        }
        break;
      case 'gallop':
        // Leading hind → trailing hind → leading fore → trailing fore
        for (let i = 0; i < legCount; i++) {
          offsets.push(i * 0.15);
        }
        break;
      default: // walk
        // Even distribution
        for (let i = 0; i < legCount; i++) {
          offsets.push(i / legCount);
        }
        break;
    }

    return offsets;
  }
}

// ============================================================================
// NURBSCurve — Custom NURBS curve class extending THREE.Curve
// ============================================================================

/**
 * NURBS curve implementation extending THREE.Curve for use in CurvePath.
 *
 * Uses Cox-de Boor recursion for B-spline basis function evaluation,
 * with rational weighting support (w != 1 for conic sections).
 */
class NURBSCurve extends THREE.Curve<THREE.Vector3> {
  private controlPoints: THREE.Vector3[];
  private weights: number[];
  private degree: number;
  private knots: number[];

  constructor(
    controlPoints: THREE.Vector3[],
    weights: number[],
    degree: number = 3,
    knots?: number[],
  ) {
    super();
    this.controlPoints = controlPoints;
    this.weights = weights;
    this.degree = Math.min(degree, controlPoints.length - 1);
    this.knots = knots ?? this.generateUniformKnots(controlPoints.length, this.degree);
  }

  /**
   * Evaluate the NURBS curve at parameter t ∈ [0, 1].
   */
  getPoint(t: number): THREE.Vector3 {
    const n = this.controlPoints.length - 1;
    const uMin = this.knots[this.degree];
    const uMax = this.knots[n + 1];

    // Map t ∈ [0,1] to u ∈ [uMin, uMax]
    const u = uMin + t * (uMax - uMin);

    // Find knot span
    const span = findKnotSpan(this.degree, u, this.knots);
    const basis = evaluateBasis(this.degree, this.knots, u, span);

    // Rational evaluation
    let wx = 0, wy = 0, wz = 0, w = 0;

    for (let i = 0; i <= this.degree; i++) {
      const cpIdx = span - this.degree + i;
      if (cpIdx < 0 || cpIdx >= this.controlPoints.length) continue;

      const cp = this.controlPoints[cpIdx];
      const weight = this.weights[cpIdx] ?? 1.0;
      const b = basis[i];

      wx += b * cp.x * weight;
      wy += b * cp.y * weight;
      wz += b * cp.z * weight;
      w += b * weight;
    }

    if (Math.abs(w) < 1e-10) {
      return new THREE.Vector3(0, 0, 0);
    }

    return new THREE.Vector3(wx / w, wy / w, wz / w);
  }

  /**
   * Generate a uniform clamped knot vector.
   */
  private generateUniformKnots(numControlPoints: number, degree: number): number[] {
    const n = numControlPoints - 1;
    const m = n + degree + 1;
    const knots: number[] = new Array(m + 1);

    // Clamped start
    for (let i = 0; i <= degree; i++) {
      knots[i] = 0.0;
    }

    // Uniform interior
    const interiorCount = m - 2 * degree;
    for (let i = 1; i <= interiorCount; i++) {
      knots[degree + i] = i / (interiorCount + 1);
    }

    // Clamped end
    for (let i = m - degree; i <= m; i++) {
      knots[i] = 1.0;
    }

    return knots;
  }
}

// ============================================================================
// WiggleAnimator — Sinusoidal lateral displacement for fish/snakes/eels
// ============================================================================

/**
 * Configuration for wiggle animation.
 */
export interface WiggleConfig {
  /** Lateral displacement amplitude (default: 0.1) */
  amplitude: number;
  /** Oscillation frequency in Hz (default: 2.0) */
  frequency: number;
  /** Phase offset per bone index — creates traveling wave (default: 0.3) */
  phaseOffsetPerBone: number;
  /** Wiggle mode: fish (whole-body wave), snake (traveling wave), eel (backward wave) */
  mode: 'fish' | 'snake' | 'eel';
  /** Duration of the animation clip in seconds */
  duration: number;
  /** Frames per second for keyframe density */
  fps: number;
  /** Bone names that form the spine chain (in order from head to tail) */
  spineBoneNames: string[];
  /** Optional amplitude envelope per bone (0-1 multipliers, overrides phase-based calculation) */
  amplitudeEnvelope?: number[];
}

/** Default wiggle configuration */
export const DEFAULT_WIGGLE_CONFIG: WiggleConfig = {
  amplitude: 0.1,
  frequency: 2.0,
  phaseOffsetPerBone: 0.3,
  mode: 'fish',
  duration: 2.0,
  fps: 30,
  spineBoneNames: [],
};

/**
 * WiggleAnimator — Generates sinusoidal lateral displacement animation
 * along spine bones for fish, snakes, and eels.
 *
 * Phase propagation creates a traveling wave effect (anterior → posterior),
 * with configurable direction for forward-traveling (fish), forward-traveling
 * with higher amplitude (snake), or backward-traveling (eel) waves.
 *
 * Usage:
 * ```ts
 * const animator = new WiggleAnimator();
 * const clip = animator.createWiggleClip(skeleton, {
 *   mode: 'fish',
 *   amplitude: 0.15,
 *   spineBoneNames: ['spine_0', 'spine_1', 'spine_2', ...]
 * });
 * ```
 */
export class WiggleAnimator {
  /**
   * Create a wiggle animation clip with sinusoidal lateral displacement.
   *
   * @param skeleton - The creature's skeleton
   * @param config - Wiggle animation configuration
   * @returns AnimationClip with per-spine-bone rotation tracks
   */
  createWiggleClip(
    skeleton: THREE.Skeleton,
    config: Partial<WiggleConfig> = {},
  ): THREE.AnimationClip {
    const cfg: WiggleConfig = { ...DEFAULT_WIGGLE_CONFIG, ...config };
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const totalFrames = Math.ceil(cfg.duration * cfg.fps);
    const dt = cfg.duration / totalFrames;

    // Use provided bone names or fall back to searching the skeleton
    const spineBones = cfg.spineBoneNames.length > 0
      ? cfg.spineBoneNames.map(name => {
          const bone = skeleton.bones.find(b => b.name === name);
          return bone?.name ?? name;
        })
      : skeleton.bones
          .filter(b => b.name.includes('spine') || b.name.includes('tail'))
          .map(b => b.name);

    const boneCount = spineBones.length;

    for (let boneIdx = 0; boneIdx < boneCount; boneIdx++) {
      const boneName = spineBones[boneIdx];
      const times: number[] = [];
      const rotY: number[] = [];

      // Compute amplitude for this bone
      const normalizedIdx = boneCount > 1 ? boneIdx / (boneCount - 1) : 0;
      let boneAmplitude: number;

      if (cfg.amplitudeEnvelope && boneIdx < cfg.amplitudeEnvelope.length) {
        boneAmplitude = cfg.amplitude * cfg.amplitudeEnvelope[boneIdx];
      } else {
        // Default: amplitude increases toward the tail
        boneAmplitude = cfg.amplitude * (0.3 + 0.7 * normalizedIdx);
      }

      // Phase direction depends on mode
      let phase: number;
      switch (cfg.mode) {
        case 'eel':
          // Backward-traveling wave: phase decreases from head to tail
          phase = -boneIdx * cfg.phaseOffsetPerBone;
          break;
        case 'snake':
          // Forward-traveling wave with higher amplitude and lower frequency
          phase = boneIdx * cfg.phaseOffsetPerBone;
          boneAmplitude *= 1.3;
          break;
        case 'fish':
        default:
          // Forward-traveling wave: phase increases from head to tail
          phase = boneIdx * cfg.phaseOffsetPerBone;
          break;
      }

      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame * dt;
        times.push(t);

        const angle = boneAmplitude * Math.sin(
          2 * Math.PI * cfg.frequency * (t / cfg.duration) + phase,
        );
        rotY.push(angle);
      }

      tracks.push(new THREE.NumberKeyframeTrack(
        `${boneName}.rotation[y]`, times, rotY,
      ));
    }

    return new THREE.AnimationClip('wiggle', cfg.duration, tracks);
  }

  /**
   * Create an idle noise animation clip with per-target-type noise.
   *
   * Noise types:
   * - Body: breathing sine (slow, low amplitude on spine Y)
   * - Head: look-around (random yaw oscillation)
   * - Feet: random walk (small perturbations on toe joints)
   * - Wing tips: flap (low-frequency sinusoidal on wing joints)
   * - Tail: sway (pendulum motion on tail chain)
   *
   * @param skeleton - The creature's skeleton
   * @param config - Idle noise configuration
   * @returns AnimationClip with idle noise tracks
   */
  createIdleNoiseClip(
    skeleton: THREE.Skeleton,
    config?: IdleNoiseConfig,
  ): THREE.AnimationClip {
    const cfg: IdleNoiseConfig = config ?? DEFAULT_IDLE_NOISE_CONFIG;
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const totalFrames = Math.ceil(cfg.duration * cfg.fps);
    const dt = cfg.duration / totalFrames;

    // Body breathing: subtle spine Y scale oscillation
    if (cfg.body.enabled) {
      const spineBones = skeleton.bones.filter(b =>
        b.name.includes('spine') || b.name === 'root',
      );

      for (const bone of spineBones) {
        const times: number[] = [];
        const scaleY: number[] = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          times.push(t);
          const breath = 1.0 + cfg.body.amplitude * Math.sin(
            2 * Math.PI * cfg.body.frequency * (t / cfg.duration),
          );
          scaleY.push(breath);
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${bone.name}.scale[y]`, times, scaleY,
        ));
      }
    }

    // Head look-around: random yaw oscillation
    if (cfg.head.enabled) {
      const headBone = skeleton.bones.find(b =>
        b.name.includes('skull') || b.name.includes('head'),
      );

      if (headBone) {
        const rng = new SeededRandom(cfg.seed ?? 42);
        const times: number[] = [];
        const rotY: number[] = [];
        const rotX: number[] = [];

        // Generate random yaw targets for look-around
        const lookCount = Math.ceil(cfg.duration * cfg.head.frequency);
        const yawTargets: number[] = [];
        const pitchTargets: number[] = [];
        for (let i = 0; i <= lookCount; i++) {
          yawTargets.push(rng.nextFloat(-1, 1) * cfg.head.amplitude);
          pitchTargets.push(rng.nextFloat(-0.5, 0.5) * cfg.head.amplitude);
        }

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          times.push(t);
          const phase = cfg.head.frequency * (t / cfg.duration);
          const idx = Math.floor(phase) % lookCount;
          const frac = phase - Math.floor(phase);
          // Smooth interpolation between random targets
          const nextIdx = (idx + 1) % lookCount;
          const smoothFrac = frac * frac * (3 - 2 * frac); // smoothstep
          rotY.push(yawTargets[idx] * (1 - smoothFrac) + yawTargets[nextIdx] * smoothFrac);
          rotX.push(pitchTargets[idx] * (1 - smoothFrac) + pitchTargets[nextIdx] * smoothFrac);
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${headBone.name}.rotation[y]`, times, rotY,
        ));
        tracks.push(new THREE.NumberKeyframeTrack(
          `${headBone.name}.rotation[x]`, times, rotX,
        ));
      }
    }

    // Feet random walk: small perturbations on toe/foot joints
    if (cfg.feet.enabled) {
      const footBones = skeleton.bones.filter(b =>
        b.name.includes('foot') || b.name.includes('toe') || b.name.includes('tarsus'),
      );

      const rng = new SeededRandom((cfg.seed ?? 42) + 1);

      for (const bone of footBones) {
        const times: number[] = [];
        const posX: number[] = [];
        const posZ: number[] = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          times.push(t);
          posX.push(rng.nextFloat(-1, 1) * cfg.feet.amplitude * 0.01);
          posZ.push(rng.nextFloat(-1, 1) * cfg.feet.amplitude * 0.01);
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${bone.name}.position[x]`, times, posX,
        ));
        tracks.push(new THREE.NumberKeyframeTrack(
          `${bone.name}.position[z]`, times, posZ,
        ));
      }
    }

    // Wing tip flap: low-frequency sinusoidal on wing joints
    if (cfg.wingTips.enabled) {
      const wingBones = skeleton.bones.filter(b =>
        b.name.includes('wing') || b.name.includes('feather'),
      );

      for (const bone of wingBones) {
        const times: number[] = [];
        const rotZ: number[] = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          times.push(t);
          const flap = cfg.wingTips.amplitude * Math.sin(
            2 * Math.PI * cfg.wingTips.frequency * (t / cfg.duration),
          );
          rotZ.push(bone.name.includes('_L') ? flap : -flap);
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${bone.name}.rotation[z]`, times, rotZ,
        ));
      }
    }

    // Tail sway: pendulum motion on tail chain
    if (cfg.tail.enabled) {
      const tailBones = skeleton.bones.filter(b => b.name.includes('tail'));

      for (let boneIdx = 0; boneIdx < tailBones.length; boneIdx++) {
        const bone = tailBones[boneIdx];
        const times: number[] = [];
        const rotY: number[] = [];
        const amp = cfg.tail.amplitude * (0.5 + 0.5 * (boneIdx / Math.max(1, tailBones.length - 1)));

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          times.push(t);
          // Pendulum: decaying oscillation with damping
          const decay = Math.exp(-cfg.tail.damping * (t / cfg.duration));
          const sway = amp * Math.sin(
            2 * Math.PI * cfg.tail.frequency * (t / cfg.duration) + boneIdx * 0.3,
          ) * decay;
          rotY.push(sway);
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${bone.name}.rotation[y]`, times, rotY,
        ));
      }
    }

    return new THREE.AnimationClip('idleNoise', cfg.duration, tracks);
  }
}

/**
 * Per-target-type idle noise configuration.
 */
export interface IdleNoiseConfig {
  duration: number;
  fps: number;
  seed: number;
  body: { enabled: boolean; amplitude: number; frequency: number };
  head: { enabled: boolean; amplitude: number; frequency: number };
  feet: { enabled: boolean; amplitude: number; frequency: number };
  wingTips: { enabled: boolean; amplitude: number; frequency: number };
  tail: { enabled: boolean; amplitude: number; frequency: number; damping: number };
}

/** Default idle noise configuration */
export const DEFAULT_IDLE_NOISE_CONFIG: IdleNoiseConfig = {
  duration: 3.0,
  fps: 20,
  seed: 42,
  body: { enabled: true, amplitude: 0.015, frequency: 0.33 },
  head: { enabled: true, amplitude: 0.05, frequency: 0.2 },
  feet: { enabled: true, amplitude: 0.02, frequency: 0.5 },
  wingTips: { enabled: true, amplitude: 0.08, frequency: 0.5 },
  tail: { enabled: true, amplitude: 0.06, frequency: 0.4, damping: 0.3 },
};

// ============================================================================
// GaitSystem — Gait pattern generation with phase offsets
// ============================================================================

/**
 * Supported gait types for creature locomotion.
 */
export enum GaitType {
  WALK = 'walk',
  TROT = 'trot',
  CANTER = 'canter',
  GALLOP = 'gallop',
  BIPED = 'biped',
  TRIPOD = 'tripod',
  SWIM = 'swim',
  SLITHER = 'slither',
}

/**
 * Leg pair definition for gait computation.
 */
export interface LegPair {
  /** Bone name for the left leg of this pair */
  leftBone: string;
  /** Bone name for the right leg of this pair */
  rightBone: string;
  /** Pair index (0 = fore, 1 = hind, 2 = third for hexapods) */
  pairIndex: number;
}

/**
 * Stance phase timing for a leg.
 */
export interface StancePhase {
  /** Normalized time when foot lifts off (0-1) */
  lift: number;
  /** Normalized time when foot touches down (0-1) */
  touchdown: number;
}

/**
 * GaitSystem — Generates gait pattern animation clips for various locomotion types.
 *
 * Supports:
 * - Walk: 4-phase gait (L1-R2-L2-R1 for quadruped)
 * - Trot: diagonal pairs simultaneous
 * - Canter: 3-beat gait
 * - Gallop: leading hind → trailing hind → leading fore → trailing fore
 * - Biped: left-right alternating
 * - Tripod: 3-leg groups alternating (hexapod)
 * - Swim: paired limb strokes
 * - Slither: sinusoidal wave with side-setter pushes
 *
 * Usage:
 * ```ts
 * const gait = new GaitSystem();
 * const clip = gait.createGaitClip(skeleton, legPairs, GaitType.WALK, 1.0);
 * ```
 */
export class GaitSystem {
  /**
   * Create a gait animation clip for the given skeleton and gait type.
   *
   * @param skeleton - The creature's skeleton
   * @param legPairs - Array of leg pair definitions
   * @param gaitType - The gait pattern to generate
   * @param speed - Speed multiplier (0.5 - 3.0)
   * @returns AnimationClip with gait animation tracks
   */
  createGaitClip(
    skeleton: THREE.Skeleton,
    legPairs: LegPair[],
    gaitType: GaitType,
    speed: number = 1.0,
  ): THREE.AnimationClip {
    const duration = Math.max(0.4, 1.5 / speed);
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);
    const dt = duration / totalFrames;

    switch (gaitType) {
      case GaitType.SLITHER:
        return this.createSlitherClip(skeleton, duration, speed);
      case GaitType.SWIM:
        return this.createSwimClip(skeleton, legPairs, duration, speed);
      default:
        break;
    }

    // Compute phase offsets for each leg
    const phaseOffsets = this.computeGaitPhases(legPairs, gaitType);

    // Generate per-leg tracks
    for (const { bone, phase } of phaseOffsets) {
      const legTimes: number[] = [];
      const hipRotX: number[] = [];
      const kneeRotX: number[] = [];

      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame * dt;
        const cyclePhase = (t / duration + phase) % 1.0;

        legTimes.push(t);

        // Hip swing
        const strideScale = gaitType === GaitType.GALLOP ? 0.7 : 0.5;
        hipRotX.push(strideScale * Math.sin(2 * Math.PI * cyclePhase));

        // Knee flex during swing phase
        const swingPhase = Math.sin(Math.PI * cyclePhase);
        kneeRotX.push(-0.3 * Math.max(0, swingPhase));
      }

      tracks.push(new THREE.NumberKeyframeTrack(
        `${bone}.rotation[x]`, legTimes, hipRotX,
      ));
      tracks.push(new THREE.NumberKeyframeTrack(
        `${bone}_lower.rotation[x]`, legTimes.slice(), kneeRotX,
      ));
    }

    // Body bob
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];

    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = frame * dt;
      const phase = t / duration;
      bodyTimes.push(t);

      let bobAmplitude = 0.02;
      if (gaitType === GaitType.GALLOP) bobAmplitude = 0.04;
      if (gaitType === GaitType.TRIPOD) bobAmplitude = 0.008;

      bodyY.push(bobAmplitude * Math.abs(Math.sin(2 * Math.PI * phase * 2)));
    }

    tracks.push(new THREE.NumberKeyframeTrack(
      'root.position[y]', bodyTimes, bodyY,
    ));

    const clipName = gaitType.toString();
    return new THREE.AnimationClip(clipName, duration, tracks);
  }

  /**
   * Compute the stance phase timing (lift and touchdown) for a leg.
   *
   * @param legIndex - Index of the leg in the leg pairs
   * @param gaitType - The gait pattern
   * @returns Stance phase with lift and touchdown times
   */
  computeStancePhase(legIndex: number, gaitType: GaitType): StancePhase {
    const dutyFactor = this.getDutyFactor(gaitType);
    const phaseOffsets = this.getPhaseOffsetsForGait(gaitType);
    const phase = phaseOffsets[legIndex % phaseOffsets.length] ?? 0;

    // Lift happens at start of swing phase
    const lift = phase % 1.0;
    // Touchdown happens at end of swing phase (duty factor defines stance duration)
    const touchdown = (phase + (1 - dutyFactor)) % 1.0;

    return { lift, touchdown };
  }

  /**
   * Compute the swing trajectory as a parabolic arc from start to end.
   *
   * @param startPos - Starting position of the foot
   * @param endPos - Ending position of the foot
   * @param liftHeight - Maximum height of the arc
   * @returns Array of Vector3 positions along the arc
   */
  computeSwingTrajectory(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    liftHeight: number = 0.08,
  ): THREE.Vector3[] {
    const resolution = 10;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      // Parabolic arc: peak at t=0.5
      pos.y += liftHeight * 4 * t * (1 - t);
      points.push(pos);
    }

    return points;
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /**
   * Compute phase offsets for each leg based on gait pattern.
   */
  private computeGaitPhases(
    legPairs: LegPair[],
    gaitType: GaitType,
  ): Array<{ bone: string; phase: number }> {
    const result: Array<{ bone: string; phase: number }> = [];

    switch (gaitType) {
      case GaitType.WALK: {
        // Walk: L1(0) → R2(0.25) → L2(0.5) → R1(0.75) for quadruped
        for (const pair of legPairs) {
          const leftPhase = pair.pairIndex * 0.5;
          const rightPhase = pair.pairIndex * 0.5 + 0.25;
          result.push({ bone: pair.leftBone, phase: leftPhase });
          result.push({ bone: pair.rightBone, phase: rightPhase });
        }
        break;
      }

      case GaitType.TROT: {
        // Diagonal pairs simultaneous
        for (const pair of legPairs) {
          // Left of front pair and right of hind pair share phase
          const leftPhase = pair.pairIndex * 0.5;
          const rightPhase = (pair.pairIndex * 0.5 + 0.5) % 1.0;
          result.push({ bone: pair.leftBone, phase: leftPhase });
          result.push({ bone: pair.rightBone, phase: rightPhase });
        }
        break;
      }

      case GaitType.CANTER: {
        // 3-beat: leading hind → diagonal pair → leading fore
        // Simplified: hind pair at 0, diagonal at 0.33, fore at 0.66
        for (const pair of legPairs) {
          const canterPhase = pair.pairIndex * 0.33;
          result.push({ bone: pair.leftBone, phase: canterPhase });
          result.push({ bone: pair.rightBone, phase: (canterPhase + 0.15) % 1.0 });
        }
        break;
      }

      case GaitType.GALLOP: {
        // Leading hind → trailing hind → leading fore → trailing fore
        const gallopPhases = [0.0, 0.15, 0.5, 0.65];
        let idx = 0;
        for (const pair of legPairs) {
          result.push({ bone: pair.leftBone, phase: gallopPhases[idx % gallopPhases.length] });
          idx++;
          result.push({ bone: pair.rightBone, phase: gallopPhases[idx % gallopPhases.length] });
          idx++;
        }
        break;
      }

      case GaitType.BIPED: {
        // Left-right alternating
        for (const pair of legPairs) {
          result.push({ bone: pair.leftBone, phase: 0.0 });
          result.push({ bone: pair.rightBone, phase: 0.5 });
        }
        break;
      }

      case GaitType.TRIPOD: {
        // Alternating tripod: Group A vs Group B
        for (const pair of legPairs) {
          const groupPhase = pair.pairIndex % 2 === 0 ? 0.0 : 0.5;
          result.push({ bone: pair.leftBone, phase: groupPhase });
          result.push({ bone: pair.rightBone, phase: groupPhase === 0.0 ? 0.5 : 0.0 });
        }
        break;
      }

      default:
        // Even distribution
        for (const pair of legPairs) {
          const idx = pair.pairIndex;
          result.push({ bone: pair.leftBone, phase: (idx * 2) / (legPairs.length * 2) });
          result.push({ bone: pair.rightBone, phase: (idx * 2 + 1) / (legPairs.length * 2) });
        }
        break;
    }

    return result;
  }

  /**
   * Get the duty factor (fraction of cycle that foot is on ground) for a gait.
   */
  private getDutyFactor(gaitType: GaitType): number {
    switch (gaitType) {
      case GaitType.WALK:     return 0.75;
      case GaitType.TROT:     return 0.50;
      case GaitType.CANTER:   return 0.45;
      case GaitType.GALLOP:   return 0.35;
      case GaitType.BIPED:    return 0.60;
      case GaitType.TRIPOD:   return 0.50;
      case GaitType.SWIM:     return 0.40;
      case GaitType.SLITHER:  return 0.30;
      default:                return 0.60;
    }
  }

  /**
   * Get canonical phase offsets for a gait type.
   */
  private getPhaseOffsetsForGait(gaitType: GaitType): number[] {
    switch (gaitType) {
      case GaitType.WALK:     return [0.0, 0.25, 0.5, 0.75];
      case GaitType.TROT:     return [0.0, 0.5, 0.5, 0.0];
      case GaitType.CANTER:   return [0.0, 0.33, 0.33, 0.66];
      case GaitType.GALLOP:   return [0.0, 0.15, 0.5, 0.65];
      case GaitType.BIPED:    return [0.0, 0.5];
      case GaitType.TRIPOD:   return [0.0, 0.5, 0.0, 0.5, 0.0, 0.5];
      case GaitType.SWIM:     return [0.0, 0.5, 0.25, 0.75];
      case GaitType.SLITHER:  return [0.0];
      default:                return [0.0, 0.25, 0.5, 0.75];
    }
  }

  /**
   * Create a slither gait clip with sinusoidal body wave.
   */
  private createSlitherClip(
    skeleton: THREE.Skeleton,
    duration: number,
    speed: number,
  ): THREE.AnimationClip {
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);
    const dt = duration / totalFrames;

    // Find spine and tail bones
    const spineBones = skeleton.bones.filter(b =>
      b.name.includes('spine') || b.name.includes('tail'),
    );

    // Sinusoidal body wave propagating along spine
    for (let boneIdx = 0; boneIdx < spineBones.length; boneIdx++) {
      const bone = spineBones[boneIdx];
      const times: number[] = [];
      const rotY: number[] = [];

      const normalizedIdx = spineBones.length > 1
        ? boneIdx / (spineBones.length - 1)
        : 0;
      const amplitude = 0.3 * speed * (0.3 + 0.7 * normalizedIdx);

      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame * dt;
        times.push(t);
        const phase = (t / duration) * 2 * Math.PI + boneIdx * 0.5;
        rotY.push(amplitude * Math.sin(phase));
      }

      tracks.push(new THREE.NumberKeyframeTrack(
        `${bone.name}.rotation[y]`, times, rotY,
      ));
    }

    // Forward motion
    const posTimes: number[] = [];
    const posZ: number[] = [];
    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = frame * dt;
      posTimes.push(t);
      posZ.push(0.1 * speed * t / duration);
    }

    tracks.push(new THREE.NumberKeyframeTrack(
      'root.position[z]', posTimes, posZ,
    ));

    // Head steering
    const headBone = skeleton.bones.find(b =>
      b.name.includes('skull') || b.name.includes('head'),
    );
    if (headBone) {
      const headTimes: number[] = [];
      const headRotY: number[] = [];
      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame * dt;
        headTimes.push(t);
        headRotY.push(0.2 * speed * Math.sin(2 * Math.PI * t / duration));
      }
      tracks.push(new THREE.NumberKeyframeTrack(
        `${headBone.name}.rotation[y]`, headTimes, headRotY,
      ));
    }

    return new THREE.AnimationClip('slither', duration, tracks);
  }

  /**
   * Create a swim gait clip with paired limb strokes.
   */
  private createSwimClip(
    skeleton: THREE.Skeleton,
    legPairs: LegPair[],
    duration: number,
    speed: number,
  ): THREE.AnimationClip {
    const tracks: THREE.NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);
    const dt = duration / totalFrames;

    // Paired limb strokes with alternating phase
    for (const pair of legPairs) {
      for (const boneName of [pair.leftBone, pair.rightBone]) {
        const isLeft = boneName === pair.leftBone;
        const phase = pair.pairIndex % 2 === 0 ? 0.0 : 0.5;

        const limbTimes: number[] = [];
        const rotX: number[] = [];
        const rotZ: number[] = [];

        for (let frame = 0; frame <= totalFrames; frame++) {
          const t = frame * dt;
          const cyclePhase = (t / duration + phase) % 1.0;

          limbTimes.push(t);
          // Stroke: pull back then push forward
          rotX.push(0.4 * speed * Math.sin(2 * Math.PI * cyclePhase));
          // Slight lateral movement
          rotZ.push((isLeft ? 1 : -1) * 0.15 * speed * Math.sin(2 * Math.PI * cyclePhase));
        }

        tracks.push(new THREE.NumberKeyframeTrack(
          `${boneName}.rotation[x]`, limbTimes, rotX,
        ));
        tracks.push(new THREE.NumberKeyframeTrack(
          `${boneName}.rotation[z]`, limbTimes.slice(), rotZ,
        ));
      }
    }

    // Body wave for swimming
    const spineBones = skeleton.bones.filter(b => b.name.includes('spine'));
    for (let boneIdx = 0; boneIdx < spineBones.length; boneIdx++) {
      const bone = spineBones[boneIdx];
      const times: number[] = [];
      const rotY: number[] = [];
      const amp = 0.15 * speed * (0.2 + 0.8 * (boneIdx / Math.max(1, spineBones.length - 1)));

      for (let frame = 0; frame <= totalFrames; frame++) {
        const t = frame * dt;
        times.push(t);
        const phase = (t / duration) * 2 * Math.PI + boneIdx * 0.4;
        rotY.push(amp * Math.sin(phase));
      }

      tracks.push(new THREE.NumberKeyframeTrack(
        `${bone.name}.rotation[y]`, times, rotY,
      ));
    }

    // Forward motion
    const posTimes: number[] = [];
    const posZ: number[] = [];
    for (let frame = 0; frame <= totalFrames; frame++) {
      const t = frame * dt;
      posTimes.push(t);
      posZ.push(0.15 * speed * t / duration);
    }

    tracks.push(new THREE.NumberKeyframeTrack(
      'root.position[z]', posTimes, posZ,
    ));

    return new THREE.AnimationClip('swim', duration, tracks);
  }
}

// ============================================================================
// IKRig — Analytical 2-joint IK + FABRIK spine IK + floor constraints
// ============================================================================

/**
 * Result of 2-joint IK solving.
 */
export interface TwoJointIKResult {
  /** Position of the elbow/knee joint */
  elbowPos: THREE.Vector3;
  /** Rotation to apply at the shoulder/hip */
  shoulderRot: THREE.Quaternion;
  /** Rotation to apply at the elbow/knee */
  elbowRot: THREE.Quaternion;
}

/**
 * IKRig — Provides analytical and iterative IK solvers for creature animation.
 *
 * Includes:
 * - Analytical 2-joint IK for limbs (shoulder-elbow, hip-knee)
 * - FABRIK-style solver for spine chains
 * - Floor constraint clamping to prevent foot penetration
 *
 * Usage:
 * ```ts
 * const ikRig = new IKRig();
 * const result = ikRig.solveTwoJointIK(shoulderPos, targetPos, upperLen, lowerLen);
 * ```
 */
export class IKRig {
  /**
   * Solve 2-joint IK analytically for a limb (shoulder → elbow → target).
   *
   * Uses the law of cosines to find the elbow angle, then computes
   * shoulder and elbow rotations to reach the target.
   *
   * @param shoulderPos - Position of the shoulder/hip joint
   * @param targetPos - Desired position for the end-effector (hand/foot)
   * @param upperLen - Length of the upper bone (humerus/femur)
   * @param lowerLen - Length of the lower bone (radius/tibia)
   * @returns IK result with elbow position and joint rotations
   */
  solveTwoJointIK(
    shoulderPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    upperLen: number,
    lowerLen: number,
  ): TwoJointIKResult {
    const direction = new THREE.Vector3().subVectors(targetPos, shoulderPos);
    const distance = direction.length();

    // Handle edge cases
    if (distance < 0.001) {
      // Target is at shoulder — fold the limb completely
      return {
        elbowPos: shoulderPos.clone().add(new THREE.Vector3(0, -upperLen * 0.5, 0)),
        shoulderRot: new THREE.Quaternion(),
        elbowRot: new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0), Math.PI * 0.8,
        ),
      };
    }

    // Clamp distance to reachable range
    const maxReach = upperLen + lowerLen;
    const minReach = Math.abs(upperLen - lowerLen);

    let clampedDist = distance;
    if (clampedDist > maxReach * 0.999) {
      clampedDist = maxReach * 0.999; // Nearly fully extended
    }
    if (clampedDist < minReach * 1.001) {
      clampedDist = minReach * 1.001; // Nearly fully retracted
    }

    // Law of cosines to find elbow angle
    // cos(angle at shoulder) = (upperLen² + dist² - lowerLen²) / (2 * upperLen * dist)
    const cosShoulderAngle = (
      upperLen * upperLen + clampedDist * clampedDist - lowerLen * lowerLen
    ) / (2 * upperLen * clampedDist);

    const shoulderAngle = Math.acos(
      Math.max(-1, Math.min(1, cosShoulderAngle)),
    );

    // Compute elbow position
    const normalizedDir = direction.clone().normalize();

    // Create a rotation axis perpendicular to the direction
    const upHint = Math.abs(normalizedDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const rotationAxis = new THREE.Vector3().crossVectors(normalizedDir, upHint).normalize();

    // Rotate from direction toward elbow
    const toElbow = normalizedDir.clone().applyAxisAngle(rotationAxis, -shoulderAngle);
    const elbowPos = shoulderPos.clone().add(toElbow.multiplyScalar(upperLen));

    // Compute rotations
    const defaultDir = new THREE.Vector3(0, -1, 0); // Default limb hangs downward

    // Shoulder rotation: from default direction to upper bone direction
    const upperBoneDir = new THREE.Vector3().subVectors(elbowPos, shoulderPos).normalize();
    const shoulderRot = new THREE.Quaternion().setFromUnitVectors(defaultDir, upperBoneDir);

    // Elbow rotation: from default direction to lower bone direction
    const lowerBoneDir = new THREE.Vector3().subVectors(targetPos, elbowPos).normalize();
    const elbowRot = new THREE.Quaternion().setFromUnitVectors(defaultDir, lowerBoneDir);

    // Remove shoulder rotation influence from elbow rotation
    elbowRot.premultiply(shoulderRot.clone().invert());

    return { elbowPos, shoulderRot, elbowRot };
  }

  /**
   * Solve spine IK using a FABRIK-style iterative solver.
   *
   * Adjusts spine joint positions to reach toward target positions
   * while maintaining bone lengths.
   *
   * @param spineJoints - Current positions of spine joints (head → tail order)
   * @param targetPositions - Desired positions for each joint (same length)
   * @param iterations - Number of FABRIK iterations (default: 10)
   * @returns Array of Quaternion rotations for each joint
   */
  solveSpineIK(
    spineJoints: THREE.Vector3[],
    targetPositions: THREE.Vector3[],
    iterations: number = 10,
  ): THREE.Quaternion[] {
    const n = spineJoints.length;
    if (n === 0) return [];

    // Compute bone lengths from initial positions
    const boneLengths: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      boneLengths.push(spineJoints[i].distanceTo(spineJoints[i + 1]));
    }

    // Working copy of positions
    const positions = spineJoints.map(p => p.clone());

    for (let iter = 0; iter < iterations; iter++) {
      // Forward pass: pull from the end toward targets
      for (let i = n - 1; i >= 0; i--) {
        if (targetPositions[i]) {
          positions[i].copy(targetPositions[i]);
        }

        // Maintain bone length with previous joint
        if (i > 0) {
          const dir = new THREE.Vector3().subVectors(positions[i - 1], positions[i]);
          const dist = dir.length();
          if (dist > 0.001) {
            dir.normalize();
            positions[i - 1].copy(positions[i]).add(dir.multiplyScalar(boneLengths[i - 1]));
          }
        }
      }

      // Backward pass: push from the root maintaining bone lengths
      for (let i = 1; i < n; i++) {
        const dir = new THREE.Vector3().subVectors(positions[i], positions[i - 1]);
        const dist = dir.length();
        if (dist > 0.001) {
          dir.normalize();
          positions[i].copy(positions[i - 1]).add(dir.multiplyScalar(boneLengths[i - 1]));
        }
      }
    }

    // Compute rotations from original to solved positions
    const rotations: THREE.Quaternion[] = [new THREE.Quaternion()]; // Root stays

    for (let i = 1; i < n; i++) {
      const origDir = new THREE.Vector3().subVectors(spineJoints[i], spineJoints[i - 1]).normalize();
      const solvedDir = new THREE.Vector3().subVectors(positions[i], positions[i - 1]).normalize();

      const quat = new THREE.Quaternion().setFromUnitVectors(origDir, solvedDir);
      rotations.push(quat);
    }

    return rotations;
  }

  /**
   * Apply a floor constraint to clamp a joint's Y position to terrain height.
   *
   * Used by foot placement to prevent foot penetration through terrain.
   *
   * @param joint - The joint position to constrain
   * @param terrainHeight - The terrain height at the joint's (x, z) position
   * @param offset - Vertical offset above terrain (default: 0)
   * @returns The constrained position
   */
  applyFloorConstraint(
    joint: THREE.Vector3,
    terrainHeight: number,
    offset: number = 0,
  ): THREE.Vector3 {
    const result = joint.clone();
    const minY = terrainHeight + offset;

    // Only clamp upward (prevent penetration, don't pull feet down into ground)
    if (result.y < minY) {
      result.y = minY;
    }

    return result;
  }
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a complete animation system for a creature.
 * Returns an object with all five subsystem instances.
 *
 * @param seed - Random seed for deterministic animation
 * @returns Object with FloorSnapper, NURBSPathFollower, WiggleAnimator, GaitSystem, IKRig
 */
export function createCreatureAnimationSystem(seed: number = 42) {
  return {
    floorSnapper: new FloorSnapper(),
    pathFollower: new NURBSPathFollower(),
    wiggleAnimator: new WiggleAnimator(),
    gaitSystem: new GaitSystem(),
    ikRig: new IKRig(),
    rng: new SeededRandom(seed),
  };
}

/**
 * Create a terrain height sampler from a simple height function.
 * Wraps any (x,z) → height function with bilinear interpolation
 * for smoother results when sampled on a grid.
 *
 * @param heightFn - Base height function
 * @param sampleResolution - Grid resolution for pre-sampling
 * @param bounds - World-space bounds for the grid
 * @returns Bilinear-interpolated height sampler
 */
export function createSmoothedHeightSampler(
  heightFn: (x: number, z: number) => number,
  sampleResolution: number = 64,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } = {
    minX: -50, maxX: 50, minZ: -50, maxZ: 50,
  },
): (x: number, z: number) => number {
  // Pre-sample the height function on a grid
  const width = sampleResolution;
  const height = sampleResolution;
  const heightData = new Float32Array(width * height);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const worldX = bounds.minX + (x / (width - 1)) * (bounds.maxX - bounds.minX);
      const worldZ = bounds.minZ + (z / (height - 1)) * (bounds.maxZ - bounds.minZ);
      heightData[z * width + x] = heightFn(worldX, worldZ);
    }
  }

  return FloorSnapper.createTerrainHeightSampler(heightData, { width, height }, bounds);
}
