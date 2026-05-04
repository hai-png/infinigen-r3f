/**
 * Rule of Thirds Composition Helper
 *
 * Enhanced with intersection strength calculation, subject tracking,
 * balance scoring, diagonal complement, negative space management,
 * and golden ratio alternative.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

export interface GridIntersection {
  /** Screen-space x coordinate */
  x: number;
  /** Screen-space y coordinate */
  y: number;
  /** Computed strength score for this intersection */
  strength: number;
}

export interface CompositionScore {
  /** Overall composition quality (0-1) */
  overall: number;
  /** Rule-of-thirds alignment score (0-1) */
  thirdsAlignment: number;
  /** Visual balance across quadrants (0-1) */
  balance: number;
  /** Diagonal complement score (0-1) */
  diagonalComplement: number;
  /** Negative space adequacy (0-1) */
  negativeSpace: number;
  /** Golden ratio alignment (0-1) */
  goldenRatioAlignment: number;
}

export interface QuadrantWeights {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

// ---------------------------------------------------------------------------
// Intersection Strength Calculation
// ---------------------------------------------------------------------------

/**
 * Get the four rule-of-thirds intersection points with weighted scoring.
 *
 * The strength of each intersection is calculated based on:
 * - Distance from frame center (farther = stronger power point)
 * - Proximity to natural eye-scanning paths
 * - Cultural reading-direction bias (configurable)
 */
export function getRuleOfThirdsPoints(
  frameWidth: number,
  frameHeight: number,
  options: {
    /** Weighting mode for intersection strengths */
    weightMode?: 'equal' | 'natural' | 'cultural';
    /** Reading direction for cultural weighting ('ltr' or 'rtl') */
    readingDirection?: 'ltr' | 'rtl';
  } = {}
): GridIntersection[] {
  const thirdW = frameWidth / 3;
  const thirdH = frameHeight / 3;
  const mode = options.weightMode ?? 'natural';
  const dir = options.readingDirection ?? 'ltr';

  const basePoints: Array<{ x: number; y: number; equalW: number; naturalW: number; culturalLtrW: number; culturalRtlW: number }> = [
    // Upper-left intersection
    { x: thirdW,     y: thirdH,     equalW: 1.0, naturalW: 1.0,  culturalLtrW: 1.2, culturalRtlW: 0.9 },
    // Upper-right intersection
    { x: thirdW * 2, y: thirdH,     equalW: 1.0, naturalW: 0.85, culturalLtrW: 0.9, culturalRtlW: 1.1 },
    // Lower-left intersection
    { x: thirdW,     y: thirdH * 2, equalW: 1.0, naturalW: 0.85, culturalLtrW: 0.8, culturalRtlW: 1.1 },
    // Lower-right intersection
    { x: thirdW * 2, y: thirdH * 2, equalW: 1.0, naturalW: 1.0,  culturalLtrW: 1.1, culturalRtlW: 0.8 },
  ];

  // Normalize weights
  const getWeight = (p: typeof basePoints[0]): number => {
    switch (mode) {
      case 'equal': return p.equalW;
      case 'cultural': return dir === 'ltr' ? p.culturalLtrW : p.culturalRtlW;
      case 'natural':
      default: return p.naturalW;
    }
  };

  const rawWeights = basePoints.map(getWeight);
  const maxWeight = Math.max(...rawWeights);

  return basePoints.map((p, i) => ({
    x: p.x,
    y: p.y,
    strength: rawWeights[i] / maxWeight,
  }));
}

/**
 * Compute detailed intersection strength for a single point.
 * Factors in edge proximity, golden spiral proximity, and diagonal alignment.
 */
export function computeIntersectionStrength(
  point: THREE.Vector2,
  frameWidth: number,
  frameHeight: number
): number {
  const center = new THREE.Vector2(frameWidth / 2, frameHeight / 2);
  const diagonal = Math.hypot(frameWidth, frameHeight);

  // 1. Distance from center: farther = more powerful (up to a limit)
  const distFromCenter = point.distanceTo(center);
  const centerProximityScore = Math.min(1, distFromCenter / (diagonal * 0.25));

  // 2. Proximity to golden spiral focal point
  const PHI = (1 + Math.sqrt(5)) / 2;
  const spiralX = frameWidth / PHI;
  const spiralY = frameHeight / PHI;
  const spiralDist = point.distanceTo(new THREE.Vector2(spiralX, spiralY));
  const spiralScore = Math.exp(-(spiralDist * spiralDist) / (diagonal * 0.05));

  // 3. Diagonal alignment: being near a diagonal gives extra strength
  const diag1Dist = distancePointToLine(
    point,
    new THREE.Vector2(0, 0),
    new THREE.Vector2(frameWidth, frameHeight)
  );
  const diag2Dist = distancePointToLine(
    point,
    new THREE.Vector2(frameWidth, 0),
    new THREE.Vector2(0, frameHeight)
  );
  const minDiagDist = Math.min(diag1Dist, diag2Dist);
  const diagScore = Math.exp(-(minDiagDist * minDiagDist) / (diagonal * 0.03));

  // Weighted combination
  return centerProximityScore * 0.4 + spiralScore * 0.3 + diagScore * 0.3;
}

// ---------------------------------------------------------------------------
// Subject Tracking (Align to Nearest Power Point)
// ---------------------------------------------------------------------------

/**
 * Align the primary subject to the nearest power point on the rule-of-thirds grid.
 * Returns the adjusted camera target offset that places the subject on a power point.
 */
export function alignSubjectToRuleOfThirds(
  subjectPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  frameWidth: number,
  frameHeight: number
): THREE.Vector3 {
  const points = getRuleOfThirdsPoints(frameWidth, frameHeight);
  const projected = projectToWorld(subjectPosition, cameraPosition, frameWidth, frameHeight);

  // Find closest intersection weighted by strength
  let bestPoint = points[0];
  let bestScore = -Infinity;

  for (const point of points) {
    const dist = Math.hypot(point.x - projected.x, point.y - projected.y);
    const maxDist = Math.hypot(frameWidth, frameHeight);
    // Score: higher strength and closer distance
    const score = point.strength * (1 - dist / maxDist);
    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  }

  // Compute world-space offset from the best power point
  const worldOffsetX = (bestPoint.x - projected.x);
  const worldOffsetY = (bestPoint.y - projected.y);

  return new THREE.Vector3(
    subjectPosition.x + worldOffsetX,
    subjectPosition.y + worldOffsetY,
    subjectPosition.z
  );
}

/**
 * Project a world position to screen coordinates given a camera position.
 */
function projectToWorld(
  subject: THREE.Vector3,
  camera: THREE.Vector3,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  const diff = new THREE.Vector3().subVectors(subject, camera);
  const distance = diff.length();
  if (distance < 0.001) return { x: frameW / 2, y: frameH / 2 };

  // Simple perspective projection
  const fov = 75 * (Math.PI / 180);
  const scale = (frameH / 2) / Math.tan(fov / 2);

  return {
    x: (diff.x / distance) * scale + frameW / 2,
    y: (diff.y / distance) * scale + frameH / 2,
  };
}

// ---------------------------------------------------------------------------
// Balance Scoring
// ---------------------------------------------------------------------------

/**
 * Evaluate visual weight distribution across the four quadrants.
 * A well-balanced composition has roughly equal visual weight on each side,
 * or a deliberate asymmetry that follows the rule of thirds.
 */
export function evaluateBalance(
  quadrantWeights: QuadrantWeights
): number {
  const weights = [
    quadrantWeights.topLeft,
    quadrantWeights.topRight,
    quadrantWeights.bottomLeft,
    quadrantWeights.bottomRight,
  ];

  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return 0.5;

  const normalized = weights.map((w) => w / total);

  // Left vs Right balance
  const leftWeight = normalized[0] + normalized[2];
  const rightWeight = normalized[1] + normalized[3];
  const horizontalBalance = 1 - Math.abs(leftWeight - rightWeight);

  // Top vs Bottom balance
  const topWeight = normalized[0] + normalized[1];
  const bottomWeight = normalized[2] + normalized[3];
  const verticalBalance = 1 - Math.abs(topWeight - bottomWeight);

  // Diagonal balance (for rule-of-thirds, slight asymmetry is desired)
  const diagonalDiff = Math.abs((normalized[0] + normalized[3]) - (normalized[1] + normalized[2]));
  const diagonalBonus = diagonalDiff < 0.3 ? 0.1 : -0.1;

  return THREE.MathUtils.clamp(
    horizontalBalance * 0.4 + verticalBalance * 0.4 + 0.2 + diagonalBonus,
    0,
    1
  );
}

/**
 * Compute visual weight for each quadrant based on scene object positions.
 */
export function computeQuadrantWeights(
  cameraPosition: THREE.Vector3,
  cameraDirection: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  frameWidth: number,
  frameHeight: number
): QuadrantWeights {
  const right = new THREE.Vector3().crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, cameraDirection).normalize();

