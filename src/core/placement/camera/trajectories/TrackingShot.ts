/**
 * Tracking Shot Camera Trajectory
 *
 * Subject-following camera movement along a path with predictive tracking,
 * speed ramping, offset options, CatmullRom spline path generation,
 * and dynamic distance adjustment based on subject speed.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../util/MathUtils';
import { Keyframe, TrajectorySample, InterpolationMode, generateTrajectory } from './TrajectoryGenerator';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TrackingShotConfig {
  /** Waypoints the subject follows (at least 2) */
  subjectPath: THREE.Vector3[];
  /** Total duration of the tracking shot (seconds) */
  duration?: number;
  /** Base distance from camera to subject (metres) */
  baseDistance?: number;
  /** Base camera height above ground (metres) */
  cameraHeight?: number;
  /** Tracking offset mode */
  offsetMode?: 'leading' | 'trailing' | 'side_left' | 'side_right' | 'orbit';
  /** Lateral offset for side tracking (metres) */
  sideOffset?: number;
  /** Vertical offset above subject (metres) */
  verticalOffset?: number;
  /** Look-ahead time for predictive tracking (seconds) */
  lookAheadTime?: number;
  /** Enable speed ramping (ease-in/ease-out) */
  speedRamping?: boolean;
  /** Ease-in duration (seconds) */
  easeInDuration?: number;
  /** Ease-out duration (seconds) */
  easeOutDuration?: number;
  /** Dynamic distance: adjust distance based on subject speed */
  dynamicDistance?: boolean;
  /** Min distance when subject is moving slowly */
  minDistance?: number;
  /** Max distance when subject is moving fast */
  maxDistance?: number;
  /** Seed for deterministic path variations */
  seed?: number;
  /** Samples per second */
  samplesPerSecond?: number;
  /** Subject speed along the path (metres/second, 0 = auto from path length) */
  subjectSpeed?: number;
}

// ---------------------------------------------------------------------------
// Internal: CatmullRom Spline for Subject Path
// ---------------------------------------------------------------------------

/**
 * Create a smooth CatmullRom curve from waypoints.
 */
function createSubjectCurve(waypoints: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  if (waypoints.length < 2) {
    throw new Error('TrackingShot requires at least 2 waypoints');
  }
  return new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.5);
}

// ---------------------------------------------------------------------------
// Internal: Speed Ramping
// ---------------------------------------------------------------------------

/**
 * Apply ease-in/ease-out speed ramping to a normalized progress value.
 * Returns a re-mapped progress that slows at start and end.
 */
function applySpeedRamping(
  t: number,
  easeInDuration: number,
  easeOutDuration: number,
  totalDuration: number
): number {
  const easeIn = Math.min(easeInDuration / totalDuration, 0.4);
  const easeOut = Math.min(easeOutDuration / totalDuration, 0.4);

  if (t < easeIn) {
    // Ease-in: quadratic
    const localT = t / easeIn;
    return easeIn * localT * localT;
  } else if (t > 1 - easeOut) {
    // Ease-out: quadratic
    const localT = (t - (1 - easeOut)) / easeOut;
    const easedEnd = 1 - easeOut;
    return easedEnd + easeOut * (1 - (1 - localT) * (1 - localT));
  } else {
    // Linear middle section, but remap to connect smoothly
    const startSpeed = 2 * easeIn; // derivative at end of ease-in
    const midProgress = (t - easeIn) / (1 - easeIn - easeOut);
    const easedStart = easeIn;
    const easedEnd = 1 - easeOut;
    return easedStart + midProgress * (easedEnd - easedStart);
  }
}

// ---------------------------------------------------------------------------
// Internal: Compute Subject Velocity at a Point on the Curve
// ---------------------------------------------------------------------------

/**
 * Estimate subject velocity (tangent direction × speed) at a curve parameter t.
 */
