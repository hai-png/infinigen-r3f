import * as THREE from 'three';
/**
 * Sea urchin types with specific characteristics
 */
export declare enum UrchinType {
    REGULAR = "regular",
    LONG_SPINED = "long_spined",
    PENCIL = "pencil",
    FIRE = "fire",
    COLLECTOR = "collector"
}
export interface UrchinConfig {
    type: UrchinType;
    bodySize: number;
    spineLength: number;
    spineCount: number;
    spineThickness: number;
    color: THREE.Color;
    spineColor: THREE.Color;
    tipColor?: THREE.Color;
    venomous: boolean;
    roughness: number;
}
/**
 * Generates procedural sea urchin meshes with detailed spines
 */
export declare class UrchinGenerator {
    private static materialCache;
    private static spineGeometryCache;
    /**
     * Generate a single sea urchin mesh
     */
    static generateUrchin(config: UrchinConfig): THREE.Group;
    /**
     * Create urchin body geometry (hemispherical test)
     */
    private static createBodyGeometry;
    /**
     * Get or create spine geometry
     */
    private static getSpineGeometry;
    /**
     * Create tapered cylinder geometry
     */
    private static createTaperedCylinder;
    /**
     * Create barbed spine geometry (for fire urchin)
     */
    private static createBarbedSpine;
    /**
     * Distribute spine positions on sphere surface using Fibonacci sphere
     */
    private static distributeSpines;
    /**
     * Get material for urchin body
     */
    private static getBodyMaterial;
    /**
     * Get material for spines
     */
    private static getSpineMaterial;
    /**
     * Generate cluster of sea urchins
     */
    static generateCluster(config: UrchinConfig, count: number, area: {
        width: number;
        depth: number;
    }): THREE.Group;
    /**
     * Get preset configurations for different urchin types
     */
    static getPreset(type: UrchinType): UrchinConfig;
}
//# sourceMappingURL=UrchinGenerator.d.ts.map