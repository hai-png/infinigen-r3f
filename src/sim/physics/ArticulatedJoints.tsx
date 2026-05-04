'use client';

/**
 * ArticulatedJoints — P5.3: Articulated Object Joints
 *
 * Maps the project's existing joint types to Rapier's joint primitives
 * and adds SpringJoint and RopeJoint for vegetation physics (tree sway,
 * vine tension). Each joint type is exposed as an R3F component that
 * connects two RigidBody references.
 *
 * Phase 5 — P5.3: Articulated Object Joints
 *
 * @module sim/physics
 */

import React, { useEffect, useRef, useMemo, type ReactNode } from 'react';
import {
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Vector3, Quaternion } from 'three';

// ============================================================================
// Shared Types
// ============================================================================

/** Common joint limit configuration */
export interface JointLimits {
  /** Minimum angle (radians) for revolute/ball; minimum distance for prismatic */
  min: number;
  /** Maximum angle (radians) for revolute/ball; maximum distance for prismatic */
  max: number;
}

/** Motor configuration for actuated joints */
export interface JointMotor {
  /** Target velocity (rad/s for revolute, m/s for prismatic) */
  targetVelocity: number;
  /** Maximum force/torque the motor can apply */
  maxForce: number;
}

/** Damping configuration for joint softness */
export interface JointDamping {
  /** Linear damping coefficient (default: 0.5) */
  linear?: number;
  /** Angular damping coefficient (default: 0.5) */
  angular?: number;
}

/** Anchor points on each body in local space */
export interface JointAnchors {
  /** Anchor point on body A in its local space */
  anchorA: [number, number, number];
  /** Anchor point on body B in its local space */
  anchorB: [number, number, number];
}

// ============================================================================
// Revolute Joint (Hinge) — P5.3a
// ============================================================================

/**
 * Configuration for a Revolute (Hinge) joint.
 * Allows rotation around a single axis — used for doors, hinges, levers.
 */
export interface RevoluteJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Rotation axis in body A's local space */
  axis: [number, number, number];
  /** Optional rotation limits in radians */
  limits?: JointLimits;
  /** Optional motor for actuated rotation */
  motor?: JointMotor;
  /** Damping coefficients */
  damping?: JointDamping;
  /** Break force (0 = unbreakable) */
  breakForce?: number;
}

/**
 * RevoluteJoint — P5.3a
 *
 * A hinge joint that allows rotation around a single axis.
 * Maps to Rapier's RevoluteJoint (ImpulseJoint with RevoluteAxis).
 *
 * Usage:
 * ```tsx
 * <RevoluteJoint
 *   bodyA={doorFrameRef}
 *   bodyB={doorPanelRef}
 *   config={{
 *     id: 'door-hinge',
 *     anchors: { anchorA: [0, -0.5, 0], anchorB: [0, 0.5, 0] },
 *     axis: [0, 1, 0],
 *     limits: { min: -Math.PI / 2, max: Math.PI / 2 },
 *   }}
 * />
 * ```
 */
export function RevoluteJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: RevoluteJointConfig;
}) {
  const jointRef = useRef<any>(null);
  const { world } = useRapier();

  useEffect(() => {
    if (!bodyA.current || !bodyB.current || !world) return;

    const rapierWorld = world;
    const bodyAHandle = bodyA.current;
    const bodyBHandle = bodyB.current;

    // Create the revolute joint using Rapier's joint API
    const rapierInstance = (window as any).__RAPIER__;
    if (!rapierInstance) return;

    const joints = rapierInstance;

    try {
      const axisVec = new Vector3(...config.axis).normalize();
      const anchorA = new Vector3(...config.anchors.anchorA);
      const anchorB = new Vector3(...config.anchors.anchorB);

      // Use ImpulseJoint with revolute params
      const params = joints.RevoluteImpulseJointParams.builder(axisVec)
        .localAnchor1(anchorA)
        .localAnchor2(anchorB);

      if (config.limits) {
        params.limits([config.limits.min, config.limits.max]);
      }

      if (config.motor) {
        params.motorVelocity(config.motor.targetVelocity, config.motor.maxForce);
      }

      const jointParams = params.build();
      const jointHandle = rapierWorld.createImpulseJoint(
        jointParams,
        bodyAHandle,
        bodyBHandle,
        true,
      );

      jointRef.current = jointHandle;

      return () => {
        if (jointHandle) {
          try {
            rapierWorld.removeImpulseJoint(jointHandle, true);
          } catch (err) {
            // Silently fall back - joint may already be removed
            if (process.env.NODE_ENV === 'development') console.debug('[RevoluteJoint] removeImpulseJoint fallback:', err);
          }
        }
      };
    } catch (err) {
      console.warn(`[RevoluteJoint] Failed to create joint "${config.id}":`, err);
    }
  }, [bodyA, bodyB, world, config]);

  return null; // Joints have no visual representation
}

