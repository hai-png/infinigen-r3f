/**
 * Mesh Edit Nodes - Geometry editing operations
 * Based on Blender's mesh editing nodes
 * 
 * @module nodes/geometry
 */

import { BufferGeometry, Vector3, Matrix4, Box3 } from 'three';
import { Node, NodeSocket, NodeDefinition } from '../core/types';
import { NodeTypes } from '../core/node-types';

/**
 * ExtrudeMesh Node
 * Extrudes faces along their normals or a specified direction
 */
export interface ExtrudeMeshNode extends Node {
  type: NodeTypes.ExtrudeMesh;
  inputs: {
    Mesh: NodeSocket<BufferGeometry>;
    OffsetScale: NodeSocket<number>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    offset: number;
    individual: boolean;
  };
}

export const ExtrudeMeshDefinition: NodeDefinition = {
  type: NodeTypes.ExtrudeMesh,
  label: 'Extrude Mesh',
  category: 'Geometry',
  inputs: [
    { name: 'Mesh', type: 'GEOMETRY', required: true },
    { name: 'Offset Scale', type: 'FLOAT', default: 1.0 },
  ],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    offset: { type: 'float', default: 1.0, min: -10, max: 10 },
    individual: { type: 'bool', default: false },
  },
};

/**
 * Execute ExtrudeMesh node
 * Extrudes each face along its normal
 */
export function executeExtrudeMesh(node: ExtrudeMeshNode, inputMesh: BufferGeometry): BufferGeometry {
  const positions = inputMesh.attributes.position.array as Float32Array;
  const normals = inputMesh.attributes.normal?.array as Float32Array | undefined;
  
  if (!normals) {
    // Compute normals if not present
    const tempGeom = inputMesh.clone();
    tempGeom.computeVertexNormals();
    return executeExtrudeMesh(node, tempGeom);
  }
  
  const offset = node.params.offset || 1.0;
  const vertexCount = positions.length / 3;
  const faceCount = vertexCount / 3;
  
  // Create new positions array (double the vertices for extrusion)
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  
  // For each face (triangle)
  for (let f = 0; f < faceCount; f++) {
    const baseIndex = f * 9; // 3 vertices * 3 components
    
    // Get face normal (average of vertex normals)
    const faceNormal = new Vector3(
      (normals[baseIndex] + normals[baseIndex + 3] + normals[baseIndex + 6]) / 3,
      (normals[baseIndex + 1] + normals[baseIndex + 4] + normals[baseIndex + 7]) / 3,
      (normals[baseIndex + 2] + normals[baseIndex + 5] + normals[baseIndex + 8]) / 3
    ).normalize();
    
    // Add original vertices
    for (let i = 0; i < 9; i++) {
      newPositions.push(positions[baseIndex + i]);
      newNormals.push(normals[baseIndex + i]);
    }
    
    // Add extruded vertices
    for (let v = 0; v < 3; v++) {
      const vi = baseIndex + v * 3;
      newPositions.push(
        positions[vi] + faceNormal.x * offset,
        positions[vi + 1] + faceNormal.y * offset,
        positions[vi + 2] + faceNormal.z * offset
      );
      newNormals.push(normals[vi], normals[vi + 1], normals[vi + 2]);
    }
  }
  
  // Create side faces (connect original and extruded vertices)
  const sidePositions: number[] = [];
  const sideNormals: number[] = [];
  
  for (let f = 0; f < faceCount; f++) {
    const baseOrig = f * 9;
    const baseExtr = faceCount * 9 + f * 9;
    
    // For each edge of the triangle
    for (let e = 0; e < 3; e++) {
      const v1_orig = baseOrig + e * 3;
      const v2_orig = baseOrig + ((e + 1) % 3) * 3;
      const v1_extr = baseExtr + e * 3;
      const v2_extr = baseExtr + ((e + 1) % 3) * 3;
      
      // Calculate edge normal
      const p1 = new Vector3(positions[v1_orig], positions[v1_orig + 1], positions[v1_orig + 2]);
      const p2 = new Vector3(positions[v2_orig], positions[v2_orig + 1], positions[v2_orig + 2]);
      const edgeDir = new Vector3().subVectors(p2, p1).normalize();
      
      // Side face normal (perpendicular to edge and extrusion direction)
      const sideNormal = new Vector3().crossVectors(edgeDir, new Vector3(0, 1, 0)).normalize();
      
      // Add two triangles for the quad side face
      // Triangle 1: v1_orig, v2_orig, v1_extr
      sidePositions.push(
        positions[v1_orig], positions[v1_orig + 1], positions[v1_orig + 2],
        positions[v2_orig], positions[v2_orig + 1], positions[v2_orig + 2],
        positions[v1_orig] + (newPositions[baseExtr + 0] - positions[v1_orig]),
        positions[v1_orig + 1] + (newPositions[baseExtr + 1] - positions[v1_orig + 1]),
        positions[v1_orig + 2] + (newPositions[baseExtr + 2] - positions[v1_orig + 2])
      );
      
      for (let i = 0; i < 3; i++) {
        sideNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
      }
      
      // Triangle 2: v2_orig, v2_extr, v1_extr
      sidePositions.push(
        positions[v2_orig], positions[v2_orig + 1], positions[v2_orig + 2],
        positions[v2_orig] + (newPositions[baseExtr + 3] - positions[v2_orig]),
        positions[v2_orig + 1] + (newPositions[baseExtr + 4] - positions[v2_orig + 1]),
        positions[v2_orig + 2] + (newPositions[baseExtr + 5] - positions[v2_orig + 2]),
        positions[v1_orig] + (newPositions[baseExtr + 0] - positions[v1_orig]),
        positions[v1_orig + 1] + (newPositions[baseExtr + 1] - positions[v1_orig + 1]),
        positions[v1_orig + 2] + (newPositions[baseExtr + 2] - positions[v1_orig + 2])
      );
      
      for (let i = 0; i < 3; i++) {
        sideNormals.push(sideNormal.x, sideNormal.y, sideNormal.z);
      }
    }
  }
  
  // Combine all positions
  const finalPositions = [...newPositions, ...sidePositions];
  const finalNormals = [...newNormals, ...sideNormals];
  
  const newGeometry = new BufferGeometry();
  newGeometry.setAttribute('position', new Float32Array(finalPositions) as any);
  newGeometry.setAttribute('normal', new Float32Array(finalNormals) as any);
  
  return newGeometry;
}

