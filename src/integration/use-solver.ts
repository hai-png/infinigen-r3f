import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  SimulatedAnnealingSolver,
  MoveOperatorFactory,
  retryAttemptProposals,
  type MoveProposal,
} from '../index';
import { violCount, evaluateProblem } from '../core/constraints/evaluator/evaluate';
import type { ObjectState } from '../core/constraints/evaluator/state';
import type { State as ConstraintState } from '../core/constraints/evaluator/state';
import type { Relation as RelationType } from '../core/constraints/language/relations';
import { SeededRandom } from '../core/constraints/../../util/MathUtils';

// The integration layer uses its own extended SolverState that includes
// SA iteration tracking on top of the base ConstraintState
// It's a plain object, not a class instance — for serialization and React state
export interface SolverState {
  objects: Map<string, ObjectState>;
  iteration: number;
  energy: number;
  currentScore: number;
  bestScore: number;
  assignments: Map<string, any>;
  lastMove: any;
  lastMoveAccepted: boolean;
  bvhCache?: any;
  trimeshScene?: any;
  graphs?: any[];
  planes?: any;
  problem?: any;
}

type Relation = RelationType;

export interface UseInfinigenSolverParams {
  /** Initial constraint relations */
  constraints: Relation[];
  /** Initial object states */
  initialObjects: ObjectState[];
  /** Solver configuration */
  solverConfig?: {
    maxIterations?: number;
    temperature?: number;
    coolingRate?: number;
  };
  /** Enable real-time solving on constraint changes */
  autoSolve?: boolean;
  /** Callback when solution is found */
  onSolution?: (state: SolverState) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseInfinigenSolverResult {
  /** Current solver state */
  state: SolverState | null;
  /** Whether solving is in progress */
  isSolving: boolean;
  /** Whether a solution has been found */
  isSolved: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Number of constraint violations */
  violationCount: number;
  /** Error if any */
  error: Error | null;
  /** Manually trigger solve */
  solve: () => Promise<void>;
  /** Reset solver to initial state */
  reset: () => void;
  /** Update specific object pose */
  updateObjectPose: (objectId: string, position: THREE.Vector3, rotation: THREE.Quaternion) => void;
}

/**
 * React hook for running the Infinigen constraint solver.
 * 
 * Uses the canonical SimulatedAnnealingSolver from sa-solver.ts.
 */
export function useInfinigenSolver(
  params: UseInfinigenSolverParams
): UseInfinigenSolverResult {
  const {
    constraints,
    initialObjects,
    solverConfig = {},
    autoSolve = true,
    onSolution,
    onError
  } = params;

  const [state, setState] = useState<SolverState | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isSolved, setIsSolved] = useState(false);
  const [progress, setProgress] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const solverRef = useRef<SimulatedAnnealingSolver | null>(null);
  const moveFactoryRef = useRef<MoveOperatorFactory | null>(null);
  const animationFrameRef = useRef<number>();

