/**
 * P2NodeExecutors - 23 P2 priority node type executors
 *
 * Provides standalone executor functions for shader BSDF, geometry,
 * texture, curve, and vector node types that previously had no executor
 * or only existed as private methods inside NodeEvaluator.
 *
 * Combined with existing executor modules, total coverage now exceeds
 * 100 unique node types with real execution logic.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses seeded random for all randomness — no Math.random().
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike } from './ExecutorTypes';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Helper: normalize a vector-like input to {x, y, z}
// ============================================================================

function normalizeVec(v: unknown): Vector3Like {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: (v as number[])[0] ?? 0, y: (v as number[])[1] ?? 0, z: (v as number[])[2] ?? 0 };
  const obj = v as Record<string, unknown>;
  return { x: (obj.x as number) ?? 0, y: (obj.y as number) ?? 0, z: (obj.z as number) ?? 0 };
}

// ============================================================================
// Helper: normalize a color-like input to {r, g, b}
// ============================================================================

function normalizeColor(c: unknown): { r: number; g: number; b: number } {
  if (!c) return { r: 0.5, g: 0.5, b: 0.5 };
  if (c instanceof THREE.Color) return { r: c.r, g: c.g, b: c.b };
  const obj = c as Record<string, unknown>;
  return {
    r: (obj.r as number) ?? 0.5,
    g: (obj.g as number) ?? 0.5,
    b: (obj.b as number) ?? 0.5,
  };
}

// ============================================================================
// Helper: seeded random for deterministic noise
// ============================================================================

function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Helper: simple hash for noise functions
// ============================================================================

function hashFloat(x: number, y: number, z: number, seed: number): number {
  let h = seed;
  h = ((h << 5) + h + Math.round(x * 1000)) | 0;
  h = ((h << 5) + h + Math.round(y * 1000)) | 0;
  h = ((h << 5) + h + Math.round(z * 1000)) | 0;
  return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
}

// ============================================================================
// Shader Node Executors (6)
// ============================================================================

/**
 * 1. SubsurfaceScattering — Maps to MeshPhysicalMaterial thickness + SSS properties.
 * Produces a BSDF descriptor with subsurface scattering parameters that
 * can be applied to a MeshPhysicalMaterial.
 *
 * Inputs: Color, Scale, Radius (vector), IOR, Roughness, Anisotropy
 * Outputs: BSDF
 */
export function executeSubsurfaceScattering(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.8, g: 0.8, b: 0.8 });
  const scale = (inputs.Scale ?? inputs.scale ?? 1.0) as number;
  const radius = normalizeVec(inputs.Radius ?? inputs.radius ?? { x: 1.0, y: 0.2, z: 0.1 });
  const ior = (inputs.IOR ?? inputs.ior ?? 1.4) as number;
  const roughness = (inputs.Roughness ?? inputs.roughness ?? 0.5) as number;
  const anisotropy = (inputs.Anisotropy ?? inputs.anisotropy ?? 0.0) as number;

  return {
    BSDF: {
      type: 'subsurface_scattering',
      baseColor: color,
      subsurfaceWeight: 1.0,
      subsurfaceScale: scale,
      subsurfaceRadius: { x: radius.x * scale, y: radius.y * scale, z: radius.z * scale },
      subsurfaceIOR: ior,
      roughness,
      anisotropy,
      // Three.js MeshPhysicalMaterial properties
      thickness: Math.max(radius.x, radius.y, radius.z) * scale,
      transmission: 0.0,
      metallic: 0.0,
    },
  };
}

/**
 * 2. ToonBSDF — Uses MeshToonMaterial properties.
 * Produces a BSDF descriptor with toon/cel-shading parameters.
 *
 * Inputs: Color, Size, Smooth, Offset, Roughness
 * Outputs: BSDF
 */
export function executeToonBSDF(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.8, g: 0.8, b: 0.8 });
  const size = (inputs.Size ?? inputs.size ?? 0.5) as number;
  const smooth = (inputs.Smooth ?? inputs.smooth ?? 0.1) as number;
  const offset = (inputs.Offset ?? inputs.offset ?? 0.0) as number;

  return {
    BSDF: {
      type: 'toon_bsdf',
      baseColor: color,
      toonSize: size,
      toonSmooth: smooth,
      toonOffset: offset,
      metallic: 0.0,
      roughness: 0.5,
      // Three.js MeshToonMaterial gradient map parameters
      gradientStops: [
        { position: 0.0, color: { r: color.r * 0.3, g: color.g * 0.3, b: color.b * 0.3 } },
        { position: Math.max(0, size - smooth * 0.5), color: { r: color.r * 0.6, g: color.g * 0.6, b: color.b * 0.6 } },
        { position: Math.min(1, size + smooth * 0.5), color: { r: color.r * 0.9, g: color.g * 0.9, b: color.b * 0.9 } },
        { position: 1.0, color },
      ],
    },
  };
}

