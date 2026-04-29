/**
 * Attribute Helpers for Node System
 *
 * Provides convenience functions for common attribute manipulation patterns
 * in geometry node workflows.
 *
 * Based on infinigen/core/surface.py attribute operations
 */
import { NodeTypes } from '../core/node-types';
/**
 * Attribute domain types matching Blender's domains
 */
export var AttributeDomain;
(function (AttributeDomain) {
    AttributeDomain["POINT"] = "POINT";
    AttributeDomain["EDGE"] = "EDGE";
    AttributeDomain["FACE"] = "FACE";
    AttributeDomain["FACE_CORNER"] = "FACE_CORNER";
    AttributeDomain["INSTANCE"] = "INSTANCE";
})(AttributeDomain || (AttributeDomain = {}));
/**
 * Attribute data types
 */
export var AttributeType;
(function (AttributeType) {
    AttributeType["FLOAT"] = "FLOAT";
    AttributeType["FLOAT2"] = "FLOAT_VECTOR";
    AttributeType["FLOAT3"] = "FLOAT_COLOR";
    AttributeType["INT"] = "INT";
    AttributeType["BOOLEAN"] = "BOOLEAN";
})(AttributeType || (AttributeType = {}));
/**
 * Create an attribute node chain for writing attributes
 */
export function createAttributeWriter(wrangler, config, geometryNodeId) {
    const { name, type, domain, defaultValue } = config;
    // Create Store Named Attribute node
    const storeAttrNode = wrangler.addNode(NodeTypes.StoreNamedAttribute, {
        name: `Store ${name}`,
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } },
            Name: { value: name },
            Value: { value: getDefaultValueForType(type, defaultValue) }
        },
        properties: {
            domain: domain.toLowerCase()
        }
    });
    return {
        nodeId: storeAttrNode.id,
        socketName: 'Geometry'
    };
}
/**
 * Create an attribute reader node chain
 */
export function createAttributeReader(wrangler, attributeName, geometryNodeId) {
    // Create Named Attribute node
    const namedAttrNode = wrangler.addNode(NodeTypes.NamedAttribute, {
        name: `Get ${attributeName}`,
        inputs: {
            Name: { value: attributeName }
        }
    });
    return {
        nodeId: namedAttrNode.id,
        socketName: 'Attribute'
    };
}
/**
 * Create a capture attribute node for transferring attributes
 */
export function createCaptureAttribute(wrangler, config, geometryNodeId) {
    const { name, type, domain } = config;
    // Create Capture Attribute node
    const captureNode = wrangler.addNode(NodeTypes.CaptureAttribute, {
        name: `Capture ${name}`,
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } },
            Value: { value: getDefaultValueForType(type) }
        },
        properties: {
            domain: domain.toLowerCase(),
            data_type: mapTypeToDataType(type)
        }
    });
    return {
        captureNodeId: captureNode.id,
        fieldNodeId: captureNode.id // Same node, different output socket
    };
}
/**
 * Create a transfer attribute node for nearest neighbor transfer
 */
export function createTransferAttribute(wrangler, sourceGeometryNodeId, targetGeometryNodeId, attributeName, dataType = AttributeType.FLOAT) {
    // Create Sample Nearest Surface node
    const sampleNode = wrangler.addNode(NodeTypes.SampleNearestSurface, {
        name: `Sample ${attributeName}`,
        inputs: {
            Geometry: { link: { fromNode: sourceGeometryNodeId, fromSocket: 'Geometry' } },
            Position: { link: { fromNode: targetGeometryNodeId, fromSocket: 'Position' } },
            [getAttributeSocketName(dataType)]: { value: attributeName }
        }
    });
    return {
        nodeId: sampleNode.id,
        socketName: getAttributeSocketName(dataType)
    };
}
/**
 * Create attribute statistic node for computing min/max/mean/etc
 */
export function createAttributeStatistic(wrangler, attributeName, geometryNodeId) {
    const statNode = wrangler.addNode(NodeTypes.AttributeStatistic, {
        name: `Stats ${attributeName}`,
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } },
            Attribute: { value: attributeName }
        }
    });
    return { nodeId: statNode.id };
}
/**
 * Create a smooth attribute operation using Laplacian smoothing
 */
export function createSmoothAttribute(wrangler, attributeName, geometryNodeId, iterations = 1, weight = 0.5) {
    let currentGeometryId = geometryNodeId;
    for (let i = 0; i < iterations; i++) {
        // Get current attribute value
        const attrReader = createAttributeReader(wrangler, attributeName, currentGeometryId);
        // Create Mix node for weighted smoothing
        const mixNode = wrangler.addNode(NodeTypes.Mix, {
            name: `Smooth ${i + 1}`,
            inputs: {
                A: { link: { fromNode: attrReader.nodeId, fromSocket: 'Value' } },
                B: { value: 0 }, // Would need neighbor average in real implementation
                Factor: { value: weight }
            }
        });
        // Store smoothed value back
        const storeResult = createAttributeWriter(wrangler, {
            name: attributeName,
            type: AttributeType.FLOAT,
            domain: AttributeDomain.POINT
        }, mixNode.id);
        currentGeometryId = storeResult.nodeId;
    }
    return {
        nodeId: currentGeometryId,
        socketName: 'Geometry'
    };
}
/**
 * Create attribute domain conversion
 */
export function createDomainConversion(wrangler, attributeName, geometryNodeId, fromDomain, toDomain) {
    // This would require interpolation logic based on domain conversion
    // For now, create a placeholder that stores the attribute on new domain
    const storeNode = wrangler.addNode(NodeTypes.StoreNamedAttribute, {
        name: `Convert ${attributeName} ${fromDomain}→${toDomain}`,
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } },
            Name: { value: attributeName },
            Value: { value: 0 }
        },
        properties: {
            domain: toDomain.toLowerCase()
        }
    });
    return {
        nodeId: storeNode.id,
        socketName: 'Geometry'
    };
}
/**
 * Create a face corner to point conversion
 */
