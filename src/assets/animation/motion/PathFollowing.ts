import { Vector3 } from 'three';
import { Quaternion } from '../../../core/util/math/quaternion';

/**
 * Spline Types
 */
export type SplineType = 'catmull-rom' | 'bezier' | 'bspline' | 'linear';

/**
 * Orientation Mode for path following
 */
export type OrientationMode = 
  | 'tangent'        // Face direction of travel
  | 'lookAt'         // Face a specific target
  | 'frenet'         // Use Frenet frame (tangent, normal, binormal)
  | 'fixed';         // Maintain fixed orientation

/**
 * Keyframe for spline definition
 */
export interface SplineKeyframe {
  position: Vector3;
  inTangent?: Vector3;  // For Bezier
  outTangent?: Vector3; // For Bezier
  time?: number;        // Optional timing
}

/**
 * Path Following Configuration
 */
export interface PathFollowingConfig {
  splineType?: SplineType;
  orientationMode?: OrientationMode;
  lookAtTarget?: Vector3;
  fixedOrientation?: Quaternion;
  upVector?: Vector3;
  speed?: number;
  loop?: boolean;
  autoRotate?: boolean;
  rotationOffset?: Quaternion;
}

/**
 * Sample point on a path
 */
export interface PathSample {
  position: Vector3;
  tangent: Vector3;
  normal?: Vector3;
  binormal?: Vector3;
  progress: number; // 0-1 along path
}

/**
 * Catmull-Rom Spline implementation
 */
class CatmullRomSpline {
  private points: Vector3[];
  private closed: boolean;

  constructor(points: Vector3[], closed: boolean = false) {
    this.points = points;
    this.closed = closed;
  }

  /**
   * Get point at t (0-1)
   */
  getPoint(t: number): Vector3 {
    const l = this.closed ? this.points.length : this.points.length - 1;
    const scaledT = t * l;
    const p0 = Math.floor(scaledT);
    const p1 = p0 + 1;
    const alpha = scaledT - p0;

    const i0 = this.wrapIndex(p0 - 1);
    const i1 = this.wrapIndex(p0);
    const i2 = this.wrapIndex(p1);
    const i3 = this.wrapIndex(p1 + 1);

    return this.catmullRom(
      this.points[i0],
      this.points[i1],
      this.points[i2],
      this.points[i3],
      alpha
    );
  }

  /**
   * Get tangent at t (0-1)
   */
  getTangent(t: number, delta: number = 0.001): Vector3 {
    const t1 = Math.min(1, t + delta);
    const t0 = Math.max(0, t - delta);
    
    const p1 = this.getPoint(t1);
    const p0 = this.getPoint(t0);
    
    return p1.clone().sub(p0).normalize();
  }

  /**
   * Wrap index for closed splines
   */
  private wrapIndex(i: number): number {
    if (this.closed) {
      return ((i % this.points.length) + this.points.length) % this.points.length;
    }
    return Math.max(0, Math.min(this.points.length - 1, i));
  }

  /**
   * Catmull-Rom interpolation
   */
  private catmullRom(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;

    const v0 = (p2.clone().sub(p0)).multiplyScalar(0.5);
    const v1 = (p3.clone().sub(p1)).multiplyScalar(0.5);

    const a = p1.clone().multiplyScalar(2 * t3 - 3 * t2 + 1);
    const b = v0.multiplyScalar(t3 - 2 * t2 + t);
    const c = v1.multiplyScalar(t3 - t2);
    const d = p2.clone().multiplyScalar(-2 * t3 + 3 * t2);

    return a.add(b).add(c).add(d);
  }
}

/**
 * Bezier Spline implementation (Cubic)
 */
class BezierSpline {
  private keyframes: SplineKeyframe[];
  private closed: boolean;

  constructor(keyframes: SplineKeyframe[], closed: boolean = false) {
    this.keyframes = keyframes;
    this.closed = closed;
  }

