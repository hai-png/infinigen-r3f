/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Terrain Utilities and Helper Functions
 */
import { Vector3, Box3 } from 'three';
import { HeightMap } from './core/TerrainGenerator';
export interface WaterConfig {
    level: number;
    color: number;
    opacity: number;
    animated: boolean;
    waveSpeed: number;
    waveHeight: number;
}
export declare class TerrainUtils {
    /**
     * Sample height at specific coordinates with bilinear interpolation
     */
    static sampleHeight(heightMap: HeightMap, width: number, x: number, y: number): number;
    /**
     * Calculate slope at specific coordinates
     */
    static calculateSlope(heightMap: HeightMap, width: number, x: number, y: number): number;
    /**
     * Get normal vector at specific coordinates
     */
    static getNormalAt(heightMap: HeightMap, normalMap: HeightMap, width: number, x: number, y: number): Vector3;
    /**
     * Check if position is underwater
     */
    static isUnderwater(height: number, waterLevel: number): boolean;
    /**
     * Get water depth at position
     */
    static getWaterDepth(height: number, waterLevel: number): number;
    /**
     * Create water plane geometry config
     */
    static createWaterConfig(config?: Partial<WaterConfig>): WaterConfig;
    /**
     * Generate shoreline mask
     */
    static generateShorelineMask(heightMap: HeightMap, width: number, height: number, waterLevel: number, shoreWidth?: number): Uint8Array;
    /**
     * Calculate terrain bounding box
     */
    static calculateBounds(heightMap: HeightMap, width: number, height: number, verticalScale?: number): Box3;
    /**
     * Raycast against terrain heightmap
     */
    static raycastTerrain(origin: Vector3, direction: Vector3, heightMap: HeightMap, width: number, height: number, verticalScale?: number): Vector3 | null;
    /**
     * Generate minimap data from heightmap
     */
    static generateMinimap(heightMap: HeightMap, width: number, height: number, size?: number): Uint8ClampedArray;
    /**
     * Smooth heightmap with gaussian blur
     */
    static smoothHeightmap(heightMap: HeightMap, width: number, height: number, iterations?: number): HeightMap;
}
//# sourceMappingURL=TerrainUtils.d.ts.map