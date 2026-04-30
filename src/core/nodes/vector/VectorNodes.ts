/**
 * Vector Nodes - Mathematical vector operations
 * Based on Blender vector math nodes and infinigen geometry processing
 * 
 * These nodes handle all vector mathematics needed for procedural generation
 */

import { NodeTypes } from '../core/node-types';
import type { Vector3 } from 'three';

// ============================================================================
// Type Definitions
// ============================================================================

export interface VectorNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

export interface VectorMathInputs {
  operation?: 'add' | 'subtract' | 'multiply' | 'divide' | 'cross_product' | 'project' | 'reflect' | 
              'refract' | 'faceforward' | 'dot_product' | 'distance' | 'length' | 'scale' | 
              'normalize' | 'wrap' | 'snap' | 'floor' | 'ceiling' | 'modulus' | 'fraction' | 
              'absolute' | 'minimum' | 'maximum' | 'sine' | 'cosine' | 'tangent' | 'arcsine' | 
              'arccosine' | 'arctangent' | 'arctan2' | 'hyperbolic_sine' | 'hyperbolic_cosine' | 
              'hyperbolic_tangent' | 'radians' | 'degrees' | 'power' | 'logarithm' | 'square_root' | 
              'inverse_square_root' | 'sign' | 'compare' | 'smooth_minimum' | 'smooth_maximum';
  vector1?: [number, number, number];
  vector2?: [number, number, number];
  value?: number;
  scale?: number;
  clamp?: boolean;
}

export interface VectorMathOutputs {
  vector: [number, number, number];
  value: number;
}

export interface VectorRotateInputs {
  rotationType?: 'euler_xyz' | 'axis_angle' | 'quaternion' | 'direction_to_point' | 'align_vectors';
  vector?: [number, number, number];
  center?: [number, number, number];
  angle?: number;
  axis?: [number, number, number];
  quaternion?: [number, number, number, number];
  target?: [number, number, number];
  source?: [number, number, number];
  pivot?: [number, number, number];
}

export interface VectorRotateOutputs {
  vector: [number, number, number];
}

export interface VectorTransformInputs {
  transformType?: 'point' | 'vector' | 'normal';
  vector?: [number, number, number];
  fromSpace?: 'world' | 'object' | 'camera' | 'light';
  toSpace?: 'world' | 'object' | 'camera' | 'light';
  objectMatrix?: number[];
}

export interface VectorTransformOutputs {
  vector: [number, number, number];
}

export interface NormalMapInputs {
  strength?: number;
  distance?: number;
  color?: [number, number, number];
  direction?: 'tangent' | 'object' | 'world' | 'camera';
  space?: 'tangent' | 'object' | 'world' | 'camera';
}

export interface NormalMapOutputs {
  normal: [number, number, number];
}

export interface BumpInputs {
  height?: number;
  strength?: number;
  distance?: number;
  useNormalMap?: boolean;
  invert?: boolean;
  normal?: [number, number, number];
}

export interface BumpOutputs {
  normal: [number, number, number];
}

export interface DisplacementInputs {
  height?: number;
  midlevel?: number;
  scale?: number;
  direction?: 'normal' | 'x' | 'y' | 'z';
}

export interface DisplacementOutputs {
  displacement: [number, number, number];
}

export interface MappingInputs {
  vector?: [number, number, number];
  translation?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  type?: 'point' | 'texture' | 'vector' | 'normal';
  min?: [number, number, number];
  max?: [number, number, number];
  useMin?: boolean;
  useMax?: boolean;
}

export interface MappingOutputs {
  vector: [number, number, number];
}

export interface CombineXYZInputs {
  x?: number;
  y?: number;
  z?: number;
}

export interface CombineXYZOutputs {
  vector: [number, number, number];
}

export interface SeparateXYZInputs {
  vector?: [number, number, number];
}

export interface SeparateXYZOutputs {
  x: number;
  y: number;
  z: number;
}

export interface NormalizeInputs {
  vector?: [number, number, number];
}

export interface NormalizeOutputs {
  vector: [number, number, number];
  length: number;
}

export interface AlignEulerToVectorInputs {
  vector?: [number, number, number];
  axis?: 'x' | 'y' | 'z';
  pivotAxis?: 'x' | 'y' | 'z';
}

export interface AlignEulerToVectorOutputs {
  rotation: [number, number, number];
}

export interface RotateEulerInputs {
  rotation?: [number, number, number];
  angle?: number;
  axis?: 'x' | 'y' | 'z';
}

export interface RotateEulerOutputs {
  rotation: [number, number, number];
}

export interface QuaternionInputs {
  quaternion?: [number, number, number, number];
  vector?: [number, number, number];
  angle?: number;
  axis?: [number, number, number];
}

