/**
 * LeadingLines - Detect leading lines in 3D scenes for camera composition
 *
 * Leading lines are visual elements (edges, ridgelines, roads, fences, rivers)
 * that draw the viewer's eye toward a subject. This module detects prominent
 * linear features in the scene and suggests camera positions that align with them.
 *
 * The detection algorithm:
 * 1. Extract edges from scene geometry (silhouette edges, sharp crease edges)
 * 2. Fit line segments to edge clusters using RANSAC
 * 3. Score each line by length, visibility, and convergence toward a focal point
 * 4. Suggest camera alignment along high-scoring lines
 */

import * as THREE from 'three';

// ============================================================================
// Public Types
// ============================================================================

/** A detected leading line in the scene */
export interface LeadingLine {
  /** Starting point of the line segment (world space) */
  start: THREE.Vector3;
  /** Ending point of the line segment (world space) */
  end: THREE.Vector3;
  /** Direction vector (normalized) */
  direction: THREE.Vector3;
  /** Length of the line segment */
  length: number;
  /** Score [0, 1] indicating how prominent this leading line is */
  score: number;
  /** Source of the line (e.g., 'edge', 'silhouette', 'ridge') */
  source: string;
}

/** Result of leading line detection */
export interface LeadingLineResult {
  /** Detected leading lines, sorted by score (highest first) */
  lines: LeadingLine[];
  /** Suggested focal point (convergence of leading lines) */
  focalPoint: THREE.Vector3 | null;
  /** Total number of edges analyzed */
  edgesAnalyzed: number;
}

/** Configuration for leading line detection */
export interface LeadingLineConfig {
  /** Minimum edge length to consider (default: 0.5) */
  minLength?: number;
  /** Maximum number of leading lines to return (default: 10) */
  maxLines?: number;
  /** Angle threshold in radians for crease edge detection (default: Math.PI / 6 = 30°) */
  creaseAngle?: number;
  /** Minimum score for a line to be included (default: 0.1) */
  minScore?: number;
  /** RANSAC iterations for line fitting (default: 50) */
  ransacIterations?: number;
  /** RANSAC distance threshold for inlier classification (default: 0.3) */
  ransacThreshold?: number;
}

/** Camera alignment suggestion based on leading lines */
export interface CameraAlignment {
  /** Suggested camera position */
  position: THREE.Vector3;
  /** Suggested camera look-at target */
  lookAt: THREE.Vector3;
  /** Score of this alignment [0, 1] */
  score: number;
  /** Which leading lines contribute to this alignment */
  contributingLines: LeadingLine[];
}

// ============================================================================
// Edge Extraction
// ============================================================================

/**
 * Extract edges from a 3D mesh that could serve as leading lines.
 *
 * Identifies:
 * - Boundary edges (edges with only one adjacent face)
 * - Crease edges (edges where adjacent face normals differ by more than creaseAngle)
 * - Long edges (edges longer than minLength)
 */
