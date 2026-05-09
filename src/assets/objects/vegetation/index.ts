/**
 * Unified Vegetation Module
 *
 * Consolidated vegetation generators - single canonical source for all plant life generation.
 * Replaces fragmented implementations across /plants/, /scatter/vegetation/, /climbing/, and /procedural/
 */

// Core types and base classes
export { BaseObjectGenerator, type BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

// Trees
export { TreeGenerator, TreeSpeciesPresets, type TreeSpeciesConfig, type TreeInstance, type SpaceColonizationTreeConfig, type SpaceColonizationTreeResult } from './trees/TreeGenerator';
export { ConiferGenerator, type ConiferConfig } from './trees/ConiferGenerator';
export { DeciduousGenerator, type DeciduousConfig } from './trees/DeciduousGenerator';
export { PalmGenerator, type PalmConfig } from './trees/PalmGenerator';
export { FruitTreeGenerator, type FruitTreeConfig } from './trees/FruitTreeGenerator';
export { LSystemTreeGenerator, LSystemTreePresets, generateTreeFromPreset, lsystemTreePresetFromRegistry, type LSystemRule, type LSystemConfig } from './trees/LSystemTreeGenerator';

// L-System Engine (new)
export {
  LSystemEngine,
  LSystemPresets,
  lsystemPresetFromRegistry,
  generateLSystemTree,
  type LSystemPreset,
  type LSystemProductionRule,
  type TurtleState,
  type BranchSegment,
  type LSystemOutput,
} from './trees/LSystemEngine';

// Space Colonization & Skeleton Mesh Builder
export {
  TreeSkeletonMeshBuilder,
  DEFAULT_SKELETON_MESH_CONFIG,
  type SkeletonMeshConfig,
} from './TreeSkeletonMeshBuilder';

export {
  SpaceColonization,
  DEFAULT_SPACE_COLONIZATION_CONFIG,
  type SpaceColonizationConfig,
  type TreeSkeleton,
  type TreeVertex,
  type TreeEdge,
  type AttractorVolumeShape,
} from './SpaceColonization';

export {
  BranchSkinner,
  DEFAULT_BRANCH_SKINNING_CONFIG,
  type BranchSkinningConfig,
  type SkinnedTreeResult,
  type LeafType as BranchLeafType,
} from './BranchSkinner';

export {
  type TreeGenome,
  TREE_SPECIES_PRESETS,
  genomeToSpaceColonizationConfig,
  mutateGenome,
  interpolateGenomes,
  generateRandomGenome,
  getBarkColor,
  getLeafColor,
  type TreeSpeciesPreset,
} from './TreeGenome';

// Space Colonization Tree Generator
export {
  SpaceColonizationTreeGenerator,
  DEFAULT_SC_TREE_PARAMS,
  generateSpaceColonizationTree,
  generateSpaceColonizationTreeDetailed,
  type SpaceColonizationTreeParams,
  type SpaceColonizationTreeResult as SCTreeResult,
  type SimpleTreeResult as SCSimpleTreeResult,
} from './trees/SpaceColonizationTreeGenerator';

// Plants (ground vegetation)
/** @deprecated Use GrassSystem from this module instead */
export { GrassGenerator, type GrassConfig } from './plants/GrassGenerator';
export { FlowerGenerator, type FlowerConfig, type FlowerType, type PetalArrangement, FlowerSpeciesPresets } from './plants/FlowerGenerator';
export { ShrubGenerator, ShrubSpeciesPresets, type ShrubSpeciesConfig } from './plants/ShrubGenerator';
export { FernGenerator, type FernConfig, type FernSpecies, type FernFrondShape, FernSpeciesPresets } from './plants/FernGenerator';
export { MossGenerator, type MossConfig } from './plants/MossGenerator';
export { MushroomGenerator, type MushroomConfig, type MushroomSpecies, type MushroomCapShape, MushroomSpeciesPresets } from './plants/MushroomGenerator';
export { MonocotGenerator, MonocotSpeciesPresets, type MonocotConfig } from './plants/MonocotGenerator';
export { SmallPlantGenerator, type SmallPlantConfig } from './plants/SmallPlantGenerator';
export { TropicPlantGenerator, TropicSpeciesPresets, type TropicPlantConfig } from './plants/TropicPlantGenerator';

// Climbing plants
export { VineGenerator, VineSpeciesPresets, type VineSpeciesConfig } from './climbing/VineGenerator';
export { IvyGenerator, type IvyConfig } from './climbing/IvyGenerator';

// Ivy Climbing System (new)
export {
  IvyClimbingSystem,
  ClimbingPlantPresets,
  type ClimbingPlantType,
  type IvyGrowthConfig,
  type IvyPathPoint,
} from './climbing/IvyClimbingSystem';

// Vegetation LOD System (new)
export {
  VegetationLODSystem,
  type VegetationLODConfig,
  type VegetationInstance,
  type LODLevelConfig,
} from './VegetationLODSystem';

// Wind Animation Controller (new)
export {
  WindAnimationController,
  type WindConfig,
  type WindZone,
} from './WindAnimationController';

// Forest Floor Scatter (new)
export {
  ForestFloorScatter,
  type ForestFloorConfig,
  type ScatterObjectType,
  type Season,
} from './scatter/ForestFloorScatter';

// Coral Growth Algorithms — @deprecated Import from `@/assets/objects/coral/` instead.
// The objects/coral/ module is now the canonical import location for ALL coral generators,
// combining both class-based (Branching, Fan, Brain) and algorithm-based generators.
export {
  DifferentialGrowth,
  GrayScottReactionDiffusion,
  LaplacianGrowth,
  CoralGrowthGenerator,
  generateCoral,
  generateCoralPattern,
  GRAY_SCOTT_PRESETS,
  type DifferentialGrowthParams,
  type LaplacianGrowthParams,
  type CoralType,
  type CoralGrowthGeneratorParams,
  type ReactionDiffusionPreset,
  type GrayScottParams,
} from './coral';

// Coral Growth Algorithms Phase 2 — @deprecated Import from `@/assets/objects/coral/` instead.
export {
  ReactionDiffusionCoralGenerator,
  generateReactionDiffusionCoral,
  REACTION_DIFFUSION_CORAL_PRESETS,
  feed2kill,
  type ReactionDiffusionCoralPreset,
  type ReactionDiffusionCoralParams,
} from './coral';

export {
  DifferentialGrowthCoralGenerator,
  generateDifferentialGrowthCoral,
  type DifferentialGrowthCoralVariant,
  type DifferentialGrowthCoralParams,
} from './coral';

// Leaf Generator with Vein Structure and Wave Deformation (Phase 2)
export {
  LeafGenerator,
  generateLeaf,
  type LeafShapeType,
  type VeinParams,
  type WaveParams,
  type LeafGeneratorParams,
} from './leaves';

export {
  LeafMaterialGenerator,
  generateLeafMaterial,
  type LeafColorScheme,
  type LeafMaterialParams,
} from './leaves';

// Monocot Growth System (Phase 2: phyllotaxis-based)
export {
  MonocotGrowthFactory,
  generateMonocot,
  type MonocotGrowthParams,
  type MonocotResult,
} from './monocots';

// Tree Species with Specific Attractors (Phase 2)
export {
  TREE_SPECIES_ATTRACTOR_PRESETS,
  speciesAttractorPresetFromRegistry,
  getSpeciesPreset,
  getAvailableSpecies,
  generateSpeciesAttractors,
  type AttractorGeneratorFn,
  type SpeciesAttractorPreset,
} from './trees/TreeSpeciesPresets';

// ── Overhaul Additions ─────────────────────────────────────────────────────

// Shared vegetation types (canonical Season type, VegetationCategory, etc.)
export type {
  Season as VegetationSeason,
  VegetationCategory,
  SeasonalSpeciesCategory,
  SeasonalWeights,
  SeasonalColors,
  SpeciesDescriptor,
} from './types';
export { SEASONS } from './types';

// Species Registry — single source of truth for tree/plant species presets
export {
  SpeciesRegistry,
  getSpeciesRegistry,
  resetSpeciesRegistry,
  type SpeciesEntry,
} from './SpeciesRegistry';

// Grass System — unified API for grass generation and scattering
export {
  GrassSystem,
  type GrassBladeConfig,
  type GrassFieldConfig,
  type GrassScatterConfig,
} from './GrassSystem';

// Deformed Tree Generator
export {
  DeformedTreeGenerator,
  createDeformedTree,
  DEFORMED_TREE_VARIANTS,
  type DeformedTreeVariant,
  type DeformedTreeConfig,
  type BarkRingParams,
} from './trees/DeformedTreeGenerator';

// Individual Deformed Tree Type Generators
export {
  HollowTreeGenerator,
  createHollowTree,
  DEFAULT_HOLLOW_TREE_CONFIG,
  type HollowTreeConfig,
} from './trees/HollowTreeGenerator';

export {
  RottenTreeGenerator,
  createRottenTree,
  DEFAULT_ROTTEN_TREE_CONFIG,
  type RottenTreeConfig,
} from './trees/RottenTreeGenerator';

export {
  TruncatedTreeGenerator,
  createTruncatedTree,
  DEFAULT_TRUNCATED_TREE_CONFIG,
  type TruncatedTreeConfig,
} from './trees/TruncatedTreeGenerator';

// Root System Generator (canonical 1006-line version)
export {
  RootSystemGenerator,
  createRootGeometry,
  generateRootSystemFromPreset,
  generateRootSystem,
  ROOT_PRESETS,
  type RootSystemConfig,
  type RootSegment,
  type RootSystemResult,
} from './trees/RootSystemGenerator';
