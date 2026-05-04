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
export { LSystemTreeGenerator, LSystemTreePresets, generateTreeFromPreset, type LSystemRule, type LSystemConfig } from './trees/LSystemTreeGenerator';

// L-System Engine (new)
export {
  LSystemEngine,
  LSystemPresets,
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

// Coral Growth Algorithms (differential growth, reaction-diffusion, Laplacian growth)
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

// Coral Growth Algorithms (Phase 2: vertex-based reaction-diffusion, differential growth)
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
  getSpeciesPreset,
  getAvailableSpecies,
  generateSpeciesAttractors,
  type AttractorGeneratorFn,
  type SpeciesAttractorPreset,
} from './trees/TreeSpeciesPresets';
