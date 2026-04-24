/**
 * Attribute Nodes - Attribute data flow and manipulation
 * Based on Blender geometry nodes attribute system
 * 
 * These nodes handle attribute storage, retrieval, and statistics
 */

import { NodeTypes } from '../core/node-types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AttributeNodeBase {
  type: NodeTypes;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
}

export interface StoreNamedAttributeInputs {
  domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
  dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
  name?: string;
  value?: any;
  selection?: boolean;
}

export interface StoreNamedAttributeOutputs {
  geometry: any;
}

export interface CaptureAttributeInputs {
  domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
  dataType?: 'float' | 'vec3' | 'color' | 'boolean' | 'integer';
  attribute?: any;
}

export interface CaptureAttributeOutputs {
  geometry: any;
  attribute: any;
}

export interface RemoveAttributeInputs {
  name?: string;
}

export interface RemoveAttributeOutputs {
  geometry: any;
}

export interface NamedAttributeInputs {
  name?: string;
}

export interface NamedAttributeOutputs {
  attribute: any;
  exists: boolean;
}

export interface AttributeStatisticInputs {
  domain?: 'point' | 'edge' | 'face' | 'instance';
  attribute?: any;
  selection?: boolean;
}

export interface AttributeStatisticOutputs {
  total: number;
  count: number;
  average: number;
  min: number;
  max: number;
  sum: number;
  range: number;
  variance: number;
  standardDeviation: number;
}

export interface SetPositionInputs {
  position?: [number, number, number];
  offset?: [number, number, number];
  selection?: boolean;
}

export interface SetPositionOutputs {
  position: [number, number, number];
}

export interface PositionInputNodeOutputs {
  position: [number, number, number];
}

export interface NormalInputNodeOutputs {
  normal: [number, number, number];
}

export interface TangentInputNodeOutputs {
  tangent: [number, number, number];
}

export interface UVMapInputNodeOutputs {
  uv: [number, number];
}

export interface ColorInputNodeOutputs {
  color: [number, number, number];
}

export interface RadiusInputNodeOutputs {
  radius: number;
}

export interface IdInputNodeOutputs {
  id: number;
}

export interface IndexInputNodeOutputs {
  index: number;
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Store Named Attribute Node
 * Stores an attribute with a custom name on geometry
 */
export class StoreNamedAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.StoreNamedAttribute;
  readonly name = 'Store Named Attribute';
  
  inputs: StoreNamedAttributeInputs = {
    domain: 'point',
    dataType: 'float',
    name: 'attribute',
    value: 0,
    selection: true,
  };
  
  outputs: StoreNamedAttributeOutputs = {
    geometry: null,
  };

  execute(geometry?: any): StoreNamedAttributeOutputs {
    const name = this.inputs.name || 'attribute';
    const value = this.inputs.value;
    const domain = this.inputs.domain || 'point';
    const selection = this.inputs.selection ?? true;
    
    // In production, would store attribute on geometry based on domain
    console.log(`Storing attribute '${name}' with value ${value} on ${domain} domain`);
    
    this.outputs.geometry = geometry;
    return this.outputs;
  }
}

/**
 * Capture Attribute Node
 * Captures attribute values for use in field context
 */
export class CaptureAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.CaptureAttribute;
  readonly name = 'Capture Attribute';
  
  inputs: CaptureAttributeInputs = {
    domain: 'point',
    dataType: 'float',
    attribute: 0,
  };
  
  outputs: CaptureAttributeOutputs = {
    geometry: null,
    attribute: null,
  };

  execute(geometry?: any): CaptureAttributeOutputs {
    const attribute = this.inputs.attribute;
    const domain = this.inputs.domain || 'point';
    
    // Capture attribute value in field context
    this.outputs.attribute = attribute;
    this.outputs.geometry = geometry;
    
    return this.outputs;
  }
}

/**
 * Remove Attribute Node
 * Removes a named attribute from geometry
 */
