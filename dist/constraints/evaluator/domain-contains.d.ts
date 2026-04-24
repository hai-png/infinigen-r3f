/**
 * Domain Membership Testing
 *
 * Ports: infinigen/core/constraints/evaluator/domain_contains.py
 *
 * Tests whether objects satisfy domain constraints.
 */
import { Domain } from '../constraints/reasoning/domain.js';
import { State, ObjectState } from './state.js';
/**
 * Check if a domain contains a specific object
 */
export declare function domainContains(dom: Domain, state: State, obj: ObjectState): boolean;
/**
 * Get all object keys that are in a domain
 */
export declare function objKeysInDom(dom: Domain, state: State): string[];
//# sourceMappingURL=domain-contains.d.ts.map