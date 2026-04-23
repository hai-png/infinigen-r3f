/**
 * Extended Vector Nodes - Additional vector operations
 * Completes the remaining 30 vector nodes from the implementation plan
 * 
 * Note: Type definitions are imported from VectorNodes.ts to avoid duplicates
 */

import { NodeTypes } from '../core/node-types';
import type {
  VectorTransformInputs,
  VectorTransformOutputs,
  NormalMapInputs,
  NormalMapOutputs,
  BumpInputs,
  BumpOutputs,
  DisplacementInputs,
  DisplacementOutputs,
  AlignEulerToVectorInputs as BaseAlignEulerToVectorInputs,
  AlignEulerToVectorOutputs,
  RotateEulerInputs as BaseRotateEulerInputs,
  RotateEulerOutputs,
  QuaternionInputs as BaseQuaternionInputs,
  QuaternionOutputs,
} from './VectorNodes';

// Extended versions with additional properties
export interface AlignEulerToVectorInputs extends BaseAlignEulerToVectorInputs {
  useAlign?: boolean;
}

export interface RotateEulerInputs extends BaseRotateEulerInputs {
  type?: 'euler_xyz' | 'quaternion';
}

export interface QuaternionInputs extends BaseQuaternionInputs {
  // Additional quaternion operations
}

export interface MatrixTransformInputs {
  matrix?: number[];
  vector?: [number, number, number];
  transpose?: boolean;
  inverse?: boolean;
}

export interface MatrixTransformOutputs {
  vector: [number, number, number];
  matrix: number[];
}

export interface DirectionToPointInputs {
  from?: [number, number, number];
  to?: [number, number, number];
  up?: [number, number, number];
}

export interface DirectionToPointOutputs {
  direction: [number, number, number];
  rotation: [number, number, number];
}

export interface ReflectInputs {
  vector?: [number, number, number];
  normal?: [number, number, number];
}

export interface ReflectOutputs {
  reflected: [number, number, number];
}

export interface RefractInputs {
  vector?: [number, number, number];
  normal?: [number, number, number];
  ior?: number;
}

export interface RefractOutputs {
  refracted: [number, number, number];
}

export interface FaceForwardInputs {
  vector?: [number, number, number];
  reference?: [number, number, number];
  normal?: [number, number, number];
}

export interface FaceForwardOutputs {
  result: [number, number, number];
}

export interface WrapInputs {
  vector?: [number, number, number];
  min?: [number, number, number];
  max?: [number, number, number];
}

export interface WrapOutputs {
  wrapped: [number, number, number];
}

export interface SnapInputs {
  vector?: [number, number, number];
  increment?: [number, number, number];
}

export interface SnapOutputs {
  snapped: [number, number, number];
}

export interface FloorCeilInputs {
  vector?: [number, number, number];
  operation?: 'floor' | 'ceiling' | 'round' | 'snap';
}

export interface FloorCeilOutputs {
  result: [number, number, number];
}

export interface ModuloInputs {
  vector?: [number, number, number];
  divisor?: [number, number, number];
}

export interface ModuloOutputs {
  result: [number, number, number];
}

export interface FractionInputs {
  vector?: [number, number, number];
}

export interface FractionOutputs {
  fraction: [number, number, number];
  whole: [number, number, number];
}

export interface AbsoluteInputs {
  vector?: [number, number, number];
}

export interface AbsoluteOutputs {
  absolute: [number, number, number];
}

export interface MinMaxInputs {
  vector1?: [number, number, number];
  vector2?: [number, number, number];
  operation?: 'min' | 'max';
}

export interface MinMaxOutputs {
  result: [number, number, number];
}

export interface TrigonometryInputs {
  vector?: [number, number, number];
  operation?: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'atan2' | 
              'sinh' | 'cosh' | 'tanh';
  value2?: number;
}

export interface TrigonometryOutputs {
  result: [number, number, number];
  value?: number;
}

export interface PowerLogInputs {
  vector?: [number, number, number];
  base?: number;
  exponent?: number;
  operation?: 'power' | 'log' | 'sqrt' | 'inverse_sqrt' | 'square';
}

export interface PowerLogOutputs {
  result: [number, number, number];
}

