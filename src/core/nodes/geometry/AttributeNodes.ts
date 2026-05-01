/**
 * Attribute Nodes for Geometry Nodes System
 * 
 * Handles mesh attributes (positions, normals, UVs, colors, custom data)
 * Based on original: infinigen/core/nodes/nodegroups/attribute_nodes.py
 */

import * as THREE from 'three';
import { Vector3, Color, BufferAttribute } from 'three';
import type { NodeDefinition, NodeSocket, GeometryType } from '../core/types';
import { SocketType, GeometryDataType } from '../core/socket-types';

// ============================================================================
// Type Definitions
// ============================================================================

export type AttributeDomain = 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';

export interface AttributeInput {
  name: string;
  domain: AttributeDomain;
  dataType: 'float' | 'vector' | 'color' | 'boolean' | 'integer' | 'rotation' | 'matrix';
}

export interface SetPositionNode {
  type: 'set_position';
  inputs: {
    geometry: GeometryType;
    position: Vector3 | null;
    offset: Vector3;
    selection?: boolean;
  };
  outputs: {
    geometry: GeometryType;
  };
}

export interface StoreNamedAttributeNode {
  type: 'store_named_attribute';
  inputs: {
    geometry: GeometryType;
    value: number | Vector3 | Color | boolean | number[];
    selection?: boolean;
  };
  parameters: {
    name: string;
    domain: AttributeDomain;
    dataType: AttributeInput['dataType'];
  };
  outputs: {
    geometry: GeometryType;
  };
}

export interface CaptureAttributeNode {
  type: 'capture_attribute';
  inputs: {
    geometry: GeometryType;
    value: number | Vector3 | Color;
    selection?: boolean;
  };
  parameters: {
    domain: AttributeDomain;
    dataType: AttributeInput['dataType'];
  };
  outputs: {
    geometry: GeometryType;
    attribute: number[] | Vector3[] | Color[];
  };
}

export interface RemoveAttributeNode {
  type: 'remove_attribute';
  inputs: {
    geometry: GeometryType;
  };
  parameters: {
    name: string;
  };
  outputs: {
    geometry: GeometryType;
  };
}

export interface NamedAttributeNode {
  type: 'named_attribute';
  inputs: {
    selection?: boolean;
  };
  parameters: {
    name: string;
  };
  outputs: {
    exists: boolean;
    attribute: number[] | Vector3[] | Color[] | boolean[];
  };
}

export interface AttributeStatisticNode {
  type: 'attribute_statistic';
  inputs: {
    geometry: GeometryType;
    attribute?: number[] | Vector3[];
    selection?: boolean;
  };
  parameters: {
    domain: AttributeDomain;
  };
  outputs: {
    exists: boolean;
    average: number;
    min: number;
    max: number;
    sum: number;
    count: number;
    variance: number;
    standardDeviation: number;
    range: number;
  };
}

export interface RaycastNode {
  type: 'raycast';
  inputs: {
    geometry: GeometryType;
    startPosition: Vector3;
    endPosition: Vector3;
  };
  outputs: {
    isHit: boolean;
    hitPosition: Vector3;
    hitNormal: Vector3;
    hitFaceIndex: number;
    distance: number;
  };
}

export interface SampleUVSurfaceNode {
  type: 'sample_uv_surface';
  inputs: {
    geometry: GeometryType;
    uvMap?: string;
  };
  parameters: {
    sampleCount: number;
    seed: number;
  };
  outputs: {
    positions: Vector3[];
    uvs: Vector3[];
  };
}

export interface IndexOfNearestNode {
  type: 'index_of_nearest';
  inputs: {
    geometry: GeometryType;
    position: Vector3;
  };
  outputs: {
    index: number;
    distance: number;
  };
}

export interface NearestFacePointNode {
  type: 'nearest_face_point';
  inputs: {
    geometry: GeometryType;
    position: Vector3;
  };
  outputs: {
    position: Vector3;
    distance: number;
    faceIndex: number;
    barycentricCoords: Vector3;
  };
}

// ============================================================================
// Node Definitions
// ============================================================================

/**
 * Set Position Node
 * Sets or offsets point positions in a geometry
 */
