import * as THREE from 'three';
/**
 * Configuration for stone tile material properties
 */
export interface StoneTileMaterialConfig {
    baseColor: THREE.Color;
    mortarColor: THREE.Color;
    tileSize: number;
    mortarWidth: number;
    roughness: number;
    normalScale: number;
    weatheringEnabled: boolean;
    weatheringIntensity: number;
    crackDensity: number;
    mossCoverage: number;
}
/**
 * Procedural stone tile material generator for floors, walls, and paths
 */
export declare class StoneTileMaterial {
    private static readonly DEFAULT_CONFIG;
    /**
     * Generate a stone tile material with procedural textures
     */
    static generate(config?: Partial<StoneTileMaterialConfig>): THREE.MeshStandardMaterial;
    /**
     * Generate tile texture with mortar lines and weathering
     */
    private static generateTileTexture;
    /**
     * Generate normal map for tile surface
     */
    private static generateNormalMap;
    /**
     * Generate roughness map
     */
    private static generateRoughnessMap;
    /**
     * Add crack details to a tile
     */
    private static addCrack;
    /**
     * Add moss growth to tiles
     */
    private static addMoss;
    /**
     * Add overall weathering effect
     */
    private static addWeathering;
    /**
     * Create preset configurations for different stone tile types
     */
    static getPreset(tileType: string): StoneTileMaterialConfig;
}
//# sourceMappingURL=StoneTileMaterial.d.ts.map