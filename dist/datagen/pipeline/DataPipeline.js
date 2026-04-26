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
import { SceneExporter } from './SceneExporter';
import { GroundTruthGenerator } from './GroundTruthGenerator';
import { AnnotationGenerator } from './AnnotationGenerator';
import { JobManager } from './JobManager';
import { BatchProcessor } from './BatchProcessor';
// ============================================================================
// Main DataPipeline Class
// ============================================================================
export class DataPipeline {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.config = {
            sceneId: `scene_${Date.now()}`,
            seed: Math.floor(Math.random() * 1000000),
            cameraCount: 10,
            fovRange: [45, 75],
            distanceRange: [2, 10],
            elevationRange: [-30, 60],
            azimuthRange: [0, 360],
            imageWidth: 1920,
            imageHeight: 1080,
            samplesPerPixel: 4,
            exportFormats: ['glb'],
            annotationFormats: ['coco'],
            generateDepth: true,
            generateNormals: true,
            generateSegmentation: true,
            generateFlow: false,
            generateAlbedo: true,
            outputDir: './output',
            organizeByScene: true,
            organizeByCamera: false,
            maxConcurrentJobs: 4,
            enableBatching: true,
            ...config,
        };
        this.exporter = new SceneExporter(scene);
        this.groundTruthGen = new GroundTruthGenerator(scene);
        // Create temporary camera for annotation generator
        const tempCamera = new THREE.PerspectiveCamera(this.config.fovRange[0], this.config.imageWidth / this.config.imageHeight, 0.1, 1000);
        this.annotationGen = new AnnotationGenerator(scene, tempCamera, this.groundTruthGen);
        this.jobManager = new JobManager({
            maxConcurrent: this.config.maxConcurrentJobs,
        });
        this.batchProcessor = new BatchProcessor(this.jobManager);
    }
    /**
     * Configure pipeline
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Set progress callback
     */
    onProgressUpdate(callback) {
        this.onProgress = callback;
    }
    /**
     * Generate complete dataset for a scene
     */
    async generateDataset() {
        const startTime = performance.now();
        const reportProgress = (phase, progress, message) => {
            this.onProgress?.({ phase, progress, message });
        };
        try {
            reportProgress('scene_generation', 0, 'Initializing scene generation...');
            // Step 1: Setup scene with seed
            await this.setupScene();
            reportProgress('scene_generation', 100, 'Scene setup complete');
            // Step 2: Generate camera poses
            reportProgress('camera_setup', 0, 'Generating camera poses...');
            const cameras = this.generateCameraPoses();
            reportProgress('camera_setup', 100, `Generated ${cameras.length} camera poses`);
            // Step 3: Render all views
            reportProgress('rendering', 0, 'Starting multi-view rendering...');
            const views = await this.renderAllViews(cameras, (current, total) => {
                reportProgress('rendering', (current / total) * 100, `Rendering view ${current}/${total}`);
            });
            reportProgress('rendering', 100, 'All views rendered');
            // Step 4: Generate ground truth
            reportProgress('ground_truth', 0, 'Extracting ground truth data...');
            const groundTruth = await this.extractGroundTruth();
            reportProgress('ground_truth', 100, 'Ground truth extraction complete');
            // Step 5: Generate annotations
            reportProgress('annotation', 0, 'Generating annotations...');
            const annotations = await this.generateAnnotations();
            reportProgress('annotation', 100, 'Annotations generated');
            // Step 6: Export scene
            reportProgress('export', 0, 'Exporting scene files...');
            const exports = await this.exportScene();
            reportProgress('export', 100, 'Export complete');
            const totalTime = performance.now() - startTime;
            // Compile results
            const result = {
                sceneId: this.config.sceneId,
                seed: this.config.seed,
                views,
                exports,
                annotations,
                groundTruth,
                statistics: {
                    totalViews: views.length,
                    totalObjects: annotations.statistics.totalObjects,
                    totalVertices: this.countVertices(),
                    totalTriangles: this.countTriangles(),
                    generationTime: totalTime,
                    renderTime: views.reduce((sum, v) => sum + v.renderTime, 0),
                    exportTime: exports.reduce((sum, e) => sum + e.duration, 0),
                },
            };
            reportProgress('complete', 100, `Dataset generation complete in ${totalTime.toFixed(2)}ms`);
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            reportProgress('complete', 0, `Pipeline failed: ${errorMessage}`);
            throw error;
        }
    }
    /**
     * Setup scene with procedural generation
     */
    async setupScene() {
        // Set random seed for reproducibility
        // In a real implementation, this would configure all random generators
        // Add metadata to scene
        this.scene.userData = {
            ...this.scene.userData,
            sceneId: this.config.sceneId,
            seed: this.config.seed,
            generatedAt: new Date().toISOString(),
            generator: 'InfiniGen R3F',
            version: '1.0.0',
        };
    }
    /**
     * Generate random camera poses around the scene
     */
    generateCameraPoses() {
        const cameras = [];
        const { seed, cameraCount, fovRange, distanceRange, elevationRange, azimuthRange } = this.config;
        // Simple pseudo-random number generator based on seed
        let randomState = seed || 12345;
        const random = () => {
            randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
            return randomState / 0x7fffffff;
        };
        for (let i = 0; i < cameraCount; i++) {
            // Random spherical coordinates
            const azimuth = (azimuthRange[0] + random() * (azimuthRange[1] - azimuthRange[0])) * (Math.PI / 180);
            const elevation = (elevationRange[0] + random() * (elevationRange[1] - elevationRange[0])) * (Math.PI / 180);
            const distance = distanceRange[0] + random() * (distanceRange[1] - distanceRange[0]);
            const fov = fovRange[0] + random() * (fovRange[1] - fovRange[0]);
            // Convert to Cartesian coordinates
            const x = distance * Math.cos(elevation) * Math.sin(azimuth);
            const y = distance * Math.sin(elevation);
            const z = distance * Math.cos(elevation) * Math.cos(azimuth);
            cameras.push({
                id: `camera_${i.toString().padStart(3, '0')}`,
                position: [x, y, z],
                target: [0, 0, 0], // Look at origin
                up: [0, 1, 0],
                fov,
            });
        }
        return cameras;
    }
    /**
     * Render all camera views
     */
    async renderAllViews(cameras, onProgress) {
        const views = [];
        const { imageWidth, imageHeight } = this.config;
        for (let i = 0; i < cameras.length; i++) {
            const camera = cameras[i];
            const startTime = performance.now();
            // Update camera
            const threeCamera = new THREE.PerspectiveCamera(camera.fov, imageWidth / imageHeight, 0.1, 1000);
            threeCamera.position.set(...camera.position);
            threeCamera.lookAt(...camera.target);
            // Render color image (placeholder - would use WebGL renderer)
            const colorImage = await this.renderColorImage(threeCamera);
            // Render ground truth images
            let depthImage;
            let normalImage;
            let segmentationImage;
            let albedoImage;
            if (this.config.generateDepth) {
                depthImage = await this.renderDepthImage(threeCamera);
            }
            if (this.config.generateNormals) {
                normalImage = await this.renderNormalImage(threeCamera);
            }
            if (this.config.generateSegmentation) {
                segmentationImage = await this.renderSegmentationImage(threeCamera);
            }
            if (this.config.generateAlbedo) {
                albedoImage = await this.renderAlbedoImage(threeCamera);
            }
            const renderTime = performance.now() - startTime;
            views.push({
                cameraId: camera.id,
                cameraPose: camera,
                colorImage,
                depthImage,
                normalImage,
                segmentationImage,
                albedoImage,
                timestamp: new Date().toISOString(),
                renderTime,
            });
            onProgress?.(i + 1, cameras.length);
        }
        return views;
    }
    /**
     * Render color image (placeholder)
     */
    async renderColorImage(camera) {
        // In production, this would use THREE.WebGLRenderer
        // For now, return placeholder
        return '';
    }
    /**
     * Render depth image
     */
    async renderDepthImage(camera) {
        const depthData = await this.groundTruthGen.generateDepth({
            width: this.config.imageWidth,
            height: this.config.imageHeight,
            camera,
        });
        // Convert to image (placeholder)
        return '';
    }
    /**
     * Render normal image
     */
    async renderNormalImage(camera) {
        const normalData = await this.groundTruthGen.generateNormals({
            width: this.config.imageWidth,
            height: this.config.imageHeight,
            camera,
        });
        // Convert to image (placeholder)
        return '';
    }
    /**
     * Render segmentation image
     */
    async renderSegmentationImage(camera) {
        const segData = await this.groundTruthGen.generateSegmentation({
            width: this.config.imageWidth,
            height: this.config.imageHeight,
            camera,
        });
        // Convert to image (placeholder)
        return '';
    }
    /**
     * Render albedo image
     */
    async renderAlbedoImage(camera) {
        const albedoData = await this.groundTruthGen.generateAlbedo({
            width: this.config.imageWidth,
            height: this.config.imageHeight,
            camera,
        });
        // Convert to image (placeholder)
        return '';
    }
    /**
     * Extract ground truth data
     */
    async extractGroundTruth() {
        const camera = new THREE.PerspectiveCamera(this.config.fovRange[0], this.config.imageWidth / this.config.imageHeight, 0.1, 1000);
        const gtData = {};
        if (this.config.generateDepth) {
            gtData.depth = await this.groundTruthGen.generateDepth({
                width: this.config.imageWidth,
                height: this.config.imageHeight,
                camera,
            });
        }
        if (this.config.generateNormals) {
            gtData.normals = await this.groundTruthGen.generateNormals({
                width: this.config.imageWidth,
                height: this.config.imageHeight,
                camera,
            });
        }
        if (this.config.generateSegmentation) {
            gtData.segmentation = await this.groundTruthGen.generateSegmentation({
                width: this.config.imageWidth,
                height: this.config.imageHeight,
                camera,
            });
        }
        if (this.config.generateAlbedo) {
            gtData.albedo = await this.groundTruthGen.generateAlbedo({
                width: this.config.imageWidth,
                height: this.config.imageHeight,
                camera,
            });
        }
        return gtData;
    }
    /**
     * Generate annotations
     */
    async generateAnnotations() {
        const camera = new THREE.PerspectiveCamera(this.config.fovRange[0], this.config.imageWidth / this.config.imageHeight, 0.1, 1000);
        this.annotationGen.setOptions({
            formats: this.config.annotationFormats,
            include3DBBoxes: true,
            include2DBBoxes: true,
            includeSegmentation: true,
            imageWidth: this.config.imageWidth,
            imageHeight: this.config.imageHeight,
        });
        return await this.annotationGen.generate();
    }
    /**
     * Export scene to configured formats
     */
    async exportScene() {
        const exports = [];
        for (const format of this.config.exportFormats) {
            this.exporter.setOptions({
                format,
                filename: `${this.config.sceneId}_${format}`,
                includeMetadata: true,
            });
            const result = await this.exporter.export();
            if (result.success) {
                exports.push(result);
            }
        }
        return exports;
    }
    /**
     * Count vertices in scene
     */
    countVertices() {
        let count = 0;
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh && object.geometry.attributes.position) {
                count += object.geometry.attributes.position.count;
            }
        });
        return count;
    }
    /**
     * Count triangles in scene
     */
    countTriangles() {
        let count = 0;
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                const geometry = object.geometry;
                if (geometry.index) {
                    count += geometry.index.count / 3;
                }
                else if (geometry.attributes.position) {
                    count += geometry.attributes.position.count / 3;
                }
            }
        });
        return count;
    }
    /**
     * Run batch processing for multiple scenes
     */
    async runBatch(config) {
        return await this.batchProcessor.processBatch(config, async (job) => {
            // Create new scene for each job
            const jobScene = new THREE.Scene();
            // Copy configuration with job-specific seed
            const jobConfig = {
                ...this.config,
                sceneId: `scene_${job.id}`,
                seed: job.seed,
            };
            const pipeline = new DataPipeline(jobScene, jobConfig);
            return await pipeline.generateDataset();
        });
    }
    /**
     * Get pipeline statistics
     */
    getStatistics() {
        return {
            config: this.config,
            sceneStats: {
                vertexCount: this.countVertices(),
                triangleCount: this.countTriangles(),
                objectCount: this.countObjects(),
            },
        };
    }
    /**
     * Count objects in scene
     */
    countObjects() {
        let count = 0;
        this.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                count++;
            }
        });
        return count;
    }
    /**
     * Cleanup resources
     */
    dispose() {
        this.jobManager.dispose();
        this.batchProcessor.dispose();
    }
}
export default DataPipeline;
//# sourceMappingURL=DataPipeline.js.map