/**
 * NURBSSurface - Non-Uniform Rational B-Spline surface evaluation
 *
 * Implements mathematically correct NURBS surface generation using:
 * - Cox-de Boor recursion for B-spline basis functions
 * - Tensor product surface evaluation
 * - Rational homogeneous coordinate handling (w != 1 for conic sections)
 * - Watertight tessellation to BufferGeometry
 *
 * Replaces the original Infinigen's 30+ .npy control point arrays with
 * parametric profiles that produce anatomically distinct creature body shapes.
 */

import {
  Vector3,
  Vector4,
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three';

// ── Knot Vector Utilities ────────────────────────────────────────────

/**
 * Find the knot span index for a given parameter value.
 *
 * Returns the index i such that knots[i] <= u < knots[i+1].
 * Uses binary search for O(log n) performance.
 *
 * @param degree - Degree of the B-spline
 * @param u - Parameter value to find span for
 * @param knots - The knot vector (must be non-decreasing)
 * @returns The knot span index
 */
export function findKnotSpan(degree: number, u: number, knots: number[]): number {
  const n = knots.length - degree - 1;

  // Clamp u to valid domain [knots[degree], knots[n]]
  if (u >= knots[n]) {
    return n - 1;
  }
  if (u <= knots[degree]) {
    return degree;
  }

  // Binary search
  let low = degree;
  let high = n;
  let mid = Math.floor((low + high) / 2);

  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) {
      high = mid;
    } else {
      low = mid;
    }
    mid = Math.floor((low + high) / 2);
  }

  return mid;
}

/**
 * Evaluate B-spline basis functions using the Cox-de Boor recursion.
 *
 * The basis functions N_{i,p}(u) are defined recursively:
 *   N_{i,0}(u) = 1 if knots[i] <= u < knots[i+1], else 0
 *   N_{i,p}(u) = ((u - knots[i]) / (knots[i+p] - knots[i])) * N_{i,p-1}(u)
 *              + ((knots[i+p+1] - u) / (knots[i+p+1] - knots[i+1])) * N_{i+1,p-1}(u)
 *
 * Returns all non-zero basis functions at the given parameter,
 * which are N_{span-p,p} through N_{span,p} (degree+1 values).
 *
 * @param degree - Degree of the B-spline
 * @param knots - The knot vector
 * @param u - Parameter value
 * @param span - The knot span (from findKnotSpan)
 * @returns Array of degree+1 basis function values
 */
export function evaluateBasis(degree: number, knots: number[], u: number, span: number): number[] {
  const N = new Array<number>(degree + 1);
  const left = new Array<number>(degree + 1);
  const right = new Array<number>(degree + 1);

  N[0] = 1.0;

  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;

    let saved = 0.0;

    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];

      // Avoid division by zero (multiplicity > 1 in knot vector)
      const temp = denom !== 0 ? N[r] / denom : 0;

      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }

    N[j] = saved;
  }

  return N;
}

/**
 * Evaluate B-spline basis function derivatives up to the given order.
 * Uses Algorithm A2.3 from "The NURBS Book" by Piegl & Tiller.
 *
 * @param degree - Degree of the B-spline
 * @param knots - The knot vector
 * @param u - Parameter value
 * @param span - The knot span
 * @param derivOrder - Maximum derivative order to compute
 * @returns 2D array: ders[k][j] = k-th derivative of N_{span-degree+j,degree}(u)
 */
