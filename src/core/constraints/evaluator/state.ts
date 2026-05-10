/**
 * Solver State Definitions
 * 
 * Ports: infinigen/core/constraints/example_solver/state_def.py
 * 
 * Core state representations for constraint solving.
 * Note: Removed bpy dependencies, uses three.js equivalents.
 */

import { Relation } from '../language/relations';
import { TagSet, SemanticsTag } from '../tags/index';
import * as THREE from 'three';
import { Polygon2D as UnifiedPolygon2D } from '../unified/UnifiedConstraintSystem';
import { computeFootprintUnified, footprintFromBoundingBox } from './FootprintComputer';

/**
 * Represents a relation between two objects in the solver state
 */
export class RelationState {
  constructor(
    public relation: Relation,
    public targetName: string,
    public childPlaneIdx?: number,
    public parentPlaneIdx?: number,
    public value?: any // Shapely MultiLineString equivalent
  ) {}
}

/**
 * Represents an object's state in the solver
 */
export class ObjectState {
  obj: THREE.Object3D | null = null;
  polygon: any = null; // Shapely Polygon equivalent (legacy)
  generator: any = null; // AssetFactory equivalent
  tags: TagSet = new TagSet();
  relations: RelationState[] = [];
  name: string = '';
  id: string = '';
  domain: any = null; // Domain reference
  
  // Rotation state (Euler angles)
  rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  
  // Scale state
  scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 };
  
  // Yaw (Y-axis rotation) convenience accessor
  yaw: number = 0;
  
  // Asset description reference
  assetDescription: any = null;
  
  // Pose state
  pose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  } = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  
  /** Direct position access alias for pose.position */
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  
  // Degrees of freedom for continuous optimization
  dofMatrixTranslation: THREE.Vector3 | null = null;
  dofRotationAxis: THREE.Vector3 | null = null;
  
  // Cached pose affect score (accessible from module-level functions)
  _poseAffectsScore: boolean | null = null;
  
  // Collision objects (FCL or three.js)
  fclObj: any = null;
  colObj: any = null;
  
  // Whether this object is active for current greedy stage
  active: boolean = true;

  constructor(name?: string, tags?: TagSet, pose?: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }) {
    if (name) this.name = name;
    if (name) this.id = name; // Default id to name
    if (tags) this.tags = tags;
    if (pose) this.pose = pose;
    this.dofMatrixTranslation = new THREE.Vector3();
    this.dofRotationAxis = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Check for tag contradictions and negated relations
   */
  validate(): void {
    // Check for contradictory tags (e.g., both "Chair" and "Table")
    const tagList = this.tags.toArray();
    const semanticTags = tagList.filter(t => {
      const str = t.toString();
      return typeof str === 'string' && !str.startsWith('!');
    });
    
    // Simple contradiction check: ensure no duplicate positive semantic tags
    const uniqueSemanticTags = new Set(semanticTags);
    if (uniqueSemanticTags.size !== semanticTags.length) {
      const duplicates = semanticTags.filter(
        (tag, index) => semanticTags.indexOf(tag) !== index
      );
      throw new Error(`ObjectState has contradictory tags: ${duplicates.join(', ')}`);
    }
    
    const hasNegated = this.relations.some(r => r.relation.constructor.name === 'NegatedRelation');
    if (hasNegated) {
      throw new Error('ObjectState cannot have negated relations');
    }
  }

  /**
   * Get the bounding box center of this object
   */
  getBBoxCenter(): THREE.Vector3 {
    if (this.obj) {
      const box = new THREE.Box3().setFromObject(this.obj);
      return box.getCenter(new THREE.Vector3());
    }
    // Fallback to position
    return new THREE.Vector3(this.position.x, this.position.y, this.position.z);
  }

  /**
   * Compute the 2D footprint polygon from the object's mesh.
   * Projects mesh vertices onto the XZ plane and computes the convex hull.
   * Updates both the legacy `polygon` field and returns the unified Polygon2D.
   */
  computeFootprint(): UnifiedPolygon2D | null {
    if (this.obj instanceof THREE.Mesh && this.obj.geometry) {
      try {
        const footprint = computeFootprintUnified(this.obj);
        this.polygon = footprint; // Update legacy field
        return footprint;
      } catch {
        // Footprint computation failed — fall back to bounding box
      }
    }

    // Fallback: compute from bounding box
    if (this.obj) {
      const box = new THREE.Box3().setFromObject(this.obj);
      if (!box.isEmpty()) {
        const footprint = footprintFromBoundingBox(box);
        this.polygon = footprint;
        return footprint;
      }
    }

    // Final fallback: use position as a point footprint
    const box = new THREE.Box3(
      new THREE.Vector3(this.position.x - 0.5, this.position.y - 0.5, this.position.z - 0.5),
      new THREE.Vector3(this.position.x + 0.5, this.position.y + 0.5, this.position.z + 0.5)
    );
    const footprint = footprintFromBoundingBox(box);
    this.polygon = footprint;
    return footprint;
  }

  toString(): string {
    const objName = this.obj?.name ?? null;
    return `ObjectState(obj.name=${objName}, polygon=${this.polygon}, tags=${this.tags.toString()}, relations=${this.relations.length})`;
  }
}

