import * as THREE from 'three';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '../../../../core/util/math/index';
import { LeafGeometry, LeafCluster, LeafType, ClusterConfig } from './LeafGeometry';
import { SpaceColonization, type SpaceColonizationConfig, type TreeSkeleton } from '../SpaceColonization';
import { TreeSkeletonMeshBuilder, type SkeletonMeshConfig, DEFAULT_SKELETON_MESH_CONFIG } from '../TreeSkeletonMeshBuilder';
import { TreeGenome, TREE_SPECIES_PRESETS, genomeToSpaceColonizationConfig, getBarkColor, getLeafColor } from '../TreeGenome';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

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
  /** Leaf geometry type — maps tree species to specific leaf shapes */
  leafType?: LeafType;
  /** Number of individual leaves per cluster (default varies by species) */
  leafCount?: number;
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
    leafType: 'oak',
    leafCount: 300,
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
    leafType: 'needle',
    leafCount: 500,
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
    leafType: 'birch',
    leafCount: 250,
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
    leafType: 'palm',
    leafCount: 100,
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
    leafType: 'willow',
    leafCount: 400,
  },
};

/**
 * Configuration for Space Colonization tree generation.
 * Maps tree species presets to SpaceColonizationConfig parameters.
 */
export interface SpaceColonizationTreeConfig {
  /** Tree genome species name or a custom genome */
  species: string | TreeGenome;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Optional overrides for the SpaceColonizationConfig derived from the genome */
  spaceColonizationOverrides?: Partial<SpaceColonizationConfig>;
  /** Optional overrides for the SkeletonMeshConfig */
  meshConfigOverrides?: Partial<SkeletonMeshConfig>;
  /** Season for leaf coloring (default 'summer') */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

/**
 * Result of Space Colonization tree generation.
 */
export interface SpaceColonizationTreeResult {
  /** The branch/trunk geometry with 'generation' vertex attribute */
  branchGeometry: THREE.BufferGeometry;
  /** Bark material */
  barkMaterial: THREE.MeshStandardMaterial;
  /** The raw skeleton from SpaceColonization (for further processing) */
  skeleton: TreeSkeleton;
  /** Leaf positions (terminal vertices) for foliage placement */
  leafPositions: THREE.Vector3[];
  /** Bounding box of the tree */
  boundingBox: THREE.Box3;
}

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
      /** Force per-leaf geometry instead of primitive approximations (default: true) */
      usePerLeafGeometry?: boolean;
    } = {}
  ): THREE.Group {
    const config = typeof species === 'string'
      ? TreeSpeciesPresets[species] || TreeSpeciesPresets.oak
      : species;

    const season = options.season || 'summer';
    const lod = options.lod || 0;
    const usePerLeafGeometry = options.usePerLeafGeometry !== false; // default true
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
    const foliageMesh = this.generateFoliage(config, season, seed, lod, actualTrunkHeight, usePerLeafGeometry);
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
   * Generate foliage/crown positioned at actual trunk top.
   * When usePerLeafGeometry is true (default), uses individual leaf geometry
   * from LeafGeometry/LeafCluster instead of sphere/cone approximations.
   */
  private generateFoliage(
    config: TreeSpeciesConfig,
    season: string,
    seed: number,
    lod: number,
    trunkHeight: number,
    usePerLeafGeometry: boolean = true
  ): THREE.Mesh {
    const foliageRng = new SeededRandom(seed + 5000);
    const crownRadius = foliageRng.uniform(config.crownRadius.min, config.crownRadius.max);
    const crownHeight = foliageRng.uniform(config.crownHeight.min, config.crownHeight.max);

    let geometry: THREE.BufferGeometry;

    if (usePerLeafGeometry && config.leafType) {
      // Use per-leaf geometry for realistic foliage
      geometry = this.createPerLeafFoliage(config, crownRadius, crownHeight, seed, lod);
    } else {
      // Fallback to primitive approximations
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
   * Create foliage using per-leaf geometry from LeafCluster.
   * Generates multiple clusters of individual leaves distributed across the
   * crown volume, giving a much more realistic appearance than sphere/cone shapes.
   */
  private createPerLeafFoliage(
    config: TreeSpeciesConfig,
    crownRadius: number,
    crownHeight: number,
    seed: number,
    lod: number
  ): THREE.BufferGeometry {
    const leafType = config.leafType || 'broad';
    const leafCount = config.leafCount || 200;
    const adjustedCount = Math.max(50, Math.round(leafCount / (1 + lod * 0.5)));

    // Scale leaf size based on tree size and LOD
    const leafSize = 0.08 + crownRadius * 0.01;
    const leafWidth = 0.04 + crownRadius * 0.005;

    // Create multiple clusters distributed in the crown volume
    const clusterCount = Math.max(3, Math.round(crownRadius * 1.5));
    const clusterRng = new SeededRandom(seed + 7000);
    const geometries: THREE.BufferGeometry[] = [];

    for (let c = 0; c < clusterCount; c++) {
      // Position each cluster within the crown volume
      const theta = clusterRng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * clusterRng.next() - 1);
      const r = clusterRng.uniform(0, crownRadius * 0.6);

      const cx = r * Math.sin(phi) * Math.cos(theta);
      const cy = r * Math.sin(phi) * Math.sin(theta) + crownHeight * 0.3;
      const cz = r * Math.cos(phi);

      // Determine orientation bias based on leaf type
      let orientationBias: 'up' | 'outward' | 'random' = 'outward';
      if (leafType === 'willow') orientationBias = 'random';
      if (leafType === 'needle') orientationBias = 'up';
      if (leafType === 'palm') orientationBias = 'outward';

      const leavesPerCluster = Math.max(10, Math.round(adjustedCount / clusterCount));

      const clusterGeometry = LeafCluster.createMergedCluster(
        leafType,
        leavesPerCluster,
        {
          radius: crownRadius * 0.3,
          density: config.leafDensity,
          seed: seed + c * 1000,
          orientationBias,
        }
      );

      // Apply leaf size configuration
      const leafGeo = LeafGeometry.createLeaf(leafType, {
        size: leafSize,
        width: leafWidth,
        curvature: 0.1,
        stemLength: 0.02,
      });
      // Use the cluster geometry but scale by the leaf config
      // The cluster already placed leaves; now offset to cluster position
      const clusterTransform = new THREE.Matrix4();
      clusterTransform.makeTranslation(cx, cy, cz);
      clusterGeometry.applyMatrix4(clusterTransform);

      geometries.push(clusterGeometry);
    }

    // Merge all clusters into a single geometry
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    if (geometries.length === 1) {
      return geometries[0];
    }
    return this.mergeGeometries(geometries);
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
   * Merge multiple BufferGeometries into one.
   * Delegates to the canonical GeometryPipeline.mergeGeometries.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
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

  // --------------------------------------------------------------------------
  // Space Colonization Integration
  // --------------------------------------------------------------------------

  /**
   * Generate a tree using the SpaceColonization algorithm for organic shapes.
   *
   * This method creates a tree skeleton using the space colonization algorithm
   * and then converts it into a smooth Three.js mesh using TreeSkeletonMeshBuilder.
   * The result provides more naturalistic branching than the cylinder-based
   * generateTree() method.
   *
   * @param config Configuration for the SC tree generation
   * @returns A group containing the branch mesh and optional leaf positions
   */
  generateWithSpaceColonization(
    config: SpaceColonizationTreeConfig
  ): THREE.Group {
    const { seed, season = 'summer' } = config;

    // Resolve the genome from species name or custom genome
    const genome: TreeGenome = typeof config.species === 'string'
      ? (TREE_SPECIES_PRESETS[config.species]?.genome ?? TREE_SPECIES_PRESETS.broadleaf.genome)
      : config.species;

    // Derive SpaceColonizationConfig from the genome
    const scConfig = genomeToSpaceColonizationConfig(genome, seed);

    // Apply any overrides
    const finalScConfig: Partial<SpaceColonizationConfig> = {
      ...scConfig,
      ...config.spaceColonizationOverrides,
    };

    // Step 1: Generate the tree skeleton via Space Colonization
    const sc = new SpaceColonization(finalScConfig);
    const skeleton = sc.generate();

    // Step 2: Build the mesh geometry from the skeleton
    const builder = new TreeSkeletonMeshBuilder();
    const branchGeometry = builder.buildFromSkeleton(
      skeleton,
      config.meshConfigOverrides
    );

    // Step 3: Create bark material from genome colors
    const barkColor = getBarkColor(genome);
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: barkColor,
      roughness: 0.7 + genome.barkRoughness * 0.3,
      metalness: 0.0,
    });

    // Step 4: Assemble the tree group
    const treeGroup = new THREE.Group();

    const branchMesh = new THREE.Mesh(branchGeometry, barkMaterial);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    treeGroup.add(branchMesh);

    // Step 5: Optionally add foliage at terminal vertices
    const leafPositions: THREE.Vector3[] = skeleton.terminalIndices
      .filter(idx => skeleton.vertices[idx].generation >= 1)
      .map(idx => skeleton.vertices[idx].position.clone());

    if (leafPositions.length > 0) {
      const leafColor = getLeafColor(genome, season);
      const foliageGeo = this.createFoliageFromPositions(
        leafPositions,
        genome.leafSize,
        seed
      );

      if (foliageGeo.attributes.position.count > 0) {
        const leafMaterial = new THREE.MeshStandardMaterial({
          color: leafColor,
          roughness: 0.6,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
        const foliageMesh = new THREE.Mesh(foliageGeo, leafMaterial);
        foliageMesh.castShadow = true;
        foliageMesh.receiveShadow = true;
        treeGroup.add(foliageMesh);
      }
    }

    return treeGroup;
  }

  /**
   * Generate a SpaceColonizationTreeResult with detailed output for
   * advanced use cases where the caller needs the raw skeleton data.
   *
   * @param config Configuration for the SC tree generation
   * @returns Detailed result with geometry, materials, skeleton, and leaf positions
   */
  generateWithSpaceColonizationDetailed(
    config: SpaceColonizationTreeConfig
  ): SpaceColonizationTreeResult {
    const { seed, season = 'summer' } = config;

    const genome: TreeGenome = typeof config.species === 'string'
      ? (TREE_SPECIES_PRESETS[config.species]?.genome ?? TREE_SPECIES_PRESETS.broadleaf.genome)
      : config.species;

    const scConfig = genomeToSpaceColonizationConfig(genome, seed);
    const finalScConfig: Partial<SpaceColonizationConfig> = {
      ...scConfig,
      ...config.spaceColonizationOverrides,
    };

    const sc = new SpaceColonization(finalScConfig);
    const skeleton = sc.generate();

    const builder = new TreeSkeletonMeshBuilder();
    const branchGeometry = builder.buildFromSkeleton(
      skeleton,
      config.meshConfigOverrides
    );

    const barkColor = getBarkColor(genome);
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: barkColor,
      roughness: 0.7 + genome.barkRoughness * 0.3,
      metalness: 0.0,
    });

    const leafPositions = skeleton.terminalIndices
      .filter(idx => skeleton.vertices[idx].generation >= 1)
      .map(idx => skeleton.vertices[idx].position.clone());

    const boundingBox = new THREE.Box3().setFromPoints(
      skeleton.vertices.map(v => v.position)
    );

    return {
      branchGeometry,
      barkMaterial,
      skeleton,
      leafPositions,
      boundingBox,
    };
  }

  /**
   * Create simple foliage geometry at given leaf positions.
   * Uses small sphere approximations scaled by leafSize.
   */
  private createFoliageFromPositions(
    positions: THREE.Vector3[],
    leafSize: number,
    seed: number
  ): THREE.BufferGeometry {
    if (positions.length === 0) {
      return new THREE.BufferGeometry();
    }

    const rng = new SeededRandom(seed + 9999);
    const geometries: THREE.BufferGeometry[] = [];
    const leafRadius = Math.max(0.05, leafSize * 1.5);

    for (const pos of positions) {
      // Create a small sphere at each leaf position
      const leafGeo = new THREE.SphereGeometry(leafRadius, 4, 3);
      leafGeo.translate(
        pos.x + rng.uniform(-leafRadius, leafRadius),
        pos.y + rng.uniform(-leafRadius * 0.5, leafRadius * 0.5),
        pos.z + rng.uniform(-leafRadius, leafRadius)
      );
      geometries.push(leafGeo);
    }

    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }

    return this.mergeGeometries(geometries);
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
