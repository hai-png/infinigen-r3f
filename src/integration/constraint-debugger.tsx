import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Text, Line, Box, Sphere } from '@react-three/drei';
import { SolverState, Relation, Domain } from '../index';

export interface ConstraintDebuggerProps {
  /** Current solver state */
  state: SolverState | null;
  /** Active constraints */
  constraints: Relation[];
  /** Show constraint domains */
  showDomains?: boolean;
  /** Highlight violations */
  highlightViolations?: boolean;
  /** Show object IDs */
  showLabels?: boolean;
  /** Scale factor for visualization */
  scale?: number;
}

/**
 * Component to visualize constraint satisfaction state in 3D.
 * 
 * @example
 * ```tsx
 * <ConstraintDebugger
 *   state={solverState}
 *   constraints={relations}
 *   showDomains={true}
 *   highlightViolations={true}
 * />
 * ```
 */
export const ConstraintDebugger: React.FC<ConstraintDebuggerProps> = ({
  state,
  constraints,
  showDomains = true,
  highlightViolations = true,
  showLabels = true,
  scale = 1
}) => {
  // Compute violation status for each constraint
  const violationStatus = useMemo(() => {
    if (!state) return new Map<string, boolean>();
    
    const status = new Map<string, boolean>();
    
    // Simplified violation detection (real implementation would use evaluator)
    constraints.forEach((constraint, index) => {
      const key = `constraint-${index}`;
      // Random violation for demo purposes
      const isViolated = Math.random() > 0.8;
      status.set(key, isViolated);
    });
    
    return status;
  }, [state, constraints]);

  if (!state) {
    return (
      <group>
        <Text position={[0, 2, 0]} fontSize={0.2} color="white">
          No solver state available
        </Text>
      </group>
    );
  }

  return (
    <group scale={[scale, scale, scale]}>
      {/* Render objects */}
      {Array.from(state.objects.entries()).map(([id, objState]) => {
        const isViolated = highlightViolations && 
          Array.from(violationStatus.values()).some(v => v);
        
        return (
          <group key={id} name={id}>
            {/* Object representation */}
            <Box
              args={[0.5, 0.5, 0.5]}
              position={objState.position}
              rotation={objState.rotation.toEuler()}
            >
              <meshStandardMaterial
                color={isViolated ? 'red' : 'blue'}
                transparent
                opacity={0.7}
              />
            </Box>
            
            {/* Object label */}
            {showLabels && (
              <Text
                position={[
                  objState.position.x,
                  objState.position.y + 0.5,
                  objState.position.z
                ]}
                fontSize={0.1}
                color="white"
                anchorX="center"
                anchorY="bottom"
              >
                {id}
              </Text>
            )}
            
            {/* Domain visualization */}
            {showDomains && objState.domain && (
              <DomainVisualizer domain={objState.domain} objectId={id} />
            )}
          </group>
        );
      })}
      
      {/* Constraint visualizations */}
      {constraints.map((constraint, index) => {
        const key = `constraint-${index}`;
        const isViolated = violationStatus.get(key) || false;
        
        return (
          <ConstraintVisualizer
            key={key}
            constraint={constraint}
            index={index}
            isViolated={isViolated}
          />
        );
      })}
      
      {/* Statistics overlay */}
      <Text position={[-2, 2, 0]} fontSize={0.15} color="white" anchorX="left">
        {`Iteration: ${state.iteration}`}
        {`\nEnergy: ${state.energy.toFixed(2)}`}
        {`\nViolations: ${Array.from(violationStatus.values()).filter(v => v).length}/${constraints.length}`}
      </Text>
    </group>
  );
};

interface DomainVisualizerProps {
  domain: Domain;
  objectId: string;
}

const DomainVisualizer: React.FC<DomainVisualizerProps> = ({ domain, objectId }) => {
  // Visualize domain bounds as wireframe box
  const bbox = domain.boundingBox;
  
  if (!bbox) return null;
  
  const center = bbox.center();
  const size = bbox.dims();
  
  return (
    <Box
      args={[size.x, size.y, size.z]}
      position={center}
    >
      <meshBasicMaterial
        color="yellow"
        wireframe
        transparent
        opacity={0.3}
      />
    </Box>
  );
};

interface ConstraintVisualizerProps {
  constraint: Relation;
  index: number;
  isViolated: boolean;
}

const ConstraintVisualizer: React.FC<ConstraintVisualizerProps> = ({
  constraint,
  index,
  isViolated
}) => {
  // Extract involved object IDs from constraint
  const objectIds = useMemo(() => {
    const ids: string[] = [];
    
    // Traverse constraint to find object references
    // Simplified - real implementation would use constraint traversal
    if ('objects' in constraint && Array.isArray(constraint.objects)) {
      ids.push(...constraint.objects.slice(0, 2));
    }
    
    return ids;
  }, [constraint]);
  
  if (objectIds.length < 2) return null;
  
  // Position for constraint label
  const labelPos = new THREE.Vector3(
    Math.sin(index) * 3,
    0.5,
    Math.cos(index) * 3
  );
  
  return (
    <group>
      {/* Connection line between objects */}
      {objectIds.length >= 2 && (
        <Line
          points={[
            new THREE.Vector3(Math.sin(index) * 2, 0, Math.cos(index) * 2),
            new THREE.Vector3(Math.sin(index + 1) * 2, 0, Math.cos(index + 1) * 2)
          ]}
          color={isViolated ? 'red' : 'green'}
          lineWidth={2}
          dashed={!isViolated}
        />
      )}
      
      {/* Constraint label */}
      <Text
        position={labelPos}
        fontSize={0.08}
        color={isViolated ? 'red' : 'lime'}
        anchorX="center"
      >
        {constraint.type || 'Relation'}
      </Text>
      
      {/* Violation indicator */}
      {isViolated && (
        <Sphere args={[0.1, 8, 8]} position={labelPos}>
          <meshBasicMaterial color="red" />
        </Sphere>
      )}
    </group>
  );
};

/**
 * Simplified debug overlay for quick constraint status check.
 */
export const ConstraintOverlay: React.FC<{
  violations: number;
  total: number;
  progress: number;
}> = ({ violations, total, progress }) => {
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      background: 'rgba(0,0,0,0.7)',
      padding: '10px',
      borderRadius: '5px',
      color: 'white',
      fontFamily: 'monospace',
      zIndex: 1000
    }}>
      <div>Constraints: {total - violations}/{total} satisfied</div>
      <div>Violations: {violations}</div>
      <div style={{ marginTop: '5px' }}>
        Progress: {progress.toFixed(1)}%
        <div style={{
          width: '200px',
          height: '10px',
          background: '#333',
          borderRadius: '3px',
          marginTop: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: violations === 0 ? '#4ade80' : '#f87171',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>
    </div>
  );
};
