/**
 * Geometry Nodes Types
 * Type definitions for the geometry nodes system
 */

import * as THREE from 'three';

export type NodeType = 
  | 'group'
  | 'transform'
  | 'instance'
  | 'join_geometry'
  | 'mesh_boolean'
  | 'subdivide'
  | 'extrude'
  | 'bevel'
  | 'array'
  | 'curve'
  | 'curve_to_mesh'
  | 'fill_curve'
  | 'set_position'
  | 'set_material'
  | 'random_value'
  | 'attribute_randomize'
  | 'distribute_points'
  | 'align_to_normal'
  | 'raycast'
  | 'proximity'
  | 'bounding_box';

export interface Transform {
  position: THREE.Vector3;
  rotation: THREE.Euler | THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface InstanceData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  transform: Transform;
  attributes?: Record<string, any>;
}

export interface GeometrySocket {
  type: 'GEOMETRY';
  value: THREE.BufferGeometry | THREE.Group | null;
}

export interface FieldSocket {
  type: 'FIELD';
  value: ((context: NodeContext) => number | THREE.Vector3 | THREE.Color) | number | THREE.Vector3 | THREE.Color;
}

export interface ValueSocket<T = any> {
  type: 'VALUE';
  valueType: string;
  value: T;
}

export type Socket = GeometrySocket | FieldSocket | ValueSocket;

export interface NodeContext {
  geometry?: THREE.BufferGeometry;
  position?: THREE.Vector3;
  normal?: THREE.Vector3;
  index?: number;
  instanceIndex?: number;
  attributes: Record<string, any>;
}

export interface SceneGraphNode {
  id: string;
  type: NodeType;
  name: string;
  children?: SceneGraphNode[];
  parent?: SceneGraphNode;
  transform: Transform;
  data?: any;
}

export interface GeometryNode {
  type: NodeType;
  name: string;
  inputs: Record<string, Socket>;
  outputs: Record<string, Socket>;
  execute?: (context: NodeContext) => NodeContext;
}

export function createGeometrySocket(value: THREE.BufferGeometry | THREE.Group | null = null): GeometrySocket {
  return { type: 'GEOMETRY', value };
}

export function createFieldSocket(value: ((context: NodeContext) => number | THREE.Vector3 | THREE.Color) | number | THREE.Vector3 | THREE.Color): FieldSocket {
  return { type: 'FIELD', value };
}

export function createValueSocket<T>(valueType: string, value: T): ValueSocket<T> {
  return { type: 'VALUE', valueType, value };
}
