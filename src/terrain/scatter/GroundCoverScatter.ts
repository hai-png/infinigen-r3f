/**
 * Infinigen R3F Port - Phase 3: Scatter Systems
 * Ground Cover Scattering System
 * 
 * Handles grass, flowers, moss, pebbles, and other low-lying ground vegetation
 * with biome-aware placement and seasonal variations.
 */

import { Vector3, InstancedMesh, Matrix4, Color, BufferGeometry } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { BiomeType, BiomeSystem } from '../biomes/BiomeSystem';
import { HeightMap, MaskMap } from '../core/TerrainGenerator';

export type GroundCoverType = 
  | 'grass'
  | 'clover'
  | 'flowers'
  | 'moss'
  | 'pebbles'
  | 'twigs'
  | 'mushrooms'
  | 'ferns'
  | 'dead_leaves'
  | 'snow_patches';

export interface GroundCoverConfig {
  name: string;
  type: GroundCoverType;
  scaleMin: number;
  scaleMax: number;
  densityBase: number;
  densityVariation: number;
  slopeLimit: number;
  altitudeRange: [number, number];
  moistureRange: [number, number];
  clumpingFactor: number;
  rotationRandomness: number;
  colorVariation: [number, number, number]; // RGB variation range
  seasonalMultiplier: Record<'spring' | 'summer' | 'autumn' | 'winter', number>;
  biomes: BiomeType[];
}

export interface GroundCoverInstance {
  position: Vector3;
  rotation: number;
  scale: Vector3;
  type: GroundCoverType;
  biome: BiomeType;
  color: Color;
}

export class GroundCoverScatter {
  private rng: SeededRandom;
  private biomeSystem: BiomeSystem;
  private coverConfigs: Map<string, GroundCoverConfig>;
  private currentSeason: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer';

  constructor(biomeSystem: BiomeSystem, seed: number = 12345) {
    this.rng = new SeededRandom(seed);
    this.biomeSystem = biomeSystem;
    this.coverConfigs = new Map();
    this.initializeDefaultCovers();
  }

