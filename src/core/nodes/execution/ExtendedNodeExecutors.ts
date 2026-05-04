/**
 * ExtendedNodeExecutors - 30 additional node type executors
 *
 * Provides executor functions for curve, attribute, input/output, utility,
 * and geometry-utility node types that previously had no executor
 * (pass-through only). These are among the most-used remaining node types
 * in Infinigen's procedural generation pipeline.
 *
 * Each executor is a standalone function that takes `inputs: Record<string, any>`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses SeededRandom for all randomness — no Math.random().
 */

import * as THREE from 'three';

// ============================================================================
// Seeded Random Utility (matches CoreNodeExecutors.ts)
// ============================================================================

/**
 * Creates a deterministic pseudo-random number generator from a seed.
 * Uses the LCG algorithm (same as CoreNodeExecutors.ts).
 * @param seed - Integer seed value
 * @returns A function that returns a pseudo-random number in [0, 1)
 */
function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Helper: normalize a vector-like input to {x, y, z}
// ============================================================================

function normalizeVec(v: any): { x: number; y: number; z: number } {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
  return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
}

// ============================================================================
// Helper: closest point on a line segment (for proximity)
// ============================================================================

function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-12) return a.clone();
  const t = Math.max(0, Math.min(1, THREE.Vector3.prototype.dot.call(
    new THREE.Vector3().subVectors(p, a), ab,
  ) / lenSq));
  return a.clone().addScaledVector(ab, t);
}

// ============================================================================
// Curve Node Executors
// ============================================================================

/**
 * 1. curve_line — Generate a straight line between two points.
 * Inputs: Start, End, Resolution
 * Outputs: Curve (array of {x,y,z} points)
 */
export function executeCurveLine(inputs: Record<string, any>): any {
  const start = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const end = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 1, z: 0 });
  const resolution = inputs.Resolution ?? inputs.resolution ?? 2;

  const count = Math.max(2, Math.round(resolution));
  const points: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    points.push({
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y),
      z: start.z + t * (end.z - start.z),
    });
  }

  return { Curve: points };
}

/**
 * 2. quadratic_bezier — Quadratic Bezier curve with control point.
 * Inputs: Start, Middle, End, Resolution
 * Outputs: Curve
 */
export function executeQuadraticBezier(inputs: Record<string, any>): any {
  const p0 = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const p1 = normalizeVec(inputs.Middle ?? inputs.middle ?? inputs.Control ?? inputs.control ?? { x: 0, y: 1, z: 0 });
  const p2 = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 2, z: 0 });
  const resolution = inputs.Resolution ?? inputs.resolution ?? 16;

  const count = Math.max(2, Math.round(resolution));
  const points: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    // B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
    points.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
    });
  }

  return { Curve: points };
}

/**
 * 3. bezier_segment — Cubic Bezier curve segment with handle controls.
 * Inputs: Start, StartHandle, EndHandle, End, Resolution
 * Outputs: Curve
 */
export function executeBezierSegment(inputs: Record<string, any>): any {
  const p0 = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const p1 = normalizeVec(inputs.StartHandle ?? inputs.startHandle ?? inputs.Handle1 ?? { x: 0, y: 1, z: 0 });
  const p2 = normalizeVec(inputs.EndHandle ?? inputs.endHandle ?? inputs.Handle2 ?? { x: 0, y: 2, z: 0 });
  const p3 = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 3, z: 0 });
  const resolution = inputs.Resolution ?? inputs.resolution ?? 16;

  const count = Math.max(2, Math.round(resolution));
  const points: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    // B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    });
  }

  return { Curve: points };
}

/**
 * 4. curve_length — Compute the approximate arc length of a curve.
 * Inputs: Curve (array of points or THREE.Curve)
 * Outputs: Length
 */
