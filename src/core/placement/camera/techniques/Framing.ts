/**
 * Subject Framing Utilities
 *
 * Enhanced framing with rule-of-thirds weighting, leading line detection,
 * multi-layer depth analysis, subject tracking, and dynamic framing.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shot Size Definitions
// ---------------------------------------------------------------------------

export enum ShotSize {
  EXTREME_CLOSE_UP = 'extreme_close_up',
  CLOSE_UP = 'close_up',
  MEDIUM_CLOSE_UP = 'medium_close_up',
  MEDIUM_SHOT = 'medium_shot',
  MEDIUM_LONG_SHOT = 'medium_long_shot',
  LONG_SHOT = 'long_shot',
  VERY_LONG_SHOT = 'very_long_shot',
  EXTREME_LONG_SHOT = 'extreme_long_shot',
}

export const SHOT_SIZE_DISTANCES: Record<ShotSize, { head: number; waist: number; full: number }> = {
  [ShotSize.EXTREME_CLOSE_UP]: { head: 0.15, waist: 0.3, full: 0.5 },
  [ShotSize.CLOSE_UP]: { head: 0.3, waist: 0.6, full: 1.0 },
  [ShotSize.MEDIUM_CLOSE_UP]: { head: 0.5, waist: 1.0, full: 1.8 },
  [ShotSize.MEDIUM_SHOT]: { head: 0.8, waist: 1.5, full: 2.5 },
  [ShotSize.MEDIUM_LONG_SHOT]: { head: 1.2, waist: 2.5, full: 4.0 },
  [ShotSize.LONG_SHOT]: { head: 2.0, waist: 4.0, full: 7.0 },
  [ShotSize.VERY_LONG_SHOT]: { head: 4.0, waist: 8.0, full: 15.0 },
  [ShotSize.EXTREME_LONG_SHOT]: { head: 8.0, waist: 15.0, full: 30.0 },
};

// ---------------------------------------------------------------------------
// Rule of Thirds Grid Weighting
// ---------------------------------------------------------------------------

export interface ThirdsGridWeight {
  /** Screen-space position of the power point (0-1) */
  position: THREE.Vector2;
  /** Relative weight of this intersection (0-1) */
  weight: number;
}

/**
 * Compute the four rule-of-thirds intersection points with weighted scoring.
 * By default the upper-left and lower-right are weighted higher
 * because viewers in LTR cultures scan that diagonal first.
 */
export function computeThirdsGridWeights(
  frameWidth: number,
  frameHeight: number,
  weightMode: 'equal' | 'natural' | 'golden' = 'natural'
): ThirdsGridWeight[] {
  const thirdW = frameWidth / 3;
  const thirdH = frameHeight / 3;

  const basePoints: Array<{ x: number; y: number; equalW: number; naturalW: number; goldenW: number }> = [
    { x: thirdW,     y: thirdH,     equalW: 1.0, naturalW: 1.0,  goldenW: 0.9 },
    { x: thirdW * 2, y: thirdH,     equalW: 1.0, naturalW: 0.8,  goldenW: 0.7 },
    { x: thirdW,     y: thirdH * 2, equalW: 1.0, naturalW: 0.8,  goldenW: 0.7 },
    { x: thirdW * 2, y: thirdH * 2, equalW: 1.0, naturalW: 1.0,  goldenW: 0.9 },
  ];

  const weightKey = weightMode === 'equal' ? 'equalW' : weightMode === 'golden' ? 'goldenW' : 'naturalW';

  return basePoints.map((p) => ({
    position: new THREE.Vector2(p.x / frameWidth, p.y / frameHeight),
    weight: p[weightKey],
  }));
}

/**
 * Score how well a projected subject position aligns with thirds grid power points.
 * Returns a weighted score in [0, 1].
 */
export function scoreThirdsAlignment(
  projectedSubject: THREE.Vector2,
  frameWidth: number,
  frameHeight: number,
  weightMode: 'equal' | 'natural' | 'golden' = 'natural'
): number {
  const weights = computeThirdsGridWeights(frameWidth, frameHeight, weightMode);
  const normalized = new THREE.Vector2(
    projectedSubject.x / frameWidth,
    projectedSubject.y / frameHeight
  );

  let bestScore = 0;
  let totalWeight = 0;

  for (const w of weights) {
    const dist = normalized.distanceTo(w.position);
    // Gaussian falloff: sigma = 0.15 of frame diagonal
    const sigma = 0.15;
    const alignmentScore = Math.exp(-(dist * dist) / (2 * sigma * sigma));
    bestScore += alignmentScore * w.weight;
    totalWeight += w.weight;
  }

  return totalWeight > 0 ? bestScore / totalWeight : 0;
}

// ---------------------------------------------------------------------------
// Leading Line Detection & Convergence
// ---------------------------------------------------------------------------

