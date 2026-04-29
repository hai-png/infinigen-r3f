/**
 * SceneExporter - Multi-format 3D scene export for InfiniGen R3F
 *
 * Supports exporting generated scenes to various formats:
 * - glTF/GLB (Web-optimized with Draco compression)
 * - OBJ + MTL (Universal compatibility)
 * - STL (3D printing)
 * - PLY (Point cloud data)
 * - USD/USDZ (Apple AR and professional workflows)
 *
 * Features:
 * - LOD (Level of Detail) generation
 * - Texture packing and optimization
 * - Material conversion between renderers
 * - Metadata embedding (generation parameters, timestamps)
 * - Batch export with progress tracking
 *
 * @see https://github.com/princeton-vl/infinigen/blob/main/infinigen/core/utilities/io.py
 */
import * as THREE from 'three';
export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'stl' | 'ply' | 'usd' | 'usdz';
export interface ExportOptions {
    format: ExportFormat;
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    compress?: boolean;
    dracoCompression?: boolean;
    textureCompression?: 'basis' | 'ktx2' | 'none';
    generateLODs?: boolean;
    lodLevels?: number;
    lodDistances?: number[];
    embedTextures?: boolean;
    textureSize?: number;
    flipY?: boolean;
    mergeGeometries?: boolean;
    quantizePosition?: number;
    quantizeUV?: number;
    quantizeNormal?: number;
    quantizeColor?: number;
    includeMetadata?: boolean;
    metadata?: Record<string, any>;
    outputDirectory?: string;
    filename?: string;
    onProgress?: (progress: number, message: string) => void;
}
export interface ExportResult {
    success: boolean;
    format: ExportFormat;
    filename: string;
    path: string;
    size: number;
    vertexCount: number;
    triangleCount: number;
    textureCount: number;
    materialCount: number;
    duration: number;
    metadata?: Record<string, any>;
    error?: string;
}
export interface LODConfig {
    level: number;
    distance: number;
    reduction: number;
}
export interface TexturePackResult {
    albedo: string;
    normal?: string;
    roughness?: string;
    metalness?: string;
    ao?: string;
    emission?: string;
    opacity?: string;
}
export declare class SceneExporter {
    private exporter;
    private dracoEncoder;
    private scene;
    private options;
    constructor(scene: THREE.Scene);
    /**
     * Configure export options
     */
    setOptions(options: Partial<ExportOptions>): void;
    /**
     * Initialize Draco encoder for compression
     */
    initializeDraco(dracoPath?: string): Promise<void>;
    /**
     * Export scene to specified format
     */
    export(options?: Partial<ExportOptions>): Promise<ExportResult>;
    /**
     * Export to glTF/GLB format
     */
    private exportGLTF;
    /**
     * Export to OBJ format with MTL material file
     */
    private exportOBJ;
    /**
     * Generate MTL material definition
     */
    private exportMTLMaterial;
    /**
     * Export to STL format (for 3D printing)
     */
    private exportSTL;
    /**
     * Export to PLY format (point cloud)
     */
    private exportPLY;
    /**
     * Export to USD/USDZ format
     * Note: Full USD export requires Pixar's USD library
     * This is a placeholder that exports to glTF as intermediate format
     */
    private exportUSD;
    /**
     * Collect scene statistics
     */
    private collectSceneStatistics;
    /**
     * Generate Level of Detail (LOD) versions
     */
    generateLODs(object: THREE.Object3D, config: LODConfig[]): Promise<THREE.LOD>;
    /**
     * Reduce geometry detail for LOD generation
     */
    private reduceGeometryDetail;
    /**
     * Pack textures into atlas for optimization
     */
    packTextures(materials: THREE.Material[], atlasSize?: number): Promise<TexturePackResult>;
    /**
     * Download exported file (browser)
     */
    download(result: ExportResult, customFilename?: string): void;
}
export default SceneExporter;
//# sourceMappingURL=SceneExporter.d.ts.map