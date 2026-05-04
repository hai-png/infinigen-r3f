/**
 * SceneExporter — Unified multi-format scene export pipeline
 *
 * Consolidates the previous SceneExporter (GLB/GLTF/OBJ/USD) and
 * ExportToolkit (OBJ/PLY/STL/JSON) into a single entry point.
 *
 * Supported formats (actually work):
 *   - GLB / GLTF  — via THREE.GLTFExporter (embedded textures, mesh simplification)
 *   - OBJ         — with vertex colors, UVs, normals, and MTL references
 *   - PLY         — ASCII point-cloud export with vertex positions
 *   - STL         — ASCII stereo-lithography export (triangles only)
 *   - JSON        — Three.js scene.toJSON() serialization
 *
 * Bridge-only formats (require Python backend — clear error if unavailable):
 *   - FBX         — requires Python bridge
 *   - USD         — requires Python bridge (GLB fallback if bridge connected)
 */

import * as THREE from 'three';
import { HybridBridge } from '@/integration/bridge/hybrid-bridge';
import type { MeshSimplifier } from './MeshSimplifier';
import { ExportLODConfig } from '@/assets/core/LODSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'ply' | 'stl' | 'json' | 'fbx' | 'usd' | 'usdz';

export type ExportScope = 'full' | 'selected' | 'terrain';

export interface SceneExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  /** Selected object IDs when scope is 'selected' */
  selectedIds?: string[];
  /** Binary mode for GLTF (produces .glb) */
  binary?: boolean;
  /** Include animations in export */
  includeAnimations?: boolean;
  /** Include lights in export */
  includeLights?: boolean;
  /** Include cameras in export */
  includeCameras?: boolean;
  /** Simplify meshes before export (0 = off, 0.5 = 50% reduction) */
  simplifyRatio?: number;
  /** Maximum texture dimension */
  maxTextureSize?: number;
  /** Embed textures in GLTF */
  embedTextures?: boolean;
  /** Progress callback */
  onProgress?: (progress: number, message: string) => void;
}

export interface SceneExportResult {
  success: boolean;
  data: ArrayBuffer | string | null;
  filename: string;
  mimeType: string;
  warnings: string[];
  errors: string[];
  stats: {
    objectCount: number;
    materialCount: number;
    textureCount: number;
    triangleCount: number;
    durationMs: number;
  };
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases & pipeline-specific types
// ---------------------------------------------------------------------------

/**
 * @deprecated Use SceneExportOptions instead.
 * Alias kept for backward compatibility with datagen/pipeline/SceneExporter.
 */
export type ExportOptions = SceneExportOptions;

/**
 * @deprecated Use SceneExportResult instead.
 * Alias kept for backward compatibility with datagen/pipeline/SceneExporter.
 */
export type ExportResult = SceneExportResult;

/**
 * LOD level configuration for pipeline-specific LOD generation.
 *
 * @deprecated Use `ExportLODConfig` from `@/assets/core/LODSystem` instead.
 * Kept as a type alias for backward compatibility.
 */
export type LODConfig = ExportLODConfig;

/**
 * Result of texture atlas packing.
 */
export interface TexturePackResult {
  albedo: string;
  normal?: string;
  roughness?: string;
  metalness?: string;
  ao?: string;
  emission?: string;
  opacity?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Formats that produce real output entirely within JavaScript */
const NATIVE_FORMATS: readonly ExportFormat[] = ['glb', 'gltf', 'obj', 'ply', 'stl', 'json'];

/** USDZ is treated as a variant of USD — same bridge requirement */
const USD_FAMILY: readonly ExportFormat[] = ['usd', 'usdz'];

/** Formats that need an external Python bridge and cannot work standalone */
const BRIDGE_FORMATS: readonly ExportFormat[] = ['fbx', 'usd', 'usdz'];

// ---------------------------------------------------------------------------
// SceneExporter class
// ---------------------------------------------------------------------------

export class SceneExporter {
  private bridge: HybridBridge;
  private simplifier: MeshSimplifier | null = null;