export function evaluateBasisDerivatives(
  degree: number,
  knots: number[],
  u: number,
  span: number,
  derivOrder: number,
): number[][] {
  const left = new Array<number>(degree + 1);
  const right = new Array<number>(degree + 1);

  // ndu[i][j] stores the basis function knot differences / values
  const ndu: number[][] = [];
  for (let i = 0; i <= degree; i++) {
    ndu[i] = new Array<number>(degree + 1).fill(0);
  }

  ndu[0][0] = 1.0;

  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;

    let saved = 0.0;

    for (let r = 0; r < j; r++) {
      // Lower triangle (knot differences)
      ndu[j][r] = right[r + 1] + left[j - r];
      const temp = ndu[r][j - 1] / ndu[j][r];
      // Upper triangle (basis function values)
      ndu[r][j] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }

    ndu[j][j] = saved;
  }

  // Initialize derivatives array
  const ders: number[][] = [];
  for (let k = 0; k <= derivOrder; k++) {
    ders[k] = new Array<number>(degree + 1).fill(0);
  }

  // Load 0th derivative (= basis function values)
  for (let j = 0; j <= degree; j++) {
    ders[0][j] = ndu[j][degree];
  }

  // Compute higher-order derivatives using a triangular table
  // a[2][degree+1][degree+1] - two alternating rows
  const a: number[][][] = [
    [],
    [],
  ];
  for (let i = 0; i < 2; i++) {
    a[i] = [];
    for (let j = 0; j <= degree; j++) {
      a[i][j] = new Array<number>(degree + 1).fill(0);
    }
  }

  for (let r = 0; r <= degree; r++) {
    let s1 = 0;
    let s2 = 1;
    a[s1][0][0] = 1.0;

    for (let k = 1; k <= derivOrder; k++) {
      let d = 0.0;
      const rk = r - k;
      const pk = degree - k;

      if (r >= k) {
        const nduVal = ndu[pk][rk + 1];
        a[s2][0][k] = nduVal !== 0 ? a[s1][0][k - 1] / nduVal : 0;
        d = a[s2][0][k] * ndu[pk][rk];
      }

      const j1 = rk >= -1 ? 1 : -rk;
      const j2 = r - 1 <= pk ? k - 1 : degree - r;

      for (let j = j1; j <= j2; j++) {
        const nduVal = ndu[pk][rk + 1];
        a[s2][j][k] = nduVal !== 0
          ? (a[s1][j][k - 1] - a[s1][j - 1][k - 1]) / nduVal
          : 0;
        d += a[s2][j][k] * ndu[pk][rk];
      }

      if (r <= pk) {
        const nduVal = ndu[pk][r + 1];
        a[s2][k][k] = nduVal !== 0
          ? -a[s1][k - 1][k - 1] / nduVal
          : 0;
        d += a[s2][k][k] * ndu[pk][r];
      }

      ders[k][r] = d;

      // Swap rows
      const prev = s1;
      s1 = s2;
      s2 = prev;
    }
  }

  // Multiply through by the correct factors (p!, (p-1)!, etc.)
  let fac = degree;
  for (let k = 1; k <= derivOrder; k++) {
    for (let j = 0; j <= degree; j++) {
      ders[k][j] *= fac;
    }
    fac *= (degree - k);
  }

  return ders;
}

// ── NURBS Surface Class ──────────────────────────────────────────────

/**
 * NURBS surface defined by a grid of control points in homogeneous coordinates.
 *
 * The surface is defined as:
 *   S(u,v) = sum_i sum_j (N_i(u) * N_j(v) * w_ij * P_ij) / sum_i sum_j (N_i(u) * N_j(v) * w_ij)
 *
 * Where N_i, N_j are B-spline basis functions and w_ij are the weights.
 * Control points use Vector4 where (x,y,z) = position, w = weight.
 */
export class NURBSSurface {
  readonly controlPoints: Vector4[][];
  readonly degreeU: number;
  readonly degreeV: number;
  readonly knotsU: number[];
  readonly knotsV: number[];

  /**
   * Create a NURBS surface.
   *
   * @param controlPoints - 2D grid of control points (Vector4: x,y,z = position, w = weight)
   * @param degreeU - Degree in u direction (typically 3 for cubic)
   * @param degreeV - Degree in v direction (typically 3 for cubic)
   * @param knotsU - Optional knot vector in u direction (auto-generated if not provided)
   * @param knotsV - Optional knot vector in v direction (auto-generated if not provided)
   */
  constructor(
    controlPoints: Vector4[][],
    degreeU: number = 3,
    degreeV: number = 3,
    knotsU?: number[],
    knotsV?: number[],
  ) {
    this.controlPoints = controlPoints;
    this.degreeU = degreeU;
    this.degreeV = degreeV;

    // Generate uniform knot vectors if not provided
    this.knotsU = knotsU ?? this.generateUniformKnots(
      controlPoints.length, degreeU,
    );
    this.knotsV = knotsV ?? this.generateUniformKnots(
      controlPoints[0]?.length ?? 0, degreeV,
    );
  }

  /**
   * Evaluate the surface point at parameters (u, v).
   *
   * @param u - Parameter in u direction [0, 1]
   * @param v - Parameter in v direction [0, 1]
   * @returns The 3D point on the surface
   */
  evaluate(u: number, v: number): Vector3 {
    const spanU = findKnotSpan(this.degreeU, u, this.knotsU);
    const spanV = findKnotSpan(this.degreeV, v, this.knotsV);

    const basisU = evaluateBasis(this.degreeU, this.knotsU, u, spanU);
    const basisV = evaluateBasis(this.degreeV, this.knotsV, v, spanV);

    // Weighted sum for rational NURBS
    let wx = 0, wy = 0, wz = 0, w = 0;

    for (let i = 0; i <= this.degreeU; i++) {
      const cpRow = this.controlPoints[spanU - this.degreeU + i];
      if (!cpRow) continue;

      for (let j = 0; j <= this.degreeV; j++) {
        const cp = cpRow[spanV - this.degreeV + j];
        if (!cp) continue;

        const basisProduct = basisU[i] * basisV[j];
        wx += basisProduct * cp.x * cp.w;
        wy += basisProduct * cp.y * cp.w;
        wz += basisProduct * cp.z * cp.w;
        w += basisProduct * cp.w;
      }
    }

    // Divide by total weight for rational evaluation
    if (Math.abs(w) < 1e-10) {
      return new Vector3(0, 0, 0);
    }

    return new Vector3(wx / w, wy / w, wz / w);
  }

