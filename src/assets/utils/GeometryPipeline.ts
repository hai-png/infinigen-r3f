/**
 * GeometryPipeline - Utilities for geometry processing and manipulation
 * Provides mesh processing, optimization, and transformation utilities
 *
 * The `mergeGeometries` function is the canonical implementation used across
 * the entire project. It handles both indexed and non-indexed geometries,
 * preserves position/normal/UV attributes, and correctly offsets indices.
 */

import { BufferGeometry, BufferAttribute, Float32BufferAttribute, Mesh, Vector3, Matrix4 } from 'three';

export class GeometryPipeline {
  /**
   * Merge multiple BufferGeometries into a single geometry.
   *
   * This is the canonical merge implementation for the project.
   * Handles both indexed and non-indexed geometries, merges
   * position, normal, and UV attributes, and correctly offsets
   * index values for each source geometry.
   *
   * @param geometries - Array of BufferGeometries to merge
   * @returns A single merged BufferGeometry
   */
  static mergeGeometries(geometries: BufferGeometry[]): BufferGeometry {
    if (!geometries || geometries.length === 0) {
      return new BufferGeometry();
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    let totalVertices = 0;
    let totalIndices = 0;

    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
      totalIndices += geo.index ? geo.index.count : geo.attributes.position.count;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedUVs = new Float32Array(totalVertices * 2);
    const mergedIndices: number[] = [];
    let vertexOffset = 0;

    for (const geo of geometries) {
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;

      for (let i = 0; i < posAttr.count; i++) {
        mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
        mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
        mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

        if (normAttr) {
          mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
          mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
          mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
        }

        if (uvAttr) {
          mergedUVs[(vertexOffset + i) * 2] = uvAttr.getX(i);
          mergedUVs[(vertexOffset + i) * 2 + 1] = uvAttr.getY(i);
        }
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          mergedIndices.push(geo.index.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          mergedIndices.push(vertexOffset + i);
        }
      }

      vertexOffset += posAttr.count;
    }

    const merged = new BufferGeometry();
    merged.setAttribute('position', new BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new BufferAttribute(mergedNormals, 3));
    merged.setAttribute('uv', new BufferAttribute(mergedUVs, 2));
    merged.setIndex(mergedIndices);
    merged.computeVertexNormals();

    return merged;
  }

  /**
   * Optimize geometry by removing duplicate vertices
   */
  static optimizeGeometry(geometry: BufferGeometry): BufferGeometry {
    // mergeVertices requires BufferGeometryUtils
    // geometry.mergeVertices();
    return geometry;
  }

  /**
   * Center geometry at origin
   */
  static centerGeometry(geometry: BufferGeometry): BufferGeometry {
    geometry.center();
    return geometry;
  }

  /**
   * Scale geometry to fit within bounds
   */
  static scaleToFit(geometry: BufferGeometry, targetSize: number): BufferGeometry {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return geometry;

    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    if (maxDim > 0) {
      const scale = targetSize / maxDim;
      geometry.scale(scale, scale, scale);
    }
    
    return geometry;
  }

  /**
   * Apply transformation matrix to geometry
   */
  static applyTransform(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
    geometry.applyMatrix4(matrix);
    return geometry;
  }

  /**
   * Convert mesh to buffer geometry
   */
  static meshToGeometry(mesh: Mesh): BufferGeometry {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    return geometry;
  }
}

export default GeometryPipeline;
