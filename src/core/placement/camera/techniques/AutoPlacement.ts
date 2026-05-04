/**
 * Automatic Camera Placement Algorithms
 *
 * Enhanced auto-placement with composition rules, subject awareness,
 * depth composition, auto-framing, and obstacle avoidance.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../util/MathUtils';
import { CameraProperties } from '../CameraProperties';

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

export interface AutoPlacementOptions {
  /** Apply rule-of-thirds offset to camera angle */
  ruleOfThirds?: boolean;
  /** Apply golden-ratio offset to camera angle */
  goldenRatio?: boolean;
  /** Attempt to align camera with leading lines in the scene */
  leadingLines?: boolean;
  /** Focus on the subject's center rather than the bounds center */
  subjectFocus?: boolean;
  /** Minimum distance from subject (metres) */
  minDistance?: number;
  /** Maximum distance from subject (metres) */
  maxDistance?: number;
  /** Preferred camera height above ground (metres) */
  preferredHeight?: number;
  /** Margin around subject for auto-framing (0-1 fraction of subject size) */
  framingMargin?: number;
  /** Minimum vertical separation between depth layers (metres) */
  depthLayerGap?: number;
  /** Safety margin to keep camera away from geometry (metres) */
  obstacleMargin?: number;
  /** Seed for deterministic placement sampling */
  seed?: number;
  /** Number of candidate viewpoints to evaluate */
  candidateCount?: number;
  /** Scene objects to check for occlusion and leading lines */
  sceneObjects?: THREE.Object3D[];
  /** Raycaster for subject-awareness (reused across calls) */
  raycaster?: THREE.Raycaster;
}

interface DepthLayer {
  nearObjects: THREE.Object3D[];
  midObjects: THREE.Object3D[];
  farObjects: THREE.Object3D[];
  nearRange: [number, number];
  midRange: [number, number];
  farRange: [number, number];
}

interface CandidateViewpoint {
  position: THREE.Vector3;
  target: THREE.Vector3;
  score: number;
  fov: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const DEFAULT_CANDIDATE_COUNT = 32;
const DEFAULT_OBSTACLE_MARGIN = 0.3;
const DEFAULT_FRAMING_MARGIN = 0.2;
const DEFAULT_DEPTH_GAP = 1.0;

// ---------------------------------------------------------------------------
// Composition Rule Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate angular offset for rule-of-thirds placement.
 * Offsets the camera angle so the subject falls on a third-line intersection.
 */
function ruleOfThirdsOffset(diagonal: number): number {
  return diagonal / 3;
}

/**
 * Calculate angular offset for golden-ratio placement.
 * Uses the golden section (≈0.618) instead of 1/3.
 */
function goldenRatioOffset(diagonal: number): number {
  return diagonal / GOLDEN_RATIO;
}

/**
 * Evaluate how well a viewpoint adheres to rule-of-thirds.
 * Returns a score in [0, 1] where 1 is perfect alignment.
 */
function evaluateRuleOfThirds(
  projectedSubject: THREE.Vector2,
  frameWidth: number,
  frameHeight: number
): number {
  const thirdW = frameWidth / 3;
  const thirdH = frameHeight / 3;
  const powerPoints: THREE.Vector2[] = [
    new THREE.Vector2(thirdW, thirdH),
    new THREE.Vector2(thirdW * 2, thirdH),
    new THREE.Vector2(thirdW, thirdH * 2),
    new THREE.Vector2(thirdW * 2, thirdH * 2),
  ];

  let minDist = Infinity;
  for (const pt of powerPoints) {
    const d = projectedSubject.distanceTo(pt);
    if (d < minDist) minDist = d;
  }

  const maxAcceptable = Math.hypot(thirdW, thirdH);
  return Math.max(0, 1 - minDist / maxAcceptable);
}

/**
 * Evaluate how well a viewpoint adheres to golden-ratio composition.
 */
function evaluateGoldenRatio(
  projectedSubject: THREE.Vector2,
  frameWidth: number,
  frameHeight: number
): number {
  const phiW = frameWidth / GOLDEN_RATIO;
  const phiH = frameHeight / GOLDEN_RATIO;
  const points: THREE.Vector2[] = [
    new THREE.Vector2(phiW, phiH),
    new THREE.Vector2(frameWidth - phiW, phiH),
    new THREE.Vector2(phiW, frameHeight - phiH),
    new THREE.Vector2(frameWidth - phiW, frameHeight - phiH),
  ];

  let minDist = Infinity;
  for (const pt of points) {
    const d = projectedSubject.distanceTo(pt);
    if (d < minDist) minDist = d;
  }

  const maxAcceptable = Math.hypot(phiW, phiH);
  return Math.max(0, 1 - minDist / maxAcceptable);
}

// ---------------------------------------------------------------------------
// Leading Line Detection
// ---------------------------------------------------------------------------

interface LineSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  direction: THREE.Vector3;
}