  /**
   * Evaluate the surface normal at parameters (u, v).
   * Computed as the cross product of partial derivatives.
   *
   * @param u - Parameter in u direction
   * @param v - Parameter in v direction
   * @returns The unit normal vector at (u, v)
   */
  evaluateNormal(u: number, v: number): Vector3 {
    const delta = 0.001;

    // Compute partial derivatives numerically (robust for any degree/knot config)
    const Su = this.evaluate(u + delta, v).sub(this.evaluate(u - delta, v)).divideScalar(2 * delta);
    const Sv = this.evaluate(u, v + delta).sub(this.evaluate(u, v - delta)).divideScalar(2 * delta);

    const normal = new Vector3().crossVectors(Su, Sv);

    if (normal.lengthSq() < 1e-12) {
      // Degenerate case: try with larger delta
      const d2 = 0.01;
      const Su2 = this.evaluate(u + d2, v).sub(this.evaluate(u - d2, v)).divideScalar(2 * d2);
      const Sv2 = this.evaluate(u, v + d2).sub(this.evaluate(u, v - d2)).divideScalar(2 * d2);
      normal.crossVectors(Su2, Sv2);
    }

    return normal.normalize();
  }

  /**
   * Evaluate the surface with partial derivatives at (u, v).
   * Returns the point and the first partial derivatives in u and v directions.
   *
   * @param u - Parameter in u direction
   * @param v - Parameter in v direction
   * @returns Object with point, du, dv
   */
  evaluateWithDerivatives(u: number, v: number): {
    point: Vector3;
    du: Vector3;
    dv: Vector3;
  } {
    const spanU = findKnotSpan(this.degreeU, u, this.knotsU);
    const spanV = findKnotSpan(this.degreeV, v, this.knotsV);

    const basisU = evaluateBasisDerivatives(this.degreeU, this.knotsU, u, spanU, 1);
    const basisV = evaluateBasisDerivatives(this.degreeV, this.knotsV, v, spanV, 1);

    // Rational surface derivatives (Algorithm A4.4 from "The NURBS Book")
    let Ax = 0, Ay = 0, Az = 0, Aw = 0;
    let Axu = 0, Ayu = 0, Azu = 0, Awu = 0;
    let Axv = 0, Ayv = 0, Azv = 0, Awv = 0;

    for (let i = 0; i <= this.degreeU; i++) {
      const cpRow = this.controlPoints[spanU - this.degreeU + i];
      if (!cpRow) continue;

      for (let j = 0; j <= this.degreeV; j++) {
        const cp = cpRow[spanV - this.degreeV + j];
        if (!cp) continue;

        const N0i = basisU[0][i];
        const N0j = basisV[0][j];
        const N1i = basisU[1][i];
        const N1j = basisV[1][j];

        const w_ij = cp.w;
        const wx = cp.x * w_ij;
        const wy = cp.y * w_ij;
        const wz = cp.z * w_ij;

        // Point
        Ax += N0i * N0j * wx;
        Ay += N0i * N0j * wy;
        Az += N0i * N0j * wz;
        Aw += N0i * N0j * w_ij;

        // u derivative
        Axu += N1i * N0j * wx;
        Ayu += N1i * N0j * wy;
        Azu += N1i * N0j * wz;
        Awu += N1i * N0j * w_ij;

        // v derivative
        Axv += N0i * N1j * wx;
        Ayv += N0i * N1j * wy;
        Azv += N0i * N1j * wz;
        Awv += N0i * N1j * w_ij;
      }
    }

    if (Math.abs(Aw) < 1e-10) {
      return {
        point: new Vector3(0, 0, 0),
        du: new Vector3(1, 0, 0),
        dv: new Vector3(0, 0, 1),
      };
    }

    // Rational quotient rule: S = A/w
    // S_u = (A_u - Aw_u * S) / w
    // S_v = (A_v - Aw_v * S) / w
    const invAw = 1.0 / Aw;
    const point = new Vector3(Ax * invAw, Ay * invAw, Az * invAw);

    const du = new Vector3(
      (Axu - Awu * point.x) * invAw,
      (Ayu - Awu * point.y) * invAw,
      (Azu - Awu * point.z) * invAw,
    );

    const dv = new Vector3(
      (Axv - Awv * point.x) * invAw,
      (Ayv - Awv * point.y) * invAw,
      (Azv - Awv * point.z) * invAw,
    );

    return { point, du, dv };
  }