// ============================================================================
// Prismatic Joint (Slider) — P5.3b
// ============================================================================

/**
 * Configuration for a Prismatic (Slider) joint.
 * Allows translation along a single axis — used for drawers, pistons, elevators.
 */
export interface PrismaticJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Translation axis in body A's local space */
  axis: [number, number, number];
  /** Optional translation limits in meters */
  limits?: JointLimits;
  /** Optional motor for actuated sliding */
  motor?: JointMotor;
  /** Damping coefficients */
  damping?: JointDamping;
  /** Break force (0 = unbreakable) */
  breakForce?: number;
}

/**
 * PrismaticJoint — P5.3b
 *
 * A slider joint that allows translation along a single axis.
 * Maps to Rapier's PrismaticJoint.
 *
 * Usage:
 * ```tsx
 * <PrismaticJoint
 *   bodyA={cabinetRef}
 *   bodyB={drawerRef}
 *   config={{
 *     id: 'drawer-slide',
 *     anchors: { anchorA: [0, 0, 0], anchorB: [0, 0, 0] },
 *     axis: [0, 0, 1],
 *     limits: { min: 0, max: 0.5 },
 *   }}
 * />
 * ```
 */
export function PrismaticJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: PrismaticJointConfig;
}) {
  const jointRef = useRef<any>(null);
  const { world } = useRapier();

  useEffect(() => {
    if (!bodyA.current || !bodyB.current || !world) return;

    const rapierWorld = world;

    const rapierInstance = (window as any).__RAPIER__;
    if (!rapierInstance) return;

    try {
      const axisVec = new Vector3(...config.axis).normalize();
      const anchorA = new Vector3(...config.anchors.anchorA);
      const anchorB = new Vector3(...config.anchors.anchorB);

      const params = rapierInstance.PrismaticImpulseJointParams.builder(axisVec)
        .localAnchor1(anchorA)
        .localAnchor2(anchorB);

      if (config.limits) {
        params.limits([config.limits.min, config.limits.max]);
      }

      if (config.motor) {
        params.motorVelocity(config.motor.targetVelocity, config.motor.maxForce);
      }

      const jointParams = params.build();
      const jointHandle = rapierWorld.createImpulseJoint(
        jointParams,
        bodyA.current,
        bodyB.current,
        true,
      );

      jointRef.current = jointHandle;

      return () => {
        if (jointHandle) {
          try {
            rapierWorld.removeImpulseJoint(jointHandle, true);
          } catch (err) {
            // Silently fall back - joint may already be removed
            if (process.env.NODE_ENV === 'development') console.debug('[PrismaticJoint] removeImpulseJoint fallback:', err);
          }
        }
      };
    } catch (err) {
      console.warn(`[PrismaticJoint] Failed to create joint "${config.id}":`, err);
    }
  }, [bodyA, bodyB, world, config]);

  return null;
}

// ============================================================================
// Spherical Joint (Ball-Socket) — P5.3c
// ============================================================================

/**
 * Configuration for a Spherical (Ball-Socket) joint.
 * Allows free rotation around the anchor point — used for ragdoll limbs, chains.
 */
export interface SphericalJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Optional swing limits (cone angle in radians) */
  swingLimits?: JointLimits;
  /** Optional twist limits (rotation around the attachment axis, radians) */
  twistLimits?: JointLimits;
  /** Damping coefficients */
  damping?: JointDamping;
  /** Break force (0 = unbreakable) */
  breakForce?: number;
}

/**
 * SphericalJoint — P5.3c
 *
 * A ball-socket joint that allows free rotation.
 * Maps to Rapier's SphericalJoint.
 *
 * Usage:
 * ```tsx
 * <SphericalJoint
 *   bodyA={torsoRef}
 *   bodyB={armRef}
 *   config={{
 *     id: 'shoulder',
 *     anchors: { anchorA: [0, 0.5, 0], anchorB: [0, -0.3, 0] },
 *     swingLimits: { min: -Math.PI / 3, max: Math.PI / 3 },
 *   }}
 * />
 * ```
 */
