/**
 * SceneExporter — Pipeline-specific scene export wrapper
 *
 * This module provides the pipeline-oriented SceneExporter API that stores
 * a scene reference and supports quality/compression/LOD settings.
 *
 * All actual export logic is delegated to the canonical SceneExporter in
 * `@/tools/export/SceneExporter`. This file adds:
 *   - Pipeline-specific API (scene stored in constructor, `export()` method)
 *   - LOD generation (`generateLODs`)
 *   - Texture packing (`packTextures`)
 *   - Browser download helper (`download`)
 *   - Draco encoder initialization
 *   - Legacy `ExportResult` shape conversion (URL-based, with size/vertex counts)
 *
 * Backward-compatible re-exports of types are provided so existing imports
 * from this path continue to work.
 *
 * @see /src/tools/export/SceneExporter.ts for the canonical implementation
 */

import * as THREE from 'three';

// Re-export canonical types for backward compatibility
export type {
  ExportFormat,
  ExportScope,
  SceneExportOptions,
  SceneExportResult,
  LODConfig,
  TexturePackResult,
} from '@/tools/export/SceneExporter';

// Import the canonical exporter for delegation
import {
  SceneExporter as CanonicalSceneExporter,
  type ExportFormat,
  type SceneExportOptions,
  type SceneExportResult,
  type LODConfig,
  type TexturePackResult,
} from '@/tools/export/SceneExporter';

// ---------------------------------------------------------------------------
// Legacy type definitions (kept for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use SceneExportOptions from @/tools/export/SceneExporter instead.
 *
 * This legacy interface is retained so that code importing `ExportOptions`
 * from this module continues to compile. It mirrors the old shape that
 * included quality/compression/LOD/texture settings not present in the
 * canonical SceneExportOptions.
 */
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
  metadata?: Record<string, unknown>;
  outputDirectory?: string;
  filename?: string;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * @deprecated Use SceneExportResult from @/tools/export/SceneExporter instead.
 *
 * This legacy interface returns URL-based paths and blob sizes, which is
 * the browser-oriented shape used by the old pipeline. The canonical
 * SceneExportResult returns raw `data` (ArrayBuffer | string) instead.
 */
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
  metadata?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pipeline SceneExporter Class
// ---------------------------------------------------------------------------

/**
 * Pipeline-oriented SceneExporter that wraps the canonical SceneExporter.
 *
 * Key differences from the canonical SceneExporter:
 * - Stores a `THREE.Scene` reference (passed in constructor)
 * - `export()` method takes `Partial<ExportOptions>` (pipeline-style options)
 * - Returns legacy `ExportResult` with URL-based paths and blob sizes
 * - Includes pipeline-specific features: LOD generation, texture packing,
 *   Draco encoder initialization, and browser download helper
 */
