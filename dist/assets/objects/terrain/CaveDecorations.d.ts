/**
 * CaveDecorations - Stalactites, stalagmites, crystals, and cave features
 *
 * Generates procedural cave decorations:
 * - Stalactites (hanging from ceiling)
 * - Stalagmites (rising from floor)
 * - Crystal formations
 * - Rock columns
 * - Water drips and pools
 */
import * as THREE from 'three';
export type CaveDecorationType = 'stalactite' | 'stalagmite' | 'crystal' | 'column' | 'flowstone';
export interface CaveDecorationConfig {
    density: number;
    sizeVariation: number;
    decorationTypes: CaveDecorationType[];
    stalactiteLength: [number, number];
    stalagmiteHeight: [number, number];
    crystalSize: [number, number];
    rockColor: THREE.Color;
    crystalColor: THREE.Color;
    wetness: number;
    seed: number;
}
export interface CaveDecorationInstance {
    type: CaveDecorationType;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    mesh: THREE.Mesh;
}
export declare class CaveDecorations {
    private config;
    private noise;
    private instances;
    constructor(config?: Partial<CaveDecorationConfig>);
    /**
     * Generate cave decorations for a cave area
     */
    generate(area: number): THREE.Group;
    /**
     * Generate a random decoration
     */
    private generateRandomDecoration;
    /**
     * Create stalactite mesh (hanging from ceiling)
     */
    private createStalactite;
    /**
     * Create stalagmite mesh (rising from floor)
     */
    private createStalagmite;
    /**
     * Create crystal formation
     */
    private createCrystal;
    /**
     * Create column (connected stalactite + stalagmite)
     */
    private createColumn;
    /**
     * Create flowstone (water-worn rock formation)
     */
    private createFlowstone;
    /**
     * Get all decoration instances
     */
    getInstances(): CaveDecorationInstance[];
    /**
     * Update configuration
     */
    setConfig(config: Partial<CaveDecorationConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): CaveDecorationConfig;
    /**
     * Clear all instances
     */
    clear(): void;
    /**
     * Dispose resources
     */
    dispose(): void;
}
export default CaveDecorations;
//# sourceMappingURL=CaveDecorations.d.ts.map