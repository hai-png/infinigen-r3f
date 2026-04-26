/**
 * Outdoor Light Generator
 *
 * Procedural generation of outdoor lighting fixtures including
 * street lights, garden lights, pathway lights, and flood lights.
 *
 * @module OutdoorLightGenerator
 */
import * as THREE from 'three';
export type OutdoorLightType = 'street' | 'garden' | 'pathway' | 'flood' | 'bollard' | 'wall' | 'post';
export type LightStyle = 'modern' | 'vintage' | 'industrial' | 'decorative' | 'minimal';
export interface OutdoorLightParams {
    type: OutdoorLightType;
    style: LightStyle;
    height: number;
    poleThickness: number;
    lightColor: THREE.Color;
    intensity: number;
    range: number;
    coneAngle?: number;
    materialType: 'metal' | 'wood' | 'concrete' | 'plastic';
    fixtureCount: number;
    decorative: boolean;
    solarPanel: boolean;
}
export interface OutdoorLightResult {
    mesh: THREE.Group;
    lights: THREE.Light[];
    params: OutdoorLightParams;
}
export declare class OutdoorLightGenerator {
    private noise;
    constructor();
    /**
     * Generate an outdoor light fixture
     */
    generate(params?: Partial<OutdoorLightParams>): OutdoorLightResult;
    /**
     * Create the main pole structure
     */
    private createPole;
    /**
     * Create light fixture at top of pole
     */
    private createFixture;
    /**
     * Create support arm based on style
     */
    private createArm;
    /**
     * Create lamp housing
     */
    private createHousing;
    /**
     * Create actual light source
     */
    private createLightSource;
    /**
     * Create glass lens/cover
     */
    private createLens;
    /**
     * Create solar panel attachment
     */
    private createSolarPanel;
    /**
     * Create decorative elements
     */
    private createDecorations;
    /**
     * Get appropriate material for pole
     */
    private getPoleMaterial;
    /**
     * Get arm end position for fixture placement
     */
    private getArmEndPosition;
    /**
     * Generate a row of street lights
     */
    generateStreetLightRow(count: number, spacing: number, params?: Partial<OutdoorLightParams>): THREE.Group;
    /**
     * Generate garden path lighting
     */
    generatePathwayLights(length: number, spacing: number, params?: Partial<OutdoorLightParams>): THREE.Group;
}
export default OutdoorLightGenerator;
//# sourceMappingURL=OutdoorLightGenerator.d.ts.map