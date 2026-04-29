/**
 * Reasoning Engine Module
 *
 * Exports domain reasoning and constraint analysis utilities.
 */
export { Domain, DomainType, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from '../language/types.js';
export { constraintDomain, extractVariables, containsVariable, getFreeVariables, analyzeConstraintComplexity, type ConstraintComplexity } from './constraint-domain.js';
export { isConstant, evaluateConstant, simplifyConstant } from './constraint-constancy.js';
export { Bound, createBoundFromComparison, mapBound, expressionMapBoundBinop, expressionMapBound, evaluateKnownVars, constraintBounds, isValidBound, intersectBounds, unionBounds, satisfiesBound } from './constraint-bounding.js';
export { substituteVariables, substituteVariable, applyDomainSubstitution, composeSubstitutions, isCircularSubstitution, safeSubstituteVariable, normalizeConstraint, type SubstitutionResult, type VariableBinding } from './domain-substitute.js';
//# sourceMappingURL=index.d.ts.map