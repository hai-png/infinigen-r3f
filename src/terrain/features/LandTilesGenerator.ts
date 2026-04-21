/**
 * Infinigen R3F Port - Advanced Terrain Features
 * Tiled Terrain Generator for Seamless Large-Scale Landscapes
 * 
 * Based on: infinigen/terrain/elements/landtiles.py
 */

import { Vector3, BufferGeometry, Mesh, InstancedMesh, Matrix4, Color } from 'three';
import { TerrainGenerator, HeightMap, TerrainData, TerrainConfig } from './TerrainGenerator';
import { SeededRandom } from '../../util/MathUtils';

export enum LandTileType {
  MultiMountains = 'MultiMountains',
  SingleMountain = 'SingleMountain',
  Valley = 'Valley',
  Plateau = 'Plateau',
  Island = 'Island',
  Coastal = 'Coastal',
}

export interface TiledTerrainConfig extends TerrainConfig {
  tileSize: number;
  overlap: number;
  lodLevels: number;
  tiles: LandTileType[];
  tileDensity: number;
  randomness: number;
  islandProbability: number;
  tileHeights: number[];
  yTilt: number;
  emptyBelow: number;
}

export interface TerrainChunk {
  x: number;
  z: number;
  geometry: BufferGeometry;
  mesh: Mesh;
  lodLevel: number;
  neighbors: Map<string, TerrainChunk>;
  data: TerrainData;
}

export class TiledTerrainGenerator extends TerrainGenerator {
  private tileSize: number;
  private overlap: number;
  private lodLevels: number;
  private tiles: LandTileType[];
  private tileDensity: number;
  private randomness: number;
  private islandProbability: number;
  private tileHeights: number[];
  private yTilt: number;
  private emptyBelow: number;
  
  private chunks: Map<string, TerrainChunk> = new Map();
  private activeChunks: Set<string> = new Set();

  constructor(config: Partial<TiledTerrainConfig> = {}) {
    super(config);
    
    this.tileSize = config.tileSize ?? 256;
    this.overlap = config.overlap ?? 16;
    this.lodLevels = config.lodLevels ?? 4;
    this.tiles = config.tiles ?? [LandTileType.MultiMountains];
    this.tileDensity = config.tileDensity ?? 1.0;
    this.randomness = config.randomness ?? 0.3;
    this.islandProbability = config.islandProbability ?? 0.1;
    this.tileHeights = config.tileHeights ?? [-0.1];
    this.yTilt = config.yTilt ?? 0;
    this.emptyBelow = config.emptyBelow ?? -1000;
  }

  /**
   * Generate a seamless terrain tile at specified coordinates
   */
  public generateSeamlessTile(tileX: number, tileZ: number, lodLevel: number = 0): TerrainChunk {
    const key = `${tileX}_${tileZ}_${lodLevel}`;
    
    // Check if chunk already exists
    if (this.chunks.has(key)) {
      return this.chunks.get(key)!;
    }

    console.log(`Generating tile (${tileX}, ${tileZ}) at LOD ${lodLevel}`);

    // Calculate tile dimensions with overlap
    const effectiveSize = this.tileSize + (this.overlap * 2);
    const resolution = Math.floor(effectiveSize / Math.pow(2, lodLevel));
    
    // Generate base heightmap for this tile
    const offsetX = tileX * this.tileSize - this.overlap;
    const offsetZ = tileZ * this.tileSize - this.overlap;
    
    const terrainData = this.generateTileData(
      offsetX, 
      offsetZ, 
      resolution, 
      resolution,
      lodLevel
    );

    // Apply tile-specific modifications
    this.applyTileCharacteristics(terrainData, tileX, tileZ);

    // Create geometry from heightmap
    const geometry = this.createTileGeometry(terrainData, lodLevel);

    // Match edges with neighboring tiles
    this.matchEdgesWithNeighbors(geometry, tileX, tileZ, lodLevel);

    // Create mesh
    const mesh = new Mesh(geometry, this.getMaterialForTile(tileX, tileZ));
    mesh.position.set(offsetX, 0, offsetZ);

    const chunk: TerrainChunk = {
      x: tileX,
      z: tileZ,
      geometry,
      mesh,
      lodLevel,
      neighbors: new Map(),
      data: terrainData,
    };

    // Update neighbor references
    this.updateNeighborReferences(chunk);

    this.chunks.set(key, chunk);
    return chunk;
  }

