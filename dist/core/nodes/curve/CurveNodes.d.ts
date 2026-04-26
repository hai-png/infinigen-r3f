/**
 * Curve Nodes - TypeScript implementation of Blender geometry curve nodes
 * Based on infinigen/core/nodes/nodegroups/ and Blender geometry nodes
 *
 * Provides curve manipulation, sampling, and primitive generation
 */
import * as THREE from 'three';
import { GeometryNodeDefinition, NodeExecutionContext } from '../core/types';
export interface CurveToMeshNode {
    type: 'CurveToMeshNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        ProfileCurve: THREE.BufferGeometry | null;
        FillCaps: boolean;
    };
    outputs: {
        Mesh: THREE.BufferGeometry | null;
    };
}
export interface CurveToPointsNode {
    type: 'CurveToPointsNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Count: number;
        Length: number;
    };
    outputs: {
        Points: THREE.BufferGeometry | null;
    };
}
export interface MeshToCurveNode {
    type: 'MeshToCurveNode';
    inputs: {
        Mesh: THREE.BufferGeometry | null;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
export interface SampleCurveNode {
    type: 'SampleCurveNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Factor: number;
        Length: number;
    };
    outputs: {
        Position: THREE.Vector3;
        Tangent: THREE.Vector3;
        Normal: THREE.Vector3;
        Rotation: THREE.Quaternion;
    };
}
export interface SetCurveRadiusNode {
    type: 'SetCurveRadiusNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Radius: number;
        Selection: boolean[] | null;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
export interface SetCurveTiltNode {
    type: 'SetCurveTiltNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Tilt: number;
        Selection: boolean[] | null;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
export interface CurveLengthNode {
    type: 'CurveLengthNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
    };
    outputs: {
        Length: number;
    };
}
export interface SubdivideCurveNode {
    type: 'SubdivideCurveNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Cuts: number;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
export interface ResampleCurveNode {
    type: 'ResampleCurveNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Count: number;
        Length: number;
        Start: number;
        End: number;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
export interface CurveCircleNode {
    type: 'CurveCircleNode';
    inputs: {
        Mode: 'RADIUS' | 'DIAMETER';
        Radius: number;
        Diameter: number;
        Resolution: number;
    };
    outputs: {
        Curve: THREE.BufferGeometry;
    };
}
export interface CurveLineNode {
    type: 'CurveLineNode';
    inputs: {
        Start: THREE.Vector3;
        End: THREE.Vector3;
    };
    outputs: {
        Curve: THREE.BufferGeometry;
    };
}
export interface FillCurveNode {
    type: 'FillCurveNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        FillHoles: boolean;
    };
    outputs: {
        Mesh: THREE.BufferGeometry | null;
    };
}
export interface FilletCurveNode {
    type: 'FilletCurveNode';
    inputs: {
        Curve: THREE.BufferGeometry | null;
        Radius: number;
        Segments: number;
    };
    outputs: {
        Curve: THREE.BufferGeometry | null;
    };
}
/**
 * Convert a curve to a mesh by extruding along a profile curve
 */
export declare const CurveToMeshDefinition: GeometryNodeDefinition<CurveToMeshNode>;
export declare function executeCurveToMesh(ctx: NodeExecutionContext<CurveToMeshNode>): THREE.BufferGeometry | null;
/**
 * Convert curve to points distributed along its length
 */
export declare const CurveToPointsDefinition: GeometryNodeDefinition<CurveToPointsNode>;
export declare function executeCurveToPoints(ctx: NodeExecutionContext<CurveToPointsNode>): THREE.BufferGeometry | null;
/**
 * Convert mesh edges to curves
 */
export declare const MeshToCurveDefinition: GeometryNodeDefinition<MeshToCurveNode>;
export declare function executeMeshToCurve(ctx: NodeExecutionContext<MeshToCurveNode>): THREE.BufferGeometry | null;
/**
 * Sample a point on a curve at given factor or length
 */
export declare const SampleCurveDefinition: GeometryNodeDefinition<SampleCurveNode>;
export declare function executeSampleCurve(ctx: NodeExecutionContext<SampleCurveNode>): {
    Position: THREE.Vector3;
    Tangent: THREE.Vector3;
    Normal: THREE.Vector3;
    Rotation: THREE.Quaternion;
};
/**
 * Set the radius of curve control points
 */
export declare const SetCurveRadiusDefinition: GeometryNodeDefinition<SetCurveRadiusNode>;
export declare function executeSetCurveRadius(ctx: NodeExecutionContext<SetCurveRadiusNode>): THREE.BufferGeometry | null;
/**
 * Set the tilt angle of curve control points
 */
export declare const SetCurveTiltDefinition: GeometryNodeDefinition<SetCurveTiltNode>;
export declare function executeSetCurveTilt(ctx: NodeExecutionContext<SetCurveTiltNode>): THREE.BufferGeometry | null;
/**
 * Calculate the total length of a curve
 */
export declare const CurveLengthDefinition: GeometryNodeDefinition<CurveLengthNode>;
export declare function executeCurveLength(ctx: NodeExecutionContext<CurveLengthNode>): number;
/**
 * Subdivide curve segments
 */
export declare const SubdivideCurveDefinition: GeometryNodeDefinition<SubdivideCurveNode>;
export declare function executeSubdivideCurve(ctx: NodeExecutionContext<SubdivideCurveNode>): THREE.BufferGeometry | null;
/**
 * Resample curve to have uniform point distribution
 */
export declare const ResampleCurveDefinition: GeometryNodeDefinition<ResampleCurveNode>;
export declare function executeResampleCurve(ctx: NodeExecutionContext<ResampleCurveNode>): THREE.BufferGeometry | null;
/**
 * Create a circle curve primitive
 */
export declare const CurveCircleDefinition: GeometryNodeDefinition<CurveCircleNode>;
export declare function executeCurveCircle(ctx: NodeExecutionContext<CurveCircleNode>): THREE.BufferGeometry;
/**
 * Create a line curve primitive
 */
export declare const CurveLineDefinition: GeometryNodeDefinition<CurveLineNode>;
export declare function executeCurveLine(ctx: NodeExecutionContext<CurveLineNode>): THREE.BufferGeometry;
/**
 * Fill a closed curve with a mesh
 */
export declare const FillCurveDefinition: GeometryNodeDefinition<FillCurveNode>;
export declare function executeFillCurve(ctx: NodeExecutionContext<FillCurveNode>): THREE.BufferGeometry | null;
/**
 * Add fillets (rounded corners) to curve
 */
export declare const FilletCurveDefinition: GeometryNodeDefinition<FilletCurveNode>;
export declare function executeFilletCurve(ctx: NodeExecutionContext<FilletCurveNode>): THREE.BufferGeometry | null;
//# sourceMappingURL=CurveNodes.d.ts.map