  constructor(simplifier?: MeshSimplifier) {
    this.bridge = HybridBridge.getInstance();
    this.simplifier = simplifier ?? null;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Return the list of export formats that actually produce output.
   * Bridge-only formats (FBX, USD) are NOT included unless the Python
   * bridge is connected.
   */
  getSupportedFormats(): ExportFormat[] {
    const formats = [...NATIVE_FORMATS];
    if (HybridBridge.isConnected()) {
      formats.push(...BRIDGE_FORMATS);
    }
    return formats;
  }

  /**
   * Check whether a specific format is supported.
   */
  isFormatSupported(format: ExportFormat): boolean {
    if (NATIVE_FORMATS.includes(format)) return true;
    if (BRIDGE_FORMATS.includes(format)) return HybridBridge.isConnected();
    // USDZ is in the USD family — same bridge requirement
    if (USD_FAMILY.includes(format)) return HybridBridge.isConnected();
    return false;
  }

  /**
   * Export a Three.js scene in the requested format
   */
  async exportScene(
    scene: THREE.Scene,
    options: Partial<SceneExportOptions> = {},
  ): Promise<SceneExportResult> {
    const opts: SceneExportOptions = {
      format: 'glb',
      scope: 'full',
      binary: true,
      includeAnimations: true,
      includeLights: true,
      includeCameras: true,
      simplifyRatio: 0,
      maxTextureSize: 2048,
      embedTextures: true,
      ...options,
    };

    const startTime = performance.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Step 0: Check format support
      if (!this.isFormatSupported(opts.format)) {
        if (opts.format === 'fbx') {
          return this.makeErrorResult(
            'FBX export requires Python bridge — connect the Python backend or use GLB/OBJ instead.',
            startTime, warnings, errors,
          );
        }
        if (opts.format === 'usd') {
          return this.makeErrorResult(
            'USD export requires Python bridge — connect the Python backend or use GLB/OBJ instead.',
            startTime, warnings, errors,
          );
        }
        return this.makeErrorResult(
          `Unsupported format: ${opts.format}`,
          startTime, warnings, errors,
        );
      }

      // Step 1: Extract objects based on scope
      this.reportProgress(opts, 0.1, 'Preparing scene for export...');
      const exportScene = this.prepareExportScene(scene, opts, warnings);

      // Step 2: Optionally simplify meshes
      if (opts.simplifyRatio > 0 && this.simplifier) {
        this.simplifyScene(exportScene, opts.simplifyRatio);
      }

      // Step 3: Count stats
      const stats = this.gatherStats(exportScene, startTime);

      // Step 4: Export in requested format
      this.reportProgress(opts, 0.2, `Exporting to ${opts.format.toUpperCase()}...`);
      let result: SceneExportResult;

      switch (opts.format) {
        case 'glb':
        case 'gltf':
          result = await this.exportGLTF(exportScene, opts, stats, warnings, errors);
          break;
        case 'obj':
          result = this.exportOBJ(exportScene, opts, stats, warnings, errors);
          break;
        case 'ply':
          result = this.exportPLY(exportScene, opts, stats, warnings, errors);
          break;
        case 'stl':
          result = this.exportSTL(exportScene, opts, stats, warnings, errors);
          break;
        case 'json':
          result = this.exportThreeJSON(exportScene, opts, stats, warnings, errors);
          break;
        case 'fbx':
          // Should have been caught above, but just in case bridge connected
          return this.makeErrorResult(
            'FBX export requires Python bridge',
            startTime, warnings, errors,
          );
        case 'usd':
        case 'usdz':
          result = await this.exportUSD(exportScene, opts, stats, warnings, errors);
          break;
        default:
          return this.makeErrorResult(
            `Unsupported format: ${opts.format}`,
            startTime, warnings, errors,
          );
      }

      this.reportProgress(opts, 1.0, 'Export completed');
      return result;
    } catch (err) {
      return this.makeErrorResult(
        err instanceof Error ? err.message : String(err),
        startTime, warnings, errors,
      );
    }
  }

  // -----------------------------------------------------------------------
  // GLB / GLTF Export
  // -----------------------------------------------------------------------

