/**
 * Utility Nodes for Infinigen R3F
 *
 * Provides mathematical operations, vector math, color operations, and general utilities.
 * Based on Blender Geometry Nodes utility system.
 *
 * @module nodes/utility
 */
import * as THREE from 'three';
import { SocketType } from '../core/types';
export const MathNode = {
    name: 'Math',
    category: 'Utility/Math',
    description: 'Perform mathematical operations',
    inputs: [
        { name: 'A', type: SocketType.FLOAT },
        { name: 'B', type: SocketType.FLOAT },
        { name: 'C', type: SocketType.FLOAT, optional: true }
    ],
    outputs: [
        { name: 'Result', type: SocketType.FLOAT }
    ],
    defaultData: {
        operation: 'ADD'
    },
    execute: (geometry, data, inputs, context) => {
        const a = inputs.A ?? 0;
        const b = inputs.B ?? 0;
        const c = inputs.C ?? 0;
        let result;
        switch (data.operation) {
            case 'ADD':
                result = a + b;
                break;
            case 'SUBTRACT':
                result = a - b;
                break;
            case 'MULTIPLY':
                result = a * b;
                break;
            case 'DIVIDE':
                result = b !== 0 ? a / b : 0;
                break;
            case 'MULTIPLY_ADD':
                result = a * b + c;
                break;
            case 'POWER':
                result = Math.pow(a, b);
                break;
            case 'LOGARITHM':
                result = Math.log(a);
                break;
            case 'SQRT':
                result = Math.sqrt(a);
                break;
            case 'ABS':
                result = Math.abs(a);
                break;
            case 'CEIL':
                result = Math.ceil(a);
                break;
            case 'FLOOR':
                result = Math.floor(a);
                break;
            case 'ROUND':
                result = Math.round(a);
                break;
            case 'FRACT':
                result = a - Math.floor(a);
                break;
            case 'MODULO':
                result = a % b;
                break;
            case 'MIN':
                result = Math.min(a, b);
                break;
            case 'MAX':
                result = Math.max(a, b);
                break;
            case 'SINE':
                result = Math.sin(a);
                break;
            case 'COSINE':
                result = Math.cos(a);
                break;
            case 'TANGENT':
                result = Math.tan(a);
                break;
            case 'ARCSINE':
                result = Math.asin(a);
                break;
            case 'ARCCOSINE':
                result = Math.acos(a);
                break;
            case 'ARCTANGENT':
                result = Math.atan(a);
                break;
            case 'ARCTAN2':
                result = Math.atan2(a, b);
                break;
            case 'HYPOTENUSE':
                result = Math.sqrt(a * a + b * b);
                break;
            case 'DEGREES':
                result = a * (180 / Math.PI);
                break;
            case 'RADIANS':
                result = a * (Math.PI / 180);
                break;
            case 'SIGN':
                result = a >= 0 ? 1 : -1;
                break;
            case 'COMPARE':
                result = Math.abs(a - b) < 0.00001 ? 1 : 0;
                break;
            case 'SNAP':
                result = Math.round(a / b) * b;
                break;
            case 'PINGPONG':
                result = a % (2 * b);
                break;
            case 'WRAP':
                result = ((a % b) + b) % b;
                break;
            default: result = a + b;
        }
        // Apply clamping if enabled
        if (data.clamp) {
            result = Math.max(data.minClamp ?? -Infinity, Math.min(data.maxClamp ?? Infinity, result));
        }
        return { Result: result };
    }
};
export const VectorMathNode = {
    name: 'Vector Math',
    category: 'Utility/Math',
    description: 'Perform vector mathematical operations',
    inputs: [
        { name: 'A', type: SocketType.VECTOR },
        { name: 'B', type: SocketType.VECTOR },
        { name: 'Scale', type: SocketType.FLOAT, optional: true },
        { name: 'Factor', type: SocketType.FLOAT, optional: true }
    ],
    outputs: [
        { name: 'Vector', type: SocketType.VECTOR },
        { name: 'Value', type: SocketType.FLOAT }
    ],
    defaultData: {
        operation: 'ADD'
    },
    execute: (geometry, data, inputs, context) => {
        const a = inputs.A || new THREE.Vector3();
        const b = inputs.B || new THREE.Vector3();
        const scale = inputs.Scale ?? 1.0;
        const factor = inputs.Factor ?? 1.0;
        let vector;
        let value;
        switch (data.operation) {
            case 'ADD':
                vector = a.clone().add(b);
                value = vector.length();
                break;
            case 'SUBTRACT':
                vector = a.clone().sub(b);
                value = vector.length();
                break;
            case 'MULTIPLY':
                vector = a.clone().multiply(b);
                value = vector.length();
                break;
            case 'DIVIDE':
                vector = new THREE.Vector3(b.x !== 0 ? a.x / b.x : 0, b.y !== 0 ? a.y / b.y : 0, b.z !== 0 ? a.z / b.z : 0);
                value = vector.length();
                break;
            case 'CROSS_PRODUCT':
                vector = a.clone().cross(b);
                value = vector.length();
                break;
            case 'DOT_PRODUCT':
                vector = new THREE.Vector3();
                value = a.dot(b);
                break;
            case 'PROJECT':
                const bLengthSq = b.lengthSq();
                if (bLengthSq > 0) {
                    const dot = a.dot(b);
                    vector = b.clone().multiplyScalar(dot / bLengthSq);
                }
                else {
                    vector = new THREE.Vector3();
                }
                value = vector.length();
                break;
            case 'REFLECT':
                const normal = b.clone().normalize();
                vector = a.clone().reflect(normal);
                value = vector.length();
                break;
            case 'NORMALIZE':
                vector = a.clone().normalize();
                value = 1.0;
                break;
            case 'SCALE':
                vector = a.clone().multiplyScalar(scale);
                value = vector.length();
                break;
            case 'LENGTH':
                vector = new THREE.Vector3();
                value = a.length();
                break;
            case 'DISTANCE':
                vector = new THREE.Vector3();
                value = a.distanceTo(b);
                break;
            case 'NEGATE':
                vector = a.clone().negate();
                value = vector.length();
                break;
            case 'MINIMUM':
                vector = new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
                value = vector.length();
                break;
            case 'MAXIMUM':
                vector = new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
                value = vector.length();
                break;
            default:
                vector = a.clone().add(b);
                value = vector.length();
        }
        return { Vector: vector, Value: value };
    }
};
export const ColorMathNode = {
    name: 'Color Math',
    category: 'Utility/Math',
    description: 'Perform color mathematical operations',
    inputs: [
        { name: 'A', type: SocketType.COLOR },
        { name: 'B', type: SocketType.COLOR },
        { name: 'Factor', type: SocketType.FLOAT, optional: true }
    ],
    outputs: [
        { name: 'Color', type: SocketType.COLOR }
    ],
    defaultData: {
        operation: 'MULTIPLY',
        factor: 1.0
    },
    execute: (geometry, data, inputs, context) => {
        const a = inputs.A || new THREE.Color();
        const b = inputs.B || new THREE.Color();
        const factor = inputs.Factor ?? data.factor ?? 1.0;
        let result;
        switch (data.operation) {
            case 'ADD':
                result = a.clone().add(b).multiplyScalar(factor);
                break;
            case 'SUBTRACT':
                result = a.clone().sub(b).multiplyScalar(factor);
                break;
            case 'MULTIPLY':
                result = a.clone().multiply(b);
                break;
            case 'DIVIDE':
                result = new THREE.Color(b.r !== 0 ? a.r / b.r : 0, b.g !== 0 ? a.g / b.g : 0, b.b !== 0 ? a.b / b.b : 0);
                break;
            case 'DIFFERENCE':
                result = new THREE.Color(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
                break;
            case 'DARKEN':
                result = new THREE.Color(Math.min(a.r, b.r), Math.min(a.g, b.g), Math.min(a.b, b.b));
                break;
            case 'LIGHTEN':
                result = new THREE.Color(Math.max(a.r, b.r), Math.max(a.g, b.g), Math.max(a.b, b.b));
                break;
            case 'SCREEN':
                result = new THREE.Color(1 - (1 - a.r) * (1 - b.r), 1 - (1 - a.g) * (1 - b.g), 1 - (1 - a.b) * (1 - b.b));
                break;
            case 'INVERT':
                result = new THREE.Color(1 - a.r, 1 - a.g, 1 - a.b);
                break;
            default:
                result = a.clone().lerp(b, factor);
        }
        // Clamp if requested
        if (data.clamp) {
            result.clamp();
        }
        return { Color: result };
    }
};
export const CompareNode = {
    name: 'Compare',
    category: 'Utility/Logic',
    description: 'Compare two values',
    inputs: [
        { name: 'A', type: SocketType.FLOAT },
        { name: 'B', type: SocketType.FLOAT }
    ],
    outputs: [
        { name: 'Result', type: SocketType.BOOLEAN }
    ],
    defaultData: {
        operation: 'EQUAL',
        epsilon: 0.00001
    },
    execute: (geometry, data, inputs, context) => {
        const a = inputs.A ?? 0;
        const b = inputs.B ?? 0;
        const eps = data.epsilon ?? 0.00001;
        let result;
        switch (data.operation) {
            case 'EQUAL':
                result = Math.abs(a - b) < eps;
                break;
            case 'NOT_EQUAL':
                result = Math.abs(a - b) >= eps;
                break;
            case 'LESS_THAN':
                result = a < b;
                break;
            case 'LESS_EQUAL':
                result = a <= b;
                break;
            case 'GREATER_THAN':
                result = a > b;
                break;
            case 'GREATER_EQUAL':
                result = a >= b;
                break;
            case 'AND':
                result = (a !== 0) && (b !== 0);
                break;
            case 'OR':
                result = (a !== 0) || (b !== 0);
                break;
            case 'NOT':
                result = a === 0;
                break;
            default:
                result = a === b;
        }
        return { Result: result };
    }
};
export const SwitchNode = {
    name: 'Switch',
    category: 'Utility/Logic',
    description: 'Select output based on boolean condition',
    inputs: [
        { name: 'Boolean', type: SocketType.BOOLEAN },
        { name: 'False', type: SocketType.VALUE },
        { name: 'True', type: SocketType.VALUE }
    ],
    outputs: [
        { name: 'Result', type: SocketType.VALUE }
    ],
    defaultData: {
        inputType: SocketType.VALUE
    },
    execute: (geometry, data, inputs, context) => {
        const condition = inputs.Boolean ?? false;
        const result = condition ? inputs.True : inputs.False;
        return { Result: result };
    }
};
// ============================================================================
// CONVERSION NODES
// ============================================================================
/**
 * Combine XYZ Node - Combine scalar values into vector
 */
export const CombineXYZNode = {
    name: 'Combine XYZ',
    category: 'Utility/Conversion',
    description: 'Combine X, Y, Z components into a vector',
    inputs: [
        { name: 'X', type: SocketType.FLOAT },
        { name: 'Y', type: SocketType.FLOAT },
        { name: 'Z', type: SocketType.FLOAT }
    ],
    outputs: [
        { name: 'Vector', type: SocketType.VECTOR }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const x = inputs.X ?? 0;
        const y = inputs.Y ?? 0;
        const z = inputs.Z ?? 0;
        return { Vector: new THREE.Vector3(x, y, z) };
    }
};
/**
 * Separate XYZ Node - Extract components from vector
 */
export const SeparateXYZNode = {
    name: 'Separate XYZ',
    category: 'Utility/Conversion',
    description: 'Extract X, Y, Z components from a vector',
    inputs: [
        { name: 'Vector', type: SocketType.VECTOR }
    ],
    outputs: [
        { name: 'X', type: SocketType.FLOAT },
        { name: 'Y', type: SocketType.FLOAT },
        { name: 'Z', type: SocketType.FLOAT }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const vector = inputs.Vector || new THREE.Vector3();
        return {
            X: vector.x,
            Y: vector.y,
            Z: vector.z
        };
    }
};
/**
 * Combine RGBA Node - Combine color and alpha
 */
export const CombineRGBANode = {
    name: 'Combine RGBA',
    category: 'Utility/Conversion',
    description: 'Combine RGB and Alpha into a color',
    inputs: [
        { name: 'R', type: SocketType.FLOAT },
        { name: 'G', type: SocketType.FLOAT },
        { name: 'B', type: SocketType.FLOAT },
        { name: 'A', type: SocketType.FLOAT }
    ],
    outputs: [
        { name: 'Color', type: SocketType.COLOR }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const r = inputs.R ?? 0;
        const g = inputs.G ?? 0;
        const b = inputs.B ?? 0;
        const a = inputs.A ?? 1;
        const color = new THREE.Color(r, g, b);
        // Note: Three.js Color doesn't store alpha, but we can attach it
        color.alpha = a;
        return { Color: color };
    }
};
/**
 * Separate RGBA Node - Extract components from color
 */
export const SeparateRGBANode = {
    name: 'Separate RGBA',
    category: 'Utility/Conversion',
    description: 'Extract RGB and Alpha from a color',
    inputs: [
        { name: 'Color', type: SocketType.COLOR }
    ],
    outputs: [
        { name: 'R', type: SocketType.FLOAT },
        { name: 'G', type: SocketType.FLOAT },
        { name: 'B', type: SocketType.FLOAT },
        { name: 'A', type: SocketType.FLOAT }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const color = inputs.Color || new THREE.Color();
        const alpha = color.alpha ?? 1;
        return {
            R: color.r,
            G: color.g,
            B: color.b,
            A: alpha
        };
    }
};
/**
 * Float to Integer Node - Convert float to integer
 */
export const FloatToIntNode = {
    name: 'Float to Integer',
    category: 'Utility/Conversion',
    description: 'Convert float to integer',
    inputs: [
        { name: 'Float', type: SocketType.FLOAT }
    ],
    outputs: [
        { name: 'Integer', type: SocketType.INT }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const floatValue = inputs.Float ?? 0;
        return { Integer: Math.round(floatValue) };
    }
};
/**
 * Integer to Float Node - Convert integer to float
 */
export const IntToFloatNode = {
    name: 'Integer to Float',
    category: 'Utility/Conversion',
    description: 'Convert integer to float',
    inputs: [
        { name: 'Integer', type: SocketType.INT }
    ],
    outputs: [
        { name: 'Float', type: SocketType.FLOAT }
    ],
    defaultData: {},
    execute: (geometry, data, inputs, context) => {
        const intValue = inputs.Integer ?? 0;
        return { Float: intValue };
    }
};
export const RandomValueNode = {
    name: 'Random Value',
    category: 'Utility/Random',
    description: 'Generate random values',
    inputs: [
        { name: 'ID', type: SocketType.INT, optional: true },
        { name: 'Min', type: SocketType.FLOAT, optional: true },
        { name: 'Max', type: SocketType.FLOAT, optional: true },
        { name: 'Probability', type: SocketType.FLOAT, optional: true }
    ],
    outputs: [
        { name: 'Value', type: SocketType.FLOAT },
        { name: 'Vector', type: SocketType.VECTOR }
    ],
    defaultData: {
        dataType: SocketType.FLOAT,
        min: 0,
        max: 1,
        seed: 0,
        useMin: true,
        useMax: true
    },
    execute: (geometry, data, inputs, context) => {
        const id = inputs.ID ?? 0;
        const min = inputs.Min ?? data.min;
        const max = inputs.Max ?? data.max;
        const probability = inputs.Probability ?? 1.0;
        // Seeded random using simple hash
        const seed = data.seed + id;
        const x = Math.sin(seed * 12.9898 + id * 78.233) * 43758.5453;
        const rand = x - Math.floor(x);
        // Apply probability filter
        if (rand > probability) {
            return {
                Value: data.dataType === SocketType.BOOLEAN ? 0 : min,
                Vector: new THREE.Vector3(min, min, min)
            };
        }
        const value = min + rand * (max - min);
        // Generate random vector
        const vecRand1 = Math.sin(seed * 1.1 + 1) * 43758.5453 - Math.floor(Math.sin(seed * 1.1 + 1) * 43758.5453);
        const vecRand2 = Math.sin(seed * 2.2 + 2) * 43758.5453 - Math.floor(Math.sin(seed * 2.2 + 2) * 43758.5453);
        const vecRand3 = Math.sin(seed * 3.3 + 3) * 43758.5453 - Math.floor(Math.sin(seed * 3.3 + 3) * 43758.5453);
        const vector = new THREE.Vector3(min + vecRand1 * (max - min), min + vecRand2 * (max - min), min + vecRand3 * (max - min));
        return { Value: value, Vector: vector };
    }
};
// ============================================================================
// EXPORTS
// ============================================================================
export const UtilityNodes = {
    // Math
    Math: MathNode,
    VectorMath: VectorMathNode,
    ColorMath: ColorMathNode,
    // Logic
    Compare: CompareNode,
    Switch: SwitchNode,
    // Conversion
    CombineXYZ: CombineXYZNode,
    SeparateXYZ: SeparateXYZNode,
    CombineRGBA: CombineRGBANode,
    SeparateRGBA: SeparateRGBANode,
    FloatToInt: FloatToIntNode,
    IntToFloat: IntToFloatNode,
    // Random
    RandomValue: RandomValueNode
};
//# sourceMappingURL=UtilityNodes.js.map