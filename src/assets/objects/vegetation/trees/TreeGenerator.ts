import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';
import { SeededRandom } from '../../../../core/util/math/index';

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
 * Procedural tree generator with multiple species support.
 * All geometries wrapped in Mesh(geometry, MeshStandardMaterial).
 * Uses SeededRandom throughout.
 */
export class TreeGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.MeshStandardMaterial>;
  private geometryCache: Map<string, THREE.BufferGeometry>;
  private rng: SeededRandom;

  constructor(seed: number = 12345) {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
    this.geometryCache = new Map();
    this.rng = new SeededRandom(seed);
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
    const treeRng = new SeededRandom(seed);

    const treeGroup = new THREE.Group();

    // Generate trunk — track actual height for foliage positioning
    const trunkResult = this.generateTrunk(config, seed, lod, treeRng);
    const actualTrunkHeight = trunkResult.height;
    treeGroup.add(trunkResult.mesh);

    // Generate branches
    const branchesMesh = this.generateBranches(config, seed, lod, treeRng, actualTrunkHeight);
    treeGroup.add(branchesMesh);

    // Generate foliage/crown — positioned at actual trunk top
    const foliageMesh = this.generateFoliage(config, season, seed, lod, actualTrunkHeight);
    treeGroup.add(foliageMesh);

    // Add snow cap if applicable
    if (config.hasSnowCap && season === 'winter') {
      const snowMesh = this.generateSnowCap(config, seed, lod, actualTrunkHeight);
      treeGroup.add(snowMesh);
    }

    return treeGroup;
  }

  /**
   * Generate tree trunk with procedural texture.
   * Returns the mesh and the actual height generated.
   */
  private generateTrunk(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number,
    rng: SeededRandom
  ): { mesh: THREE.Mesh; height: number } {
    const height = rng.uniform(config.trunkHeight.min, config.trunkHeight.max);
    const radius = rng.uniform(config.trunkRadius.min, config.trunkRadius.max);

    const segments = Math.max(6, 12 - lod * 2);
    const geometry = new THREE.CylinderGeometry(radius * 0.8, radius * 1.2, height, segments);

    // Apply noise displacement for natural trunk shape
    this.applyNoiseDisplacement(geometry, seed, 0.05, 0.3);

    const material = this.getBarkMaterial(config.barkColor, config.name, lod);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return { mesh, height };
  }

  /**
   * Generate branch system using SeededRandom
   */
  private generateBranches(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number,
    rng: SeededRandom,
    trunkHeight: number
  ): THREE.Group {
    const branchesGroup = new THREE.Group();
    const branchCount = rng.nextInt(config.branchCount.min, config.branchCount.max);

    for (let i = 0; i < branchCount; i++) {
      const branchSeed = seed + i * 100;
      const branchRng = new SeededRandom(branchSeed);
      const angle = rng.uniform(config.branchAngle.min, config.branchAngle.max);
      const length = rng.uniform(1, 3);
      const radius = rng.uniform(0.05, 0.15);

      const branchGeometry = new THREE.CylinderGeometry(radius * 0.6, radius, length, Math.max(4, 8 - lod));
      const branchMaterial = this.getBarkMaterial(config.barkColor, `${config.name}_branch`, lod);
      const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);

      // Position and rotate branch using seeded random
      const startHeight = rng.uniform(trunkHeight * 0.3, trunkHeight * 0.85);
      const rotationZ = angle * (branchRng.boolean(0.5) ? 1 : -1);
      const rotationY = branchRng.uniform(0, Math.PI * 2);

      branchMesh.position.set(0, startHeight, 0);
      branchMesh.rotation.z = rotationZ;
      branchMesh.rotation.y = rotationY;
      branchMesh.castShadow = true;

      branchesGroup.add(branchMesh);
    }

    return branchesGroup;
  }

  /**
   * Generate foliage/crown positioned at actual trunk top
   */
  private generateFoliage(
    config: TreeSpeciesConfig,
    season: string,
    seed: number,
    lod: number,
    trunkHeight: number
  ): THREE.Mesh {
    const foliageRng = new SeededRandom(seed + 5000);
    const crownRadius = foliageRng.uniform(config.crownRadius.min, config.crownRadius.max);
    const crownHeight = foliageRng.uniform(config.crownHeight.min, config.crownHeight.max);

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
    // Position foliage at the top of the actual trunk
    mesh.position.y = trunkHeight;
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
    // Scale to match height
    geometry.scale(1, height / (baseRadius * 2), 1);
    return geometry;
  }

  /**
   * Create palm fronds — merge ALL fronds into a single geometry.
   * Each frond is a wider blade shape for visibility.
   */
  private createPalmFronds(
    radius: number,
    height: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const frondCount = 10;
    const rng = new SeededRandom(seed);
    const geometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2 + rng.uniform(-0.1, 0.1);

      // Create frond as a tapered plane (wider and more visible)
      const frondLength = radius * 1.2;
      const frondWidth = 0.5 + rng.uniform(0, 0.3);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(frondWidth / 2, frondLength * 0.2);
      shape.lineTo(frondWidth * 0.3, frondLength * 0.6);
      shape.lineTo(0, frondLength);
      shape.lineTo(-frondWidth * 0.3, frondLength * 0.6);
      shape.lineTo(-frondWidth / 2, frondLength * 0.2);
      shape.closePath();

      const frondGeometry = new THREE.ShapeGeometry(shape, 4);

      // Rotate frond to point outward and droop
      const droopAngle = -0.4 - rng.uniform(0, 0.3);
      frondGeometry.rotateX(droopAngle);
      frondGeometry.rotateY(angle);

      geometries.push(frondGeometry);
    }

    // Merge ALL frond geometries into a single geometry
    return this.mergeGeometries(geometries);
  }

  /**
   * Merge multiple BufferGeometries into one
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVertices = 0;
    let totalIndices = 0;
    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
      if (geo.index) {
        totalIndices += geo.index.count;
      } else {
        totalIndices += geo.attributes.position.count;
      }
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedIndices: number[] = [];
    let vertexOffset = 0;

    for (const geo of geometries) {
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;

      for (let i = 0; i < posAttr.count; i++) {
        mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
        mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
        mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

        if (normAttr) {
          mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
          mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
          mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
        }
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          mergedIndices.push(geo.index.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          mergedIndices.push(vertexOffset + i);
        }
      }

      vertexOffset += posAttr.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setIndex(mergedIndices);
    merged.computeVertexNormals();

    return merged;
  }

  /**
   * Generate snow cap on branches
   */
  private generateSnowCap(
    config: TreeSpeciesConfig,
    seed: number,
    lod: number,
    trunkHeight: number
  ): THREE.Mesh {
    const crownRadius = config.crownRadius.max * 0.6;
    const geometry = new THREE.SphereGeometry(crownRadius, Math.max(6, 12 - lod), Math.max(4, 8 - lod));

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = trunkHeight + config.crownHeight.max * 0.3;
    mesh.scale.y = 0.3;

    return mesh;
  }

  /**
   * Get cached bark material
   */
  private getBarkMaterial(color: THREE.Color, key: string, lod: number): THREE.MeshStandardMaterial {
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
  private getLeafMaterial(color: THREE.Color, key: string, lod: number): THREE.MeshStandardMaterial {
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
   * Generate forest with multiple trees using SeededRandom
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
    const forestRng = new SeededRandom(seed);

    for (let i = 0; i < count; i++) {
      const treeSeed = seed + i;
      const species = forestRng.choice(speciesList);

      // Check density map if provided
      if (options.densityMap) {
        const x = (forestRng.uniform(0, 1) - 0.5) * areaSize;
        const z = (forestRng.uniform(0, 1) - 0.5) * areaSize;
        const densityIndex = Math.floor(((x / areaSize + 0.5) * 100)) * 100 +
                            Math.floor(((z / areaSize + 0.5) * 100));

        if (densityIndex >= 0 && densityIndex < options.densityMap.length) {
          if (forestRng.next() > options.densityMap[densityIndex]) {
            continue; // Skip based on density
          }
        }
      }

      const tree = this.generateTree(species, treeSeed, { season });

      // Position tree using seeded random
      const x = (forestRng.uniform(0, 1) - 0.5) * areaSize;
      const z = (forestRng.uniform(0, 1) - 0.5) * areaSize;
      tree.position.set(x, 0, z);
      tree.rotation.y = forestRng.uniform(0, Math.PI * 2);

      // Add slight scale variation
      const scaleVariation = 0.8 + forestRng.uniform(0, 0.4);
      tree.scale.setScalar(scaleVariation);

      forestGroup.add(tree);
    }

    return forestGroup;
  }
}
