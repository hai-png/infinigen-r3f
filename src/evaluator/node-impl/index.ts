/**
 * Node Implementations - Relation Evaluation Handlers
 * 
 * Ports: infinigen/core/constraints/evaluator/node_impl/*.py
 * 
 * Implements evaluation logic for specific constraint node types.
 */

import { Node } from '../../constraint-language/types.js';
import { State } from '../state.js';
import { Relation } from '../../constraint-language/relations.js';

// Registry of node implementation functions
export const nodeImpls = new Map<typeof Node, Function>();

/**
 * Register a node implementation
 */
export function registerNodeImpl(nodeType: typeof Node, impl: Function): void {
  nodeImpls.set(nodeType, impl);
}

/**
 * Default handler for unimplemented nodes
 */
function defaultHandler(node: Node, state: State, childVals: Map<string, any>, kwargs: any): any {
  throw new Error(`No implementation registered for node type: ${node.constructor.name}`);
}

// Export registration functions for specific node types
// These will be implemented in separate files:
// - trimesh-geometry.ts: Distance, Touching, SupportedBy, etc.
// - symmetry.ts: Symmetry constraints
// - rooms.ts: Room-specific constraints
// - impl-bindings.ts: Binding and assignment constraints

export { defaultHandler };
