/**
 * ChairFactory - Procedural chair generator
 *
 * Ported from Infinigen's ChairFactory (Princeton VL)
 * Generates varied chair designs with configurable legs, backs, arms, and materials
 */
import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
import { BezierCurveGenerator } from '../../utils/curves';
export interface ChairConfig {
    width: number;
    size: number;
    thickness: number;
    bevelWidth: number;
    seatBack: number;
    seatMid: number;
    seatMidX: number;
    seatMidZ: number;
    seatFront: number;
    isSeatRound: boolean;
    isSeatSubsurf: boolean;
    legThickness: number;
    limbProfile: number;
    legHeight: number;
    backHeight: number;
    isLegRound: boolean;
    legType: 'vertical' | 'straight' | 'up-curved' | 'down-curved';
    legXOffset: number;
    legYOffset: [number, number];
    backXOffset: number;
    backYOffset: number;
    hasLegXBar: boolean;
    hasLegYBar: boolean;
    legOffsetBar: [number, number];
    hasArm: boolean;
    armThickness: number;
    armHeight: number;
    armY: number;
    armZ: number;
    armMid: THREE.Vector3;
    armProfile: number[];
    backThickness: number;
    backType: 'whole' | 'partial' | 'horizontal-bar' | 'vertical-bar';
    backProfile: [number, number][];
    backVerticalCuts: number;
    backPartialScale: number;
}
export declare class ChairFactory extends AssetFactory {
    protected config: ChairConfig;
    protected curveGenerator: BezierCurveGenerator;
    private static readonly BACK_TYPES;
    constructor(factorySeed?: number, coarse?: boolean);
    getDefaultConfig(): ChairConfig;
    /**
     * Generate random chair configuration
     */
    protected generateConfig(): ChairConfig;
    /**
     * Create placeholder bounding box
     */
    createPlaceholder(): THREE.Object3D;
    /**
     * Create complete chair asset
     */
    createAsset(params?: AssetParameters): THREE.Object3D;
    /**
     * Generate seat mesh using bezier curves
     */
    protected makeSeat(): THREE.Mesh;
    /**
     * Generate leg meshes
     */
    protected makeLegs(): THREE.Mesh[];
    /**
     * Generate limb segments (legs, backs)
     */
    protected makeLimbs(ends: THREE.Vector3[], starts: THREE.Vector3[]): THREE.Mesh[];
    /**
     * Generate back support meshes
     */
    protected makeBacks(): THREE.Mesh[];
    /**
     * Generate leg decoration bars
     */
    protected makeLegDecors(legs: THREE.Mesh[]): THREE.Mesh[];
    /**
     * Generate back decoration panels
     */
    protected makeBackDecors(backs: THREE.Mesh[]): THREE.Mesh[];
    /**
     * Generate armrests
     */
    protected makeArms(base: THREE.Mesh, backs: THREE.Mesh[]): THREE.Mesh[];
}
//# sourceMappingURL=ChairFactory.d.ts.map