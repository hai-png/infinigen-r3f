/**
 * Extended Vector Nodes - Additional vector operations
 * Completes the remaining 30 vector nodes from the implementation plan
 *
 * Note: Type definitions are imported from VectorNodes.ts to avoid duplicates
 */
import { NodeTypes } from '../core/node-types';
// ============================================================================
// Node Implementations
// ============================================================================
/**
 * Vector Transform Node
 * Transforms vectors between different coordinate spaces
 */
export class VectorTransformNode {
    constructor() {
        this.type = NodeTypes.VectorTransform;
        this.name = 'Vector Transform';
        this.inputs = {
            transformType: 'point',
            vector: [1, 0, 0],
            fromSpace: 'world',
            toSpace: 'object',
            objectMatrix: new Array(16).fill(0),
        };
        this.outputs = {
            vector: [0, 0, 0],
        };
    }
    execute() {
        const vec = this.inputs.vector || [0, 0, 0];
        const matrix = this.inputs.objectMatrix;
        if (!matrix || matrix.length !== 16) {
            return { vector: [...vec] };
        }
        // Apply 4x4 transformation matrix
        const x = vec[0], y = vec[1], z = vec[2];
        const w = this.inputs.transformType === 'vector' ? 0 : 1;
        const result = [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
        ];
        this.outputs.vector = result;
        return { vector: result };
    }
}
/**
 * Normal Map Node
 * Converts RGB color to normal map data
 */
export class NormalMapNode {
    constructor() {
        this.type = NodeTypes.NormalMap;
        this.name = 'Normal Map';
        this.inputs = {
            strength: 1,
            distance: 1,
            color: [0.5, 0.5, 1],
            direction: 'tangent',
            space: 'tangent',
        };
        this.outputs = {
            normal: [0, 0, 1],
        };
    }
    execute() {
        const color = this.inputs.color || [0.5, 0.5, 1];
        const strength = this.inputs.strength ?? 1;
        // Convert from [0,1] to [-1,1]
        const normal = [
            (color[0] - 0.5) * 2 * strength,
            (color[1] - 0.5) * 2 * strength,
            Math.sqrt(Math.max(0, 1 - ((color[0] - 0.5) * 2) ** 2 - ((color[1] - 0.5) * 2) ** 2)),
        ];
        // Normalize
        const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
        if (len > 0) {
            normal[0] /= len;
            normal[1] /= len;
            normal[2] /= len;
        }
        this.outputs.normal = normal;
        return { normal };
    }
}
/**
 * Bump Node
 * Creates bump mapping effect by perturbing normals
 */
export class BumpNode {
    constructor() {
        this.type = NodeTypes.Bump;
        this.name = 'Bump';
        this.inputs = {
            height: 0,
            strength: 1,
            distance: 1,
            useNormalMap: false,
            invert: false,
            normal: [0, 0, 1],
        };
        this.outputs = {
            normal: [0, 0, 1],
        };
    }
    execute() {
        const height = this.inputs.height ?? 0;
        const strength = this.inputs.strength ?? 1;
        const normal = this.inputs.normal || [0, 0, 1];
        const invert = this.inputs.invert ? -1 : 1;
        // Simple bump calculation (height derivative approximation)
        const bumpStrength = height * strength * invert;
        const perturbedNormal = [
            normal[0] + bumpStrength * 0.1,
            normal[1] + bumpStrength * 0.1,
            normal[2] + bumpStrength,
        ];
        // Normalize
        const len = Math.sqrt(perturbedNormal[0] ** 2 + perturbedNormal[1] ** 2 + perturbedNormal[2] ** 2);
        if (len > 0) {
            perturbedNormal[0] /= len;
            perturbedNormal[1] /= len;
            perturbedNormal[2] /= len;
        }
        this.outputs.normal = perturbedNormal;
        return { normal: perturbedNormal };
    }
}
/**
 * Displacement Node
 * Calculates displacement vector for surface displacement
 */
