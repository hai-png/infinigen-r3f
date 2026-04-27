import * as THREE from 'three';
export interface WaterParams {
    baseColor: THREE.Color;
    deepColor: THREE.Color;
    foamColor: THREE.Color;
    transparency: number;
    roughness: number;
    metalness: number;
    waveHeight: number;
    waveSpeed: number;
    enableFoam: boolean;
    enableCaustics: boolean;
    [key: string]: unknown;
}
export type WaterPreset = 'ocean' | 'lake' | 'river' | 'pool' | 'swamp';
export interface WaterMaterialConfig {
    baseColor: THREE.Color;
    deepColor: THREE.Color;
    foamColor: THREE.Color;
    transparency: number;
    roughness: number;
    metalness: number;
    waveHeight: number;
    waveSpeed: number;
    enableFoam: boolean;
    enableCaustics: boolean;
}
export declare class WaterMaterial {
    private config;
    private material;
    private time;
    constructor(config?: Partial<WaterMaterialConfig>);
    private createMaterial;
    private generateWaterSurface;
    private getWaveHeight;
    update(deltaTime: number): void;
    getMaterial(): THREE.MeshPhysicalMaterial;
    static createPreset(preset: 'ocean' | 'lake' | 'river' | 'pool' | 'swamp'): WaterMaterial;
}
//# sourceMappingURL=WaterMaterial.d.ts.map