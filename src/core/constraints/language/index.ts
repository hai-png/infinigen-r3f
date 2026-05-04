/**
 * Constraint Language Module
 * 
 * Exports the complete constraint language system for defining
 * procedural generation constraints.
 */

// Types
export {
  Node,
  Variable,
  Domain,
  type DomainType,
  ObjectSetDomain,
  NumericDomain,
  PoseDomain,
  BBoxDomain,
  BooleanDomain
} from './types';

// Expressions
export {
  Expression,
  ScalarExpression,
  BoolExpression,
  ScalarConstant,
  BoolConstant,
  ScalarVariable,
  BoolVariable,
  ScalarOperatorExpression,
  BoolOperatorExpression,
  type ScalarOperator,
  type BoolOperator,
  ScalarNegateExpression,
  ScalarAbsExpression,
  ScalarMinExpression,
  ScalarMaxExpression,
  BoolNotExpression,
  ScalarIfElse,
  BoolIfElse
} from './expression';

// Relations
export {
  Relation,
  AnyRelation,
  NegatedRelation,
  AndRelations,
  OrRelations,
  GeometryRelation,
  Touching,
  SupportedBy,
  CoPlanar,
  StableAgainst,
  Facing,
  Between,
  AccessibleFrom,
  ReachableFrom,
  InFrontOf,
  Aligned,
  Hidden,
  Visible,
  Grouped,
  Distributed,
  Coverage,
  SupportCoverage,
  Stability,
  Containment,
  Proximity
} from './relations';

// Set Reasoning
export {
  ObjectSetExpression,
  ObjectSetConstant,
  ObjectSetVariable,
  UnionObjects,
  IntersectionObjects,
  DifferenceObjects,
  ObjectCondition,
  FilterObjects,
  TagCondition,
  ForAll,
  Exists,
  SumOver,
  MeanOver,
  MaxOver,
  MinOver,
  CountExpression
} from './set-reasoning';

// Geometry Predicates
export {
  GeometryPredicate,
  Distance,
  AccessibilityCost,
  FocusScore,
  Angle,
  SurfaceArea,
  Volume,
  Count,
  Height,
  Width,
  CenterOfMass,
  NormalAlignment,
  Clearance,
  VisibilityScore,
  StabilityScore,
  SupportContactArea,
  ReachabilityScore,
  OrientationAlignment,
  Compactness,
  AspectRatio
} from './geometry';

// Constants and Problem Definition
export {
  scalar,
  bool,
  // ScalarConstant and BoolConstant already exported from expression.js
  ZERO,
  ONE,
  HALF,
  EPSILON,
  TRUE,
  FALSE,
  item,
  ItemExpression,
  tagged,
  TaggedExpression,
  SceneExpression,
  SCENE,
  Problem,
  NamedConstraint,
  NamedScoreTerm,
  buildProblem
} from './constants';

// Utilities
export {
  simplifyConstraint,
  simplifyExpression,
  extractVariables,
  isSatisfiable,
  getExpressionBounds,
  substituteVariable,
  toCNF,
  supportSet,
  constraintsEqual,
  estimateComplexity,
  constraintToString,
  expressionToString
} from './util';

// Result Types
export {
  type ConstraintStatus,
  type EvaluationResult,
  type ScoreTermResult,
  type Solution,
  type SolverResult,
  SolveStatus,
  type SolverStatistics,
  type ViolationReport,
  type ViolationDetail,
  type FixSuggestion,
  FixType,
  type ViolationSummary,
  createEmptyEvaluationResult,
  createEmptySolution,
  createSuccessResult,
  createFailureResult,
  formatSolution,
  formatViolationReport,
  mergeEvaluationResults,
  compareSolutions
} from './result';

// Spatial Relation Algebra (geometry-focused relation classes)
// Note: These are the geometry-focused SpatialRelation classes with implies/satisfies/intersects/difference.
// The abstract Relation classes from ./relations are the constraint-language-level relations.
// We use aliases to avoid naming conflicts.
export {
  RelationType,
  type GeometricConstraint,
  SpatialRelation,
  Touching as SpatialTouching,
  SupportedBy as SpatialSupportedBy,
  CoPlanar as SpatialCoPlanar,
  StableAgainst as SpatialStableAgainst,
  RoomNeighbour as SpatialRoomNeighbour,
  CutFrom,
  SharedEdge,
  Traverse,
  NegatedRelation as SpatialNegatedRelation,
  createRelation as createSpatialRelation,
} from './SpatialRelationAlgebra';

// Tag-Based Relation Algebra (semantic tag reasoning)
// Note: These provide tag-based algebraic reasoning, complementing the spatial
// SpatialRelationAlgebra. We use aliases to avoid naming conflicts with the
// existing GeometryRelation from ./relations and TagSet from ../tags.
export {
  TagSet as AlgebraTagSet,
  EMPTY_TAG_SET,
  GeometryRelation as TagGeometryRelation,
  TagImplicationGraph,
  RelationEvaluator,
  relationFromTags,
  createStandardImplicationGraph,
} from './tag-algebra';

// Room-Specific Constraints
export {
  objectsInRoom,
  objectsWithFunction,
  InRoom,
  RoomsAdjacent,
  RoomsNotAdjacent,
  RoomHasEntranceAccess,
  RoomHasNaturalLight,
  ArrangeFurnitureInRoom,
  TrafficFlowPath,
  PrivacyHierarchy,
  FunctionalZones,
  defineRoom,
  validateRoomConfig,
  type RoomFunction,
  type PrivacyLevel,
  type RoomAdjacency
} from './rooms';
