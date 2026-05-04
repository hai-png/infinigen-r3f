/**
 * DataPipeline - Complete data generation pipeline for ML training
 * 
 * Orchestrates the entire data generation workflow:
 * - Scene generation with procedural assets
 * - Multi-view rendering with OffscreenCanvas + WebGLRenderer
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
import { RLEEncoder, RLESegmentation } from '../segmentation/RLEEncoder';

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
  colorImage?: string; // Blob URL or data URL
  depthImage?: string;
  normalImage?: string;
  segmentationImage?: string;
  flowImage?: string;
  albedoImage?: string;
  
  // Annotations
  bbox3D?: any[];
  bbox2D?: any[];
  masks?: any[];
  
  // RLE-encoded segmentation (populated by encodeSegmentationRLE)
  rleEncoding?: RLESegmentation;
  
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
// Helper: Create an OffscreenCanvas + WebGLRenderer for headless rendering
// ============================================================================

function createOffscreenRenderer(width: number, height: number): {
  renderer: THREE.WebGLRenderer;
  canvas: OffscreenCanvas | HTMLCanvasElement;
  dispose: () => void;
} {
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = new OffscreenCanvas(width, height);
  } catch (err) {
    // Silently fall back - OffscreenCanvas may not be available in all environments
    if (process.env.NODE_ENV === 'development') console.debug('[DataPipeline] OffscreenCanvas fallback:', err);
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas as any,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  return {
    renderer,
    canvas,
    dispose: () => {
      renderer.dispose();
    },
  };
}

/**
 * Convert rendered canvas to an image URL (blob URL or data URL)
 */
