/**
 * Greedy Solver for Constraint Satisfaction
 * Ported from original Infinigen's greedy solver implementation
 */
import { Constraint, ConstraintDomain, ConstraintEvaluationResult } from './ConstraintTypes';
export interface SolverConfig {
    maxIterations: number;
    convergenceThreshold: number;
    randomSeed?: number;
    debugMode: boolean;
}
export declare class GreedySolver {
    private domain;
    private config;
    private constraints;
    private iterationCount;
    private currentEnergy;
    constructor(domain: ConstraintDomain, config?: Partial<SolverConfig>);
    /**
     * Add a constraint to the solver
     */
    addConstraint(constraint: Constraint): void;
    /**
     * Remove a constraint from the solver
     */
    removeConstraint(constraintId: string): boolean;
    /**
     * Solve constraints using greedy approach
     */
    solve(): ConstraintEvaluationResult;
    /**
     * Evaluate all active constraints
     */
    private evaluateAllConstraints;
    /**
     * Evaluate a single constraint
     */
    private evaluateConstraint;
    /**
     * Attempt to fix a constraint violation
     */
    private attemptToFixViolation;
    /**
     * Find which room an object belongs to
     */
    private findObjectRoom;
    /**
     * Get solver statistics
     */
    getStats(): {
        iterationCount: number;
        currentEnergy: number;
        totalConstraints: number;
        activeConstraints: number;
    };
}
//# sourceMappingURL=GreedySolver.d.ts.map