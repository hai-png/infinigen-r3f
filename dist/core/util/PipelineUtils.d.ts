/**
 * PipelineUtils.ts
 *
 * Scene organization, pipeline management, and export utilities.
 * Ported from Infinigen's organization.py, pipeline.py, paths.py, and exporting.py.
 */
import * as THREE from 'three';
export interface SceneHierarchy {
    name: string;
    children: SceneHierarchy[];
    metadata: Record<string, any>;
}
/**
 * Organizes scene objects into a hierarchical structure based on semantic tags.
 */
export declare function organizeSceneByTags(scene: THREE.Scene): SceneHierarchy;
/**
 * Creates a named layer system for scene objects.
 */
export declare class SceneLayerManager {
    private layers;
    private objectToLayers;
    /**
     * Adds an object to a layer.
     */
    addToLayer(object: THREE.Object3D, layerName: string): void;
    /**
     * Removes an object from a layer.
     */
    removeFromLayer(object: THREE.Object3D, layerName: string): void;
    /**
     * Gets all objects in a layer.
     */
    getLayer(layerName: string): THREE.Object3D[];
    /**
     * Gets all layers an object belongs to.
     */
    getObjectLayers(object: THREE.Object3D): string[];
    /**
     * Shows/hides a layer.
     */
    setLayerVisibility(layerName: string, visible: boolean): void;
    /**
     * Clears all layers.
     */
    clear(): void;
}
export type PipelineStage = 'setup' | 'generation' | 'placement' | 'physics' | 'rendering' | 'export';
export interface PipelineStageConfig {
    name: PipelineStage;
    enabled: boolean;
    parameters: Record<string, any>;
}
export interface PipelineConfig {
    seed: number;
    stages: PipelineStageConfig[];
    outputFormat: 'gltf' | 'usdz' | 'obj' | 'fbx';
    quality: 'low' | 'medium' | 'high';
}
/**
 * Manages the scene generation pipeline.
 */
export declare class ScenePipeline {
    private config;
    private rng;
    private currentStage;
    private stageProgress;
    constructor(config?: Partial<PipelineConfig>);
    private getDefaultStages;
    /**
     * Executes the pipeline.
     */
    execute(scene: THREE.Scene): Promise<void>;
    private executeStage;
    private setupStage;
    private generationStage;
    private placementStage;
    private physicsStage;
    private renderingStage;
    private exportStage;
    /**
     * Gets progress for a stage (0-100).
     */
    getStageProgress(stage: PipelineStage): number;
    /**
     * Gets overall pipeline progress (0-100).
     */
    getOverallProgress(): number;
    /**
     * Gets the current stage being executed.
     */
    getCurrentStage(): PipelineStage | null;
}
/**
 * Generates a unique path name for scene objects.
 */
export declare function generateUniquePath(baseName: string, existing: Set<string>): string;
/**
 * Joins path segments with proper separators.
 */
export declare function joinPath(...segments: string[]): string;
/**
 * Extracts the directory portion of a path.
 */
export declare function getDirectory(path: string): string;
/**
 * Extracts the filename portion of a path.
 */
export declare function getFilename(path: string): string;
/**
 * Gets the file extension.
 */
export declare function getExtension(path: string): string;
/**
 * Changes the file extension.
 */
export declare function changeExtension(path: string, newExt: string): string;
/**
 * Exports a Three.js scene to GLTF format (as JSON structure).
 * Note: Actual binary export would require gltf-pipeline or similar.
 */
export declare function exportSceneToGLTF(scene: THREE.Scene, name?: string): Promise<{
    json: any;
    buffers: ArrayBuffer[];
}>;
/**
 * Exports a scene to OBJ format.
 */
export declare function exportSceneToOBJ(scene: THREE.Scene): Promise<string>;
/**
 * Batch exports multiple scenes.
 */
export declare function batchExportScenes(scenes: {
    name: string;
    scene: THREE.Scene;
}[], format?: 'gltf' | 'obj'): Promise<Map<string, Blob>>;
/**
 * Compresses a GLTF file using Draco compression.
 * Note: Requires draco_encoder in production.
 */
export declare function compressGLTF(gltfData: any): Promise<any>;
export interface IMUData {
    accelerometer: [number, number, number];
    gyroscope: [number, number, number];
    magnetometer: [number, number, number];
    timestamp: number;
}
/**
 * Simulates IMU sensor data for a moving object.
 */
export declare class IMUSimulator {
    private gravity;
    private noiseStdDev;
    private rng;
    constructor(seed?: number);
    /**
     * Generates simulated IMU readings for a given pose and velocity.
     */
    simulate(position: THREE.Vector3, velocity: THREE.Vector3, acceleration: THREE.Vector3, orientation: THREE.Quaternion, angularVelocity: THREE.Vector3): IMUData;
    /**
     * Sets the noise level for sensor simulation.
     */
    setNoiseLevel(stdDev: number): void;
}
//# sourceMappingURL=PipelineUtils.d.ts.map