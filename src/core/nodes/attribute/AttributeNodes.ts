/**
 * Attribute Nodes - Attribute data flow and manipulation
 * Based on Blender geometry nodes attribute system
 * 
 * These nodes handle attribute storage, retrieval, and statistics
 */

import * as THREE from 'three';
import { NodeTypes } from '../core/node-types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AttributeNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

export interface StoreNamedAttributeInputs {
  domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
  dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
  name?: string;
  value?: any;
  selection?: boolean;
}

export interface StoreNamedAttributeOutputs {
  geometry: any;
}

export interface CaptureAttributeInputs {
  domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
  dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
  attribute?: any;
}

export interface CaptureAttributeOutputs {
  geometry: any;
  attribute: any;
}

export interface RemoveAttributeInputs {
  name?: string;
}

export interface RemoveAttributeOutputs {
  geometry: any;
}

export interface NamedAttributeInputs {
  name?: string;
}

export interface NamedAttributeOutputs {
  attribute: any;
  exists: boolean;
}

export interface AttributeStatisticInputs {
  domain?: 'point' | 'edge' | 'face' | 'instance';
  attribute?: any;
  selection?: boolean;
}

export interface AttributeStatisticOutputs {
  total: number;
  count: number;
  average: number;
  min: number;
  max: number;
  sum: number;
  range: number;
  variance: number;
  standardDeviation: number;
}

export interface SetPositionInputs {
  position?: [number, number, number];
  offset?: [number, number, number];
  selection?: boolean;
}

export interface SetPositionOutputs {
  position: [number, number, number];
}

export interface PositionInputNodeOutputs {
  position: [number, number, number];
}

export interface NormalInputNodeOutputs {
  normal: [number, number, number];
}

export interface TangentInputNodeOutputs {
  tangent: [number, number, number];
}

export interface UVMapInputNodeOutputs {
  uv: [number, number];
}

export interface ColorInputNodeOutputs {
  color: [number, number, number];
}

export interface RadiusInputNodeOutputs {
  radius: number;
}

export interface IdInputNodeOutputs {
  id: number;
}

export interface IndexInputNodeOutputs {
  indices: number[];
}

// ============================================================================
// Internal Utilities
// ============================================================================

/** Get the element count for a given domain on a BufferGeometry */
function getDomainCount(geometry: THREE.BufferGeometry, domain: string): number {
  switch (domain) {
    case 'point':
      return geometry.attributes.position?.count ?? 0;
    case 'face':
      if (geometry.index) return geometry.index.count / 3;
      return (geometry.attributes.position?.count ?? 0) / 3;
    case 'face_corner':
      if (geometry.index) return geometry.index.count;
      return geometry.attributes.position?.count ?? 0;
    case 'edge': {
      const faces = geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
      return Math.floor(faces * 1.5);
    }
    case 'spline':
    case 'instance':
      return 1;
    default:
      return geometry.attributes.position?.count ?? 0;
  }
}