export const SetPositionDefinition: NodeDefinition<SetPositionNode> = {
  name: 'Set Position',
  type: 'set_position',
  category: 'attribute',
  description: 'Sets or offsets the positions of points in a geometry',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    { name: 'Position', type: SocketType.VECTOR, default: null },
    { name: 'Offset', type: SocketType.VECTOR, default: new Vector3(0, 0, 0) },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY },
  ] as NodeSocket[],
  
  defaults: {
    position: null,
    offset: new Vector3(0, 0, 0),
    selection: true,
  },
};

/**
 * Store Named Attribute Node
 * Stores a value as a named attribute on the geometry
 */
export const StoreNamedAttributeDefinition: NodeDefinition<StoreNamedAttributeNode> = {
  name: 'Store Named Attribute',
  type: 'store_named_attribute',
  category: 'attribute',
  description: 'Stores a value as a named attribute on the geometry',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    { name: 'Value', type: SocketType.ANY, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Name', type: 'string', default: 'attribute' },
    { name: 'Domain', type: 'enum', options: ['point', 'edge', 'face', 'face_corner', 'spline', 'instance'], default: 'point' },
    { name: 'Data Type', type: 'enum', options: ['float', 'vector', 'color', 'boolean', 'integer'], default: 'float' },
  ],
  
  defaults: {
    name: 'attribute',
    domain: 'point',
    dataType: 'float',
  },
};

/**
 * Capture Attribute Node
 * Captures an attribute value for later use
 */
export const CaptureAttributeDefinition: NodeDefinition<CaptureAttributeNode> = {
  name: 'Capture Attribute',
  type: 'capture_attribute',
  category: 'attribute',
  description: 'Captures an attribute value from the geometry',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    { name: 'Value', type: SocketType.ANY, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY },
    { name: 'Attribute', type: SocketType.ANY },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Domain', type: 'enum', options: ['point', 'edge', 'face', 'face_corner', 'spline', 'instance'], default: 'point' },
    { name: 'Data Type', type: 'enum', options: ['float', 'vector', 'color', 'boolean', 'integer'], default: 'float' },
  ],
  
  defaults: {
    domain: 'point',
    dataType: 'float',
  },
};

/**
 * Remove Attribute Node
 * Removes a named attribute from the geometry
 */
export const RemoveAttributeDefinition: NodeDefinition<RemoveAttributeNode> = {
  name: 'Remove Attribute',
  type: 'remove_attribute',
  category: 'attribute',
  description: 'Removes a named attribute from the geometry',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Name', type: 'string', default: '' },
  ],
  
  defaults: {
    name: '',
  },
};

/**
 * Named Attribute Node
 * Retrieves a named attribute from the geometry
 */
export const NamedAttributeDefinition: NodeDefinition<NamedAttributeNode> = {
  name: 'Named Attribute',
  type: 'named_attribute',
  category: 'attribute',
  description: 'Retrieves a named attribute from the geometry',
  
  inputs: [
    { name: 'Selection', type: SocketType.BOOLEAN, default: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Exists', type: SocketType.BOOLEAN },
    { name: 'Attribute', type: SocketType.ANY },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Name', type: 'string', default: '' },
  ],
  
  defaults: {
    name: '',
  },
};

/**
 * Attribute Statistic Node
 * Computes statistics about an attribute
 */
export const AttributeStatisticDefinition: NodeDefinition<AttributeStatisticNode> = {
  name: 'Attribute Statistic',
  type: 'attribute_statistic',
  category: 'attribute',
  description: 'Computes statistics about an attribute',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Selection', type: SocketType.BOOLEAN, default: true },
    { name: 'Attribute', type: SocketType.ANY, default: null },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Exists', type: SocketType.BOOLEAN },
    { name: 'Average', type: SocketType.FLOAT },
    { name: 'Min', type: SocketType.FLOAT },
    { name: 'Max', type: SocketType.FLOAT },
    { name: 'Sum', type: SocketType.FLOAT },
    { name: 'Count', type: SocketType.INTEGER },
    { name: 'Variance', type: SocketType.FLOAT },
    { name: 'Standard Deviation', type: SocketType.FLOAT },
    { name: 'Range', type: SocketType.FLOAT },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Domain', type: 'enum', options: ['point', 'edge', 'face', 'face_corner', 'spline', 'instance'], default: 'point' },
  ],
  
  defaults: {
    domain: 'point',
  },
};

