/**
 * Node System Core Module
 * 
 * Exports all core node system functionality.
 * Note: types.ts and socket-types.ts both define SocketType and NodeSocket.
 * We use socket-types.ts as canonical and omit duplicates from types.ts.
 */

// Types - export everything except SocketType and NodeSocket (which come from socket-types)
export {
  type NodeBase,
  type AttributeDomain,
  NodeCategory,
  NodeType,
  type NodeDefinition,
  type NodeInstance,
  type NodeLink,
  type NodeGroupInterface,
  type NodeGroup,
  type NodeTree,
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

// Serializer (JSON)
export * from './NodeSerializer';

// Code serializer / transpiler (NodeWrangler graph → TypeScript code)
export * from './NodeCodeSerializer';

// Node definition registry
export * from './node-definition-registry';

// Per-vertex streaming
export { AttributeStream, type AttributeDataType, type AttributeDomain as StreamAttributeDomain } from './attribute-stream';
export { GeometryContext } from './geometry-context';
export { PerVertexEvaluator, perVertexExecutors, type EvaluationContext } from './per-vertex-evaluator';
