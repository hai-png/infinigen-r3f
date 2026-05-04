/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Adaptive Meshing System with LOD and Chunk Streaming
 *
 * Integrated with TerrainSurfaceShaderPipeline for optional GPU/CPU
 * SDF-based surface displacement after mesh generation.
 */

import { 
  BufferGeometry, 
  Float32BufferAttribute, 
  Vector3, 
  Matrix4,
  Box3,
  Sphere
} from 'three';
import { HeightMap, NormalMap, TerrainData } from './TerrainGenerator';
import { TerrainSurfaceShaderPipeline } from '../gpu/TerrainSurfaceShaderPipeline';
import type { SignedDistanceField } from '../sdf/sdf-operations';

export interface MeshConfig {
  chunkSize: number;
  lodLevels: number;
  maxError: number;
  borderSize: number;
}

export interface ChunkData {
  geometry: BufferGeometry;
  lodLevel: number;
  bounds: Box3;
  boundingSphere: Sphere;
  position: { x: number; y: number };
  neighbors: { north: boolean; south: boolean; east: boolean; west: boolean };
}

export class TerrainMesher {
  private config: MeshConfig;
  private chunks: Map<string, ChunkData>;

  // -----------------------------------------------------------------------
  // Surface Shader Pipeline Integration
  // -----------------------------------------------------------------------

  /**
   * Optional surface shader pipeline for SDF-based displacement.
   *
   * Set via `setSurfaceShaderPipeline()`. When present and the pipeline
   * reports it is initialized, the async displacement methods will apply
   * vertex displacement to generated geometry.
   */
  private surfaceShaderPipeline: TerrainSurfaceShaderPipeline | null = null;

  constructor(config: Partial<MeshConfig> = {}) {
    this.config = {
      chunkSize: 64,
      lodLevels: 5,
      maxError: 0.01,
      borderSize: 2,
      ...config,
    };

    this.chunks = new Map();
  }

  // =====================================================================
  // Surface Shader Pipeline — Public API
  // =====================================================================

  /**
   * Set the surface shader pipeline for displacement.
   *
   * Pass a `TerrainSurfaceShaderPipeline` instance (typically obtained from
   * `TerrainGenerator.getSurfaceShaderPipeline()`).  The pipeline must
   * already be initialized before displacement methods are called.
   *
   * Pass `null` to detach the pipeline.
   */
  setSurfaceShaderPipeline(pipeline: TerrainSurfaceShaderPipeline | null): void {
    this.surfaceShaderPipeline = pipeline;
  }

  /**
   * Check whether the surface shader pipeline is attached and initialized.
   */
  isSurfaceShaderReady(): boolean {
    return this.surfaceShaderPipeline !== null && this.surfaceShaderPipeline.isInitialized();
  }

  /**
   * Generate mesh from terrain data and optionally apply surface displacement.
   *
   * This is the async counterpart to `generateMesh()`.  If a surface shader
   * pipeline is attached and initialized, the generated geometry is refined
   * via SDF-based displacement before being returned.
   *
   * If no pipeline is attached, the result is identical to `generateMesh()`.
   *
   * @param terrainData - The terrain data to mesh
   * @param sdf         - The signed distance field for displacement.
   *                      Required if pipeline is attached; ignored otherwise.
   * @returns           The (possibly displaced) terrain mesh geometry
   */
  async generateMeshWithDisplacement(
    terrainData: TerrainData,
    sdf?: SignedDistanceField,
  ): Promise<BufferGeometry> {
    let geometry = this.generateMesh(terrainData);

    if (this.surfaceShaderPipeline && this.surfaceShaderPipeline.isInitialized() && sdf) {
      try {
        geometry = await this.surfaceShaderPipeline.computeDisplacement(geometry, sdf);
      } catch (err) {
        console.warn(
          '[TerrainMesher] Surface displacement failed, using original geometry:',
          err,
        );
      }
    }

    return geometry;
  }

