/**
 * Domain Inspector Component - Phase 12
 * Inspects and visualizes variable domains in the constraint system
 */

import React, { useState, useMemo } from 'react';
import { 
  Domain, 
  ObjectSetDomain, 
  NumericDomain, 
  PoseDomain, 
  BBoxDomain,
  BooleanDomain,
  Variable 
} from '../constraint-language/types';

interface DomainInspectorProps {
  variables: Variable[];
  domains: Map<string, Domain>;
  selectedVariableId?: string;
  onSelectVariable?: (variable: Variable) => void;
  onDomainChange?: (variableId: string, newDomain: Domain) => void;
}

const DomainValueDisplay: React.FC<{ domain: Domain }> = ({ domain }) => {
  switch (domain.type) {
    case 'object-set':
      const objDomain = domain as ObjectSetDomain;
      return (
        <div style={{ fontSize: '11px' }}>
          <div style={{ color: '#4ec9b0', marginBottom: '4px' }}>
            Objects: {objDomain.allowedObjects?.length || 'unbounded'}
          </div>
          {objDomain.allowedObjects && objDomain.allowedObjects.length > 0 && (
            <div style={{ 
              maxHeight: '100px', 
              overflowY: 'auto',
              background: '#1e1e1e',
              padding: '4px',
              borderRadius: '4px',
            }}>
              {objDomain.allowedObjects.map((obj, idx) => (
                <div key={idx} style={{ 
                  padding: '2px 4px',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  color: '#dcdcaa',
                }}>
                  • {obj.id || `obj_${idx}`}
                  {obj.tags && obj.tags.length > 0 && (
                    <span style={{ color: '#6a9955', marginLeft: '4px' }}>
                      [{obj.tags.join(', ')}]
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {objDomain.minSize !== undefined && (
            <div style={{ marginTop: '4px', color: '#aaa' }}>
              Min Size: {objDomain.minSize}
            </div>
          )}
          {objDomain.maxSize !== undefined && (
            <div style={{ color: '#aaa' }}>
              Max Size: {objDomain.maxSize}
            </div>
          )}
        </div>
      );

    case 'numeric':
      const numDomain = domain as NumericDomain;
      return (
        <div style={{ fontSize: '11px' }}>
          <div style={{ color: '#b5cea8', marginBottom: '4px' }}>
            Range: [{numDomain.min}, {numDomain.max}]
          </div>
          {numDomain.isInteger && (
            <div style={{ color: '#aaa', fontStyle: 'italic' }}>
              Integer only
            </div>
          )}
          {numDomain.unit && (
            <div style={{ color: '#aaa' }}>
              Unit: {numDomain.unit}
            </div>
          )}
        </div>
      );

    case 'pose':
      const poseDomain = domain as PoseDomain;
      return (
        <div style={{ fontSize: '11px' }}>
          <div style={{ color: '#569cd6', marginBottom: '4px' }}>Position:</div>
          {poseDomain.positionBounds && (
            <div style={{ marginLeft: '8px', color: '#aaa' }}>
              X: [{poseDomain.positionBounds.x.min}, {poseDomain.positionBounds.x.max}]<br/>
              Y: [{poseDomain.positionBounds.y.min}, {poseDomain.positionBounds.y.max}]<br/>
              Z: [{poseDomain.positionBounds.z.min}, {poseDomain.positionBounds.z.max}]
            </div>
          )}
          <div style={{ color: '#569cd6', marginTop: '8px', marginBottom: '4px' }}>Rotation:</div>
          {poseDomain.rotationBounds && (
            <div style={{ marginLeft: '8px', color: '#aaa' }}>
              X: [{poseDomain.rotationBounds.x.min}, {poseDomain.rotationBounds.x.max}]<br/>
              Y: [{poseDomain.rotationBounds.y.min}, {poseDomain.rotationBounds.y.max}]<br/>
              Z: [{poseDomain.rotationBounds.z.min}, {poseDomain.rotationBounds.z.max}]
            </div>
          )}
        </div>
      );

    case 'bbox':
      const bboxDomain = domain as BBoxDomain;
      return (
        <div style={{ fontSize: '11px' }}>
          <div style={{ color: '#ce9178', marginBottom: '4px' }}>
            Bounding Box Constraints
          </div>
          {bboxDomain.minSize && (
            <div style={{ color: '#aaa' }}>
              Min Size: [{bboxDomain.minSize[0]}, {bboxDomain.minSize[1]}, {bboxDomain.minSize[2]}]
            </div>
          )}
          {bboxDomain.maxSize && (
            <div style={{ color: '#aaa' }}>
              Max Size: [{bboxDomain.maxSize[0]}, {bboxDomain.maxSize[1]}, {bboxDomain.maxSize[2]}]
            </div>
          )}
        </div>
      );

    case 'boolean':
      const boolDomain = domain as BooleanDomain;
      return (
        <div style={{ fontSize: '11px' }}>
          <div style={{ color: '#c586c0' }}>
            Boolean: {boolDomain.allowedValues?.join(' or ') || 'true/false'}
          </div>
        </div>
      );

    default:
      return <div style={{ fontSize: '11px', color: '#888' }}>Unknown domain type</div>;
  }
};

export const DomainInspector: React.FC<DomainInspectorProps> = ({
  variables,
  domains,
  selectedVariableId,
  onSelectVariable,
  onDomainChange,
}) => {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(['all']));
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredVariables = useMemo(() => {
    return variables.filter(v => {
      const matchesType = filterType === 'all' || v.domain.type === filterType;
      const matchesSearch = searchQuery === '' || 
        v.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [variables, filterType, searchQuery]);

  const domainStats = useMemo(() => {
    const stats = {
      total: variables.length,
      'object-set': variables.filter(v => v.domain.type === 'object-set').length,
      numeric: variables.filter(v => v.domain.type === 'numeric').length,
      pose: variables.filter(v => v.domain.type === 'pose').length,
      bbox: variables.filter(v => v.domain.type === 'bbox').length,
      boolean: variables.filter(v => v.domain.type === 'boolean').length,
    };
    return stats;
  }, [variables]);

  const toggleExpand = (varId: string) => {
    const newExpanded = new Set(expandedDomains);
    if (newExpanded.has(varId)) {
      newExpanded.delete(varId);
    } else {
      newExpanded.add(varId);
    }
    setExpandedDomains(newExpanded);
  };

  const expandAll = () => {
    setExpandedDomains(new Set(variables.map(v => v.id)));
  };

  const collapseAll = () => {
    setExpandedDomains(new Set());
  };

  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      width: '400px',
      maxHeight: '80vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      borderRadius: '8px',
      padding: '16px',
      color: 'white',
      fontFamily: 'monospace',
      zIndex: 1000,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
          🔍 Domain Inspector
        </h3>

        {/* Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(5, 1fr)', 
          gap: '4px',
          marginBottom: '12px',
        }}>
          <div style={{ textAlign: 'center', padding: '4px', background: '#007acc44', borderRadius: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{domainStats.total}</div>
            <div style={{ fontSize: '9px' }}>Total</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#4ec9b044', borderRadius: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{domainStats['object-set']}</div>
            <div style={{ fontSize: '9px' }}>Objects</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#b5cea844', borderRadius: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{domainStats.numeric}</div>
            <div style={{ fontSize: '9px' }}>Numeric</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#569cd644', borderRadius: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{domainStats.pose}</div>
            <div style={{ fontSize: '9px' }}>Pose</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#ce917844', borderRadius: '4px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{domainStats.bbox}</div>
            <div style={{ fontSize: '9px' }}>BBox</div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px',
              borderRadius: '4px',
              border: '1px solid #444',
              background: '#1e1e1e',
              color: 'white',
              fontSize: '12px',
              marginBottom: '8px',
            }}
          />
          
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {['all', 'object-set', 'numeric', 'pose', 'bbox', 'boolean'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: filterType === type ? '#007acc' : '#333',
                  color: 'white',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={expandAll}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                border: 'none',
                background: '#2d2d2d',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                borderRadius: '4px',
                border: 'none',
                background: '#2d2d2d',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Variable List */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        borderTop: '1px solid #444',
        paddingTop: '8px',
      }}>
        {filteredVariables.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            No variables found
          </div>
        ) : (
          filteredVariables.map(variable => {
            const isExpanded = expandedDomains.has(variable.id);
            const isSelected = selectedVariableId === variable.id;
            
            return (
              <div
                key={variable.id}
                style={{
                  marginBottom: '8px',
                  border: isSelected ? '1px solid #007acc' : '1px solid #333',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  onClick={() => {
                    toggleExpand(variable.id);
                    onSelectVariable?.(variable);
                  }}
                  style={{
                    padding: '8px',
                    backgroundColor: isSelected ? '#007acc44' : '#1e1e1e',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <span style={{ fontWeight: 'bold', color: '#dcdcaa' }}>
                      {variable.name}
                    </span>
                    <span style={{ 
                      fontSize: '10px', 
                      padding: '2px 6px',
                      background: '#333',
                      borderRadius: '3px',
                      color: '#aaa',
                    }}>
                      {variable.domain.type}
                    </span>
                  </div>
                  {variable.isFixed && (
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#6a9955',
                      fontStyle: 'italic',
                    }}>
                      📌 Fixed
                    </span>
                  )}
                </div>

                {/* Details */}
                {isExpanded && (
                  <div style={{
                    padding: '8px',
                    backgroundColor: '#252526',
                    borderTop: '1px solid #333',
                  }}>
                    <DomainValueDisplay domain={variable.domain} />
                    
                    {variable.currentValue !== undefined && (
                      <div style={{ 
                        marginTop: '8px', 
                        paddingTop: '8px',
                        borderTop: '1px dashed #444',
                        fontSize: '11px',
                        color: '#6a9955',
                      }}>
                        <strong>Current Value:</strong>{' '}
                        {JSON.stringify(variable.currentValue)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DomainInspector;
