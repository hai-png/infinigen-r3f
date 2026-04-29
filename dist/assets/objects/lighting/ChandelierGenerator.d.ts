import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Chandelier Generator
 *
 * Procedural ornate ceiling light fixtures inspired by Infinigen's indoor lighting system.
 * Generates various chandelier styles with customizable arms, crystals, and light sources.
 *
 * Features:
 * - Multiple chandelier styles (classic, modern, rustic, crystal, minimalist)
 * - Configurable arm count and arrangement
 * - Crystal/drop elements with glass materials
 * - Multiple light bulb types and arrangements
 * - Ornate decorative elements
 * - Material variations (brass, bronze, iron, gold, silver)
 * - LOD support for performance
 */
import * as THREE from 'three';
export type ChandelierStyle = 'classic' | 'modern' | 'rustic' | 'crystal' | 'minimalist' | 'industrial';
export type ChandelierMaterial = 'brass' | 'bronze' | 'iron' | 'gold' | 'silver' | 'black_metal' | 'chrome';
export type BulbType = 'candle' | 'edison' | 'globe' | 'tube' | 'chandelier_bulb';
export interface ChandelierParams extends BaseGeneratorConfig {
    style: ChandelierStyle;
    armCount: number;
    tierCount: number;
    radius: number;
    height: number;
    frameMaterial: ChandelierMaterial;
    crystalType: 'none' | 'glass' | 'crystal' | 'amber' | 'colored';
    crystalCount: number;
    bulbType: BulbType;
    bulbCount: number;
    bulbColor: THREE.Color;
    intensity: number;
    hasOrnaments: boolean;
    ornamentDensity: number;
    chainLength: number;
    lodLevel: number;
}
/**
 * Chandelier Generator Class
 */
export declare class ChandelierGenerator {
    private params;
    private group;
    private materials;
    constructor(params?: Partial<ChandelierParams>);
    /**
     * Generate the complete chandelier
     */
    generate(): THREE.Group;
    /**
     * Create frame material based on type
     */
    private createFrameMaterial;
    /**
     * Create crystal/glass material
     */
    private createCrystalMaterial;
    /**
     * Create bulb emissive material
     */
    private createBulbMaterial;
    /**
     * Create hanging chain/rod
     */
    private createChain;
    /**
     * Create central column/spine
     */
    private createCentralColumn;
    /**
     * Create chandelier arms
     */
    private createArms;
    /**
     * Create hanging crystals/drops
     */
    private createCrystals;
    /**
     * Generate crystal positions
     */
    private generateCrystalPositions;
    /**
     * Create light bulbs
     */
    private createBulbs;
    /**
     * Create decorative ornaments
     */
    private createOrnaments;
    /**
     * Get the generated group
     */
    getGroup(): THREE.Group;
    /**
     * Update parameters and regenerate
     */
    updateParams(params: Partial<ChandelierParams>): void;
    /**
     * Export to JSON
     */
    toJSON(): Record<string, any>;
}
export default ChandelierGenerator;
//# sourceMappingURL=ChandelierGenerator.d.ts.map