/**
 * Raycast Node
 * Casts a ray against the geometry
 */
export const RaycastDefinition: NodeDefinition<RaycastNode> = {
  name: 'Raycast',
  type: 'raycast',
  category: 'attribute',
  description: 'Casts a ray against the geometry and returns hit information',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Start Position', type: SocketType.VECTOR, required: true },
    { name: 'End Position', type: SocketType.VECTOR, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Is Hit', type: SocketType.BOOLEAN },
    { name: 'Hit Position', type: SocketType.VECTOR },
    { name: 'Hit Normal', type: SocketType.VECTOR },
    { name: 'Hit Face Index', type: SocketType.INTEGER },
    { name: 'Distance', type: SocketType.FLOAT },
  ] as NodeSocket[],
};

/**
 * Sample UV Surface Node
 * Samples points on a UV-mapped surface
 */
export const SampleUVSurfaceDefinition: NodeDefinition<SampleUVSurfaceNode> = {
  name: 'Sample UV Surface',
  type: 'sample_uv_surface',
  category: 'attribute',
  description: 'Samples random points on a UV-mapped surface',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Positions', type: SocketType.VECTOR },
    { name: 'UVs', type: SocketType.VECTOR },
  ] as NodeSocket[],
  
  parameters: [
    { name: 'Sample Count', type: 'integer', default: 1, min: 1 },
    { name: 'Seed', type: 'integer', default: 0 },
  ],
  
  defaults: {
    sampleCount: 1,
    seed: 0,
  },
};

/**
 * Index of Nearest Node
 * Finds the index of the nearest point
 */
export const IndexOfNearestDefinition: NodeDefinition<IndexOfNearestNode> = {
  name: 'Index of Nearest',
  type: 'index_of_nearest',
  category: 'attribute',
  description: 'Finds the index of the nearest point to a position',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Position', type: SocketType.VECTOR, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Index', type: SocketType.INTEGER },
    { name: 'Distance', type: SocketType.FLOAT },
  ] as NodeSocket[],
};

/**
 * Nearest Face Point Node
 * Finds the nearest point on a face
 */
export const NearestFacePointDefinition: NodeDefinition<NearestFacePointNode> = {
  name: 'Nearest Face Point',
  type: 'nearest_face_point',
  category: 'attribute',
  description: 'Finds the nearest point on a face and returns barycentric coordinates',
  
  inputs: [
    { name: 'Geometry', type: SocketType.GEOMETRY, required: true },
    { name: 'Position', type: SocketType.VECTOR, required: true },
  ] as NodeSocket[],
  
  outputs: [
    { name: 'Position', type: SocketType.VECTOR },
    { name: 'Distance', type: SocketType.FLOAT },
    { name: 'Face Index', type: SocketType.INTEGER },
    { name: 'Barycentric Coords', type: SocketType.VECTOR },
  ] as NodeSocket[],
};

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Execute Set Position Node
 */
export function executeSetPosition(node: SetPositionNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position.array as Float32Array;
  const result = geometry.clone();
  const resultPositions = result.attributes.position.array as Float32Array;

  for (let i = 0; i < positions.length / 3; i++) {
    if (node.inputs.selection !== false) {
      const ix = i * 3;
      
      if (node.inputs.position) {
        // Set absolute position
        resultPositions[ix] = node.inputs.position.x;
        resultPositions[ix + 1] = node.inputs.position.y;
        resultPositions[ix + 2] = node.inputs.position.z;
      } else if (node.inputs.offset) {
        // Apply offset
        resultPositions[ix] += node.inputs.offset.x;
        resultPositions[ix + 1] += node.inputs.offset.y;
        resultPositions[ix + 2] += node.inputs.offset.z;
      }
    }
  }

  result.attributes.position.needsUpdate = true;
  result.computeVertexNormals();
  
  return result;
}

/**
 * Execute Store Named Attribute Node
 */
