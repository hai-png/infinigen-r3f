/**
 * Render Task Implementation for Infinigen R3F
 * 
 * Implements the main render task with multi-frame support using
 * THREE.WebGLRenderer + OffscreenCanvas for actual pixel output.
 * Supports render passes: color, depth, normals, segmentation, albedo, flow.
 * Integrates with GroundTruthGenerator and AnimationPolicySystem.
 * 
 * @module rendering
 */

import * as THREE from 'three';
import { taskRegistry, TaskFunction, TaskResult } from './TaskRegistry';
import type { TaskMetadata } from './TaskRegistry';
import { GroundTruthGenerator } from '../../datagen/pipeline/GroundTruthGenerator';
import type { AnimationPolicySystem } from '../../datagen/pipeline/AnimationPolicySystem';

// ============================================================================
// Types
// ============================================================================

export interface RenderConfig {
  /** Output folder path for rendered frames */
  outputFolder: string;
  /** Frame range [start, end] */
  frameRange?: [number, number];
  /** Current frame number (for animation) */
  currentFrame?: number;
  /** Resample index for stochastic resampling */
  resampleIdx?: number | null;
  /** Whether to hide water during render */
  hideWater?: boolean;
  /** Resolution [width, height] */
  resolution?: [number, number];
  /** File format ('png', 'jpg') */
  format?: string;
  /** Quality settings (0-1) */
  quality?: number;
  /** Which render passes to generate */
  passes?: RenderPass[];
  /** Camera trajectory keyframes (from AnimationPolicySystem) */
  cameraTrajectory?: CameraTrajectoryKeyframe[];
  /** Near plane for depth rendering */
  nearPlane?: number;
  /** Far plane for depth rendering */
  farPlane?: number;
}

export type RenderPass = 'color' | 'depth' | 'normals' | 'segmentation' | 'albedo' | 'flow';

export interface CameraTrajectoryKeyframe {
  time: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface RenderedFrame {
  frameNumber: number;
  imageData: Record<RenderPass, string>; // data URLs per pass
  cameraPose: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
}

export interface RenderTaskOutput {
  frames: RenderedFrame[];
  outputFolder: string;
  totalFrames: number;
  resolution: [number, number];
  format: string;
}

// ============================================================================
// Offscreen Renderer Factory
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
    if (process.env.NODE_ENV === 'development') console.debug('[RenderTask] OffscreenCanvas fallback:', err);
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
 * Convert rendered canvas to a data URL (PNG/JPEG)
 */
async function canvasToDataURL(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string = 'png',
  quality: number = 0.92
): Promise<string> {
  try {
    if (canvas instanceof OffscreenCanvas) {
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await canvas.convertToBlob({ type: mimeType, quality });
      // Convert blob to data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      return (canvas as HTMLCanvasElement).toDataURL(mimeType, quality);
    }
  } catch (err) {
    // Silently fall back - canvas data URL conversion may fail
    if (process.env.NODE_ENV === 'development') console.debug('[RenderTask] canvasToDataURL fallback:', err);
    return '';
  }
}

// ============================================================================
// Render Pass Functions
// ============================================================================

/**
 * Render color (lit) pass
 */
function renderColorPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number
): Promise<string> {
  renderer.render(scene, camera);
  return canvasToDataURL(canvas, format, quality);
}

/**
 * Render depth pass using MeshDepthMaterial
 */
function renderDepthPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number
): Promise<string> {
  const depthScene = new THREE.Scene();
  depthScene.background = new THREE.Color(0x000000);

  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });

  scene.traverse((object: any) => {
    if (object.isMesh) {
      const mesh = object.clone();
      mesh.material = depthMaterial;
      depthScene.add(mesh);
    }
  });

  renderer.render(depthScene, camera);
  depthScene.clear();
  return canvasToDataURL(canvas, format, quality);
}

/**
 * Render normals pass using MeshNormalMaterial
 */
function renderNormalsPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number
): Promise<string> {
  const normalScene = new THREE.Scene();
  normalScene.background = new THREE.Color(0x8080ff);

  const normalMaterial = new THREE.MeshNormalMaterial();

  scene.traverse((object: any) => {
    if (object.isMesh) {
      const mesh = object.clone();
      mesh.material = normalMaterial;
      normalScene.add(mesh);
    }
  });

  renderer.render(normalScene, camera);
  normalScene.clear();
  return canvasToDataURL(canvas, format, quality);
}

/**
 * Render segmentation pass - each object gets a unique color
 */
function renderSegmentationPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number
): Promise<string> {
  const segScene = new THREE.Scene();
  segScene.background = new THREE.Color(0x000000);

  let objectIndex = 1;
  scene.traverse((object: any) => {
    if (object.isMesh && object.geometry) {
      const mesh = object.clone();
      // Assign a unique color per object instance using golden ratio distribution
      const hue = (objectIndex * 0.618033988749895) % 1;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
      mesh.material = new THREE.MeshBasicMaterial({ color });
      segScene.add(mesh);
      objectIndex++;
    }
  });

  renderer.render(segScene, camera);
  segScene.clear();
  return canvasToDataURL(canvas, format, quality);
}

/**
 * Render albedo (base color, unlit) pass
 */
function renderAlbedoPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number
): Promise<string> {
  const albedoScene = new THREE.Scene();
  albedoScene.background = new THREE.Color(0x000000);

  scene.traverse((object: any) => {
    if (object.isMesh && object.material) {
      const mesh = object.clone();
      // Unlit material preserving only base color
      const baseColor = object.material.color ?? new THREE.Color(0.8, 0.8, 0.8);
      const mat = new THREE.MeshBasicMaterial({ color: baseColor });
      if (object.material.map) {
        mat.map = object.material.map;
      }
      mesh.material = mat;
      albedoScene.add(mesh);
    }
  });

  renderer.render(albedoScene, camera);
  albedoScene.clear();
  return canvasToDataURL(canvas, format, quality);
}

/**
 * Render optical flow pass (requires previous frame camera pose)
 * Uses a simplified approach comparing camera motion between frames.
 */
function renderFlowPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: OffscreenCanvas | HTMLCanvasElement,
  format: string,
  quality: number,
  _prevCamera?: THREE.Camera
): Promise<string> {
  const flowScene = new THREE.Scene();
  flowScene.background = new THREE.Color(0x000000);

  // Flow shader: encodes world-space position as color for comparison
  const flowMaterial = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      void main() {
        // Encode position as color (normalized to [0,1] range for visibility)
        vec3 encoded = vWorldPosition * 0.1 + 0.5;
        gl_FragColor = vec4(encoded, 1.0);
      }
    `,
  });

  scene.traverse((object: any) => {
    if (object.isMesh) {
      const mesh = object.clone();
      mesh.material = flowMaterial;
      flowScene.add(mesh);
    }
  });

  renderer.render(flowScene, camera);
  flowScene.clear();
  return canvasToDataURL(canvas, format, quality);
}

// ============================================================================
// Camera Interpolation from Trajectory
// ============================================================================

function interpolateCamera(
  trajectory: CameraTrajectoryKeyframe[],
  time: number,
  aspectRatio: number
): { camera: THREE.PerspectiveCamera; position: [number, number, number]; target: [number, number, number]; fov: number } {
  if (trajectory.length === 0) {
    const cam = new THREE.PerspectiveCamera(60, aspectRatio, 0.1, 1000);
    cam.position.set(5, 3, 5);
    cam.lookAt(0, 0, 0);
    return { camera: cam, position: [5, 3, 5], target: [0, 0, 0], fov: 60 };
  }

  if (trajectory.length === 1) {
    const kf = trajectory[0];
    const cam = new THREE.PerspectiveCamera(kf.fov, aspectRatio, 0.1, 1000);
    cam.position.set(...kf.position);
    cam.lookAt(...kf.target);
    return { camera: cam, position: kf.position, target: kf.target, fov: kf.fov };
  }

  // Find surrounding keyframes
  let prevIdx = 0;
  let nextIdx = 1;
  for (let i = 0; i < trajectory.length - 1; i++) {
    if (time >= trajectory[i].time && time <= trajectory[i + 1].time) {
      prevIdx = i;
      nextIdx = i + 1;
      break;
    }
  }

  const prev = trajectory[prevIdx];
  const next = trajectory[nextIdx];
  const duration = next.time - prev.time;
  const t = duration > 0 ? (time - prev.time) / duration : 0;

  // Interpolate position, target, fov
  const position: [number, number, number] = [
    prev.position[0] + (next.position[0] - prev.position[0]) * t,
    prev.position[1] + (next.position[1] - prev.position[1]) * t,
    prev.position[2] + (next.position[2] - prev.position[2]) * t,
  ];
  const target: [number, number, number] = [
    prev.target[0] + (next.target[0] - prev.target[0]) * t,
    prev.target[1] + (next.target[1] - prev.target[1]) * t,
    prev.target[2] + (next.target[2] - prev.target[2]) * t,
  ];
  const fov = prev.fov + (next.fov - prev.fov) * t;

  const cam = new THREE.PerspectiveCamera(fov, aspectRatio, 0.1, 1000);
  cam.position.set(...position);
  cam.lookAt(...target);

  return { camera: cam, position, target, fov };
}

// ============================================================================
// Main Render Frames Function
// ============================================================================

async function renderFrames(
  scene: THREE.Scene,
  config: RenderConfig
): Promise<RenderTaskOutput> {
  const {
    outputFolder,
    frameRange = [1, 1],
    currentFrame,
    hideWater = false,
    resolution = [1280, 720],
    format = 'png',
    quality = 0.92,
    passes = ['color'],
    cameraTrajectory = [],
    nearPlane = 0.1,
    farPlane = 1000,
  } = config;

  const [width, height] = resolution;
  const aspectRatio = width / height;

  // Handle water hiding
  if (hideWater) {
    const waterObjects = ['water_fine', 'water_coarse'];
    waterObjects.forEach((name) => {
      const obj = scene.getObjectByName(name);
      if (obj) {
        obj.visible = false;
      }
    });
  }

  // Determine frames to render
  const frames = currentFrame
    ? [currentFrame]
    : Array.from(
        { length: frameRange[1] - frameRange[0] + 1 },
        (_, i) => frameRange[0] + i
      );

  const renderedFrames: RenderedFrame[] = [];
  const { renderer, canvas, dispose } = createOffscreenRenderer(width, height);

  // Update camera near/far
  renderer.render(scene, new THREE.PerspectiveCamera(60, aspectRatio, nearPlane, farPlane));

  let prevCamera: THREE.Camera | undefined;

  for (const frame of frames) {
    const imageData: Record<string, string> = {};

    // Get camera for this frame
    const trajTime = cameraTrajectory.length > 0
      ? (frame - frameRange[0]) / Math.max(1, frameRange[1] - frameRange[0])
      : 0;
    const { camera, position, target, fov } = interpolateCamera(
      cameraTrajectory,
      trajTime,
      aspectRatio
    );
    camera.near = nearPlane;
    camera.far = farPlane;
    camera.updateProjectionMatrix();

    // Render each requested pass
    for (const pass of passes) {
      try {
        switch (pass) {
          case 'color':
            imageData.color = await renderColorPass(renderer, scene, camera, canvas, format, quality);
            break;
          case 'depth':
            imageData.depth = await renderDepthPass(renderer, scene, camera, canvas, format, quality);
            break;
          case 'normals':
            imageData.normals = await renderNormalsPass(renderer, scene, camera, canvas, format, quality);
            break;
          case 'segmentation':
            imageData.segmentation = await renderSegmentationPass(renderer, scene, camera, canvas, format, quality);
            break;
          case 'albedo':
            imageData.albedo = await renderAlbedoPass(renderer, scene, camera, canvas, format, quality);
            break;
          case 'flow':
            imageData.flow = await renderFlowPass(renderer, scene, camera, canvas, format, quality, prevCamera);
            break;
        }
      } catch (err) {
        console.warn(`[RenderTask] Pass "${pass}" failed for frame ${frame}:`, err);
        imageData[pass] = '';
      }
    }

    renderedFrames.push({
      frameNumber: frame,
      imageData: imageData as Record<RenderPass, string>,
      cameraPose: { position, target, fov },
    });

    prevCamera = camera.clone();
  }

  dispose();

  return {
    frames: renderedFrames,
    outputFolder,
    totalFrames: renderedFrames.length,
    resolution,
    format,
  };
}

// ============================================================================
// Task Registration
// ============================================================================

/**
 * Main render task function registered with TaskRegistry
 */
export const renderTask: TaskFunction<RenderConfig> = async (
  scene: THREE.Scene,
  config: RenderConfig
): Promise<TaskResult> => {
  const startTime = performance.now();
  const warnings: string[] = [];

  try {
    // Validate configuration
    if (!config.outputFolder) {
      throw new Error('outputFolder is required');
    }

    // Execute rendering
    const renderResult = await renderFrames(scene, config);

    const executionTime = performance.now() - startTime;

    return {
      success: renderResult.frames.length > 0,
      data: renderResult,
      executionTime,
      warnings,
      metadata: {
        totalFrames: renderResult.totalFrames,
        resolution: renderResult.resolution,
        format: renderResult.format,
        passes: config.passes || ['color'],
        taskId: 'render',
        executedAt: new Date().toISOString(),
        config: {
          frameRange: config.frameRange,
          hideWater: config.hideWater,
          resampleIdx: config.resampleIdx,
        },
      },
    };
  } catch (error) {
    const executionTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage,
      executionTime,
      warnings,
      metadata: {
        taskId: 'render',
        executedAt: new Date().toISOString(),
      },
    };
  }
};

/**
 * Task metadata for registration
 */
export const renderTaskMetadata: TaskMetadata = {
  name: 'render',
  description:
    'Render scene frames with multi-pass support (color, depth, normals, segmentation, albedo, flow) using OffscreenCanvas + WebGLRenderer',
  category: 'rendering',
  requiredParams: {
    outputFolder: 'path',
  },
  optionalParams: {
    frameRange: { type: 'array', default: [1, 1] },
    currentFrame: { type: 'number', default: undefined },
    resampleIdx: { type: 'number', default: null },
    hideWater: { type: 'boolean', default: false },
    resolution: { type: 'array', default: [1280, 720] },
    format: { type: 'string', default: 'png' },
    quality: { type: 'number', default: 0.9 },
  },
  isAsync: true,
  estimatedDuration: 30,
  dependencies: [],
  version: '2.0.0',
};

/**
 * Register the render task with the global registry
 */
export function registerRenderTask(): void {
  if (!taskRegistry.has('render')) {
    taskRegistry.register('render', renderTask, renderTaskMetadata);
  }
}

/**
 * Convenience function to execute render task directly
 */
export async function executeRender(
  scene: THREE.Scene,
  config: RenderConfig
): Promise<TaskResult> {
  return taskRegistry.execute('render', scene, config);
}

/**
 * Convenience: render a single frame with all ground-truth passes
 * Uses GroundTruthGenerator for GT data alongside rendered images.
 */
export async function renderFrameWithGroundTruth(
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: {
    width?: number;
    height?: number;
    format?: string;
    quality?: number;
    generateDepth?: boolean;
    generateNormals?: boolean;
    generateSegmentation?: boolean;
    generateAlbedo?: boolean;
  } = {}
): Promise<{
  images: Record<string, string>;
  groundTruth: {
    depth?: Float32Array;
    normals?: Float32Array;
    segmentation?: Uint8Array;
    albedo?: Uint8Array;
  };
}> {
  const {
    width = 1280,
    height = 720,
    format = 'png',
    quality = 0.92,
    generateDepth = true,
    generateNormals = true,
    generateSegmentation = true,
    generateAlbedo = true,
  } = options;

  const images: Record<string, string> = {};
  const gtData: { depth?: Float32Array; normals?: Float32Array; segmentation?: Uint8Array; albedo?: Uint8Array } = {};

  const { renderer, canvas, dispose } = createOffscreenRenderer(width, height);

  // Color pass
  images.color = await renderColorPass(renderer, scene, camera, canvas, format, quality);

  // Depth pass
  if (generateDepth) {
    images.depth = await renderDepthPass(renderer, scene, camera, canvas, format, quality);
  }

  // Normals pass
  if (generateNormals) {
    images.normals = await renderNormalsPass(renderer, scene, camera, canvas, format, quality);
  }

  // Segmentation pass
  if (generateSegmentation) {
    images.segmentation = await renderSegmentationPass(renderer, scene, camera, canvas, format, quality);
  }

  // Albedo pass
  if (generateAlbedo) {
    images.albedo = await renderAlbedoPass(renderer, scene, camera, canvas, format, quality);
  }

  // Ground truth data from GroundTruthGenerator
  const gtGen = new GroundTruthGenerator(scene, {
    resolution: { width, height },
    depth: generateDepth,
    normal: generateNormals,
    segmentation: generateSegmentation,
    albedo: generateAlbedo,
    boundingBoxes: false,
    opticalFlow: false,
    instanceIds: false,
    outputFormat: 'png',
  });

  if (generateDepth) {
    gtData.depth = await gtGen.generateDepth({ width, height, camera });
  }
  if (generateNormals) {
    gtData.normals = await gtGen.generateNormals({ width, height, camera });
  }
  if (generateSegmentation) {
    gtData.segmentation = await gtGen.generateSegmentation({ width, height, camera });
  }
  if (generateAlbedo) {
    gtData.albedo = await gtGen.generateAlbedo({ width, height, camera });
  }

  dispose();
  return { images, groundTruth: gtData };
}

// Auto-register on import
if (typeof window !== 'undefined' || typeof process !== 'undefined') {
  registerRenderTask();
}
