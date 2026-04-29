/**
 * Texture Nodes - Procedural texture generation nodes
 * Based on Blender texture nodes and infinigen asset generation
 *
 * These nodes generate procedural textures for materials and shading
 */
import { NodeTypes } from '../core/node-types';
import type { Color } from 'three';
export interface TextureNodeBase {
    type: NodeTypes;
    name: string;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
}
export interface TextureBrickInputs {
    vector?: [number, number, number];
    scale?: number;
    offset?: number;
    frequency?: number;
    brickWidth?: number;
    rowHeight?: number;
    mortarSize?: number;
    mortarSmooth?: number;
    offsetAmount?: number;
    offsetFrequency?: number;
}
export interface TextureBrickOutputs {
    color: Color;
    float: number;
}
export interface TextureCheckerInputs {
    vector?: [number, number, number];
    scale?: number;
}
export interface TextureCheckerOutputs {
    color: Color;
    float: number;
}
export interface TextureGradientInputs {
    vector?: [number, number, number];
    gradientType?: 'linear' | 'quadratic' | 'easing' | 'diagonal' | 'spherical' | 'radial';
    interpolation?: 'constant' | 'linear' | 'cubic' | 'smooth' | 'ease' | 'cardinal';
}
export interface TextureGradientOutputs {
    color: Color;
    float: number;
}
export interface TextureNoiseInputs {
    vector?: [number, number, number];
    scale?: number;
    detail?: number;
    roughness?: number;
    distortion?: number;
    lacunarity?: number;
    offset?: number;
    gain?: number;
}
export interface TextureNoiseOutputs {
    color: Color;
    float: number;
}
export interface TextureVoronoiInputs {
    vector?: [number, number, number];
    scale?: number;
    smoothness?: number;
    exponent?: number;
    intensity?: number;
    distanceMetric?: 'euclidean' | 'manhattan' | 'chebychev' | 'minkowski';
    featureMode?: 'distance' | 'distance_to_edge' | 'n_sphere_radius' | 'f1' | 'f2-f1' | 'smooth_f1' | 'user_int';
    seed?: number;
}
export interface TextureVoronoiOutputs {
    distance: number;
    position: [number, number, number];
    color: Color;
}
export interface TextureWaveInputs {
    vector?: [number, number, number];
    xAmplitude?: number;
    yAmplitude?: number;
    xScale?: number;
    yScale?: number;
    velocity?: number;
    time?: number;
    waveType?: 'sine' | 'saw' | 'triangle' | 'square';
    bandPass?: boolean;
}
export interface TextureWaveOutputs {
    color: Color;
    float: number;
}
export interface TextureWhiteNoiseInputs {
    seed?: number;
    id?: number;
}
export interface TextureWhiteNoiseOutputs {
    value: number;
    color: Color;
}
export interface TextureMusgraveInputs {
    vector?: [number, number, number];
    scale?: number;
    detail?: number;
    dimension?: number;
    lacunarity?: number;
    offset?: number;
    gain?: number;
    musgraveType?: 'fbm' | 'multifractal' | 'ridged_multifractal' | 'hybrid_multifractal' | 'hetero_terrain';
}
export interface TextureMusgraveOutputs {
    float: number;
}
export interface TextureMagicInputs {
    vector?: [number, number, number];
    scale?: number;
    distort?: number;
    depth?: number;
}
export interface TextureMagicOutputs {
    color: Color;
    float: number;
}
export interface TextureGaborInputs {
    vector?: [number, number, number];
    scale?: number;
    orientation?: number;
    anisotropy?: number;
    frequency?: number;
    phase?: number;
}
export interface TextureGaborOutputs {
    float: number;
}
/**
 * Texture Brick Node
 * Generates a brick pattern texture with customizable parameters
 */
export declare class TextureBrickNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureBrick;
    readonly name = "Texture Brick";
    inputs: TextureBrickInputs;
    outputs: TextureBrickOutputs;
    execute(): TextureBrickOutputs;
}
/**
 * Texture Checker Node
 * Generates a checkerboard pattern
 */
export declare class TextureCheckerNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureChecker;
    readonly name = "Texture Checker";
    inputs: TextureCheckerInputs;
    outputs: TextureCheckerOutputs;
    execute(): TextureCheckerOutputs;
}
/**
 * Texture Gradient Node
 * Generates gradient patterns (linear, radial, spherical, etc.)
 */