/**
 * Extract prominent line segments from scene geometry edges.
 * Uses bounding-box edges as a fast approximation.
 */
function extractLeadingLines(objects: THREE.Object3D[]): LineSegment[] {
  const lines: LineSegment[] = [];

  for (const obj of objects) {
    const box = new THREE.Box3().setFromObject(obj);
    const min = box.min;
    const max = box.max;

    // 12 edges of bounding box
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

    const edgeIndices: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    for (const [a, b] of edgeIndices) {
      const dir = new THREE.Vector3().subVectors(corners[b], corners[a]);
      const len = dir.length();
      if (len < 0.01) continue;
      dir.normalize();
      lines.push({ start: corners[a], end: corners[b], direction: dir });
    }
  }

  return lines;
}

/**
 * Find the vanishing direction of the strongest convergent line group.
 * Returns a unit vector or null if no dominant direction exists.
 */
function findDominantLineDirection(lines: LineSegment[]): THREE.Vector3 | null {
  if (lines.length === 0) return null;

  // Accumulate directions (ignoring sign by using absolute dot)
  const groups: { dir: THREE.Vector3; weight: number }[] = [];
  const ANGLE_THRESHOLD = Math.PI / 8; // 22.5°

  for (const line of lines) {
    const len = line.start.distanceTo(line.end);
    let matched = false;

    for (const group of groups) {
      if (Math.abs(group.dir.dot(line.direction)) > Math.cos(ANGLE_THRESHOLD)) {
        const blended = group.dir.clone().multiplyScalar(group.weight).add(
          line.direction.clone().multiplyScalar(len)
        );
        group.dir.copy(blended.normalize());
        group.weight += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push({ dir: line.direction.clone(), weight: len });
    }
  }

  groups.sort((a, b) => b.weight - a.weight);
  return groups.length > 0 ? groups[0].dir : null;
}

/**
 * Score a viewpoint based on alignment with leading lines.
 * High score when camera direction is roughly perpendicular to leading lines,
 * so lines converge toward the subject.
 */
function evaluateLeadingLines(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  leadingLineDir: THREE.Vector3 | null
): number {
  if (!leadingLineDir) return 0.5; // neutral if no lines

  const viewDir = new THREE.Vector3().subVectors(subjectPosition, cameraPosition).normalize();
  // Perpendicularity: camera should look along the leading lines so they converge
  const alignment = Math.abs(viewDir.dot(leadingLineDir));
  return alignment; // 1 = perfect alignment, 0 = perpendicular
}

// ---------------------------------------------------------------------------
// Depth Composition
// ---------------------------------------------------------------------------

/**
 * Classify scene objects into near/mid/far depth layers relative to camera.
 */
function classifyDepthLayers(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  objects: THREE.Object3D[],
  gap: number
): DepthLayer {
  const subjectDist = cameraPosition.distanceTo(subjectPosition);
  const nearEnd = subjectDist - gap;
  const midEnd = subjectDist + gap;

  const nearObjects: THREE.Object3D[] = [];
  const midObjects: THREE.Object3D[] = [];
  const farObjects: THREE.Object3D[] = [];

  for (const obj of objects) {
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(obj).getCenter(center);
    const dist = cameraPosition.distanceTo(center);

    if (dist < nearEnd) nearObjects.push(obj);
    else if (dist < midEnd) midObjects.push(obj);
    else farObjects.push(obj);
  }

  return {
    nearObjects,
    midObjects,
    farObjects,
    nearRange: [0, nearEnd],
    midRange: [nearEnd, midEnd],
    farRange: [midEnd, Infinity],
  };
}

/**
 * Evaluate depth composition quality.
 * Best when there are objects in foreground, subject in midground, and background.
 */
function evaluateDepthComposition(layers: DepthLayer): number {
  let score = 0.3; // base score for having subject in midground

  // Foreground interest: slight bonus for near objects (not too many)
  if (layers.nearObjects.length > 0 && layers.nearObjects.length <= 3) {
    score += 0.25;
  } else if (layers.nearObjects.length > 3) {
    score += 0.1; // too much clutter
  }

  // Background depth: bonus for far objects giving depth
  if (layers.farObjects.length > 0) {
    score += 0.25;
  }

  // Midground framing: bonus for objects flanking the subject
  if (layers.midObjects.length >= 2) {
    score += 0.2;
  }

  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Subject Awareness via Raycasting
// ---------------------------------------------------------------------------

/**
 * Detect focal points in the scene by raycasting from the camera.
 * Returns the number of unobstructed "hits" near the subject.
 */
function detectFocalPoints(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  raycaster: THREE.Raycaster
): number {
  const direction = new THREE.Vector3().subVectors(subjectPosition, cameraPosition).normalize();
  const distance = cameraPosition.distanceTo(subjectPosition);
  raycaster.set(cameraPosition, direction);
  raycaster.far = distance + 1.0;
  raycaster.near = 0;

  let unobstructedHits = 0;
  for (const obj of sceneObjects) {
    const intersects = raycaster.intersectObject(obj, false);
    if (intersects.length > 0 && intersects[0].distance <= distance * 1.05) {
      unobstructedHits++;
    }
  }

  return unobstructedHits;
}

// ---------------------------------------------------------------------------
// Obstacle Avoidance
// ---------------------------------------------------------------------------

/**
 * Check whether the line from camera to subject is clear of obstacles.
 * Returns a penalty factor in [0, 1] where 1 = no obstruction.
 */
function checkObstruction(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  raycaster: THREE.Raycaster
): number {
  const direction = new THREE.Vector3().subVectors(subjectPosition, cameraPosition).normalize();
  const distance = cameraPosition.distanceTo(subjectPosition);
  raycaster.set(cameraPosition, direction);
  raycaster.far = distance * 0.95; // ignore objects very close to subject
  raycaster.near = 0.1; // ignore objects right at camera

  let obstructionPenalty = 1.0;

  for (const obj of sceneObjects) {
    const intersects = raycaster.intersectObject(obj, false);
    if (intersects.length > 0 && intersects[0].distance < distance * 0.9) {
      obstructionPenalty *= 0.5;
    }
  }

  return obstructionPenalty;
}

/**
 * Ensure the camera doesn't clip through geometry by pushing it outward
 * if it's inside or too close to any object.
 */
function resolveClipping(
  cameraPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  margin: number
): THREE.Vector3 {
  const adjusted = cameraPosition.clone();

  for (const obj of sceneObjects) {
    const box = new THREE.Box3().setFromObject(obj);
    const expanded = box.clone().expandByScalar(margin);

    if (expanded.containsPoint(adjusted)) {
      // Push camera to nearest face of expanded box
      const center = new THREE.Vector3();
      expanded.getCenter(center);
      const diff = new THREE.Vector3().subVectors(adjusted, center);

      // Find the nearest face and push outward
      const size = new THREE.Vector3();
      expanded.getSize(size);
      const halfSize = size.multiplyScalar(0.5);

      const ratios = new THREE.Vector3(
        Math.abs(diff.x) / Math.max(halfSize.x, 0.001),
        Math.abs(diff.y) / Math.max(halfSize.y, 0.001),
        Math.abs(diff.z) / Math.max(halfSize.z, 0.001)
      );

      if (ratios.x >= ratios.y && ratios.x >= ratios.z) {
        adjusted.x = center.x + Math.sign(diff.x) * (halfSize.x + margin);
      } else if (ratios.y >= ratios.x && ratios.y >= ratios.z) {
        adjusted.y = center.y + Math.sign(diff.y) * (halfSize.y + margin);
      } else {
        adjusted.z = center.z + Math.sign(diff.z) * (halfSize.z + margin);
      }
    }
  }

  return adjusted;
}

// ---------------------------------------------------------------------------
// Auto-Framing
// ---------------------------------------------------------------------------

/**
 * Calculate the FOV required to frame a subject with the given margin.
 */
function calculateFramingFOV(
  subjectSize: THREE.Vector3,
  distance: number,
  margin: number,
  aspectRatio: number
): number {
  const paddedHeight = subjectSize.y * (1 + margin);
  const paddedWidth = subjectSize.x * (1 + margin);

  const vFov = 2 * Math.atan(paddedHeight / (2 * distance));
  const hFov = 2 * Math.atan(paddedWidth / (2 * distance));
  const vFovFromWidth = 2 * Math.atan(Math.tan(hFov / 2) / aspectRatio);

  return Math.max(vFov, vFovFromWidth) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// Main: Calculate Optimal Camera Position
// ---------------------------------------------------------------------------

/**
 * Calculate the optimal camera position for a given subject and scene.
 * Evaluates multiple candidate viewpoints and selects the best one
 * based on composition rules, depth separation, and obstruction avoidance.
 */
export function calculateOptimalCameraPosition(
  subjectPosition: THREE.Vector3,
  subjectBounds: THREE.Box3,
  options: AutoPlacementOptions = {}
): THREE.Vector3 {
  const center = subjectBounds.getCenter(new THREE.Vector3());
  const size = subjectBounds.getSize(new THREE.Vector3());
  const diagonal = size.length();

  const rng = new SeededRandom(options.seed ?? 42);
  const candidateCount = options.candidateCount ?? DEFAULT_CANDIDATE_COUNT;
  const obstacleMargin = options.obstacleMargin ?? DEFAULT_OBSTACLE_MARGIN;
  const framingMargin = options.framingMargin ?? DEFAULT_FRAMING_MARGIN;
  const depthGap = options.depthLayerGap ?? DEFAULT_DEPTH_GAP;

  const distance = Math.max(
    options.minDistance || diagonal * 2,
    Math.min(options.maxDistance || diagonal * 5, diagonal * 3)
  );

  const targetPos = options.subjectFocus ? subjectPosition : center;
  const height = options.preferredHeight || 1.6;

  // Extract leading lines once
  const sceneObjects = options.sceneObjects ?? [];
  const raycaster = options.raycaster ?? new THREE.Raycaster();
  const leadingLines = options.leadingLines ? extractLeadingLines(sceneObjects) : [];
  const dominantLineDir = findDominantLineDirection(leadingLines);

  // Generate candidate viewpoints
  const candidates: CandidateViewpoint[] = [];

  for (let i = 0; i < candidateCount; i++) {
    // Sample angle uniformly around subject
    const angle = rng.nextFloat(0, Math.PI * 2);

    // Compute offset based on composition rule
    let radialOffset = 0;
    if (options.ruleOfThirds) {
      radialOffset = ruleOfThirdsOffset(diagonal) * (rng.next() > 0.5 ? 1 : -1);
    } else if (options.goldenRatio) {
      radialOffset = goldenRatioOffset(diagonal) * (rng.next() > 0.5 ? 1 : -1);
    }

    // Sample height variation
    const heightVariation = rng.nextFloat(-0.5, 0.5);

    const position = new THREE.Vector3(
      center.x + Math.cos(angle) * distance + radialOffset * Math.cos(angle + Math.PI / 2),
      height + heightVariation,
      center.z + Math.sin(angle) * distance + radialOffset * Math.sin(angle + Math.PI / 2)
    );

    // Avoid clipping
    const resolvedPos = resolveClipping(position, sceneObjects, obstacleMargin);

    // Evaluate candidate
    const score = evaluateViewpointQuality(resolvedPos, targetPos, sceneObjects, {
      ...options,
      dominantLineDir,
      depthGap,
      raycaster,
    });

    // Calculate auto-framing FOV
    const fov = calculateFramingFOV(size, resolvedPos.distanceTo(targetPos), framingMargin, 16 / 9);

    candidates.push({ position: resolvedPos, target: targetPos, score, fov });
  }

  // Select best candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].position : new THREE.Vector3(
    center.x + distance,
    height,
    center.z
  );
}

// ---------------------------------------------------------------------------
// Evaluate Viewpoint Quality
// ---------------------------------------------------------------------------

export interface ViewpointEvalOptions {
  ruleOfThirds?: boolean;
  goldenRatio?: boolean;
  leadingLines?: boolean;
  dominantLineDir?: THREE.Vector3 | null;
  depthLayerGap?: number;
  depthGap?: number;
  raycaster?: THREE.Raycaster;
}

/**
 * Evaluate the quality of a camera viewpoint on a 0-1 scale.
 * Considers obstruction, composition rules, depth, and leading lines.
 */
export function evaluateViewpointQuality(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  evalOptions: ViewpointEvalOptions = {}
): number {
  let score = 1.0;

  const direction = new THREE.Vector3().subVectors(subjectPosition, cameraPosition).normalize();
  const distance = cameraPosition.distanceTo(subjectPosition);

  // 1. Obstruction check
  if (sceneObjects.length > 0 && evalOptions.raycaster) {
    const obstruction = checkObstruction(cameraPosition, subjectPosition, sceneObjects, evalOptions.raycaster);
    score *= obstruction;
  }

  // 2. Height preference: eye-level is best
  const heightDiff = Math.abs(cameraPosition.y - subjectPosition.y);
  if (heightDiff > 2) score *= 0.8;

  // 3. Angle preference: not too steep
  const angle = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  if (Math.abs(angle) > Math.PI / 4) score *= 0.7;

  // 4. Composition scoring
  // Simple projected position approximation for composition evaluation
  const projected = new THREE.Vector2(
    (subjectPosition.x - cameraPosition.x) / distance * 500 + 500,
    (subjectPosition.y - cameraPosition.y) / distance * 500 + 500
  );

  if (evalOptions.ruleOfThirds) {
    score *= 0.7 + 0.3 * evaluateRuleOfThirds(projected, 1000, 1000);
  }

  if (evalOptions.goldenRatio) {
    score *= 0.7 + 0.3 * evaluateGoldenRatio(projected, 1000, 1000);
  }

  // 5. Leading lines alignment
  if (evalOptions.leadingLines && evalOptions.dominantLineDir) {
    score *= 0.6 + 0.4 * evaluateLeadingLines(cameraPosition, subjectPosition, evalOptions.dominantLineDir);
  }

  // 6. Depth composition
  if (sceneObjects.length > 0) {
    const gap = evalOptions.depthLayerGap ?? DEFAULT_DEPTH_GAP;
    const layers = classifyDepthLayers(cameraPosition, subjectPosition, sceneObjects, gap);
    score *= 0.5 + 0.5 * evaluateDepthComposition(layers);
  }

  return THREE.MathUtils.clamp(score, 0, 1);
}

/**
 * Classify depth layers for a given camera position.
 * Public helper for use by other composition modules.
 */
export function getDepthLayers(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  objects: THREE.Object3D[],
  gap: number = DEFAULT_DEPTH_GAP
): DepthLayer {
  return classifyDepthLayers(cameraPosition, subjectPosition, objects, gap);
}

/**
 * Detect whether the camera's view to the subject is obstructed.
 */
export function isViewObstructed(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  raycaster?: THREE.Raycaster
): boolean {
  const rc = raycaster ?? new THREE.Raycaster();
  return checkObstruction(cameraPosition, subjectPosition, sceneObjects, rc) < 0.9;
}

export default {
  calculateOptimalCameraPosition,
  evaluateViewpointQuality,
  getDepthLayers,
  isViewObstructed,
};
