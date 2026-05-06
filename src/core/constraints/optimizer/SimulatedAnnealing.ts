/**
 * Simulated Annealing Optimizer
 * Ported from original Infinigen's annealing system
 */

import { ConstraintDomain, ConstraintEvaluationResult } from '../core/ConstraintTypes';
import { MoveOperatorFactory, Move, MoveType, MoveResult } from '../moves/MoveOperators';
import { Vector3 } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { Logger } from '../../util/Logger';

export interface AnnealingConfig {
  initialTemperature: number;
  minTemperature: number;
  coolingRate: number;
  maxIterationsPerTemp: number;
  randomSeed?: number;
  debugMode: boolean;
  acceptanceThreshold: number;
  /** Whether to use violation-aware acceptance (always accept violation-reducing moves) */
  violationAware?: boolean;
  /** Whether to separate hard constraints from soft scores */
  separateHardSoft?: boolean;
  /** Linear decay schedule for move weights: addition dominates early, continuous dominates late */
  linearDecaySchedule?: boolean;
  /** Total iterations for linear decay schedule calculation */
  totalIterationsEstimate?: number;
}

export interface AnnealingStats {
  totalIterations: number;
  acceptedMoves: number;
  rejectedMoves: number;
  finalEnergy: number;
  temperatureSchedule: number[];
  energyHistory: number[];
}

export class SimulatedAnnealing {
  private domain: ConstraintDomain;
  private config: AnnealingConfig;
  private moveFactory: MoveOperatorFactory;
  private currentTemperature: number = 0;
  private currentEnergy: number = Infinity;
  private iterationCount: number = 0;
  private stats: AnnealingStats;
  private rng: SeededRandom;

  /** Count of hard constraint violations in current state */
  private currentHardViolations: number = Infinity;

  /** Move weight schedule for linear decay (addition heavy early, continuous heavy late) */
  private moveWeights: Map<MoveType, number> = new Map();

  constructor(domain: ConstraintDomain, config: Partial<AnnealingConfig> = {}) {
    this.domain = domain;
    this.config = {
      initialTemperature: config.initialTemperature ?? 1000,
      minTemperature: config.minTemperature ?? 0.1,
      coolingRate: config.coolingRate ?? 0.95,
      maxIterationsPerTemp: config.maxIterationsPerTemp ?? 100,
      randomSeed: config.randomSeed,
      debugMode: config.debugMode ?? false,
      acceptanceThreshold: config.acceptanceThreshold ?? 0.001,
      violationAware: config.violationAware ?? false,
      separateHardSoft: config.separateHardSoft ?? false,
      linearDecaySchedule: config.linearDecaySchedule ?? false,
      totalIterationsEstimate: config.totalIterationsEstimate ?? 10000,
    };
    
    this.rng = new SeededRandom(this.config.randomSeed ?? 42);
    this.moveFactory = new MoveOperatorFactory(domain);
    this.stats = {
      totalIterations: 0,
      acceptedMoves: 0,
      rejectedMoves: 0,
      finalEnergy: 0,
      temperatureSchedule: [],
      energyHistory: [],
    };

    // Initialize move weights (equal by default)
    for (const mt of Object.values(MoveType)) {
      this.moveWeights.set(mt, 1.0);
    }
  }