  /**
   * Generate terrain data for a specific tile region
   */
  private generateTileData(
    offsetX: number,
    offsetZ: number,
    width: number,
    height: number,
    lodLevel: number
  ): TerrainData {
    // Create localized config for this tile
    const tileConfig: TerrainConfig = {
      ...this.config,
      width,
      height,
      seed: this.hashTileSeed(this.config.seed, offsetX, offsetZ),
    };

    // Use parent generator to create base terrain
    const tempGenerator = new TerrainGenerator(tileConfig);
    return tempGenerator.generate();
  }

  /**
   * Apply specific characteristics based on tile type
   */
  private applyTileCharacteristics(data: TerrainData, tileX: number, tileZ: number): void {
    const rng = new SeededRandom(this.hashTileSeed(this.config.seed, tileX, tileZ));
    
    // Select tile type
    const tileType = this.selectTileType(rng, tileX, tileZ);
    
    const heightMap = data.heightMap;
    const size = heightMap.length;
    const dim = Math.floor(Math.sqrt(size));

    switch (tileType) {
      case LandTileType.Island:
        this.applyIslandShape(heightMap, dim);
        break;
      case LandTileType.Valley:
        this.applyValleyShape(heightMap, dim);
        break;
      case LandTileType.Plateau:
        this.applyPlateauShape(heightMap, dim);
        break;
      case LandTileType.Coastal:
        this.applyCoastalShape(heightMap, dim);
        break;
      case LandTileType.SingleMountain:
        this.applySingleMountain(heightMap, dim, rng);
        break;
      case LandTileType.MultiMountains:
      default:
        // Already handled by base generator
        break;
    }

    // Apply tilt if configured
    if (this.yTilt !== 0) {
      this.applyTilt(heightMap, dim);
    }

    // Apply emptiness below threshold
    if (this.emptyBelow > -999) {
      this.applyEmptyBelow(heightMap, dim);
    }
  }

  /**
   * Select tile type based on position and probability
   */
  private selectTileType(rng: SeededRandom, tileX: number, tileZ: number): LandTileType {
    const roll = rng.next();
    
    if (roll < this.islandProbability) {
      return LandTileType.Island;
    }
    
    const remainingTypes = this.tiles.filter(t => t !== LandTileType.Island);
    const index = Math.floor(rng.next() * remainingTypes.length);
    return remainingTypes[index] || LandTileType.MultiMountains;
  }

