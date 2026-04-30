import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';

/**
 * Tree species configuration with biological parameters
 */
export interface TreeSpeciesConfig {
  name: string;
  trunkHeight: { min: number; max: number };
  trunkRadius: { min: number; max: number };
  crownRadius: { min: number; max: number };
  crownHeight: { min: number; max: number };
  branchCount: { min: number; max: number };
  branchAngle: { min: number; max: number };
  leafDensity: number;
  barkColor: THREE.Color;
  leafColor: THREE.Color;
  seasonalColors?: {
    spring?: THREE.Color;
    summer?: THREE.Color;
    autumn?: THREE.Color;
    winter?: THREE.Color;
  };
  shapeType: 'cone' | 'sphere' | 'cylinder' | 'irregular' | 'palm';
  hasSnowCap?: boolean;
}

/**
 * Predefined tree species configurations
 */
export const TreeSpeciesPresets: Record<string, TreeSpeciesConfig> = {
  oak: {
    name: 'Oak',
    trunkHeight: { min: 8, max: 15 },
    trunkRadius: { min: 0.4, max: 0.8 },
    crownRadius: { min: 4, max: 7 },
    crownHeight: { min: 5, max: 8 },
    branchCount: { min: 6, max: 10 },
    branchAngle: { min: 0.3, max: 0.7 },
    leafDensity: 0.85,
    barkColor: new THREE.Color(0x4a3728),
    leafColor: new THREE.Color(0x2d5a1d),
    seasonalColors: {
      spring: new THREE.Color(0x7cb342),
      summer: new THREE.Color(0x2d5a1d),
      autumn: new THREE.Color(0xd84315),
      winter: new THREE.Color(0x5d4037),
    },
    shapeType: 'irregular',
    hasSnowCap: true,
  },
  pine: {
    name: 'Pine',
    trunkHeight: { min: 12, max: 25 },
    trunkRadius: { min: 0.3, max: 0.6 },
    crownRadius: { min: 2, max: 4 },
    crownHeight: { min: 8, max: 15 },
    branchCount: { min: 8, max: 12 },
    branchAngle: { min: 0.2, max: 0.4 },
    leafDensity: 0.9,
    barkColor: new THREE.Color(0x3e2723),
    leafColor: new THREE.Color(0x1b5e20),
    shapeType: 'cone',
    hasSnowCap: true,
  },
  birch: {
    name: 'Birch',
    trunkHeight: { min: 10, max: 18 },
    trunkRadius: { min: 0.25, max: 0.5 },
    crownRadius: { min: 3, max: 5 },
    crownHeight: { min: 4, max: 7 },
    branchCount: { min: 5, max: 8 },
    branchAngle: { min: 0.4, max: 0.6 },
    leafDensity: 0.75,
    barkColor: new THREE.Color(0xe8e8e8),
    leafColor: new THREE.Color(0x689f38),
    seasonalColors: {
      spring: new THREE.Color(0xcddc39),
      summer: new THREE.Color(0x689f38),
      autumn: new THREE.Color(0xffeb3b),
      winter: new THREE.Color(0x9e9e9e),
    },
    shapeType: 'sphere',
    hasSnowCap: false,
  },
  palm: {
    name: 'Palm',
    trunkHeight: { min: 6, max: 12 },
    trunkRadius: { min: 0.3, max: 0.5 },
    crownRadius: { min: 3, max: 5 },
    crownHeight: { min: 2, max: 4 },
    branchCount: { min: 8, max: 12 },
    branchAngle: { min: 0.5, max: 0.8 },
    leafDensity: 0.7,
    barkColor: new THREE.Color(0x8d6e63),
    leafColor: new THREE.Color(0x4caf50),
    shapeType: 'palm',
    hasSnowCap: false,
  },
  willow: {
    name: 'Willow',
    trunkHeight: { min: 8, max: 14 },
    trunkRadius: { min: 0.4, max: 0.7 },
    crownRadius: { min: 5, max: 8 },
    crownHeight: { min: 4, max: 7 },
    branchCount: { min: 10, max: 15 },
    branchAngle: { min: 0.6, max: 0.9 },
    leafDensity: 0.8,
    barkColor: new THREE.Color(0x5d4037),
    leafColor: new THREE.Color(0x8bc34a),
    shapeType: 'irregular',
    hasSnowCap: false,
  },
};

