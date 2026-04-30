/**
 * Domain - Domain type definitions for constraint reasoning
 * 
 * Ported from: infinigen/core/constraints/reasoning/domain.py
 * Defines the Domain class hierarchy used for variable domain analysis.
 */

import { Node, Variable } from '../language/types';

/**
 * Base Domain class - represents the domain of a variable in constraint solving
 */
export abstract class Domain extends Node {
  abstract readonly type: string;
  
  children(): Map<string, Node> {
    return new Map();
  }
  
  /**
   * Check if a value is contained in this domain
   */
  abstract contains(value: any): boolean;
  
  /**
   * Get the size/cardinality of this domain
   */
  abstract size(): number;
  
  /**
   * Intersect with another domain
   */
  abstract intersect(other: Domain): Domain;
  
  /**
   * Check if this domain is a subset of another
   */
  abstract isSubsetOf(other: Domain): boolean;
  
  /**
   * Substitute a variable with a known value
   */
  abstract substitute(variable: Variable, value: any): Domain;
}

/**
 * Domain type enumeration
 */
export enum DomainType {
  ObjectSet = 'ObjectSet',
  Numeric = 'Numeric',
  Boolean = 'Boolean',
  Pose = 'Pose',
  BBox = 'BBox',
  Tag = 'Tag',
  Relation = 'Relation',
}