/**
 * Triangulate Node
 * Converts polygons to triangles
 */
export interface TriangulateNode extends Node {
  type: NodeTypes.Triangulate;
  inputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    minVertices: number;
    maxVertices: number;
  };
}

export const TriangulateDefinition: NodeDefinition = {
  type: NodeTypes.Triangulate,
  label: 'Triangulate',
  category: 'Geometry',
  inputs: [{ name: 'Mesh', type: 'GEOMETRY', required: true }],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    minVertices: { type: 'int', default: 3, min: 3 },
    maxVertices: { type: 'int', default: 3, min: 3 },
  },
};

/**
 * Execute Triangulate node
 * Ensures mesh is fully triangulated
 */
export function executeTriangulate(node: TriangulateNode, inputMesh: BufferGeometry): BufferGeometry {
  // Three.js BufferGeometry is typically already triangulated
  // This ensures proper triangulation if needed
  const geometry = inputMesh.clone();
  geometry.index = null; // Convert to non-indexed for simplicity
  
  // Ensure position attribute length is divisible by 9 (3 vertices * 3 components)
  const positions = geometry.attributes.position.array as Float32Array;
  const remainder = positions.length % 9;
  
  if (remainder !== 0) {
    // Pad with zeros or remove incomplete face
    const newLength = positions.length - remainder;
    const newArray = new Float32Array(newLength);
    newArray.set(positions.slice(0, newLength));
    geometry.setAttribute('position', newArray as any);
  }
  
  return geometry;
}

/**
 * MergeByDistance Node
 * Merges vertices that are within a specified distance
 */
export interface MergeByDistanceNode extends Node {
  type: NodeTypes.MergeByDistance;
  inputs: {
    Mesh: NodeSocket<BufferGeometry>;
    Distance: NodeSocket<number>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    distance: number;
  };
}

export const MergeByDistanceDefinition: NodeDefinition = {
  type: NodeTypes.MergeByDistance,
  label: 'Merge By Distance',
  category: 'Geometry',
  inputs: [
    { name: 'Mesh', type: 'GEOMETRY', required: true },
    { name: 'Distance', type: 'FLOAT', default: 0.001 },
  ],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    distance: { type: 'float', default: 0.001, min: 0, max: 1 },
  },
};

/**
 * Execute MergeByDistance node
 * Removes duplicate vertices within threshold distance
 */
