/**
 * MeshOptimizer.ts
 * 
 * Post-processing mesh optimization including decimation, 
 * normal smoothing, and topology improvement.
 * 
 * Based on original Infinigen's mesh optimization pipeline.
 */

import { BufferGeometry, Vector3, Vector2 } from 'three';

export interface OptimizationConfig {
  targetFaceCount: number;
  aggressiveDecimation: boolean;
  preserveBoundaries: boolean;
  smoothNormals: boolean;
  normalSmoothingAngle: number;
  removeDegenerateFaces: boolean;
  weldVertices: boolean;
  weldThreshold: number;
}

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  targetFaceCount: 10000,
  aggressiveDecimation: false,
  preserveBoundaries: true,
  smoothNormals: true,
  normalSmoothingAngle: 30,
  removeDegenerateFaces: true,
  weldVertices: true,
  weldThreshold: 0.0001,
};

interface Face {
  indices: [number, number, number];
  normal: Vector3;
  area: number;
}

interface Vertex {
  position: Vector3;
  normal: Vector3;
  uv: Vector2 | null;
  faces: number[];
}

/**
 * Optimizes terrain meshes for performance and quality
 */
export class MeshOptimizer {
  private config: OptimizationConfig;

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
  }

  /**
   * Apply full optimization pipeline to geometry
   */
  optimize(geometry: BufferGeometry): BufferGeometry {
    let optimizedGeom = geometry.clone();

    // Step 1: Remove degenerate faces
    if (this.config.removeDegenerateFaces) {
      optimizedGeom = this.removeDegenerateFaces(optimizedGeom);
    }

    // Step 2: Weld vertices
    if (this.config.weldVertices) {
      optimizedGeom = this.weldVertices(optimizedGeom);
    }

    // Step 3: Decimate if needed
    const faceCount = optimizedGeom.index 
      ? optimizedGeom.index.count / 3 
      : optimizedGeom.getAttribute('position').count / 3;
    
    if (faceCount > this.config.targetFaceCount) {
      optimizedGeom = this.decimate(optimizedGeom);
    }

    // Step 4: Smooth normals
    if (this.config.smoothNormals) {
      optimizedGeom = this.smoothNormals(optimizedGeom);
    }

    return optimizedGeom;
  }

  /**
   * Remove degenerate (zero-area) faces
   */
  private removeDegenerateFaces(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();

    if (!index) return geometry;

    const validIndices: number[] = [];
    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const cross = new Vector3();

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      v0.fromBufferAttribute(positions, a);
      v1.fromBufferAttribute(positions, b);
      v2.fromBufferAttribute(positions, c);

      edge1.subVectors(v1, v0);
      edge2.subVectors(v2, v0);
      cross.crossVectors(edge1, edge2);

      // Keep face if area is significant
      if (cross.length() > 1e-6) {
        validIndices.push(a, b, c);
      }
    }

    const newIndex = new Uint32Array(validIndices);
    const newGeometry = geometry.clone();
    // @ts-ignore - BufferGeometry.setIndex typing
    newGeometry.setIndex(newIndex);
    
    return newGeometry;
  }

  /**
   * Weld nearby vertices together
   */
  private weldVertices(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const index = geometry.getIndex();

    const vertexMap = new Map<string, number>();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndex: number[] = [];

    const tempVec = new Vector3();
    const tempNormal = new Vector3();
    const tempUV = new Vector2();

    for (let i = 0; i < positions.count; i++) {
      tempVec.fromBufferAttribute(positions, i);
      
      // Create hash key from position
      const key = `${Math.round(tempVec.x / this.config.weldThreshold)},${
        Math.round(tempVec.y / this.config.weldThreshold)
      },${Math.round(tempVec.z / this.config.weldThreshold)}`;

      if (!vertexMap.has(key)) {
        // New unique vertex
        const newIndex = newPositions.length / 3;
        vertexMap.set(key, newIndex);

        newPositions.push(tempVec.x, tempVec.y, tempVec.z);

        if (normals) {
          tempNormal.fromBufferAttribute(normals, i);
          newNormals.push(tempNormal.x, tempNormal.y, tempNormal.z);
        }

        if (uvs) {
          tempUV.fromBufferAttribute(uvs, i);
          newUvs.push(tempUV.x, tempUV.y);
        }
      }
    }

    // Remap indices
    if (index) {
      for (let i = 0; i < index.count; i++) {
        const oldIdx = index.getX(i);
        const tempVec2 = new Vector3().fromBufferAttribute(positions, oldIdx);
        const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${
          Math.round(tempVec2.y / this.config.weldThreshold)
        },${Math.round(tempVec2.z / this.config.weldThreshold)}`;
        
        newIndex.push(vertexMap.get(key)!);
      }
    } else {
      for (let i = 0; i < positions.count; i++) {
        const tempVec2 = new Vector3().fromBufferAttribute(positions, i);
        const key = `${Math.round(tempVec2.x / this.config.weldThreshold)},${
          Math.round(tempVec2.y / this.config.weldThreshold)
        },${Math.round(tempVec2.z / this.config.weldThreshold)}`;
        
        newIndex.push(vertexMap.get(key)!);
      }
    }

    const newGeometry = new BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
    
    if (newNormals.length > 0) {
      newGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newNormals), 3));
    }
    
    if (newUvs.length > 0) {
      newGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(newUvs), 2));
    }
    
    newGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndex), 1));
    newGeometry.computeVertexNormals();

    return newGeometry;
  }

  /**
   * Simplify mesh through edge collapse decimation
   */
  private decimate(geometry: BufferGeometry): BufferGeometry {
    // Simplified quadric error metric decimation
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();

    if (!index) return geometry;

    const targetFaces = Math.min(
      this.config.targetFaceCount,
      index.count / 3
    );

    // For now, use progressive sampling approach
    // In production, implement full QEM decimation
    const sampleRate = targetFaces / (index.count / 3);
    
    const keptIndices: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      if (Math.random() < sampleRate) {
        keptIndices.push(
          index.getX(i),
          index.getX(i + 1),
          index.getX(i + 2)
        );
      }
    }

    if (keptIndices.length === 0) {
      // Ensure at least some faces remain
      for (let i = 0; i < Math.min(index.count, targetFaces * 3); i += 3) {
        keptIndices.push(
          index.getX(i),
          index.getX(i + 1),
          index.getX(i + 2)
        );
      }
    }

    const newGeometry = geometry.clone();
    const newIndex = new Uint32Array(keptIndices);
    // @ts-ignore - BufferGeometry.setIndex typing
    newGeometry.setIndex(newIndex);
    
    return newGeometry;
  }

  /**
   * Smooth vertex normals based on adjacent face normals
   */
  private smoothNormals(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex();
    
    if (!index) {
      geometry.computeVertexNormals();
      return geometry;
    }

    const normals = geometry.getAttribute('normal');
    const newNormals = new Float32Array(normals.count * 3);
    
    const faceNormals: Vector3[] = [];
    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();

    // Calculate face normals
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      v0.fromBufferAttribute(positions, a);
      v1.fromBufferAttribute(positions, b);
      v2.fromBufferAttribute(positions, c);

      edge1.subVectors(v1, v0);
      edge2.subVectors(v2, v0);
      
      const normal = new Vector3().crossVectors(edge1, edge2).normalize();
      faceNormals.push(normal);
    }

    // Accumulate normals per vertex
    const vertexNormals = new Array<Vector3>(positions.count);
    for (let i = 0; i < positions.count; i++) {
      vertexNormals[i] = new Vector3();
    }

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const faceNormal = faceNormals[i / 3];

      vertexNormals[a].add(faceNormal);
      vertexNormals[b].add(faceNormal);
      vertexNormals[c].add(faceNormal);
    }

    // Normalize and apply angle-based smoothing
    for (let i = 0; i < positions.count; i++) {
      const normal = vertexNormals[i];
      if (normal.length() > 0) {
        normal.normalize();
        
        // Optional: limit smoothing based on angle threshold
        if (this.config.normalSmoothingAngle < 180) {
          // Could implement angle-based limiting here
        }
        
        newNormals[i * 3] = normal.x;
        newNormals[i * 3 + 1] = normal.y;
        newNormals[i * 3 + 2] = normal.z;
      }
    }

    const newGeometry = geometry.clone();
    newGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newNormals), 3));
    
    return newGeometry;
  }

  /**
   * Update optimization configuration
   */
  setConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): OptimizationConfig {
    return { ...this.config };
  }
}

export default MeshOptimizer;
