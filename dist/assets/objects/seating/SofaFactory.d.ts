/**
 * SofaFactory - Procedural sofa generator
 *
 * Ported from Infinigen's SofaFactory (Princeton VL)
 * Generates varied sofa designs with configurable sections, arms, backs, and cushions
 */
import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
export type SofaStyle = 'modern' | 'traditional' | 'sectional' | 'loveseat';
export type ArmStyle = 'rounded' | 'square' | 'rolled' | 'track';
export interface SofaConfig {
    width: number;
    depth: number;
    height: number;
    seatHeight: number;
    sofaStyle: SofaStyle;
    armStyle: ArmStyle;
    sectionCount: number;
    hasChaise: boolean;
    cushionThickness: number;
    cushionSegments: number;
    backCushionCount: number;
    armWidth: number;
    armHeight: number;
    legStyle: 'wood' | 'metal' | 'hidden';
    legHeight: number;
    legDiameter: number;
    fabricColor: THREE.Color;
}
export declare class SofaFactory extends AssetFactory {
    protected config: SofaConfig;
    private static readonly SOFA_STYLES;
    private static readonly ARM_STYLES;
    constructor(factorySeed?: number, coarse?: boolean);
    getDefaultConfig(): SofaConfig;
    /**
     * Generate random sofa configuration
     */
    protected generateConfig(): SofaConfig;
    /**
     * Create placeholder bounding box
     */
    createPlaceholder(): THREE.Object3D;
    /**
     * Create complete sofa asset
     */
    createAsset(params?: AssetParameters): THREE.Object3D;
    /**
     * Generate sofa base frame
     */
    protected makeBase(): THREE.Mesh;
    /**
     * Generate seat cushions
     */
    protected makeSeatCushions(): THREE.Mesh[];
    /**
     * Generate back cushions
     */
    protected makeBackCushions(): THREE.Mesh[];
    /**
     * Generate armrests
     */
    protected makeArms(): THREE.Mesh[];
    /**
     * Generate legs
     */
    protected makeLegs(): THREE.Mesh[];
    /**
     * Generate chaise section for sectional sofas
     */
    protected makeChaise(): THREE.Object3D;
}
//# sourceMappingURL=SofaFactory.d.ts.map