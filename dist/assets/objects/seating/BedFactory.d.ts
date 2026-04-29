/**
 * BedFactory - Procedural bed generator
 *
 * Ported from Infinigen's BedFactory (Princeton VL)
 * Generates complete beds with frame, mattress, pillows, and optional bedding
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
export interface BedConfig {
    width: number;
    size: number;
    thickness: number;
    legThickness: number;
    legHeight: number;
    backHeight: number;
    hasAllLegs: boolean;
    legDecorType: 'coiled' | 'pad' | 'plain' | 'legs';
    legDecorWrapped: boolean;
    mattressType: 'coiled' | 'wrapped';
    mattressWidthRatio: number;
    mattressSizeRatio: number;
    sheetType: 'quilt' | 'comforter' | 'box_comforter' | 'none';
    sheetFolded: boolean;
    hasCover: boolean;
    pillowCount: number;
    pillowType: 'standard' | 'king' | 'body';
    seatSubdivisionsX: number;
    seatSubdivisionsY: number;
    dotDistance: number;
    dotSize: number;
    dotDepth: number;
    panelDistance: number;
    panelMargin: number;
}
export interface BedResult {
    mesh: THREE.Group;
    config: BedConfig;
    materials: THREE.Material[];
}
/**
 * Procedural bed generator with configurable frame, mattress, and bedding
 */
export declare class BedFactory extends AssetFactory<BedConfig, BedResult> {
    protected readonly sheetTypes: readonly ["quilt", "comforter", "box_comforter", "none"];
    protected readonly mattressTypes: readonly ["coiled", "wrapped"];
    protected readonly legDecorTypes: readonly ["coiled", "pad", "plain", "legs"];
    protected readonly pillowTypes: readonly ["standard", "king", "body"];
    constructor(seed?: number);
    getDefaultConfig(): BedConfig;
    /**
     * Generate random bed configuration
     */
    generateConfig(): BedConfig;
    /**
     * Create bed from configuration
     */
    create(config: BedConfig): BedResult;
    /**
     * Create bed frame with headboard and legs
     */
    protected createFrame(config: BedConfig): BedResult;
    /**
     * Create mattress
     */
    protected createMattress(config: BedConfig): BedResult;
    /**
     * Create pillows
     */
    protected createPillows(config: BedConfig): BedResult;
    /**
     * Create bedding (quilt/comforter)
     */
    protected createBedding(config: BedConfig): BedResult;
    /**
     * Create leg decoration
     */
    protected createLegDecor(config: BedConfig): THREE.Mesh;
    /**
     * Add decorations to headboard
     */
    protected decorateHeadboard(headboard: THREE.Mesh, config: BedConfig): void;
    /**
     * Add quilting pattern to mattress
     */
    protected addQuiltingPattern(mattress: THREE.Mesh, config: BedConfig): void;
    /**
     * Get pillow dimensions based on type
     */
    protected getPillowDimensions(type: string): [number, number, number];
    /**
     * Create wood material for frame
     */
    protected createWoodMaterial(): THREE.MeshStandardMaterial;
    /**
     * Create fabric material for mattress/bedding
     */
    protected createFabricMaterial(): THREE.MeshStandardMaterial;
    /**
     * Get random wood color
     */
    protected getRandomWoodColor(): number;
    /**
     * Get random fabric color
     */
    protected getRandomFabricColor(): number;
}
//# sourceMappingURL=BedFactory.d.ts.map