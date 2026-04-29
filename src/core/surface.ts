/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 * 
 * Authors: Ported from Python InfiniGen
 * - Alex Raistrick (original Python author)
 * - Lahav Lipson (Surface mixing)
 * - Lingjie Mei (attributes and geo nodes)
 */

/**
 * Surface module for geometry attribute operations
 * Based on original InfiniGen surface.py
 */

import { Vector3 } from 'three';

/**
 * Remove materials from an object
 */
export function removeMaterials(obj: any): void {
  if (!obj || !obj.materialSlots) {
    return;
  }
  
  obj.activeMaterialIndex = 0;
  const materialSlots = [...obj.materialSlots];
  for (let i = 0; i < materialSlots.length; i++) {
    obj.removeMaterialSlot?.(0);
  }
}

/**
 * Read attribute data from geometry
 * Returns array of values based on domain (POINT, EDGE, FACE, etc.)
 */
export function readAttributeData(
  obj: any,
  attr: string | any,
  domain: 'POINT' | 'EDGE' | 'FACE' | 'CORNER' = 'POINT',
  resultDataType?: string
): Float32Array | Int32Array | Uint8Array {
  // Handle string attribute name
  let attribute: any = attr;
  if (typeof attr === 'string') {
    if (obj.geometry?.attributes?.[attr]) {
      attribute = obj.geometry.attributes[attr];
    } else if (obj.data?.attributes?.[attr]) {
      attribute = obj.data.attributes[attr];
    } else {
      throw new Error(`Attribute ${attr} not found on object`);
    }
  }

  // Determine domain size
  let n: number;
  if (domain === 'POINT') {
    n = obj.geometry?.attributes?.position?.count || obj.data?.vertices?.length || 0;
  } else if (domain === 'EDGE') {
    n = obj.data?.edges?.length || 0;
  } else if (domain === 'FACE') {
    n = obj.geometry?.index?.count / 3 || obj.data?.faces?.length || 0;
  } else if (domain === 'CORNER') {
    n = obj.geometry?.index?.count || 0;
  } else {
    throw new Error(`Unknown domain: ${domain}`);
  }

  // Get attribute data
  if (attribute && attribute.array) {
    return attribute.array as Float32Array | Int32Array | Uint8Array;
  }

  // Return empty array if no data
  return new Float32Array(n);
}

/**
 * Write attribute data to geometry
 */
export function writeAttributeData(
  obj: any,
  attrName: string,
  data: Float32Array | Int32Array | Uint8Array | number[],
  type: 'FLOAT' | 'INT' | 'BOOLEAN' | 'VECTOR' = 'FLOAT',
  domain: 'POINT' | 'EDGE' | 'FACE' | 'CORNER' = 'POINT'
): void {
  if (!obj.geometry) {
    throw new Error('Object has no geometry');
  }

  const dataArray = Array.isArray(data) ? new Float32Array(data) : data;
  
  // Create or update attribute
  if (!obj.geometry.attributes[attrName]) {
    obj.geometry.setAttribute(attrName, {
      itemSize: type === 'VECTOR' ? 3 : 1,
      array: dataArray,
      normalized: false,
    });
  } else {
    obj.geometry.attributes[attrName].array = dataArray;
    obj.geometry.attributes[attrName].needsUpdate = true;
  }
}

/**
 * Smooth an attribute value across the mesh
 */
export function smoothAttribute(
  obj: any,
  attrName: string,
  iterations: number = 20,
  weight: number = 0.05
): void {
  const data = readAttributeData(obj, attrName, 'POINT');
  const positions = obj.geometry?.attributes?.position?.array;
  
  if (!positions || !data) {
    return;
  }

  // Build edge connectivity
  const edges: [number, number][] = [];
  const index = obj.geometry.index;
  
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      edges.push([a, b], [b, c], [c, a]);
    }
  }

  // Smooth iterations
  for (let iter = 0; iter < iterations; iter++) {
    const dataOut = new Float32Array(data.length);
    const vertexWeight = new Float32Array(data.length).fill(1);

    for (const [a, b] of edges) {
      dataOut[a] += data[b] * weight;
      vertexWeight[a] += weight;
      dataOut[b] += data[a] * weight;
      vertexWeight[b] += weight;
    }

    for (let i = 0; i < data.length; i++) {
      data[i] = dataOut[i] / vertexWeight[i];
    }
  }

  writeAttributeData(obj, attrName, data, 'FLOAT', 'POINT');
}

