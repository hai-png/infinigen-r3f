/**
 * Domain Membership Testing
 * 
 * Ports: infinigen/core/constraints/evaluator/domain_contains.py
 * 
 * Tests whether objects satisfy domain constraints.
 */

import { NegatedRelation } from '../language/relations';
import { Domain } from '../reasoning/domain';
import { State, ObjectState, RelationState } from './state';
import { satisfies, TagSet } from '../tags/index';

/**
 * Check if a domain contains a specific object
 */
export function domainContains(dom: Domain, state: State, obj: ObjectState): boolean {
  // Check tag satisfaction first
  if (!satisfies(obj.tags instanceof TagSet ? obj.tags.tags : obj.tags, dom.tags instanceof TagSet ? dom.tags.tags : dom.tags)) {
    console.debug(`domainContains failed: ${obj} does not satisfy tags ${obj.tags}`);
    return false;
  }

  // Check each relation constraint
  for (const [rel, relDom] of dom.relations) {
    if (rel instanceof NegatedRelation) {
      // For negated relations, check that NO relation satisfies the constraint
      const hasViolation = obj.relations.some((relState: RelationState) => {
        const targetObj = state.objs.get(relState.targetName);
        if (!targetObj) return false;
        
        return relState.relation.intersects(rel.rel) &&
               domainContains(relDom, state, targetObj);
      });
      
      if (hasViolation) {
        console.debug(`domainContains failed: ${obj} satisfies negative relation ${rel} ${relDom}`);
        return false;
      }
    } else {
      // For positive relations, check that AT LEAST ONE relation satisfies
      const hasSatisfying = obj.relations.some((relState: RelationState) => {
        const targetObj = state.objs.get(relState.targetName);
        if (!targetObj) return false;
        
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
export function objKeysInDom(dom: Domain, state: State): string[] {
  const result: string[] = [];
  
  for (const [key, obj] of state.objs.entries()) {
    if (obj.active && domainContains(dom, state, obj)) {
      result.push(key);
    }
  }
  
  return result;
}
