/**
 * CliffGenerator - Procedural cliff and rock wall generation
 *
 * Generates realistic cliff faces, rock walls, and vertical terrain features:
 * - Layered sedimentary rock formations
 * - Vertical fracture patterns
 * - Overhangs and ledges
 * - Erosion-based detailing
 * - Integration with RockGenerator for material consistency
 */
import * as THREE from 'three';
import { RockType } from './RockGenerator';
export interface CliffConfig {
    width: number;
    height: number;
    depth: number;
    segments: number;
    layerCount: number;
    layerVariation: number;
    overhangAmount: number;
    fractureDensity: number;
    fractureDepth: number;
    fractureWidth: number;
    erosionIntensity: number;
    weatheringLevel: number;
    rockType: RockType;
    layerColorVariation: boolean;
    useLOD: boolean;
    seed: number;
}
export interface CliffLayer {
    height: number;
    colorOffset: THREE.Color;
    roughnessOffset: number;
    displacementScale: number;
}
export declare class CliffGenerator {
    private config;
    private noise;
    private rockGenerator;
    constructor(config?: Partial<CliffConfig>);
    /**
     * Generate a cliff face mesh
     */
    generate(): THREE.Mesh;
    /**
     * Create cliff geometry with layers and fractures
     */
    private createCliffGeometry;
    /**
     * Apply sedimentary layer pattern
     */
    private applyLayers;
    /**
     * Add vertical fracture patterns
     */
    private addFractures;
    /**
     * Apply erosion effects
     */
    private applyErosion;
    /**
     * Add overhangs and ledges
     */
    private addOverhangs;
    /**
     * Create cliff material with layer variation
     */
    private createCliffMaterial;
    /**
     * Generate multiple cliff segments for larger formations
     */
    generateCliffFormation(count: number, spacing: number): THREE.Group;
    /**
     * Update configuration
     */
    setConfig(config: Partial<CliffConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): CliffConfig;
    /**
     * Dispose resources
     */
    dispose(): void;
}
export default CliffGenerator;
//# sourceMappingURL=CliffGenerator.d.ts.map