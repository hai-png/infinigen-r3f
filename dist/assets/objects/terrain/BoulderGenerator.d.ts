/**
 * BoulderGenerator - Large boulder and rock formation generator
 *
 * Generates large-scale boulder formations for terrain enhancement.
 * Uses procedural noise-based displacement for realistic rock surfaces.
 *
 * Features:
 * - Multiple boulder shapes (round, angular, flat, irregular)
 * - Size variation from 1m to 10m+ diameter
 * - Surface weathering and erosion effects
 * - Material variation (granite, limestone, sandstone, basalt)
 * - Instancing support for performance
 *
 * @module BoulderGenerator
 */
import * as THREE from 'three';
export type BoulderType = 'round' | 'angular' | 'flat' | 'irregular' | 'weathered';
export type BoulderMaterial = 'granite' | 'limestone' | 'sandstone' | 'basalt' | 'slate';
export interface BoulderConfig {
    type: BoulderType;
    size: number;
    sizeVariation: number;
    detailLevel: number;
    displacementScale: number;
    displacementDetail: number;
    materialType: BoulderMaterial;
    colorVariation: number;
    roughness: number;
    metalness: number;
    weatheringAmount: number;
    erosionLevel: number;
    mossCoverage: number;
    rotationRandomization: number;
    scaleRandomization: number;
}
export declare class BoulderGenerator {
    private noise;
    private config;
    constructor(config?: Partial<BoulderConfig>);
    /**
     * Generate a single boulder mesh
     */
    generateBoulder(position?: THREE.Vector3): THREE.Mesh;
    /**
     * Generate multiple boulders as instanced mesh
     */
    generateBoulderInstances(count: number, areaSize: number): THREE.InstancedMesh;
    /**
     * Create boulder geometry based on type
     */
    private createBoulderGeometry;
    /**
     * Make boulder more spherical/rounded
     */
    private makeRound;
    /**
     * Make boulder more angular with sharp edges
     */
    private makeAngular;
    /**
     * Make boulder flatter (sedimentary rock style)
     */
    private makeFlat;
    /**
     * Make boulder irregular with varied features
     */
    private makeIrregular;
    /**
     * Add weathering effects to boulder surface
     */
    private makeWeathered;
    /**
     * Apply detailed displacement to surface
     */
    private applyDisplacement;
    /**
     * Create boulder material
     */
    private createBoulderMaterial;
    /**
     * Get base color for material type
     */
    private getMaterialColor;
    /**
     * Generate a boulder field
     */
    generateBoulderField(count: number, areaSize: number, terrainHeight?: (x: number, z: number) => number): THREE.Group;
    /**
     * Update configuration
     */
    setConfig(config: Partial<BoulderConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): BoulderConfig;
}
export default BoulderGenerator;
//# sourceMappingURL=BoulderGenerator.d.ts.map