import * as THREE from 'three';
/**
 * Starfish types with specific characteristics
 */
export declare enum StarfishType {
    COMMON = "common",
    CUSHION = "cushion",
    SUN = "sun",
    KNOBBY = "knobby",
    BLOOD = "blood",
    CHOCOLATE = "chocolate"
}
export interface StarfishConfig {
    type: StarfishType;
    armCount: number;
    armLength: number;
    armWidth: number;
    bodySize: number;
    color: THREE.Color;
    pattern: 'solid' | 'spotted' | 'striped' | 'gradient';
    patternColor?: THREE.Color;
    roughness: number;
    bumpiness: number;
}
/**
 * Generates procedural starfish meshes with various species and patterns
 */
export declare class StarfishGenerator {
    private static materialCache;
    private static geometryCache;
    /**
     * Generate a single starfish mesh
     */
    static generateStarfish(config: StarfishConfig): THREE.Mesh;
    /**
     * Get unique key for geometry caching
     */
    private static getGeometryKey;
    /**
     * Create starfish geometry using parametric surface
     */
    private static createStarfishGeometry;
    /**
     * Calculate radius at given angle for starfish shape
     */
    private static getStarfishRadius;
    /**
     * Calculate height at position for 3D form
     */
    private static calculateHeight;
    /**
     * Get or create material for starfish
     */
    private static getMaterial;
    /**
     * Generate scattered starfish on seabed
     */
    static generateScatter(configs: StarfishConfig[], count: number, area: {
        width: number;
        depth: number;
    }): THREE.Group;
    /**
     * Get preset configurations for different starfish types
     */
    static getPreset(type: StarfishType): StarfishConfig;
}
//# sourceMappingURL=StarfishGenerator.d.ts.map