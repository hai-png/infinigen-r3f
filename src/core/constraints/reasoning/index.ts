/**
 * Reasoning Engine Module
 *
 * Exports domain reasoning and constraint analysis utilities.
 */

export {
  Domain,
  type DomainType,
  ObjectSetDomain,
  NumericDomain,
  PoseDomain,
  BBoxDomain,
  BooleanDomain
} from '../language/types';

// Concrete domain classes for spatial reasoning
export {
  Domain as ReasoningDomain,
  DomainType as ReasoningDomainType,
  BoxDomain,
  SurfaceDomain,
  RoomDomain,
  // Symbolic domain for constraint reasoning
  SymbolicDomain,
  type DomainTag,
  domainFinalized,
} from './domain';

// Domain extraction from constraints
export {
  constraintDomain,
  extractVariables,
  containsVariable,
  getFreeVariables,
  analyzeConstraintComplexity,
  type ConstraintComplexity,
  domainFinalized as domainFinalizedFromDomain,
} from './constraint-domain';

// Constancy analysis
export {
  isConstant,
  evaluateConstant,
  simplifyConstant
} from './constraint-constancy';

// Bounding computations
export {
  type Bound,
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
  substituteAll,
  domainTagSubstitute,
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

// Expression equality
export {
  exprEqual,
  exprEqualBool,
  type ExprEqualResult,
} from './expression';

// Constraint simplification
export {
  simplifyExpression,
  simplifyScalarExpression,
  simplifyConstraintMap,
  simplifyDomainIntersection,
  type SimplificationResult,
} from './constraint-simplifier';

// Constraint validation
export {
  validateGreedyStageCoverage,
  validateContradictoryDomains,
  validateUnfinalizedConstraints,
  validateConstraintProblem,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ConstraintProblem,
} from './constraint-validator';

// Predefined relations
export {
  bottom,
  top,
  front,
  back,
  side,
  supportSurface,
  visible,
  floorTags,
  wallTags,
  ceilingTags,
  left,
  right,
  interior,
  exterior,
  tableSurface,
  shelfSurface,
  onFloor,
  againstWall,
  flushWall,
  spacedWall,
  hanging,
  onTop,
  on,
  frontAgainst,
  frontToFront,
  backToBack,
  onTable,
  onShelf,
  leftAgainst,
  rightAgainst,
  createStableAgainst,
  createTouching,
  createSupportedBy,
  getPredefinedRelations,
} from './predefined-relations';
