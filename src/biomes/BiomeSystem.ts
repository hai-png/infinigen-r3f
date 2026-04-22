import * as THREE from 'three';
import { MaterialPresets } from './materials/MaterialPresets';

/**
 * Biome configuration defining environmental characteristics
 */
export interface BiomeConfig {
  name: string;
  
  // Terrain properties
  terrainType: 'mountain' | 'plains' | 'forest' | 'desert' | 'tundra' | 'volcanic';
  elevationMin: number;
  elevationMax: number;
  slopeMax: number;
  
  // Climate
  temperature: number; // -1 (cold) to 1 (hot)
  humidity: number; // 0 (dry) to 1 (wet)
  rainfall: number; // meters per year
  
  // Surface materials
  surfaceMaterials: string[];
  underwaterMaterials?: string[];
  
  // Vegetation density (0-1)
  vegetationDensity: number;
  treeDensity: number;
  rockDensity: number;
  
  // Water features
  hasWater: boolean;
  waterLevel: number;
  hasRivers: boolean;
  hasLakes: boolean;
  
  // Weather effects
  fogDensity: number;
  ambientColor: THREE.Color;
}

/**
 * Predefined biome configurations
 */
export class BiomeDefinitions {
  
  static temperateForest(): BiomeConfig {
    return {
      name: 'Temperate Forest',
      terrainType: 'forest',
      elevationMin: 0,
      elevationMax: 500,
      slopeMax: 45,
      temperature: 0.3,
      humidity: 0.6,
      rainfall: 1.2,
      surfaceMaterials: ['topsoil', 'grass', 'moss'],
      underwaterMaterials: ['sand', 'gravel'],
      vegetationDensity: 0.8,
      treeDensity: 0.7,
      rockDensity: 0.3,
      hasWater: true,
      waterLevel: 0,
      hasRivers: true,
      hasLakes: true,
      fogDensity: 0.02,
      ambientColor: new THREE.Color(0x87CEEB),
    };
  }

  static desert(): BiomeConfig {
    return {
      name: 'Desert',
      terrainType: 'desert',
      elevationMin: 0,
      elevationMax: 300,
      slopeMax: 30,
      temperature: 0.9,
      humidity: 0.1,
      rainfall: 0.1,
      surfaceMaterials: ['sand', 'sandstone', 'rock'],
      underwaterMaterials: ['sand'],
      vegetationDensity: 0.05,
      treeDensity: 0.02,
      rockDensity: 0.4,
      hasWater: false,
      waterLevel: -10,
      hasRivers: false,
      hasLakes: false,
      fogDensity: 0.01,
      ambientColor: new THREE.Color(0xFFD7A0),
    };
  }

  static tundra(): BiomeConfig {
    return {
      name: 'Tundra',
      terrainType: 'tundra',
      elevationMin: 0,
      elevationMax: 400,
      slopeMax: 25,
      temperature: -0.7,
      humidity: 0.3,
      rainfall: 0.3,
      surfaceMaterials: ['snow', 'ice', 'rock'],
      underwaterMaterials: ['gravel'],
      vegetationDensity: 0.1,
      treeDensity: 0.05,
      rockDensity: 0.5,
      hasWater: true,
      waterLevel: 0,
      hasRivers: false,
      hasLakes: true,
      fogDensity: 0.03,
      ambientColor: new THREE.Color(0xD3E5FF),
    };
  }

  static tropicalRainforest(): BiomeConfig {
    return {
      name: 'Tropical Rainforest',
      terrainType: 'forest',
      elevationMin: 0,
      elevationMax: 800,
      slopeMax: 60,
      temperature: 0.8,
      humidity: 0.95,
      rainfall: 3.0,
      surfaceMaterials: ['topsoil', 'grass', 'moss', 'clay'],
      underwaterMaterials: ['sand', 'clay'],
      vegetationDensity: 1.0,
      treeDensity: 0.9,
      rockDensity: 0.2,
      hasWater: true,
      waterLevel: 0,
      hasRivers: true,
      hasLakes: true,
      fogDensity: 0.04,
      ambientColor: new THREE.Color(0x90EE90),
    };
  }

  static alpineMountain(): BiomeConfig {
    return {
      name: 'Alpine Mountain',
      terrainType: 'mountain',
      elevationMin: 500,
      elevationMax: 2000,
      slopeMax: 70,
      temperature: -0.3,
      humidity: 0.4,
      rainfall: 1.5,
      surfaceMaterials: ['rock', 'snow', 'ice', 'grass'],
      underwaterMaterials: ['gravel'],
      vegetationDensity: 0.2,
      treeDensity: 0.1,
      rockDensity: 0.8,
      hasWater: true,
      waterLevel: 0,
      hasRivers: true,
      hasLakes: true,
      fogDensity: 0.05,
      ambientColor: new THREE.Color(0xB0C4DE),
    };
  }

  static volcanic(): BiomeConfig {
    return {
      name: 'Volcanic',
      terrainType: 'volcanic',
      elevationMin: 0,
      elevationMax: 1500,
      slopeMax: 65,
      temperature: 0.7,
      humidity: 0.2,
      rainfall: 0.5,
      surfaceMaterials: ['basalt', 'obsidian', 'lava'],
      underwaterMaterials: ['basalt'],
      vegetationDensity: 0.05,
      treeDensity: 0.01,
      rockDensity: 0.9,
      hasWater: false,
      waterLevel: -50,
      hasRivers: false,
      hasLakes: false,
      fogDensity: 0.06,
      ambientColor: new THREE.Color(0xFF6347),
    };
  }