export interface QuaternionOutputs {
  quaternion: [number, number, number, number];
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Vector Math Node
 * Performs various mathematical operations on vectors
 */
export class VectorMathNode implements VectorNodeBase {
  readonly type = NodeTypes.VectorMath;
  readonly name = 'Vector Math';
  
  inputs: VectorMathInputs = {
    operation: 'add',
    vector1: [1, 0, 0],
    vector2: [0, 1, 0],
    value: 1,
    scale: 1,
    clamp: false,
  };
  
  outputs: VectorMathOutputs = {
    vector: [0, 0, 0],
    value: 0,
  };

  execute(): VectorMathOutputs {
    const op = this.inputs.operation || 'add';
    const v1 = this.inputs.vector1 || [0, 0, 0];
    const v2 = this.inputs.vector2 || [0, 0, 0];
    const val = this.inputs.value ?? 1;
    
    let result: [number, number, number] = [0, 0, 0];
    let scalarValue = 0;
    
    switch (op) {
      case 'add':
        result = [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
        break;
      case 'subtract':
        result = [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
        break;
      case 'multiply':
        result = [v1[0] * v2[0], v1[1] * v2[1], v1[2] * v2[2]];
        break;
      case 'divide':
        result = [
          v2[0] !== 0 ? v1[0] / v2[0] : 0,
          v2[1] !== 0 ? v1[1] / v2[1] : 0,
          v2[2] !== 0 ? v1[2] / v2[2] : 0,
        ];
        break;
      case 'cross_product':
        result = [
          v1[1] * v2[2] - v1[2] * v2[1],
          v1[2] * v2[0] - v1[0] * v2[2],
          v1[0] * v2[1] - v1[1] * v2[0],
        ];
        break;
      case 'dot_product':
        scalarValue = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
        break;
      case 'length':
        scalarValue = Math.sqrt(v1[0]**2 + v1[1]**2 + v1[2]**2);
        break;
      case 'distance':
        scalarValue = Math.sqrt(
          (v1[0] - v2[0])**2 + (v1[1] - v2[1])**2 + (v1[2] - v2[2])**2
        );
        break;
      case 'normalize':
        const len = Math.sqrt(v1[0]**2 + v1[1]**2 + v1[2]**2);
        result = len > 0 ? [v1[0]/len, v1[1]/len, v1[2]/len] : [0, 0, 0];
        scalarValue = len;
        break;
      case 'scale':
        const s = this.inputs.scale ?? 1;
        result = [v1[0] * s, v1[1] * s, v1[2] * s];
        break;
      case 'project':
        const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
        const v2LenSq = v2[0]**2 + v2[1]**2 + v2[2]**2;
        if (v2LenSq > 0) {
          const factor = dot / v2LenSq;
          result = [v2[0]*factor, v2[1]*factor, v2[2]*factor];
        }
        break;
      case 'reflect':
        const n = this.normalize(v2);
        const d = v1[0]*n[0] + v1[1]*n[1] + v1[2]*n[2];
        result = [v1[0] - 2*d*n[0], v1[1] - 2*d*n[1], v1[2] - 2*d*n[2]];
        break;
      case 'floor':
        result = [Math.floor(v1[0]), Math.floor(v1[1]), Math.floor(v1[2])];
        break;
      case 'ceiling':
        result = [Math.ceil(v1[0]), Math.ceil(v1[1]), Math.ceil(v1[2])];
        break;
      case 'absolute':
        result = [Math.abs(v1[0]), Math.abs(v1[1]), Math.abs(v1[2])];
        break;
      case 'minimum':
        result = [
          Math.min(v1[0], v2[0]),
          Math.min(v1[1], v2[1]),
          Math.min(v1[2], v2[2]),
        ];
        break;
      case 'maximum':
        result = [
          Math.max(v1[0], v2[0]),
          Math.max(v1[1], v2[1]),
          Math.max(v1[2], v2[2]),
        ];
        break;
      case 'sine':
        result = [Math.sin(v1[0]), Math.sin(v1[1]), Math.sin(v1[2])];
        break;
      case 'cosine':
        result = [Math.cos(v1[0]), Math.cos(v1[1]), Math.cos(v1[2])];
        break;
      case 'modulo':
      case 'modulus':
        result = [
          v1[0] % v2[0],
          v1[1] % v2[1],
          v1[2] % v2[2],
        ];
        break;
      case 'fraction':
        result = [
          v1[0] - Math.floor(v1[0]),
          v1[1] - Math.floor(v1[1]),
          v1[2] - Math.floor(v1[2]),
        ];
        break;
      case 'square_root':
        result = [
          Math.sqrt(Math.abs(v1[0])),
          Math.sqrt(Math.abs(v1[1])),
          Math.sqrt(Math.abs(v1[2])),
        ];
        break;
      default:
        result = [...v1];
    }
    
    if (this.inputs.clamp) {
      result = [
        Math.max(-1, Math.min(1, result[0])),
        Math.max(-1, Math.min(1, result[1])),
        Math.max(-1, Math.min(1, result[2])),
      ] as [number, number, number];
    }
    
    this.outputs.vector = result;
    this.outputs.value = scalarValue;
    
    return this.outputs;
  }

  private normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
    return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
  }
}

/**
 * Vector Rotate Node
 * Rotates a vector using various methods
 */
export class VectorRotateNode implements VectorNodeBase {
  readonly type = NodeTypes.VectorRotate;
  readonly name = 'Vector Rotate';
  
