/**
 * BiomeSystem.ts
 * Core biome type definitions and system wrapper
 * Provides legacy compatibility layer for BiomeFramework
 */

import * as THREE from 'three';
import { BiomeFramework as CoreBiomeFramework } from './BiomeFramework';

// ============================================================================
// Type Definitions (exported for use across the codebase)
// ============================================================================

export interface BiomeDefinition {
  id: string;
  name: string;
  elevationRange?: [number, number];
  slopeRange?: [number, number];
  temperatureRange?: [number, number];
  moistureRange?: [number, number];
  primaryAssets?: string[];
  secondaryAssets?: string[];
  groundMaterial?: string;
  vegetationDensity?: number;
  colorPrimary?: THREE.Color;
  colorSecondary?: THREE.Color;
  climate?: {
    temperature: number;
    humidity: number;
  };
  assetTags?: string[];
}

export interface BiomeBlend {
  primaryBiome?: BiomeDefinition | null;
  secondaryBiome?: BiomeDefinition;
  blendFactor: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  biomes: BiomeDefinition[];
  weights: number[];
  transitionFactor: number;
}

export type BiomeType = 
  | 'tundra'
  | 'taiga'
  | 'temperate_forest'
  | 'tropical_rainforest'
  | 'desert'
  | 'grassland'
  | 'savanna'
  | 'alpine'
  | 'wetland'
  | 'coastal';

export interface BiomeConfig {
  transitionWidth: number;
  blendMode: 'linear' | 'smooth' | 'stepped';
  enableElevationConstraints: boolean;
  enableSlopeConstraints: boolean;
  assetDensityMultiplier: number;
}

// ============================================================================
// BiomeSystem Wrapper Class (Legacy Compatibility)
// ============================================================================

export class BiomeSystem {
  private framework: CoreBiomeFramework;
  private config: BiomeConfig;

  constructor(transitionWidth: number = 0.3) {
    this.framework = new CoreBiomeFramework();
    this.config = {
      transitionWidth,
      blendMode: 'smooth',
      enableElevationConstraints: true,
      enableSlopeConstraints: true,
      assetDensityMultiplier: 1.0,
    };
  }

  /**
   * Initialize the biome system with definitions and transition zones
   */
  initialize(biomes: BiomeDefinition[], zones?: Array<{
    startBiome: string;
    endBiome: string;
    blendWidth: number;
    elevationRange?: [number, number];
    slopeRange?: [number, number];
  }>): void {
    const translatedZones = zones?.map(z => ({
      startBiome: z.startBiome,
      endBiome: z.endBiome,
      blendWidth: z.blendWidth,
      elevationRange: z.elevationRange,
      slopeRange: z.slopeRange,
    })) || [];

    this.framework.initialize(biomes, translatedZones);
  }

  /**
   * Get biome blend at a specific position
   */
  getBiomeBlend(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend {
    return this.framework.getBiomeBlend(position, normal);
  }

  /**
   * Scatter assets based on biome constraints
   */
  scatterAssets(
    area: { min: THREE.Vector3; max: THREE.Vector3 },
    position: THREE.Vector3,
    normal: THREE.Vector3,
    heightMap?: (x: number, z: number) => number,
    normalMap?: (x: number, z: number) => THREE.Vector3
  ): any[] {
    return this.framework.scatterAssets(area, position, normal, heightMap, normalMap);
  }

  /**
   * Add an asset to the scattering pool
   */
  addAssetToPool(assetId: string, metadata: any): void {
    this.framework.addAssetToPool(assetId, metadata);
  }

  /**
   * Create a gradient of biome blends between two points
   */
  createTransitionGradient(
    start: THREE.Vector3,
    end: THREE.Vector3,
    steps: number = 10
  ): BiomeBlend[] {
    return this.framework.createTransitionGradient(start, end, steps);
  }

  /**
   * Get current configuration
   */
  getConfig(): BiomeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BiomeConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export default BiomeSystem;