export class RemoveAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.RemoveAttribute;
  readonly name = 'Remove Attribute';
  
  inputs: RemoveAttributeInputs = {
    name: 'attribute',
  };
  
  outputs: RemoveAttributeOutputs = {
    geometry: null,
  };

  execute(geometry?: any): RemoveAttributeOutputs {
    const name = this.inputs.name || 'attribute';
    
    // In production, would remove attribute from geometry
    console.log(`Removing attribute '${name}'`);
    
    this.outputs.geometry = geometry;
    return this.outputs;
  }
}

/**
 * Named Attribute Node
 * Retrieves a named attribute from geometry
 */
export class NamedAttributeNode implements AttributeNodeBase {
  readonly type = NodeTypes.NamedAttribute;
  readonly name = 'Named Attribute';
  
  inputs: NamedAttributeInputs = {
    name: 'attribute',
  };
  
  outputs: NamedAttributeOutputs = {
    attribute: null,
    exists: false,
  };

  execute(geometry?: any): NamedAttributeOutputs {
    const name = this.inputs.name || 'attribute';
    
    // In production, would retrieve attribute from geometry
    // For now, simulate existence check
    this.outputs.exists = true;
    this.outputs.attribute = null;
    
    return this.outputs;
  }
}

/**
 * Attribute Statistic Node
 * Calculates statistics for an attribute
 */
export class AttributeStatisticNode implements AttributeNodeBase {
  readonly type = NodeTypes.AttributeStatistic;
  readonly name = 'Attribute Statistic';
  
  inputs: AttributeStatisticInputs = {
    domain: 'point',
    attribute: [],
    selection: true,
  };
  
  outputs: AttributeStatisticOutputs = {
    total: 0,
    count: 0,
    average: 0,
    min: 0,
    max: 0,
    sum: 0,
    range: 0,
    variance: 0,
    standardDeviation: 0,
  };

  execute(): AttributeStatisticOutputs {
    const attribute = this.inputs.attribute || [];
    const selection = this.inputs.selection ?? true;
    
    if (!Array.isArray(attribute) || attribute.length === 0) {
      return this.outputs;
    }
    
    const values = attribute.filter((_, i) => selection);
    const count = values.length;
    
    if (count === 0) {
      return this.outputs;
    }
    
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / count;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);
    
    this.outputs.total = count;
    this.outputs.count = count;
    this.outputs.average = average;
    this.outputs.min = min;
    this.outputs.max = max;
    this.outputs.sum = sum;
    this.outputs.range = range;
    this.outputs.variance = variance;
    this.outputs.standardDeviation = standardDeviation;
    
    return this.outputs;
  }
}

/**
 * Set Position Node
 * Sets the position of points in geometry
 */
export class SetPositionNode implements AttributeNodeBase {
  readonly type = NodeTypes.SetPosition;
  readonly name = 'Set Position';
  
  inputs: SetPositionInputs = {
    position: [0, 0, 0],
    offset: [0, 0, 0],
    selection: true,
  };
  
  outputs: SetPositionOutputs = {
    position: [0, 0, 0],
  };

  execute(): SetPositionOutputs {
    const position = this.inputs.position || [0, 0, 0];
    const offset = this.inputs.offset || [0, 0, 0];
    
    this.outputs.position = [
      position[0] + offset[0],
      position[1] + offset[1],
      position[2] + offset[2],
    ];
    
    return this.outputs;
  }
}

/**
 * Position Input Node
 * Provides position attribute access
 */
export class PositionInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.PositionInput;
  readonly name = 'Position';
  
  inputs: Record<string, any> = {};
  
  outputs: PositionInputNodeOutputs = {
    position: [0, 0, 0],
  };

  execute(position?: [number, number, number]): PositionInputNodeOutputs {
    this.outputs.position = position || [0, 0, 0];
    return this.outputs;
  }
}

/**
 * Normal Input Node
 * Provides normal attribute access
 */
export class NormalInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.NormalInput;
  readonly name = 'Normal';
  
  inputs: Record<string, any> = {};
  
  outputs: NormalInputNodeOutputs = {
    normal: [0, 0, 1],
  };

  execute(normal?: [number, number, number]): NormalInputNodeOutputs {
    this.outputs.normal = normal || [0, 0, 1];
    return this.outputs;
  }
}

/**
 * Tangent Input Node
 * Provides tangent attribute access
 */
