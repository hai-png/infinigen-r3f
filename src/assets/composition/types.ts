/**
 * Composition Types — Shared type definitions for the composition system.
 *
 * Extracted from CompositionEngine.ts (1462-line god class → thin orchestrator).
 * All public interfaces, enums, and value types used across composition modules
 * are defined here.
 *
 * SceneGraphNode has been promoted to @/core/types so that core placement,
 * constraints, and composition modules can reference it without circular deps.
 *
 * @module composition/types
 */

import { Vector3, Quaternion, Box3, Sphere } from 'three';
import type { Object3D } from 'three';

// Import SceneGraphNode from its canonical location and re-export
import type { SceneGraphNode } from '@/core/types';
export type { SceneGraphNode } from '@/core/types';

// ============================================================================
// Enums
// ============================================================================

/**
 * Spatial relationship types between objects
 */
export enum SpatialRelation {
  ADJACENT = 'adjacent',
  ALIGNED = 'aligned',
  CENTERED = 'centered',
  DISTRIBUTED = 'distributed',
  HIERARCHICAL = 'hierarchical',
  SYMMETRICAL = 'symmetrical',
  RADIAL = 'radial',
  GRID = 'grid',
  FOLLOW_PATH = 'follow_path',
}

/**
 * Aesthetic principle types
 */
export enum AestheticPrinciple {
  BALANCE = 'balance',
  RHYTHM = 'rhythm',
  EMPHASIS = 'emphasis',
  PROPORTION = 'proportion',
  HARMONY = 'harmony',
  VARIETY = 'variety',
  UNITY = 'unity',
}

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Composition rule definition
 */
export interface CompositionRule {
  id: string;
  name: string;
  description: string;
  relation: SpatialRelation;
  principles: AestheticPrinciple[];
  priority: number; // 0-100, higher = more important
  parameters: Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any -- dynamic rule params
  validator: (context: CompositionContext) => boolean;
  applier: (context: CompositionContext) => CompositionResult;
}

/**
 * Constraint definition for object placement
 */
export interface CompositionConstraint {
  id: string;
  type: 'distance' | 'angle' | 'visibility' | 'collision' | 'semantic';
  source?: string; // Node ID
  target?: string; // Node ID or group
  parameters: {
    min?: number;
    max?: number;
    axis?: 'x' | 'y' | 'z' | 'any';
    required?: boolean;
    semantic?: string; // e.g., "must face camera", "must be on ground"
  };
}

/**
 * Composition template for reusable layouts
 */
export interface CompositionTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  objects: TemplateObject[];
  rules: string[]; // Rule IDs to apply
  constraints: CompositionConstraint[];
  variables: TemplateVariable[];
}

/**
 * Object definition within a template
 */
export interface TemplateObject {
  id: string;
  category: string;
  variant?: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  parent?: string; // Parent object ID in template
  metadata?: Record<string, unknown>;
}

/**
 * Variable for template customization
 */
export interface TemplateVariable {
  name: string;
  type: 'number' | 'vector3' | 'quaternion' | 'string' | 'boolean';
  defaultValue: unknown;
  min?: number;
  max?: number;
  options?: string[];
}

/**
 * Context for composition evaluation
 */
export interface CompositionContext {
  nodes: Map<string, SceneGraphNode>;
  rootNode: Object3D;
  bounds: Box3;
  center: Vector3;
  up: Vector3;
  forward: Vector3;
  cameraPosition?: Vector3;
  lightDirections?: Vector3[];
  groundLevel: number;
  existingObjects: Array<{
    nodeId: string;
    bounds: Box3;
    center: Vector3;
    category: string;
  }>;
  variables?: Record<string, unknown>;
}

/**
 * Result of applying a composition rule
 */
export interface CompositionResult {
  success: boolean;
  transformations: Array<{
    nodeId: string;
    position?: Vector3;
    rotation?: Quaternion;
    scale?: Vector3;
  }>;
  conflicts: Array<CompositionConflict>;
  score: number; // 0-1 quality score
  metrics: CompositionMetrics;
}

/**
 * A conflict reported during composition validation.
 */
export interface CompositionConflict {
  ruleId: string;
  constraintId: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Metrics for evaluating composition quality
 */
export interface CompositionMetrics {
  balanceScore: number;
  rhythmScore: number;
  proportionScore: number;
  harmonyScore: number;
  overallScore: number;
  details: {
    centerOfMass: Vector3;
    boundingVolume: Sphere;
    densityDistribution: number[];
    symmetryAxis?: Vector3;
    goldenRatioDeviations: number[];
  };
}