export function executeCurveLength(inputs: Record<string, any>): any {
  const curveInput = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;

  if (!curveInput) return { Length: 0 };

  // If it's a Three.js Curve object, use getLength()
  if (curveInput instanceof THREE.Curve) {
    return { Length: curveInput.getLength() };
  }

  // If it's an array of points, sum segment distances
  if (Array.isArray(curveInput)) {
    let length = 0;
    for (let i = 1; i < curveInput.length; i++) {
      const p = normalizeVec(curveInput[i - 1]);
      const q = normalizeVec(curveInput[i]);
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return { Length: length };
  }

  // If it's a BufferGeometry, compute from position attribute
  if (curveInput instanceof THREE.BufferGeometry) {
    const posAttr = curveInput.getAttribute('position');
    if (!posAttr) return { Length: 0 };
    let length = 0;
    for (let i = 1; i < posAttr.count; i++) {
      const dx = posAttr.getX(i) - posAttr.getX(i - 1);
      const dy = posAttr.getY(i) - posAttr.getY(i - 1);
      const dz = posAttr.getZ(i) - posAttr.getZ(i - 1);
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return { Length: length };
  }

  return { Length: 0 };
}

/**
 * 5. sample_curve — Sample position, tangent, and normal on a curve at parameter t.
 * Inputs: Curve, Factor (t in [0,1]), Mode
 * Outputs: Position, Tangent, Normal, Length
 */
export function executeSampleCurve(inputs: Record<string, any>): any {
  const curveInput = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const factor = inputs.Factor ?? inputs.factor ?? inputs.Value ?? inputs.value ?? 0.5;
  const mode = inputs.Mode ?? inputs.mode ?? 'factor'; // 'factor' | 'length'

  if (!curveInput) {
    return {
      Position: { x: 0, y: 0, z: 0 },
      Tangent: { x: 0, y: 1, z: 0 },
      Normal: { x: 1, y: 0, z: 0 },
      Length: 0,
    };
  }

  // Build a Three.js curve from points
  let threeCurve: THREE.Curve<THREE.Vector3> | null = null;

  if (curveInput instanceof THREE.Curve) {
    threeCurve = curveInput;
  } else if (Array.isArray(curveInput)) {
    const pts = curveInput.map((p: any) => {
      const v = normalizeVec(p);
      return new THREE.Vector3(v.x, v.y, v.z);
    });
    if (pts.length >= 2) {
      threeCurve = new THREE.CatmullRomCurve3(pts);
    }
  } else if (curveInput instanceof THREE.BufferGeometry) {
    const posAttr = curveInput.getAttribute('position');
    if (posAttr && posAttr.count >= 2) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < posAttr.count; i++) {
        pts.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
      }
      threeCurve = new THREE.CatmullRomCurve3(pts);
    }
  }

  if (!threeCurve) {
    return {
      Position: { x: 0, y: 0, z: 0 },
      Tangent: { x: 0, y: 1, z: 0 },
      Normal: { x: 1, y: 0, z: 0 },
      Length: 0,
    };
  }

  const curveLength = threeCurve.getLength();

  // Determine parameter t
  let t: number;
  if (mode === 'length' && curveLength > 0) {
    t = Math.max(0, Math.min(1, factor / curveLength));
  } else {
    t = Math.max(0, Math.min(1, factor));
  }

  const pos = threeCurve.getPoint(t);
  const tangent = threeCurve.getTangent(t);

  // Approximate normal: perpendicular to tangent in the plane containing Y-up
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, up);
  if (normal.lengthSq() < 1e-8) {
    // Tangent is parallel to up; use X instead
    normal.crossVectors(tangent, new THREE.Vector3(1, 0, 0));
  }
  normal.normalize();

  return {
    Position: { x: pos.x, y: pos.y, z: pos.z },
    Tangent: { x: tangent.x, y: tangent.y, z: tangent.z },
    Normal: { x: normal.x, y: normal.y, z: normal.z },
    Length: curveLength,
  };
}

// ============================================================================
// Attribute Node Executors
// ============================================================================

/**
 * 6. store_named_attribute — Store a per-vertex named attribute on geometry.
 * Inputs: Geometry, Name, Value, Domain, Data Type
 * Outputs: Geometry
 */
export function executeStoreNamedAttribute(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const name = inputs.Name ?? inputs.name ?? 'custom_attribute';
  const value = inputs.Value ?? inputs.value ?? 0;
  const domain = inputs.Domain ?? inputs.domain ?? 'point'; // 'point' | 'face' | 'edge'
  const dataType = inputs.DataType ?? inputs.dataType ?? 'float'; // 'float' | 'int' | 'vector' | 'color'

  if (!geometry) return { Geometry: null };

  const result = geometry.clone();

  // Determine element count based on domain
  const posAttr = result.getAttribute('position');
  if (!posAttr) return { Geometry: result };

  let elementCount: number;
  if (domain === 'point') {
    elementCount = posAttr.count;
  } else if (domain === 'face') {
    const idx = result.getIndex();
    elementCount = idx ? Math.floor(idx.count / 3) : Math.floor(posAttr.count / 3);
  } else {
    // edge — approximate
    const idx = result.getIndex();
    elementCount = idx ? idx.count : posAttr.count;
  }

  // Determine item size based on data type
  let itemSize: number;
  let arr: Float32Array | Int32Array;

  switch (dataType) {
    case 'int':
      itemSize = 1;
      arr = new Int32Array(elementCount).fill(typeof value === 'number' ? value : 0);
      break;
    case 'vector': {
      itemSize = 3;
      const vx = typeof value === 'object' ? (value as any).x ?? value : value ?? 0;
      const vy = typeof value === 'object' ? (value as any).y ?? 0 : 0;
      const vz = typeof value === 'object' ? (value as any).z ?? 0 : 0;
      arr = new Float32Array(elementCount * 3);
      for (let i = 0; i < elementCount; i++) {
        arr[i * 3] = vx;
        arr[i * 3 + 1] = vy;
        arr[i * 3 + 2] = vz;
      }
      break;
    }
    case 'color': {
      itemSize = 4;
      const cr = typeof value === 'object' ? (value as any).r ?? value : value ?? 0;
      const cg = typeof value === 'object' ? (value as any).g ?? 0 : 0;
      const cb = typeof value === 'object' ? (value as any).b ?? 0 : 0;
      arr = new Float32Array(elementCount * 4);
      for (let i = 0; i < elementCount; i++) {
        arr[i * 4] = cr;
        arr[i * 4 + 1] = cg;
        arr[i * 4 + 2] = cb;
        arr[i * 4 + 3] = 1.0;
      }
      break;
    }
    default: // 'float'
      itemSize = 1;
      arr = new Float32Array(elementCount).fill(typeof value === 'number' ? value : 0);
  }

  result.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));

  return { Geometry: result };
}

/**
 * 7. named_attribute — Read a named attribute from geometry.
 * Inputs: Geometry, Name, Data Type
 * Outputs: Attribute (Float/Int/Vector/Color depending on type)
 */
