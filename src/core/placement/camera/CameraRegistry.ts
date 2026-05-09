/**
 * CameraRegistry — Strategy pattern registry for camera trajectory types
 *
 * Manages camera trajectory generators (dolly, crane, orbit, handheld, etc.)
 * and provides a unified interface for creating camera animations.
 *
 * Built-in trajectory types correspond to the files in trajectories/:
 *   - 'dolly'     → DollyShot
 *   - 'crane'     → CraneShot
 *   - 'orbit'     → OrbitShot
 *   - 'handheld'  → HandheldSim
 *   - 'tracking'  → TrackingShot
 *   - 'pan_tilt'  → PanTilt
 *
 * Custom trajectories can be registered at runtime.
 *
 * @module placement/camera
 */

import * as THREE from 'three';

// ============================================================================
// Trajectory Strategy Interface
// ============================================================================

export interface TrajectoryGenerator {
  /** Unique name for this trajectory type */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Category for UI grouping */
  readonly category: 'linear' | 'circular' | 'organic' | 'compound';

  /**
   * Generate camera trajectory points.
   *
   * @param startPos  Starting camera position
   * @param endPos    Ending camera position
   * @param duration  Duration in seconds
   * @param options   Trajectory-specific options (e.g., height for crane, radius for orbit)
   * @returns Array of Vector3 positions along the trajectory
   */
  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[];
}

// ============================================================================
// Built-in Trajectory Implementations
// ============================================================================

/** Linear dolly — straight-line camera movement */
export class DollyTrajectory implements TrajectoryGenerator {
  readonly name = 'dolly';
  readonly description = 'Straight-line push in/out';
  readonly category = 'linear';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      // Apply ease-in-out
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      points.push(new THREE.Vector3().lerpVectors(startPos, endPos, eased));
    }
    return points;
  }
}

/** Crane shot — vertical arc movement */
export class CraneTrajectory implements TrajectoryGenerator {
  readonly name = 'crane';
  readonly description = 'Vertical arc movement';
  readonly category = 'circular';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const maxHeight = (options?.maxHeight as number) ?? 20;
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      const horizontal = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      const arcHeight = Math.sin(t * Math.PI) * maxHeight;
      horizontal.y = Math.max(startPos.y, endPos.y) + arcHeight;
      points.push(horizontal);
    }
    return points;
  }
}

/** Orbit shot — circular movement around a center point */
export class OrbitTrajectory implements TrajectoryGenerator {
  readonly name = 'orbit';
  readonly description = 'Circular orbit around subject';
  readonly category = 'circular';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const center = (options?.center as THREE.Vector3) ?? new THREE.Vector3(0, 0, 0);
    const radius = (options?.radius as number) ?? startPos.distanceTo(center);
    const height = (options?.height as number) ?? startPos.y;
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];

    const startAngle = Math.atan2(startPos.z - center.z, startPos.x - center.x);
    const endAngle = Math.atan2(endPos.z - center.z, endPos.x - center.x);

    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      const angle = startAngle + (endAngle - startAngle) * t;
      points.push(
        new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          height,
          center.z + Math.sin(angle) * radius,
        ),
      );
    }
    return points;
  }
}

/** Handheld simulation — organic camera shake with gentle movement */
export class HandheldTrajectory implements TrajectoryGenerator {
  readonly name = 'handheld';
  readonly description = 'Organic handheld camera shake';
  readonly category = 'organic';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const shakeIntensity = (options?.shakeIntensity as number) ?? 0.05;
    const seed = (options?.seed as number) ?? 42;
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];

    // Simple seeded PRNG for reproducibility
    let s = seed;
    const rng = () => {
      const x = Math.sin(s++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      const base = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      base.x += (rng() - 0.5) * shakeIntensity * 2;
      base.y += (rng() - 0.5) * shakeIntensity * 2;
      base.z += (rng() - 0.5) * shakeIntensity * 2;
      points.push(base);
    }
    return points;
  }
}