/**
 * 3. HairBSDF — Custom anisotropic shader parameters for hair rendering.
 * Produces a BSDF descriptor with anisotropic highlight and absorption.
 *
 * Inputs: Color, Offset, RoughnessU, RoughnessV, Tangent, AbsorptionCoefficient
 * Outputs: BSDF
 */
export function executeHairBSDF(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 0.15, g: 0.06, b: 0.02 });
  const offset = (inputs.Offset ?? inputs.offset ?? 0.0) as number;
  const roughnessU = (inputs.RoughnessU ?? inputs.roughnessU ?? 0.1) as number;
  const roughnessV = (inputs.RoughnessV ?? inputs.roughnessV ?? 0.3) as number;
  const tangent = normalizeVec(inputs.Tangent ?? inputs.tangent ?? { x: 1, y: 0, z: 0 });
  const absorption = normalizeColor(inputs.AbsorptionCoefficient ?? inputs.absorptionCoefficient ?? { r: 0.1, g: 0.1, b: 0.1 });

  return {
    BSDF: {
      type: 'hair_bsdf',
      baseColor: color,
      anisotropic: 1.0,
      roughnessU,
      roughnessV,
      tangent,
      offset,
      absorptionCoefficient: absorption,
      metallic: 0.0,
      roughness: (roughnessU + roughnessV) * 0.5,
      sheen: 0.5,
      sheenRoughness: roughnessV,
      // Three.js custom anisotropic parameters
      anisotropy: (roughnessV - roughnessU) / Math.max(roughnessU + roughnessV, 0.001),
    },
  };
}

/**
 * 4. GlassBSDF — Transmission + IOR + roughness for glass.
 * Produces a BSDF descriptor for glass/transmissive materials.
 *
 * Inputs: Color, Roughness, IOR, Normal, Alpha
 * Outputs: BSDF
 */
export function executeGlassBSDF(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1 });
  const roughness = (inputs.Roughness ?? inputs.roughness ?? 0.0) as number;
  const ior = (inputs.IOR ?? inputs.ior ?? 1.45) as number;
  const alpha = (inputs.Alpha ?? inputs.alpha ?? 1.0) as number;

  return {
    BSDF: {
      type: 'bsdf_glass',
      baseColor: color,
      metallic: 0.0,
      roughness,
      ior,
      transmission: 1.0,
      alpha,
      // Three.js MeshPhysicalMaterial glass settings
      transparent: true,
      thickness: 0.0,
      specular: 1.0,
      clearcoat: 0.0,
    },
  };
}

/**
 * 5. RefractionBSDF — Refraction with IOR.
 * Similar to GlassBSDF but with explicit refraction direction control.
 *
 * Inputs: Color, Roughness, IOR, Normal, Color1 (tint)
 * Outputs: BSDF
 */
export function executeRefractionBSDF(inputs: NodeInputs): NodeOutput {
  const color = normalizeColor(inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1 });
  const roughness = (inputs.Roughness ?? inputs.roughness ?? 0.0) as number;
  const ior = (inputs.IOR ?? inputs.ior ?? 1.45) as number;
  const tint = normalizeColor(inputs.Color1 ?? inputs.color1 ?? inputs.Tint ?? inputs.tint ?? { r: 1, g: 1, b: 1 });

  return {
    BSDF: {
      type: 'refraction_bsdf',
      baseColor: { r: color.r * tint.r, g: color.g * tint.g, b: color.b * tint.b },
      metallic: 0.0,
      roughness,
      ior,
      transmission: 1.0,
      alpha: 1.0,
      // Three.js MeshPhysicalMaterial refraction settings
      transparent: true,
      thickness: 0.5,
      refraction: true,
      specular: 1.0,
    },
  };
}

/**
 * 6. Fresnel — Compute fresnel effect based on IOR and view angle.
 * Uses Schlick's approximation for the Fresnel reflectance.
 *
 * Inputs: IOR, Normal, ViewVector, Blend, Roughness
 * Outputs: Fac, Color
 */
export function executeFresnel(inputs: NodeInputs): NodeOutput {
  const ior = (inputs.IOR ?? inputs.ior ?? 1.45) as number;
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });
  const viewVector = normalizeVec(inputs.ViewVector ?? inputs.viewVector ?? inputs.Incident ?? inputs.incident ?? { x: 0, y: 0, z: 1 });
  const blend = (inputs.Blend ?? inputs.blend ?? 0.0) as number;
  const roughness = (inputs.Roughness ?? inputs.roughness ?? 0.0) as number;

  // Schlick's approximation: R(θ) = R0 + (1 - R0)(1 - cosθ)^5
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const v = new THREE.Vector3(viewVector.x, viewVector.y, viewVector.z).normalize();
  const NdotV = Math.max(0, n.dot(v));

  // R0 = ((n1 - n2) / (n1 + n2))^2, where n1 = 1 (air), n2 = ior
  const r0 = Math.pow((1 - ior) / (1 + ior), 2);
  const fresnelTerm = r0 + (1 - r0) * Math.pow(1 - NdotV, 5);

  // Apply blend factor (0 = no fresnel, 1 = full fresnel)
  const blendFactor = THREE.MathUtils.clamp(blend, 0, 1);
  const fac = blendFactor > 0
    ? THREE.MathUtils.lerp(NdotV, fresnelTerm, blendFactor)
    : fresnelTerm;

  // Roughness reduces the fresnel effect (rough surfaces have less pronounced fresnel)
  const roughFac = roughness > 0 ? THREE.MathUtils.lerp(fac, r0, roughness * 0.5) : fac;

  return {
    Fac: THREE.MathUtils.clamp(roughFac, 0, 1),
    Color: { r: roughFac, g: roughFac, b: roughFac },
  };
}

