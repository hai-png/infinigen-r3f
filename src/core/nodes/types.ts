/**
 * Node Types
 * 
 * Type definitions for geometry nodes system
 */

import { BufferGeometry, Material, Texture, Vector3, Color } from 'three';

export interface GeometryNode {
  type: string;
  id: string;
}

export interface GeometrySocket {
  geometry: BufferGeometry | null;
}

export interface FieldSocket {
  value: number | Vector3 | Color;
}

export interface Transform {
  translation: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export interface InstanceData {
  transform: Transform;
  attributes: Record<string, Float32Array>;
}

export type NodeType = 
  | 'input'
  | 'output'
  | 'geometry'
  | 'field'
  | 'transform'
  | 'attribute'
  | 'material';

export interface NodeContext {
  geometry: BufferGeometry | null;
  material: Material | null;
  textures: Map<string, Texture>;
}
