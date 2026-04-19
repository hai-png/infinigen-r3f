/**
 * Violation Debugger Component - Phase 12
 * Visualizes constraint violations in the scene
 */

import React, { useState, useMemo } from 'react';
import { ViolationReport, ConstraintNode } from '../constraint-language/types';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

interface ViolationDebuggerProps {
  violations: ViolationReport[];
  constraints: ConstraintNode[];
  onSelectViolation?: (violation: ViolationReport) => void;
  autoRefresh?: boolean;
}

interface ViolationMarkerProps {
  violation: ViolationReport;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

const ViolationMarker: React.FC<ViolationMarkerProps> = ({
  violation,
  position,
  isSelected,
  onClick,
}) => {
  const color = useMemo(() => {
    const severity = violation.severity || 'high';
    switch (severity) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff6600';
      case 'medium': return '#ffcc00';
      case 'low': return '#ffff00';
      default: return '#ff0000';
    }
  }, [violation.severity]);

  const scale = isSelected ? 1.5 : 1.0;

  return (
    <group position={position} onClick={onClick}>
      {/* Marker sphere */}
      <mesh>
        <sphereGeometry args={[0.3 * scale, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      {/* Direction arrow */}
      {violation.direction && (
        <line>
          <bufferGeometry>
            <float32BufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([
                0, 0, 0,
                violation.direction[0] * 0.5,
                violation.direction[1] * 0.5,
                violation.direction[2] * 0.5,
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={color} linewidth={2} />
        </line>
      )}
      
      {/* Label */}
      <Text
        position={[0, 0.5 * scale, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {violation.constraintName || 'Violation'}
      </Text>
    </group>
  );
};

export const ViolationDebugger: React.FC<ViolationDebuggerProps> = ({
  violations,
  constraints,
  onSelectViolation,
  autoRefresh = true,
}) => {
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const filteredViolations = useMemo(() => {
    if (filterSeverity === 'all') return violations;
    return violations.filter(v => v.severity === filterSeverity);
  }, [violations, filterSeverity]);

  const violationStats = useMemo(() => {
    const stats = {
      total: violations.length,
      critical: violations.filter(v => v.severity === 'critical').length,
      high: violations.filter(v => v.severity === 'high').length,
      medium: violations.filter(v => v.severity === 'medium').length,
      low: violations.filter(v => v.severity === 'low').length,
    };
    return stats;
  }, [violations]);

  const handleViolationClick = (violation: ViolationReport) => {
    setSelectedViolationId(violation.id);
    onSelectViolation?.(violation);
  };

  return (
    <div style={{ 
      position: 'absolute', 
      top: 10, 
      right: 10, 
      width: '350px',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderRadius: '8px',
      padding: '16px',
      color: 'white',
      fontFamily: 'monospace',
      zIndex: 1000,
    }}>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
          🔴 Violation Debugger
        </h3>
        
        {/* Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: '4px',
          marginBottom: '12px',
        }}>
          <div style={{ textAlign: 'center', padding: '4px', background: '#ff000044', borderRadius: '4px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{violationStats.critical}</div>
            <div style={{ fontSize: '10px' }}>Critical</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#ff660044', borderRadius: '4px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{violationStats.high}</div>
            <div style={{ fontSize: '10px' }}>High</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#ffcc0044', borderRadius: '4px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{violationStats.medium}</div>
            <div style={{ fontSize: '10px' }}>Medium</div>
          </div>
          <div style={{ textAlign: 'center', padding: '4px', background: '#ffff0044', borderRadius: '4px' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{violationStats.low}</div>
            <div style={{ fontSize: '10px' }}>Low</div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '12px', marginRight: '8px' }}>Filter:</label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            style={{
              padding: '4px',
              borderRadius: '4px',
              border: 'none',
              background: '#333',
              color: 'white',
              fontSize: '12px',
            }}
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          <label style={{ fontSize: '12px', marginLeft: '12px', marginRight: '8px' }}>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              style={{ marginRight: '4px' }}
            />
            Labels
          </label>
        </div>
      </div>

      {/* Violation List */}
      <div style={{ 
        maxHeight: '300px', 
        overflowY: 'auto',
        borderTop: '1px solid #444',
        paddingTop: '8px',
      }}>
        {filteredViolations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            ✅ No violations found
          </div>
        ) : (
          filteredViolations.map((violation, index) => (
            <div
              key={violation.id}
              onClick={() => handleViolationClick(violation)}
              style={{
                padding: '8px',
                marginBottom: '4px',
                backgroundColor: selectedViolationId === violation.id ? '#444' : '#222',
                borderRadius: '4px',
                cursor: 'pointer',
                borderLeft: `4px solid ${
                  violation.severity === 'critical' ? '#ff0000' :
                  violation.severity === 'high' ? '#ff6600' :
                  violation.severity === 'medium' ? '#ffcc00' : '#ffff00'
                }`,
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                {violation.constraintName || `Constraint #${index + 1}`}
              </div>
              <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>
                Type: {violation.type || 'Unknown'}
              </div>
              <div style={{ fontSize: '10px', color: '#aaa' }}>
                Objects: {violation.objectIds?.join(', ') || 'N/A'}
              </div>
              {violation.message && (
                <div style={{ fontSize: '10px', color: '#ff6666', marginTop: '4px' }}>
                  ⚠️ {violation.message}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ViolationDebugger;
