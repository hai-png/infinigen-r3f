/**
 * Subdivision Nodes - Geometry subdivision operations
 * Based on Blender's Subdivide and Subdivision Surface nodes
 *
 * @module nodes/geometry
 */
import { BufferGeometry } from 'three';
import { Node, NodeSocket, NodeDefinition } from '../core/types';
import { NodeTypes } from '../core/node-types';
/**
 * SubdivideMesh Node
 * Subdivides a mesh by splitting edges and faces
 */
export interface SubdivideMeshNode extends Node {
    type: NodeTypes.SubdivideMesh;
    inputs: {
        Mesh: NodeSocket<BufferGeometry>;
        Vertices: NodeSocket<number>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        levels: number;
        smoothness: number;
    };
}
export declare const SubdivideMeshDefinition: NodeDefinition;
/**
 * Catmull-Clark subdivision step
 * Implements one iteration of Catmull-Clark subdivision algorithm
 */
export declare function catmullClarkStep(geometry: BufferGeometry): BufferGeometry;
/**
 * Loop subdivision step
 * Implements one iteration of Loop subdivision for triangular meshes
 */
export declare function loopSubdivisionStep(geometry: BufferGeometry): BufferGeometry;
/**
 * Execute SubdivideMesh node
 */
export declare function executeSubdivideMesh(node: SubdivideMeshNode, inputMesh: BufferGeometry): BufferGeometry;
/**
 * Simple mesh offset along normals
 */
export declare function offsetMesh(geometry: BufferGeometry, offset: number): BufferGeometry;
//# sourceMappingURL=SubdivisionNodes.d.ts.map