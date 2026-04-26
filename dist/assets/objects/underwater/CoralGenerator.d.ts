import * as THREE from 'three';
/**
 * Coral Generator for underwater reef systems
 *
 * Generates procedural coral formations with various species,
 * color morphs, and growth patterns.
 */
export interface CoralParams {
    species: CoralSpecies;
    size: number;
    complexity: number;
    colorVariation: number;
    branchDensity: number;
    polypDetail: boolean;
    health: number;
}
export type CoralSpecies = 'branching' | 'brain' | 'plate' | 'massive' | 'soft' | 'tube';
export interface CoralPreset {
    name: string;
    params: Partial<CoralParams>;
}
export declare class CoralGenerator {
    private static presets;
    /**
     * Generate coral geometry based on parameters
     */
    static generate(params?: Partial<CoralParams>): THREE.BufferGeometry;
    /**
     * Generate branching coral (staghorn, elkhorn)
     */
    private static generateBranchingCoral;
    private static createBranch;
    /**
     * Generate brain coral with maze-like surface
     */
    private static generateBrainCoral;
    /**
     * Generate plate/table coral
     */
    private static generatePlateCoral;
    /**
     * Generate massive/boulder coral
     */
    private static generateMassiveCoral;
    /**
     * Generate soft coral/sea fan
     */
    private static generateSoftCoral;
    /**
     * Generate tube coral
     */
    private static generateTubeCoral;
    /**
     * Get preset by name
     */
    static getPreset(name: string): CoralPreset | null;
    /**
     * Get all available presets
     */
    static getPresets(): CoralPreset[];
}
//# sourceMappingURL=CoralGenerator.d.ts.map