export function executeStoreNamedAttribute(node: StoreNamedAttributeNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = geometry.clone();
  const { name, domain, dataType } = node.parameters;
  const value = node.inputs.value;
  
  let attributeArray: Float32Array | Uint8Array | Int32Array;
  let itemSize: number;
  
  // Determine array type and size based on data type
  switch (dataType) {
    case 'float':
      itemSize = 1;
      attributeArray = new Float32Array(getDomainCount(geometry, domain));
      if (typeof value === 'number') {
        attributeArray.fill(value);
      }
      break;
    case 'vector':
      itemSize = 3;
      attributeArray = new Float32Array(getDomainCount(geometry, domain) * 3);
      if (value instanceof Vector3) {
        for (let i = 0; i < attributeArray.length; i += 3) {
          attributeArray[i] = value.x;
          attributeArray[i + 1] = value.y;
          attributeArray[i + 2] = value.z;
        }
      }
      break;
    case 'color':
      itemSize = 3;
      attributeArray = new Float32Array(getDomainCount(geometry, domain) * 3);
      if (value instanceof Color) {
        for (let i = 0; i < attributeArray.length; i += 3) {
          attributeArray[i] = value.r;
          attributeArray[i + 1] = value.g;
          attributeArray[i + 2] = value.b;
        }
      }
      break;
    case 'boolean':
      itemSize = 1;
      attributeArray = new Uint8Array(getDomainCount(geometry, domain));
      if (typeof value === 'boolean') {
        attributeArray.fill(value ? 1 : 0);
      }
      break;
    case 'integer':
      itemSize = 1;
      attributeArray = new Int32Array(getDomainCount(geometry, domain));
      if (typeof value === 'number') {
        attributeArray.fill(Math.floor(value));
      }
      break;
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
  
  const attribute = new BufferAttribute(attributeArray, itemSize);
  result.setAttribute(name, attribute);
  
  return result;
}

/**
 * Execute Capture Attribute Node
 */
export function executeCaptureAttribute(node: CaptureAttributeNode, geometry: THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry;
  attribute: any[];
} {
  const result = geometry.clone();
  const { domain, dataType } = node.parameters;
  const count = getDomainCount(geometry, domain);
  
  let attributeArray: any[] = [];
  
  // For now, capture from existing attribute or use input value
  if (node.inputs.value !== undefined) {
    for (let i = 0; i < count; i++) {
      attributeArray.push(node.inputs.value);
    }
  }
  
  return {
    geometry: result,
    attribute: attributeArray,
  };
}

/**
 * Execute Remove Attribute Node
 */
export function executeRemoveAttribute(node: RemoveAttributeNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = geometry.clone();
  const { name } = node.parameters;
  
  if (result.hasAttribute(name)) {
    result.deleteAttribute(name);
  }
  
  return result;
}

/**
 * Execute Named Attribute Node
 */
export function executeNamedAttribute(node: NamedAttributeNode, geometry: THREE.BufferGeometry): {
  exists: boolean;
  attribute: any[];
} {
  const { name } = node.parameters;
  
  if (!geometry.hasAttribute(name)) {
    return {
      exists: false,
      attribute: [],
    };
  }
  
  const attribute = geometry.getAttribute(name);
  const array = attribute.array;
  const itemSize = attribute.itemSize;
  const count = attribute.count;
  
  const result: any[] = [];
  
  for (let i = 0; i < count; i++) {
    if (itemSize === 1) {
      result.push(array[i]);
    } else {
      const item: any[] = [];
      for (let j = 0; j < itemSize; j++) {
        item.push(array[i * itemSize + j]);
      }
      result.push(item);
    }
  }
  
  return {
    exists: true,
    attribute: result,
  };
}

/**
 * Execute Attribute Statistic Node
 */
export function executeAttributeStatistic(node: AttributeStatisticNode, geometry: THREE.BufferGeometry): {
  exists: boolean;
  average: number;
  min: number;
  max: number;
  sum: number;
  count: number;
  variance: number;
  standardDeviation: number;
  range: number;
} {
  const { domain } = node.parameters;
  let values: number[] = [];
  
  // Get attribute values (for now, use position if no specific attribute)
  const positions = geometry.attributes.position?.array as Float32Array;
  if (positions) {
    // Extract scalar values (e.g., magnitude or single component)
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      // Use magnitude as scalar value
      values.push(Math.sqrt(x * x + y * y + z * z));
    }
  }
  
  if (values.length === 0) {
    return {
      exists: false,
      average: 0,
      min: 0,
      max: 0,
      sum: 0,
      count: 0,
      variance: 0,
      standardDeviation: 0,
      range: 0,
    };
  }
  
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / count;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  const squaredDiffs = values.map(v => Math.pow(v - average, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    exists: true,
    average,
    min,
    max,
    sum,
    count,
    variance,
    standardDeviation,
    range,
  };
}

/**
 * Möller-Trumbore ray-triangle intersection
 * Returns { hit: true, t, u, v } or { hit: false }
 */
function mollerTrumbore(
  origin: Vector3,
  direction: Vector3,
  v0: Vector3,
  v1: Vector3,
  v2: Vector3,
  epsilon: number = 1e-8
): { hit: true; t: number; u: number; v: number } | { hit: false } {
  const edge1 = new Vector3().subVectors(v1, v0);
  const edge2 = new Vector3().subVectors(v2, v0);
  const h = new Vector3().crossVectors(direction, edge2);
  const a = edge1.dot(h);

  // Ray is parallel to triangle
  if (Math.abs(a) < epsilon) {
    return { hit: false };
  }

  const f = 1 / a;
  const s = new Vector3().subVectors(origin, v0);
  const u = f * s.dot(h);

  if (u < 0 || u > 1) {
    return { hit: false };
  }

  const q = new Vector3().crossVectors(s, edge1);
  const v = f * direction.dot(q);

  if (v < 0 || u + v > 1) {
    return { hit: false };
  }

  const t = f * edge2.dot(q);
  if (t > epsilon) {
    return { hit: true, t, u, v };
  }

  return { hit: false };
}

/**
 * Execute Raycast Node
 * Implements Möller-Trumbore ray-triangle intersection for accurate raycasting
 */
export function executeRaycast(node: RaycastNode, geometry: THREE.BufferGeometry): {
  isHit: boolean;
  hitPosition: Vector3;
  hitNormal: Vector3;
  hitFaceIndex: number;
  distance: number;
} {
  const { startPosition, endPosition } = node.inputs;

  if (!startPosition || !endPosition) {
    return {
      isHit: false,
      hitPosition: new Vector3(),
      hitNormal: new Vector3(),
      hitFaceIndex: -1,
      distance: 0,
    };
  }

  const direction = new Vector3().subVectors(endPosition, startPosition);
  const rayLength = direction.length();
  direction.normalize();

  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;

  if (!posAttr) {
    return {
      isHit: false,
      hitPosition: new Vector3(),
      hitNormal: new Vector3(),
      hitFaceIndex: -1,
      distance: rayLength,
    };
  }

  let closestT = Infinity;
  let closestFaceIndex = -1;
  let closestU = 0;
  let closestV = 0;
  let closestV0 = new Vector3();
  let closestV1 = new Vector3();
  let closestV2 = new Vector3();

  // Iterate over all triangles
  if (indexAttr) {
    // Indexed geometry
    for (let i = 0; i < indexAttr.count; i += 3) {
      const i0 = indexAttr.getX(i);
      const i1 = indexAttr.getX(i + 1);
      const i2 = indexAttr.getX(i + 2);

      const v0 = new Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      const result = mollerTrumbore(startPosition, direction, v0, v1, v2);
      if (result.hit && result.t < closestT) {
        closestT = result.t;
        closestFaceIndex = Math.floor(i / 3);
        closestU = result.u;
        closestV = result.v;
        closestV0 = v0;
        closestV1 = v1;
        closestV2 = v2;
      }
    }
  } else {
    // Non-indexed geometry (every 3 vertices = 1 triangle)
    for (let i = 0; i < posAttr.count; i += 3) {
      const v0 = new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const v1 = new Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
      const v2 = new Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));

      const result = mollerTrumbore(startPosition, direction, v0, v1, v2);
      if (result.hit && result.t < closestT) {
        closestT = result.t;
        closestFaceIndex = Math.floor(i / 3);
        closestU = result.u;
        closestV = result.v;
        closestV0 = v0;
        closestV1 = v1;
        closestV2 = v2;
      }
    }
  }

  if (closestT < Infinity) {
    // Compute hit position: P = (1-u-v)*V0 + u*V1 + v*V2
    const hitPosition = new Vector3()
      .addScaledVector(closestV0, 1 - closestU - closestV)
      .addScaledVector(closestV1, closestU)
      .addScaledVector(closestV2, closestV);

    // Compute face normal from triangle edges
    const edge1 = new Vector3().subVectors(closestV1, closestV0);
    const edge2 = new Vector3().subVectors(closestV2, closestV0);
    const hitNormal = new Vector3().crossVectors(edge1, edge2).normalize();

    return {
      isHit: true,
      hitPosition,
      hitNormal,
      hitFaceIndex: closestFaceIndex,
      distance: closestT,
    };
  }

  return {
    isHit: false,
    hitPosition: new Vector3(),
    hitNormal: new Vector3(),
    hitFaceIndex: -1,
    distance: rayLength,
  };
}