export function executeNamedAttribute(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const name = inputs.Name ?? inputs.name ?? '';
  const dataType = inputs.DataType ?? inputs.dataType ?? 'float';

  if (!geometry || !name) {
    // Return default value based on data type
    switch (dataType) {
      case 'int': return { Attribute: 0 };
      case 'vector': return { Attribute: { x: 0, y: 0, z: 0 } };
      case 'color': return { Attribute: { r: 0, g: 0, b: 0, a: 1 } };
      default: return { Attribute: 0.0 };
    }
  }

  const attr = geometry.getAttribute(name);
  if (!attr) {
    switch (dataType) {
      case 'int': return { Attribute: 0 };
      case 'vector': return { Attribute: { x: 0, y: 0, z: 0 } };
      case 'color': return { Attribute: { r: 0, g: 0, b: 0, a: 1 } };
      default: return { Attribute: 0.0 };
    }
  }

  // Return first value as a representative sample
  if (attr.itemSize === 1) {
    return { Attribute: attr.getX(0) };
  } else if (attr.itemSize === 3) {
    return { Attribute: { x: attr.getX(0), y: attr.getY(0), z: attr.getZ(0) } };
  } else if (attr.itemSize === 4) {
    return { Attribute: { r: attr.getX(0), g: attr.getY(0), b: attr.getZ(0), a: attr.getW(0) } };
  }

  return { Attribute: attr.getX(0) };
}

/**
 * 8. attribute_statistic — Compute min/max/mean/median of an attribute.
 * Inputs: Geometry, Attribute (name or data), Domain
 * Outputs: Min, Max, Mean, Median, Sum, Range
 */
export function executeAttributeStatistic(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const attributeName = inputs.Attribute ?? inputs.attribute ?? inputs.Name ?? inputs.name ?? '';
  const domain = inputs.Domain ?? inputs.domain ?? 'point';

  // Try to extract attribute values
  let values: number[] = [];

  if (geometry && attributeName) {
    const attr = geometry.getAttribute(String(attributeName));
    if (attr) {
      for (let i = 0; i < attr.count; i++) {
        values.push(attr.getX(i));
      }
    }
  }

  // Also accept direct array input
  const directValues = inputs.Values ?? inputs.values ?? null;
  if (Array.isArray(directValues)) {
    values = directValues.map((v: any) => typeof v === 'number' ? v : 0);
  }

  if (values.length === 0) {
    return { Min: 0, Max: 0, Mean: 0, Median: 0, Sum: 0, Range: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sum / values.length;
  const median = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)];

  return {
    Min: min,
    Max: max,
    Mean: mean,
    Median: median,
    Sum: sum,
    Range: max - min,
  };
}

/**
 * 9. attribute_transfer — Transfer attribute between geometries by proximity.
 * Inputs: Source, Target, Attribute, Mapping (nearest)
 * Outputs: Attribute
 */
export function executeAttributeTransfer(inputs: Record<string, any>): any {
  const source: THREE.BufferGeometry | null = inputs.Source ?? inputs.source ?? null;
  const target: THREE.BufferGeometry | null = inputs.Target ?? inputs.target ?? null;
  const attributeName = inputs.Attribute ?? inputs.attribute ?? '';
  const mapping = inputs.Mapping ?? inputs.mapping ?? 'nearest';

  if (!source || !target || !attributeName) {
    return { Attribute: 0.0 };
  }

  const sourceAttr = source.getAttribute(attributeName);
  const sourcePosAttr = source.getAttribute('position');
  const targetPosAttr = target.getAttribute('position');

  if (!sourceAttr || !sourcePosAttr || !targetPosAttr) {
    return { Attribute: 0.0 };
  }

  // For each target vertex, find nearest source vertex and copy its attribute
  const resultValues: number[] = [];
  const sourcePos = sourcePosAttr as THREE.BufferAttribute;
  const targetPos = targetPosAttr as THREE.BufferAttribute;

  for (let ti = 0; ti < targetPos.count; ti++) {
    const tx = targetPos.getX(ti), ty = targetPos.getY(ti), tz = targetPos.getZ(ti);
    let closestDist = Infinity;
    let closestIdx = 0;

    for (let si = 0; si < sourcePos.count; si++) {
      const dx = sourcePos.getX(si) - tx;
      const dy = sourcePos.getY(si) - ty;
      const dz = sourcePos.getZ(si) - tz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < closestDist) {
        closestDist = d;
        closestIdx = si;
      }
    }

    resultValues.push(sourceAttr.getX(closestIdx));
  }

  return { Attribute: resultValues };
}

// ============================================================================
// Input/Output Node Executors
// ============================================================================

/**
 * 10. object_info — Get object transform and geometry info.
 * Inputs: Object, Transform Space
 * Outputs: Location, Rotation, Scale, Geometry
 */
export function executeObjectInfo(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const object = inputs.Object ?? inputs.object ?? null;
  const transformSpace = inputs.TransformSpace ?? inputs.transformSpace ?? settings.transformSpace ?? 'original';

  // Default identity transform
  let location = { x: 0, y: 0, z: 0 };
  let rotation = { x: 0, y: 0, z: 0 };
  let scale = { x: 1, y: 1, z: 1 };
  let geometry: THREE.BufferGeometry | null = null;

  if (object) {
    // Extract from Three.js Object3D
    if (object instanceof THREE.Object3D) {
      location = { x: object.position.x, y: object.position.y, z: object.position.z };
      const euler = object.rotation;
      rotation = { x: euler.x, y: euler.y, z: euler.z };
      scale = { x: object.scale.x, y: object.scale.y, z: object.scale.z };

      if (object instanceof THREE.Mesh && object.geometry) {
        geometry = object.geometry;
      }
    } else if (typeof object === 'object') {
      // Plain object representation
      location = normalizeVec(object.location ?? object.position ?? { x: 0, y: 0, z: 0 });
      rotation = normalizeVec(object.rotation ?? object.rotation_euler ?? { x: 0, y: 0, z: 0 });
      scale = normalizeVec(object.scale ?? { x: 1, y: 1, z: 1 });
      geometry = object.geometry ?? object.mesh ?? null;
    }
  }

  return { Location: location, Rotation: rotation, Scale: scale, Geometry: geometry };
}

