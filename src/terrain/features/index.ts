/**
 * Infinigen R3F Port - Phase 2: Advanced Terrain Features
 * Main Module Exports for Advanced Features
 */

// Cave System
export { 
  CaveGenerator, 
  type CaveConfig, 
  type CavePoint, 
  type CaveSystem, 
  type CaveDecoration 
} from './CaveGenerator';

// Erosion System
export { 
  ErosionSystem, 
  type ErosionConfig, 
  type ErosionData 
} from './ErosionSystem';

// Ocean System
export { 
  OceanSystem, 
  type OceanConfig, 
  type WaveData, 
  type OceanState 
} from './OceanSystem';
