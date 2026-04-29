import * as THREE from 'three';
/**
 * Twig and branch types for forest floor debris
 */
export declare enum TwigType {
    SMALL_TWIG = "small_twig",
    MEDIUM_BRANCH = "medium_branch",
    LARGE_BRANCH = "large_branch",
    TWISTED = "twisted",
    STRAIGHT = "straight"
}
/**
 * Bark texture types
 */
export declare enum BarkType {
    SMOOTH = "smooth",
    ROUGH = "rough",
    FURROWED = "furrowed",
    PEELING = "peeling"
}
export interface TwigConfig {
    twigType: TwigType;
    barkType: BarkType;
    density: number;
    area: THREE.Vector2;
    lengthVariation: [number, number];
    radiusVariation: [number, number];
    mossCoverage?: number;
    lichenCoverage?: number;
    breakagePatterns?: boolean;
}
/**
 * Generates realistic twig and branch scatter for forest floors
 */
export declare class TwigGenerator {
    private static readonly BARK_COLORS;
    private static readonly MOSS_COLOR;
    private static readonly LICHEN_COLOR;
    /**
     * Generate twig scatter with instanced rendering
     */
    static generate(config: TwigConfig): THREE.InstancedMesh;
    /**
     * Create twig/branch geometry based on type
     */
    private static createTwigGeometry;
    /**
     * Create twisted branch geometry
     */
    private static createTwistedBranch;
    /**
     * Add breakage patterns to branch ends
     */
    private static addBreakagePatterns;
    /**
     * Add bark texture detail using vertex displacement
     */
    private static addBarkDetail;
    /**
     * Determine if breakage patterns should be added
     */
    private static shouldAddBreakage;
    /**
     * Calculate height based on terrain
     */
    private static calculateHeight;
    /**
     * Generate twig clusters (fallen branch piles)
     */
    static generateClusters(config: TwigConfig, clusterCount: number): THREE.Group;
    /**
     * Add moss growth to twigs
     */
    static addMossGrowth(mesh: THREE.InstancedMesh, coverage: number): void;
    /**
     * Add lichen growth to twigs
     */
    static addLichenGrowth(mesh: THREE.InstancedMesh, coverage: number): void;
}
//# sourceMappingURL=TwigGenerator.d.ts.map