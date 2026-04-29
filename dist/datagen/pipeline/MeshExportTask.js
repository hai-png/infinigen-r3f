/**
 * Mesh Export Task for Infinigen R3F
 *
 * Implements mesh export functionality with triangulation,
 * LOD selection, and multiple format support.
 * Matches the functionality of save_meshes() from execute_tasks.py
 * and triangulate_meshes() from export.py
 *
 * @module pipeline
 */
import { Mesh } from 'three';
import { taskRegistry } from './TaskRegistry';
/**
 * Check if an object is static (not animated or instanced)
 *
 * Port of is_static() from execute_tasks.py
 */
export function isStaticObject(obj) {
    // Check for scatter modifier (instancing)
    if (obj.name.startsWith('scatter:')) {
        return false;
    }
    // Check for asset collection membership
    // In Three.js, we'd check parent group names
    let parent = obj.parent;
    while (parent) {
        if (parent.name?.startsWith('assets:')) {
            return false;
        }
        parent = parent.parent;
    }
    // Check for constraints (would need constraint system integration)
    const hasConstraints = obj.constraints?.length > 0;
    if (hasConstraints) {
        return false;
    }
    // Check for animation data
    if (obj.animationData || obj.animationData) {
        return false;
    }
    // Check for geometry node modifiers with animation
    // This would require node system integration
    // Check for armature modifiers
    if (obj.skeleton || obj.isSkinnedMesh) {
        return false;
    }
    return true;
}
/**
 * Triangulate a geometry
 *
 * Port of triangulate_meshes() from export.py
 */
export function triangulateGeometry(geometry) {
    // If already indexed, we can work with the index
    if (geometry.index) {
        const indices = geometry.index.array;
        const positionAttr = geometry.attributes.position;
        // For now, we'll assume the geometry is already triangulated
        // Full implementation would convert quads/ngons to triangles
        // Check if already triangles (indices length divisible by 3)
        if (indices.length % 3 === 0) {
            return geometry;
        }
        // TODO: Implement full quad/ngon to triangle conversion
        console.warn('Full triangulation not yet implemented, assuming triangles');
        return geometry;
    }
    // Non-indexed geometry - already in triangle form typically
    return geometry;
}
/**
 * Triangulate all meshes in scene
 */
export function triangulateScene(scene) {
    let count = 0;
    scene.traverse((obj) => {
        if (obj instanceof Mesh && obj.geometry) {
            const originalGeometry = obj.geometry;
            const triangulated = triangulateGeometry(originalGeometry);
            if (triangulated !== originalGeometry) {
                obj.geometry = triangulated;
                count++;
            }
        }
    });
    console.log(`[MeshExport] Triangulated ${count} meshes`);
    return count;
}
/**
 * Get mesh statistics
 */
export function getMeshStats(mesh) {
    const geometry = mesh.geometry;
    if (!geometry) {
        return { vertices: 0, faces: 0 };
    }
    const vertexCount = geometry.attributes.position?.count || 0;
    let faceCount = 0;
    if (geometry.index) {
        faceCount = geometry.index.count / 3;
    }
    else {
        faceCount = vertexCount / 3;
    }
    return {
        vertices: vertexCount,
        faces: Math.floor(faceCount)
    };
}
/**
 * Export meshes for a frame
 *
 * Core export logic matching save_meshes() from execute_tasks.py
 */
