/**
 * Nodes Module - Procedural Node System for R3F
 * Based on Blender's Geometry Nodes and Infinigen's node system
 */

export { NodeTypes } from './core/node-types';
export { SocketType } from './core/socket-types';
export type { 
  NodeDefinition, 
  NodeInstance, 
  NodeLink, 
  NodeGroup,
  SocketDefinition,
  NodeSocket 
} from './core/node-wrangler';
export { NodeWrangler } from './core/node-wrangler';

// Node Groups - Pre-built node group templates
export * from './groups/primitive-groups';

// Transpiler - Convert node graphs to shaders
export * from './transpiler/node-transpiler';

export default {
  NodeWrangler,
  NodeTypes,
  SocketType,
};
