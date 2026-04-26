import * as THREE from 'three';
import { InstancedMesh } from 'three';
/**
 * Configuration for grass scattering
 */
export interface GrassScatterConfig {
    density: number;
    minSpacing: number;
    maxSpacing: number;
    bladeHeight: number;
    bladeHeightVariation: number;
    bladeWidth: number;
    bladeSegments: number;
    bladeColor: THREE.Color;
    bladeColorVariation: number;
    enableWind: boolean;
    windSpeed: number;
    windStrength: number;
    area: THREE.Box3;
    excludeObjects?: THREE.Object3D[];
}
/**
 * Grass Scatter System
 * Generates realistic grass fields using instanced meshes
 */
export declare class GrassScatterSystem {
    private config;
    private mesh;
    private dummy;
    private time;
    constructor(config: Partial<GrassScatterConfig>);
    /**
     * Generate grass field
     */
    generate(): InstancedMesh;
    /**
     * Create individual grass blade geometry
     */
    private createBladeGeometry;
    /**
     * Check if position is too close to existing positions
     */
    private isTooClose;
    /**
     * Update wind animation
     */
    update(deltaTime: number): void;
    /**
     * Get grass mesh
     */
    getMesh(): InstancedMesh | null;
    /**
     * Update configuration
     */
    setConfig(config: Partial<GrassScatterConfig>): void;
}
//# sourceMappingURL=GrassScatterSystem.d.ts.map