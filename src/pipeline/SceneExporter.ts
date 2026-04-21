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
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { DRACOEncoder } from 'three/examples/jsm/libs/draco/draco_encoder.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type ExportFormat = 'gltf' | 'glb' | 'obj' | 'stl' | 'ply' | 'usd' | 'usdz';

export interface ExportOptions {
  // Format-specific options
  format: ExportFormat;
  
  // Quality settings
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  
  // Compression
  compress?: boolean;
  dracoCompression?: boolean;
  textureCompression?: 'basis' | 'ktx2' | 'none';
  
  // LOD settings
  generateLODs?: boolean;
  lodLevels?: number;
  lodDistances?: number[];
  
  // Texture settings
  embedTextures?: boolean;
  textureSize?: number;
  flipY?: boolean;
  
  // Geometry settings
  mergeGeometries?: boolean;
  quantizePosition?: number;
  quantizeUV?: number;
  quantizeNormal?: number;
  quantizeColor?: number;
  
  // Metadata
  includeMetadata?: boolean;
  metadata?: Record<string, any>;
  
  // Output
  outputDirectory?: string;
  filename?: string;
  
  // Progress callback
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
  reduction: number; // 0.0 to 1.0 (1.0 = full resolution)
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

// ============================================================================
// Main SceneExporter Class
// ============================================================================

export class SceneExporter {
  private exporter: GLTFExporter;
  private dracoEncoder: DRACOEncoder | null = null;
  private scene: THREE.Scene;
  private options: ExportOptions;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.exporter = new GLTFExporter();
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
   */
  async initializeDraco(dracoPath?: string): Promise<void> {
    if (this.dracoEncoder) return;

    try {
      // In browser environment, Draco needs to be loaded from CDN or local path
      const script = document.createElement('script');
      script.src = dracoPath || 'https://www.gstatic.com/draco/v1/draco_encoder.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      // @ts-ignore - Draco global
      if (typeof DracoEncoderModule !== 'undefined') {
        // @ts-ignore
        this.dracoEncoder = new DracoEncoderModule();
      }
    } catch (error) {
      console.warn('Draco encoder not available, falling back to uncompressed export');
    }
  }