export interface LeadingLineResult {
  /** Number of convergent line groups detected */
  groupCount: number;
  /** Dominant vanishing direction (unit vector) or null */
  dominantDirection: THREE.Vector3 | null;
  /** Convergence score: how strongly lines converge toward a point */
  convergenceScore: number;
}

/**
 * Analyze scene objects for edges that converge, suggesting leading lines.
 * Uses bounding-box edges as a fast approximation.
 */
export function detectLeadingLines(
  sceneObjects: THREE.Object3D[],
  cameraPosition: THREE.Vector3
): LeadingLineResult {
  const lines: Array<{ start: THREE.Vector3; dir: THREE.Vector3 }> = [];

  for (const obj of sceneObjects) {
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Use box principal axes as representative lines
    const axes = [
      new THREE.Vector3(size.x, 0, 0),
      new THREE.Vector3(0, size.y, 0),
      new THREE.Vector3(0, 0, size.z),
    ];

    for (const axis of axes) {
      const len = axis.length();
      if (len < 0.01) continue;
      lines.push({ start: center, dir: axis.clone().normalize() });
    }
  }

  if (lines.length === 0) {
    return { groupCount: 0, dominantDirection: null, convergenceScore: 0 };
  }

  // Group by direction similarity
  const ANGLE_THRESHOLD = Math.PI / 6; // 30°
  const groups: Array<{ dir: THREE.Vector3; weight: number }> = [];

  for (const line of lines) {
    let matched = false;
    for (const group of groups) {
      if (Math.abs(group.dir.dot(line.dir)) > Math.cos(ANGLE_THRESHOLD)) {
        const blended = group.dir.clone().multiplyScalar(group.weight).add(line.dir);
        group.dir.copy(blended.normalize());
        group.weight += 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ dir: line.dir.clone(), weight: 1 });
    }
  }

  groups.sort((a, b) => b.weight - a.weight);

  // Compute convergence score: how many lines converge toward the camera
  let convergentCount = 0;
  for (const line of lines) {
    const toCamera = new THREE.Vector3().subVectors(cameraPosition, line.start).normalize();
    const alignment = Math.abs(line.dir.dot(toCamera));
    if (alignment > 0.5) convergentCount++;
  }

  const convergenceScore = lines.length > 0 ? convergentCount / lines.length : 0;

  return {
    groupCount: groups.length,
    dominantDirection: groups.length > 0 ? groups[0].dir : null,
    convergenceScore,
  };
}

// ---------------------------------------------------------------------------
// Multi-Layer Depth Analysis
// ---------------------------------------------------------------------------

export interface DepthAnalysis {
  /** Near layer objects (foreground) */
  nearObjects: THREE.Object3D[];
  /** Mid layer objects (subject zone) */
  midObjects: THREE.Object3D[];
  /** Far layer objects (background) */
  farObjects: THREE.Object3D[];
  /** Depth separation score in [0, 1] */
  separationScore: number;
  /** Near layer distance range */
  nearRange: [number, number];
  /** Mid layer distance range */
  midRange: [number, number];
  /** Far layer distance range */
  farRange: [number, number];
}

/**
 * Perform multi-layer depth analysis of the scene from a camera viewpoint.
 * Separates the scene into near / mid / far layers relative to the subject.
 */
export function analyzeDepthLayers(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  layerGap: number = 1.5
): DepthAnalysis {
  const subjectDist = cameraPosition.distanceTo(subjectPosition);
  const nearEnd = subjectDist - layerGap;
  const midEnd = subjectDist + layerGap;

  const nearObjects: THREE.Object3D[] = [];
  const midObjects: THREE.Object3D[] = [];
  const farObjects: THREE.Object3D[] = [];

  for (const obj of sceneObjects) {
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(obj).getCenter(center);
    const dist = cameraPosition.distanceTo(center);

    if (dist < nearEnd) nearObjects.push(obj);
    else if (dist < midEnd) midObjects.push(obj);
    else farObjects.push(obj);
  }

  // Score separation quality
  let separationScore = 0.3; // base for having subject in midground
  if (nearObjects.length > 0 && nearObjects.length <= 3) separationScore += 0.25;
  else if (nearObjects.length > 3) separationScore += 0.1;
  if (farObjects.length > 0) separationScore += 0.25;
  if (midObjects.length >= 2) separationScore += 0.2;
  separationScore = Math.min(1, separationScore);

  return {
    nearObjects,
    midObjects,
    farObjects,
    separationScore,
    nearRange: [0, nearEnd],
    midRange: [nearEnd, midEnd],
    farRange: [midEnd, Infinity],
  };
}

// ---------------------------------------------------------------------------
// Subject Tracking
// ---------------------------------------------------------------------------

