/**
 * PipelineUtils.ts
 * 
 * Scene organization, pipeline management, and export utilities.
 * Ported from Infinigen's organization.py, pipeline.py, paths.py, and exporting.py.
 */

import * as THREE from 'three';
import { SeededRandom } from './MathUtils';

// ============================================================================
// Scene Organization
// ============================================================================

export interface SceneHierarchy {
  name: string;
  children: SceneHierarchy[];
  metadata: Record<string, any>;
}

/**
 * Organizes scene objects into a hierarchical structure based on semantic tags.
 */
export function organizeSceneByTags(scene: THREE.Scene): SceneHierarchy {
  const root: SceneHierarchy = {
    name: 'root',
    children: [],
    metadata: {}
  };

  // Group objects by their primary tag
  const groups: Map<string, THREE.Object3D[]> = new Map();

  scene.traverse((obj) => {
    if (obj.userData?.tags) {
      const tags = obj.userData.tags as string[];
      const primaryTag = tags[0] || 'untagged';
      
      if (!groups.has(primaryTag)) {
        groups.set(primaryTag, []);
      }
      groups.get(primaryTag)!.push(obj);
    } else if (obj.type === 'Mesh' && obj !== scene) {
      // Untagged meshes go to 'geometry' group
      if (!groups.has('geometry')) {
        groups.set('geometry', []);
      }
      groups.get('geometry')!.push(obj);
    }
  });

  // Create hierarchy nodes
  for (const [tagName, objects] of groups.entries()) {
    const node: SceneHierarchy = {
      name: tagName,
      children: objects.map(obj => ({
        name: obj.name || obj.uuid,
        children: [],
        metadata: {
          uuid: obj.uuid,
          type: obj.type,
          position: obj.position.toArray(),
          rotation: obj.rotation.toArray(),
          scale: obj.scale.toArray()
        }
      })),
      metadata: {
        count: objects.length,
        boundingBox: computeGroupBoundingBox(objects)
      }
    };
    root.children.push(node);
  }

  return root;
}

function computeGroupBoundingBox(objects: THREE.Object3D[]): { min: number[]; max: number[] } {
  const bbox = new THREE.Box3();
  for (const obj of objects) {
    if (obj instanceof THREE.Mesh) {
      bbox.expandByObject(obj);
    }
  }
  return {
    min: bbox.min.toArray(),
    max: bbox.max.toArray()
  };
}

/**
 * Creates a named layer system for scene objects.
 */
export class SceneLayerManager {
  private layers: Map<string, Set<THREE.Object3D>> = new Map();
  private objectToLayers: Map<THREE.Object3D, Set<string>> = new Map();

  /**
   * Adds an object to a layer.
   */
  addToLayer(object: THREE.Object3D, layerName: string): void {
    if (!this.layers.has(layerName)) {
      this.layers.set(layerName, new Set());
    }
    this.layers.get(layerName)!.add(object);

    if (!this.objectToLayers.has(object)) {
      this.objectToLayers.set(object, new Set());
    }
    this.objectToLayers.get(object)!.add(layerName);
  }

  /**
   * Removes an object from a layer.
   */
  removeFromLayer(object: THREE.Object3D, layerName: string): void {
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.delete(object);
    }

    const objLayers = this.objectToLayers.get(object);
    if (objLayers) {
      objLayers.delete(layerName);
      if (objLayers.size === 0) {
        this.objectToLayers.delete(object);
      }
    }
  }

  /**
   * Gets all objects in a layer.
   */
  getLayer(layerName: string): THREE.Object3D[] {
    const layer = this.layers.get(layerName);
    return layer ? Array.from(layer) : [];
  }

  /**
   * Gets all layers an object belongs to.
   */
  getObjectLayers(object: THREE.Object3D): string[] {
    const layers = this.objectToLayers.get(object);
    return layers ? Array.from(layers) : [];
  }

  /**
   * Shows/hides a layer.
   */
  setLayerVisibility(layerName: string, visible: boolean): void {
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.forEach(obj => {
        obj.visible = visible;
      });
    }
  }

  /**
   * Clears all layers.
   */
  clear(): void {
    this.layers.clear();
    this.objectToLayers.clear();
  }
}

