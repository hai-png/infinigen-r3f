// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, David Yan
// Ported to TypeScript for React Three Fiber

/**
 * Solver Moves Module
 * 
 * Ports: infinigen/core/constraints/example_solver/moves/
 * 
 * Defines the move abstraction for constraint-based scene optimization.
 * Moves represent transformations applied to objects during solving.
 */

import { Vector3 } from '../../util/math/index';
import { State, ObjectState } from '../evaluator/state';
import { Problem } from '../language/constants';
import { Semantics, TagSet, Tag } from '../tags/index';

/**
 * Base Move abstraction
 * Represents a transformation that can be applied to a scene state
 */
export abstract class Move {
  readonly scoreBefore: number;
  readonly scoreAfter?: number;
  /** Names of objects affected by this move */
  abstract readonly names: string[];
  
  constructor(scoreBefore: number) {
    this.scoreBefore = scoreBefore;
  }
  
  /**
   * Apply the move to the given state
   */
  abstract apply(state: State): State;
  
  /**
   * Reverse the move (for backtracking)
   */
  abstract reverse(state: State): State;
  
  /**
   * Check if this move is valid in the current state
   */
  abstract isValid(state: State): boolean;
  
  /**
   * Get a unique identifier for this move
   */
  abstract getMoveId(): string;
}

/**
 * Configuration for pose-based moves
 */
export interface PoseMoveConfig {
  objectName: string;
  translation?: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
}

/**
 * Translate Move - moves an object by a translation vector
 */
export class TranslateMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName: string,
    readonly translation: Vector3,
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName];
  }
  
  apply(state: State): State {
    const newObjState = new ObjectState(
      this.objectName,
      state.objects.get(this.objectName)!.tags,
      {
        ...state.objects.get(this.objectName)!.pose,
        position: {
          x: state.objects.get(this.objectName)!.pose.position.x + this.translation.x,
          y: state.objects.get(this.objectName)!.pose.position.y + this.translation.y,
          z: state.objects.get(this.objectName)!.pose.position.z + this.translation.z
        }
      }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    const objState = state.objects.get(this.objectName);
    if (!objState) return state;
    
    const newObjState = new ObjectState(
      this.objectName,
      objState.tags,
      {
        ...objState.pose,
        position: {
          x: objState.pose.position.x - this.translation.x,
          y: objState.pose.position.y - this.translation.y,
          z: objState.pose.position.z - this.translation.z
        }
      }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  isValid(state: State): boolean {
    return state.objects.has(this.objectName);
  }
  
  getMoveId(): string {
    return `translate_${this.objectName}_${this.translation.x.toFixed(2)}_${this.translation.y.toFixed(2)}_${this.translation.z.toFixed(2)}`;
  }
}

/**
 * Rotate Move - rotates an object around its center
 */
export class RotateMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName: string,
    readonly rotation: Vector3, // Euler angles in radians
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName];
  }
  
  apply(state: State): State {
    const objState = state.objects.get(this.objectName);
    if (!objState) return state;
    
    const newObjState = new ObjectState(
      this.objectName,
      objState.tags,
      {
        ...objState.pose,
        rotation: {
          x: objState.pose.rotation.x + this.rotation.x,
          y: objState.pose.rotation.y + this.rotation.y,
          z: objState.pose.rotation.z + this.rotation.z
        }
      }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    const objState = state.objects.get(this.objectName);
    if (!objState) return state;
    
    const newObjState = new ObjectState(
      this.objectName,
      objState.tags,
      {
        ...objState.pose,
        rotation: {
          x: objState.pose.rotation.x - this.rotation.x,
          y: objState.pose.rotation.y - this.rotation.y,
          z: objState.pose.rotation.z - this.rotation.z
        }
      }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  isValid(state: State): boolean {
    return state.objects.has(this.objectName);
  }
  
  getMoveId(): string {
    return `rotate_${this.objectName}_${this.rotation.x.toFixed(2)}_${this.rotation.y.toFixed(2)}_${this.rotation.z.toFixed(2)}`;
  }
}

/**
 * Swap Move - swaps positions of two objects
 */
export class SwapMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName1: string,
    readonly objectName2: string,
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName1, objectName2];
  }
  
  apply(state: State): State {
    const obj1 = state.objects.get(this.objectName1);
    const obj2 = state.objects.get(this.objectName2);
    
    if (!obj1 || !obj2) return state;
    
    const newObjects = new Map(state.objects);
    
    // Swap poses
    newObjects.set(this.objectName1, new ObjectState(
      this.objectName1,
      obj1.tags,
      { ...obj2.pose }
    ));
    
    newObjects.set(this.objectName2, new ObjectState(
      this.objectName2,
      obj2.tags,
      { ...obj1.pose }
    ));
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    // Swap is its own reverse
    return this.apply(state);
  }
  
  isValid(state: State): boolean {
    return state.objects.has(this.objectName1) && 
           state.objects.has(this.objectName2);
  }
  
  getMoveId(): string {
    return `swap_${this.objectName1}_${this.objectName2}`;
  }
}

