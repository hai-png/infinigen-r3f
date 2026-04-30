/**
 * Evaluation Memoization
 * 
 * Ports: infinigen/core/constraints/evaluator/eval_memo.py
 * 
 * Manages memoization cache for constraint evaluation.
 * Handles cache invalidation when objects move or change.
 */

import { Node, Problem, SceneConstant, Tagged } from '../language/types';
import { State, ObjectState } from './state';
import { Move, TranslateMove, RotateMove, Addition, ReinitPoseMove, RelationPlaneChange, Resample, Deletion } from '../solver/moves';
import { Semantics } from '../tags/index';

// Static tags that don't change during solving
const STATIC_TAGS = new Set([Semantics.Room, Semantics.Cutter]);

/**
 * Generate a memoization key for a node
 */
export function memoKey(n: Node): any {
  if (n.constructor.name === 'Item') {
    return (n as any).var;
  }
  
  if (n instanceof SceneConstant) {
    return SceneConstant;
  }
  
  return n; // Use object identity
}

/**
 * Evict memo entries related to a specific object
 */
export function evictMemoForObj(node: Problem, memo: Map<any, any>, obj: ObjectState): boolean {
  let res = false;
  
  // Recursively process children
  for (const [_, child] of node.children()) {
    const childRes = evictMemoForObj(child as Problem, memo, obj);
    if (childRes) res = true;
  }

  // Handle tagged nodes
  if (node instanceof Tagged) {
    if (!implies(obj.tags, node.tags)) {
      res = false;
    }
  }
  
  // Scene nodes always need invalidation
  if (node instanceof SceneConstant) {
    res = true;
  }

  // Remove from memo if needed
  const key = memoKey(node);
  if (res && memo.has(key)) {
    memo.delete(key);
  }

  return res;
}

/**
 * Reset BVH cache for moved objects
 */
export function resetBVHCache(state: State, filterName?: string): void {
  const prevKeys = Array.from(state.bvhCache.keys());
  let evictedCount = 0;

  for (const k of prevKeys) {
    const [names, tags] = k;
    
    if (filterName !== undefined) {
      // Keep only entries not containing the filtered object
      if (!names.includes(filterName)) {
        continue;
      }
    } else {
      // Keep only entries with static objects
      let keep = true;
      for (const n of names) {
        const ostate = state.objs.get(n);
        if (!ostate || !ostate.tags.has(Semantics.Room) && !ostate.tags.has(Semantics.Cutter)) {
          keep = false;
          break;
        }
      }
      if (keep) continue;
    }
    
    state.bvhCache.delete(k);
    evictedCount++;
  }

  console.debug(
    `resetBVHCache evicted ${evictedCount} out of ${prevKeys.length} original entries`
  );
}

/**
 * Evict memo entries after applying a move
 */
export function evictMemoForMove(
  problem: Problem,
  state: State,
  memo: Map<any, any>,
  move: Move
): void {
  if (move instanceof TranslateMove ||
      move instanceof RotateMove ||
      move instanceof Addition ||
      move instanceof ReinitPoseMove ||
      move instanceof RelationPlaneChange ||
      move instanceof Resample) {
    
    for (const name of move.names) {
      if (name === null) {
        throw new Error(`Invalid null name in move: ${move}`);
      }
      
      const obj = state.objs.get(name);
      if (obj) {
        evictMemoForObj(problem, memo, obj);
        resetBVHCache(state, name);
      }
    }
  } else if (move instanceof Deletion) {
    // For deletion, evict entries related to the deleted object and its relations
    for (const name of move.names) {
      if (name === null) {
        throw new Error(`Invalid null name in move: ${move}`);
      }
      
      const obj = state.objs.get(name);
      if (obj) {
        evictMemoForObj(problem, memo, obj);
      }
      
      // Also evict entries that reference the deleted object
      resetBVHCache(state, name);
      
      // Clear memo entries where the deleted object is a target
      for (const [key, value] of memo.entries()) {
        // Simple heuristic: clear all scene-level caches
        if (key instanceof SceneConstant || 
            (typeof key === 'object' && key !== null)) {
          memo.delete(key);
        }
      }
    }
  } else {
    throw new NotImplementedError(`Unsure what to evict for move: ${move}`);
  }
}

/**
 * Check if one tag set implies another
 */
function implies(tags: Set<any>, required: Set<any>): boolean {
  for (const req of required) {
    if (!tags.has(req)) {
      return false;
    }
  }
  return true;
}

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