  private async exportGLTF(
    scene: THREE.Scene,
    opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): Promise<SceneExportResult> {
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter');
      const exporter = new GLTFExporter();

      const exportOptions = {
        binary: opts.binary,
        embedImages: opts.embedTextures,
        maxTextureSize: opts.maxTextureSize,
        animations: opts.includeAnimations ? [] : undefined,
        includeCustomExtensions: false,
        trs: false,
        onlyVisible: true,
        forcePowerOfTwoTextures: false,
      };

      const result = await exporter.parseAsync(scene, exportOptions);

      let data: ArrayBuffer | string;
      let filename: string;
      let mimeType: string;

      if (opts.binary && result instanceof ArrayBuffer) {
        data = result;
        filename = 'scene.glb';
        mimeType = 'model/gltf-binary';
      } else {
        data = JSON.stringify(result, null, 2);
        filename = 'scene.gltf';
        mimeType = 'model/gltf+json';
      }

      return {
        success: true,
        data,
        filename,
        mimeType,
        warnings,
        errors,
        stats: { ...stats, durationMs: performance.now() - stats.durationMs + stats.durationMs },
      };
    } catch (err) {
      errors.push(`GLTF export failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, data: null, filename: '', mimeType: '', warnings, errors, stats };
    }
  }

  // -----------------------------------------------------------------------
  // OBJ Export
  // -----------------------------------------------------------------------

  private exportOBJ(
    scene: THREE.Scene,
    opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): SceneExportResult {
    try {
      const objLines: string[] = [];
      const mtlLines: string[] = [];
      let vertexOffset = 1;
      let normalOffset = 1;
      let uvOffset = 1;
      let materialIndex = 0;
      const materialMap = new Map<string, number>();

      objLines.push('# OBJ exported by Infinigen-R3F');
      objLines.push(`mtllib scene.mtl`);
      objLines.push('');

      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const mesh = child as THREE.Mesh;
        const geo = mesh.geometry;
        const mat = mesh.material;

        objLines.push(`o ${mesh.name || `Object_${vertexOffset}`}`);

        // Material reference
        const matName = this.getMaterialName(mat, materialIndex);
        if (!materialMap.has(matName)) {
          materialMap.set(matName, materialIndex);
          this.writeMTLMaterial(mtlLines, matName, mat);
          materialIndex++;
        }
        objLines.push(`usemtl ${matName}`);

        // Vertices
        const positions = geo.attributes.position;
        if (positions) {
          for (let i = 0; i < positions.count; i++) {
            objLines.push(
              `v ${positions.getX(i).toFixed(6)} ${positions.getY(i).toFixed(6)} ${positions.getZ(i).toFixed(6)}`
            );
          }
        }

        // Vertex colors
        const colors = geo.attributes.color;
        if (colors) {
          for (let i = 0; i < colors.count; i++) {
            objLines.push(
              `vc ${colors.getX(i).toFixed(4)} ${colors.getY(i).toFixed(4)} ${colors.getZ(i).toFixed(4)}`
            );
          }
        }

        // Normals
        const normals = geo.attributes.normal;
        if (normals) {
          for (let i = 0; i < normals.count; i++) {
            objLines.push(
              `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}`
            );
          }
        }

        // UVs
        const uvs = geo.attributes.uv;
        if (uvs) {
          for (let i = 0; i < uvs.count; i++) {
            objLines.push(`vt ${uvs.getX(i).toFixed(6)} ${uvs.getY(i).toFixed(6)}`);
          }
        }

        // Faces
        const indices = geo.index;
        if (indices) {
          for (let i = 0; i < indices.count; i += 3) {
            const i0 = vertexOffset + indices.getX(i);
            const i1 = vertexOffset + indices.getX(i + 1);
            const i2 = vertexOffset + indices.getX(i + 2);

            if (normals && uvs) {
              const n0 = normalOffset + indices.getX(i);
              const n1 = normalOffset + indices.getX(i + 1);
              const n2 = normalOffset + indices.getX(i + 2);
              const u0 = uvOffset + indices.getX(i);
              const u1 = uvOffset + indices.getX(i + 1);
              const u2 = uvOffset + indices.getX(i + 2);
              objLines.push(`f ${i0}/${u0}/${n0} ${i1}/${u1}/${n1} ${i2}/${u2}/${n2}`);
            } else if (normals) {
              const n0 = normalOffset + indices.getX(i);
              const n1 = normalOffset + indices.getX(i + 1);
              const n2 = normalOffset + indices.getX(i + 2);
              objLines.push(`f ${i0}//${n0} ${i1}//${n1} ${i2}//${n2}`);
            } else {
              objLines.push(`f ${i0} ${i1} ${i2}`);
            }
          }
        } else if (positions) {
          for (let i = 0; i < positions.count; i += 3) {
            const i0 = vertexOffset + i;
            const i1 = vertexOffset + i + 1;
            const i2 = vertexOffset + i + 2;
            objLines.push(`f ${i0} ${i1} ${i2}`);
          }
        }

        vertexOffset += positions ? positions.count : 0;
        normalOffset += normals ? normals.count : 0;
        uvOffset += uvs ? uvs.count : 0;

