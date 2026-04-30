/**
 * Consolidated Constraint System
 * 
 * This module unifies all constraint-related functionality from previously
 * fragmented modules (constraint-language, evaluator, solver, reasoning, room-solver)
 * into a single cohesive API.
 */

// Core Constraint Language (primary exports)
export * from './language/index';

// Evaluator - Evaluates constraint violations
export * from './evaluator/index';

// Solver - Optimization and search algorithms
export * from './solver/index';

// Reasoning - Domain propagation and inference
// Note: Some names overlap with language module (extractVariables, substituteVariable).
// We re-export with aliases to avoid conflicts.
export {
  constraintDomain,
  // extractVariables — already exported from language
  containsVariable,
  getFreeVariables,
  analyzeConstraintComplexity,
  isConstant,
  evaluateConstant,
  simplifyConstant,
  Bound,
  createBoundFromComparison,
  mapBound,
  expressionMapBoundBinop,
  expressionMapBound,
  evaluateKnownVars,
  constraintBounds,
  isValidBound,
  intersectBounds,
  unionBounds,
  satisfiesBound,
  substituteVariables,
  // substituteVariable — already exported from language
  applyDomainSubstitution,
  composeSubstitutions,
  isCircularSubstitution,
  safeSubstituteVariable,
  normalizeConstraint,
} from './reasoning/index';

export type {
  ConstraintComplexity,
  SubstitutionResult,
  VariableBinding,
} from './reasoning/index';

// Room Solver - Specialized room layout solving
export * from './room-solver/index';

// Tags - Semantic tagging system
export * from './tags/index';

// DSL - Constraint DSL
export * from './dsl/index';
