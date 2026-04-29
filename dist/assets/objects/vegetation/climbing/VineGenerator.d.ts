import * as THREE from 'three';
/**
 * Vine Configuration Interface
 * Defines all parameters for vine generation
 */
export interface VineConfig {
    /** Vine species */
    species: 'ivy' | 'wisteria' | 'grapevine' | 'creeper';
    /** Growth pattern */
    growthPattern: 'climbing' | 'hanging' | 'spreading';
    /** Total length in meters */
    length: number;
    /** Stem thickness */
    stemThickness: number;
    /** Leaf density (0-1) */
    leafDensity: number;
    /** Leaf size */
    leafSize: number;
    /** Include flowers/fruits */
    hasFlowers: boolean;
    /** Flower/fruit color */
    flowerColor?: THREE.Color;
    /** Attachment points for climbing */
    attachmentPoints?: THREE.Vector3[];
    /** Growth direction */
    growthDirection: THREE.Vector3;
}
/**
 * Vine Generator
 * Generates climbing and hanging vines with realistic growth simulation
 *
 * Features:
 * - Multiple species (ivy, wisteria, grapevine, creeper)
 * - Various growth patterns (climbing, hanging, spreading)
 * - Procedural stem generation with natural curves
 * - Leaf placement with density control
 * - Optional flowers/fruits
 * - Attachment point system for climbing surfaces
 */
export declare class VineGenerator {
    private defaultConfig;
    /**
     * Generate a vine system
     * @deprecated Use the canonical VineGenerator from '@assets/objects/vegetation'
     */
    generate(config?: Partial<VineConfig>): THREE.Group;
    /**
     * Generate vine stems based on growth pattern
     */
    private generateStems;
    /**
     * Generate climbing stems (wall-climbing vines)
     */
    private generateClimbingStems;
    /**
     * Generate hanging stems (jungle vines, wisteria)
     */
    private generateHangingStems;
    /**
     * Generate spreading stems (ground cover, creepers)
     */
    private generateSpreadingStems;
    /**
     * Generate leaves along stems
     */
    private generateLeaves;
    /**
     * Generate flowers/fruits
     */
    private generateFlowers;
    /**
     * Get stem material based on species
     */
    private getStemMaterial;
    /**
     * Get leaf material based on species
     */
    private getLeafMaterial;
    /**
     * Create leaf geometry based on species
     */
    private createLeafGeometry;
    private createIvyLeafGeometry;
    private createWisteriaLeafGeometry;
    private createGrapevineLeafGeometry;
    private createSimpleLeafGeometry;
    /**
     * Create flower geometry based on species
     */
    private createFlowerGeometry;
    private createWisteriaFlowerGeometry;
    private createGrapeFlowerGeometry;
    /**
     * Simple 2D perlin noise implementation for backward compatibility
     */
    private perlin2D;
    private fade;
    private lerp;
    private grad;
}
//# sourceMappingURL=VineGenerator.d.ts.map