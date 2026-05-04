/**
 * Camera Trajectory Implementations for Infinigen R3F
 *
 * Implements all 7 trajectory types as functional classes with
 * catmull-rom interpolation and collision avoidance.
 *
 * Phase 4.1 — Camera System
 */

import * as THREE from 'three';
import {
  type Keyframe,
  type TrajectorySample,
  InterpolationMode,
  generateTrajectory,
  catmullRomSpline,
} from './TrajectoryGenerator';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TrajectoryBaseConfig {
  /** Duration in seconds */
  duration: number;
  /** Samples per second for output */
  samplesPerSecond?: number;
  /** Terrain height sampler for collision avoidance */
  terrainSampler?: (x: number, z: number) => number;
  /** Minimum clearance above terrain (meters) */
  minTerrainClearance?: number;
}

export interface CameraKeyframe extends Keyframe {
  fStop?: number;
  focusDistance?: number;
}

// ---------------------------------------------------------------------------
// 1. OrbitShot
// ---------------------------------------------------------------------------

export interface OrbitShotConfig extends TrajectoryBaseConfig {
  center: THREE.Vector3;
  radius: number;
  startAngle?: number;
  endAngle?: number;
  elevation?: number;
  clockwise?: boolean;
}

export class OrbitShot {
  generate(config: OrbitShotConfig): TrajectorySample[] {
    const {
      center,
      radius,
      startAngle = 0,
      endAngle = Math.PI * 2,
      elevation = Math.PI / 6,
      clockwise = true,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    const totalAngle = endAngle - startAngle;
    const dir = clockwise ? -1 : 1;

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;
      const angle = startAngle + dir * totalAngle * t;

      const x = center.x + radius * Math.cos(elevation) * Math.cos(angle);
      const y = center.y + radius * Math.sin(elevation);
      const z = center.z + radius * Math.cos(elevation) * Math.sin(angle);

      const position = new THREE.Vector3(x, y, z);

      // Collision avoidance
      if (terrainSampler) {
        const terrainH = terrainSampler(x, z);
        if (position.y - terrainH < minTerrainClearance) {
          position.y = terrainH + minTerrainClearance;
        }
      }

      keyframes.push({ time, position, target: center.clone(), fov: 75, roll: 0 });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. PanTilt
// ---------------------------------------------------------------------------

export interface PanTiltConfig extends TrajectoryBaseConfig {
  position: THREE.Vector3;
  panStartAngle?: number;
  panEndAngle?: number;
  tiltStartAngle?: number;
  tiltEndAngle?: number;
  distance?: number;
}

export class PanTilt {
  generate(config: PanTiltConfig): TrajectorySample[] {
    const {
      position,
      panStartAngle = 0,
      panEndAngle = Math.PI / 3,
      tiltStartAngle = 0,
      tiltEndAngle = Math.PI / 8,
      distance = 20,
      duration,
      samplesPerSecond = 60,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;
      const pan = panStartAngle + (panEndAngle - panStartAngle) * t;
      const tilt = tiltStartAngle + (tiltEndAngle - tiltStartAngle) * t;

      const target = new THREE.Vector3(
        position.x + Math.sin(pan) * Math.cos(tilt) * distance,
        position.y + Math.sin(tilt) * distance,
        position.z + Math.cos(pan) * Math.cos(tilt) * distance,
      );

      keyframes.push({ time, position: position.clone(), target, fov: 75, roll: 0 });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. DollyShot
// ---------------------------------------------------------------------------

export interface DollyConfig extends TrajectoryBaseConfig {
  start: THREE.Vector3;
  end: THREE.Vector3;
  target?: THREE.Vector3;
  fovStart?: number;
  fovEnd?: number;
  easeIn?: boolean;
  easeOut?: boolean;
}

export class DollyShot {
  generate(config: DollyConfig): TrajectorySample[] {
    const {
      start,
      end,
      target = new THREE.Vector3(0, 0, 0),
      fovStart = 75,
      fovEnd = 75,
      easeIn = true,
      easeOut = true,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;

      let easedT = t;
      if (easeIn && easeOut) {
        easedT = t * t * (3 - 2 * t);
      } else if (easeIn) {
        easedT = t * t;
      } else if (easeOut) {
        easedT = t * (2 - t);
      }

      const position = new THREE.Vector3().lerpVectors(start, end, easedT);

      // Collision avoidance
      if (terrainSampler) {
        const terrainH = terrainSampler(position.x, position.z);
        if (position.y - terrainH < minTerrainClearance) {
          position.y = terrainH + minTerrainClearance;
        }
      }

      const fov = THREE.MathUtils.lerp(fovStart, fovEnd, easedT);
      keyframes.push({ time, position, target: target.clone(), fov, roll: 0 });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. TrackingShot
// ---------------------------------------------------------------------------

export interface TrackingConfig extends TrajectoryBaseConfig {
  /** Subject position keyframes (the moving target to follow) */
  subjectPositions: THREE.Vector3[];
  /** Offset from subject (camera follows at this offset) */
  offset: THREE.Vector3;
  /** Look-ahead time for smoother following (seconds) */
  lookAhead?: number;
}

export class TrackingShot {
  generate(config: TrackingConfig): TrajectorySample[] {
    const {
      subjectPositions,
      offset,
      lookAhead = 0,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);
    const subjectCount = subjectPositions.length;

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;

      // Interpolate subject position
      const subjectIdx = Math.min(Math.floor(t * (subjectCount - 1)), subjectCount - 2);
      const subjectFrac = t * (subjectCount - 1) - subjectIdx;
      const subjectPos = new THREE.Vector3().lerpVectors(
        subjectPositions[subjectIdx],
        subjectPositions[Math.min(subjectIdx + 1, subjectCount - 1)],
        subjectFrac,
      );

      // Look-ahead: target is slightly ahead of subject
      const aheadT = Math.min(t + lookAhead / duration, 1);
      const aheadIdx = Math.min(Math.floor(aheadT * (subjectCount - 1)), subjectCount - 2);
      const aheadFrac = aheadT * (subjectCount - 1) - aheadIdx;
      const aheadPos = new THREE.Vector3().lerpVectors(
        subjectPositions[aheadIdx],
        subjectPositions[Math.min(aheadIdx + 1, subjectCount - 1)],
        aheadFrac,
      );

      // Camera position = subject + offset
      const position = subjectPos.clone().add(offset);

      // Collision avoidance
      if (terrainSampler) {
        const terrainH = terrainSampler(position.x, position.z);
        if (position.y - terrainH < minTerrainClearance) {
          position.y = terrainH + minTerrainClearance;
        }
      }

      keyframes.push({ time, position, target: aheadPos, fov: 75, roll: 0 });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. CraneShot
// ---------------------------------------------------------------------------

export interface CraneConfig extends TrajectoryBaseConfig {
  start: THREE.Vector3;
  end: THREE.Vector3;
  target?: THREE.Vector3;
  arcHeight?: number;
  easeIn?: boolean;
  easeOut?: boolean;
}

export class CraneShot {
  generate(config: CraneConfig): TrajectorySample[] {
    const {
      start,
      end,
      target = new THREE.Vector3(0, 0, 0),
      arcHeight = 0,
      easeIn = true,
      easeOut = true,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;

      let easedT = t;
      if (easeIn && easeOut) {
        easedT = t * t * (3 - 2 * t);
      } else if (easeIn) {
        easedT = t * t;
      } else if (easeOut) {
        easedT = t * (2 - t);
      }

      const arcOffset = arcHeight > 0 ? Math.sin(t * Math.PI) * arcHeight : 0;

      const position = new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, end.x, easedT),
        THREE.MathUtils.lerp(start.y, end.y, easedT) + arcOffset,
        THREE.MathUtils.lerp(start.z, end.z, easedT),
      );

      // Collision avoidance
      if (terrainSampler) {
        const terrainH = terrainSampler(position.x, position.z);
        if (position.y - terrainH < minTerrainClearance) {
          position.y = terrainH + minTerrainClearance;
        }
      }

      keyframes.push({ time, position, target: target.clone(), fov: 75, roll: 0 });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 6. HandheldSim
// ---------------------------------------------------------------------------

export interface HandheldConfig extends TrajectoryBaseConfig {
  basePosition: THREE.Vector3;
  target?: THREE.Vector3;
  /** Shake intensity (meters) */
  intensity?: number;
  /** Shake frequency (Hz) */
  frequency?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

export class HandheldSim {
  generate(config: HandheldConfig): TrajectorySample[] {
    const {
      basePosition,
      target = new THREE.Vector3(0, 0, 0),
      intensity = 0.05,
      frequency = 2,
      seed = 42,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    const keyframes: Keyframe[] = [];
    const totalSamples = Math.ceil(duration * samplesPerSecond);

    // Seeded PRNG
    let s = seed;
    const rand = () => {
      s = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
      return s - Math.floor(s);
    };

    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const time = t * duration;

      // Brownian noise — multiple octaves of sine for organic jitter
      const shakeX =
        Math.sin(time * frequency * 2 * Math.PI) * intensity +
        Math.sin(time * frequency * 3.7 * Math.PI + rand()) * intensity * 0.5 +
        Math.sin(time * frequency * 5.3 * Math.PI + rand()) * intensity * 0.25;

      const shakeY =
        Math.sin(time * frequency * 2.5 * Math.PI + rand()) * intensity +
        Math.sin(time * frequency * 4.1 * Math.PI + rand()) * intensity * 0.5;

      const shakeZ =
        Math.sin(time * frequency * 1.8 * Math.PI) * intensity * 0.5 +
        Math.sin(time * frequency * 2.9 * Math.PI + rand()) * intensity * 0.25;

      const position = new THREE.Vector3(
        basePosition.x + shakeX,
        basePosition.y + shakeY,
        basePosition.z + shakeZ,
      );

      // Collision avoidance
      if (terrainSampler) {
        const terrainH = terrainSampler(position.x, position.z);
        if (position.y - terrainH < minTerrainClearance) {
          position.y = terrainH + minTerrainClearance;
        }
      }

      const roll = Math.sin(time * frequency * Math.PI) * 0.02;
      keyframes.push({ time, position, target: target.clone(), fov: 75, roll });
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// 7. GoToProposals
// ---------------------------------------------------------------------------

export interface GoToProposalsConfig extends TrajectoryBaseConfig {
  /** Pre-computed viewpoints to visit in order */
  viewpoints: THREE.Vector3[];
  /** Look-at target at each viewpoint (or single target) */
  targets?: THREE.Vector3[];
  /** Pause time at each viewpoint (seconds) */
  pauseDuration?: number;
}

export class GoToProposals {
  generate(config: GoToProposalsConfig): TrajectorySample[] {
    const {
      viewpoints,
      targets = [],
      pauseDuration = 1,
      duration,
      samplesPerSecond = 60,
      terrainSampler,
      minTerrainClearance = 1,
    } = config;

    if (viewpoints.length < 2) {
      return [];
    }

    const keyframes: Keyframe[] = [];
    const segmentDuration = duration / (viewpoints.length - 1);
    const pauseFraction = pauseDuration / segmentDuration;
    let currentTime = 0;

    for (let v = 0; v < viewpoints.length - 1; v++) {
      const startPos = viewpoints[v];
      const endPos = viewpoints[v + 1];
      const target =
        targets[Math.min(v, targets.length - 1)] ??
        new THREE.Vector3(0, 0, 0);

      const segSamples = Math.ceil(segmentDuration * samplesPerSecond);

      for (let i = 0; i <= segSamples; i++) {
        const t = i / segSamples;
        const time = currentTime + t * segmentDuration;

        // Ease in-out for smooth transitions
        const easedT = t < pauseFraction
          ? 0
          : t > 1 - pauseFraction
            ? 1
            : (t - pauseFraction) / (1 - 2 * pauseFraction);

        const smoothT = easedT * easedT * (3 - 2 * easedT);
        const position = new THREE.Vector3().lerpVectors(startPos, endPos, smoothT);

        // Collision avoidance
        if (terrainSampler) {
          const terrainH = terrainSampler(position.x, position.z);
          if (position.y - terrainH < minTerrainClearance) {
            position.y = terrainH + minTerrainClearance;
          }
        }

        keyframes.push({ time, position, target: target.clone(), fov: 75, roll: 0 });
      }

      currentTime += segmentDuration;
    }

    return generateTrajectory(keyframes, {
      keyframes,
      interpolation: InterpolationMode.CatmullRom,
      duration,
      samplesPerSecond,
    });
  }
}

// ---------------------------------------------------------------------------
// Factory — create trajectory by type name
// ---------------------------------------------------------------------------

export type TrajectoryTypeName =
  | 'orbit'
  | 'pantilt'
  | 'dolly'
  | 'tracking'
  | 'crane'
  | 'handheld'
  | 'goto';

export function createTrajectory(
  type: TrajectoryTypeName,
  config: any,
): TrajectorySample[] {
  switch (type) {
    case 'orbit':
      return new OrbitShot().generate(config);
    case 'pantilt':
      return new PanTilt().generate(config);
    case 'dolly':
      return new DollyShot().generate(config);
    case 'tracking':
      return new TrackingShot().generate(config);
    case 'crane':
      return new CraneShot().generate(config);
    case 'handheld':
      return new HandheldSim().generate(config);
    case 'goto':
      return new GoToProposals().generate(config);
    default:
      throw new Error(`Unknown trajectory type: ${type}`);
  }
}

/**
 * Default export – OrbitShot, the primary trajectory implementation.
 *
 * Previously this file exported a bag-of-symbols object as default.  All
 * symbols remain available as named exports.
 */
export default OrbitShot;
