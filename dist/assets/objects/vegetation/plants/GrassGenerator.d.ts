import * as THREE from 'three';
/**
 * GrassGenerator - Procedural grass field generation with instanced rendering
 *
 * Features:
 * - Multiple grass varieties (fine, coarse, mixed)
 * - Wind animation support
 * - Color variation for natural appearance
 * - Optimized for large-scale terrain coverage
 *
 * @module vegetation/plants
 */
export interface GrassConfig {
    bladeHeight: number;
    bladeWidth: number;
    density: number;
    colorBase: THREE.Color;
    colorVariation: THREE.Color;
    windAmplitude: number;
    windFrequency: number;
    count: number;
    spreadArea: {
        width: number;
        depth: number;
    };
    variety: 'fine' | 'coarse' | 'mixed';
}
/**
 * Generates grass blades optimized for instanced rendering
 */
export declare class GrassGenerator {
    private noiseUtils;
    private materialCache;
    constructor();
    /**
     * Generate instanced grass field
     */
    generateGrassField(config?: Partial<GrassConfig>): THREE.InstancedMesh;
    /**
     * Create grass blade geometry
     */
    private createGrassBladeGeometry;
    /**
     * Get grass material with optional gradient
     */
    private getGrassMaterial;
    /**
     * Generate grass clumps for more natural distribution
     */
    generateGrassClumps(config: Partial<GrassConfig> & {
        clumpCount: number;
        clumpSize: number;
    }): THREE.Group;
    /**
     * Generate tall grass varieties
     */
    generateTallGrass(config?: Partial<GrassConfig>): THREE.InstancedMesh;
    /**
     * Clear material cache
     */
    dispose(): void;
}
//# sourceMappingURL=GrassGenerator.d.ts.map