  const weights: QuadrantWeights = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };

  for (const obj of sceneObjects) {
    const center = new THREE.Vector3();
    const box = new THREE.Box3().setFromObject(obj);
    box.getCenter(center);

    // Project relative to camera
    const diff = new THREE.Vector3().subVectors(center, cameraPosition);
    const horizontal = diff.dot(right);
    const vertical = diff.dot(up);

    // Visual weight based on screen-space area
    const size = new THREE.Vector3();
    box.getSize(size);
    const weight = size.x * size.y * size.z;

    if (vertical > 0 && horizontal < 0) weights.topLeft += weight;
    else if (vertical > 0 && horizontal >= 0) weights.topRight += weight;
    else if (vertical <= 0 && horizontal < 0) weights.bottomLeft += weight;
    else weights.bottomRight += weight;
  }

  return weights;
}

// ---------------------------------------------------------------------------
// Diagonal Complement
// ---------------------------------------------------------------------------

/**
 * Evaluate whether secondary subjects are placed on the opposing diagonal
 * from the primary subject, creating visual tension and depth.
 */
export function evaluateDiagonalComplement(
  primarySubject: THREE.Vector2,
  secondarySubjects: THREE.Vector2[],
  frameWidth: number,
  frameHeight: number
): number {
  if (secondarySubjects.length === 0) return 0.3; // neutral if no secondaries

  // Determine which diagonal the primary is on
  const primaryRelative = new THREE.Vector2(
    primarySubject.x / frameWidth - 0.5,
    primarySubject.y / frameHeight - 0.5
  );
  const primarySign = Math.sign(primaryRelative.x * primaryRelative.y);

  let complementScore = 0;
  for (const secondary of secondarySubjects) {
    const secondaryRelative = new THREE.Vector2(
      secondary.x / frameWidth - 0.5,
      secondary.y / frameHeight - 0.5
    );
    const secondarySign = Math.sign(secondaryRelative.x * secondaryRelative.y);

    // Opposite sign means opposite diagonal
    if (primarySign !== secondarySign && primarySign !== 0) {
      complementScore += 1;
    }
  }

  return Math.min(1, complementScore / Math.max(1, secondarySubjects.length) * 2);
}