  /**
   * Tessellate the NURBS surface into a triangle mesh.
   *
   * Produces a watertight BufferGeometry by evaluating the surface on a
   * regular grid and triangulating with consistent winding order.
   *
   * @param uSegments - Number of subdivisions in u direction
   * @param vSegments - Number of subdivisions in v direction
   * @returns BufferGeometry with position, normal, and uv attributes
   */
  tessellate(uSegments: number = 32, vSegments: number = 32): BufferGeometry {
    const uCount = uSegments + 1;
    const vCount = vSegments + 1;
    const vertexCount = uCount * vCount;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    // Evaluate surface at each grid point
    const uMin = this.knotsU[this.degreeU];
    const uMax = this.knotsU[this.knotsU.length - this.degreeU - 1];
    const vMin = this.knotsV[this.degreeV];
    const vMax = this.knotsV[this.knotsV.length - this.degreeV - 1];

    for (let i = 0; i < uCount; i++) {
      const u = uMin + (uMax - uMin) * (i / uSegments);

      for (let j = 0; j < vCount; j++) {
        const v = vMin + (vMax - vMin) * (j / vSegments);
        const idx = i * vCount + j;

        // Evaluate point
        const point = this.evaluate(u, v);
        positions[idx * 3] = point.x;
        positions[idx * 3 + 1] = point.y;
        positions[idx * 3 + 2] = point.z;

        // Evaluate normal
        const normal = this.evaluateNormal(u, v);
        normals[idx * 3] = normal.x;
        normals[idx * 3 + 1] = normal.y;
        normals[idx * 3 + 2] = normal.z;

        // UV coordinates
        uvs[idx * 2] = i / uSegments;
        uvs[idx * 2 + 1] = j / vSegments;
      }
    }

    // Build triangle indices (consistent CCW winding)
    const indices: number[] = [];
    for (let i = 0; i < uSegments; i++) {
      for (let j = 0; j < vSegments; j++) {
        const a = i * vCount + j;
        const b = (i + 1) * vCount + j;
        const c = (i + 1) * vCount + (j + 1);
        const d = i * vCount + (j + 1);

        // Two triangles per quad - consistent winding
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(new Uint32BufferAttribute(new Uint32Array(indices), 1));

    return geometry;
  }

  /**
   * Generate a uniform (clamped) knot vector.
   *
   * For a B-spline with n+1 control points and degree p:
   * - First p+1 knots = 0 (clamped start)
   * - Middle knots uniformly distributed
   * - Last p+1 knots = 1 (clamped end)
   *
   * @param numControlPoints - Number of control points
   * @param degree - Degree of the B-spline
   * @returns The knot vector
   */
  private generateUniformKnots(numControlPoints: number, degree: number): number[] {
    const n = numControlPoints - 1;
    const m = n + degree + 1;
    const knots: number[] = new Array(m + 1);

    // Clamped start
    for (let i = 0; i <= degree; i++) {
      knots[i] = 0.0;
    }

    // Uniform interior knots
    const interiorCount = m - 2 * degree;
    for (let i = 1; i <= interiorCount; i++) {
      knots[degree + i] = i / (interiorCount + 1);
    }

    // Clamped end
    for (let i = m - degree; i <= m; i++) {
      knots[i] = 1.0;
    }

    return knots;
  }
}

// ── Convenience Helpers ──────────────────────────────────────────────

/**
 * Create a simple B-spline surface (non-rational, all weights = 1)
 * from a grid of Vector3 control points.
 */
export function createBSplineSurface(
  controlPoints: Vector3[][],
  degreeU: number = 3,
  degreeV: number = 3,
  knotsU?: number[],
  knotsV?: number[],
): NURBSSurface {
  const homogeneous = controlPoints.map(row =>
    row.map(cp => new Vector4(cp.x, cp.y, cp.z, 1.0)),
  );
  return new NURBSSurface(homogeneous, degreeU, degreeV, knotsU, knotsV);
}

/**
 * Create a NURBS surface from position and weight arrays separately.
 */
export function createNURBSSurfaceFromArrays(
  positions: Vector3[][],
  weights: number[][],
  degreeU: number = 3,
  degreeV: number = 3,
  knotsU?: number[],
  knotsV?: number[],
): NURBSSurface {
  const homogeneous = positions.map((row, i) =>
    row.map((cp, j) => new Vector4(cp.x, cp.y, cp.z, weights[i][j])),
  );
  return new NURBSSurface(homogeneous, degreeU, degreeV, knotsU, knotsV);
}
