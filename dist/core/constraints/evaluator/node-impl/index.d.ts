/**
 * Node Implementations - Relation Evaluation Handlers
 *
 * Ports: infinigen/core/constraints/evaluator/node_impl/*.py
 *
 * Implements evaluation logic for specific constraint node types.
 */
import { Node } from '../../language/types.js';
import { State } from '../state.js';
export declare const nodeImpls: Map<typeof Node, Function>;
/**
 * Register a node implementation
 */
export declare function registerNodeImpl(nodeType: typeof Node, impl: Function): void;
/**
 * Default handler for unimplemented nodes
 */
declare function defaultHandler(node: Node, state: State, childVals: Map<string, any>, kwargs: any): any;
export declare function registerGeometryNodeImpls(): void;
export declare function registerSymmetryNodeImpls(): void;
export declare function registerAllNodeImpls(): void;
export { defaultHandler };
//# sourceMappingURL=index.d.ts.map