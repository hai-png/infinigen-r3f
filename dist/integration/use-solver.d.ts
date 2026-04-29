import * as THREE from 'three';
import { SolverState, Relation, ObjectState } from '../index';
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
 * @example
 * ```tsx
 * function Scene() {
 *   const { state, isSolved, violationCount } = useInfinigenSolver({
 *     constraints: [new AnyRelation(...)],
 *     initialObjects: [...],
 *     autoSolve: true
 *   });
 *
 *   return (
 *     <>
 *       {state?.objects.map(obj => (
 *         <mesh key={obj.id} position={obj.position} rotation={obj.rotation}>
 *           <boxGeometry />
 *           <meshStandardMaterial color={obj.id === 'selected' ? 'red' : 'blue'} />
 *         </mesh>
 *       ))}
 *       {!isSolved && <Text>Solving... ({violationCount} violations)</Text>}
 *     </>
 *   );
 * }
 * ```
 */
export declare function useInfinigenSolver(params: UseInfinigenSolverParams): UseInfinigenSolverResult;
/**
 * Hook to visualize solver state in real-time.
 */
export declare function useSolverVisualization(state: SolverState | null): void;
//# sourceMappingURL=use-solver.d.ts.map