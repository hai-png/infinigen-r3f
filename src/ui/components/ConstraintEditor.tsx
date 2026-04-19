/**
 * ConstraintEditor - Visual editor for creating and modifying constraints
 * 
 * Provides an interactive UI for building constraint expressions,
 * editing relations, and managing constraint sets.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { 
  Constraint, 
  NamedConstraint,
  Expression,
  RelationType,
  DomainType
} from '../constraint-language/types';
import { buildProblem } from '../constraint-language/constants';

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

interface EditorState {
  selectedConstraint: string | null;
  expandedGroups: Record<string, boolean>;
  showAddModal: boolean;
}

/**
 * Relation type selector
 */
const RelationSelector: React.FC<{
  value: RelationType;
  onChange: (value: RelationType) => void;
  availableRelations: RelationType[];
  disabled?: boolean;
}> = ({ value, onChange, availableRelations, disabled }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RelationType)}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '4px',
        border: '1px solid #444',
        borderRadius: '2px',
        background: '#2a2a2a',
        color: '#fff',
        fontSize: '11px'
      }}
    >
      {availableRelations.map(rel => (
        <option key={rel} value={rel}>{rel}</option>
      ))}
    </select>
  );
};

/**
 * Domain type selector
 */
const DomainSelector: React.FC<{
  value: DomainType;
  onChange: (value: DomainType) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const domains: DomainType[] = [
    'ObjectSetDomain',
    'NumericDomain',
    'PoseDomain',
    'BBoxDomain',
    'BooleanDomain'
  ];
  
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as DomainType)}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '4px',
        border: '1px solid #444',
        borderRadius: '2px',
        background: '#2a2a2a',
        color: '#fff',
        fontSize: '11px'
      }}
    >
      {domains.map(dom => (
        <option key={dom} value={dom}>{dom}</option>
      ))}
    </select>
  );
};

/**
 * Expression editor component
 */
const ExpressionEditor: React.FC<{
  expression: Expression;
  onChange: (expr: Expression) => void;
  readOnly?: boolean;
  depth?: number;
}> = ({ expression, onChange, readOnly = false, depth = 0 }) => {
  const renderExpression = () => {
    switch (expression.type) {
      case 'variable':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4ec9b0' }}>Variable:</span>
            <input
              type="text"
              value={expression.name}
              onChange={(e) => !readOnly && onChange({ ...expression, name: e.target.value })}
              disabled={readOnly}
              style={{
                flex: 1,
                padding: '2px 4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
              }}
            />
          </div>
        );
      
      case 'constant':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#b5cea8' }}>Constant:</span>
            <input
              type="number"
              value={expression.value}
              onChange={(e) => !readOnly && onChange({ ...expression, value: parseFloat(e.target.value) })}
              disabled={readOnly}
              style={{
                flex: 1,
                padding: '2px 4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
              }}
            />
          </div>
        );
      
      case 'binary':
        return (
          <div style={{ border: '1px solid #333', padding: '8px', marginLeft: `${depth * 8}px` }}>
            <div style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>Binary Expression</div>
            <ExpressionEditor
              expression={expression.left}
              onChange={(left) => onChange({ ...expression, left })}
              readOnly={readOnly}
              depth={depth + 1}
            />
            <select
              value={expression.op}
              onChange={(e) => onChange({ ...expression, op: e.target.value as any })}
              disabled={readOnly}
              style={{
                margin: '4px 0',
                padding: '2px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
              }}
            >
              <option value="+">+</option>
              <option value="-">-</option>
              <option value="*">*</option>
              <option value="/">/</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="==">==</option>
              <option value="!=">!=</option>
            </select>
            <ExpressionEditor
              expression={expression.right}
              onChange={(right) => onChange({ ...expression, right })}
              readOnly={readOnly}
              depth={depth + 1}
            />
          </div>
        );
      
      default:
        return <div style={{ color: '#888' }}>Unknown expression type</div>;
    }
  };
  
  return <div>{renderExpression()}</div>;
};

/**
 * Single constraint editor
 */
