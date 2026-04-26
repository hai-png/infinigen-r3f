/**
 * Hanger Generator
 *
 * Procedural clothing hangers for wardrobes and closets.
 * Generates various hanger types with realistic proportions and materials.
 *
 * Features:
 * - Multiple hanger types (wire, wooden, plastic, padded, specialty)
 * - Various hook styles
 * - Material variations
 * - Suit, shirt, dress, and pants hangers
 * - Optional clips and bars
 * - LOD support for performance
 */
import * as THREE from 'three';
export type HangerType = 'wire' | 'wooden' | 'plastic' | 'padded' | 'suit' | 'dress' | 'pants' | 'skirt';
export type HangerMaterial = 'metal' | 'wood' | 'plastic' | 'velvet' | 'satin' | 'chrome';
export type HookStyle = 'standard' | 'swivel' | 'rounded' | 'angled';
export interface HangerParams {
    hangerType: HangerType;
    hookStyle: HookStyle;
    material: HangerMaterial;
    width: number;
    shoulderHeight: number;
    hookHeight: number;
    hasBar: boolean;
    hasClips: boolean;
    clipCount: number;
    paddingThickness: number;
    color: THREE.Color;
    finish: 'matte' | 'glossy' | 'satin' | 'textured';
    lodLevel: number;
}
/**
 * Hanger Generator Class
 */
export declare class HangerGenerator {
    private params;
    private group;
    private materials;
    constructor(params?: Partial<HangerParams>);
    /**
     * Generate the complete hanger
     */
    generate(): THREE.Group;
    /**
     * Create main body material
     */
    private createMainMaterial;
    /**
     * Create hook material (usually metal)
     */
    private createHookMaterial;
    /**
     * Create the hook
     */
    private createHook;
    /**
     * Create the neck (center part connecting hook to shoulders)
     */
    private createNeck;
    /**
     * Create the shoulder arms
     */
    private createShoulders;
    /**
     * Create standard shoulder
     */
    private createStandardShoulder;
    /**
     * Create curved shoulder for dress hangers
     */
    private createCurvedShoulder;
    /**
     * Create contoured shoulder for suit hangers
     */
    private createContouredShoulder;
    /**
     * Create padded shoulder
     */
    private createPaddedShoulder;
    /**
     * Create the cross bar (for pants/skirts)
     */
    private createBar;
    /**
     * Create clips for pants/skirt hangers
     */
    private createClips;
    /**
     * Get the generated group
     */
    getGroup(): THREE.Group;
    /**
     * Update parameters and regenerate
     */
    updateParams(params: Partial<HangerParams>): void;
    /**
     * Export to JSON
     */
    toJSON(): Record<string, any>;
}
export default HangerGenerator;
//# sourceMappingURL=HangerGenerator.d.ts.map