  /**
   * Export scene to specified format
   */
  async export(options?: Partial<ExportOptions>): Promise<ExportResult> {
    if (options) {
      this.setOptions(options);
    }

    const startTime = performance.now();
    const { format, onProgress } = this.options;

    onProgress?.(0, `Starting ${format.toUpperCase()} export...`);

    try {
      let result: ExportResult;

      switch (format) {
        case 'gltf':
        case 'glb':
          result = await this.exportGLTF();
          break;
        case 'obj':
          result = await this.exportOBJ();
          break;
        case 'stl':
          result = await this.exportSTL();
          break;
        case 'ply':
          result = await this.exportPLY();
          break;
        case 'usd':
        case 'usdz':
          result = await this.exportUSD();
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      result.duration = performance.now() - startTime;
      onProgress?.(100, `Export completed in ${result.duration.toFixed(2)}ms`);

      return result;
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
   * Export to glTF/GLB format
   */
  private async exportGLTF(): Promise<ExportResult> {
    const { format, dracoCompression, embedTextures, textureSize, includeMetadata, metadata } = this.options;

    return new Promise((resolve, reject) => {
      const options: any = {
        binary: format === 'glb',
        trs: true,
        onlyVisible: true,
        truncateDrawRange: true,
        embedImages: embedTextures !== false,
        forceIndices: true,
      };

      if (dracoCompression && this.dracoEncoder) {
        options.encoderOptions = {
          methods: {
            quantize_position: 14,
            quantize_normal: 10,
            quantize_texcoord: 12,
            quantize_color: 8,
            quantize_weight: 8,
          },
        };
      }

      // Collect scene statistics before export
      const stats = this.collectSceneStatistics();

      // Add metadata if requested
      if (includeMetadata && this.scene.userData) {
        this.scene.userData.exportMetadata = {
          timestamp: new Date().toISOString(),
          generator: 'InfiniGen R3F',
          version: '1.0.0',
          ...metadata,
        };
      }

      this.exporter.parse(
        this.scene,
        (gltf: ArrayBuffer | object) => {
          const blob = format === 'glb' 
            ? new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' })
            : new Blob([JSON.stringify(gltf)], { type: 'application/json' });

          const filename = `${this.options.filename || 'scene'}.${format}`;
          
          resolve({
            success: true,
            format,
            filename,
            path: URL.createObjectURL(blob),
            size: blob.size,
            vertexCount: stats.vertexCount,
            triangleCount: stats.triangleCount,
            textureCount: stats.textureCount,
            materialCount: stats.materialCount,
            metadata: includeMetadata ? this.scene.userData.exportMetadata : undefined,
          });
        },
        (error) => reject(error),
        options
      );
    });
  }

  /**
   * Export to OBJ format with MTL material file
   */
  private async exportOBJ(): Promise<ExportResult> {
    const { filename, onProgress } = this.options;
    
    // OBJ export requires custom implementation
    // This is a simplified version - full implementation would handle all geometry types
    let objContent = '# OBJ Export from InfiniGen R3F\n';
    let mtlContent = '# MTL Material File\n\n';
    
    let vertexCount = 0;
    let triangleCount = 0;
    let materialCount = 0;
    const materials = new Set<string>();

    onProgress?.(20, 'Traversing scene graph...');

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const mesh = object;
        const geometry = mesh.geometry;
        const material = mesh.material;

        // Export material
        if (material && !materials.has(material.uuid)) {
          materials.add(material.uuid);
          materialCount++;
          mtlContent += this.exportMTLMaterial(material, materialCount);
        }

        // Export geometry
        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          const normals = geometry.attributes.normal?.array;
          const uvs = geometry.attributes.uv?.array;

          onProgress?.(40 + (vertexCount / 100000) * 40, `Exporting vertices: ${vertexCount}`);

          // Vertices
          for (let i = 0; i < positions.length; i += 3) {
            objContent += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
            vertexCount++;
          }

          // Normals
          if (normals) {
            for (let i = 0; i < normals.length; i += 3) {
              objContent += `vn ${normals[i]} ${normals[i + 1]} ${normals[i + 2]}\n`;
            }
          }

          // UVs
          if (uvs) {
            for (let i = 0; i < uvs.length; i += 2) {
              objContent += `vt ${uvs[i]} ${uvs[i + 1]}\n`;
            }
          }

          // Faces
          const index = geometry.index;
          if (index) {
            const indices = index.array;
            for (let i = 0; i < indices.length; i += 3) {
              const v1 = indices[i] + 1;
              const v2 = indices[i + 1] + 1;
              const v3 = indices[i + 2] + 1;
              objContent += `f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3}\n`;
              triangleCount++;
            }
          } else {
            for (let i = 0; i < positions.length / 3; i += 3) {
              const v1 = i + 1;
              const v2 = i + 2;
              const v3 = i + 3;
              objContent += `f ${v1}//${v1} ${v2}//${v2} ${v3}//${v3}\n`;
              triangleCount++;
            }
          }
        }
      }
    });

    onProgress?.(90, 'Finalizing files...');

    // Create blobs
    const objBlob = new Blob([objContent], { type: 'text/plain' });
    const mtlBlob = new Blob([mtlContent], { type: 'text/plain' });

    const baseFilename = filename || 'scene';
    
    // For OBJ, we return both files
    const objPath = URL.createObjectURL(objBlob);
    const mtlPath = URL.createObjectURL(mtlBlob);

    return {
      success: true,
      format: 'obj',
      filename: `${baseFilename}.obj`,
      path: objPath,
      size: objBlob.size + mtlBlob.size,
      vertexCount,
      triangleCount,
      textureCount: 0, // OBJ doesn't embed textures
      materialCount,
      metadata: {
        mtlFile: `${baseFilename}.mtl`,
        mtlPath,
      },
    };
  }

