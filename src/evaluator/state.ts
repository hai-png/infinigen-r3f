/**
 * Solver State Definitions
 * 
 * Ports: infinigen/core/constraints/example_solver/state_def.py
 * 
 * Core state representations for constraint solving.
 * Note: Removed bpy dependencies, uses three.js equivalents.
 */

import { Relation } from '../constraint-language/relations.js';
import { TagSet } from '../tags/index.js';
import * as THREE from 'three';

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
  polygon: any = null; // Shapely Polygon equivalent
  generator: any = null; // AssetFactory equivalent
  tags: TagSet = new Set();
  relations: RelationState[] = [];
  
  // Degrees of freedom for continuous optimization
  dofMatrixTranslation: THREE.Vector3 | null = null;
  dofRotationAxis: THREE.Vector3 | null = null;
  
  // Cached pose affect score
  private _poseAffectsScore: boolean | null = null;
  
  // Collision objects (FCL or three.js)
  fclObj: any = null;
  colObj: any = null;
  
  // Whether this object is active for current greedy stage
  active: boolean = true;

  constructor() {
    this.dofMatrixTranslation = new THREE.Vector3();
    this.dofRotationAxis = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Check for tag contradictions and negated relations
   */
  validate(): void {
    // TODO: Implement contradiction check
    // assert(!contradiction(this.tags));
    
    const hasNegated = this.relations.some(r => r.relation.constructor.name === 'NegatedRelation');
    if (hasNegated) {
      throw new Error('ObjectState cannot have negated relations');
    }
  }

  toString(): string {
    const objName = this.obj?.name ?? null;
    return `ObjectState(obj.name=${objName}, polygon=${this.polygon}, tags=${Array.from(this.tags)}, relations=${this.relations.length})`;
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
  objs: Map<string, ObjectState> = new Map();
  trimeshScene: any = null; // Trimesh scene equivalent
  graphs: any[] = []; // RoomGraph array
  bvhCache: Map<[string[], Set<any>], BVHCacheEntry> = new Map();
  planes: any = null; // Planes object

  /**
   * Get object by key
   */
  get(key: string): ObjectState | undefined {
    return this.objs.get(key);
  }

  /**
   * Set object
   */
  set(key: string, value: ObjectState): void {
    this.objs.set(key, value);
  }

  /**
   * Delete object
   */
  delete(key: string): boolean {
    return this.objs.delete(key);
  }

  /**
   * Get number of objects
   */
  get size(): number {
    return this.objs.size;
  }

  /**
   * Get all active object names
   */
  getActiveObjectNames(): string[] {
    const result: string[] = [];
    for (const [name, obj] of this.objs.entries()) {
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
      objs: Array.from(this.objs.entries()).map(([name, obj]) => ({
        name,
        tags: Array.from(obj.tags),
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
      objState.tags = new Set(objData.tags);
      objState.active = objData.active;
      objState.relations = objData.relations.map((r: any) => 
        new RelationState(
          {} as Relation, // TODO: Reconstruct relation
          r.targetName,
          r.childPlaneIdx,
          r.parentPlaneIdx
        )
      );
      
      state.objs.set(objData.name, objState);
    }
    
    return state;
  }
}

/**
 * Pose affects score cache
 */
export function poseAffectsScore(state: State, objName: string): boolean {
  const obj = state.objs.get(objName);
  if (!obj) return false;
  
  if (obj._poseAffectsScore !== null) {
    return obj._poseAffectsScore;
  }
  
  // TODO: Implement actual logic
  // For now, assume pose always affects score
  obj._poseAffectsScore = true;
  return true;
}