export interface SubjectTrackState {
  /** Last known subject position */
  lastSubjectPosition: THREE.Vector3;
  /** Estimated subject velocity */
  velocity: THREE.Vector3;
  /** Time of last update */
  lastTime: number;
  /** Smoothing factor for position tracking (0-1, higher = smoother) */
  smoothing: number;
}

/**
 * Create a new subject tracking state.
 */
export function createSubjectTracker(
  initialPosition: THREE.Vector3,
  smoothing: number = 0.85
): SubjectTrackState {
  return {
    lastSubjectPosition: initialPosition.clone(),
    velocity: new THREE.Vector3(),
    lastTime: performance.now() / 1000,
    smoothing,
  };
}

/**
 * Update subject tracking with a new observation.
 * Returns the smoothed position the camera should aim at.
 */
export function updateSubjectTracking(
  state: SubjectTrackState,
  currentPosition: THREE.Vector3,
  deltaTime: number
): THREE.Vector3 {
  if (deltaTime <= 0) deltaTime = 1 / 60;

  // Estimate velocity
  const rawVelocity = new THREE.Vector3().subVectors(currentPosition, state.lastSubjectPosition).divideScalar(deltaTime);

  // Smooth velocity
  state.velocity.lerp(rawVelocity, 1 - state.smoothing);

  // Predict where subject will be in the near future (look-ahead)
  const lookAheadTime = 0.1; // 100ms look-ahead
  const predicted = currentPosition.clone().add(state.velocity.clone().multiplyScalar(lookAheadTime));

  // Smooth the target position
  const smoothedTarget = state.lastSubjectPosition.clone().lerp(predicted, 1 - state.smoothing);

  state.lastSubjectPosition.copy(smoothedTarget);
  state.lastTime = performance.now() / 1000;

  return smoothedTarget;
}

/**
 * Check whether a subject is still within the camera frame.
 * Returns true if the projected position is within the safe margin.
 */
export function isSubjectInFrame(
  camera: THREE.Camera,
  subjectPosition: THREE.Vector3,
  margin: number = 0.15
): boolean {
  const projected = subjectPosition.clone().project(camera);
  const inFrameX = projected.x >= -1 + margin && projected.x <= 1 - margin;
  const inFrameY = projected.y >= -1 + margin && projected.y <= 1 - margin;
  return inFrameX && inFrameY && projected.z > 0 && projected.z < 1;
}

// ---------------------------------------------------------------------------
// Dynamic Framing
// ---------------------------------------------------------------------------

export interface DynamicFramingConfig {
  /** Target fraction of frame the subject should occupy (0-1) */
  targetOccupancy: number;
  /** Minimum occupancy before re-framing */
  minOccupancy: number;
  /** Maximum occupancy before re-framing */
  maxOccupancy: number;
  /** How quickly framing adapts (0-1, lower = smoother) */
  adaptationSpeed: number;
}

const DEFAULT_DYNAMIC_FRAMING: DynamicFramingConfig = {
  targetOccupancy: 0.4,
  minOccupancy: 0.2,
  maxOccupancy: 0.7,
  adaptationSpeed: 0.05,
};

/**
 * Calculate the current subject occupancy in frame as a fraction (0-1).
 */
export function calculateSubjectOccupancy(
  camera: THREE.Camera,
  subjectBox: THREE.Box3
): number {
  // Project all 8 corners of the bounding box to screen space
  const min = subjectBox.min;
  const max = subjectBox.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
  ];

  let screenMinX = Infinity, screenMinY = Infinity;
  let screenMaxX = -Infinity, screenMaxY = -Infinity;

  for (const corner of corners) {
    const projected = corner.clone().project(camera);
    screenMinX = Math.min(screenMinX, projected.x);
    screenMaxX = Math.max(screenMaxX, projected.x);
    screenMinY = Math.min(screenMinY, projected.y);
    screenMaxY = Math.max(screenMaxY, projected.y);
  }

  // Occupancy as area fraction (normalized to [-1, 1] screen space)
  const subjectWidth = screenMaxX - screenMinX;
  const subjectHeight = screenMaxY - screenMinY;
  return (subjectWidth * subjectHeight) / 4; // 4 = total area of normalized screen
}

/**
 * Adapt framing to scene content density.
 * Returns an adjusted distance and/or FOV to maintain good subject occupancy.
 */