  /**
   * Initialize default ground cover configurations
   */
  private initializeDefaultCovers(): void {
    // Grass variants
    this.coverConfigs.set('lush_grass', {
      name: 'Lush Grass',
      type: 'grass',
      scaleMin: 0.8,
      scaleMax: 1.2,
      densityBase: 0.7,
      densityVariation: 0.3,
      slopeLimit: 0.5,
      altitudeRange: [0.0, 0.6],
      moistureRange: [0.4, 1.0],
      clumpingFactor: 0.4,
      rotationRandomness: 0.3,
      colorVariation: [0.1, 0.2, 0.05],
      seasonalMultiplier: { spring: 1.2, summer: 1.0, autumn: 0.6, winter: 0.2 },
      biomes: ['temperate_forest', 'grassland', 'meadow'],
    });

    this.coverConfigs.set('dry_grass', {
      name: 'Dry Grass',
      type: 'grass',
      scaleMin: 0.6,
      scaleMax: 1.0,
      densityBase: 0.5,
      densityVariation: 0.2,
      slopeLimit: 0.7,
      altitudeRange: [0.0, 0.5],
      moistureRange: [0.0, 0.4],
      clumpingFactor: 0.3,
      rotationRandomness: 0.4,
      colorVariation: [0.15, 0.1, 0.05],
      seasonalMultiplier: { spring: 0.8, summer: 0.6, autumn: 0.9, winter: 0.4 },
      biomes: ['desert', 'savanna', 'steppe'],
    });

    this.coverConfigs.set('snow_grass', {
      name: 'Snow Grass',
      type: 'grass',
      scaleMin: 0.5,
      scaleMax: 0.8,
      densityBase: 0.4,
      densityVariation: 0.2,
      slopeLimit: 0.6,
      altitudeRange: [0.7, 1.0],
      moistureRange: [0.5, 1.0],
      clumpingFactor: 0.5,
      rotationRandomness: 0.3,
      colorVariation: [0.05, 0.05, 0.1],
      seasonalMultiplier: { spring: 0.5, summer: 0.3, autumn: 0.4, winter: 0.8 },
      biomes: ['alpine', 'tundra', 'taiga'],
    });

    // Clover
    this.coverConfigs.set('clover', {
      name: 'Clover',
      type: 'clover',
      scaleMin: 0.3,
      scaleMax: 0.5,
      densityBase: 0.4,
      densityVariation: 0.2,
      slopeLimit: 0.3,
      altitudeRange: [0.0, 0.5],
      moistureRange: [0.3, 0.8],
      clumpingFactor: 0.7,
      rotationRandomness: 0.5,
      colorVariation: [0.05, 0.1, 0.02],
      seasonalMultiplier: { spring: 1.3, summer: 1.0, autumn: 0.5, winter: 0.1 },
      biomes: ['temperate_forest', 'grassland', 'meadow'],
    });

    // Flower patches
    this.coverConfigs.set('wildflowers', {
      name: 'Wildflowers',
      type: 'flowers',
      scaleMin: 0.2,
      scaleMax: 0.4,
      densityBase: 0.3,
      densityVariation: 0.2,
      slopeLimit: 0.25,
      altitudeRange: [0.1, 0.5],
      moistureRange: [0.3, 0.7],
      clumpingFactor: 0.8,
      rotationRandomness: 0.6,
      colorVariation: [0.3, 0.3, 0.3],
      seasonalMultiplier: { spring: 1.5, summer: 1.2, autumn: 0.3, winter: 0.0 },
      biomes: ['temperate_forest', 'meadow', 'grassland'],
    });

    this.coverConfigs.set('desert_flowers', {
      name: 'Desert Flowers',
      type: 'flowers',
      scaleMin: 0.15,
      scaleMax: 0.3,
      densityBase: 0.15,
      densityVariation: 0.1,
      slopeLimit: 0.4,
      altitudeRange: [0.0, 0.4],
      moistureRange: [0.0, 0.3],
      clumpingFactor: 0.6,
      rotationRandomness: 0.5,
      colorVariation: [0.2, 0.15, 0.1],
      seasonalMultiplier: { spring: 1.8, summer: 0.3, autumn: 0.2, winter: 0.1 },
      biomes: ['desert', 'savanna'],
    });

    // Moss
    this.coverConfigs.set('forest_moss', {
      name: 'Forest Moss',
      type: 'moss',
      scaleMin: 0.4,
      scaleMax: 0.7,
      densityBase: 0.5,
      densityVariation: 0.2,
      slopeLimit: 0.8,
      altitudeRange: [0.2, 0.7],
      moistureRange: [0.6, 1.0],
      clumpingFactor: 0.9,
      rotationRandomness: 0.2,
      colorVariation: [0.05, 0.1, 0.05],
      seasonalMultiplier: { spring: 1.1, summer: 1.0, autumn: 0.9, winter: 0.7 },
      biomes: ['temperate_forest', 'rainforest', 'taiga'],
    });

    this.coverConfigs.set('rock_moss', {
      name: 'Rock Moss',
      type: 'moss',
      scaleMin: 0.3,
      scaleMax: 0.5,
      densityBase: 0.3,
      densityVariation: 0.15,
      slopeLimit: 0.9,
      altitudeRange: [0.3, 0.9],
      moistureRange: [0.4, 0.9],
      clumpingFactor: 0.85,
      rotationRandomness: 0.15,
      colorVariation: [0.08, 0.12, 0.06],
      seasonalMultiplier: { spring: 1.0, summer: 0.9, autumn: 0.85, winter: 0.6 },
      biomes: ['alpine', 'temperate_forest', 'taiga'],
    });

    // Pebbles
    this.coverConfigs.set('gravel', {
      name: 'Gravel',
      type: 'pebbles',
      scaleMin: 0.2,
      scaleMax: 0.6,
      densityBase: 0.4,
      densityVariation: 0.2,
      slopeLimit: 1.0,
      altitudeRange: [0.0, 1.0],
      moistureRange: [0.0, 1.0],
      clumpingFactor: 0.3,
      rotationRandomness: 0.8,
      colorVariation: [0.1, 0.1, 0.1],
      seasonalMultiplier: { spring: 1.0, summer: 1.0, autumn: 1.0, winter: 1.0 },
      biomes: ['all'],
    });

    this.coverConfigs.set('river_rocks', {
      name: 'River Rocks',
      type: 'pebbles',
      scaleMin: 0.3,
      scaleMax: 0.8,
      densityBase: 0.6,
      densityVariation: 0.2,
      slopeLimit: 0.3,
      altitudeRange: [0.0, 0.15],
      moistureRange: [0.7, 1.0],
      clumpingFactor: 0.5,
      rotationRandomness: 0.7,
      colorVariation: [0.08, 0.08, 0.1],
      seasonalMultiplier: { spring: 1.0, summer: 1.0, autumn: 1.0, winter: 1.0 },
      biomes: ['temperate_forest', 'grassland', 'taiga'],
    });

    // Twigs and debris
    this.coverConfigs.set('forest_debris', {
      name: 'Forest Debris',
      type: 'twigs',
      scaleMin: 0.3,
      scaleMax: 0.7,
      densityBase: 0.3,
      densityVariation: 0.15,
      slopeLimit: 0.4,
      altitudeRange: [0.1, 0.6],
      moistureRange: [0.3, 0.8],
      clumpingFactor: 0.6,
      rotationRandomness: 0.9,
      colorVariation: [0.15, 0.1, 0.05],
      seasonalMultiplier: { spring: 0.7, summer: 0.8, autumn: 1.3, winter: 0.9 },
      biomes: ['temperate_forest', 'deciduous_forest'],
    });

    // Mushrooms
    this.coverConfigs.set('forest_mushrooms', {
      name: 'Forest Mushrooms',
      type: 'mushrooms',
      scaleMin: 0.2,
      scaleMax: 0.5,
      densityBase: 0.15,
      densityVariation: 0.1,
      slopeLimit: 0.3,
      altitudeRange: [0.2, 0.6],
      moistureRange: [0.6, 1.0],
      clumpingFactor: 0.9,
      rotationRandomness: 0.4,
      colorVariation: [0.2, 0.15, 0.1],
      seasonalMultiplier: { spring: 1.2, summer: 0.8, autumn: 1.5, winter: 0.2 },
      biomes: ['temperate_forest', 'rainforest', 'taiga'],
    });

    // Ferns
    this.coverConfigs.set('ground_ferns', {
      name: 'Ground Ferns',
      type: 'ferns',
      scaleMin: 0.4,
      scaleMax: 0.8,
      densityBase: 0.35,
      densityVariation: 0.15,
      slopeLimit: 0.35,
      altitudeRange: [0.2, 0.6],
      moistureRange: [0.5, 0.9],
      clumpingFactor: 0.75,
      rotationRandomness: 0.5,
      colorVariation: [0.08, 0.12, 0.05],
      seasonalMultiplier: { spring: 1.3, summer: 1.0, autumn: 0.6, winter: 0.1 },
      biomes: ['temperate_forest', 'rainforest'],
    });

    // Dead leaves
    this.coverConfigs.set('dead_leaves', {
      name: 'Dead Leaves',
      type: 'dead_leaves',
      scaleMin: 0.3,
      scaleMax: 0.6,
      densityBase: 0.4,
      densityVariation: 0.2,
      slopeLimit: 0.5,
      altitudeRange: [0.1, 0.6],
      moistureRange: [0.2, 0.7],
      clumpingFactor: 0.7,
      rotationRandomness: 0.8,
      colorVariation: [0.2, 0.15, 0.1],
      seasonalMultiplier: { spring: 0.3, summer: 0.4, autumn: 1.5, winter: 0.8 },
      biomes: ['temperate_forest', 'deciduous_forest'],
    });

    // Snow patches
    this.coverConfigs.set('snow_patches', {
      name: 'Snow Patches',
      type: 'snow_patches',
      scaleMin: 0.5,
      scaleMax: 1.0,
      densityBase: 0.3,
      densityVariation: 0.2,
      slopeLimit: 0.6,
      altitudeRange: [0.6, 1.0],
      moistureRange: [0.5, 1.0],
      clumpingFactor: 0.6,
      rotationRandomness: 0.3,
      colorVariation: [0.05, 0.05, 0.1],
      seasonalMultiplier: { spring: 0.4, summer: 0.1, autumn: 0.3, winter: 1.2 },
      biomes: ['alpine', 'tundra', 'taiga'],
    });
  }

