/**
 * Infinigen R3F Node System
 *
 * Complete node-based procedural generation system
 * Ported from Blender Geometry Nodes and Infinigen's node system
 * 
 * @module @infinigen/r3f/nodes
 * @version 1.0.0
 */

// Core types and utilities
export { NodeTypes } from './core/node-types';
export type { SocketType, NodeDefinition, NodeSocket } from './core/socket-types';
export type { NodeBase, NodeContext } from './core/types';

// Geometry Nodes (20 nodes)
export * from './geometry';

// Shader Nodes (13 nodes)
export * from './shader';

// Input/Output Nodes (12 nodes)
export * from './input_output';

// Utility Nodes (15 nodes)
export * from './utility';

// Curve Nodes (13 nodes)
export * from './curve';

// Texture Nodes (10 nodes)
export * from './texture';

// Color Nodes (11 nodes)
export * from './color';

// Vector Nodes (36 nodes)
export * from './vector';

// Attribute Nodes (14 nodes)
export * from './attribute';

// Output Nodes (24 nodes)
export * from './output';

// Boolean Nodes (3 nodes)
export * from './boolean';

// Light Nodes (6 nodes)
export * from './light';

// Camera Nodes (4 nodes)
export * from './camera';

// Collection Nodes (5 nodes)
export * from './collection';

// Simulation Nodes (9 nodes)
export * from './simulation';

// Volume Nodes (4 nodes)
export * from './volume';

// Transpiler
export * from './transpiler';

// Pre-built Groups
export * from './groups';

// Helpers
export * from './helpers';
