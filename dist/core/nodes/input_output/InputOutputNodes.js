/**
 * Input/Output Nodes for Infinigen R3F
 *
 * Provides nodes for managing data flow, object references, and collection operations.
 * Based on Blender Geometry Nodes input/output system.
 *
 * @module nodes/input_output
 */
import * as THREE from 'three';
import { SocketType } from '../core/types';
export const ValueNode = {
    name: 'Value',
    category: 'Input/Output',
    description: 'Basic value input for various data types',
    inputs: [],
    outputs: [
        { name: 'Value', type: SocketType.VALUE }
    ],
    defaultData: {
        valueType: SocketType.FLOAT,
        defaultValue: 0
    },
    execute: (geometry, data, inputs, context) => {
        return { Value: data.defaultValue };
    }
};
export const IntegerNode = {
    name: 'Integer',
    category: 'Input/Output',
    description: 'Integer value input',
    inputs: [],
    outputs: [
        { name: 'Integer', type: SocketType.INT }
    ],
    defaultData: {
        value: 0
    },
    execute: (geometry, data, inputs, context) => {
        return { Integer: Math.round(data.value) };
    }
};
export const FloatNode = {
    name: 'Float',
    category: 'Input/Output',
    description: 'Floating point value input',
    inputs: [],
    outputs: [
        { name: 'Value', type: SocketType.FLOAT }
    ],
    defaultData: {
        value: 0.0,
        step: 0.01
    },
    execute: (geometry, data, inputs, context) => {
        return { Value: data.value };
    }
};
export const VectorNode = {
    name: 'Vector',
    category: 'Input/Output',
    description: '3D vector input',
    inputs: [],
    outputs: [
        { name: 'Vector', type: SocketType.VECTOR }
    ],
    defaultData: {
        value: new THREE.Vector3(0, 0, 0)
    },
    execute: (geometry, data, inputs, context) => {
        return { Vector: data.value.clone() };
    }
};
export const RotationNode = {
    name: 'Rotation',
    category: 'Input/Output',
    description: 'Euler rotation input',
    inputs: [],
    outputs: [
        { name: 'Rotation', type: SocketType.ROTATION }
    ],
    defaultData: {
        rotation: new THREE.Euler(0, 0, 0, 'XYZ')
    },
    execute: (geometry, data, inputs, context) => {
        return { Rotation: data.rotation.clone() };
    }
};
export const ScaleNode = {
    name: 'Scale',
    category: 'Input/Output',
    description: 'Scale factor input',
    inputs: [],
    outputs: [
        { name: 'Scale', type: SocketType.VECTOR }
    ],
    defaultData: {
        scale: 1.0,
        uniform: true
    },
    execute: (geometry, data, inputs, context) => {
        if (data.uniform && typeof data.scale === 'number') {
            return { Scale: new THREE.Vector3(data.scale, data.scale, data.scale) };
        }
        else if (data.scale instanceof THREE.Vector3) {
            return { Scale: data.scale.clone() };
        }
        else {
            return { Scale: new THREE.Vector3(data.scale, data.scale, data.scale) };
        }
    }
};
export const BooleanNode = {
    name: 'Boolean',
    category: 'Input/Output',
    description: 'Boolean value input',
    inputs: [],
    outputs: [
        { name: 'Boolean', type: SocketType.BOOLEAN }
    ],
    defaultData: {
        value: false
    },
    execute: (geometry, data, inputs, context) => {
        return { Boolean: data.value };
    }
};
export const ColorNode = {
    name: 'Color',
    category: 'Input/Output',
    description: 'RGB color input',
    inputs: [],
    outputs: [
        { name: 'Color', type: SocketType.COLOR }
    ],
    defaultData: {
        color: new THREE.Color(1, 1, 1),
        alpha: 1.0
    },
    execute: (geometry, data, inputs, context) => {
        return { Color: data.color.clone() };
    }
};
export const StringNode = {
    name: 'String',
    category: 'Input/Output',
    description: 'Text string input',
    inputs: [],
    outputs: [
        { name: 'String', type: SocketType.STRING }
    ],
    defaultData: {
        value: ''
    },
    execute: (geometry, data, inputs, context) => {
        return { String: data.value };
    }
};
export const ObjectInfoNode = {
    name: 'Object Info',
    category: 'Input/Output',
    description: 'Get information about a scene object',
    inputs: [
        { name: 'Object', type: SocketType.OBJECT, optional: true }
    ],
    outputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY },
        { name: 'Transform', type: SocketType.MATRIX },
        { name: 'Location', type: SocketType.VECTOR },
        { name: 'Rotation', type: SocketType.ROTATION },
        { name: 'Scale', type: SocketType.VECTOR },
        { name: 'Object Empty', type: SocketType.OBJECT }
    ],
    defaultData: {
        objectRef: null,
        transformSpace: 'world',
        separateChildren: false
    },
    execute: (geometry, data, inputs, context) => {
        const objRef = inputs.Object || data.objectRef;
        if (!objRef) {
            return {
                Geometry: geometry,
                Transform: new THREE.Matrix4(),
                Location: new THREE.Vector3(),
                Rotation: new THREE.Euler(),
                Scale: new THREE.Vector3(1, 1, 1),
                'Object Empty': null
            };
        }
        const sceneObject = context.scene?.getObjectById(objRef) || context.scene?.getObjectByName(objRef);
        if (!sceneObject) {
            console.warn(`Object Info: Object "${objRef}" not found`);
            return {
                Geometry: geometry,
                Transform: new THREE.Matrix4(),
                Location: new THREE.Vector3(),
                Rotation: new THREE.Euler(),
                Scale: new THREE.Vector3(1, 1, 1),
                'Object Empty': null
            };
        }
        const threeObj = sceneObject.threeObject;
        const transform = data.transformSpace === 'world'
            ? threeObj.matrixWorld
            : threeObj.matrix;
        const location = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();
        transform.decompose(location, rotation, scale);
        return {
            Geometry: sceneObject.geometry || geometry,
            Transform: transform.clone(),
            Location: location,
            Rotation: rotation,
            Scale: scale,
            'Object Empty': sceneObject
        };
    }
};
export const CollectionInfoNode = {
    name: 'Collection Info',
    category: 'Input/Output',
    description: 'Get objects from a collection',
    inputs: [
        { name: 'Collection', type: SocketType.COLLECTION, optional: true }
    ],
    outputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY },
        { name: 'Instances', type: SocketType.INSTANCES }
    ],
    defaultData: {
        collectionRef: null,
        instanceChildren: true
    },
    execute: (geometry, data, inputs, context) => {
        const collectionRef = inputs.Collection || data.collectionRef;
        if (!collectionRef) {
            return {
                Geometry: geometry,
                Instances: []
            };
        }
        const collection = context.scene?.getCollection(collectionRef);
        if (!collection) {
            console.warn(`Collection Info: Collection "${collectionRef}" not found`);
            return {
                Geometry: geometry,
                Instances: []
            };
        }
        const instances = collection.objects.map(obj => ({
            object: obj,
            transform: obj.threeObject.matrixWorld.clone()
        }));
        return {
            Geometry: geometry,
            Instances: instances
        };
    }
};
export const SelfObjectNode = {
    name: 'Self Object',
    category: 'Input/Output',
    description: 'Reference to the object being modified',
    inputs: [],
    outputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY },
        { name: 'Transform', type: SocketType.MATRIX },
        { name: 'Location', type: SocketType.VECTOR },
        { name: 'Rotation', type: SocketType.ROTATION },
        { name: 'Scale', type: SocketType.VECTOR }
    ],
    defaultData: {
        includeChildren: false
    },
    execute: (geometry, data, inputs, context) => {
        const targetObj = context.targetObject;
        if (!targetObj) {
            return {
                Geometry: geometry,
                Transform: new THREE.Matrix4(),
                Location: new THREE.Vector3(),
                Rotation: new THREE.Euler(),
                Scale: new THREE.Vector3(1, 1, 1)
            };
        }
        const transform = targetObj.matrixWorld;
        const location = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();
        transform.decompose(location, rotation, scale);
        return {
            Geometry: geometry,
            Transform: transform.clone(),
            Location: location,
            Rotation: rotation,
            Scale: scale
        };
    }
};
export const JoinGeometryNode = {
    name: 'Join Geometry',
    category: 'Input/Output',
    description: 'Combine multiple geometries into one',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, isArray: true }
    ],
    outputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY }
    ],
    defaultData: {
        mergeMaterials: false,
        preserveAttributes: true
    },
    execute: (geometry, data, inputs, context) => {
        const geometries = inputs.Geometry || [];
        if (geometries.length === 0) {
            return { Geometry: geometry };
        }
        if (geometries.length === 1) {
            return { Geometry: geometries[0] };
        }
        const mergedGeometry = geometries[0].clone();
        for (let i = 1; i < geometries.length; i++) {
            const geo = geometries[i];
            mergedGeometry.merge(geo);
        }
        return { Geometry: mergedGeometry };
    }
};
export const GroupOutputNode = {
    name: 'Group Output',
    category: 'Input/Output',
    description: 'Define node group outputs',
    inputs: [
        { name: 'Geometry', type: SocketType.GEOMETRY, optional: true }
    ],
    outputs: [],
    defaultData: {
        groupName: 'Group'
    },
    execute: (geometry, data, inputs, context) => {
        return { Geometry: inputs.Geometry || geometry };
    }
};
// ============================================================================
// EXPORTS
// ============================================================================
export const InputOutputNodes = {
    Value: ValueNode,
    Integer: IntegerNode,
    Float: FloatNode,
    Vector: VectorNode,
    Rotation: RotationNode,
    Scale: ScaleNode,
    Boolean: BooleanNode,
    Color: ColorNode,
    String: StringNode,
    ObjectInfo: ObjectInfoNode,
    CollectionInfo: CollectionInfoNode,
    SelfObject: SelfObjectNode,
    JoinGeometry: JoinGeometryNode,
    GroupOutput: GroupOutputNode
};
//# sourceMappingURL=InputOutputNodes.js.map