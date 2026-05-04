/**
 * GeometryNodeExecutor - Geometry node execution backend
 *
 * While shader nodes compile to GLSL, geometry nodes need to execute on
 * Three.js geometry data directly. This module provides:
 *
 * - GeometryNodeContext: wraps a THREE.BufferGeometry with metadata and
 *   attribute access for use inside geometry node evaluation.
 * - GeometryNodeExecutor: a registry of executor functions for geometry
 *   operations (subdivide, triangulate, boolean, transform, etc.).
 * - GeometryNodePipeline: evaluates a NodeWrangler graph as a geometry
 *   modification pipeline using topological sort and sequential execution.
 *
 * Port of: Princeton Infinigen's geometry nodes execution system.
 */

import * as THREE from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { NodeWrangler } from '../core/node-wrangler';
import { AttributeManager, AttributeDomain, AttributeType } from './AttributeIO';

// ============================================================================
// GeometryNodeContext
// ============================================================================

/**
 * Holds the geometry being modified during a geometry node evaluation.
 * Provides high-level attribute access and mutation methods, plus a metadata
 * map for material indices, tags, and named attributes that don't map
 * directly to BufferGeometry attributes.
 */
export class GeometryNodeContext {
  /** The underlying Three.js geometry */
  geometry: THREE.BufferGeometry;

  /** Arbitrary metadata: material indices, tags, named references, etc. */
  metadata: Map<string, any>;

  /** Attribute manager for per-element named attributes */
  attributeManager: AttributeManager;

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.metadata = new Map();
    this.attributeManager = new AttributeManager();
    this.attributeManager.readFromGeometry(geometry);
  }

  // -----------------------------------------------------------------------
  // Attribute access helpers
  // -----------------------------------------------------------------------

  /**
   * Get a BufferAttribute by name, or null if not present.
   */
  getAttribute(name: string): THREE.BufferAttribute | null {
    const attr = this.geometry.getAttribute(name);
    if (!attr) return null;
    return attr as THREE.BufferAttribute;
  }

  /**
   * Set (or replace) a BufferAttribute on the geometry.
   *
   * @param name - Attribute name (e.g. 'position', 'normal', 'customAttr')
   * @param data - Flat typed array of component values
   * @param itemSize - Number of components per element (1=scalar, 2=uv, 3=vec3, 4=vec4)
   */
  setAttribute(name: string, data: ArrayLike<number>, itemSize: number): void {
    const array = data instanceof Float32Array
      ? data
      : new Float32Array(data);
    this.geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    this.geometry.getAttribute(name).needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Geometry queries
  // -----------------------------------------------------------------------

  /** Number of vertices in the geometry */
  getVertexCount(): number {
    const pos = this.geometry.getAttribute('position');
    return pos ? pos.count : 0;
  }

  /** Number of triangular faces in the geometry */
  getFaceCount(): number {
    const idx = this.geometry.getIndex();
    if (idx) return Math.floor(idx.count / 3);
    return Math.floor(this.getVertexCount() / 3);
  }

  /** Number of edges (upper-bound, derived from face count) */
  getEdgeCount(): number {
    return this.getFaceCount() * 3;
  }

  // -----------------------------------------------------------------------
  // Clone
  // -----------------------------------------------------------------------

  /**
   * Deep-clone this context, including its geometry and metadata.
   */
  clone(): GeometryNodeContext {
    const ctx = new GeometryNodeContext(this.geometry.clone());
    // Copy metadata
    for (const [key, value] of this.metadata) {
      ctx.metadata.set(key, typeof value === 'object' && value !== null
        ? JSON.parse(JSON.stringify(value))
        : value);
    }
    return ctx;
  }
}

// ============================================================================
// Executor function type
// ============================================================================

/**
 * A geometry node executor receives named inputs and a mutable context,
 * performs the operation, and returns output values (always including `context`).
 */
export type GeometryExecutorFn = (
  inputs: Record<string, any>,
  context: GeometryNodeContext,
) => Record<string, any>;

