/**
 * Constraint Language - Result Types
 *
 * Type definitions for constraint solving results, solution representations,
 * and violation reporting.
 * Ported from: constraint_language/result.py
 */
/**
 * Status of solver execution
 */
export var SolveStatus;
(function (SolveStatus) {
    /** Found a valid solution with no violations */
    SolveStatus["SUCCESS"] = "success";
    /** Reached maximum iterations without finding valid solution */
    SolveStatus["MAX_ITERATIONS"] = "max_iterations";
    /** Reached time limit */
    SolveStatus["TIMEOUT"] = "timeout";
    /** No valid solution exists (proved unsatisfiable) */
    SolveStatus["UNSATISFIABLE"] = "unsatisfiable";
    /** Solver was interrupted */
    SolveStatus["INTERRUPTED"] = "interrupted";
    /** Error occurred during solving */
    SolveStatus["ERROR"] = "error";
    /** No solution found but not proved impossible */
    SolveStatus["NO_SOLUTION"] = "no_solution";
})(SolveStatus || (SolveStatus = {}));
/**
 * Type of fix suggestion
 */
export var FixType;
(function (FixType) {
    /** Translate an object */
    FixType["TRANSLATE"] = "translate";
    /** Rotate an object */
    FixType["ROTATE"] = "rotate";
    /** Swap two objects */
    FixType["SWAP"] = "swap";
    /** Delete an object */
    FixType["DELETE"] = "delete";
    /** Add a new object */
    FixType["ADD"] = "add";
    /** Reassign an object */
    FixType["REASSIGN"] = "reassign";
    /** Modify a parameter */
    FixType["MODIFY_PARAM"] = "modify_param";
    /** Relax a constraint */
    FixType["RELAX_CONSTRAINT"] = "relax_constraint";
})(FixType || (FixType = {}));
/**
 * Create an empty evaluation result
 */
export function createEmptyEvaluationResult() {
    return {
        totalViolations: 0,
        totalScore: 0,
        constraintStatuses: [],
        scoreTerms: [],
        evaluationTime: 0,
    };
}
/**
 * Create an empty solution
 */
export function createEmptySolution() {
    return {
        assignments: new Map(),
        state: {},
        domains: new Map(),
        totalViolations: Infinity,
        finalScore: Infinity,
        iterations: 0,
        solveTime: 0,
        isValid: false,
    };
}
/**
 * Create a solver result indicating success
 */
export function createSuccessResult(solution, evaluation, statistics) {
    return {
        status: SolveStatus.SUCCESS,
        bestSolution: solution,
        solutions: [solution],
        evaluation,
        statistics,
    };
}
/**
 * Create a solver result indicating failure
 */
export function createFailureResult(status, errorMessage, statistics) {
    return {
        status,
        bestSolution: null,
        solutions: [],
        evaluation: null,
        statistics: {
            totalIterations: 0,
            acceptedMoves: 0,
            rejectedMoves: 0,
            proposalsGenerated: 0,
            bestScoreSeen: Infinity,
            initialScore: Infinity,
            finalScore: Infinity,
            scoreHistory: [],
            avgIterationTime: 0,
            ...statistics,
        },
        errorMessage,
    };
}
/**
 * Format a solution for display
 */
export function formatSolution(solution) {
    const lines = [];
    lines.push('=== Solution ===');
    lines.push(`Valid: ${solution.isValid}`);
    lines.push(`Violations: ${solution.totalViolations}`);
    lines.push(`Score: ${solution.finalScore.toFixed(4)}`);
    lines.push(`Iterations: ${solution.iterations}`);
    lines.push(`Solve Time: ${solution.solveTime.toFixed(2)}ms`);
    lines.push('');
    lines.push('Assignments:');
    for (const [name, value] of solution.assignments.entries()) {
        lines.push(`  ${name}: ${formatValue(value)}`);
    }
    return lines.join('\n');
}
/**
 * Format a violation report for display
 */
export function formatViolationReport(report) {
    const lines = [];
    lines.push('=== Violation Report ===');
    lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
    lines.push('');
    lines.push('Summary:');
    lines.push(`  Total Violated Constraints: ${report.summary.totalViolatedConstraints}`);
    lines.push(`  Total Violation Count: ${report.summary.totalViolationCount}`);
    lines.push(`  Total Weighted Score: ${report.summary.totalWeightedScore.toFixed(4)}`);
    if (report.summary.mostViolatedConstraint) {
        lines.push(`  Most Violated: ${report.summary.mostViolatedConstraint}`);
    }
    lines.push('');
    lines.push('Violations:');
    for (const violation of report.violations) {
        lines.push(`\n  [${violation.constraintName || 'Unnamed'}]`);
        lines.push(`    Strength: ${violation.violationStrength.toFixed(4)}`);
        lines.push(`    Count: ${violation.violationCount}`);
        lines.push(`    Weight: ${violation.weight}`);
        if (violation.suggestedFixes && violation.suggestedFixes.length > 0) {
            lines.push('    Suggestions:');
            for (const fix of violation.suggestedFixes) {
                lines.push(`      - ${fix.description} (${fix.fixType})`);
            }
        }
    }
    return lines.join('\n');
}
/**
 * Format a value for display
 */
function formatValue(value) {
    if (typeof value === 'number') {
        return value.toFixed(4);
    }
    if (Array.isArray(value)) {
        return `[${value.map(formatValue).join(', ')}]`;
    }
    if (value && typeof value === 'object') {
        if ('position' in value && 'rotation' in value) {
            return `Pose(pos=[${value.position?.map((v) => v.toFixed(2)).join(', ')}], rot=[${value.rotation?.map((v) => v.toFixed(2)).join(', ')}])`;
        }
        return JSON.stringify(value);
    }
    return String(value);
}
/**
 * Merge multiple evaluation results
 */
export function mergeEvaluationResults(results) {
    return {
        totalViolations: results.reduce((sum, r) => sum + r.totalViolations, 0),
        totalScore: results.reduce((sum, r) => sum + r.totalScore, 0),
        constraintStatuses: results.flatMap(r => r.constraintStatuses),
        scoreTerms: results.flatMap(r => r.scoreTerms),
        evaluationTime: results.reduce((sum, r) => sum + r.evaluationTime, 0),
    };
}
/**
 * Compare two solutions
 */
export function compareSolutions(a, b) {
    // First compare validity
    if (a.isValid && !b.isValid)
        return -1;
    if (!a.isValid && b.isValid)
        return 1;
    // Then compare violations
    if (a.totalViolations !== b.totalViolations) {
        return a.totalViolations - b.totalViolations;
    }
    // Finally compare scores
    return a.finalScore - b.finalScore;
}
//# sourceMappingURL=result.js.map