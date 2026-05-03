/**
 * ExportToolkit — BACKWARD-COMPATIBILITY SHIM
 *
 * All export functionality has been consolidated into SceneExporter.
 * This file re-exports the unified API for backward compatibility so
 * existing imports don't break.
 *
 * Migration guide:
 *   - Replace `new ExportToolkit(onProgress)` → `new SceneExporter()`
 *   - Replace `toolkit.exportScene(scene, { format, outputPath, ... })`
 *     → `exporter.exportScene(scene, { format, onProgress, ... })`
 *   - Note: `outputPath` is no longer used; the result contains `data` directly.
 *   - Note: The old `ExportResult` type is different from `SceneExportResult`;
 *     use `SceneExportResult` going forward.
 *
 * @see /src/tools/export/SceneExporter.ts for the canonical implementation
 */

// Re-export the unified SceneExporter and types
export {
  SceneExporter,
  exportSceneToBlob,
  getSupportedFormats,
  type ExportFormat,
  type ExportScope,
  type SceneExportOptions,
  type SceneExportResult,
} from './export/SceneExporter';

// Re-export additional types that were previously exported from this module
// for backward compatibility with code that imported them here.
export type {
  ExportFormat as ExportToolkitFormat,
  SceneExportOptions as ExportToolkitOptions,
  SceneExportResult as ExportToolkitResult,
} from './export/SceneExporter';

// ---------------------------------------------------------------------------
// Legacy types (kept for backward compat — code may reference these shapes)
// ---------------------------------------------------------------------------

/** @deprecated Use SceneExportOptions from SceneExporter instead */
export interface ExportOptions {
  format: 'gltf' | 'glb' | 'obj' | 'fbx' | 'usd' | 'ply' | 'stl' | 'json';
  outputPath: string;
  embedTextures?: boolean;
  exportAnimations?: boolean;
  exportMaterials?: boolean;
  triangulate?: boolean;
  selectedOnly?: boolean;
  selectedIds?: string[];
}

/** @deprecated Use SceneExportResult from SceneExporter instead */
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

/** @deprecated Use SceneExportOptions from SceneExporter instead */
export interface ExportTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  applyModifiers?: boolean;
}

/** @deprecated Not used in the consolidated export system */
export interface LODSettings {
  enabled: boolean;
  levels: number;
  distanceFactor: number;
}

/** @deprecated Not used in the consolidated export system */
export interface TextureExportSettings {
  format: 'png' | 'jpg' | 'webp' | 'basis';
  quality: number;
  maxSize: number;
  generateMipmaps: boolean;
}

// ---------------------------------------------------------------------------
// Legacy class (delegates to SceneExporter)
// ---------------------------------------------------------------------------

import { SceneExporter as UnifiedExporter } from './export/SceneExporter';
import type { SceneExportResult } from './export/SceneExporter';
import type { Scene } from 'three';

/**
 * @deprecated Use SceneExporter from './export/SceneExporter' instead.
 *
 * This class wraps the unified SceneExporter to provide the old
 * ExportToolkit API surface for backward compatibility.
 */
export class ExportToolkit {
  private exporter: UnifiedExporter;
  private onProgress?: (progress: number, message: string) => void;

  constructor(onProgress?: (progress: number, message: string) => void) {
    this.onProgress = onProgress;
    this.exporter = new UnifiedExporter();
  }

  /**
   * @deprecated Use SceneExporter.exportScene() instead.
   *
   * Adapts the old ExportToolkit.exportScene() call to the unified API.
   * Note: outputPath is ignored — the result contains data directly.
   */
  async exportScene(scene: Scene, options: ExportOptions): Promise<ExportResult> {
    const unifiedResult: SceneExportResult = await this.exporter.exportScene(scene, {
      format: options.format,
      selectedIds: options.selectedIds,
      embedTextures: options.embedTextures,
      includeAnimations: options.exportAnimations,
      onProgress: this.onProgress,
    });

    // Map unified result to legacy result shape
    const dataSize = unifiedResult.data instanceof ArrayBuffer
      ? unifiedResult.data.byteLength
      : unifiedResult.data?.length ?? 0;

    return {
      success: unifiedResult.success,
      outputPaths: [options.outputPath + '.' + options.format],
      fileSizes: { [options.format]: dataSize },
      duration: unifiedResult.stats.durationMs,
      objectCount: unifiedResult.stats.objectCount,
      materialCount: unifiedResult.stats.materialCount,
      textureCount: unifiedResult.stats.textureCount,
      warnings: unifiedResult.warnings,
      errors: unifiedResult.errors,
    };
  }

  getProgress(): number {
    // No longer tracked separately; always returns 1 for compat
    return 1;
  }
}

/** @deprecated Use `new SceneExporter()` instead */
export function createExportToolkit(onProgress?: (progress: number, message: string) => void): ExportToolkit {
  return new ExportToolkit(onProgress);
}

export default ExportToolkit;
