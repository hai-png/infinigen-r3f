import React from 'react';
import { SolverState, Relation } from '../index';
export interface ConstraintDebuggerProps {
    /** Current solver state */
    state: SolverState | null;
    /** Active constraints */
    constraints: Relation[];
    /** Show constraint domains */
    showDomains?: boolean;
    /** Highlight violations */
    highlightViolations?: boolean;
    /** Show object IDs */
    showLabels?: boolean;
    /** Scale factor for visualization */
    scale?: number;
}
/**
 * Component to visualize constraint satisfaction state in 3D.
 *
 * @example
 * ```tsx
 * <ConstraintDebugger
 *   state={solverState}
 *   constraints={relations}
 *   showDomains={true}
 *   highlightViolations={true}
 * />
 * ```
 */
export declare const ConstraintDebugger: React.FC<ConstraintDebuggerProps>;
/**
 * Simplified debug overlay for quick constraint status check.
 */
export declare const ConstraintOverlay: React.FC<{
    violations: number;
    total: number;
    progress: number;
}>;
//# sourceMappingURL=constraint-debugger.d.ts.map