  /**
   * Generate MTL material definition
   */
  private exportMTLMaterial(material: THREE.Material, index: number): string {
    let mtl = `newmtl material_${index}\n`;

    if (material instanceof THREE.MeshStandardMaterial || 
        material instanceof THREE.MeshPhysicalMaterial) {
      const stdMat = material as THREE.MeshStandardMaterial;
      
      // Diffuse color
      if (stdMat.color) {
        mtl += `Kd ${stdMat.color.r.toFixed(3)} ${stdMat.color.g.toFixed(3)} ${stdMat.color.b.toFixed(3)}\n`;
      }
      
      // Ambient color
      mtl += `Ka 0.2 0.2 0.2\n`;
      
      // Specular color
      if (stdMat.roughness !== undefined) {
        const specular = 1 - stdMat.roughness;
        mtl += `Ks ${specular.toFixed(3)} ${specular.toFixed(3)} ${specular.toFixed(3)}\n`;
        mtl += `Ns ${(stdMat.roughness * 1000).toFixed(0)}\n`;
      }
      
      // Emissive
      if (stdMat.emissive && stdMat.emissiveIntensity) {
        mtl += `Ke ${stdMat.emissive.r.toFixed(3)} ${stdMat.emissive.g.toFixed(3)} ${stdMat.emissive.b.toFixed(3)}\n`;
      }
      
      // Transparency
      if (stdMat.transparent && stdMat.opacity !== undefined) {
        mtl += `d ${stdMat.opacity.toFixed(3)}\n`;
      }
    }

    mtl += '\n';
    return mtl;
  }

