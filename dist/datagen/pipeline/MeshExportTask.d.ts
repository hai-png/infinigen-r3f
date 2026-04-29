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
import { Scene, Object3D, Mesh, BufferGeometry } from 'three';
import { TaskFunction, TaskResult, TaskMetadata } from './TaskRegistry';
/**
 * Supported export formats
 */
export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'fbx' | 'stl' | 'ply';
/**
 * Configuration for mesh export task
 */
export interface MeshExportConfig {
    /** Output folder path */
    outputFolder: string;
    /** Frame range [start, end] */
    frameRange?: [number, number];
    /** Current frame (for animation) */
    currentFrame?: number;
    /** Resample index */
    resampleIdx?: number | null;
    /** Export format */
    format?: ExportFormat;
    /** Whether to triangulate meshes */
    triangulate?: boolean;
    /** LOD level to export (-1 for all) */
    lodLevel?: number;
    /** Filename template */
    filenameTemplate?: string;
    /** Save polycount information */
    savePolycounts?: boolean;
    /** Only export visible objects */
    onlyVisible?: boolean;
    /** Export static objects only */
    staticOnly?: boolean;
    /** Point trajectory source frame */
    pointTrajectorySrcFrame?: number;
}
/**
 * Information about an exported mesh
 */
export interface MeshExportInfo {
    /** Object name */
    name: string;
    /** Exported file path */
    path: string;
    /** Vertex count */
    vertexCount: number;
    /** Face/triangle count */
    faceCount: number;
    /** LOD level */
    lodLevel: number;
    /** Is static object */
    isStatic: boolean;
}
/**
 * Check if an object is static (not animated or instanced)
 *
 * Port of is_static() from execute_tasks.py
 */
export declare function isStaticObject(obj: Object3D): boolean;
/**
 * Triangulate a geometry
 *
 * Port of triangulate_meshes() from export.py
 */
export declare function triangulateGeometry(geometry: BufferGeometry): BufferGeometry;
/**
 * Triangulate all meshes in scene
 */
export declare function triangulateScene(scene: Scene): number;
/**
 * Get mesh statistics
 */
export declare function getMeshStats(mesh: Mesh): {
    vertices: number;
    faces: number;
};
/**
 * Main mesh export task function
 */
export declare const saveMeshesTask: TaskFunction<MeshExportConfig>;
/**
 * Task metadata for registration
 */
export declare const saveMeshesTaskMetadata: TaskMetadata;
/**
 * Register the save meshes task with the global registry
 */
export declare function registerSaveMeshesTask(): void;
/**
 * Convenience function to execute save meshes task directly
 */
export declare function executeSaveMeshes(scene: Scene, config: MeshExportConfig): Promise<TaskResult>;
export type { ExportFormat };
//# sourceMappingURL=MeshExportTask.d.ts.map