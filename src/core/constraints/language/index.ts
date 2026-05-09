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
  BoolIfElse,
  InRangeExpression
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
  Proximity,
  RoomNeighbour as ConstraintRoomNeighbour,
  CutFrom as ConstraintCutFrom,
  SharedEdge as ConstraintSharedEdge,
  Traverse as ConstraintTraverse,
  // Logical Reasoning Relations
  ImpliesRelation,
  IntersectsRelation,
  IntersectionRelation,
  DifferenceRelation
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
  CountExpression,
  SceneSetExpression,
  RelatedToExpression,
  TaggedSetExpression,
  ExcludesExpression
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
  AspectRatio,
  MinDistanceInternal,
  FreeSpace2D,
  MinDistance2D,
  RotationalAsymmetry,
  ReflectionalAsymmetry,
  CoplanarityCost,
  CenterStableSurfaceDist,
  AngleAlignmentCost,
  // Missing Geometry Cost Functions (ported from constraint_language/geometry.py)
  CameraFocusScore,
  RotationAlignmentCost,
  ObjectFreespace2D,
  ObjectMinDist2D,
  ObjectRotationalAsymmetry,
  ObjectReflectionalAsymmetry,
  ObjectCoplanarityCost
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
  buildProblem,
  RoomConstants,
  type RoomTypeConfig,
  type BuildingDimensions
} from './constants';

// DSL Entry Functions - Ported from Infinigen constraint_language/__init__.py
export {
  scene,
  taggedSet,
  union,
  excludes,
  relatedTo,
  inRange
} from './dsl-functions';

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
  compareSolutions,
  ProblemNode
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
  CutFrom as SpatialCutFrom,
  SharedEdge as SpatialSharedEdge,
  Traverse as SpatialTraverse,
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
  type RoomAdjacency,
  // Room-specific scalar expressions
  RoomArea,
  RoomAspectRatio,
  RoomConvexity,
  RoomNVerts,
  RoomAccessAngle,
  RoomSharedLength,
  RoomLength,
  RoomSameLevel,
  RoomIntersection,
  RoomGridLineCount,
  RoomNarrowness,
  RoomGraphCoherent
} from './rooms';
