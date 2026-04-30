/**
 * Scene Object - Core scene object representation
 * 
 * Provides the SceneObject type used throughout the system
 * for representing objects in the procedural scene.
 */

import * as THREE from 'three';

export interface SceneObject {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** The Three.js object */
  object3D: THREE.Object3D;
  /** Semantic tags */
  tags: Set<string>;
  /** Category (e.g., 'chair', 'table', 'wall') */
  category: string;
  /** Whether the object is visible */
  visible: boolean;
  /** Whether the object is locked from editing */
  locked: boolean;
  /** Parent object ID (if any) */
  parentId?: string;
  /** Child object IDs */
  children: string[];
  /** Custom properties */
  properties: Record<string, any>;
  /** Bounding box in world space */
  bounds: THREE.Box3;
}
