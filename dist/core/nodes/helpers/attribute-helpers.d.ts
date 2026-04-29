/**
 * Attribute Helpers for Node System
 *
 * Provides convenience functions for common attribute manipulation patterns
 * in geometry node workflows.
 *
 * Based on infinigen/core/surface.py attribute operations
 */
import { NodeWrangler } from '../core/node-wrangler';
/**
 * Attribute domain types matching Blender's domains
 */
export declare enum AttributeDomain {
    POINT = "POINT",
    EDGE = "EDGE",
    FACE = "FACE",
    FACE_CORNER = "FACE_CORNER",
    INSTANCE = "INSTANCE"
}
/**
 * Attribute data types
 */
export declare enum AttributeType {
    FLOAT = "FLOAT",
    FLOAT2 = "FLOAT_VECTOR",
    FLOAT3 = "FLOAT_COLOR",
    INT = "INT",
    BOOLEAN = "BOOLEAN"
}
/**
 * Configuration for creating an attribute
 */
export interface AttributeConfig {
    name: string;
    type: AttributeType;
    domain: AttributeDomain;
    defaultValue?: number | number[] | boolean;
}
/**
 * Create an attribute node chain for writing attributes
 */
export declare function createAttributeWriter(wrangler: NodeWrangler, config: AttributeConfig, geometryNodeId: string): {
    nodeId: string;
    socketName: string;
};
/**
 * Create an attribute reader node chain
 */
export declare function createAttributeReader(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string): {
    nodeId: string;
    socketName: string;
};
/**
 * Create a capture attribute node for transferring attributes
 */
export declare function createCaptureAttribute(wrangler: NodeWrangler, config: AttributeConfig, geometryNodeId: string): {
    captureNodeId: string;
    fieldNodeId: string;
};
/**
 * Create a transfer attribute node for nearest neighbor transfer
 */
export declare function createTransferAttribute(wrangler: NodeWrangler, sourceGeometryNodeId: string, targetGeometryNodeId: string, attributeName: string, dataType?: AttributeType): {
    nodeId: string;
    socketName: string;
};
/**
 * Create attribute statistic node for computing min/max/mean/etc
 */
export declare function createAttributeStatistic(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string): {
    nodeId: string;
};
/**
 * Create a smooth attribute operation using Laplacian smoothing
 */
export declare function createSmoothAttribute(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string, iterations?: number, weight?: number): {
    nodeId: string;
    socketName: string;
};
/**
 * Create attribute domain conversion
 */
export declare function createDomainConversion(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string, fromDomain: AttributeDomain, toDomain: AttributeDomain): {
    nodeId: string;
    socketName: string;
};
/**
 * Create a face corner to point conversion
 */
export declare function createFaceCornerToPoint(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string): {
    nodeId: string;
    socketName: string;
};
/**
 * Create a point to face conversion (using average)
 */
export declare function createPointToFace(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string): {
    nodeId: string;
    socketName: string;
};
/**
 * Create attribute-based selection
 */
export declare function createAttributeSelection(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string, comparison: 'greater' | 'less' | 'equal' | 'between', threshold: number | [number, number]): {
    nodeId: string;
    socketName: string;
};
/**
 * Batch create multiple attributes
 */
export declare function createMultipleAttributes(wrangler: NodeWrangler, geometryNodeId: string, configs: AttributeConfig[]): Map<string, {
    nodeId: string;
    socketName: string;
}>;
/**
 * Utility: Check if attribute exists on geometry
 */
export declare function hasAttribute(wrangler: NodeWrangler, attributeName: string, geometryNodeId: string): {
    nodeId: string;
    socketName: string;
};
export { AttributeDomain, AttributeType };
export type { AttributeConfig };
//# sourceMappingURL=attribute-helpers.d.ts.map