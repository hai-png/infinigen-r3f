/**
 * Collection Nodes Module
 * Collection instancing, object information, and hierarchy access
 * Ported from Blender Geometry Nodes
 */

import { Object3D, Group } from 'three';
import type { NodeBase, AttributeDomain } from '../core/types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CollectionNodeBase extends NodeBase {
  category: 'collection';
}

// ----------------------------------------------------------------------------
// Collection Info Node
// ----------------------------------------------------------------------------

export interface CollectionInfoInputs {
  collection?: Group;
  instance?: boolean;
  resetChildren?: boolean;
  separator?: string;
}

export interface CollectionInfoOutputs {
  geometry: Group;
  instances: Object3D[];
  count: number;
}

export class CollectionInfoNode implements CollectionNodeBase {
  readonly category = 'collection';
  readonly nodeType = 'collection_info';
  readonly inputs: CollectionInfoInputs;
  readonly outputs: CollectionInfoOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: CollectionInfoInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      geometry: new Group(),
      instances: [],
      count: 0,
    };
  }

  execute(): CollectionInfoOutputs {
    const collection = this.inputs.collection;
    
    if (!collection) {
      return this.outputs;
    }

    if (this.inputs.instance ?? true) {
      // Create instances of collection objects
      const instances: Object3D[] = [];
      collection.children.forEach((child) => {
        const instance = child.clone();
        instances.push(instance);
      });
      
      this.outputs.instances = instances;
      this.outputs.count = instances.length;
      
      const group = new Group();
      instances.forEach((inst) => group.add(inst));
      this.outputs.geometry = group;
    } else {
      // Direct children access
      this.outputs.geometry = collection;
      this.outputs.instances = [...collection.children];
      this.outputs.count = collection.children.length;
    }

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Object Info Node
// ----------------------------------------------------------------------------

export interface ObjectInfoInputs {
  object?: Object3D;
  asInstance?: boolean;
}

export interface ObjectInfoOutputs {
  geometry: Object3D;
  pivot: number[];
  boundingBoxMin: number[];
  boundingBoxMax: number[];
}

export class ObjectInfoNode implements CollectionNodeBase {
  readonly category = 'collection';
  readonly nodeType = 'object_info';
  readonly inputs: ObjectInfoInputs;
  readonly outputs: ObjectInfoOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ObjectInfoInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      geometry: new Object3D(),
      pivot: [0, 0, 0],
      boundingBoxMin: [0, 0, 0],
      boundingBoxMax: [0, 0, 0],
    };
  }

  execute(): ObjectInfoOutputs {
    const object = this.inputs.object;
    
    if (!object) {
      return this.outputs;
    }

    this.outputs.geometry = this.inputs.asInstance ?? false ? object.clone() : object;
    this.outputs.pivot = [object.position.x, object.position.y, object.position.z];

    // Calculate bounding box (simplified - would need mesh for accurate bounds)
    this.outputs.boundingBoxMin = [-1, -1, -1];
    this.outputs.boundingBoxMax = [1, 1, 1];

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Instance on Points Node
// ----------------------------------------------------------------------------

export interface InstanceOnPointsInputs {
  points?: number[][];
  instance?: Object3D;
  scale?: number[];
  rotation?: number[];
  pickRandom?: boolean;
}

export interface InstanceOnPointsOutputs {
  instances: Object3D[];
  count: number;
}

export class InstanceOnPointsNode implements CollectionNodeBase {
  readonly category = 'collection';
  readonly nodeType = 'instance_on_points';
  readonly inputs: InstanceOnPointsInputs;
  readonly outputs: InstanceOnPointsOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: InstanceOnPointsInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      instances: [],
      count: 0,
    };
  }

  execute(): InstanceOnPointsOutputs {
    const points = this.inputs.points || [];
    const instance = this.inputs.instance;
    
    if (!instance || points.length === 0) {
      return this.outputs;
    }

    const instances: Object3D[] = [];
    const scale = this.inputs.scale || [1, 1, 1];
    const rotation = this.inputs.rotation || [0, 0, 0];

    points.forEach((point, index) => {
      const inst = instance.clone();
      inst.position.set(point[0], point[1], point[2]);
      
      if (scale.length === 3) {
        inst.scale.set(scale[0], scale[1], scale[2]);
      }
      
      if (rotation.length === 3) {
        inst.rotation.set(rotation[0], rotation[1], rotation[2]);
      }
      
      instances.push(inst);
    });

    this.outputs.instances = instances;
    this.outputs.count = instances.length;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Duplicate Elements Node
// ----------------------------------------------------------------------------

export interface DuplicateElementsInputs {
  geometry?: Object3D;
  duplicates?: number;
  startIndex?: number;
}

export interface DuplicateElementsOutputs {
  geometry: Object3D;
  count: number;
}

export class DuplicateElementsNode implements CollectionNodeBase {
  readonly category = 'collection';
  readonly nodeType = 'duplicate_elements';
  readonly inputs: DuplicateElementsInputs;
  readonly outputs: DuplicateElementsOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: DuplicateElementsInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      geometry: new Object3D(),
      count: 0,
    };
  }

  execute(): DuplicateElementsOutputs {
    const geometry = this.inputs.geometry;
    const duplicates = this.inputs.duplicates ?? 1;
    
    if (!geometry) {
      return this.outputs;
    }

    const group = new Group();
    group.add(geometry);

    for (let i = 0; i < duplicates; i++) {
      const clone = geometry.clone();
      group.add(clone);
    }

    this.outputs.geometry = group;
    this.outputs.count = duplicates + 1;

    return this.outputs;
  }
}

// ----------------------------------------------------------------------------
// Children of Scene Node
// ----------------------------------------------------------------------------

export interface ChildrenOfSceneInputs {
  scene?: Group;
}

export interface ChildrenOfSceneOutputs {
  children: Object3D[];
  count: number;
}

export class ChildrenOfSceneNode implements CollectionNodeBase {
  readonly category = 'collection';
  readonly nodeType = 'children_of_scene';
  readonly inputs: ChildrenOfSceneInputs;
  readonly outputs: ChildrenOfSceneOutputs;
  readonly domain: AttributeDomain = 'point';

  constructor(inputs: ChildrenOfSceneInputs = {}) {
    this.inputs = inputs;
    this.outputs = {
      children: [],
      count: 0,
    };
  }

  execute(): ChildrenOfSceneOutputs {
    const scene = this.inputs.scene;
    
    if (!scene) {
      return this.outputs;
    }

    this.outputs.children = [...scene.children];
    this.outputs.count = scene.children.length;

    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCollectionInfoNode(inputs?: CollectionInfoInputs): CollectionInfoNode {
  return new CollectionInfoNode(inputs);
}

export function createObjectInfoNode(inputs?: ObjectInfoInputs): ObjectInfoNode {
  return new ObjectInfoNode(inputs);
}

export function createInstanceOnPointsNode(inputs?: InstanceOnPointsInputs): InstanceOnPointsNode {
  return new InstanceOnPointsNode(inputs);
}

export function createDuplicateElementsNode(inputs?: DuplicateElementsInputs): DuplicateElementsNode {
  return new DuplicateElementsNode(inputs);
}

export function createChildrenOfSceneNode(inputs?: ChildrenOfSceneInputs): ChildrenOfSceneNode {
  return new ChildrenOfSceneNode(inputs);
}