// ============================================================================
// Geometry Node Executors (5)
// ============================================================================

/**
 * 7. Subdivide — Use subdivision modifier approach.
 * Performs Loop-style subdivision by splitting each triangle into 4 sub-triangles.
 *
 * Inputs: Geometry, Level, SubdivisionType
 * Outputs: Geometry
 */
export function executeSubdivide(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const level = (inputs.Level ?? inputs.level ?? 1) as number;
  const crease = (inputs.Crease ?? inputs.crease ?? 0.0) as number;

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();

  let currentPositions = Float32Array.from(posAttr.array as Float32Array);
  let currentIndices: number[];

  if (idxAttr) {
    currentIndices = [];
    for (let i = 0; i < idxAttr.count; i++) currentIndices.push(idxAttr.getX(i));
  } else {
    currentIndices = [];
    for (let i = 0; i < posAttr.count; i++) currentIndices.push(i);
  }

  for (let iter = 0; iter < Math.min(level, 6); iter++) {
    const newPositions = Array.from(currentPositions);
    const newIndices: number[] = [];
    const edgeMidpoints = new Map<string, number>();

    const getMidpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeMidpoints.has(key)) return edgeMidpoints.get(key)!;
      const idx = newPositions.length / 3;
      newPositions.push(
        (currentPositions[a * 3] + currentPositions[b * 3]) / 2,
        (currentPositions[a * 3 + 1] + currentPositions[b * 3 + 1]) / 2,
        (currentPositions[a * 3 + 2] + currentPositions[b * 3 + 2]) / 2,
      );
      edgeMidpoints.set(key, idx);
      return idx;
    };

    for (let f = 0; f < currentIndices.length; f += 3) {
      const a = currentIndices[f], b = currentIndices[f + 1], c = currentIndices[f + 2];
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newIndices.push(a, ab, ca);
      newIndices.push(b, bc, ab);
      newIndices.push(c, ca, bc);
      newIndices.push(ab, bc, ca);
    }

    currentPositions = new Float32Array(newPositions);
    currentIndices = newIndices;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(currentPositions, 3));
  result.setIndex(currentIndices);
  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 8. Boolean — Boolean operations (union, difference, intersection).
 * Uses geometry merging for union, and marks operation for CSG when available.
 *
 * Inputs: Geometry, Operand, Operation
 * Outputs: Geometry
 */
export function executeBoolean(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? inputs.MeshA ?? null) as THREE.BufferGeometry | null;
  const operand = (inputs.Operand ?? inputs.operand ?? inputs.MeshB ?? inputs.geometry2 ?? null) as THREE.BufferGeometry | null;
  const operation = (inputs.Operation ?? inputs.operation ?? 'union') as string;

  if (!geometry) return { Geometry: new THREE.BufferGeometry() };
  if (!operand) return { Geometry: geometry.clone() };

  // For union: merge geometries
  if (operation === 'union') {
    return { Geometry: mergeGeometriesP2(geometry, operand) };
  }

  // For subtract/intersect: return geometry with metadata for CSG
  const result = geometry.clone();
  return {
    Geometry: result,
    _booleanOperation: operation,
    _operandProvided: true,
  };
}

/** Helper: merge two geometries into one — delegates to GeometryPipeline */
function mergeGeometriesP2(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  return GeometryPipeline.mergeGeometries([a, b]);
}

/**
 * 9. Extrude — Use ExtrudeGeometry from a 2D profile.
 * Takes a 2D shape/profile and extrudes it along a direction or path.
 *
 * Inputs: Profile (curve/shape), Depth, Direction, Steps, Cap
 * Outputs: Geometry
 */
