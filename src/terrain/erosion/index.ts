/**
 * Erosion Module Exports
 */

export type { ErosionSystem, ThermalErosion, RiverFormation, ErosionParams, ErosionMasks, ErosionResult } from './ErosionSystem';

// Also export ErosionEnhanced and related types for direct hydraulic erosion usage
export { ErosionEnhanced, HydraulicErosion, SedimentTransport } from './ErosionEnhanced';
export type { ErosionConfig, ErosionData, Droplet } from './ErosionEnhanced';

// Glacial erosion: U-shaped valleys, moraines, glacial carving
export { GlacialErosion } from './GlacialErosion';
export type { GlacierConfig } from './GlacialErosion';

// Coastal erosion: sea cliffs, wave-cut platforms, beaches, sea stacks
export { CoastalErosion } from './CoastalErosion';
export type { CoastalConfig } from './CoastalErosion';

// Erosion visualization: visual overlay for erosion effects
export { ErosionVisualization, ErosionType } from './ErosionVisualization';
export type { ErosionVisualizationConfig } from './ErosionVisualization';