/**
 * Generated tree instance data
 */
export interface TreeInstance {
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector3;
  species: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  health: number;
  age: number;
}

/**
 * Procedural tree generator with multiple species support
 */
export class TreeGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.Material>;
  private geometryCache: Map<string, THREE.BufferGeometry>;

  constructor() {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
    this.geometryCache = new Map();
  }

  /**
   * Generate a complete tree mesh
   */
  generateTree(
    species: string | TreeSpeciesConfig,
    seed: number,
    options: {
      season?: 'spring' | 'summer' | 'autumn' | 'winter';
      lod?: number;
      includeColliders?: boolean;
    } = {}
  ): THREE.Group {
    const config = typeof species === 'string' 
      ? TreeSpeciesPresets[species] || TreeSpeciesPresets.oak
      : species;
    
    const season = options.season || 'summer';
    const lod = options.lod || 0;
    
    const treeGroup = new THREE.Group();
    
    // Generate trunk
    const trunkMesh = this.generateTrunk(config, seed, lod);
    treeGroup.add(trunkMesh);
    
    // Generate branches
    const branchesMesh = this.generateBranches(config, seed, lod);
    treeGroup.add(branchesMesh);
    
    // Generate foliage/crown
    const foliageMesh = this.generateFoliage(config, season, seed, lod);
    treeGroup.add(foliageMesh);
    
    // Add snow cap if applicable
    if (config.hasSnowCap && season === 'winter') {
      const snowMesh = this.generateSnowCap(config, seed, lod);
      treeGroup.add(snowMesh);
    }
    
    return treeGroup;
  }

  /**
   * Generate tree trunk with procedural texture
   */
  private generateTrunk(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Mesh {
    const height = this.randomInRange(config.trunkHeight.min, config.trunkHeight.max, seed);
    const radius = this.randomInRange(config.trunkRadius.min, config.trunkRadius.max, seed);
    
    const segments = Math.max(6, 12 - lod * 2);
    const geometry = new THREE.CylinderGeometry(radius, radius * 1.2, height, segments);
    
    // Apply noise displacement for natural trunk shape
    this.applyNoiseDisplacement(geometry, seed, 0.05, 0.3);
    
    const material = this.getBarkMaterial(config.barkColor, config.name, lod);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Generate branch system
   */
  private generateBranches(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Group {
    const branchesGroup = new THREE.Group();
    const branchCount = Math.floor(
      this.randomInRange(config.branchCount.min, config.branchCount.max, seed)
    );
    
    for (let i = 0; i < branchCount; i++) {
      const branchSeed = seed + i;
      const angle = this.randomInRange(config.branchAngle.min, config.branchAngle.max, branchSeed);
      const length = this.randomInRange(1, 3, branchSeed + 1);
      const radius = this.randomInRange(0.05, 0.15, branchSeed + 2);
      
      const branchGeometry = new THREE.CylinderGeometry(radius * 0.8, radius, length, Math.max(4, 8 - lod));
      const branchMaterial = this.getBarkMaterial(config.barkColor, `${config.name}_branch`, lod);
      const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
      
      // Position and rotate branch
      const startHeight = this.randomInRange(2, config.trunkHeight.max * 0.7, branchSeed + 3);
      const rotationZ = angle * (Math.random() > 0.5 ? 1 : -1);
      const rotationY = (branchSeed / 100) % (Math.PI * 2);
      
      branchMesh.position.set(0, startHeight, 0);
      branchMesh.rotation.z = rotationZ;
      branchMesh.rotation.y = rotationY;
      branchMesh.castShadow = true;
      
      branchesGroup.add(branchMesh);
    }
    
    return branchesGroup;
  }

  /**
   * Generate foliage/crown
   */
  private generateFoliage(
    config: TreeSpeciesConfig,
    season: string,
    seed: number,
    lod: number
  ): THREE.Mesh {
    const crownRadius = this.randomInRange(config.crownRadius.min, config.crownRadius.max, seed);
    const crownHeight = this.randomInRange(config.crownHeight.min, config.crownHeight.max, seed + 1);
    
    let geometry: THREE.BufferGeometry;
    
    switch (config.shapeType) {
      case 'cone':
        geometry = new THREE.ConeGeometry(crownRadius, crownHeight, Math.max(6, 12 - lod));
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(crownRadius, Math.max(6, 12 - lod), Math.max(4, 8 - lod));
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(crownRadius * 0.8, crownRadius, crownHeight, Math.max(6, 12 - lod));
        break;
      case 'palm':
        geometry = this.createPalmFronds(crownRadius, crownHeight, seed, lod);
        break;
      default: // irregular
        geometry = this.createIrregularCrown(crownRadius, crownHeight, seed, lod);
    }
    
    const leafColor = this.getSeasonalColor(config, season);
    const material = this.getLeafMaterial(leafColor, config.name, lod);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = config.trunkHeight.max * 0.8 + crownHeight / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create irregular crown shape using noise
   */
  private createIrregularCrown(
    baseRadius: number,
    height: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(baseRadius, Math.max(8, 16 - lod * 2), Math.max(6, 12 - lod));
    this.applyNoiseDisplacement(geometry, seed, 0.1, 0.4);
    return geometry;
  }

  /**
   * Create palm fronds
   */
  private createPalmFronds(
    radius: number,
    height: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const frondCount = 8;
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < frondCount; i++) {
      const frondGeometry = new THREE.BoxGeometry(radius, 0.1, 0.3);
      const rotationY = (i / frondCount) * Math.PI * 2;
      frondGeometry.rotateY(rotationY);
      frondGeometry.rotateX(-0.3);
      geometries.push(frondGeometry);
    }
    
    // Merge geometries (simplified - in production use BufferGeometryUtils.mergeBufferGeometries)
    return geometries[0];
  }

  /**
   * Generate snow cap on branches
   */
  private generateSnowCap(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Mesh {
    const crownRadius = config.crownRadius.max * 0.6;
    const geometry = new THREE.SphereGeometry(crownRadius, Math.max(6, 12 - lod), Math.max(4, 8 - lod));
    
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = config.trunkHeight.max * 0.8 + config.crownHeight.max * 0.3;
    mesh.scale.y = 0.3;
    
    return mesh;
  }

  /**
   * Get cached bark material
   */
  private getBarkMaterial(color: THREE.Color, key: string, lod: number): THREE.Material {
    const cacheKey = `bark_${key}_${lod}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.9,
        metalness: 0.0,
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Get cached leaf material
   */
  private getLeafMaterial(color: THREE.Color, key: string, lod: number): THREE.Material {
    const cacheKey = `leaf_${key}_${lod}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Get seasonal color
   */
  private getSeasonalColor(config: TreeSpeciesConfig, season: string): THREE.Color {
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
   * Generate forest with multiple trees
   */
  generateForest(
    count: number,
    areaSize: number,
    speciesList: string[],
    seed: number,
    options: {
      season?: 'spring' | 'summer' | 'autumn' | 'winter';
      densityMap?: Float32Array;
      biome?: string;
    } = {}
  ): THREE.Group {
    const forestGroup = new THREE.Group();
    const season = options.season || 'summer';
    
    for (let i = 0; i < count; i++) {
      const treeSeed = seed + i;
      const species = speciesList[Math.floor(Math.random() * speciesList.length)];
      
      // Check density map if provided
      if (options.densityMap) {
        const x = (Math.random() - 0.5) * areaSize;
        const z = (Math.random() - 0.5) * areaSize;
        const densityIndex = Math.floor(((x / areaSize + 0.5) * 100)) * 100 + 
                            Math.floor(((z / areaSize + 0.5) * 100));
        
        if (densityIndex >= 0 && densityIndex < options.densityMap.length) {
          if (Math.random() > options.densityMap[densityIndex]) {
            continue; // Skip based on density
          }
        }
      }
      
      const tree = this.generateTree(species, treeSeed, { season });
      
      // Position tree
      const x = (Math.random() - 0.5) * areaSize;
      const z = (Math.random() - 0.5) * areaSize;
      tree.position.set(x, 0, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      
      // Add slight scale variation
      const scaleVariation = 0.8 + Math.random() * 0.4;
      tree.scale.setScalar(scaleVariation);
      
      forestGroup.add(tree);
    }
    
    return forestGroup;
  }

  /**
   * Utility: random float in range
   */
  private randomInRange(min: number, max: number, seed: number): number {
    const normalized = (Math.sin(seed * 12.9898) + 1) / 2;
    return min + normalized * (max - min);
  }
}
