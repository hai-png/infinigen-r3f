/**
 * Water Body System
 *
 * Manages lakes, rivers, oceans with realistic shorelines,
 * wave simulation, and fluid dynamics integration.
 *
 * @module WaterBody
 */
import * as THREE from 'three';
import { FluidDynamics } from './FluidDynamics';
export interface WaterBodyParams {
    baseLevel: number;
    surfaceSize: THREE.Vector2;
    resolution: number;
    waveHeight: number;
    waveSpeed: number;
    waveFrequency: number;
    foamIntensity: number;
    transparency: number;
    colorDeep: THREE.Color;
    colorShallow: THREE.Color;
    enableFluidDynamics: boolean;
}
export interface ShorelinePoint {
    position: THREE.Vector3;
    normal: THREE.Vector3;
    wetness: number;
}
export declare class WaterBody {
    private mesh;
    private geometry;
    private material;
    private params;
    private noise;
    private time;
    private fluidDynamics;
    private shorelinePoints;
    constructor(params?: Partial<WaterBodyParams>);
    /**
     * Create WebGL shader material for realistic water rendering
     */
    private createWaterShader;
    /**
     * Update water simulation
     */
    update(deltaTime: number): void;
    /**
     * Generate shoreline points where water meets terrain
     */
    generateShoreline(terrainGeometry: THREE.Geometry | THREE.BufferGeometry): ShorelinePoint[];
    /**
     * Create Three.js mesh for water body
     */
    createMesh(): THREE.Mesh;
    /**
     * Get fluid dynamics instance
     */
    getFluidDynamics(): FluidDynamics | null;
    /**
     * Set wave parameters dynamically
     */
    setWaveParams(height: number, speed: number, frequency: number): void;
    /**
     * Get shoreline points
     */
    getShorelinePoints(): ShorelinePoint[];
}
export default WaterBody;
//# sourceMappingURL=WaterBody.d.ts.map