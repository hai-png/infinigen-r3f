/**
 * Node System Core Module
 * 
 * Exports all core node system functionality.
 * Note: types.ts and socket-types.ts both define SocketType and NodeSocket.
 * We use socket-types.ts as canonical and omit duplicates from types.ts.
 */

// Types - export everything except SocketType and NodeSocket (which come from socket-types)
export {
  NodeBase,
  AttributeDomain,
  NodeCategory,
  NodeType,
  NodeDefinition,
  NodeInstance,
  NodeLink,
  NodeGroupInterface,
  NodeGroup,
  NodeTree,
  areSocketsCompatible,
  getDefaultValueForType,
} from './types';

// Socket types (canonical source for SocketType and NodeSocket)
export * from './socket-types';

// Node type identifiers
export { NodeTypes } from './node-types';
export { default as NodeTypesDefault } from './node-types';

// Node wrangler
export * from './node-wrangler';

// Validator
export * from './NodeValidator';

// Shader graph builder
export * from './ShaderGraphBuilder';

// Serializer
export * from './NodeSerializer';