/**
 * Execute Sample UV Surface Node
 */
export function executeSampleUVSurface(node: SampleUVSurfaceNode, geometry: THREE.BufferGeometry): {
  positions: Vector3[];
  uvs: Vector3[];
} {
  const { sampleCount, seed } = node.parameters;
  const positions: Vector3[] = [];
  const uvs: Vector3[] = [];
  
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  
  if (!posAttr || posAttr.count === 0) {
    return { positions: [], uvs: [] };
  }
  
  // Simple random sampling
  const count = posAttr.count;
  for (let i = 0; i < sampleCount; i++) {
    const index = Math.floor(Math.random() * count);
    
    const px = posAttr.getX(index);
    const py = posAttr.getY(index);
    const pz = posAttr.getZ(index);
    positions.push(new Vector3(px, py, pz));
    
    if (uvAttr) {
      const u = uvAttr.getX(index);
      const v = uvAttr.getY(index);
      uvs.push(new Vector3(u, v, 0));
    } else {
      uvs.push(new Vector3(0, 0, 0));
    }
  }
  
  return { positions, uvs };
}

/**
 * Execute Index of Nearest Node
 */
export function executeIndexOfNearest(node: IndexOfNearestNode, geometry: THREE.BufferGeometry): {
  index: number;
  distance: number;
} {
  const { position } = node.inputs;
  const posAttr = geometry.attributes.position;
  
  if (!posAttr || posAttr.count === 0) {
    return { index: -1, distance: Infinity };
  }
  
  let nearestIndex = -1;
  let nearestDistance = Infinity;
  
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pz = posAttr.getZ(i);
    
    const dx = px - position.x;
    const dy = py - position.y;
    const dz = pz - position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  
  return { index: nearestIndex, distance: nearestDistance };
}

