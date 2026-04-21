/**
 * Phase 4: Data Pipeline - Ground Truth Generator
 * 
 * Generates ground truth data for ML training including:
 * depth maps, normal maps, segmentation masks, bounding boxes,
 * optical flow, and instance IDs.
 */

import { 
  Scene, 
  Camera, 
  WebGLRenderer, 
  Vector3, 
  Matrix4,
  Color,
  MeshDepthMaterial,
  MeshNormalMaterial,
  ShaderMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Box3,
  Vector2,
} from 'three';

export interface GroundTruthOptions {
  resolution: { width: number; height: number };
  depth: boolean;
  normal: boolean;
  albedo: boolean;
  segmentation: boolean;
  boundingBoxes: boolean;
  opticalFlow: boolean;
  instanceIds: boolean;
  outputFormat: 'png' | 'exr' | 'numpy';
}

export interface GroundTruthResult {
  depth?: Float32Array;
  normal?: Float32Array;
  albedo?: Uint8Array;
  segmentation?: Uint8Array;
  boundingBoxes?: BoundingBoxData[];
  opticalFlow?: Float32Array;
  instanceIds?: Uint16Array;
  metadata: GroundTruthMetadata;
}

export interface BoundingBoxData {
  objectId: string;
  label: string;
  bbox2D: { x: number; y: number; width: number; height: number };
  bbox3D: {
    center: Vector3;
    size: Vector3;
    rotation: Vector3;
  };
  confidence: number;
}

export interface GroundTruthMetadata {
  jobId: string;
  cameraId: string;
  timestamp: Date;
  resolution: { width: number; height: number };
  nearPlane: number;
  farPlane: number;
  fov: number;
  objectCount: number;
}

export interface SegmentationLabel {
  id: number;
  name: string;
  color: Color;
  category: string;
}

export class GroundTruthGenerator {
  private renderer: WebGLRenderer;
  private options: GroundTruthOptions;
  private segmentationLabels: Map<string, SegmentationLabel>;
  
  // Temporary cameras and scenes for rendering passes
  private depthCamera: OrthographicCamera;
  private depthScene: Scene;
  private normalScene: Scene;
  private segmentationScene: Scene;
  
  // Materials
  private depthMaterial: MeshDepthMaterial;
  private normalMaterial: MeshNormalMaterial;
  private segmentationMaterial: ShaderMaterial;