/**
 * 11. collection_info — Get collection contents as instances.
 * Inputs: Collection, Separate Children, Reset Children
 * Outputs: Instances
 */
export function executeCollectionInfo(inputs: Record<string, any>): any {
  const collection = inputs.Collection ?? inputs.collection ?? null;
  const separateChildren = inputs.SeparateChildren ?? inputs.separateChildren ?? false;
  const resetChildren = inputs.ResetChildren ?? inputs.resetChildren ?? true;

  if (!collection) {
    return { Instances: null };
  }

  // If collection is an array of geometries
  if (Array.isArray(collection)) {
    const geometries: THREE.BufferGeometry[] = collection.filter(
      (g: any) => g instanceof THREE.BufferGeometry,
    );

    if (separateChildren) {
      // Return each child as a separate instance
      const instances = geometries.map((geo, i) => {
        const mat = new THREE.Matrix4();
        if (resetChildren) {
          // Identity transform
        } else {
          // Stack children along Y
          mat.setPosition(0, i, 0);
        }
        return {
          geometry: geo,
          matrix: Array.from(mat.elements),
        };
      });
      return { Instances: instances };
    }

    // Return all as a single merged instance
    return { Instances: { geometries, count: geometries.length } };
  }

  // If collection is a Three.js Group
  if (collection instanceof THREE.Group) {
    const children = collection.children;
    const instances = children.map((child, i) => {
      const mat = child.matrixWorld.clone();
      if (resetChildren) {
        mat.identity();
      }
      return {
        geometry: (child as THREE.Mesh).geometry ?? null,
        matrix: Array.from(mat.elements),
      };
    });
    return { Instances: instances };
  }

  return { Instances: collection };
}

/**
 * 12. self_object — Reference to the self/owner object.
 * Inputs: (none — uses context)
 * Outputs: Object
 */
export function executeSelfObject(inputs: Record<string, any>): any {
  const selfObj = inputs.SelfObject ?? inputs.selfObject ?? inputs.object ?? null;
  return { Object: selfObj };
}

/**
 * 13. input_vector — Constant vector input.
 * Inputs: Vector (or X, Y, Z components)
 * Outputs: Vector
 */
export function executeInputVector(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const vec = inputs.Vector ?? inputs.vector ?? null;
  const x = inputs.X ?? inputs.x ?? settings.X ?? settings.x ?? 0;
  const y = inputs.Y ?? inputs.y ?? settings.Y ?? settings.y ?? 0;
  const z = inputs.Z ?? inputs.z ?? settings.Z ?? settings.z ?? 0;

  if (vec) {
    return { Vector: normalizeVec(vec) };
  }

  return { Vector: { x, y, z } };
}

/**
 * 14. input_color — Constant color input.
 * Inputs: Color (or R, G, B components)
 * Outputs: Color
 */
export function executeInputColor(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const color = inputs.Color ?? inputs.color ?? settings.Color ?? settings.color ?? null;
  const r = inputs.R ?? inputs.r ?? settings.R ?? settings.r ?? 0.5;
  const g = inputs.G ?? inputs.g ?? settings.G ?? settings.g ?? 0.5;
  const b = inputs.B ?? inputs.b ?? settings.B ?? settings.b ?? 0.5;

  if (color) {
    if (color instanceof THREE.Color) {
      return { Color: { r: color.r, g: color.g, b: color.b } };
    }
    if (typeof color === 'object') {
      return { Color: { r: color.r ?? 0.5, g: color.g ?? 0.5, b: color.b ?? 0.5 } };
    }
    // Hex number
    const c = new THREE.Color(color);
    return { Color: { r: c.r, g: c.g, b: c.b } };
  }

  return { Color: { r, g, b } };
}

/**
 * 15. input_int — Constant integer input.
 * Inputs: Integer (or Value)
 * Outputs: Integer
 */
export function executeInputInt(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const value = inputs.Integer ?? inputs.integer ?? inputs.Value ?? inputs.value ?? settings.Integer ?? settings.integer ?? settings.Value ?? settings.value ?? 0;
  return { Integer: Math.round(typeof value === 'number' ? value : 0) };
}

/**
 * 16. input_float — Constant float input.
 * Inputs: Value (or Float)
 * Outputs: Value
 */
export function executeInputFloat(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const value = inputs.Value ?? inputs.value ?? inputs.Float ?? inputs.float ?? settings.Value ?? settings.value ?? settings.Float ?? settings.float ?? 0.0;
  return { Value: typeof value === 'number' ? value : 0.0 };
}

/**
 * 17. input_bool — Constant boolean input.
 * Inputs: Boolean
 * Outputs: Boolean
 */
export function executeInputBool(inputs: Record<string, any>, settings: Record<string, any> = {}): any {
  const value = inputs.Boolean ?? inputs.boolean ?? inputs.Value ?? inputs.value ?? settings.Boolean ?? settings.boolean ?? false;
  return { Boolean: Boolean(value) };
}

// ============================================================================
// Utility Node Executors
// ============================================================================

/**
 * 18. clamp — Clamp value to [min, max] range.
 * Inputs: Value, Min, Max, Clamp Type
 * Outputs: Result
 */
