/**
 * Constraint Language Module
 *
 * Exports the complete constraint language system for defining
 * procedural generation constraints.
 */
export { Node, Variable, Domain, DomainType, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from './types.js';
export { Expression, ScalarExpression, BoolExpression, ScalarConstant, BoolConstant, ScalarVariable, BoolVariable, ScalarOperatorExpression, BoolOperatorExpression, ScalarOperator, BoolOperator, ScalarNegateExpression, ScalarAbsExpression, ScalarMinExpression, ScalarMaxExpression, BoolNotExpression, ScalarIfElse, BoolIfElse } from './expression.js';
export { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations, GeometryRelation, Touching, SupportedBy, CoPlanar, StableAgainst, Facing, Between, AccessibleFrom, ReachableFrom, InFrontOf, Aligned, Hidden, Visible, Grouped, Distributed, Coverage, SupportCoverage, Stability, Containment, Proximity } from './relations.js';
export { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, UnionObjects, IntersectionObjects, DifferenceObjects, ObjectCondition, FilterObjects, TagCondition, ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver, CountExpression } from './set-reasoning.js';
export { GeometryPredicate, Distance, AccessibilityCost, FocusScore, Angle, SurfaceArea, Volume, Count, Height, Width, CenterOfMass, NormalAlignment, Clearance, VisibilityScore, StabilityScore, SupportContactArea, ReachabilityScore, OrientationAlignment, Compactness, AspectRatio } from './geometry.js';
export { scalar, bool, ScalarConstant, BoolConstant, ZERO, ONE, HALF, EPSILON, TRUE, FALSE, item, ItemExpression, tagged, TaggedExpression, SceneExpression, SCENE, Problem, NamedConstraint, NamedScoreTerm, buildProblem } from './constants.js';
export { simplifyConstraint, simplifyExpression, extractVariables, isSatisfiable, getExpressionBounds, substituteVariable, toCNF, supportSet, constraintsEqual, estimateComplexity, constraintToString, expressionToString } from './util.js';
export { ConstraintStatus, EvaluationResult, ScoreTermResult, Solution, SolverResult, SolveStatus, SolverStatistics, ViolationReport, ViolationDetail, FixSuggestion, FixType, ViolationSummary, createEmptyEvaluationResult, createEmptySolution, createSuccessResult, createFailureResult, formatSolution, formatViolationReport, mergeEvaluationResults, compareSolutions } from './result.js';
export { objectsInRoom, objectsWithFunction, InRoom, RoomsAdjacent, RoomsNotAdjacent, RoomHasEntranceAccess, RoomHasNaturalLight, ArrangeFurnitureInRoom, TrafficFlowPath, PrivacyHierarchy, FunctionalZones, defineRoom, validateRoomConfig, type RoomFunction, type PrivacyLevel, type RoomAdjacency } from './rooms.js';
//# sourceMappingURL=index.d.ts.map