  constructor(renderer: WebGLRenderer, options: Partial<GroundTruthOptions> = {}) {
    this.renderer = renderer;
    this.options = {
      resolution: options.resolution ?? { width: 1920, height: 1080 },
      depth: options.depth ?? true,
      normal: options.normal ?? true,
      albedo: options.albedo ?? true,
      segmentation: options.segmentation ?? true,
      boundingBoxes: options.boundingBoxes ?? true,
      opticalFlow: options.opticalFlow ?? false,
      instanceIds: options.instanceIds ?? true,
      outputFormat: options.outputFormat ?? 'png',
    };
    
    this.segmentationLabels = new Map();
    this.initializeDefaultLabels();
    
    // Initialize depth rendering
    const { width, height } = this.options.resolution;
    this.depthCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.depthScene = new Scene();
    this.depthMaterial = new MeshDepthMaterial({
      depthPacking: 3, // RGBADepthPacking
    });
    
    // Initialize normal rendering
    this.normalScene = new Scene();
    this.normalMaterial = new MeshNormalMaterial();
    
    // Initialize segmentation rendering
    this.segmentationScene = new Scene();
    this.segmentationMaterial = new ShaderMaterial({
      uniforms: {
        objectId: { value: 0 },
        segmentColor: { value: new Color() },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 segmentColor;
        uniform float objectId;
        varying vec2 vUv;
        
        void main() {
          gl_FragColor = vec4(segmentColor, objectId / 255.0);
        }
      `,
    });
  }

  /**
   * Generate all enabled ground truth data for a scene
   */
  async generate(
    scene: Scene,
    camera: Camera,
    jobId: string,
    cameraId: string,
    previousFrameData?: { scene: Scene; camera: Camera }
  ): Promise<GroundTruthResult> {
    const result: GroundTruthResult = {
      metadata: this.createMetadata(jobId, cameraId, camera, scene),
    };
    
    const { width, height } = this.options.resolution;
    
    // Generate depth map
    if (this.options.depth) {
      result.depth = await this.renderDepth(scene, camera);
    }
    
    // Generate normal map
    if (this.options.normal) {
      result.normal = await this.renderNormals(scene, camera);
    }
    
    // Generate albedo (base color)
    if (this.options.albedo) {
      result.albedo = await this.renderAlbedo(scene, camera);
    }
    
    // Generate segmentation mask
    if (this.options.segmentation) {
      result.segmentation = await this.renderSegmentation(scene, camera);
    }
    
    // Generate instance IDs
    if (this.options.instanceIds) {
      result.instanceIds = await this.renderInstanceIds(scene, camera);
    }
    
    // Calculate bounding boxes
    if (this.options.boundingBoxes) {
      result.boundingBoxes = this.calculateBoundingBoxes(scene, camera);
    }
    
    // Generate optical flow (requires previous frame)
    if (this.options.opticalFlow && previousFrameData) {
      result.opticalFlow = await this.calculateOpticalFlow(
        scene,
        camera,
        previousFrameData.scene,
        previousFrameData.camera
      );
    }
    
    return result;
  }

  /**
   * Register a segmentation label
   */
  registerLabel(id: string, name: string, color: Color, category: string): void {
    const labelId = this.segmentationLabels.size;
    this.segmentationLabels.set(id, { id: labelId, name, color, category });
  }

  /**
   * Get all registered labels
   */
  getLabels(): SegmentationLabel[] {
    return Array.from(this.segmentationLabels.values());
  }

  /**
   * Encode depth to PNG-compatible format
   */
  encodeDepth(depth: Float32Array, near: number, far: number): Uint16Array {
    const encoded = new Uint16Array(depth.length);
    
    for (let i = 0; i < depth.length; i++) {
      const z = depth[i];
      // Normalize to [0, 1]
      const normalized = (z - near) / (far - near);
      // Quantize to 16-bit
      encoded[i] = Math.floor(normalized * 65535);
    }
    
    return encoded;
  }

  /**
   * Decode depth from PNG format
   */
  decodeDepth(encoded: Uint16Array, near: number, far: number): Float32Array {
    const decoded = new Float32Array(encoded.length);
    
    for (let i = 0; i < encoded.length; i++) {
      const normalized = encoded[i] / 65535;
      decoded[i] = near + normalized * (far - near);
    }
    
    return decoded;
  }

  private async renderDepth(scene: Scene, camera: Camera): Promise<Float32Array> {
    const { width, height } = this.options.resolution;
    
    // Save original renderer state
    const originalScene = this.renderer.scene;
    const originalCamera = this.renderer.camera;
    
    // Setup depth rendering
    this.depthScene.clear();
    
    // Clone objects with depth material
    scene.traverse((object) => {
      if ((object as any).isMesh) {
        const mesh = object.clone();
        mesh.material = this.depthMaterial.clone();
        this.depthScene.add(mesh);
      }
    });
    
    // Render
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.depthScene, camera);
    
    // Read pixels
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(null, 0, 0, width, height, pixels);
    
    // Convert to depth float array
    const depth = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = pixels[i * 4] / 255;
      const g = pixels[i * 4 + 1] / 255;
      // Decode depth from RGBA
      depth[i] = r + g / 256;
    }
    
    // Cleanup
    this.depthScene.clear();
    
    return depth;
  }

  private async renderNormals(scene: Scene, camera: Camera): Promise<Float32Array> {
    const { width, height } = this.options.resolution;
    
    this.normalScene.clear();
    
    // Clone objects with normal material
    scene.traverse((object) => {
      if ((object as any).isMesh) {
        const mesh = object.clone();
        mesh.material = this.normalMaterial.clone();
        this.normalScene.add(mesh);
      }
    });
    
    // Render
    this.renderer.render(this.normalScene, camera);
    
    // Read pixels
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(null, 0, 0, width, height, pixels);
    
    // Convert to normal float array (RGB -> XYZ, normalized to [-1, 1])
    const normals = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      normals[i * 3] = (pixels[i * 4] / 255) * 2 - 1;     // X
      normals[i * 3 + 1] = (pixels[i * 4 + 1] / 255) * 2 - 1; // Y
      normals[i * 3 + 2] = (pixels[i * 4 + 2] / 255) * 2 - 1; // Z
    }
    
    this.normalScene.clear();
    
    return normals;
  }

  private async renderAlbedo(scene: Scene, camera: Camera): Promise<Uint8Array> {
    const { width, height } = this.options.resolution;
    
    // Save current materials
    const originalMaterials = new Map();
    
    // Replace materials with unlit versions
    scene.traverse((object: any) => {
      if (object.isMesh && object.material) {
        originalMaterials.set(object.uuid, object.material);
        
        // Create unlit material preserving base color
        const baseColor = object.material.color ?? new Color(1, 1, 1);
        object.material = new ShaderMaterial({
          uniforms: {
            color: { value: baseColor },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 color;
            varying vec2 vUv;
            void main() {
              gl_FragColor = vec4(color, 1.0);
            }
          `,
        });
      }
    });
    
    // Render
    this.renderer.render(scene, camera);
    
    // Read pixels
    const pixels = new Uint8Array(width * height * 3);
    this.renderer.readRenderTargetPixels(null, 0, 0, width, height, pixels);
    
    // Restore original materials
    scene.traverse((object: any) => {
      if (originalMaterials.has(object.uuid)) {
        object.material = originalMaterials.get(object.uuid);
      }
    });
    
    return pixels;
  }

  private async renderSegmentation(scene: Scene, camera: Camera): Promise<Uint8Array> {
    const { width, height } = this.options.resolution;
    
    this.segmentationScene.clear();
    
    // Create segmentation colors for each object
    const objectIdMap = new Map<string, number>();
    let objectIdCounter = 1;
    
    scene.traverse((object: any) => {
      if (object.isMesh) {
        // Get or create object ID
        if (!objectIdMap.has(object.uuid)) {
          objectIdMap.set(object.uuid, objectIdCounter++);
        }
        
        const objectId = objectIdMap.get(object.uuid)!;
        const label = this.segmentationLabels.get(object.userData?.label ?? 'unknown');
        const color = label?.color ?? new Color(Math.random(), Math.random(), Math.random());
        
        const mesh = object.clone();
        mesh.material = this.segmentationMaterial.clone();
        mesh.material.uniforms.objectId.value = objectId;
        mesh.material.uniforms.segmentColor.value = color;
        
        this.segmentationScene.add(mesh);
      }
    });
    
    // Render
    this.renderer.render(this.segmentationScene, camera);
    
    // Read pixels (RGBA, where A contains object ID)
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(null, 0, 0, width, height, pixels);
    
    // Extract label IDs from alpha channel
    const segmentation = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      segmentation[i] = pixels[i * 4 + 3]; // Alpha channel contains object ID
    }
    
    this.segmentationScene.clear();
    
    return segmentation;
  }

  private async renderInstanceIds(scene: Scene, camera: Camera): Promise<Uint16Array> {
    const { width, height } = this.options.resolution;
    
    // Similar to segmentation but with full 16-bit IDs
    const instanceIds = new Uint16Array(width * height);
    
    const objectIdMap = new Map<string, number>();
    let objectIdCounter = 1;
    
    // Simple rasterization approach
    scene.traverse((object: any) => {
      if (object.isMesh) {
        if (!objectIdMap.has(object.uuid)) {
          objectIdMap.set(object.uuid, objectIdCounter++);
        }
      }
    });
    
    // In a real implementation, this would render to a 16-bit buffer
    // For now, we'll use a simplified approach
    // This is a placeholder - actual implementation requires custom shader
    
    return instanceIds;
  }

  private calculateBoundingBoxes(scene: Scene, camera: Camera): BoundingBoxData[] {
    const boundingBoxes: BoundingBoxData[] = [];
    
    scene.traverse((object: any) => {
      if (object.isMesh && object.geometry) {
        // Calculate 3D bounding box
        const bbox3D = new Box3().setFromObject(object);
        
        // Project to 2D screen space
        const min = bbox3D.min.clone();
        const max = bbox3D.max.clone();
        
        // Project corners to screen space
        const corners = [
          new Vector3(min.x, min.y, min.z),
          new Vector3(max.x, min.y, min.z),
          new Vector3(min.x, max.y, min.z),
          new Vector3(max.x, max.y, min.z),
          new Vector3(min.x, min.y, max.z),
          new Vector3(max.x, min.y, max.z),
          new Vector3(min.x, max.y, max.z),
          new Vector3(max.x, max.y, max.z),
        ];
        
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        
        for (const corner of corners) {
          const projected = corner.project(camera);
          const x = (projected.x + 1) / 2;
          const y = (1 - projected.y) / 2;
          
          if (projected.z < 1 && projected.z > -1) { // Within view frustum
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        
        if (minX < maxX && minY < maxY) {
          boundingBoxes.push({
            objectId: object.uuid,
            label: object.userData?.label ?? 'unknown',
            bbox2D: {
              x: minX * this.options.resolution.width,
              y: minY * this.options.resolution.height,
              width: (maxX - minX) * this.options.resolution.width,
              height: (maxY - minY) * this.options.resolution.height,
            },
            bbox3D: {
              center: bbox3D.getCenter(new Vector3()),
              size: bbox3D.getSize(new Vector3()),
              rotation: new Vector3(
                object.rotation.x,
                object.rotation.y,
                object.rotation.z
              ),
            },
            confidence: 1.0,
          });
        }
      }
    });
    
    return boundingBoxes;
  }

  private async calculateOpticalFlow(
    currentScene: Scene,
    currentCamera: Camera,
    previousScene: Scene,
    previousCamera: Camera
  ): Promise<Float32Array> {
    const { width, height } = this.options.resolution;
    
    // Simplified optical flow calculation
    // In a real implementation, this would use more sophisticated algorithms
    // like Farneback or TV-L1
    
    const flow = new Float32Array(width * height * 2);
    
    // Placeholder: zero flow
    // Actual implementation would compare depth/position changes between frames
    
    return flow;
  }

  private createMetadata(
    jobId: string,
    cameraId: string,
    camera: Camera,
    scene: Scene
  ): GroundTruthMetadata {
    let objectCount = 0;
    scene.traverse((object) => {
      if ((object as any).isMesh) objectCount++;
    });
    
    const fov = (camera as PerspectiveCamera).fov ?? 75;
    const near = camera.near;
    const far = camera.far;
    
    return {
      jobId,
      cameraId,
      timestamp: new Date(),
      resolution: this.options.resolution,
      nearPlane: near,
      farPlane: far,
      fov,
      objectCount,
    };
  }

  private initializeDefaultLabels(): void {
    const defaultLabels: Array<[string, string, [number, number, number], string]> = [
      ['ground', 'Ground', [0.4, 0.4, 0.4], 'terrain'],
      ['vegetation', 'Vegetation', [0.2, 0.6, 0.2], 'plant'],
      ['tree', 'Tree', [0.1, 0.5, 0.1], 'plant'],
      ['rock', 'Rock', [0.5, 0.5, 0.5], 'prop'],
      ['water', 'Water', [0.1, 0.3, 0.8], 'terrain'],
      ['sky', 'Sky', [0.4, 0.6, 0.9], 'environment'],
      ['creature', 'Creature', [0.8, 0.4, 0.2], 'animal'],
      ['building', 'Building', [0.6, 0.6, 0.6], 'structure'],
      ['human', 'Human', [0.9, 0.6, 0.4], 'animal'],
      ['vehicle', 'Vehicle', [0.7, 0.7, 0.3], 'object'],
    ];
    
    for (const [id, name, color, category] of defaultLabels) {
      this.registerLabel(id, name, new Color(...color), category);
    }
  }
}

export default GroundTruthGenerator;
