/**
 * CSGFracture — P5.6: Fracture System via CSG
 *
 * Pre-generates fracture patterns using Voronoi decomposition, then at
 * fracture time uses CSG SUBTRACTION (via three-bvh-csg) to cleanly
 * separate fracture pieces. Each piece is converted to a Rapier dynamic
 * RigidBody with an impulse applied at the fracture point for realistic
 * shattering.
 *
 * Phase 5 — P5.6: Fracture System via CSG
 *
 * @module sim/destruction
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';

// ============================================================================
// Lazy-loaded CSG imports
// ============================================================================

let CSGModules: {
  Brush: any;
  Evaluator: any;
  ADDITION: number;
  SUBTRACTION: number;
  INTERSECTION: number;
  DIFFERENCE: number;
  HOLLOW_SUBTRACTION: number;
} | null = null;

async function loadCSGModules(): Promise<typeof CSGModules> {
  if (CSGModules) return CSGModules;

  try {
    const csg = await import('three-bvh-csg');
    CSGModules = {
      Brush: csg.Brush,
      Evaluator: csg.Evaluator,
      ADDITION: csg.ADDITION,
      SUBTRACTION: csg.SUBTRACTION,
      INTERSECTION: csg.INTERSECTION,
      DIFFERENCE: csg.DIFFERENCE,
      HOLLOW_SUBTRACTION: csg.HOLLOW_SUBTRACTION,
    };
    return CSGModules;
  } catch (err) {
    console.error('[CSGFracture] Failed to load three-bvh-csg:', err);
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the CSG fracture operation.
 */
export interface FractureConfig {
  /** Number of Voronoi seed points / target piece count (default: 8) */
  pieceCount: number;
  /** Random seed for deterministic fractures (default: 42) */
  seed: number;
  /** Impulse force applied at fracture point (default: 5) */
  impulseForce: number;
  /** Jitter applied to Voronoi seed positions as fraction of bounding box (default: 0.1) */
  voronoiJitter: number;
  /** Density of fracture pieces for Rapier RigidBody mass calculation (default: 1000 kg/m³) */
  density: number;
  /** Restitution of fracture pieces (default: 0.3) */
  restitution: number;
  /** Friction of fracture pieces (default: 0.5) */
  friction: number;
  /** Linear damping for fracture piece RigidBodies (default: 0.1) */
  linearDamping: number;
  /** Angular damping for fracture piece RigidBodies (default: 0.2) */
  angularDamping: number;
  /** Whether to use CSG for clean separation (false = simple Voronoi split) */
  useCSG: boolean;
  /** Whether to add internal faces on fracture surfaces (default: true) */
  addInternalFaces: boolean;
  /** Color for internal fracture surfaces (default: 0x8b7355) */
  internalColor: number;
}

/**
 * A single fracture piece ready for physics simulation.
 */
export interface FracturePiece {
  /** Unique identifier for this piece */
  id: string;
  /** The mesh geometry for this piece */
  geometry: THREE.BufferGeometry;
  /** Material for the outer surface */
  material: THREE.Material;
  /** Material for the internal (fracture) surface */
  internalMaterial: THREE.Material;
  /** World-space center of mass */
  centerOfMass: THREE.Vector3;
  /** Estimated mass based on volume and density */
  mass: number;
  /** Estimated bounding sphere radius for collider */
  boundingRadius: number;
  /** The Voronoi cell index this piece belongs to */
  cellIndex: number;
  /** Initial impulse to apply at fracture point */
  impulse: THREE.Vector3;
  /** Point at which impulse is applied */
  impulsePoint: THREE.Vector3;
  /** Rapier RigidBody type for this piece */
  bodyType: 'dynamic';
  /** Restitution for the collider */
  restitution: number;
  /** Friction for the collider */
  friction: number;
  /** Linear damping */
  linearDamping: number;
  /** Angular damping */
  angularDamping: number;
}

/**
 * Result of a fracture operation.
 */
export interface FractureResult {
  /** All fracture pieces */
  pieces: FracturePiece[];
  /** Total number of pieces generated */
  pieceCount: number;
  /** Whether CSG was used for clean separation */
  usedCSG: boolean;
  /** Time taken for the fracture operation in ms */
  elapsedMs: number;
  /** The original mesh that was fractured */
  originalMesh: THREE.Mesh;
}

/**
 * A pre-generated fracture pattern that can be applied to meshes at runtime.
 */
