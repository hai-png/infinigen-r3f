/**
 * Simulated Annealing Optimizer
 * Ported from original Infinigen's annealing system
 */
import { ConstraintDomain } from '../core/ConstraintTypes';
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
export declare class SimulatedAnnealing {
    private domain;
    private config;
    private moveFactory;
    private currentTemperature;
    private currentEnergy;
    private iterationCount;
    private stats;
    constructor(domain: ConstraintDomain, config?: Partial<AnnealingConfig>);
    /**
     * Run simulated annealing optimization
     */
    optimize(): AnnealingStats;
    /**
     * Generate a random move based on current state
     */
    private generateRandomMove;
    /**
     * Try a move and calculate energy change
     */
    private tryMove;
    /**
     * Decide whether to accept a worse move based on temperature
     */
    private acceptWithProbability;
    /**
     * Evaluate current constraint satisfaction state
     */
    private evaluateCurrentState;
    /**
     * Get optimization statistics
     */
    getStats(): AnnealingStats;
    /**
     * Get current energy
     */
    getCurrentEnergy(): number;
    /**
     * Get current temperature
     */
    getCurrentTemperature(): number;
}
//# sourceMappingURL=SimulatedAnnealing.d.ts.map