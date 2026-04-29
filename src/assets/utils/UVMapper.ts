/**
 * UVMapper - Utilities for UV mapping and texture coordinate generation
 * Provides automatic UV unwrapping and mapping utilities
 */

import { BufferGeometry, Vector2, Vector3, Box3 } from 'three';

export class UVMapper {
  /**
   * Generate planar UV coordinates for a geometry
   */
  static generatePlanarUVs(geometry: BufferGeometry, axis: 'x' | 'y' | 'z' = 'z'): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const uvs: number[] = [];

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position);
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

    geometry.setAttribute('uv', new Float32Array(uvs));
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
        // Use normals for spherical mapping
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];

        u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
        v = 0.5 - Math.asin(ny) / Math.PI;
      } else {
        // Fallback to position-based mapping
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
        v = 0.5 - Math.asin(y / Math.sqrt(x * x + y * y + z * z)) / Math.PI;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32Array(uvs));
    return geometry;
  }

  /**
   * Generate cylindrical UV coordinates for a geometry
   */
  static generateCylindricalUVs(geometry: BufferGeometry, axis: 'x' | 'y' | 'z' = 'y'): BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const uvs: number[] = [];

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position);
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

    geometry.setAttribute('uv', new Float32Array(uvs));
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
      // Fallback to planar mapping if no normals
      return this.generatePlanarUVs(geometry, 'z');
    }

    const box = new Box3();
    box.setFromBufferAttribute(geometry.attributes.position);
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
        // X-axis projection
        u = (nz + 1) / 2;
        v = (ny + 1) / 2;
      } else if (absY > absX && absY > absZ) {
        // Y-axis projection
        u = (nx + 1) / 2;
        v = (nz + 1) / 2;
      } else {
        // Z-axis projection
        u = (nx + 1) / 2;
        v = (ny + 1) / 2;
      }

      uvs.push(u, v);
    }

    geometry.setAttribute('uv', new Float32Array(uvs));
    return geometry;
  }

  /**
   * Auto-generate appropriate UV coordinates based on geometry type
   */
  static autoGenerateUVs(geometry: BufferGeometry): BufferGeometry {
    // Check if geometry already has UVs
    if (geometry.attributes.uv) {
      return geometry;
    }

    // Simple heuristic: use spherical for round objects, box for others
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
}

export default UVMapper;