export function executeClamp(inputs: Record<string, any>): any {
  const value = inputs.Value ?? inputs.value ?? 0.0;
  const min = inputs.Min ?? inputs.min ?? 0.0;
  const max = inputs.Max ?? inputs.max ?? 1.0;
  const clampType = inputs.ClampType ?? inputs.clampType ?? 'minmax'; // 'minmax' | 'range'

  if (clampType === 'range') {
    // Clamp to [min, max] regardless of order
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return { Result: Math.max(lo, Math.min(hi, value)) };
  }

  // Default: minmax clamp
  return { Result: Math.max(min, Math.min(max, value)) };
}

/**
 * 19. map_range — Map value from one range to another.
 * Inputs: Value, FromMin, FromMax, ToMin, ToMax, Clamp, Interpolation Type
 * Outputs: Result
 */
export function executeMapRange(inputs: Record<string, any>): any {
  const value = inputs.Value ?? inputs.value ?? 0.5;
  const fromMin = inputs.FromMin ?? inputs.fromMin ?? 0.0;
  const fromMax = inputs.FromMax ?? inputs.fromMax ?? 1.0;
  const toMin = inputs.ToMin ?? inputs.toMin ?? 0.0;
  const toMax = inputs.ToMax ?? inputs.toMax ?? 1.0;
  const shouldClamp = inputs.Clamp ?? inputs.clamp ?? true;
  const interpolationType = inputs.InterpolationType ?? inputs.interpolationType ?? 'linear';

  const fromRange = fromMax - fromMin;
  const toRange = toMax - toMin;

  let t: number;
  if (Math.abs(fromRange) < 1e-10) {
    t = 0;
  } else {
    t = (value - fromMin) / fromRange;
  }

  // Apply interpolation
  switch (interpolationType) {
    case 'stepped': {
      // Step function: floor to nearest integer step
      t = Math.floor(t);
      break;
    }
    case 'smoothstep': {
      // Hermite smoothstep
      const ct = Math.max(0, Math.min(1, t));
      t = ct * ct * (3 - 2 * ct);
      break;
    }
    case 'smootherstep': {
      const ct = Math.max(0, Math.min(1, t));
      t = ct * ct * ct * (ct * (ct * 6 - 15) + 10);
      break;
    }
    default: // 'linear' — no change
      break;
  }

  if (shouldClamp) {
    t = Math.max(0, Math.min(1, t));
  }

  const result = toMin + t * toRange;
  return { Result: result };
}

/**
 * 20. float_to_int — Convert float to integer with rounding mode.
 * Inputs: Float, Rounding Mode
 * Outputs: Integer
 */
export function executeFloatToInt(inputs: Record<string, any>): any {
  const float = inputs.Float ?? inputs.float ?? inputs.Value ?? inputs.value ?? 0.0;
  const roundingMode = inputs.RoundingMode ?? inputs.roundingMode ?? 'round'; // 'round' | 'floor' | 'ceil' | 'truncate'

  let result: number;
  switch (roundingMode) {
    case 'floor':
      result = Math.floor(float);
      break;
    case 'ceil':
      result = Math.ceil(float);
      break;
    case 'truncate':
      result = float >= 0 ? Math.floor(float) : Math.ceil(float);
      break;
    default: // 'round'
      result = Math.round(float);
  }

  return { Integer: result };
}

/**
 * 21. rotate_euler — Apply Euler rotation to a rotation or vector.
 * Inputs: Rotation, Rotate By, Space
 * Outputs: Rotation
 */
export function executeRotateEuler(inputs: Record<string, any>): any {
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const rotateBy = normalizeVec(inputs.RotateBy ?? inputs.rotateBy ?? inputs.Angle ?? inputs.angle ?? { x: 0, y: 0, z: 0 });
  const space = inputs.Space ?? inputs.space ?? 'local'; // 'local' | 'world'

  const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);

  const deltaEuler = new THREE.Euler(rotateBy.x, rotateBy.y, rotateBy.z, 'XYZ');
  const deltaQuat = new THREE.Quaternion().setFromEuler(deltaEuler);

  let resultQuat: THREE.Quaternion;
  if (space === 'world') {
    resultQuat = deltaQuat.multiply(quat);
  } else {
    resultQuat = quat.multiply(deltaQuat);
  }

  const resultEuler = new THREE.Euler().setFromQuaternion(resultQuat, 'XYZ');
  return { Rotation: { x: resultEuler.x, y: resultEuler.y, z: resultEuler.z } };
}

/**
 * 22. rotate_vector — Rotate a vector by axis-angle.
 * Inputs: Vector, Axis, Angle
 * Outputs: Vector
 */
export function executeRotateVector(inputs: Record<string, any>): any {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const axis = normalizeVec(inputs.Axis ?? inputs.axis ?? { x: 0, y: 0, z: 1 });
  const angle = inputs.Angle ?? inputs.angle ?? 0.0;

  const v = new THREE.Vector3(vector.x, vector.y, vector.z);
  const a = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(a, angle);

  v.applyQuaternion(q);

  return { Vector: { x: v.x, y: v.y, z: v.z } };
}

/**
 * 23. align_euler_to_vector — Generate a rotation that aligns with a given vector.
 * Inputs: Euler, Factor, Vector, Axis
 * Outputs: Rotation
 */
