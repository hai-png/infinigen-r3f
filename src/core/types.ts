/**
 * Core Shared Types — Cross-cutting type definitions used across modules.
 *
 * Promoted from src/assets/composition/types.ts (Phase C of the Overhaul Guide).
 * Any type that is used by two or more top-level modules should live here.
 *
 * @module core/types
 */

import { Vector3, Quaternion } from 'three';

// ============================================================================
// Scene Graph
// ============================================================================

/**
 * Scene graph node — central type for the composition system's object representation.
 *
 * Promoted from composition/types.ts so that core placement, constraints, and
 * composition modules can all reference it without circular dependencies.
 */
export interface SceneGraphNode {
  id: string;
  type: string;
  name: string;
  children?: SceneGraphNode[];
  parent?: SceneGraphNode;
  transform: {
    position: Vector3;
    rotation: import('three').Euler | Quaternion;
    scale: Vector3;
  };
  data?: unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}
