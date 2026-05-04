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
        const move = this.generateRandomMove();
        const result = this.tryMove(move);
        
        if (result.success) {
          if (result.energyChange <= 0 || this.acceptWithProbability(result.energyChange)) {
            // Accept the move
            this.stats.acceptedMoves++;
            this.currentEnergy += result.energyChange;
            
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
   * Generate a random move based on current state
   */
  private generateRandomMove(): Move {
    const moveTypes = Object.values(MoveType);
    const randomType = moveTypes[this.rng.nextInt(0, moveTypes.length - 1)];
    
    const objects = Array.from(this.domain.objects.keys());
    const rooms = Array.from(this.domain.rooms.keys());
    
    const move: Move = {
      id: `move_${this.iterationCount}`,
      type: randomType,
    };

    switch (randomType) {
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