export function executeMergeByDistance(node: MergeByDistanceNode, inputMesh: BufferGeometry): BufferGeometry {
  const positions = inputMesh.attributes.position.array as Float32Array;
  const distance = node.params.distance || 0.001;
  const distanceSquared = distance * distance;
  
  // Map to track unique vertices
  const vertexMap = new Map<string, number>();
  const newPositions: number[] = [];
  const indexMapping: number[] = [];
  
  function getVertexKey(x: number, y: number, z: number): string {
    // Quantize coordinates to grid for hashing
    const grid = distance / 2;
    const qx = Math.round(x / grid);
    const qy = Math.round(y / grid);
    const qz = Math.round(z / grid);
    return `${qx},${qy},${qz}`;
  }
  
  let newIndex = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    const key = getVertexKey(x, y, z);
    let found = false;
    
    // Check nearby vertices in map
    if (vertexMap.has(key)) {
      const existingIndex = vertexMap.get(key)!;
      const ex = newPositions[existingIndex * 3];
      const ey = newPositions[existingIndex * 3 + 1];
      const ez = newPositions[existingIndex * 3 + 2];
      
      const dx = x - ex;
      const dy = y - ey;
      const dz = z - ez;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq <= distanceSquared) {
        found = true;
        indexMapping.push(existingIndex);
      }
    }
    
    if (!found) {
      vertexMap.set(key, newIndex);
      newPositions.push(x, y, z);
      indexMapping.push(newIndex);
      newIndex++;
    }
  }
  
  // Rebuild faces with new indices
  const newFacePositions: number[] = [];
  for (let i = 0; i < indexMapping.length; i += 3) {
    const i0 = indexMapping[i];
    const i1 = indexMapping[i + 1];
    const i2 = indexMapping[i + 2];
    
    newFacePositions.push(
      newPositions[i0 * 3], newPositions[i0 * 3 + 1], newPositions[i0 * 3 + 2],
      newPositions[i1 * 3], newPositions[i1 * 3 + 1], newPositions[i1 * 3 + 2],
      newPositions[i2 * 3], newPositions[i2 * 3 + 1], newPositions[i2 * 3 + 2]
    );
  }
  
  const newGeometry = new BufferGeometry();
  newGeometry.setAttribute('position', new Float32Array(newFacePositions) as any);
  
  // Copy other attributes if they exist
  for (const attr in inputMesh.attributes) {
    if (attr !== 'position') {
      newGeometry.setAttribute(attr, inputMesh.attributes[attr]);
    }
  }
  
  return newGeometry;
}

/**
 * Transform Node
 * Applies transformation matrix to geometry
 */
export interface TransformNode extends Node {
  type: NodeTypes.Transform;
  inputs: {
    Geometry: NodeSocket<BufferGeometry>;
    Translation: NodeSocket<Vector3>;
    Rotation: NodeSocket<Vector3>;
    Scale: NodeSocket<Vector3>;
  };
  outputs: {
    Geometry: NodeSocket<BufferGeometry>;
  };
  params: {
    translation: Vector3;
    rotation: Vector3;
    scale: Vector3;
    space: 'LOCAL' | 'WORLD';
  };
}

export const TransformDefinition: NodeDefinition = {
  type: NodeTypes.Transform,
  label: 'Transform',
  category: 'Geometry',
  inputs: [
    { name: 'Geometry', type: 'GEOMETRY', required: true },
    { name: 'Translation', type: 'VECTOR', default: [0, 0, 0] },
    { name: 'Rotation', type: 'VECTOR', default: [0, 0, 0] },
    { name: 'Scale', type: 'VECTOR', default: [1, 1, 1] },
  ],
  outputs: [{ name: 'Geometry', type: 'GEOMETRY' }],
  params: {
    translation: { type: 'vector', default: [0, 0, 0] },
    rotation: { type: 'vector', default: [0, 0, 0] },
    scale: { type: 'vector', default: [1, 1, 1] },
    space: { type: 'enum', options: ['LOCAL', 'WORLD'], default: 'LOCAL' },
  },
};

/**
 * Execute Transform node
 */
export function executeTransform(node: TransformNode, inputGeometry: BufferGeometry): BufferGeometry {
  const geometry = inputGeometry.clone();
  const positions = geometry.attributes.position.array as Float32Array;
  
  const translation = node.params.translation || new Vector3(0, 0, 0);
  const rotation = node.params.rotation || new Vector3(0, 0, 0);
  const scale = node.params.scale || new Vector3(1, 1, 1);
  
  // Build transformation matrix
  const matrix = new Matrix4();
  
  // Apply scale
  matrix.scale(scale);
  
  // Apply rotation (Euler angles in radians)
  matrix.makeRotationFromEuler({ x: rotation.x, y: rotation.y, z: rotation.z } as any);
  
  // Apply translation
  matrix.setPosition(translation);
  
  // Apply transformation to all vertices
  const tempVec = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    tempVec.set(positions[i], positions[i + 1], positions[i + 2]);
    tempVec.applyMatrix4(matrix);
    positions[i] = tempVec.x;
    positions[i + 1] = tempVec.y;
    positions[i + 2] = tempVec.z;
  }
  
  // Update bounding box
  geometry.computeBoundingBox();
  
  return geometry;
}
