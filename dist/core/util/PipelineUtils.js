/**
 * PipelineUtils.ts
 *
 * Scene organization, pipeline management, and export utilities.
 * Ported from Infinigen's organization.py, pipeline.py, paths.py, and exporting.py.
 */
import * as THREE from 'three';
import { SeededRandom } from './MathUtils';
/**
 * Organizes scene objects into a hierarchical structure based on semantic tags.
 */
export function organizeSceneByTags(scene) {
    const root = {
        name: 'root',
        children: [],
        metadata: {}
    };
    // Group objects by their primary tag
    const groups = new Map();
    scene.traverse((obj) => {
        if (obj.userData?.tags) {
            const tags = obj.userData.tags;
            const primaryTag = tags[0] || 'untagged';
            if (!groups.has(primaryTag)) {
                groups.set(primaryTag, []);
            }
            groups.get(primaryTag).push(obj);
        }
        else if (obj.type === 'Mesh' && obj !== scene) {
            // Untagged meshes go to 'geometry' group
            if (!groups.has('geometry')) {
                groups.set('geometry', []);
            }
            groups.get('geometry').push(obj);
        }
    });
    // Create hierarchy nodes
    for (const [tagName, objects] of groups.entries()) {
        const node = {
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
function computeGroupBoundingBox(objects) {
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
    constructor() {
        this.layers = new Map();
        this.objectToLayers = new Map();
    }
    /**
     * Adds an object to a layer.
     */
    addToLayer(object, layerName) {
        if (!this.layers.has(layerName)) {
            this.layers.set(layerName, new Set());
        }
        this.layers.get(layerName).add(object);
        if (!this.objectToLayers.has(object)) {
            this.objectToLayers.set(object, new Set());
        }
        this.objectToLayers.get(object).add(layerName);
    }
    /**
     * Removes an object from a layer.
     */
    removeFromLayer(object, layerName) {
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
    getLayer(layerName) {
        const layer = this.layers.get(layerName);
        return layer ? Array.from(layer) : [];
    }
    /**
     * Gets all layers an object belongs to.
     */
    getObjectLayers(object) {
        const layers = this.objectToLayers.get(object);
        return layers ? Array.from(layers) : [];
    }
    /**
     * Shows/hides a layer.
     */
    setLayerVisibility(layerName, visible) {
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
    clear() {
        this.layers.clear();
        this.objectToLayers.clear();
    }
}
/**
 * Manages the scene generation pipeline.
 */
export class ScenePipeline {
    constructor(config = {}) {
        this.currentStage = null;
        this.stageProgress = new Map();
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
    getDefaultStages() {
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
    async execute(scene) {
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
            }
            catch (error) {
                console.error(`Stage ${stageConfig.name} failed:`, error);
                throw error;
            }
        }
        this.currentStage = null;
        console.log('Pipeline completed successfully');
    }
    async executeStage(stage, scene, params) {
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
    async setupStage(scene, params) {
        // Setup environment, lighting, camera
        console.log('Setup stage complete');
    }
    async generationStage(scene, params) {
        // Generate assets, terrain, structures
        console.log('Generation stage complete');
    }
    async placementStage(scene, params) {
        // Place objects according to constraints
        console.log('Placement stage complete');
    }
    async physicsStage(scene, params) {
        // Setup physics simulation
        console.log('Physics stage complete');
    }
    async renderingStage(scene, params) {
        // Configure rendering settings
        console.log('Rendering stage complete');
    }
    async exportStage(scene, params) {
        // Export scene to file
        console.log('Export stage complete');
    }
    /**
     * Gets progress for a stage (0-100).
     */
    getStageProgress(stage) {
        return this.stageProgress.get(stage) ?? 0;
    }
    /**
     * Gets overall pipeline progress (0-100).
     */
    getOverallProgress() {
        const total = this.config.stages.filter(s => s.enabled).length;
        if (total === 0)
            return 100;
        const sum = this.config.stages
            .filter(s => s.enabled)
            .reduce((acc, s) => acc + (this.stageProgress.get(s.name) ?? 0), 0);
        return sum / total;
    }
    /**
     * Gets the current stage being executed.
     */
    getCurrentStage() {
        return this.currentStage;
    }
}
// ============================================================================
// Path Utilities
// ============================================================================
/**
 * Generates a unique path name for scene objects.
 */
export function generateUniquePath(baseName, existing) {
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
export function joinPath(...segments) {
    return segments
        .filter(s => s.length > 0)
        .join('/')
        .replace(/\/+/g, '/');
}
/**
 * Extracts the directory portion of a path.
 */
export function getDirectory(path) {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
}
/**
 * Extracts the filename portion of a path.
 */
export function getFilename(path) {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}
/**
 * Gets the file extension.
 */
export function getExtension(path) {
    const lastDot = path.lastIndexOf('.');
    return lastDot >= 0 ? path.substring(lastDot + 1) : '';
}
/**
 * Changes the file extension.
 */
export function changeExtension(path, newExt) {
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
export async function exportSceneToGLTF(scene, name = 'scene') {
    // This is a simplified representation
    // In production, use three/examples/jsm/exporters/GLTFExporter
    const exporter = new (await import('three/examples/jsm/exporters/GLTFExporter.js')).GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(scene, (result) => {
            if (result instanceof ArrayBuffer) {
                resolve({ json: {}, buffers: [result] });
            }
            else {
                resolve({ json: result, buffers: [] });
            }
        }, (error) => reject(error), { binary: true });
    });
}
/**
 * Exports a scene to OBJ format.
 */
export async function exportSceneToOBJ(scene) {
    const exporter = new (await import('three/examples/jsm/exporters/OBJExporter.js')).OBJExporter();
    return exporter.parse(scene);
}
/**
 * Batch exports multiple scenes.
 */
export async function batchExportScenes(scenes, format = 'gltf') {
    const results = new Map();
    for (const { name, scene } of scenes) {
        try {
            let content;
            if (format === 'gltf') {
                const exported = await exportSceneToGLTF(scene, name);
                content = exported.json;
            }
            else if (format === 'obj') {
                content = await exportSceneToOBJ(scene);
            }
            const blob = new Blob([typeof content === 'string' ? content : JSON.stringify(content)], {
                type: format === 'gltf' ? 'model/gltf+json' : 'text/plain'
            });
            results.set(name, blob);
        }
        catch (error) {
            console.error(`Failed to export scene ${name}:`, error);
        }
    }
    return results;
}
/**
 * Compresses a GLTF file using Draco compression.
 * Note: Requires draco_encoder in production.
 */
export async function compressGLTF(gltfData) {
    // Placeholder - would use draco3d or gltf-pipeline in production
    console.warn('GLTF compression not implemented in browser environment');
    return gltfData;
}
/**
 * Simulates IMU sensor data for a moving object.
 */
export class IMUSimulator {
    constructor(seed) {
        this.gravity = new THREE.Vector3(0, -9.81, 0);
        this.noiseStdDev = 0.1;
        this.rng = new SeededRandom(seed ?? Date.now());
    }
    /**
     * Generates simulated IMU readings for a given pose and velocity.
     */
    simulate(position, velocity, acceleration, orientation, angularVelocity) {
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
    setNoiseLevel(stdDev) {
        this.noiseStdDev = stdDev;
    }
}
//# sourceMappingURL=PipelineUtils.js.map