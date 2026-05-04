/**
 * Rapier Articulated Furniture — Barrel Re-exports
 *
 * Re-exports all Rapier-backed articulated furniture generators and types
 * from their individual files.
 *
 * @deprecated The Rapier-specific generators are deprecated in favor of the
 *           unified `articulated/` generators (DoorGenerator, WindowGenerator, etc.)
 *           which extend ArticulatedObjectBase. These Rapier-specific files are
 *           maintained only for backward compatibility.
 *
 * @module articulated/rapier
 */

// Types
export type {
  RapierJointType,
  RapierJointConfig,
  ArticulatedFurnitureResult,
  RigidBodyDef,
  ArticulatedFurnitureConfig,
} from './RapierTypes';

export {
  DEFAULT_FURNITURE_CONFIG,
  createMaterial,
} from './RapierTypes';

// Generators
export { RapierDoorGenerator as DoorGenerator } from './RapierDoorGenerator';
export { RapierWindowGenerator as WindowGenerator } from './RapierWindowGenerator';
export { RapierDrawerGenerator as DrawerGenerator } from './RapierDrawerGenerator';
export { RapierCabinetGenerator as CabinetGenerator } from './RapierCabinetGenerator';
export { RapierFaucetGenerator as FaucetGenerator } from './RapierFaucetGenerator';