  /**
   * Apply island shape to heightmap
   */
  private applyIslandShape(heightMap: Float32Array, dim: number): void {
    const centerX = dim / 2;
    const centerZ = dim / 2;
    const maxDist = Math.sqrt(2) * centerX;

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        const dist = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
        const normalizedDist = dist / maxDist;
        
        // Smooth falloff at edges
        const islandMask = Math.max(0, 1 - normalizedDist * 1.2);
        heightMap[idx] *= islandMask;
        
        // Add beach area
        if (normalizedDist > 0.7 && heightMap[idx] < 0.1) {
          heightMap[idx] = Math.max(0, heightMap[idx] - 0.05);
        }
      }
    }
  }

  /**
   * Apply valley shape to heightmap
   */
  private applyValleyShape(heightMap: Float32Array, dim: number): void {
    const centerX = dim / 2;

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        const distFromCenter = Math.abs(x - centerX);
        const valleyFactor = Math.min(1, distFromCenter / (dim / 3));
        
        // Lower the center
        heightMap[idx] = heightMap[idx] * (0.3 + 0.7 * valleyFactor);
      }
    }
  }

  /**
   * Apply plateau shape to heightmap
   */
  private applyPlateauShape(heightMap: Float32Array, dim: number): void {
    const centerX = dim / 2;
    const centerZ = dim / 2;

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        const dist = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
        
        // Flat top with steep edges
        if (dist < dim * 0.3) {
          heightMap[idx] = Math.max(heightMap[idx], 0.6);
        } else if (dist > dim * 0.4) {
          heightMap[idx] *= 0.5;
        }
      }
    }
  }

  /**
   * Apply coastal shape to heightmap
   */
  private applyCoastalShape(heightMap: Float32Array, dim: number): void {
    // Make one edge coastal (lower elevation)
    const coastalEdge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        let distFromCoast: number;

        switch (coastalEdge) {
          case 0: distFromCoast = z; break;
          case 1: distFromCoast = dim - x; break;
          case 2: distFromCoast = dim - z; break;
          case 3: distFromCoast = x; break;
          default: distFromCoast = 0;
        }

        const coastalFactor = Math.min(1, distFromCoast / (dim * 0.4));
        heightMap[idx] = heightMap[idx] * (0.2 + 0.8 * coastalFactor);
      }
    }
  }

  /**
   * Apply single mountain to heightmap
   */
  private applySingleMountain(heightMap: Float32Array, dim: number, rng: SeededRandom): void {
    const mountainX = rng.next() * dim * 0.6 + dim * 0.2;
    const mountainZ = rng.next() * dim * 0.6 + dim * 0.2;
    const mountainRadius = dim * (0.2 + rng.next() * 0.2);

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        const dist = Math.sqrt((x - mountainX) ** 2 + (z - mountainZ) ** 2);
        const normalizedDist = Math.min(1, dist / mountainRadius);
        
        // Mountain peak
        const mountainHeight = Math.pow(1 - normalizedDist, 2);
        heightMap[idx] = Math.max(heightMap[idx], mountainHeight * 0.8);
      }
    }
  }

  /**
   * Apply tilt to entire heightmap
   */
  private applyTilt(heightMap: Float32Array, dim: number): void {
    const tiltFactor = Math.tan(this.yTilt * Math.PI / 180);

    for (let z = 0; z < dim; z++) {
      for (let x = 0; x < dim; x++) {
        const idx = z * dim + x;
        const tiltAdjustment = (z / dim) * tiltFactor;
        heightMap[idx] = Math.max(0, heightMap[idx] + tiltAdjustment);
      }
    }
  }

  /**
   * Remove geometry below threshold
   */
  private applyEmptyBelow(heightMap: Float32Array, dim: number): void {
    for (let i = 0; i < heightMap.length; i++) {
      if (heightMap[i] < this.emptyBelow) {
        heightMap[i] = -9999; // Mark as empty
      }
    }
  }

  /**
   * Create mesh geometry from heightmap data
   */
  private createTileGeometry(data: TerrainData, lodLevel: number): BufferGeometry {
    const { heightMap } = data;
    const dim = Math.floor(Math.sqrt(heightMap.length));
    const step = Math.pow(2, lodLevel);

    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Generate vertices
    for (let z = 0; z < dim; z += step) {
      for (let x = 0; x < dim; x += step) {
        const idx = z * dim + x;
        const height = heightMap[idx];
        
        if (height > -999) { // Skip empty regions
          vertices.push(x, height * this.config.scale, z);
          normals.push(0, 1, 0); // Will be recalculated
          uvs.push(x / dim, z / dim);
        } else {
          vertices.push(x, -9999, z);
          normals.push(0, 1, 0);
          uvs.push(0, 0);
        }
      }
    }

    // Generate indices (simplified - would need proper handling for LOD)
    const vertexCount = Math.floor((dim / step) + 1);
    for (let z = 0; z < vertexCount - 1; z++) {
      for (let x = 0; x < vertexCount - 1; x++) {
        const topLeft = z * vertexCount + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * vertexCount + x;
        const bottomRight = bottomLeft + 1;

        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    // Recalculate normals for proper lighting
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Match edges with neighboring tiles for seamless transitions
   */
  private matchEdgesWithNeighbors(
    geometry: BufferGeometry,
    tileX: number,
    tileZ: number,
    lodLevel: number
  ): void {
    const positions = geometry.getAttribute('position') as any;
    const vertices = positions.array;

    // Get neighboring chunks
    const neighbors = {
      top: this.getChunk(tileX, tileZ - 1, lodLevel),
      right: this.getChunk(tileX + 1, tileZ, lodLevel),
      bottom: this.getChunk(tileX, tileZ + 1, lodLevel),
      left: this.getChunk(tileX - 1, tileZ, lodLevel),
    };

    // Match heights at edges
    const dim = Math.floor(Math.sqrt(vertices.length / 3));
    const step = Math.pow(2, lodLevel);

    // Top edge
    if (neighbors.top) {
      this.matchEdge(vertices, dim, 'top', neighbors.top.geometry, lodLevel);
    }

    // Bottom edge
    if (neighbors.bottom) {
      this.matchEdge(vertices, dim, 'bottom', neighbors.bottom.geometry, lodLevel);
    }

    // Left edge
    if (neighbors.left) {
      this.matchEdge(vertices, dim, 'left', neighbors.left.geometry, lodLevel);
    }

    // Right edge
    if (neighbors.right) {
      this.matchEdge(vertices, dim, 'right', neighbors.right.geometry, lodLevel);
    }

    positions.needsUpdate = true;
  }

  /**
   * Match a specific edge with neighbor geometry
   */
  private matchEdge(
    vertices: Float32Array,
    dim: number,
    edge: string,
    neighborGeometry: BufferGeometry,
    lodLevel: number
  ): void {
    const neighborPositions = neighborGeometry.getAttribute('position') as any;
    const neighborVertices = neighborPositions.array;
    const neighborDim = Math.floor(Math.sqrt(neighborVertices.length / 3));
    const step = Math.pow(2, lodLevel);

    switch (edge) {
      case 'top':
        // Match top edge of this tile with bottom edge of neighbor
        for (let x = 0; x < dim; x += step) {
          const idx = x * 3 + 1; // Y component
          const neighborIdx = ((neighborDim - step) * neighborDim + x) * 3 + 1;
          vertices[idx] = neighborVertices[neighborIdx];
        }
        break;

      case 'bottom':
        // Match bottom edge of this tile with top edge of neighbor
        for (let x = 0; x < dim; x += step) {
          const idx = ((dim - step) * dim + x) * 3 + 1;
          const neighborIdx = x * 3 + 1;
          vertices[idx] = neighborVertices[neighborIdx];
        }
        break;

      case 'left':
        // Match left edge of this tile with right edge of neighbor
        for (let z = 0; z < dim; z += step) {
          const idx = (z * dim) * 3 + 1;
          const neighborIdx = ((z + 1) * neighborDim - 1) * 3 + 1;
          vertices[idx] = neighborVertices[neighborIdx];
        }
        break;

      case 'right':
        // Match right edge of this tile with left edge of neighbor
        for (let z = 0; z < dim; z += step) {
          const idx = (z * dim + (dim - step)) * 3 + 1;
          const neighborIdx = (z * neighborDim) * 3 + 1;
          vertices[idx] = neighborVertices[neighborIdx];
        }
        break;
    }
  }

  /**
   * Update neighbor references for a chunk
   */
  private updateNeighborReferences(chunk: TerrainChunk): void {
    const directions = [
      { dx: 0, dz: -1, name: 'top' },
      { dx: 1, dz: 0, name: 'right' },
      { dx: 0, dz: 1, name: 'bottom' },
      { dx: -1, dz: 0, name: 'left' },
    ];

    for (const dir of directions) {
      const neighbor = this.getChunk(chunk.x + dir.dx, chunk.z + dir.dz, chunk.lodLevel);
      if (neighbor) {
        chunk.neighbors.set(dir.name, neighbor);
      }
    }
  }

  /**
   * Get chunk at specified coordinates
   */
  private getChunk(x: number, z: number, lodLevel: number): TerrainChunk | null {
    const key = `${x}_${z}_${lodLevel}`;
    return this.chunks.get(key) || null;
  }

  /**
   * Hash seed for specific tile
   */
  private hashTileSeed(baseSeed: number, tileX: number, tileZ: number): number {
    // Simple hash function combining seed with tile coordinates
    let hash = baseSeed;
    hash = ((hash << 5) + hash) + tileX;
    hash = ((hash << 5) + hash) + tileZ;
    return hash >>> 0; // Ensure unsigned 32-bit
  }

  /**
   * Get material for tile based on biome/height
   */
  private getMaterialForTile(tileX: number, tileZ: number): any {
    // Placeholder - would integrate with MaterialSystem
    // For now, return a basic material
    const { MeshStandardMaterial } = require('three');
    return new MeshStandardMaterial({
      color: new Color().setHSL(0.15, 0.5, 0.5),
      roughness: 0.8,
      metalness: 0.1,
    });
  }

  /**
   * Create LOD transitions between chunks of different detail levels
   */
  public createLODTransitions(chunk: TerrainChunk, neighborLOD: number): void {
    if (chunk.lodLevel === neighborLOD) {
      return; // No transition needed
    }

    // Implement skirt geometry or morph targets for smooth transitions
    // This is a simplified placeholder
    console.log(`Creating LOD transition for chunk (${chunk.x}, ${chunk.z})`);
  }

  /**
   * Generate a grid of tiles around a center point
   */
  public generateTileGrid(
    centerX: number,
    centerZ: number,
    radius: number,
    baseLOD: number = 0
  ): TerrainChunk[] {
    const chunks: TerrainChunk[] = [];

    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        // Calculate LOD based on distance from center
        const distance = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
        const lodLevel = Math.min(this.lodLevels - 1, Math.floor(distance / radius * this.lodLevels));
        
        const chunk = this.generateSeamlessTile(x, z, lodLevel);
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  /**
   * Clear cached chunks to free memory
   */
  public clearCache(): void {
    this.chunks.forEach(chunk => {
      chunk.geometry.dispose();
    });
    this.chunks.clear();
    this.activeChunks.clear();
  }

  /**
   * Export tile data for serialization
   */
  public exportTileData(chunk: TerrainChunk): object {
    return {
      x: chunk.x,
      z: chunk.z,
      lodLevel: chunk.lodLevel,
      heightMap: Array.from(chunk.data.heightMap),
      config: this.config,
    };
  }
}

export default TiledTerrainGenerator;
