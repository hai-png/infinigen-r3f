/**
 * SimulationZoneExecutors — Executor functions for simulation and repeat zone nodes
 *
 * Provides executor functions for Blender 3.x style simulation zones and
 * repeat zones. These executors handle the iterative/looping evaluation
 * of inner node subgraphs.
 *
 * Executors:
 * - executeSimulationZone: Runs a simulation zone for N steps
 * - executeRepeatZone: Runs a repeat zone for N iterations
 * - executeSimulationInput: Provides step context inside a simulation zone
 * - executeSimulationOutput: Collects step output inside a simulation zone
 * - executeRepeatInput: Provides iteration context inside a repeat zone
 * - executeRepeatOutput: Collects iteration output inside a repeat zone
 *
 * The zone executors (SimulationZone, RepeatZone) use an inner graph
 * evaluation callback pattern. When integrated with the full NodeEvaluator,
 * the callback is wired to evaluate the inner subgraph. When used standalone,
 * a simple passthrough callback is used.
 *
 * @module core/nodes/execution/SimulationZoneExecutors
 */

import type { NodeInputs, NodeOutput } from './ExecutorTypes';
import type { SimulationState, SimulationStepContext } from '../simulation/SimulationNodes';

// ============================================================================
// Types
// ============================================================================

/**
 * Function type for evaluating the inner graph of a zone.
 *
 * Takes the current state as input and returns the new state after
 * evaluating all inner nodes. The `zoneId` identifies which zone's
 * inner graph to evaluate.
 *
 * @param state - Current simulation/iteration state (geometry + attributes)
 * @param context - Step/iteration context (timing, index, etc.)
 * @param zoneId - ID of the zone whose inner graph to evaluate
 * @returns New state after inner graph evaluation
 */
export type InnerGraphEvaluator = (
  state: SimulationState,
  context: {
    deltaTime: number;
    elapsedTime: number;
    stepIndex: number;
    iterationIndex: number;
    zoneId: string;
  },
) => SimulationState;

/**
 * Global registry for inner graph evaluators, keyed by zone ID.
 *
 * Before evaluating a zone, the caller should register an inner graph
 * evaluator for the zone's ID. The zone executor will look up and call
 * this evaluator for each step/iteration.
 *
 * If no evaluator is registered for a zone ID, a passthrough is used
 * (the geometry is returned unchanged).
 */
const innerGraphEvaluators = new Map<string, InnerGraphEvaluator>();

/**
 * Register an inner graph evaluator for a zone.
 */
export function registerInnerGraphEvaluator(zoneId: string, evaluator: InnerGraphEvaluator): void {
  innerGraphEvaluators.set(zoneId, evaluator);
}

/**
 * Unregister an inner graph evaluator for a zone.
 */
export function unregisterInnerGraphEvaluator(zoneId: string): void {
  innerGraphEvaluators.delete(zoneId);
}

/**
 * Get the inner graph evaluator for a zone, or null if not registered.
 */
export function getInnerGraphEvaluator(zoneId: string): InnerGraphEvaluator | null {
  return innerGraphEvaluators.get(zoneId) ?? null;
}

/**
 * Clear all registered inner graph evaluators.
 */
export function clearInnerGraphEvaluators(): void {
  innerGraphEvaluators.clear();
}

// ============================================================================
// Default Passthrough Evaluator
// ============================================================================

/**
 * Default inner graph evaluator that passes geometry through unchanged.
 * Used when no custom evaluator is registered for a zone.
 */
const passthroughEvaluator: InnerGraphEvaluator = (state) => ({
  geometry: state.geometry,
  attributes: { ...state.attributes },
});

// ============================================================================
// Simulation Zone Executor
// ============================================================================

