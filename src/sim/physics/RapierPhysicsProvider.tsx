'use client';

/**
 * RapierPhysicsProvider — P5.1: Rapier Physics Provider
 *
 * Wraps the R3F scene in @react-three/rapier's <Physics> component,
 * providing a unified physics configuration layer that maps the existing
 * RigidBody types to Rapier's body types and exposes a hook for
 * accessing the underlying Rapier world.
 *
 * Phase 5 — P5.1: Rapier Physics Provider
 *
 * @module sim/physics
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { Physics, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Maps the project's existing body types to Rapier's RigidBody types.
 *
 * - `dynamic`        → Free-moving body affected by forces and gravity
 * - `kinematicPosition` → Kinematic body driven by explicit position updates
 * - `kinematicVelocity` → Kinematic body driven by explicit velocity updates
 * - `fixed`          → Immovable static body (terrain, walls)
 */
export type RapierBodyType = 'dynamic' | 'kinematicPosition' | 'kinematicVelocity' | 'fixed';

/**
 * Mapping from the existing physics system's BodyType to Rapier's types.
 *
 * Existing system uses: 'static' | 'dynamic' | 'kinematic'
 * Rapier uses:          'dynamic' | 'kinematicPosition' | 'kinematicVelocity' | 'fixed'
 */
export const BODY_TYPE_MAP: Record<string, RapierBodyType> = {
  static: 'fixed',
  dynamic: 'dynamic',
  kinematic: 'kinematicPosition',
};

/**
 * Configuration for the RapierPhysicsProvider.
 */
export interface RapierPhysicsConfig {
  /** Gravity vector (default: [0, -9.81, 0]) */
  gravity?: [number, number, number];
  /** Fixed timestep for the physics simulation (default: 1/60) */
  timeStep?: number;
  /** Maximum number of physics steps per frame to prevent spiral of death (default: 10) */
  maxSteps?: number;
  /** Whether to use deterministic simulation for reproducible results (default: false) */
  deterministic?: boolean;
  /** Whether to pause the simulation (default: false) */
  paused?: boolean;
  /** Debug render mode — shows colliders and joints visually (default: false) */
  debug?: boolean;
  /** Additional velocity iterations for solver stability (default: 4) */
  velocityIterations?: number;
  /** Additional position iterations for solver stability (default: 1) */
  positionIterations?: number;
  /** Whether to update physics during inter-frame interpolation (default: false) */
  interpolate?: boolean;
  /** Collision event handler */
  onCollisionEnter?: (event: { target: RapierRigidBody; other: RapierRigidBody }) => void;
  /** Collision exit handler */
  onCollisionExit?: (event: { target: RapierRigidBody; other: RapierRigidBody }) => void;
}

/**
 * Context value exposed by useRapierPhysics().
 */
export interface RapierPhysicsContextValue {
  /** The current physics configuration (read-only snapshot) */
  config: RapierPhysicsConfig;
  /** Map an existing BodyType string to the corresponding Rapier type */
  mapBodyType: (existingType: string) => RapierBodyType;
  /** Whether deterministic mode is active */
  isDeterministic: boolean;
  /** Reference to the Rapier world (obtained via useRapier inside the Physics tree) */
  rapierWorldRef: React.MutableRefObject<any | null>;
}

// ============================================================================
// Context
// ============================================================================

const RapierPhysicsContext = createContext<RapierPhysicsContextValue | null>(null);

// ============================================================================
// Default config
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<RapierPhysicsConfig, 'onCollisionEnter' | 'onCollisionExit'>> = {
  gravity: [0, -9.81, 0],
  timeStep: 1 / 60,
  maxSteps: 10,
  deterministic: false,
  paused: false,
  debug: false,
  velocityIterations: 4,
  positionIterations: 1,
  interpolate: false,
};

// ============================================================================
// Inner component (must be inside <Physics> to call useRapier)
// ============================================================================

