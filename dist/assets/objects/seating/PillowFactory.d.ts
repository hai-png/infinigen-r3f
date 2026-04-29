/**
 * PillowFactory - Procedural pillow generator
 *
 * Ported from Infinigen's PillowFactory (Princeton VL)
 * Generates varied pillow shapes with configurable seams and materials
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
export interface PillowConfig {
    shape: 'square' | 'rectangle' | 'circle' | 'torus';
    width: number;
    size: number;
    thickness: number;
    bevelWidth: number;
    extrudeThickness: number;
    hasSeam: boolean;
    seamRadius: number;
}
export interface PillowResult {
    mesh: THREE.Mesh;
    config: PillowConfig;
    material: THREE.Material;
}
/**
 * Procedural pillow generator with multiple shape options
 */
export declare class PillowFactory extends AssetFactory<PillowConfig, PillowResult> {
    protected readonly shapes: readonly ["square", "rectangle", "circle", "torus"];
    protected readonly shapeWeights: number[];
    constructor(seed?: number);
    getDefaultConfig(): PillowConfig;
    /**
     * Generate random pillow configuration
     */
    generateConfig(): PillowConfig;
    /**
     * Create pillow from configuration
     */
    create(config: PillowConfig): PillowResult;
    /**
     * Create square pillow geometry
     */
    protected createSquareGeometry(config: PillowConfig): THREE.BufferGeometry;
    /**
     * Create rectangle pillow geometry
     */
    protected createRectangleGeometry(config: PillowConfig): THREE.BufferGeometry;
    /**
     * Create circle pillow geometry
     */
    protected createCircleGeometry(config: PillowConfig): THREE.BufferGeometry;
    /**
     * Create torus (donut) pillow geometry
     */
    protected createTorusGeometry(config: PillowConfig): THREE.BufferGeometry;
    /**
     * Apply bevel effect to geometry edges
     */
    protected applyBevel(geometry: THREE.BufferGeometry, bevelWidth: number): void;
    /**
     * Add seam detail to pillow
     */
    protected addSeam(geometry: THREE.BufferGeometry, config: PillowConfig): void;
    /**
     * Create fabric material for pillow
     */
    protected createFabricMaterial(): THREE.MeshStandardMaterial;
}
//# sourceMappingURL=PillowFactory.d.ts.map