  /**
   * Get point at t (0-1)
   */
  getPoint(t: number): Vector3 {
    const l = this.closed ? this.keyframes.length : this.keyframes.length - 1;
    const scaledT = t * l;
    const segment = Math.floor(scaledT);
    const alpha = scaledT - segment;

    const i0 = this.wrapIndex(segment);
    const i1 = this.wrapIndex(segment + 1);

    const p0 = this.keyframes[i0].position;
    const p3 = this.keyframes[i1].position;
    
    // Get tangents
    const cp0 = this.keyframes[i0].outTangent || p0.clone().lerp(p3, 1/3);
    const cp1 = this.keyframes[i1].inTangent || p0.clone().lerp(p3, 2/3);

    return this.cubicBezier(p0, cp0, cp1, p3, alpha);
  }

  /**
   * Get tangent at t
   */
  getTangent(t: number, delta: number = 0.001): Vector3 {
    const t1 = Math.min(1, t + delta);
    const t0 = Math.max(0, t - delta);
    
    const p1 = this.getPoint(t1);
    const p0 = this.getPoint(t0);
    
    return p1.clone().sub(p0).normalize();
  }

  private wrapIndex(i: number): number {
    if (this.closed) {
      return ((i % this.keyframes.length) + this.keyframes.length) % this.keyframes.length;
    }
    return Math.max(0, Math.min(this.keyframes.length - 1, i));
  }

  private cubicBezier(p0: Vector3, cp0: Vector3, cp1: Vector3, p3: Vector3, t: number): Vector3 {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return p0.clone().multiplyScalar(mt3)
      .add(cp0.clone().multiplyScalar(3 * mt2 * t))
      .add(cp1.clone().multiplyScalar(3 * mt * t2))
      .add(p3.clone().multiplyScalar(t3));
  }
}

/**
 * Path Follower
 * 
 * Moves objects along spline paths with various orientation modes.
 */
export class PathFollower {
  private config: PathFollowingConfig;
  private spline: CatmullRomSpline | BezierSpline | null;
  private progress: number; // 0-1
  private distance: number;
  private isMoving: boolean;

  constructor(
    keyframes: Vector3[] | SplineKeyframe[],
    config: PathFollowingConfig = {}
  ) {
    this.config = {
      splineType: config.splineType ?? 'catmull-rom',
      orientationMode: config.orientationMode ?? 'tangent',
      lookAtTarget: config.lookAtTarget,
      fixedOrientation: config.fixedOrientation,
      upVector: config.upVector ?? new Vector3(0, 1, 0),
      speed: config.speed ?? 1,
      loop: config.loop ?? false,
      autoRotate: config.autoRotate ?? true,
      rotationOffset: config.rotationOffset,
    };

    this.progress = 0;
    this.distance = 0;
    this.isMoving = false;

    // Create spline based on type and input
    if (keyframes.length === 0) {
      this.spline = null;
      return;
    }

    const isVectorArray = keyframes.every(k => k instanceof Vector3);
    
    if (this.config.splineType === 'bezier') {
      this.spline = new BezierSpline(keyframes as SplineKeyframe[], this.config.loop);
    } else {
      const points = isVectorArray 
        ? keyframes as Vector3[] 
        : (keyframes as SplineKeyframe[]).map(k => k.position);
      this.spline = new CatmullRomSpline(points, this.config.loop);
    }
  }

  /**
   * Start moving along the path
   */
  start(): void {
    this.isMoving = true;
  }

  /**
   * Stop moving
   */
  stop(): void {
    this.isMoving = false;
  }

  /**
   * Pause movement
   */
  pause(): void {
    this.isMoving = false;
  }

  /**
   * Resume movement
   */
  resume(): void {
    this.isMoving = true;
  }

  /**
   * Seek to a specific progress
   * @param t - Progress value (0-1)
   */
  seek(t: number): void {
    this.progress = Math.max(0, Math.min(1, t));
  }

  /**
   * Update position along path
   * @param deltaTime - Time delta in seconds
   */
  update(deltaTime: number): PathSample | null {
    if (!this.isMoving || !this.spline) return null;

    // Calculate progress increment based on speed
    const speed = this.config.speed ?? 1;
    const progressDelta = deltaTime * speed;
    
    this.progress += progressDelta;

    // Handle loop or clamp
    if (this.progress >= 1) {
      if (this.config.loop) {
        this.progress = this.progress % 1;
      } else {
        this.progress = 1;
        this.isMoving = false;
      }
    } else if (this.progress < 0) {
      if (this.config.loop) {
        this.progress = 1 + (this.progress % 1);
      } else {
        this.progress = 0;
        this.isMoving = false;
      }
    }

    return this.sample(this.progress);
  }

