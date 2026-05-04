/**
 * Structured Move Proposals for Constraint Solver
 *
 * Ports: infinigen/core/constraints/example_solver/moves/
 * Original: LinearDecaySchedule, structured move types (addition/deletion/translation/rotation),
 * and violation-aware Metropolis-Hastings acceptance (metrop_hastings_with_viol).
 *
 * This module replaces the random variable assignment in the solver loop with
 * properly structured move proposals that have annealing-weight decay schedules
 * and violation-aware acceptance criteria.
 */

import { SeededRandom } from '../../util/MathUtils';
import { SolverState } from './types';
import { State as EvaluatorState } from '../evaluator/state';
import { violCount, evaluateNode } from '../evaluator/evaluate';
import { Node, Domain } from '../language/types';

// ============================================================================
// StructuredMoveType Enum
// ============================================================================

/**
 * Enumeration of structured move types for the constraint solver.
 *
 * Each move type represents a semantically distinct way the solver can
 * modify the scene:
 *
 * - ADDITION:    Add a new object to the scene
 * - DELETION:    Remove an existing object from the scene
 * - TRANSLATION: Small positional perturbation of an existing object
 * - ROTATION:    Small rotational perturbation of an existing object
 * - RESCALE:     Change the scale of an existing object
 * - RESAMPLE:    Re-sample an object's parameters from its prior distribution
 */
export enum StructuredMoveType {
  ADDITION = 'addition',
  DELETION = 'deletion',
  TRANSLATION = 'translation',
  ROTATION = 'rotation',
  RESCALE = 'rescale',
  RESAMPLE = 'resample',
}

// ============================================================================
// StructuredMove Interface
// ============================================================================

/**
 * A structured move proposal for the constraint solver.
 *
 * Unlike the previous random variable assignment, each move has a clear
 * semantic type, identifies which object it affects, carries move-specific
 * parameters, and has an associated proposal weight for selection.
 */
export interface StructuredMove {
  /** The semantic type of this move */
  type: StructuredMoveType;

  /** ID of the object being modified (empty string for ADDITION before assignment) */
  objectId: string;

  /** Move-specific parameters (e.g., displacement vector, rotation delta, scale factor) */
  params: Record<string, any>;

  /** Weight for proposal selection (updated by LinearDecaySchedule) */
  proposalWeight: number;
}

// ============================================================================
// LinearDecaySchedule
// ============================================================================

/**
 * Linear weight decay schedule for move proposal weights.
 *
 * Implements the Infinigen pattern where move weights decay linearly
 * over iterations, with a configurable minimum floor. This enables
 * annealing of move preferences:
 *
 * - ADDITION weight starts high, decays as scene fills
 * - DELETION weight starts low, increases as scene gets crowded
 * - TRANSLATION/ROTATION weights stay relatively stable
 * - RESCALE/RESAMPLE weights decay moderately
 */
export class LinearDecaySchedule {
  private initialWeight: number;
  private decayRate: number;
  private minWeight: number;

  /**
   * @param initialWeight Starting weight for this move type
   * @param decayRate     Linear decay per iteration (weight decrease per step)
   * @param minWeight     Floor value — weight never goes below this
   */
  constructor(
    initialWeight: number,
    decayRate: number = 0.001,
    minWeight: number = 0.1
  ) {
    this.initialWeight = initialWeight;
    this.decayRate = decayRate;
    this.minWeight = minWeight;
  }

  /**
   * Compute the weight at a given iteration using linear decay.
   *
   * weight(iteration) = max(initialWeight - decayRate * iteration, minWeight)
   */
  getWeight(iteration: number): number {
    const decayed = this.initialWeight - this.decayRate * iteration;
    return Math.max(decayed, this.minWeight);
  }

  /**
   * Update (decay) the weight for the current iteration.
   * Returns the new weight value.
   */
  update(iteration: number): number {
    return this.getWeight(iteration);
  }

  /** Get the initial weight (before any decay) */
  getInitialWeight(): number {
    return this.initialWeight;
  }

  /** Get the configured decay rate */
  getDecayRate(): number {
    return this.decayRate;
  }

  /** Get the configured minimum weight floor */
  getMinWeight(): number {
    return this.minWeight;
  }
}

// ============================================================================
// Default Schedule Configurations
// ============================================================================

