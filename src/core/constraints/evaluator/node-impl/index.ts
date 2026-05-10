/**
 * Node Implementations - Relation Evaluation Handlers
 * 
 * Ports: infinigen/core/constraints/evaluator/node_impl/*.py
 * 
 * Implements evaluation logic for specific constraint node types.
 */

import { Node } from '../../language/types';
import { State } from '../state';
import { Relation } from '../../language/relations';
import { geometryNodeImpls } from './trimesh-geometry';
import { symmetryNodeImpls } from './symmetry';

// Registry of node implementation functions
export const nodeImpls = new Map<new (...args: any[]) => Node, Function>();

/**
 * Register a node implementation
 */
export function registerNodeImpl(nodeType: new (...args: any[]) => Node, impl: Function): void {
  nodeImpls.set(nodeType, impl);
}

/**
 * Default handler for unimplemented nodes
 */
function defaultHandler(node: Node, state: State, childVals: Map<string, any>, kwargs: any): any {
  throw new Error(`No implementation registered for node type: ${node.constructor.name}`);
}

// Auto-register geometry-based relations on module load
export function registerGeometryNodeImpls(): void {
  // Dynamic import to avoid circular dependencies
  import('../../language/geometry').then(({ Distance }) => {
    import('../../language/relations').then(({ Touching, SupportedBy, StableAgainst, Coverage, CoPlanar, Facing, AccessibleFrom, Visible, Hidden }) => {
      if (Distance) registerNodeImpl(Distance, geometryNodeImpls.Distance);
      if (Touching) registerNodeImpl(Touching, geometryNodeImpls.Touching);
      if (SupportedBy) registerNodeImpl(SupportedBy, geometryNodeImpls.SupportedBy);
      if (StableAgainst) registerNodeImpl(StableAgainst, geometryNodeImpls.StableAgainst);
      if (Coverage) registerNodeImpl(Coverage, geometryNodeImpls.Coverage);
      if (CoPlanar) registerNodeImpl(CoPlanar, geometryNodeImpls.CoPlanar);
      if (Facing) registerNodeImpl(Facing, geometryNodeImpls.Facing);
      if (AccessibleFrom) registerNodeImpl(AccessibleFrom, geometryNodeImpls.AccessibleFrom);
      if (Visible) registerNodeImpl(Visible, geometryNodeImpls.Visible);
      if (Hidden) registerNodeImpl(Hidden, geometryNodeImpls.Hidden);
    }).catch(err => console.warn('Could not auto-register relation node impls:', err));
  }).catch(err => console.warn('Could not auto-register geometry node impls:', err));
}

// Auto-register symmetry-based relations
export function registerSymmetryNodeImpls(): void {
  import('../../language/relations').then(({ Symmetric, Aligned, Distributed }) => {
    if (Symmetric && symmetryNodeImpls.has('Symmetric')) {
      registerNodeImpl(Symmetric, symmetryNodeImpls.get('Symmetric')!);
    }
    if (Aligned && symmetryNodeImpls.has('Aligned')) {
      registerNodeImpl(Aligned, symmetryNodeImpls.get('Aligned')!);
    }
    if (Distributed && symmetryNodeImpls.has('Distributed')) {
      registerNodeImpl(Distributed, symmetryNodeImpls.get('Distributed')!);
    }
  }).catch(err => console.warn('Could not auto-register symmetry node impls:', err));
}

// Combined registration function
export function registerAllNodeImpls(): void {
  registerGeometryNodeImpls();
  registerSymmetryNodeImpls();
}

// Export registration functions for specific node types
// These will be implemented in separate files:
// - rooms.ts: Room-specific constraints
// - impl-bindings.ts: Binding and assignment constraints

export { defaultHandler };
