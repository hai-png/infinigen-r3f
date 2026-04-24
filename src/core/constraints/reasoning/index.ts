/**
 * Reasoning Engine Module
 *
 * Exports domain reasoning and constraint analysis utilities.
 */

export {
  Domain,
  DomainType,
  ObjectSetDomain,
  NumericDomain,
  PoseDomain,
  BBoxDomain,
  BooleanDomain
} from '../language/types.js';

// Domain extraction from constraints
export {
  constraintDomain,
  extractVariables,
  containsVariable,
  getFreeVariables,
  analyzeConstraintComplexity,
  type ConstraintComplexity
} from './constraint-domain.js';

// Constancy analysis
export {
  isConstant,
  evaluateConstant,
  simplifyConstant
} from './constraint-constancy.js';

// Bounding computations
export {
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
  satisfiesBound
} from './constraint-bounding.js';

// Domain substitution
export {
  substituteVariables,
  substituteVariable,
  applyDomainSubstitution,
  composeSubstitutions,
  isCircularSubstitution,
  safeSubstituteVariable,
  normalizeConstraint,
  type SubstitutionResult,
  type VariableBinding
} from './domain-substitute.js';
