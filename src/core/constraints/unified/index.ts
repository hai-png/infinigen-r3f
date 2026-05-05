/**
 * Unified Constraint System — Public API
 *
 * Re-exports all types and classes from the unified constraint system.
 * This module bridges the gap between the existing SpatialRelationAlgebra
 * and language-level relations, providing a single coherent API.
 */

export {
  // Tag system (fixes TagCondition.evaluate() stub)
  Tag,
  TagSet,

  // 2D polygon operations (for room solving)
  Polygon2D,

  // Degrees of freedom
  DOFConstraints,

  // Object state (unified with polygon, tags, DOF)
  ObjectState,
} from './UnifiedConstraintSystem';

export type {
  ObjectStateOptions,
  RelationEntry,
  RelationResult,
  SAConfig,
  MoveProposal,
  Constraint,
} from './UnifiedConstraintSystem';

export {
  // Relation system
  Relation,
  StableAgainstRelation,
  TouchingRelation,
  SupportedByRelation,
  CoPlanarRelation,
  SharedEdgeRelation,
  RoomNeighbourRelation,
  DistanceRelation,
  OnFloorRelation,

  // SA solver
  ViolationAwareSA,
  DEFAULT_SA_CONFIG,
  LazyConstraintMemo,
} from './UnifiedConstraintSystem';

// P1: Constraint-Aware Proposals + Lazy Memoization
export {
  // Proposal types
  ConstraintAwareProposer,
  ConstraintBounds,
  UsageLookup,
  RelationAssignmentFinder,
  LazyConstraintMemo as EnhancedLazyConstraintMemo,
  ConstraintAwareSASolver,

  // Weight configuration
  DEFAULT_PROPOSAL_WEIGHTS,
  computeAnnealedWeights,
  selectProposalType,

  // SA configuration
  DEFAULT_CONSTRAINT_AWARE_SA_CONFIG,
} from './ConstraintProposalSystem';

export type {
  ProposalType,
  ExtendedMoveProposal,
  ConstraintBound,
  Generator,
  RelationAssignment,
  ProposalWeightConfig,
  PlaneInfo,
  ConstraintAwareSAConfig,
} from './ConstraintProposalSystem';
