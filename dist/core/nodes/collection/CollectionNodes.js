/**
 * Collection Nodes Module
 * Collection instancing, object information, and hierarchy access
 * Ported from Blender Geometry Nodes
 */
import { Object3D, Group } from 'three';
export class CollectionInfoNode {
    constructor(inputs = {}) {
        this.category = 'collection';
        this.nodeType = 'collection_info';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            geometry: new Group(),
            instances: [],
            count: 0,
        };
    }
    execute() {
        const collection = this.inputs.collection;
        if (!collection) {
            return this.outputs;
        }
        if (this.inputs.instance ?? true) {
            // Create instances of collection objects
            const instances = [];
            collection.children.forEach((child) => {
                const instance = child.clone();
                instances.push(instance);
            });
            this.outputs.instances = instances;
            this.outputs.count = instances.length;
            const group = new Group();
            instances.forEach((inst) => group.add(inst));
            this.outputs.geometry = group;
        }
        else {
            // Direct children access
            this.outputs.geometry = collection;
            this.outputs.instances = [...collection.children];
            this.outputs.count = collection.children.length;
        }
        return this.outputs;
    }
}
export class ObjectInfoNode {
    constructor(inputs = {}) {
        this.category = 'collection';
        this.nodeType = 'object_info';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            geometry: new Object3D(),
            pivot: [0, 0, 0],
            boundingBoxMin: [0, 0, 0],
            boundingBoxMax: [0, 0, 0],
        };
    }
    execute() {
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
export class InstanceOnPointsNode {
    constructor(inputs = {}) {
        this.category = 'collection';
        this.nodeType = 'instance_on_points';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            instances: [],
            count: 0,
        };
    }
    execute() {
        const points = this.inputs.points || [];
        const instance = this.inputs.instance;
        if (!instance || points.length === 0) {
            return this.outputs;
        }
        const instances = [];
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
export class DuplicateElementsNode {
    constructor(inputs = {}) {
        this.category = 'collection';
        this.nodeType = 'duplicate_elements';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            geometry: new Object3D(),
            count: 0,
        };
    }
    execute() {
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
export class ChildrenOfSceneNode {
    constructor(inputs = {}) {
        this.category = 'collection';
        this.nodeType = 'children_of_scene';
        this.domain = 'point';
        this.inputs = inputs;
        this.outputs = {
            children: [],
            count: 0,
        };
    }
    execute() {
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
export function createCollectionInfoNode(inputs) {
    return new CollectionInfoNode(inputs);
}
export function createObjectInfoNode(inputs) {
    return new ObjectInfoNode(inputs);
}
export function createInstanceOnPointsNode(inputs) {
    return new InstanceOnPointsNode(inputs);
}
export function createDuplicateElementsNode(inputs) {
    return new DuplicateElementsNode(inputs);
}
export function createChildrenOfSceneNode(inputs) {
    return new ChildrenOfSceneNode(inputs);
}
//# sourceMappingURL=CollectionNodes.js.map