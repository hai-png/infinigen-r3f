/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Biome-Aware Vegetation Scattering System
 */

import { Vector3, InstancedMesh, Matrix4, Color } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { BiomeType, BiomeSystem } from './biomes/BiomeSystem';
import { HeightMap, MaskMap } from './core/TerrainGenerator';

export interface VegetationConfig {
  name: string;
  type: 'tree' | 'bush' | 'grass' | 'flower' | 'rock' | 'mushroom';
  scaleMin: number;
  scaleMax: number;
  densityModifier: number;
  slopeLimit: number;
  altitudeRange: [number, number];
  clumpingFactor: number;
}

export interface VegetationInstance {
  position: Vector3;
  rotation: number;
  scale: number;
  biome: BiomeType;
  vegetationType: string;
}

export class VegetationScatter {
  private rng: SeededRandom;
  private biomeSystem: BiomeSystem;
  private vegetationConfigs: Map<string, VegetationConfig>;

  constructor(biomeSystem: BiomeSystem, seed: number = 12345) {
    this.rng = new SeededRandom(seed);
    this.biomeSystem = biomeSystem;
    this.vegetationConfigs = new Map();
    this.initializeDefaultVegetation();
  }

  /**
   * Initialize default vegetation configurations
   */
  private initializeDefaultVegetation(): void {
    // Trees
    this.vegetationConfigs.set('oak_trees', {
      name: 'Oak Tree',
      type: 'tree',
      scaleMin: 0.8,
      scaleMax: 1.2,
      densityModifier: 1.0,
      slopeLimit: 0.3,
      altitudeRange: [0.1, 0.7],
      clumpingFactor: 0.6,
    });

    this.vegetationConfigs.set('pine_trees', {
      name: 'Pine Tree',
      type: 'tree',
      scaleMin: 0.7,
      scaleMax: 1.5,
      densityModifier: 0.9,
      slopeLimit: 0.6,
      altitudeRange: [0.3, 0.85],
      clumpingFactor: 0.7,
    });

    this.vegetationConfigs.set('maple_trees', {
      name: 'Maple Tree',
      type: 'tree',
      scaleMin: 0.9,
      scaleMax: 1.1,
      densityModifier: 0.8,
      slopeLimit: 0.25,
      altitudeRange: [0.15, 0.6],
      clumpingFactor: 0.5,
    });

    this.vegetationConfigs.set('birch_trees', {
      name: 'Birch Tree',
      type: 'tree',
      scaleMin: 0.8,
      scaleMax: 1.0,
      densityModifier: 0.7,
      slopeLimit: 0.2,
      altitudeRange: [0.2, 0.65],
      clumpingFactor: 0.4,
    });

    this.vegetationConfigs.set('spruce_trees', {
      name: 'Spruce Tree',
      type: 'tree',
      scaleMin: 0.6,
      scaleMax: 1.3,
      densityModifier: 0.85,
      slopeLimit: 0.7,
      altitudeRange: [0.4, 0.9],
      clumpingFactor: 0.75,
    });

    this.vegetationConfigs.set('palm_trees', {
      name: 'Palm Tree',
      type: 'tree',
      scaleMin: 1.0,
      scaleMax: 1.4,
      densityModifier: 0.6,
      slopeLimit: 0.1,
      altitudeRange: [0.0, 0.15],
      clumpingFactor: 0.8,
    });

    // Bushes
    this.vegetationConfigs.set('bushes', {
      name: 'Bush',
      type: 'bush',
      scaleMin: 0.5,
      scaleMax: 1.0,
      densityModifier: 1.2,
      slopeLimit: 0.5,
      altitudeRange: [0.1, 0.6],
      clumpingFactor: 0.7,
    });

    // Grass
    this.vegetationConfigs.set('grass', {
      name: 'Grass',
      type: 'grass',
      scaleMin: 0.3,
      scaleMax: 0.8,
      densityModifier: 2.0,
      slopeLimit: 0.8,
      altitudeRange: [0.0, 0.75],
      clumpingFactor: 0.3,
    });

    this.vegetationConfigs.set('beach_grass', {
      name: 'Beach Grass',
      type: 'grass',
      scaleMin: 0.4,
      scaleMax: 0.7,
      densityModifier: 1.5,
      slopeLimit: 0.2,
      altitudeRange: [0.0, 0.12],
      clumpingFactor: 0.5,
    });

    // Flowers
    this.vegetationConfigs.set('flowers', {
      name: 'Flowers',
      type: 'flower',
      scaleMin: 0.2,
      scaleMax: 0.5,
      densityModifier: 3.0,
      slopeLimit: 0.3,
      altitudeRange: [0.15, 0.5],
      clumpingFactor: 0.6,
    });

    // Rocks
    this.vegetationConfigs.set('rocks', {
      name: 'Rocks',
      type: 'rock',
      scaleMin: 0.5,
      scaleMax: 2.0,
      densityModifier: 0.8,
      slopeLimit: 1.0,
      altitudeRange: [0.0, 1.0],
      clumpingFactor: 0.4,
    });

    // Mushrooms
    this.vegetationConfigs.set('mushrooms', {
      name: 'Mushrooms',
      type: 'mushroom',
      scaleMin: 0.3,
      scaleMax: 0.6,
      densityModifier: 1.5,
      slopeLimit: 0.2,
      altitudeRange: [0.3, 0.65],
      clumpingFactor: 0.8,
    });

    // Ferns
    this.vegetationConfigs.set('ferns', {
      name: 'Ferns',
      type: 'grass',
      scaleMin: 0.3,
      scaleMax: 0.6,
      densityModifier: 2.5,
      slopeLimit: 0.25,
      altitudeRange: [0.35, 0.65],
      clumpingFactor: 0.7,
    });
  }