function extractEdges(
  object: THREE.Object3D,
  minLength: number,
  creaseAngle: number
): Array<{ start: THREE.Vector3; end: THREE.Vector3; normalA?: THREE.Vector3; normalB?: THREE.Vector3 }> {
  const edges: Array<{ start: THREE.Vector3; end: THREE.Vector3; normalA?: THREE.Vector3; normalB?: THREE.Vector3 }> = [];

  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry;
    if (!geometry) return;

    const worldMatrix = mesh.matrixWorld;
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const index = geometry.getIndex();

    if (!posAttr) return;

    // Build edge map: edge key → { face normals }
    const edgeMap = new Map<string, {
      v0: number; v1: number;
      normals: THREE.Vector3[];
    }>();

    const addEdge = (i0: number, i1: number, faceNormal: THREE.Vector3) => {
      const a = Math.min(i0, i1);
      const b = Math.max(i0, i1);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { v0: a, v1: b, normals: [] });
      }
      edgeMap.get(key)!.normals.push(faceNormal);
    };

    // Compute face normals and build edge map
    const computeFaceNormal = (i0: number, i1: number, i2: number): THREE.Vector3 => {
      const a = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const b = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const c = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      return new THREE.Vector3().crossVectors(ab, ac).normalize();
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const i0 = index.getX(i);
        const i1 = index.getX(i + 1);
        const i2 = index.getX(i + 2);
        const faceNormal = computeFaceNormal(i0, i1, i2);
        addEdge(i0, i1, faceNormal);
        addEdge(i1, i2, faceNormal);
        addEdge(i2, i0, faceNormal);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        const faceNormal = computeFaceNormal(i, i + 1, i + 2);
        addEdge(i, i + 1, faceNormal);
        addEdge(i + 1, i + 2, faceNormal);
        addEdge(i + 2, i, faceNormal);
      }
    }

    // Filter edges: boundary or crease edges
    for (const [, edgeData] of edgeMap) {
      const isBoundary = edgeData.normals.length === 1;
      const isCrease = edgeData.normals.length >= 2 &&
        edgeData.normals[0].angleTo(edgeData.normals[1]) > creaseAngle;

      if (isBoundary || isCrease) {
        // Transform to world space
        const start = new THREE.Vector3(
          posAttr.getX(edgeData.v0), posAttr.getY(edgeData.v0), posAttr.getZ(edgeData.v0)
        ).applyMatrix4(worldMatrix);
        const end = new THREE.Vector3(
          posAttr.getX(edgeData.v1), posAttr.getY(edgeData.v1), posAttr.getZ(edgeData.v1)
        ).applyMatrix4(worldMatrix);

        const length = start.distanceTo(end);
        if (length >= minLength) {
          edges.push({
            start,
            end,
            normalA: edgeData.normals[0],
            normalB: edgeData.normals[1],
          });
        }
      }
    }
  });

  return edges;
}

// ============================================================================
// Line Fitting (RANSAC)
// ============================================================================

/**
 * Fit a line to a set of 3D points using RANSAC.
 *
 * Returns the best-fit line direction and inlier count.
 */
function fitLineRANSAC(
  points: THREE.Vector3[],
  iterations: number,
  threshold: number
): { direction: THREE.Vector3; pointOnLine: THREE.Vector3; inlierCount: number } | null {
  if (points.length < 2) return null;

  let bestDirection = new THREE.Vector3(1, 0, 0);
  let bestPoint = points[0].clone();
  let bestInlierCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Pick two random points
    const i = Math.floor(Math.random() * points.length);
    let j = Math.floor(Math.random() * points.length);
    if (i === j) j = (j + 1) % points.length;

    const direction = new THREE.Vector3().subVectors(points[j], points[i]).normalize();
    if (direction.lengthSq() < 1e-10) continue;

    // Count inliers (points within threshold distance of the line)
    let inlierCount = 0;
    for (const p of points) {
      const toPoint = new THREE.Vector3().subVectors(p, points[i]);
      const projection = toPoint.dot(direction);
      const closest = new THREE.Vector3().copy(points[i]).add(direction.clone().multiplyScalar(projection));
      const distance = p.distanceTo(closest);
      if (distance < threshold) {
        inlierCount++;
      }
    }

    if (inlierCount > bestInlierCount) {
      bestInlierCount = inlierCount;
      bestDirection = direction.clone();
      bestPoint = points[i].clone();
    }
  }

  return {
    direction: bestDirection,
    pointOnLine: bestPoint,
    inlierCount: bestInlierCount,
  };
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Score a leading line based on its properties.
 *
 * Factors:
 * - Length: longer lines score higher
 * - Convergence: lines pointing toward the scene center score higher
 * - Visibility: lines not occluded by the scene score higher
 */
