/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * LOD (Level of Detail) Mesher with Adaptive Resolution
 *
 * Based on original: infinigen/terrain/mesher/lod_mesher.py
 * Implements adaptive mesh refinement based on camera distance and screen space error
 */

import { Vector3, Matrix4, BufferGeometry, Float32BufferAttribute, Box3, Sphere } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';

/**
 * Terrain LOD configuration.
 *
 * Extends SphericalMesherConfig with LOD-specific fields. The LOD fields are
 * defined canonically in `TerrainLODConfigFields` at `@/assets/core/LODSystem`;
 * they are repeated here (rather than using `extends`) because
 * `SphericalMesherConfig` already declares `maxLOD` as optional, which
 * conflicts with the required version in `TerrainLODConfigFields`.
 *
 * @deprecated For the LOD-specific fields only, use `TerrainLODConfigFields`
 * from `@/assets/core/LODSystem`. The full composed type (with
 * SphericalMesherConfig) remains here because it depends on a
 * terrain-specific base type.
 */
export interface LODConfig extends SphericalMesherConfig {
  maxLOD: number;
  minLOD: number;
  screenSpaceError: number;
  lodTransitionDistance: number;
  borderStitching: boolean;
}

export interface LODChunk {
  geometry: BufferGeometry;
  lodLevel: number;
  bounds: Box3;
  boundingSphere: Sphere;
  children: LODChunk[];
  parent: LODChunk | null;
  visible: boolean;
  needsUpdate: boolean;
}

/** Information about a shared boundary face between two adjacent chunks */
interface SharedBoundaryInfo {
  /** The axis along which the two chunks share a face */
  axis: 'x' | 'y' | 'z';
  /** The world-space coordinate value of the shared face */
  coordinate: number;
  /** Which side of chunk1's bounds touches the shared face */
  chunk1Side: 'min' | 'max';
  /** Which side of chunk2's bounds touches the shared face */
  chunk2Side: 'min' | 'max';
}