/**
 * executeSimulationZone — Run a simulation zone for N steps.
 *
 * Algorithm:
 * 1. Get the initial geometry from the zone's input
 * 2. For each step (0..maxSteps-1):
 *    a. Create a step context with delta_time, elapsed_time, step_index
 *    b. Look up the inner graph evaluator for this zone's ID
 *    c. Evaluate the inner graph (SimulationInput → inner nodes → SimulationOutput)
 *    d. Take the output state and feed it as the next step's input
 * 3. Return the final state after all steps
 *
 * If substeps > 1, the delta_time is divided by substeps and each
 * "step" actually consists of multiple sub-step evaluations.
 *
 * Inputs:
 * - Geometry: Initial geometry state
 * - DeltaTime: Time step per frame (default 1/60)
 * - MaxSteps: Maximum simulation steps (default 1)
 * - Substeps: Subdivisions per step for accuracy (default 1)
 *
 * Outputs:
 * - Geometry: Final geometry after all steps
 * - StepsExecuted: Number of steps actually run
 * - ElapsedTime: Total simulated time
 */
export function executeSimulationZone(inputs: NodeInputs): NodeOutput {
  const geometry = inputs.Geometry ?? inputs.geometry ?? null;
  const deltaTime = (inputs.DeltaTime ?? inputs.deltaTime ?? 1 / 60) as number;
  const maxSteps = (inputs.MaxSteps ?? inputs.maxSteps ?? 1) as number;
  const substeps = (inputs.Substeps ?? inputs.substeps ?? 1) as number;
  const zoneId = (inputs._zoneId ?? inputs.zoneId ?? '') as string;

  // Initial state
  let currentState: SimulationState = {
    geometry,
    attributes: (inputs.Attributes ?? inputs.attributes ?? {}) as Record<string, any>,
  };

  // Get the inner graph evaluator
  const evaluator = innerGraphEvaluators.get(zoneId) ?? passthroughEvaluator;

  // Compute sub-step delta time
  const subDeltaTime = deltaTime / Math.max(1, substeps);
  let totalElapsedTime = 0;
  let stepsExecuted = 0;

  // Run simulation steps
  const totalEvaluations = maxSteps * substeps;
  for (let evalIndex = 0; evalIndex < totalEvaluations; evalIndex++) {
    const stepIndex = Math.floor(evalIndex / substeps);
    const substepIndex = evalIndex % substeps;

    totalElapsedTime += subDeltaTime;

    const context = {
      deltaTime: subDeltaTime,
      elapsedTime: totalElapsedTime,
      stepIndex,
      iterationIndex: evalIndex, // Global evaluation index
      zoneId,
    };

    // Evaluate the inner graph
    currentState = evaluator(currentState, context);
  }

  stepsExecuted = maxSteps;

  return {
    Geometry: currentState.geometry,
    StepsExecuted: stepsExecuted,
    ElapsedTime: totalElapsedTime,
  };
}

// ============================================================================
// Repeat Zone Executor
// ============================================================================

/**
 * executeRepeatZone — Run a repeat zone for N iterations.
 *
 * Algorithm:
 * 1. Get the initial geometry from the zone's input
 * 2. For each iteration (0..iterations-1):
 *    a. Create an iteration context with the current iteration index
 *    b. Look up the inner graph evaluator for this zone's ID
 *    c. Evaluate the inner graph (RepeatInput → inner nodes → RepeatOutput)
 *    d. Feed the output as the next iteration's input
 * 3. Return the final state after all iterations
 *
 * Inputs:
 * - Geometry: Initial geometry state
 * - Iterations: Number of iterations (default 1)
 *
 * Outputs:
 * - Geometry: Final geometry after all iterations
 * - IterationsExecuted: Number of iterations actually run
 */
export function executeRepeatZone(inputs: NodeInputs): NodeOutput {
  const geometry = inputs.Geometry ?? inputs.geometry ?? null;
  const iterations = (inputs.Iterations ?? inputs.iterations ?? 1) as number;
  const zoneId = (inputs._zoneId ?? inputs.zoneId ?? '') as string;

  // Initial state
  let currentState: SimulationState = {
    geometry,
    attributes: (inputs.Attributes ?? inputs.attributes ?? {}) as Record<string, any>,
  };

  // Get the inner graph evaluator
  const evaluator = innerGraphEvaluators.get(zoneId) ?? passthroughEvaluator;

  const clampedIterations = Math.max(0, Math.floor(iterations));

  // Run iterations
  for (let i = 0; i < clampedIterations; i++) {
    const context = {
      deltaTime: 0, // No time concept in repeat zones
      elapsedTime: 0,
      stepIndex: i,
      iterationIndex: i,
      zoneId,
    };

    // Evaluate the inner graph
    currentState = evaluator(currentState, context);
  }

  return {
    Geometry: currentState.geometry,
    IterationsExecuted: clampedIterations,
  };
}