  /**
   * Run simulated annealing optimization
   */
  optimize(): AnnealingStats {
    this.currentTemperature = this.config.initialTemperature;
    this.iterationCount = 0;
    
    // Evaluate initial state
    const initialEval = this.evaluateCurrentState();
    this.currentEnergy = initialEval.energy;
    
    if (this.config.debugMode) {
      Logger.debug('Annealing', `Initial energy: ${this.currentEnergy.toFixed(2)}`);
    }

    while (this.currentTemperature > this.config.minTemperature) {
      this.stats.temperatureSchedule.push(this.currentTemperature);
      
      // Perform iterations at current temperature
      for (let i = 0; i < this.config.maxIterationsPerTemp; i++) {
        this.iterationCount++;
        
        // Generate and evaluate a move
        const move = this.generateWeightedRandomMove();
        const result = this.tryMove(move);
        
        if (result.success) {
          const shouldAccept = this.config.violationAware
            ? this.violationAwareAccept(result)
            : (result.energyChange <= 0 || this.acceptWithProbability(result.energyChange));

          if (shouldAccept) {
            // Accept the move
            this.stats.acceptedMoves++;
            this.currentEnergy += result.energyChange;
            if (result.hardViolationChange !== undefined) {
              this.currentHardViolations += result.hardViolationChange;
            }
            
            if (this.config.debugMode && this.iterationCount % 100 === 0) {
              Logger.debug('Annealing', `Iter ${this.iterationCount}, Temp: ${this.currentTemperature.toFixed(2)}, Energy: ${this.currentEnergy.toFixed(2)}`);
            }
          } else {
            // Reject the move (undo)
            this.stats.rejectedMoves++;
            this.moveFactory.undoMove(move);
          }
        }
        
        this.stats.energyHistory.push(this.currentEnergy);
        
        // Early termination if energy is zero (perfect solution)
        if (this.currentEnergy < this.config.acceptanceThreshold) {
          if (this.config.debugMode) {
            Logger.debug('Annealing', `Converged to near-zero energy at iteration ${this.iterationCount}`);
          }
          break;
        }
      }
      
      // Cool down
      this.currentTemperature *= this.config.coolingRate;
    }

    this.stats.totalIterations = this.iterationCount;
    this.stats.finalEnergy = this.currentEnergy;

    if (this.config.debugMode) {
      Logger.debug('Annealing', 'Optimization complete:');
      Logger.debug('Annealing', `  - Total iterations: ${this.stats.totalIterations}`);
      Logger.debug('Annealing', `  - Accepted moves: ${this.stats.acceptedMoves}`);
      Logger.debug('Annealing', `  - Rejected moves: ${this.stats.rejectedMoves}`);
      Logger.debug('Annealing', `  - Final energy: ${this.stats.finalEnergy.toFixed(2)}`);
    }

    return this.stats;
  }

  /**
   * Violation-aware acceptance: always accept moves that reduce hard constraint violations,
   * always reject moves that increase hard constraint violations, use standard
   * Metropolis-Hastings for moves that don't change violation count.
   * 
   * This is the most critical improvement for convergence: hard constraints
   * (like collision, stability, containment) must be satisfied before
   * optimizing soft scores (like alignment, proximity preferences).
   */
  private violationAwareAccept(result: MoveResult & { energyChange: number; hardViolationChange?: number }): boolean {
    const violationChange = result.hardViolationChange ?? 0;

    // Always accept moves that reduce hard constraint violations
    if (violationChange < 0) return true;

    // Always reject moves that increase hard constraint violations
    if (violationChange > 0) return false;

    // For moves that don't change violation count, use standard Metropolis-Hastings
    return result.energyChange <= 0 || this.acceptWithProbability(result.energyChange);
  }

  /**
   * Update move weights using linear decay schedule.
   * Addition moves dominate early (to populate the scene),
   * continuous moves (translate, rotate) dominate late (to fine-tune positions).
   * 
   * Based on the original's LinearDecaySchedule:
   *   addition_weight = max(0, 1 - progress)
   *   deletion_weight = max(0, 0.5 - progress)  
   *   continuous_weight = progress
   *   reassignment_weight = 0.3
   */
  private updateMoveWeights(progress: number): void {
    if (!this.config.linearDecaySchedule) return;

    const p = Math.max(0, Math.min(1, progress));

    // Addition: high early, zero late
    this.moveWeights.set(MoveType.ADD, Math.max(0.05, 1 - p));
    // Deletion: moderate early, zero late
    this.moveWeights.set(MoveType.DELETE, Math.max(0.05, 0.5 - p * 0.5));
    // Pose (continuous): low early, high late
    this.moveWeights.set(MoveType.POSE, 0.1 + p * 0.9);
    // Swap: moderate throughout
    this.moveWeights.set(MoveType.SWAP, 0.3);
    // Reassignment: moderate throughout
    this.moveWeights.set(MoveType.REASSIGN, 0.3);
  }

  /**
   * Generate a weighted random move using the current move weights.
   * Moves with higher weights are more likely to be selected.
   */
  private generateWeightedRandomMove(): Move {
    if (this.config.linearDecaySchedule) {
      const totalEstimate = this.config.totalIterationsEstimate ?? 10000;
      const progress = this.iterationCount / totalEstimate;
      this.updateMoveWeights(progress);
    }

    // Weighted random selection of move type
    const moveTypes = Object.values(MoveType);
    const weights = moveTypes.map(mt => this.moveWeights.get(mt) ?? 1.0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    let random = this.rng.next() * totalWeight;
    let selectedType = moveTypes[0];
    for (let i = 0; i < moveTypes.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedType = moveTypes[i];
        break;
      }
    }

    // Build move with selected type (reuse existing logic)
    return this.generateMoveOfType(selectedType);
  }

