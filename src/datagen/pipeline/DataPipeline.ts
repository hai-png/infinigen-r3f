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
import { SceneExporter, ExportFormat, ExportResult } from './SceneExporter';
import { GroundTruthGenerator, GroundTruthMetadata } from './GroundTruthGenerator';
import { AnnotationGenerator, AnnotationResult } from './AnnotationGenerator';
import { JobManager, JobStatus, GenerationJob } from './JobManager';
import { BatchProcessor, BatchConfig, BatchResult } from './BatchProcessor';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PipelineConfig {
  // Scene settings
  sceneId?: string;
  seed?: number;
  
  // Camera settings
  cameraCount?: number;
  fovRange?: [number, number];
  distanceRange?: [number, number];
  elevationRange?: [number, number];
  azimuthRange?: [number, number];
  
  // Rendering settings
  imageWidth: number;
  imageHeight: number;
  samplesPerPixel?: number;
  
  // Output formats
  exportFormats: ExportFormat[];
  annotationFormats: ('coco' | 'yolo' | 'pascal_voc')[];
  
  // Ground truth
  generateDepth: boolean;
  generateNormals: boolean;
  generateSegmentation: boolean;
  generateFlow: boolean;
  generateAlbedo: boolean;
  
  // Output organization
  outputDir: string;
  organizeByScene: boolean;
  organizeByCamera: boolean;
  
  // Processing
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
  
  // Rendered images
  colorImage?: string; // Blob URL or path
  depthImage?: string;
  normalImage?: string;
  segmentationImage?: string;
  flowImage?: string;
  albedoImage?: string;
  
  // Annotations
  bbox3D?: any[];
  bbox2D?: any[];
  masks?: any[];
  
  // Metadata
  timestamp: string;
  renderTime: number;
}

export interface GeneratedScene {
  sceneId: string;
  seed: number;
  
  // Generated views
  views: GeneratedView[];
  
  // Exports
  exports: ExportResult[];
  
  // Annotations
  annotations?: AnnotationResult;
  
  // Ground truth
  groundTruth?: GroundTruthMetadata;
  
  // Statistics
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
  progress: number; // 0-100
  message: string;
  currentView?: number;
  totalViews?: number;
  errors?: string[];
}

export type ProgressCallback = (progress: PipelineProgress) => void;

// ============================================================================
// Main DataPipeline Class
// ============================================================================

export class DataPipeline {
  private scene: THREE.Scene;
  private config: PipelineConfig;
  private exporter: SceneExporter;
  private groundTruthGen: GroundTruthGenerator;
  private annotationGen: AnnotationGenerator;
  private jobManager: JobManager;
  private batchProcessor: BatchProcessor;
  private onProgress?: ProgressCallback;

  constructor(scene: THREE.Scene, config: Partial<PipelineConfig> = {}) {
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
    const tempCamera = new THREE.PerspectiveCamera(
      this.config.fovRange[0],
      this.config.imageWidth / this.config.imageHeight,
      0.1,
      1000
    );
    this.annotationGen = new AnnotationGenerator(scene, tempCamera, this.groundTruthGen);
    
    this.jobManager = new JobManager({
      maxConcurrentJobs: this.config.maxConcurrentJobs,
    });
    
    this.batchProcessor = new BatchProcessor(this.jobManager);
  }

  /**
   * Configure pipeline
   */
  setConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set progress callback
   */
  onProgressUpdate(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Generate complete dataset for a scene
   */
  async generateDataset(): Promise<GeneratedScene> {
    const startTime = performance.now();
    const reportProgress = (phase: PipelineProgress['phase'], progress: number, message: string) => {
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
      const result: GeneratedScene = {
        sceneId: this.config.sceneId!,
        seed: this.config.seed!,
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      reportProgress('complete', 0, `Pipeline failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Setup scene with procedural generation
   */
  private async setupScene(): Promise<void> {
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
  private generateCameraPoses(): CameraPose[] {
    const cameras: CameraPose[] = [];
    const { seed, cameraCount, fovRange, distanceRange, elevationRange, azimuthRange } = this.config;

    // Simple pseudo-random number generator based on seed
    let randomState = seed || 12345;
    const random = () => {
      randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
      return randomState / 0x7fffffff;
    };

    for (let i = 0; i < cameraCount!; i++) {
      // Random spherical coordinates
      const azimuth = (azimuthRange![0] + random() * (azimuthRange![1] - azimuthRange![0])) * (Math.PI / 180);
      const elevation = (elevationRange![0] + random() * (elevationRange![1] - elevationRange![0])) * (Math.PI / 180);
      const distance = distanceRange![0] + random() * (distanceRange![1] - distanceRange![0]);
      const fov = fovRange![0] + random() * (fovRange![1] - fovRange![0]);

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
  private async renderAllViews(
    cameras: CameraPose[],
    onProgress?: (current: number, total: number) => void
  ): Promise<GeneratedView[]> {
    const views: GeneratedView[] = [];
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
      let depthImage: string | undefined;
      let normalImage: string | undefined;
      let segmentationImage: string | undefined;
      let albedoImage: string | undefined;

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
  private async renderColorImage(camera: THREE.Camera): Promise<string> {
    // In production, this would use THREE.WebGLRenderer
    // For now, return placeholder
    return '';
  }

  /**
   * Render depth image
   */
  private async renderDepthImage(camera: THREE.Camera): Promise<string> {
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
  private async renderNormalImage(camera: THREE.Camera): Promise<string> {
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
  private async renderSegmentationImage(camera: THREE.Camera): Promise<string> {
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
  private async renderAlbedoImage(camera: THREE.Camera): Promise<string> {
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
  private async extractGroundTruth(): Promise<GroundTruthMetadata> {
    const camera = new THREE.PerspectiveCamera(
      this.config.fovRange![0],
      this.config.imageWidth / this.config.imageHeight,
      0.1,
      1000
    );

    const gtData: GroundTruthMetadata = {
      jobId: `job_${Date.now()}`,
      cameraId: 'default',
      timestamp: new Date(),
      resolution: { width: this.config.imageWidth, height: this.config.imageHeight },
      nearPlane: 0.1,
      farPlane: 1000,
      fov: this.config.fovRange![0],
      objectCount: 0,
    };

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
  private async generateAnnotations(): Promise<AnnotationResult> {
    const camera = new THREE.PerspectiveCamera(
      this.config.fovRange![0],
      this.config.imageWidth / this.config.imageHeight,
      0.1,
      1000
    );

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
  private async exportScene(): Promise<ExportResult[]> {
    const exports: ExportResult[] = [];

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
  private countVertices(): number {
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
  private countTriangles(): number {
    let count = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const geometry = object.geometry;
        if (geometry.index) {
          count += geometry.index.count / 3;
        } else if (geometry.attributes.position) {
          count += geometry.attributes.position.count / 3;
        }
      }
    });
    return count;
  }

  /**
   * Run batch processing for multiple scenes
   */
  async runBatch(config: BatchConfig): Promise<BatchResult> {
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
  getStatistics(): {
    config: PipelineConfig;
    sceneStats: {
      vertexCount: number;
      triangleCount: number;
      objectCount: number;
    };
  } {
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
  private countObjects(): number {
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
  dispose(): void {
    this.jobManager.dispose();
    this.batchProcessor.dispose();
  }
}

export default DataPipeline;
