/**
 * Rapier Articulated Furniture — Shared Types
 *
 * Type definitions for Rapier-backed articulated furniture generators.
 * These types define the Rapier-specific joint and rigid body configurations
 * that complement the visual mesh hierarchies produced by the articulated generators.
 *
 * @module articulated/rapier
 * @phase 8
 * @p-number P8.3
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Joint type mapping to Rapier joint types.
 */
export type RapierJointType = 'revolute' | 'prismatic' | 'ball' | 'fixed';

/**
 * Configuration for a Rapier joint.
 */
export interface RapierJointConfig {
  /** Unique joint ID */
  id: string;
  /** Joint type */
  type: RapierJointType;
  /** Body A name (parent) */
  bodyA: string;
  /** Body B name (child) */
  bodyB: string;
  /** Anchor point on body A (local space) */
  anchorA: THREE.Vector3;
  /** Anchor point on body B (local space) */
  anchorB: THREE.Vector3;
  /** Joint axis (local space of body A) */
  axis: THREE.Vector3;
  /** Angular or linear limits [min, max] */
  limits: [number, number];
  /** Spring stiffness for spring-back behavior (0 = no spring) */
  springStiffness: number;
  /** Spring damping */
  springDamping: number;
}

/**
 * Result of an articulated furniture generator.
 */
export interface ArticulatedFurnitureResult {
  /** Root THREE.Group with all visual meshes */
  group: THREE.Group;
  /** Rapier joint configurations */
  joints: RapierJointConfig[];
  /** Rigid body definitions for Rapier */
  rigidBodies: RigidBodyDef[];
  /** Category name */
  category: string;
}

/**
 * Rigid body definition for Rapier.
 */
export interface RigidBodyDef {
  /** Body name */
  name: string;
  /** Body type */
  type: 'fixed' | 'dynamic' | 'kinematicPosition';
  /** Position in world space */
  position: THREE.Vector3;
  /** Rotation (Euler) */
  rotation: THREE.Euler;
  /** Collider shape */
  colliderShape: 'cuboid' | 'cylinder' | 'ball';
  /** Collider half-extents (for cuboid) or radius (for cylinder/ball) */
  colliderParams: THREE.Vector3;
  /** Mass in kg */
  mass: number;
  /** Whether this body is the fixed base */
  isBase: boolean;
}

/**
 * Common configuration for all articulated furniture.
 */
export interface ArticulatedFurnitureConfig {
  /** Seed for procedural variation. Default: 42 */
  seed: number;
  /** Scale multiplier. Default: 1 */
  scale: number;
  /** Style variant. Default: 'modern' */
  style: 'modern' | 'traditional' | 'industrial' | 'minimalist';
  /** Material overrides */
  materialOverrides?: Record<string, Partial<THREE.MeshStandardMaterialParameters>>;
}

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

export const DEFAULT_FURNITURE_CONFIG: ArticulatedFurnitureConfig = {
  seed: 42,
  scale: 1,
  style: 'modern',
};

// ---------------------------------------------------------------------------
// Material Factory
// ---------------------------------------------------------------------------

export function createMaterial(
  params: Partial<THREE.MeshStandardMaterialParameters> = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...params });
}
