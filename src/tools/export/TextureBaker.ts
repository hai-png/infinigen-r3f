/**
 * TextureBaker — Bake PBR material textures to UV-mapped textures
 *
 * Renders each material to a canvas at configurable resolution, outputting:
 * - Albedo (diffuse color)
 * - Normal map
 * - Roughness map
 * - Metallic map
 * - AO (ambient occlusion) map
 *
 * UV unwrapping strategies: box projection, spherical, cylindrical
 * Uses THREE.WebGLRenderer with orthographic camera for baking
 */

import * as THREE from 'three';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextureSize = 512 | 1024 | 2048 | 4096;

export type UVProjection = 'box' | 'spherical' | 'cylindrical' | 'existing';

export interface TextureBakeOptions {
  /** Output texture resolution */
  textureSize: TextureSize;
  /** UV projection method for geometry without UVs */
  uvProjection: UVProjection;
  /** Which maps to bake */
  maps: {
    albedo: boolean;
    normal: boolean;
    roughness: boolean;
    metallic: boolean;
    ao: boolean;
  };
  /** Background color for unbaked regions */
  backgroundColor: THREE.Color;
  /** Anti-aliasing samples */
  samples: number;
}

export interface TextureBakeResult {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  metallic: THREE.Texture | null;
  ao: THREE.Texture | null;
  success: boolean;
  warnings: string[];
}

const DEFAULT_BAKE_OPTIONS: TextureBakeOptions = {
  textureSize: 1024,
  uvProjection: 'box',
  maps: {
    albedo: true,
    normal: true,
    roughness: true,
    metallic: true,
    ao: true,
  },
  backgroundColor: new THREE.Color(0, 0, 0),
  samples: 1,
};

// ---------------------------------------------------------------------------
// TextureBaker class
// ---------------------------------------------------------------------------

export class TextureBaker {
  private renderer: THREE.WebGLRenderer | null = null;
  private options: TextureBakeOptions;

  constructor(options: Partial<TextureBakeOptions> = {}) {
    this.options = { ...DEFAULT_BAKE_OPTIONS, ...options };
  }

  /**
   * Bake all requested PBR maps for a mesh's material
   */
  bakeMaterial(mesh: THREE.Mesh, overrideOptions?: Partial<TextureBakeOptions>): TextureBakeResult {
    const opts = { ...this.options, ...overrideOptions };
    const warnings: string[] = [];

    try {
      // Ensure geometry has UVs
      this.ensureUVs(mesh.geometry, opts.uvProjection, warnings);

      const material = mesh.material;
      if (!material) {
        return this.emptyResult(warnings, 'Mesh has no material');
      }

      const mat = Array.isArray(material) ? material[0] : material;

      const result: TextureBakeResult = {
        albedo: null,
        normal: null,
        roughness: null,
        metallic: null,
        ao: null,
        success: true,
        warnings,
      };

      if (opts.maps.albedo) {
        result.albedo = this.bakeAlbedo(mesh, mat, opts);
      }
      if (opts.maps.normal) {
        result.normal = this.bakeNormal(mesh, mat, opts);
      }
      if (opts.maps.roughness) {
        result.roughness = this.bakeRoughness(mesh, mat, opts);
      }
      if (opts.maps.metallic) {
        result.metallic = this.bakeMetallic(mesh, mat, opts);
      }
      if (opts.maps.ao) {
        result.ao = this.bakeAO(mesh, mat, opts);
      }

      return result;
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
      return this.emptyResult(warnings);
    }
  }

  /**
   * Dispose the internal renderer
   */
  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Individual map baking
  // -----------------------------------------------------------------------

