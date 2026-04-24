import * as THREE from 'three';

/**
 * Keyframe definition for camera trajectories
 */
export interface Keyframe {
  time: number;
  position: THREE.Vector3;
  target?: THREE.Vector3;
  fov?: number;
  roll?: number;
}

/**
 * Trajectory sample point
 */
export interface TrajectorySample {
  time: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  roll: number;
}

/**
 * Interpolation types for smooth camera motion
 */
export enum InterpolationMode {
  Linear = 'linear',
  CatmullRom = 'catmullrom',
  Bezier = 'bezier',
  Step = 'step',
}

/**
 * Trajectory configuration
 */
export interface TrajectoryConfig {
  keyframes: Keyframe[];
  interpolation?: InterpolationMode;
  loop?: boolean;
  duration?: number;
  samplesPerSecond?: number;
}

/**
 * Catmull-Rom spline interpolation for 3D vectors
 */
export function catmullRomSpline(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    ((2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

  const y =
    0.5 *
    ((2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

  const z =
    0.5 *
    ((2 * p1.z) +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);

  return new THREE.Vector3(x, y, z);
}

/**
 * Linear interpolation between two 3D points
 */
export function interpolatePosition(
  start: THREE.Vector3,
  end: THREE.Vector3,
  t: number
): THREE.Vector3 {
  return new THREE.Vector3().lerpVectors(start, end, t);
}

/**
 * Bezier interpolation with control points
 */
export function bezierInterpolate(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number
): THREE.Vector3 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
  const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;
  const z = mt3 * p0.z + 3 * mt2 * t * p1.z + 3 * mt * t2 * p2.z + t3 * p3.z;

  return new THREE.Vector3(x, y, z);
}

/**
 * Generate smooth trajectory from keyframes
 */
export function generateTrajectory(
  keyframes: Keyframe[],
  config: TrajectoryConfig = { keyframes, interpolation: InterpolationMode.CatmullRom }
): TrajectorySample[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) {
    const kf = keyframes[0];
    return [
      {
        time: kf.time,
        position: kf.position.clone(),
        target: kf.target?.clone() || new THREE.Vector3(0, 0, 0),
        up: new THREE.Vector3(0, 1, 0),
        fov: kf.fov ?? 75,
        roll: kf.roll ?? 0,
      },
    ];
  }

  const interpolation = config.interpolation ?? InterpolationMode.CatmullRom;
  const samplesPerSecond = config.samplesPerSecond ?? 60;
  const duration = config.duration ?? keyframes[keyframes.length - 1].time;
  const totalSamples = Math.ceil(duration * samplesPerSecond);
  const samples: TrajectorySample[] = [];

  // Sort keyframes by time
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

  for (let i = 0; i < totalSamples; i++) {
    const time = (i / totalSamples) * duration;
    const sample = sampleAtTime(sortedKeyframes, time, interpolation);
    if (sample) {
      samples.push(sample);
    }
  }

  // Add final keyframe
  const lastKf = sortedKeyframes[sortedKeyframes.length - 1];
  samples.push({
    time: lastKf.time,
    position: lastKf.position.clone(),
    target: lastKf.target?.clone() || new THREE.Vector3(0, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: lastKf.fov ?? 75,
    roll: lastKf.roll ?? 0,
  });

  return samples;
}

/**
 * Sample trajectory at specific time
 */
function sampleAtTime(
  keyframes: Keyframe[],
  time: number,
  mode: InterpolationMode
): TrajectorySample | null {
  if (keyframes.length === 0) return null;

  // Clamp time to valid range
  const clampedTime = Math.max(keyframes[0].time, Math.min(keyframes[keyframes.length - 1].time, time));

  // Find surrounding keyframes
  let prevIndex = 0;
  let nextIndex = keyframes.length - 1;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (clampedTime >= keyframes[i].time && clampedTime <= keyframes[i + 1].time) {
      prevIndex = i;
      nextIndex = i + 1;
      break;
    }
  }

  const prev = keyframes[prevIndex];
  const next = keyframes[nextIndex];

  if (prev.time === next.time) {
    return {
      time: prev.time,
      position: prev.position.clone(),
      target: prev.target?.clone() || new THREE.Vector3(0, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      fov: prev.fov ?? 75,
      roll: prev.roll ?? 0,
    };
  }

  // Normalized time within segment
  const t = (clampedTime - prev.time) / (next.time - prev.time);

  // Apply easing (smoothstep for smoother motion)
  const easedT = t * t * (3 - 2 * t);

  let position: THREE.Vector3;

  switch (mode) {
    case InterpolationMode.Linear:
      position = interpolatePosition(prev.position, next.position, easedT);
      break;
    case InterpolationMode.CatmullRom: {
      // Get neighboring points for spline
      const p0 = keyframes[Math.max(0, prevIndex - 1)]?.position || prev.position;
      const p1 = prev.position;
      const p2 = next.position;
      const p3 = keyframes[Math.min(keyframes.length - 1, nextIndex + 1)]?.position || next.position;
      position = catmullRomSpline(p0, p1, p2, p3, easedT);
      break;
    }
    case InterpolationMode.Bezier: {
      // Use adjacent keyframes as control points
      const p0 = prev.position;
      const p1 = prev.position.clone().lerp(next.position, 0.33);
      const p2 = prev.position.clone().lerp(next.position, 0.66);
      const p3 = next.position;
      position = bezierInterpolate(p0, p1, p2, p3, easedT);
      break;
    }
    case InterpolationMode.Step:
    default:
      position = prev.position.clone();
      break;
  }

  // Interpolate target
  const target = new THREE.Vector3().lerpVectors(
    prev.target || new THREE.Vector3(0, 0, 0),
    next.target || new THREE.Vector3(0, 0, 0),
    easedT
  );

  // Interpolate FOV and roll
  const fov = THREE.MathUtils.lerp(prev.fov ?? 75, next.fov ?? 75, easedT);
  const roll = THREE.MathUtils.lerp(prev.roll ?? 0, next.roll ?? 0, easedT);

  return {
    time: clampedTime,
    position,
    target,
    up: new THREE.Vector3(0, 1, 0),
    fov,
    roll,
  };
}

/**
 * Create a Three.js Curve from trajectory for visualization
 */
export function createCurveFromTrajectory(samples: TrajectorySample[]): THREE.Curve<THREE.Vector3> {
  const points = samples.map((s) => s.position);
  return new THREE.CatmullRomCurve3(points);
}

/**
 * Calculate trajectory length
 */
export function calculateTrajectoryLength(samples: TrajectorySample[]): number {
  if (samples.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < samples.length; i++) {
    length += samples[i].position.distanceTo(samples[i - 1].position);
  }
  return length;
}

/**
 * Resample trajectory at uniform distances
 */
export function resampleUniform(
  samples: TrajectorySample[],
  segmentLength: number
): TrajectorySample[] {
  if (samples.length < 2) return samples;

  const totalLength = calculateTrajectoryLength(samples);
  const numSegments = Math.floor(totalLength / segmentLength);
  const resampled: TrajectorySample[] = [];

  let accumulatedDist = 0;
  let targetDist = segmentLength;
  let prevSample = samples[0];
  resampled.push(prevSample);

  for (let i = 1; i < samples.length; i++) {
    const currSample = samples[i];
    const dist = prevSample.position.distanceTo(currSample.position);
    accumulatedDist += dist;

    while (accumulatedDist >= targetDist && resampled.length < numSegments) {
      const ratio = (targetDist - (accumulatedDist - dist)) / dist;
      const interpolated: TrajectorySample = {
        time: THREE.MathUtils.lerp(prevSample.time, currSample.time, ratio),
        position: new THREE.Vector3().lerpVectors(prevSample.position, currSample.position, ratio),
        target: new THREE.Vector3().lerpVectors(prevSample.target, currSample.target, ratio),
        up: new THREE.Vector3().lerpVectors(prevSample.up, currSample.up, ratio),
        fov: THREE.MathUtils.lerp(prevSample.fov, currSample.fov, ratio),
        roll: THREE.MathUtils.lerp(prevSample.roll, currSample.roll, ratio),
      };
      resampled.push(interpolated);
      targetDist += segmentLength;
    }

    prevSample = currSample;
  }

  // Add final sample
  resampled.push(samples[samples.length - 1]);

  return resampled;
}

export default {
  generateTrajectory,
  interpolatePosition,
  catmullRomSpline,
  bezierInterpolate,
  createCurveFromTrajectory,
  calculateTrajectoryLength,
  resampleUniform,
  InterpolationMode,
};