/**
 * Create the default set of LinearDecaySchedules matching Infinigen's
 * original move weight annealing behavior:
 *
 * - TRANSLATION: High initial weight, slow decay (most common move)
 * - ROTATION:    High initial weight, slow decay (common move)
 * - ADDITION:    Medium-high initial, faster decay (less needed as scene fills)
 * - RESCALE:     Low-medium initial, moderate decay
 * - RESAMPLE:    Low-medium initial, moderate decay
 * - DELETION:    Low initial weight, very slow decay (rare, especially early)
 */
export function createDefaultSchedules(): Map<StructuredMoveType, LinearDecaySchedule> {
  const schedules = new Map<StructuredMoveType, LinearDecaySchedule>();

  schedules.set(StructuredMoveType.TRANSLATION, new LinearDecaySchedule(10, 0.0005, 2.0));
  schedules.set(StructuredMoveType.ROTATION, new LinearDecaySchedule(8, 0.0005, 1.5));
  schedules.set(StructuredMoveType.ADDITION, new LinearDecaySchedule(6, 0.002, 0.5));
  schedules.set(StructuredMoveType.RESCALE, new LinearDecaySchedule(3, 0.001, 0.3));
  schedules.set(StructuredMoveType.RESAMPLE, new LinearDecaySchedule(3, 0.001, 0.3));
  schedules.set(StructuredMoveType.DELETION, new LinearDecaySchedule(2, 0.0003, 0.2));

  return schedules;
}

// ============================================================================
// Move Executor Interface
// ============================================================================

/**
 * A move executor knows how to apply a structured move to a solver state
 * and compute the resulting proposal.
 */
export interface MoveExecutor {
  /**
   * Apply the move to the given state, returning a new/modified state.
   * Returns true if the move was successfully applied.
   */
  apply(state: SolverState, move: StructuredMove): boolean;

  /**
   * Check if the move is valid in the current state.
   */
  isValid(state: SolverState, move: StructuredMove): boolean;
}

// ============================================================================
// StructuredMoveProposer
// ============================================================================

/**
 * Structured move proposal generator for the constraint solver.
 *
 * Selects and generates structured moves (ADDITION, DELETION, TRANSLATION,
 * ROTATION, RESCALE, RESAMPLE) using weighted random selection based on
 * LinearDecaySchedule weights. Each move type has its own schedule that
 * decays over iterations, implementing the Infinigen annealing pattern.
 *
 * Usage:
 *   const proposer = new StructuredMoveProposer(schedules);
 *   proposer.registerMoveType(StructuredMoveType.TRANSLATION, myTranslateExecutor);
 *   const move = proposer.propose(solverState, 42);  // iteration 42
 */
export class StructuredMoveProposer {
  private schedules: Map<StructuredMoveType, LinearDecaySchedule>;
  private executors: Map<StructuredMoveType, MoveExecutor>;
  private rng: SeededRandom;
  private maxObjects: number;
  private availableTypes: string[];

  /**
   * @param schedules  Map of move type → decay schedule.
   *                   If not provided, uses createDefaultSchedules().
   * @param seed       Seed for deterministic randomness
   * @param maxObjects Maximum objects in scene (affects ADDITION proposals)
   * @param availableTypes Object types available for ADDITION moves
   */
  constructor(
    schedules?: Map<StructuredMoveType, LinearDecaySchedule>,
    seed: number = 42,
    maxObjects: number = 50,
    availableTypes?: string[]
  ) {
    this.schedules = schedules ?? createDefaultSchedules();
    this.executors = new Map();
    this.rng = new SeededRandom(seed);
    this.maxObjects = maxObjects;
    this.availableTypes = availableTypes ?? [
      'chair', 'table', 'lamp', 'shelf', 'rug',
      'sofa', 'book', 'vase', 'plant', 'picture',
    ];
  }

