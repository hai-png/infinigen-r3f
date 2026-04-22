/**
 * DataGenerationPipeline - Automated dataset generation for ML training
 * 
 * Generates synthetic terrain datasets with:
 * - RGB imagery renders
 * - Semantic segmentation masks
 * - Instance segmentation masks
 * - Depth maps
 * - Normal maps
 * - Camera trajectory automation
 * - Annotation export (COCO, YOLO formats)
 * 
 * Ported from: infinigen/data_generation/pipeline.py
 */

import * as THREE from 'three';
import { TerrainGenerator } from '../generator/TerrainGenerator';
import { CameraTrajectory } from './CameraTrajectory';

export interface DataGenConfig {
  seed: number;
  outputDir: string;
  imageWidth: number;
  imageHeight: number;
  format: 'png' | 'jpg' | 'exr';
  quality: number;
  generateRGB: boolean;
  generateDepth: boolean;
  generateNormals: boolean;
  generateSemantic: boolean;
  generateInstance: boolean;
  cameraCount: number;
  annotationFormat: 'coco' | 'yolo' | 'custom';
}

export interface SemanticLabel {
  id: number;
  name: string;
  color: THREE.Color;
  category: string;
}

export interface InstanceAnnotation {
  id: number;
  categoryId: number;
  bbox: [number, number, number, number];
  mask: Uint8Array;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export interface DatasetFrame {
  frameId: number;
  timestamp: number;
  cameraPosition: Vector3;
  cameraRotation: Vector3;
  cameraIntrinsics: Matrix4;
  rgbPath?: string;
  depthPath?: string;
  normalPath?: string;
  semanticPath?: string;
  instancePath?: string;
  annotations: InstanceAnnotation[];
  metadata: FrameMetadata;
}

export interface FrameMetadata {
  worldSeed: number;
  terrainType: string;
  biome: string;
  weather: string;
  timeOfDay: number;
  elevation: number;
  slope: number;
  aspect: number;
}

export class DataGenerationPipeline {
  private config: DataGenConfig;
  private terrainGen: TerrainGenerator;
  private cameraTraj: CameraTrajectory;
  private semanticLabels: Map<number, SemanticLabel>;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config?: Partial<DataGenConfig>
  ) {
    this.config = {
      seed: Math.random() * 10000,
      outputDir: './output/dataset',
      imageWidth: 1920,
      imageHeight: 1080,
      format: 'png',
      quality: 0.95,
      generateRGB: true,
      generateDepth: true,
      generateNormals: false,
      generateSemantic: true,
      generateInstance: true,
      cameraCount: 100,
      annotationFormat: 'coco',
      ...config,
    };
    
    this.scene = scene;
    this.camera = camera;
    this.terrainGen = new TerrainGenerator({ seed: this.config.seed });
    this.cameraTraj = new CameraTrajectory({ seed: this.config.seed });
    
    // Initialize semantic labels
    this.semanticLabels = this.initializeSemanticLabels();
    
    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(this.config.imageWidth, this.config.imageHeight);
    this.renderer.setPixelRatio(1);
  }
  
  /**
   * Initialize semantic segmentation labels
   */
  private initializeSemanticLabels(): Map<number, SemanticLabel> {
    const labels = new Map<number, SemanticLabel>();
    
    // Terrain types
    labels.set(1, { id: 1, name: 'dirt', color: new THREE.Color(0x8B4513), category: 'terrain' });
    labels.set(2, { id: 2, name: 'snow', color: new THREE.Color(0xFFFAFA), category: 'terrain' });
    labels.set(3, { id: 3, name: 'stone', color: new THREE.Color(0x808080), category: 'terrain' });
    labels.set(4, { id: 4, name: 'sand', color: new THREE.Color(0xF4D03F), category: 'terrain' });
    labels.set(5, { id: 5, name: 'ice', color: new THREE.Color(0xAED6F1), category: 'terrain' });
    labels.set(6, { id: 6, name: 'mud', color: new THREE.Color(0x5D4037), category: 'terrain' });
    labels.set(7, { id: 7, name: 'grass', color: new THREE.Color(0x228B22), category: 'terrain' });
    labels.set(8, { id: 8, name: 'lava', color: new THREE.Color(0xFF4500), category: 'terrain' });
    
    // Vegetation
    labels.set(10, { id: 10, name: 'tree', color: new THREE.Color(0x006400), category: 'vegetation' });
    labels.set(11, { id: 11, name: 'shrub', color: new THREE.Color(0x2E8B57), category: 'vegetation' });
    labels.set(12, { id: 12, name: 'fern', color: new THREE.Color(0x3CB371), category: 'vegetation' });
    labels.set(13, { id: 13, name: 'mushroom', color: new THREE.Color(0xDC143C), category: 'vegetation' });
    
    // Water
    labels.set(20, { id: 20, name: 'water', color: new THREE.Color(0x1E90FF), category: 'water' });
    labels.set(21, { id: 21, name: 'ocean', color: new THREE.Color(0x0000CD), category: 'water' });
    labels.set(22, { id: 22, name: 'lake', color: new THREE.Color(0x4169E1), category: 'water' });
    labels.set(23, { id: 23, name: 'river', color: new THREE.Color(0x6495ED), category: 'water' });
    
    // Sky
    labels.set(30, { id: 30, name: 'sky', color: new THREE.Color(0x87CEEB), category: 'sky' });
    labels.set(31, { id: 31, name: 'cloud', color: new THREE.Color(0xFFFFFF), category: 'sky' });
    
    return labels;
  }
  
