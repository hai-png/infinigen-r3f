/**
 * Geometry Types - Core geometry type definitions for the node system
 * 
 * Provides the Geometry type and related interfaces used by
 * input/output nodes and geometry processing nodes.
 */

import * as THREE from 'three';

/**
 * Geometry representation in the node system
 */
export interface Geometry {
  /** The underlying Three.js buffer geometry */
  mesh: THREE.BufferGeometry;
  /** Material references */
  materials: THREE.Material[];
  /** World transform */
  transform: THREE.Matrix4;
  /** Bounding box */
  bounds: THREE.Box3;
  /** Geometry type identifier */
  type: GeometryType;
  /** UV layers */
  uvLayers: Map<string, Float32Array>;
  /** Vertex color layers */
  colorLayers: Map<string, Float32Array>;
  /** Custom attribute layers */
  customAttributes: Map<string, { data: Float32Array; size: number }>;
}

/**
 * Geometry type enumeration
 */
export enum GeometryType {
  Mesh = 'mesh',
  Curve = 'curve',
  PointCloud = 'pointCloud',
  Volume = 'volume',
  Instanced = 'instanced',
}

/**
 * Geometry statistics for LOD and optimization decisions
 */
export interface GeometryStats {
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  edgeCount: number;
  boundingBox: THREE.Box3;
  boundingSphere: THREE.Sphere;
  memoryUsage: number;
}

/**
 * Create a default empty geometry
 */
export function createEmptyGeometry(): Geometry {
  return {
    mesh: new THREE.BufferGeometry(),
    materials: [],
    transform: new THREE.Matrix4(),
    bounds: new THREE.Box3(),
    type: GeometryType.Mesh,
    uvLayers: new Map(),
    colorLayers: new Map(),
    customAttributes: new Map(),
  };
}
