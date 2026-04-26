import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * ShrubGenerator - Procedural shrub and bush generation with species presets
 * 
 * Features:
 * - Multiple predefined species (boxwood, hydrangea, lavender, rose_bush, etc.)
 * - Seasonal color variations
 * - Berry and flower support
 * - Multiple branch patterns (spherical, elliptical, irregular, flat)
 * - Evergreen/deciduous support
 * 
 * @module vegetation/plants
 */

/**
 * Shrub species configuration
 */
export interface ShrubSpeciesConfig {
  name: string;
  height: { min: number; max: number };
  width: { min: number; max: number };
  density: number; // 0-1, foliage density
  branchPattern: 'spherical' | 'elliptical' | 'irregular' | 'flat';
  leafColor: THREE.Color;
  stemColor: THREE.Color;
  seasonalColors?: {
    spring?: THREE.Color;
    summer?: THREE.Color;
    autumn?: THREE.Color;
    winter?: THREE.Color;
  };
  hasBerries?: boolean;
  berryColor?: THREE.Color;
  isEvergreen?: boolean;
}

/**
 * Predefined shrub species configurations
 */
export const ShrubSpeciesPresets: Record<string, ShrubSpeciesConfig> = {
  boxwood: {
    name: 'Boxwood',
    height: { min: 0.5, max: 1.2 },
    width: { min: 0.4, max: 1.0 },
    density: 0.9,
    branchPattern: 'spherical',
    leafColor: new THREE.Color(0x3d5c3d),
    stemColor: new THREE.Color(0x6b4423),
    isEvergreen: true,
  },
  hydrangea: {
    name: 'Hydrangea',
    height: { min: 1.0, max: 2.0 },
    width: { min: 1.0, max: 1.8 },
    density: 0.75,
    branchPattern: 'spherical',
    leafColor: new THREE.Color(0x4a7c4e),
    stemColor: new THREE.Color(0x5c4033),
    hasBerries: false,
    seasonalColors: {
      spring: new THREE.Color(0x6b8e23),
      summer: new THREE.Color(0x4a7c4e),
      autumn: new THREE.Color(0x8b7355),
      winter: new THREE.Color(0x696969),
    },
  },
  lavender: {
    name: 'Lavender',
    height: { min: 0.4, max: 0.8 },
    width: { min: 0.3, max: 0.6 },
    density: 0.6,
    branchPattern: 'elliptical',
    leafColor: new THREE.Color(0x7c9473),
    stemColor: new THREE.Color(0x6b8e23),
    hasBerries: false,
  },
  holly: {
    name: 'Holly',
    height: { min: 1.5, max: 3.0 },
    width: { min: 1.0, max: 2.0 },
    density: 0.85,
    branchPattern: 'irregular',
    leafColor: new THREE.Color(0x2d5016),
    stemColor: new THREE.Color(0x4a3728),
    hasBerries: true,
    berryColor: new THREE.Color(0xdc143c),
    isEvergreen: true,
  },
  rose: {
    name: 'Rose Bush',
    height: { min: 0.8, max: 1.5 },
    width: { min: 0.6, max: 1.2 },
    density: 0.7,
    branchPattern: 'irregular',
    leafColor: new THREE.Color(0x3d6b3d),
    stemColor: new THREE.Color(0x5c4033),
    hasBerries: false,
    seasonalColors: {
      spring: new THREE.Color(0x558b2f),
      summer: new THREE.Color(0x3d6b3d),
      autumn: new THREE.Color(0x8d6e63),
      winter: new THREE.Color(0x757575),
    },
  },
  fern: {
    name: 'Fern',
    height: { min: 0.3, max: 0.8 },
    width: { min: 0.4, max: 0.9 },
    density: 0.5,
    branchPattern: 'flat',
    leafColor: new THREE.Color(0x558b2f),
    stemColor: new THREE.Color(0x6b4423),
    isEvergreen: false,
  },
};

/**
 * Procedural shrub generator for undergrowth
 */
