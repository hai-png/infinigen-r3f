/**
 * WallShelfGenerator - Wall-mounted shelf system
 *
 * Generates procedural wall-mounted shelves for interior decoration.
 * Supports various styles, materials, and mounting configurations.
 *
 * Features:
 * - Multiple shelf styles (floating, bracketed, recessed)
 * - Adjustable dimensions and proportions
 * - Material variation (wood, metal, glass, stone)
 * - Decorative bracket options
 * - Multi-tier configurations
 * - Wall mounting hardware
 *
 * @module WallShelfGenerator
 */
import * as THREE from 'three';
export type ShelfStyle = 'floating' | 'bracketed' | 'recessed' | 'ledged' | 'corner';
export type ShelfMaterial = 'wood' | 'metal' | 'glass' | 'stone' | 'composite';
export type BracketStyle = 'simple' | 'ornate' | 'industrial' | 'hidden' | 'decorative';
export interface ShelfConfig {
    width: number;
    depth: number;
    thickness: number;
    style: ShelfStyle;
    material: ShelfMaterial;
    bracketStyle: BracketStyle;
    color: THREE.Color;
    roughness: number;
    metalness: number;
    tiers: number;
    tierSpacing: number;
    hasBack: boolean;
    hasSides: boolean;
    mountType: 'visible' | 'hidden' | 'french_cleat';
    mountDepth: number;
}
export declare class WallShelfGenerator {
    private config;
    constructor(config?: Partial<ShelfConfig>);
    /**
     * Generate a complete wall shelf assembly
     */
    generateShelf(position?: THREE.Vector3): THREE.Group;
    /**
     * Create individual shelf board
     */
    private createShelfBoard;
    /**
     * Add decorative edge detail
     */
    private addEdgeDetail;
    /**
     * Add support brackets
     */
    private addBrackets;
    /**
     * Create bracket based on style
     */
    private createBracket;
    /**
     * Create simple L-bracket
     */
    private createSimpleBracket;
    /**
     * Create ornate bracket with curves
     */
    private createOrnateBracket;
    /**
     * Create industrial pipe bracket
     */
    private createIndustrialBracket;
    /**
     * Create decorative scrolled bracket
     */
    private createDecorativeBracket;
    /**
     * Add front ledge to shelf
     */
    private addLedge;
    /**
     * Create back panel
     */
    private createBackPanel;
    /**
     * Add side panels
     */
    private addSidePanels;
    /**
     * Add mounting hardware
     */
    private addMountingHardware;
    /**
     * Get shelf material based on configuration
     */
    private getMaterial;
    /**
     * Get bracket material
     */
    private getBracketMaterial;
    /**
     * Generate corner shelf variant
     */
    generateCornerShelf(position?: THREE.Vector3): THREE.Group;
    /**
     * Update configuration
     */
    setConfig(config: Partial<ShelfConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): ShelfConfig;
}
export default WallShelfGenerator;
//# sourceMappingURL=WallShelfGenerator.d.ts.map