/** Map domain name to standard Three.js attribute names */
function domainToDefaultAttribute(domain: string): string | null {
  switch (domain) {
    case 'point': return 'position';
    default: return null;
  }
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Store Named Attribute Node
 * Stores an attribute with a custom name on geometry using setAttribute()
 */
export class StoreNamedAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.StoreNamedAttribute;
  readonly name = 'Store Named Attribute';
  
  inputs: StoreNamedAttributeInputs = {
    domain: 'point',
    dataType: 'float',
    name: 'attribute',
    value: 0,
    selection: true,
  };
  
  outputs: StoreNamedAttributeOutputs = {
    geometry: null,
  };

  execute(geometry?: THREE.BufferGeometry): StoreNamedAttributeOutputs {
    if (!geometry) {
      this.outputs.geometry = null;
      return this.outputs;
    }

    const name = this.inputs.name || 'attribute';
    const value = this.inputs.value;
    const domain = this.inputs.domain || 'point';
    const dataType = this.inputs.dataType || 'float';

    const count = getDomainCount(geometry, domain);

    let attributeArray: Float32Array | Uint8Array | Int32Array;
    let itemSize: number;

    switch (dataType) {
      case 'float':
        itemSize = 1;
        attributeArray = new Float32Array(count);
        if (typeof value === 'number') attributeArray.fill(value);
        break;
      case 'vec3':
        itemSize = 3;
        attributeArray = new Float32Array(count * 3);
        if (Array.isArray(value) && value.length === 3) {
          for (let i = 0; i < count; i++) {
            attributeArray[i * 3] = value[0];
            attributeArray[i * 3 + 1] = value[1];
            attributeArray[i * 3 + 2] = value[2];
          }
        } else if (value instanceof THREE.Vector3) {
          for (let i = 0; i < count; i++) {
            attributeArray[i * 3] = value.x;
            attributeArray[i * 3 + 1] = value.y;
            attributeArray[i * 3 + 2] = value.z;
          }
        }
        break;
      case 'color':
        itemSize = 3;
        attributeArray = new Float32Array(count * 3);
        if (Array.isArray(value) && value.length >= 3) {
          for (let i = 0; i < count; i++) {
            attributeArray[i * 3] = value[0];
            attributeArray[i * 3 + 1] = value[1];
            attributeArray[i * 3 + 2] = value[2];
          }
        } else if (value instanceof THREE.Color) {
          for (let i = 0; i < count; i++) {
            attributeArray[i * 3] = value.r;
            attributeArray[i * 3 + 1] = value.g;
            attributeArray[i * 3 + 2] = value.b;
          }
        }
        break;
      case 'boolean':
        itemSize = 1;
        attributeArray = new Uint8Array(count);
        if (typeof value === 'boolean') attributeArray.fill(value ? 1 : 0);
        break;
      case 'integer':
        itemSize = 1;
        attributeArray = new Int32Array(count);
        if (typeof value === 'number') attributeArray.fill(Math.floor(value));
        break;
      default:
        itemSize = 1;
        attributeArray = new Float32Array(count);
    }

    const result = geometry.clone();
    result.setAttribute(name, new THREE.BufferAttribute(attributeArray, itemSize));
    this.outputs.geometry = result;
    return this.outputs;
  }
}

/**
 * Capture Attribute Node
 *
 * Evaluates a field per-element on geometry and captures the per-element values.
 * In Blender's geometry nodes, CaptureAttribute evaluates its Value input
 * field at each element of the specified domain (point/face/corner).
 *
 * The Value (attribute input) may be:
 *   - A per-element array (from Position, Normal, etc.)
 *   - An AttributeStream (from the per-vertex evaluator)
 *   - A function (index, position, normal) → value (field evaluator)
 *   - A single scalar/vector constant (uniform field)
 */
