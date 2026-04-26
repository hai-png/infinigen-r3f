/**
 * Solver Moves Module
 *
 * Ports: infinigen/core/constraints/example_solver/moves/
 *
 * Defines the move abstraction for constraint-based scene optimization.
 * Moves represent transformations applied to objects during solving.
 */
import { Vector3 } from '../util/math/index.js';
import { State } from '../constraints/evaluator/state.js';
import { Problem } from '../language/constants.js';
/**
 * Base Move abstraction
 * Represents a transformation that can be applied to a scene state
 */
export declare abstract class Move {
    readonly scoreBefore: number;
    readonly scoreBefore: number;
    readonly scoreAfter?: number;
    constructor(scoreBefore: number);
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
export declare class TranslateMove extends Move {
    readonly objectName: string;
    readonly translation: Vector3;
    constructor(objectName: string, translation: Vector3, scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Rotate Move - rotates an object around its center
 */
export declare class RotateMove extends Move {
    readonly objectName: string;
    readonly rotation: Vector3;
    constructor(objectName: string, rotation: Vector3, // Euler angles in radians
    scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Swap Move - swaps positions of two objects
 */
export declare class SwapMove extends Move {
    readonly objectName1: string;
    readonly objectName2: string;
    constructor(objectName1: string, objectName2: string, scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Deletion Move - removes an object from the scene
 */
export declare class DeletionMove extends Move {
    readonly objectName: string;
    constructor(objectName: string, scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Reassignment Move - changes an object's semantic tags
 */
export declare class ReassignmentMove extends Move {
    readonly objectName: string;
    readonly newTags: Set<Semantics>;
    constructor(objectName: string, newTags: Set<Semantics>, scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Addition Move - adds a new object to the scene
 * Note: In browser context, this requires asset instantiation via hybrid bridge
 */
export declare class AdditionMove extends Move {
    readonly objectName: string;
    readonly tags: Set<Semantics>;
    readonly pose: {
        position: Vector3;
        rotation: Vector3;
    };
    constructor(objectName: string, tags: Set<Semantics>, pose: {
        position: Vector3;
        rotation: Vector3;
    }, scoreBefore: number);
    apply(state: State): State;
    reverse(state: State): State;
    isValid(state: State): boolean;
    getMoveId(): string;
}
/**
 * Solver State - represents the current state of the optimization
 */
export interface SolverState {
    state: State;
    score: number;
    iteration: number;
    temperature?: number;
}
/**
 * Base solver interface
 */
export declare abstract class Solver {
    protected problem: Problem;
    protected initialState: State;
    constructor(problem: Problem, initialState: State);
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
    evaluateState(state: State): number;
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
export declare class SimulatedAnnealingSolver extends Solver {
    private config;
    private currentScore;
    private bestScore;
    private bestState;
    constructor(problem: Problem, initialState: State, config?: Partial<SimulatedAnnealingConfig>);
    solve(maxIterations?: number): Promise<SolverState>;
    generateMoves(state: State, count: number): Move[];
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
export declare class GreedySolver extends Solver {
    private config;
    private currentScore;
    private bestScore;
    private bestState;
    constructor(problem: Problem, initialState: State, config?: Partial<GreedyConfig>);
    solve(maxIterations?: number): Promise<SolverState>;
    generateMoves(state: State, count: number): Move[];
}
//# sourceMappingURL=moves.d.ts.map