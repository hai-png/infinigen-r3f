/**
 * SpaceColonizationTreeGenerator.ts — Focused Space Colonization tree generator
 *
 * A standalone entry point that creates a SpaceColonization config from tree
 * species parameters, generates a skeleton via the space colonization algorithm,
 * and builds a smooth Three.js mesh via TreeSkeletonMeshBuilder.
 *
 * This is the canonical way to produce organic, naturalistic trees using the
 * attractor-driven branching algorithm. It decouples the SC pipeline from the
 * broader TreeGenerator, keeping responsibilities focused.
 *
 * Usage:
 *   const gen = new SpaceColonizationTreeGenerator({ species: 'broadleaf', seed: 42 });
 *   const result = gen.generate();
 *   scene.add(result.mesh);
 */

import * as THREE from 'three';
import { SpaceColonization, type SpaceColonizationConfig } from '../SpaceColonization';
import { TreeSkeletonMeshBuilder, type SkeletonMeshConfig, DEFAULT_SKELETON_MESH_CONFIG } from '../TreeSkeletonMeshBuilder';
import {
  TreeGenome,
  TREE_SPECIES_PRESETS,
  genomeToSpaceColonizationConfig,
  getBarkColor,
  getLeafColor,
  type TreeSpeciesPreset,
} from '../TreeGenome';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Parameters for generating a tree via space colonization.
 */
export interface SpaceColonizationTreeParams {
  /** Species name from TREE_SPECIES_PRESETS, or a custom TreeGenome (default 'broadleaf') */
  species: string | TreeGenome;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Optional overrides for the SpaceColonizationConfig derived from the genome */
  spaceColonizationOverrides?: Partial<SpaceColonizationConfig>;
  /** Optional overrides for the SkeletonMeshConfig */
  meshConfigOverrides?: Partial<SkeletonMeshConfig>;
  /** Season for leaf coloring (default 'summer') */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Whether to generate foliage at terminal vertices (default true) */
  generateFoliage?: boolean;
  /** Bark roughness override (0–1, default from genome) */
  barkRoughness?: number;
  /** Leaf size multiplier (default 1.0) */
  leafSizeMultiplier?: number;
}

/**
 * The result of generating a tree via space colonization.
 */
export interface SpaceColonizationTreeResult {
  /** Complete tree group containing branches and optional foliage */
  mesh: THREE.Group;
  /** The branch geometry with 'generation' vertex attribute */
  branchGeometry: THREE.BufferGeometry;
  /** Bark material applied to the branches */
  barkMaterial: THREE.MeshStandardMaterial;
  /** The raw skeleton from SpaceColonization (for further processing) */
  skeleton: ReturnType<SpaceColonization['generate']>;
  /** Leaf positions (terminal vertices) for foliage placement */
  leafPositions: THREE.Vector3[];
  /** Bounding box of the tree */
  boundingBox: THREE.Box3;
}

/**
 * Simplified result for when only the mesh is needed.
 */
export interface SimpleTreeResult {
  /** Complete tree group */
  mesh: THREE.Group;
  /** Bounding box */
  boundingBox: THREE.Box3;
}

// ============================================================================
// Default Parameters
// ============================================================================

export const DEFAULT_SC_TREE_PARAMS: SpaceColonizationTreeParams = {
  species: 'broadleaf',
  seed: 42,
  season: 'summer',
  generateFoliage: true,
  leafSizeMultiplier: 1.0,
};

// ============================================================================
// SpaceColonizationTreeGenerator
// ============================================================================

/**
 * Focused tree generator that uses the Space Colonization algorithm
 * to produce organic, naturalistic branching structures.
 *
 * This class encapsulates the full pipeline:
 *   1. Resolve species → TreeGenome
 *   2. TreeGenome → SpaceColonizationConfig
 *   3. SpaceColonizationConfig → TreeSkeleton
 *   4. TreeSkeleton → THREE.BufferGeometry (via TreeSkeletonMeshBuilder)
 *   5. Geometry → THREE.Group (with bark material + optional foliage)
 *
 * All generation is deterministic when given the same seed.
 */
export class SpaceColonizationTreeGenerator {
  private params: SpaceColonizationTreeParams;
  private meshBuilder: TreeSkeletonMeshBuilder;

  constructor(params: Partial<SpaceColonizationTreeParams> = {}) {
    this.params = { ...DEFAULT_SC_TREE_PARAMS, ...params };
    this.meshBuilder = new TreeSkeletonMeshBuilder();
  }

