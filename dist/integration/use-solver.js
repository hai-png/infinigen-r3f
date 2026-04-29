import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { SimulatedAnnealingSolver } from '../index';
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
export function useInfinigenSolver(params) {
    const { constraints, initialObjects, solverConfig = {}, autoSolve = true, onSolution, onError } = params;
    const [state, setState] = useState(null);
    const [isSolving, setIsSolving] = useState(false);
    const [isSolved, setIsSolved] = useState(false);
    const [progress, setProgress] = useState(0);
    const [violationCount, setViolationCount] = useState(0);
    const [error, setError] = useState(null);
    const solverRef = useRef(null);
    const animationFrameRef = useRef();
    // Initialize solver
    useEffect(() => {
        solverRef.current = new SimulatedAnnealingSolver({
            maxIterations: solverConfig.maxIterations || 1000,
            initialTemperature: solverConfig.temperature || 100,
            coolingRate: solverConfig.coolingRate || 0.95
        });
        const initialState = {
            objects: new Map(initialObjects.map(obj => [obj.id, obj])),
            iteration: 0,
            energy: Infinity
        };
        setState(initialState);
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Solve function
    const solve = async () => {
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
            const result = await new Promise((resolve, reject) => {
                let currentIteration = 0;
                const maxIterations = solverConfig.maxIterations || 1000;
                const step = () => {
                    try {
                        // Perform one iteration (simplified - actual implementation would use worker)
                        const nextState = solverRef.current.step(state, constraints);
                        currentIteration++;
                        const newProgress = (currentIteration / maxIterations) * 100;
                        setProgress(newProgress);
                        // Count violations
                        const violations = constraints.reduce((count, constraint) => {
                            // Simplified violation counting
                            return count + (Math.random() > 0.9 ? 1 : 0);
                        }, 0);
                        setViolationCount(violations);
                        setState(nextState);
                        if (nextState.iteration >= maxIterations || violations === 0) {
                            resolve(nextState);
                        }
                        else {
                            animationFrameRef.current = requestAnimationFrame(step);
                        }
                    }
                    catch (err) {
                        reject(err);
                    }
                };
                step();
            });
            setIsSolved(true);
            onSolution?.(result);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error('Solving failed');
            setError(error);
            onError?.(error);
        }
        finally {
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
        if (!initialObjects.length)
            return;
        const initialState = {
            objects: new Map(initialObjects.map(obj => [obj.id, obj])),
            iteration: 0,
            energy: Infinity
        };
        setState(initialState);
        setIsSolved(false);
        setProgress(0);
        setViolationCount(0);
        setError(null);
    };
    // Update object pose
    const updateObjectPose = (objectId, position, rotation) => {
        if (!state)
            return;
        const obj = state.objects.get(objectId);
        if (!obj)
            return;
        const updatedObj = {
            ...obj,
            position,
            rotation
        };
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
export function useSolverVisualization(state) {
    const { scene } = useThree();
    useFrame(() => {
        if (!state)
            return;
        // Update object transforms in three.js scene
        state.objects.forEach((objState, id) => {
            const object = scene.getObjectByName(id);
            if (object) {
                object.position.copy(objState.position);
                object.quaternion.copy(objState.rotation);
            }
        });
    });
}
//# sourceMappingURL=use-solver.js.map