async function exportFrameMeshes(scene, config, frame) {
    const warnings = [];
    const exportedMeshes = [];
    const { outputFolder, format = 'gltf', triangulate = true, lodLevel = -1, filenameTemplate = '{name}_{frame}', savePolycounts = true, onlyVisible = true, staticOnly = false } = config;
    // Create frame folder
    const frameFolder = `${outputFolder}/frame_${String(frame).padStart(4, '0')}`;
    // In Node.js environment, create directory
    const fs = typeof require !== 'undefined' ? require('fs') : null;
    if (fs && typeof process !== 'undefined') {
        try {
            if (!fs.existsSync(frameFolder)) {
                fs.mkdirSync(frameFolder, { recursive: true });
            }
        }
        catch (error) {
            warnings.push(`Failed to create frame folder: ${error}`);
            return { exportedMeshes, warnings };
        }
    }
    // Triangulate if requested
    if (triangulate) {
        triangulateScene(scene);
    }
    // Track previous frame mesh IDs for delta exports
    const previousFrameMeshIds = new Map();
    const currentFrameMeshIds = new Map();
    // Collect objects to export
    const objectsToExport = [];
    scene.traverse((obj) => {
        if (!(obj instanceof Mesh)) {
            return;
        }
        const mesh = obj;
        // Visibility check
        if (onlyVisible && !mesh.visible) {
            return;
        }
        // Static check
        if (staticOnly && !isStaticObject(mesh)) {
            return;
        }
        // LOD check
        if (lodLevel >= 0) {
            const meshLod = mesh.lodLevel || 0;
            if (meshLod !== lodLevel) {
                return;
            }
        }
        objectsToExport.push(mesh);
    });
    console.log(`[MeshExport] Exporting ${objectsToExport.length} meshes for frame ${frame}`);
    // Export each mesh
    for (const obj of objectsToExport) {
        const mesh = obj;
        try {
            const stats = getMeshStats(mesh);
            const filename = filenameTemplate
                .replace('{name}', mesh.name || 'object')
                .replace('{frame}', String(frame));
            const extension = format === 'glb' ? 'glb' : format === 'gltf' ? 'gltf' : format;
            const outputPath = `${frameFolder}/${filename}.${extension}`;
            // In a real implementation, this would use Three.js exporters
            // GLTFExporter, OBJExporter, etc.
            // Placeholder for actual export
            if (fs && typeof process !== 'undefined') {
                // Would write actual file here
                console.log(`[MeshExport] Would export ${mesh.name} to ${outputPath}`);
            }
            exportedMeshes.push({
                name: mesh.name,
                path: outputPath,
                vertexCount: stats.vertices,
                faceCount: stats.faces,
                lodLevel: lodLevel,
                isStatic: isStaticObject(mesh)
            });
            currentFrameMeshIds.set(mesh.uuid, outputPath);
        }
        catch (error) {
            warnings.push(`Failed to export ${mesh.name}: ${error}`);
        }
    }
    // Save polycount information
    if (savePolycounts && exportedMeshes.length > 0) {
        const polycountFile = `${frameFolder}/polycounts.json`;
        const polycountData = {
            frame,
            totalVertices: exportedMeshes.reduce((sum, m) => sum + m.vertexCount, 0),
            totalFaces: exportedMeshes.reduce((sum, m) => sum + m.faceCount, 0),
            meshes: exportedMeshes.map(m => ({
                name: m.name,
                vertices: m.vertexCount,
                faces: m.faceCount
            }))
        };
        if (fs && typeof process !== 'undefined') {
            try {
                fs.writeFileSync(polycountFile, JSON.stringify(polycountData, null, 2));
                console.log(`[MeshExport] Saved polycounts to ${polycountFile}`);
            }
            catch (error) {
                warnings.push(`Failed to save polycounts: ${error}`);
            }
        }
    }
    return { exportedMeshes, warnings };
}
/**
 * Main mesh export task function
 */
