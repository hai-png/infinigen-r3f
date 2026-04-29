/**
 * Simulated Annealing Optimizer
 * Ported from original Infinigen's annealing system
 */
import { MoveOperatorFactory, MoveType } from '../moves/MoveOperators';
export class SimulatedAnnealing {
    constructor(domain, config = {}) {
        this.currentTemperature = 0;
        this.currentEnergy = Infinity;
        this.iterationCount = 0;
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
    optimize() {
        this.currentTemperature = this.config.initialTemperature;
        this.iterationCount = 0;
        // Evaluate initial state
        const initialEval = this.evaluateCurrentState();
        this.currentEnergy = initialEval.energy;
        if (this.config.debugMode) {
            console.log(`[Annealing] Initial energy: ${this.currentEnergy.toFixed(2)}`);
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
                            console.log(`[Annealing] Iter ${this.iterationCount}, Temp: ${this.currentTemperature.toFixed(2)}, Energy: ${this.currentEnergy.toFixed(2)}`);
                        }
                    }
                    else {
                        // Reject the move (undo)
                        this.stats.rejectedMoves++;
                        this.moveFactory.undoMove(move);
                    }
                }
                this.stats.energyHistory.push(this.currentEnergy);
                // Early termination if energy is zero (perfect solution)
                if (this.currentEnergy < this.config.acceptanceThreshold) {
                    if (this.config.debugMode) {
                        console.log(`[Annealing] Converged to near-zero energy at iteration ${this.iterationCount}`);
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
            console.log(`[Annealing] Optimization complete:`);
            console.log(`  - Total iterations: ${this.stats.totalIterations}`);
            console.log(`  - Accepted moves: ${this.stats.acceptedMoves}`);
            console.log(`  - Rejected moves: ${this.stats.rejectedMoves}`);
            console.log(`  - Final energy: ${this.stats.finalEnergy.toFixed(2)}`);
        }
        return this.stats;
    }
    /**
     * Generate a random move based on current state
     */
    generateRandomMove() {
        const moveTypes = Object.values(MoveType);
        const randomType = moveTypes[Math.floor(Math.random() * moveTypes.length)];
        const objects = Array.from(this.domain.objects.keys());
        const rooms = Array.from(this.domain.rooms.keys());
        const move = {
            id: `move_${this.iterationCount}`,
            type: randomType,
        };
        switch (randomType) {
            case MoveType.SWAP:
                if (objects.length >= 2) {
                    const idx1 = Math.floor(Math.random() * objects.length);
                    let idx2 = Math.floor(Math.random() * objects.length);
                    while (idx2 === idx1 && objects.length > 1) {
                        idx2 = Math.floor(Math.random() * objects.length);
                    }
                    move.objectId = objects[idx1];
                    move.targetObjectId = objects[idx2];
                }
                break;
            case MoveType.POSE:
                if (objects.length > 0) {
                    move.objectId = objects[Math.floor(Math.random() * objects.length)];
                    // Small random perturbation
                    move.position = this.domain.objects.get(move.objectId).position.clone();
                    move.position.x += (Math.random() - 0.5) * 2;
                    move.position.z += (Math.random() - 0.5) * 2;
                }
                break;
            case MoveType.ADD:
                move.objectId = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                move.position = {
                    x: (Math.random() - 0.5) * 20,
                    y: 0,
                    z: (Math.random() - 0.5) * 20,
                };
                if (rooms.length > 0) {
                    move.roomId = rooms[Math.floor(Math.random() * rooms.length)];
                }
                break;
            case MoveType.DELETE:
                if (objects.length > 0) {
                    move.objectId = objects[Math.floor(Math.random() * objects.length)];
                }
                break;
            case MoveType.REASSIGN:
                if (objects.length > 0 && rooms.length > 0) {
                    move.objectId = objects[Math.floor(Math.random() * objects.length)];
                    move.roomId = rooms[Math.floor(Math.random() * rooms.length)];
                }
                break;
        }
        return move;
    }
    /**
     * Try a move and calculate energy change
     */
    tryMove(move) {
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
    acceptWithProbability(energyChange) {
        if (energyChange <= 0)
            return true;
        const probability = Math.exp(-energyChange / this.currentTemperature);
        return Math.random() < probability;
    }
    /**
     * Evaluate current constraint satisfaction state
     */
    evaluateCurrentState() {
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
    getStats() {
        return { ...this.stats };
    }
    /**
     * Get current energy
     */
    getCurrentEnergy() {
        return this.currentEnergy;
    }
    /**
     * Get current temperature
     */
    getCurrentTemperature() {
        return this.currentTemperature;
    }
}
//# sourceMappingURL=SimulatedAnnealing.js.map