/**
 * Creatures module - procedural animal generators
 */

export { CreatureBase, type CreatureParams, type CreatureParameters, CreatureType } from './CreatureBase';
export { AmphibianGenerator, type AmphibianParameters } from './AmphibianGenerator';
export { BirdGenerator, type BirdParameters, type BirdSpecies } from './BirdGenerator';
export { MammalGenerator } from './MammalGenerator';
export { FishGenerator, type FishParameters, type FishSpecies } from './FishGenerator';
export { ReptileGenerator } from './ReptileGenerator';
export { InsectGenerator } from './InsectGenerator';
export { UnderwaterGenerator } from './UnderwaterGenerator';

// Consolidated generators — now canonical implementations (moved from vegetation/)
export {
  BeetleGenerator,
  generateBeetle,
  BeetleAdapter,
  type BeetleConfig,
  type BeetleParams,
  type BeetleSpecies,
} from './BeetleGenerator';
export {
  JellyfishGenerator,
  generateJellyfish,
  JellyfishAdapter,
  type JellyfishConfig,
  type JellyfishParams,
  type JellyfishVariant,
} from './JellyfishGenerator';
export {
  CrustaceanGenerator,
  generateCrustacean,
  CrustaceanAdapter,
  type CrustaceanConfig,
  type CrustaceanParams,
  type CrustaceanSpecies,
} from './CrustaceanGenerator';
export {
  DragonflyGenerator,
  generateDragonfly,
  DragonflyAdapter,
  type DragonflyConfig,
  type DragonflyParams,
} from './DragonflyGenerator';

// Body part generators
export { BodyPartGenerator } from './parts/BodyPartGenerator';
export { WingGenerator, FeatherGenerator, MembraneGenerator, type WingResult } from './parts/WingGenerator';
export { AntennaGenerator } from './parts/AntennaGenerator';
export { LegGenerator, type LegResult, type LegSubType } from './parts/LegGenerator';
export { TailGenerator } from './parts/TailGenerator';
export { EyeGenerator, type EyeResult, type PupilType } from './parts/EyeGenerator';
export { MouthGenerator, BeakGenerator, type MouthResult, type TeethType } from './parts/MouthGenerator';

// Phase 2: Head detail generators
export {
  EarGenerator,
  NoseGenerator,
  HornGenerator,
  AntlerGenerator,
  type HeadDetailResult,
  type EarType as HeadEarType,
  type EarConfig,
  type NoseType,
  type NoseConfig,
  type HornType,
  type HornConfig,
  type AntlerConfig,
  type Joint,
} from './parts/HeadDetailGenerator';

// Phase 2: Rigging system
export {
  NURBSToArmature,
  sampleJointPositionsFromProfile,
  generateAttachmentPoints,
  type RiggingJoint,
  type IKParams,
  type PartAttachment as RiggingPartAttachment,
  type IKTarget,
  type ArmatureResult,
} from './rigging/NURBSToArmature';
export {
  CreatureRiggingSystem,
  type RiggedCreature,
  type RiggingConfig,
  type PartRiggingData,
} from './rigging/CreatureRiggingSystem';

// Skeleton system
export { SkeletonBuilder, type CreatureSkeletonConfig } from './skeleton/SkeletonBuilder';

// Animation system
export { IdleAnimation, type IdleBehavior } from './animation/IdleAnimation';
export { WalkCycle, type GaitType, type WalkCycleParams } from './animation/WalkCycle';

// Behavior tree system
export {
  BehaviorTree,
  BehaviorStatus,
  BehaviorNode,
  SelectorNode,
  SequenceNode,
  RepeatNode,
  ActionNode,
  ConditionNode,
  IsThreatenedCondition,
  IsHungryCondition,
  IsTiredCondition,
  IdleAction,
  WanderAction,
  FleeAction,
  SeekAction,
  type CreatureContext,
  type BehaviorState,
  createDefaultContext,
} from './animation/BehaviorTree';

// Phase 3.2: Body plan system
export {
  BodyPlanSystem,
  type BodyPlanType,
  type LocomotionType,
  type ResolvedBodyPlan,
  type BoneChainNode,
  type PartAttachment,
  type BodyProportions,
  type ProportionRange,
} from './BodyPlanSystem';

// Phase 3.2: Part generators
export {
  HeadGenerator,
  TorsoGenerator,
  LimbGenerator,
  TailGenerator as BodyTailGenerator,
  type HeadShape,
  type PupilShape,
  type EarType as PartEarType,
  type MouthType,
  type TorsoShape,
  type FootType,
  type WingType,
  type TailShape,
} from './parts/PartGenerators';

// Phase 3.2: Skin system
export {
  CreatureSkinSystem,
  type CreatureSkinConfig,
  type SkinType,
  type PatternType,
  type ColorPalette,
} from './skin/CreatureSkinSystem';

// Phase 3.2: Locomotion system
export {
  LocomotionSystem,
  type LocomotionConfig,
  type SpeedLevel,
} from './animation/LocomotionSystem';

// Phase 3.2: Swarm system
export {
  SwarmSystem,
  type SwarmConfig,
} from './swarm/SwarmSystem';

// NURBS body system
export {
  NURBSSurface,
  findKnotSpan,
  evaluateBasis,
  evaluateBasisDerivatives,
  createBSplineSurface,
  createNURBSSurfaceFromArrays,
  NURBSBodyBuilder,
  buildCreatureBody,
  TESSELLATION_LOW,
  TESSELLATION_MEDIUM,
  TESSELLATION_HIGH,
  createBodyProfile,
  createMammalProfile,
  createReptileProfile,
  createBirdProfile,
  createFishProfile,
  createAmphibianProfile,
  getDefaultConfigForType,
  DEFAULT_BODY_PROFILE_CONFIG,
  type BodyProfileType as NURBSBodyProfileType,
  type BodyProfileConfig,
  type TessellationConfig,
  type AttachmentPoint,
  type NURBSBodyResult,
} from './nurbs';

// Genome system
export {
  type GeneValueType,
  type GeneColor,
  type CreatureGene,
  type InterpolatableAttachment,
  CreatureGenome,
  MaximumBipartiteMatching,
  GenomeInterpolator,
  AttachmentInterpolator,
  GenomeFactory,
  type SpeciesType,
  geneColorToThreeColor,
  threeColorToGeneColor,
  genomeToPlainObject,
} from './genome';
