/**
 * Export Toolkit for Scene and Asset Export
 *
 * Provides comprehensive export functionality for various 3D formats.
 * Based on Infinigen's export.py (44KB) implementation.
 */
import { Scene } from 'three';
export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'fbx' | 'usd' | 'ply' | 'stl' | 'json';
export interface ExportOptions {
    format: ExportFormat;
    outputPath: string;
    embedTextures?: boolean;
    exportAnimations?: boolean;
    exportMaterials?: boolean;
    triangulate?: boolean;
    selectedOnly?: boolean;
    selectedIds?: string[];
}
export interface ExportResult {
    success: boolean;
    outputPaths: string[];
    fileSizes: Record<string, number>;
    duration: number;
    objectCount: number;
    materialCount: number;
    textureCount: number;
    warnings: string[];
    errors: string[];
}
export declare class ExportToolkit {
    private progress;
    private onProgress?;
    constructor(onProgress?: (progress: number, message: string) => void);
    exportScene(scene: Scene, options: ExportOptions): Promise<ExportResult>;
    private exportOBJ;
    private exportPLY;
    private exportSTL;
    private exportThreeJSON;
    private getObjectsToExport;
    private countObjects;
    private countMaterials;
    private countTextures;
    private reportProgress;
    getProgress(): number;
}
export declare function createExportToolkit(onProgress?: (progress: number, message: string) => void): ExportToolkit;
export default ExportToolkit;
//# sourceMappingURL=ExportToolkit.d.ts.map