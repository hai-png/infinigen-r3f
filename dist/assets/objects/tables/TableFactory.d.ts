/**
 * TableFactory - Procedural table generator
 *
 * Ported from Infinigen's DiningTable/CocktailTable factories (Princeton VL)
 * Generates varied table designs with configurable tops, legs, and stretchers
 */
import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
import { BezierCurveGenerator } from '../../utils/curves';
export type LegStyle = 'straight' | 'square' | 'single_stand' | 'wheeled';
export type TopShape = 'rectangle' | 'round' | 'oval' | 'square';
export interface TableConfig {
    width: number;
    depth: number;
    height: number;
    topShape: TopShape;
    topThickness: number;
    topOverhang: number;
    topProfileAspect: number;
    legStyle: LegStyle;
    legCount: number;
    legDiameter: number;
    legHeight: number;
    legPlacementTopScale: number;
    legPlacementBottomScale: number;
    legNGon: number;
    hasStretcher: boolean;
    stretcherRelativePos: number;
    stretcherIncrement: number;
    stretcherWidth: number;
    topMaterialColor: THREE.Color;
    legMaterialColor: THREE.Color;
}
export declare class TableFactory extends AssetFactory {
    protected config: TableConfig;
    protected curveGenerator: BezierCurveGenerator;
    private static readonly LEG_STYLES;
    private static readonly TOP_SHAPES;
    constructor(factorySeed?: number, coarse?: boolean);
    getDefaultConfig(): TableConfig;
    /**
     * Generate random table configuration
     */
    protected generateConfig(): TableConfig;
    /**
     * Create placeholder bounding box
     */
    createPlaceholder(): THREE.Object3D;
    /**
     * Create complete table asset
     */
    createAsset(params?: AssetParameters): THREE.Object3D;
    /**
     * Generate table top mesh
     */
    protected makeTableTop(): THREE.Mesh;
    /**
     * Create oval table top using curve extrusion
     */
    protected createOvalTop(): THREE.BufferGeometry;
    /**
     * Generate leg meshes
     */
    protected makeLegs(): THREE.Mesh[];
    /**
     * Get leg positions based on table config
     */
    protected getLegPositions(): THREE.Vector3[];
    /**
     * Create single pedestal leg
     */
    protected makeSingleStandLeg(): THREE.Mesh;
    /**
     * Create individual leg at position
     */
    protected makeIndividualLeg(position: THREE.Vector3): THREE.Mesh;
    /**
     * Generate stretcher bars between legs
     */
    protected makeStretchers(legs: THREE.Mesh[]): THREE.Mesh[];
}
//# sourceMappingURL=TableFactory.d.ts.map