async function canvasToImageUrl(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<string> {
  try {
    if (canvas instanceof OffscreenCanvas) {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return URL.createObjectURL(blob);
    } else {
      return (canvas as HTMLCanvasElement).toDataURL('image/png');
    }
  } catch (err) {
    // Silently fall back - canvas image URL conversion may fail
    if (process.env.NODE_ENV === 'development') console.debug('[DataPipeline] canvasToImageUrl fallback:', err);
    return '';
  }
}

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
  private rleEncoder: RLEEncoder;
  private onProgress?: ProgressCallback;

  constructor(scene: THREE.Scene, config: Partial<PipelineConfig> = {}) {
    this.scene = scene;
    this.config = {
      sceneId: `scene_${Date.now()}`,
      seed: 42,
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
    this.rleEncoder = new RLEEncoder();
  }

  setConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  onProgressUpdate(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  async generateDataset(): Promise<GeneratedScene> {
    const startTime = performance.now();
    const reportProgress = (phase: PipelineProgress['phase'], progress: number, message: string) => {
      this.onProgress?.({ phase, progress, message });
    };

    try {
      reportProgress('scene_generation', 0, 'Initializing scene generation...');
      await this.setupScene();
      reportProgress('scene_generation', 100, 'Scene setup complete');

      reportProgress('camera_setup', 0, 'Generating camera poses...');
      const cameras = this.generateCameraPoses();
      reportProgress('camera_setup', 100, `Generated ${cameras.length} camera poses`);

      reportProgress('rendering', 0, 'Starting multi-view rendering...');
      const views = await this.renderAllViews(cameras, (current, total) => {
        reportProgress('rendering', (current / total) * 100, `Rendering view ${current}/${total}`);
      });
      reportProgress('rendering', 100, 'All views rendered');

      reportProgress('ground_truth', 0, 'Extracting ground truth data...');
      const groundTruth = await this.extractGroundTruth();
      reportProgress('ground_truth', 100, 'Ground truth extraction complete');

      reportProgress('annotation', 0, 'Generating annotations...');
      const annotations = await this.generateAnnotations();
      reportProgress('annotation', 100, 'Annotations generated');

      reportProgress('export', 0, 'Exporting scene files...');
      const exports = await this.exportScene();
      reportProgress('export', 100, 'Export complete');

      const totalTime = performance.now() - startTime;

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

  private async setupScene(): Promise<void> {
    this.scene.userData = {
      ...this.scene.userData,
      sceneId: this.config.sceneId,
      seed: this.config.seed,
      generatedAt: new Date().toISOString(),
      generator: 'InfiniGen R3F',
      version: '1.0.0',
    };
  }

  private generateCameraPoses(): CameraPose[] {
    const cameras: CameraPose[] = [];
    const { seed, cameraCount, fovRange, distanceRange, elevationRange, azimuthRange } = this.config;

    let randomState = seed || 12345;
    const random = () => {
      randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
      return randomState / 0x7fffffff;
    };

    for (let i = 0; i < cameraCount!; i++) {
      const azimuth = (azimuthRange![0] + random() * (azimuthRange![1] - azimuthRange![0])) * (Math.PI / 180);
      const elevation = (elevationRange![0] + random() * (elevationRange![1] - elevationRange![0])) * (Math.PI / 180);
      const distance = distanceRange![0] + random() * (distanceRange![1] - distanceRange![0]);
      const fov = fovRange![0] + random() * (fovRange![1] - fovRange![0]);

      const x = distance * Math.cos(elevation) * Math.sin(azimuth);
      const y = distance * Math.sin(elevation);
      const z = distance * Math.cos(elevation) * Math.cos(azimuth);

      cameras.push({
        id: `camera_${i.toString().padStart(3, '0')}`,
        position: [x, y, z],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov,
      });
    }

    return cameras;
  }

  private async renderAllViews(
    cameras: CameraPose[],
    onProgress?: (current: number, total: number) => void
  ): Promise<GeneratedView[]> {
    const views: GeneratedView[] = [];
    const { imageWidth, imageHeight } = this.config;

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      const startTime = performance.now();

      const threeCamera = new THREE.PerspectiveCamera(camera.fov, imageWidth / imageHeight, 0.1, 1000);
      threeCamera.position.set(...camera.position);
      threeCamera.lookAt(...camera.target);

      // Render color image using OffscreenCanvas + WebGLRenderer
      const colorImage = await this.renderColorImage(threeCamera);
      
      // Render ground truth images using OffscreenCanvas + WebGLRenderer
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

      // RLE-encode segmentation mask if enabled
      let rleEncoding: RLESegmentation | undefined;
      if (this.config.generateSegmentation) {
        const segMask = await this.groundTruthGen.generateSegmentation({
          width: imageWidth,
          height: imageHeight,
          camera: threeCamera,
        });
        rleEncoding = this.encodeSegmentationRLE(segMask);
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
        rleEncoding,
        timestamp: new Date().toISOString(),
        renderTime,
      });

      onProgress?.(i + 1, cameras.length);
    }

    return views;
  }

  /**
   * Render color image using OffscreenCanvas + WebGLRenderer
   */
  private async renderColorImage(camera: THREE.Camera): Promise<string> {
    const { imageWidth, imageHeight } = this.config;
    const { renderer, canvas, dispose } = createOffscreenRenderer(imageWidth, imageHeight);

    renderer.render(this.scene, camera);

    const imageUrl = await canvasToImageUrl(canvas);
    dispose();
    return imageUrl;
  }

  /**
   * Render depth image using OffscreenCanvas + WebGLRenderer
   * Uses MeshDepthMaterial override for depth visualization
   */
  private async renderDepthImage(camera: THREE.Camera): Promise<string> {
    const { imageWidth, imageHeight } = this.config;
    const { renderer, canvas, dispose } = createOffscreenRenderer(imageWidth, imageHeight);

    // Create a depth-override scene
    const depthScene = new THREE.Scene();
    depthScene.background = new THREE.Color(0x000000);
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });

    // Clone objects with depth material
    this.scene.traverse((object) => {
      if ((object as any).isMesh) {
        const mesh = object.clone() as any;
        mesh.material = depthMaterial;
        depthScene.add(mesh);
      }
    });

    renderer.render(depthScene, camera);
    depthScene.clear();

    const imageUrl = await canvasToImageUrl(canvas);
    dispose();
    return imageUrl;
  }

  /**
   * Render normal image using OffscreenCanvas + WebGLRenderer
   * Uses MeshNormalMaterial override for normal visualization
   */
  private async renderNormalImage(camera: THREE.Camera): Promise<string> {
    const { imageWidth, imageHeight } = this.config;
    const { renderer, canvas, dispose } = createOffscreenRenderer(imageWidth, imageHeight);

    // Create a normal-override scene
    const normalScene = new THREE.Scene();
    normalScene.background = new THREE.Color(0x8080ff);
    const normalMaterial = new THREE.MeshNormalMaterial();

    this.scene.traverse((object) => {
      if ((object as any).isMesh) {
        const mesh = object.clone() as any;
        mesh.material = normalMaterial;
        normalScene.add(mesh);
      }
    });

    renderer.render(normalScene, camera);
    normalScene.clear();

    const imageUrl = await canvasToImageUrl(canvas);
    dispose();
    return imageUrl;
  }

  /**
   * Render segmentation image using OffscreenCanvas + WebGLRenderer
   * Each object gets a unique color for instance segmentation
   */
  private async renderSegmentationImage(camera: THREE.Camera): Promise<string> {
    const { imageWidth, imageHeight } = this.config;
    const { renderer, canvas, dispose } = createOffscreenRenderer(imageWidth, imageHeight);

    const segScene = new THREE.Scene();
    segScene.background = new THREE.Color(0x000000);

    let objectIndex = 1;
    this.scene.traverse((object: any) => {
      if (object.isMesh && object.geometry) {
        const mesh = object.clone();
        // Assign a unique color per object instance
        const hue = (objectIndex * 0.618033988749895) % 1; // Golden ratio for good distribution
        const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
        mesh.material = new THREE.MeshBasicMaterial({ color });
        segScene.add(mesh);
        objectIndex++;
      }
    });

    renderer.render(segScene, camera);
    segScene.clear();

    const imageUrl = await canvasToImageUrl(canvas);
    dispose();
    return imageUrl;
  }

  /**
   * Render albedo (base color) image using OffscreenCanvas + WebGLRenderer
   * Replaces all materials with unlit versions preserving only base color
   */
  private async renderAlbedoImage(camera: THREE.Camera): Promise<string> {
    const { imageWidth, imageHeight } = this.config;
    const { renderer, canvas, dispose } = createOffscreenRenderer(imageWidth, imageHeight);

    const albedoScene = new THREE.Scene();
    albedoScene.background = new THREE.Color(0x000000);

    this.scene.traverse((object: any) => {
      if (object.isMesh && object.material) {
        const mesh = object.clone();
        // Use unlit material preserving only the base color
        const baseColor = object.material.color ?? new THREE.Color(0.8, 0.8, 0.8);
        mesh.material = new THREE.MeshBasicMaterial({ color: baseColor });
        if (object.material.map) {
          mesh.material.map = object.material.map;
        }
        albedoScene.add(mesh);
      }
    });

    renderer.render(albedoScene, camera);
    albedoScene.clear();

    const imageUrl = await canvasToImageUrl(canvas);
    dispose();
    return imageUrl;
  }

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

  private countVertices(): number {
    let count = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry.attributes.position) {
        count += object.geometry.attributes.position.count;
      }
    });
    return count;
  }

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

  async runBatch(
    jobConfigs: Array<Omit<import('./types').JobConfig, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt' | 'retryCount'>>,
    handler?: (job: any) => Promise<any>,
    options?: { concurrency?: number; perJobTimeout?: number }
  ): Promise<BatchResult> {
    const defaultHandler = async (job: any) => {
      const jobScene = new THREE.Scene();
      const jobSeed = job.sceneConfig?.seed ?? this.config.seed ?? 42;
      const jobConfig = {
        ...this.config,
        sceneId: `scene_${job.id}`,
        seed: jobSeed,
      };
      const pipeline = new DataPipeline(jobScene, jobConfig);
      return await pipeline.generateDataset();
    };
    return await this.batchProcessor.processBatch(jobConfigs, handler ?? defaultHandler, options);
  }

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

  private countObjects(): number {
    let count = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        count++;
      }
    });
    return count;
  }

  dispose(): void {
    this.jobManager.dispose();
    this.batchProcessor.dispose();
  }

  /**
   * Encode a segmentation mask using RLE compression.
   * Integrates RLEEncoder into the data pipeline so that the
   * `rleEncoding` field on GeneratedView is populated.
   *
   * @param segmentationMask - Flat Uint8Array mask where each pixel is an object ID
   * @returns RLESegmentation compressed representation
   */
  encodeSegmentationRLE(segmentationMask: Uint8Array): RLESegmentation {
    return this.rleEncoder.encode(
      segmentationMask,
      this.config.imageWidth,
      this.config.imageHeight
    );
  }

  /**
   * Decode an RLE segmentation back to a pixel mask.
   *
   * @param rle - RLE-compressed segmentation
   * @returns Flat Uint8Array mask in row-major order
   */
  decodeSegmentationRLE(rle: RLESegmentation): Uint8Array {
    return this.rleEncoder.decode(rle);
  }

  /**
   * Convert an RLESegmentation to COCO format for export.
   *
   * @param rle - RLE-compressed segmentation
   * @param segmentId - Optional target segment ID; if omitted, all non-zero pixels are foreground
   * @returns COCO-format RLE object
   */
  segmentationToCOCO(rle: RLESegmentation, segmentId?: number): object {
    return this.rleEncoder.toCOCO(rle, segmentId);
  }
}

export default DataPipeline;
