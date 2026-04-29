import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Blind Generator
 *
 * Procedural generation of window blinds including
 * vertical blinds, horizontal blinds, roller shades,
 * roman shades, and shutters.
 *
 * @module BlindGenerator
 */
import * as THREE from 'three';
export type BlindType = 'horizontal' | 'vertical' | 'roller' | 'roman' | 'venetian' | 'shutter' | 'pleated';
export type BlindMaterial = 'aluminum' | 'wood' | 'fabric' | 'vinyl' | 'bamboo';
export type ControlType = 'manual' | 'motorized' | 'smart';
export interface BlindParams extends BaseGeneratorConfig {
    type: BlindType;
    material: BlindMaterial;
    width: number;
    height: number;
    slatWidth?: number;
    slatThickness?: number;
    color: THREE.Color;
    tiltAngle: number;
    openRatio: number;
    controlType: ControlType;
    cordColor: THREE.Color;
    mountingType: 'inside' | 'outside' | 'ceiling';
}
export interface BlindResult {
    mesh: THREE.Group;
    mount: THREE.Mesh;
    controls: THREE.Group;
    params: BlindParams;
}
export declare class BlindGenerator {
    private noise;
    constructor();
    /**
     * Generate window blinds
     */
    generate(params?: Partial<BlindParams>): BlindResult;
    /**
     * Get default slat width for blind type
     */
    private getDefaultSlatWidth;
    /**
     * Get default slat thickness
     */
    private getDefaultSlatThickness;
    /**
     * Create mounting bracket
     */
    private createMount;
    /**
     * Create horizontal blinds (standard or venetian)
     */
    private createHorizontalBlinds;
    /**
     * Create vertical blinds
     */
    private createVerticalBlinds;
    /**
     * Create roller shade
     */
    private createRollerShade;
    /**
     * Create roman shade
     */
    private createRomanShade;
    /**
     * Create plantation shutters
     */
    private createShutters;
    /**
     * Create pleated shade
     */
    private createPleatedShade;
    /**
     * Create individual slat/vane
     */
    private createSlat;
    /**
     * Create ladder tapes for horizontal blinds
     */
    private createLadderTapes;
    /**
     * Create bottom rail for horizontal blinds
     */
    private createBottomRail;
    /**
     * Create headrail for vertical blinds
     */
    private createHeadrail;
    /**
     * Create control system (cords, wands, motors)
     */
    private createControlSystem;
    /**
     * Get appropriate material based on type
     */
    private getMaterial;
    /**
     * Get fabric material with appropriate properties
     */
    private getFabricMaterial;
    /**
     * Generate a set of matching blinds for multiple windows
     */
    generateSet(windowCount: number, windowWidth: number, windowHeight: number, spacing: number, params?: Partial<BlindParams>): THREE.Group;
}
export default BlindGenerator;
//# sourceMappingURL=BlindGenerator.d.ts.map