  /**
   * Export to STL format (for 3D printing)
   */
  private async exportSTL(): Promise<ExportResult> {
    const { filename, onProgress } = this.options;
    
    let stlContent = 'solid infinigen_scene\n';
    let triangleCount = 0;
    let vertexCount = 0;

    onProgress?.(20, 'Converting to STL...');

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const mesh = object;
        const geometry = mesh.geometry;

        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          const normals = geometry.attributes.normal?.array;

          // Calculate normals if not present
          if (!normals) {
            geometry.computeVertexNormals();
          }

          const index = geometry.index;
          if (index) {
            const indices = index.array;
            for (let i = 0; i < indices.length; i += 3) {
              const v1 = indices[i] * 3;
              const v2 = indices[i + 1] * 3;
              const v3 = indices[i + 2] * 3;

              const n1 = indices[i] * 3;
              const n2 = indices[i + 1] * 3;
              const n3 = indices[i + 2] * 3;

              stlContent += '  facet normal ';
              stlContent += `${geometry.attributes.normal.array[n1]} `;
              stlContent += `${geometry.attributes.normal.array[n1 + 1]} `;
              stlContent += `${geometry.attributes.normal.array[n1 + 2]}\n`;
              
              stlContent += '    outer loop\n';
              stlContent += `      vertex ${positions[v1]} ${positions[v1 + 1]} ${positions[v1 + 2]}\n`;
              stlContent += `      vertex ${positions[v2]} ${positions[v2 + 1]} ${positions[v2 + 2]}\n`;
              stlContent += `      vertex ${positions[v3]} ${positions[v3 + 1]} ${positions[v3 + 2]}\n`;
              stlContent += '    endloop\n';
              stlContent += '  endfacet\n';

              triangleCount++;
              vertexCount += 3;
            }
          }
        }
      }
    });

    stlContent += 'endsolid infinigen_scene\n';

    onProgress?.(90, 'Creating STL file...');

    const blob = new Blob([stlContent], { type: 'model/stl' });
    const baseFilename = filename || 'scene';

    return {
      success: true,
      format: 'stl',
      filename: `${baseFilename}.stl`,
      path: URL.createObjectURL(blob),
      size: blob.size,
      vertexCount,
      triangleCount,
      textureCount: 0,
      materialCount: 0,
    };
  }

  /**
   * Export to PLY format (point cloud)
   */
  private async exportPLY(): Promise<ExportResult> {
    const { filename, onProgress } = this.options;
    
    let vertices: number[] = [];
    let colors: number[] = [];
    let normals: number[] = [];

    onProgress?.(20, 'Extracting point cloud...');

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const mesh = object;
        const geometry = mesh.geometry;

        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          vertices.push(...Array.from(positions));

          if (geometry.attributes.color) {
            colors.push(...Array.from(geometry.attributes.color.array));
          }

          if (geometry.attributes.normal) {
            normals.push(...Array.from(geometry.attributes.normal.array));
          }
        }
      } else if (object instanceof THREE.Points) {
        const points = object;
        const geometry = points.geometry;

        if (geometry.attributes.position) {
          const positions = geometry.attributes.position.array;
          vertices.push(...Array.from(positions));

          if (geometry.attributes.color) {
            colors.push(...Array.from(geometry.attributes.color.array));
          }
        }
      }
    });

    onProgress?.(60, 'Building PLY structure...');

    const vertexCount = vertices.length / 3;
    let plyContent = `ply\nformat ascii 1.0\n`;
    plyContent += `comment Generated by InfiniGen R3F\n`;
    plyContent += `element vertex ${vertexCount}\n`;
    plyContent += `property float x\n`;
    plyContent += `property float y\n`;
    plyContent += `property float z\n`;

    if (normals.length > 0) {
      plyContent += `property float nx\n`;
      plyContent += `property float ny\n`;
      plyContent += `property float nz\n`;
    }

    if (colors.length > 0) {
      plyContent += `property uchar red\n`;
      plyContent += `property uchar green\n`;
      plyContent += `property uchar blue\n`;
    }

    plyContent += `end_header\n`;

    // Write vertices
    for (let i = 0; i < vertexCount; i++) {
      plyContent += `${vertices[i * 3]} ${vertices[i * 3 + 1]} ${vertices[i * 3 + 2]}`;
      
      if (normals.length > 0) {
        plyContent += ` ${normals[i * 3]} ${normals[i * 3 + 1]} ${normals[i * 3 + 2]}`;
      }
      
      if (colors.length > 0) {
        plyContent += ` ${Math.floor(colors[i * 3] * 255)} ${Math.floor(colors[i * 3 + 1] * 255)} ${Math.floor(colors[i * 3 + 2] * 255)}`;
      }
      
      plyContent += '\n';
    }

    onProgress?.(90, 'Finalizing PLY...');

    const blob = new Blob([plyContent], { type: 'application/ply' });
    const baseFilename = filename || 'scene';

    return {
      success: true,
      format: 'ply',
      filename: `${baseFilename}.ply`,
      path: URL.createObjectURL(blob),
      size: blob.size,
      vertexCount,
      triangleCount: 0,
      textureCount: 0,
      materialCount: 0,
    };
  }

  /**
   * Export to USD/USDZ format
   * Note: Full USD export requires Pixar's USD library
   * This is a placeholder that exports to glTF as intermediate format
   */
  private async exportUSD(): Promise<ExportResult> {
    const { format, onProgress } = this.options;
    
    onProgress?.(10, 'USD export requires server-side processing...');
    onProgress?.(50, 'Exporting to intermediate glTF format...');

    // For now, export to glTF which can be converted to USD using usdconverter
    const gltfResult = await this.exportGLTF();

    onProgress?.(90, 'USD conversion note added...');

    return {
      ...gltfResult,
      format: format as 'usd' | 'usdz',
      metadata: {
        ...gltfResult.metadata,
        note: 'USD conversion requires server-side usdconverter tool',
        converterCommand: `usd_converter ${gltfResult.filename} ${this.options.filename || 'scene'}.${format}`,
      },
    };
  }

  /**
   * Collect scene statistics
   */
  private collectSceneStatistics(): {
    vertexCount: number;
    triangleCount: number;
    textureCount: number;
    materialCount: number;
  } {
    let vertexCount = 0;
    let triangleCount = 0;
    const textures = new Set<string>();
    const materials = new Set<string>();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const mesh = object;
        const geometry = mesh.geometry;

        if (geometry.attributes.position) {
          vertexCount += geometry.attributes.position.count;
          
          const index = geometry.index;
          if (index) {
            triangleCount += index.count / 3;
          } else {
            triangleCount += geometry.attributes.position.count / 3;
          }
        }

        // Count materials
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            if (!materials.has(mat.uuid)) {
              materials.add(mat.uuid);
              
              // Count textures in material
              Object.keys(mat).forEach((key) => {
                const value = (mat as any)[key];
                if (value && value.isTexture && !textures.has(value.uuid)) {
                  textures.add(value.uuid);
                }
              });
            }
          });
        }
      }
    });

    return {
      vertexCount,
      triangleCount,
      textureCount: textures.size,
      materialCount: materials.size,
    };
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
}

export default SceneExporter;