  /**
   * Generate a random move based on current state
   */
  private generateRandomMove(): Move {
    return this.generateWeightedRandomMove();
  }

  /**
   * Generate a move of a specific type
   */
  private generateMoveOfType(moveType: MoveType): Move {
    const objects = Array.from(this.domain.objects.keys());
    const rooms = Array.from(this.domain.rooms.keys());
    
    const move: Move = {
      id: `move_${this.iterationCount}`,
      type: moveType,
    };

    switch (moveType) {
      case MoveType.SWAP:
        if (objects.length >= 2) {
          const idx1 = this.rng.nextInt(0, objects.length - 1);
          let idx2 = this.rng.nextInt(0, objects.length - 1);
          while (idx2 === idx1 && objects.length > 1) {
            idx2 = this.rng.nextInt(0, objects.length - 1);
          }
          move.objectId = objects[idx1];
          move.targetObjectId = objects[idx2];
        }
        break;

      case MoveType.POSE:
        if (objects.length > 0) {
          move.objectId = this.rng.choice(objects);
          // Small random perturbation
          move.position = this.domain.objects.get(move.objectId)!.position.clone();
          move.position.x += (this.rng.next() - 0.5) * 2;
          move.position.z += (this.rng.next() - 0.5) * 2;
        }
        break;

      case MoveType.ADD:
        move.objectId = `obj_${Date.now()}_${this.rng.nextInt(0, 0xffffff).toString(36)}`;
        move.position = new Vector3(
          (this.rng.next() - 0.5) * 20,
          0,
          (this.rng.next() - 0.5) * 20,
        );
        if (rooms.length > 0) {
          move.roomId = this.rng.choice(rooms);
        }
        break;

      case MoveType.DELETE:
        if (objects.length > 0) {
          move.objectId = this.rng.choice(objects);
        }
        break;

      case MoveType.REASSIGN:
        if (objects.length > 0 && rooms.length > 0) {
          move.objectId = this.rng.choice(objects);
          move.roomId = this.rng.choice(rooms);
        }
        break;
    }

    return move;
  }

  /**
   * Try a move and calculate energy change
   */
  private tryMove(move: Move): MoveResult & { energyChange: number } {
    // Execute the move
    const execResult = this.moveFactory.executeMove(move);
    
    if (!execResult.success) {
      return { ...execResult, energyChange: 0 };
    }

    // Evaluate new state
    const newEval = this.evaluateCurrentState();
    const energyChange = newEval.energy - this.currentEnergy;

    return {
      ...execResult,
      energyChange,
    };
  }

  /**
   * Decide whether to accept a worse move based on temperature
   */
  private acceptWithProbability(energyChange: number): boolean {
    if (energyChange <= 0) return true;
    
    const probability = Math.exp(-energyChange / this.currentTemperature);
    return this.rng.next() < probability;
  }

  /**
   * Evaluate current constraint satisfaction state
   */
  private evaluateCurrentState(): ConstraintEvaluationResult {
    // Simplified evaluation - in full implementation would use GreedySolver
    let totalViolations = 0;
    let totalEnergy = 0;

    // Placeholder: count objects not in any room as violations
    for (const [objectId, obj] of this.domain.objects.entries()) {
      let inRoom = false;
      for (const room of this.domain.rooms.values()) {
        if (room.objects.has(objectId)) {
          inRoom = true;
          break;
        }
      }
      if (!inRoom) {
        totalViolations++;
        totalEnergy += 10; // Penalty for not being in a room
      }
    }

    return {
      isSatisfied: totalViolations === 0,
      totalViolations,
      violations: [],
      energy: totalEnergy,
    };
  }

  /**
   * Get optimization statistics
   */
  getStats(): AnnealingStats {
    return { ...this.stats };
  }

  /**
   * Get current energy
   */
  getCurrentEnergy(): number {
    return this.currentEnergy;
  }

  /**
   * Get current temperature
   */
  getCurrentTemperature(): number {
    return this.currentTemperature;
  }
}