const ConstraintItem: React.FC<{
  constraint: NamedConstraint;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (constraint: NamedConstraint) => void;
  onDelete: () => void;
  readOnly?: boolean;
  availableRelations: RelationType[];
}> = ({ 
  constraint, 
  isSelected, 
  onSelect, 
  onChange, 
  onDelete,
  readOnly = false,
  availableRelations
}) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '8px',
        margin: '4px 0',
        border: `1px solid ${isSelected ? '#007acc' : '#333'}`,
        borderRadius: '4px',
        background: isSelected ? '#1e3a5f' : '#1a1a1a',
        cursor: 'pointer'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 'bold', color: '#fff' }}>
          {constraint.name || 'Unnamed'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{
              padding: '2px 6px',
              border: 'none',
              borderRadius: '2px',
              background: '#333',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            {expanded ? '▲' : '▼'}
          </button>
          {!readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                padding: '2px 6px',
                border: 'none',
                borderRadius: '2px',
                background: '#cc3333',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      
      {expanded && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
          {/* Name */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
              Name
            </label>
            <input
              type="text"
              value={constraint.name}
              onChange={(e) => onChange({ ...constraint, name: e.target.value })}
              disabled={readOnly}
              placeholder="Constraint name"
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
              }}
            />
          </div>
          
          {/* Weight */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
              Weight
            </label>
            <input
              type="number"
              step="0.1"
              value={constraint.weight ?? 1.0}
              onChange={(e) => onChange({ ...constraint, weight: parseFloat(e.target.value) })}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px'
              }}
            />
          </div>
          
          {/* Relation Type */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
              Relation
            </label>
            <RelationSelector
              value={constraint.relationType}
              onChange={(rel) => onChange({ ...constraint, relationType: rel })}
              availableRelations={availableRelations}
              disabled={readOnly}
            />
          </div>
          
          {/* Arguments */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
              Arguments (JSON)
            </label>
            <textarea
              value={JSON.stringify(constraint.args, null, 2)}
              onChange={(e) => {
                try {
                  const args = JSON.parse(e.target.value);
                  onChange({ ...constraint, args });
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              disabled={readOnly}
              rows={4}
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: '10px',
                resize: 'vertical'
              }}
            />
          </div>
          
          {/* Description */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>
              Description
            </label>
            <textarea
              value={constraint.description || ''}
              onChange={(e) => onChange({ ...constraint, description: e.target.value })}
              disabled={readOnly}
              placeholder="Optional description"
              rows={2}
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #444',
                borderRadius: '2px',
                background: '#2a2a2a',
                color: '#fff',
                fontSize: '11px',
                resize: 'vertical'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Main Constraint Editor Component
 */
export const ConstraintEditor: React.FC<ConstraintEditorProps> = ({
  constraints = [],
  readOnly = false,
  availableRelations = [
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
  ],
  onChange,
  onValidate
}) => {
  const [editorState, setEditorState] = useState<EditorState>({
    selectedConstraint: null,
    expandedGroups: {},
    showAddModal: false
  });
  
  // Add new constraint
  const handleAddConstraint = useCallback(() => {
    const newConstraint: NamedConstraint = {
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
  const handleUpdateConstraint = useCallback((updated: NamedConstraint) => {
    const index = constraints.findIndex(c => c.name === updated.name);
    if (index !== -1) {
      const newConstraints = [...constraints];
      newConstraints[index] = updated;
      onChange?.(newConstraints);
    }
  }, [constraints, onChange]);
  
  // Delete constraint
  const handleDeleteConstraint = useCallback((name: string) => {
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
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#1a1a1a',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '14px' }}>
          Constraint Editor
        </h3>
        {!readOnly && (
          <button
            onClick={handleAddConstraint}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              background: '#007acc',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            + Add Constraint
          </button>
        )}
      </div>
      
      {/* Constraints list */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px'
      }}>
        {constraints.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#888',
            padding: '40px 20px'
          }}>
            No constraints yet. Click "Add Constraint" to create one.
          </div>
        ) : (
          constraints.map(constraint => (
            <ConstraintItem
              key={constraint.name}
              constraint={constraint}
              isSelected={editorState.selectedConstraint === constraint.name}
              onSelect={() => setEditorState(prev => ({ 
                ...prev, 
                selectedConstraint: constraint.name 
              }))}
              onChange={handleUpdateConstraint}
              onDelete={() => handleDeleteConstraint(constraint.name)}
              readOnly={readOnly}
              availableRelations={availableRelations}
            />
          ))
        )}
      </div>
      
      {/* Footer with stats */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #333',
        background: '#222',
        fontSize: '11px',
        color: '#888'
      }}>
        Total: {constraints.length} constraints | 
        Valid: {validationResults.filter(r => r.valid).length} | 
        Invalid: {validationResults.filter(r => !r.valid).length}
      </div>
    </div>
  );
};

export default ConstraintEditor;