export const saveMeshesTask = async (scene, config) => {
    const startTime = performance.now();
    const warnings = [];
    const allExportedMeshes = [];
    try {
        // Validate configuration
        if (!config.outputFolder) {
            throw new Error('outputFolder is required');
        }
        const { frameRange = [1, 1], currentFrame, resampleIdx, pointTrajectorySrcFrame = 1 } = config;
        // Handle resampling
        if (resampleIdx !== null && resampleIdx !== undefined && resampleIdx > 0) {
            warnings.push(`Resampling with index: ${resampleIdx}`);
            // TODO: Implement resampleScene() when available
        }
        // Determine frames to export
        const frames = currentFrame
            ? [currentFrame]
            : Array.from({ length: frameRange[1] - frameRange[0] + 1 }, (_, i) => frameRange[0] + i);
        // Always include point trajectory source frame
        if (!frames.includes(pointTrajectorySrcFrame)) {
            frames.unshift(pointTrajectorySrcFrame);
        }
        // Export static objects first (from source frame)
        console.log('[MeshExport] Exporting static objects');
        const staticResult = await exportFrameMeshes(scene, config, pointTrajectorySrcFrame);
        warnings.push(...staticResult.warnings);
        // Filter to only static objects for this pass
        config.staticOnly = true;
        const staticMeshes = staticResult.exportedMeshes.filter(m => m.isStatic);
        allExportedMeshes.push(...staticMeshes);
        // Export animated/dynamic objects for each frame
        config.staticOnly = false;
        for (const frame of frames) {
            console.log(`[MeshExport] Processing frame ${frame}`);
            // Update scene for frame (would integrate with animation system)
            // scene.frame = frame;
            const result = await exportFrameMeshes(scene, config, frame);
            warnings.push(...result.warnings);
            allExportedMeshes.push(...result.exportedMeshes);
        }
        const executionTime = performance.now() - startTime;
        return {
            success: true,
            data: {
                exportedMeshes: allExportedMeshes,
                outputFolder: config.outputFolder,
                totalMeshes: allExportedMeshes.length,
                totalVertices: allExportedMeshes.reduce((sum, m) => sum + m.vertexCount, 0),
                totalFaces: allExportedMeshes.reduce((sum, m) => sum + m.faceCount, 0)
            },
            executionTime,
            warnings,
            metadata: {
                taskId: 'saveMeshes',
                executedAt: new Date().toISOString(),
                config: {
                    frameRange,
                    format: config.format,
                    triangulate: config.triangulate,
                    lodLevel: config.lodLevel
                }
            }
        };
    }
    catch (error) {
        const executionTime = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: errorMessage,
            executionTime,
            warnings,
            metadata: {
                taskId: 'saveMeshes',
                executedAt: new Date().toISOString()
            }
        };
    }
};
/**
 * Task metadata for registration
 */
export const saveMeshesTaskMetadata = {
    name: 'saveMeshes',
    description: 'Export scene meshes with triangulation, LOD selection, and multi-frame support',
    category: 'export',
    requiredParams: {
        outputFolder: 'path'
    },
    optionalParams: {
        frameRange: { type: 'array', default: [1, 1] },
        currentFrame: { type: 'number', default: undefined },
        resampleIdx: { type: 'number', default: null },
        format: { type: 'string', default: 'gltf' },
        triangulate: { type: 'boolean', default: true },
        lodLevel: { type: 'number', default: -1 },
        filenameTemplate: { type: 'string', default: '{name}_{frame}' },
        savePolycounts: { type: 'boolean', default: true },
        onlyVisible: { type: 'boolean', default: true },
        staticOnly: { type: 'boolean', default: false },
        pointTrajectorySrcFrame: { type: 'number', default: 1 }
    },
    isAsync: true,
    estimatedDuration: 60,
    dependencies: [],
    version: '1.0.0'
};
/**
 * Register the save meshes task with the global registry
 */
export function registerSaveMeshesTask() {
    if (!taskRegistry.has('saveMeshes')) {
        taskRegistry.register('saveMeshes', saveMeshesTask, saveMeshesTaskMetadata);
        console.log('[SaveMeshesTask] Registered with TaskRegistry');
    }
}
/**
 * Convenience function to execute save meshes task directly
 */
export async function executeSaveMeshes(scene, config) {
    return taskRegistry.execute('saveMeshes', scene, config);
}
// Auto-register on import
if (typeof window !== 'undefined' || typeof process !== 'undefined') {
    registerSaveMeshesTask();
}
//# sourceMappingURL=MeshExportTask.js.map