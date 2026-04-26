/**
 * DataPipeline - Complete data generation pipeline for ML training
 *
 * Orchestrates the entire data generation workflow:
 * - Scene generation with procedural assets
 * - Multi-view rendering
 * - Ground truth extraction
 * - Annotation generation
 * - Format conversion and export
 * - Dataset organization
 *
 * @see https://github.com/princeton-vl/infinigen/blob/main/infinigen/core/generate.py
 */
import * as THREE from 'three';
import { ExportFormat, ExportResult } from './SceneExporter';
import { GroundTruthData } from './GroundTruthGenerator';
import { AnnotationResult } from './AnnotationGenerator';
import { BatchConfig, BatchResult } from './BatchProcessor';
export interface PipelineConfig {
    sceneId?: string;
    seed?: number;
    cameraCount?: number;
    fovRange?: [number, number];
    distanceRange?: [number, number];
    elevationRange?: [number, number];
    azimuthRange?: [number, number];
    imageWidth: number;
    imageHeight: number;
    samplesPerPixel?: number;
    exportFormats: ExportFormat[];
    annotationFormats: ('coco' | 'yolo' | 'pascal_voc')[];
    generateDepth: boolean;
    generateNormals: boolean;
    generateSegmentation: boolean;
    generateFlow: boolean;
    generateAlbedo: boolean;
    outputDir: string;
    organizeByScene: boolean;
    organizeByCamera: boolean;
    maxConcurrentJobs: number;
    enableBatching: boolean;
}
export interface CameraPose {
    id: string;
    position: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fov: number;
}
export interface GeneratedView {
    cameraId: string;
    cameraPose: CameraPose;
    colorImage?: string;
    depthImage?: string;
    normalImage?: string;
    segmentationImage?: string;
    flowImage?: string;
    albedoImage?: string;
    bbox3D?: any[];
    bbox2D?: any[];
    masks?: any[];
    timestamp: string;
    renderTime: number;
}
export interface GeneratedScene {
    sceneId: string;
    seed: number;
    views: GeneratedView[];
    exports: ExportResult[];
    annotations?: AnnotationResult;
    groundTruth?: GroundTruthData;
    statistics: {
        totalViews: number;
        totalObjects: number;
        totalVertices: number;
        totalTriangles: number;
        generationTime: number;
        renderTime: number;
        exportTime: number;
    };
}
export interface PipelineProgress {
    phase: 'scene_generation' | 'camera_setup' | 'rendering' | 'ground_truth' | 'annotation' | 'export' | 'complete';
    progress: number;
    message: string;
    currentView?: number;
    totalViews?: number;
    errors?: string[];
}
export type ProgressCallback = (progress: PipelineProgress) => void;
export declare class DataPipeline {
    private scene;
    private config;
    private exporter;
    private groundTruthGen;
    private annotationGen;
    private jobManager;
    private batchProcessor;
    private onProgress?;
    constructor(scene: THREE.Scene, config?: Partial<PipelineConfig>);
    /**
     * Configure pipeline
     */
    setConfig(config: Partial<PipelineConfig>): void;
    /**
     * Set progress callback
     */
    onProgressUpdate(callback: ProgressCallback): void;
    /**
     * Generate complete dataset for a scene
     */
    generateDataset(): Promise<GeneratedScene>;
    /**
     * Setup scene with procedural generation
     */
    private setupScene;
    /**
     * Generate random camera poses around the scene
     */
    private generateCameraPoses;
    /**
     * Render all camera views
     */
    private renderAllViews;
    /**
     * Render color image (placeholder)
     */
    private renderColorImage;
    /**
     * Render depth image
     */
    private renderDepthImage;
    /**
     * Render normal image
     */
    private renderNormalImage;
    /**
     * Render segmentation image
     */
    private renderSegmentationImage;
    /**
     * Render albedo image
     */
    private renderAlbedoImage;
    /**
     * Extract ground truth data
     */
    private extractGroundTruth;
    /**
     * Generate annotations
     */
    private generateAnnotations;
    /**
     * Export scene to configured formats
     */
    private exportScene;
    /**
     * Count vertices in scene
     */
    private countVertices;
    /**
     * Count triangles in scene
     */
    private countTriangles;
    /**
     * Run batch processing for multiple scenes
     */
    runBatch(config: BatchConfig): Promise<BatchResult>;
    /**
     * Get pipeline statistics
     */
    getStatistics(): {
        config: PipelineConfig;
        sceneStats: {
            vertexCount: number;
            triangleCount: number;
            objectCount: number;
        };
    };
    /**
     * Count objects in scene
     */
    private countObjects;
    /**
     * Cleanup resources
     */
    dispose(): void;
}
export default DataPipeline;
//# sourceMappingURL=DataPipeline.d.ts.map