// ============================================================================
// Pipeline Management
// ============================================================================

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
export class ScenePipeline {
  private config: PipelineConfig;
  private rng: SeededRandom;
  private currentStage: PipelineStage | null = null;
  private stageProgress: Map<PipelineStage, number> = new Map();

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      seed: config.seed ?? Date.now(),
      stages: config.stages ?? this.getDefaultStages(),
      outputFormat: config.outputFormat ?? 'gltf',
      quality: config.quality ?? 'medium'
    };

    this.rng = new SeededRandom(this.config.seed);
    
    // Initialize progress
    this.config.stages.forEach(stage => {
      this.stageProgress.set(stage.name, 0);
    });
  }

  private getDefaultStages(): PipelineStageConfig[] {
    return [
      { name: 'setup', enabled: true, parameters: {} },
      { name: 'generation', enabled: true, parameters: {} },
      { name: 'placement', enabled: true, parameters: {} },
      { name: 'physics', enabled: true, parameters: {} },
      { name: 'rendering', enabled: false, parameters: {} },
      { name: 'export', enabled: true, parameters: {} }
    ];
  }

  /**
   * Executes the pipeline.
   */
  async execute(scene: THREE.Scene): Promise<void> {
    console.log(`Starting pipeline with seed ${this.config.seed}`);

    for (const stageConfig of this.config.stages) {
      if (!stageConfig.enabled) {
        console.log(`Skipping stage: ${stageConfig.name}`);
        continue;
      }

      this.currentStage = stageConfig.name;
      console.log(`Executing stage: ${stageConfig.name}`);

      try {
        await this.executeStage(stageConfig.name, scene, stageConfig.parameters);
        this.stageProgress.set(stageConfig.name, 100);
      } catch (error) {
        console.error(`Stage ${stageConfig.name} failed:`, error);
        throw error;
      }
    }

    this.currentStage = null;
    console.log('Pipeline completed successfully');
  }

  private async executeStage(
    stage: PipelineStage,
    scene: THREE.Scene,
    params: Record<string, any>
  ): Promise<void> {
    // Placeholder - actual implementation would call specific stage functions
    switch (stage) {
      case 'setup':
        await this.setupStage(scene, params);
        break;
      case 'generation':
        await this.generationStage(scene, params);
        break;
      case 'placement':
        await this.placementStage(scene, params);
        break;
      case 'physics':
        await this.physicsStage(scene, params);
        break;
      case 'rendering':
        await this.renderingStage(scene, params);
        break;
      case 'export':
        await this.exportStage(scene, params);
        break;
    }
  }

  private async setupStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Setup environment, lighting, camera
    console.log('Setup stage complete');
  }

  private async generationStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Generate assets, terrain, structures
    console.log('Generation stage complete');
  }

  private async placementStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Place objects according to constraints
    console.log('Placement stage complete');
  }

  private async physicsStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Setup physics simulation
    console.log('Physics stage complete');
  }

  private async renderingStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Configure rendering settings
    console.log('Rendering stage complete');
  }

  private async exportStage(scene: THREE.Scene, params: Record<string, any>): Promise<void> {
    // Export scene to file
    console.log('Export stage complete');
  }

  /**
   * Gets progress for a stage (0-100).
   */
  getStageProgress(stage: PipelineStage): number {
    return this.stageProgress.get(stage) ?? 0;
  }

  /**
   * Gets overall pipeline progress (0-100).
   */
  getOverallProgress(): number {
    const total = this.config.stages.filter(s => s.enabled).length;
    if (total === 0) return 100;

    const sum = this.config.stages
      .filter(s => s.enabled)
      .reduce((acc, s) => acc + (this.stageProgress.get(s.name) ?? 0), 0);

    return sum / total;
  }

  /**
   * Gets the current stage being executed.
   */
  getCurrentStage(): PipelineStage | null {
    return this.currentStage;
  }
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Generates a unique path name for scene objects.
 */
export function generateUniquePath(baseName: string, existing: Set<string>): string {
  if (!existing.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  let newName = `${baseName}_${counter}`;
  while (existing.has(newName)) {
    counter++;
    newName = `${baseName}_${counter}`;
  }

  return newName;
}

/**
 * Joins path segments with proper separators.
 */
export function joinPath(...segments: string[]): string {
  return segments
    .filter(s => s.length > 0)
    .join('/')
    .replace(/\/+/g, '/');
}

/**
 * Extracts the directory portion of a path.
 */
export function getDirectory(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
}

/**
 * Extracts the filename portion of a path.
 */
export function getFilename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

/**
 * Gets the file extension.
 */
export function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot >= 0 ? path.substring(lastDot + 1) : '';
}

/**
 * Changes the file extension.
 */
export function changeExtension(path: string, newExt: string): string {
  const lastDot = path.lastIndexOf('.');
  const base = lastDot >= 0 ? path.substring(0, lastDot) : path;
  return `${base}.${newExt.replace(/^\./, '')}`;
}

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * Exports a Three.js scene to GLTF format (as JSON structure).
 * Note: Actual binary export would require gltf-pipeline or similar.
 */