export function adaptFraming(
  camera: THREE.PerspectiveCamera,
  subjectBox: THREE.Box3,
  config: Partial<DynamicFramingConfig> = {}
): { adjustedDistance: number; adjustedFOV: number; shouldReframe: boolean } {
  const cfg = { ...DEFAULT_DYNAMIC_FRAMING, ...config };
  const occupancy = calculateSubjectOccupancy(camera, subjectBox);

  const subjectCenter = new THREE.Vector3();
  subjectBox.getCenter(subjectCenter);
  const currentDistance = camera.position.distanceTo(subjectCenter);

  let adjustedDistance = currentDistance;
  let adjustedFOV = camera.fov;
  let shouldReframe = false;

  if (occupancy < cfg.minOccupancy) {
    // Subject too small: move closer or widen FOV
    const ratio = cfg.targetOccupancy / Math.max(occupancy, 0.01);
    adjustedDistance = currentDistance / Math.sqrt(ratio);
    shouldReframe = true;
  } else if (occupancy > cfg.maxOccupancy) {
    // Subject too large: move farther or narrow FOV
    const ratio = cfg.targetOccupancy / Math.max(occupancy, 0.01);
    adjustedDistance = currentDistance / Math.sqrt(ratio);
    shouldReframe = true;
  }

  // Apply adaptation speed
  adjustedDistance = THREE.MathUtils.lerp(currentDistance, adjustedDistance, cfg.adaptationSpeed);

  return { adjustedDistance, adjustedFOV, shouldReframe };
}

// ---------------------------------------------------------------------------
// Core Framing Functions
// ---------------------------------------------------------------------------

/**
 * Calculate distance for a given shot size, subject height, and lens.
 */
export function calculateDistanceForShot(
  shotSize: ShotSize,
  subjectHeight: number,
  focalLength: number,
  sensorHeight: number
): number {
  const baseDistance = SHOT_SIZE_DISTANCES[shotSize].full;

  // Adjust based on focal length and sensor size
  const fov = 2 * Math.atan(sensorHeight / (2 * focalLength));
  const requiredHeight = subjectHeight * 1.2; // 20% padding

  return requiredHeight / (2 * Math.tan(fov / 2));
}

/**
 * Frame a subject by positioning the camera at the correct distance.
 */
export function frameSubject(
  camera: THREE.Camera,
  subjectBox: THREE.Box3,
  shotSize: ShotSize,
  padding: number = 0.1
): void {
  const subjectSize = subjectBox.getSize(new THREE.Vector3());
  const subjectCenter = subjectBox.getCenter(new THREE.Vector3());

  const distance = calculateDistanceForShot(
    shotSize,
    subjectSize.y,
    camera instanceof THREE.PerspectiveCamera ? camera.fov : 50,
    24
  );

  // Position camera at calculated distance
  const direction = new THREE.Vector3(0, 0, 1);
  camera.position.copy(subjectCenter).add(direction.multiplyScalar(-distance));
  camera.lookAt(subjectCenter);
}

/**
 * Position camera to frame a subject with a specific shot size while
 * respecting composition rules and scene geometry.
 */
export function frameSubjectWithComposition(
  camera: THREE.PerspectiveCamera,
  subjectBox: THREE.Box3,
  shotSize: ShotSize,
  options: {
    compositionWeight?: number;
    leadingLines?: boolean;
    sceneObjects?: THREE.Object3D[];
  } = {}
): void {
  const subjectSize = subjectBox.getSize(new THREE.Vector3());
  const subjectCenter = subjectBox.getCenter(new THREE.Vector3());

  const distance = calculateDistanceForShot(
    shotSize,
    subjectSize.y,
    camera.fov,
    24
  );

  // Find best angle for composition
  const sceneObjects = options.sceneObjects ?? [];
  let bestAngle = 0;
  let bestScore = -1;

  if (options.compositionWeight !== 0) {
    const stepCount = 24;
    for (let i = 0; i < stepCount; i++) {
      const angle = (i / stepCount) * Math.PI * 2;
      const testPos = new THREE.Vector3(
        subjectCenter.x + Math.cos(angle) * distance,
        subjectCenter.y,
        subjectCenter.z + Math.sin(angle) * distance
      );

      let score = scoreThirdsAlignment(
        new THREE.Vector2(
          (subjectCenter.x - testPos.x) / distance * 0.5 + 0.5,
          (subjectCenter.y - testPos.y) / distance * 0.5 + 0.5
        ),
        1,
        1
      );

      if (options.leadingLines && sceneObjects.length > 0) {
        const lineResult = detectLeadingLines(sceneObjects, testPos);
        score = score * 0.6 + lineResult.convergenceScore * 0.4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }
  }

  camera.position.set(
    subjectCenter.x + Math.cos(bestAngle) * distance,
    subjectCenter.y,
    subjectCenter.z + Math.sin(bestAngle) * distance
  );
  camera.lookAt(subjectCenter);
}

export default {
  ShotSize,
  SHOT_SIZE_DISTANCES,
  computeThirdsGridWeights,
  scoreThirdsAlignment,
  detectLeadingLines,
  analyzeDepthLayers,
  createSubjectTracker,
  updateSubjectTracking,
  isSubjectInFrame,
  calculateSubjectOccupancy,
  adaptFraming,
  calculateDistanceForShot,
  frameSubject,
  frameSubjectWithComposition,
};
