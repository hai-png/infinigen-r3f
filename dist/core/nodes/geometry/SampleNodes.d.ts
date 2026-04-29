/**
 * Sample Nodes for Geometry Nodes System
 *
 * Handles sampling operations (points on mesh, volume, curves, etc.)
 * Based on original: infinigen/core/nodes/nodegroups/sample_nodes.py
 */
import { Vector3 } from 'three';
import type { NodeDefinition, GeometryType } from '../core/types';
export type SamplingMode = 'random' | 'poisson_disk' | 'grid' | 'stratified';
export interface DistributePointsOnFacesNode {
    type: 'distribute_points_on_faces';
    inputs: {
        geometry: GeometryType;
        density?: number;
        densityFactor?: number;
        selection?: boolean;
    };
    parameters: {
        distributionMethod: SamplingMode;
        seed: number;
        useMeshNormal: boolean;
        radiusMin: number;
        radiusMax: number;
        weightAttribute?: string;
    };
    outputs: {
        points: Vector3[];
        normals: Vector3[];
        faceIndices: number[];
        barycentricCoords: Vector3[];
    };
}
export interface DistributePointsInVolumeNode {
    type: 'distribute_points_in_volume';
    inputs: {
        geometry: GeometryType;
        count: number;
        selection?: boolean;
    };
    parameters: {
        distributionMethod: SamplingMode;
        seed: number;
        volumeType: 'mesh' | 'box' | 'sphere' | 'cylinder';
    };
    outputs: {
        points: Vector3[];
    };
}
export interface MeshToPointsNode {
    type: 'mesh_to_points';
    inputs: {
        geometry: GeometryType;
        selection?: boolean;
    };
    parameters: {
        mode: 'vertices' | 'edges' | 'faces' | 'corners';
    };
    outputs: {
        points: Vector3[];
        normals: Vector3[];
    };
}
export interface PointOnGeometryNode {
    type: 'point_on_geometry';
    inputs: {
        geometry: GeometryType;
        factor: number;
    };
    outputs: {
        position: Vector3;
        normal: Vector3;
        faceIndex: number;
    };
}
export interface SampleNearestSurfaceNode {
    type: 'sample_nearest_surface';
    inputs: {
        geometry: GeometryType;
        position: Vector3;
    };
    outputs: {
        position: Vector3;
        normal: Vector3;
        distance: number;
        faceIndex: number;
    };
}
export interface SampleNearestVolumeNode {
    type: 'sample_nearest_volume';
    inputs: {
        geometry: GeometryType;
        position: Vector3;
    };
    outputs: {
        position: Vector3;
        distance: number;
    };
}
export interface RandomValueNode<T = number> {
    type: 'random_value';
    inputs: {
        min?: T;
        max?: T;
        probability?: number;
        id?: number;
    };
    parameters: {
        dataType: 'float' | 'vector' | 'color' | 'integer' | 'boolean';
        useMin: boolean;
        useMax: boolean;
    };
    outputs: {
        value: T;
    };
}
export interface PositionNode {
    type: 'position';
    inputs: {
        offset?: Vector3;
    };
    outputs: {
        position: Vector3;
    };
}
export interface NormalNode {
    type: 'normal';
    inputs: {};
    outputs: {
        normal: Vector3;
    };
}
export interface TangentNode {
    type: 'tangent';
    inputs: {};
    outputs: {
        tangent: Vector3;
    };
}
export interface UVMapNode {
    type: 'uv_map';
    inputs: {};
    parameters: {
        uvMapName?: string;
    };
    outputs: {
        uv: Vector3;
    };
}
export interface ColorNode {
    type: 'color';
    inputs: {
        color?: any;
    };
    parameters: {
        attributeName?: string;
    };
    outputs: {
        color: any;
    };
}
export interface InstanceOnPointsNode {
    type: 'instance_on_points';
    inputs: {
        points: Vector3[];
        instance: GeometryType;
        rotation?: Vector3;
        scale?: number | Vector3;
        selection?: boolean;
    };
    parameters: {
        pickRandom: boolean;
        alignRotationToNormal: boolean;
    };
    outputs: {
        instances: GeometryType;
    };
}
export interface RealizeInstancesNode {
    type: 'realize_instances';
    inputs: {
        geometry: GeometryType;
    };
    outputs: {
        geometry: GeometryType;
    };
}
/**
 * Distribute Points on Faces Node
 * Distributes points across the surface of a mesh
 */