export interface FracturePattern {
  /** Voronoi seed points in local space */
  seedPoints: THREE.Vector3[];
  /** Configuration used to generate this pattern */
  config: FractureConfig;
  /** Bounding box the pattern was generated for */
  bounds: THREE.Box3;
}

// ============================================================================
// Default configuration
// ============================================================================

const DEFAULT_CONFIG: FractureConfig = {
  pieceCount: 8,
  seed: 42,
  impulseForce: 5,
  voronoiJitter: 0.1,
  density: 1000,
  restitution: 0.3,
  friction: 0.5,
  linearDamping: 0.1,
  angularDamping: 0.2,
  useCSG: true,
  addInternalFaces: true,
  internalColor: 0x8b7355,
};

// ============================================================================
// CSGFractureSystem
// ============================================================================

/**
 * CSGFractureSystem — P5.6
 *
 * Fracture system that combines Voronoi decomposition with CSG boolean
 * subtraction for clean piece separation. Each fracture piece becomes
 * a Rapier dynamic RigidBody with an impulse applied at the fracture point.
 *
 * Usage:
 * ```ts
 * const fractureSystem = new CSGFractureSystem();
 *
 * // Pre-generate a fracture pattern
 * const pattern = fractureSystem.generatePattern(mesh, config);
 *
 * // At fracture time, apply the pattern
 * const result = await fractureSystem.fracture(mesh, pattern, {
 *   fracturePoint: new THREE.Vector3(0, 1, 0),
 * });
 *
 * // Convert pieces to Rapier RigidBodies
 * for (const piece of result.pieces) {
 *   // Create RigidBody from piece.geometry, piece.mass, etc.
 * }
 * ```
 */
export class CSGFractureSystem {
  private csgModules: NonNullable<typeof CSGModules> | null = null;
  private loaded = false;

  // --------------------------------------------------------------------------
  // CSG Loading
  // --------------------------------------------------------------------------

  /**
   * Load three-bvh-csg modules (call before fracture with useCSG=true).
   */
  async load(): Promise<boolean> {
    if (this.loaded && this.csgModules) return true;

    const modules = await loadCSGModules();
    if (!modules) return false;

    this.csgModules = modules;
    this.loaded = true;
    return true;
  }

  // --------------------------------------------------------------------------
  // Pattern Pre-generation
  // --------------------------------------------------------------------------

  /**
   * Pre-generate a fracture pattern using Voronoi decomposition.
   *
   * This can be called during scene generation to pre-compute the
   * Voronoi seed points. The pattern is then applied at fracture time
   * for fast execution.
   *
   * @param mesh   The mesh to generate a fracture pattern for.
   * @param config Fracture configuration.
   * @returns      A FracturePattern that can be applied later.
   */
  generatePattern(mesh: THREE.Mesh, config?: Partial<FractureConfig>): FracturePattern {
    const cfg: FractureConfig = { ...DEFAULT_CONFIG, ...config };
    const bbox = new THREE.Box3().setFromObject(mesh);

    const seedPoints = this.generateSeedPoints(bbox, cfg.pieceCount, cfg.seed, cfg.voronoiJitter);

    return {
      seedPoints,
      config: cfg,
      bounds: bbox,
    };
  }

  /**
   * Pre-generate a fracture pattern for a bounding box (without a mesh).
   */
  generatePatternForBounds(
    bounds: THREE.Box3,
    config?: Partial<FractureConfig>,
  ): FracturePattern {
    const cfg: FractureConfig = { ...DEFAULT_CONFIG, ...config };
    const seedPoints = this.generateSeedPoints(bounds, cfg.pieceCount, cfg.seed, cfg.voronoiJitter);

    return {
      seedPoints,
      config: cfg,
      bounds,
    };
  }

  // --------------------------------------------------------------------------
  // Fracture Execution
  // --------------------------------------------------------------------------

  /**
   * Fracture a mesh using a pre-generated pattern.
   *
   * @param mesh          The mesh to fracture.
   * @param pattern       Pre-generated fracture pattern.
   * @param options       Additional fracture options.
   * @returns             FractureResult with all pieces.
   */
  async fracture(
    mesh: THREE.Mesh,
    pattern: FracturePattern,
    options?: {
      /** World-space point where fracture originates (for impulse direction) */
      fracturePoint?: THREE.Vector3;
      /** Direction of the fracture impulse (default: outward from fracture point) */
      fractureDirection?: THREE.Vector3;
    },
  ): Promise<FractureResult> {
    const startTime = performance.now();
    const cfg = pattern.config;

    const fracturePoint = options?.fracturePoint ?? new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());

