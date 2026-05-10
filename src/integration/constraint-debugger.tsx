import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Text, Line, Box, Sphere } from '@react-three/drei';
import type { Relation as RelationType } from '../core/constraints/language/relations';
import type { Domain as DomainType } from '../core/constraints/language/types';
import { ConstraintEvaluator } from '../core/constraints/solver/ConstraintEvaluator';
import {
  ObjectState as UnifiedObjectState,
  Relation as UnifiedRelation,
  TagSet,
  Tag,
  Polygon2D,
  DOFConstraints,
} from '../core/constraints/unified/UnifiedConstraintSystem';

// The debugger accepts a simplified state interface compatible with
// both the core ConstraintState and the integration hook's SolverState
export interface DebuggerState {
  objects: Map<string, any>;
  [key: string]: any;
}

export interface ConstraintDebuggerProps {
  /** Current solver state */
  state: DebuggerState | null;
  /** Active constraints */
  constraints: RelationType[];
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
    
    // Convert debugger state to unified ObjectState map for evaluation
    const unifiedState = new Map<string, UnifiedObjectState>();
    for (const [id, objState] of state.objects.entries()) {
      if (objState && typeof objState === 'object') {
        const pos = objState.position || objState.pose?.position || { x: 0, y: 0, z: 0 };
        const rot = objState.rotation || objState.pose?.rotation || { x: 0, y: 0, z: 0 };
        unifiedState.set(id, new UnifiedObjectState({
          id,
          type: id,
          position: new THREE.Vector3(pos.x, pos.y, pos.z),
          rotation: new THREE.Euler(rot.x, rot.y, rot.z),
          boundingBox: new THREE.Box3(
            new THREE.Vector3(pos.x - 0.5, pos.y - 0.5, pos.z - 0.5),
            new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
          ),
        }));
      }
    }
    
    // Evaluate each constraint for violations using actual evaluation
    constraints.forEach((constraint, index) => {
      const key = `constraint-${index}`;
      try {
        // Strategy 1: If constraint is a language-level Relation with evaluate(state),
        // build a Variable->value map from the debugger state and evaluate directly
        if (typeof (constraint as any).evaluate === 'function') {
          const evalState = new Map();
          // Populate the state map so that ObjectSetExpressions can resolve
          for (const [id, objState] of state.objects.entries()) {
            evalState.set(id, objState);
          }
          const result = (constraint as any).evaluate(evalState);
          // evaluate() returns boolean for language-level relations
          status.set(key, result === false);
        }
        // Strategy 2: If constraint has isSatisfied(state), use it
        else if (typeof (constraint as any).isSatisfied === 'function') {
          const evalState = new Map();
          for (const [id, objState] of state.objects.entries()) {
            evalState.set(id, objState);
          }
          const isSatisfied = (constraint as any).isSatisfied(evalState);
          status.set(key, !isSatisfied);
        }
        // Strategy 3: Use ConstraintEvaluator for unified Relation objects
        else {
          // Not a recognized constraint type — default to no violation
          status.set(key, false);
        }
      } catch {
        // Evaluation failed — this indicates the constraint could not be
        // evaluated with the available state, not that it's violated
        status.set(key, false);
      }
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
              position={[objState.position.x, objState.position.y, objState.position.z]}
              rotation={new THREE.Euler(objState.rotation.x, objState.rotation.y, objState.rotation.z)}
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
        {`Objects: ${state.objects.size}`}
        {`\nBVH cached: ${state.bvhCache?.size ?? 0}`}
      </Text>
    </group>
  );
};

interface DomainVisualizerProps {
  domain: DomainType;
  objectId: string;
}

const DomainVisualizer: React.FC<DomainVisualizerProps> = ({ domain, objectId }) => {
  // Visualize domain bounds as wireframe box
  const bbox = domain.boundingBox;
  
  if (!bbox) return null;
  
  const center = {
    x: (bbox.mins[0] + bbox.maxs[0]) / 2,
    y: (bbox.mins[1] + bbox.maxs[1]) / 2,
    z: (bbox.mins[2] + bbox.maxs[2]) / 2,
  };
  const size = {
    x: bbox.maxs[0] - bbox.mins[0],
    y: bbox.maxs[1] - bbox.mins[1],
    z: bbox.maxs[2] - bbox.mins[2],
  };
  
  return (
    <Box
      args={[size.x, size.y, size.z]}
      position={[center.x, center.y, center.z]}
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
  constraint: RelationType;
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