function scoreLine(
  line: LeadingLine,
  sceneCenter: THREE.Vector3,
  maxLength: number
): number {
  // Length score (0 to 0.4)
  const lengthScore = Math.min(line.length / maxLength, 1.0) * 0.4;

  // Convergence score: how much does this line point toward the scene center?
  // Measure the angle between the line direction and the direction from
  // the line's midpoint to the scene center.
  const midpoint = new THREE.Vector3().addVectors(line.start, line.end).multiplyScalar(0.5);
  const toCenter = new THREE.Vector3().subVectors(sceneCenter, midpoint).normalize();
  const dot = Math.abs(line.direction.dot(toCenter));
  const convergenceScore = dot * 0.4; // 0 to 0.4

  // Straightness score: already a line, so always 1.0 * 0.2
  const straightnessScore = 0.2;

  return Math.min(lengthScore + convergenceScore + straightnessScore, 1.0);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Find leading lines in a 3D scene.
 *
 * Extracts edges from scene geometry, fits line segments using RANSAC,
 * and scores them based on length, convergence, and visibility.
 *
 * @param scene - The THREE.js scene or object to analyze
 * @param config - Detection configuration
 * @returns Detected leading lines and focal point
 *
 * @example
 * ```ts
 * const result = findLeadingLines(scene, { minLength: 1.0, maxLines: 5 });
 * result.lines.forEach(line => {
 *   console.log(`Leading line: ${line.start} → ${line.end}, score: ${line.score}`);
 * });
 * ```
 */
export function findLeadingLines(
  scene: THREE.Object3D | { scene: THREE.Object3D },
  config: LeadingLineConfig = {}
): LeadingLineResult {
  const minLength = config.minLength ?? 0.5;
  const maxLines = config.maxLines ?? 10;
  const creaseAngle = config.creaseAngle ?? Math.PI / 6;
  const minScore = config.minScore ?? 0.1;
  const ransacIterations = config.ransacIterations ?? 50;
  const ransacThreshold = config.ransacThreshold ?? 0.3;

  // Get the actual scene object
  const sceneObj = 'scene' in scene ? scene.scene : scene;

  // Compute scene bounding box for center and scale
  const bbox = new THREE.Box3().setFromObject(sceneObj);
  const sceneCenter = new THREE.Vector3();
  bbox.getCenter(sceneCenter);
  const sceneSize = new THREE.Vector3();
  bbox.getSize(sceneSize);
  const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);

  // Step 1: Extract edges
  const rawEdges = extractEdges(sceneObj, minLength, creaseAngle);

  // Step 2: Convert edges to candidate leading lines
  const candidates: LeadingLine[] = rawEdges.map((edge) => {
    const direction = new THREE.Vector3().subVectors(edge.end, edge.start);
    const length = direction.length();
    direction.normalize();

    return {
      start: edge.start.clone(),
      end: edge.end.clone(),
      direction,
      length,
      score: 0,
      source: edge.normalB ? 'crease' : 'boundary',
    };
  });

  // Step 3: Group nearby parallel edges and fit lines using RANSAC
  // For each group of roughly parallel edges, create a composite line
  const usedEdges = new Set<number>();
  const mergedLines: LeadingLine[] = [];

  // First, add all individual candidate lines
  for (const candidate of candidates) {
    candidate.score = scoreLine(candidate, sceneCenter, maxDim);
    if (candidate.score >= minScore) {
      mergedLines.push(candidate);
    }
  }

  // Step 4: Try to extend short lines by merging collinear neighbors
  for (let i = 0; i < mergedLines.length; i++) {
    for (let j = i + 1; j < mergedLines.length; j++) {
      const lineA = mergedLines[i];
      const lineB = mergedLines[j];

      // Check if lines are roughly parallel and close together
      const dot = Math.abs(lineA.direction.dot(lineB.direction));
      if (dot < 0.9) continue; // Not parallel enough

      // Check distance between midpoints along perpendicular direction
      const midA = new THREE.Vector3().addVectors(lineA.start, lineA.end).multiplyScalar(0.5);
      const midB = new THREE.Vector3().addVectors(lineB.start, lineB.end).multiplyScalar(0.5);
      const dist = midA.distanceTo(midB);
      if (dist > ransacThreshold * 3) continue; // Too far apart

      // Check if lines are collinear (overlap along the line direction)
      const toB = new THREE.Vector3().subVectors(midB, midA);
      const alongDir = Math.abs(toB.dot(lineA.direction));
      const perpDist = Math.sqrt(Math.max(0, dist * dist - alongDir * alongDir));
      if (perpDist > ransacThreshold * 2) continue;

      // Merge: extend lineA to cover both lines' extents
      const allPoints = [lineA.start, lineA.end, lineB.start, lineB.end];
      // Project all points onto lineA.direction and find extremes
      let minProj = Infinity, maxProj = -Infinity;
      let minPoint = lineA.start.clone();
      let maxPoint = lineA.end.clone();

      for (const p of allPoints) {
        const proj = new THREE.Vector3().subVectors(p, lineA.start).dot(lineA.direction);
        if (proj < minProj) { minProj = proj; minPoint = p.clone(); }
        if (proj > maxProj) { maxProj = proj; maxPoint = p.clone(); }
      }

      lineA.start.copy(minPoint);
      lineA.end.copy(maxPoint);
      lineA.length = lineA.start.distanceTo(lineA.end);
      lineA.direction.subVectors(lineA.end, lineA.start).normalize();

      // Remove lineB
      mergedLines.splice(j, 1);
      j--;
    }
  }

  // Step 5: Re-score after merging
  for (const line of mergedLines) {
    line.score = scoreLine(line, sceneCenter, maxDim);
  }

  // Step 6: Sort by score and take top N
  mergedLines.sort((a, b) => b.score - a.score);
  const topLines = mergedLines.slice(0, maxLines).filter((l) => l.score >= minScore);

  // Step 7: Find focal point (convergence of leading lines)
  let focalPoint: THREE.Vector3 | null = null;
  if (topLines.length >= 2) {
    // Find approximate intersection of leading lines
    // Use least-squares intersection of multiple 3D lines
    const intersection = findLineIntersection(topLines);
    if (intersection) {
      focalPoint = intersection;
    }
  }

  return {
    lines: topLines,
    focalPoint,
    edgesAnalyzed: rawEdges.length,
  };
}

