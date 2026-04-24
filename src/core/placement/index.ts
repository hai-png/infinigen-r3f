/**
 * Placement Module - Object Placement and Scattering System
 * Based on Infinigen's placement system
 */

// Advanced placement and scattering
export { ScatterSystem } from './advanced/ScatterSystem';
export type { ScatterConfig, ScatteredInstance } from './advanced/ScatterSystem';

// Asset factory for procedural generation
export { AssetFactory } from './utils/AssetFactory';
export type { 
  AssetFactoryOptions,
  AssetDescription
} from './utils/AssetFactory';

// Domain types
export type { ConstraintGraph, Node, Edge } from './domain/types';

export default {
  ScatterSystem,
  AssetFactory,
};