function computeSubjectVelocity(
  curve: THREE.CatmullRomCurve3,
  t: number,
  totalLength: number,
  duration: number
): THREE.Vector3 {
  const dt = 0.001;
  const t0 = Math.max(0, t - dt);
  const t1 = Math.min(1, t + dt);

  const p0 = curve.getPointAt(t0);
  const p1 = curve.getPointAt(t1);

  const velocity = new THREE.Vector3().subVectors(p1, p0).divideScalar((t1 - t0) * duration);
  return velocity;
}

// ---------------------------------------------------------------------------
// Internal: Compute Camera Position for a Given Subject State
// ---------------------------------------------------------------------------

/**
 * Compute the camera position based on the subject position, velocity,
 * and the tracking offset mode.
 */
function computeCameraPosition(
  subjectPos: THREE.Vector3,
  subjectVelocity: THREE.Vector3,
  config: Required<TrackingShotConfig>
): THREE.Vector3 {
  const speed = subjectVelocity.length();
  const moveDir = speed > 0.001
    ? subjectVelocity.clone().normalize()
    : new THREE.Vector3(0, 0, 1);

  // Right vector (perpendicular to movement in the horizontal plane)
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(moveDir, up).normalize();
  if (right.lengthSq() < 0.001) {
    right.set(1, 0, 0);
  }

  // Base distance (may be dynamic)
  let distance = config.baseDistance;
  if (config.dynamicDistance) {
    // Increase distance with speed
    const speedFactor = Math.min(speed / 5, 1); // normalize: 5 m/s = max
    distance = THREE.MathUtils.lerp(config.minDistance, config.maxDistance, speedFactor);
  }

  // Compute offset based on mode
  let offset: THREE.Vector3;

  switch (config.offsetMode) {
    case 'leading': {
      // Camera ahead of the subject, looking back
      offset = moveDir.clone().multiplyScalar(distance)
        .add(up.clone().multiplyScalar(config.verticalOffset));
      break;
    }
    case 'trailing': {
      // Camera behind the subject, looking forward
      offset = moveDir.clone().multiplyScalar(-distance)
        .add(up.clone().multiplyScalar(config.verticalOffset));
      break;
    }
    case 'side_left': {
      // Camera to the left of the movement direction
      offset = right.clone().multiplyScalar(-config.sideOffset)
        .add(moveDir.clone().multiplyScalar(-distance * 0.3))
        .add(up.clone().multiplyScalar(config.verticalOffset));
      break;
    }
    case 'side_right': {
      // Camera to the right of the movement direction
      offset = right.clone().multiplyScalar(config.sideOffset)
        .add(moveDir.clone().multiplyScalar(-distance * 0.3))
        .add(up.clone().multiplyScalar(config.verticalOffset));
      break;
    }
    case 'orbit': {
      // Camera orbits slightly around the subject as it moves
      const orbitAngle = Math.atan2(moveDir.x, moveDir.z) + Math.PI * 0.25;
      offset = new THREE.Vector3(
        Math.cos(orbitAngle) * distance,
        config.verticalOffset,
        Math.sin(orbitAngle) * distance
      );
      break;
    }
    default: {
      // Default: trailing
      offset = moveDir.clone().multiplyScalar(-distance)
        .add(up.clone().multiplyScalar(config.verticalOffset));
      break;
    }
  }

  return subjectPos.clone().add(offset);
}

// ---------------------------------------------------------------------------
// Main: Create Tracking Shot
// ---------------------------------------------------------------------------

/**
 * Create a tracking shot that follows a subject along a path.
 * Supports predictive tracking, speed ramping, multiple offset modes,
 * and dynamic distance adjustment.
 *
 * @returns Array of Keyframes for the TrajectoryGenerator pipeline.
 */
