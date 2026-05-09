/**
 * Solver Core Module
 * 
 * Exports constraint solver implementations including
 * simulated annealing and greedy solvers.
 */

// Canonical SA solver (consolidated from sa-solver.ts)
export { SimulatedAnnealingSolver } from './sa-solver';
export type { SimulatedAnnealingConfig } from './sa-solver';

// Move types, Solver base, GreedySolver, and SolverState
export {
  Move,
  TranslateMove,
  RotateMove,
  SwapMove,
  DeletionMove,
  ReassignmentMove,
  AdditionMove,
  type PoseMoveConfig,
  type SolverState,
  Solver,
  GreedySolver,
  type GreedyConfig
} from './moves';

// Full MCMC Solver Loop
export { FullSolverLoop, MCMCSolver } from './full-solver-loop';

// Proposal Strategies
export {
  ContinuousProposalGenerator,
  DiscreteProposalGenerator,
  HybridProposalGenerator,
  type ProposalStrategyOptions
} from './proposals/ProposalStrategies';

// Greedy Pre-Solve Phase
export {
  ConstraintPartition,
  GreedyPreSolver,
  ActiveForStage,
  greedyPreSolve,
  type ConstraintGroup,
} from './GreedyPreSolver';

// Greedy Stage System
export {
  type GreedyStage,
  updateActiveFlags,
  partitionConstraints,
  allSubstitutions,
} from './greedy';

// DOF Solver
export { DOFSolver } from './dof';

// Plane Extraction
export { PlaneExtractor, type Plane } from './planes';

// Stability Checking
export { StabilityChecker } from './stability';

// Complete Move Proposal System (enhanced with full move set)
// Note: MoveProposals provides the full Infinigen-compatible move operator system.
// We use aliases to avoid conflicts with the simpler move types from ./moves.
export {
  MoveType,
  MoveOperatorFactory,
  AdditionMove as FullAdditionMove,
  DeletionMove as FullDeletionMove,
  SwapMove as FullSwapMove,
  ReassignmentMove as FullReassignmentMove,
  PoseMove,
  PlaneChangeMove,
  ResampleMove,
  retryAttemptProposals,
} from './MoveProposals';
export type { MoveProposal, MoveOperator } from './MoveProposals';

// Relation-Based Proposal Strategies (SAT-like + DOF-projected)
export {
  ProposeRelations,
  DOFProjectedContinuousProposer,
  type AssignmentVariable,
  type RelationConstraint,
  type AssignmentResult,
} from './proposals/RelationProposer';

// Usage Lookup (Asset Factory ↔ Tag bidirectional mapping)
export {
  AssetFactoryRegistry,
  TagUsageLookup,
  createDefaultFactoryProfiles,
  type AssetFactoryProfile,
} from './proposals/UsageLookup';

// Pre-Solve Problem Validation
export {
  ProblemValidator,
  type ConstraintProblem,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ProblemStats,
} from './proposals/ProblemValidator';

// Populate System (Placeholder → real asset spawning)
export {
  PopulateSystem,
  PlaceholderResolver,
  AssetSpawner,
  DEFAULT_POPULATE_CONFIG,
  type Placeholder,
  type SpawnedAsset,
  type PopulateResult,
  type PopulateConfig,
} from './proposals/PopulateSystem';

// Relation Assignment Finder (SAT-like assignment enumeration)
export {
  RelationAssignmentFinder,
  type AssignmentCandidate,
  type RelationAssignment,
  type AssignmentFinderConfig,
} from './relation-assignment-finder';

// Enhanced DOF Solver (detailed DOF analysis)
export {
  DOFSolverEnhanced,
  type DOFResult,
  type DOFApplicationResult,
} from './dof-solver';

// Enhanced Plane Extractor (Planes class with area/face indices)
export {
  Planes,
  type EnhancedPlane,
} from './plane-extractor';

// Enhanced Stability Checker (detailed stability results)
export {
  EnhancedStabilityChecker,
  type StabilityResult as StabilityCheckResult,
} from './stability-checker';

// BVH Collision Detection
export {
  CollisionDetector,
  type CollisionResult,
} from './bvh-collision';
