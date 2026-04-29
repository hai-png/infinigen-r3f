/**
 * Solver Profiler Component - Phase 12
 * Performance profiling and visualization for the constraint solver
 */
import React from 'react';
interface SolverIteration {
    iteration: number;
    energy: number;
    violations: number;
    temperature?: number;
    acceptedMoves: number;
    rejectedMoves: number;
    proposalTime: number;
    evaluationTime: number;
    totalTime: number;
}
interface SolverProfilerProps {
    iterations: SolverIteration[];
    isSolving: boolean;
    solverType: 'mcmc' | 'greedy' | 'simulated-annealing';
    onReset?: () => void;
    onPause?: () => void;
    onResume?: () => void;
}
export declare const SolverProfiler: React.FC<SolverProfilerProps>;
export default SolverProfiler;
//# sourceMappingURL=SolverProfiler.d.ts.map