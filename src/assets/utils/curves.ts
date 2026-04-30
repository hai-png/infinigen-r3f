import * as THREE from 'three';

/**
 * Extrude a 2D shape into a 3D geometry
 * @param shape - The THREE.Shape to extrude
 * @param options - ExtrudeGeometry options (depth, bevel settings, etc.)
 * @returns The extruded BufferGeometry
 */
export function extrudeShape(
  shape: THREE.Shape,
  options?: THREE.ExtrudeGeometryOptions
): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, options ?? { depth: 1, bevelEnabled: false });
}

export class BezierCurveGenerator {
  static quadraticBezierCurve(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, segments: number = 10): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      const z = (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * p1.z + t * t * p2.z;
      points.push(new THREE.Vector3(x, y, z));
    }
    return points;
  }

  static cubicBezierCurve(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, segments: number = 10): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
      const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
      const z = uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z;
      points.push(new THREE.Vector3(x, y, z));
    }
    return points;
  }
}