// ============================================================================
// Simulation Input Executor
// ============================================================================

/**
 * executeSimulationInput — Provide step context inside a simulation zone.
 *
 * This executor is called for the SimulationInputNode inside a simulation
 * zone's inner graph. It receives the current state and step context from
 * the zone executor and outputs:
 * - Geometry: The current geometry state
 * - DeltaTime: Time delta for this step
 * - ElapsedTime: Total elapsed time
 * - StepIndex: Current step number
 *
 * The actual state and context are injected by the zone executor via
 * the inputs._state and inputs._stepContext fields.
 */
export function executeSimulationInput(inputs: NodeInputs): NodeOutput {
  const state = inputs._state as SimulationState | undefined;
  const stepContext = inputs._stepContext as SimulationStepContext | undefined;

  return {
    Geometry: state?.geometry ?? inputs.Geometry ?? inputs.geometry ?? null,
    DeltaTime: stepContext?.deltaTime ?? inputs.DeltaTime ?? inputs.deltaTime ?? 1 / 60,
    ElapsedTime: stepContext?.elapsedTime ?? inputs.ElapsedTime ?? inputs.elapsedTime ?? 0,
    StepIndex: stepContext?.stepIndex ?? inputs.StepIndex ?? inputs.stepIndex ?? 0,
  };
}

// ============================================================================
// Simulation Output Executor
// ============================================================================

/**
 * executeSimulationOutput — Collect step output inside a simulation zone.
 *
 * This executor is called for the SimulationOutputNode inside a simulation
 * zone's inner graph. It receives the modified geometry and attributes from
 * the inner graph and packages them into a state that feeds back to the
 * zone executor for the next step.
 */
export function executeSimulationOutput(inputs: NodeInputs): NodeOutput {
  return {
    _state: {
      geometry: inputs.Geometry ?? inputs.geometry ?? null,
      attributes: (inputs.Attributes ?? inputs.attributes ?? {}) as Record<string, any>,
    } as SimulationState,
  };
}

// ============================================================================
// Repeat Input Executor
// ============================================================================

/**
 * executeRepeatInput — Provide iteration context inside a repeat zone.
 *
 * This executor is called for the RepeatInputNode inside a repeat zone's
 * inner graph. It receives the current state and iteration index from the
 * zone executor and outputs:
 * - Geometry: The current geometry state
 * - IterationIndex: Current iteration number (0-based)
 */
export function executeRepeatInput(inputs: NodeInputs): NodeOutput {
  const state = inputs._state as SimulationState | undefined;
  const iterationIndex = (inputs._iterationIndex ?? inputs.IterationIndex ?? inputs.iterationIndex ?? 0) as number;

  return {
    Geometry: state?.geometry ?? inputs.Geometry ?? inputs.geometry ?? null,
    IterationIndex: iterationIndex,
  };
}

// ============================================================================
// Repeat Output Executor
// ============================================================================

/**
 * executeRepeatOutput — Collect iteration output inside a repeat zone.
 *
 * This executor is called for the RepeatOutputNode inside a repeat zone's
 * inner graph. It receives the modified geometry and attributes from the
 * inner graph and packages them into a state that feeds back to the zone
 * executor for the next iteration.
 */
export function executeRepeatOutput(inputs: NodeInputs): NodeOutput {
  return {
    _state: {
      geometry: inputs.Geometry ?? inputs.geometry ?? null,
      attributes: (inputs.Attributes ?? inputs.attributes ?? {}) as Record<string, any>,
    } as SimulationState,
  };
}

// ============================================================================
// Volume Node Executors (registered via ExecutorRegistry)
// ============================================================================

import type { VolumeData } from '../volume/VolumeNodes';
import {
  VolumeToMeshNode,
  SampleVolumeNode,
  VolumeInfoNode,
  VolumeDistributeNode,
} from '../volume/VolumeNodes';

