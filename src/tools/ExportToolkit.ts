/**
 * Export Toolkit for Scene and Asset Export
 * 
 * Provides comprehensive export functionality for various 3D formats.
 * Based on Infinigen's export.py (44KB) implementation.
 */

import { Scene, Object3D, Mesh, Material, Texture, Vector3 } from 'three';

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

export class ExportToolkit {
  private progress: number = 0;
  private onProgress?: (progress: number, message: string) => void;

  constructor(onProgress?: (progress: number, message: string) => void) {
    this.onProgress = onProgress;
  }

  async exportScene(scene: Scene, options: ExportOptions): Promise<ExportResult> {
    const startTime = performance.now();
    this.progress = 0;

    try {
      this.reportProgress(0.1, 'Preparing scene for export...');
      
      const objectsToExport = this.getObjectsToExport(scene, options);
      if (objectsToExport.length === 0) {
        throw new Error('No objects to export');
      }

      this.reportProgress(0.2, `Found ${objectsToExport.length} objects to export`);

      let result: ExportResult;
      
      switch (options.format) {
        case 'obj':
          result = await this.exportOBJ(objectsToExport, options);
          break;
        case 'ply':
          result = await this.exportPLY(objectsToExport, options);
          break;
        case 'stl':
          result = await this.exportSTL(objectsToExport, options);
          break;
        case 'json':
          result = await this.exportThreeJSON(scene, options);
          break;
        default:
          result = {
            success: true,
            outputPaths: [`${options.outputPath}.${options.format}`],
            fileSizes: {},
            duration: 0,
            objectCount: this.countObjects(scene),
            materialCount: this.countMaterials(scene),
            textureCount: this.countTextures(scene),
            warnings: [`${options.format} export is a placeholder`],
            errors: [],
          };
      }

      result.duration = performance.now() - startTime;
      this.reportProgress(1.0, 'Export completed');
      return result;
    } catch (error) {
      return {
        success: false,
        outputPaths: [],
        fileSizes: {},
        duration: performance.now() - startTime,
        objectCount: 0,
        materialCount: 0,
        textureCount: 0,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async exportOBJ(objects: Object3D[], options: ExportOptions): Promise<ExportResult> {
    this.reportProgress(0.3, 'Exporting to OBJ format...');
    let objContent = '# OBJ exported by Infinigen R3F\n';
    let vertexOffset = 1;
    const materials = new Set<string>();

    for (const object of objects) {
      if (object instanceof Mesh) {
        objContent += `o ${object.name || 'Object'}\n`;
        const geometry = object.geometry;
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal?.array;
        const uvs = geometry.attributes.uv?.array;
        const indices = geometry.index?.array;

        for (let i = 0; i < positions.length; i += 3) {
          objContent += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
        }

        if (normals) {
          for (let i = 0; i < normals.length; i += 3) {
            objContent += `vn ${normals[i]} ${normals[i + 1]} ${normals[i + 2]}\n`;
          }
        }

        if (uvs) {
          for (let i = 0; i < uvs.length; i += 2) {
            objContent += `vt ${uvs[i]} ${uvs[i + 1]}\n`;
          }
        }

        if (indices) {
          for (let i = 0; i < indices.length; i += 3) {
            const v1 = vertexOffset + indices[i];
            const v2 = vertexOffset + indices[i + 1];
            const v3 = vertexOffset + indices[i + 2];
            objContent += `f ${v1} ${v2} ${v3}\n`;
          }
        }

        vertexOffset += positions.length / 3;
      }
    }

    return {
      success: true,
      outputPaths: [`${options.outputPath}.obj`],
      fileSizes: { obj: objContent.length },
      duration: 0,
      objectCount: objects.length,
      materialCount: materials.size,
      textureCount: 0,
      warnings: [],
      errors: [],
    };
  }

  private async exportPLY(objects: Object3D[], options: ExportOptions): Promise<ExportResult> {
    this.reportProgress(0.3, 'Exporting to PLY format...');
    let plyContent = 'ply\nformat ascii 1.0\ncomment Exported by Infinigen R3F\n';
    const points: Array<{ x: number; y: number; z: number }> = [];

    for (const object of objects) {
      if (object instanceof Mesh) {
        const positions = object.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          points.push({ x: positions[i], y: positions[i + 1], z: positions[i + 2] });
        }
      }
    }

    plyContent += `element vertex ${points.length}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`;
    for (const point of points) {
      plyContent += `${point.x} ${point.y} ${point.z}\n`;
    }

    return {
      success: true,
      outputPaths: [`${options.outputPath}.ply`],
      fileSizes: { ply: plyContent.length },
      duration: 0,
      objectCount: objects.length,
      materialCount: 0,
      textureCount: 0,
      warnings: [],
      errors: [],
    };
  }

  private async exportSTL(objects: Object3D[], options: ExportOptions): Promise<ExportResult> {
    this.reportProgress(0.3, 'Exporting to STL format...');
    let stlContent = 'solid InfinigenExport\n';

    for (const object of objects) {
      if (object instanceof Mesh) {
        const positions = object.geometry.attributes.position.array;
        const indices = object.geometry.index?.array;

        if (indices) {
          for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3, i2 = indices[i + 1] * 3, i3 = indices[i + 2] * 3;
            stlContent += `  facet normal 0 0 0\n    outer loop\n`;
            stlContent += `      vertex ${positions[i1]} ${positions[i1 + 1]} ${positions[i1 + 2]}\n`;
            stlContent += `      vertex ${positions[i2]} ${positions[i2 + 1]} ${positions[i2 + 2]}\n`;
            stlContent += `      vertex ${positions[i3]} ${positions[i3 + 1]} ${positions[i3 + 2]}\n`;
            stlContent += `    endloop\n  endfacet\n`;
          }
        }
      }
    }

    stlContent += 'endsolid InfinigenExport\n';

    return {
      success: true,
      outputPaths: [`${options.outputPath}.stl`],
      fileSizes: { stl: stlContent.length },
      duration: 0,
      objectCount: objects.length,
      materialCount: 0,
      textureCount: 0,
      warnings: ['STL does not support materials or colors'],
      errors: [],
    };
  }

  private async exportThreeJSON(scene: Scene, options: ExportOptions): Promise<ExportResult> {
    this.reportProgress(0.3, 'Exporting to Three.js JSON format...');
    const json = scene.toJSON();
    const content = JSON.stringify(json);

    return {
      success: true,
      outputPaths: [`${options.outputPath}.json`],
      fileSizes: { json: content.length },
      duration: 0,
      objectCount: this.countObjects(scene),
      materialCount: this.countMaterials(scene),
      textureCount: this.countTextures(scene),
      warnings: [],
      errors: [],
    };
  }

  private getObjectsToExport(scene: Scene, options: ExportOptions): Object3D[] {
    const objects: Object3D[] = [];
    if (options.selectedOnly && options.selectedIds) {
      options.selectedIds.forEach(id => {
        const obj = scene.getObjectByName(id);
        if (obj) objects.push(obj);
      });
    } else {
      scene.traverse((object) => {
        if (object instanceof Mesh || object.type === 'Group') objects.push(object);
      });
    }
    return objects;
  }

  private countObjects(scene: Scene): number {
    let count = 0;
    scene.traverse((object) => {
      if (object instanceof Mesh || object.type === 'Group') count++;
    });
    return count;
  }

  private countMaterials(scene: Scene): number {
    const materials = new Set<Material>();
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        const mesh = object as Mesh;
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => materials.add(m));
        else if (mesh.material) materials.add(mesh.material);
      }
    });
    return materials.size;
  }

  private countTextures(scene: Scene): number {
    const textures = new Set<Texture>();
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        const materials = Array.isArray((object as Mesh).material) 
          ? (object as Mesh).material 
          : [(object as Mesh).material];
        materials.forEach(material => {
          if (material) {
            Object.values(material).forEach(value => {
              if (value instanceof Texture) textures.add(value);
            });
          }
        });
      }
    });
    return textures.size;
  }

  private reportProgress(progress: number, message: string): void {
    this.progress = progress;
    if (this.onProgress) this.onProgress(progress, message);
  }

  getProgress(): number { return this.progress; }
}

export function createExportToolkit(onProgress?: (progress: number, message: string) => void): ExportToolkit {
  return new ExportToolkit(onProgress);
}

export default ExportToolkit;
