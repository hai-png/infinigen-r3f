/**
 * Solver Core Module
 * 
 * Exports constraint solver implementations including
 * simulated annealing and greedy solvers.
 */

// Move types and solver implementations
export {
  Move,
  TranslateMove,
  RotateMove,
  SwapMove,
  DeletionMove,
  ReassignmentMove,
  AdditionMove,
  PoseMoveConfig,
  SolverState,
  Solver,
  SimulatedAnnealingSolver,
  GreedySolver,
  SimulatedAnnealingConfig,
  GreedyConfig
} from './moves.js';

// Full MCMC Solver Loop
export { FullSolverLoop, MCMCSolver } from './full-solver-loop.js';

// Proposal Strategies
export {
  ContinuousProposalGenerator,
  DiscreteProposalGenerator,
  HybridProposalGenerator,
  type ProposalStrategyOptions
} from './proposals/ProposalStrategies.js';
