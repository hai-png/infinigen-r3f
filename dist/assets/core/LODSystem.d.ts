/**
 * LODSystem.ts
 *
 * Level-of-Detail management system for efficient rendering of assets at various distances.
 * Implements automatic LOD switching, HLOD (Hierarchical LOD), and memory-efficient streaming.
 */
import * as THREE from 'three';
import { LODConfig } from './AssetTypes';
/**
 * LOD System for managing detail levels based on camera distance
 */
export declare class LODSystem {
    private static instance;
    private lodGroups;
    private configs;
    private camera;
    private updateInterval;
    private lastUpdate;
    private autoUpdate;
    private fadeTransition;
    private screenSpaceThreshold;
    private stats;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): LODSystem;
    /**
     * Set the camera for distance calculations
     */
    setCamera(camera: THREE.Camera): void;
    /**
     * Create a new LOD group for an asset
     */
    createLODGroup(assetId: string, geometries: THREE.Object3D[], distances: number[]): THREE.LOD;
    /**
     * Create LOD group with automatic geometry simplification
     */
    createAutoLODGroup(assetId: string, baseMesh: THREE.Mesh, config: LODConfig[]): THREE.LOD;
    /**
     * Get an existing LOD group
     */
    getLODGroup(assetId: string): THREE.LOD | null;
    /**
     * Remove and dispose a LOD group
     */
    removeLODGroup(assetId: string): boolean;
    /**
     * Simplify geometry to target face count
     */
    simplifyGeometry(geometry: THREE.BufferGeometry, targetFaceCount: number): THREE.BufferGeometry;
    /**
     * Basic buffer geometry simplification (vertex clustering approach)
     */
    private simplifyBufferGeometry;
    /**
     * Update all LOD groups based on camera position
     */
    update(deltaTime: number): void;
    /**
     * Handle LOD switch events
     */
    private onLODSwitch;
    /**
     * Force update of specific LOD group
     */
    forceUpdate(assetId: string): void;
    /**
     * Create HLOD for grouping multiple distant objects
     */
    createHLOD(hlodId: string, objects: THREE.Object3D[], distance: number): THREE.LOD;
    /**
     * Combine multiple geometries into one
     */
    private combineGeometries;
    /**
     * Get average material from objects
     */
    private getAverageMaterial;
    /**
     * Set LOD configuration for asset type
     */
    setConfig(assetType: string, config: LODConfig[]): void;
    /**
     * Get LOD configuration for asset type
     */
    getConfig(assetType: string): LODConfig[] | undefined;
    /**
     * Set default LOD configuration
     */
    setDefaultConfig(): void;
    /**
     * Enable or disable automatic updates
     */
    setAutoUpdate(enabled: boolean): void;
    /**
     * Set update interval in milliseconds
     */
    setUpdateInterval(interval: number): void;
    /**
     * Enable or disable fade transitions
     */
    setFadeTransition(enabled: boolean): void;
    /**
     * Get LOD system statistics
     */
    getStats(): LODStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    /**
     * Print statistics to console
     */
    printStats(): void;
    /**
     * Clean up and dispose resources
     */
    dispose(): void;
}
/**
 * LOD statistics interface
 */
export interface LODStats {
    totalLODGroups: number;
    activeSwitches: number;
    culledObjects: number;
    memorySaved: number;
}
export declare const lodSystem: LODSystem;
//# sourceMappingURL=LODSystem.d.ts.map