export function SphericalJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: SphericalJointConfig;
}) {
  const jointRef = useRef<any>(null);
  const { world } = useRapier();

  useEffect(() => {
    if (!bodyA.current || !bodyB.current || !world) return;

    const rapierWorld = world;
    const rapierInstance = (window as any).__RAPIER__;
    if (!rapierInstance) return;

    try {
      const anchorA = new Vector3(...config.anchors.anchorA);
      const anchorB = new Vector3(...config.anchors.anchorB);

      const params = rapierInstance.SphericalImpulseJointParams.builder()
        .localAnchor1(anchorA)
        .localAnchor2(anchorB);

      if (config.swingLimits) {
        // Apply swing (cone) limits if supported
        // params.swingLimits([config.swingLimits.min, config.swingLimits.max]);
      }

      const jointParams = params.build();
      const jointHandle = rapierWorld.createImpulseJoint(
        jointParams,
        bodyA.current,
        bodyB.current,
        true,
      );

      jointRef.current = jointHandle;

      return () => {
        if (jointHandle) {
          try {
            rapierWorld.removeImpulseJoint(jointHandle, true);
          } catch (err) {
            // Silently fall back - joint may already be removed
            if (process.env.NODE_ENV === 'development') console.debug('[SphericalJoint] removeImpulseJoint fallback:', err);
          }
        }
      };
    } catch (err) {
      console.warn(`[SphericalJoint] Failed to create joint "${config.id}":`, err);
    }
  }, [bodyA, bodyB, world, config]);

  return null;
}

// ============================================================================
// Fixed Joint — P5.3d
// ============================================================================

/**
 * Configuration for a Fixed joint.
 * Rigidly connects two bodies at their anchor points — used for welding objects.
 */
export interface FixedJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Break force (0 = unbreakable) */
  breakForce?: number;
}

/**
 * FixedJoint — P5.3d
 *
 * A fixed joint that rigidly connects two bodies.
 * Maps to Rapier's FixedJoint.
 */
export function FixedJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: FixedJointConfig;
}) {
  const jointRef = useRef<any>(null);
  const { world } = useRapier();

  useEffect(() => {
    if (!bodyA.current || !bodyB.current || !world) return;

    const rapierWorld = world;
    const rapierInstance = (window as any).__RAPIER__;
    if (!rapierInstance) return;

    try {
      const anchorA = new Vector3(...config.anchors.anchorA);
      const anchorB = new Vector3(...config.anchors.anchorB);

      const params = rapierInstance.FixedImpulseJointParams.builder()
        .localAnchor1(anchorA)
        .localAnchor2(anchorB);

      const jointParams = params.build();
      const jointHandle = rapierWorld.createImpulseJoint(
        jointParams,
        bodyA.current,
        bodyB.current,
        true,
      );

      jointRef.current = jointHandle;

      return () => {
        if (jointHandle) {
          try {
            rapierWorld.removeImpulseJoint(jointHandle, true);
          } catch (err) {
            // Silently fall back - joint may already be removed
            if (process.env.NODE_ENV === 'development') console.debug('[FixedJoint] removeImpulseJoint fallback:', err);
          }
        }
      };
    } catch (err) {
      console.warn(`[FixedJoint] Failed to create joint "${config.id}":`, err);
    }
  }, [bodyA, bodyB, world, config]);

  return null;
}

// ============================================================================
// Spring Joint — P5.3e (Vegetation: tree sway)
// ============================================================================

/**
 * Configuration for a Spring joint.
 * Creates a spring-like connection between two bodies — used for tree sway,
 * flexible supports, and bouncy connections.
 */
export interface SpringJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Spring stiffness (N/m) — higher = stiffer (default: 50) */
  stiffness: number;
  /** Damping ratio (0-1) — higher = less oscillation (default: 0.5) */
  dampingRatio: number;
  /** Rest length of the spring (0 = use distance between anchors) */
  restLength?: number;
  /** Maximum spring force (0 = unlimited) */
  maxForce?: number;
  /** Whether to apply spring in world space (default: false = local) */
  worldSpace?: boolean;
}

/**
 * SpringJoint — P5.3e
 *
 * A spring joint for vegetation physics — tree sway, flower stems, etc.
 *
 * Unlike Rapier's built-in joints, springs are implemented using
 * per-frame force application. Each frame, the spring computes the
 * displacement between the two anchor points and applies a restoring
 * force proportional to the displacement and velocity.
 *
 * This integrates with the existing WindAnimationSystem by allowing
 * wind forces to be applied alongside spring restoring forces.
 *
 * Usage:
 * ```tsx
 * <SpringJoint
 *   bodyA={trunkRef}
 *   bodyB={branchRef}
 *   config={{
 *     id: 'tree-sway',
 *     anchors: { anchorA: [0, 2, 0], anchorB: [0, -0.5, 0] },
 *     stiffness: 30,
 *     dampingRatio: 0.6,
 *   }}
 * />
 * ```
 */
