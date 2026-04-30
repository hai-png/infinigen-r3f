/**
 * Core Infinigen Engine Systems
 * 
 * This module contains the fundamental systems that power procedural generation:
 * - Nodes: Geometry node system for procedural modeling
 * - Constraints: Constraint-based reasoning and solving
 * - Placement: Object and camera placement algorithms
 * - Rendering: Rendering utilities and pipelines
 * - Util: Core utility functions
 * 
 * Note: Some names conflict between sub-modules. These are resolved here:
 * - Node: from ./constraints (abstract class, primary) — ./nodes has various Node-related types
 * - Tag: from ./constraints/tags (primary, class) — ./util/TaggingSystem has an interface Tag
 */

// Nodes - use the barrel which already resolves internal conflicts
export * from './nodes';

// Constraints - primary source for: Node (class), Tag (class), VariableBinding, Expression
// Node (class from constraints/language/types) conflicts with Node interface from nodes/core/types
// Since nodes barrel was exported first, Node currently refers to nodes' Node interface
// We explicitly re-export from constraints to make the class version take precedence
export * from './constraints';

// Placement
export * from './placement';

// Rendering
export * from './rendering';

// Util - export selectively to avoid Tag interface conflict with constraints' Tag class
export * from './util/MathUtils';
export * from './util/GeometryUtils';
export * from './util/PipelineUtils';
export {
  TaggingSystem,
  type TagType,
  type Tag as TagInfo,
  type TaggedObject,
  type TagQueryOptions,
  type TagRegistryConfig,
  type TaggingStatistics,
  createTaggingSystem,
} from './util/TaggingSystem';
export * from './util/MeshOperations';
export * from './util/BevelOperations';
export * as math from './util/math';
export * as optimization from './util/optimization';