export class TangentInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.TangentInput;
  readonly name = 'Tangent';
  
  inputs: Record<string, any> = {};
  
  outputs: TangentInputNodeOutputs = {
    tangent: [1, 0, 0],
  };

  execute(tangent?: [number, number, number]): TangentInputNodeOutputs {
    this.outputs.tangent = tangent || [1, 0, 0];
    return this.outputs;
  }
}

/**
 * UV Map Input Node
 * Provides UV coordinate access
 */
export class UVMapInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.UVMapInput;
  readonly name = 'UV Map';
  
  inputs: Record<string, any> = {};
  
  outputs: UVMapInputNodeOutputs = {
    uv: [0, 0],
  };

  execute(uv?: [number, number]): UVMapInputNodeOutputs {
    this.outputs.uv = uv || [0, 0];
    return this.outputs;
  }
}

/**
 * Color Input Node
 * Provides color attribute access
 */
export class ColorInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.ColorInput;
  readonly name = 'Color';
  
  inputs: Record<string, any> = {};
  
  outputs: ColorInputNodeOutputs = {
    color: [1, 1, 1],
  };

  execute(color?: [number, number, number]): ColorInputNodeOutputs {
    this.outputs.color = color || [1, 1, 1];
    return this.outputs;
  }
}

/**
 * Radius Input Node
 * Provides radius attribute access (for curves/points)
 */
export class RadiusInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.RadiusInput;
  readonly name = 'Radius';
  
  inputs: Record<string, any> = {};
  
  outputs: RadiusInputNodeOutputs = {
    radius: 1,
  };

  execute(radius?: number): RadiusInputNodeOutputs {
    this.outputs.radius = radius ?? 1;
    return this.outputs;
  }
}

/**
 * ID Input Node
 * Provides unique ID attribute access
 */
export class IdInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.IdInput;
  readonly name = 'ID';
  
  inputs: Record<string, any> = {};
  
  outputs: IdInputNodeOutputs = {
    id: 0,
  };

  execute(id?: number): IdInputNodeOutputs {
    this.outputs.id = id ?? 0;
    return this.outputs;
  }
}

/**
 * Index Input Node
 * Provides index attribute access
 */
export class IndexInputNode implements AttributeNodeBase {
  readonly type = NodeTypes.IndexInput;
  readonly name = 'Index';
  
  inputs: Record<string, any> = {};
  
  outputs: IndexInputNodeOutputs = {
    index: 0,
  };

  execute(index?: number): IndexInputNodeOutputs {
    this.outputs.index = index ?? 0;
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createStoreNamedAttributeNode(inputs?: Partial<StoreNamedAttributeInputs>): StoreNamedAttributeNode {
  const node = new StoreNamedAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createCaptureAttributeNode(inputs?: Partial<CaptureAttributeInputs>): CaptureAttributeNode {
  const node = new CaptureAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createRemoveAttributeNode(inputs?: Partial<RemoveAttributeInputs>): RemoveAttributeNode {
  const node = new RemoveAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createNamedAttributeNode(inputs?: Partial<NamedAttributeInputs>): NamedAttributeNode {
  const node = new NamedAttributeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createAttributeStatisticNode(inputs?: Partial<AttributeStatisticInputs>): AttributeStatisticNode {
  const node = new AttributeStatisticNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createSetPositionNode(inputs?: Partial<SetPositionInputs>): SetPositionNode {
  const node = new SetPositionNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createPositionInputNode(): PositionInputNode {
  return new PositionInputNode();
}

export function createNormalInputNode(): NormalInputNode {
  return new NormalInputNode();
}

export function createTangentInputNode(): TangentInputNode {
  return new TangentInputNode();
}

export function createUVMapInputNode(): UVMapInputNode {
  return new UVMapInputNode();
}

export function createColorInputNode(): ColorInputNode {
  return new ColorInputNode();
}

export function createRadiusInputNode(): RadiusInputNode {
  return new RadiusInputNode();
}

export function createIdInputNode(): IdInputNode {
  return new IdInputNode();
}

export function createIndexInputNode(): IndexInputNode {
  return new IndexInputNode();
}
