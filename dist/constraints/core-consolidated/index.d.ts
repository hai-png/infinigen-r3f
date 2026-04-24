/**
 * Consolidated Constraint System Module
 *
 * This module unifies all constraint-related functionality from:
 * - language: High-level constraint DSL
 * - constraints: Legacy constraint implementations
 * - evaluator: Constraint evaluation engine
 * - reasoning: Domain analysis and reasoning
 * - solver: Constraint solvers (SA, greedy, MCMC)
 * - room-solver: Room-specific layout generation
 *
 * @module constraints
 */
export type { Node, Variable, Domain, DomainType, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from '../../language/types.js';
export type { State, ObjectState, RelationState, BVHCacheEntry } from '../../constraints/evaluator/state.js';
export type { Move, TranslateMove, RotateMove, SwapMove, DeletionMove, ReassignmentMove, AdditionMove, PoseMoveConfig, SolverState } from '../../constraints/solver/moves.js';
export { Expression, ScalarExpression, BoolExpression, BoolConstant, ScalarConstant, BoolVariable, ScalarVariable, ScalarOperatorExpression, BoolOperatorExpression, ScalarNegateExpression, ScalarAbsExpression, ScalarMinExpression, ScalarMaxExpression, BoolNotExpression, ScalarIfElse, BoolIfElse, type ScalarOperator, type BoolOperator } from '../../language/expression.js';
export { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations, GeometryRelation, Touching, SupportedBy, CoPlanar, StableAgainst, Facing, Between, AccessibleFrom, ReachableFrom, InFrontOf, Aligned, Hidden, Visible, Grouped, Distributed, Coverage, SupportCoverage, Stability, Containment, Proximity } from '../../language/relations.js';
export { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, UnionObjects, IntersectionObjects, DifferenceObjects, ObjectCondition, FilterObjects, TagCondition, ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver, CountExpression } from '../../language/set-reasoning.js';
export { GeometryPredicate, Distance, AccessibilityCost, FocusScore, Angle, SurfaceArea, Volume, Count, Height, Width, CenterOfMass, NormalAlignment, Clearance, VisibilityScore, StabilityScore, SupportContactArea, ReachabilityScore, OrientationAlignment, Compactness, AspectRatio } from '../../language/geometry.js';
export { objectsInRoom, objectsWithFunction, InRoom, RoomsAdjacent, RoomsNotAdjacent, RoomHasEntranceAccess, RoomHasNaturalLight, ArrangeFurnitureInRoom, TrafficFlowPath, PrivacyHierarchy, FunctionalZones, defineRoom, validateRoomConfig, type RoomFunction, type PrivacyLevel, type RoomAdjacency } from '../../language/rooms.js';
export { scalar, bool, ZERO, ONE, HALF, EPSILON, TRUE, FALSE, item, ItemExpression, tagged, TaggedExpression, SceneExpression, SCENE, Problem, NamedConstraint, NamedScoreTerm, buildProblem } from '../../language/constants.js';
export { evaluateNode, evaluateProblem, violCount, relevant, type EvalResult } from '../../constraints/evaluator/evaluate.js';
export { domainContains, objKeysInDom } from '../../constraints/evaluator/domain-contains.js';
export { memoKey, evictMemoForObj, evictMemoForMove, resetBVHCache } from '../../constraints/evaluator/eval-memo.js';
export { poseAffectsScore } from '../../constraints/evaluator/state.js';
export { nodeImpls, registerNodeImpl, registerGeometryNodeImpls, defaultHandler } from '../../constraints/evaluator/node-impl/index.js';
export { evaluateDistance, evaluateTouching, evaluateSupportedBy, evaluateStableAgainst, evaluateCoverage, evaluateCoPlanar, evaluateFacing, evaluateAccessibleFrom, evaluateVisible, evaluateHidden, geometryNodeImpls } from '../../constraints/evaluator/node-impl/trimesh-geometry.js';
export { constraintDomain, extractVariables, containsVariable, getFreeVariables, analyzeConstraintComplexity, type ConstraintComplexity } from '../../constraints/reasoning/constraint-domain.js';
export { isConstant, evaluateConstant, simplifyConstant } from '../../constraints/reasoning/constraint-constancy.js';
export { Bound, createBoundFromComparison, mapBound, expressionMapBoundBinop, expressionMapBound, evaluateKnownVars, constraintBounds, isValidBound, intersectBounds, unionBounds, satisfiesBound } from '../../constraints/reasoning/constraint-bounding.js';
export { substituteVariables, substituteVariable, applyDomainSubstitution, composeSubstitutions, isCircularSubstitution, safeSubstituteVariable, normalizeConstraint, type SubstitutionResult, type VariableBinding } from '../../constraints/reasoning/domain-substitute.js';
export { SimulatedAnnealingSolver, GreedySolver, type SimulatedAnnealingConfig, type GreedyConfig } from '../../constraints/solver/moves.js';
export { FullSolverLoop, MCMCSolver } from '../../constraints/solver/full-solver-loop.js';
export { ContinuousProposalGenerator, DiscreteProposalGenerator, HybridProposalGenerator, type ProposalStrategyOptions } from '../../constraints/solver/proposals/ProposalStrategies.js';
export { RoomGraph, RoomNode, RoomEdge } from '../../constraints/room-solver/base.js';
export { FloorPlanGenerator, FloorPlanParams, RoomContour } from '../../constraints/room-solver/floor-plan.js';
export { ContourOperations, type Contour } from '../../constraints/room-solver/contour.js';
export { SegmentDivider, type Segment, type RoomSegment } from '../../constraints/room-solver/segment.js';
export { simplifyConstraint, simplifyExpression, extractVariables as extractVarsFromExpr, isSatisfiable, getExpressionBounds, substituteVariable as substVarInExpr, toCNF, supportSet, constraintsEqual, estimateComplexity, constraintToString, expressionToString } from '../../language/util.js';
export { constraintBounded, constraintUnbounded, boundAnalysis } from '../../constraints/reasoning/constraint-bounding.js';
export { ConstraintStatus, EvaluationResult, ScoreTermResult, Solution, SolverResult, SolveStatus, SolverStatistics, ViolationReport, ViolationDetail, FixSuggestion, FixType, ViolationSummary, createEmptyEvaluationResult, createEmptySolution, createSuccessResult, createFailureResult, formatSolution, formatViolationReport, mergeEvaluationResults, compareSolutions } from '../../language/result.js';
export { ConstraintLexer, ConstraintParser, parseConstraintSource, compileConstraint, type Token, type ASTNode, type Program, type ConstraintDeclaration } from '../dsl/ConstraintDSL.js';
export { useInfinigenSolver, type UseInfinigenSolverParams, type UseInfinigenSolverResult } from '../../integration/use-solver.js';
//# sourceMappingURL=index.d.ts.map