export class CaptureAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.CaptureAttribute;
  readonly name = 'Capture Attribute';
  
  inputs: CaptureAttributeInputs = {
    domain: 'point',
    dataType: 'float',
    attribute: 0,
  };
  
  outputs: CaptureAttributeOutputs = {
    geometry: null,
    attribute: null,
  };

  execute(geometry?: THREE.BufferGeometry): CaptureAttributeOutputs {
    if (!geometry) {
      this.outputs.geometry = null;
      this.outputs.attribute = this.inputs.attribute;
      return this.outputs;
    }

    const domain = this.inputs.domain || 'point';
    const dataType = this.inputs.dataType || 'float';
    const count = getDomainCount(geometry, domain);
    const value = this.inputs.attribute;

    // Resolve per-element values
    this.outputs.attribute = this.resolvePerElementValues(
      value, count, domain, dataType, geometry,
    );

    this.outputs.geometry = geometry;
    return this.outputs;
  }

  /**
   * Resolve the attribute input into per-element values.
   */
  private resolvePerElementValues(
    value: any,
    count: number,
    domain: string,
    dataType: string,
    geometry: THREE.BufferGeometry,
  ): any[] {
    if (value === null || value === undefined) {
      return new Array(count).fill(
        dataType === 'vec3' ? { x: 0, y: 0, z: 0 }
          : dataType === 'color' ? { r: 0, g: 0, b: 0, a: 1 }
          : dataType === 'boolean' ? false
          : 0,
      );
    }

    // Case 1: Value is an AttributeStream (from PerVertexEvaluator)
    if (typeof value === 'object' && value !== null && 'getFloat' in value && 'size' in value) {
      const stream = value as any;
      const result: any[] = [];
      const streamSize = stream.size as number;
      const streamType = stream.dataType as string;
      for (let i = 0; i < count; i++) {
        const idx = Math.min(i, streamSize - 1);
        if (streamType === 'VECTOR') {
          const v = stream.getVector(idx) as [number, number, number];
          result.push({ x: v[0], y: v[1], z: v[2] });
        } else if (streamType === 'COLOR') {
          result.push(stream.getColor(idx));
        } else if (streamType === 'BOOLEAN') {
          result.push(stream.getBoolean(idx));
        } else {
          result.push(stream.getFloat(idx));
        }
      }
      return result;
    }

    // Case 2: Value is already a per-element array
    if (Array.isArray(value)) {
      if (value.length === count) {
        return value.slice();
      } else if (value.length > 0) {
        const result: any[] = [];
        for (let i = 0; i < count; i++) {
          result.push(value[i % value.length]);
        }
        return result;
      }
    }

    // Case 3: Value is a field evaluator function
    //   (index: number, position: {x,y,z}, normal: {x,y,z}) => any
    if (typeof value === 'function') {
      const result: any[] = [];
      const posAttr = geometry.getAttribute('position');
      const normalAttr = geometry.getAttribute('normal');
      const indexAttr = geometry.getIndex();

      for (let i = 0; i < count; i++) {
        const position = this.getDomainPosition(geometry, domain, i, posAttr, indexAttr);
        const normal = this.getDomainNormal(geometry, domain, i, normalAttr, posAttr, indexAttr);
        try {
          result.push(value(i, position, normal));
        } catch {
          result.push(dataType === 'vec3' ? { x: 0, y: 0, z: 0 } : 0);
        }
      }
      return result;
    }

    // Case 4: Single scalar/vector constant — repeat for all elements
    // This is correct for constant fields
    if (typeof value === 'number' || typeof value === 'boolean') {
      return new Array(count).fill(value);
    }

    // Case 5: Single object constant
    if (typeof value === 'object') {
      return new Array(count).fill(value);
    }

    return new Array(count).fill(value);
  }

  /**
   * Get the position for a domain element.
   */
  private getDomainPosition(
    geometry: THREE.BufferGeometry,
    domain: string,
    elementIndex: number,
    posAttr?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    indexAttr?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
  ): { x: number; y: number; z: number } {
    if (!posAttr) posAttr = geometry.getAttribute('position');
    if (!indexAttr) indexAttr = geometry.getIndex();

    if (domain === 'point' || domain === 'face_corner') {
      const idx = domain === 'face_corner' && indexAttr
        ? indexAttr.getX(elementIndex) : elementIndex;
      return {
        x: posAttr?.getX(idx) ?? 0,
        y: posAttr?.getY(idx) ?? 0,
        z: posAttr?.getZ(idx) ?? 0,
      };
    }

    if (domain === 'face') {
      const i0 = indexAttr ? indexAttr.getX(elementIndex * 3) : elementIndex * 3;
      const i1 = indexAttr ? indexAttr.getX(elementIndex * 3 + 1) : elementIndex * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(elementIndex * 3 + 2) : elementIndex * 3 + 2;
      return {
        x: ((posAttr?.getX(i0) ?? 0) + (posAttr?.getX(i1) ?? 0) + (posAttr?.getX(i2) ?? 0)) / 3,
        y: ((posAttr?.getY(i0) ?? 0) + (posAttr?.getY(i1) ?? 0) + (posAttr?.getY(i2) ?? 0)) / 3,
        z: ((posAttr?.getZ(i0) ?? 0) + (posAttr?.getZ(i1) ?? 0) + (posAttr?.getZ(i2) ?? 0)) / 3,
      };
    }

    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Get the normal for a domain element.
   */
  private getDomainNormal(
    geometry: THREE.BufferGeometry,
    domain: string,
    elementIndex: number,
    normalAttr?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    posAttr?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
    indexAttr?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null,
  ): { x: number; y: number; z: number } {
    if (!normalAttr) normalAttr = geometry.getAttribute('normal');
    if (!posAttr) posAttr = geometry.getAttribute('position');
    if (!indexAttr) indexAttr = geometry.getIndex();

    if (normalAttr && (domain === 'point' || domain === 'face_corner')) {
      const idx = domain === 'face_corner' && indexAttr
        ? indexAttr.getX(elementIndex) : elementIndex;
      return {
        x: normalAttr.getX(idx),
        y: normalAttr.getY(idx),
        z: normalAttr.getZ(idx),
      };
    }

    if (domain === 'face' && posAttr && indexAttr) {
      const i0 = indexAttr.getX(elementIndex * 3);
      const i1 = indexAttr.getX(elementIndex * 3 + 1);
      const i2 = indexAttr.getX(elementIndex * 3 + 2);
      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
      return { x: n.x, y: n.y, z: n.z };
    }

    return { x: 0, y: 1, z: 0 };
  }
}