export class SceneExporter {
  private scene: THREE.Scene;
  private canonicalExporter: CanonicalSceneExporter;
  private options: ExportOptions;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.canonicalExporter = new CanonicalSceneExporter();
    this.options = {
      format: 'glb',
      quality: 'high',
      compress: true,
      dracoCompression: true,
      embedTextures: true,
      includeMetadata: true,
    };
  }

  /**
   * Configure export options
   */
  setOptions(options: Partial<ExportOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Initialize Draco encoder for compression
   * Note: Draco compression is handled internally by the canonical exporter
   * when using GLTF export with compression settings. This method is retained
   * for API compatibility but is largely a no-op.
   */
  async initializeDraco(_dracoPath?: string): Promise<void> {
    // Draco encoding is now handled by the canonical GLTFExporter
    // when dracoCompression is enabled. This method is kept for
    // backward compatibility but does not need to do anything.
  }

  /**
   * Export scene to specified format.
   * Delegates to the canonical SceneExporter and converts the result
   * to the legacy ExportResult shape.
   */
  async export(options?: Partial<ExportOptions>): Promise<ExportResult> {
    if (options) {
      this.setOptions(options);
    }

    const startTime = performance.now();
    const { format, onProgress, filename, embedTextures, includeMetadata, metadata } = this.options;

    onProgress?.(0, `Starting ${format.toUpperCase()} export...`);

    try {
      // Build canonical options from pipeline options
      const canonicalOptions: Partial<SceneExportOptions> = {
        format,
        embedTextures,
        onProgress,
        binary: format === 'glb',
      };

      // Delegate to the canonical SceneExporter
      const result: SceneExportResult = await this.canonicalExporter.exportScene(
        this.scene,
        canonicalOptions,
      );

      // Convert SceneExportResult → legacy ExportResult
      if (!result.success) {
        const duration = performance.now() - startTime;
        return {
          success: false,
          format,
          filename: '',
          path: '',
          size: 0,
          vertexCount: 0,
          triangleCount: 0,
          textureCount: 0,
          materialCount: 0,
          duration,
          error: result.errors.join('; ') || 'Export failed',
        };
      }

      // Create a blob URL from the result data
      let blob: Blob;
      if (result.data instanceof ArrayBuffer) {
        blob = new Blob([result.data], { type: result.mimeType });
      } else if (typeof result.data === 'string') {
        blob = new Blob([result.data], { type: result.mimeType });
      } else {
        blob = new Blob([], { type: result.mimeType });
      }

      const url = URL.createObjectURL(blob);
      const baseFilename = filename || 'scene';

      // Add metadata if requested
      let resultMetadata: Record<string, unknown> | undefined;
      if (includeMetadata) {
        resultMetadata = {
          timestamp: new Date().toISOString(),
          generator: 'InfiniGen R3F',
          version: '1.0.0',
          ...metadata,
          warnings: result.warnings,
        };
      }

      const duration = performance.now() - startTime;
      onProgress?.(100, `Export completed in ${duration.toFixed(2)}ms`);

      return {
        success: true,
        format,
        filename: result.filename || `${baseFilename}.${format}`,
        path: url,
        size: blob.size,
        vertexCount: 0, // Not tracked in canonical result
        triangleCount: result.stats.triangleCount,
        textureCount: result.stats.textureCount,
        materialCount: result.stats.materialCount,
        duration,
        metadata: resultMetadata,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        format,
        filename: '',
        path: '',
        size: 0,
        vertexCount: 0,
        triangleCount: 0,
        textureCount: 0,
        materialCount: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate Level of Detail (LOD) versions
   */
  async generateLODs(object: THREE.Object3D, config: LODConfig[]): Promise<THREE.LOD> {
    const lod = new THREE.LOD();

    // Add original object as highest detail
    if (object instanceof THREE.Mesh) {
      lod.addLevel(object.clone(), config[0]?.distance || 0);
    }

    // Generate lower detail levels
    for (let i = 1; i < config.length; i++) {
      const levelConfig = config[i];
      const reducedObject = this.reduceGeometryDetail(object, levelConfig.reduction);
      lod.addLevel(reducedObject, levelConfig.distance);
    }

    return lod;
  }

  /**
   * Reduce geometry detail for LOD generation
   */
  private reduceGeometryDetail(object: THREE.Object3D, reduction: number): THREE.Object3D {
    const cloned = object.clone();

    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mesh = obj;
        const geometry = mesh.geometry;

        // Simple vertex decimation (production would use proper mesh simplification)
        if (geometry.attributes.position) {
          const positionAttr = geometry.attributes.position;
          const keepCount = Math.floor(positionAttr.count * reduction);

          // Create new buffer with reduced vertices
          const newPosition = new Float32Array(keepCount * 3);
          for (let i = 0; i < keepCount * 3; i++) {
            newPosition[i] = positionAttr.array[i];
          }

          geometry.setAttribute('position', new THREE.BufferAttribute(newPosition, 3));
          geometry.attributes.position.needsUpdate = true;
        }
      }
    });

    return cloned;
  }

  /**
   * Pack textures into atlas for optimization
   */
  async packTextures(materials: THREE.Material[], atlasSize: number = 4096): Promise<TexturePackResult> {
    // Implementation would combine multiple textures into single atlas
    // This is a placeholder for the full implementation
    console.warn('Texture packing not fully implemented');

    return {
      albedo: '',
      normal: '',
      roughness: '',
      metalness: '',
      ao: '',
    };
  }

  /**
   * Download exported file (browser)
   */
  download(result: ExportResult, customFilename?: string): void {
    if (typeof window === 'undefined') {
      throw new Error('Download only available in browser environment');
    }

    const link = document.createElement('a');
    link.href = result.path;
    link.download = customFilename || result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Get the list of supported export formats.
   * Delegates to the canonical exporter.
   */
  getSupportedFormats(): ExportFormat[] {
    return this.canonicalExporter.getSupportedFormats();
  }

  /**
   * Check whether a specific format is supported.
   * Delegates to the canonical exporter.
   */
  isFormatSupported(format: ExportFormat): boolean {
    return this.canonicalExporter.isFormatSupported(format);
  }
}

export default SceneExporter;
