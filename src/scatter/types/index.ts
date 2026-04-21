/**
 * Scatter Types Module
 * 
 * Additional scatter generators for specialized vegetation and environmental elements.
 * Extends the core scatter system with domain-specific implementations.
 */

export { GroundDebrisScatter } from './GroundDebrisScatter';
export type { GroundDebrisOptions } from './GroundDebrisScatter';

export { FlowerScatter } from './FlowerScatter';
export type { FlowerScatterOptions } from './FlowerScatter';

// Re-export for convenience
export * from '../../terrain/scatter';
