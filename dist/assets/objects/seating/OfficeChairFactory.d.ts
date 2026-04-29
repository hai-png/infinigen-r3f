/**
 * OfficeChairFactory - Procedural office chair generator
 *
 * Ported from Infinigen's OfficeChairFactory (Princeton VL)
 * Generates ergonomic office chairs with adjustable components
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
export interface OfficeChairConfig {
    seatWidth: number;
    seatDepth: number;
    seatHeight: number;
    backHeight: number;
    backWidth: number;
    seatThickness: number;
    seatPadding: number;
    seatFrontCurve: number;
    seatBackCurve: number;
    backType: 'mesh' | 'solid' | 'slatted';
    backTilt: number;
    lumbarSupport: boolean;
    hasArms: boolean;
    armHeight: number;
    armWidth: number;
    armPadding: boolean;
    baseType: 'five-star' | 'four-star' | 'pedestal';
    baseRadius: number;
    hasWheels: boolean;
    wheelCount: number;
    gasLiftHeight: number;
    gasLiftDiameter: number;
}
export interface OfficeChairResult {
    mesh: THREE.Group;
    config: OfficeChairConfig;
    materials: THREE.Material[];
}
/**
 * Procedural office chair generator with ergonomic features
 */
export declare class OfficeChairFactory extends AssetFactory<OfficeChairConfig, OfficeChairResult> {
    protected readonly backTypes: readonly ["mesh", "solid", "slatted"];
    protected readonly baseTypes: readonly ["five-star", "four-star", "pedestal"];
    constructor(seed?: number);
    getDefaultConfig(): OfficeChairConfig;
    /**
     * Generate random office chair configuration
     */
    generateConfig(): OfficeChairConfig;
    /**
     * Create office chair from configuration
     */
    create(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create chair base (star-shaped with optional wheels)
     */
    protected createBase(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create gas lift cylinder
     */
    protected createGasLift(config: OfficeChairConfig): THREE.Mesh & {
        material: THREE.Material;
    };
    /**
     * Create seat mechanism
     */
    protected createMechanism(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create seat cushion
     */
    protected createSeat(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create backrest
     */
    protected createBackrest(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create slatted back geometry
     */
    protected createSlattedBackGeometry(config: OfficeChairConfig): THREE.BufferGeometry;
    /**
     * Create armrests
     */
    protected createArmrests(config: OfficeChairConfig): OfficeChairResult;
    /**
     * Create wheel caster
     */
    protected createWheel(): THREE.Mesh;
    /**
     * Merge geometries from a group
     */
    protected mergeGroupGeometries(group: THREE.Group): THREE.BufferGeometry;
    /**
     * Material creators
     */
    protected createPlasticMaterial(): THREE.MeshStandardMaterial;
    protected createMetalMaterial(): THREE.MeshStandardMaterial;
    protected createFabricMaterial(): THREE.MeshStandardMaterial;
    protected createMeshMaterial(): THREE.MeshStandardMaterial;
    protected createFoamMaterial(): THREE.MeshStandardMaterial;
}
//# sourceMappingURL=OfficeChairFactory.d.ts.map