  inputs: VectorRotateInputs = {
    rotationType: 'euler_xyz',
    vector: [1, 0, 0],
    center: [0, 0, 0],
    angle: 0,
    axis: [0, 0, 1],
    quaternion: [1, 0, 0, 0],
    target: [0, 1, 0],
    source: [1, 0, 0],
    pivot: [0, 0, 0],
  };
  
  outputs: VectorRotateOutputs = {
    vector: [0, 0, 0],
  };

  execute(): VectorRotateOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const center = this.inputs.center || [0, 0, 0];
    const type = this.inputs.rotationType || 'euler_xyz';
    
    // Translate to origin
    const translated = [v[0] - center[0], v[1] - center[1], v[2] - center[2]] as [number, number, number];
    
    let rotated: [number, number, number];
    
    switch (type) {
      case 'axis_angle':
        rotated = this.rotateAxisAngle(translated, this.inputs.axis || [0, 0, 1], this.inputs.angle || 0);
        break;
      case 'quaternion':
        rotated = this.rotateQuaternion(translated, this.inputs.quaternion || [1, 0, 0, 0]);
        break;
      case 'direction_to_point':
        rotated = this.rotateDirectionToPoint(translated, this.inputs.source || [1, 0, 0], this.inputs.target || [0, 1, 0]);
        break;
      default:
        rotated = translated;
    }
    
    // Translate back
    this.outputs.vector = [
      rotated[0] + center[0],
      rotated[1] + center[1],
      rotated[2] + center[2],
    ];
    
    return this.outputs;
  }

  private rotateAxisAngle(v: [number, number, number], axis: [number, number, number], angle: number): [number, number, number] {
    const normalizedAxis = this.normalize(axis);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const oneMinusCos = 1 - cos;
    
    const x = normalizedAxis[0];
    const y = normalizedAxis[1];
    const z = normalizedAxis[2];
    
    return [
      (oneMinusCos * x * x + cos) * v[0] + (oneMinusCos * x * y - z * sin) * v[1] + (oneMinusCos * x * z + y * sin) * v[2],
      (oneMinusCos * x * y + z * sin) * v[0] + (oneMinusCos * y * y + cos) * v[1] + (oneMinusCos * y * z - x * sin) * v[2],
      (oneMinusCos * x * z - y * sin) * v[0] + (oneMinusCos * y * z + x * sin) * v[1] + (oneMinusCos * z * z + cos) * v[2],
    ];
  }

  private rotateQuaternion(v: [number, number, number], q: [number, number, number, number]): [number, number, number] {
    const [qw, qx, qy, qz] = q;
    const [x, y, z] = v;
    
    return [
      x * (1 - 2*qy*qy - 2*qz*qz) + y * (2*qx*qy - 2*qz*qw) + z * (2*qx*qz + 2*qy*qw),
      x * (2*qx*qy + 2*qz*qw) + y * (1 - 2*qx*qx - 2*qz*qz) + z * (2*qy*qz - 2*qx*qw),
      x * (2*qx*qz - 2*qy*qw) + y * (2*qy*qz + 2*qx*qw) + z * (1 - 2*qx*qx - 2*qy*qy),
    ];
  }

  private rotateDirectionToPoint(v: [number, number, number], source: [number, number, number], target: [number, number, number]): [number, number, number] {
    // Simplified implementation
    return v;
  }

  private normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
    return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
  }
}

/**
 * Combine XYZ Node
 * Combines X, Y, Z components into a vector
 */
export class CombineXYZNode implements VectorNodeBase {
  readonly type = NodeTypes.CombineXYZ;
  readonly name = 'Combine XYZ';
  
  inputs: CombineXYZInputs = {
    x: 0,
    y: 0,
    z: 0,
  };
  
  outputs: CombineXYZOutputs = {
    vector: [0, 0, 0],
  };

  execute(): CombineXYZOutputs {
    this.outputs.vector = [
      this.inputs.x || 0,
      this.inputs.y || 0,
      this.inputs.z || 0,
    ];
    return this.outputs;
  }
}

/**
 * Separate XYZ Node
 * Separates a vector into X, Y, Z components
 */