/**
 * Internal component that captures the Rapier world reference
 * and provides it through context.
 */
function RapierPhysicsInner({
  children,
  config,
}: {
  children: ReactNode;
  config: RapierPhysicsConfig;
}) {
  let rapier: any = null;

  // useRapier() only works inside <Physics>, so we call it here
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    rapier = useRapier();
  } catch (err) {
    // Silently fall back - not inside rapier context, rapier stays null
    if (process.env.NODE_ENV === 'development') console.debug('[RapierPhysicsProvider] useRapier fallback:', err);
  }

  const rapierWorldRef = useRef<any>(null);

  if (rapier && rapier.world && !rapierWorldRef.current) {
    rapierWorldRef.current = rapier.world;
  }

  const mapBodyType = useCallback((existingType: string): RapierBodyType => {
    return BODY_TYPE_MAP[existingType] ?? 'dynamic';
  }, []);

  const isDeterministic = config.deterministic ?? DEFAULT_CONFIG.deterministic;

  const contextValue = useMemo<RapierPhysicsContextValue>(
    () => ({
      config,
      mapBodyType,
      isDeterministic,
      rapierWorldRef,
    }),
    [config, mapBodyType, isDeterministic],
  );

  return (
    <RapierPhysicsContext.Provider value={contextValue}>
      {children}
    </RapierPhysicsContext.Provider>
  );
}

// ============================================================================
// RapierPhysicsProvider component
// ============================================================================

/**
 * RapierPhysicsProvider — P5.1
 *
 * Wraps the scene in @react-three/rapier's `<Physics>` component
 * with stable simulation settings and body-type mapping.
 *
 * Usage:
 * ```tsx
 * <RapierPhysicsProvider config={{ gravity: [0, -9.81, 0], deterministic: true }}>
 *   <RigidBody type="fixed">
 *     <mesh ... />
 *   </RigidBody>
 * </RapierPhysicsProvider>
 * ```
 */
export function RapierPhysicsProvider({
  children,
  config = {},
}: {
  children: ReactNode;
  config?: RapierPhysicsConfig;
}) {
  const mergedConfig: RapierPhysicsConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...config,
    }),
    [config],
  );

  const gravity: [number, number, number] = mergedConfig.gravity ?? DEFAULT_CONFIG.gravity;
  const timeStep = mergedConfig.timeStep ?? DEFAULT_CONFIG.timeStep;
  const maxCcdSubsteps = mergedConfig.maxSteps ?? DEFAULT_CONFIG.maxSteps;

  return (
    <Physics
      gravity={gravity}
      timeStep={timeStep}
      maxCcdSubsteps={maxCcdSubsteps}
      debug={mergedConfig.debug ?? DEFAULT_CONFIG.debug}
      paused={mergedConfig.paused ?? DEFAULT_CONFIG.paused}
      interpolate={mergedConfig.interpolate ?? DEFAULT_CONFIG.interpolate}
    >
      <RapierPhysicsInner config={mergedConfig}>
        {children}
      </RapierPhysicsInner>
    </Physics>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useRapierPhysics — P5.1
 *
 * Access the Rapier world and configuration from any component
 * inside the `<RapierPhysicsProvider>`.
 *
 * Returns:
 * - `rapierWorldRef` — mutable ref to the raw Rapier World instance
 * - `config` — current physics configuration
 * - `mapBodyType` — helper to convert existing body types to Rapier types
 * - `isDeterministic` — whether deterministic mode is enabled
 */
export function useRapierPhysics(): RapierPhysicsContextValue {
  const ctx = useContext(RapierPhysicsContext);
  if (!ctx) {
    throw new Error(
      'useRapierPhysics() must be used within a <RapierPhysicsProvider>. ' +
      'Wrap your scene in <RapierPhysicsProvider> first.',
    );
  }
  return ctx;
}

// ============================================================================
// Exports
// ============================================================================

export default RapierPhysicsProvider;