export function executeAlignEulerToVector(inputs: Record<string, any>): any {
  const euler = normalizeVec(inputs.Euler ?? inputs.euler ?? inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const factor = inputs.Factor ?? inputs.factor ?? 1.0;
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 1, z: 0 });
  const axis = inputs.Axis ?? inputs.axis ?? 'z'; // 'x' | 'y' | 'z'

  // Compute the target rotation that aligns the specified axis with the vector
  const dir = new THREE.Vector3(vector.x, vector.y, vector.z).normalize();

  // Find rotation that takes the axis to the direction
  const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0)
    : axis === 'y' ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);

  const targetQuat = new THREE.Quaternion().setFromUnitVectors(axisVec, dir);
  const targetEuler = new THREE.Euler().setFromQuaternion(targetQuat, 'XYZ');

  // Blend between input euler and target by factor
  const inputQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(euler.x, euler.y, euler.z, 'XYZ'),
  );
  const resultQuat = inputQuat.slerp(targetQuat, Math.max(0, Math.min(1, factor)));
  const resultEuler = new THREE.Euler().setFromQuaternion(resultQuat, 'XYZ');

  return { Rotation: { x: resultEuler.x, y: resultEuler.y, z: resultEuler.z } };
}

/**
 * 24. switch — Switch between two values based on a boolean condition.
 * Inputs: Switch (boolean), True, False
 * Outputs: Output
 */
export function executeSwitch(inputs: Record<string, any>): any {
  const switchVal = inputs.Switch ?? inputs.switch ?? inputs.Condition ?? inputs.condition ?? inputs.Boolean ?? false;
  const trueValue = inputs.True ?? inputs.true ?? inputs.TrueValue ?? inputs.ifTrue ?? 1;
  const falseValue = inputs.False ?? inputs.false ?? inputs.FalseValue ?? inputs.ifFalse ?? 0;

  const condition = Boolean(switchVal);
  return { Output: condition ? trueValue : falseValue };
}

/**
 * 25. random_value — Deterministic random value using SeededRandom.
 * Inputs: Min, Max, Seed, Probability, Data Type, ID
 * Outputs: Value
 */
export function executeRandomValue(inputs: Record<string, any>): any {
  const min = inputs.Min ?? inputs.min ?? 0.0;
  const max = inputs.Max ?? inputs.max ?? 1.0;
  const seed = inputs.Seed ?? inputs.seed ?? 0;
  const id = inputs.ID ?? inputs.id ?? 0;
  const dataType = inputs.DataType ?? inputs.dataType ?? 'float'; // 'float' | 'int' | 'vector' | 'bool'

  // Combine seed and id for deterministic randomness per-element
  const combinedSeed = (Math.abs(seed | 0) * 2654435761 + Math.abs(id | 0) * 40503) & 0xffffffff;
  const random = seededRandom(combinedSeed);

  switch (dataType) {
    case 'int': {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      const result = lo + Math.floor(random() * (hi - lo + 1));
      return { Value: result };
    }
    case 'vector': {
      const r1 = random(), r2 = random(), r3 = random();
      return {
        Value: {
          x: min + r1 * (max - min),
          y: min + r2 * (max - min),
          z: min + r3 * (max - min),
        },
      };
    }
    case 'bool': {
      const probability = inputs.Probability ?? inputs.probability ?? 0.5;
      return { Value: random() < probability };
    }
    default: { // 'float'
      const result = min + random() * (max - min);
      return { Value: result };
    }
  }
}

// ============================================================================
// Geometry Utility Node Executors
// ============================================================================

/**
 * 26. bounding_box — Compute axis-aligned bounding box of geometry.
 * Inputs: Geometry
 * Outputs: Min, Max, BoundingBox (geometry)
 */
export function executeBoundingBox(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;

  if (!geometry || !geometry.getAttribute('position')) {
    return {
      Min: { x: 0, y: 0, z: 0 },
      Max: { x: 0, y: 0, z: 0 },
      BoundingBox: new THREE.BufferGeometry(),
    };
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;

  const min = { x: box.min.x, y: box.min.y, z: box.min.z };
  const max = { x: box.max.x, y: box.max.y, z: box.max.z };

  // Build a box geometry representation
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
  boxGeo.translate(center.x, center.y, center.z);

  return {
    Min: min,
    Max: max,
    BoundingBox: boxGeo,
  };
}

/**
 * 27. geometry_proximity — Find nearest surface/edge/point on target geometry.
 * Enhanced version of CoreNodeExecutors.executeProximity with additional outputs.
 * Inputs: Geometry, Target, SourcePosition, TargetElement
 * Outputs: Position, Distance, Normal, IsHit
 */
export function executeGeometryProximity(inputs: Record<string, any>): any {
  const target: THREE.BufferGeometry | null = inputs.Target ?? inputs.target ?? inputs.Geometry ?? inputs.geometry ?? null;
  const sourcePosition = inputs.SourcePosition ?? inputs.sourcePosition ?? inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 };
  const targetElement = inputs.TargetElement ?? inputs.targetElement ?? 'faces'; // 'points' | 'edges' | 'faces'

  const sp = new THREE.Vector3(sourcePosition.x ?? 0, sourcePosition.y ?? 0, sourcePosition.z ?? 0);

  if (!target || !target.getAttribute('position')) {
    return {
      Position: { x: 0, y: 0, z: 0 },
      Distance: Infinity,
      Normal: { x: 0, y: 1, z: 0 },
      IsHit: false,
    };
  }

  const posAttr = target.getAttribute('position');
  const normalAttr = target.getAttribute('normal');
  const indexAttr = target.getIndex();

  let closestDist = Infinity;
  let closestPos = new THREE.Vector3();
  let closestNormal = new THREE.Vector3(0, 1, 0);

  if (targetElement === 'points') {
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i), py = posAttr.getY(i), pz = posAttr.getZ(i);
      const d = sp.distanceTo(new THREE.Vector3(px, py, pz));
      if (d < closestDist) {
        closestDist = d;
        closestPos.set(px, py, pz);
        if (normalAttr) {
          closestNormal.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)).normalize();
        }
      }
    }
  } else if (targetElement === 'faces') {
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      // Closest point on triangle using barycentric coordinates
      const closest = closestPointOnTriangleSimple(sp, v0, v1, v2);
      const d = sp.distanceTo(closest);
      if (d < closestDist) {
        closestDist = d;
        closestPos.copy(closest);
        const e1 = new THREE.Vector3().subVectors(v1, v0);
        const e2 = new THREE.Vector3().subVectors(v2, v0);
        closestNormal.crossVectors(e1, e2).normalize();
      }
    }
  } else {
    // Edges: check each edge for closest point
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const edgeIndices = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [a, b] of edgeIndices) {
        const pa = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const pb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));
        const closest = closestPointOnSegment(sp, pa, pb);
        const d = sp.distanceTo(closest);
        if (d < closestDist) {
          closestDist = d;
          closestPos.copy(closest);
          if (normalAttr) {
            closestNormal.set(
              (normalAttr.getX(a) + normalAttr.getX(b)) / 2,
              (normalAttr.getY(a) + normalAttr.getY(b)) / 2,
              (normalAttr.getZ(a) + normalAttr.getZ(b)) / 2,
            ).normalize();
          }
        }
      }
    }
  }

  return {
    Position: { x: closestPos.x, y: closestPos.y, z: closestPos.z },
    Distance: closestDist,
    Normal: { x: closestNormal.x, y: closestNormal.y, z: closestNormal.z },
    IsHit: closestDist < Infinity,
  };
}

