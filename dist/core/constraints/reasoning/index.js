/**
 * Reasoning Engine Module
 *
 * Exports domain reasoning and constraint analysis utilities.
 */
export { Domain, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from '../language/types.js';
// Domain extraction from constraints
export { constraintDomain, extractVariables, containsVariable, getFreeVariables, analyzeConstraintComplexity } from './constraint-domain.js';
// Constancy analysis
export { isConstant, evaluateConstant, simplifyConstant } from './constraint-constancy.js';
// Bounding computations
export { createBoundFromComparison, mapBound, expressionMapBoundBinop, expressionMapBound, evaluateKnownVars, constraintBounds, isValidBound, intersectBounds, unionBounds, satisfiesBound } from './constraint-bounding.js';
// Domain substitution
export { substituteVariables, substituteVariable, applyDomainSubstitution, composeSubstitutions, isCircularSubstitution, safeSubstituteVariable, normalizeConstraint } from './domain-substitute.js';
//# sourceMappingURL=index.js.map