export declare class TextureGradientNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureGradient;
    readonly name = "Texture Gradient";
    inputs: TextureGradientInputs;
    outputs: TextureGradientOutputs;
    execute(): TextureGradientOutputs;
    private applyInterpolation;
}
/**
 * Texture Noise Node
 * Generates Perlin/Simplex noise patterns
 */
export declare class TextureNoiseNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureNoise;
    readonly name = "Texture Noise";
    inputs: TextureNoiseInputs;
    outputs: TextureNoiseOutputs;
    execute(): TextureNoiseOutputs;
    private perlinNoise;
    private fade;
    private lerp;
    private grad;
    private p;
    constructor();
}
/**
 * Texture Voronoi Node
 * Generates Voronoi/Worley noise patterns
 */
export declare class TextureVoronoiNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureVoronoi;
    readonly name = "Texture Voronoi";
    inputs: TextureVoronoiInputs;
    outputs: TextureVoronoiOutputs;
    execute(): TextureVoronoiOutputs;
    private voronoi;
    private hash;
}
/**
 * Texture Wave Node
 * Generates wave patterns (sine, saw, triangle, square)
 */
export declare class TextureWaveNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureWave;
    readonly name = "Texture Wave";
    inputs: TextureWaveInputs;
    outputs: TextureWaveOutputs;
    execute(): TextureWaveOutputs;
}
/**
 * Texture White Noise Node
 * Generates random white noise
 */
export declare class TextureWhiteNoiseNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureWhiteNoise;
    readonly name = "Texture White Noise";
    inputs: TextureWhiteNoiseInputs;
    outputs: TextureWhiteNoiseOutputs;
    execute(): TextureWhiteNoiseOutputs;
    private hash;
}
/**
 * Texture Musgrave Node
 * Generates fractal noise patterns (FBM, multifractal, etc.)
 */
export declare class TextureMusgraveNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureMusgrave;
    readonly name = "Texture Musgrave";
    inputs: TextureMusgraveInputs;
    outputs: TextureMusgraveOutputs;
    execute(): TextureMusgraveOutputs;
    private perlinNoise;
}
/**
 * Texture Magic Node
 * Generates magical/swirly patterns
 */
export declare class TextureMagicNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureMagic;
    readonly name = "Texture Magic";
    inputs: TextureMagicInputs;
    outputs: TextureMagicOutputs;
    execute(): TextureMagicOutputs;
}
/**
 * Texture Gabor Node
 * Generates Gabor noise patterns (oriented noise)
 */
export declare class TextureGaborNode implements TextureNodeBase {
    readonly type = NodeTypes.TextureGabor;
    readonly name = "Texture Gabor";
    inputs: TextureGaborInputs;
    outputs: TextureGaborOutputs;
    execute(): TextureGaborOutputs;
}
export declare function createTextureBrickNode(inputs?: Partial<TextureBrickInputs>): TextureBrickNode;
export declare function createTextureCheckerNode(inputs?: Partial<TextureCheckerInputs>): TextureCheckerNode;
export declare function createTextureGradientNode(inputs?: Partial<TextureGradientInputs>): TextureGradientNode;
export declare function createTextureNoiseNode(inputs?: Partial<TextureNoiseInputs>): TextureNoiseNode;
export declare function createTextureVoronoiNode(inputs?: Partial<TextureVoronoiInputs>): TextureVoronoiNode;
export declare function createTextureWaveNode(inputs?: Partial<TextureWaveInputs>): TextureWaveNode;
export declare function createTextureWhiteNoiseNode(inputs?: Partial<TextureWhiteNoiseInputs>): TextureWhiteNoiseNode;
export declare function createTextureMusgraveNode(inputs?: Partial<TextureMusgraveInputs>): TextureMusgraveNode;
export declare function createTextureMagicNode(inputs?: Partial<TextureMagicInputs>): TextureMagicNode;
export declare function createTextureGaborNode(inputs?: Partial<TextureGaborInputs>): TextureGaborNode;
//# sourceMappingURL=TextureNodes.d.ts.map