/**
 * Convert attribute to vertex group (weights)
 */
export function attributeToVertexGroup(
  obj: any,
  attrName: string,
  groupName?: string,
  minThreshold: number = 0,
  binary: boolean = false
): any {
  const name = groupName || attrName;
  const attrData = readAttributeData(obj, attrName, 'POINT');

  if (attrData.length > 0 && attrData[0] !== undefined) {
    // Check if scalar
    const isScalar = typeof attrData[0] === 'number';
    if (!isScalar) {
      throw new Error(
        `Could not convert non-scalar attribute ${attrName} to vertex group`
      );
    }
  }

  const weights: Map<number, number> = new Map();

  for (let i = 0; i < attrData.length; i++) {
    const v = attrData[i];
    if (binary) {
      if (v > minThreshold) {
        weights.set(i, 1.0);
      }
    } else {
      if (v > minThreshold) {
        weights.set(i, v);
      }
    }
  }

  return { name, weights };
}

/**
 * Evaluate argument for surface operations
 * Handles various input types: null, function, string, number, Vector
 */
export function evalArgument(
  nw: any,
  argument: any,
  defaultValue: number = 1.0,
  kwargs: Record<string, any> = {}
): any {
  if (argument === null || argument === undefined) {
    // Return selection encompassing everything
    return defaultValue;
  }

  if (typeof argument === 'function') {
    // Call function with node wrangler
    const allowedKeys = Object.keys(kwargs);
    return argument(nw, ...allowedKeys.map((k) => kwargs[k]));
  }

  if (typeof argument === 'string') {
    // Expose as named input/attribute
    return { type: 'attribute', name: argument, defaultValue };
  }

  if (typeof argument === 'number') {
    return argument;
  }

  if (argument instanceof Vector3) {
    return argument;
  }

  // Assume it's already a socket/node
  return argument;
}

/**
 * Add geometry modifier to objects
 */
export function addGeometryModifier(
  objs: any | any[],
  nodeFunc: (nw: any) => any,
  name?: string,
  apply: boolean = false,
  attributes?: string[]
): void {
  const objects = Array.isArray(objs) ? objs : [objs];
  
  for (const obj of objects) {
    // Create geometry nodes modifier
    const modifier = {
      type: 'NODES',
      name: name || nodeFunc.name || 'GeometryNodes',
      nodeGroup: {
        name: name || nodeFunc.name || 'GeometryNodes',
        nodes: [],
      },
    };

    if (!obj.modifiers) {
      obj.modifiers = [];
    }
    obj.modifiers.push(modifier);

    if (apply) {
      // Apply modifier immediately
      // Implementation depends on Three.js workflow
    }
  }
}

/**
 * Set active attribute on object
 */
export function setActiveAttribute(obj: any, attrName: string): void {
  if (obj.data?.attributes) {
    const attrs = obj.data.attributes;
    const index = Object.keys(attrs).findIndex((name) => name === attrName);
    if (index !== -1) {
      attrs.activeIndex = index;
      attrs.active = attrs[index];
    }
  }
}

/**
 * Create new attribute data on object
 */
export function newAttributeData(
  obj: any,
  attrName: string,
  type: 'FLOAT' | 'INT' | 'BOOLEAN' | 'VECTOR',
  domain: 'POINT' | 'EDGE' | 'FACE' | 'CORNER',
  data: Float32Array | Int32Array | Uint8Array | number[]
): void {
  if (obj.data?.attributes?.[attrName]) {
    throw new Error(`Attribute ${attrName} already exists on object`);
  }

  writeAttributeData(obj, attrName, data, type, domain);
}

export default {
  removeMaterials,
  readAttributeData,
  writeAttributeData,
  smoothAttribute,
  attributeToVertexGroup,
  evalArgument,
  addGeometryModifier,
  setActiveAttribute,
  newAttributeData,
};