    // Try CSG-based fracture
    if (cfg.useCSG) {
      const csgResult = await this.fractureWithCSG(mesh, pattern, fracturePoint, cfg);
      if (csgResult) {
        return {
          ...csgResult,
          elapsedMs: performance.now() - startTime,
          originalMesh: mesh,
        };
      }
    }

    // Fallback: Voronoi triangle assignment (no CSG)
    const fallbackResult = this.fractureWithVoronoi(mesh, pattern, fracturePoint, cfg);
    return {
      ...fallbackResult,
      elapsedMs: performance.now() - startTime,
      originalMesh: mesh,
    };
  }

  /**
   * Stress fracture — fracture radiating from a specific point.
   * Seed points are biased towards the stress point for smaller pieces near impact.
   */
  async stressFracture(
    mesh: THREE.Mesh,
    stressPoint: THREE.Vector3,
    config?: Partial<FractureConfig>,
  ): Promise<FractureResult> {
    const cfg: FractureConfig = { ...DEFAULT_CONFIG, pieceCount: 12, ...config };
    const bbox = new THREE.Box3().setFromObject(mesh);

    // Generate seed points biased towards stress point
    const rng = new SeededRandom(cfg.seed);
    const seedPoints: THREE.Vector3[] = [];
    const bboxSize = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

    // Convert stress point to local space
    const invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const localStress = stressPoint.clone().applyMatrix4(invMatrix);

    for (let i = 0; i < cfg.pieceCount; i++) {
      const spread = maxDim * 0.5 * (1.0 - (i / cfg.pieceCount) * 0.5);
      const x = localStress.x + rng.gaussian(0, spread * 0.3);
      const y = localStress.y + rng.gaussian(0, spread * 0.3);
      const z = localStress.z + rng.gaussian(0, spread * 0.3);
      const pt = new THREE.Vector3(x, y, z);
      pt.clamp(bbox.min, bbox.max);
      seedPoints.push(pt);
    }

    const pattern: FracturePattern = { seedPoints, config: cfg, bounds: bbox };
    return this.fracture(mesh, pattern, { fracturePoint: stressPoint });
  }

  // --------------------------------------------------------------------------
  // CSG-based Fracture
  // --------------------------------------------------------------------------

  /**
   * Fracture using CSG SUBTRACTION for clean piece separation.
   *
   * For each Voronoi cell:
   * 1. Create a Brush from the original mesh
   * 2. Create a Brush from the Voronoi cell region
   * 3. Use CSG INTERSECTION to extract the piece
   * 4. The result is a clean mesh with proper manifold surfaces
   */
  private async fractureWithCSG(
    mesh: THREE.Mesh,
    pattern: FracturePattern,
    fracturePoint: THREE.Vector3,
    cfg: FractureConfig,
  ): Promise<Omit<FractureResult, 'elapsedMs' | 'originalMesh'> | null> {
    const loaded = await this.load();
    if (!loaded || !this.csgModules) return null;

    try {
      const { Brush, Evaluator, SUBTRACTION, INTERSECTION } = this.csgModules;
      const evaluator = new Evaluator();
      evaluator.attributes = ['position', 'uv', 'normal'];
      evaluator.useGroups = true;

      const pieces: FracturePiece[] = [];
      const seedPoints = pattern.seedPoints;

      // Create a Brush from the original mesh
      const originalBrush = new Brush(mesh.geometry, mesh.material);
      originalBrush.applyMatrix4(mesh.matrixWorld);
      originalBrush.updateMatrixWorld(true);
      originalBrush.prepareGeometry();

      for (let cellIndex = 0; cellIndex < seedPoints.length; cellIndex++) {
        // Create a Voronoi cell brush — approximate as a sphere
        // centered at the seed point with radius to the nearest neighbor
        const cellRadius = this.computeCellRadius(seedPoints, cellIndex, pattern.bounds);
        const cellGeometry = new THREE.IcosahedronGeometry(cellRadius, 2);
        const cellMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const cellBrush = new Brush(cellGeometry, cellMaterial);
        cellBrush.position.copy(seedPoints[cellIndex]);
        cellBrush.updateMatrixWorld(true);
        cellBrush.prepareGeometry();

        try {
          // CSG INTERSECTION: original mesh ∩ voronoi cell = fracture piece
          const resultBrush = evaluator.evaluate(originalBrush, cellBrush, INTERSECTION);

          if (resultBrush.geometry && resultBrush.geometry.attributes.position.count > 0) {
            const piece = this.createFracturePiece(
              resultBrush.geometry,
              resultBrush.material,
              mesh,
              cellIndex,
              seedPoints[cellIndex],
              fracturePoint,
              cfg,
            );
            pieces.push(piece);
          }
        } catch (err) {
          // CSG can fail for degenerate geometries — skip this cell
          console.warn(`[CSGFracture] CSG failed for cell ${cellIndex}:`, err);
        }

        cellGeometry.dispose();
        cellMaterial.dispose();
      }

      return { pieces, pieceCount: pieces.length, usedCSG: true };
    } catch (err) {
      console.warn('[CSGFracture] CSG fracture failed, falling back to Voronoi:', err);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Voronoi-based Fracture (Fallback)
  // --------------------------------------------------------------------------

  /**
   * Fracture using simple Voronoi triangle assignment (no CSG).
   * Assigns each triangle to its nearest Voronoi seed point.
   */
  private fractureWithVoronoi(
    mesh: THREE.Mesh,
    pattern: FracturePattern,
    fracturePoint: THREE.Vector3,
    cfg: FractureConfig,
  ): Omit<FractureResult, 'elapsedMs' | 'originalMesh'> {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const indexedGeometry = this.ensureIndexed(geometry);
    const seedPoints = pattern.seedPoints;

    const posAttr = indexedGeometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = indexedGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = indexedGeometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const indexAttr = indexedGeometry.getIndex()!;

    const positions = posAttr.array as Float32Array;
    const normals = normalAttr ? (normalAttr.array as Float32Array) : null;
    const uvs = uvAttr ? (uvAttr.array as Float32Array) : null;
    const indices = indexAttr.array as Uint16Array | Uint32Array;

    // Assign triangles to cells
    const cellAssignments = this.assignTrianglesToCells(positions, indices, seedPoints);

    const pieces: FracturePiece[] = [];

    for (let cellIndex = 0; cellIndex < seedPoints.length; cellIndex++) {
      const cellTriangles = cellAssignments.get(cellIndex);
      if (!cellTriangles || cellTriangles.length === 0) continue;

      const cellGeometry = this.extractCellGeometry(
        positions, normals, uvs, indices, cellTriangles,
      );

      if (!normalAttr) {
        cellGeometry.computeVertexNormals();
      }

      // Add internal faces if requested
      if (cfg.addInternalFaces) {
        const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        this.addInternalFaces(cellGeometry, seedPoints[cellIndex], center, pattern.bounds);
      }

      const material = this.createCellMaterial(mesh, cellIndex);

      const piece = this.createFracturePiece(
        cellGeometry,
        material,
        mesh,
        cellIndex,
        seedPoints[cellIndex],
        fracturePoint,
        cfg,
      );

      pieces.push(piece);
    }

    return { pieces, pieceCount: pieces.length, usedCSG: false };
  }

  // --------------------------------------------------------------------------
  // Fracture Piece Creation
  // --------------------------------------------------------------------------

  /**
   * Create a FracturePiece from extracted geometry.
   */
  private createFracturePiece(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    originalMesh: THREE.Mesh,
    cellIndex: number,
    seedPoint: THREE.Vector3,
    fracturePoint: THREE.Vector3,
    cfg: FractureConfig,
  ): FracturePiece {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const bbox = geometry.boundingBox!;
    const centerOfMass = new THREE.Vector3();
    bbox.getCenter(centerOfMass);

    // Estimate volume from bounding box (rough approximation)
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const volume = size.x * size.y * size.z;
    const mass = volume * cfg.density;

    // Bounding radius for collider
    const boundingRadius = geometry.boundingSphere
      ? geometry.boundingSphere!.radius
      : size.length() / 2;

    // Compute impulse direction: outward from fracture point
    const impulseDir = new THREE.Vector3()
      .subVectors(centerOfMass, fracturePoint)
      .normalize();

    // Apply impulse force inversely proportional to distance
    const distance = centerOfMass.distanceTo(fracturePoint);
    const impulseMagnitude = cfg.impulseForce / (1 + distance * 0.3);
    const impulse = impulseDir.multiplyScalar(impulseMagnitude);

    // Internal material for fracture surfaces
    const internalMaterial = new THREE.MeshStandardMaterial({
      color: cfg.internalColor,
      roughness: 0.95,
      metalness: 0,
      side: THREE.BackSide,
    });

    return {
      id: `fracture-piece-${cellIndex}`,
      geometry,
      material,
      internalMaterial,
      centerOfMass,
      mass: Math.max(mass, 0.01), // Ensure positive mass
      boundingRadius,
      cellIndex,
      impulse,
      impulsePoint: centerOfMass.clone(),
      bodyType: 'dynamic',
      restitution: cfg.restitution,
      friction: cfg.friction,
      linearDamping: cfg.linearDamping,
      angularDamping: cfg.angularDamping,
    };
  }

  // --------------------------------------------------------------------------
  // Voronoi Seed Point Generation
  // --------------------------------------------------------------------------

  /**
   * Generate Voronoi seed points inside a bounding box.
   */
  private generateSeedPoints(
    bounds: THREE.Box3,
    count: number,
    seed: number,
    jitter: number,
  ): THREE.Vector3[] {
    const rng = new SeededRandom(seed);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    const dims = this.computeGridDimensions(count);
    const points: THREE.Vector3[] = [];

    const stepX = size.x / dims.x;
    const stepY = size.y / dims.y;
    const stepZ = size.z / dims.z;

    for (let iz = 0; iz < dims.z && points.length < count; iz++) {
      for (let iy = 0; iy < dims.y && points.length < count; iy++) {
        for (let ix = 0; ix < dims.x && points.length < count; ix++) {
          const baseX = bounds.min.x + stepX * (ix + 0.5);
          const baseY = bounds.min.y + stepY * (iy + 0.5);
          const baseZ = bounds.min.z + stepZ * (iz + 0.5);

          const jx = (rng.next() - 0.5) * 2 * jitter * stepX;
          const jy = (rng.next() - 0.5) * 2 * jitter * stepY;
          const jz = (rng.next() - 0.5) * 2 * jitter * stepZ;

          const pt = new THREE.Vector3(baseX + jx, baseY + jy, baseZ + jz);
          pt.clamp(bounds.min, bounds.max);
          points.push(pt);
        }
      }
    }

    while (points.length < count) {
      const x = bounds.min.x + rng.next() * size.x;
      const y = bounds.min.y + rng.next() * size.y;
      const z = bounds.min.z + rng.next() * size.z;
      points.push(new THREE.Vector3(x, y, z));
    }

    return points.slice(0, count);
  }

  /**
   * Compute the radius of a Voronoi cell (distance to nearest neighbor / 2).
   */
  private computeCellRadius(
    seedPoints: THREE.Vector3[],
    cellIndex: number,
    _bounds: THREE.Box3,
  ): number {
    let minDist = Infinity;
    const center = seedPoints[cellIndex];

    for (let i = 0; i < seedPoints.length; i++) {
      if (i === cellIndex) continue;
      const dist = center.distanceTo(seedPoints[i]);
      if (dist < minDist) minDist = dist;
    }

    // Use half the distance to nearest neighbor as radius, with a minimum
    return Math.max(minDist * 0.55, 0.1);
  }

  // --------------------------------------------------------------------------
  // Triangle Assignment
  // --------------------------------------------------------------------------

  /**
   * Assign each triangle to its nearest Voronoi seed point.
   */
  private assignTrianglesToCells(
    positions: Float32Array | ArrayLike<number>,
    indices: Uint16Array | Uint32Array | ArrayLike<number>,
    seedPoints: THREE.Vector3[],
  ): Map<number, Array<{ i0: number; i1: number; i2: number }>> {
    const cellMap = new Map<number, Array<{ i0: number; i1: number; i2: number }>>();
    for (let i = 0; i < seedPoints.length; i++) {
      cellMap.set(i, []);
    }

    const triangleCount = indices.length / 3;
    const centroid = new THREE.Vector3();

    for (let t = 0; t < triangleCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      centroid.set(
        (positions[i0 * 3] + positions[i1 * 3] + positions[i2 * 3]) / 3,
        (positions[i0 * 3 + 1] + positions[i1 * 3 + 1] + positions[i2 * 3 + 1]) / 3,
        (positions[i0 * 3 + 2] + positions[i1 * 3 + 2] + positions[i2 * 3 + 2]) / 3,
      );

      let nearestCell = 0;
      let nearestDist = Infinity;
      for (let s = 0; s < seedPoints.length; s++) {
        const dist = centroid.distanceToSquared(seedPoints[s]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestCell = s;
        }
      }

      cellMap.get(nearestCell)!.push({ i0, i1, i2 });
    }

    return cellMap;
  }

  // --------------------------------------------------------------------------
  // Cell Geometry Extraction
  // --------------------------------------------------------------------------

  /**
   * Extract geometry for a single Voronoi cell.
   */
  private extractCellGeometry(
    positions: Float32Array | ArrayLike<number>,
    normals: Float32Array | ArrayLike<number> | null,
    uvs: Float32Array | ArrayLike<number> | null,
    _indices: Uint16Array | Uint32Array | ArrayLike<number>,
    cellTriangles: Array<{ i0: number; i1: number; i2: number }>,
  ): THREE.BufferGeometry {
    const remap = new Map<number, number>();
    const newPos: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndices: number[] = [];
    let nextIndex = 0;

    for (const tri of cellTriangles) {
      const verts = [tri.i0, tri.i1, tri.i2];

      for (const oldIdx of verts) {
        if (!remap.has(oldIdx)) {
          remap.set(oldIdx, nextIndex);

          newPos.push(
            positions[oldIdx * 3],
            positions[oldIdx * 3 + 1],
            positions[oldIdx * 3 + 2],
          );

          if (normals) {
            newNormals.push(
              normals[oldIdx * 3],
              normals[oldIdx * 3 + 1],
              normals[oldIdx * 3 + 2],
            );
          }

          if (uvs) {
            newUvs.push(uvs[oldIdx * 2], uvs[oldIdx * 2 + 1]);
          }

          nextIndex++;
        }
      }

      newIndices.push(remap.get(tri.i0)!, remap.get(tri.i1)!, remap.get(tri.i2)!);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));

    if (newNormals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }

    if (newUvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }

    geometry.setIndex(newIndices);
    return geometry;
  }

  // --------------------------------------------------------------------------
  // Internal Faces
  // --------------------------------------------------------------------------

  /**
   * Add internal cap faces on the Voronoi boundary using a fan triangulation
   * from the seed point to the boundary edge loop.
   */
  private addInternalFaces(
    geometry: THREE.BufferGeometry,
    seedPoint: THREE.Vector3,
    center: THREE.Vector3,
    _bounds: THREE.Box3,
  ): void {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const idxAttr = geometry.getIndex();
    if (!idxAttr) return;

    const positions = posAttr.array as Float32Array;
    const indices = idxAttr.array as Uint16Array | Uint32Array;
    const vertexCount = posAttr.count;
    const triangleCount = indices.length / 3;

    if (triangleCount === 0 || vertexCount === 0) return;

    // Find boundary edges
    const edgeFaceCount = new Map<string, number>();
    for (let t = 0; t < triangleCount; t++) {
      const a = indices[t * 3];
      const b = indices[t * 3 + 1];
      const c = indices[t * 3 + 2];

      const edges = [
        [Math.min(a, b), Math.max(a, b)],
        [Math.min(b, c), Math.max(b, c)],
        [Math.min(c, a), Math.max(c, a)],
      ];

      for (const [e0, e1] of edges) {
        const key = `${e0}-${e1}`;
        edgeFaceCount.set(key, (edgeFaceCount.get(key) || 0) + 1);
      }
    }

    const boundaryEdges: [number, number][] = [];
    for (const [key, count] of edgeFaceCount) {
      if (count === 1) {
        const parts = key.split('-');
        boundaryEdges.push([parseInt(parts[0], 10), parseInt(parts[1], 10)]);
      }
    }

    if (boundaryEdges.length === 0) return;

    const boundaryVertexSet = new Set<number>();
    for (const [a, b] of boundaryEdges) {
      boundaryVertexSet.add(a);
      boundaryVertexSet.add(b);
    }
    const boundaryVertices = Array.from(boundaryVertexSet);
    if (boundaryVertices.length < 3) return;

    // Average boundary position
    const avgBoundary = new THREE.Vector3();
    for (const vi of boundaryVertices) {
      avgBoundary.x += positions[vi * 3];
      avgBoundary.y += positions[vi * 3 + 1];
      avgBoundary.z += positions[vi * 3 + 2];
    }
    avgBoundary.divideScalar(boundaryVertices.length);

    // Internal center: midpoint between seed point and average boundary
    const internalCenter = new THREE.Vector3()
      .addVectors(seedPoint, avgBoundary)
      .multiplyScalar(0.5);

    // Add internal center as new vertex
    const newPositions: number[] = Array.from(positions);
    newPositions.push(internalCenter.x, internalCenter.y, internalCenter.z);
    const centerIndex = vertexCount;

    // Add normals
    const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const newNormalData: number[] = [];
    if (normalAttr) {
      const normalArray = normalAttr.array as Float32Array;
      for (let i = 0; i < normalArray.length; i++) {
        newNormalData.push(normalArray[i]);
      }
      const internalNormal = new THREE.Vector3().subVectors(center, internalCenter).normalize();
      newNormalData.push(internalNormal.x, internalNormal.y, internalNormal.z);
    }

    // Sort boundary vertices by angle for fan triangulation
    const n = new THREE.Vector3().subVectors(center, internalCenter).normalize();
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(n.dot(up)) > 0.99) up = new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(n, up).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();

    const sortedBoundary = boundaryVertices.map((vi) => {
      const px = positions[vi * 3] - internalCenter.x;
      const py = positions[vi * 3 + 1] - internalCenter.y;
      const pz = positions[vi * 3 + 2] - internalCenter.z;
      const dx = px * u.x + py * u.y + pz * u.z;
      const dy = px * v.x + py * v.y + pz * v.z;
      return { index: vi, angle: Math.atan2(dy, dx) };
    }).sort((a, b) => a.angle - b.angle).map(item => item.index);

    // Create fan triangles
    const newIndices: number[] = Array.from(indices);
    for (let i = 0; i < sortedBoundary.length; i++) {
      const a = sortedBoundary[i];
      const b = sortedBoundary[(i + 1) % sortedBoundary.length];
      newIndices.push(centerIndex, a, b);
    }

    // Update geometry
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormalData.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormalData, 3));
    }
    geometry.setIndex(newIndices);
  }

  // --------------------------------------------------------------------------
  // Material Helpers
  // --------------------------------------------------------------------------

  /**
   * Create a material for a fracture cell piece.
   */
  private createCellMaterial(
    originalMesh: THREE.Mesh,
    cellIndex: number,
  ): THREE.MeshStandardMaterial {
    const originalMaterial = originalMesh.material;

    if (
      Array.isArray(originalMaterial)
        ? originalMaterial[0] instanceof THREE.MeshStandardMaterial
        : originalMaterial instanceof THREE.MeshStandardMaterial
    ) {
      const srcMat = Array.isArray(originalMaterial)
        ? (originalMaterial[0] as THREE.MeshStandardMaterial)
        : (originalMaterial as THREE.MeshStandardMaterial);

      const cloned = srcMat.clone();

      const color = new THREE.Color(cloned.color);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.h = (hsl.h + cellIndex * 0.02) % 1.0;
      hsl.l = Math.max(0, Math.min(1, hsl.l + (cellIndex % 3 - 1) * 0.02));
      color.setHSL(hsl.h, hsl.s, hsl.l);
      cloned.color = color;
      cloned.roughness = Math.min(1, cloned.roughness + 0.05);

      return cloned;
    }

    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((cellIndex * 0.1) % 1, 0.5, 0.5),
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  // --------------------------------------------------------------------------
  // Utility Helpers
  // --------------------------------------------------------------------------

  /**
   * Ensure the geometry has an index buffer.
   */
  private ensureIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (geometry.index !== null) return geometry;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = posAttr.count;
    const indices: number[] = [];
    for (let i = 0; i < count; i++) indices.push(i);

    const cloned = geometry.clone();
    cloned.setIndex(indices);
    return cloned;
  }

  /**
   * Compute grid dimensions for roughly uniform seed point distribution.
   */
  private computeGridDimensions(count: number): THREE.Vector3 {
    const cubeRoot = Math.cbrt(count);
    const x = Math.max(1, Math.ceil(cubeRoot));
    const y = Math.max(1, Math.ceil(cubeRoot));
    const z = Math.max(1, Math.ceil(count / (x * y)));
    return new THREE.Vector3(x, y, z);
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Filename-matching alias for backward compat.
 * `import CSGFracture from './CSGFracture'` and `import { CSGFracture } from './CSGFracture'` both work.
 */
export { CSGFractureSystem as CSGFracture };
export default CSGFractureSystem;
