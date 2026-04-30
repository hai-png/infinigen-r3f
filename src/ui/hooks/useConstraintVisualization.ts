import { useState, useEffect, useCallback } from 'react';
import { ConstraintVisualizationConfig } from '../types';
import { Problem, Constraint } from '../../core/constraints/language/types';

interface UseConstraintVisualizationOptions {
  problem?: Problem;
  initialConfig?: Partial<ConstraintVisualizationConfig>;
  autoUpdate?: boolean;
}

/**
 * useConstraintVisualization - Hook for managing constraint visualization state
 */
export function useConstraintVisualization({
  problem,
  initialConfig,
  autoUpdate = true,
}: UseConstraintVisualizationOptions) {
  const [config, setConfig] = useState<ConstraintVisualizationConfig>({
    showViolations: true,
    showSatisfied: true,
    showBounds: true,
    violationColor: '#ff4444',
    satisfiedColor: '#44ff88',
    scale: 1.0,
    ...initialConfig,
  });

  const [violatedConstraints, setViolatedConstraints] = useState<number[]>([]);
  const [satisfiedConstraints, setSatisfiedConstraints] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const updateConfig = useCallback((updates: Partial<ConstraintVisualizationConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleViolationVisibility = useCallback(() => {
    setConfig((prev) => ({ ...prev, showViolations: !prev.showViolations }));
  }, []);

  const toggleSatisfiedVisibility = useCallback(() => {
    setConfig((prev) => ({ ...prev, showSatisfied: !prev.showSatisfied }));
  }, []);

  const toggleBoundsVisibility = useCallback(() => {
    setConfig((prev) => ({ ...prev, showBounds: !prev.showBounds }));
  }, []);

  // Evaluate constraints and categorize them
  useEffect(() => {
    if (!problem || !autoUpdate) return;

    setIsLoading(true);

    // Simulate async evaluation (in real implementation, this would call the evaluator)
    const timeoutId = setTimeout(() => {
      try {
        // In a real implementation, we would evaluate the problem here
        // For now, we'll just categorize constraints based on their index
        const violated: number[] = [];
        const satisfied: number[] = [];

        problem.constraints.forEach((_, index) => {
          // Placeholder logic - real implementation would evaluate each constraint
          if (Math.random() > 0.7) {
            violated.push(index);
          } else {
            satisfied.push(index);
          }
        });

        setViolatedConstraints(violated);
        setSatisfiedConstraints(satisfied);
      } catch (error) {
        console.error('Error evaluating constraints:', error);
      } finally {
        setIsLoading(false);
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [problem, autoUpdate]);

  const getConstraintStatus = useCallback(
    (index: number): 'violated' | 'satisfied' | 'unknown' => {
      if (violatedConstraints.includes(index)) return 'violated';
      if (satisfiedConstraints.includes(index)) return 'satisfied';
      return 'unknown';
    },
    [violatedConstraints, satisfiedConstraints]
  );

  const getConstraintColor = useCallback(
    (index: number): string => {
      const status = getConstraintStatus(index);
      switch (status) {
        case 'violated':
          return config.violationColor;
        case 'satisfied':
          return config.satisfiedColor;
        default:
          return '#888888';
      }
    },
    [getConstraintStatus, config.violationColor, config.satisfiedColor]
  );

  const violationCount = violatedConstraints.length;
  const satisfactionRate =
    problem?.constraints.length
      ? ((satisfiedConstraints.length / problem.constraints.length) * 100).toFixed(1)
      : '0';

  return {
    config,
    updateConfig,
    toggleViolationVisibility,
    toggleSatisfiedVisibility,
    toggleBoundsVisibility,
    violatedConstraints,
    satisfiedConstraints,
    isLoading,
    getConstraintStatus,
    getConstraintColor,
    violationCount,
    satisfactionRate: parseFloat(satisfactionRate),
  };
}