/**
 * Deletion Move - removes an object from the scene
 */
export class DeletionMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName: string,
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName];
  }
  
  apply(state: State): State {
    const newObjects = new Map(state.objects);
    newObjects.delete(this.objectName);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    // Cannot reverse deletion without storing the deleted object state
    // This should be handled by storing the deleted state before applying
    throw new Error('DeletionMove.reverse() requires stored object state');
  }
  
  isValid(state: State): boolean {
    return state.objects.has(this.objectName);
  }
  
  getMoveId(): string {
    return `delete_${this.objectName}`;
  }
}

/**
 * Reassignment Move - changes an object's semantic tags
 */
export class ReassignmentMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName: string,
    readonly newTags: Set<Tag>,
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName];
  }
  
  apply(state: State): State {
    const objState = state.objects.get(this.objectName);
    if (!objState) return state;
    
    const newObjState = new ObjectState(
      this.objectName,
      new TagSet(new Set<Tag>(this.newTags)),
      { ...objState.pose }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    // Cannot reverse without storing old tags
    throw new Error('ReassignmentMove.reverse() requires stored tag state');
  }
  
  isValid(state: State): boolean {
    return state.objects.has(this.objectName);
  }
  
  getMoveId(): string {
    const tagsStr = Array.from(this.newTags).join(',');
    return `reassign_${this.objectName}_${tagsStr}`;
  }
}

/**
 * Re-exports for backward compatibility with eval-memo
 * These type aliases match the constraint language type system
 */
export type Addition = AdditionMove;
export type ReinitPoseMove = { variable: string; newDomain: any };
export type RelationPlaneChange = { relation: string; fromPlane: string; toPlane: string };
export type Resample = { variable: string; domain: any };
export type Deletion = DeletionMove;

/**
 * Addition Move - adds a new object to the scene
 * Note: In browser context, this requires asset instantiation via hybrid bridge
 */
export class AdditionMove extends Move {
  readonly names: string[];
  constructor(
    readonly objectName: string,
    readonly tags: Set<Tag>,
    readonly pose: { position: Vector3; rotation: Vector3 },
    scoreBefore: number
  ) {
    super(scoreBefore);
    this.names = [objectName];
  }
  
  apply(state: State): State {
    // In pure TS/R3F context, we create a placeholder object state
    // Actual mesh instantiation happens via hybrid bridge or R3F components
    const newObjState = new ObjectState(
      this.objectName,
      new TagSet(new Set<Tag>(this.tags)),
      { ...this.pose }
    );
    
    const newObjects = new Map(state.objects);
    newObjects.set(this.objectName, newObjState);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  reverse(state: State): State {
    const newObjects = new Map(state.objects);
    newObjects.delete(this.objectName);
    
    return new State(newObjects, state.problem, new Map(state.bvhCache));
  }
  
  isValid(state: State): boolean {
    // Can only add if object doesn't already exist
    return !state.objects.has(this.objectName);
  }
  
  getMoveId(): string {
    return `add_${this.objectName}`;
  }
}

/**
 * Solver State - represents the current state of the optimization
 */
export interface SolverState {
  state: State;
  score: number;
  iteration: number;
  temperature?: number; // For simulated annealing
  /** Alias - some consumers access objects directly */
  objects?: Map<string, ObjectState>;
  /** Current energy (lower is better) */
  energy: number;
  /** Current score */
  currentScore: number;
  /** Best score found so far */
  bestScore: number;
  /** Variable assignments (variable id -> value) */
  assignments: Map<string, any>;
  /** Last proposed move */
  lastMove: any | null;
  /** Whether last move was accepted */
  lastMoveAccepted: boolean;
}

/**
 * Base solver interface
 */
export abstract class Solver {
  protected problem: Problem;
  protected initialState: State;
  
  constructor(problem: Problem, initialState: State) {
    this.problem = problem;
    this.initialState = initialState;
  }
  
  /**
   * Solve the constraint satisfaction problem
   */
  abstract solve(maxIterations: number): Promise<SolverState>;
  
  /**
   * Generate candidate moves for the current state
   */
  abstract generateMoves(state: State, count: number): Move[];
  
