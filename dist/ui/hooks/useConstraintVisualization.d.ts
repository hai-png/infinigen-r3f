import { ConstraintVisualizationConfig } from '../types';
import { Problem } from '../../constraints/language/types';
interface UseConstraintVisualizationOptions {
    problem?: Problem;
    initialConfig?: Partial<ConstraintVisualizationConfig>;
    autoUpdate?: boolean;
}
/**
 * useConstraintVisualization - Hook for managing constraint visualization state
 */
export declare function useConstraintVisualization({ problem, initialConfig, autoUpdate, }: UseConstraintVisualizationOptions): {
    config: ConstraintVisualizationConfig;
    updateConfig: (updates: Partial<ConstraintVisualizationConfig>) => void;
    toggleViolationVisibility: () => void;
    toggleSatisfiedVisibility: () => void;
    toggleBoundsVisibility: () => void;
    violatedConstraints: number[];
    satisfiedConstraints: number[];
    isLoading: boolean;
    getConstraintStatus: (index: number) => "violated" | "satisfied" | "unknown";
    getConstraintColor: (index: number) => string;
    violationCount: number;
    satisfactionRate: number;
};
export {};
//# sourceMappingURL=useConstraintVisualization.d.ts.map