export function createTrackingShot(config: TrackingShotConfig): Keyframe[] {
  const fullConfig: Required<TrackingShotConfig> = {
    subjectPath: config.subjectPath,
    duration: config.duration ?? 5,
    baseDistance: config.baseDistance ?? 3,
    cameraHeight: config.cameraHeight ?? 1.6,
    offsetMode: config.offsetMode ?? 'trailing',
    sideOffset: config.sideOffset ?? 2,
    verticalOffset: config.verticalOffset ?? 1.0,
    lookAheadTime: config.lookAheadTime ?? 0.15,
    speedRamping: config.speedRamping ?? true,
    easeInDuration: config.easeInDuration ?? 0.5,
    easeOutDuration: config.easeOutDuration ?? 0.5,
    dynamicDistance: config.dynamicDistance ?? false,
    minDistance: config.minDistance ?? 2,
    maxDistance: config.maxDistance ?? 6,
    seed: config.seed ?? 42,
    samplesPerSecond: config.samplesPerSecond ?? 60,
    subjectSpeed: config.subjectSpeed ?? 0,
  };

  const { duration, samplesPerSecond, speedRamping, easeInDuration, easeOutDuration } = fullConfig;

  // Create smooth subject path
  const subjectCurve = createSubjectCurve(fullConfig.subjectPath);
  const totalLength = subjectCurve.getLength();

  const keyframes: Keyframe[] = [];
  const totalSamples = Math.ceil(duration * samplesPerSecond);

  for (let i = 0; i <= totalSamples; i++) {
    const t = i / totalSamples;
    const time = t * duration;

    // Apply speed ramping to get the actual curve parameter
    const curveParam = speedRamping
      ? applySpeedRamping(t, easeInDuration, easeOutDuration, duration)
      : t;

    // Get subject position on curve
    const subjectPos = subjectCurve.getPointAt(THREE.MathUtils.clamp(curveParam, 0, 1));

    // Predictive tracking: look ahead on the curve
    const lookAheadParam = Math.min(1, curveParam + fullConfig.lookAheadTime / duration);
    const predictedPos = subjectCurve.getPointAt(lookAheadParam);

    // Compute velocity for offset calculation
    const velocity = computeSubjectVelocity(subjectCurve, curveParam, totalLength, duration);

    // Compute camera position
    let cameraPos = computeCameraPosition(subjectPos, velocity, fullConfig);

    // Set camera height
    cameraPos.y = fullConfig.cameraHeight;

    // Target is the predicted position (look-ahead) for smoother panning
    const target = predictedPos.clone();
    target.y = subjectPos.y; // Keep target at subject height, not predicted height

    keyframes.push({
      time,
      position: cameraPos,
      target,
      fov: 75,
      roll: 0,
    });
  }

  // Smooth the camera path using a secondary CatmullRom pass
  return smoothCameraPath(keyframes);
}

// ---------------------------------------------------------------------------
// Internal: Smooth Camera Path
// ---------------------------------------------------------------------------

/**
 * Apply a smoothing pass to the camera positions to remove jitter
 * while preserving the overall tracking motion.
 */
function smoothCameraPath(keyframes: Keyframe[], smoothingWindow: number = 5): Keyframe[] {
  if (keyframes.length < smoothingWindow * 2) return keyframes;

  const smoothed: Keyframe[] = [];
  const halfWindow = Math.floor(smoothingWindow / 2);

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];

    // Gather neighbors
    const startPos = new THREE.Vector3();
    const startTarget = new THREE.Vector3();
    let count = 0;

    for (let j = Math.max(0, i - halfWindow); j <= Math.min(keyframes.length - 1, i + halfWindow); j++) {
      startPos.add(keyframes[j].position);
      if (keyframes[j].target) {
        startTarget.add(keyframes[j].target!);
      }
      count++;
    }

    smoothed.push({
      time: kf.time,
      position: startPos.divideScalar(count),
      target: startTarget.divideScalar(count),
      fov: kf.fov,
      roll: kf.roll,
    });
  }

  return smoothed;
}

// ---------------------------------------------------------------------------
// Dynamic Distance Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a distance schedule that adjusts camera distance based on
 * planned subject speed along the curve.
 * Returns an array of { t, distance } pairs.
 */
