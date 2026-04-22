/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Biome Classification and Distribution System
 */

export enum BiomeType {
  DEEP_WATER = 0,
  SHORE = 1,
  BEACH = 2,
  PLAINS = 3,
  HILLS = 4,
  FOREST = 5,
  MOUNTAIN_FOREST = 6,
  MOUNTAIN = 7,
  SNOW_PEAK = 8,
}

export interface BiomeConfig {
  name: string;
  type: BiomeType;
  minHeight: number;
  maxHeight: number;
  maxSlope: number;
  soilColor: [number, number, number];
  rockColor: [number, number, number];
  vegetationDensity: number;
  allowedVegetation: string[];
  waterLevel?: number;
}

export class BiomeSystem {
  private biomes: Map<BiomeType, BiomeConfig>;
  private seaLevel: number;

  constructor(seaLevel: number = 0.3) {
    this.seaLevel = seaLevel;
    this.biomes = new Map();
    this.initializeDefaultBiomes();
  }

  /**
   * Initialize default biome configurations
   */
  private initializeDefaultBiomes(): void {
    // Deep Water
    this.biomes.set(BiomeType.DEEP_WATER, {
      name: 'Deep Water',
      type: BiomeType.DEEP_WATER,
      minHeight: 0,
      maxHeight: this.seaLevel - 0.1,
      maxSlope: 1.0,
      soilColor: [0.1, 0.2, 0.4],
      rockColor: [0.2, 0.25, 0.3],
      vegetationDensity: 0,
      allowedVegetation: [],
      waterLevel: 1.0,
    });

    // Shore
    this.biomes.set(BiomeType.SHORE, {
      name: 'Shore',
      type: BiomeType.SHORE,
      minHeight: this.seaLevel - 0.1,
      maxHeight: this.seaLevel,
      maxSlope: 1.0,
      soilColor: [0.6, 0.5, 0.3],
      rockColor: [0.4, 0.4, 0.4],
      vegetationDensity: 0.1,
      allowedVegetation: ['seaweed', 'rocks'],
      waterLevel: 0.5,
    });

    // Beach
    this.biomes.set(BiomeType.BEACH, {
      name: 'Beach',
      type: BiomeType.BEACH,
      minHeight: this.seaLevel,
      maxHeight: this.seaLevel + 0.1,
      maxSlope: 0.1,
      soilColor: [0.76, 0.7, 0.5],
      rockColor: [0.6, 0.55, 0.45],
      vegetationDensity: 0.05,
      allowedVegetation: ['palm_trees', 'beach_grass'],
    });

    // Plains
    this.biomes.set(BiomeType.PLAINS, {
      name: 'Plains',
      type: BiomeType.PLAINS,
      minHeight: this.seaLevel + 0.1,
      maxHeight: 0.4,
      maxSlope: 0.2,
      soilColor: [0.4, 0.35, 0.2],
      rockColor: [0.5, 0.45, 0.4],
      vegetationDensity: 0.3,
      allowedVegetation: ['grass', 'flowers', 'bushes', 'oak_trees'],
    });

    // Hills
    this.biomes.set(BiomeType.HILLS, {
      name: 'Hills',
      type: BiomeType.HILLS,
      minHeight: this.seaLevel + 0.1,
      maxHeight: 0.4,
      maxSlope: 1.0,
      soilColor: [0.35, 0.3, 0.18],
      rockColor: [0.55, 0.5, 0.45],
      vegetationDensity: 0.2,
      allowedVegetation: ['grass', 'bushes', 'pine_trees'],
    });

    // Forest
    this.biomes.set(BiomeType.FOREST, {
      name: 'Forest',
      type: BiomeType.FOREST,
      minHeight: 0.4,
      maxHeight: 0.7,
      maxSlope: 0.3,
      soilColor: [0.25, 0.2, 0.1],
      rockColor: [0.4, 0.38, 0.35],
      vegetationDensity: 0.8,
      allowedVegetation: ['oak_trees', 'maple_trees', 'birch_trees', 'ferns', 'mushrooms'],
    });

    // Mountain Forest
    this.biomes.set(BiomeType.MOUNTAIN_FOREST, {
      name: 'Mountain Forest',
      type: BiomeType.MOUNTAIN_FOREST,
      minHeight: 0.4,
      maxHeight: 0.7,
      maxSlope: 1.0,
      soilColor: [0.2, 0.18, 0.08],
      rockColor: [0.45, 0.42, 0.38],
      vegetationDensity: 0.5,
      allowedVegetation: ['pine_trees', 'spruce_trees', 'rocks'],
    });

    // Mountain
    this.biomes.set(BiomeType.MOUNTAIN, {
      name: 'Mountain',
      type: BiomeType.MOUNTAIN,
      minHeight: 0.7,
      maxHeight: 0.85,
      maxSlope: 1.0,
      soilColor: [0.3, 0.28, 0.25],
      rockColor: [0.5, 0.48, 0.45],
      vegetationDensity: 0.1,
      allowedVegetation: ['rocks', 'sparse_grass'],
    });

    // Snow Peak
    this.biomes.set(BiomeType.SNOW_PEAK, {
      name: 'Snow Peak',
      type: BiomeType.SNOW_PEAK,
      minHeight: 0.85,
      maxHeight: 1.0,
      maxSlope: 1.0,
      soilColor: [0.9, 0.9, 0.9],
      rockColor: [0.7, 0.7, 0.7],
      vegetationDensity: 0,
      allowedVegetation: [],
    });
  }

