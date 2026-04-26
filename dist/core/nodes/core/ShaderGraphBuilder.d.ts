/**
 * Shader Graph Builder
 *
 * Builds shader material graphs from node connections
 * Ports functionality from Blender's shader node system to Three.js
 */
import { NodeTree, NodeLink, SocketType } from './types';
import { NodeType } from './node-types';
export interface ShaderGraphSocket {
    id: string;
    name: string;
    type: SocketType;
    value?: any;
    connectedLinks: string[];
}
export interface ShaderGraphNode {
    id: string;
    type: NodeType;
    name: string;
    inputs: Map<string, ShaderGraphSocket>;
    outputs: Map<string, ShaderGraphSocket>;
    settings: Record<string, any>;
    position?: {
        x: number;
        y: number;
    };
}
export interface ShaderGraphBuildOptions {
    autoConnect?: boolean;
    validateConnections?: boolean;
    optimize?: boolean;
}
export interface BuiltShaderGraph {
    tree: NodeTree;
    nodes: Map<string, ShaderGraphNode>;
    links: NodeLink[];
    inputInterface: Map<string, ShaderGraphSocket>;
    outputInterface: Map<string, ShaderGraphSocket>;
}
export declare class ShaderGraphBuilder {
    private nodes;
    private links;
    private inputInterface;
    private outputInterface;
    private options;
    private linkCounter;
    constructor(options?: Partial<ShaderGraphBuildOptions>);
    /**
     * Create a new node in the graph
     */
    createNode(type: NodeType, name?: string, settings?: Record<string, any>, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Principled BSDF shader node
     */
    addPrincipledBSDF(name?: string, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Noise Texture node
     */
    addNoiseTexture(name?: string, scale?: number, detail?: number, roughness?: number, distortion?: number, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Voronoi Texture node
     */
    addVoronoiTexture(name?: string, scale?: number, smoothness?: number, exponent?: number, distanceMetric?: 'euclidean' | 'manhattan' | 'chebychev', featureMode?: 'f1' | 'f2-f1' | 'n_sphere_radius' | 'distance', seed?: number, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Musgrave Texture node
     */
    addMusgraveTexture(name?: string, scale?: number, detail?: number, dimension?: number, lacunarity?: number, offset?: number, gain?: number, musgraveType?: 'fbm' | 'multifractal' | 'ridged_multifractal' | 'hybrid_multifractal' | 'hetero_terrain', position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a ColorRamp node
     */
    addColorRamp(name?: string, stops?: Array<{
        position: number;
        color: [number, number, number, number];
    }>, interpolation?: 'constant' | 'linear' | 'ease' | 'cardinal' | 'b_spline', position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a MixRGB node
     */
    addMixRGB(name?: string, blendType?: 'MIX' | 'ADD' | 'MULTIPLY' | 'SUBTRACT' | 'SCREEN' | 'DIVIDE' | 'DIFFERENCE' | 'DARKEN' | 'LIGHTEN' | 'OVERLAY' | 'COLOR_DODGE' | 'COLOR_BURN' | 'LINEAR_LIGHT' | 'CONTRAST' | 'SATURATION' | 'HUE' | 'VALUE', factor?: number, color1?: [number, number, number, number], color2?: [number, number, number, number], position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Texture Coordinate node
     */
    addTextureCoordinate(name?: string, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Mapping node
     */
    addMapping(name?: string, translation?: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number], position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Add a Material Output node
     */
    addMaterialOutput(name?: string, position?: {
        x: number;
        y: number;
    }): ShaderGraphNode;
    /**
     * Connect two nodes together
     */
    connect(fromNode: string | ShaderGraphNode, fromSocket: string, toNode: string | ShaderGraphNode, toSocket: string): NodeLink;
    /**
     * Connect a texture to the base color of a Principled BSDF
     */
    connectTextureToBaseColor(textureNode: string | ShaderGraphNode, bsdfNode: string | ShaderGraphNode, textureOutput?: string, mappingNode?: string | ShaderGraphNode): NodeLink[];
    /**
     * Connect a texture through a ColorRamp to a shader input
     */
    connectTextureThroughColorRamp(textureNode: string | ShaderGraphNode, colorRampNode: string | ShaderGraphNode, shaderNode: string | ShaderGraphNode, shaderInput: string, textureOutput?: string): NodeLink[];
    /**
     * Add an input to the graph interface
     */
    addInput(name: string, type: SocketType, defaultValue?: any): ShaderGraphSocket;
    /**
     * Add an output to the graph interface
     */
    addOutput(name: string, type: SocketType, sourceNode?: string | ShaderGraphNode, sourceSocket?: string): ShaderGraphSocket;
    /**
     * Build the final shader graph
     */
    build(): BuiltShaderGraph;
    /**
     * Reset the builder for a new graph
     */
    reset(): void;
    private generateNodeId;
    private generateTreeId;
    private getDefaultNodeName;
    private initializeNodeSockets;
    private createSocket;
    private validateConnection;
    private areSocketTypesCompatible;
    private convertNodesToTree;
    private optimizeGraph;
}
/**
 * Create a simple PBR material with noise texture
 */
export declare function createPBRMaterialWithNoise(options?: {
    name?: string;
    noiseScale?: number;
    noiseDetail?: number;
    roughness?: number;
    metallic?: number;
}): BuiltShaderGraph;
/**
 * Create a procedural marble material
 */
export declare function createMarbleMaterial(options?: {
    name?: string;
    scale?: number;
    distortion?: number;
    color1?: [number, number, number];
    color2?: [number, number, number];
}): BuiltShaderGraph;
export default ShaderGraphBuilder;
//# sourceMappingURL=ShaderGraphBuilder.d.ts.map