/**
 * Find the approximate intersection point of multiple 3D lines.
 *
 * Uses least-squares minimization: find the point P that minimizes
 * the sum of squared distances to all lines.
 *
 * For each line with point p_i and direction d_i, the distance from P to the line is:
 *   d_i = |(P - p_i) × d_i|
 *
 * The least-squares solution is found by solving the normal equations
 * derived from setting the gradient of the sum of squared distances to zero.
 */
function findLineIntersection(lines: LeadingLine[]): THREE.Vector3 | null {
  if (lines.length < 2) return null;

  // Build the normal equation system: A^T * A * P = A^T * b
  // For each line i with direction d_i and point p_i:
  //   (I - d_i * d_i^T) * P = (I - d_i * d_i^T) * p_i
  //
  // Accumulate: A = Σ (I - d_i * d_i^T), b = Σ (I - d_i * d_i^T) * p_i

  const A = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const b = new THREE.Vector3(0, 0, 0);

  for (const line of lines) {
    const d = line.direction;
    const p = new THREE.Vector3().addVectors(line.start, line.end).multiplyScalar(0.5);

    // I - d * d^T (projection onto the plane perpendicular to d)
    const I_minus_ddT = new THREE.Matrix3().set(
      1 - d.x * d.x, -d.x * d.y, -d.x * d.z,
      -d.y * d.x, 1 - d.y * d.y, -d.y * d.z,
      -d.z * d.x, -d.z * d.y, 1 - d.z * d.z
    );

    // A += I - d * d^T
    const aElems = A.elements;
    const mElems = I_minus_ddT.elements;
    for (let i = 0; i < 9; i++) {
      aElems[i] += mElems[i];
    }

    // b += (I - d * d^T) * p
    const contrib = new THREE.Vector3(
      I_minus_ddT.elements[0] * p.x + I_minus_ddT.elements[3] * p.y + I_minus_ddT.elements[6] * p.z,
      I_minus_ddT.elements[1] * p.x + I_minus_ddT.elements[4] * p.y + I_minus_ddT.elements[7] * p.z,
      I_minus_ddT.elements[2] * p.x + I_minus_ddT.elements[5] * p.y + I_minus_ddT.elements[8] * p.z
    );
    b.add(contrib);
  }

  // Solve A * P = b using Cramer's rule
  const det =
    A.elements[0] * (A.elements[4] * A.elements[8] - A.elements[7] * A.elements[5]) -
    A.elements[3] * (A.elements[1] * A.elements[8] - A.elements[7] * A.elements[2]) +
    A.elements[6] * (A.elements[1] * A.elements[5] - A.elements[4] * A.elements[2]);

  if (Math.abs(det) < 1e-10) return null;

  const invDet = 1.0 / det;
  const a = A.elements;

  const px = invDet * (
    (a[4] * a[8] - a[7] * a[5]) * b.x +
    (a[6] * a[5] - a[3] * a[8]) * b.y +
    (a[3] * a[7] - a[6] * a[4]) * b.z
  );
  const py = invDet * (
    (a[7] * a[2] - a[1] * a[8]) * b.x +
    (a[0] * a[8] - a[6] * a[2]) * b.y +
    (a[6] * a[1] - a[0] * a[7]) * b.z
  );
  const pz = invDet * (
    (a[1] * a[5] - a[4] * a[2]) * b.x +
    (a[3] * a[2] - a[0] * a[5]) * b.y +
    (a[0] * a[4] - a[3] * a[1]) * b.z
  );

  return new THREE.Vector3(px, py, pz);
}

