/**
 * Node Graph Constants & Types
 *
 * Category colors, socket colors, and data shapes used by the
 * unified Infinigen Editor's node graph viewports.
 *
 * These were previously in src/ui/hooks/useNodeGraph.ts; only the
 * constants/types are kept here since the hook logic lives in EditorContext.
 */

import { SocketType } from '../../core/nodes/core/socket-types';

// ---------------------------------------------------------------------------
// Category → colour mapping used to tint nodes
// ---------------------------------------------------------------------------

export const CATEGORY_COLORS: Record<string, string> = {
  SHADER: '#22c55e',
  GEOMETRY: '#3b82f6',
  TEXTURE: '#f97316',
  TEXTURE_SHADER: '#f97316',
  INPUT: '#6b7280',
  SHADER_INPUT: '#6b7280',
  OUTPUT: '#ef4444',
  SHADER_OUTPUT: '#ef4444',
  UTILITY: '#a855f7',
  CONVERTER: '#a855f7',
  COLOR: '#f59e0b',
  CURVE: '#06b6d4',
  CURVE_PRIMITIVES: '#06b6d4',
  MESH: '#3b82f6',
  MESH_PRIMITIVES: '#60a5fa',
  ATTRIBUTE: '#14b8a6',
  INSTANCES: '#8b5cf6',
  MATERIAL: '#ec4899',
  POINT: '#84cc16',
  SIMULATE: '#f43f5e',
  TEXT: '#78716c',
  TRANSFORM: '#0ea5e9',
  MODIFIERS: '#7c3aed',
  COMPOSIT_INPUT: '#6b7280',
  COMPOSIT_OUTPUT: '#ef4444',
  COMPOSIT_FILTER: '#a855f7',
  COMPOSIT_COLOR: '#f59e0b',
  VECTOR_SHADER: '#06b6d4',
  VOLUME: '#6366f1',
};

// ---------------------------------------------------------------------------
// Socket type → colour mapping
// ---------------------------------------------------------------------------

export const SOCKET_COLORS: Record<string, string> = {
  [SocketType.GEOMETRY]: '#00b8b8',
  [SocketType.MESH]: '#00b8b8',
  [SocketType.CURVE]: '#00cccc',
  [SocketType.POINTS]: '#cc9933',
  [SocketType.INSTANCES]: '#9966cc',
  [SocketType.VOLUME]: '#6666cc',
  [SocketType.VECTOR]: '#ff9933',
  [SocketType.FLOAT]: '#999999',
  [SocketType.INTEGER]: '#998866',
  [SocketType.BOOLEAN]: '#cc3333',
  [SocketType.COLOR]: '#ffcc33',
  [SocketType.SHADER]: '#66cc66',
  [SocketType.MATERIAL]: '#cc66cc',
  [SocketType.TEXTURE]: '#ff9933',
  [SocketType.STRING]: '#666666',
  [SocketType.OBJECT]: '#996633',
  [SocketType.COLLECTION]: '#669933',
  [SocketType.IMAGE]: '#cc9966',
  [SocketType.ROTATION]: '#cc6633',
  [SocketType.ANY]: '#cccccc',
  [SocketType.VALUE]: '#999999',
  [SocketType.RGB]: '#ffcc33',
  [SocketType.RGBA]: '#ffcc33',
  [SocketType.UV]: '#ff9933',
  [SocketType.MATRIX]: '#6666cc',
  [SocketType.QUATERNION]: '#cc6633',
  [SocketType.TRANSFORM]: '#0ea5e9',
};

// ---------------------------------------------------------------------------
// Custom node data shape for React Flow nodes
// ---------------------------------------------------------------------------

export interface InfinigenNodeData extends Record<string, unknown> {
  label: string;
  definitionType: string;
  category: string;
  color: string;
  inputs: { name: string; type: string; defaultValue?: unknown }[];
  outputs: { name: string; type: string }[];
  properties: Record<string, any>;
  propertyValues: Record<string, any>;
}