/**
 * Type guard to check if a value looks like VolumeData.
 */
function isVolumeData(v: unknown): v is VolumeData {
  return (
    v != null &&
    typeof v === 'object' &&
    'data' in v &&
    'resolution' in v &&
    'bounds' in v
  );
}

/**
 * executeVolumeToMesh — Executor for VolumeToMeshNode.
 * Delegates to the VolumeToMeshNode's execute method.
 */
export function executeVolumeToMesh(inputs: NodeInputs): NodeOutput {
  const rawVolume = inputs.Volume ?? inputs.volume ?? null;
  const threshold = (inputs.Threshold ?? inputs.threshold ?? 0.5) as number;

  if (!isVolumeData(rawVolume)) {
    return { Geometry: null, VertexCount: 0, FaceCount: 0 };
  }

  const node = new VolumeToMeshNode({ volume: rawVolume, threshold });
  const result = node.execute();

  return {
    Geometry: result.geometry,
    VertexCount: result.vertexCount,
    FaceCount: result.faceCount,
  };
}

/**
 * executeSampleVolume — Executor for SampleVolumeNode.
 */
export function executeSampleVolume(inputs: NodeInputs): NodeOutput {
  const rawVolume = inputs.Volume ?? inputs.volume ?? null;
  const position = (inputs.Position ?? inputs.position ?? [0, 0, 0]) as number[];

  if (!isVolumeData(rawVolume)) {
    return { Value: 0, Gradient: [0, 0, 0] };
  }

  const node = new SampleVolumeNode({ volume: rawVolume, position });
  const result = node.execute();

  return {
    Value: result.value,
    Gradient: result.gradient,
  };
}

/**
 * executeVolumeInfo — Executor for VolumeInfoNode.
 */
export function executeVolumeInfo(inputs: NodeInputs): NodeOutput {
  const rawVolume = inputs.Volume ?? inputs.volume ?? null;

  if (!isVolumeData(rawVolume)) {
    return { Min: 0, Max: 0, Mean: 0, Median: 0, StdDev: 0 };
  }

  const node = new VolumeInfoNode({ volume: rawVolume });
  const result = node.execute();

  return {
    Min: result.min,
    Max: result.max,
    Mean: result.mean,
    Median: result.median,
    StdDev: result.stdDev,
  };
}

/**
 * executeDensityToAlpha — Executor for DensityToAlphaNode.
 */
export function executeDensityToAlpha(inputs: NodeInputs): NodeOutput {
  const density = (inputs.Density ?? inputs.density ?? 0) as number;
  const cutoff = (inputs.Cutoff ?? inputs.cutoff ?? 0.01) as number;
  const alphaScale = (inputs.AlphaScale ?? inputs.alphaScale ?? 1.0) as number;
  const mode = (inputs.Mode ?? inputs.mode ?? 'linear') as string;
  const pathLength = (inputs.PathLength ?? inputs.pathLength ?? 1.0) as number;

  if (density < cutoff) {
    return { Alpha: 0 };
  }

  let alpha: number;
  if (mode === 'beer_lambert') {
    alpha = 1 - Math.exp(-density * alphaScale * pathLength);
  } else {
    alpha = Math.min(density * alphaScale, 1.0);
  }

  return { Alpha: alpha };
}

/**
 * executeVolumeDistribute — Executor for VolumeDistributeNode.
 */
export function executeVolumeDistribute(inputs: NodeInputs): NodeOutput {
  const rawVolume = inputs.Volume ?? inputs.volume ?? null;
  const density = (inputs.Density ?? inputs.density ?? 1.0) as number;
  const seed = (inputs.Seed ?? inputs.seed ?? 42) as number;
  const maxPoints = (inputs.MaxPoints ?? inputs.maxPoints ?? 10000) as number;

  if (!isVolumeData(rawVolume)) {
    return { Positions: [], Count: 0 };
  }

  const node = new VolumeDistributeNode({ volume: rawVolume, density, seed, maxPoints });
  const result = node.execute();

  return {
    Positions: result.positions,
    Count: result.count,
  };
}