  /**
   * Sample the path at given progress
   */
  sample(t: number): PathSample | null {
    if (!this.spline) return null;

    const clampedT = Math.max(0, Math.min(1, t));
    const position = this.spline.getPoint(clampedT);
    const tangent = this.spline.getTangent(clampedT);

    // Calculate normal and binormal for Frenet frame
    let normal: Vector3 | undefined;
    let binormal: Vector3 | undefined;

    if (this.config.orientationMode === 'frenet') {
      // Approximate normal using finite difference
      const delta = 0.001;
      const t1 = Math.min(1, clampedT + delta);
      const t0 = Math.max(0, clampedT - delta);
      
      const tan1 = this.spline.getTangent(t1);
      const tan0 = this.spline.getTangent(t0);
      
      normal = tan1.clone().sub(tan0).normalize();
      if (normal.lengthSq() < 0.0001) {
        // If no curvature, use up vector
        normal = this.config.upVector!.clone();
      }
      
      binormal = tangent.clone().cross(normal).normalize();
      normal = binormal.clone().cross(tangent).normalize();
    }

    return {
      position,
      tangent,
      normal,
      binormal,
      progress: clampedT,
    };
  }

  /**
   * Get current position
   */
  getPosition(): Vector3 | null {
    const sample = this.sample(this.progress);
    return sample?.position ?? null;
  }

  /**
   * Get current orientation quaternion
   */
  getOrientation(): Quaternion | null {
    const sample = this.sample(this.progress);
    if (!sample) return null;

    switch (this.config.orientationMode) {
      case 'tangent':
        return this.quaternionFromDirection(sample.tangent, this.config.upVector!);
      
      case 'lookAt':
        if (!this.config.lookAtTarget) return null;
        const dir = this.config.lookAtTarget.clone().sub(sample.position).normalize();
        return this.quaternionFromDirection(dir, this.config.upVector!);
      
      case 'frenet':
        if (!sample.normal || !sample.binormal) return null;
        return this.quaternionFromFrame(sample.tangent, sample.normal, sample.binormal);
      
      case 'fixed':
        return this.config.fixedOrientation ?? new Quaternion();
      
      default:
        return new Quaternion();
    }
  }

  /**
   * Get current transform (position + orientation)
   */
  getTransform(): { position: Vector3; orientation: Quaternion } | null {
    const position = this.getPosition();
    const orientation = this.getOrientation();
    
    if (!position || !orientation) return null;

    // Apply rotation offset if specified
    if (this.config.rotationOffset) {
      orientation.multiply(this.config.rotationOffset);
    }

    return { position, orientation };
  }

  /**
   * Reset to start
   */
  reset(): void {
    this.progress = 0;
    this.isMoving = false;
  }

  /**
   * Check if path is complete
   */
  isComplete(): boolean {
    return this.progress >= 1 && !this.config.loop;
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    return this.progress;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PathFollowingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Helper: Create quaternion from direction and up vector
   */
  private quaternionFromDirection(direction: Vector3, up: Vector3): Quaternion {
    const z = direction.clone().normalize();
    const x = up.clone().cross(z).normalize();
    const y = z.clone().cross(x).normalize();

    const matrix = [
      x.x, y.x, z.x, 0,
      x.y, y.y, z.y, 0,
      x.z, y.z, z.z, 0,
      0,   0,   0,   1,
    ];

    return this.quaternionFromMatrix(matrix);
  }

  /**
   * Helper: Create quaternion from Frenet frame
   */
  private quaternionFromFrame(tangent: Vector3, normal: Vector3, binormal: Vector3): Quaternion {
    const matrix = [
      normal.x, binormal.x, tangent.x, 0,
      normal.y, binormal.y, tangent.y, 0,
      normal.z, binormal.z, tangent.z, 0,
      0,        0,          0,         1,
    ];

    return this.quaternionFromMatrix(matrix);
  }

  /**
   * Helper: Extract quaternion from 4x4 matrix (column-major)
   */
  private quaternionFromMatrix(m: number[]): Quaternion {
    const trace = m[0] + m[5] + m[10];
    
    let x, y, z, w;
    
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (m[6] - m[9]) * s;
      y = (m[8] - m[2]) * s;
      z = (m[1] - m[4]) * s;
    } else if (m[0] > m[5] && m[0] > m[10]) {
      const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10]);
      w = (m[6] - m[9]) / s;
      x = 0.25 * s;
      y = (m[4] + m[1]) / s;
      z = (m[8] + m[2]) / s;
    } else if (m[5] > m[10]) {
      const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10]);
      w = (m[8] - m[2]) / s;
      x = (m[4] + m[1]) / s;
      y = 0.25 * s;
      z = (m[9] + m[6]) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5]);
      w = (m[1] - m[4]) / s;
      x = (m[8] + m[2]) / s;
      y = (m[9] + m[6]) / s;
      z = 0.25 * s;
    }

    return new Quaternion(x, y, z, w);
  }
}