  /**
   * Generate complete dataset
   */
  async generateDataset(
    numWorlds: number,
    framesPerWorld: number
  ): Promise<DatasetFrame[]> {
    const allFrames: DatasetFrame[] = [];
    
    for (let w = 0; w < numWorlds; w++) {
      const worldSeed = this.config.seed + w * 1000;
      
      // Generate new terrain
      await this.terrainGen.generate({
        seed: worldSeed,
        resolution: 256,
        worldSize: 1000,
      });
      
      // Generate camera trajectories
      const trajectory = this.cameraTraj.generateSpiralTrajectory(
        framesPerWorld,
        this.terrainGen.getBounds()
      );
      
      // Render each frame
      for (let f = 0; f < framesPerWorld; f++) {
        const frame = await this.renderFrame(
          trajectory[f],
          worldSeed,
          w * framesPerWorld + f
        );
        allFrames.push(frame);
      }
    }
    
    // Export annotations
    if (this.config.annotationFormat === 'coco') {
      this.exportCOCOAnnotations(allFrames);
    } else if (this.config.annotationFormat === 'yolo') {
      this.exportYOLOAnnotations(allFrames);
    }
    
    return allFrames;
  }
  
  /**
   * Render single frame with all modalities
   */
  private async renderFrame(
    cameraPose: { position: Vector3; target: Vector3 },
    worldSeed: number,
    frameId: number
  ): Promise<DatasetFrame> {
    const timestamp = Date.now();
    
    // Setup camera
    this.camera.position.copy(cameraPose.position);
    this.camera.lookAt(cameraPose.target);
    this.camera.updateMatrixWorld();
    
    // Compute metadata
    const terrainPoint = this.getTerrainUnderCamera(cameraPose.position);
    const metadata: FrameMetadata = {
      worldSeed,
      terrainType: this.classifyTerrain(terrainPoint.elevation, terrainPoint.slope),
      biome: this.classifyBiome(terrainPoint.elevation, terrainPoint.aspect),
      weather: 'clear',
      timeOfDay: 0.5,
      elevation: terrainPoint.elevation,
      slope: terrainPoint.slope,
      aspect: terrainPoint.aspect,
    };
    
    const frame: DatasetFrame = {
      frameId,
      timestamp,
      cameraPosition: cameraPose.position.clone(),
      cameraRotation: new Vector3(
        this.camera.rotation.x,
        this.camera.rotation.y,
        this.camera.rotation.z
      ),
      cameraIntrinsics: this.camera.projectionMatrix.clone(),
      annotations: [],
      metadata,
    };
    
    // Render RGB
    if (this.config.generateRGB) {
      this.renderer.render(this.scene, this.camera);
      frame.rgbPath = `${this.config.outputDir}/rgb/frame_${frameId.toString().padStart(6, '0')}.${this.config.format}`;
      // In real implementation: await this.saveImage(frame.rgbPath);
    }
    
    // Render depth
    if (this.config.generateDepth) {
      const depthMap = this.renderDepthMap();
      frame.depthPath = `${this.config.outputDir}/depth/frame_${frameId.toString().padStart(6, '0')}.png`;
      // In real implementation: await this.saveDepthMap(frame.depthPath, depthMap);
    }
    
    // Render normals
    if (this.config.generateNormals) {
      const normalMap = this.renderNormalMap();
      frame.normalPath = `${this.config.outputDir}/normals/frame_${frameId.toString().padStart(6, '0')}.png`;
      // In real implementation: await this.saveNormalMap(frame.normalPath, normalMap);
    }
    
    // Render semantic segmentation
    if (this.config.generateSemantic) {
      const semanticMap = this.renderSemanticMap();
      frame.semanticPath = `${this.config.outputDir}/semantic/frame_${frameId.toString().padStart(6, '0')}.png`;
      // In real implementation: await this.saveSemanticMap(frame.semanticPath, semanticMap);
    }
    
    // Render instance segmentation
    if (this.config.generateInstance) {
      const { instanceMap, annotations } = this.renderInstanceMap();
      frame.instancePath = `${this.config.outputDir}/instance/frame_${frameId.toString().padStart(6, '0')}.png`;
      frame.annotations = annotations;
      // In real implementation: await this.saveInstanceMap(frame.instancePath, instanceMap);
    }
    
    return frame;
  }
  
