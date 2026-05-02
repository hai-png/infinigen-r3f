/**
 * Food module - Procedural fruit and food object generators
 *
 * Provides standalone fruit geometry generators ported from the original
 * infinigen fruit asset system. Each fruit type generates visually recognizable
 * Three.js Group objects with proper materials, stems, and surface details.
 *
 * @module food
 */

export {
  // Main generator class
  FruitGenerator,

  // Bowl generator
  FruitBowlGenerator,

  // Factory functions
  createFruit,
  createFruitBowl,

  // Constants
  FRUIT_TYPES,
  FRUIT_CONFIGS,
} from './FruitGenerator';

export type {
  // Types
  FruitType,
  FruitConfig,
  FruitGeneratorOptions,
  FruitBowlOptions,
} from './FruitGenerator';
