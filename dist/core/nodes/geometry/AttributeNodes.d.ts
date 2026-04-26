/**
 * Attribute Nodes for Geometry Nodes System
 *
 * Handles mesh attributes (positions, normals, UVs, colors, custom data)
 * Based on original: infinigen/core/nodes/nodegroups/attribute_nodes.py
 */
import { Vector3, Color } from 'three';
import type { NodeDefinition, GeometryType } from '../core/types';
export type AttributeDomain = 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
export interface AttributeInput {
    name: string;
    domain: AttributeDomain;
    dataType: 'float' | 'vector' | 'color' | 'boolean' | 'integer' | 'rotation' | 'matrix';
}
export interface SetPositionNode {
    type: 'set_position';
    inputs: {
        geometry: GeometryType;
        position: Vector3 | null;
        offset: Vector3;
        selection?: boolean;
    };
    outputs: {
        geometry: GeometryType;
    };
}
export interface StoreNamedAttributeNode {
    type: 'store_named_attribute';
    inputs: {
        geometry: GeometryType;
        value: number | Vector3 | Color | boolean | number[];
        selection?: boolean;
    };
    parameters: {
        name: string;
        domain: AttributeDomain;
        dataType: AttributeInput['dataType'];
    };
    outputs: {
        geometry: GeometryType;
    };
}
export interface CaptureAttributeNode {
    type: 'capture_attribute';
    inputs: {
        geometry: GeometryType;
        value: number | Vector3 | Color;
        selection?: boolean;
    };
    parameters: {
        domain: AttributeDomain;
        dataType: AttributeInput['dataType'];
    };
    outputs: {
        geometry: GeometryType;
        attribute: number[] | Vector3[] | Color[];
    };
}
export interface RemoveAttributeNode {
    type: 'remove_attribute';
    inputs: {
        geometry: GeometryType;
    };
    parameters: {
        name: string;
    };
    outputs: {
        geometry: GeometryType;
    };
}
export interface NamedAttributeNode {
    type: 'named_attribute';
    inputs: {
        selection?: boolean;
    };
    parameters: {
        name: string;
    };
    outputs: {
        exists: boolean;
        attribute: number[] | Vector3[] | Color[] | boolean[];
    };
}
export interface AttributeStatisticNode {
    type: 'attribute_statistic';
    inputs: {
        geometry: GeometryType;
        attribute?: number[] | Vector3[];
        selection?: boolean;
    };
    parameters: {
        domain: AttributeDomain;
    };
    outputs: {
        exists: boolean;
        average: number;
        min: number;
        max: number;
        sum: number;
        count: number;
        variance: number;
        standardDeviation: number;
        range: number;
    };
}
export interface RaycastNode {
    type: 'raycast';
    inputs: {
        geometry: GeometryType;
        startPosition: Vector3;
        endPosition: Vector3;
    };
    outputs: {
        isHit: boolean;
        hitPosition: Vector3;
        hitNormal: Vector3;
        hitFaceIndex: number;
        distance: number;
    };
}
export interface SampleUVSurfaceNode {
    type: 'sample_uv_surface';
    inputs: {
        geometry: GeometryType;
        uvMap?: string;
    };
    parameters: {
        sampleCount: number;
        seed: number;
    };
    outputs: {
        positions: Vector3[];
        uvs: Vector3[];
    };
}
export interface IndexOfNearestNode {
    type: 'index_of_nearest';
    inputs: {
        geometry: GeometryType;
        position: Vector3;
    };
    outputs: {
        index: number;
        distance: number;
    };
}
export interface NearestFacePointNode {
    type: 'nearest_face_point';
    inputs: {
        geometry: GeometryType;
        position: Vector3;
    };
    outputs: {
        position: Vector3;
        distance: number;
        faceIndex: number;
        barycentricCoords: Vector3;
    };
}
/**
 * Set Position Node
 * Sets or offsets point positions in a geometry
 */
