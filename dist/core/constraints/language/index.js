/**
 * Constraint Language Module
 *
 * Exports the complete constraint language system for defining
 * procedural generation constraints.
 */
// Types
export { Node, Variable, Domain, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from './types.js';
// Expressions
export { Expression, ScalarExpression, BoolExpression, ScalarConstant, BoolConstant, ScalarVariable, BoolVariable, ScalarOperatorExpression, BoolOperatorExpression, ScalarNegateExpression, ScalarAbsExpression, ScalarMinExpression, ScalarMaxExpression, BoolNotExpression, ScalarIfElse, BoolIfElse } from './expression.js';
// Relations
export { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations, GeometryRelation, Touching, SupportedBy, CoPlanar, StableAgainst, Facing, Between, AccessibleFrom, ReachableFrom, InFrontOf, Aligned, Hidden, Visible, Grouped, Distributed, Coverage, SupportCoverage, Stability, Containment, Proximity } from './relations.js';
// Set Reasoning
export { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, UnionObjects, IntersectionObjects, DifferenceObjects, ObjectCondition, FilterObjects, TagCondition, ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver, CountExpression } from './set-reasoning.js';
// Geometry Predicates
export { GeometryPredicate, Distance, AccessibilityCost, FocusScore, Angle, SurfaceArea, Volume, Count, Height, Width, CenterOfMass, NormalAlignment, Clearance, VisibilityScore, StabilityScore, SupportContactArea, ReachabilityScore, OrientationAlignment, Compactness, AspectRatio } from './geometry.js';
// Constants and Problem Definition
export { scalar, bool, ScalarConstant, BoolConstant, ZERO, ONE, HALF, EPSILON, TRUE, FALSE, item, ItemExpression, tagged, TaggedExpression, SceneExpression, SCENE, Problem, NamedConstraint, NamedScoreTerm, buildProblem } from './constants.js';
// Utilities
export { simplifyConstraint, simplifyExpression, extractVariables, isSatisfiable, getExpressionBounds, substituteVariable, toCNF, supportSet, constraintsEqual, estimateComplexity, constraintToString, expressionToString } from './util.js';
// Result Types
export { SolveStatus, FixType, createEmptyEvaluationResult, createEmptySolution, createSuccessResult, createFailureResult, formatSolution, formatViolationReport, mergeEvaluationResults, compareSolutions } from './result.js';
// Room-Specific Constraints
export { objectsInRoom, objectsWithFunction, InRoom, RoomsAdjacent, RoomsNotAdjacent, RoomHasEntranceAccess, RoomHasNaturalLight, ArrangeFurnitureInRoom, TrafficFlowPath, PrivacyHierarchy, FunctionalZones, defineRoom, validateRoomConfig } from './rooms.js';
//# sourceMappingURL=index.js.map