/**
 * Execute Nearest Face Point Node
 */
export function executeNearestFacePoint(node: NearestFacePointNode, geometry: THREE.BufferGeometry): {
  position: Vector3;
  distance: number;
  faceIndex: number;
  barycentricCoords: Vector3;
} {
  const { position } = node.inputs;
  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;
  
  if (!posAttr || posAttr.count === 0) {
    return {
      position: new Vector3(),
      distance: Infinity,
      faceIndex: -1,
      barycentricCoords: new Vector3(),
    };
  }
  
  // For now, return nearest vertex as approximation
  // TODO: Implement proper point-triangle distance
  const nearest = executeIndexOfNearest({ type: 'index_of_nearest', inputs: { geometry, position } } as IndexOfNearestNode, geometry);
  
  const px = posAttr.getX(nearest.index);
  const py = posAttr.getY(nearest.index);
  const pz = posAttr.getZ(nearest.index);
  
  return {
    position: new Vector3(px, py, pz),
    distance: nearest.distance,
    faceIndex: -1,
    barycentricCoords: new Vector3(1, 0, 0),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the count of elements for a given domain
 */
function getDomainCount(geometry: THREE.BufferGeometry, domain: AttributeDomain): number {
  switch (domain) {
    case 'point':
      return geometry.attributes.position.count;
    case 'face':
      if (geometry.index) {
        return geometry.index.count / 3;
      }
      return geometry.attributes.position.count / 3;
    case 'edge':
      // Approximate edge count (Euler characteristic)
      const faces = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      return Math.floor(faces * 1.5); // Rough approximation
    case 'face_corner':
      return geometry.attributes.position.count;
    case 'spline':
    case 'instance':
      return 1;
    default:
      return geometry.attributes.position.count;
  }
}