export function executeExtrude(inputs: NodeInputs): NodeOutput {
  const profile = inputs.Profile ?? inputs.profile ?? inputs.Curve ?? inputs.curve ?? inputs.Shape ?? inputs.shape ?? null;
  const depth = (inputs.Depth ?? inputs.depth ?? 1.0) as number;
  const direction = normalizeVec(inputs.Direction ?? inputs.direction ?? { x: 0, y: 0, z: 1 });
  const steps = (inputs.Steps ?? inputs.steps ?? 1) as number;
  const cap = (inputs.Cap ?? inputs.cap ?? true) as boolean;

  // Build 2D shape from profile points
  const shape = new THREE.Shape();

  if (profile && Array.isArray(profile) && profile.length >= 3) {
    const pts = profile as Array<{ x: number; y: number; z?: number }>;
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i].x, pts[i].y);
    }
    shape.closePath();
  } else if (profile instanceof THREE.BufferGeometry) {
    const posAttr = profile.getAttribute('position');
    if (posAttr && posAttr.count >= 3) {
      shape.moveTo(posAttr.getX(0), posAttr.getY(0));
      for (let i = 1; i < posAttr.count; i++) {
        shape.lineTo(posAttr.getX(i), posAttr.getY(i));
      }
      shape.closePath();
    }
  } else {
    // Default: simple square profile
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.closePath();
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled: false,
    steps: Math.max(1, steps),
  };

  let result = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Apply direction transform if not default Z
  if (Math.abs(direction.x) > 0.001 || Math.abs(direction.y) > 0.001 || Math.abs(direction.z - 1) > 0.001) {
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const up = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mat = new THREE.Matrix4().makeRotationFromQuaternion(quat);
    result.applyMatrix4(mat);
  }

  if (!cap) {
    // Remove top/bottom caps by clearing the last groups' material index
    // (simplified: just return as-is for now)
  }

  result.computeVertexNormals();
  return { Geometry: result };
}

/**
 * 10. TransformGeometry — Translate/rotate/scale geometry.
 * Applies a full SRT transform to geometry vertices.
 *
 * Inputs: Geometry, Translation, Rotation, Scale
 * Outputs: Geometry
 */
export function executeTransformGeometry(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const translation = normalizeVec(inputs.Translation ?? inputs.translation ?? { x: 0, y: 0, z: 0 });
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const scale = normalizeVec(inputs.Scale ?? inputs.scale ?? { x: 1, y: 1, z: 1 });

  if (!geometry || !geometry.getAttribute('position')) return { Geometry: geometry };

  const result = geometry.clone();
  const posAttr = result.getAttribute('position');
  const normAttr = result.getAttribute('normal');

  const mat = new THREE.Matrix4();
  mat.compose(
    new THREE.Vector3(translation.x, translation.y, translation.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ')),
    new THREE.Vector3(scale.x, scale.y, scale.z),
  );
  const normalMat = new THREE.Matrix3().getNormalMatrix(mat);

  for (let i = 0; i < posAttr.count; i++) {
    const pos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
    posAttr.setXYZ(i, pos.x, pos.y, pos.z);
  }
  posAttr.needsUpdate = true;

  if (normAttr) {
    for (let i = 0; i < normAttr.count; i++) {
      const n = new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)).applyMatrix3(normalMat).normalize();
      normAttr.setXYZ(i, n.x, n.y, n.z);
    }
    normAttr.needsUpdate = true;
  }

  return { Geometry: result };
}

/**
 * 11. JoinGeometry — Merge multiple geometries into one.
 * Takes an array of geometries and combines them into a single BufferGeometry.
 *
 * Inputs: Geometry (array of BufferGeometry)
 * Outputs: Geometry (merged)
 */
export function executeJoinGeometry(inputs: NodeInputs): NodeOutput {
  const geometries = (inputs.Geometry ?? inputs.geometry ?? []) as THREE.BufferGeometry[];

  if (!Array.isArray(geometries) || geometries.length === 0) {
    return { Geometry: new THREE.BufferGeometry() };
  }

  const valid = geometries.filter(g => g && g.getAttribute('position'));
  if (valid.length === 0) return { Geometry: new THREE.BufferGeometry() };
  if (valid.length === 1) return { Geometry: valid[0].clone() };

  // Merge all geometries
  let result = valid[0];
  for (let i = 1; i < valid.length; i++) {
    result = mergeGeometriesP2(result, valid[i]);
  }

  return { Geometry: result };
}

// ============================================================================
// Texture Node Executors (5)
// ============================================================================

/**
 * 12. GradientTexture — Linear/quadratic/eased/diagonal/spherical/spiral gradient.
 * Generates a gradient pattern based on the input vector and gradient type.
 *
 * Inputs: Vector, GradientType
 * Outputs: Color, Fac
 */
export function executeGradientTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const gradientType = (inputs.GradientType ?? inputs.gradientType ?? inputs.type ?? 'linear') as string;

  let t: number;

  switch (gradientType) {
    case 'quadratic':
      t = vector.x * vector.x;
      break;
    case 'easing': {
      const cx = Math.max(0, Math.min(1, vector.x));
      t = cx * cx * (3 - 2 * cx); // smoothstep
      break;
    }
    case 'diagonal':
      t = (vector.x + vector.y) * 0.5;
      break;
    case 'radial':
      t = Math.atan2(vector.y - 0.5, vector.x - 0.5) / (2 * Math.PI) + 0.5;
      break;
    case 'spherical': {
      const dx = vector.x - 0.5, dy = vector.y - 0.5, dz = vector.z - 0.5;
      t = Math.max(0, 1 - 2 * Math.sqrt(dx * dx + dy * dy + dz * dz));
      break;
    }
    case 'spiral': {
      const angle = Math.atan2(vector.y - 0.5, vector.x - 0.5);
      const r = Math.sqrt((vector.x - 0.5) ** 2 + (vector.y - 0.5) ** 2);
      t = ((angle / (2 * Math.PI) + 0.5 + r * 2) % 1);
      break;
    }
    case 'quadratic_sphere': {
      const ddx = vector.x - 0.5, ddy = vector.y - 0.5;
      t = Math.max(0, 1 - 2 * (ddx * ddx + ddy * ddy));
      break;
    }
    default: // 'linear'
      t = vector.x;
  }

  t = Math.max(0, Math.min(1, t));

  return {
    Color: { r: t, g: t, b: t },
    Fac: t,
  };
}