export class LODMesher extends SphericalMesher {
  protected lodConfig: LODConfig;
  protected rootChunk: LODChunk | null;
  protected activeChunks: LODChunk[];

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<LODConfig> = {}
  ) {
    super(cameraPose, bounds, config);

    this.lodConfig = {
      maxLOD: 5,
      minLOD: 0,
      screenSpaceError: 2.0, // pixels
      lodTransitionDistance: 0.2,
      borderStitching: true,
      ...config,
    };

    this.rootChunk = null;
    this.activeChunks = [];
  }

  /**
   * Generate hierarchical LOD mesh structure
   */
  public generateLODMesh(kernels: SDFKernel[]): LODChunk {
    const { rMin, rMax } = this.config;
    const { maxLOD, minLOD } = this.lodConfig;

    // Create root chunk covering entire sphere
    this.rootChunk = this.createChunk(
      kernels,
      minLOD,
      new Box3(
        new Vector3(-rMax, -rMax, -rMax),
        new Vector3(rMax, rMax, rMax)
      ),
      null
    );

    // Update visibility based on camera
    this.updateLODVisibility(this.cameraPose.position);

    return this.rootChunk;
  }

  /**
   * Create a chunk at specified LOD level
   */
  protected createChunk(
    kernels: SDFKernel[],
    lodLevel: number,
    bounds: Box3,
    parent: LODChunk | null
  ): LODChunk {
    const center = bounds.getCenter(new Vector3());
    const size = new Vector3();
    bounds.getSize(size);
    const radius = size.length() / 2;

    // Calculate resolution for this LOD level
    const resolution = this.calculateResolution(lodLevel);

    // Generate geometry for this chunk
    const geometry = this.generateChunkGeometry(kernels, bounds, resolution, lodLevel);

    const chunk: LODChunk = {
      geometry,
      lodLevel,
      bounds,
      boundingSphere: new Sphere(center, radius),
      children: [],
      parent,
      visible: false,
      needsUpdate: false,
    };

    // Recursively create children if not at max LOD
    if (lodLevel < this.lodConfig.maxLOD) {
      const subChunks = this.subdivideBounds(bounds);
      for (const subBounds of subChunks) {
        const child = this.createChunk(kernels, lodLevel + 1, subBounds, chunk);
        chunk.children.push(child);
      }
    }

    return chunk;
  }

  /**
   * Generate geometry for a single chunk
   */
  protected generateChunkGeometry(
    kernels: SDFKernel[],
    bounds: Box3,
    resolution: number,
    lodLevel: number
  ): BufferGeometry {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const { rMin, rMax } = this.config;
    const center = bounds.getCenter(new Vector3());
    const size = new Vector3();
    bounds.getSize(size);

    // Generate grid within chunk bounds
    for (let y = 0; y <= resolution; y++) {
      for (let x = 0; x <= resolution; x++) {
        // Calculate position in chunk space
        const u = x / resolution;
        const v = y / resolution;

        // Map to spherical coordinates relative to chunk
        const theta = u * Math.PI * 2;
        const phi = v * Math.PI;

        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const direction = new Vector3(
          sinPhi * cosTheta,
          cosPhi,
          sinPhi * sinTheta
        );

        // Ray march from camera position
        const rayDir = direction.clone().applyMatrix4(this.cameraPose.rotation);
        const distance = this.rayMarchSurface(kernels, rayDir, rMin, rMax, this.config.testDownscale);

        const position = this.cameraPose.position.clone().add(
          rayDir.multiplyScalar(distance)
        );

        vertices.push(position.x, position.y, position.z);

        // Calculate normal
        const normal = this.calculateNormal(kernels, position, rayDir);
        normals.push(normal.x, normal.y, normal.z);

        // UV coordinates
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const current = y * (resolution + 1) + x;
        const next = current + 1;
        const below = (y + 1) * (resolution + 1) + x;
        const belowNext = below + 1;

        indices.push(current, below, next);
        indices.push(next, below, belowNext);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Calculate resolution for LOD level
   */
  protected calculateResolution(lodLevel: number): number {
    const { base90dResolution, maxLOD } = this.config;
    const { minLOD } = this.lodConfig;

    // Resolution decreases with higher LOD levels
    const normalizedLevel = (lodLevel - minLOD) / (maxLOD - minLOD);
    const factor = Math.pow(0.5, normalizedLevel * 2);

    return Math.max(8, Math.floor(base90dResolution * factor));
  }

  /**
   * Subdivide bounds into 8 sub-chunks (octree-style)
   *
   * Splits the bounding box along all three axes (X, Y, Z), producing
   * eight octant children. The bit pattern of the child index determines
   * which half of each axis the octant occupies:
   *   bit 0 → X: 0 = left (min→mid), 1 = right (mid→max)
   *   bit 1 → Y: 0 = bottom (min→mid), 1 = top (mid→max)
   *   bit 2 → Z: 0 = front (min→mid), 1 = back (mid→max)
   */
  protected subdivideBounds(bounds: Box3): Box3[] {
    const min = bounds.min;
    const max = bounds.max;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;

    const octants: Box3[] = [];
    for (let i = 0; i < 8; i++) {
      const x0 = (i & 1) !== 0 ? cx : min.x;
      const y0 = (i & 2) !== 0 ? cy : min.y;
      const z0 = (i & 4) !== 0 ? cz : min.z;
      const x1 = (i & 1) !== 0 ? max.x : cx;
      const y1 = (i & 2) !== 0 ? max.y : cy;
      const z1 = (i & 4) !== 0 ? max.z : cz;
      octants.push(new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1)));
    }
    return octants;
  }

  /**
   * Update LOD visibility based on camera position
   */
  public updateLODVisibility(cameraPosition: Vector3): void {
    this.activeChunks = [];
    this.traverseLODTree(this.rootChunk, cameraPosition);

    // Apply border stitching if enabled
    if (this.lodConfig.borderStitching) {
      this.applyBorderStitching();
    }
  }

  /**
   * Traverse LOD tree and determine visible chunks
   */
  protected traverseLODTree(chunk: LODChunk | null, cameraPosition: Vector3): void {
    if (!chunk) return;

    const distance = cameraPosition.distanceTo(chunk.boundingSphere.center);
    const radius = chunk.boundingSphere.radius;

    // Calculate screen space error
    const screenSpaceError = this.calculateScreenSpaceError(radius, distance);

    // Determine if this LOD is appropriate
    const shouldUseThisLOD = screenSpaceError <= this.lodConfig.screenSpaceError;
    const hasChildren = chunk.children.length > 0;

    if (shouldUseThisLOD || !hasChildren) {
      // Use this chunk
      chunk.visible = true;
      this.activeChunks.push(chunk);

      // Hide children
      for (const child of chunk.children) {
        child.visible = false;
      }
    } else {
      // Use children instead
      chunk.visible = false;

      for (const child of chunk.children) {
        this.traverseLODTree(child, cameraPosition);
      }
    }
  }

  /**
   * Calculate screen space error for a chunk
   */
  protected calculateScreenSpaceError(radius: number, distance: number): number {
    const fov = this.cameraPose.fov * (Math.PI / 180);
    const screenHeight = this.config.renderHeight || 1080;

    // Projected size in pixels
    const projectedSize = (radius / distance) * (screenHeight / (2 * Math.tan(fov / 2)));

    return projectedSize;
  }

  /**
   * Apply border stitching between different LOD levels
   * Prevents cracks at LOD boundaries
   */
  protected applyBorderStitching(): void {
    // Group adjacent chunks by LOD level
    const chunksByLOD = new Map<number, LODChunk[]>();

    for (const chunk of this.activeChunks) {
      if (!chunksByLOD.has(chunk.lodLevel)) {
        chunksByLOD.set(chunk.lodLevel, []);
      }
      chunksByLOD.get(chunk.lodLevel)!.push(chunk);
    }

    // For each pair of adjacent chunks with different LOD levels
    for (const [lodLevel, chunks] of chunksByLOD.entries()) {
      if (lodLevel >= this.lodConfig.maxLOD) continue;

      for (const chunk of chunks) {
        // Find neighboring chunks at higher LOD
        const neighbors = this.findHigherLODNeighbors(chunk);

        for (const neighbor of neighbors) {
          // Stitch borders
          this.stitchChunkBorders(chunk, neighbor);
        }
      }
    }
  }

  /**
   * Find neighboring chunks at higher LOD levels
   */
  protected findHigherLODNeighbors(chunk: LODChunk): LODChunk[] {
    const neighbors: LODChunk[] = [];

    // Check all active chunks for adjacency
    for (const other of this.activeChunks) {
      if (other.lodLevel > chunk.lodLevel && this.areAdjacent(chunk, other)) {
        neighbors.push(other);
      }
    }

    return neighbors;
  }

  /**
   * Check if two chunks are adjacent (share a face).
   *
   * Two chunks are face-adjacent iff they touch along exactly one axis
   * and overlap with *positive* area on the other two axes.  Merely
   * sharing an edge or a single vertex does not count as adjacent.
   */
  protected areAdjacent(chunk1: LODChunk, chunk2: LODChunk): boolean {
    return this.getSharedBoundary(chunk1, chunk2) !== null;
  }

  /**
   * Determine the shared boundary face between two chunks, if any.
   *
   * Returns null when the chunks are not face-adjacent (they could be
   * disjoint, share only an edge / vertex, or overlap in volume).
   */
  protected getSharedBoundary(chunk1: LODChunk, chunk2: LODChunk): SharedBoundaryInfo | null {
    const eps = 1e-4;
    const b1 = chunk1.bounds;
    const b2 = chunk2.bounds;

    const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];

    for (const axis of axes) {
      const otherAxes = axes.filter(a => a !== axis);

      // Check if the two chunks touch along this axis
      const touchMax1Min2 = Math.abs(b1.max[axis] - b2.min[axis]) < eps;
      const touchMax2Min1 = Math.abs(b2.max[axis] - b1.min[axis]) < eps;

      if (!touchMax1Min2 && !touchMax2Min1) continue;

      // Verify strict overlap on the other two axes (must be > 0, not just touching)
      let hasOverlap = true;
      for (const otherAxis of otherAxes) {
        const overlapMin = Math.max(b1.min[otherAxis], b2.min[otherAxis]);
        const overlapMax = Math.min(b1.max[otherAxis], b2.max[otherAxis]);
        if (overlapMax - overlapMin <= eps) {
          hasOverlap = false;
          break;
        }
      }

      if (!hasOverlap) continue;

      // Found face-adjacency along this axis
      const coordinate = touchMax1Min2 ? b1.max[axis] : b2.max[axis];
      const chunk1Side = touchMax1Min2 ? 'max' : 'min';
      const chunk2Side = touchMax1Min2 ? 'min' : 'max';

      return { axis, coordinate, chunk1Side, chunk2Side };
    }

    return null;
  }

  /**
   * Stitch borders between chunks to prevent cracks.
   *
   * For each high-LOD boundary vertex, we compute a target position by
   * interpolating among the low-LOD boundary vertices and snap the
   * high-LOD vertex to that position.  This creates a seamless
   * transition between LOD levels.
   */
  protected stitchChunkBorders(lowLODChunk: LODChunk, highLODChunk: LODChunk): void {
    const boundary = this.getSharedBoundary(lowLODChunk, highLODChunk);
    if (!boundary) return;

    // Collect boundary vertices from both chunks
    const lowBoundaryVerts = this.getBoundaryVertices(
      lowLODChunk, boundary.axis, boundary.coordinate, boundary.chunk1Side
    );
    const highBoundaryVerts = this.getBoundaryVertices(
      highLODChunk, boundary.axis, boundary.coordinate, boundary.chunk2Side
    );

    if (lowBoundaryVerts.length === 0 || highBoundaryVerts.length === 0) return;

    // Snap each high-LOD boundary vertex to the interpolated low-LOD position
    const highPosAttr = highLODChunk.geometry.getAttribute('position');

    for (const { index: highIdx } of highBoundaryVerts) {
      const highPos = new Vector3(
        highPosAttr.getX(highIdx),
        highPosAttr.getY(highIdx),
        highPosAttr.getZ(highIdx)
      );

      const targetPos = this.interpolateBoundaryPosition(
        highPos, lowBoundaryVerts, boundary.axis
      );

      highPosAttr.setXYZ(highIdx, targetPos.x, targetPos.y, targetPos.z);
    }

    highPosAttr.needsUpdate = true;
    highLODChunk.geometry.computeVertexNormals();
    highLODChunk.needsUpdate = true;
  }

  /**
   * Find all vertices of a chunk's geometry that lie on a given boundary face.
   *
   * A vertex is on the boundary face when its coordinate along `axis`
   * is approximately equal to `coordinate`, and its tangent-space
   * coordinates fall within the chunk's bounds on the other two axes.
   */
  protected getBoundaryVertices(
    chunk: LODChunk,
    axis: 'x' | 'y' | 'z',
    coordinate: number,
    _side: 'min' | 'max'
  ): { index: number; position: Vector3 }[] {
    const positions = chunk.geometry.getAttribute('position');
    const boundaryVerts: { index: number; position: Vector3 }[] = [];

    // Relative tolerance based on chunk size
    const size = new Vector3();
    chunk.bounds.getSize(size);
    const eps = Math.max(size.x, size.y, size.z) * 1e-3;

    const tangentAxes = (['x', 'y', 'z'] as const).filter(a => a !== axis);

    for (let i = 0; i < positions.count; i++) {
      const pos = new Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );

      // Vertex must lie on the boundary face
      if (Math.abs(pos[axis] - coordinate) < eps) {
        // Also verify the vertex is within the chunk's extent on tangent axes
        const withinBounds = tangentAxes.every(ta =>
          pos[ta] >= chunk.bounds.min[ta] - eps &&
          pos[ta] <= chunk.bounds.max[ta] + eps
        );

        if (withinBounds) {
          boundaryVerts.push({ index: i, position: pos });
        }
      }
    }

    return boundaryVerts;
  }

  /**
   * Compute the target position for a high-LOD boundary vertex by
   * interpolating among low-LOD boundary vertices.
   *
   * Strategy:
   * 1. Project positions onto the tangent plane (the 2D plane of the
   *    shared face, ignoring the boundary axis).
   * 2. If the high-LOD vertex coincides with a low-LOD vertex in tangent
   *    space, snap directly.
   * 3. Otherwise, use inverse-distance-weighted interpolation among the
   *    K=4 nearest low-LOD vertices to compute a smooth target position.
   */
  protected interpolateBoundaryPosition(
    highPos: Vector3,
    lowBoundaryVerts: { position: Vector3 }[],
    axis: 'x' | 'y' | 'z'
  ): Vector3 {
    const tangentAxes = (['x', 'y', 'z'] as const).filter(a => a !== axis);
    const snapEps = 1e-4;

    // Compute tangent-space distances to every low-LOD boundary vertex
    const candidates: { tangentDist: number; position: Vector3 }[] = [];

    for (const { position: lowPos } of lowBoundaryVerts) {
      const dx = highPos[tangentAxes[0]] - lowPos[tangentAxes[0]];
      const dy = highPos[tangentAxes[1]] - lowPos[tangentAxes[1]];
      const tangentDist = Math.sqrt(dx * dx + dy * dy);

      // Exact match in tangent space → snap directly
      if (tangentDist < snapEps) {
        return lowPos.clone();
      }

      candidates.push({ tangentDist, position: lowPos });
    }

    // Sort by tangent-space distance and use IDW with K nearest neighbours
    candidates.sort((a, b) => a.tangentDist - b.tangentDist);
    const K = Math.min(4, candidates.length);

    let totalWeight = 0;
    const result = new Vector3(0, 0, 0);

    for (let i = 0; i < K; i++) {
      // Inverse-distance weight (power parameter p = 2)
      const weight = 1 / (candidates[i].tangentDist * candidates[i].tangentDist);
      result.addScaledVector(candidates[i].position, weight);
      totalWeight += weight;
    }

    result.divideScalar(totalWeight);
    return result;
  }

  /**
   * Get all visible geometries for rendering
   */
  public getVisibleGeometries(): BufferGeometry[] {
    return this.activeChunks
      .filter(chunk => chunk.visible)
      .map(chunk => chunk.geometry);
  }

  /**
   * Update chunk geometries marked as needing update
   */
  public updatePendingChunks(kernels: SDFKernel[]): void {
    for (const chunk of this.activeChunks) {
      if (chunk.needsUpdate && chunk.parent) {
        const resolution = this.calculateResolution(chunk.lodLevel);
        chunk.geometry = this.generateChunkGeometry(kernels, chunk.bounds, resolution, chunk.lodLevel);
        chunk.needsUpdate = false;
      }
    }
  }
}
