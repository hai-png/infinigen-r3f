/**
 * Infinigen R3F - Main Entry Point
 * 
 * A complete TypeScript port of Infinigen's constraint-based procedural generation system
 * for React Three Fiber. This library enables real-time constraint-based scene composition
 * in the browser.
 * 
 * @packageDocumentation
 */

// Core Constraint Language
export * from './constraint-language/index.js';

// Tag System
export * from './tags/index.js';

// Reasoning Engine
export * from './reasoning/index.js';

// Solver Core
export * from './solver/index.js';

// Math Utilities
export * from './math/index.js';

// Placement Algorithms
export * from './placement/index.js';

// Constraint Evaluator (NEW - Sprint 1)
export * from './evaluator/index.js';

// Room Solver (NEW - Sprint 2)
export * from './room-solver/index.js';

// SIM Module - Physics & Kinematics (NEW - Sprint 3)
export * from './sim/index.js';

// Hybrid Bridge (NEW - Sprint 4)
export * from './bridge/index.js';

// Room Decoration System (NEW - Sprint 5)
export * from './decorate/index.js';

// Animation Policy System (NEW - Sprint 6)
export * from './animation/index.js';

// Shared Types
export * from './types.js';

// Re-export commonly used types
export type {
  Node,
  Variable,
  Domain,
  ObjectSetDomain,
  NumericDomain,
  PoseDomain,
  BBoxDomain,
  BooleanDomain
} from './constraint-language/types.js';

export type {
  Relation,
  AnyRelation,
  Touching,
  SupportedBy,
  CoPlanar,
  StableAgainst,
  Facing,
  Between,
  AccessibleFrom,
  ReachableFrom,
  InFrontOf,
  Aligned,
  Hidden,
  Visible,
  Grouped,
  Distributed,
  Coverage,
  SupportCoverage,
  Stability,
  Containment,
  Proximity
} from './constraint-language/relations.js';

export type {
  Tag,
  TagSet,
  SemanticsTag,
  MaterialTag,
  SurfaceTag,
  RoomTag,
  FunctionTag,
  SizeTag,
  StyleTag
} from './tags/index.js';

export type {
  Move,
  SolverState,
  SimulatedAnnealingSolver,
  GreedySolver
} from './solver/index.js';

export type { BBox } from './math/index.js';

export type {
  PathFinder,
  DensityFunction
} from './placement/index.js';