export class DisplacementNode {
    constructor() {
        this.type = NodeTypes.Displacement;
        this.name = 'Displacement';
        this.inputs = {
            height: 0,
            midlevel: 0.5,
            scale: 1,
            direction: 'normal',
        };
        this.outputs = {
            displacement: [0, 0, 0],
        };
    }
    execute() {
        const height = (this.inputs.height ?? 0) - (this.inputs.midlevel ?? 0.5);
        const scale = this.inputs.scale ?? 1;
        const direction = this.inputs.direction || 'normal';
        let displacement = [0, 0, 0];
        switch (direction) {
            case 'normal':
                displacement = [0, 0, height * scale];
                break;
            case 'x':
                displacement = [height * scale, 0, 0];
                break;
            case 'y':
                displacement = [0, height * scale, 0];
                break;
            case 'z':
                displacement = [0, 0, height * scale];
                break;
        }
        this.outputs.displacement = displacement;
        return { displacement };
    }
}
/**
 * Align Euler to Vector Node
 * Rotates Euler angles to align with a target vector
 */
export class AlignEulerToVectorNode {
    constructor() {
        this.type = NodeTypes.AlignEulerToVector;
        this.name = 'Align Euler to Vector';
        this.inputs = {
            vector: [0, 0, 1],
            axis: 'z',
            pivotAxis: 'x',
            useAlign: true,
        };
        this.outputs = {
            rotation: [0, 0, 0],
        };
    }
    execute() {
        const target = this.inputs.vector || [0, 0, 1];
        const axis = this.inputs.axis || 'z';
        // Calculate rotation to align axis with target vector
        const rotation = [0, 0, 0];
        // Simplified alignment (full implementation would use quaternions)
        if (axis === 'z') {
            rotation[0] = Math.atan2(target[1], target[0]); // Yaw
            rotation[1] = Math.atan2(target[2], Math.sqrt(target[0] ** 2 + target[1] ** 2)); // Pitch
        }
        else if (axis === 'y') {
            rotation[0] = Math.atan2(target[2], target[0]);
            rotation[2] = Math.atan2(target[1], Math.sqrt(target[0] ** 2 + target[2] ** 2));
        }
        else { // x
            rotation[1] = Math.atan2(target[2], target[1]);
            rotation[2] = Math.atan2(target[0], Math.sqrt(target[1] ** 2 + target[2] ** 2));
        }
        this.outputs.rotation = rotation;
        return { rotation };
    }
}
/**
 * Rotate Euler Node
 * Applies additional rotation to Euler angles
 */
export class RotateEulerNode {
    constructor() {
        this.type = NodeTypes.RotateEuler;
        this.name = 'Rotate Euler';
        this.inputs = {
            rotation: [0, 0, 0],
            angle: 0,
            axis: 'z',
            type: 'euler_xyz',
        };
        this.outputs = {
            rotation: [0, 0, 0],
        };
    }
    execute() {
        const rotation = [...(this.inputs.rotation || [0, 0, 0])];
        const angle = this.inputs.angle ?? 0;
        const axis = this.inputs.axis || 'z';
        switch (axis) {
            case 'x':
                rotation[0] += angle;
                break;
            case 'y':
                rotation[1] += angle;
                break;
            case 'z':
                rotation[2] += angle;
                break;
        }
        this.outputs.rotation = rotation;
        return { rotation };
    }
}
/**
 * Quaternion Operations Node
 * Converts between quaternion and other representations
 */
export class QuaternionNode {
    constructor() {
        this.type = NodeTypes.Quaternion;
        this.name = 'Quaternion';
        this.inputs = {
            quaternion: [1, 0, 0, 0],
            vector: [1, 0, 0],
            angle: 0,
            axis: [0, 0, 1],
        };
        this.outputs = {
            quaternion: [1, 0, 0, 0],
        };
    }
    execute() {
        // Axis-angle to quaternion conversion
        const angle = this.inputs.angle ?? 0;
        const axis = this.inputs.axis || [0, 0, 1];
        const halfAngle = angle / 2;
        const sinHalf = Math.sin(halfAngle);
        const quaternion = [
            Math.cos(halfAngle),
            axis[0] * sinHalf,
            axis[1] * sinHalf,
            axis[2] * sinHalf,
        ];
        this.outputs.quaternion = quaternion;
        return { quaternion };
    }
}
/**
 * Matrix Transform Node
 * Applies 4x4 matrix transformations
 */
