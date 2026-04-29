import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ConstraintEditor - Visual editor for creating and modifying constraints
 *
 * Provides an interactive UI for building constraint expressions,
 * editing relations, and managing constraint sets.
 */
import { useState, useCallback, useMemo } from 'react';
/**
 * Relation type selector
 */
const RelationSelector = ({ value, onChange, availableRelations, disabled }) => {
    return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), disabled: disabled, style: {
            width: '100%',
            padding: '4px',
            border: '1px solid #444',
            borderRadius: '2px',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '11px'
        }, children: availableRelations.map(rel => (_jsx("option", { value: rel, children: rel }, rel))) }));
};
/**
 * Domain type selector
 */
const DomainSelector = ({ value, onChange, disabled }) => {
    const domains = [
        'ObjectSetDomain',
        'NumericDomain',
        'PoseDomain',
        'BBoxDomain',
        'BooleanDomain'
    ];
    return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), disabled: disabled, style: {
            width: '100%',
            padding: '4px',
            border: '1px solid #444',
            borderRadius: '2px',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '11px'
        }, children: domains.map(dom => (_jsx("option", { value: dom, children: dom }, dom))) }));
};
/**
 * Expression editor component
 */
const ExpressionEditor = ({ expression, onChange, readOnly = false, depth = 0 }) => {
    const renderExpression = () => {
        switch (expression.type) {
            case 'variable':
                return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { color: '#4ec9b0' }, children: "Variable:" }), _jsx("input", { type: "text", value: expression.name, onChange: (e) => !readOnly && onChange({ ...expression, name: e.target.value }), disabled: readOnly, style: {
                                flex: 1,
                                padding: '2px 4px',
                                border: '1px solid #444',
                                borderRadius: '2px',
                                background: '#2a2a2a',
                                color: '#fff',
                                fontSize: '11px'
                            } })] }));
            case 'constant':
                return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("span", { style: { color: '#b5cea8' }, children: "Constant:" }), _jsx("input", { type: "number", value: expression.value, onChange: (e) => !readOnly && onChange({ ...expression, value: parseFloat(e.target.value) }), disabled: readOnly, style: {
                                flex: 1,
                                padding: '2px 4px',
                                border: '1px solid #444',
                                borderRadius: '2px',
                                background: '#2a2a2a',
                                color: '#fff',
                                fontSize: '11px'
                            } })] }));
            case 'binary':
                return (_jsxs("div", { style: { border: '1px solid #333', padding: '8px', marginLeft: `${depth * 8}px` }, children: [_jsx("div", { style: { color: '#888', fontSize: '10px', marginBottom: '4px' }, children: "Binary Expression" }), _jsx(ExpressionEditor, { expression: expression.left, onChange: (left) => onChange({ ...expression, left }), readOnly: readOnly, depth: depth + 1 }), _jsxs("select", { value: expression.op, onChange: (e) => onChange({ ...expression, op: e.target.value }), disabled: readOnly, style: {
                                margin: '4px 0',
                                padding: '2px',
                                border: '1px solid #444',
                                borderRadius: '2px',
                                background: '#2a2a2a',
                                color: '#fff',
                                fontSize: '11px'
                            }, children: [_jsx("option", { value: "+", children: "+" }), _jsx("option", { value: "-", children: "-" }), _jsx("option", { value: "*", children: "*" }), _jsx("option", { value: "/", children: "/" }), _jsx("option", { value: "<", children: "<" }), _jsx("option", { value: "<=", children: "<=" }), _jsx("option", { value: ">", children: ">" }), _jsx("option", { value: ">=", children: ">=" }), _jsx("option", { value: "==", children: "==" }), _jsx("option", { value: "!=", children: "!=" })] }), _jsx(ExpressionEditor, { expression: expression.right, onChange: (right) => onChange({ ...expression, right }), readOnly: readOnly, depth: depth + 1 })] }));
            default:
                return _jsx("div", { style: { color: '#888' }, children: "Unknown expression type" });
        }
    };
    return _jsx("div", { children: renderExpression() });
};
/**
 * Single constraint editor
 */