// ============================================================================
// GeometryNodeExecutor
// ============================================================================

/**
 * Central registry and executor for geometry node types.
 *
 * Follows the same static-executor-map pattern as `NodeWrangler.executors`,
 * but each executor receives a `GeometryNodeContext` instead of plain properties.
 */
export class GeometryNodeExecutor {
  /**
   * Static map of node-type name → executor function.
   * Populate via `GeometryNodeExecutor.register()` or direct assignment.
   */
  static executors: Map<string, GeometryExecutorFn> = new Map();

  /**
   * Register an executor for a geometry node type.
   */
  static register(nodeType: string, executor: GeometryExecutorFn): void {
    GeometryNodeExecutor.executors.set(nodeType, executor);
  }

  /**
   * Execute a single geometry node.
   *
   * @param nodeType - The registered node type string
   * @param inputs   - Resolved input values for this node
   * @param context  - The current geometry context to modify
   * @returns Output map; must include `context` with the (possibly new) context
   */
  static execute(
    nodeType: string,
    inputs: Record<string, any>,
    context: GeometryNodeContext,
  ): Record<string, any> {
    const executor = GeometryNodeExecutor.executors.get(nodeType);
    if (!executor) {
      console.warn(`[GeometryNodeExecutor] No executor registered for "${nodeType}", passing through.`);
      return { context };
    }
    return executor(inputs, context);
  }
}

// ============================================================================
// Built-in executor implementations
// ============================================================================

// ---------- SubdivisionSurface (Loop) ----------