  /**
   * Evaluate a state against the problem constraints
   */
  evaluateState(state: State): number {
    // This would call the evaluator
    // For now, delegate to external evaluator
    throw new Error('evaluateState must be implemented with evaluator integration');
  }
}

/**
 * Simulated Annealing configuration
 */
export interface SimulatedAnnealingConfig {
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  maxIterations: number;
  movesPerIteration: number;
}

/**
 * Simulated Annealing Solver
 * 
 * Ports: infinigen/core/constraints/example_solver/annealing.py
 * 
 * Uses simulated annealing to optimize scene configurations
 */
export class SimulatedAnnealingSolver extends Solver {
  private config: SimulatedAnnealingConfig;
  private currentScore: number;
  private bestScore: number;
  private bestState: State;
  private currentTemperature: number;
  private currentIteration: number;
  
  constructor(
    problem?: Problem,
    initialState?: State,
    config: Partial<SimulatedAnnealingConfig> = {}
  ) {
    super(problem ?? new Problem(), initialState ?? new State());
    
    this.config = {
      initialTemperature: 100.0,
      coolingRate: 0.95,
      minTemperature: 0.01,
      maxIterations: 1000,
      movesPerIteration: 10,
      ...config
    };
    
    this.currentScore = 0;
    this.bestScore = Infinity;
    this.bestState = initialState ?? new State();
    this.currentTemperature = this.config.initialTemperature;
    this.currentIteration = 0;
  }

  /**
   * Perform a single step of simulated annealing.
   *
   * Applies the Metropolis criterion:
   *  1. Evaluate current state energy
   *  2. Evaluate proposed state energy (apply proposal temporarily)
   *  3. Accept if energy decreases, otherwise accept with probability
   *     exp(-deltaE / T)
   *  4. Update state if accepted
   *  5. Cool down temperature
   */
  step(state: SolverState, proposal: any): SolverState {
    this.currentIteration++;

    // 1. Current energy
    const currentEnergy = state.energy;

    // 2. Proposed energy – if proposal carries a score use it, otherwise
    //    fall back to evaluating the state with the proposed move applied
    let proposedEnergy = currentEnergy;
    if (proposal && proposal.score !== undefined && proposal.score !== 0) {
      proposedEnergy = proposal.score;
    } else if (proposal && proposal.newState) {
      // Try to evaluate the proposed state
      try {
        proposedEnergy = this.evaluateState(proposal.newState instanceof State ? proposal.newState : this.initialState);
      } catch {
        proposedEnergy = currentEnergy; // fallback
      }
    }

    // 3. Metropolis criterion
    const deltaE = proposedEnergy - currentEnergy;
    let accepted = false;
    if (deltaE <= 0) {
      accepted = true; // always accept improvements
    } else if (this.currentTemperature > 0) {
      accepted = Math.random() < Math.exp(-deltaE / this.currentTemperature);
    }

    // 4. Update state
    let newEnergy = currentEnergy;
    const newAssignments = new Map(state.assignments);
    if (accepted) {
      newEnergy = proposedEnergy;
      if (proposal && proposal.variableId) {
        newAssignments.set(proposal.variableId, proposal.newValue);
      }
    }

    // Track best
    const newBestScore = (newEnergy < state.bestScore || state.bestScore === -Infinity)
      ? newEnergy : state.bestScore;

    // 5. Cool down
    this.currentTemperature = Math.max(
      this.currentTemperature * this.config.coolingRate,
      0.01
    );

    return {
      ...state,
      iteration: this.currentIteration,
      temperature: this.currentTemperature,
      energy: newEnergy,
      currentScore: -newEnergy,
      bestScore: newBestScore,
      assignments: newAssignments,
      lastMove: proposal ?? null,
      lastMoveAccepted: accepted,
    };
  }
  
  async solve(maxIterations?: number): Promise<SolverState> {
    let temperature = this.config.initialTemperature;
    let iteration = 0;
    let currentState = this.initialState;
    
    const iterations = maxIterations || this.config.maxIterations;
    
    while (temperature > this.config.minTemperature && iteration < iterations) {
      // Generate and evaluate moves
      const moves = this.generateMoves(currentState, this.config.movesPerIteration);
      
      for (const move of moves) {
        if (!move.isValid(currentState)) continue;
        
        const newState = move.apply(currentState);
        const newScore = this.evaluateState(newState);
        
        // Accept or reject based on Metropolis criterion
        const deltaE = newScore - this.currentScore;
        
        if (deltaE < 0 || Math.random() < Math.exp(-deltaE / temperature)) {
          currentState = newState;
          this.currentScore = newScore;
          
          // Track best solution
          if (newScore < this.bestScore) {
            this.bestScore = newScore;
            this.bestState = newState;
          }
        }
      }
      
      // Cool down
      temperature *= this.config.coolingRate;
      iteration++;
      
      // Yield control for async operation
      if (iteration % 10 === 0) {
        await Promise.resolve();
      }
    }
    
    return {
      state: this.bestState,
      score: this.bestScore,
      iteration,
      temperature,
      energy: this.bestScore,
      currentScore: this.bestScore,
      bestScore: this.bestScore,
      assignments: new Map(),
      lastMove: null,
      lastMoveAccepted: false
    };
  }
  
