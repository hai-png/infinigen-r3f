import * as THREE from 'three';
/**
 * Seashell types with specific characteristics
 */
export declare enum SeashellType {
    CLAM = "clam",
    SCALLOP = "scallop",
    CONCH = "conch",
    NAUTILUS = "nautilus",
    COWRIE = "cowrie",
    MUSSEL = "mussel",
    OYSTER = "oyster",
    COCKLE = "cockle"
}
export interface SeashellConfig {
    type: SeashellType;
    size: number;
    color: THREE.Color;
    secondaryColor: THREE.Color;
    patternIntensity: number;
    roughness: number;
    metalness: number;
    iridescence: boolean;
    damageLevel: number;
}
/**
 * Generates procedural seashell meshes with various species and patterns
 */
export declare class SeashellGenerator {
    private static materialCache;
    /**
     * Generate a single seashell mesh
     */
    static generateShell(config: SeashellConfig): THREE.Mesh;
    /**
     * Create shell geometry based on type
     */
    private static createShellGeometry;
    /**
     * Create bivalve shell (clam, mussel)
     */
    private static createBivalveShell;
    /**
     * Create scallop shell with fan shape
     */
    private static createScallopShell;
    /**
     * Create spiral shell (conch, nautilus)
     */
    private static createSpiralShell;
    /**
     * Add flared opening to conch shell
     */
    private static addConchFlare;
    /**
     * Create cowrie shell (smooth, egg-shaped)
     */
    private static createCowrieShell;
    /**
     * Create oyster shell (irregular, rough)
     */
    private static createOysterShell;
    /**
     * Create cockle shell (heart-shaped with prominent ribs)
     */
    private static createCockleShell;
    /**
     * Get or create material for seashell
     */
    private static getMaterial;
    /**
     * Generate scattered seashells on seabed
     */
    static generateScatter(types: SeashellType[], count: number, area: {
        width: number;
        depth: number;
    }): THREE.Group;
    /**
     * Get preset configurations for different seashell types
     */
    static getPreset(type: SeashellType): SeashellConfig;
}
//# sourceMappingURL=SeashellGenerator.d.ts.map