/**
 * BVH Cache entry
 */
export interface BVHCacheEntry {
  bvh: any; // THREE.MeshBVH or similar
  matrix: THREE.Matrix4;
}

/**
 * Main solver state container
 */
export class State {
  objects: Map<string, ObjectState> = new Map();
  problem?: any; // Problem reference for moves
  trimeshScene: any = null; // Trimesh scene equivalent
  graphs: any[] = []; // RoomGraph array
  bvhCache: Map<[string[], Set<any>], BVHCacheEntry> = new Map();
  planes: any = null; // Planes object

  constructor(
    objects?: Map<string, ObjectState>,
    problem?: any,
    bvhCache?: Map<[string[], Set<any>], BVHCacheEntry>
  ) {
    if (objects) {
      this.objects = objects;
    }
    this.problem = problem;
    if (bvhCache) {
      this.bvhCache = bvhCache;
    }
  }

  /**
   * Get object by key
   */
  get(key: string): ObjectState | undefined {
    return this.objects.get(key);
  }

  /**
   * Set object
   */
  set(key: string, value: ObjectState): void {
    this.objects.set(key, value);
  }

  /**
   * Delete object
   */
  delete(key: string): boolean {
    return this.objects.delete(key);
  }

  /**
   * Clear all objects
   */
  clear(): void {
    this.objects.clear();
  }

  /**
   * Get number of objects
   */
  get size(): number {
    return this.objects.size;
  }

  /**
   * Get an ObjectState by name/key - alias for get()
   */
  getObject(key: string): ObjectState | undefined {
    return this.objects.get(key);
  }

