/**
 * LampBase - Abstract base class for procedural lamp generation
 *
 * Provides common functionality for all lamp types including:
 * - Base structures (various shapes and materials)
 * - Stem/pole systems
 * - Shade attachments
 * - Bulb/socket simulation
 * - Light emission integration
 */
import { Group, Mesh } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { BBox } from '../../../core/util/math/index';
export interface LampParams extends BaseGeneratorConfig {
    style: 'modern' | 'traditional' | 'industrial' | 'minimal' | 'art-deco';
    baseMaterial: 'metal' | 'wood' | 'ceramic' | 'glass' | 'stone';
    shadeMaterial: 'fabric' | 'paper' | 'glass' | 'metal' | 'plastic';
    shadeShape: 'cylinder' | 'cone' | 'sphere' | 'rectangle' | 'empire';
    bulbType: 'edison' | 'led' | 'fluorescent' | 'halogen';
    hasDimmer: boolean;
    cordLength: number;
    switchType: 'pull-chain' | 'inline' | 'base' | 'touch';
}
export declare abstract class LampBase extends BaseObjectGenerator<LampParams> {
    protected defaultParams: LampParams;
    getDefaultConfig(): LampParams;
    constructor();
    protected validateParams(params: Partial<LampParams>): Partial<LampParams>;
    /**
     * Generate the lamp base structure
     */
    protected generateBase(params: LampParams, width?: number, height?: number): Group;
    /**
     * Generate the stem/pole connecting base to shade
     */
    protected generateStem(params: LampParams, height?: number, diameter?: number): Mesh;
    /**
     * Generate the lampshade
     */
    protected generateShade(params: LampParams, topRadius?: number, bottomRadius?: number, height?: number): Mesh;
    /**
     * Generate bulb and socket assembly
     */
    protected generateBulbAssembly(params: LampParams): Group;
    /**
     * Generate power cord
     */
    protected generateCord(params: LampParams, length: number): Mesh;
    /**
     * Generate switch based on type
     */
    protected generateSwitch(params: LampParams): Mesh | null;
    /**
     * Material helpers
     */
    protected getBaseMaterial(material: string, style: string): any;
    protected getShadeMaterial(material: string, style: string): any;
    protected getMetalMaterial(type: string): any;
    getBoundingBox(params: LampParams): BBox;
    getCollisionMesh(params: LampParams): Mesh;
    getRandomParams(): LampParams;
}
//# sourceMappingURL=LampBase.d.ts.map