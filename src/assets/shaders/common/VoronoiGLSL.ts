/**
 * VoronoiGLSL — Voronoi noise with distance-to-edge mode
 *
 * Provides injectable GLSL snippets for:
 * - 2D and 3D Voronoi with configurable distance metrics
 * - Distance-to-edge (F2-F1) mode for crack patterns
 * - Cell ID for random per-cell variation
 * - Animated Voronoi (4th dimension for time)
 *
 * Used by lava, hammered metal, and terrain crack shaders.
 *
 * @module assets/shaders/common
 */

// ============================================================================
// 2D Voronoi
// ============================================================================

/**
 * 2D Voronoi with F1, F2, and cell ID.
 */
export const VORONOI_2D_GLSL = /* glsl */ `
// ============================================================================
// 2D Voronoi
// ============================================================================

vec2 hash22_voronoi2d(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

struct VoronoiResult2D {
  float f1;       // Distance to nearest feature point
  float f2;       // Distance to second nearest feature point
  vec2 cellId;    // ID of nearest cell (for per-cell variation)
  float edgeDist; // Distance to nearest edge (F2 - F1)
};

VoronoiResult2D voronoi2D(vec2 p) {
  VoronoiResult2D result;
  vec2 i = floor(p);
  vec2 f = fract(p);

  float f1 = 8.0;
  float f2 = 8.0;
  vec2 cellId = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22_voronoi2d(i + neighbor);
      vec2 diff = neighbor + point - f;
      float dist = length(diff);

      if (dist < f1) {
        f2 = f1;
        f1 = dist;
        cellId = i + neighbor;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }

  result.f1 = f1;
  result.f2 = f2;
  result.cellId = cellId;
  result.edgeDist = f2 - f1;
  return result;
}
`;

// ============================================================================
// 3D Voronoi
// ============================================================================

/**
 * 3D Voronoi with F1, F2, and cell ID.
 */
export const VORONOI_3D_GLSL = /* glsl */ `
// ============================================================================
// 3D Voronoi
// ============================================================================

vec3 hash33_voronoi3d(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

struct VoronoiResult3D {
  float f1;
  float f2;
  vec3 cellId;
  float edgeDist;
};

VoronoiResult3D voronoi3D(vec3 p) {
  VoronoiResult3D result;
  vec3 i = floor(p);
  vec3 f = fract(p);

  float f1 = 8.0;
  float f2 = 8.0;
  vec3 cellId = vec3(0.0);

  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash33_voronoi3d(i + neighbor);
        vec3 diff = neighbor + point - f;
        float dist = length(diff);

        if (dist < f1) {
          f2 = f1;
          f1 = dist;
          cellId = i + neighbor;
        } else if (dist < f2) {
          f2 = dist;
        }
      }
    }
  }

  result.f1 = f1;
  result.f2 = f2;
  result.cellId = cellId;
  result.edgeDist = f2 - f1;
  return result;
}
`;

// ============================================================================
// Animated Voronoi (time dimension)
// ============================================================================

/**
 * Animated 2D Voronoi with time parameter for crack animation.
 * The feature points move over time, creating flowing crack patterns.
 */
export const VORONOI_ANIMATED_2D_GLSL = /* glsl */ `
// ============================================================================
// Animated 2D Voronoi (with time)
// ============================================================================

VoronoiResult2D voronoi2DAnimated(vec2 p, float time) {
  VoronoiResult2D result;
  vec2 i = floor(p);
  vec2 f = fract(p);

  float f1 = 8.0;
  float f2 = 8.0;
  vec2 cellId = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22_voronoi2d(i + neighbor);

      // Animate feature points
      point = 0.5 + 0.5 * sin(time + 6.2831 * point);

      vec2 diff = neighbor + point - f;
      float dist = length(diff);

      if (dist < f1) {
        f2 = f1;
        f1 = dist;
        cellId = i + neighbor;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }

  result.f1 = f1;
  result.f2 = f2;
  result.cellId = cellId;
  result.edgeDist = f2 - f1;
  return result;
}
`;

// ============================================================================
// Voronoi Distance-to-Edge (optimized for crack patterns)
// ============================================================================

/**
 * Fast Voronoi distance-to-edge computation.
 * Returns a smooth edge distance that can be thresholded for crack patterns.
 * Optimized version that only computes edge distance without full F1/F2.
 */
export const VORONOI_EDGE_GLSL = /* glsl */ `
// ============================================================================
// Voronoi Distance-to-Edge (fast)
// ============================================================================

float voronoiEdge2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float minDist = 8.0;

  // First pass: find nearest cell
  vec2 nearestPoint = vec2(0.0);
  float f1 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22_voronoi2d(i + neighbor);
      vec2 diff = neighbor + point - f;
      float dist = dot(diff, diff); // Squared distance for speed
      if (dist < f1) {
        f1 = dist;
        nearestPoint = neighbor + point;
      }
    }
  }
  f1 = sqrt(f1);

  // Second pass: compute distance to edge
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22_voronoi2d(i + neighbor);
      vec2 diff = neighbor + point - f;

      // Edge distance: distance to perpendicular bisector
      vec2 toNearest = nearestPoint - f;
      vec2 toOther = diff;
      vec2 edgeNormal = toOther - toNearest;
      float edgeDist = dot(0.5 * (toNearest + toOther), edgeNormal) / length(edgeNormal);
      minDist = min(minDist, abs(edgeDist));
    }
  }

  return minDist;
}
`;

/**
 * All Voronoi GLSL snippets combined.
 */
export const ALL_VORONOI_GLSL = [
  VORONOI_2D_GLSL,
  VORONOI_3D_GLSL,
  VORONOI_ANIMATED_2D_GLSL,
  VORONOI_EDGE_GLSL,
].join('\n');