export declare const SetPositionDefinition: NodeDefinition<SetPositionNode>;
/**
 * Store Named Attribute Node
 * Stores a value as a named attribute on the geometry
 */
export declare const StoreNamedAttributeDefinition: NodeDefinition<StoreNamedAttributeNode>;
/**
 * Capture Attribute Node
 * Captures an attribute value for later use
 */
export declare const CaptureAttributeDefinition: NodeDefinition<CaptureAttributeNode>;
/**
 * Remove Attribute Node
 * Removes a named attribute from the geometry
 */
export declare const RemoveAttributeDefinition: NodeDefinition<RemoveAttributeNode>;
/**
 * Named Attribute Node
 * Retrieves a named attribute from the geometry
 */
export declare const NamedAttributeDefinition: NodeDefinition<NamedAttributeNode>;
/**
 * Attribute Statistic Node
 * Computes statistics about an attribute
 */
export declare const AttributeStatisticDefinition: NodeDefinition<AttributeStatisticNode>;
/**
 * Raycast Node
 * Casts a ray against the geometry
 */
export declare const RaycastDefinition: NodeDefinition<RaycastNode>;
/**
 * Sample UV Surface Node
 * Samples points on a UV-mapped surface
 */
export declare const SampleUVSurfaceDefinition: NodeDefinition<SampleUVSurfaceNode>;
/**
 * Index of Nearest Node
 * Finds the index of the nearest point
 */
export declare const IndexOfNearestDefinition: NodeDefinition<IndexOfNearestNode>;
/**
 * Nearest Face Point Node
 * Finds the nearest point on a face
 */
export declare const NearestFacePointDefinition: NodeDefinition<NearestFacePointNode>;
/**
 * Execute Set Position Node
 */
export declare function executeSetPosition(node: SetPositionNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry;
/**
 * Execute Store Named Attribute Node
 */
export declare function executeStoreNamedAttribute(node: StoreNamedAttributeNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry;
/**
 * Execute Capture Attribute Node
 */
export declare function executeCaptureAttribute(node: CaptureAttributeNode, geometry: THREE.BufferGeometry): {
    geometry: THREE.BufferGeometry;
    attribute: any[];
};
/**
 * Execute Remove Attribute Node
 */
export declare function executeRemoveAttribute(node: RemoveAttributeNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry;
/**
 * Execute Named Attribute Node
 */
export declare function executeNamedAttribute(node: NamedAttributeNode, geometry: THREE.BufferGeometry): {
    exists: boolean;
    attribute: any[];
};
/**
 * Execute Attribute Statistic Node
 */
export declare function executeAttributeStatistic(node: AttributeStatisticNode, geometry: THREE.BufferGeometry): {
    exists: boolean;
    average: number;
    min: number;
    max: number;
    sum: number;
    count: number;
    variance: number;
    standardDeviation: number;
    range: number;
};
/**
 * Execute Raycast Node
 */
export declare function executeRaycast(node: RaycastNode, geometry: THREE.BufferGeometry): {
    isHit: boolean;
    hitPosition: Vector3;
    hitNormal: Vector3;
    hitFaceIndex: number;
    distance: number;
};
/**
 * Execute Sample UV Surface Node
 */
export declare function executeSampleUVSurface(node: SampleUVSurfaceNode, geometry: THREE.BufferGeometry): {
    positions: Vector3[];
    uvs: Vector3[];
};
/**
 * Execute Index of Nearest Node
 */
export declare function executeIndexOfNearest(node: IndexOfNearestNode, geometry: THREE.BufferGeometry): {
    index: number;
    distance: number;
};
/**
 * Execute Nearest Face Point Node
 */
export declare function executeNearestFacePoint(node: NearestFacePointNode, geometry: THREE.BufferGeometry): {
    position: Vector3;
    distance: number;
    faceIndex: number;
    barycentricCoords: Vector3;
};
//# sourceMappingURL=AttributeNodes.d.ts.map