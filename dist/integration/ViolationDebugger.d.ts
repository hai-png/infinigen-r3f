/**
 * Violation Debugger Component - Phase 12
 * Visualizes constraint violations in the scene
 */
import React from 'react';
import { ViolationReport, ConstraintNode } from '../constraints/language/types';
interface ViolationDebuggerProps {
    violations: ViolationReport[];
    constraints: ConstraintNode[];
    onSelectViolation?: (violation: ViolationReport) => void;
    autoRefresh?: boolean;
}
export declare const ViolationDebugger: React.FC<ViolationDebuggerProps>;
export default ViolationDebugger;
//# sourceMappingURL=ViolationDebugger.d.ts.map