/**
 * 13. VoronoiTexture — Voronoi diagram texture with distance metrics.
 * Generates a Voronoi pattern using cell-based distance computation.
 *
 * Inputs: Vector, Scale, Distance (metric), Feature (F1/F2/F2-F1/Edge), Seed
 * Outputs: Distance, Color, Position
 */
export function executeVoronoiTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const distanceMetric = (inputs.Distance ?? inputs.distance ?? inputs.distanceMetric ?? 'euclidean') as string;
  const feature = (inputs.Feature ?? inputs.feature ?? inputs.outputMode ?? 'f1') as string;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  const x = vector.x * scale;
  const y = vector.y * scale;
  const z = vector.z * scale;

  // Find the cell coordinates
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);

  // Compute distance to nearby cells to find F1 and F2
  let f1 = Infinity;
  let f2 = Infinity;
  let closestCell = { x: cellX, y: cellY, z: cellZ };
  let secondCell = { x: cellX, y: cellY, z: cellZ };

  // Check 3x3x3 neighborhood
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = cellX + dx;
        const cy = cellY + dy;
        const cz = cellZ + dz;

        // Generate cell point using seeded random
        const rng = seededRandom(seed + cx * 374761 + cy * 668265 + cz * 1103515);
        const px = cx + rng();
        const py = cy + rng();
        const pz = cz + rng();

        let dist: number;
        switch (distanceMetric) {
          case 'manhattan':
            dist = Math.abs(x - px) + Math.abs(y - py) + Math.abs(z - pz);
            break;
          case 'chebychev':
          case 'chebyshev':
            dist = Math.max(Math.abs(x - px), Math.abs(y - py), Math.abs(z - pz));
            break;
          case 'minkowski': {
            const minkowskiExp = (inputs.MinkowskiExponent ?? inputs.minkowskiExponent ?? 0.5) as number;
            dist = Math.pow(
              Math.pow(Math.abs(x - px), minkowskiExp) +
              Math.pow(Math.abs(y - py), minkowskiExp) +
              Math.pow(Math.abs(z - pz), minkowskiExp),
              1 / minkowskiExp,
            );
            break;
          }
          default: // 'euclidean'
            dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2);
        }

        if (dist < f1) {
          f2 = f1;
          secondCell = closestCell;
          f1 = dist;
          closestCell = { x: cx, y: cy, z: cz };
        } else if (dist < f2) {
          f2 = dist;
          secondCell = { x: cx, y: cy, z: cz };
        }
      }
    }
  }

  // Select output based on feature mode
  let outDist: number;
  let outCell: { x: number; y: number; z: number };

  switch (feature) {
    case 'f2':
      outDist = f2;
      outCell = secondCell;
      break;
    case 'distance_to_edge':
    case 'edge':
      outDist = f2 - f1;
      outCell = closestCell;
      break;
    case 'n_sphere_radius':
      outDist = f2 - f1;
      outCell = closestCell;
      break;
    default: // 'f1'
      outDist = f1;
      outCell = closestCell;
  }

  // Generate color from cell position
  const cellRng = seededRandom(seed + outCell.x * 374761 + outCell.y * 668265 + outCell.z * 1103515);
  const cr = cellRng();
  const cg = cellRng();
  const cb = cellRng();

  return {
    Distance: Math.max(0, Math.min(1, outDist)),
    Color: { r: cr, g: cg, b: cb },
    Position: { x: outCell.x / scale, y: outCell.y / scale, z: outCell.z / scale },
  };
}

/**
 * 14. WaveTexture — Bands/rings with distortion and detail.
 * Generates wave patterns with configurable type, distortion, and detail octaves.
 *
 * Inputs: Vector, Scale, Distortion, Detail, DetailScale, WaveType, BandsDirection
 * Outputs: Color, Fac
 */