export interface SignInputs {
  vector?: [number, number, number];
}

export interface SignOutputs {
  sign: [number, number, number];
}

export interface CompareInputs {
  vector1?: [number, number, number];
  vector2?: [number, number, number];
  epsilon?: number;
  operation?: 'equal' | 'not_equal' | 'less' | 'greater' | 'less_equal' | 'greater_equal';
}

export interface CompareOutputs {
  result: boolean;
  comparison: [number, number, number];
}

export interface SmoothMinMaxInputs {
  vector1?: [number, number, number];
  vector2?: [number, number, number];
  smoothness?: number;
  operation?: 'smooth_min' | 'smooth_max';
}

export interface SmoothMinMaxOutputs {
  result: [number, number, number];
}

export interface AngleBetweenInputs {
  vector1?: [number, number, number];
  vector2?: [number, number, number];
}

export interface AngleBetweenOutputs {
  angle: number;
  degrees: number;
}

export interface SlerpInputs {
  start?: [number, number, number];
  end?: [number, number, number];
  factor?: number;
}

export interface SlerpOutputs {
  result: [number, number, number];
}

export interface PolarToCartInputs {
  radius?: number;
  angle?: number;
  z?: number;
}

export interface PolarToCartOutputs {
  x: number;
  y: number;
  z: number;
  vector: [number, number, number];
}

export interface CartToPolarInputs {
  vector?: [number, number, number];
}

export interface CartToPolarOutputs {
  radius: number;
  angle: number;
  z: number;
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Vector Transform Node
 * Transforms vectors between different coordinate spaces
 */
export class VectorTransformNode implements VectorNodeBase {
  readonly type = NodeTypes.VectorTransform;
  readonly name = 'Vector Transform';
  
  inputs: VectorTransformInputs = {
    transformType: 'point',
    vector: [1, 0, 0],
    fromSpace: 'world',
    toSpace: 'object',
    objectMatrix: new Array(16).fill(0),
  };
  
  outputs: VectorTransformOutputs = {
    vector: [0, 0, 0],
  };