        objLines.push('');
      });

      const objContent = objLines.join('\n');
      const mtlContent = mtlLines.join('\n');
      const combined = objContent + '\n\n# --- MTL ---\n' + mtlContent;

      return {
        success: true,
        data: combined,
        filename: 'scene.obj',
        mimeType: 'text/plain',
        warnings,
        errors,
        stats,
      };
    } catch (err) {
      errors.push(`OBJ export failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, data: null, filename: '', mimeType: '', warnings, errors, stats };
    }
  }

  // -----------------------------------------------------------------------
  // PLY Export (from ExportToolkit)
  // -----------------------------------------------------------------------

  private exportPLY(
    scene: THREE.Scene,
    _opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): SceneExportResult {
    try {
      let plyContent = 'ply\nformat ascii 1.0\ncomment Exported by Infinigen-R3F\n';
      const points: Array<{ x: number; y: number; z: number }> = [];

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const positions = child.geometry.attributes.position;
          if (!positions) return;
          const posArray = positions.array as Float32Array;
          for (let i = 0; i < posArray.length; i += 3) {
            points.push({ x: posArray[i], y: posArray[i + 1], z: posArray[i + 2] });
          }
        }
      });

      plyContent += `element vertex ${points.length}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`;
      for (const point of points) {
        plyContent += `${point.x} ${point.y} ${point.z}\n`;
      }

      return {
        success: true,
        data: plyContent,
        filename: 'scene.ply',
        mimeType: 'text/plain',
        warnings,
        errors,
        stats,
      };
    } catch (err) {
      errors.push(`PLY export failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, data: null, filename: '', mimeType: '', warnings, errors, stats };
    }
  }

  // -----------------------------------------------------------------------
  // STL Export (from ExportToolkit)
  // -----------------------------------------------------------------------

  private exportSTL(
    scene: THREE.Scene,
    _opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): SceneExportResult {
    try {
      let stlContent = 'solid InfinigenExport\n';
      warnings.push('STL does not support materials or colors');

      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const positions = child.geometry.attributes.position;
        if (!positions) return;
        const posArray = positions.array as Float32Array;
        const indexArray = child.geometry.index?.array;

        if (indexArray) {
          for (let i = 0; i < indexArray.length; i += 3) {
            const i1 = indexArray[i] * 3;
            const i2 = indexArray[i + 1] * 3;
            const i3 = indexArray[i + 2] * 3;
            stlContent += `  facet normal 0 0 0\n    outer loop\n`;
            stlContent += `      vertex ${posArray[i1]} ${posArray[i1 + 1]} ${posArray[i1 + 2]}\n`;
            stlContent += `      vertex ${posArray[i2]} ${posArray[i2 + 1]} ${posArray[i2 + 2]}\n`;
            stlContent += `      vertex ${posArray[i3]} ${posArray[i3 + 1]} ${posArray[i3 + 2]}\n`;
            stlContent += `    endloop\n  endfacet\n`;
          }
        } else {
          // Non-indexed: every 3 vertices form a triangle
          for (let i = 0; i < posArray.length; i += 9) {
            stlContent += `  facet normal 0 0 0\n    outer loop\n`;
            stlContent += `      vertex ${posArray[i]} ${posArray[i + 1]} ${posArray[i + 2]}\n`;
            stlContent += `      vertex ${posArray[i + 3]} ${posArray[i + 4]} ${posArray[i + 5]}\n`;
            stlContent += `      vertex ${posArray[i + 6]} ${posArray[i + 7]} ${posArray[i + 8]}\n`;
            stlContent += `    endloop\n  endfacet\n`;
          }
        }
      });

      stlContent += 'endsolid InfinigenExport\n';

      return {
        success: true,
        data: stlContent,
        filename: 'scene.stl',
        mimeType: 'model/stl',
        warnings,
        errors,
        stats,
      };
    } catch (err) {
      errors.push(`STL export failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, data: null, filename: '', mimeType: '', warnings, errors, stats };
    }
  }

  // -----------------------------------------------------------------------
  // Three.js JSON Export (from ExportToolkit)
  // -----------------------------------------------------------------------

  private exportThreeJSON(
    scene: THREE.Scene,
    _opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): SceneExportResult {
    try {
      const json = scene.toJSON();
      const content = JSON.stringify(json, null, 2);

      return {
        success: true,
        data: content,
        filename: 'scene.json',
        mimeType: 'application/json',
        warnings,
        errors,
        stats,
      };
    } catch (err) {
      errors.push(`JSON export failed: ${err instanceof Error ? err.message : String(err)}`);
      return { success: false, data: null, filename: '', mimeType: '', warnings, errors, stats };
    }
  }

  // -----------------------------------------------------------------------
  // USD Export (via Python bridge, GLB fallback)
  // -----------------------------------------------------------------------

  private async exportUSD(
    scene: THREE.Scene,
    opts: SceneExportOptions,
    stats: SceneExportResult['stats'],
    warnings: string[],
    errors: string[],
  ): Promise<SceneExportResult> {
    // Only reachable if bridge is connected (checked in exportScene)
    try {
      // First export as GLB, then send to Python for USD conversion
      const glbResult = await this.exportGLTF(scene, { ...opts, binary: true }, stats, warnings, errors);
      if (glbResult.success && glbResult.data instanceof ArrayBuffer) {
        const bridgeResult = await this.bridge.transferGeometry(glbResult.data);
        if (bridgeResult.received) {
          warnings.push('USD export sent to Python backend for conversion');
          const usdFilename = opts.format === 'usdz' ? 'scene.usdz' : 'scene.usda';
          const usdMime = opts.format === 'usdz' ? 'model/vnd.usdz+zip' : 'model/usd';
          return {
            success: true,
            data: glbResult.data,
            filename: usdFilename,
            mimeType: usdMime,
            warnings,
            errors,
            stats,
          };
        }
      }
    } catch (err) {
      // Silently fall back - Python bridge USD conversion failed, falling back to GLB
      if (process.env.NODE_ENV === 'development') console.debug('[SceneExporter] USD export fallback:', err);
      warnings.push('Python bridge USD conversion failed, falling back to GLB');
    }

    // Fallback to GLB
    const fallbackResult = await this.exportGLTF(scene, { ...opts, binary: true }, stats, warnings, errors);
    if (fallbackResult.success) {
      fallbackResult.warnings.push('USD unavailable — exported as GLB instead');
    }
    return fallbackResult;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private makeErrorResult(
    message: string,
    startTime: number,
    warnings: string[],
    errors: string[],
  ): SceneExportResult {
    errors.push(message);
    return {
      success: false,
      data: null,
      filename: '',
      mimeType: '',
      warnings,
      errors,
      stats: {
        objectCount: 0,
        materialCount: 0,
        textureCount: 0,
        triangleCount: 0,
        durationMs: performance.now() - startTime,
      },
    };
  }

  private reportProgress(opts: SceneExportOptions, progress: number, message: string): void {
    if (opts.onProgress) {
      opts.onProgress(progress, message);
    }
  }

  private prepareExportScene(
    sourceScene: THREE.Scene,
    opts: SceneExportOptions,
    warnings: string[],
  ): THREE.Scene {
    const exportScene = new THREE.Scene();
    exportScene.name = sourceScene.name || 'ExportScene';

    switch (opts.scope) {
      case 'full': {
        sourceScene.traverse((child) => {
          if (child === sourceScene) return;
          const clone = child.clone(true);
          exportScene.add(clone);
        });
        break;
      }
      case 'selected': {
        if (!opts.selectedIds || opts.selectedIds.length === 0) {
          warnings.push('No objects selected for export, exporting full scene');
          sourceScene.traverse((child) => {
            if (child === sourceScene) return;
            exportScene.add(child.clone(true));
          });
        } else {
          for (const id of opts.selectedIds) {
            const obj = sourceScene.getObjectByName(id);
            if (obj) {
              exportScene.add(obj.clone(true));
            } else {
              warnings.push(`Selected object '${id}' not found in scene`);
            }
          }
        }
        break;
      }
      case 'terrain': {
        sourceScene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const name = child.name.toLowerCase();
            const userData = child.userData;
            if (
              name.includes('terrain') ||
              name.includes('ground') ||
              name.includes('heightmap') ||
              userData?.isTerrain ||
              userData?.terrainChunk
            ) {
              exportScene.add(child.clone(true));
            }
          }
        });
        if (exportScene.children.length === 0) {
          warnings.push('No terrain objects found for terrain-only export');
        }
        break;
      }
    }

    // Optionally filter out lights and cameras
    if (!opts.includeLights || !opts.includeCameras) {
      const toRemove: THREE.Object3D[] = [];
      exportScene.traverse((child) => {
        if (!opts.includeLights && (child instanceof THREE.Light)) {
          toRemove.push(child);
        }
        if (!opts.includeCameras && (child instanceof THREE.Camera)) {
          toRemove.push(child);
        }
      });
      toRemove.forEach((obj) => obj.parent?.remove(obj));
    }

    return exportScene;
  }

  private simplifyScene(scene: THREE.Scene, ratio: number): void {
    if (!this.simplifier) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        try {
          const simplified = this.simplifier!.simplify(child.geometry, ratio);
          child.geometry.dispose();
          child.geometry = simplified;
        } catch (err) {
          // Silently fall back - geometry simplification failed, keeping original
          if (process.env.NODE_ENV === 'development') console.debug('[SceneExporter] simplifyMesh fallback:', err);
        }
      }
    });
  }

  private gatherStats(scene: THREE.Scene, startTime: number): SceneExportResult['stats'] {
    let objectCount = 0;
    let materialCount = 0;
    let textureCount = 0;
    let triangleCount = 0;
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        objectCount++;
        const geo = child.geometry;
        if (geo.index) {
          triangleCount += geo.index.count / 3;
        } else if (geo.attributes.position) {
          triangleCount += geo.attributes.position.count / 3;
        }

        const mats = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        for (const mat of mats) {
          if (mat) {
            materials.add(mat);
            // Scan for textures
            for (const val of Object.values(mat)) {
              if (val instanceof THREE.Texture) {
                textures.add(val);
              }
            }
          }
        }
      }
    });

    return {
      objectCount,
      materialCount: materials.size,
      textureCount: textures.size,
      triangleCount: Math.round(triangleCount),
      durationMs: performance.now() - startTime,
    };
  }

  private getMaterialName(mat: THREE.Material | THREE.Material[], index: number): string {
    if (Array.isArray(mat)) {
      return mat[0]?.name || `Material_${index}`;
    }
    return mat?.name || `Material_${index}`;
  }

  private writeMTLMaterial(lines: string[], name: string, mat: THREE.Material | THREE.Material[]): void {
    const m = Array.isArray(mat) ? mat[0] : mat;
    if (!m) return;

    lines.push(`newmtl ${name}`);

    if (m instanceof THREE.MeshStandardMaterial) {
      const color = m.color;
      lines.push(`Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}`);

      if (m.emissive) {
        lines.push(`Ke ${m.emissive.r.toFixed(4)} ${m.emissive.g.toFixed(4)} ${m.emissive.b.toFixed(4)}`);
      }

      // Roughness / metallic approximated as specular
      const specular = new THREE.Color(1, 1, 1).multiplyScalar(1 - m.roughness);
      lines.push(`Ks ${specular.r.toFixed(4)} ${specular.g.toFixed(4)} ${specular.b.toFixed(4)}`);
      lines.push(`Ns ${((1 - m.roughness) * 250).toFixed(1)}`);

      if (m.map) {
        lines.push(`map_Kd ${m.map.name || 'texture_albedo.png'}`);
      }
      if (m.normalMap) {
        lines.push(`map_bump ${m.normalMap.name || 'texture_normal.png'}`);
      }
    } else if (m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshPhongMaterial) {
      const color = m.color;
      lines.push(`Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}`);
      if ('specular' in m && m.specular instanceof THREE.Color) {
        lines.push(`Ks ${m.specular.r.toFixed(4)} ${m.specular.g.toFixed(4)} ${m.specular.b.toFixed(4)}`);
      }
      if (m.map) {
        lines.push(`map_Kd ${m.map.name || 'texture_albedo.png'}`);
      }
    } else {
      lines.push('Kd 0.8 0.8 0.8');
    }

    lines.push(`d ${m.opacity ?? 1.0}`);
    lines.push(`illum 2`);
    lines.push('');
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Convenience function: export scene to downloadable blob
 */
export async function exportSceneToBlob(
  scene: THREE.Scene,
  options: Partial<SceneExportOptions> = {},
): Promise<Blob | null> {
  const exporter = new SceneExporter();
  const result = await exporter.exportScene(scene, options);

  if (!result.success || !result.data) return null;

  if (result.data instanceof ArrayBuffer) {
    return new Blob([result.data], { type: result.mimeType });
  }
  return new Blob([result.data], { type: result.mimeType });
}

/**
 * Get the list of supported export formats.
 * Standalone convenience function that doesn't require a SceneExporter instance.
 */
export function getSupportedFormats(): ExportFormat[] {
  return new SceneExporter().getSupportedFormats();
}
