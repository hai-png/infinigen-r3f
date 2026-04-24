// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.
import { State, ObjectState } from '../constraints/evaluator/state.js';
/**
 * Base Move abstraction
 * Represents a transformation that can be applied to a scene state
 */
export class Move {
    constructor(scoreBefore) {
        this.scoreBefore = scoreBefore;
    }
}
/**
 * Translate Move - moves an object by a translation vector
 */
export class TranslateMove extends Move {
    constructor(objectName, translation, scoreBefore) {
        super(scoreBefore);
        this.objectName = objectName;
        this.translation = translation;
    }
    apply(state) {
        const newObjState = new ObjectState(this.objectName, state.objects.get(this.objectName).tags, {
            ...state.objects.get(this.objectName).pose,
            position: {
                x: state.objects.get(this.objectName).pose.position.x + this.translation.x,
                y: state.objects.get(this.objectName).pose.position.y + this.translation.y,
                z: state.objects.get(this.objectName).pose.position.z + this.translation.z
            }
        });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        const objState = state.objects.get(this.objectName);
        if (!objState)
            return state;
        const newObjState = new ObjectState(this.objectName, objState.tags, {
            ...objState.pose,
            position: {
                x: objState.pose.position.x - this.translation.x,
                y: objState.pose.position.y - this.translation.y,
                z: objState.pose.position.z - this.translation.z
            }
        });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    isValid(state) {
        return state.objects.has(this.objectName);
    }
    getMoveId() {
        return `translate_${this.objectName}_${this.translation.x.toFixed(2)}_${this.translation.y.toFixed(2)}_${this.translation.z.toFixed(2)}`;
    }
}
/**
 * Rotate Move - rotates an object around its center
 */
export class RotateMove extends Move {
    constructor(objectName, rotation, // Euler angles in radians
    scoreBefore) {
        super(scoreBefore);
        this.objectName = objectName;
        this.rotation = rotation;
    }
    apply(state) {
        const objState = state.objects.get(this.objectName);
        if (!objState)
            return state;
        const newObjState = new ObjectState(this.objectName, objState.tags, {
            ...objState.pose,
            rotation: {
                x: objState.pose.rotation.x + this.rotation.x,
                y: objState.pose.rotation.y + this.rotation.y,
                z: objState.pose.rotation.z + this.rotation.z
            }
        });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        const objState = state.objects.get(this.objectName);
        if (!objState)
            return state;
        const newObjState = new ObjectState(this.objectName, objState.tags, {
            ...objState.pose,
            rotation: {
                x: objState.pose.rotation.x - this.rotation.x,
                y: objState.pose.rotation.y - this.rotation.y,
                z: objState.pose.rotation.z - this.rotation.z
            }
        });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    isValid(state) {
        return state.objects.has(this.objectName);
    }
    getMoveId() {
        return `rotate_${this.objectName}_${this.rotation.x.toFixed(2)}_${this.rotation.y.toFixed(2)}_${this.rotation.z.toFixed(2)}`;
    }
}
/**
 * Swap Move - swaps positions of two objects
 */
export class SwapMove extends Move {
    constructor(objectName1, objectName2, scoreBefore) {
        super(scoreBefore);
        this.objectName1 = objectName1;
        this.objectName2 = objectName2;
    }
    apply(state) {
        const obj1 = state.objects.get(this.objectName1);
        const obj2 = state.objects.get(this.objectName2);
        if (!obj1 || !obj2)
            return state;
        const newObjects = new Map(state.objects);
        // Swap poses
        newObjects.set(this.objectName1, new ObjectState(this.objectName1, obj1.tags, { ...obj2.pose }));
        newObjects.set(this.objectName2, new ObjectState(this.objectName2, obj2.tags, { ...obj1.pose }));
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        // Swap is its own reverse
        return this.apply(state);
    }
    isValid(state) {
        return state.objects.has(this.objectName1) &&
            state.objects.has(this.objectName2);
    }
    getMoveId() {
        return `swap_${this.objectName1}_${this.objectName2}`;
    }
}
/**
 * Deletion Move - removes an object from the scene
 */
export class DeletionMove extends Move {
    constructor(objectName, scoreBefore) {
        super(scoreBefore);
        this.objectName = objectName;
    }
    apply(state) {
        const newObjects = new Map(state.objects);
        newObjects.delete(this.objectName);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        // Cannot reverse deletion without storing the deleted object state
        // This should be handled by storing the deleted state before applying
        throw new Error('DeletionMove.reverse() requires stored object state');
    }
    isValid(state) {
        return state.objects.has(this.objectName);
    }
    getMoveId() {
        return `delete_${this.objectName}`;
    }
}
/**
 * Reassignment Move - changes an object's semantic tags
 */
export class ReassignmentMove extends Move {
    constructor(objectName, newTags, scoreBefore) {
        super(scoreBefore);
        this.objectName = objectName;
        this.newTags = newTags;
    }
    apply(state) {
        const objState = state.objects.get(this.objectName);
        if (!objState)
            return state;
        const newObjState = new ObjectState(this.objectName, new Set(this.newTags), { ...objState.pose });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        // Cannot reverse without storing old tags
        throw new Error('ReassignmentMove.reverse() requires stored tag state');
    }
    isValid(state) {
        return state.objects.has(this.objectName);
    }
    getMoveId() {
        const tagsStr = Array.from(this.newTags).join(',');
        return `reassign_${this.objectName}_${tagsStr}`;
    }
}
/**
 * Addition Move - adds a new object to the scene
 * Note: In browser context, this requires asset instantiation via hybrid bridge
 */
export class AdditionMove extends Move {
    constructor(objectName, tags, pose, scoreBefore) {
        super(scoreBefore);
        this.objectName = objectName;
        this.tags = tags;
        this.pose = pose;
    }
    apply(state) {
        // In pure TS/R3F context, we create a placeholder object state
        // Actual mesh instantiation happens via hybrid bridge or R3F components
        const newObjState = new ObjectState(this.objectName, new Set(this.tags), { ...this.pose });
        const newObjects = new Map(state.objects);
        newObjects.set(this.objectName, newObjState);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    reverse(state) {
        const newObjects = new Map(state.objects);
        newObjects.delete(this.objectName);
        return new State(newObjects, state.problem, new Map(state.bvhCache));
    }
    isValid(state) {
        // Can only add if object doesn't already exist
        return !state.objects.has(this.objectName);
    }
    getMoveId() {
        return `add_${this.objectName}`;
    }
}
/**
 * Base solver interface
 */
export class Solver {
    constructor(problem, initialState) {
        this.problem = problem;
        this.initialState = initialState;
    }
    /**
     * Evaluate a state against the problem constraints
     */
    evaluateState(state) {
        // This would call the evaluator
        // For now, delegate to external evaluator
        throw new Error('evaluateState must be implemented with evaluator integration');
    }
}
/**
 * Simulated Annealing Solver
 *
 * Ports: infinigen/core/constraints/example_solver/annealing.py
 *
 * Uses simulated annealing to optimize scene configurations
 */
export class SimulatedAnnealingSolver extends Solver {
    constructor(problem, initialState, config = {}) {
        super(problem, initialState);
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
        this.bestState = initialState;
    }
    async solve(maxIterations) {
        let temperature = this.config.initialTemperature;
        let iteration = 0;
        let currentState = this.initialState;
        const iterations = maxIterations || this.config.maxIterations;
        while (temperature > this.config.minTemperature && iteration < iterations) {
            // Generate and evaluate moves
            const moves = this.generateMoves(currentState, this.config.movesPerIteration);
            for (const move of moves) {
                if (!move.isValid(currentState))
                    continue;
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
            temperature
        };
    }
    generateMoves(state, count) {
        const moves = [];
        const objects = Array.from(state.objects.values());
        for (let i = 0; i < count && objects.length > 0; i++) {
            const obj = objects[Math.floor(Math.random() * objects.length)];
            const moveType = Math.random();
            if (moveType < 0.4) {
                // Translation move
                const translation = {
                    x: (Math.random() - 0.5) * 0.5,
                    y: (Math.random() - 0.5) * 0.5,
                    z: (Math.random() - 0.5) * 0.5
                };
                moves.push(new TranslateMove(obj.name, translation, this.currentScore));
            }
            else if (moveType < 0.7) {
                // Rotation move
                const rotation = {
                    x: (Math.random() - 0.5) * 0.3,
                    y: (Math.random() - 0.5) * 0.3,
                    z: (Math.random() - 0.5) * 0.3
                };
                moves.push(new RotateMove(obj.name, rotation, this.currentScore));
            }
            else if (moveType < 0.9 && objects.length > 1) {
                // Swap move
                const otherObj = objects.find(o => o.name !== obj.name);
                if (otherObj) {
                    moves.push(new SwapMove(obj.name, otherObj.name, this.currentScore));
                }
            }
            else {
                // Small perturbation
                const translation = {
                    x: (Math.random() - 0.5) * 0.1,
                    y: (Math.random() - 0.5) * 0.1,
                    z: (Math.random() - 0.5) * 0.1
                };
                moves.push(new TranslateMove(obj.name, translation, this.currentScore));
            }
        }
        return moves;
    }
}
/**
 * Greedy Solver
 *
 * Simple greedy optimization that always accepts improving moves
 */
export class GreedySolver extends Solver {
    constructor(problem, initialState, config = {}) {
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
    async solve(maxIterations) {
        let iteration = 0;
        let currentState = this.initialState;
        let noImprovementCount = 0;
        const iterations = maxIterations || this.config.maxIterations;
        while (iteration < iterations && noImprovementCount < this.config.restartThreshold) {
            const moves = this.generateMoves(currentState, this.config.movesPerIteration);
            let improved = false;
            for (const move of moves) {
                if (!move.isValid(currentState))
                    continue;
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
            temperature: undefined
        };
    }
    generateMoves(state, count) {
        // Same move generation as simulated annealing
        const moves = [];
        const objects = Array.from(state.objects.values());
        for (let i = 0; i < count && objects.length > 0; i++) {
            const obj = objects[Math.floor(Math.random() * objects.length)];
            const moveType = Math.random();
            if (moveType < 0.5) {
                const translation = {
                    x: (Math.random() - 0.5) * 0.5,
                    y: (Math.random() - 0.5) * 0.5,
                    z: (Math.random() - 0.5) * 0.5
                };
                moves.push(new TranslateMove(obj.name, translation, this.currentScore));
            }
            else {
                const rotation = {
                    x: (Math.random() - 0.5) * 0.3,
                    y: (Math.random() - 0.5) * 0.3,
                    z: (Math.random() - 0.5) * 0.3
                };
                moves.push(new RotateMove(obj.name, rotation, this.currentScore));
            }
        }
        return moves;
    }
}
//# sourceMappingURL=moves.js.map