  execute(): VectorTransformOutputs {
    const vec = this.inputs.vector || [0, 0, 0];
    const matrix = this.inputs.objectMatrix;
    
    if (!matrix || matrix.length !== 16) {
      return { vector: [...vec] };
    }
    
    // Apply 4x4 transformation matrix
    const x = vec[0], y = vec[1], z = vec[2];
    const w = this.inputs.transformType === 'vector' ? 0 : 1;
    
    const result: [number, number, number] = [
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
export class NormalMapNode implements VectorNodeBase {
  readonly type = NodeTypes.NormalMap;
  readonly name = 'Normal Map';
  
  inputs: NormalMapInputs = {
    strength: 1,
    distance: 1,
    color: [0.5, 0.5, 1],
    direction: 'tangent',
    space: 'tangent',
  };
  
  outputs: NormalMapOutputs = {
    normal: [0, 0, 1],
  };

  execute(): NormalMapOutputs {
    const color = this.inputs.color || [0.5, 0.5, 1];
    const strength = this.inputs.strength ?? 1;
    
    // Convert from [0,1] to [-1,1]
    const normal: [number, number, number] = [
      (color[0] - 0.5) * 2 * strength,
      (color[1] - 0.5) * 2 * strength,
      Math.sqrt(Math.max(0, 1 - ((color[0] - 0.5) * 2)**2 - ((color[1] - 0.5) * 2)**2)),
    ];
    
    // Normalize
    const len = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
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
export class BumpNode implements VectorNodeBase {
  readonly type = NodeTypes.Bump;
  readonly name = 'Bump';
  
  inputs: BumpInputs = {
    height: 0,
    strength: 1,
    distance: 1,
    useNormalMap: false,
    invert: false,
    normal: [0, 0, 1],
  };
  
  outputs: BumpOutputs = {
    normal: [0, 0, 1],
  };

  execute(): BumpOutputs {
    const height = this.inputs.height ?? 0;
    const strength = this.inputs.strength ?? 1;
    const normal = this.inputs.normal || [0, 0, 1];
    const invert = this.inputs.invert ? -1 : 1;
    
    // Simple bump calculation (height derivative approximation)
    const bumpStrength = height * strength * invert;
    const perturbedNormal: [number, number, number] = [
      normal[0] + bumpStrength * 0.1,
      normal[1] + bumpStrength * 0.1,
      normal[2] + bumpStrength,
    ];
    
    // Normalize
    const len = Math.sqrt(perturbedNormal[0]**2 + perturbedNormal[1]**2 + perturbedNormal[2]**2);
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
export class DisplacementNode implements VectorNodeBase {
  readonly type = NodeTypes.Displacement;
  readonly name = 'Displacement';
  
  inputs: DisplacementInputs = {
    height: 0,
    midlevel: 0.5,
    scale: 1,
    direction: 'normal',
  };
  
  outputs: DisplacementOutputs = {
    displacement: [0, 0, 0],
  };

  execute(): DisplacementOutputs {
    const height = (this.inputs.height ?? 0) - (this.inputs.midlevel ?? 0.5);
    const scale = this.inputs.scale ?? 1;
    const direction = this.inputs.direction || 'normal';
    
    let displacement: [number, number, number] = [0, 0, 0];
    
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
export class AlignEulerToVectorNode implements VectorNodeBase {
  readonly type = NodeTypes.AlignEulerToVector;
  readonly name = 'Align Euler to Vector';
  
  inputs: AlignEulerToVectorInputs = {
    vector: [0, 0, 1],
    axis: 'z',
    pivotAxis: 'x',
    useAlign: true,
  };
  
  outputs: AlignEulerToVectorOutputs = {
    rotation: [0, 0, 0],
  };

  execute(): AlignEulerToVectorOutputs {
    const target = this.inputs.vector || [0, 0, 1];
    const axis = this.inputs.axis || 'z';
    
    // Calculate rotation to align axis with target vector
    const rotation: [number, number, number] = [0, 0, 0];
    
    // Simplified alignment (full implementation would use quaternions)
    if (axis === 'z') {
      rotation[0] = Math.atan2(target[1], target[0]); // Yaw
      rotation[1] = Math.atan2(target[2], Math.sqrt(target[0]**2 + target[1]**2)); // Pitch
    } else if (axis === 'y') {
      rotation[0] = Math.atan2(target[2], target[0]);
      rotation[2] = Math.atan2(target[1], Math.sqrt(target[0]**2 + target[2]**2));
    } else { // x
      rotation[1] = Math.atan2(target[2], target[1]);
      rotation[2] = Math.atan2(target[0], Math.sqrt(target[1]**2 + target[2]**2));
    }
    
    this.outputs.rotation = rotation;
    return { rotation };
  }
}

/**
 * Rotate Euler Node
 * Applies additional rotation to Euler angles
 */
export class RotateEulerNode implements VectorNodeBase {
  readonly type = NodeTypes.RotateEuler;
  readonly name = 'Rotate Euler';
  
  inputs: RotateEulerInputs = {
    rotation: [0, 0, 0],
    angle: 0,
    axis: 'z',
    type: 'euler_xyz',
  };
  
  outputs: RotateEulerOutputs = {
    rotation: [0, 0, 0],
  };

  execute(): RotateEulerOutputs {
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
export class QuaternionNode implements VectorNodeBase {
  readonly type = NodeTypes.Quaternion;
  readonly name = 'Quaternion';
  
  inputs: QuaternionInputs = {
    quaternion: [1, 0, 0, 0],
    vector: [1, 0, 0],
    angle: 0,
    axis: [0, 0, 1],
  };
  
  outputs: QuaternionOutputs = {
    quaternion: [1, 0, 0, 0],
  };

  execute(): QuaternionOutputs {
    // Axis-angle to quaternion conversion
    const angle = this.inputs.angle ?? 0;
    const axis = this.inputs.axis || [0, 0, 1];
    const halfAngle = angle / 2;
    const sinHalf = Math.sin(halfAngle);
    
    const quaternion: [number, number, number, number] = [
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
export class MatrixTransformNode implements VectorNodeBase {
  readonly type = NodeTypes.MatrixTransform;
  readonly name = 'Matrix Transform';
  
  inputs: MatrixTransformInputs = {
    matrix: new Array(16).fill(0),
    vector: [1, 0, 0],
    transpose: false,
    inverse: false,
  };
  
  outputs: MatrixTransformOutputs = {
    vector: [0, 0, 0],
    matrix: [],
  };

  execute(): MatrixTransformOutputs {
    const matrix = this.inputs.matrix || new Array(16).fill(0);
    const vec = this.inputs.vector || [1, 0, 0];
    
    if (matrix.length !== 16) {
      return { vector: [...vec], matrix: [] };
    }
    
    const x = vec[0], y = vec[1], z = vec[2];
    
    const result: [number, number, number] = [
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
export class DirectionToPointNode implements VectorNodeBase {
  readonly type = NodeTypes.DirectionToPoint;
  readonly name = 'Direction to Point';
  
  inputs: DirectionToPointInputs = {
    from: [0, 0, 0],
    to: [0, 0, 1],
    up: [0, 1, 0],
  };
  
  outputs: DirectionToPointOutputs = {
    direction: [0, 0, 1],
    rotation: [0, 0, 0],
  };

  execute(): DirectionToPointOutputs {
    const from = this.inputs.from || [0, 0, 0];
    const to = this.inputs.to || [0, 0, 1];
    
    const direction: [number, number, number] = [
      to[0] - from[0],
      to[1] - from[1],
      to[2] - from[2],
    ];
    
    // Normalize
    const len = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    if (len > 0) {
      direction[0] /= len;
      direction[1] /= len;
      direction[2] /= len;
    }
    
    // Calculate rotation (simplified)
    const rotation: [number, number, number] = [
      Math.atan2(direction[1], direction[0]),
      Math.atan2(direction[2], Math.sqrt(direction[0]**2 + direction[1]**2)),
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
export class ReflectNode implements VectorNodeBase {
  readonly type = NodeTypes.Reflect;
  readonly name = 'Reflect';
  
  inputs: ReflectInputs = {
    vector: [1, 0, 0],
    normal: [0, 0, 1],
  };
  
  outputs: ReflectOutputs = {
    reflected: [1, 0, 0],
  };

  execute(): ReflectOutputs {
    const v = this.inputs.vector || [1, 0, 0];
    const n = this.inputs.normal || [0, 0, 1];
    
    // R = V - 2(V·N)N
    const dot = v[0]*n[0] + v[1]*n[1] + v[2]*n[2];
    const reflected: [number, number, number] = [
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
export class RefractNode implements VectorNodeBase {
  readonly type = NodeTypes.Refract;
  readonly name = 'Refract';
  
  inputs: RefractInputs = {
    vector: [1, 0, 0],
    normal: [0, 0, 1],
    ior: 1.5,
  };
  
  outputs: RefractOutputs = {
    refracted: [1, 0, 0],
  };

  execute(): RefractOutputs {
    const v = this.inputs.vector || [1, 0, 0];
    const n = this.inputs.normal || [0, 0, 1];
    const eta = this.inputs.ior ?? 1.5;
    
    const dot = v[0]*n[0] + v[1]*n[1] + v[2]*n[2];
    const k = 1 - eta * eta * (1 - dot * dot);
    
    let refracted: [number, number, number];
    if (k < 0) {
      // Total internal reflection
      refracted = [0, 0, 0];
    } else {
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
export class FaceForwardNode implements VectorNodeBase {
  readonly type = NodeTypes.FaceForward;
  readonly name = 'Face Forward';
  
  inputs: FaceForwardInputs = {
    vector: [0, 0, 1],
    reference: [0, 0, 1],
    normal: [0, 0, 1],
  };
  
  outputs: FaceForwardOutputs = {
    result: [0, 0, 1],
  };

  execute(): FaceForwardOutputs {
    const v = this.inputs.vector || [0, 0, 1];
    const ref = this.inputs.reference || [0, 0, 1];
    const n = this.inputs.normal || [0, 0, 1];
    
    const dot = ref[0]*n[0] + ref[1]*n[1] + ref[2]*n[2];
    
    const result: [number, number, number] = dot >= 0 ? [-v[0], -v[1], -v[2]] : [...v];
    
    this.outputs.result = result;
    return { result };
  }
}

/**
 * Wrap Node
 * Wraps vector values within min/max range
 */
export class WrapNode implements VectorNodeBase {
  readonly type = NodeTypes.Wrap;
  readonly name = 'Wrap';
  
  inputs: WrapInputs = {
    vector: [0, 0, 0],
    min: [0, 0, 0],
    max: [1, 1, 1],
  };
  
  outputs: WrapOutputs = {
    wrapped: [0, 0, 0],
  };

  execute(): WrapOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const min = this.inputs.min || [0, 0, 0];
    const max = this.inputs.max || [1, 1, 1];
    
    const wrapComponent = (val: number, minVal: number, maxVal: number): number => {
      const range = maxVal - minVal;
      if (range === 0) return minVal;
      return ((val - minVal) % range + range) % range + minVal;
    };
    
    const wrapped: [number, number, number] = [
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
export class SnapNode implements VectorNodeBase {
  readonly type = NodeTypes.Snap;
  readonly name = 'Snap';
  
  inputs: SnapInputs = {
    vector: [0, 0, 0],
    increment: [1, 1, 1],
  };
  
  outputs: SnapOutputs = {
    snapped: [0, 0, 0],
  };

  execute(): SnapOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const inc = this.inputs.increment || [1, 1, 1];
    
    const snapComponent = (val: number, increment: number): number => {
      if (increment === 0) return val;
      return Math.round(val / increment) * increment;
    };
    
    const snapped: [number, number, number] = [
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
export class FloorCeilNode implements VectorNodeBase {
  readonly type = NodeTypes.FloorCeil;
  readonly name = 'Floor/Ceil';
  
  inputs: FloorCeilInputs = {
    vector: [0, 0, 0],
    operation: 'floor',
  };
  
  outputs: FloorCeilOutputs = {
    result: [0, 0, 0],
  };

  execute(): FloorCeilOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const op = this.inputs.operation || 'floor';
    
    let result: [number, number, number];
    
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
export class ModuloNode implements VectorNodeBase {
  readonly type = NodeTypes.Modulo;
  readonly name = 'Modulo';
  
  inputs: ModuloInputs = {
    vector: [0, 0, 0],
    divisor: [1, 1, 1],
  };
  
  outputs: ModuloOutputs = {
    result: [0, 0, 0],
  };

  execute(): ModuloOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const d = this.inputs.divisor || [1, 1, 1];
    
    const modComponent = (val: number, div: number): number => {
      if (div === 0) return val;
      return ((val % div) + div) % div;
    };
    
    const result: [number, number, number] = [
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
export class FractionNode implements VectorNodeBase {
  readonly type = NodeTypes.Fraction;
  readonly name = 'Fraction';
  
  inputs: FractionInputs = {
    vector: [0, 0, 0],
  };
  
  outputs: FractionOutputs = {
    fraction: [0, 0, 0],
    whole: [0, 0, 0],
  };

  execute(): FractionOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    
    const whole: [number, number, number] = [
      Math.trunc(v[0]),
      Math.trunc(v[1]),
      Math.trunc(v[2]),
    ];
    
    const fraction: [number, number, number] = [
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
export class AbsoluteNode implements VectorNodeBase {
  readonly type = NodeTypes.Absolute;
  readonly name = 'Absolute';
  
  inputs: AbsoluteInputs = {
    vector: [0, 0, 0],
  };
  
  outputs: AbsoluteOutputs = {
    absolute: [0, 0, 0],
  };

  execute(): AbsoluteOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    
    const absolute: [number, number, number] = [
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
export class MinMaxNode implements VectorNodeBase {
  readonly type = NodeTypes.MinMax;
  readonly name = 'Min/Max';
  
  inputs: MinMaxInputs = {
    vector1: [0, 0, 0],
    vector2: [1, 1, 1],
    operation: 'min',
  };
  
  outputs: MinMaxOutputs = {
    result: [0, 0, 0],
  };

  execute(): MinMaxOutputs {
    const v1 = this.inputs.vector1 || [0, 0, 0];
    const v2 = this.inputs.vector2 || [1, 1, 1];
    const op = this.inputs.operation || 'min';
    
    const result: [number, number, number] = op === 'max' ? [
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
export class TrigonometryNode implements VectorNodeBase {
  readonly type = NodeTypes.Trigonometry;
  readonly name = 'Trigonometry';
  
  inputs: TrigonometryInputs = {
    vector: [0, 0, 0],
    operation: 'sin',
    value2: 0,
  };
  
  outputs: TrigonometryOutputs = {
    result: [0, 0, 0],
  };

  execute(): TrigonometryOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const op = this.inputs.operation || 'sin';
    
    const applyFunc = (val: number): number => {
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
    
    const result: [number, number, number] = [
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
export class PowerLogNode implements VectorNodeBase {
  readonly type = NodeTypes.PowerLog;
  readonly name = 'Power/Logarithm';
  
  inputs: PowerLogInputs = {
    vector: [0, 0, 0],
    base: Math.E,
    exponent: 2,
    operation: 'power',
  };
  
  outputs: PowerLogOutputs = {
    result: [0, 0, 0],
  };

  execute(): PowerLogOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const op = this.inputs.operation || 'power';
    const exp = this.inputs.exponent ?? 2;
    const base = this.inputs.base ?? Math.E;
    
    const applyFunc = (val: number): number => {
      switch (op) {
        case 'log': return val > 0 ? Math.log(val) / Math.log(base) : 0;
        case 'sqrt': return Math.sqrt(Math.abs(val));
        case 'inverse_sqrt': return val !== 0 ? 1 / Math.sqrt(Math.abs(val)) : 0;
        case 'square': return val * val;
        case 'power':
        default: return Math.pow(Math.abs(val), exp);
      }
    };
    
    const result: [number, number, number] = [
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
export class SignNode implements VectorNodeBase {
  readonly type = NodeTypes.Sign;
  readonly name = 'Sign';
  
  inputs: SignInputs = {
    vector: [0, 0, 0],
  };
  
  outputs: SignOutputs = {
    sign: [0, 0, 0],
  };

  execute(): SignOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    
    const signFunc = (val: number): number => {
      if (val > 0) return 1;
      if (val < 0) return -1;
      return 0;
    };
    
    const sign: [number, number, number] = [
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
export class CompareNode implements VectorNodeBase {
  readonly type = NodeTypes.Compare;
  readonly name = 'Compare';
  
  inputs: CompareInputs = {
    vector1: [0, 0, 0],
    vector2: [0, 0, 0],
    epsilon: 0.001,
    operation: 'equal',
  };
  
  outputs: CompareOutputs = {
    result: false,
    comparison: [0, 0, 0],
  };

  execute(): CompareOutputs {
    const v1 = this.inputs.vector1 || [0, 0, 0];
    const v2 = this.inputs.vector2 || [0, 0, 0];
    const eps = this.inputs.epsilon ?? 0.001;
    const op = this.inputs.operation || 'equal';
    
    const compareComponent = (a: number, b: number): number => {
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
    
    const comparison: [number, number, number] = [
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
export class SmoothMinMaxNode implements VectorNodeBase {
  readonly type = NodeTypes.SmoothMinMax;
  readonly name = 'Smooth Min/Max';
  
  inputs: SmoothMinMaxInputs = {
    vector1: [0, 0, 0],
    vector2: [1, 1, 1],
    smoothness: 0.1,
    operation: 'smooth_min',
  };
  
  outputs: SmoothMinMaxOutputs = {
    result: [0, 0, 0],
  };

  execute(): SmoothMinMaxOutputs {
    const v1 = this.inputs.vector1 || [0, 0, 0];
    const v2 = this.inputs.vector2 || [1, 1, 1];
    const k = this.inputs.smoothness ?? 0.1;
    const op = this.inputs.operation || 'smooth_min';
    
    const smoothMin = (a: number, b: number, k: number): number => {
      const h = Math.max(k - Math.abs(a - b), 0) / k;
      const smoothK = h * h * (3 - 2 * h);
      return Math.min(a, b) - k * smoothK / 6;
    };
    
    const smoothMax = (a: number, b: number, k: number): number => {
      const h = Math.max(k - Math.abs(a - b), 0) / k;
      const smoothK = h * h * (3 - 2 * h);
      return Math.max(a, b) + k * smoothK / 6;
    };
    
    const result: [number, number, number] = op === 'smooth_max' ? [
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
export class AngleBetweenNode implements VectorNodeBase {
  readonly type = NodeTypes.AngleBetween;
  readonly name = 'Angle Between';
  
  inputs: AngleBetweenInputs = {
    vector1: [1, 0, 0],
    vector2: [0, 1, 0],
  };
  
  outputs: AngleBetweenOutputs = {
    angle: 0,
    degrees: 0,
  };

  execute(): AngleBetweenOutputs {
    const v1 = this.inputs.vector1 || [1, 0, 0];
    const v2 = this.inputs.vector2 || [0, 1, 0];
    
    // Normalize
    const len1 = Math.sqrt(v1[0]**2 + v1[1]**2 + v1[2]**2);
    const len2 = Math.sqrt(v2[0]**2 + v2[1]**2 + v2[2]**2);
    
    if (len1 === 0 || len2 === 0) {
      return { angle: 0, degrees: 0 };
    }
    
    const normalized1: [number, number, number] = [v1[0]/len1, v1[1]/len1, v1[2]/len1];
    const normalized2: [number, number, number] = [v2[0]/len2, v2[1]/len2, v2[2]/len2];
    
    const dot = normalized1[0]*normalized2[0] + normalized1[1]*normalized2[1] + normalized1[2]*normalized2[2];
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
export class SlerpNode implements VectorNodeBase {
  readonly type = NodeTypes.Slerp;
  readonly name = 'Slerp';
  
  inputs: SlerpInputs = {
    start: [1, 0, 0],
    end: [0, 1, 0],
    factor: 0.5,
  };
  
  outputs: SlerpOutputs = {
    result: [1, 0, 0],
  };

  execute(): SlerpOutputs {
    const start = this.inputs.start || [1, 0, 0];
    const end = this.inputs.end || [0, 1, 0];
    const t = Math.max(0, Math.min(1, this.inputs.factor ?? 0.5));
    
    // Normalize
    const normalize = (v: [number, number, number]): [number, number, number] => {
      const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
      return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
    };
    
    const s = normalize(start);
    const e = normalize(end);
    
    const dot = s[0]*e[0] + s[1]*e[1] + s[2]*e[2];
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const theta = Math.acos(clampedDot);
    
    if (theta < 0.0001) {
      // Vectors are nearly parallel, use linear interpolation
      const result: [number, number, number] = [
        s[0] * (1 - t) + e[0] * t,
        s[1] * (1 - t) + e[1] * t,
        s[2] * (1 - t) + e[2] * t,
      ];
      return normalize(result);
    }
    
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;
    
    const result: [number, number, number] = [
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
export class PolarToCartNode implements VectorNodeBase {
  readonly type = NodeTypes.PolarToCart;
  readonly name = 'Polar to Cartesian';
  
  inputs: PolarToCartInputs = {
    radius: 1,
    angle: 0,
    z: 0,
  };
  
  outputs: PolarToCartOutputs = {
    x: 1,
    y: 0,
    z: 0,
    vector: [1, 0, 0],
  };

  execute(): PolarToCartOutputs {
    const r = this.inputs.radius ?? 1;
    const angle = this.inputs.angle ?? 0;
    const z = this.inputs.z ?? 0;
    
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    
    const vector: [number, number, number] = [x, y, z];
    
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
export class CartToPolarNode implements VectorNodeBase {
  readonly type = NodeTypes.CartToPolar;
  readonly name = 'Cartesian to Polar';
  
  inputs: CartToPolarInputs = {
    vector: [1, 0, 0],
  };
  
  outputs: CartToPolarOutputs = {
    radius: 1,
    angle: 0,
    z: 0,
  };

  execute(): CartToPolarOutputs {
    const v = this.inputs.vector || [1, 0, 0];
    
    const radius = Math.sqrt(v[0]**2 + v[1]**2);
    const angle = Math.atan2(v[1], v[0]);
    const z = v[2];
    
    this.outputs.radius = radius;
    this.outputs.angle = angle;
    this.outputs.z = z;
    return { radius, angle, z };
  }
}