export class SeparateXYZNode implements VectorNodeBase {
  readonly type = NodeTypes.SeparateXYZ;
  readonly name = 'Separate XYZ';
  
  inputs: SeparateXYZInputs = {
    vector: [0, 0, 0],
  };
  
  outputs: SeparateXYZOutputs = {
    x: 0,
    y: 0,
    z: 0,
  };

  execute(): SeparateXYZOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    this.outputs.x = v[0];
    this.outputs.y = v[1];
    this.outputs.z = v[2];
    return this.outputs;
  }
}

/**
 * Normalize Node
 * Normalizes a vector to unit length
 */
export class NormalizeNode implements VectorNodeBase {
  readonly type = NodeTypes.Normalize;
  readonly name = 'Normalize';
  
  inputs: NormalizeInputs = {
    vector: [1, 0, 0],
  };
  
  outputs: NormalizeOutputs = {
    vector: [0, 0, 0],
    length: 0,
  };

  execute(): NormalizeOutputs {
    const v = this.inputs.vector || [0, 0, 0];
    const length = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
    
    if (length > 0) {
      this.outputs.vector = [v[0]/length, v[1]/length, v[2]/length];
    } else {
      this.outputs.vector = [0, 0, 0];
    }
    
    this.outputs.length = length;
    return this.outputs;
  }
}

/**
 * Mapping Node
 * Transforms a vector through translation, rotation, and scale
 */
export class MappingNode implements VectorNodeBase {
  readonly type = NodeTypes.Mapping;
  readonly name = 'Mapping';
  
  inputs: MappingInputs = {
    vector: [0, 0, 0],
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    type: 'point',
    useMin: false,
    useMax: false,
    min: [-1, -1, -1],
    max: [1, 1, 1],
  };
  
  outputs: MappingOutputs = {
    vector: [0, 0, 0],
  };

  execute(): MappingOutputs {
    let v = [...(this.inputs.vector || [0, 0, 0])] as [number, number, number];
    
    // Apply scale
    const scale = this.inputs.scale || [1, 1, 1];
    v = [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]] as [number, number, number];
    
    // Apply rotation (simplified Euler)
    const rot = this.inputs.rotation || [0, 0, 0];
    v = this.rotateEuler(v, rot[0], rot[1], rot[2]);
    
    // Apply translation
    const trans = this.inputs.translation || [0, 0, 0];
    v = [v[0] + trans[0], v[1] + trans[1], v[2] + trans[2]] as [number, number, number];
    
    // Apply clamping
    if (this.inputs.useMin && this.inputs.useMax) {
      const min = this.inputs.min || [-1, -1, -1];
      const max = this.inputs.max || [1, 1, 1];
      v = [
        Math.max(min[0], Math.min(max[0], v[0])),
        Math.max(min[1], Math.min(max[1], v[1])),
        Math.max(min[2], Math.min(max[2], v[2])),
      ] as [number, number, number];
    }
    
    this.outputs.vector = v;
    return this.outputs;
  }

  private rotateEuler(v: [number, number, number], rx: number, ry: number, rz: number): [number, number, number] {
    // Apply rotations around X, Y, Z axes
    let result = v;
    
    // Rotation around X
    if (rx !== 0) {
      const cos = Math.cos(rx);
      const sin = Math.sin(rx);
      result = [
        result[0],
        result[1] * cos - result[2] * sin,
        result[1] * sin + result[2] * cos,
      ];
    }
    
    // Rotation around Y
    if (ry !== 0) {
      const cos = Math.cos(ry);
      const sin = Math.sin(ry);
      result = [
        result[0] * cos + result[2] * sin,
        result[1],
        -result[0] * sin + result[2] * cos,
      ];
    }
    
    // Rotation around Z
    if (rz !== 0) {
      const cos = Math.cos(rz);
      const sin = Math.sin(rz);
      result = [
        result[0] * cos - result[1] * sin,
        result[0] * sin + result[1] * cos,
        result[2],
      ];
    }
    
    return result;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createVectorMathNode(inputs?: Partial<VectorMathInputs>): VectorMathNode {
  const node = new VectorMathNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createVectorRotateNode(inputs?: Partial<VectorRotateInputs>): VectorRotateNode {
  const node = new VectorRotateNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCombineXYZNode(inputs?: Partial<CombineXYZInputs>): CombineXYZNode {
  const node = new CombineXYZNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSeparateXYZNode(inputs?: Partial<SeparateXYZInputs>): SeparateXYZNode {
  const node = new SeparateXYZNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createNormalizeNode(inputs?: Partial<NormalizeInputs>): NormalizeNode {
  const node = new NormalizeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMappingNode(inputs?: Partial<MappingInputs>): MappingNode {
  const node = new MappingNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}