  /**
   * Scatter ground cover across terrain
   */
  public scatter(
    heightMap: HeightMap,
    slopeMap: HeightMap,
    moistureMap: HeightMap,
    biomeMask: MaskMap,
    width: number,
    height: number,
    baseDensity: number = 1.0
  ): GroundCoverInstance[] {
    const instances: GroundCoverInstance[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const biomeType = biomeMask[idx];
        const h = heightMap[idx];
        const slope = slopeMap[idx];
        const moisture = moistureMap[idx];

        // Get applicable covers for this biome
        const applicableCovers = this.getApplicableCovers(biomeType);
        if (applicableCovers.length === 0) continue;

        for (const config of applicableCovers) {
          // Apply seasonal multiplier
          const seasonalDensity = config.densityBase * config.seasonalMultiplier[this.currentSeason];
          const localDensity = baseDensity * seasonalDensity * (1 + this.rng.next() * config.densityVariation);

          // Probabilistic placement
          if (this.rng.next() > localDensity) continue;

          // Check constraints
          if (slope > config.slopeLimit) continue;
          if (h < config.altitudeRange[0] || h > config.altitudeRange[1]) continue;
          if (moisture < config.moistureRange[0] || moisture > config.moistureRange[1]) continue;

          // Create instance
          const scale = config.scaleMin + this.rng.next() * (config.scaleMax - config.scaleMin);
          const rotation = this.rng.next() * Math.PI * 2 * config.rotationRandomness;
          
          // Generate color with variation
          const color = this.generateColor(config);

          instances.push({
            position: new Vector3(x, h * 100, y),
            rotation,
            scale: new Vector3(scale, scale, scale),
            type: config.type,
            biome: biomeType,
            color,
          });
        }
      }
    }