/** Tracking shot — follows alongside a subject */
export class TrackingTrajectory implements TrajectoryGenerator {
  readonly name = 'tracking';
  readonly description = 'Side-tracking shot following subject';
  readonly category = 'linear';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const offset = (options?.offset as THREE.Vector3) ?? new THREE.Vector3(3, 1.5, 0);
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      const subjectPos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
      points.push(subjectPos.clone().add(offset));
    }
    return points;
  }
}

// ============================================================================
// Altitude-Maintaining Walk Trajectory
// ============================================================================

/**
 * Function type for sampling terrain height at a given (x, z) position.
 *
 * Returns the terrain height (Y value) at the specified horizontal coordinates.
 * If no terrain data is available, implementations should return 0.
 */
export type TerrainHeightSampler = (x: number, z: number) => number;

/**
 * Altitude-maintaining walk trajectory — like DollyTrajectory but samples
 * terrain height along the path and adjusts Y position to maintain a
 * constant altitude above terrain.
 *
 * Ports the original Infinigen `walk_same_altitude()` behavior:
 * camera moves along a linear path but maintains a fixed clearance height
 * above the terrain surface. Height changes are smoothed to avoid jittering.
 *
 * Options:
 *   - `fps` (number): Frame rate for point generation (default: 30)
 *   - `clearanceHeight` (number): Height above terrain in meters (default: 1.7 — human eye height)
 *   - `terrainSampler` (TerrainHeightSampler): Function that returns terrain height at (x, z)
 *   - `smoothingWindow` (number): Number of frames for moving-average smoothing (default: 5)
 *   - `maxHeightChange` (number): Maximum height change per frame in meters (default: 0.3)
 *     This prevents sudden jumps when terrain height changes abruptly.
 */
export class AltitudeWalkTrajectory implements TrajectoryGenerator {
  readonly name = 'altitude_walk';
  readonly description = 'Walk trajectory maintaining constant altitude above terrain';
  readonly category = 'organic';

  generate(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const fps = (options?.fps as number) ?? 30;
    const clearanceHeight = (options?.clearanceHeight as number) ?? 1.7;
    const terrainSampler = (options?.terrainSampler as TerrainHeightSampler) ?? (() => 0);
    const smoothingWindow = (options?.smoothingWindow as number) ?? 5;
    const maxHeightChange = (options?.maxHeightChange as number) ?? 0.3;

    const totalFrames = Math.ceil(duration * fps);
    const rawPoints: THREE.Vector3[] = [];

    // Step 1: Generate linear path in XZ with raw altitude above terrain
    for (let i = 0; i <= totalFrames; i++) {
      const t = i / totalFrames;
      // Ease-in-out for horizontal movement
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const point = new THREE.Vector3().lerpVectors(startPos, endPos, eased);

      // Sample terrain height at this XZ position
      const terrainY = terrainSampler(point.x, point.z);
      // Set Y = terrain height + clearance
      point.y = terrainY + clearanceHeight;

      rawPoints.push(point);
    }

    // Step 2: Smooth the height values using a moving average to avoid jittering
    const smoothedPoints = this.smoothHeights(rawPoints, smoothingWindow);

    // Step 3: Clamp per-frame height changes to avoid sudden jumps
    const clampedPoints = this.clampHeightChanges(smoothedPoints, maxHeightChange);

    return clampedPoints;
  }

  /**
   * Apply a centered moving-average filter to the Y values of the points.
   * This smooths out high-frequency jitter from terrain sampling noise.
   */
  private smoothHeights(points: THREE.Vector3[], windowSize: number): THREE.Vector3[] {
    if (windowSize <= 1 || points.length <= 1) return points;

    const result: THREE.Vector3[] = [];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(points.length - 1, i + halfWindow);
      let sum = 0;
      let count = 0;

      for (let j = start; j <= end; j++) {
        sum += points[j].y;
        count++;
      }

      const smoothedY = sum / count;
      result.push(
        new THREE.Vector3(points[i].x, smoothedY, points[i].z),
      );
    }