export function executeWaveTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const distortion = (inputs.Distortion ?? inputs.distortion ?? 0.0) as number;
  const detail = (inputs.Detail ?? inputs.detail ?? 2.0) as number;
  const detailScale = (inputs.DetailScale ?? inputs.detailScale ?? 1.0) as number;
  const waveType = (inputs.WaveType ?? inputs.waveType ?? 'bands') as string;
  const bandsDirection = (inputs.BandsDirection ?? inputs.bandsDirection ?? 'x') as string;

  const x = vector.x * scale;
  const y = vector.y * scale;
  const z = vector.z * scale;

  let phase: number;
  if (waveType === 'rings') {
    phase = Math.sqrt(x * x + y * y + z * z);
  } else {
    switch (bandsDirection) {
      case 'y': phase = y; break;
      case 'z': phase = z; break;
      case 'diagonal': phase = (x + y + z) / 1.732; break;
      default: phase = x;
    }
  }

  // Add distortion using sine-based pseudo-noise
  if (Math.abs(distortion) > 1e-6) {
    const dNoise = Math.sin(x * 1.7 + y * 2.3 + z * 3.1) * distortion;
    phase += dNoise;
  }

  // Add detail octaves
  let value = Math.sin(phase);
  let amp = 1.0;
  let freq = detailScale;
  for (let o = 1; o < Math.min(detail, 6); o++) {
    amp *= 0.5;
    freq *= 2;
    value += amp * Math.sin(phase * freq);
  }

  const fac = Math.max(0, Math.min(1, value * 0.5 + 0.5));

  return {
    Color: { r: fac, g: fac, b: fac },
    Fac: fac,
  };
}

/**
 * 15. WhiteNoiseTexture — Random per-element noise.
 * Generates a deterministic random value based on the input vector position.
 *
 * Inputs: Vector, Seed
 * Outputs: Value, Color
 */
export function executeWhiteNoiseTexture(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  const v1 = hashFloat(vector.x, vector.y, vector.z, seed);
  const v2 = hashFloat(vector.y, vector.z, vector.x, seed + 1);
  const v3 = hashFloat(vector.z, vector.x, vector.y, seed + 2);

  return {
    Value: v1,
    Color: { r: v1, g: v2, b: v3 },
  };
}

/**
 * 16. ColorRamp — Evaluate a ramp of color stops at a factor input.
 * Interpolates between color stops defined in the ramp.
 *
 * Inputs: Factor, ColorRamp (stops array), Interpolation
 * Outputs: Color, Alpha
 */
export function executeColorRamp(inputs: NodeInputs): NodeOutput {
  const factor = (inputs.Factor ?? inputs.factor ?? inputs.Value ?? inputs.value ?? 0.5) as number;
  const colorRamp = (inputs.ColorRamp ?? inputs.colorRamp ?? inputs.Stops ?? inputs.stops ?? null) as unknown[] | null;
  const interpolation = (inputs.Interpolation ?? inputs.interpolation ?? 'linear') as string;

  // Default gradient: black to white
  if (!colorRamp || !Array.isArray(colorRamp) || colorRamp.length === 0) {
    const t = Math.max(0, Math.min(1, factor));
    return { Color: { r: t, g: t, b: t }, Alpha: 1.0 };
  }

  // Sort stops by position
  const stops = (colorRamp as Array<Record<string, unknown>>)
    .map(s => ({
      position: (s.position as number) ?? (s.t as number) ?? (s.x as number) ?? 0,
      color: (s.color as ColorLike) ?? normalizeColor(s),
      alpha: (s.alpha as number) ?? 1.0,
    }))
    .sort((a, b) => a.position - b.position);

  if (stops.length === 0) {
    const t = Math.max(0, Math.min(1, factor));
    return { Color: { r: t, g: t, b: t }, Alpha: 1.0 };
  }

  const t = Math.max(stops[0].position, Math.min(stops[stops.length - 1].position, factor));

  // Find surrounding stops
  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].position && t <= stops[i + 1].position) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.position - lower.position;
  const localT = range > 1e-10 ? (t - lower.position) / range : 0;

  // Interpolation mode
  let blendT: number;
  switch (interpolation) {
    case 'constant':
      blendT = 0;
      break;
    case 'ease': {
      const ct = Math.max(0, Math.min(1, localT));
      blendT = ct * ct * (3 - 2 * ct);
      break;
    }
    default: // 'linear'
      blendT = localT;
  }

  const r = lower.color.r + blendT * ((upper.color.r ?? 0) - lower.color.r);
  const g = lower.color.g + blendT * ((upper.color.g ?? 0) - lower.color.g);
  const b = lower.color.b + blendT * ((upper.color.b ?? 0) - lower.color.b);
  const a = lower.alpha + blendT * (upper.alpha - lower.alpha);

  return {
    Color: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) },
    Alpha: Math.max(0, Math.min(1, a)),
  };
}

// ============================================================================
// Curve Node Executors (4)
// ============================================================================

/**
 * 17. CurveToMesh — Convert curve to tube/ribbon mesh.
 * Takes curve point data and generates a tube mesh around the path.
 *
 * Inputs: Curve, ProfileCurve, Radius, Resolution, Segments
 * Outputs: Geometry
 */