  static grasslandPlains(): BiomeConfig {
    return {
      name: 'Grassland Plains',
      terrainType: 'plains',
      elevationMin: 0,
      elevationMax: 200,
      slopeMax: 15,
      temperature: 0.2,
      humidity: 0.5,
      rainfall: 0.8,
      surfaceMaterials: ['grass', 'topsoil', 'sand'],
      underwaterMaterials: ['sand', 'clay'],
      vegetationDensity: 0.6,
      treeDensity: 0.15,
      rockDensity: 0.1,
      hasWater: true,
      waterLevel: 0,
      hasRivers: true,
      hasLakes: true,
      fogDensity: 0.015,
      ambientColor: new THREE.Color(0x98FB98),
    };
  }

  /**
   * Get all predefined biomes
   */
  static getAllBiomes(): BiomeConfig[] {
    return [
      this.temperateForest(),
      this.desert(),
      this.tundra(),
      this.tropicalRainforest(),
      this.alpineMountain(),
      this.volcanic(),
      this.grasslandPlains(),
    ];
  }

  /**
   * Get biome by name
   */
  static getByName(name: string): BiomeConfig | undefined {
    const biomes = this.getAllBiomes();
    return biomes.find(b => b.name.toLowerCase() === name.toLowerCase());
  }
}

/**
 * Biome manager for handling biome transitions and blending
 */
export class BiomeManager {
  private biomes: Map<string, BiomeConfig>;
  private currentBiome: BiomeConfig | null;

  constructor() {
    this.biomes = new Map();
    this.currentBiome = null;
    
    // Register default biomes
    BiomeDefinitions.getAllBiomes().forEach(biome => {
      this.registerBiome(biome);
    });
  }

  /**
   * Register a biome configuration
   */
  registerBiome(config: BiomeConfig): void {
    this.biomes.set(config.name.toLowerCase(), config);
  }

  /**
   * Set the current active biome
   */
  setBiome(name: string): boolean {
    const biome = this.biomes.get(name.toLowerCase());
    if (biome) {
      this.currentBiome = biome;
      return true;
    }
    return false;
  }

  /**
   * Get the current biome
   */
  getCurrentBiome(): BiomeConfig | null {
    return this.currentBiome;
  }

  /**
   * Interpolate between two biomes based on a factor (0-1)
   */
  interpolateBiomes(biome1: BiomeConfig, biome2: BiomeConfig, factor: number): BiomeConfig {
    const clampedFactor = Math.max(0, Math.min(1, factor));
    
    return {
      name: `${biome1.name}-${biome2.name}-transition`,
      terrainType: this.interpolateTerrainType(biome1.terrainType, biome2.terrainType, clampedFactor),
      elevationMin: biome1.elevationMin + (biome2.elevationMin - biome1.elevationMin) * clampedFactor,
      elevationMax: biome1.elevationMax + (biome2.elevationMax - biome1.elevationMax) * clampedFactor,
      slopeMax: biome1.slopeMax + (biome2.slopeMax - biome1.slopeMax) * clampedFactor,
      temperature: biome1.temperature + (biome2.temperature - biome1.temperature) * clampedFactor,
      humidity: biome1.humidity + (biome2.humidity - biome1.humidity) * clampedFactor,
      rainfall: biome1.rainfall + (biome2.rainfall - biome1.rainfall) * clampedFactor,
      surfaceMaterials: this.interpolateMaterials(biome1.surfaceMaterials, biome2.surfaceMaterials, clampedFactor),
      vegetationDensity: biome1.vegetationDensity + (biome2.vegetationDensity - biome1.vegetationDensity) * clampedFactor,
      treeDensity: biome1.treeDensity + (biome2.treeDensity - biome1.treeDensity) * clampedFactor,
      rockDensity: biome1.rockDensity + (biome2.rockDensity - biome1.rockDensity) * clampedFactor,
      hasWater: biome1.hasWater || biome2.hasWater,
      waterLevel: biome1.waterLevel + (biome2.waterLevel - biome1.waterLevel) * clampedFactor,
      hasRivers: biome1.hasRivers || biome2.hasRivers,
      hasLakes: biome1.hasLakes || biome2.hasLakes,
      fogDensity: biome1.fogDensity + (biome2.fogDensity - biome1.fogDensity) * clampedFactor,
      ambientColor: biome1.ambientColor.clone().lerp(biome2.ambientColor, clampedFactor),
    };
  }

  private interpolateTerrainType(
    type1: BiomeConfig['terrainType'],
    type2: BiomeConfig['terrainType'],
    factor: number
  ): BiomeConfig['terrainType'] {
    return factor < 0.5 ? type1 : type2;
  }

  private interpolateMaterials(mat1: string[], mat2: string[], factor: number): string[] {
    if (factor < 0.3) return mat1;
    if (factor > 0.7) return mat2;
    
    // Blend materials in transition zone
    const combined = [...new Set([...mat1, ...mat2])];
    return combined;
  }

  /**
   * Get material for a position based on biome and elevation
   */
  getSurfaceMaterial(elevation: number, moisture: number): string {
    if (!this.currentBiome) return 'topsoil';
    
    const { surfaceMaterials, waterLevel } = this.currentBiome;
    
    if (elevation < waterLevel) {
      return this.currentBiome.underwaterMaterials?.[0] || 'sand';
    }
    
    // Select material based on moisture
    const materialIndex = Math.floor(moisture * surfaceMaterials.length) % surfaceMaterials.length;
    return surfaceMaterials[materialIndex];
  }

  /**
   * Apply biome atmospheric effects to scene
   */
  applyAtmosphere(scene: THREE.Scene): void {
    if (!this.currentBiome) return;
    
    const { fogDensity, ambientColor } = this.currentBiome;
    
    scene.fog = new THREE.FogExp2(ambientColor, fogDensity);
    scene.background = ambientColor;
  }
}
