/**
 * Constraint Language - Result Types
 *
 * Type definitions for constraint solving results, solution representations,
 * and violation reporting.
 * Ported from: constraint_language/result.py
 */
import type { ConstraintNode, Problem, Domain } from './types';
import type { State } from '../constraints/evaluator/state';
import type { Move } from '../constraints/solver/moves';
/**
 * Represents the status of a constraint evaluation
 */
export interface ConstraintStatus {
    /** The constraint being evaluated */
    constraint: ConstraintNode;
    /** Whether the constraint is satisfied */
    satisfied: boolean;
    /** Violation count (0 if satisfied) */
    violationCount: number;
    /** Violation magnitude/strength */
    violationStrength: number;
    /** Variables involved in this constraint */
    variables: string[];
}
/**
 * Complete evaluation result for a problem
 */
export interface EvaluationResult {
    /** Total violation count across all constraints */
    totalViolations: number;
    /** Total weighted score (violations * weights) */
    totalScore: number;
    /** Individual constraint statuses */
    constraintStatuses: ConstraintStatus[];
    /** Score breakdown by term */
    scoreTerms: ScoreTermResult[];
    /** Time taken to evaluate (ms) */
    evaluationTime: number;
}
/**
 * Score term result
 */
export interface ScoreTermResult {
    /** Name of the score term */
    name: string;
    /** Weight of this term */
    weight: number;
    /** Raw value of the term */
    value: number;
    /** Weighted contribution to total score */
    contribution: number;
}
/**
 * Solution found by the solver
 */
export interface Solution {
    /** Variable assignments */
    assignments: Map<string, any>;
    /** Final state after applying assignments */
    state: State;
    /** Final domains after solving */
    domains: Map<string, Domain>;
    /** Total violations (should be 0 for valid solution) */
    totalViolations: number;
    /** Final score */
    finalScore: number;
    /** Number of iterations to find solution */
    iterations: number;
    /** Time taken to find solution (ms) */
    solveTime: number;
    /** Whether the solution is valid (no violations) */
    isValid: boolean;
}
/**
 * Solver result with detailed information
 */
export interface SolverResult {
    /** Status of the solve operation */
    status: SolveStatus;
    /** Best solution found (if any) */
    bestSolution: Solution | null;
    /** All solutions found (for multi-solve) */
    solutions: Solution[];
    /** Final evaluation result */
    evaluation: EvaluationResult | null;
    /** Solver statistics */
    statistics: SolverStatistics;
    /** Error message if failed */
    errorMessage?: string;
}
/**
 * Status of solver execution
 */
export declare enum SolveStatus {
    /** Found a valid solution with no violations */
    SUCCESS = "success",
    /** Reached maximum iterations without finding valid solution */
    MAX_ITERATIONS = "max_iterations",
    /** Reached time limit */
    TIMEOUT = "timeout",
    /** No valid solution exists (proved unsatisfiable) */
    UNSATISFIABLE = "unsatisfiable",
    /** Solver was interrupted */
    INTERRUPTED = "interrupted",
    /** Error occurred during solving */
    ERROR = "error",
    /** No solution found but not proved impossible */
    NO_SOLUTION = "no_solution"
}
/**
 * Statistics from solver execution
 */
export interface SolverStatistics {
    /** Total iterations performed */
    totalIterations: number;
    /** Number of accepted moves */
    acceptedMoves: number;
    /** Number of rejected moves */
    rejectedMoves: number;
    /** Number of proposals generated */
    proposalsGenerated: number;
    /** Best score seen during search */
    bestScoreSeen: number;
    /** Initial score */
    initialScore: number;
    /** Final score */
    finalScore: number;
    /** Temperature history (for simulated annealing) */
    temperatureHistory?: number[];
    /** Score history */
    scoreHistory: number[];
    /** Time per iteration (ms) */
    avgIterationTime: number;
    /** Memory usage (MB) */
    memoryUsage?: number;
}
/**
 * Violation report for debugging
 */
export interface ViolationReport {
    /** Timestamp of report */
    timestamp: Date;
    /** Problem being solved */
    problem: Problem;
    /** Current state */
    state: State;
    /** All violated constraints with details */
    violations: ViolationDetail[];
    /** Summary statistics */
    summary: ViolationSummary;
}
/**
 * Detailed information about a single violation
 */
export interface ViolationDetail {
    /** Constraint that was violated */
    constraint: ConstraintNode;
    /** Constraint name (if named) */
    constraintName?: string;
    /** Weight of this constraint */
    weight: number;
    /** Violation count */
    violationCount: number;
    /** Violation strength */
    violationStrength: number;
    /** Variables involved */
    variables: Array<{
        name: string;
        currentValue: any;
        domain: Domain;
    }>;
    /** Suggested fixes */
    suggestedFixes?: FixSuggestion[];
    /** Source location (for debugging) */
    sourceLocation?: string;
}
/**
 * Suggestion for fixing a violation
 */
export interface FixSuggestion {
    /** Description of the fix */
    description: string;
    /** Type of fix */
    fixType: FixType;
    /** Proposed move to fix the violation */
    proposedMove?: Move;
    /** Expected improvement */
    expectedImprovement: number;
    /** Confidence in this suggestion (0-1) */
    confidence: number;
}
/**
 * Type of fix suggestion
 */
export declare enum FixType {
    /** Translate an object */
    TRANSLATE = "translate",
    /** Rotate an object */
    ROTATE = "rotate",
    /** Swap two objects */
    SWAP = "swap",
    /** Delete an object */
    DELETE = "delete",
    /** Add a new object */
    ADD = "add",
    /** Reassign an object */
    REASSIGN = "reassign",
    /** Modify a parameter */
    MODIFY_PARAM = "modify_param",
    /** Relax a constraint */
    RELAX_CONSTRAINT = "relax_constraint"
}
/**
 * Summary of violations
 */
export interface ViolationSummary {
    /** Total number of violated constraints */
    totalViolatedConstraints: number;
    /** Total violation count */
    totalViolationCount: number;
    /** Total weighted score */
    totalWeightedScore: number;
    /** Most violated constraint */
    mostViolatedConstraint?: string;
    /** Constraints by category */
    byCategory: Map<string, number>;
    /** Variables involved in violations */
    involvedVariables: Set<string>;
}
/**
 * Create an empty evaluation result
 */
export declare function createEmptyEvaluationResult(): EvaluationResult;
/**
 * Create an empty solution
 */
export declare function createEmptySolution(): Solution;
/**
 * Create a solver result indicating success
 */
export declare function createSuccessResult(solution: Solution, evaluation: EvaluationResult, statistics: SolverStatistics): SolverResult;
/**
 * Create a solver result indicating failure
 */
export declare function createFailureResult(status: SolveStatus, errorMessage: string, statistics?: Partial<SolverStatistics>): SolverResult;
/**
 * Format a solution for display
 */
export declare function formatSolution(solution: Solution): string;
/**
 * Format a violation report for display
 */
export declare function formatViolationReport(report: ViolationReport): string;
/**
 * Merge multiple evaluation results
 */
export declare function mergeEvaluationResults(results: EvaluationResult[]): EvaluationResult;
/**
 * Compare two solutions
 */
export declare function compareSolutions(a: Solution, b: Solution): number;
//# sourceMappingURL=result.d.ts.map