  /**
   * Update parameters for the next generate() call.
   */
  setParams(params: Partial<SpaceColonizationTreeParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Generate a complete tree mesh with detailed result data.
   *
   * @returns SpaceColonizationTreeResult with mesh, geometry, skeleton, etc.
   */
  generate(): SpaceColonizationTreeResult {
    const { seed, season = 'summer', generateFoliage = true, leafSizeMultiplier = 1.0 } = this.params;

    // Step 1: Resolve the genome from species name or custom genome
    const genome = this.resolveGenome();

    // Step 2: Derive SpaceColonizationConfig from the genome
    const scConfig = genomeToSpaceColonizationConfig(genome, seed);

    // Apply any overrides
    const finalScConfig: Partial<SpaceColonizationConfig> = {
      ...scConfig,
      ...this.params.spaceColonizationOverrides,
    };

    // Step 3: Generate the tree skeleton via Space Colonization
    const sc = new SpaceColonization(finalScConfig);
    const skeleton = sc.generate();

    // Step 4: Build the mesh geometry from the skeleton
    const branchGeometry = this.meshBuilder.buildFromSkeleton(
      skeleton,
      this.params.meshConfigOverrides
    );

    // Step 5: Create bark material from genome colors
    const barkColor = getBarkColor(genome);
    const barkRoughness = this.params.barkRoughness ?? (0.7 + genome.barkRoughness * 0.3);
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: barkColor,
      roughness: barkRoughness,
      metalness: 0.0,
    });

    // Step 6: Assemble the tree group
    const treeGroup = new THREE.Group();

    const branchMesh = new THREE.Mesh(branchGeometry, barkMaterial);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    treeGroup.add(branchMesh);

    // Step 7: Optionally generate foliage at terminal vertices
    const leafPositions: THREE.Vector3[] = skeleton.terminalIndices
      .filter(idx => skeleton.vertices[idx].generation >= 1)
      .map(idx => skeleton.vertices[idx].position.clone());

    if (generateFoliage && leafPositions.length > 0) {
      const leafColor = getLeafColor(genome, season);
      const foliageGeo = this.createFoliageFromPositions(
        leafPositions,
        genome.leafSize * leafSizeMultiplier,
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

    // Step 8: Compute bounding box
    const boundingBox = new THREE.Box3().setFromPoints(
      skeleton.vertices.map(v => v.position)
    );

    return {
      mesh: treeGroup,
      branchGeometry,
      barkMaterial,
      skeleton,
      leafPositions,
      boundingBox,
    };
  }

  /**
   * Generate a tree and return only the mesh and bounding box.
   * Simplified API for cases where detailed result data is not needed.
   */
  generateSimple(): SimpleTreeResult {
    const result = this.generate();
    return {
      mesh: result.mesh,
      boundingBox: result.boundingBox,
    };
  }

  /**
   * Generate only the skeleton (no mesh).
   * Useful for custom mesh building or analysis.
   */
  generateSkeleton(): ReturnType<SpaceColonization['generate']> {
    const genome = this.resolveGenome();
    const scConfig = genomeToSpaceColonizationConfig(genome, this.params.seed);
    const finalScConfig: Partial<SpaceColonizationConfig> = {
      ...scConfig,
      ...this.params.spaceColonizationOverrides,
    };
    const sc = new SpaceColonization(finalScConfig);
    return sc.generate();
  }

  // --------------------------------------------------------------------------
  // Genome Resolution
  // --------------------------------------------------------------------------

  /**
   * Resolve the TreeGenome from the species parameter.
   */
  private resolveGenome(): TreeGenome {
    const { species } = this.params;
    if (typeof species === 'string') {
      const preset = TREE_SPECIES_PRESETS[species];
      if (preset) {
        return preset.genome;
      }
      // Fallback to broadleaf if species name not found
      return TREE_SPECIES_PRESETS.broadleaf.genome;
    }
    return species;
  }

  // --------------------------------------------------------------------------
  // Foliage
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Geometry Utilities
  // --------------------------------------------------------------------------

  /**
   * Merge multiple BufferGeometries into one.
   * Delegates to the canonical GeometryPipeline.mergeGeometries.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a tree mesh from a species name and seed.
 *
 * @param species Species name from TREE_SPECIES_PRESETS (default 'broadleaf')
 * @param seed Random seed (default 42)
 * @param season Season for leaf color (default 'summer')
 * @returns THREE.Group containing the complete tree
 */
export function generateSpaceColonizationTree(
  species: string = 'broadleaf',
  seed: number = 42,
  season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer'
): THREE.Group {
  const gen = new SpaceColonizationTreeGenerator({ species, seed, season });
  const result = gen.generate();
  return result.mesh;
}

/**
 * Generate a detailed Space Colonization tree result.
 *
 * @param params Generation parameters
 * @returns Detailed result with geometry, skeleton, and positions
 */
export function generateSpaceColonizationTreeDetailed(
  params: Partial<SpaceColonizationTreeParams> = {}
): SpaceColonizationTreeResult {
  const gen = new SpaceColonizationTreeGenerator(params);
  return gen.generate();
}
