import React from 'react';
import { Problem } from '../../constraints/language/types';
import { ConstraintVisualizationConfig } from '../types';
interface ConstraintVisualizerProps {
    problem?: Problem;
    config?: Partial<ConstraintVisualizationConfig>;
    showDebugLines?: boolean;
}
/**
 * ConstraintVisualizer - 3D visualization of constraints in the scene
 * Shows violations, satisfied constraints, bounds, and relationships
 */
declare const ConstraintVisualizer: React.FC<ConstraintVisualizerProps>;
export default ConstraintVisualizer;
//# sourceMappingURL=ConstraintVisualizer.d.ts.map