export declare const DistributePointsOnFacesDefinition: NodeDefinition<DistributePointsOnFacesNode>;
/**
 * Distribute Points in Volume Node
 * Distributes points inside a volume
 */
export declare const DistributePointsInVolumeDefinition: NodeDefinition<DistributePointsInVolumeNode>;
/**
 * Mesh to Points Node
 * Converts mesh elements to points
 */
export declare const MeshToPointsDefinition: NodeDefinition<MeshToPointsNode>;
/**
 * Point on Geometry Node
 * Gets a point at a specific factor along the geometry
 */
export declare const PointOnGeometryDefinition: NodeDefinition<PointOnGeometryNode>;
/**
 * Sample Nearest Surface Node
 * Finds the nearest point on a surface
 */
export declare const SampleNearestSurfaceDefinition: NodeDefinition<SampleNearestSurfaceNode>;
/**
 * Sample Nearest Volume Node
 * Finds the nearest point in a volume
 */
export declare const SampleNearestVolumeDefinition: NodeDefinition<SampleNearestVolumeNode>;
/**
 * Random Value Node
 * Generates random values of various types
 */
export declare const RandomValueDefinition: NodeDefinition<RandomValueNode>;
/**
 * Position Node
 * Gets the position attribute
 */
export declare const PositionDefinition: NodeDefinition<PositionNode>;
/**
 * Normal Node
 * Gets the normal attribute
 */
export declare const NormalDefinition: NodeDefinition<NormalNode>;
/**
 * Tangent Node
 * Gets the tangent attribute
 */
export declare const TangentDefinition: NodeDefinition<TangentNode>;
/**
 * UV Map Node
 * Gets UV coordinates
 */
export declare const UVMapDefinition: NodeDefinition<UVMapNode>;
/**
 * Color Node
 * Gets color attribute
 */
export declare const ColorDefinition: NodeDefinition<ColorNode>;
/**
 * Instance on Points Node
 * Instances geometry on points
 */
export declare const InstanceOnPointsDefinition: NodeDefinition<InstanceOnPointsNode>;
/**
 * Realize Instances Node
 * Converts instances to real geometry
 */
export declare const RealizeInstancesDefinition: NodeDefinition<RealizeInstancesNode>;
/**
 * Execute Distribute Points on Faces Node
 */
export declare function executeDistributePointsOnFaces(node: DistributePointsOnFacesNode, geometry: THREE.BufferGeometry): {
    points: Vector3[];
    normals: Vector3[];
    faceIndices: number[];
    barycentricCoords: Vector3[];
};
/**
 * Execute Distribute Points in Volume Node
 */
export declare function executeDistributePointsInVolume(node: DistributePointsInVolumeNode, geometry: THREE.BufferGeometry): {
    points: Vector3[];
};
/**
 * Execute Mesh to Points Node
 */
export declare function executeMeshToPoints(node: MeshToPointsNode, geometry: THREE.BufferGeometry): {
    points: Vector3[];
    normals: Vector3[];
};
/**
 * Execute Point on Geometry Node
 */
export declare function executePointOnGeometry(node: PointOnGeometryNode, geometry: THREE.BufferGeometry): {
    position: Vector3;
    normal: Vector3;
    faceIndex: number;
};
/**
 * Execute Sample Nearest Surface Node
 */
export declare function executeSampleNearestSurface(node: SampleNearestSurfaceNode, geometry: THREE.BufferGeometry): {
    position: Vector3;
    normal: Vector3;
    distance: number;
    faceIndex: number;
};
/**
 * Execute Random Value Node
 */
export declare function executeRandomValue(node: RandomValueNode): {
    value: any;
};
/**
 * Execute Position Node
 */
export declare function executePosition(node: PositionNode, geometry: THREE.BufferGeometry): {
    position: Vector3[];
};
/**
 * Execute Normal Node
 */
export declare function executeNormal(node: NormalNode, geometry: THREE.BufferGeometry): {
    normal: Vector3[];
};
/**
 * Execute Instance on Points Node
 */
export declare function executeInstanceOnPoints(node: InstanceOnPointsNode): {
    instances: any;
};
/**
 * Execute Realize Instances Node
 */
export declare function executeRealizeInstances(node: RealizeInstancesNode, geometry: THREE.BufferGeometry): THREE.BufferGeometry;
//# sourceMappingURL=SampleNodes.d.ts.map