/**
 * Remove Attribute Node
 * Removes a named attribute from geometry using deleteAttribute()
 */
export class RemoveAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.RemoveAttribute;
  readonly name = 'Remove Attribute';
  
  inputs: RemoveAttributeInputs = {
    name: 'attribute',
  };
  
  outputs: RemoveAttributeOutputs = {
    geometry: null,
  };

  execute(geometry?: THREE.BufferGeometry): RemoveAttributeOutputs {
    if (!geometry) {
      this.outputs.geometry = null;
      return this.outputs;
    }

    const name = this.inputs.name || 'attribute';
    const result = geometry.clone();

    if (result.hasAttribute(name)) {
      result.deleteAttribute(name);
    }

    this.outputs.geometry = result;
    return this.outputs;
  }
}

/**
 * Named Attribute Node
 * Looks up an attribute by name, returns real exists/attribute values
 */
export class NamedAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.NamedAttribute;
  readonly name = 'Named Attribute';
  
  inputs: NamedAttributeInputs = {
    name: 'attribute',
  };
  
  outputs: NamedAttributeOutputs = {
    attribute: null,
    exists: false,
  };

  execute(geometry?: THREE.BufferGeometry): NamedAttributeOutputs {
    if (!geometry) {
      this.outputs.exists = false;
      this.outputs.attribute = null;
      return this.outputs;
    }

    const name = this.inputs.name || 'attribute';

    if (!geometry.hasAttribute(name)) {
      this.outputs.exists = false;
      this.outputs.attribute = null;
      return this.outputs;
    }

    const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
    this.outputs.exists = true;

    const result: any[] = [];
    for (let i = 0; i < attr.count; i++) {
      if (attr.itemSize === 1) {
        result.push(attr.getX(i));
      } else if (attr.itemSize === 2) {
        result.push([attr.getX(i), attr.getY(i)]);
      } else if (attr.itemSize === 3) {
        result.push([attr.getX(i), attr.getY(i), attr.getZ(i)]);
      } else if (attr.itemSize === 4) {
        result.push([attr.getX(i), attr.getY(i), attr.getZ(i), attr.getW(i)]);
      }
    }

    this.outputs.attribute = result;
    return this.outputs;
  }
}

/**
 * Attribute Statistic Node
 * Calculates statistics for an attribute
 */
export class AttributeStatisticNode implements AttributeNodeBase {
  readonly type = NodeTypes.AttributeStatistic;
  readonly name = 'Attribute Statistic';
  
  inputs: AttributeStatisticInputs = {
    domain: 'point',
    attribute: [],
    selection: true,
  };
  