export class ShrubGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.Material>;

  constructor() {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
  }

  /**
   * Generate a single shrub
   */
  generateShrub(
    species: string | ShrubSpeciesConfig,
    seed: number,
    options: {
      season?: 'spring' | 'summer' | 'autumn' | 'winter';
      lod?: number;
      includeFlowers?: boolean;
    } = {}
  ): THREE.Group {
    const config = typeof species === 'string'
      ? ShrubSpeciesPresets[species] || ShrubSpeciesPresets.boxwood
      : species;
    
    const season = options.season || 'summer';
    const lod = options.lod || 0;
    
    const shrubGroup = new THREE.Group();
    
    // Generate stem/branch structure
    const stemMesh = this.generateStems(config, seed, lod);
    shrubGroup.add(stemMesh);
    
    // Generate foliage
    const foliageMesh = this.generateFoliage(config, season, seed, lod);
    shrubGroup.add(foliageMesh);
    
    // Add berries if applicable
    if (config.hasBerries && config.berryColor) {
      const berriesMesh = this.generateBerries(config, seed, lod);
      shrubGroup.add(berriesMesh);
    }
    
    return shrubGroup;
  }

  /**
   * Generate stem structure
   */
  private generateStems(
    config: ShrubSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Group {
    const stemsGroup = new THREE.Group();
    const stemCount = Math.floor(this.randomInRange(3, 8, seed));
    
    for (let i = 0; i < stemCount; i++) {
      const stemSeed = seed + i;
      const height = this.randomInRange(config.height.min * 0.3, config.height.max * 0.5, stemSeed);
      const radius = this.randomInRange(0.02, 0.05, stemSeed + 1);
      
      const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, height, Math.max(4, 6 - lod));
      const material = this.getStemMaterial(config.stemColor, config.name, lod);
      
      const stemMesh = new THREE.Mesh(geometry, material);
      
      // Position stems in a cluster
      const offsetX = this.randomInRange(-0.2, 0.2, stemSeed + 2);
      const offsetZ = this.randomInRange(-0.2, 0.2, stemSeed + 3);
      const tiltAngle = this.randomInRange(-0.2, 0.2, stemSeed + 4);
      
      stemMesh.position.set(offsetX, height / 2, offsetZ);
      stemMesh.rotation.z = tiltAngle;
      stemMesh.rotation.x = this.randomInRange(-0.1, 0.1, stemSeed + 5);
      
      stemsGroup.add(stemMesh);
    }
    
    return stemsGroup;
  }

  /**
   * Generate foliage mass
   */
  private generateFoliage(
    config: ShrubSpeciesConfig,
    season: string,
    seed: number,
    lod: number
  ): THREE.Mesh {
    const width = this.randomInRange(config.width.min, config.width.max, seed);
    const height = this.randomInRange(config.height.min, config.height.max, seed + 1);
    
    let geometry: THREE.BufferGeometry;
    
    switch (config.branchPattern) {
      case 'spherical':
        geometry = new THREE.SphereGeometry(width / 2, Math.max(6, 10 - lod), Math.max(4, 8 - lod));
        break;
      case 'elliptical':
        geometry = new THREE.SphereGeometry(width / 2, Math.max(6, 10 - lod), Math.max(4, 8 - lod));
        geometry.scale(1, height / width, 1);
        break;
      case 'flat':
        geometry = this.createFlatFoliage(width, height, seed, lod);
        break;
      default: // irregular
        geometry = this.createIrregularFoliage(width, height, seed, lod);
    }
    
    const leafColor = this.getSeasonalColor(config, season);
    const material = this.getLeafMaterial(leafColor, config.name, lod, config.density);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height * 0.6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create flat foliage (for ferns)
   */
  private createFlatFoliage(
    width: number,
    height: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const frondCount = 5;
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < frondCount; i++) {
      const frondWidth = width * (0.3 + Math.random() * 0.4);
      const frondLength = height * (0.4 + Math.random() * 0.3);
      
      const frondGeometry = new THREE.BoxGeometry(frondWidth, 0.05, frondLength);
      const rotationY = (i / frondCount) * Math.PI * 2;
      frondGeometry.rotateY(rotationY);
      frondGeometry.rotateX(-0.2 - Math.random() * 0.3);
      geometries.push(frondGeometry);
    }
    
    return geometries[0];
  }

  /**
   * Create irregular foliage using noise
   */
  private createIrregularFoliage(
    width: number,
    height: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(width / 2, Math.max(8, 12 - lod), Math.max(6, 10 - lod));
    this.applyNoiseDisplacement(geometry, seed, 0.15, 0.3);
    geometry.scale(1, height / width, 1);
    return geometry;
  }

  /**
   * Generate berries
   */
  private generateBerries(
    config: ShrubSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Group {
    const berriesGroup = new THREE.Group();
    const berryCount = Math.floor(this.randomInRange(10, 30, seed));
    
    const berryGeometry = new THREE.SphereGeometry(0.03, Math.max(4, 6 - lod), Math.max(3, 4 - lod));
    const berryMaterial = new THREE.MeshStandardMaterial({
      color: config.berryColor,
      roughness: 0.4,
      metalness: 0.1,
    });
    
    for (let i = 0; i < berryCount; i++) {
      const berryMesh = new THREE.Mesh(berryGeometry, berryMaterial);
      
      const angle = (i / berryCount) * Math.PI * 2;
      const radius = this.randomInRange(0.2, 0.4, seed + i);
      const height = this.randomInRange(0.3, 0.7, seed + i + 100);
      
      berryMesh.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      
      berriesGroup.add(berryMesh);
    }
    
    return berriesGroup;
  }

  /**
   * Get cached stem material
   */
  private getStemMaterial(color: THREE.Color, key: string, lod: number): THREE.Material {
    const cacheKey = `stem_${key}_${lod}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.8,
        metalness: 0.0,
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Get cached leaf material with transparency support
   */
  private getLeafMaterial(
    color: THREE.Color,
    key: string,
    lod: number,
    density: number
  ): THREE.Material {
    const cacheKey = `leaf_${key}_${lod}_${density}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: density < 0.7,
        opacity: Math.min(1, density + 0.2),
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Get seasonal color
   */
  private getSeasonalColor(config: ShrubSpeciesConfig, season: string): THREE.Color {
    if (config.isEvergreen && (season === 'winter' || season === 'autumn')) {
      return config.leafColor;
    }
    
    if (config.seasonalColors && config.seasonalColors[season as keyof typeof config.seasonalColors]) {
      return config.seasonalColors[season as keyof typeof config.seasonalColors]!;
    }
    
    return config.leafColor;
  }

  /**
   * Apply noise displacement to geometry
   */
  private applyNoiseDisplacement(
    geometry: THREE.BufferGeometry,
    seed: number,
    frequency: number,
    amplitude: number
  ): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      const noiseValue = this.noiseUtils.perlin3D(
        vertex.x * frequency + seed,
        vertex.y * frequency,
        vertex.z * frequency
      );
      
      const displacement = 1 + noiseValue * amplitude;
      vertex.multiplyScalar(displacement);
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
  }

  /**
   * Generate shrub cluster/undergrowth
   */
  generateUndergrowth(
    count: number,
    areaSize: number,
    speciesList: string[],
    seed: number,
    options: {
      season?: 'spring' | 'summer' | 'autumn' | 'winter';
      biome?: string;
      avoidTrees?: boolean;
      treePositions?: THREE.Vector3[];
    } = {}
  ): THREE.Group {
    const undergrowthGroup = new THREE.Group();
    const season = options.season || 'summer';
    
    for (let i = 0; i < count; i++) {
      const shrubSeed = seed + i;
      const species = speciesList[Math.floor(Math.random() * speciesList.length)];
      
      // Position shrub
      const x = (Math.random() - 0.5) * areaSize;
      const z = (Math.random() - 0.5) * areaSize;
      
      // Avoid trees if requested
      if (options.avoidTrees && options.treePositions) {
        let tooClose = false;
        for (const treePos of options.treePositions) {
          const distance = Math.sqrt((x - treePos.x) ** 2 + (z - treePos.z) ** 2);
          if (distance < 1.5) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
      }
      
      const shrub = this.generateShrub(species, shrubSeed, { season });
      shrub.position.set(x, 0, z);
      shrub.rotation.y = Math.random() * Math.PI * 2;
      
      // Scale variation
      const scaleVariation = 0.7 + Math.random() * 0.6;
      shrub.scale.setScalar(scaleVariation);
      
      undergrowthGroup.add(shrub);
    }
    
    return undergrowthGroup;
  }

  /**
   * Utility: random float in range
   */
  private randomInRange(min: number, max: number, seed: number): number {
    const normalized = (Math.sin(seed * 12.9898) + 1) / 2;
    return min + normalized * (max - min);
  }
}