    return instances;
  }

  /**
   * Get covers applicable to a biome
   */
  private getApplicableCovers(biome: BiomeType): GroundCoverConfig[] {
    const configs: GroundCoverConfig[] = [];
    
    for (const config of this.coverConfigs.values()) {
      if (config.biomes.includes('all') || config.biomes.includes(biome)) {
        configs.push(config);
      }
    }
    
    return configs;
  }

  /**
   * Generate color with variation
   */
  private generateColor(config: GroundCoverConfig): Color {
    const baseColor = this.getBaseColorForType(config.type);
    const r = Math.max(0, Math.min(1, baseColor.r + (this.rng.next() - 0.5) * config.colorVariation[0]));
    const g = Math.max(0, Math.min(1, baseColor.g + (this.rng.next() - 0.5) * config.colorVariation[1]));
    const b = Math.max(0, Math.min(1, baseColor.b + (this.rng.next() - 0.5) * config.colorVariation[2]));
    
    return new Color(r, g, b);
  }

  /**
   * Get base color for cover type
   */
  private getBaseColorForType(type: GroundCoverType): Color {
    switch (type) {
      case 'grass':
        return new Color(0.2, 0.6, 0.1);
      case 'clover':
        return new Color(0.15, 0.5, 0.15);
      case 'flowers':
        return new Color(0.8, 0.3, 0.5);
      case 'moss':
        return new Color(0.1, 0.4, 0.15);
      case 'pebbles':
        return new Color(0.5, 0.5, 0.5);
      case 'twigs':
        return new Color(0.4, 0.3, 0.2);
      case 'mushrooms':
        return new Color(0.7, 0.5, 0.4);
      case 'ferns':
        return new Color(0.15, 0.45, 0.2);
      case 'dead_leaves':
        return new Color(0.5, 0.35, 0.2);
      case 'snow_patches':
        return new Color(0.95, 0.95, 1.0);
      default:
        return new Color(0.5, 0.5, 0.5);
    }
  }

  /**
   * Apply clumping to instances
   */
  public applyClumping(
    instances: GroundCoverInstance[],
    strength: number = 0.5
  ): GroundCoverInstance[] {
    if (instances.length === 0) return instances;

    const clustered: GroundCoverInstance[] = [];
    const used = new Set<number>();

    for (let i = 0; i < instances.length; i++) {
      if (used.has(i)) continue;

      const center = instances[i];
      clustered.push(center);
      used.add(i);

      // Find nearby instances to cluster
      let clusterSize = 1;
      const maxClusterSize = 3 + Math.floor(this.rng.next() * 8);
      const clusterRadius = 5 * strength;

      for (let j = i + 1; j < instances.length && clusterSize < maxClusterSize; j++) {
        if (used.has(j)) continue;

        const other = instances[j];
        const dx = other.position.x - center.position.x;
        const dz = other.position.z - center.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < clusterRadius && other.type === center.type) {
          // Move closer to center
          const moveFactor = 0.5 * strength;
          other.position.x = center.position.x + dx * (1 - moveFactor);
          other.position.z = center.position.z + dz * (1 - moveFactor);
          
          clustered.push(other);
          used.add(j);
          clusterSize++;
        }
      }
    }

    return clustered;
  }

  /**
   * Create instanced mesh from ground cover instances
   */
  public createInstancedMesh(
    instances: GroundCoverInstance[],
    templateMesh: InstancedMesh,
    maxCount: number = 50000
  ): InstancedMesh {
    const count = Math.min(instances.length, maxCount);
    const mesh = templateMesh.clone();
    mesh.count = count;

    const matrix = new Matrix4();
    const tempColor = new Color();

    for (let i = 0; i < count; i++) {
      const inst = instances[i];
      
      matrix.makeScale(inst.scale.x, inst.scale.y, inst.scale.z);
      matrix.setPosition(inst.position);
      matrix.rotateY(inst.rotation);

      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, inst.color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return mesh;
  }

  /**
   * Set current season
   */
  public setSeason(season: 'spring' | 'summer' | 'autumn' | 'winter'): void {
    this.currentSeason = season;
  }

  /**
   * Get current season
   */
  public getSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
    return this.currentSeason;
  }

  /**
   * Add custom ground cover configuration
   */
  public addCover(config: GroundCoverConfig): void {
    this.coverConfigs.set(config.name, config);
  }

  /**
   * Get cover configuration by name
   */
  public getCoverConfig(name: string): GroundCoverConfig | undefined {
    return this.coverConfigs.get(name);
  }

  /**
   * Reseed the scatterer
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Filter instances by type
   */
  public filterByType(
    instances: GroundCoverInstance[],
    types: GroundCoverType[]
  ): GroundCoverInstance[] {
    return instances.filter(inst => types.includes(inst.type));
  }

  /**
   * Filter instances by biome
   */
  public filterByBiome(
    instances: GroundCoverInstance[],
    biomes: BiomeType[]
  ): GroundCoverInstance[] {
    return instances.filter(inst => biomes.includes(inst.biome));
  }
}
