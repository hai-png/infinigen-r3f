/**
 * Asset Objects Index
 *
 * Central export point for all procedural asset generators.
 * 
 * Note: ShelfConfig and ShelfStyle are defined in both ./storage and ./decor.
 * We keep ./storage as the primary source and exclude them from ./decor.
 */

// Furniture & Seating
export * from './seating';
export * from './tables';
export * from './beds';
export * from './storage';

// Tableware (Phase 2A)
export * from './tableware';

// Decor Items (Phase 2B) - exclude ShelfConfig and ShelfStyle (already from ./storage)
export {
  WallDecor,
  type WallDecorParams,
  WallShelfGenerator,
  // ShelfStyle and ShelfConfig excluded — already exported from ./storage
  type ShelfMaterial,
  type BracketStyle,
  BookGenerator,
  type BookConfig,
  CandleGenerator,
  type CandleConfig,
  VaseGenerator,
  type VaseConfig,
  ClockGenerator,
  type ClockConfig,
  type ClockStyle,
  type ClockMaterialType,
  type ClockFaceStyle,
  CurtainGenerator,
  type CurtainConfig,
  type CurtainStyle,
  type CurtainMaterialType,
  type CurtainPattern,
  MirrorGenerator,
  type MirrorConfig,
  type MirrorStyle,
  type MirrorFrameStyle,
  type MirrorShape,
  PictureFrameGenerator,
  type PictureFrameConfig,
  type FrameStyle,
  type FrameMaterial,
  PlantPotGenerator,
  type PlantPotConfig,
  type PotStyle,
  type PotShape,
  RugGenerator,
  type RugConfig,
  type RugStyle,
  type RugShape,
  TrinketGenerator,
  type TrinketConfig,
  type TrinketType,
  type TrinketMaterial,
} from './decor';

// Architectural Elements (Phase 2C)
export * from './architectural';

// Appliances & Bathroom Fixtures (Phase 2D)
export * from './appliances';
export * from './bathroom';

// Plant Generators (Phase 3A)
export * from './vegetation';

// Creature Generators (Phase 4A)
export * from './creatures';

// Weather & Atmospheric Effects (Phase 5)
// export * from './cloud';

// Particle Systems (Phase 5B)
// export * from './particles';

// Reptiles & Amphibians (Phase 4D)
// export * from './reptiles-amphibians';

// Birds & Avian Creatures (Phase 4E)
// export * from './birds';

// Future exports (to be implemented)
// export * from './lighting';
// export * from './mammals';

// Fruits Generator (NEW)
// export * from './fruits';

// Clothes Generator (NEW)
export * from './clothes';

// Lamp Generators (NEW)
// export * from './lamps';
// export * from './specialized-lamps';

// Outdoor Furniture (NEW)
// export * from './outdoor-furniture';

// Niche Decoratives (NEW)
// export * from './niche-decoratives';

// Articulated Objects (Physics-enabled objects with joints)
// Exclude DoorGenerator, WindowGenerator (from ./architectural) and CabinetGenerator (from ./storage) to avoid duplicate exports
export {
  type JointType,
  type JointInfo,
  type ArticulatedObjectConfig,
  type ArticulatedObjectResult,
  ArticulatedObjectBase,
  generateMJCF,
  DrawerGenerator,
  ToasterGenerator,
  RefrigeratorGenerator,
  OvenGenerator,
  MicrowaveGenerator,
  DishwasherGenerator,
  LampGenerator,
  TrashCanGenerator,
  BoxGenerator,
  FaucetGenerator,
  PepperGrinderGenerator,
  DoorHandleGenerator,
  PliersGenerator,
  CooktopGenerator,
  SoapDispenserGenerator,
  createArticulatedObject,
  getArticulatedObjectNames,
} from './articulated';