  /**
   * Get biome configuration by type
   */
  public getBiome(type: BiomeType): BiomeConfig | undefined {
    return this.biomes.get(type);
  }

  /**
   * Get biome from height and slope values
   */
  public getBiomeFromHeightSlope(height: number, slope: number): BiomeConfig {
    if (height < this.seaLevel - 0.1) return this.biomes.get(BiomeType.DEEP_WATER)!;
    if (height < this.seaLevel) return this.biomes.get(BiomeType.SHORE)!;
    if (height < this.seaLevel + 0.1 && slope < 0.1) return this.biomes.get(BiomeType.BEACH)!;
    if (height < 0.4 && slope < 0.2) return this.biomes.get(BiomeType.PLAINS)!;
    if (height < 0.4 && slope >= 0.2) return this.biomes.get(BiomeType.HILLS)!;
    if (height < 0.7 && slope < 0.3) return this.biomes.get(BiomeType.FOREST)!;
    if (height < 0.7 && slope >= 0.3) return this.biomes.get(BiomeType.MOUNTAIN_FOREST)!;
    if (height < 0.85) return this.biomes.get(BiomeType.MOUNTAIN)!;
    return this.biomes.get(BiomeType.SNOW_PEAK)!;
  }

  /**
   * Get soil color for biome
   */
  public getSoilColor(type: BiomeType): [number, number, number] {
    return this.biomes.get(type)?.soilColor || [0.5, 0.5, 0.5];
  }

  /**
   * Get rock color for biome
   */
  public getRockColor(type: BiomeType): [number, number, number] {
    return this.biomes.get(type)?.rockColor || [0.5, 0.5, 0.5];
  }

  /**
   * Get vegetation density for biome
   */
  public getVegetationDensity(type: BiomeType): number {
    return this.biomes.get(type)?.vegetationDensity || 0;
  }

  /**
   * Get allowed vegetation types for biome
   */
  public getAllowedVegetation(type: BiomeType): string[] {
    return this.biomes.get(type)?.allowedVegetation || [];
  }

  /**
   * Interpolate colors between two biomes based on blend factor
   */
  public interpolateColors(
    color1: [number, number, number],
    color2: [number, number, number],
    t: number
  ): [number, number, number] {
    const clampedT = Math.max(0, Math.min(1, t));
    return [
      color1[0] + (color2[0] - color1[0]) * clampedT,
      color1[1] + (color2[1] - color1[1]) * clampedT,
      color1[2] + (color2[2] - color1[2]) * clampedT,
    ];
  }

  /**
   * Generate biome transition map
   */
  public generateTransitionMap(
    biomeMask: Uint8Array,
    width: number,
    height: number
  ): Float32Array {
    const transitions = new Float32Array(biomeMask.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const currentBiome = biomeMask[idx];

        // Sample neighbors
        let differentNeighbors = 0;
        const neighbors = [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 },
        ];

        for (const neighbor of neighbors) {
          if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height) {
            const nIdx = neighbor.y * width + neighbor.x;
            if (biomeMask[nIdx] !== currentBiome) {
              differentNeighbors++;
            }
          }
        }

        // Higher value = more at biome edge
        transitions[idx] = differentNeighbors / 4;
      }
    }

    return transitions;
  }

  /**
   * Add custom biome
   */
  public addBiome(config: BiomeConfig): void {
    this.biomes.set(config.type, config);
  }

  /**
   * Get all biomes
   */
  public getAllBiomes(): BiomeConfig[] {
    return Array.from(this.biomes.values());
  }

  /**
   * Validate biome configuration
   */
  public validateBiome(config: BiomeConfig): boolean {
    if (config.minHeight >= config.maxHeight) return false;
    if (config.maxSlope < 0 || config.maxSlope > 1) return false;
    if (config.vegetationDensity < 0 || config.vegetationDensity > 1) return false;
    return true;
  }
}