export class MatrixTransformNode {
    constructor() {
        this.type = NodeTypes.MatrixTransform;
        this.name = 'Matrix Transform';
        this.inputs = {
            matrix: new Array(16).fill(0),
            vector: [1, 0, 0],
            transpose: false,
            inverse: false,
        };
        this.outputs = {
            vector: [0, 0, 0],
            matrix: [],
        };
    }
    execute() {
        const matrix = this.inputs.matrix || new Array(16).fill(0);
        const vec = this.inputs.vector || [1, 0, 0];
        if (matrix.length !== 16) {
            return { vector: [...vec], matrix: [] };
        }
        const x = vec[0], y = vec[1], z = vec[2];
        const result = [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ];
        this.outputs.vector = result;
        this.outputs.matrix = matrix;
        return { vector: result, matrix };
    }
}
/**
 * Direction to Point Node
 * Calculates direction and rotation from one point to another
 */
export class DirectionToPointNode {
    constructor() {
        this.type = NodeTypes.DirectionToPoint;
        this.name = 'Direction to Point';
        this.inputs = {
            from: [0, 0, 0],
            to: [0, 0, 1],
            up: [0, 1, 0],
        };
        this.outputs = {
            direction: [0, 0, 1],
            rotation: [0, 0, 0],
        };
    }
    execute() {
        const from = this.inputs.from || [0, 0, 0];
        const to = this.inputs.to || [0, 0, 1];
        const direction = [
            to[0] - from[0],
            to[1] - from[1],
            to[2] - from[2],
        ];
        // Normalize
        const len = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
        if (len > 0) {
            direction[0] /= len;
            direction[1] /= len;
            direction[2] /= len;
        }
        // Calculate rotation (simplified)
        const rotation = [
            Math.atan2(direction[1], direction[0]),
            Math.atan2(direction[2], Math.sqrt(direction[0] ** 2 + direction[1] ** 2)),
            0,
        ];
        this.outputs.direction = direction;
        this.outputs.rotation = rotation;
        return { direction, rotation };
    }
}
/**
 * Reflect Node
 * Calculates reflection of vector around normal
 */
