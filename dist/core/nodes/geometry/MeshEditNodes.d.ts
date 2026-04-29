/**
 * Mesh Edit Nodes - Geometry editing operations
 * Based on Blender's mesh editing nodes
 *
 * @module nodes/geometry
 */
import { BufferGeometry, Vector3 } from 'three';
import { Node, NodeSocket, NodeDefinition } from '../core/types';
import { NodeTypes } from '../core/node-types';
/**
 * ExtrudeMesh Node
 * Extrudes faces along their normals or a specified direction
 */
export interface ExtrudeMeshNode extends Node {
    type: NodeTypes.ExtrudeMesh;
    inputs: {
        Mesh: NodeSocket<BufferGeometry>;
        OffsetScale: NodeSocket<number>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        offset: number;
        individual: boolean;
    };
}
export declare const ExtrudeMeshDefinition: NodeDefinition;
/**
 * Execute ExtrudeMesh node
 * Extrudes each face along its normal
 */
export declare function executeExtrudeMesh(node: ExtrudeMeshNode, inputMesh: BufferGeometry): BufferGeometry;
/**
 * Triangulate Node
 * Converts polygons to triangles
 */
export interface TriangulateNode extends Node {
    type: NodeTypes.Triangulate;
    inputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        minVertices: number;
        maxVertices: number;
    };
}
export declare const TriangulateDefinition: NodeDefinition;
/**
 * Execute Triangulate node
 * Ensures mesh is fully triangulated
 */
export declare function executeTriangulate(node: TriangulateNode, inputMesh: BufferGeometry): BufferGeometry;
/**
 * MergeByDistance Node
 * Merges vertices that are within a specified distance
 */
export interface MergeByDistanceNode extends Node {
    type: NodeTypes.MergeByDistance;
    inputs: {
        Mesh: NodeSocket<BufferGeometry>;
        Distance: NodeSocket<number>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        distance: number;
    };
}
export declare const MergeByDistanceDefinition: NodeDefinition;
/**
 * Execute MergeByDistance node
 * Removes duplicate vertices within threshold distance
 */
export declare function executeMergeByDistance(node: MergeByDistanceNode, inputMesh: BufferGeometry): BufferGeometry;
/**
 * Transform Node
 * Applies transformation matrix to geometry
 */
export interface TransformNode extends Node {
    type: NodeTypes.Transform;
    inputs: {
        Geometry: NodeSocket<BufferGeometry>;
        Translation: NodeSocket<Vector3>;
        Rotation: NodeSocket<Vector3>;
        Scale: NodeSocket<Vector3>;
    };
    outputs: {
        Geometry: NodeSocket<BufferGeometry>;
    };
    params: {
        translation: Vector3;
        rotation: Vector3;
        scale: Vector3;
        space: 'LOCAL' | 'WORLD';
    };
}
export declare const TransformDefinition: NodeDefinition;
/**
 * Execute Transform node
 */
export declare function executeTransform(node: TransformNode, inputGeometry: BufferGeometry): BufferGeometry;
//# sourceMappingURL=MeshEditNodes.d.ts.map