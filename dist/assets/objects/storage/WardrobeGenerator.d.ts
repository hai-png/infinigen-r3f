import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Wardrobe Generator
 *
 * Procedural generation of wardrobes and armoires including
 * freestanding wardrobes, built-in closets, armoires,
 * and wardrobe cabinets with various door styles.
 *
 * @module WardrobeGenerator
 */
import * as THREE from 'three';
export type WardrobeType = 'freestanding' | 'built-in' | 'armoire' | 'cabinet' | 'walk-in' | 'chifforobe';
export type DoorStyle = 'sliding' | 'hinged' | 'bi-fold' | 'curtain' | 'french';
export type WardrobeMaterial = 'wood' | 'mdf' | 'metal' | 'glass' | 'mirrored' | 'composite';
export type InteriorLayout = 'hanging-only' | 'shelves-only' | 'mixed' | 'custom';
export interface WardrobeParams extends BaseGeneratorConfig {
    type: WardrobeType;
    doorStyle: DoorStyle;
    material: WardrobeMaterial;
    width: number;
    height: number;
    depth: number;
    doorCount: number;
    color: THREE.Color;
    interiorColor?: THREE.Color;
    handleStyle: 'knob' | 'pull' | 'recessed' | 'ornate' | 'none';
    interiorLayout: InteriorLayout;
    shelves: boolean;
    drawers: boolean;
    mirror: boolean;
    decorative: boolean;
    feet: boolean;
    crown: boolean;
}
export interface WardrobeResult {
    mesh: THREE.Group;
    doors: THREE.Mesh[];
    interior: THREE.Group;
    params: WardrobeParams;
}
export declare class WardrobeGenerator {
    private noise;
    constructor();
    getDefaultConfig(): WardrobeParams;
    /**
     * Generate a wardrobe
     */
    generate(params?: Partial<WardrobeParams>): WardrobeResult;
    /**
     * Create main cabinet box
     */
    private createCabinet;
    /**
     * Create door system
     */
    private createDoors;
    /**
     * Create individual door
     */
    private createDoor;
    /**
     * Create panel door geometry (French style)
     */
    private createPanelDoorGeometry;
    /**
     * Create door handle
     */
    private createHandle;
    /**
     * Create interior layout
     */
    private createInterior;
    /**
     * Create interior drawer
     */
    private createDrawer;
    /**
     * Create wardrobe feet/base
     */
    private createFeet;
    /**
     * Create crown molding
     */
    private createCrown;
    /**
     * Create decorative elements
     */
    private createDecorations;
    /**
     * Get appropriate material
     */
    private getMaterial;
    /**
     * Get door material (may differ from cabinet body)
     */
    private getDoorMaterial;
    /**
     * Generate a set of matching wardrobes
     */
    generateSet(count: number, spacing: number, params?: Partial<WardrobeParams>): THREE.Group;
}
export default WardrobeGenerator;
//# sourceMappingURL=WardrobeGenerator.d.ts.map