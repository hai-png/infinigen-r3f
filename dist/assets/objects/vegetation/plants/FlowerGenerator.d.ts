import * as THREE from 'three';
/**
 * FlowerGenerator - Procedural flower generation with multiple species
 *
 * Features:
 * - Multiple flower varieties (daisy, tulip, rose, wildflower, mixed)
 * - Customizable petal count, shape, and colors
 * - Stem and leaf generation
 * - Scattering support for meadow creation
 *
 * @module vegetation/plants
 */
export interface FlowerConfig {
    petalCount: number;
    petalLength: number;
    petalWidth: number;
    stemHeight: number;
    stemThickness: number;
    colorBase: THREE.Color;
    colorCenter: THREE.Color;
    leafCount: number;
    variety: 'daisy' | 'tulip' | 'rose' | 'wildflower' | 'mixed';
    count: number;
    spreadArea: {
        width: number;
        depth: number;
    };
    density: number;
}
/**
 * Generates flower meshes with various types
 */
export declare class FlowerGenerator {
    private noiseUtils;
    private materialCache;
    constructor();
    /**
     * Generate a single flower mesh
     */
    generateFlower(config?: Partial<FlowerConfig>): THREE.Group;
    /**
     * Generate flower field with instanced rendering
     */
    generateFlowerField(config?: Partial<FlowerConfig>): THREE.InstancedMesh;
    /**
     * Create flower stem
     */
    private createStem;
    /**
     * Create leaf attached to stem
     */
    private createLeaf;
    /**
     * Create flower head with petals and center
     */
    private createFlowerHead;
    /**
     * Create petal geometry based on flower variety
     */
    private createPetalGeometry;
    private createDaisyPetal;
    private createTulipPetal;
    private createRosePetal;
    private createWildflowerPetal;
    /**
     * Create simplified flower geometry for instanced rendering
     */
    private createSimpleFlowerGeometry;
    /**
     * Get flower material
     */
    private getFlowerMaterial;
    /**
     * Clear material cache
     */
    dispose(): void;
}
//# sourceMappingURL=FlowerGenerator.d.ts.map