  /**
   * Generate chunked mesh with LOD and optionally apply surface displacement
   * to every chunk.
   *
   * This is the async counterpart to `generateChunkedMesh()`.  If a surface
   * shader pipeline is attached and initialized, each chunk's geometry is
   * refined via SDF-based displacement.
   *
   * The displaced geometry replaces the original in the returned `ChunkData`,
   * and bounding volumes are recomputed.
   *
   * @param terrainData    - The terrain data to mesh
   * @param cameraPosition - Camera position for LOD selection
   * @param sdf            - The signed distance field for displacement.
   *                         Required if pipeline is attached; ignored otherwise.
   * @returns              Map of chunk key → ChunkData (with displaced geometry)
   */
  async generateChunkedMeshWithDisplacement(
    terrainData: TerrainData,
    cameraPosition: Vector3,
    sdf?: SignedDistanceField,
  ): Promise<Map<string, ChunkData>> {
    // Generate the base chunked mesh synchronously
    const chunks = this.generateChunkedMesh(terrainData, cameraPosition);

    // Apply displacement to each chunk if pipeline is available
    if (this.surfaceShaderPipeline && this.surfaceShaderPipeline.isInitialized() && sdf) {
      for (const [key, chunkData] of chunks) {
        try {
          const displacedGeometry = await this.surfaceShaderPipeline.computeDisplacement(
            chunkData.geometry,
            sdf,
          );

          // Replace the geometry in the chunk
          // Dispose the old geometry only if it was replaced by a new one
          if (displacedGeometry !== chunkData.geometry) {
            chunkData.geometry.dispose();
            chunkData.geometry = displacedGeometry;

            // Recompute bounding volumes for the displaced geometry
            chunkData.geometry.computeBoundingBox();
            chunkData.geometry.computeBoundingSphere();

            chunkData.bounds = chunkData.geometry.boundingBox!;
            const sphere = chunkData.geometry.boundingSphere!;
            chunkData.boundingSphere = new Sphere(sphere.center, sphere.radius);
          }
        } catch (err) {
          console.warn(
            `[TerrainMesher] Surface displacement failed for chunk ${key}, using original:`,
            err,
          );
        }
      }
    }

    this.chunks = chunks;
    return chunks;
  }

  /**
   * Apply surface displacement to already-generated chunks in place.
   *
   * Useful when chunks have already been created (e.g. via `generateChunkedMesh`)
   * and you want to apply displacement after the fact without regenerating.
   *
   * The geometry in each `ChunkData` is replaced with the displaced version,
   * and bounding volumes are recomputed.
   *
   * @param sdf - The signed distance field for displacement
   */
  async applyDisplacementToChunks(sdf: SignedDistanceField): Promise<void> {
    if (!this.surfaceShaderPipeline || !this.surfaceShaderPipeline.isInitialized()) {
      return;
    }

    for (const [key, chunkData] of this.chunks) {
      try {
        const displacedGeometry = await this.surfaceShaderPipeline.computeDisplacement(
          chunkData.geometry,
          sdf,
        );

        if (displacedGeometry !== chunkData.geometry) {
          chunkData.geometry.dispose();
          chunkData.geometry = displacedGeometry;

          // Recompute bounding volumes
          chunkData.geometry.computeBoundingBox();
          chunkData.geometry.computeBoundingSphere();
          chunkData.bounds = chunkData.geometry.boundingBox!;
          const sphere = chunkData.geometry.boundingSphere!;
          chunkData.boundingSphere = new Sphere(sphere.center, sphere.radius);
        }
      } catch (err) {
        console.warn(
          `[TerrainMesher] Surface displacement failed for chunk ${key}:`,
          err,
        );
      }
    }
  }

  /**
   * Release the surface shader pipeline reference.
   *
   * Does NOT dispose the pipeline itself — ownership remains with whoever
   * created it (typically TerrainGenerator).
   */
  disposeSurfaceShader(): void {
    this.surfaceShaderPipeline = null;
  }

  // =====================================================================
  // Mesh Generation
  // =====================================================================

