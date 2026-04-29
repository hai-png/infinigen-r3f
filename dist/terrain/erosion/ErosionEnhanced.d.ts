/**
 * ErosionEnhanced.ts
 * Hydraulic and thermal erosion with sediment transport
 * Part of Phase 4: Advanced Features - 100% Completion
 */
import * as THREE from 'three';
export interface ErosionConfig {
    hydraulicEnabled: boolean;
    thermalEnabled: boolean;
    iterations: number;
    dropletCount: number;
    sedimentCapacityFactor: number;
    minSedimentCapacity: number;
    erodeSpeed: number;
    depositSpeed: number;
    evaporateSpeed: number;
    gravity: number;
    inertia: number;
    erosionRadius: number;
    sedimentKd: number;
    thermalErosionIterations: number;
    talusAngle: number;
}
export interface Droplet {
    position: THREE.Vector2;
    direction: THREE.Vector2;
    speed: number;
    water: number;
    sediment: number;
    active: boolean;
}
export interface ErosionData {
    heightMap: Float32Array;
    normalMap?: Float32Array;
    width: number;
    height: number;
    scale: number;
}
export declare class HydraulicErosion {
    private config;
    private droplets;
    constructor(config?: Partial<ErosionConfig>);
    erode(data: ErosionData): ErosionData;
    private simulateDroplets;
    private distributeErosion;
    private distributeDeposit;
    private applyThermalErosion;
}
export declare class ThermalErosion {
    private config;
    constructor(config?: Partial<ErosionConfig>);
    erode(data: ErosionData): ErosionData;
}
export declare class SedimentTransport {
    private config;
    constructor(config?: Partial<ErosionConfig>);
    transport(data: ErosionData): ErosionData;
}
export declare class ErosionEnhanced {
    private hydraulic;
    private thermal;
    private sediment;
    private config;
    constructor(config?: Partial<ErosionConfig>);
    erode(data: ErosionData): ErosionData;
    updateConfig(config: Partial<ErosionConfig>): void;
}
export default ErosionEnhanced;
//# sourceMappingURL=ErosionEnhanced.d.ts.map