  generateMoves(state: State, count: number): Move[] {
    const moves: Move[] = [];
    const objects = Array.from(state.objects.values());
    
    for (let i = 0; i < count && objects.length > 0; i++) {
      const obj = objects[Math.floor(Math.random() * objects.length)];
      const moveType = Math.random();
      
      if (moveType < 0.4) {
        // Translation move
        const translation = new Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        );
        moves.push(new TranslateMove(obj.name, translation, this.currentScore));
      } else if (moveType < 0.7) {
        // Rotation move
        const rotation = new Vector3(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3
        );
        moves.push(new RotateMove(obj.name, rotation, this.currentScore));
      } else if (moveType < 0.9 && objects.length > 1) {
        // Swap move
        const otherObj = objects.find(o => o.name !== obj.name);
        if (otherObj) {
          moves.push(new SwapMove(obj.name, otherObj.name, this.currentScore));
        }
      } else {
        // Small perturbation
        const translation = new Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        );
        moves.push(new TranslateMove(obj.name, translation, this.currentScore));
      }
    }
    
    return moves;
  }
}

/**
 * Greedy Solver configuration
 */
export interface GreedyConfig {
  maxIterations: number;
  movesPerIteration: number;
  restartThreshold: number;
}

/**
 * Greedy Solver
 * 
 * Simple greedy optimization that always accepts improving moves
 */
export class GreedySolver extends Solver {
  private config: GreedyConfig;
  private currentScore: number;
  private bestScore: number;
  private bestState: State;
  
  constructor(
    problem: Problem,
    initialState: State,
    config: Partial<GreedyConfig> = {}
  ) {
    super(problem, initialState);
    
    this.config = {
      maxIterations: 500,
      movesPerIteration: 20,
      restartThreshold: 50,
      ...config
    };
    
    this.currentScore = 0;
    this.bestScore = Infinity;
    this.bestState = initialState;
  }
  
  async solve(maxIterations?: number): Promise<SolverState> {
    let iteration = 0;
    let currentState = this.initialState;
    let noImprovementCount = 0;
    
    const iterations = maxIterations || this.config.maxIterations;
    
    while (iteration < iterations && noImprovementCount < this.config.restartThreshold) {
      const moves = this.generateMoves(currentState, this.config.movesPerIteration);
      let improved = false;
      
      for (const move of moves) {
        if (!move.isValid(currentState)) continue;
        
        const newState = move.apply(currentState);
        const newScore = this.evaluateState(newState);
        
        if (newScore < this.currentScore) {
          currentState = newState;
          this.currentScore = newScore;
          improved = true;
          noImprovementCount = 0;
          
          if (newScore < this.bestScore) {
            this.bestScore = newScore;
            this.bestState = newState;
          }
          break; // Accept first improvement
        }
      }
      
      if (!improved) {
        noImprovementCount++;
      }
      
      iteration++;
      
      if (iteration % 10 === 0) {
        await Promise.resolve();
      }
    }
    
    return {
      state: this.bestState,
      score: this.bestScore,
      iteration,
      temperature: undefined,
      energy: this.bestScore,
      currentScore: this.bestScore,
      bestScore: this.bestScore,
      assignments: new Map(),
      lastMove: null,
      lastMoveAccepted: false
    };
  }
  
  generateMoves(state: State, count: number): Move[] {
    // Same move generation as simulated annealing
    const moves: Move[] = [];
    const objects = Array.from(state.objects.values());
    
    for (let i = 0; i < count && objects.length > 0; i++) {
      const obj = objects[Math.floor(Math.random() * objects.length)];
      const moveType = Math.random();
      
      if (moveType < 0.5) {
        const translation = new Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        );
        moves.push(new TranslateMove(obj.name, translation, this.currentScore));
      } else {
        const rotation = new Vector3(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3
        );
        moves.push(new RotateMove(obj.name, rotation, this.currentScore));
      }
    }
    
    return moves;
  }
}