/**
 * Find the best position for a secondary subject on the opposing diagonal.
 */
export function findDiagonalComplementPosition(
  primaryScreenPos: THREE.Vector2,
  frameWidth: number,
  frameHeight: number
): THREE.Vector2 {
  // Mirror across center for the opposing diagonal
  const mirrored = new THREE.Vector2(
    frameWidth - primaryScreenPos.x,
    frameHeight - primaryScreenPos.y
  );

  // Snap to nearest thirds intersection
  const points = getRuleOfThirdsPoints(frameWidth, frameHeight);
  let bestPoint = points[0];
  let minDist = Infinity;

  for (const point of points) {
    const d = Math.hypot(point.x - mirrored.x, point.y - mirrored.y);
    if (d < minDist) {
      minDist = d;
      bestPoint = point;
    }
  }

  return new THREE.Vector2(bestPoint.x, bestPoint.y);
}

// ---------------------------------------------------------------------------
// Negative Space Management
// ---------------------------------------------------------------------------

/**
 * Evaluate the adequacy of negative (empty) space in the composition.
 * Good composition leaves breathing room around the subject,
 * especially in the direction of motion or gaze.
 */
export function evaluateNegativeSpace(
  subjectScreenPos: THREE.Vector2,
  subjectDirection: THREE.Vector2,
  frameWidth: number,
  frameHeight: number,
  subjectRadius: number
): number {
  // Space in front of the subject (direction of motion/gaze)
  const frontX = subjectScreenPos.x + subjectDirection.x * subjectRadius * 2;
  const frontY = subjectScreenPos.y + subjectDirection.y * subjectRadius * 2;
  const frontSpaceX = frontX > subjectScreenPos.x
    ? (frameWidth - frontX) / frameWidth
    : frontX / frameWidth;
  const frontSpaceY = frontY > subjectScreenPos.y
    ? (frameHeight - frontY) / frameHeight
    : frontY / frameHeight;
  const frontSpace = (frontSpaceX + frontSpaceY) / 2;

  // General breathing room (distance to nearest edge)
  const distToEdge = Math.min(
    subjectScreenPos.x,
    frameWidth - subjectScreenPos.x,
    subjectScreenPos.y,
    frameHeight - subjectScreenPos.y
  );
  const minBreathingRoom = subjectRadius * 1.5;
  const breathingScore = Math.min(1, distToEdge / minBreathingRoom);

  // Penalize if subject is too close to edge
  const edgePenalty = distToEdge < subjectRadius ? 0.5 : 1.0;

  // Front space is more important than back space
  return THREE.MathUtils.clamp(
    frontSpace * 0.5 + breathingScore * 0.35 + edgePenalty * 0.15,
    0,
    1
  );
}

