/**
 * Simulated Annealing Solver
 *
 * Ported from: infinigen/core/constraints/example_solver/sa_solver.py
 * Implements the simulated annealing optimization algorithm for constraint solving.
 *
 * The step() method performs a full SA iteration:
 *  1. Generate a proposal (via the provided Proposal)
 *  2. Evaluate current state energy
 *  3. Evaluate proposed state energy
 *  4. Apply Metropolis criterion to decide acceptance
 *  5. Update state if accepted
 *  6. Cool down temperature
 */

import { SolverState, Proposal } from './types';

export interface SimulatedAnnealingConfig {
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  maxIterations: number;
  restartThreshold: number;
  adaptiveCooling: boolean;
  /** Number of accepted moves tracked for adaptive cooling */
  adaptiveWindowSize: number;
}

/** Track recent acceptance statistics for adaptive cooling */
interface AcceptanceStats {
  accepted: number;
  total: number;
}

export class SimulatedAnnealingSolver {
  private config: SimulatedAnnealingConfig;
  private currentTemperature: number;
  private iterations: number;
  private bestState: SolverState | null;
  private bestScore: number;
  private acceptanceWindow: AcceptanceStats[];

  constructor(config: Partial<SimulatedAnnealingConfig> = {}) {
    this.config = {
      initialTemperature: 100,
      coolingRate: 0.995,
      minTemperature: 0.01,
      maxIterations: 10000,
      restartThreshold: 0.1,
      adaptiveCooling: true,
      adaptiveWindowSize: 50,
      ...config,
    };

    this.currentTemperature = this.config.initialTemperature;
    this.iterations = 0;
    this.bestState = null;
    this.bestScore = -Infinity;
    this.acceptanceWindow = [];
  }

  get temperature(): number {
    return this.currentTemperature;
  }

  get iterationCount(): number {
    return this.iterations;
  }

  /**
   * Initialize solver with constraint system
   */
  initialize(constraintSystem: any): SolverState {
    return {
      iteration: 0,
      energy: 0,
      currentScore: 0,
      bestScore: -Infinity,
      assignments: new Map(),
      lastMove: null,
      lastMoveAccepted: false
    };
  }

  /**
   * Determine whether to accept a proposal based on Metropolis criterion.
   *
   * We work with *energy* where lower is better (constraint violations).
   * A move that reduces energy (deltaE < 0) is always accepted.
   * A move that increases energy is accepted with probability exp(-deltaE / T).
   *
   * @param currentEnergy  Energy of the current state
   * @param proposedEnergy Energy of the proposed state
   * @returns true if the proposal should be accepted
   */
  acceptProposal(currentEnergy: number, proposedEnergy: number): boolean {
    const deltaE = proposedEnergy - currentEnergy;

    if (deltaE <= 0) {
      // Improvement – always accept
      return true;
    }

    // Worse solution – accept with Boltzmann probability
    if (this.currentTemperature <= 0) return false;
    const probability = Math.exp(-deltaE / this.currentTemperature);
    return Math.random() < probability;
  }

  /**
   * Compute the current acceptance rate over the recent window
   */
  getAcceptanceRate(): number {
    if (this.acceptanceWindow.length === 0) return 1;
    const accepted = this.acceptanceWindow.reduce((s, w) => s + w.accepted, 0);
    const total = this.acceptanceWindow.reduce((s, w) => s + w.total, 0);
    return total > 0 ? accepted / total : 0;
  }

