import { SolverState } from '../../constraints/solver/moves';
interface UseSolverControlsOptions {
    initialState?: Partial<SolverState>;
    autoStart?: boolean;
    onIteration?: (state: SolverState) => void;
    onComplete?: (state: SolverState) => void;
}
/**
 * useSolverControls - Hook for controlling the constraint solver
 */
export declare function useSolverControls({ initialState, autoStart, onIteration, onComplete, }?: UseSolverControlsOptions): {
    isRunning: boolean;
    isPaused: boolean;
    iterationCount: number;
    currentScore: any;
    bestScore: number | null;
    temperature: number | null;
    elapsedTime: number;
    start: () => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    reset: () => void;
    step: () => void;
};
export {};
//# sourceMappingURL=useSolverControls.d.ts.map