/**
 * Generate keyframes for common camera movements
 */
export function generateCameraPath(
  type: 'orbit' | 'arc' | 'dolly' | 'pan' | 'crane' | 'tracking',
  options: {
    center?: Vector3;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    height?: number;
    segments?: number;
    startPoint?: Vector3;
    endPoint?: Vector3;
  } = {}
): Vector3[] {
  const segments = options.segments ?? 32;
  const keyframes: Vector3[] = [];

  switch (type) {
    case 'orbit': {
      const center = options.center ?? new Vector3(0, 0, 0);
      const radius = options.radius ?? 5;
      const height = options.height ?? 0;
      const startAngle = options.startAngle ?? 0;
      const endAngle = options.endAngle ?? Math.PI * 2;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * (endAngle - startAngle);
        keyframes.push(
          new Vector3(
            center.x + radius * Math.cos(angle),
            center.y + height,
            center.z + radius * Math.sin(angle)
          )
        );
      }
      break;
    }

    case 'arc': {
      const center = options.center ?? new Vector3(0, 0, 0);
      const radius = options.radius ?? 5;
      const startAngle = options.startAngle ?? -Math.PI / 4;
      const endAngle = options.endAngle ?? Math.PI / 4;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * (endAngle - startAngle);
        keyframes.push(
          new Vector3(
            center.x + radius * Math.sin(angle),
            center.y + radius * 0.3,
            center.z + radius * Math.cos(angle)
          )
        );
      }
      break;
    }

    case 'dolly': {
      const start = options.startPoint ?? new Vector3(0, 0, 10);
      const end = options.endPoint ?? new Vector3(0, 0, 0);

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        keyframes.push(start.clone().lerp(end, t));
      }
      break;
    }

    case 'pan': {
      const center = options.center ?? new Vector3(0, 0, 0);
      const radius = options.radius ?? 5;
      const startAngle = options.startAngle ?? 0;
      const endAngle = options.endAngle ?? Math.PI / 6;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * (endAngle - startAngle);
        keyframes.push(
          new Vector3(
            center.x + radius * Math.sin(angle),
            center.y,
            center.z + radius * Math.cos(angle)
          )
        );
      }
      break;
    }

    case 'crane': {
      const start = options.startPoint ?? new Vector3(0, 0, 5);
      const end = options.endPoint ?? new Vector3(0, 5, 0);

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        keyframes.push(start.clone().lerp(end, t));
      }
      break;
    }

    case 'tracking': {
      const start = options.startPoint ?? new Vector3(-5, 0, 0);
      const end = options.endPoint ?? new Vector3(5, 0, 0);
      const offset = options.height ?? 2;

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        keyframes.push(
          new Vector3(
            start.x + t * (end.x - start.x),
            start.y + offset,
            start.z + t * (end.z - start.z)
          )
        );
      }
      break;
    }
  }

  return keyframes;
}

/**
 * Filename-matching alias for backward compat.
 * `import PathFollowing from './PathFollowing'` and
 * `import { PathFollowing } from './PathFollowing'` both work.
 */
export { PathFollower as PathFollowing };
export default PathFollower;
