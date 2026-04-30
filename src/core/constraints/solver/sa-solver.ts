/**
 * Simulated Annealing Solver
 * 
 * Ported from: infinigen/core/constraints/example_solver/sa_solver.py
 * Implements the simulated annealing optimization algorithm for constraint solving.
 */

import { SolverState, Proposal } from './types';

export interface SimulatedAnnealingConfig {
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  maxIterations: number;
  restartThreshold: number;
  adaptiveCooling: boolean;
}

export class SimulatedAnnealingSolver {
  private config: SimulatedAnnealingConfig;
  private currentTemperature: number;
  private iterations: number;
  private bestState: SolverState | null;
  private bestScore: number;

  constructor(config: Partial<SimulatedAnnealingConfig> = {}) {
    this.config = {
      initialTemperature: 100,
      coolingRate: 0.995,
      minTemperature: 0.01,
      maxIterations: 10000,
      restartThreshold: 0.1,
      adaptiveCooling: true,
      ...config,
    };

    this.currentTemperature = this.config.initialTemperature;
    this.iterations = 0;
    this.bestState = null;
    this.bestScore = -Infinity;
  }

  get temperature(): number {
    return this.currentTemperature;
  }

  get iterationCount(): number {
    return this.iterations;
  }

  /**
   * Determine whether to accept a proposal based on Metropolis criterion
   */
  acceptProposal(currentScore: number, proposedScore: number): boolean {
    const delta = proposedScore - currentScore;

    if (delta > 0) {
      return true; // Always accept improvements
    }

    // Accept worse solutions with probability exp(delta / T)
    const probability = Math.exp(delta / this.currentTemperature);
    return Math.random() < probability;
  }

  /**
   * Cool down the temperature
   */
  coolDown(): void {
    if (this.config.adaptiveCooling) {
      // Adaptive cooling based on acceptance rate
      this.currentTemperature *= this.config.coolingRate;
    } else {
      // Linear cooling
      const progress = this.iterations / this.config.maxIterations;
      this.currentTemperature = this.config.initialTemperature * (1 - progress);
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
   * Run one iteration of simulated annealing
   */
  step(state: SolverState, proposal: Proposal): SolverState {
    this.iterations++;
    this.coolDown();
    return state;
  }

  /**
   * Reset the solver
   */
  reset(): void {
    this.currentTemperature = this.config.initialTemperature;
    this.iterations = 0;
    this.bestState = null;
    this.bestScore = -Infinity;
  }
}