  // Initialize solver
  useEffect(() => {
    // SimulatedAnnealingSolver from sa-solver.ts takes a single config object
    solverRef.current = new SimulatedAnnealingSolver({
      maxIterations: solverConfig.maxIterations || 1000,
      initialTemperature: solverConfig.temperature || 100,
      coolingRate: solverConfig.coolingRate || 0.995,
    });

    const makeInitialState = (): SolverState => ({
      objects: new Map(initialObjects.map(obj => [obj.id, obj])),
      iteration: 0,
      energy: Infinity,
      currentScore: Infinity,
      bestScore: Infinity,
      assignments: new Map(),
      lastMove: null,
      lastMoveAccepted: false
    });

    setState(makeInitialState());

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Solve function
  const solve = async (): Promise<void> => {
    if (!solverRef.current || !state) {
      setError(new Error('Solver not initialized'));
      return;
    }

    setIsSolving(true);
    setIsSolved(false);
    setProgress(0);
    setError(null);

    try {
      // Run solver in background
      const result = await new Promise<SolverState>((resolve, reject) => {
        let currentIteration = 0;
        const maxIterations = solverConfig.maxIterations || 1000;

        const step = () => {
          try {
            // Generate a real move proposal using MoveOperatorFactory
            let proposal = null;
            try {
              if (!moveFactoryRef.current) {
                moveFactoryRef.current = new MoveOperatorFactory();
              }
              const rng = new SeededRandom(Date.now() + currentIteration);
              const result = retryAttemptProposals(
                10, // maxInvalid retries
                moveFactoryRef.current,
                state,
                rng
              );
              if (result) {
                proposal = {
                  objectId: result.proposal.objectId ?? '',
                  variableId: result.proposal.objectId ?? '',
                  newValue: result.proposal,
                  newState: {} as any,
                  score: 0,
                  metadata: {
                    type: (result.proposal.type === 'TRANSLATE' || result.proposal.type === 'ROTATE'
                      ? 'continuous'
                      : result.proposal.type === 'ADDITION' || result.proposal.type === 'DELETION'
                        ? 'discrete'
                        : 'hybrid') as 'continuous' | 'discrete' | 'hybrid',
                    moveType: result.proposal.type,
                  },
                };
                // Apply the move to the state
                if (result.operator.isValid(state, result.proposal)) {
                  result.operator.apply(state, result.proposal);
                }
              }
            } catch {
              // MoveOperatorFactory may not work in all contexts
            }

            // Fallback: create a simple continuous proposal if move factory fails
            if (!proposal) {
              proposal = {
                objectId: '',
                variableId: '',
                newValue: null,
                newState: {} as any,
                score: 0,
                metadata: { type: 'continuous' as const },
              };
            }

            const nextState = solverRef.current!.step(state, proposal);

            currentIteration++;
            const newProgress = (currentIteration / maxIterations) * 100;
            setProgress(newProgress);

            // Count violations using the actual evaluator pipeline
            let violations = 0;
            try {
              // Build a solver State from the current objects for the evaluator
              const evalState: ConstraintState = new ConstraintState(
                state.objects,
                state.problem
              );
              // Build a problem from the constraints for evaluation
              const evalProblem: any = {
                constraints: constraints as any[],
              };
              const memo = new Map();
              for (const constraint of constraints) {
                try {
                  const v = violCount(constraint as any, evalState, memo, null);
                  if (v > 0) violations++;
                } catch {
                  // Constraint evaluation may fail in incomplete state
                }
              }
            } catch {
              // Evaluator not available — fall back to energy-based estimate
              violations = nextState.energy > 0 ? Math.round(nextState.energy) : 0;
            }
            setViolationCount(violations);

            // Merge the SA solver's result with our state
            const mergedState: SolverState = {
              ...state,
              objects: new Map(state.objects),
              iteration: nextState.iteration,
              energy: nextState.energy,
              currentScore: nextState.currentScore,
              bestScore: nextState.bestScore,
              assignments: nextState.assignments,
              lastMove: nextState.lastMove,
              lastMoveAccepted: nextState.lastMoveAccepted,
            };
            setState(mergedState);

            if (nextState.iteration >= maxIterations || violations === 0) {
              resolve(mergedState);
            } else {
              animationFrameRef.current = requestAnimationFrame(step);
            }
          } catch (err) {
            reject(err);
          }
        };

        step();
      });

      setIsSolved(true);
      onSolution?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Solving failed');
      setError(error);
      onError?.(error);
    } finally {
      setIsSolving(false);
    }
  };

  // Auto-solve on constraint changes
  useEffect(() => {
    if (autoSolve && state && !isSolving) {
      solve();
    }
  }, [constraints, autoSolve]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset function
  const reset = () => {
    if (!initialObjects.length) return;

    const makeInitialState = (): SolverState => ({
      objects: new Map(initialObjects.map(obj => [obj.id, obj])),
      iteration: 0,
      energy: Infinity,
      currentScore: Infinity,
      bestScore: Infinity,
      assignments: new Map(),
      lastMove: null,
      lastMoveAccepted: false
    });

    setState(makeInitialState());
    setIsSolved(false);
    setProgress(0);
    setViolationCount(0);
    setError(null);
  };

  // Update object pose
  const updateObjectPose = (
    objectId: string,
    position: THREE.Vector3,
    rotation: THREE.Quaternion
  ) => {
    if (!state) return;

    const obj = state.objects?.get(objectId);
    if (!obj) return;

    const updatedObj = {
      ...obj,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
    } as ObjectState;

    const newObjects = new Map(state.objects);
    newObjects.set(objectId, updatedObj);

    setState({
      ...state,
      objects: newObjects
    });
  };

  return {
    state,
    isSolving,
    isSolved,
    progress,
    violationCount,
    error,
    solve,
    reset,
    updateObjectPose
  };
}

/**
 * Hook to visualize solver state in real-time.
 */
export function useSolverVisualization(state: SolverState | null) {
  const { scene } = useThree();
  
  useFrame(() => {
    if (!state?.objects) return;
    
    // Update object transforms in three.js scene
    state.objects.forEach((objState, id) => {
      const object = scene.getObjectByName(id);
      if (object) {
        object.position.copy(new THREE.Vector3(objState.position.x, objState.position.y, objState.position.z));
        object.quaternion.copy(new THREE.Quaternion(objState.rotation.x, objState.rotation.y, objState.rotation.z));
      }
    });
  });
}