    return result;
  }

  /**
   * Clamp per-frame height changes to prevent sudden vertical jumps.
   * This ensures smooth camera motion even when terrain has sharp discontinuities.
   */
  private clampHeightChanges(
    points: THREE.Vector3[],
    maxHeightChange: number,
  ): THREE.Vector3[] {
    if (points.length <= 1) return points;

    const result: THREE.Vector3[] = [points[0].clone()];

    for (let i = 1; i < points.length; i++) {
      const prevY = result[i - 1].y;
      const targetY = points[i].y;
      const deltaY = targetY - prevY;

      // Clamp the height change
      const clampedDeltaY = THREE.MathUtils.clamp(
        deltaY,
        -maxHeightChange,
        maxHeightChange,
      );

      result.push(
        new THREE.Vector3(points[i].x, prevY + clampedDeltaY, points[i].z),
      );
    }

    return result;
  }
}

/** Pan/tilt — camera stays in place, rotates to follow */
export class PanTiltTrajectory implements TrajectoryGenerator {
  readonly name = 'pan_tilt';
  readonly description = 'Stationary camera with pan/tilt rotation';
  readonly category = 'compound';

  generate(
    startPos: THREE.Vector3,
    _endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    // Pan/tilt is about look direction, not position, so we keep the camera
    // at startPos and just return a constant position
    const fps = (options?.fps as number) ?? 30;
    const totalFrames = Math.ceil(duration * fps);
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= totalFrames; i++) {
      points.push(startPos.clone());
    }
    return points;
  }
}

// ============================================================================
// CameraRegistry
// ============================================================================

export class CameraRegistry {
  private trajectories: Map<string, TrajectoryGenerator> = new Map();

  constructor() {
    // Register built-in trajectories
    this.register(new DollyTrajectory());
    this.register(new CraneTrajectory());
    this.register(new OrbitTrajectory());
    this.register(new HandheldTrajectory());
    this.register(new TrackingTrajectory());
    this.register(new PanTiltTrajectory());
    this.register(new AltitudeWalkTrajectory());
  }

  /** Register a trajectory generator */
  register(generator: TrajectoryGenerator): void {
    if (this.trajectories.has(generator.name)) {
      throw new Error(
        `[CameraRegistry] Trajectory '${generator.name}' already registered`,
      );
    }
    this.trajectories.set(generator.name, generator);
  }

  /** Get a trajectory generator by name */
  getTrajectory(name: string): TrajectoryGenerator | undefined {
    return this.trajectories.get(name);
  }

  /** Check if a trajectory is registered */
  has(name: string): boolean {
    return this.trajectories.has(name);
  }

  /** Get all registered trajectory names */
  getTrajectoryNames(): string[] {
    return Array.from(this.trajectories.keys());
  }

  /** Get all trajectories in a category */
  getByCategory(category: TrajectoryGenerator['category']): TrajectoryGenerator[] {
    return Array.from(this.trajectories.values()).filter(
      (t) => t.category === category,
    );
  }

  /**
   * Generate a trajectory by name.
   *
   * @throws Error if the trajectory name is not registered
   */
  generateTrajectory(
    name: string,
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number,
    options?: Record<string, unknown>,
  ): THREE.Vector3[] {
    const generator = this.trajectories.get(name);
    if (!generator) {
      throw new Error(
        `[CameraRegistry] Unknown trajectory '${name}'. ` +
          `Available: ${this.getTrajectoryNames().join(', ')}`,
      );
    }
    return generator.generate(startPos, endPos, duration, options);
  }

  /**
   * Unregister a trajectory by name.
   * Returns true if the trajectory was found and removed.
   */
  unregister(name: string): boolean {
    return this.trajectories.delete(name);
  }

  /**
   * Get all registered trajectory generators.
   */
  getAll(): TrajectoryGenerator[] {
    return Array.from(this.trajectories.values());
  }

  /**
   * Get the number of registered trajectories.
   */
  get size(): number {
    return this.trajectories.size;
  }
}