export async function exportSceneToGLTF(
  scene: THREE.Scene,
  name: string = 'scene'
): Promise<{ json: any; buffers: ArrayBuffer[] }> {
  // This is a simplified representation
  // In production, use three/examples/jsm/exporters/GLTFExporter

  const exporter = new (await import('three/examples/jsm/exporters/GLTFExporter.js')).GLTFExporter();
  
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve({ json: {}, buffers: [result] });
        } else {
          resolve({ json: result as any, buffers: [] });
        }
      },
      (error) => reject(error),
      { binary: true }
    );
  });
}

/**
 * Exports a scene to OBJ format.
 */
export async function exportSceneToOBJ(scene: THREE.Scene): Promise<string> {
  const exporter = new (await import('three/examples/jsm/exporters/OBJExporter.js')).OBJExporter();
  return exporter.parse(scene);
}

/**
 * Batch exports multiple scenes.
 */
export async function batchExportScenes(
  scenes: { name: string; scene: THREE.Scene }[],
  format: 'gltf' | 'obj' = 'gltf'
): Promise<Map<string, Blob>> {
  const results = new Map<string, Blob>();

  for (const { name, scene } of scenes) {
    try {
      let content: any;
      
      if (format === 'gltf') {
        const exported = await exportSceneToGLTF(scene, name);
        content = exported.json;
      } else if (format === 'obj') {
        content = await exportSceneToOBJ(scene);
      }

      const blob = new Blob([typeof content === 'string' ? content : JSON.stringify(content)], {
        type: format === 'gltf' ? 'model/gltf+json' : 'text/plain'
      });
      
      results.set(name, blob);
    } catch (error) {
      console.error(`Failed to export scene ${name}:`, error);
    }
  }

  return results;
}

/**
 * Compresses a GLTF file using Draco compression.
 * Note: Requires draco_encoder in production.
 */
export async function compressGLTF(gltfData: any): Promise<any> {
  // Placeholder - would use draco3d or gltf-pipeline in production
  console.warn('GLTF compression not implemented in browser environment');
  return gltfData;
}

// ============================================================================
// IMU Simulation (Simplified)
// ============================================================================

export interface IMUData {
  accelerometer: [number, number, number];
  gyroscope: [number, number, number];
  magnetometer: [number, number, number];
  timestamp: number;
}

/**
 * Simulates IMU sensor data for a moving object.
 */
export class IMUSimulator {
  private gravity: THREE.Vector3 = new THREE.Vector3(0, -9.81, 0);
  private noiseStdDev: number = 0.1;
  private rng: SeededRandom;

  constructor(seed?: number) {
    this.rng = new SeededRandom(seed ?? Date.now());
  }

  /**
   * Generates simulated IMU readings for a given pose and velocity.
   */
  simulate(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    acceleration: THREE.Vector3,
    orientation: THREE.Quaternion,
    angularVelocity: THREE.Vector3
  ): IMUData {
    const timestamp = Date.now();

    // Accelerometer: measures proper acceleration (including gravity)
    const accelWorld = acceleration.clone().add(this.gravity);
    const accelBody = accelWorld.clone().applyQuaternion(orientation.clone().invert());
    
    // Add noise
    accelBody.x += this.rng.gaussian(0, this.noiseStdDev);
    accelBody.y += this.rng.gaussian(0, this.noiseStdDev);
    accelBody.z += this.rng.gaussian(0, this.noiseStdDev);

    // Gyroscope: measures angular velocity
    const gyro = angularVelocity.clone();
    gyro.x += this.rng.gaussian(0, this.noiseStdDev * 0.1);
    gyro.y += this.rng.gaussian(0, this.noiseStdDev * 0.1);
    gyro.z += this.rng.gaussian(0, this.noiseStdDev * 0.1);

    // Magnetometer: simplified Earth magnetic field
    const mag = new THREE.Vector3(0.3, 0, 0.5); // Approximate Earth field
    mag.applyQuaternion(orientation.clone().invert());
    mag.x += this.rng.gaussian(0, this.noiseStdDev * 0.05);
    mag.y += this.rng.gaussian(0, this.noiseStdDev * 0.05);
    mag.z += this.rng.gaussian(0, this.noiseStdDev * 0.05);

    return {
      accelerometer: [accelBody.x, accelBody.y, accelBody.z],
      gyroscope: [gyro.x, gyro.y, gyro.z],
      magnetometer: [mag.x, mag.y, mag.z],
      timestamp
    };
  }

  /**
   * Sets the noise level for sensor simulation.
   */
  setNoiseLevel(stdDev: number): void {
    this.noiseStdDev = stdDev;
  }
}
