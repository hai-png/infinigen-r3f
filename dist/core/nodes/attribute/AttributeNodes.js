/**
 * Attribute Nodes - Attribute data flow and manipulation
 * Based on Blender geometry nodes attribute system
 *
 * These nodes handle attribute storage, retrieval, and statistics
 */
import { NodeTypes } from '../core/node-types';
// ============================================================================
// Node Implementations
// ============================================================================
/**
 * Store Named Attribute Node
 * Stores an attribute with a custom name on geometry
 */
export class StoreNamedAttributeNode {
    constructor() {
        this.type = NodeTypes.StoreNamedAttribute;
        this.name = 'Store Named Attribute';
        this.inputs = {
            domain: 'point',
            dataType: 'float',
            name: 'attribute',
            value: 0,
            selection: true,
        };
        this.outputs = {
            geometry: null,
        };
    }
    execute(geometry) {
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
export class CaptureAttributeNode {
    constructor() {
        this.type = NodeTypes.CaptureAttribute;
        this.name = 'Capture Attribute';
        this.inputs = {
            domain: 'point',
            dataType: 'float',
            attribute: 0,
        };
        this.outputs = {
            geometry: null,
            attribute: null,
        };
    }
    execute(geometry) {
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
export class RemoveAttributeNode {
    constructor() {
        this.type = NodeTypes.RemoveAttribute;
        this.name = 'Remove Attribute';
        this.inputs = {
            name: 'attribute',
        };
        this.outputs = {
            geometry: null,
        };
    }
    execute(geometry) {
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
export class NamedAttributeNode {
    constructor() {
        this.type = NodeTypes.NamedAttribute;
        this.name = 'Named Attribute';
        this.inputs = {
            name: 'attribute',
        };
        this.outputs = {
            attribute: null,
            exists: false,
        };
    }
    execute(geometry) {
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
export class AttributeStatisticNode {
    constructor() {
        this.type = NodeTypes.AttributeStatistic;
        this.name = 'Attribute Statistic';
        this.inputs = {
            domain: 'point',
            attribute: [],
            selection: true,
        };
        this.outputs = {
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
    }
    execute() {
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
export class SetPositionNode {
    constructor() {
        this.type = NodeTypes.SetPosition;
        this.name = 'Set Position';
        this.inputs = {
            position: [0, 0, 0],
            offset: [0, 0, 0],
            selection: true,
        };
        this.outputs = {
            position: [0, 0, 0],
        };
    }
    execute() {
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
export class PositionInputNode {
    constructor() {
        this.type = NodeTypes.PositionInput;
        this.name = 'Position';
        this.inputs = {};
        this.outputs = {
            position: [0, 0, 0],
        };
    }
    execute(position) {
        this.outputs.position = position || [0, 0, 0];
        return this.outputs;
    }
}
/**
 * Normal Input Node
 * Provides normal attribute access
 */
export class NormalInputNode {
    constructor() {
        this.type = NodeTypes.NormalInput;
        this.name = 'Normal';
        this.inputs = {};
        this.outputs = {
            normal: [0, 0, 1],
        };
    }
    execute(normal) {
        this.outputs.normal = normal || [0, 0, 1];
        return this.outputs;
    }
}
/**
 * Tangent Input Node
 * Provides tangent attribute access
 */
export class TangentInputNode {
    constructor() {
        this.type = NodeTypes.TangentInput;
        this.name = 'Tangent';
        this.inputs = {};
        this.outputs = {
            tangent: [1, 0, 0],
        };
    }
    execute(tangent) {
        this.outputs.tangent = tangent || [1, 0, 0];
        return this.outputs;
    }
}
/**
 * UV Map Input Node
 * Provides UV coordinate access
 */
export class UVMapInputNode {
    constructor() {
        this.type = NodeTypes.UVMapInput;
        this.name = 'UV Map';
        this.inputs = {};
        this.outputs = {
            uv: [0, 0],
        };
    }
    execute(uv) {
        this.outputs.uv = uv || [0, 0];
        return this.outputs;
    }
}
/**
 * Color Input Node
 * Provides color attribute access
 */
export class ColorInputNode {
    constructor() {
        this.type = NodeTypes.ColorInput;
        this.name = 'Color';
        this.inputs = {};
        this.outputs = {
            color: [1, 1, 1],
        };
    }
    execute(color) {
        this.outputs.color = color || [1, 1, 1];
        return this.outputs;
    }
}
/**
 * Radius Input Node
 * Provides radius attribute access (for curves/points)
 */
export class RadiusInputNode {
    constructor() {
        this.type = NodeTypes.RadiusInput;
        this.name = 'Radius';
        this.inputs = {};
        this.outputs = {
            radius: 1,
        };
    }
    execute(radius) {
        this.outputs.radius = radius ?? 1;
        return this.outputs;
    }
}
/**
 * ID Input Node
 * Provides unique ID attribute access
 */
export class IdInputNode {
    constructor() {
        this.type = NodeTypes.IdInput;
        this.name = 'ID';
        this.inputs = {};
        this.outputs = {
            id: 0,
        };
    }
    execute(id) {
        this.outputs.id = id ?? 0;
        return this.outputs;
    }
}
/**
 * Index Input Node
 * Provides index attribute access
 */
export class IndexInputNode {
    constructor() {
        this.type = NodeTypes.IndexInput;
        this.name = 'Index';
        this.inputs = {};
        this.outputs = {
            index: 0,
        };
    }
    execute(index) {
        this.outputs.index = index ?? 0;
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createStoreNamedAttributeNode(inputs) {
    const node = new StoreNamedAttributeNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createCaptureAttributeNode(inputs) {
    const node = new CaptureAttributeNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createRemoveAttributeNode(inputs) {
    const node = new RemoveAttributeNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createNamedAttributeNode(inputs) {
    const node = new NamedAttributeNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createAttributeStatisticNode(inputs) {
    const node = new AttributeStatisticNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createSetPositionNode(inputs) {
    const node = new SetPositionNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createPositionInputNode() {
    return new PositionInputNode();
}
export function createNormalInputNode() {
    return new NormalInputNode();
}
export function createTangentInputNode() {
    return new TangentInputNode();
}
export function createUVMapInputNode() {
    return new UVMapInputNode();
}
export function createColorInputNode() {
    return new ColorInputNode();
}
export function createRadiusInputNode() {
    return new RadiusInputNode();
}
export function createIdInputNode() {
    return new IdInputNode();
}
export function createIndexInputNode() {
    return new IndexInputNode();
}
//# sourceMappingURL=AttributeNodes.js.map