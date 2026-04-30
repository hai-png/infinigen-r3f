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
  INT = 'INT',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  TEXTURE = 'TEXTURE',
  MATERIAL = 'MATERIAL',
  NODE = 'NODE',
  SHADER = 'SHADER',
  VOLUME = 'VOLUME',
  VALUE = 'VALUE',
  ANY = 'ANY',
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
  POINTS = 'POINTS',
  INSTANCE = 'INSTANCE',
  INSTANCES = 'INSTANCES',
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
  type: SocketType | string;
  defaultValue?: any;
  default?: any;
  min?: number;
  max?: number;
  required?: boolean;
  description?: string;
  [key: string]: any; // Allow additional properties
}

export interface NodeSocket<T = any> {
  id?: string;
  name: string;
  type: SocketType | string;
  value?: T;
  defaultValue?: T;
  default?: T;
  connectedTo?: string; // ID of connected socket
  isInput?: boolean;
  definition?: SocketDefinition;
  required?: boolean;
  min?: number;
  max?: number;
  description?: string;
  [key: string]: any; // Allow additional properties for flexibility
}

/** Geometry data type classification */
export type GeometryDataType = 'mesh' | 'curve' | 'point_cloud' | 'volume' | 'instances';

export default SocketType;