/**
 * Calculate how much to offset the subject from center to ensure adequate negative space.
 */
export function calculateNegativeSpaceOffset(
  subjectScreenPos: THREE.Vector2,
  gazeDirection: THREE.Vector2,
  frameWidth: number,
  frameHeight: number,
  desiredRatio: number = 0.6
): THREE.Vector2 {
  const center = new THREE.Vector2(frameWidth / 2, frameHeight / 2);

  // Offset subject so more space is in the gaze direction
  const offsetFromCenter = new THREE.Vector2().subVectors(subjectScreenPos, center);
  const desiredOffset = gazeDirection.clone().multiplyScalar(
    Math.min(frameWidth, frameHeight) * desiredRatio * 0.15
  );

  // If subject is already offset in gaze direction, less adjustment needed
  const currentAlignment = offsetFromCenter.dot(gazeDirection);
  if (currentAlignment > 0) {
    return desiredOffset.multiplyScalar(0.5);
  }

  return desiredOffset;
}

// ---------------------------------------------------------------------------
// Golden Ratio Alternative
// ---------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Get the four golden-ratio (phi-based) grid intersection points.
 * The golden ratio divides the frame at ≈0.382 and ≈0.618 instead of 1/3 and 2/3.
 */
export function getGoldenRatioPoints(
  frameWidth: number,
  frameHeight: number
): GridIntersection[] {
  const phiX1 = frameWidth / PHI;
  const phiX2 = frameWidth - phiX1;
  const phiY1 = frameHeight / PHI;
  const phiY2 = frameHeight - phiY1;

  return [
    { x: phiX1, y: phiY1, strength: 1.0 },
    { x: phiX2, y: phiY1, strength: 0.9 },
    { x: phiX1, y: phiY2, strength: 0.9 },
    { x: phiX2, y: phiY2, strength: 0.95 },
  ];
}

/**
 * Align subject to nearest golden-ratio grid point.
 */
export function alignSubjectToGoldenRatio(
  subjectPosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  frameWidth: number,
  frameHeight: number
): THREE.Vector3 {
  const points = getGoldenRatioPoints(frameWidth, frameHeight);
  const projected = projectToWorld(subjectPosition, cameraPosition, frameWidth, frameHeight);

  let bestPoint = points[0];
  let minDist = Infinity;

  for (const point of points) {
    const dist = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (dist < minDist) {
      minDist = dist;
      bestPoint = point;
    }
  }

  return new THREE.Vector3(
    subjectPosition.x + (bestPoint.x - projected.x),
    subjectPosition.y + (bestPoint.y - projected.y),
    subjectPosition.z
  );
}

