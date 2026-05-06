/**
 * UVMapper - Utilities for UV mapping and texture coordinate generation
 *
 * Provides automatic UV unwrapping and mapping utilities:
 * - Basic projections: planar, spherical, cylindrical, box
 * - Smart-project: box projection with per-face island detection, stretch
 *   minimization, and efficient island packing
 * - Island packing: bin-packing algorithm for efficient UV space utilization
 */

import * as THREE from 'three';
import { BufferGeometry, BufferAttribute, Float32BufferAttribute, Vector2, Vector3, Box3, Matrix3 } from 'three';

// ============================================================================
// Types
// ============================================================================

export interface SmartProjectOptions {
  /** Angle threshold (in degrees) for grouping faces into islands. Default: 35 */
  angleLimit: number;
  /** Padding between islands in UV space (0-1). Default: 0.02 */
  islandPadding: number;
  /** Whether to normalize islands to minimize stretching. Default: true */
  minimizeStretch: boolean;
  /** Whether to pack islands efficiently. Default: true */
  packIslands: boolean;
  /** UV area utilization target (0-1). Default: 0.8 */
  areaUtilization: number;
}

const DEFAULT_SMART_PROJECT_OPTIONS: SmartProjectOptions = {
  angleLimit: 35,
  islandPadding: 0.02,
  minimizeStretch: true,
  packIslands: true,
  areaUtilization: 0.8,
};

/** A UV island: a group of connected faces that share the same projection plane */
interface UVIsland {
  /** Triangle indices (in groups of 3) belonging to this island */
  faceIndices: number[];
  /** Dominant axis: 0=X, 1=Y, 2=Z */
  dominantAxis: number;
  /** Axis sign: +1 or -1 */
  axisSign: number;
  /** Bounding box of the island in 3D */
  bbox3D: Box3;
  /** Bounding box in UV space (after projection, before packing) */
  bboxUV: { minU: number; minV: number; maxU: number; maxV: number };
  /** UV offset for packing */
  offsetU: number;
  offsetV: number;
  /** UV scale for packing */
  scaleU: number;
  scaleV: number;
}

// ============================================================================
// UVMapper class
// ============================================================================

export class UVMapper {
  /**
   * Generate planar UV coordinates for a geometry
   */
  static generatePlanarUVs(geometry: BufferGeometry, axis: 'x' | 'y' | 'z' = 'z'): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const uvs: number[] = [];

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
    const size = box.getSize(new Vector3());