  /**
   * Render depth map
   */
  private renderDepthMap(): Float32Array {
    const depthMap = new Float32Array(
      this.config.imageWidth * this.config.imageHeight
    );
    
    // Setup depth material
    const depthMaterial = new THREE.MeshDepthMaterial();
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    
    // Replace materials with depth material
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        originalMaterials.set(obj, obj.material);
        obj.material = depthMaterial;
      }
    });
    
    // Render
    this.renderer.render(this.scene, this.camera);
    
    // Read depth buffer
    const pixels = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight * 4
    );
    this.renderer.readRenderTargetPixels(
      null as any,
      0, 0,
      this.config.imageWidth,
      this.config.imageHeight,
      pixels
    );
    
    // Convert to float depth
    for (let i = 0; i < depthMap.length; i++) {
      depthMap[i] = pixels[i * 4] / 255.0;
    }
    
    // Restore original materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && originalMaterials.has(obj)) {
        obj.material = originalMaterials.get(obj)!;
      }
    });
    
    return depthMap;
  }
  
  /**
   * Render normal map
   */
  private renderNormalMap(): Uint8Array {
    const normalMap = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight * 3
    );
    
    // Setup normal material
    const normalMaterial = new THREE.MeshNormalMaterial();
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    
    // Replace materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        originalMaterials.set(obj, obj.material);
        obj.material = normalMaterial;
      }
    });
    
    // Render
    this.renderer.render(this.scene, this.camera);
    
    // Read pixels
    const pixels = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight * 4
    );
    this.renderer.readRenderTargetPixels(
      null as any,
      0, 0,
      this.config.imageWidth,
      this.config.imageHeight,
      pixels
    );
    
    // Extract RGB normals
    for (let i = 0; i < normalMap.length; i++) {
      normalMap[i] = pixels[Math.floor(i / 3) * 4 + (i % 3)];
    }
    
    // Restore materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && originalMaterials.has(obj)) {
        obj.material = originalMaterials.get(obj)!;
      }
    });
    
    return normalMap;
  }
  
  /**
   * Render semantic segmentation map
   */
  private renderSemanticMap(): Uint8Array {
    const semanticMap = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight
    );
    
    // Create color-coded semantic materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.semanticId) {
        const label = this.semanticLabels.get(obj.userData.semanticId);
        if (label) {
          obj.material = new THREE.MeshBasicMaterial({
            color: label.color,
          });
        }
      }
    });
    
    // Render
    this.renderer.render(this.scene, this.camera);
    
    // Read and encode semantic IDs
    const pixels = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight * 4
    );
    this.renderer.readRenderTargetPixels(
      null as any,
      0, 0,
      this.config.imageWidth,
      this.config.imageHeight,
      pixels
    );
    
    // Decode semantic IDs from colors
    for (let i = 0; i < semanticMap.length; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      
      // Find matching label
      let semanticId = 0;
      for (const [id, label] of this.semanticLabels.entries()) {
        if (
          Math.abs(label.color.r * 255 - r) < 10 &&
          Math.abs(label.color.g * 255 - g) < 10 &&
          Math.abs(label.color.b * 255 - b) < 10
        ) {
          semanticId = id;
          break;
        }
      }
      
      semanticMap[i] = semanticId;
    }
    
    return semanticMap;
  }
  
  /**
   * Render instance segmentation map
   */
  private renderInstanceMap(): {
    instanceMap: Uint8Array;
    annotations: InstanceAnnotation[];
  } {
    const instanceMap = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight
    );
    const annotations: InstanceAnnotation[] = [];
    
    let instanceId = 1;
    const instanceColors = new Map<number, THREE.Color>();
    
    // Assign unique colors to instances
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.instanceId) {
        const hue = (instanceId * 0.618033988749895) % 1; // Golden ratio
        const color = new THREE.Color().setHSL(hue, 1.0, 0.5);
        instanceColors.set(instanceId, color);
        
        obj.userData.renderInstanceId = instanceId;
        obj.material = new THREE.MeshBasicMaterial({ color });
        
        instanceId++;
      }
    });
    
    // Render
    this.renderer.render(this.scene, this.camera);
    
    // Read instance IDs
    const pixels = new Uint8Array(
      this.config.imageWidth * this.config.imageHeight * 4
    );
    this.renderer.readRenderTargetPixels(
      null as any,
      0, 0,
      this.config.imageWidth,
      this.config.imageHeight,
      pixels
    );
    
    // Decode instance IDs and create masks
    const instancePixels = new Map<number, number[]>();
    
    for (let i = 0; i < instanceMap.length; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      
      // Find matching instance color
      let instId = 0;
      for (const [id, color] of instanceColors.entries()) {
        if (
          Math.abs(color.r * 255 - r) < 10 &&
          Math.abs(color.g * 255 - g) < 10 &&
          Math.abs(color.b * 255 - b) < 10
        ) {
          instId = id;
          break;
        }
      }
      
      instanceMap[i] = instId;
      
      if (instId > 0) {
        if (!instancePixels.has(instId)) {
          instancePixels.set(instId, []);
        }
        instancePixels.get(instId)!.push(i);
      }
    }
    
    // Create annotations
    for (const [instId, pixelIndices] of instancePixels.entries()) {
      if (pixelIndices.length === 0) continue;
      
      // Compute bounding box
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      for (const idx of pixelIndices) {
        const x = idx % this.config.imageWidth;
        const y = Math.floor(idx / this.config.imageWidth);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      
      annotations.push({
        id: instId,
        categoryId: 1, // Would need to track actual category
        bbox: [minX, minY, maxX - minX, maxY - minY],
        mask: new Uint8Array(pixelIndices),
        position: new Vector3(),
        rotation: new Vector3(),
        scale: new Vector3(1, 1, 1),
      });
    }
    
    return { instanceMap, annotations };
  }
  
  /**
   * Get terrain properties under camera
   */
  private getTerrainUnderCamera(cameraPos: Vector3): {
    elevation: number;
    slope: number;
    aspect: number;
  } {
    // Raycast to terrain
    const raycaster = new THREE.Raycaster(
      cameraPos,
      new Vector3(0, -1, 0)
    );
    
    const intersects = raycaster.intersectObjects(
      this.scene.children.filter(o => o.userData.isTerrain),
      true
    );
    
    if (intersects.length > 0) {
      const point = intersects[0].point;
      return {
        elevation: point.y,
        slope: 0, // Would compute from heightmap
        aspect: 0, // Would compute from normal
      };
    }
    
    return { elevation: 0, slope: 0, aspect: 0 };
  }
  
  /**
   * Classify terrain type
   */
  private classifyTerrain(elevation: number, slope: number): string {
    if (elevation > 400) return 'snow';
    if (slope > 1.0) return 'stone';
    if (elevation < 10) return 'sand';
    return 'dirt';
  }
  
  /**
   * Classify biome
   */
  private classifyBiome(elevation: number, aspect: number): string {
    if (elevation > 300) return 'alpine';
    if (elevation < 50) return 'coastal';
    return 'temperate';
  }
  
  /**
   * Export COCO format annotations
   */
  private exportCOCOAnnotations(frames: DatasetFrame[]): void {
    const cocoData = {
      info: {
        year: 2024,
        version: '1.0',
        description: 'Infinigen Synthetic Terrain Dataset',
      },
      images: frames.map(f => ({
        id: f.frameId,
        file_name: `frame_${f.frameId.toString().padStart(6, '0')}`,
        width: this.config.imageWidth,
        height: this.config.imageHeight,
        date_captured: new Date(f.timestamp).toISOString(),
      })),
      annotations: frames.flatMap(f =>
        f.annotations.map(a => ({
          id: a.id,
          image_id: f.frameId,
          category_id: a.categoryId,
          bbox: a.bbox,
          segmentation: Array.from(a.mask),
          area: a.mask.length,
          iscrowd: 0,
        }))
      ),
      categories: Array.from(this.semanticLabels.values()).map(l => ({
        id: l.id,
        name: l.name,
        supercategory: l.category,
      })),
    };
    
    // In real implementation: save JSON file
    console.log('COCO annotations prepared:', cocoData.annotations.length, 'annotations');
  }
  
  /**
   * Export YOLO format annotations
   */
  private exportYOLOAnnotations(frames: DatasetFrame[]): void {
    for (const frame of frames) {
      let yoloContent = '';
      
      for (const ann of frame.annotations) {
        const cx = (ann.bbox[0] + ann.bbox[2] / 2) / this.config.imageWidth;
        const cy = (ann.bbox[1] + ann.bbox[3] / 2) / this.config.imageHeight;
        const w = ann.bbox[2] / this.config.imageWidth;
        const h = ann.bbox[3] / this.config.imageHeight;
        
        yoloContent += `${ann.categoryId} ${cx} ${cy} ${w} ${h}\n`;
      }
      
      // In real implementation: save text file
      console.log(`YOLO annotation for frame ${frame.frameId}:`, yoloContent.trim());
    }
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.renderer.dispose();
  }
}
