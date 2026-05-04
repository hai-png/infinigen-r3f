/**
 * Cloth Simulation Module
 *
 * Provides cloth simulation implementations:
 * - ClothSimulation: Basic PBD cloth sim
 * - VerletClothSimulation: Verlet integration cloth sim with wind/tearing
 * - ClothCreatureBridge: Bridge connecting cloth simulation to creature skeletons
 *
 * @module sim/cloth
 */

// Basic PBD cloth simulation
export { ClothSimulation } from './ClothSimulation';
export type { ClothConfig, ClothParticle, ClothConstraint } from './ClothSimulation';

// Verlet integration cloth simulation
export { VerletClothSimulation } from './VerletCloth';
export type {
  VerletClothConfig,
  VerletParticle,
  VerletConstraint,
  PinConstraint,
} from './VerletCloth';

// Cloth-creature integration bridge
export { ClothCreatureBridge } from './ClothCreatureBridge';
export type {
  ClothGarmentConfig,
  BonePinBinding,
  ClothMeshCollisionConfig,
} from './ClothCreatureBridge';