// ---------------------------------------------------------------------------
// Full Composition Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate the complete composition quality for a given camera-subject setup.
 * Returns detailed scores for each aspect of the rule-of-thirds composition.
 */
export function evaluateComposition(
  cameraPosition: THREE.Vector3,
  subjectPosition: THREE.Vector3,
  secondarySubjects: THREE.Vector3[],
  cameraDirection: THREE.Vector3,
  sceneObjects: THREE.Object3D[],
  frameWidth: number,
  frameHeight: number,
  options: {
    useGoldenRatio?: boolean;
    subjectGazeDirection?: THREE.Vector2;
  } = {}
): CompositionScore {
  const projected = projectToWorld(subjectPosition, cameraPosition, frameWidth, frameHeight);
  const projectedVec = new THREE.Vector2(projected.x, projected.y);

  // 1. Thirds alignment
  const points = options.useGoldenRatio
    ? getGoldenRatioPoints(frameWidth, frameHeight)
    : getRuleOfThirdsPoints(frameWidth, frameHeight);
  let minDist = Infinity;
  for (const point of points) {
    const d = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (d < minDist) minDist = d;
  }
  const maxDist = Math.hypot(frameWidth / 3, frameHeight / 3);
  const thirdsAlignment = Math.max(0, 1 - minDist / maxDist);

  // 2. Balance scoring
  const quadrantWeights = computeQuadrantWeights(
    cameraPosition,
    cameraDirection,
    sceneObjects,
    frameWidth,
    frameHeight
  );
  const balance = evaluateBalance(quadrantWeights);

  // 3. Diagonal complement
  const secondaryProjected = secondarySubjects.map((s) => {
    const p = projectToWorld(s, cameraPosition, frameWidth, frameHeight);
    return new THREE.Vector2(p.x, p.y);
  });
  const diagonalComplement = evaluateDiagonalComplement(
    projectedVec,
    secondaryProjected,
    frameWidth,
    frameHeight
  );

  // 4. Negative space
  const subjectRadius = Math.min(frameWidth, frameHeight) * 0.05;
  const gazeDir = options.subjectGazeDirection ?? new THREE.Vector2(1, 0);
  const negativeSpace = evaluateNegativeSpace(
    projectedVec, gazeDir, frameWidth, frameHeight, subjectRadius
  );

  // 5. Golden ratio alignment
  const goldenPoints = getGoldenRatioPoints(frameWidth, frameHeight);
  let goldenMinDist = Infinity;
  for (const point of goldenPoints) {
    const d = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (d < goldenMinDist) goldenMinDist = d;
  }
  const goldenRatioAlignment = Math.max(0, 1 - goldenMinDist / maxDist);

  // Overall score
  const overall = THREE.MathUtils.clamp(
    thirdsAlignment * 0.3 +
    balance * 0.2 +
    diagonalComplement * 0.15 +
    negativeSpace * 0.2 +
    goldenRatioAlignment * 0.15,
    0,
    1
  );

  return {
    overall,
    thirdsAlignment,
    balance,
    diagonalComplement,
    negativeSpace,
    goldenRatioAlignment,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distancePointToLine(
  point: THREE.Vector2,
  lineA: THREE.Vector2,
  lineB: THREE.Vector2
): number {
  const dx = lineB.x - lineA.x;
  const dy = lineB.y - lineA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return point.distanceTo(lineA);

  const t = Math.max(0, Math.min(1,
    ((point.x - lineA.x) * dx + (point.y - lineA.y) * dy) / lenSq
  ));
  const projX = lineA.x + t * dx;
  const projY = lineA.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

export default {
  getRuleOfThirdsPoints,
  computeIntersectionStrength,
  alignSubjectToRuleOfThirds,
  evaluateBalance,
  computeQuadrantWeights,
  evaluateDiagonalComplement,
  findDiagonalComplementPosition,
  evaluateNegativeSpace,
  calculateNegativeSpaceOffset,
  getGoldenRatioPoints,
  alignSubjectToGoldenRatio,
  evaluateComposition,
};