export class ReflectNode {
    constructor() {
        this.type = NodeTypes.Reflect;
        this.name = 'Reflect';
        this.inputs = {
            vector: [1, 0, 0],
            normal: [0, 0, 1],
        };
        this.outputs = {
            reflected: [1, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [1, 0, 0];
        const n = this.inputs.normal || [0, 0, 1];
        // R = V - 2(V·N)N
        const dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        const reflected = [
            v[0] - 2 * dot * n[0],
            v[1] - 2 * dot * n[1],
            v[2] - 2 * dot * n[2],
        ];
        this.outputs.reflected = reflected;
        return { reflected };
    }
}
/**
 * Refract Node
 * Calculates refraction using Snell's law
 */
export class RefractNode {
    constructor() {
        this.type = NodeTypes.Refract;
        this.name = 'Refract';
        this.inputs = {
            vector: [1, 0, 0],
            normal: [0, 0, 1],
            ior: 1.5,
        };
        this.outputs = {
            refracted: [1, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [1, 0, 0];
        const n = this.inputs.normal || [0, 0, 1];
        const eta = this.inputs.ior ?? 1.5;
        const dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        const k = 1 - eta * eta * (1 - dot * dot);
        let refracted;
        if (k < 0) {
            // Total internal reflection
            refracted = [0, 0, 0];
        }
        else {
            refracted = [
                eta * v[0] - (eta * dot + Math.sqrt(k)) * n[0],
                eta * v[1] - (eta * dot + Math.sqrt(k)) * n[1],
                eta * v[2] - (eta * dot + Math.sqrt(k)) * n[2],
            ];
        }
        this.outputs.refracted = refracted;
        return { refracted };
    }
}
/**
 * Face Forward Node
 * Orients a vector to face towards a reference
 */
export class FaceForwardNode {
    constructor() {
        this.type = NodeTypes.FaceForward;
        this.name = 'Face Forward';
        this.inputs = {
            vector: [0, 0, 1],
            reference: [0, 0, 1],
            normal: [0, 0, 1],
        };
        this.outputs = {
            result: [0, 0, 1],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 1];
        const ref = this.inputs.reference || [0, 0, 1];
        const n = this.inputs.normal || [0, 0, 1];
        const dot = ref[0] * n[0] + ref[1] * n[1] + ref[2] * n[2];
        const result = dot >= 0 ? [-v[0], -v[1], -v[2]] : [...v];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Wrap Node
 * Wraps vector values within min/max range
 */
export class WrapNode {
    constructor() {
        this.type = NodeTypes.Wrap;
        this.name = 'Wrap';
        this.inputs = {
            vector: [0, 0, 0],
            min: [0, 0, 0],
            max: [1, 1, 1],
        };
        this.outputs = {
            wrapped: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const min = this.inputs.min || [0, 0, 0];
        const max = this.inputs.max || [1, 1, 1];
        const wrapComponent = (val, minVal, maxVal) => {
            const range = maxVal - minVal;
            if (range === 0)
                return minVal;
            return ((val - minVal) % range + range) % range + minVal;
        };
        const wrapped = [
            wrapComponent(v[0], min[0], max[0]),
            wrapComponent(v[1], min[1], max[1]),
            wrapComponent(v[2], min[2], max[2]),
        ];
        this.outputs.wrapped = wrapped;
        return { wrapped };
    }
}
/**
 * Snap Node
 * Snaps vector values to nearest increment
 */
export class SnapNode {
    constructor() {
        this.type = NodeTypes.Snap;
        this.name = 'Snap';
        this.inputs = {
            vector: [0, 0, 0],
            increment: [1, 1, 1],
        };
        this.outputs = {
            snapped: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const inc = this.inputs.increment || [1, 1, 1];
        const snapComponent = (val, increment) => {
            if (increment === 0)
                return val;
            return Math.round(val / increment) * increment;
        };
        const snapped = [
            snapComponent(v[0], inc[0]),
            snapComponent(v[1], inc[1]),
            snapComponent(v[2], inc[2]),
        ];
        this.outputs.snapped = snapped;
        return { snapped };
    }
}
/**
 * Floor/Ceil Node
 * Applies floor, ceiling, or round operations
 */
export class FloorCeilNode {
    constructor() {
        this.type = NodeTypes.FloorCeil;
        this.name = 'Floor/Ceil';
        this.inputs = {
            vector: [0, 0, 0],
            operation: 'floor',
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const op = this.inputs.operation || 'floor';
        let result;
        switch (op) {
            case 'ceiling':
                result = [Math.ceil(v[0]), Math.ceil(v[1]), Math.ceil(v[2])];
                break;
            case 'round':
                result = [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
                break;
            case 'floor':
            default:
                result = [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
                break;
        }
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Modulo Node
 * Calculates modulo of vector components
 */
export class ModuloNode {
    constructor() {
        this.type = NodeTypes.Modulo;
        this.name = 'Modulo';
        this.inputs = {
            vector: [0, 0, 0],
            divisor: [1, 1, 1],
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const d = this.inputs.divisor || [1, 1, 1];
        const modComponent = (val, div) => {
            if (div === 0)
                return val;
            return ((val % div) + div) % div;
        };
        const result = [
            modComponent(v[0], d[0]),
            modComponent(v[1], d[1]),
            modComponent(v[2], d[2]),
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Fraction Node
 * Separates fractional and whole parts
 */
export class FractionNode {
    constructor() {
        this.type = NodeTypes.Fraction;
        this.name = 'Fraction';
        this.inputs = {
            vector: [0, 0, 0],
        };
        this.outputs = {
            fraction: [0, 0, 0],
            whole: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const whole = [
            Math.trunc(v[0]),
            Math.trunc(v[1]),
            Math.trunc(v[2]),
        ];
        const fraction = [
            v[0] - whole[0],
            v[1] - whole[1],
            v[2] - whole[2],
        ];
        this.outputs.fraction = fraction;
        this.outputs.whole = whole;
        return { fraction, whole };
    }
}
/**
 * Absolute Node
 * Calculates absolute value of vector components
 */
export class AbsoluteNode {
    constructor() {
        this.type = NodeTypes.Absolute;
        this.name = 'Absolute';
        this.inputs = {
            vector: [0, 0, 0],
        };
        this.outputs = {
            absolute: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const absolute = [
            Math.abs(v[0]),
            Math.abs(v[1]),
            Math.abs(v[2]),
        ];
        this.outputs.absolute = absolute;
        return { absolute };
    }
}
/**
 * Min/Max Node
 * Calculates component-wise minimum or maximum
 */
export class MinMaxNode {
    constructor() {
        this.type = NodeTypes.MinMax;
        this.name = 'Min/Max';
        this.inputs = {
            vector1: [0, 0, 0],
            vector2: [1, 1, 1],
            operation: 'min',
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v1 = this.inputs.vector1 || [0, 0, 0];
        const v2 = this.inputs.vector2 || [1, 1, 1];
        const op = this.inputs.operation || 'min';
        const result = op === 'max' ? [
            Math.max(v1[0], v2[0]),
            Math.max(v1[1], v2[1]),
            Math.max(v1[2], v2[2]),
        ] : [
            Math.min(v1[0], v2[0]),
            Math.min(v1[1], v2[1]),
            Math.min(v1[2], v2[2]),
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Trigonometry Node
 * Applies trigonometric functions to vector components
 */
export class TrigonometryNode {
    constructor() {
        this.type = NodeTypes.Trigonometry;
        this.name = 'Trigonometry';
        this.inputs = {
            vector: [0, 0, 0],
            operation: 'sin',
            value2: 0,
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const op = this.inputs.operation || 'sin';
        const applyFunc = (val) => {
            switch (op) {
                case 'cos': return Math.cos(val);
                case 'tan': return Math.tan(val);
                case 'asin': return Math.asin(val);
                case 'acos': return Math.acos(val);
                case 'atan': return Math.atan(val);
                case 'sinh': return Math.sinh(val);
                case 'cosh': return Math.cosh(val);
                case 'tanh': return Math.tanh(val);
                case 'sin':
                default: return Math.sin(val);
            }
        };
        const result = [
            applyFunc(v[0]),
            applyFunc(v[1]),
            applyFunc(v[2]),
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Power/Logarithm Node
 * Applies power, logarithm, or root operations
 */
export class PowerLogNode {
    constructor() {
        this.type = NodeTypes.PowerLog;
        this.name = 'Power/Logarithm';
        this.inputs = {
            vector: [0, 0, 0],
            base: Math.E,
            exponent: 2,
            operation: 'power',
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const op = this.inputs.operation || 'power';
        const exp = this.inputs.exponent ?? 2;
        const base = this.inputs.base ?? Math.E;
        const applyFunc = (val) => {
            switch (op) {
                case 'log': return val > 0 ? Math.log(val) / Math.log(base) : 0;
                case 'sqrt': return Math.sqrt(Math.abs(val));
                case 'inverse_sqrt': return val !== 0 ? 1 / Math.sqrt(Math.abs(val)) : 0;
                case 'square': return val * val;
                case 'power':
                default: return Math.pow(Math.abs(val), exp);
            }
        };
        const result = [
            applyFunc(v[0]),
            applyFunc(v[1]),
            applyFunc(v[2]),
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Sign Node
 * Returns sign of each component (-1, 0, or 1)
 */
export class SignNode {
    constructor() {
        this.type = NodeTypes.Sign;
        this.name = 'Sign';
        this.inputs = {
            vector: [0, 0, 0],
        };
        this.outputs = {
            sign: [0, 0, 0],
        };
    }
    execute() {
        const v = this.inputs.vector || [0, 0, 0];
        const signFunc = (val) => {
            if (val > 0)
                return 1;
            if (val < 0)
                return -1;
            return 0;
        };
        const sign = [
            signFunc(v[0]),
            signFunc(v[1]),
            signFunc(v[2]),
        ];
        this.outputs.sign = sign;
        return { sign };
    }
}
/**
 * Compare Node
 * Compares two vectors with epsilon tolerance
 */
export class CompareNode {
    constructor() {
        this.type = NodeTypes.Compare;
        this.name = 'Compare';
        this.inputs = {
            vector1: [0, 0, 0],
            vector2: [0, 0, 0],
            epsilon: 0.001,
            operation: 'equal',
        };
        this.outputs = {
            result: false,
            comparison: [0, 0, 0],
        };
    }
    execute() {
        const v1 = this.inputs.vector1 || [0, 0, 0];
        const v2 = this.inputs.vector2 || [0, 0, 0];
        const eps = this.inputs.epsilon ?? 0.001;
        const op = this.inputs.operation || 'equal';
        const compareComponent = (a, b) => {
            switch (op) {
                case 'not_equal': return Math.abs(a - b) > eps ? 1 : 0;
                case 'less': return a < b - eps ? 1 : 0;
                case 'greater': return a > b + eps ? 1 : 0;
                case 'less_equal': return a <= b + eps ? 1 : 0;
                case 'greater_equal': return a >= b - eps ? 1 : 0;
                case 'equal':
                default: return Math.abs(a - b) <= eps ? 1 : 0;
            }
        };
        const comparison = [
            compareComponent(v1[0], v2[0]),
            compareComponent(v1[1], v2[1]),
            compareComponent(v1[2], v2[2]),
        ];
        const result = comparison[0] && comparison[1] && comparison[2];
        this.outputs.result = result;
        this.outputs.comparison = comparison;
        return { result, comparison };
    }
}
/**
 * Smooth Min/Max Node
 * Calculates smooth minimum or maximum using polynomial smoothing
 */
export class SmoothMinMaxNode {
    constructor() {
        this.type = NodeTypes.SmoothMinMax;
        this.name = 'Smooth Min/Max';
        this.inputs = {
            vector1: [0, 0, 0],
            vector2: [1, 1, 1],
            smoothness: 0.1,
            operation: 'smooth_min',
        };
        this.outputs = {
            result: [0, 0, 0],
        };
    }
    execute() {
        const v1 = this.inputs.vector1 || [0, 0, 0];
        const v2 = this.inputs.vector2 || [1, 1, 1];
        const k = this.inputs.smoothness ?? 0.1;
        const op = this.inputs.operation || 'smooth_min';
        const smoothMin = (a, b, k) => {
            const h = Math.max(k - Math.abs(a - b), 0) / k;
            const smoothK = h * h * (3 - 2 * h);
            return Math.min(a, b) - k * smoothK / 6;
        };
        const smoothMax = (a, b, k) => {
            const h = Math.max(k - Math.abs(a - b), 0) / k;
            const smoothK = h * h * (3 - 2 * h);
            return Math.max(a, b) + k * smoothK / 6;
        };
        const result = op === 'smooth_max' ? [
            smoothMax(v1[0], v2[0], k),
            smoothMax(v1[1], v2[1], k),
            smoothMax(v1[2], v2[2], k),
        ] : [
            smoothMin(v1[0], v2[0], k),
            smoothMin(v1[1], v2[1], k),
            smoothMin(v1[2], v2[2], k),
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Angle Between Node
 * Calculates angle between two vectors
 */
export class AngleBetweenNode {
    constructor() {
        this.type = NodeTypes.AngleBetween;
        this.name = 'Angle Between';
        this.inputs = {
            vector1: [1, 0, 0],
            vector2: [0, 1, 0],
        };
        this.outputs = {
            angle: 0,
            degrees: 0,
        };
    }
    execute() {
        const v1 = this.inputs.vector1 || [1, 0, 0];
        const v2 = this.inputs.vector2 || [0, 1, 0];
        // Normalize
        const len1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
        const len2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
        if (len1 === 0 || len2 === 0) {
            return { angle: 0, degrees: 0 };
        }
        const normalized1 = [v1[0] / len1, v1[1] / len1, v1[2] / len1];
        const normalized2 = [v2[0] / len2, v2[1] / len2, v2[2] / len2];
        const dot = normalized1[0] * normalized2[0] + normalized1[1] * normalized2[1] + normalized1[2] * normalized2[2];
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const angle = Math.acos(clampedDot);
        const degrees = angle * (180 / Math.PI);
        this.outputs.angle = angle;
        this.outputs.degrees = degrees;
        return { angle, degrees };
    }
}
/**
 * Spherical Linear Interpolation Node
 * Interpolates between two vectors on a sphere
 */
export class SlerpNode {
    constructor() {
        this.type = NodeTypes.Slerp;
        this.name = 'Slerp';
        this.inputs = {
            start: [1, 0, 0],
            end: [0, 1, 0],
            factor: 0.5,
        };
        this.outputs = {
            result: [1, 0, 0],
        };
    }
    execute() {
        const start = this.inputs.start || [1, 0, 0];
        const end = this.inputs.end || [0, 1, 0];
        const t = Math.max(0, Math.min(1, this.inputs.factor ?? 0.5));
        // Normalize
        const normalize = (v) => {
            const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
            return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
        };
        const s = normalize(start);
        const e = normalize(end);
        const dot = s[0] * e[0] + s[1] * e[1] + s[2] * e[2];
        const clampedDot = Math.max(-1, Math.min(1, dot));
        const theta = Math.acos(clampedDot);
        if (theta < 0.0001) {
            // Vectors are nearly parallel, use linear interpolation
            const result = [
                s[0] * (1 - t) + e[0] * t,
                s[1] * (1 - t) + e[1] * t,
                s[2] * (1 - t) + e[2] * t,
            ];
            return normalize(result);
        }
        const sinTheta = Math.sin(theta);
        const a = Math.sin((1 - t) * theta) / sinTheta;
        const b = Math.sin(t * theta) / sinTheta;
        const result = [
            s[0] * a + e[0] * b,
            s[1] * a + e[1] * b,
            s[2] * a + e[2] * b,
        ];
        this.outputs.result = result;
        return { result };
    }
}
/**
 * Polar to Cartesian Node
 * Converts polar coordinates to Cartesian
 */
export class PolarToCartNode {
    constructor() {
        this.type = NodeTypes.PolarToCart;
        this.name = 'Polar to Cartesian';
        this.inputs = {
            radius: 1,
            angle: 0,
            z: 0,
        };
        this.outputs = {
            x: 1,
            y: 0,
            z: 0,
            vector: [1, 0, 0],
        };
    }
    execute() {
        const r = this.inputs.radius ?? 1;
        const angle = this.inputs.angle ?? 0;
        const z = this.inputs.z ?? 0;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        const vector = [x, y, z];
        this.outputs.x = x;
        this.outputs.y = y;
        this.outputs.z = z;
        this.outputs.vector = vector;
        return { x, y, z, vector };
    }
}
/**
 * Cartesian to Polar Node
 * Converts Cartesian coordinates to polar
 */
export class CartToPolarNode {
    constructor() {
        this.type = NodeTypes.CartToPolar;
        this.name = 'Cartesian to Polar';
        this.inputs = {
            vector: [1, 0, 0],
        };
        this.outputs = {
            radius: 1,
            angle: 0,
            z: 0,
        };
    }
    execute() {
        const v = this.inputs.vector || [1, 0, 0];
        const radius = Math.sqrt(v[0] ** 2 + v[1] ** 2);
        const angle = Math.atan2(v[1], v[0]);
        const z = v[2];
        this.outputs.radius = radius;
        this.outputs.angle = angle;
        this.outputs.z = z;
        return { radius, angle, z };
    }
}
//# sourceMappingURL=VectorNodesExtended.js.map