  /**
   * Register a move executor for a specific move type.
   * The executor handles applying and validating moves of that type.
   */
  registerMoveType(type: StructuredMoveType, executor: MoveExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * Propose a structured move given the current solver state.
   *
   * The move type is selected via weighted random sampling using the
   * current weights from the decay schedules. The move is then generated
   * with appropriate parameters based on its type.
   *
   * @param state     Current solver state
   * @param iteration Current iteration number (for weight decay)
   * @returns A structured move proposal, or null if no valid move can be generated
   */
  propose(state: SolverState, iteration: number): StructuredMove | null {
    // 1. Select move type via weighted random sampling
    const moveType = this.selectMoveType(state, iteration);
    if (moveType === null) return null;

    // 2. Generate the move parameters
    const weight = this.schedules.get(moveType)!.getWeight(iteration);

    switch (moveType) {
      case StructuredMoveType.ADDITION:
        return this.proposeAddition(state, iteration, weight);

      case StructuredMoveType.DELETION:
        return this.proposeDeletion(state, iteration, weight);

      case StructuredMoveType.TRANSLATION:
        return this.proposeTranslation(state, iteration, weight);

      case StructuredMoveType.ROTATION:
        return this.proposeRotation(state, iteration, weight);

      case StructuredMoveType.RESCALE:
        return this.proposeRescale(state, iteration, weight);

      case StructuredMoveType.RESAMPLE:
        return this.proposeResample(state, iteration, weight);

      default:
        return null;
    }
  }

  /**
   * Select a move type using weighted random sampling with decay schedules.
   *
   * Weights are computed from the schedules at the given iteration.
   * ADDITION moves are suppressed when the scene is near capacity.
   * DELETION moves are suppressed when the scene has few objects.
   */
  private selectMoveType(
    state: SolverState,
    iteration: number
  ): StructuredMoveType | null {
    const weights: { type: StructuredMoveType; weight: number }[] = [];

    const objectCount = state.assignments.size;

    for (const [type, schedule] of this.schedules) {
      let w = schedule.getWeight(iteration);

      // Suppress ADDITION when scene is near capacity
      if (type === StructuredMoveType.ADDITION && objectCount >= this.maxObjects) {
        w = 0;
      }

      // Suppress DELETION when scene is empty or has very few objects
      if (type === StructuredMoveType.DELETION && objectCount <= 1) {
        w = 0;
      }

      weights.push({ type, weight: w });
    }

    // Filter out zero-weight types
    const validWeights = weights.filter(w => w.weight > 0);
    if (validWeights.length === 0) return null;

    // Weighted random selection
    const totalWeight = validWeights.reduce((sum, w) => sum + w.weight, 0);
    let r = this.rng.next() * totalWeight;

    for (const w of validWeights) {
      r -= w.weight;
      if (r <= 0) return w.type;
    }

    // Fallback to last type
    return validWeights[validWeights.length - 1].type;
  }

  /**
   * Generate an ADDITION move: add a new object to the scene.
   */
  private proposeAddition(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove {
    const targetType = this.rng.choice(this.availableTypes);
    const objectId = `${targetType}_${Date.now()}_${this.rng.nextInt(0, 9999)}`;

    // Propose a placement position (bounded scene volume)
    const position = {
      x: this.rng.nextFloat(-5, 5),
      y: 0,
      z: this.rng.nextFloat(-5, 5),
    };

    return {
      type: StructuredMoveType.ADDITION,
      objectId,
      params: {
        targetType,
        position,
        rotation: { x: 0, y: this.rng.nextFloat(0, 2 * Math.PI), z: 0 },
      },
      proposalWeight: weight,
    };
  }

  /**
   * Generate a DELETION move: remove an existing object.
   */
  private proposeDeletion(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove | null {
    const objectIds = Array.from(state.assignments.keys());
    if (objectIds.length === 0) return null;

    const objectId = this.rng.choice(objectIds);

    return {
      type: StructuredMoveType.DELETION,
      objectId,
      params: {},
      proposalWeight: weight,
    };
  }

  /**
   * Generate a TRANSLATION move: small positional perturbation.
   */
  private proposeTranslation(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove | null {
    const objectIds = Array.from(state.assignments.keys());
    if (objectIds.length === 0) return null;

    const objectId = this.rng.choice(objectIds);

    // Compute displacement vector (small perturbation)
    const translateScale = 0.3;
    const displacement = {
      x: (this.rng.next() - 0.5) * 2 * translateScale,
      y: (this.rng.next() - 0.5) * 2 * translateScale * 0.3, // less vertical movement
      z: (this.rng.next() - 0.5) * 2 * translateScale,
    };

    return {
      type: StructuredMoveType.TRANSLATION,
      objectId,
      params: { displacement },
      proposalWeight: weight,
    };
  }

  /**
   * Generate a ROTATION move: small rotational perturbation.
   */
  private proposeRotation(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove | null {
    const objectIds = Array.from(state.assignments.keys());
    if (objectIds.length === 0) return null;

    const objectId = this.rng.choice(objectIds);

    // Compute rotation delta (Euler angles)
    const rotateScale = 0.2;
    const rotationDelta = {
      x: (this.rng.next() - 0.5) * 2 * rotateScale,
      y: (this.rng.next() - 0.5) * 2 * Math.PI, // Full Y rotation range
      z: (this.rng.next() - 0.5) * 2 * rotateScale,
    };

    return {
      type: StructuredMoveType.ROTATION,
      objectId,
      params: { rotationDelta },
      proposalWeight: weight,
    };
  }

  /**
   * Generate a RESCALE move: change scale of an existing object.
   */
  private proposeRescale(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove | null {
    const objectIds = Array.from(state.assignments.keys());
    if (objectIds.length === 0) return null;

    const objectId = this.rng.choice(objectIds);

    // Compute scale factor (multiplicative, centered around 1.0)
    const scaleFactor = 1.0 + (this.rng.next() - 0.5) * 0.4; // [0.8, 1.2]

    return {
      type: StructuredMoveType.RESCALE,
      objectId,
      params: { scaleFactor },
      proposalWeight: weight,
    };
  }

  /**
   * Generate a RESAMPLE move: re-sample an object's parameters from prior.
   */
  private proposeResample(
    state: SolverState,
    _iteration: number,
    weight: number
  ): StructuredMove | null {
    const objectIds = Array.from(state.assignments.keys());
    if (objectIds.length === 0) return null;

    const objectId = this.rng.choice(objectIds);

    // Generate new random parameters (simulating re-sampling from prior)
    const newParams: Record<string, any> = {};
    const paramCount = this.rng.nextInt(1, 4);
    for (let i = 0; i < paramCount; i++) {
      newParams[`param_${i}`] = this.rng.nextFloat(0, 1);
    }

    return {
      type: StructuredMoveType.RESAMPLE,
      objectId,
      params: { newParams, seed: this.rng.nextInt(0, 1000000) },
      proposalWeight: weight,
    };
  }

  /**
   * Check if a proposed move is valid using its registered executor.
   * If no executor is registered, defaults to true.
   */
  isValid(state: SolverState, move: StructuredMove): boolean {
    const executor = this.executors.get(move.type);
    if (!executor) return true; // Default to valid if no executor
    return executor.isValid(state, move);
  }

  /**
   * Apply a proposed move using its registered executor.
   * Returns true if the move was successfully applied.
   */
  apply(state: SolverState, move: StructuredMove): boolean {
    const executor = this.executors.get(move.type);
    if (!executor) return false; // Cannot apply without executor
    return executor.apply(state, move);
  }

  /**
   * Get the current weight for a specific move type at a given iteration.
   */
  getWeight(type: StructuredMoveType, iteration: number): number {
    const schedule = this.schedules.get(type);
    return schedule ? schedule.getWeight(iteration) : 0;
  }

  /**
   * Get the total weight across all move types at a given iteration.
   */
  getTotalWeight(iteration: number): number {
    let total = 0;
    for (const schedule of this.schedules.values()) {
      total += schedule.getWeight(iteration);
    }
    return total;
  }

  /**
   * Get a snapshot of all move type weights at a given iteration.
   * Useful for debugging and logging.
   */
  getWeightSnapshot(iteration: number): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const [type, schedule] of this.schedules) {
      snapshot[type] = schedule.getWeight(iteration);
    }
    return snapshot;
  }
}

// ============================================================================
// ViolationAwareAcceptance
// ============================================================================

/**
 * Violation-aware Metropolis-Hastings acceptance criterion.
 *
 * Ports: infinigen's `metrop_hastings_with_viol` function.
 *
 * Extends the standard MH acceptance criterion by explicitly considering
 * the number of constraint violations in addition to the energy/cost.
 *
 * Acceptance rules:
 * 1. If proposed state has FEWER violations than current → ALWAYS accept
 * 2. If proposed state has MORE violations → accept with probability
 *    based on violation increase and temperature:
 *      P = exp(-(deltaV * violationPenalty + deltaE) / T)
 * 3. If same violation count → fall back to standard MH:
 *      - If energy improves (deltaE <= 0) → always accept
 *      - If energy worsens → accept with prob exp(-deltaE / T)
 */
export class ViolationAwareAcceptance {
  /** Penalty multiplier for each additional violation */
  private violationPenalty: number;

  /** Seeded RNG for deterministic acceptance */
  private rng: SeededRandom;

  constructor(violationPenalty: number = 5.0, seed: number = 42) {
    this.violationPenalty = violationPenalty;
    this.rng = new SeededRandom(seed);
  }

  /**
   * Decide whether to accept a proposed state based on cost and violations.
   *
   * @param currentCost       Energy/cost of the current state (lower is better)
   * @param proposedCost      Energy/cost of the proposed state
   * @param currentViolations Number of constraint violations in current state
   * @param proposedViolations Number of constraint violations in proposed state
   * @param temperature       Current annealing temperature
   * @returns true if the proposed state should be accepted
   */
  accept(
    currentCost: number,
    proposedCost: number,
    currentViolations: number,
    proposedViolations: number,
    temperature: number
  ): boolean {
    const deltaE = proposedCost - currentCost;
    const deltaV = proposedViolations - currentViolations;

    // Case 1: Fewer violations → always accept (even if energy is worse)
    if (deltaV < 0) {
      return true;
    }

    // Case 2: More violations → penalize acceptance
    if (deltaV > 0) {
      if (temperature <= 0) return false;
      const penalty = deltaV * this.violationPenalty;
      const acceptanceProb = Math.exp(-(penalty + Math.max(deltaE, 0)) / temperature);
      return this.rng.next() < acceptanceProb;
    }

    // Case 3: Same violation count → standard Metropolis-Hastings
    if (deltaE <= 0) {
      return true; // Improvement → always accept
    }

    // Worse energy → accept with Boltzmann probability
    if (temperature <= 0) return false;
    return this.rng.next() < Math.exp(-deltaE / temperature);
  }

  /**
   * Count how many constraints are violated in the given state.
   *
   * Uses the evaluator's violCount function for accurate counting.
   * Falls back to domain-containment checks if evaluator state is unavailable.
   *
   * @param constraints  Iterable of constraint nodes to evaluate
   * @param state        Evaluator state containing object assignments
   * @returns Number of violated constraints
   */
  countViolations(constraints: Iterable<Node>, state: EvaluatorState): number {
    const memo = new Map<any, any>();
    let violationCount = 0;

    for (const constraint of constraints) {
      try {
        const v = violCount(constraint as any, state, memo);
        if (v > 0) {
          violationCount++;
        }
      } catch {
        // If a constraint can't be evaluated, count it as violated
        violationCount++;
      }
    }

    return violationCount;
  }

  /**
   * Count violations using a simple energy-based approach.
   * Each unit of energy corresponds to a violated constraint.
   *
   * @param energy The total energy/violation count from the solver
   * @returns Estimated number of violated constraints
   */
  countViolationsFromEnergy(energy: number): number {
    // Energy is already a violation count in our system
    return Math.round(Math.max(0, energy));
  }

  /** Get the configured violation penalty */
  getViolationPenalty(): number {
    return this.violationPenalty;
  }

  /** Update the violation penalty */
  setViolationPenalty(penalty: number): void {
    this.violationPenalty = penalty;
  }
}

// ============================================================================
// Helper: Convert StructuredMove to existing Proposal format
// ============================================================================

/**
 * Convert a StructuredMove to the existing Proposal interface used by
 * the solver loop. This provides backward compatibility.
 */
export function structuredMoveToProposal(move: StructuredMove): {
  variableId: string;
  newValue: any;
  metadata: {
    type: 'continuous' | 'discrete' | 'hybrid';
    moveType: string;
    structuredMoveType: StructuredMoveType;
    params: Record<string, any>;
    [key: string]: any;
  };
} {
  let newValue: any = move.params;

  switch (move.type) {
    case StructuredMoveType.ADDITION:
      newValue = {
        action: 'add',
        objectId: move.objectId,
        ...move.params,
      };
      break;

    case StructuredMoveType.DELETION:
      newValue = {
        action: 'delete',
        objectId: move.objectId,
      };
      break;

    case StructuredMoveType.TRANSLATION:
      newValue = {
        action: 'translate',
        objectId: move.objectId,
        displacement: move.params.displacement,
      };
      break;

    case StructuredMoveType.ROTATION:
      newValue = {
        action: 'rotate',
        objectId: move.objectId,
        rotationDelta: move.params.rotationDelta,
      };
      break;

    case StructuredMoveType.RESCALE:
      newValue = {
        action: 'rescale',
        objectId: move.objectId,
        scaleFactor: move.params.scaleFactor,
      };
      break;

    case StructuredMoveType.RESAMPLE:
      newValue = {
        action: 'resample',
        objectId: move.objectId,
        newParams: move.params.newParams,
        seed: move.params.seed,
      };
      break;
  }

  const proposalType = move.type === StructuredMoveType.ADDITION ||
                       move.type === StructuredMoveType.DELETION ||
                       move.type === StructuredMoveType.RESAMPLE
    ? 'discrete'
    : 'continuous';

  return {
    variableId: move.objectId,
    newValue,
    metadata: {
      type: proposalType,
      moveType: move.type,
      structuredMoveType: move.type,
      params: move.params,
    },
  };
}
