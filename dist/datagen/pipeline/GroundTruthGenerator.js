/**
 * Phase 4: Data Pipeline - Ground Truth Generator
 *
 * Generates ground truth data for ML training including:
 * depth maps, normal maps, segmentation masks, bounding boxes,
 * optical flow, and instance IDs.
 *
 * Enhanced with:
 * - Dense optical flow calculation using scene motion vectors
 * - Instance ID rendering with 16-bit precision
 * - Enhanced 2D/3D bounding boxes with occlusion detection
 * - Instance segmentation masks
 */
import { Scene, Vector3, Color, MeshDepthMaterial, MeshNormalMaterial, ShaderMaterial, OrthographicCamera, Box3, WebGLRenderTarget, RGBAFormat, HalfFloatType, LinearFilter, Raycaster, } from 'three';
export class GroundTruthGenerator {
    constructor(renderer, options = {}) {
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
        const { width, height } = this.options.resolution;
        // Initialize depth rendering
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
        // Initialize instance ID rendering with 16-bit precision
        this.instanceIdScene = new Scene();
        this.instanceIdMaterial = new ShaderMaterial({
            uniforms: {
                instanceId: { value: 0 },
            },
            vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform float instanceId;
        varying vec2 vUv;
        
        void main() {
          // Encode 16-bit ID in RGBA
          float id = instanceId;
          float r = mod(id, 256.0) / 255.0;
          float g = floor(id / 256.0) / 255.0;
          gl_FragColor = vec4(r, g, 0.0, 1.0);
        }
      `,
        });
        // Initialize optical flow rendering
        this.flowScene = new Scene();
        this.positionRenderTarget = new WebGLRenderTarget(width, height, {
            format: RGBAFormat,
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
        });
        this.previousPositionRenderTarget = new WebGLRenderTarget(width, height, {
            format: RGBAFormat,
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
        });
        this.flowMaterial = new ShaderMaterial({
            uniforms: {
                currentPosition: { value: null },
                previousPosition: { value: null },
            },
            vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform sampler2D currentPosition;
        uniform sampler2D previousPosition;
        varying vec2 vUv;
        
        void main() {
          vec3 currPos = texture2D(currentPosition, vUv).rgb;
          vec3 prevPos = texture2D(previousPosition, vUv).rgb;
          vec2 flow = currPos.xy - prevPos.xy;
          gl_FragColor = vec4(flow, 0.0, 1.0);
        }
      `,
        });
        // Initialize raycaster for occlusion detection
        this.raycaster = new Raycaster();
    }
    /**
     * Generate all enabled ground truth data for a scene
     */
    async generate(scene, camera, jobId, cameraId, previousFrameData) {
        const result = {
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
            result.opticalFlow = await this.calculateOpticalFlow(scene, camera, previousFrameData.scene, previousFrameData.camera);
        }
        return result;
    }
    /**
     * Register a segmentation label
     */
    registerLabel(id, name, color, category) {
        const labelId = this.segmentationLabels.size;
        this.segmentationLabels.set(id, { id: labelId, name, color, category });
    }
    /**
     * Get all registered labels
     */
    getLabels() {
        return Array.from(this.segmentationLabels.values());
    }
    /**
     * Encode depth to PNG-compatible format
     */
    encodeDepth(depth, near, far) {
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
    decodeDepth(encoded, near, far) {
        const decoded = new Float32Array(encoded.length);
        for (let i = 0; i < encoded.length; i++) {
            const normalized = encoded[i] / 65535;
            decoded[i] = near + normalized * (far - near);
        }
        return decoded;
    }
    async renderDepth(scene, camera) {
        const { width, height } = this.options.resolution;
        // Save original renderer state
        const originalScene = this.renderer.scene;
        const originalCamera = this.renderer.camera;
        // Setup depth rendering
        this.depthScene.clear();
        // Clone objects with depth material
        scene.traverse((object) => {
            if (object.isMesh) {
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
    async renderNormals(scene, camera) {
        const { width, height } = this.options.resolution;
        this.normalScene.clear();
        // Clone objects with normal material
        scene.traverse((object) => {
            if (object.isMesh) {
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
            normals[i * 3] = (pixels[i * 4] / 255) * 2 - 1; // X
            normals[i * 3 + 1] = (pixels[i * 4 + 1] / 255) * 2 - 1; // Y
            normals[i * 3 + 2] = (pixels[i * 4 + 2] / 255) * 2 - 1; // Z
        }
        this.normalScene.clear();
        return normals;
    }
    async renderAlbedo(scene, camera) {
        const { width, height } = this.options.resolution;
        // Save current materials
        const originalMaterials = new Map();
        // Replace materials with unlit versions
        scene.traverse((object) => {
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
        scene.traverse((object) => {
            if (originalMaterials.has(object.uuid)) {
                object.material = originalMaterials.get(object.uuid);
            }
        });
        return pixels;
    }
    async renderSegmentation(scene, camera) {
        const { width, height } = this.options.resolution;
        this.segmentationScene.clear();
        // Create segmentation colors for each object
        const objectIdMap = new Map();
        let objectIdCounter = 1;
        scene.traverse((object) => {
            if (object.isMesh) {
                // Get or create object ID
                if (!objectIdMap.has(object.uuid)) {
                    objectIdMap.set(object.uuid, objectIdCounter++);
                }
                const objectId = objectIdMap.get(object.uuid);
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
    /**
     * Render instance IDs with 16-bit precision using GPU acceleration
     */
    async renderInstanceIds(scene, camera) {
        const { width, height } = this.options.resolution;
        // Save original renderer state
        const autoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        // Clear instance ID scene
        this.instanceIdScene.clear();
        // Build object ID map
        const objectIdMap = new Map();
        let objectIdCounter = 1;
        // First pass: assign IDs to all meshes
        scene.traverse((object) => {
            if (object.isMesh && object.geometry) {
                if (!objectIdMap.has(object.uuid)) {
                    objectIdMap.set(object.uuid, objectIdCounter++);
                }
            }
        });
        // Second pass: clone meshes with instance ID material
        scene.traverse((object) => {
            if (object.isMesh && object.geometry) {
                const instanceId = objectIdMap.get(object.uuid);
                const mesh = object.clone();
                // Create unique material for each instance
                const material = this.instanceIdMaterial.clone();
                material.uniforms.instanceId.value = instanceId;
                mesh.material = material;
                this.instanceIdScene.add(mesh);
            }
        });
        // Render to target
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.instanceIdScene, camera);
        // Read pixels
        const pixels = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(null, 0, 0, width, height, pixels);
        // Decode 16-bit IDs from RGBA
        const instanceIds = new Uint16Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const r = pixels[i * 4];
            const g = pixels[i * 4 + 1];
            // Decode: id = r + g * 256
            instanceIds[i] = Math.floor(r + g * 256);
        }
        // Cleanup
        this.instanceIdScene.clear();
        this.renderer.autoClear = autoClear;
        return instanceIds;
    }
    /**
     * Calculate enhanced bounding boxes with occlusion detection and visibility estimation
     */
    calculateBoundingBoxes(scene, camera) {
        const boundingBoxes = [];
        const { width, height } = this.options.resolution;
        // Setup raycaster from camera center
        const rayOrigin = new Vector3();
        camera.getWorldPosition(rayOrigin);
        scene.traverse((object) => {
            if (object.isMesh && object.geometry) {
                // Calculate 3D bounding box in world space
                const bbox3D = new Box3().setFromObject(object);
                // Skip if bounding box is empty
                if (bbox3D.isEmpty())
                    return;
                // Get 8 corners of the 3D bounding box
                const corners = [
                    new Vector3(bbox3D.min.x, bbox3D.min.y, bbox3D.min.z),
                    new Vector3(bbox3D.max.x, bbox3D.min.y, bbox3D.min.z),
                    new Vector3(bbox3D.min.x, bbox3D.max.y, bbox3D.min.z),
                    new Vector3(bbox3D.max.x, bbox3D.max.y, bbox3D.min.z),
                    new Vector3(bbox3D.min.x, bbox3D.min.y, bbox3D.max.z),
                    new Vector3(bbox3D.max.x, bbox3D.min.y, bbox3D.max.z),
                    new Vector3(bbox3D.min.x, bbox3D.max.y, bbox3D.max.z),
                    new Vector3(bbox3D.max.x, bbox3D.max.y, bbox3D.max.z),
                ];
                // Project corners to screen space
                let minX = 1, minY = 1, maxX = 0, maxY = 0;
                let visibleCorners = 0;
                for (const corner of corners) {
                    const projected = corner.clone().project(camera);
                    // Check if point is within view frustum
                    if (projected.z >= -1 && projected.z <= 1) {
                        const x = (projected.x + 1) / 2;
                        const y = (1 - projected.y) / 2;
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                        visibleCorners++;
                    }
                }
                // Skip if no corners are visible
                if (visibleCorners === 0 || minX >= maxX || minY >= maxY)
                    return;
                // Calculate occlusion using raycasting
                const center = bbox3D.getCenter(new Vector3());
                const distance = rayOrigin.distanceTo(center);
                const rayDirection = center.clone().sub(rayOrigin).normalize();
                this.raycaster.set(rayOrigin, rayDirection);
                // Intersect with all objects in scene
                const intersects = this.raycaster.intersectObjects(scene.children, true);
                // Check if object is occluded
                let isOccluded = false;
                let occlusionFactor = 0;
                if (intersects.length > 0) {
                    const firstHit = intersects[0];
                    const hitDistance = rayOrigin.distanceTo(firstHit.point);
                    // If first hit is closer than our object center, it's occluded
                    if (hitDistance < distance - 0.01) {
                        isOccluded = true;
                        occlusionFactor = Math.min(1.0, (distance - hitDistance) / distance);
                    }
                }
                // Calculate visibility percentage based on projected area
                const projectedArea = (maxX - minX) * (maxY - minY);
                const expectedArea = this.calculateExpectedBoundingBoxArea(bbox3D, camera, width, height);
                const visibilityRatio = Math.min(1.0, projectedArea / Math.max(0.001, expectedArea));
                // Adjust confidence based on occlusion and visibility
                const confidence = isOccluded ? (1 - occlusionFactor) * 0.9 : Math.max(0.5, visibilityRatio);
                // Only add if reasonably visible
                if (confidence > 0.1) {
                    boundingBoxes.push({
                        objectId: object.uuid,
                        label: object.userData?.label ?? 'unknown',
                        bbox2D: {
                            x: Math.max(0, minX * width),
                            y: Math.max(0, minY * height),
                            width: Math.min(width - minX * width, (maxX - minX) * width),
                            height: Math.min(height - minY * height, (maxY - minY) * height),
                        },
                        bbox3D: {
                            center: bbox3D.getCenter(new Vector3()),
                            size: bbox3D.getSize(new Vector3()),
                            rotation: new Vector3(object.rotation.x, object.rotation.y, object.rotation.z),
                        },
                        confidence: parseFloat(confidence.toFixed(4)),
                        metadata: {
                            isOccluded,
                            occlusionFactor: parseFloat(occlusionFactor.toFixed(4)),
                            visibilityRatio: parseFloat(visibilityRatio.toFixed(4)),
                            distance: parseFloat(distance.toFixed(4)),
                        },
                    });
                }
            }
        });
        // Sort by confidence (highest first)
        boundingBoxes.sort((a, b) => b.confidence - a.confidence);
        return boundingBoxes;
    }
    /**
     * Calculate expected bounding box area for visibility estimation
     */
    calculateExpectedBoundingBoxArea(bbox, camera, width, height) {
        const size = bbox.getSize(new Vector3());
        const center = bbox.getCenter(new Vector3());
        const cameraPos = new Vector3();
        camera.getWorldPosition(cameraPos);
        const distance = cameraPos.distanceTo(center);
        const fov = camera.fov * (Math.PI / 180);
        // Approximate visible area based on distance and FOV
        const visibleHeight = 2 * distance * Math.tan(fov / 2);
        const visibleWidth = visibleHeight * (width / height);
        // Project object size to screen space
        const projectedWidth = (size.x / visibleWidth);
        const projectedHeight = (size.y / visibleHeight);
        return Math.max(0.0001, projectedWidth * projectedHeight);
    }
    /**
     * Calculate dense optical flow using position buffers
     */
    async calculateOpticalFlow(currentScene, currentCamera, previousScene, previousCamera) {
        const { width, height } = this.options.resolution;
        // Save renderer state
        const autoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;
        // Helper function to render position buffer
        const renderPositionBuffer = (scene, camera, target) => {
            this.flowScene.clear();
            scene.traverse((object) => {
                if (object.isMesh && object.geometry) {
                    const mesh = object.clone();
                    // Shader that outputs world position
                    const positionMaterial = new ShaderMaterial({
                        uniforms: {
                            modelMatrix: { value: object.matrixWorld },
                        },
                        vertexShader: `
              varying vec3 vWorldPosition;
              uniform mat4 modelMatrix;
              
              void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
              }
            `,
                        fragmentShader: `
              varying vec3 vWorldPosition;
              
              void main() {
                vec3 pos = vWorldPosition;
                gl_FragColor = vec4(pos * 0.01 + 0.5, 1.0);
              }
            `,
                    });
                    mesh.material = positionMaterial;
                    this.flowScene.add(mesh);
                }
            });
            // Render to target
            this.renderer.setRenderTarget(target);
            this.renderer.render(this.flowScene, camera);
            this.renderer.setRenderTarget(null);
            this.flowScene.clear();
        };
        // Render current frame positions
        renderPositionBuffer(currentScene, currentCamera, this.positionRenderTarget);
        // Store current as previous for next frame
        this.previousPositionRenderTarget.dispose();
        this.previousPositionRenderTarget = this.positionRenderTarget.clone();
        // Read both position buffers
        const currentPositions = new Float32Array(width * height * 4);
        const previousPositions = new Float32Array(width * height * 4);
        this.renderer.readRenderTargetPixels(this.positionRenderTarget, 0, 0, width, height, currentPositions);
        this.renderer.readRenderTargetPixels(this.previousPositionRenderTarget, 0, 0, width, height, previousPositions);
        // Calculate optical flow (pixel displacement)
        const flow = new Float32Array(width * height * 2);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x);
                const pixelIdx = idx * 4;
                const currX = currentPositions[pixelIdx];
                const currY = currentPositions[pixelIdx + 1];
                const prevX = previousPositions[pixelIdx];
                const prevY = previousPositions[pixelIdx + 1];
                // Flow vector (displacement in screen space)
                flow[idx * 2] = currX - prevX;
                flow[idx * 2 + 1] = currY - prevY;
            }
        }
        // Cleanup
        this.flowScene.clear();
        this.renderer.autoClear = autoClear;
        return flow;
    }
    createMetadata(jobId, cameraId, camera, scene) {
        let objectCount = 0;
        scene.traverse((object) => {
            if (object.isMesh)
                objectCount++;
        });
        const fov = camera.fov ?? 75;
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
    initializeDefaultLabels() {
        const defaultLabels = [
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
//# sourceMappingURL=GroundTruthGenerator.js.map