/**
 * 28. raycast — Cast ray against geometry (enhanced with attribute transfer).
 * Inputs: Geometry, SourcePosition, Direction, Length
 * Outputs: IsHit, HitPosition, HitNormal, HitFaceIndex, Distance, HitAttribute
 */
export function executeRaycastEnhanced(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? inputs.Target ?? inputs.target ?? null;
  const sourcePosition = inputs.SourcePosition ?? inputs.sourcePosition ?? inputs.Origin ?? inputs.origin ?? { x: 0, y: 0, z: 0 };
  const rayDirection = inputs.Direction ?? inputs.direction ?? inputs.RayDirection ?? inputs.rayDirection ?? { x: 0, y: -1, z: 0 };
  const rayLength = inputs.Length ?? inputs.length ?? 100.0;

  const origin = new THREE.Vector3(sourcePosition.x ?? 0, sourcePosition.y ?? 0, sourcePosition.z ?? 0);
  const direction = new THREE.Vector3(rayDirection.x ?? 0, rayDirection.y ?? -1, rayDirection.z ?? 0).normalize();

  if (!geometry || !geometry.getAttribute('position')) {
    return {
      IsHit: false,
      HitPosition: { x: 0, y: 0, z: 0 },
      HitNormal: { x: 0, y: 1, z: 0 },
      HitFaceIndex: -1,
      Distance: rayLength,
      HitAttribute: 0,
    };
  }

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  let closestT = Infinity;
  let closestFaceIdx = -1;
  let closestU = 0, closestV = 0;
  let closestV0 = new THREE.Vector3(), closestV1 = new THREE.Vector3(), closestV2 = new THREE.Vector3();

  const epsilon = 1e-8;

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
    const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    // Möller-Trumbore intersection
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const h = new THREE.Vector3().crossVectors(direction, edge2);
    const a = edge1.dot(h);

    if (Math.abs(a) < epsilon) continue;
    const fInv = 1 / a;
    const s = new THREE.Vector3().subVectors(origin, v0);
    const u = fInv * s.dot(h);
    if (u < 0 || u > 1) continue;
    const q = new THREE.Vector3().crossVectors(s, edge1);
    const v = fInv * direction.dot(q);
    if (v < 0 || u + v > 1) continue;
    const t = fInv * edge2.dot(q);
    if (t > epsilon && t < closestT && t <= rayLength) {
      closestT = t;
      closestFaceIdx = f;
      closestU = u;
      closestV = v;
      closestV0 = v0;
      closestV1 = v1;
      closestV2 = v2;
    }
  }

  if (closestT < Infinity) {
    const hitPos = new THREE.Vector3()
      .addScaledVector(closestV0, 1 - closestU - closestV)
      .addScaledVector(closestV1, closestU)
      .addScaledVector(closestV2, closestV);
    const e1 = new THREE.Vector3().subVectors(closestV1, closestV0);
    const e2 = new THREE.Vector3().subVectors(closestV2, closestV0);
    const hitNorm = new THREE.Vector3().crossVectors(e1, e2).normalize();

    return {
      IsHit: true,
      HitPosition: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
      HitNormal: { x: hitNorm.x, y: hitNorm.y, z: hitNorm.z },
      HitFaceIndex: closestFaceIdx,
      Distance: closestT,
      HitAttribute: closestU, // Barycentric u as placeholder attribute
    };
  }

  return {
    IsHit: false,
    HitPosition: { x: 0, y: 0, z: 0 },
    HitNormal: { x: 0, y: 1, z: 0 },
    HitFaceIndex: -1,
    Distance: rayLength,
    HitAttribute: 0,
  };
}

/**
 * 29. sample_nearest_surface — Sample data from the nearest surface point.
 * Enhanced version with attribute interpolation.
 * Inputs: Geometry, Position, Attribute Name
 * Outputs: Value, Distance, Normal, FaceIndex
 */
