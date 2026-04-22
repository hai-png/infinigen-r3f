/**
 * Socket Types for Node System
 * Based on infinigen/core/nodes/node_info.py socket mappings
 */

export enum SocketType {
  GEOMETRY = 'GEOMETRY',
  VECTOR = 'VECTOR',
  COLOR = 'COLOR',
  FLOAT = 'FLOAT',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  TEXTURE = 'TEXTURE',
  MATERIAL = 'MATERIAL',
  NODE = 'NODE',
  SHADER = 'SHADER',
  VOLUME = 'VOLUME',
  VALUE = 'VALUE',
  RGB = 'RGB',
  RGBA = 'RGBA',
  UV = 'UV',
  MATRIX = 'MATRIX',
  QUATERNION = 'QUATERNION',
  ROTATION = 'ROTATION',
  TRANSFORM = 'TRANSFORM',
  BOUNDING_BOX = 'BOUNDING_BOX',
  CURVE = 'CURVE',
  MESH = 'MESH',
  POINT_CLOUD = 'POINT_CLOUD',
  VOLUME_DATA = 'VOLUME_DATA',
  COLLECTION = 'COLLECTION',
  OBJECT = 'OBJECT',
  IMAGE = 'IMAGE',
  LIGHT = 'LIGHT',
  CAMERA = 'CAMERA',
  WORLD = 'WORLD',
  PARTICLE_SYSTEM = 'PARTICLE_SYSTEM',
  HAIR = 'HAIR',
  ARMATURE = 'ARMATURE',
  LATTICE = 'LATTICE',
  EMPTY = 'EMPTY',
  SPEAKER = 'SPEAKER',
  LIGHT_PROBE = 'LIGHT_PROBE',
  LINE_STYLE = 'LINE_STYLE',
  MASK = 'MASK',
  MOVIE_CLIP = 'MOVIE_CLIP',
  TRACKING = 'TRACKING',
  COMPOSITING = 'COMPOSITING',
  SEQUENCE_EDITOR = 'SEQUENCE_EDITOR',
}

export interface SocketDefinition {
  name: string;
  type: SocketType;
  defaultValue?: number | string | boolean | number[];
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
}

export interface NodeSocket {
  id: string;
  name: string;
  type: SocketType;
  value?: any;
  connectedTo?: string; // ID of connected socket
  isInput: boolean;
  definition: SocketDefinition;
}

export default SocketType;