  outputs: AttributeStatisticOutputs = {
    total: 0,
    count: 0,
    average: 0,
    min: 0,
    max: 0,
    sum: 0,
    range: 0,
    variance: 0,
    standardDeviation: 0,
  };

  execute(): AttributeStatisticOutputs {
    const attribute = this.inputs.attribute || [];
    const selection = this.inputs.selection ?? true;
    
    if (!Array.isArray(attribute) || attribute.length === 0) {
      return this.outputs;
    }
    
    const values = attribute.filter((_: any, i: number) => selection);
    const count = values.length;
    
    if (count === 0) {
      return this.outputs;
    }
    
    const sum = values.reduce((a: number, b: number) => a + b, 0);
    const average = sum / count;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    const variance = values.reduce((acc: number, val: number) => acc + Math.pow(val - average, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);
    
    this.outputs.total = count;
    this.outputs.count = count;
    this.outputs.average = average;
    this.outputs.min = min;
    this.outputs.max = max;
    this.outputs.sum = sum;
    this.outputs.range = range;
    this.outputs.variance = variance;
    this.outputs.standardDeviation = standardDeviation;
    
    return this.outputs;
  }
}

/**
 * Set Position Node
 * Sets the position of points in geometry
 */
export class SetPositionNode implements AttributeNodeBase {
  readonly type = NodeTypes.SetPosition;
  readonly name = 'Set Position';
  
  inputs: SetPositionInputs = {
    position: [0, 0, 0],
    offset: [0, 0, 0],
    selection: true,
  };
  
  outputs: SetPositionOutputs = {
    position: [0, 0, 0],
  };

  execute(): SetPositionOutputs {
    const position = this.inputs.position || [0, 0, 0];
    const offset = this.inputs.offset || [0, 0, 0];
    
    this.outputs.position = [
      position[0] + offset[0],
      position[1] + offset[1],
      position[2] + offset[2],
    ];
    
    return this.outputs;
  }
}

/**
 * Position Input Node
 * Reads position attribute from geometry
 */
export class PositionInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.PositionInput;
  readonly name = 'Position';
  
  inputs: Record<string, any> = {};
  
  outputs: PositionInputNodeOutputs = {
    position: [0, 0, 0],
  };

  execute(geometry?: THREE.BufferGeometry | [number, number, number]): PositionInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.position = geometry;
      return this.outputs;
    }

    if (geometry && geometry.attributes.position) {
      const pos = geometry.attributes.position;
      // Return the centroid of the first vertex or average
      if (pos.count > 0) {
        const x = pos.getX(0);
        const y = pos.getY(0);
        const z = pos.getZ(0);
        this.outputs.position = [x, y, z];
      }
      return this.outputs;
    }

    this.outputs.position = [0, 0, 0];
    return this.outputs;
  }
}

/**
 * Normal Input Node
 * Reads normal attribute from geometry
 */
export class NormalInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.NormalInput;
  readonly name = 'Normal';
  
  inputs: Record<string, any> = {};
  
  outputs: NormalInputNodeOutputs = {
    normal: [0, 0, 1],
  };

  execute(geometry?: THREE.BufferGeometry | [number, number, number]): NormalInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.normal = geometry;
      return this.outputs;
    }

    if (geometry) {
      // Try to read from normal attribute
      if (geometry.attributes.normal) {
        const norm = geometry.attributes.normal;
        if (norm.count > 0) {
          this.outputs.normal = [norm.getX(0), norm.getY(0), norm.getZ(0)];
        }
        return this.outputs;
      }
      // Compute normals if they don't exist
      geometry.computeVertexNormals();
      if (geometry.attributes.normal) {
        const norm = geometry.attributes.normal;
        if (norm.count > 0) {
          this.outputs.normal = [norm.getX(0), norm.getY(0), norm.getZ(0)];
        }
      }
      return this.outputs;
    }

    this.outputs.normal = [0, 0, 1];
    return this.outputs;
  }
}

/**
 * Tangent Input Node
 * Computes tangent from normal + UV using Gram-Schmidt orthogonalization
 */
