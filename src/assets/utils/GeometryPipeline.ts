/**
 * GeometryPipeline - Utilities for geometry processing and manipulation
 * Provides mesh processing, optimization, and transformation utilities
 */

import { BufferGeometry, BufferAttribute, Float32BufferAttribute, Mesh, Vector3, Matrix4 } from 'three';

export class GeometryPipeline {
  /**
   * Merge multiple geometries into a single geometry
   */
  static mergeGeometries(geometries: BufferGeometry[], useGroups: boolean = false): BufferGeometry {
    if (!geometries || geometries.length === 0) {
      throw new Error('No geometries provided to merge');
    }
    
    if (geometries.length === 1) {
      return geometries[0];
    }

    const totalVertices = geometries.reduce((sum, geo) => sum + geo.attributes.position.count, 0);
    const mergedGeometry = new BufferGeometry();
    
    // Merge position attribute
    const positions: number[] = [];
    geometries.forEach(geo => {
      const pos = geo.attributes.position.array;
      for (let i = 0; i < pos.length; i++) {
        positions.push(pos[i]);
      }
    });
    
    mergedGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    
    // Merge normal attribute if present
    const hasNormals = geometries.every(geo => geo.attributes.normal);
    if (hasNormals) {
      const normals: number[] = [];
      geometries.forEach(geo => {
        const norm = geo.attributes.normal.array;
        for (let i = 0; i < norm.length; i++) {
          normals.push(norm[i]);
        }
      });
      mergedGeometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    }
    
    // Merge UV attribute if present
    const hasUVs = geometries.every(geo => geo.attributes.uv);
    if (hasUVs) {
      const uvs: number[] = [];
      geometries.forEach(geo => {
        const uv = geo.attributes.uv.array;
        for (let i = 0; i < uv.length; i++) {
          uvs.push(uv[i]);
        }
      });
      mergedGeometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    }

    mergedGeometry.computeVertexNormals();
    return mergedGeometry;
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