  /**
   * Generate mesh from terrain data
   */
  public generateMesh(terrainData: TerrainData): BufferGeometry {
    const { heightMap, normalMap, width, height } = terrainData;
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Generate vertices
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const h = heightMap.data[idx];

        vertices.push(x, h * 100, y); // Scale height

        // Add normals
        const nIdx = idx * 3;
        normals.push(normalMap.data[nIdx], normalMap.data[nIdx + 1], normalMap.data[nIdx + 2]);

        // Add UVs
        uvs.push(x / width, y / height);
      }
    }

    // Generate indices (triangle grid)
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const topLeft = y * width + x;
        const topRight = topLeft + 1;
        const bottomLeft = (y + 1) * width + x;
        const bottomRight = bottomLeft + 1;

        // First triangle
        indices.push(topLeft, bottomLeft, topRight);
        
        // Second triangle
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return geometry;
  }

  /**
   * Generate chunked mesh with LOD
   */
  public generateChunkedMesh(
    terrainData: TerrainData,
    cameraPosition: Vector3
  ): Map<string, ChunkData> {
    const { width, height } = terrainData;
    const chunks = new Map<string, ChunkData>();
    const chunkSize = this.config.chunkSize;

    const chunksX = Math.ceil(width / chunkSize);
    const chunksY = Math.ceil(height / chunkSize);

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const chunkKey = `${cx}_${cy}`;
        
        // Calculate distance to camera
        const chunkCenterX = (cx + 0.5) * chunkSize;
        const chunkCenterY = (cy + 0.5) * chunkSize;
        const dx = chunkCenterX - cameraPosition.x;
        const dy = chunkCenterY - cameraPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Determine LOD level based on distance
        const lodLevel = this.calculateLOD(distance);

        // Generate chunk geometry
        const chunkData = this.generateChunk(terrainData, cx, cy, lodLevel);
        chunks.set(chunkKey, chunkData);
      }
    }

    this.chunks = chunks;
    return chunks;
  }

  /**
   * Generate single chunk
   */
  private generateChunk(
    terrainData: TerrainData,
    chunkX: number,
    chunkY: number,
    lodLevel: number
  ): ChunkData {
    const { heightMap, normalMap, width } = terrainData;
    const chunkSize = this.config.chunkSize / (1 << lodLevel); // Reduce resolution for higher LOD
    const startX = chunkX * this.config.chunkSize;
    const startY = chunkY * this.config.chunkSize;

    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let vertexCount = 0;

    // Sample heightmap at reduced resolution
    for (let y = 0; y <= this.config.chunkSize; y += (1 << lodLevel)) {
      for (let x = 0; x <= this.config.chunkSize; x += (1 << lodLevel)) {
        const worldX = Math.min(startX + x, width - 1);
        const worldY = Math.min(startY + y, terrainData.height - 1);
        const idx = Math.floor(worldY) * width + Math.floor(worldX);

        const h = heightMap.data[idx];
        vertices.push(worldX, h * 100, worldY);

        const nIdx = idx * 3;
        normals.push(normalMap.data[nIdx], normalMap.data[nIdx + 1], normalMap.data[nIdx + 2]);

        uvs.push(worldX / width, worldY / terrainData.height);
        vertexCount++;
      }
    }

    // Generate indices
    const step = (1 << lodLevel);
    for (let y = 0; y < this.config.chunkSize; y += step) {
      for (let x = 0; x < this.config.chunkSize; x += step) {
        const rowLength = Math.floor(this.config.chunkSize / step) + 1;
        const topLeft = (y / step) * rowLength + (x / step);
        const topRight = topLeft + 1;
        const bottomLeft = (y / step + 1) * rowLength + (x / step);
        const bottomRight = bottomLeft + 1;

        if (topRight < vertexCount && bottomLeft < vertexCount && bottomRight < vertexCount) {
          indices.push(topLeft, bottomLeft, topRight);
          indices.push(topRight, bottomLeft, bottomRight);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const bounds = geometry.boundingBox!;
    const sphere = geometry.boundingSphere!;

    return {
      geometry,
      lodLevel,
      bounds,
      boundingSphere: new Sphere(sphere.center, sphere.radius),
      position: { x: chunkX, y: chunkY },
      neighbors: {
        north: chunkY > 0,
        south: true,
        east: true,
        west: chunkX > 0,
      },
    };
  }

  /**
   * Calculate appropriate LOD level based on distance
   */
  private calculateLOD(distance: number): number {
    const thresholds = [
      distance < 50 ? 0 :
      distance < 100 ? 1 :
      distance < 200 ? 2 :
      distance < 400 ? 3 : 4
    ];

    for (let i = 0; i < thresholds.length; i++) {
      if (thresholds[i]) return i;
    }

    return this.config.lodLevels - 1;
  }

  /**
   * Get chunk by key
   */
  public getChunk(key: string): ChunkData | undefined {
    return this.chunks.get(key);
  }

  /**
   * Update chunks based on camera position
   */
  public updateChunks(terrainData: TerrainData, cameraPosition: Vector3): void {
    this.generateChunkedMesh(terrainData, cameraPosition);
  }

  /**
   * Clear all chunks
   */
  public clearChunks(): void {
    this.chunks.clear();
  }

  /**
   * Get active chunk count
   */
  public getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Optimize geometry for rendering
   */
  public optimizeGeometry(geometry: BufferGeometry): BufferGeometry {
    // Merge vertices
    geometry = (geometry as any).mergeVertices() ?? geometry;
    
    // Compute tight bounds
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    return geometry;
  }

  /**
   * Generate wireframe geometry for debugging
   */
  public generateWireframe(geometry: BufferGeometry): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();
    
    if (!indices) return geometry;

    const lineIndices: number[] = [];
    
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i);
      const b = indices.getX(i + 1);
      const c = indices.getX(i + 2);

      // Add edges
      lineIndices.push(a, b, b, c, c, a);
    }

    const wireframeGeo = new BufferGeometry();
    wireframeGeo.setAttribute('position', positions.clone());
    wireframeGeo.setIndex(lineIndices);

    return wireframeGeo;
  }
}