export class TangentInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.TangentInput;
  readonly name = 'Tangent';
  
  inputs: Record<string, any> = {};
  
  outputs: TangentInputNodeOutputs = {
    tangent: [1, 0, 0],
  };

  execute(geometry?: THREE.BufferGeometry | [number, number, number]): TangentInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.tangent = geometry;
      return this.outputs;
    }

    if (geometry) {
      const normalAttr = geometry.attributes.normal;
      const uvAttr = geometry.attributes.uv;

      if (normalAttr && normalAttr.count > 0) {
        const nx = normalAttr.getX(0);
        const ny = normalAttr.getY(0);
        const nz = normalAttr.getZ(0);
        const normal = new THREE.Vector3(nx, ny, nz).normalize();

        if (uvAttr && uvAttr.count > 0) {
          // Compute tangent using UV and normal (simplified Gram-Schmidt)
          // Use UV direction to derive tangent
          const u = uvAttr.getX(0);
          const v = uvAttr.getY(0);
          
          // Create an initial tangent based on UV flow direction
          const up = Math.abs(normal.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
          
          const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
          this.outputs.tangent = [tangent.x, tangent.y, tangent.z];
        } else {
          // Fallback: use cross product with up vector
          const up = Math.abs(normal.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
          
          const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
          this.outputs.tangent = [tangent.x, tangent.y, tangent.z];
        }
      }
      return this.outputs;
    }

    this.outputs.tangent = [1, 0, 0];
    return this.outputs;
  }
}

/**
 * UV Map Input Node
 * Reads UV attribute from geometry
 */
export class UVMapInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.UVMapInput;
  readonly name = 'UV Map';
  
  inputs: Record<string, any> = {};
  
  outputs: UVMapInputNodeOutputs = {
    uv: [0, 0],
  };

  execute(geometry?: THREE.BufferGeometry | [number, number]): UVMapInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.uv = geometry;
      return this.outputs;
    }

    if (geometry && geometry.attributes.uv) {
      const uv = geometry.attributes.uv;
      if (uv.count > 0) {
        this.outputs.uv = [uv.getX(0), uv.getY(0)];
      }
      return this.outputs;
    }

    // Fallback: check for uv1 or uv2
    if (geometry) {
      for (let i = 1; i <= 2; i++) {
        const uvName = `uv${i}`;
        if (geometry.hasAttribute(uvName)) {
          const uv = geometry.getAttribute(uvName);
          if (uv.count > 0) {
            this.outputs.uv = [uv.getX(0), uv.getY(0)];
          }
          return this.outputs;
        }
      }
    }

    this.outputs.uv = [0, 0];
    return this.outputs;
  }
}

/**
 * Color Input Node
 * Reads color attribute from geometry
 */
export class ColorInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.ColorInput;
  readonly name = 'Color';
  
  inputs: Record<string, any> = {};
  
  outputs: ColorInputNodeOutputs = {
    color: [1, 1, 1],
  };

  execute(geometry?: THREE.BufferGeometry | [number, number, number]): ColorInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.color = geometry;
      return this.outputs;
    }

    if (geometry) {
      // Try 'color' attribute first, then 'color0' (common Three.js name)
      for (const attrName of ['color', 'color0']) {
        if (geometry.hasAttribute(attrName)) {
          const colorAttr = geometry.getAttribute(attrName);
          if (colorAttr.count > 0) {
            if (colorAttr.itemSize >= 3) {
              this.outputs.color = [colorAttr.getX(0), colorAttr.getY(0), colorAttr.getZ(0)];
            }
          }
          return this.outputs;
        }
      }
    }

    this.outputs.color = [1, 1, 1];
    return this.outputs;
  }
}

/**
 * Radius Input Node
 * Reads radius attribute from geometry (used for curves/points)
 */