export function computeDynamicDistanceSchedule(
  subjectPath: THREE.Vector3[],
  duration: number,
  baseDistance: number,
  minDistance: number,
  maxDistance: number,
  samples: number = 100
): Array<{ t: number; distance: number }> {
  const curve = createSubjectCurve(subjectPath);
  const schedule: Array<{ t: number; distance: number }> = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const velocity = computeSubjectVelocity(curve, t, curve.getLength(), duration);
    const speed = velocity.length();

    // Map speed to distance
    const maxSpeed = 5; // m/s reference
    const speedFactor = Math.min(speed / maxSpeed, 1);
    const distance = THREE.MathUtils.lerp(minDistance, maxDistance, speedFactor);

    schedule.push({ t, distance });
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Trajectory Generation
// ---------------------------------------------------------------------------

/**
 * Generate a fully sampled trajectory from a tracking shot config.
 */
export function generateTrackingTrajectory(config: TrackingShotConfig): TrajectorySample[] {
  const keyframes = createTrackingShot(config);
  return generateTrajectory(keyframes, {
    keyframes,
    interpolation: InterpolationMode.CatmullRom,
    duration: config.duration ?? 5,
    samplesPerSecond: config.samplesPerSecond ?? 60,
  });
}

// ---------------------------------------------------------------------------
// Real-Time Tracking Simulator
// ---------------------------------------------------------------------------

/**
 * Stateful tracking shot simulator for real-time per-frame evaluation.
 * Useful when the subject path is known but you need to sample at
 * arbitrary times during gameplay or interactive sessions.
 */
export class TrackingShotSimulator {
  private curve: THREE.CatmullRomCurve3;
  private config: Required<TrackingShotConfig>;

  constructor(config: TrackingShotConfig) {
    this.config = {
      subjectPath: config.subjectPath,
      duration: config.duration ?? 5,
      baseDistance: config.baseDistance ?? 3,
      cameraHeight: config.cameraHeight ?? 1.6,
      offsetMode: config.offsetMode ?? 'trailing',
      sideOffset: config.sideOffset ?? 2,
      verticalOffset: config.verticalOffset ?? 1.0,
      lookAheadTime: config.lookAheadTime ?? 0.15,
      speedRamping: config.speedRamping ?? true,
      easeInDuration: config.easeInDuration ?? 0.5,
      easeOutDuration: config.easeOutDuration ?? 0.5,
      dynamicDistance: config.dynamicDistance ?? false,
      minDistance: config.minDistance ?? 2,
      maxDistance: config.maxDistance ?? 6,
      seed: config.seed ?? 42,
      samplesPerSecond: config.samplesPerSecond ?? 60,
      subjectSpeed: config.subjectSpeed ?? 0,
    };

    this.curve = createSubjectCurve(this.config.subjectPath);
  }

  /**
   * Evaluate the tracking shot state at a given time.
   * Returns camera position, target, and FOV.
   */
  evaluate(time: number): { position: THREE.Vector3; target: THREE.Vector3; fov: number } {
    const t = THREE.MathUtils.clamp(time / this.config.duration, 0, 1);

    const curveParam = this.config.speedRamping
      ? applySpeedRamping(t, this.config.easeInDuration, this.config.easeOutDuration, this.config.duration)
      : t;

    const subjectPos = this.curve.getPointAt(THREE.MathUtils.clamp(curveParam, 0, 0.999));
    const lookAheadParam = Math.min(0.999, curveParam + this.config.lookAheadTime / this.config.duration);
    const predictedPos = this.curve.getPointAt(lookAheadParam);

    const velocity = computeSubjectVelocity(this.curve, curveParam, this.curve.getLength(), this.config.duration);

    let cameraPos = computeCameraPosition(subjectPos, velocity, this.config);
    cameraPos.y = this.config.cameraHeight;

    const target = predictedPos.clone();
    target.y = subjectPos.y;

    return { position: cameraPos, target, fov: 75 };
  }

  /** Get the underlying CatmullRom curve (e.g., for visualization) */
  getCurve(): THREE.CatmullRomCurve3 {
    return this.curve;
  }
}

// Legacy re-exports for backwards compatibility
export type TrackingShotConfig_alias = TrackingShotConfig;

export default {
  createTrackingShot,
  generateTrackingTrajectory,
  computeDynamicDistanceSchedule,
  TrackingShotSimulator,
};
