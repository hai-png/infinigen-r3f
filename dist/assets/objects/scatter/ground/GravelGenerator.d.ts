import * as THREE from 'three';
/**
 * Configuration for gravel generation
 */
export interface GravelConfig {
    sizeMin: number;
    sizeMax: number;
    count: number;
    spreadArea: {
        width: number;
        depth: number;
    };
    colorBase: THREE.Color;
    colorVariation: THREE.Color;
    density: number;
    includeMixedSizes: boolean;
}
/**
 * Generates gravel particles for ground cover
 * Optimized for instanced rendering of many small stones
 */
export declare class GravelGenerator {
    private noiseUtils;
    private materialCache;
    constructor();
    /**
     * Generate instanced gravel mesh for large quantities
     */
    generateGravelInstanced(config?: Partial<GravelConfig>): THREE.InstancedMesh;
    /**
     * Generate gravel path or trail
     */
    generateGravelPath(config: Partial<GravelConfig> & {
        pathWidth: number;
        pathLength: number;
        curvature?: number;
    }): THREE.InstancedMesh;
    /**
     * Create simple gravel geometry
     */
    private createGravelGeometry;
    /**
     * Get or create gravel material
     */
    private getGravelMaterial;
    /**
     * Generate decorative gravel borders
     */
    generateGravelBorder(config: {
        innerRadius: number;
        outerRadius: number;
        arcAngle?: number;
        segmentCount?: number;
    }): THREE.Group;
    /**
     * Clear material cache
     */
    dispose(): void;
}
//# sourceMappingURL=GravelGenerator.d.ts.map