  /**
   * Get all active object names
   */
  getActiveObjectNames(): string[] {
    const result: string[] = [];
    for (const [name, obj] of this.objects.entries()) {
      if (obj.active) {
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Convert to JSON-serializable format
   */
  toJSON(): any {
    return {
      objs: Array.from(this.objects.entries()).map(([name, obj]) => ({
        name,
        tags: obj.tags.toArray().map(t => t.toString()),
        active: obj.active,
        relations: obj.relations.map(r => ({
          relation: r.relation.constructor.name,
          targetName: r.targetName,
          childPlaneIdx: r.childPlaneIdx,
          parentPlaneIdx: r.parentPlaneIdx
        }))
      })),
      graphCount: this.graphs.length,
      bvhCacheSize: this.bvhCache.size
    };
  }

  /**
   * Create state from JSON
   */
  static fromJSON(data: any): State {
    const state = new State();
    
    for (const objData of data.objs) {
      const objState = new ObjectState();
      objState.tags = new TagSet(new Set(objData.tags.map((t: string) => new SemanticsTag(t))));
      objState.active = objData.active;
      
      // Reconstruct relations with proper relation objects
      objState.relations = objData.relations.map((r: any) => {
        // Create a basic relation object based on type name
        const relationType = r.relation;
        
        // Create a minimal relation object that can be evaluated
        let relation: Relation;
        switch (relationType) {
          case 'Touching':
            relation = { type: 'Touching' } as any;
            break;
          case 'SupportedBy':
            relation = { type: 'SupportedBy' } as any;
            break;
          case 'CoPlanar':
            relation = { type: 'CoPlanar' } as any;
            break;
          case 'StableAgainst':
            relation = { type: 'StableAgainst' } as any;
            break;
          case 'Facing':
            relation = { type: 'Facing' } as any;
            break;
          case 'Between':
            relation = { type: 'Between' } as any;
            break;
          case 'AccessibleFrom':
            relation = { type: 'AccessibleFrom' } as any;
            break;
          case 'ReachableFrom':
            relation = { type: 'ReachableFrom' } as any;
            break;
          case 'InFrontOf':
            relation = { type: 'InFrontOf' } as any;
            break;
          case 'Aligned':
            relation = { type: 'Aligned' } as any;
            break;
          case 'Hidden':
            relation = { type: 'Hidden' } as any;
            break;
          case 'Visible':
            relation = { type: 'Visible' } as any;
            break;
          case 'Grouped':
            relation = { type: 'Grouped' } as any;
            break;
          case 'Distributed':
            relation = { type: 'Distributed' } as any;
            break;
          case 'Coverage':
            relation = { type: 'Coverage' } as any;
            break;
          case 'SupportCoverage':
            relation = { type: 'SupportCoverage' } as any;
            break;
          case 'Stability':
            relation = { type: 'Stability' } as any;
            break;
          case 'Containment':
            relation = { type: 'Containment' } as any;
            break;
          case 'Proximity':
            relation = { type: 'Proximity' } as any;
            break;
          default:
            // Fallback for unknown relation types
            relation = { type: relationType } as any;
        }
        
        return new RelationState(
          relation,
          r.targetName,
          r.childPlaneIdx,
          r.parentPlaneIdx
        );
      });
      
      state.objects.set(objData.name, objState);
    }
    
    return state;
  }
}

/**
 * Check if an object's pose affects the constraint score
 * This is used to optimize solving by skipping objects that don't affect violations
 */
export function poseAffectsScore(state: State, objName: string): boolean {
  const obj = state.objects.get(objName);
  if (!obj) return false;
  
  if ((obj as any)._poseAffectsScore !== null) {
    return (obj as any)._poseAffectsScore;
  }
  
  // An object's pose affects the score if:
  // 1. It has relations that depend on position/orientation
  // 2. It's involved in geometric constraints
  
  const poseDependentRelations = [
    'Touching', 'SupportedBy', 'CoPlanar', 'StableAgainst', 
    'Facing', 'Between', 'InFrontOf', 'Aligned', 
    'Hidden', 'Visible', 'Containment', 'Proximity'
  ];
  
  for (const rel of obj.relations) {
    const relType = rel.relation.constructor.name;
    if (poseDependentRelations.includes(relType)) {
      (obj as any)._poseAffectsScore = true;
      return true;
    }
  }
  
  // Also check if any other object has a relation targeting this object
  for (const [otherName, otherObj] of state.objects.entries()) {
    if (otherName === objName) continue;
    
    for (const rel of otherObj.relations) {
      if (rel.targetName === objName) {
        const relType = rel.relation.constructor.name;
        if (poseDependentRelations.includes(relType)) {
          (obj as any)._poseAffectsScore = true;
          return true;
        }
      }
    }
  }
  
  // If no pose-dependent relations found, pose doesn't affect score
  (obj as any)._poseAffectsScore = false;
  return false;
}
