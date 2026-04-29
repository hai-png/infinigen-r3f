/**
 * Full Solver Loop: End-to-End MCMC with All Proposal Strategies
 *
 * Integrates constraint evaluation, domain reasoning, and proposal strategies
 * into a complete solving pipeline.
 */
import { Variable, Domain } from '../language/types';
import { SolverState } from '../types';
export interface SolverConfig {
    maxIterations: number;
    initialTemperature: number;
    coolingRate: number;
    minTemperature: number;
    useHybridBridge: boolean;
    enableDomainReasoning: boolean;
}
export declare class FullSolverLoop {
    private constraintSystem;
    private evaluator;
    private continuousProposer;
    private discreteProposer;
    private hybridProposer;
    private saSolver;
    private config;
    private state;
    constructor(config?: Partial<SolverConfig>);
    /**
     * Add a constraint to the system
     */
    addConstraint(constraint: any): void;
    /**
     * Add a variable with its domain
     */
    addVariable(variable: Variable, domain: Domain): void;
    /**
     * Run the full MCMC solving loop
     */
    solve(): Promise<SolverState>;
    /**
     * Apply domain reasoning to simplify constraints
     */
    private applyDomainReasoning;
    /**
     * Generate a proposal using appropriate strategy
     */
    private generateProposal;
    /**
     * Evaluate energy change from proposal
     */
    private evaluateProposal;
    /**
     * Apply accepted proposal to state
     */
    private applyProposal;
    /**
     * Get current solver state
     */
    getState(): SolverState | null;
    /**
     * Export solution to MJCF (requires hybrid bridge)
     */
    exportToMjcf(sceneId: string): Promise<string>;
    /**
     * Build physics config from current state
     */
    private buildPhysicsConfig;
}
export { FullSolverLoop as MCMCSolver };
//# sourceMappingURL=full-solver-loop.d.ts.map