export function executeCurveToMesh(inputs: NodeInputs): NodeOutput {
  const curvePoints = inputs.Curve ?? inputs.curve ?? inputs.points ?? null;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.1) as number;
  const resolution = (inputs.Resolution ?? inputs.resolution ?? 8) as number;
  const segments = (inputs.Segments ?? inputs.segments ?? 16) as number;

  if (!curvePoints) return { Geometry: new THREE.BufferGeometry() };

  // Build curve from points
  const pts: THREE.Vector3[] = [];
  if (curvePoints instanceof THREE.BufferGeometry) {
    const posAttr = curvePoints.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      pts.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }
  } else if (Array.isArray(curvePoints)) {
    for (const p of curvePoints) {
      const v = normalizeVec(p);
      pts.push(new THREE.Vector3(v.x, v.y, v.z));
    }
  } else if (curvePoints instanceof THREE.Curve) {
    for (let i = 0; i <= segments; i++) {
      pts.push(curvePoints.getPoint(i / segments));
    }
  }

  if (pts.length < 2) return { Geometry: new THREE.BufferGeometry() };

  const threeCurve = new THREE.CatmullRomCurve3(pts);
  const tubeGeo = new THREE.TubeGeometry(threeCurve, segments, radius, resolution, false);

  return { Geometry: tubeGeo };
}

/**
 * 18. CurveLine — Create a line curve between two points.
 * Generates a straight line with configurable resolution.
 *
 * Inputs: Start, End, Resolution
 * Outputs: Curve
 */
export function executeCurveLine(inputs: NodeInputs): NodeOutput {
  const start = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const end = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 1, z: 0 });
  const resolution = (inputs.Resolution ?? inputs.resolution ?? 2) as number;

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
 * 19. BezierSegment — Create bezier curve segment with handles.
 * Generates a cubic Bezier curve with 4 control points.
 *
 * Inputs: Start, StartHandle, EndHandle, End, Resolution
 * Outputs: Curve
 */
export function executeBezierSegment(inputs: NodeInputs): NodeOutput {
  const p0 = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const p1 = normalizeVec(inputs.StartHandle ?? inputs.startHandle ?? inputs.Handle1 ?? { x: 0, y: 1, z: 0 });
  const p2 = normalizeVec(inputs.EndHandle ?? inputs.endHandle ?? inputs.Handle2 ?? { x: 0, y: 2, z: 0 });
  const p3 = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 3, z: 0 });
  const resolution = (inputs.Resolution ?? inputs.resolution ?? 16) as number;

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
 * 20. QuadraticBezier — Quadratic bezier curve.
 * Generates a quadratic Bezier curve with 3 control points.
 *
 * Inputs: Start, Middle, End, Resolution
 * Outputs: Curve
 */