export function executeSampleNearestSurfaceEnhanced(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const position = inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 };
  const attributeName = inputs.Attribute ?? inputs.attribute ?? inputs.AttributeName ?? inputs.attributeName ?? '';

  const queryPos = new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0);

  if (!geometry || !geometry.getAttribute('position')) {
    return { Value: 0, Distance: Infinity, Normal: { x: 0, y: 1, z: 0 }, FaceIndex: -1 };
  }

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  let closestDist = Infinity;
  let closestPoint = new THREE.Vector3();
  let closestNormal = new THREE.Vector3(0, 1, 0);
  let closestFaceIdx = -1;
  let closestBaryU = 0, closestBaryV = 0;
  let closestI0 = 0, closestI1 = 0, closestI2 = 0;

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
    const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    const { point, u, v } = closestPointOnTriangleWithBary(queryPos, v0, v1, v2);
    const d = queryPos.distanceTo(point);
    if (d < closestDist) {
      closestDist = d;
      closestPoint.copy(point);
      closestFaceIdx = f;
      closestBaryU = u;
      closestBaryV = v;
      closestI0 = i0;
      closestI1 = i1;
      closestI2 = i2;
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      closestNormal.crossVectors(e1, e2).normalize();
    }
  }

  // Interpolate attribute at the barycentric coordinate if available
  let value = closestDist;
  if (attributeName && geometry.getAttribute(attributeName)) {
    const attr = geometry.getAttribute(attributeName);
    const w = 1 - closestBaryU - closestBaryV;
    value = w * attr.getX(closestI0) + closestBaryU * attr.getX(closestI1) + closestBaryV * attr.getX(closestI2);
  }

  return {
    Value: value,
    Distance: closestDist,
    Normal: { x: closestNormal.x, y: closestNormal.y, z: closestNormal.z },
    FaceIndex: closestFaceIdx,
  };
}

/**
 * 30. mesh_to_points — Convert mesh vertices or face centers to points.
 * Inputs: Geometry, Mode, Selection
 * Outputs: Points, Normal
 */
export function executeMeshToPoints(inputs: Record<string, any>): any {
  const geometry: THREE.BufferGeometry | null = inputs.Geometry ?? inputs.geometry ?? null;
  const mode = inputs.Mode ?? inputs.mode ?? 'vertices'; // 'vertices' | 'faces' | 'edges'
  const selection = inputs.Selection ?? inputs.selection ?? null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { Points: [], Normal: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.getIndex();

  const points: { x: number; y: number; z: number }[] = [];
  const normals: { x: number; y: number; z: number }[] = [];

  if (mode === 'vertices') {
    for (let i = 0; i < posAttr.count; i++) {
      if (selection !== null && Array.isArray(selection) && !selection[i]) continue;
      points.push({ x: posAttr.getX(i), y: posAttr.getY(i), z: posAttr.getZ(i) });
      if (normalAttr) {
        normals.push({ x: normalAttr.getX(i), y: normalAttr.getY(i), z: normalAttr.getZ(i) });
      } else {
        normals.push({ x: 0, y: 1, z: 0 });
      }
    }
  } else if (mode === 'faces') {
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      if (selection !== null && Array.isArray(selection) && !selection[f]) continue;

      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
      points.push({ x: cx, y: cy, z: cz });

      // Face normal
      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const fn = new THREE.Vector3().crossVectors(e1, e2).normalize();
      normals.push({ x: fn.x, y: fn.y, z: fn.z });
    }
  } else {
    // 'edges' — midpoints of edges
    const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);
    const edgeSet = new Set<string>();

    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr ? indexAttr.getX(f * 3) : f * 3;
      const i1 = indexAttr ? indexAttr.getX(f * 3 + 1) : f * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(f * 3 + 2) : f * 3 + 2;

      const edgePairs = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [a, b] of edgePairs) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);

        const mx = (posAttr.getX(a) + posAttr.getX(b)) / 2;
        const my = (posAttr.getY(a) + posAttr.getY(b)) / 2;
        const mz = (posAttr.getZ(a) + posAttr.getZ(b)) / 2;
        points.push({ x: mx, y: my, z: mz });

        if (normalAttr) {
          const nx = (normalAttr.getX(a) + normalAttr.getX(b)) / 2;
          const ny = (normalAttr.getY(a) + normalAttr.getY(b)) / 2;
          const nz = (normalAttr.getZ(a) + normalAttr.getZ(b)) / 2;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          normals.push({ x: nx / len, y: ny / len, z: nz / len });
        } else {
          normals.push({ x: 0, y: 1, z: 0 });
        }
      }
    }
  }

  return { Points: points, Normal: normals };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Closest point on a triangle using barycentric coordinates.
 * Also returns the barycentric (u, v) for attribute interpolation.
 */
function closestPointOnTriangleWithBary(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): { point: THREE.Vector3; u: number; v: number } {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    return { point: a.clone(), u: 0, v: 0 };
  }

  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    return { point: b.clone(), u: 1, v: 0 };
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: a.clone().addScaledVector(ab, v), u: v, v: 0 };
  }

  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    return { point: c.clone(), u: 0, v: 1 };
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: a.clone().addScaledVector(ac, w), u: 0, v: w };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const point = b.clone().addScaledVector(new THREE.Vector3().subVectors(c, b), w);
    return { point, u: 1 - w, v: w };
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const point = a.clone().addScaledVector(ab, v).addScaledVector(ac, w);
  return { point, u: v, v: w };
}

/**
 * Simple closest point on a triangle (without barycentric output).
 */
function closestPointOnTriangleSimple(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): THREE.Vector3 {
  return closestPointOnTriangleWithBary(p, a, b, c).point;
}