    for (let i = 0; i < positions.length; i += 3) {
      let u: number, v: number;

      switch (axis) {
        case 'x':
          u = (positions[i + 1] - box.min.y) / size.y;
          v = (positions[i + 2] - box.min.z) / size.z;
          break;
        case 'y':
          u = (positions[i] - box.min.x) / size.x;
          v = (positions[i + 2] - box.min.z) / size.z;
          break;
        case 'z':
        default:
          u = (positions[i] - box.min.x) / size.x;
          v = (positions[i + 1] - box.min.y) / size.y;
          break;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  /**
   * Generate spherical UV coordinates for a geometry
   */
  static generateSphericalUVs(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array | undefined;
    const uvs: number[] = [];

    for (let i = 0; i < positions.length; i += 3) {
      let u: number, v: number;

      if (normals) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];

        u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
        v = 0.5 - Math.asin(ny) / Math.PI;
      } else {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
        v = 0.5 - Math.asin(y / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  /**
   * Generate cylindrical UV coordinates for a geometry
   */
  static generateCylindricalUVs(geometry: BufferGeometry, axis: 'x' | 'y' | 'z' = 'y'): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const uvs: number[] = [];

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
    const size = box.getSize(new Vector3());

    for (let i = 0; i < positions.length; i += 3) {
      let u: number, v: number;
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      switch (axis) {
        case 'x':
          u = Math.atan2(z, y) / (2 * Math.PI) + 0.5;
          v = (x - box.min.x) / size.x;
          break;
        case 'y':
          u = Math.atan2(z, x) / (2 * Math.PI) + 0.5;
          v = (y - box.min.y) / size.y;
          break;
        case 'z':
          u = Math.atan2(y, x) / (2 * Math.PI) + 0.5;
          v = (z - box.min.z) / size.z;
          break;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  /**
   * Generate box UV coordinates for a geometry
   */
  static generateBoxUVs(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array | undefined;
    const uvs: number[] = [];

    if (!normals) {
      return this.generatePlanarUVs(geometry, 'z');
    }

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
    const size = box.getSize(new Vector3());

    for (let i = 0; i < positions.length; i += 3) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];

      const absX = Math.abs(nx);
      const absY = Math.abs(ny);
      const absZ = Math.abs(nz);

      let u: number, v: number;

      if (absX > absY && absX > absZ) {
        u = (nz + 1) / 2;
        v = (ny + 1) / 2;
      } else if (absY > absX && absY > absZ) {
        u = (nx + 1) / 2;
        v = (nz + 1) / 2;
      } else {
        u = (nx + 1) / 2;
        v = (ny + 1) / 2;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  /**
   * Auto-generate appropriate UV coordinates based on geometry type
   */
  static autoGenerateUVs(geometry: BufferGeometry): BufferGeometry {
    if (geometry.attributes.uv) {
      return geometry;
    }

    const name = geometry.name.toLowerCase();

    if (name.includes('sphere') || name.includes('ball')) {
      return this.generateSphericalUVs(geometry);
    } else if (name.includes('cylinder') || name.includes('tube')) {
      return this.generateCylindricalUVs(geometry, 'y');
    } else if (name.includes('box') || name.includes('cube')) {
      return this.generateBoxUVs(geometry);
    } else {
      return this.generatePlanarUVs(geometry, 'z');
    }
  }

  // =========================================================================
  // Smart Project — Box projection with island detection + packing
  // =========================================================================

  /**
   * Smart-project UV unwrapping algorithm.
   *
   * This is the recommended UV unwrapping method for meshes without existing UVs.
   * It works by:
   * 1. Computing face normals and grouping faces into islands based on the
   *    angle limit threshold (faces whose normals are within angleLimit degrees
   *    share the same projection plane).
   * 2. For each island, determining the dominant projection axis (the axis
   *    most aligned with the face normals) and projecting faces onto the
   *    perpendicular plane.
   * 3. Optionally minimizing stretching by normalizing each island's UV
   *    coordinates to fill the [0,1] range proportionally.
   * 4. Packing islands efficiently into UV space using a shelf-based bin
   *    packing algorithm.
   *
   * This is inspired by Blender's "Smart UV Project" but simplified for
   * WebGL-based use. It's not as sophisticated as Blender's conformal/ABF
   * unwrapping but produces usable UV maps for texture baking.
   */
  static smartProjectUVs(
    geometry: BufferGeometry,
    options: Partial<SmartProjectOptions> = {},
  ): BufferGeometry {
    const opts = { ...DEFAULT_SMART_PROJECT_OPTIONS, ...options };

    // Ensure geometry has normals
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Ensure geometry has an index buffer (needed for per-face processing)
    let index = geometry.index;
    let ownedIndex = false;
    if (!index) {
      // Create an index buffer from non-indexed geometry
      const posCount = geometry.attributes.position.count;
      const indices = new Uint32Array(posCount);
      for (let i = 0; i < posCount; i++) indices[i] = i;
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      index = geometry.index;
      ownedIndex = true;
    }

    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;
    const idxArray = index!.array as Uint32Array;
    const faceCount = idxArray.length / 3;

    if (faceCount === 0) {
      // Degenerate geometry: assign zero UVs
      const uvArray = new Float32Array(posAttr.count * 2);
      geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2));
      return geometry;
    }

    // Step 1: Compute face normals and determine dominant axis per face
    const faceNormals: Vector3[] = [];
    const faceAxes: { axis: number; sign: number }[] = [];

    for (let f = 0; f < faceCount; f++) {
      const i0 = idxArray[f * 3];
      const i1 = idxArray[f * 3 + 1];
      const i2 = idxArray[f * 3 + 2];

      const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      const edge1 = new Vector3().subVectors(v1, v0);
      const edge2 = new Vector3().subVectors(v2, v0);
      const normal = new Vector3().crossVectors(edge1, edge2).normalize();

      faceNormals.push(normal);

      // Find dominant axis
      const absX = Math.abs(normal.x);
      const absY = Math.abs(normal.y);
      const absZ = Math.abs(normal.z);

      if (absX >= absY && absX >= absZ) {
        faceAxes.push({ axis: 0, sign: normal.x > 0 ? 1 : -1 });
      } else if (absY >= absX && absY >= absZ) {
        faceAxes.push({ axis: 1, sign: normal.y > 0 ? 1 : -1 });
      } else {
        faceAxes.push({ axis: 2, sign: normal.z > 0 ? 1 : -1 });
      }
    }

    // Step 2: Group faces into islands using flood-fill
    // Two faces are in the same island if they share an edge and their
    // normals are within angleLimit degrees AND they share the same
    // dominant axis.
    const islandAssignment = new Int32Array(faceCount).fill(-1);
    const islands: UVIsland[] = [];
    const cosLimit = Math.cos((opts.angleLimit * Math.PI) / 180);

    // Build edge-to-face adjacency
    const edgeToFaces = new Map<string, number[]>();
    for (let f = 0; f < faceCount; f++) {
      const i0 = idxArray[f * 3];
      const i1 = idxArray[f * 3 + 1];
      const i2 = idxArray[f * 3 + 2];

      const edges = [
        this.edgeKey(i0, i1),
        this.edgeKey(i1, i2),
        this.edgeKey(i2, i0),
      ];

      for (const ek of edges) {
        let faces = edgeToFaces.get(ek);
        if (!faces) {
          faces = [];
          edgeToFaces.set(ek, faces);
        }
        faces.push(f);
      }
    }

    // Flood-fill to create islands
    let currentIsland = 0;
    for (let startFace = 0; startFace < faceCount; startFace++) {
      if (islandAssignment[startFace] !== -1) continue;

      const stack = [startFace];
      const axis = faceAxes[startFace].axis;
      const sign = faceAxes[startFace].sign;
      const normal = faceNormals[startFace];

      const faceIndices: number[] = [];

      while (stack.length > 0) {
        const f = stack.pop()!;
        if (islandAssignment[f] !== -1) continue;

        // Check if this face is compatible with the island
        const fAxis = faceAxes[f];
        const fNormal = faceNormals[f];
        const dot = fNormal.dot(normal);

        if (fAxis.axis !== axis || (fAxis.sign !== sign && dot < cosLimit)) continue;
        if (dot < cosLimit) continue;

        islandAssignment[f] = currentIsland;
        faceIndices.push(f);

        // Add neighboring faces
        const i0 = idxArray[f * 3];
        const i1 = idxArray[f * 3 + 1];
        const i2 = idxArray[f * 3 + 2];

        const edges = [
          this.edgeKey(i0, i1),
          this.edgeKey(i1, i2),
          this.edgeKey(i2, i0),
        ];

        for (const ek of edges) {
          const adjFaces = edgeToFaces.get(ek);
          if (adjFaces) {
            for (const af of adjFaces) {
              if (islandAssignment[af] === -1) {
                stack.push(af);
              }
            }
          }
        }
      }

      if (faceIndices.length > 0) {
        islands.push({
          faceIndices,
          dominantAxis: axis,
          axisSign: sign,
          bbox3D: new Box3(),
          bboxUV: { minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity },
          offsetU: 0,
          offsetV: 0,
          scaleU: 1,
          scaleV: 1,
        });
        currentIsland++;
      }
    }

    // Step 3: Project each island onto its dominant plane
    const uvArray = new Float32Array(posAttr.count * 2);

    // Initialize all UVs to center
    for (let i = 0; i < uvArray.length; i++) uvArray[i] = 0.5;

    // Compute 3D bounding box per island
    for (const island of islands) {
      for (const f of island.faceIndices) {
        for (let v = 0; v < 3; v++) {
          const vi = idxArray[f * 3 + v];
          const pos = new Vector3(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
          island.bbox3D.expandByPoint(pos);
        }
      }
    }

    // Project vertices per island
    for (const island of islands) {
      const axis = island.dominantAxis;
      const bbox = island.bbox3D;
      const size = new Vector3();
      bbox.getSize(size);

      // Choose the two non-dominant axes for UV
      let uAxis: number, vAxis: number;
      switch (axis) {
        case 0: uAxis = 2; vAxis = 1; break; // X-dominant: project onto ZY plane
        case 1: uAxis = 0; vAxis = 2; break; // Y-dominant: project onto XZ plane
        default: uAxis = 0; vAxis = 1; break; // Z-dominant: project onto XY plane
      }

      const uSize = Math.max(
        ['x', 'y', 'z'][uAxis] === 'x' ? size.x : ['x', 'y', 'z'][uAxis] === 'y' ? size.y : size.z,
        0.001,
      );
      const vSize = Math.max(
        ['x', 'y', 'z'][vAxis] === 'x' ? size.x : ['x', 'y', 'z'][vAxis] === 'y' ? size.y : size.z,
        0.001,
      );

      const uMin = ['x', 'y', 'z'][uAxis] === 'x' ? bbox.min.x : ['x', 'y', 'z'][uAxis] === 'y' ? bbox.min.y : bbox.min.z;
      const vMin = ['x', 'y', 'z'][vAxis] === 'x' ? bbox.min.x : ['x', 'y', 'z'][vAxis] === 'y' ? bbox.min.y : bbox.min.z;

      // Track per-island UV range for stretch minimization
      let islandMinU = Infinity, islandMinV = Infinity;
      let islandMaxU = -Infinity, islandMaxV = -Infinity;

      for (const f of island.faceIndices) {
        for (let v = 0; v < 3; v++) {
          const vi = idxArray[f * 3 + v];
          const px = posAttr.getX(vi);
          const py = posAttr.getY(vi);
          const pz = posAttr.getZ(vi);

          const coords = [px, py, pz];
          const uVal = (coords[uAxis] - uMin) / uSize;
          const vVal = (coords[vAxis] - vMin) / vSize;

          if (opts.minimizeStretch) {
            islandMinU = Math.min(islandMinU, uVal);
            islandMinV = Math.min(islandMinV, vVal);
            islandMaxU = Math.max(islandMaxU, uVal);
            islandMaxV = Math.max(islandMaxV, vVal);
          }

          uvArray[vi * 2] = uVal;
          uvArray[vi * 2 + 1] = vVal;
        }
      }

      // Normalize UVs within island for stretch minimization
      if (opts.minimizeStretch && islandMinU < islandMaxU && islandMinV < islandMaxV) {
        const rangeU = islandMaxU - islandMinU;
        const rangeV = islandMaxV - islandMinV;

        for (const f of island.faceIndices) {
          for (let vi = 0; vi < 3; vi++) {
            const idx = idxArray[f * 3 + vi];
            uvArray[idx * 2] = (uvArray[idx * 2] - islandMinU) / rangeU;
            uvArray[idx * 2 + 1] = (uvArray[idx * 2 + 1] - islandMinV) / rangeV;
          }
        }

        island.bboxUV = {
          minU: 0,
          minV: 0,
          maxU: 1,
          maxV: rangeV / rangeU, // Maintain aspect ratio
        };
      } else {
        island.bboxUV = {
          minU: islandMinU,
          minV: islandMinV,
          maxU: islandMaxU,
          maxV: islandMaxV,
        };
      }
    }

    // Step 4: Pack islands into UV space
    if (opts.packIslands && islands.length > 0) {
      this.packIslandsShelf(islands, opts.islandPadding, opts.areaUtilization);

      // Apply packing transforms to UV coordinates
      for (const island of islands) {
        for (const f of island.faceIndices) {
          for (let j = 0; j < 3; j++) {
            const vi = idxArray[f * 3 + j];
            const origU = uvArray[vi * 2];
            const origV = uvArray[vi * 2 + 1];

            // Transform: subtract island origin, scale, then offset
            const uPacked = (origU - island.bboxUV.minU) * island.scaleU + island.offsetU;
            const vPacked = (origV - island.bboxUV.minV) * island.scaleV + island.offsetV;

            uvArray[vi * 2] = uPacked;
            uvArray[vi * 2 + 1] = vPacked;
          }
        }
      }
    } else {
      // No packing: just scale all islands into [0,1] with padding
      const padding = opts.islandPadding;
      for (const island of islands) {
        for (const f of island.faceIndices) {
          for (let j = 0; j < 3; j++) {
            const vi = idxArray[f * 3 + j];
            uvArray[vi * 2] = uvArray[vi * 2] * (1 - 2 * padding) + padding;
            uvArray[vi * 2 + 1] = uvArray[vi * 2 + 1] * (1 - 2 * padding) + padding;
          }
        }
      }
    }

    geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2));

    // Clean up temporary index if we created it
    if (ownedIndex) {
      geometry.setIndex(null);
    }

    return geometry;
  }

  // =========================================================================
  // Island packing — shelf-based bin packing
  // =========================================================================

  /**
   * Pack UV islands using a shelf-based bin packing algorithm.
   *
   * This sorts islands by height (tallest first), then places them on
   * "shelves" within the UV space, similar to how books are placed on shelves.
   * Each new island goes on the current shelf if it fits, otherwise a new
   * shelf is started.
   *
   * After packing, each island's offsetU/offsetV and scaleU/scaleV are set
   * so that applying the transform (u - bboxUV.minU) * scaleU + offsetU
   * maps the island into its packed position.
   */
  private static packIslandsShelf(
    islands: UVIsland[],
    padding: number,
    utilization: number,
  ): void {
    if (islands.length === 0) return;

    // Compute island sizes (in UV space)
    interface PackIsland {
      index: number;
      width: number;
      height: number;
      area: number;
    }

    const packIslands: PackIsland[] = islands.map((island, i) => {
      const w = Math.max(island.bboxUV.maxU - island.bboxUV.minU, 0.001);
      const h = Math.max(island.bboxUV.maxV - island.bboxUV.minV, 0.001);
      return { index: i, width: w, height: h, area: w * h };
    });

    // Sort by height descending (tallest islands first for shelf packing)
    packIslands.sort((a, b) => b.height - a.height);

    // Shelf-based packing
    let shelfY = padding;
    let shelfHeight = 0;
    let cursorX = padding;
    const totalWidth = 1.0;
    const totalHeight = 1.0;

    // First pass: compute scales to fit within [0,1] UV space
    // Calculate total area needed
    const totalArea = packIslands.reduce((sum, pi) => sum + pi.area, 0);
    const targetArea = totalWidth * totalHeight * utilization;
    const globalScale = Math.sqrt(targetArea / Math.max(totalArea, 0.0001));

    for (const pi of packIslands) {
      const island = islands[pi.index];
      const scaledWidth = pi.width * globalScale + padding;
      const scaledHeight = pi.height * globalScale + padding;

      // Does it fit on the current shelf?
      if (cursorX + scaledWidth > totalWidth - padding) {
        // Start a new shelf
        shelfY += shelfHeight;
        cursorX = padding;
        shelfHeight = 0;
      }

      // Check if we've exceeded vertical space
      if (shelfY + scaledHeight > totalHeight - padding) {
        // Scale everything down to fit
        // For simplicity, just clamp
        break;
      }

      // Place the island
      island.offsetU = cursorX + padding;
      island.offsetV = shelfY + padding;
      island.scaleU = globalScale;
      island.scaleV = globalScale;

      // Advance cursor
      cursorX += scaledWidth;
      shelfHeight = Math.max(shelfHeight, scaledHeight);
    }
  }

  // =========================================================================
  // Utility methods
  // =========================================================================

  /**
   * Create a canonical edge key from two vertex indices.
   * Ensures (a, b) and (b, a) produce the same key.
   */
  private static edgeKey(a: number, b: number): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  /**
   * Compute the aspect ratio of a geometry's bounding box.
   * Useful for choosing the right UV projection method.
   */
  static getGeometryAspectRatio(geometry: BufferGeometry): { x: number; y: number; z: number } {
    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    return {
      x: size.x / maxDim,
      y: size.y / maxDim,
      z: size.z / maxDim,
    };
  }

  /**
   * Recommend a UV projection method based on geometry shape.
   * Returns 'smart' for complex shapes, 'spherical' for round shapes,
   * 'cylindrical' for elongated shapes, and 'box' for box-like shapes.
   */
  static recommendProjection(geometry: BufferGeometry): 'smart' | 'spherical' | 'cylindrical' | 'box' | 'planar' {
    const ratio = this.getGeometryAspectRatio(geometry);

    // If one dimension is very small compared to others → planar
    if (ratio.x < 0.05 || ratio.y < 0.05 || ratio.z < 0.05) {
      return 'planar';
    }

    // If dimensions are similar → spherical or box
    const maxRatio = Math.max(ratio.x, ratio.y, ratio.z);
    const minRatio = Math.min(ratio.x, ratio.y, ratio.z);

    if (minRatio > 0.7) {
      // Roughly equal dimensions
      return 'smart';
    }

    // If one dimension is dominant → cylindrical
    if (maxRatio > 0.8 && minRatio < 0.4) {
      return 'cylindrical';
    }

    // Default to smart project
    return 'smart';
  }
}

export default UVMapper;