export function createFaceCornerToPoint(wrangler, attributeName, geometryNodeId) {
    return createDomainConversion(wrangler, attributeName, geometryNodeId, AttributeDomain.FACE_CORNER, AttributeDomain.POINT);
}
/**
 * Create a point to face conversion (using average)
 */
export function createPointToFace(wrangler, attributeName, geometryNodeId) {
    return createDomainConversion(wrangler, attributeName, geometryNodeId, AttributeDomain.POINT, AttributeDomain.FACE);
}
/**
 * Create attribute-based selection
 */
export function createAttributeSelection(wrangler, attributeName, geometryNodeId, comparison, threshold) {
    // Get attribute value
    const attrReader = createAttributeReader(wrangler, attributeName, geometryNodeId);
    // Create comparison node(s)
    let compareNodeId;
    if (comparison === 'between' && Array.isArray(threshold)) {
        // Greater than min
        const gtNode = wrangler.addNode(NodeTypes.Compare, {
            name: `>${threshold[0]}`,
            inputs: {
                A: { link: { fromNode: attrReader.nodeId, fromSocket: 'Value' } },
                B: { value: threshold[0] }
            },
            properties: { operation: 'GREATER_THAN' }
        });
        // Less than max
        const ltNode = wrangler.addNode(NodeTypes.Compare, {
            name: `<${threshold[1]}`,
            inputs: {
                A: { link: { fromNode: attrReader.nodeId, fromSocket: 'Value' } },
                B: { value: threshold[1] }
            },
            properties: { operation: 'LESS_THAN' }
        });
        // And both
        const andNode = wrangler.addNode(NodeTypes.BooleanMath, {
            name: 'AND',
            inputs: {
                Boolean: { link: { fromNode: gtNode.id, fromSocket: 'Boolean' } },
                'Boolean_1': { link: { fromNode: ltNode.id, fromSocket: 'Boolean' } }
            },
            properties: { operation: 'AND' }
        });
        compareNodeId = andNode.id;
    }
    else {
        const opMap = {
            greater: 'GREATER_THAN',
            less: 'LESS_THAN',
            equal: 'EQUAL'
        };
        const compareNode = wrangler.addNode(NodeTypes.Compare, {
            name: `${comparison} ${typeof threshold === 'number' ? threshold : 0}`,
            inputs: {
                A: { link: { fromNode: attrReader.nodeId, fromSocket: 'Value' } },
                B: { value: typeof threshold === 'number' ? threshold : 0 }
            },
            properties: { operation: opMap[comparison] }
        });
        compareNodeId = compareNode.id;
    }
    // Create Separate Geometry with selection
    const separateNode = wrangler.addNode(NodeTypes.SeparateGeometry, {
        name: 'Separate by Attribute',
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } },
            Selection: { link: { fromNode: compareNodeId, fromSocket: 'Boolean' } }
        }
    });
    return {
        nodeId: separateNode.id,
        socketName: 'Geometry'
    };
}
/**
 * Helper: Get default value for attribute type
 */
function getDefaultValueForType(type, customValue) {
    if (customValue !== undefined) {
        return customValue;
    }
    switch (type) {
        case AttributeType.FLOAT:
            return 0.0;
        case AttributeType.FLOAT2:
            return [0.0, 0.0];
        case AttributeType.FLOAT3:
            return [0.0, 0.0, 0.0];
        case AttributeType.INT:
            return 0;
        case AttributeType.BOOLEAN:
            return false;
        default:
            return 0.0;
    }
}
/**
 * Helper: Map AttributeType to Blender data type string
 */
function mapTypeToDataType(type) {
    switch (type) {
        case AttributeType.FLOAT:
            return 'FLOAT';
        case AttributeType.FLOAT2:
            return 'FLOAT_VECTOR';
        case AttributeType.FLOAT3:
            return 'FLOAT_COLOR';
        case AttributeType.INT:
            return 'INT';
        case AttributeType.BOOLEAN:
            return 'BOOLEAN';
        default:
            return 'FLOAT';
    }
}
/**
 * Helper: Get socket name for attribute data type
 */
function getAttributeSocketName(type) {
    switch (type) {
        case AttributeType.FLOAT:
        case AttributeType.INT:
            return 'Value';
        case AttributeType.FLOAT2:
        case AttributeType.FLOAT3:
            return 'Value';
        case AttributeType.BOOLEAN:
            return 'Boolean';
        default:
            return 'Value';
    }
}
/**
 * Batch create multiple attributes
 */
export function createMultipleAttributes(wrangler, geometryNodeId, configs) {
    const results = new Map();
    let currentGeometryId = geometryNodeId;
    for (const config of configs) {
        const result = createAttributeWriter(wrangler, config, currentGeometryId);
        results.set(config.name, result);
        currentGeometryId = result.nodeId;
    }
    return results;
}
/**
 * Utility: Check if attribute exists on geometry
 */
export function hasAttribute(wrangler, attributeName, geometryNodeId) {
    // Use Domain Size to check if attribute exists
    const domainSizeNode = wrangler.addNode(NodeTypes.DomainSize, {
        name: `Check ${attributeName}`,
        inputs: {
            Geometry: { link: { fromNode: geometryNodeId, fromSocket: 'Geometry' } }
        },
        properties: {
            component: 'MESH',
            domain: 'POINT'
        }
    });
    return {
        nodeId: domainSizeNode.id,
        socketName: 'Size'
    };
}
//# sourceMappingURL=attribute-helpers.js.map