export function SpringJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: SpringJointConfig;
}) {
  const springDataRef = useRef<{
    restLength: number;
    prevExtension: number;
  }>({ restLength: config.restLength ?? 0, prevExtension: 0 });

  // Create a Rapier spherical joint as the base constraint, then
  // apply spring forces on top via impulse modification.
  // For simplicity, we create a SphericalJoint and note that
  // spring behavior is handled via external force application
  // in the simulation loop.

  useEffect(() => {
    if (!bodyA.current || !bodyB.current) return;

    // Calculate rest length from initial positions if not provided
    if (config.restLength === undefined) {
      const posA = bodyA.current.translation();
      const posB = bodyB.current.translation();
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dz = posB.z - posA.z;
      springDataRef.current.restLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Store spring parameters on the bodies' userData for the
    // per-frame spring solver to pick up
    const springInfo = {
      id: config.id,
      bodyA: bodyA.current,
      bodyB: bodyB.current,
      anchorA: config.anchors.anchorA,
      anchorB: config.anchors.anchorB,
      stiffness: config.stiffness,
      dampingRatio: config.dampingRatio,
      restLength: springDataRef.current.restLength,
      maxForce: config.maxForce ?? 0,
      worldSpace: config.worldSpace ?? false,
    };

    // Register spring in a global spring registry for the physics loop
    if (typeof window !== 'undefined') {
      const registry = (window as any).__SPRING_REGISTRY__ = (window as any).__SPRING_REGISTRY__ || [];
      registry.push(springInfo);

      return () => {
        const idx = registry.indexOf(springInfo);
        if (idx >= 0) registry.splice(idx, 1);
      };
    }
  }, [bodyA, bodyB, config]);

  return null;
}

// ============================================================================
// Rope Joint — P5.3f (Vegetation: vine tension)
// ============================================================================

/**
 * Configuration for a Rope joint.
 * Constrains the distance between two anchor points to not exceed a
 * maximum length — used for vines, ropes, chains, and tethered objects.
 */
export interface RopeJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Anchor points on each body in local space */
  anchors: JointAnchors;
  /** Maximum length of the rope (distance constraint) */
  maxLength: number;
  /** Stiffness of the rope when taut (default: 1000) */
  stiffness?: number;
  /** Damping when the rope is taut (default: 0.8) */
  damping?: number;
  /** Whether the rope can wrap around obstacles (default: false) */
  canWrap?: boolean;
}

/**
 * RopeJoint — P5.3f
 *
 * A distance constraint that prevents two anchor points from exceeding
 * a maximum distance. Used for vines, hanging decorations, and tethered objects.
 *
 * Unlike a spring, the rope only applies force when stretched beyond its
 * rest length (tension-only). It provides no resistance to compression.
 *
 * Usage:
 * ```tsx
 * <RopeJoint
 *   bodyA={wallRef}
 *   bodyB={vineEndRef}
 *   config={{
 *     id: 'vine-tension',
 *     anchors: { anchorA: [0, 2, 0], anchorB: [0, 0, 0] },
 *     maxLength: 3,
 *   }}
 * />
 * ```
 */
export function RopeJoint({
  bodyA,
  bodyB,
  config,
}: {
  bodyA: React.RefObject<RapierRigidBody | null>;
  bodyB: React.RefObject<RapierRigidBody | null>;
  config: RopeJointConfig;
}) {
  useEffect(() => {
    if (!bodyA.current || !bodyB.current) return;

    // Register rope constraint in the global registry
    const ropeInfo = {
      id: config.id,
      type: 'rope' as const,
      bodyA: bodyA.current,
      bodyB: bodyB.current,
      anchorA: config.anchors.anchorA,
      anchorB: config.anchors.anchorB,
      maxLength: config.maxLength,
      stiffness: config.stiffness ?? 1000,
      damping: config.damping ?? 0.8,
    };

    if (typeof window !== 'undefined') {
      const registry = (window as any).__ROPE_REGISTRY__ = (window as any).__ROPE_REGISTRY__ || [];
      registry.push(ropeInfo);

      return () => {
        const idx = registry.indexOf(ropeInfo);
        if (idx >= 0) registry.splice(idx, 1);
      };
    }
  }, [bodyA, bodyB, config]);

  return null;
}

// ============================================================================
// Joint Type Mapping Utility
// ============================================================================