  /**
   * Cool down the temperature.
   *
   * With adaptive cooling, the cooling rate is modulated by the
   * recent acceptance rate: if acceptance is high we cool faster,
   * if acceptance is low we cool slower to give the search more
   * time at higher temperatures.
   */
  coolDown(): void {
    if (this.config.adaptiveCooling && this.acceptanceWindow.length >= this.config.adaptiveWindowSize) {
      const rate = this.getAcceptanceRate();
      // Target acceptance rate is ~0.44 (Kirkpatrick et al.)
      const targetRate = 0.44;
      const ratio = rate / targetRate;
      // If rate > target, cool faster; if rate < target, cool slower
      const adaptiveRate = this.config.coolingRate * (ratio > 1 ? Math.min(ratio, 2) : Math.max(ratio, 0.5));
      this.currentTemperature *= adaptiveRate;
    } else {
      // Standard geometric cooling
      this.currentTemperature *= this.config.coolingRate;
    }

    this.currentTemperature = Math.max(this.currentTemperature, this.config.minTemperature);
  }

  /**
   * Check if solver should terminate
   */
  shouldTerminate(): boolean {
    return (
      this.currentTemperature <= this.config.minTemperature ||
      this.iterations >= this.config.maxIterations
    );
  }

  /**
   * Run one iteration of simulated annealing.
   *
   * @param state    Current solver state
   * @param proposal A proposal containing the proposed new value/state
   * @param energyFn A function that computes the energy of a state.
   *                 Takes the current `assignments` Map and returns a number
   *                 (lower is better, 0 = all constraints satisfied).
   * @returns Updated solver state
   */
  step(
    state: SolverState,
    proposal: Proposal,
    energyFn?: (assignments: Map<string, any>) => number
  ): SolverState {
    this.iterations++;

    // ── 1. Evaluate current state energy ──────────────────────────────
    let currentEnergy = state.energy;
    if (energyFn) {
      currentEnergy = energyFn(state.assignments);
    }

    // ── 2. Evaluate proposed state energy ─────────────────────────────
    // Temporarily apply the proposal to compute proposed energy
    const oldValue = state.assignments.get(proposal.variableId);
    const proposedAssignments = new Map(state.assignments);
    proposedAssignments.set(proposal.variableId, proposal.newValue);

    let proposedEnergy = currentEnergy; // fallback: assume no change
    if (energyFn) {
      proposedEnergy = energyFn(proposedAssignments);
    } else if (proposal.score !== undefined && proposal.score !== 0) {
      // If no energy function but proposal carries a score, use it
      proposedEnergy = proposal.score;
    }

    // ── 3. Apply Metropolis criterion ─────────────────────────────────
    const accepted = this.acceptProposal(currentEnergy, proposedEnergy);

    // Track acceptance stats
    this.acceptanceWindow.push({ accepted: accepted ? 1 : 0, total: 1 });
    if (this.acceptanceWindow.length > this.config.adaptiveWindowSize) {
      this.acceptanceWindow.shift();
    }

    // ── 4. Update state if accepted ───────────────────────────────────
    let newAssignments = state.assignments;
    let newEnergy = currentEnergy;
    let newBestScore = state.bestScore;

    if (accepted) {
      newAssignments = proposedAssignments;
      newEnergy = proposedEnergy;
    }

    // Track best score (lower is better for energy)
    if (newEnergy < newBestScore || newBestScore === -Infinity) {
      newBestScore = newEnergy;
    }

    // ── 5. Cool down temperature ──────────────────────────────────────
    this.coolDown();

    // ── 6. Return updated state ───────────────────────────────────────
    const newState: SolverState = {
      iteration: this.iterations,
      energy: newEnergy,
      currentScore: -newEnergy, // Score is negative energy (higher is better)
      bestScore: newBestScore,
      assignments: newAssignments,
      lastMove: proposal,
      lastMoveAccepted: accepted,
    };

    // Keep track of best state
    if (newEnergy <= this.bestScore || this.bestScore === -Infinity) {
      this.bestScore = newEnergy;
      this.bestState = newState;
    }

    return newState;
  }

  /**
   * Reset the solver
   */
  reset(): void {
    this.currentTemperature = this.config.initialTemperature;
    this.iterations = 0;
    this.bestState = null;
    this.bestScore = -Infinity;
    this.acceptanceWindow = [];
  }

  /**
   * Get the best state found so far
   */
  getBestState(): SolverState | null {
    return this.bestState;
  }
}