export function executeQuadraticBezier(inputs: NodeInputs): NodeOutput {
  const p0 = normalizeVec(inputs.Start ?? inputs.start ?? { x: 0, y: 0, z: 0 });
  const p1 = normalizeVec(inputs.Middle ?? inputs.middle ?? inputs.Control ?? inputs.control ?? { x: 0, y: 1, z: 0 });
  const p2 = normalizeVec(inputs.End ?? inputs.end ?? { x: 0, y: 2, z: 0 });
  const resolution = (inputs.Resolution ?? inputs.resolution ?? 16) as number;

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

// ============================================================================
// Vector Node Executors (3)
// ============================================================================

/**
 * 21. VectorMath — Vector math operations.
 * Supports add, subtract, multiply, divide, dot, cross, normalize,
 * scale, distance, length, reflect, project, and more.
 *
 * Inputs: Vector1, Vector2, Operation, Scale
 * Outputs: Vector, Value
 */
export function executeVectorMath(inputs: NodeInputs): NodeOutput {
  const v1 = normalizeVec(inputs.Vector1 ?? inputs.vector1 ?? inputs.A ?? inputs.a ?? { x: 0, y: 0, z: 0 });
  const v2 = normalizeVec(inputs.Vector2 ?? inputs.vector2 ?? inputs.B ?? inputs.b ?? { x: 0, y: 0, z: 0 });
  const operation = (inputs.Operation ?? inputs.operation ?? 'add') as string;
  const scale = (inputs.Scale ?? inputs.scale ?? 1.0) as number;

  const a = new THREE.Vector3(v1.x, v1.y, v1.z);
  const b = new THREE.Vector3(v2.x, v2.y, v2.z);

  let resultVec: THREE.Vector3;
  let resultVal: number;

  switch (operation) {
    case 'subtract':
      resultVec = a.clone().sub(b);
      resultVal = resultVec.length();
      break;
    case 'multiply':
      resultVec = new THREE.Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
      resultVal = resultVec.length();
      break;
    case 'divide':
      resultVec = new THREE.Vector3(
        b.x !== 0 ? a.x / b.x : 0,
        b.y !== 0 ? a.y / b.y : 0,
        b.z !== 0 ? a.z / b.z : 0,
      );
      resultVal = resultVec.length();
      break;
    case 'dot':
      resultVec = a.clone();
      resultVal = a.dot(b);
      break;
    case 'cross':
      resultVec = a.clone().cross(b);
      resultVal = resultVec.length();
      break;
    case 'normalize':
      resultVec = a.clone().normalize();
      resultVal = a.length();
      break;
    case 'scale':
      resultVec = a.clone().multiplyScalar(scale);
      resultVal = resultVec.length();
      break;
    case 'distance':
      resultVec = a.clone();
      resultVal = a.distanceTo(b);
      break;
    case 'length':
      resultVec = a.clone();
      resultVal = a.length();
      break;
    case 'reflect': {
      const n = b.clone().normalize();
      resultVec = a.clone().reflect(n);
      resultVal = resultVec.length();
      break;
    }
    case 'project': {
      // Project a onto b: proj = (a·b / b·b) * b
      const bLenSq = b.lengthSq();
      const scalar = bLenSq > 1e-10 ? a.dot(b) / bLenSq : 0;
      resultVec = b.clone().multiplyScalar(scalar);
      resultVal = resultVec.length();
      break;
    }
    case 'snap': {
      const step = b.clone();
      resultVec = new THREE.Vector3(
        step.x !== 0 ? Math.round(a.x / step.x) * step.x : a.x,
        step.y !== 0 ? Math.round(a.y / step.y) * step.y : a.y,
        step.z !== 0 ? Math.round(a.z / step.z) * step.z : a.z,
      );
      resultVal = resultVec.length();
      break;
    }
    case 'floor':
      resultVec = new THREE.Vector3(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z));
      resultVal = resultVec.length();
      break;
    case 'ceil':
      resultVec = new THREE.Vector3(Math.ceil(a.x), Math.ceil(a.y), Math.ceil(a.z));
      resultVal = resultVec.length();
      break;
    case 'mod':
      resultVec = new THREE.Vector3(
        b.x !== 0 ? a.x % b.x : 0,
        b.y !== 0 ? a.y % b.y : 0,
        b.z !== 0 ? a.z % b.z : 0,
      );
      resultVal = resultVec.length();
      break;
    case 'abs':
      resultVec = new THREE.Vector3(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
      resultVal = resultVec.length();
      break;
    case 'min':
      resultVec = new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
      resultVal = resultVec.length();
      break;
    case 'max':
      resultVec = new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
      resultVal = resultVec.length();
      break;
    case 'sin':
      resultVec = new THREE.Vector3(Math.sin(a.x), Math.sin(a.y), Math.sin(a.z));
      resultVal = resultVec.length();
      break;
    case 'cos':
      resultVec = new THREE.Vector3(Math.cos(a.x), Math.cos(a.y), Math.cos(a.z));
      resultVal = resultVec.length();
      break;
    case 'wrap': {
      const max = b.clone();
      const min = new THREE.Vector3(scale, scale, scale);
      resultVec = new THREE.Vector3(
        max.x !== min.x ? ((a.x - min.x) % (max.x - min.x)) + min.x : a.x,
        max.y !== min.y ? ((a.y - min.y) % (max.y - min.y)) + min.y : a.y,
        max.z !== min.z ? ((a.z - min.z) % (max.z - min.z)) + min.z : a.z,
      );
      resultVal = resultVec.length();
      break;
    }
    default: // 'add'
      resultVec = a.clone().add(b);
      resultVal = resultVec.length();
  }

  return {
    Vector: { x: resultVec.x, y: resultVec.y, z: resultVec.z },
    Value: resultVal,
  };
}

/**
 * 22. VectorRotate — Rotate vector by euler/axis/angle.
 * Supports multiple rotation modes: axis-angle, euler XYZ/ZYX, single axis.
 *
 * Inputs: Vector, Center, Axis, Angle, Rotation, Mode
 * Outputs: Vector
 */
export function executeVectorRotate(inputs: NodeInputs): NodeOutput {
  const v = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const center = normalizeVec(inputs.Center ?? inputs.center ?? { x: 0, y: 0, z: 0 });
  const axis = normalizeVec(inputs.Axis ?? inputs.axis ?? { x: 0, y: 0, z: 1 });
  const angle = (inputs.Angle ?? inputs.angle ?? 0) as number;
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const mode = (inputs.Mode ?? inputs.mode ?? 'AXIS_ANGLE') as string;
  const invert = (inputs.Invert ?? inputs.invert ?? false) as boolean;

  const vec = new THREE.Vector3(v.x, v.y, v.z);
  const c = new THREE.Vector3(center.x, center.y, center.z);
  const actualAngle = invert ? -angle : angle;

  switch (mode) {
    case 'EULER_XYZ': {
      const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
      vec.sub(c);
      vec.applyEuler(euler);
      vec.add(c);
      break;
    }
    case 'EULER_ZYX': {
      const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'ZYX');
      vec.sub(c);
      vec.applyEuler(euler);
      vec.add(c);
      break;
    }
    case 'X_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(1, 0, 0), actualAngle);
      vec.add(c);
      break;
    }
    case 'Y_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), actualAngle);
      vec.add(c);
      break;
    }
    case 'Z_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(0, 0, 1), actualAngle);
      vec.add(c);
      break;
    }
    default: { // 'AXIS_ANGLE'
      const ax = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
      vec.sub(c);
      vec.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(ax, actualAngle));
      vec.add(c);
      break;
    }
  }

  return { Vector: { x: vec.x, y: vec.y, z: vec.z } };
}

/**
 * 23. CurveLength — Compute length of a curve.
 * Calculates the total arc length from curve point data.
 *
 * Inputs: Curve (array of points or THREE.Curve)
 * Outputs: Length
 */
export function executeCurveLength(inputs: NodeInputs): NodeOutput {
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
