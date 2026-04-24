/**
 * ConstraintEditor - Visual editor for creating and modifying constraints
 *
 * Provides an interactive UI for building constraint expressions,
 * editing relations, and managing constraint sets.
 */
import React from 'react';
import type { NamedConstraint, RelationType } from '../constraints/language/types';
export interface ConstraintEditorProps {
    /** Initial constraints */
    constraints?: NamedConstraint[];
    /** Read-only mode */
    readOnly?: boolean;
    /** Available relation types */
    availableRelations?: RelationType[];
    /** Callback when constraints change */
    onChange?: (constraints: NamedConstraint[]) => void;
    /** Callback when constraint is validated */
    onValidate?: (constraint: NamedConstraint) => boolean;
}
/**
 * Main Constraint Editor Component
 */
export declare const ConstraintEditor: React.FC<ConstraintEditorProps>;
export default ConstraintEditor;
//# sourceMappingURL=ConstraintEditor.d.ts.map