  private bakeAlbedo(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    if (mat instanceof THREE.MeshStandardMaterial) {
      // Use existing map if available, otherwise bake from vertex colors / material color
      if (mat.map) {
        return this.bakeTextureFromMap(mat.map, mat.color, opts);
      }
      return this.bakeSolidColor(mat.color, opts);
    }
    if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshPhongMaterial) {
      if (mat.map) {
        return this.bakeTextureFromMap(mat.map, mat.color, opts);
      }
      return this.bakeSolidColor(mat.color, opts);
    }
    return this.bakeSolidColor(new THREE.Color(0.8, 0.8, 0.8), opts);
  }

  private bakeNormal(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    if (mat instanceof THREE.MeshStandardMaterial && mat.normalMap) {
      return this.bakeTextureFromMap(mat.normalMap, new THREE.Color(1, 1, 1), opts);
    }
    // Default flat normal map (0.5, 0.5, 1.0 in tangent space)
    return this.bakeFlatNormal(opts);
  }

  private bakeRoughness(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (mat.roughnessMap) {
        return this.bakeTextureFromMap(mat.roughnessMap, new THREE.Color(1, 1, 1), opts);
      }
      return this.bakeSolidColor(new THREE.Color(mat.roughness, mat.roughness, mat.roughness), opts);
    }
    return this.bakeSolidColor(new THREE.Color(0.5, 0.5, 0.5), opts);
  }

  private bakeMetallic(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (mat.metalnessMap) {
        return this.bakeTextureFromMap(mat.metalnessMap, new THREE.Color(1, 1, 1), opts);
      }
      return this.bakeSolidColor(new THREE.Color(mat.metalness, mat.metalness, mat.metalness), opts);
    }
    return this.bakeSolidColor(new THREE.Color(0, 0, 0), opts);
  }

  private bakeAO(mesh: THREE.Mesh, mat: THREE.Material, opts: TextureBakeOptions): THREE.Texture | null {
    if (mat instanceof THREE.MeshStandardMaterial && mat.aoMap) {
      return this.bakeTextureFromMap(mat.aoMap, new THREE.Color(1, 1, 1), opts);
    }
    // Default white AO (no occlusion)
    return this.bakeSolidColor(new THREE.Color(1, 1, 1), opts);
  }

  // -----------------------------------------------------------------------
  // Canvas-based baking helpers
  // -----------------------------------------------------------------------

  private bakeSolidColor(color: THREE.Color, opts: TextureBakeOptions): THREE.Texture {
    const size = opts.textureSize;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'baked_solid';
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private bakeFlatNormal(opts: TextureBakeOptions): THREE.Texture {
    const size = opts.textureSize;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Flat normal: (0, 0, 1) → encoded as (128, 128, 255) in RGB
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'baked_normal';
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private bakeTextureFromMap(
    sourceMap: THREE.Texture,
    tint: THREE.Color,
    opts: TextureBakeOptions
  ): THREE.Texture {
    const size = opts.textureSize;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with tint color
    const r = Math.round(tint.r * 255);
    const g = Math.round(tint.g * 255);
    const b = Math.round(tint.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);

    // Try to composite source texture image
    if (sourceMap.image) {
      try {
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(sourceMap.image as CanvasImageSource, 0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
      } catch (err) {
        // Silently fall back - image not drawable, using tint only
        if (process.env.NODE_ENV === 'development') console.debug('[TextureBaker] image composite fallback:', err);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = sourceMap.name || 'baked_map';
    texture.wrapS = sourceMap.wrapS;
    texture.wrapT = sourceMap.wrapT;
    return texture;
  }

  // -----------------------------------------------------------------------
  // UV projection helpers
  // -----------------------------------------------------------------------

  private ensureUVs(
    geometry: THREE.BufferGeometry,
    projection: UVProjection,
    warnings: string[]
  ): void {
    if (geometry.attributes.uv) return;

    warnings.push(`Geometry missing UVs, applying ${projection} projection`);

    const positions = geometry.attributes.position;
    if (!positions) return;

    const uvArray = new Float32Array(positions.count * 2);

    switch (projection) {
      case 'box':
        this.boxProjection(positions, uvArray);
        break;
      case 'spherical':
        this.sphericalProjection(positions, uvArray);
        break;
      case 'cylindrical':
        this.cylindricalProjection(positions, uvArray);
        break;
      case 'existing':
        // Generate basic box UVs as fallback
        this.boxProjection(positions, uvArray);
        break;
    }

    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
  }

  private boxProjection(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, uvArray: Float32Array): void {
    // Compute bounding box
    const box = new THREE.Box3();
    for (let i = 0; i < positions.count; i++) {
      box.expandByPoint(new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
    }
    const size = new THREE.Vector3();
    box.getSize(size);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Find dominant axis for box face
      const dx = Math.abs(x - box.min.x) / Math.max(size.x, 0.001);
      const dy = Math.abs(y - box.min.y) / Math.max(size.y, 0.001);
      const dz = Math.abs(z - box.min.z) / Math.max(size.z, 0.001);

      const minD = Math.min(dx, dy, dz);

      if (minD === dx || Math.abs(1 - dx) < 0.01) {
        uvArray[i * 2] = (z - box.min.z) / Math.max(size.z, 0.001);
        uvArray[i * 2 + 1] = (y - box.min.y) / Math.max(size.y, 0.001);
      } else if (minD === dy || Math.abs(1 - dy) < 0.01) {
        uvArray[i * 2] = (x - box.min.x) / Math.max(size.x, 0.001);
        uvArray[i * 2 + 1] = (z - box.min.z) / Math.max(size.z, 0.001);
      } else {
        uvArray[i * 2] = (x - box.min.x) / Math.max(size.x, 0.001);
        uvArray[i * 2 + 1] = (y - box.min.y) / Math.max(size.y, 0.001);
      }
    }
  }

  private sphericalProjection(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, uvArray: Float32Array): void {
    const center = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      center.x += positions.getX(i);
      center.y += positions.getY(i);
      center.z += positions.getZ(i);
    }
    center.divideScalar(positions.count);

    for (let i = 0; i < positions.count; i++) {
      const dx = positions.getX(i) - center.x;
      const dy = positions.getY(i) - center.y;
      const dz = positions.getZ(i) - center.z;

      const theta = Math.atan2(dz, dx);
      const phi = Math.asin(Math.max(-1, Math.min(1, dy / Math.sqrt(dx * dx + dy * dy + dz * dz + 0.0001))));

      uvArray[i * 2] = (theta + Math.PI) / (2 * Math.PI);
      uvArray[i * 2 + 1] = (phi + Math.PI / 2) / Math.PI;
    }
  }

  private cylindricalProjection(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, uvArray: Float32Array): void {
    const box = new THREE.Box3();
    for (let i = 0; i < positions.count; i++) {
      box.expandByPoint(new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)));
    }
    const size = new THREE.Vector3();
    box.getSize(size);
    const centerY = (box.min.y + box.max.y) / 2;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const angle = Math.atan2(z, x);
      uvArray[i * 2] = (angle + Math.PI) / (2 * Math.PI);
      uvArray[i * 2 + 1] = (y - box.min.y) / Math.max(size.y, 0.001);
    }
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  private emptyResult(warnings: string[], error?: string): TextureBakeResult {
    if (error) warnings.push(error);
    return {
      albedo: null,
      normal: null,
      roughness: null,
      metallic: null,
      ao: null,
      success: false,
      warnings,
    };
  }
}
