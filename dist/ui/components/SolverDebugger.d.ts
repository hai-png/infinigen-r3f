import React from 'react';
import { SolverDebuggerConfig } from '../types';
import { SolverState } from '../../constraints/solver/moves';
interface SolverDebuggerProps {
    solverState?: SolverState;
    config?: Partial<SolverDebuggerConfig>;
    onRestart?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onStep?: () => void;
}
/**
 * SolverDebugger - Debug panel for monitoring and controlling the constraint solver
 */
declare const SolverDebugger: React.FC<SolverDebuggerProps>;
export default SolverDebugger;
//# sourceMappingURL=SolverDebugger.d.ts.map