const ConstraintItem = ({ constraint, isSelected, onSelect, onChange, onDelete, readOnly = false, availableRelations }) => {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { onClick: onSelect, style: {
            padding: '8px',
            margin: '4px 0',
            border: `1px solid ${isSelected ? '#007acc' : '#333'}`,
            borderRadius: '4px',
            background: isSelected ? '#1e3a5f' : '#1a1a1a',
            cursor: 'pointer'
        }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("div", { style: { fontWeight: 'bold', color: '#fff' }, children: constraint.name || 'Unnamed' }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); setExpanded(!expanded); }, style: {
                                    padding: '2px 6px',
                                    border: 'none',
                                    borderRadius: '2px',
                                    background: '#333',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                }, children: expanded ? '▲' : '▼' }), !readOnly && (_jsx("button", { onClick: (e) => { e.stopPropagation(); onDelete(); }, style: {
                                    padding: '2px 6px',
                                    border: 'none',
                                    borderRadius: '2px',
                                    background: '#cc3333',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                }, children: "\u2715" }))] })] }), expanded && (_jsxs("div", { style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }, children: [_jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }, children: "Name" }), _jsx("input", { type: "text", value: constraint.name, onChange: (e) => onChange({ ...constraint, name: e.target.value }), disabled: readOnly, placeholder: "Constraint name", style: {
                                    width: '100%',
                                    padding: '4px',
                                    border: '1px solid #444',
                                    borderRadius: '2px',
                                    background: '#2a2a2a',
                                    color: '#fff',
                                    fontSize: '11px'
                                } })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }, children: "Weight" }), _jsx("input", { type: "number", step: "0.1", value: constraint.weight ?? 1.0, onChange: (e) => onChange({ ...constraint, weight: parseFloat(e.target.value) }), disabled: readOnly, style: {
                                    width: '100%',
                                    padding: '4px',
                                    border: '1px solid #444',
                                    borderRadius: '2px',
                                    background: '#2a2a2a',
                                    color: '#fff',
                                    fontSize: '11px'
                                } })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }, children: "Relation" }), _jsx(RelationSelector, { value: constraint.relationType, onChange: (rel) => onChange({ ...constraint, relationType: rel }), availableRelations: availableRelations, disabled: readOnly })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }, children: "Arguments (JSON)" }), _jsx("textarea", { value: JSON.stringify(constraint.args, null, 2), onChange: (e) => {
                                    try {
                                        const args = JSON.parse(e.target.value);
                                        onChange({ ...constraint, args });
                                    }
                                    catch (err) {
                                        // Invalid JSON, ignore
                                    }
                                }, disabled: readOnly, rows: 4, style: {
                                    width: '100%',
                                    padding: '4px',
                                    border: '1px solid #444',
                                    borderRadius: '2px',
                                    background: '#2a2a2a',
                                    color: '#fff',
                                    fontFamily: 'monospace',
                                    fontSize: '10px',
                                    resize: 'vertical'
                                } })] }), _jsxs("div", { style: { marginBottom: '8px' }, children: [_jsx("label", { style: { display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }, children: "Description" }), _jsx("textarea", { value: constraint.description || '', onChange: (e) => onChange({ ...constraint, description: e.target.value }), disabled: readOnly, placeholder: "Optional description", rows: 2, style: {
                                    width: '100%',
                                    padding: '4px',
                                    border: '1px solid #444',
                                    borderRadius: '2px',
                                    background: '#2a2a2a',
                                    color: '#fff',
                                    fontSize: '11px',
                                    resize: 'vertical'
                                } })] })] }))] }));
};
/**
 * Main Constraint Editor Component
 */
export const ConstraintEditor = ({ constraints = [], readOnly = false, availableRelations = [
    'Touching',
    'SupportedBy',
    'CoPlanar',
    'StableAgainst',
    'Facing',
    'Between',
    'AccessibleFrom',
    'ReachableFrom',
    'InFrontOf',
    'Aligned',
    'Hidden',
    'Visible',
    'Grouped',
    'Distributed',
    'Coverage',
    'SupportCoverage',
    'Stability',
    'Containment',
    'Proximity'
], onChange, onValidate }) => {
    const [editorState, setEditorState] = useState({
        selectedConstraint: null,
        expandedGroups: {},
        showAddModal: false
    });
    // Add new constraint
    const handleAddConstraint = useCallback(() => {
        const newConstraint = {
            _type: 'NamedConstraint',
            name: `Constraint_${constraints.length + 1}`,
            relationType: 'Touching',
            args: {},
            weight: 1.0,
            description: ''
        };
        const updated = [...constraints, newConstraint];
        onChange?.(updated);
        setEditorState(prev => ({ ...prev, selectedConstraint: newConstraint.name }));
    }, [constraints, onChange]);
    // Update constraint
    const handleUpdateConstraint = useCallback((updated) => {
        const index = constraints.findIndex(c => c.name === updated.name);
        if (index !== -1) {
            const newConstraints = [...constraints];
            newConstraints[index] = updated;
            onChange?.(newConstraints);
        }
    }, [constraints, onChange]);
    // Delete constraint
    const handleDeleteConstraint = useCallback((name) => {
        const updated = constraints.filter(c => c.name !== name);
        onChange?.(updated);
        if (editorState.selectedConstraint === name) {
            setEditorState(prev => ({ ...prev, selectedConstraint: null }));
        }
    }, [constraints, editorState.selectedConstraint, onChange]);
    // Validate all constraints
    const validationResults = useMemo(() => {
        return constraints.map(c => ({
            name: c.name,
            valid: onValidate?.(c) ?? true
        }));
    }, [constraints, onValidate]);
    return (_jsxs("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#1a1a1a',
            fontFamily: 'system-ui, sans-serif'
        }, children: [_jsxs("div", { style: {
                    padding: '12px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }, children: [_jsx("h3", { style: { margin: 0, color: '#fff', fontSize: '14px' }, children: "Constraint Editor" }), !readOnly && (_jsx("button", { onClick: handleAddConstraint, style: {
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#007acc',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }, children: "+ Add Constraint" }))] }), _jsx("div", { style: {
                    flex: 1,
                    overflow: 'auto',
                    padding: '12px'
                }, children: constraints.length === 0 ? (_jsx("div", { style: {
                        textAlign: 'center',
                        color: '#888',
                        padding: '40px 20px'
                    }, children: "No constraints yet. Click \"Add Constraint\" to create one." })) : (constraints.map(constraint => (_jsx(ConstraintItem, { constraint: constraint, isSelected: editorState.selectedConstraint === constraint.name, onSelect: () => setEditorState(prev => ({
                        ...prev,
                        selectedConstraint: constraint.name
                    })), onChange: handleUpdateConstraint, onDelete: () => handleDeleteConstraint(constraint.name), readOnly: readOnly, availableRelations: availableRelations }, constraint.name)))) }), _jsxs("div", { style: {
                    padding: '8px 12px',
                    borderTop: '1px solid #333',
                    background: '#222',
                    fontSize: '11px',
                    color: '#888'
                }, children: ["Total: ", constraints.length, " constraints | Valid: ", validationResults.filter(r => r.valid).length, " | Invalid: ", validationResults.filter(r => !r.valid).length] })] }));
};
export default ConstraintEditor;
//# sourceMappingURL=ConstraintEditor.js.map