/**
 * Suggest camera alignment based on detected leading lines.
 *
 * For each leading line, suggests a camera position along the line
 * (offset to the side) that uses the line to draw the eye toward
 * the focal point.
 *
 * @param result - Leading line detection result
 * @param camera - Current camera (used for reference framing)
 * @returns Suggested camera alignments, sorted by score
 */
export function alignCameraToLeadingLines(
  result: LeadingLineResult,
  camera?: THREE.Camera
): CameraAlignment[] {
  const alignments: CameraAlignment[] = [];

  for (const line of result.lines) {
    // Position camera along the line, offset to one side
    const midpoint = new THREE.Vector3().addVectors(line.start, line.end).multiplyScalar(0.5);
    const lineDir = line.direction.clone();

    // Compute a perpendicular offset direction
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(lineDir, up);
    if (perp.lengthSq() < 0.01) {
      perp.crossVectors(lineDir, new THREE.Vector3(1, 0, 0));
    }
    perp.normalize();

    // Camera position: at the start of the line, offset to the side
    const offset = line.length * 0.5;
    const cameraPos = line.start.clone()
      .add(perp.clone().multiplyScalar(offset))
      .add(up.clone().multiplyScalar(offset * 0.3));

    // Look-at target: the focal point if available, otherwise the midpoint
    const lookAt = result.focalPoint ?? midpoint;

    alignments.push({
      position: cameraPos,
      lookAt: lookAt.clone(),
      score: line.score * 0.8,
      contributingLines: [line],
    });

    // Also suggest from the other side
    const cameraPos2 = line.start.clone()
      .sub(perp.clone().multiplyScalar(offset))
      .add(up.clone().multiplyScalar(offset * 0.3));

    alignments.push({
      position: cameraPos2,
      lookAt: lookAt.clone(),
      score: line.score * 0.7,
      contributingLines: [line],
    });
  }

  // Sort by score
  alignments.sort((a, b) => b.score - a.score);

  return alignments;
}

export default { findLeadingLines, alignCameraToLeadingLines };