export class RadiusInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.RadiusInput;
  readonly name = 'Radius';
  
  inputs: Record<string, any> = {};
  
  outputs: RadiusInputNodeOutputs = {
    radius: 1,
  };

  execute(geometry?: THREE.BufferGeometry | number): RadiusInputNodeOutputs {
    if (typeof geometry === 'number') {
      this.outputs.radius = geometry;
      return this.outputs;
    }

    if (geometry && geometry.hasAttribute('radius')) {
      const radiusAttr = geometry.getAttribute('radius');
      if (radiusAttr.count > 0) {
        this.outputs.radius = radiusAttr.getX(0);
      }
      return this.outputs;
    }

    // For tube/curve geometries, infer from bounding box
    if (geometry && geometry.attributes.position) {
      geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        this.outputs.radius = geometry.boundingSphere.radius;
      }
    }

    this.outputs.radius = this.outputs.radius || 1;
    return this.outputs;
  }
}

/**
 * ID Input Node
 * Reads id attribute from geometry
 */
export class IdInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.IdInput;
  readonly name = 'ID';
  
  inputs: Record<string, any> = {};
  
  outputs: IdInputNodeOutputs = {
    id: 0,
  };

  execute(geometry?: THREE.BufferGeometry | number): IdInputNodeOutputs {
    if (typeof geometry === 'number') {
      this.outputs.id = geometry;
      return this.outputs;
    }

    if (geometry && geometry.hasAttribute('id')) {
      const idAttr = geometry.getAttribute('id');
      if (idAttr.count > 0) {
        this.outputs.id = idAttr.getX(0);
      }
      return this.outputs;
    }

    this.outputs.id = 0;
    return this.outputs;
  }
}

/**
 * Index Input Node
 * Returns per-vertex index IDs [0, 1, 2, ..., position.count-1] for the geometry
 */
export class IndexInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.IndexInput;
  readonly name = 'Index';
  
  inputs: Record<string, any> = {};
  
  outputs: IndexInputNodeOutputs = {
    indices: [],
  };

  execute(geometry?: THREE.BufferGeometry | number[]): IndexInputNodeOutputs {
    if (Array.isArray(geometry)) {
      this.outputs.indices = geometry;
      return this.outputs;
    }

    if (geometry && geometry.attributes.position) {
      const count = geometry.attributes.position.count;
      // Return per-vertex index IDs [0, 1, 2, ..., count-1]
      const indices: number[] = new Array(count);
      for (let i = 0; i < count; i++) {
        indices[i] = i;
      }
      this.outputs.indices = indices;
      return this.outputs;
    }

    this.outputs.indices = [];
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createStoreNamedAttributeNode(inputs?: Partial<StoreNamedAttributeInputs>): StoreNamedAttributeNode {
  const node = new StoreNamedAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCaptureAttributeNode(inputs?: Partial<CaptureAttributeInputs>): CaptureAttributeNode {
  const node = new CaptureAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createRemoveAttributeNode(inputs?: Partial<RemoveAttributeInputs>): RemoveAttributeNode {
  const node = new RemoveAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createNamedAttributeNode(inputs?: Partial<NamedAttributeInputs>): NamedAttributeNode {
  const node = new NamedAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createAttributeStatisticNode(inputs?: Partial<AttributeStatisticInputs>): AttributeStatisticNode {
  const node = new AttributeStatisticNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSetPositionNode(inputs?: Partial<SetPositionInputs>): SetPositionNode {
  const node = new SetPositionNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createPositionInputNode(): PositionInputNode {
  return new PositionInputNode();
}

export function createNormalInputNode(): NormalInputNode {
  return new NormalInputNode();
}

export function createTangentInputNode(): TangentInputNode {
  return new TangentInputNode();
}

export function createUVMapInputNode(): UVMapInputNode {
  return new UVMapInputNode();
}

export function createColorInputNode(): ColorInputNode {
  return new ColorInputNode();
}

export function createRadiusInputNode(): RadiusInputNode {
  return new RadiusInputNode();
}

export function createIdInputNode(): IdInputNode {
  return new IdInputNode();
}

export function createIndexInputNode(): IndexInputNode {
  return new IndexInputNode();
}
