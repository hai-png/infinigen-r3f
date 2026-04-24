/**
 * Domain Inspector Component - Phase 12
 * Inspects and visualizes variable domains in the constraint system
 */
import React from 'react';
import { Domain, Variable } from '../constraints/language/types';
interface DomainInspectorProps {
    variables: Variable[];
    domains: Map<string, Domain>;
    selectedVariableId?: string;
    onSelectVariable?: (variable: Variable) => void;
    onDomainChange?: (variableId: string, newDomain: Domain) => void;
}
export declare const DomainInspector: React.FC<DomainInspectorProps>;
export default DomainInspector;
//# sourceMappingURL=DomainInspector.d.ts.map