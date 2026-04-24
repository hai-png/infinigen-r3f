/**
 * Domain Membership Testing
 *
 * Ports: infinigen/core/constraints/evaluator/domain_contains.py
 *
 * Tests whether objects satisfy domain constraints.
 */
import { NegatedRelation } from '../language/relations.js';
import { satisfies } from '../tags/index.js';
/**
 * Check if a domain contains a specific object
 */
export function domainContains(dom, state, obj) {
    // Check tag satisfaction first
    if (!satisfies(obj.tags, dom.tags)) {
        console.debug(`domainContains failed: ${obj} does not satisfy tags ${obj.tags}`);
        return false;
    }
    // Check each relation constraint
    for (const [rel, relDom] of dom.relations) {
        if (rel instanceof NegatedRelation) {
            // For negated relations, check that NO relation satisfies the constraint
            const hasViolation = obj.relations.some((relState) => {
                const targetObj = state.objs.get(relState.targetName);
                if (!targetObj)
                    return false;
                return relState.relation.intersects(rel.rel) &&
                    domainContains(relDom, state, targetObj);
            });
            if (hasViolation) {
                console.debug(`domainContains failed: ${obj} satisfies negative relation ${rel} ${relDom}`);
                return false;
            }
        }
        else {
            // For positive relations, check that AT LEAST ONE relation satisfies
            const hasSatisfying = obj.relations.some((relState) => {
                const targetObj = state.objs.get(relState.targetName);
                if (!targetObj)
                    return false;
                return relState.relation.intersects(rel) &&
                    domainContains(relDom, state, targetObj);
            });
            if (!hasSatisfying) {
                console.debug(`domainContains failed: ${obj} does not satisfy relation ${rel} ${relDom}`);
                return false;
            }
        }
    }
    return true;
}
/**
 * Get all object keys that are in a domain
 */
export function objKeysInDom(dom, state) {
    const result = [];
    for (const [key, obj] of state.objs.entries()) {
        if (obj.active && domainContains(dom, state, obj)) {
            result.push(key);
        }
    }
    return result;
}
//# sourceMappingURL=domain-contains.js.map