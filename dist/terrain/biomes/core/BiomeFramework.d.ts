/**
 * BiomeFramework.ts
 * Complete biome interpolation, transition zones, and dynamic asset scattering
 * Part of Phase 3: Assets & Materials - 100% Completion
 */
import * as THREE from 'three';
import type { BiomeDefinition, BiomeBlend } from './BiomeSystem';
import type { AssetMetadata } from '../assets/core/AssetTypes';
export interface BiomeTransitionZone {
    startBiome: string;
    endBiome: string;
    blendWidth: number;
    elevationRange?: [number, number];
    slopeRange?: [number, number];
}
export interface ScatteredAsset {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    assetId: string;
    metadata: AssetMetadata;
    biomeAffinity: number;
}
export interface BiomeScatterConfig {
    density: number;
    minDistance: number;
    maxDistance: number;
    alignmentToNormal: boolean;
    randomRotation: boolean;
    scaleVariation: [number, number];
}
export declare class BiomeInterpolator {
    private biomes;
    private transitionZones;
    constructor();
    registerBiome(biome: BiomeDefinition): void;
    addTransitionZone(zone: BiomeTransitionZone): void;
    interpolate(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend;
    private calculateBiomeAffinity;
}
export declare class BiomeScatterer {
    private config;
    private assetPool;
    constructor(config?: Partial<BiomeScatterConfig>);
    addAssetToPool(assetId: string, metadata: AssetMetadata): void;
    scatter(area: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    }, biomeBlend: BiomeBlend, heightMap?: (x: number, z: number) => number, normalMap?: (x: number, z: number) => THREE.Vector3): ScatteredAsset[];
    private selectAssetForBiome;
    private calculatePositionAffinity;
}
export declare class BiomeFramework {
    private interpolator;
    private scatterer;
    private activeZones;
    constructor();
    initialize(biomes: BiomeDefinition[], zones?: BiomeTransitionZone[]): void;
    getBiomeBlend(position: THREE.Vector3, normal: THREE.Vector3): BiomeBlend;
    scatterAssets(area: {
        min: THREE.Vector3;
        max: THREE.Vector3;
    }, position: THREE.Vector3, normal: THREE.Vector3, heightMap?: (x: number, z: number) => number, normalMap?: (x: number, z: number) => THREE.Vector3): ScatteredAsset[];
    addAssetToPool(assetId: string, metadata: AssetMetadata): void;
    createTransitionGradient(start: THREE.Vector3, end: THREE.Vector3, steps?: number): BiomeBlend[];
    getTransitionZones(): BiomeTransitionZone[];
}
export default BiomeFramework;
//# sourceMappingURL=BiomeFramework.d.ts.map