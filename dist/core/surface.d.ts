/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Alex Raistrick (original Python author)
 * - Lahav Lipson (Surface mixing)
 * - Lingjie Mei (attributes and geo nodes)
 */
/**
 * Remove materials from an object
 */
export declare function removeMaterials(obj: any): void;
/**
 * Read attribute data from geometry
 * Returns array of values based on domain (POINT, EDGE, FACE, etc.)
 */
export declare function readAttributeData(obj: any, attr: string | any, domain?: 'POINT' | 'EDGE' | 'FACE' | 'CORNER', resultDataType?: string): Float32Array | Int32Array | Uint8Array;
/**
 * Write attribute data to geometry
 */
export declare function writeAttributeData(obj: any, attrName: string, data: Float32Array | Int32Array | Uint8Array | number[], type?: 'FLOAT' | 'INT' | 'BOOLEAN' | 'VECTOR', domain?: 'POINT' | 'EDGE' | 'FACE' | 'CORNER'): void;
/**
 * Smooth an attribute value across the mesh
 */
export declare function smoothAttribute(obj: any, attrName: string, iterations?: number, weight?: number): void;
/**
 * Convert attribute to vertex group (weights)
 */
export declare function attributeToVertexGroup(obj: any, attrName: string, groupName?: string, minThreshold?: number, binary?: boolean): any;
/**
 * Evaluate argument for surface operations
 * Handles various input types: null, function, string, number, Vector
 */
export declare function evalArgument(nw: any, argument: any, defaultValue?: number, kwargs?: Record<string, any>): any;
/**
 * Add geometry modifier to objects
 */
export declare function addGeometryModifier(objs: any | any[], nodeFunc: (nw: any) => any, name?: string, apply?: boolean, attributes?: string[]): void;
/**
 * Set active attribute on object
 */
export declare function setActiveAttribute(obj: any, attrName: string): void;
/**
 * Create new attribute data on object
 */
export declare function newAttributeData(obj: any, attrName: string, type: 'FLOAT' | 'INT' | 'BOOLEAN' | 'VECTOR', domain: 'POINT' | 'EDGE' | 'FACE' | 'CORNER', data: Float32Array | Int32Array | Uint8Array | number[]): void;
declare const _default: {
    removeMaterials: typeof removeMaterials;
    readAttributeData: typeof readAttributeData;
    writeAttributeData: typeof writeAttributeData;
    smoothAttribute: typeof smoothAttribute;
    attributeToVertexGroup: typeof attributeToVertexGroup;
    evalArgument: typeof evalArgument;
    addGeometryModifier: typeof addGeometryModifier;
    setActiveAttribute: typeof setActiveAttribute;
    newAttributeData: typeof newAttributeData;
};
export default _default;
//# sourceMappingURL=surface.d.ts.map