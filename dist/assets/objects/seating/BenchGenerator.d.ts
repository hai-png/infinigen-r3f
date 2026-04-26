/**
 * Bench Generator
 *
 * Procedural generation of benches including
 * park benches, garden benches, indoor benches,
 * picnic tables, and storage benches.
 *
 * @module BenchGenerator
 */
import * as THREE from 'three';
export type BenchType = 'park' | 'garden' | 'indoor' | 'picnic' | 'storage' | 'swings' | 'memorial';
export type BenchMaterial = 'wood' | 'metal' | 'concrete' | 'stone' | 'composite' | 'wrought_iron';
export type BenchStyle = 'traditional' | 'modern' | 'rustic' | 'ornate' | 'minimal';
export interface BenchParams {
    type: BenchType;
    material: BenchMaterial;
    style: BenchStyle;
    length: number;
    width: number;
    height: number;
    seatHeight: number;
    backrestHeight: number;
    armrests: boolean;
    backrest: boolean;
    color: THREE.Color;
    secondaryColor?: THREE.Color;
    slatCount: number;
    decorative: boolean;
}
export interface BenchResult {
    mesh: THREE.Group;
    params: BenchParams;
}
export declare class BenchGenerator {
    private noise;
    constructor();
    /**
     * Generate a bench
     */
    generate(params?: Partial<BenchParams>): BenchResult;
    /**
     * Create bench legs
     */
    private createLegs;
    /**
     * Create traditional turned leg
     */
    private createTraditionalLeg;
    /**
     * Create ornate decorative leg
     */
    private createOrnateLeg;
    /**
     * Create modern simple leg
     */
    private createModernLeg;
    /**
     * Create rustic log-style leg
     */
    private createRusticLeg;
    /**
     * Create seat surface
     */
    private createSeat;
    /**
     * Create individual slat
     */
    private createSlat;
    /**
     * Create seat support frame
     */
    private createSeatFrame;
    /**
     * Create backrest
     */
    private createBackrest;
    /**
     * Create armrests
     */
    private createArmrests;
    /**
     * Create stretcher bar between legs
     */
    private createStretcher;
    /**
     * Create decorative elements
     */
    private createDecorations;
    /**
     * Create picnic table extension
     */
    private createPicnicTable;
    /**
     * Create storage box under seat
     */
    private createStorageBox;
    /**
     * Create swing bench frame
     */
    private createSwingBench;
    /**
     * Get appropriate material
     */
    private getMaterial;
    /**
     * Get wood material
     */
    private getWoodMaterial;
    /**
     * Get metal material
     */
    private getMetalMaterial;
    /**
     * Get wrought iron material
     */
    private getWroughtIronMaterial;
    /**
     * Generate a row of benches
     */
    generateRow(count: number, spacing: number, params?: Partial<BenchParams>): THREE.Group;
}
export default BenchGenerator;
//# sourceMappingURL=BenchGenerator.d.ts.map