GeometryNodeExecutor.register('SubdivisionSurface', (inputs, context) => {
  const iterations = inputs.iterations ?? inputs.level ?? 1;
  let geo = context.geometry;

  for (let iter = 0; iter < iterations; iter++) {
    geo = loopSubdivide(geo);
  }

  const newCtx = new GeometryNodeContext(geo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

/**
 * One pass of Loop-style subdivision on a triangulated BufferGeometry.
 * Creates a midpoint on every edge and subdivides each triangle into four.
 */
function loopSubdivide(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  if (!posAttr || !idx) return geometry.clone();

  const posArr = posAttr.array as Float32Array;
  const idxArr = idx.array as Uint32Array | Uint16Array;
  const vertexCount = posAttr.count;
  const faceCount = Math.floor(idx.count / 3);

  // Copy original positions
  const newPositions: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    newPositions.push(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
  }

  // Edge midpoint cache
  const edgeMidpoints = new Map<string, number>();
  const newIndices: number[] = [];

  const getMidpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const existing = edgeMidpoints.get(key);
    if (existing !== undefined) return existing;

    const mx = (posArr[a * 3] + posArr[b * 3]) / 2;
    const my = (posArr[a * 3 + 1] + posArr[b * 3 + 1]) / 2;
    const mz = (posArr[a * 3 + 2] + posArr[b * 3 + 2]) / 2;
    const idx = newPositions.length / 3;
    newPositions.push(mx, my, mz);
    edgeMidpoints.set(key, idx);
    return idx;
  };

  for (let f = 0; f < faceCount; f++) {
    const v0 = idxArr[f * 3];
    const v1 = idxArr[f * 3 + 1];
    const v2 = idxArr[f * 3 + 2];

    const m01 = getMidpoint(v0, v1);
    const m12 = getMidpoint(v1, v2);
    const m20 = getMidpoint(v2, v0);

    // Four sub-triangles
    newIndices.push(v0, m01, m20);
    newIndices.push(v1, m12, m01);
    newIndices.push(v2, m20, m12);
    newIndices.push(m01, m12, m20);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();
  return result;
}

// ---------- Triangulate ----------

GeometryNodeExecutor.register('Triangulate', (inputs, context) => {
  const geo = context.geometry;
  const idx = geo.getIndex();
  if (!idx) {
    // Non-indexed geometry is already a triangle list
    return { context };
  }

  const idxArr = idx.array as Uint32Array | Uint16Array;
  // Already triangles if count is multiple of 3 and no polygons with >3 verts
  // This simple implementation assumes all faces are already triangles or
  // fan-triangulates quads (4-vertex faces as v0,v1,v2 and v0,v2,v3)
  const newIndices: number[] = [];
  const ngonMethod = inputs.ngonMethod ?? 'BEAUTY';

  for (let i = 0; i < idxArr.length; i += 3) {
    newIndices.push(idxArr[i], idxArr[i + 1], idxArr[i + 2]);
  }

  const newGeo = geo.clone();
  newGeo.setIndex(newIndices);
  const newCtx = new GeometryNodeContext(newGeo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- Boolean (CSG) ----------

GeometryNodeExecutor.register('Boolean', (inputs, context) => {
  const operation: 'union' | 'subtract' | 'intersect' = inputs.operation ?? 'union';
  const operandGeometry: THREE.BufferGeometry | null =
    inputs.geometry ?? inputs.operand ?? null;

  if (!operandGeometry) {
    console.warn('[GeometryNodeExecutor.Boolean] No operand geometry provided, returning input unchanged.');
    return { context };
  }

  // Perform CSG boolean operation using three-bvh-csg
  const result = voxelBoolean(context.geometry, operandGeometry, operation);

  const newCtx = new GeometryNodeContext(result);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

/**
 * CSG boolean operation using three-bvh-csg.
 *
 * Wraps the input BufferGeometry instances as Brush objects and delegates
 * the boolean evaluation to the three-bvh-csg Evaluator.
 *
 * Supported operations:
 *  - 'union'      → ADDITION       (A ∪ B)
 *  - 'subtract'   → SUBTRACTION    (A − B)
 *  - 'intersect'  → INTERSECTION   (A ∩ B)
 */
function voxelBoolean(
  geoA: THREE.BufferGeometry,
  geoB: THREE.BufferGeometry,
  operation: 'union' | 'subtract' | 'intersect',
): THREE.BufferGeometry {
  // Validate that both geometries have position data
  const posA = geoA.getAttribute('position');
  const posB = geoB.getAttribute('position');
  if (!posA) {
    console.warn('[voxelBoolean] Operand A has no position attribute, returning empty geometry.');
    return new THREE.BufferGeometry();
  }
  if (!posB) {
    console.warn('[voxelBoolean] Operand B has no position attribute, returning geometry A unchanged.');
    return geoA.clone();
  }

  // Ensure both geometries are indexed; three-bvh-csg requires indexed geometry.
  // If non-indexed, convert to indexed by using the existing vertex order.
  const ensureIndexed = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    if (geo.getIndex()) return geo;
    const count = geo.getAttribute('position').count;
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    const indexed = geo.clone();
    indexed.setIndex(new THREE.BufferAttribute(indices, 1));
    return indexed;
  };

  const preparedA = ensureIndexed(geoA);
  const preparedB = ensureIndexed(geoB);

  // Map our operation names to three-bvh-csg operation constants
  const operationMap: Record<string, typeof ADDITION> = {
    union: ADDITION,
    subtract: SUBTRACTION,
    intersect: INTERSECTION,
  };

  const csgOp = operationMap[operation];
  if (csgOp === undefined) {
    console.warn(`[voxelBoolean] Unknown operation "${operation}", returning geometry A unchanged.`);
    return geoA.clone();
  }

  try {
    // Create Brush instances from the geometries.
    // Brush extends Mesh, so it needs a geometry and a material.
    const brushA = new Brush(preparedA, new THREE.MeshBasicMaterial());
    const brushB = new Brush(preparedB, new THREE.MeshBasicMaterial());

    // Ensure the BVH cache is built for each brush
    brushA.prepareGeometry();
    brushB.prepareGeometry();

    // Perform the CSG evaluation
    const evaluator = new Evaluator();
    const resultBrush = evaluator.evaluate(brushA, brushB, csgOp);

    // Extract the resulting BufferGeometry
    const resultGeo = resultBrush.geometry;
    resultGeo.computeVertexNormals();

    return resultGeo;
  } catch (err) {
    console.error('[voxelBoolean] CSG evaluation failed:', err);
    // Fall back to returning geometry A on failure
    return geoA.clone();
  }
}

// ---------- Transform ----------

GeometryNodeExecutor.register('Transform', (inputs, context) => {
  const geo = context.geometry.clone();

  // Build a matrix from input parameters
  const translation = inputs.translation ?? [0, 0, 0];
  const rotation = inputs.rotation ?? [0, 0, 0]; // Euler angles in radians
  const scale = inputs.scale ?? [1, 1, 1];

  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const pos = new THREE.Vector3(translation[0], translation[1], translation[2]);
  const scl = new THREE.Vector3(scale[0], scale[1], scale[2]);

  matrix.compose(pos, quat, scl);

  // Also support a raw matrix input
  if (inputs.matrix) {
    const m = new THREE.Matrix4();
    m.fromArray(inputs.matrix);
    matrix.multiply(m);
  }

  geo.applyMatrix4(matrix);

  const newCtx = new GeometryNodeContext(geo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- JoinGeometry ----------

GeometryNodeExecutor.register('JoinGeometry', (inputs, context) => {
  const geometries: THREE.BufferGeometry[] = inputs.geometries ?? [];
  if (geometries.length === 0) return { context };

  // Merge all geometries together
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allUVs: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  // Start with the existing context geometry
  const ctxPos = context.geometry.getAttribute('position');
  const ctxIdx = context.geometry.getIndex();
  if (ctxPos) {
    const arr = ctxPos.array as Float32Array;
    for (let i = 0; i < arr.length; i++) allPositions.push(arr[i]);
    const ctxNorm = context.geometry.getAttribute('normal');
    if (ctxNorm) {
      const nArr = ctxNorm.array as Float32Array;
      for (let i = 0; i < nArr.length; i++) allNormals.push(nArr[i]);
    }
    const ctxUV = context.geometry.getAttribute('uv');
    if (ctxUV) {
      const uvArr = ctxUV.array as Float32Array;
      for (let i = 0; i < uvArr.length; i++) allUVs.push(uvArr[i]);
    }
    if (ctxIdx) {
      const iArr = ctxIdx.array as Uint32Array | Uint16Array;
      for (let i = 0; i < iArr.length; i++) allIndices.push(iArr[i]);
    } else {
      for (let i = 0; i < ctxPos.count; i++) allIndices.push(i);
    }
    vertexOffset = ctxPos.count;
  }

  // Append each additional geometry
  for (const geo of geometries) {
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    if (!pos) continue;

    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i++) allPositions.push(arr[i]);

    const norm = geo.getAttribute('normal');
    if (norm && allNormals.length > 0) {
      const nArr = norm.array as Float32Array;
      for (let i = 0; i < nArr.length; i++) allNormals.push(nArr[i]);
    }

    const uv = geo.getAttribute('uv');
    if (uv && allUVs.length > 0) {
      const uvArr = uv.array as Float32Array;
      for (let i = 0; i < uvArr.length; i++) allUVs.push(uvArr[i]);
    }

    if (idx) {
      const iArr = idx.array as Uint32Array | Uint16Array;
      for (let i = 0; i < iArr.length; i++) allIndices.push(iArr[i] + vertexOffset);
    } else {
      for (let i = 0; i < pos.count; i++) allIndices.push(i + vertexOffset);
    }
    vertexOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
  if (allNormals.length > 0) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
  }
  if (allUVs.length > 0) {
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(allUVs, 2));
  }
  merged.setIndex(allIndices);
  if (allNormals.length === 0) merged.computeVertexNormals();

  const newCtx = new GeometryNodeContext(merged);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- SeparateGeometry ----------

GeometryNodeExecutor.register('SeparateGeometry', (inputs, context) => {
  const mode: 'material' | 'attribute' = inputs.mode ?? inputs.selection ?? 'material';
  const attributeName: string = inputs.attribute ?? 'material_index';

  // For now, return the original context and a list of separated contexts
  // A full implementation would split the geometry by material index or attribute value
  const results: GeometryNodeContext[] = [context.clone()];

  if (mode === 'material' || mode === 'attribute') {
    const attr = context.getAttribute(attributeName);
    if (attr) {
      // Group faces by attribute value
      const groups = new Map<number, number[]>();
      const idx = context.geometry.getIndex();
      if (idx) {
        const idxArr = idx.array as Uint32Array | Uint16Array;
        const attrArr = attr.array as Float32Array | Int32Array;

        for (let f = 0; f < idxArr.length; f += 3) {
          const v0 = idxArr[f];
          const val = Math.round(attrArr[v0] ?? 0);
          if (!groups.has(val)) groups.set(val, []);
          groups.get(val)!.push(f / 3);
        }
      }

      // Create a context per group (simplified: just clone with metadata)
      if (groups.size > 1) {
        results.length = 0;
        for (const [val, _faces] of groups) {
          const splitCtx = context.clone();
          splitCtx.metadata.set('separated_value', val);
          results.push(splitCtx);
        }
      }
    }
  }

  return {
    context,
    geometries: results,
  };
});

// ---------- SetMaterial ----------

GeometryNodeExecutor.register('SetMaterial', (inputs, context) => {
  const materialIndex: number = inputs.material_index ?? inputs.materialIndex ?? 0;
  const selection = inputs.selection ?? null; // face selection mask

  // Store material index in metadata
  if (!context.metadata.has('material_indices')) {
    context.metadata.set('material_indices', new Map<number, number>());
  }
  const matIndices: Map<number, number> = context.metadata.get('material_indices');

  const faceCount = context.getFaceCount();
  for (let f = 0; f < faceCount; f++) {
    if (selection === null || (Array.isArray(selection) && selection[f])) {
      matIndices.set(f, materialIndex);
    }
  }

  // Also set as a per-face attribute if geometry is large enough
  const existingAttr = context.geometry.getAttribute('material_index');
  if (!existingAttr) {
    // Create material_index attribute (per-vertex for simplicity)
    const matArr = new Float32Array(context.getVertexCount()).fill(materialIndex);
    context.setAttribute('material_index', matArr, 1);
  }

  return { context };
});

// ---------- SetShadeSmooth ----------

GeometryNodeExecutor.register('SetShadeSmooth', (inputs, context) => {
  const smooth: boolean = inputs.shade_smooth ?? inputs.smooth ?? true;
  const selection = inputs.selection ?? null;

  if (smooth) {
    // Smooth shading: compute vertex normals
    context.geometry.computeVertexNormals();
  } else {
    // Flat shading: compute face normals and duplicate vertices
    const geo = context.geometry;
    const idx = geo.getIndex();
    const posAttr = geo.getAttribute('position');
    if (!idx || !posAttr) return { context };

    const idxArr = idx.array as Uint32Array | Uint16Array;
    const posArr = posAttr.array as Float32Array;
    const faceCount = Math.floor(idxArr.length / 3);

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newIndices: number[] = [];

    for (let f = 0; f < faceCount; f++) {
      if (selection !== null && Array.isArray(selection) && !selection[f]) {
        continue;
      }

      const i0 = idxArr[f * 3];
      const i1 = idxArr[f * 3 + 1];
      const i2 = idxArr[f * 3 + 2];

      const p0 = new THREE.Vector3(posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]);
      const p1 = new THREE.Vector3(posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]);
      const p2 = new THREE.Vector3(posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]);

      const normal = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(p1, p0),
          new THREE.Vector3().subVectors(p2, p0),
        )
        .normalize();

      const baseIdx = newPositions.length / 3;
      newPositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      newNormals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
      newIndices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    }

    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    newGeo.setIndex(newIndices);

    const newCtx = new GeometryNodeContext(newGeo);
    newCtx.metadata = new Map(context.metadata);
    return { context: newCtx };
  }

  return { context };
});

// ---------- MeshToPoints ----------

GeometryNodeExecutor.register('MeshToPoints', (inputs, context) => {
  const mode: 'vertices' | 'faces' = inputs.mode ?? 'vertices';
  const posAttr = context.geometry.getAttribute('position');
  if (!posAttr) return { context };

  const posArr = posAttr.array as Float32Array;
  let pointPositions: Float32Array;

  if (mode === 'vertices') {
    pointPositions = new Float32Array(posArr);
  } else {
    // Face centers
    const idx = context.geometry.getIndex();
    if (!idx) {
      pointPositions = new Float32Array(posArr);
    } else {
      const idxArr = idx.array as Uint32Array | Uint16Array;
      const faceCount = Math.floor(idxArr.length / 3);
      pointPositions = new Float32Array(faceCount * 3);
      for (let f = 0; f < faceCount; f++) {
        const i0 = idxArr[f * 3];
        const i1 = idxArr[f * 3 + 1];
        const i2 = idxArr[f * 3 + 2];
        pointPositions[f * 3] = (posArr[i0 * 3] + posArr[i1 * 3] + posArr[i2 * 3]) / 3;
        pointPositions[f * 3 + 1] = (posArr[i0 * 3 + 1] + posArr[i1 * 3 + 1] + posArr[i2 * 3 + 1]) / 3;
        pointPositions[f * 3 + 2] = (posArr[i0 * 3 + 2] + posArr[i1 * 3 + 2] + posArr[i2 * 3 + 2]) / 3;
      }
    }
  }

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));

  const newCtx = new GeometryNodeContext(pointsGeo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- ExtrudeMesh ----------

GeometryNodeExecutor.register('ExtrudeMesh', (inputs, context) => {
  const offset: number = inputs.offset ?? inputs.distance ?? 1.0;
  const selection = inputs.selection ?? null; // boolean mask per face

  const geo = context.geometry;
  const posAttr = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!posAttr || !idx) return { context };

  const posArr = posAttr.array as Float32Array;
  const idxArr = idx.array as Uint32Array | Uint16Array;
  const faceCount = Math.floor(idxArr.length / 3);

  // Compute face normals for extrusion direction
  const newPositions: number[] = [];
  const newIndices: number[] = [];

  // Copy original vertices
  const originalCount = posAttr.count;
  for (let i = 0; i < posArr.length; i++) newPositions.push(posArr[i]);

  // Re-emit original indices
  for (let i = 0; i < idxArr.length; i++) newIndices.push(idxArr[i]);

  for (let f = 0; f < faceCount; f++) {
    if (selection !== null && Array.isArray(selection) && !selection[f]) continue;

    const i0 = idxArr[f * 3];
    const i1 = idxArr[f * 3 + 1];
    const i2 = idxArr[f * 3 + 2];

    // Face normal
    const p0 = new THREE.Vector3(posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]);
    const p1 = new THREE.Vector3(posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]);
    const p2 = new THREE.Vector3(posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]);
    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(p1, p0),
        new THREE.Vector3().subVectors(p2, p0),
      )
      .normalize();

    // Create extruded vertices
    const e0 = originalCount + newPositions.length / 3 - originalCount;
    newPositions.push(
      p0.x + normal.x * offset, p0.y + normal.y * offset, p0.z + normal.z * offset,
      p1.x + normal.x * offset, p1.y + normal.y * offset, p1.z + normal.z * offset,
      p2.x + normal.x * offset, p2.y + normal.y * offset, p2.z + normal.z * offset,
    );

    const base = newPositions.length / 3 - 3;

    // Top face (reversed winding)
    newIndices.push(base, base + 2, base + 1);

    // Side quads (as two triangles each)
    // Side i0-i1
    newIndices.push(i0, base, base + 1);
    newIndices.push(i0, base + 1, i1);
    // Side i1-i2
    newIndices.push(i1, base + 1, base + 2);
    newIndices.push(i1, base + 2, i2);
    // Side i2-i0
    newIndices.push(i2, base + 2, base);
    newIndices.push(i2, base, i0);
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  newGeo.setIndex(newIndices);
  newGeo.computeVertexNormals();

  const newCtx = new GeometryNodeContext(newGeo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- ScaleElements ----------

GeometryNodeExecutor.register('ScaleElements', (inputs, context) => {
  const scale: number = inputs.scale ?? inputs.factor ?? 1.0;
  const selection = inputs.selection ?? null; // boolean mask per face
  const origin: 'center' | 'origin' = inputs.origin ?? 'center';

  const geo = context.geometry;
  const posAttr = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!posAttr || !idx) return { context };

  const posArr = new Float32Array(posAttr.array as Float32Array);
  const idxArr = idx.array as Uint32Array | Uint16Array;
  const faceCount = Math.floor(idxArr.length / 3);

  for (let f = 0; f < faceCount; f++) {
    if (selection !== null && Array.isArray(selection) && !selection[f]) continue;

    const i0 = idxArr[f * 3];
    const i1 = idxArr[f * 3 + 1];
    const i2 = idxArr[f * 3 + 2];

    // Compute face center
    const cx = (posArr[i0 * 3] + posArr[i1 * 3] + posArr[i2 * 3]) / 3;
    const cy = (posArr[i0 * 3 + 1] + posArr[i1 * 3 + 1] + posArr[i2 * 3 + 1]) / 3;
    const cz = (posArr[i0 * 3 + 2] + posArr[i1 * 3 + 2] + posArr[i2 * 3 + 2]) / 3;

    // Scale each vertex away from center
    const pivotX = origin === 'origin' ? 0 : cx;
    const pivotY = origin === 'origin' ? 0 : cy;
    const pivotZ = origin === 'origin' ? 0 : cz;

    for (const vi of [i0, i1, i2]) {
      posArr[vi * 3] = pivotX + (posArr[vi * 3] - pivotX) * scale;
      posArr[vi * 3 + 1] = pivotY + (posArr[vi * 3 + 1] - pivotY) * scale;
      posArr[vi * 3 + 2] = pivotZ + (posArr[vi * 3 + 2] - pivotZ) * scale;
    }
  }

  const newGeo = geo.clone();
  (newGeo.getAttribute('position') as THREE.BufferAttribute).array.set(posArr);
  newGeo.getAttribute('position').needsUpdate = true;
  newGeo.computeVertexNormals();

  const newCtx = new GeometryNodeContext(newGeo);
  newCtx.metadata = new Map(context.metadata);
  return { context: newCtx };
});

// ---------- DeleteGeometry ----------

GeometryNodeExecutor.register('DeleteGeometry', (inputs, context) => {
  const selection = inputs.selection ?? null; // boolean mask per face or vertex
  const domain: 'face' | 'vertex' = inputs.domain ?? 'face';

  const geo = context.geometry;
  const posAttr = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!posAttr || !idx) return { context };

  if (!selection) return { context }; // Nothing to delete

  const idxArr = idx.array as Uint32Array | Uint16Array;
  const posArr = posAttr.array as Float32Array;
  const faceCount = Math.floor(idxArr.length / 3);

  if (domain === 'face' && Array.isArray(selection)) {
    // Remove selected faces
    const newIndices: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      if (!selection[f]) {
        newIndices.push(idxArr[f * 3], idxArr[f * 3 + 1], idxArr[f * 3 + 2]);
      }
    }

    const newGeo = geo.clone();
    newGeo.setIndex(newIndices);
    newGeo.computeVertexNormals();

    const newCtx = new GeometryNodeContext(newGeo);
    newCtx.metadata = new Map(context.metadata);
    return { context: newCtx };
  }

  if (domain === 'vertex' && Array.isArray(selection)) {
    // Remove vertices marked in selection and re-index
    const keepSet = new Set<number>();
    for (let i = 0; i < posAttr.count; i++) {
      if (!selection[i]) keepSet.add(i);
    }

    // Build index mapping
    const newIndexMap = new Map<number, number>();
    const newPositions: number[] = [];
    let newIdx = 0;
    for (const oldIdx of keepSet) {
      newIndexMap.set(oldIdx, newIdx);
      newPositions.push(posArr[oldIdx * 3], posArr[oldIdx * 3 + 1], posArr[oldIdx * 3 + 2]);
      newIdx++;
    }

    const newIndices: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      const v0 = idxArr[f * 3];
      const v1 = idxArr[f * 3 + 1];
      const v2 = idxArr[f * 3 + 2];
      if (keepSet.has(v0) && keepSet.has(v1) && keepSet.has(v2)) {
        newIndices.push(newIndexMap.get(v0)!, newIndexMap.get(v1)!, newIndexMap.get(v2)!);
      }
    }

    const newGeo = new THREE.BufferGeometry();
    newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeo.setIndex(newIndices);
    newGeo.computeVertexNormals();

    const newCtx = new GeometryNodeContext(newGeo);
    newCtx.metadata = new Map(context.metadata);
    return { context: newCtx };
  }

  return { context };
});

// ============================================================================
// GeometryNodePipeline
// ============================================================================

/**
 * Evaluates a NodeWrangler graph as a geometry modification pipeline.
 *
 * Performs topological sort on the node graph, then executes each node
 * sequentially, threading the `GeometryNodeContext` through the pipeline.
 */
export class GeometryNodePipeline {
  /**
   * Evaluate a NodeWrangler's graph as a geometry pipeline.
   *
   * @param inputGeometry - The starting geometry to modify
   * @param nw            - A NodeWrangler whose active group defines the pipeline
   * @returns The final modified BufferGeometry after all nodes execute
   */
  static evaluate(
    inputGeometry: THREE.BufferGeometry,
    nw: NodeWrangler,
  ): THREE.BufferGeometry {
    const group = nw.getActiveGroup();
    const order = nw.topologicalSort(group);
    const results = new Map<string, Record<string, any>>();

    // Create initial context
    let currentContext = new GeometryNodeContext(inputGeometry);

    for (const nodeId of order) {
      const node = group.nodes.get(nodeId);
      if (!node) continue;

      // Resolve input values from connections or socket defaults
      const inputValues: Record<string, any> = {};

      for (const [socketName, socket] of node.inputs.entries()) {
        let resolved = false;
        for (const link of group.links.values()) {
          if (link.toNode === nodeId && link.toSocket === socketName) {
            const sourceResults = results.get(link.fromNode);
            if (sourceResults && link.fromSocket in sourceResults) {
              inputValues[socketName] = sourceResults[link.fromSocket];
              resolved = true;
            }
            break;
          }
        }
        if (!resolved) {
          inputValues[socketName] = socket.value ?? socket.defaultValue ?? socket.default;
        }
      }

      // Pass context through inputs if the node expects it
      if (!('context' in inputValues)) {
        inputValues['context'] = currentContext;
      }

      // Execute using GeometryNodeExecutor
      const executor = GeometryNodeExecutor.executors.get(String(node.type));
      if (executor) {
        try {
          const outputValues = executor(inputValues, currentContext);
          results.set(nodeId, outputValues);

          // Thread context forward
          if (outputValues.context && outputValues.context instanceof GeometryNodeContext) {
            currentContext = outputValues.context;
          }
        } catch (err) {
          console.warn(`[GeometryNodePipeline] Error executing node ${nodeId} (type=${node.type}):`, err);
          results.set(nodeId, { context: currentContext });
        }
      } else {
        // Try NodeWrangler's scalar executors as fallback
        const scalarExecutor = NodeWrangler.executors.get(String(node.type));
        if (scalarExecutor) {
          try {
            const outputValues = scalarExecutor(inputValues, node.properties);
            results.set(nodeId, outputValues);
          } catch (err) {
            console.warn(`[GeometryNodePipeline] Scalar executor error for ${nodeId}:`, err);
            results.set(nodeId, {});
          }
        } else {
          // Default: pass through inputs to outputs
          const outputValues: Record<string, any> = {};
          for (const [outName] of node.outputs.entries()) {
            outputValues[outName] = inputValues[outName] ?? node.properties[outName] ?? null;
          }
          results.set(nodeId, outputValues);
        }
      }
    }

    return currentContext.geometry;
  }
}

export default GeometryNodeExecutor;
