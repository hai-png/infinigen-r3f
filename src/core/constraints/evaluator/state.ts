/**
 * Solver State Definitions
 * 
 * Ports: infinigen/core/constraints/example_solver/state_def.py
 * 
 * Core state representations for constraint solving.
 * Note: Removed bpy dependencies, uses three.js equivalents.
 */

import { Relation } from '../language/relations';
import { TagSet } from '../tags/index';
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
    // Check for contradictory tags (e.g., both "Chair" and "Table")
    const tagList = Array.from(this.tags);
    const semanticTags = tagList.filter(t => typeof t === 'string' && !t.startsWith('!'));
    
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
      
      state.objs.set(objData.name, objState);
    }
    
    return state;
  }
}

/**
 * Check if an object's pose affects the constraint score
 * This is used to optimize solving by skipping objects that don't affect violations
 */
export function poseAffectsScore(state: State, objName: string): boolean {
  const obj = state.objs.get(objName);
  if (!obj) return false;
  
  if (obj._poseAffectsScore !== null) {
    return obj._poseAffectsScore;
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
      obj._poseAffectsScore = true;
      return true;
    }
  }
  
  // Also check if any other object has a relation targeting this object
  for (const [otherName, otherObj] of state.objs.entries()) {
    if (otherName === objName) continue;
    
    for (const rel of otherObj.relations) {
      if (rel.targetName === objName) {
        const relType = rel.relation.constructor.name;
        if (poseDependentRelations.includes(relType)) {
          obj._poseAffectsScore = true;
          return true;
        }
      }
    }
  }
  
  // If no pose-dependent relations found, pose doesn't affect score
  obj._poseAffectsScore = false;
  return false;
}