  /**
   * Scatter vegetation across terrain
   */
  public scatterVegetation(
    heightMap: HeightMap,
    slopeMap: HeightMap,
    biomeMask: MaskMap,
    width: number,
    height: number,
    baseDensity: number = 1.0
  ): VegetationInstance[] {
    const instances: VegetationInstance[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const biomeType = biomeMask[idx];
        const biome = this.biomeSystem.getBiomeFromHeightSlope(
          heightMap[idx],
          slopeMap[idx]
        );

        const allowedVeg = this.biomeSystem.getAllowedVegetation(biomeType);
        if (allowedVeg.length === 0) continue;

        const vegetationDensity = this.biomeSystem.getVegetationDensity(biomeType);
        const localDensity = baseDensity * vegetationDensity;

        // Probabilistic placement
        if (this.rng.next() > localDensity) continue;

        // Select random vegetation type from allowed list
        const vegName = allowedVeg[Math.floor(this.rng.next() * allowedVeg.length)];
        const config = this.vegetationConfigs.get(vegName);
        
        if (!config) continue;

        // Check slope limit
        if (slopeMap[idx] > config.slopeLimit) continue;

        // Check altitude range
        const h = heightMap[idx];
        if (h < config.altitudeRange[0] || h > config.altitudeRange[1]) continue;

        // Create instance
        const scale = config.scaleMin + this.rng.next() * (config.scaleMax - config.scaleMin);
        const rotation = this.rng.next() * Math.PI * 2;

        instances.push({
          position: new Vector3(x, h * 100, y),
          rotation,
          scale,
          biome: biomeType,
          vegetationType: vegName,
        });
      }
    }

    return instances;
  }

  /**
   * Create instanced mesh from vegetation instances
   */
  public createInstancedMesh(
    instances: VegetationInstance[],
    templateMesh: InstancedMesh,
    maxCount: number = 10000
  ): InstancedMesh {
    const count = Math.min(instances.length, maxCount);
    const mesh = templateMesh.clone();
    mesh.count = count;

    const matrix = new Matrix4();
    const color = new Color();

    for (let i = 0; i < count; i++) {
      const inst = instances[i];
      
      matrix.makeScale(inst.scale, inst.scale, inst.scale);
      matrix.setPosition(inst.position);
      matrix.rotateY(inst.rotation);

      mesh.setMatrixAt(i, matrix);
      
      // Optional: vary colors slightly
      color.setHex(0xffffff);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return mesh;
  }

  /**
   * Apply clumping behavior to vegetation
   */
  public applyClumping(
    instances: VegetationInstance[],
    clumpingStrength: number = 0.5
  ): VegetationInstance[] {
    if (instances.length === 0) return instances;

    const clustered: VegetationInstance[] = [];
    const used = new Set<number>();

    for (let i = 0; i < instances.length; i++) {
      if (used.has(i)) continue;

      const center = instances[i];
      clustered.push(center);
      used.add(i);

      // Find nearby instances to cluster
      let clusterSize = 1;
      const maxClusterSize = 5 + Math.floor(this.rng.next() * 10);

      for (let j = i + 1; j < instances.length && clusterSize < maxClusterSize; j++) {
        if (used.has(j)) continue;

        const other = instances[j];
        const dx = other.position.x - center.position.x;
        const dz = other.position.z - center.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 10 * clumpingStrength) {
          // Move closer to center
          const moveFactor = 0.5 * clumpingStrength;
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
   * Filter instances by biome type
   */
  public filterByBiome(
    instances: VegetationInstance[],
    biomes: BiomeType[]
  ): VegetationInstance[] {
    return instances.filter(inst => biomes.includes(inst.biome));
  }

  /**
   * Get vegetation configuration
   */
  public getVegetationConfig(name: string): VegetationConfig | undefined {
    return this.vegetationConfigs.get(name);
  }

  /**
   * Add custom vegetation type
   */
  public addVegetation(config: VegetationConfig): void {
    this.vegetationConfigs.set(config.name, config);
  }

  /**
   * Reseed the scatterer
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
  }
}
