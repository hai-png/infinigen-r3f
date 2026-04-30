import { useState, useEffect, useCallback, useRef } from 'react';
import { SolverState } from '../../core/constraints/solver/moves';

interface UseSolverControlsOptions {
  initialState?: Partial<SolverState>;
  autoStart?: boolean;
  onIteration?: (state: SolverState) => void;
  onComplete?: (state: SolverState) => void;
}

/**
 * useSolverControls - Hook for controlling the constraint solver
 */
export function useSolverControls({
  initialState,
  autoStart = false,
  onIteration,
  onComplete,
}: UseSolverControlsOptions = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [iterationCount, setIterationCount] = useState(0);
  const [currentScore, setCurrentScore] = useState(initialState?.currentScore ?? Infinity);
  const [bestScore, setBestScore] = useState<number | null>(initialState?.bestScore ?? null);
  const [temperature, setTemperature] = useState<number | null>(initialState?.temperature ?? null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Start the solver
  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();
  }, []);

  // Pause the solver
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  // Resume the solver
  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  // Stop the solver
  const stop = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Reset the solver state
  const reset = useCallback(() => {
    stop();
    setIterationCount(0);
    setCurrentScore(initialState?.currentScore ?? Infinity);
    setBestScore(initialState?.bestScore ?? null);
    setTemperature(initialState?.temperature ?? null);
    setElapsedTime(0);
    startTimeRef.current = null;
  }, [stop, initialState]);

  // Step forward one iteration
  const step = useCallback(() => {
    setIterationCount((prev) => prev + 1);
    
    // Simulate score improvement (placeholder logic)
    setCurrentScore((prev) => {
      const improvement = Math.random() * 0.1;
      const newScore = Math.max(0, prev - improvement);
      if (!bestScore || newScore < bestScore) {
        setBestScore(newScore);
      }
      return newScore;
    });

    // Update temperature if using simulated annealing
    setTemperature((prev) => {
      if (prev === null) return null;
      return Math.max(0.01, prev * 0.995);
    });
  }, [bestScore]);

  // Main solver loop
  useEffect(() => {
    if (!isRunning || isPaused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const loop = () => {
      step();

      // Update elapsed time
      if (startTimeRef.current) {
        setElapsedTime(Date.now() - startTimeRef.current);
      }

      // Call iteration callback
      const currentState: SolverState = {
        iteration: iterationCount + 1,
        currentScore,
        bestScore: bestScore ?? undefined,
        temperature: temperature ?? undefined,
      } as SolverState;

      onIteration?.(currentState);

      // Check for completion (placeholder condition)
      if (currentScore < 0.001 || iterationCount > 10000) {
        setIsRunning(false);
        onComplete?.(currentState);
      } else {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, isPaused, step, iterationCount, currentScore, bestScore, temperature, onIteration, onComplete]);

  // Auto-start if configured
  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    isPaused,
    iterationCount,
    currentScore,
    bestScore,
    temperature,
    elapsedTime,
    start,
    pause,
    resume,
    stop,
    reset,
    step,
  };
}

import { useRef } from 'react';
