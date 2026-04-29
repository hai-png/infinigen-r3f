/**
 * Volume Nodes Module
 * Volume data access, sampling, and volume-to-mesh conversion
 * Ported from Blender Geometry Nodes
 */
import type { NodeBase, AttributeDomain } from '../core/types';
export interface VolumeNodeBase extends NodeBase {
    category: 'volume';
}
export interface VolumeToMeshInputs {
    volume?: any;
    threshold?: number;
    resolution?: number;
    adaptivity?: number;
}
export interface VolumeToMeshOutputs {
    geometry: any;
    vertexCount: number;
    faceCount: number;
}
export declare class VolumeToMeshNode implements VolumeNodeBase {
    readonly category = "volume";
    readonly nodeType = "volume_to_mesh";
    readonly inputs: VolumeToMeshInputs;
    readonly outputs: VolumeToMeshOutputs;
    readonly domain: AttributeDomain;
    constructor(inputs?: VolumeToMeshInputs);
    execute(): VolumeToMeshOutputs;
}
export interface SampleVolumeInputs {
    volume?: any;
    position?: number[];
    attribute?: string;
}
export interface SampleVolumeOutputs {
    value: number;
    gradient: number[];
}
export declare class SampleVolumeNode implements VolumeNodeBase {
    readonly category = "volume";
    readonly nodeType = "sample_volume";
    readonly inputs: SampleVolumeInputs;
    readonly outputs: SampleVolumeOutputs;
    readonly domain: AttributeDomain;
    constructor(inputs?: SampleVolumeInputs);
    execute(): SampleVolumeOutputs;
}
export interface VolumeAttributeStatsInputs {
    volume?: any;
    attribute?: string;
}
export interface VolumeAttributeStatsOutputs {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
}
export declare class VolumeAttributeStatsNode implements VolumeNodeBase {
    readonly category = "volume";
    readonly nodeType = "volume_attribute_stats";
    readonly inputs: VolumeAttributeStatsInputs;
    readonly outputs: VolumeAttributeStatsOutputs;
    readonly domain: AttributeDomain;
    constructor(inputs?: VolumeAttributeStatsInputs);
    execute(): VolumeAttributeStatsOutputs;
}
export interface DensityToAlphaInputs {
    density?: number;
    cutoff?: number;
    alphaScale?: number;
}
export interface DensityToAlphaOutputs {
    alpha: number;
}
export declare class DensityToAlphaNode implements VolumeNodeBase {
    readonly category = "volume";
    readonly nodeType = "density_to_alpha";
    readonly inputs: DensityToAlphaInputs;
    readonly outputs: DensityToAlphaOutputs;
    readonly domain: AttributeDomain;
    constructor(inputs?: DensityToAlphaInputs);
    execute(): DensityToAlphaOutputs;
}
export declare function createVolumeToMeshNode(inputs?: VolumeToMeshInputs): VolumeToMeshNode;
export declare function createSampleVolumeNode(inputs?: SampleVolumeInputs): SampleVolumeNode;
export declare function createVolumeAttributeStatsNode(inputs?: VolumeAttributeStatsInputs): VolumeAttributeStatsNode;
export declare function createDensityToAlphaNode(inputs?: DensityToAlphaInputs): DensityToAlphaNode;
export { VolumeToMeshNode, SampleVolumeNode, VolumeAttributeStatsNode, DensityToAlphaNode, };
export type { VolumeNodeBase, VolumeToMeshInputs, VolumeToMeshOutputs, SampleVolumeInputs, SampleVolumeOutputs, VolumeAttributeStatsInputs, VolumeAttributeStatsOutputs, DensityToAlphaInputs, DensityToAlphaOutputs, };
//# sourceMappingURL=VolumeNodes.d.ts.map