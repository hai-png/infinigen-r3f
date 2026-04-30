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
} from '../language/types';

// Domain extraction from constraints
export {
  constraintDomain,
  extractVariables,
  containsVariable,
  getFreeVariables,
  analyzeConstraintComplexity,
  type ConstraintComplexity
} from './constraint-domain';

// Constancy analysis
export {
  isConstant,
  evaluateConstant,
  simplifyConstant
} from './constraint-constancy';

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
} from './constraint-bounding';

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
} from './domain-substitute';
