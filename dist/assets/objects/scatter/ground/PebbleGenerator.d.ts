/**
 * PebbleGenerator - Small ground decoration stones
 *
 * Generates procedural pebbles and small stones for ground cover:
 * - Multiple size variations
 * - Natural shape irregularity
 * - Material diversity
 * - Optimized for instanced rendering
 */
import * as THREE from 'three';
export interface PebbleConfig {
    sizeMin: number;
    sizeMax: number;
    count: number;
    segments: number;
    irregularity: number;
    colors: THREE.Color[];
    roughness: number;
    metalness: number;
    spread: number;
    seed: number;
}
export interface PebbleInstance {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    color: THREE.Color;
}
export declare class PebbleGenerator {
    private config;
    private noise;
    private baseGeometry;
    constructor(config?: Partial<PebbleConfig>);
    /**
     * Create base pebble geometry
     */
    private createBasePebbleGeometry;
    /**
     * Apply shape irregularity
     */
    private applyIrregularity;
    /**
     * Generate pebbles as instanced mesh
     */
    generate(): THREE.InstancedMesh;
    /**
     * Generate pebbles as individual instances
     */
    generateInstances(): PebbleInstance[];
    /**
     * Update configuration
     */
    setConfig(config: Partial<PebbleConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): PebbleConfig;
    /**
     * Dispose resources
     */
    dispose(): void;
}
export default PebbleGenerator;
//# sourceMappingURL=PebbleGenerator.d.ts.map