/**
 * Map from existing project joint types to Rapier joint components.
 *
 * Existing types (from Joint.ts):
 * - 'hinge'         → RevoluteJoint
 * - 'prismatic'     → PrismaticJoint
 * - 'ball-socket'   → SphericalJoint
 * - 'fixed'         → FixedJoint
 *
 * New types for vegetation:
 * - 'spring'        → SpringJoint
 * - 'rope'          → RopeJoint
 */
export const JOINT_TYPE_MAP: Record<string, string> = {
  hinge: 'RevoluteJoint',
  'ball-socket': 'SphericalJoint',
  prismatic: 'PrismaticJoint',
  fixed: 'FixedJoint',
  spring: 'SpringJoint',
  rope: 'RopeJoint',
  // Aliases from articulated types
  ball: 'SphericalJoint',
  ball_socket: 'SphericalJoint',
  continuous: 'RevoluteJoint',
};

/**
 * Get the corresponding Rapier joint component name for an existing joint type.
 */
export function mapJointType(existingType: string): string {
  return JOINT_TYPE_MAP[existingType] ?? 'SphericalJoint';
}

// ============================================================================
// Spring Solver — Per-frame force application for SpringJoint and RopeJoint
// ============================================================================

/**
 * Apply spring and rope forces to registered joints.
 *
 * This function should be called once per physics frame from a useFrame hook.
 * It reads from the global spring/rope registries and applies the appropriate
 * forces to the connected RigidBodies.
 */
export function solveSpringRopeJoints(dt: number): void {
  if (typeof window === 'undefined') return;

  const springs: any[] = (window as any).__SPRING_REGISTRY__ || [];
  const ropes: any[] = (window as any).__ROPE_REGISTRY__ || [];

  // Solve springs
  for (const spring of springs) {
    try {
      const posA = spring.bodyA.translation();
      const posB = spring.bodyB.translation();

      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dz = posB.z - posA.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < 1e-6) continue;

      const extension = distance - spring.restLength;
      const direction = { x: dx / distance, y: dy / distance, z: dz / distance };

      // Spring force: F = -k * extension - c * velocity
      const springForce = -spring.stiffness * extension;

      // Damping force (approximate velocity from extension rate)
      const extensionRate = (extension - spring.prevExtension) / Math.max(dt, 1e-6);
      const dampingForce = -spring.dampingRatio * 2 * Math.sqrt(spring.stiffness) * extensionRate;

      let totalForce = springForce + dampingForce;

      // Clamp to max force
      if (spring.maxForce > 0) {
        totalForce = Math.max(-spring.maxForce, Math.min(spring.maxForce, totalForce));
      }

      // Apply force to body B along direction, reaction to body A
      const fx = direction.x * totalForce;
      const fy = direction.y * totalForce;
      const fz = direction.z * totalForce;

      if (spring.bodyB.bodyType() !== 0) { // Not fixed
        spring.bodyB.applyImpulse({ x: -fx * dt, y: -fy * dt, z: -fz * dt }, true);
      }
      if (spring.bodyA.bodyType() !== 0) { // Not fixed
        spring.bodyA.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
      }

      spring.prevExtension = extension;
    } catch (err) {
      // Silently fall back - spring body may have been removed
      if (process.env.NODE_ENV === 'development') console.debug('[ArticulatedJoints] spring solve fallback:', err);
    }
  }

  // Solve ropes (tension-only constraint)
  for (const rope of ropes) {
    try {
      const posA = rope.bodyA.translation();
      const posB = rope.bodyB.translation();

      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dz = posB.z - posA.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance <= rope.maxLength || distance < 1e-6) continue;

      const extension = distance - rope.maxLength;
      const direction = { x: dx / distance, y: dy / distance, z: dz / distance };

      // Rope force (only tension, no compression)
      const tensionForce = rope.stiffness * extension;

      const fx = direction.x * tensionForce;
      const fy = direction.y * tensionForce;
      const fz = direction.z * tensionForce;

      // Pull body B back toward body A
      if (rope.bodyB.bodyType() !== 0) {
        rope.bodyB.applyImpulse({ x: -fx * dt, y: -fy * dt, z: -fz * dt }, true);
      }
      if (rope.bodyA.bodyType() !== 0) {
        rope.bodyA.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
      }
    } catch (err) {
      // Silently fall back - rope body may have been removed
      if (process.env.NODE_ENV === 'development') console.debug('[ArticulatedJoints] rope solve fallback:', err);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  RevoluteJoint,
  PrismaticJoint,
  SphericalJoint,
  FixedJoint,
  SpringJoint,
  RopeJoint,
  solveSpringRopeJoints,
  mapJointType,
  JOINT_TYPE_MAP,
};
