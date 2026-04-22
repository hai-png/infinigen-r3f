/**
 * Terrain Factory - Procedural terrain generation
 * Ported from: infinigen/assets/terrain/
 * 
 * Generates terrain meshes using height maps and noise functions
 */

import { AssetFactory, FactoryConfig } from '../../placement/factory';
import * as THREE from 'three';

export interface TerrainConfig extends FactoryConfig {
  /** Width of terrain */
  width: number;
  /** Depth of terrain */
  depth: number;
  /** Maximum height variation */
  maxHeight: number;
  /** Number of noise octaves */
  noiseOctaves: number;
  /** Noise scale (larger = smoother) */
  noiseScale: number;
  /** Noise lacunarity */
  lacunarity: number;
  /** Noise gain */
  gain: number;
  /** Height exponent for sharper features */
  heightExponent: number;
  /** Whether to add water plane */
  enableWater: boolean;
  /** Water level (0-1) */
  waterLevel: number;
}

const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  seed: Math.random(),
  width: 100,
  depth: 100,
  maxHeight: 20,
  noiseOctaves: 6,
  noiseScale: 0.02,
  lacunarity: 2.0,
  gain: 0.5,
  heightExponent: 1.2,
  enableWater: false,
  waterLevel: 0.3,
};

/**
 * TerrainFactory - Generates procedural terrain meshes
 */
export class TerrainFactory extends AssetFactory<TerrainConfig> {
  protected defaultConfig: TerrainConfig = DEFAULT_TERRAIN_CONFIG;
  
  public readonly assetType = 'terrain';
  public readonly tags = ['terrain', 'natural', 'static', 'ground'];

  constructor(config?: Partial<TerrainConfig>) {
    super(config);
  }

  /**
   * Generate terrain mesh with height displacement
   */
  async generateAsset(config?: Partial<TerrainConfig>): Promise<THREE.Group> {
    const finalConfig = this.mergeConfig(config);
    this.setSeed(finalConfig.seed);

    const group = new THREE.Group();

    // Create terrain geometry
    const terrain = this.createTerrainMesh(finalConfig);
    
    // Apply height map
    this.applyHeightMap(terrain.geometry, finalConfig);
    
    // Apply vertex colors based on height
    this.applyTerrainColors(terrain.geometry, finalConfig);

    group.add(terrain);

    // Optionally add water plane
    if (finalConfig.enableWater) {
      const water = this.createWaterPlane(finalConfig);
      group.add(water);
    }

    group.userData.factoryType = 'terrain';
    group.userData.seed = finalConfig.seed;
    group.userData.config = finalConfig;

    return group;
  }

  /**
   * Create base terrain plane geometry
   */
  protected createTerrainMesh(config: TerrainConfig): THREE.Mesh {
    // Calculate segments based on size for reasonable polygon count
    const segmentSize = 2; // meters per segment
    const widthSegments = Math.floor(config.width / segmentSize);
    const depthSegments = Math.floor(config.depth / segmentSize);

    const geometry = new THREE.PlaneGeometry(
      config.width,
      config.depth,
      widthSegments,
      depthSegments
    );

    // Rotate to be horizontal
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.FrontSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.x = Math.PI / 2; // Flat on ground

    return mesh;
  }

  /**
   * Apply noise-based height map to terrain
   */
  protected applyHeightMap(
    geometry: THREE.PlaneGeometry,
    config: TerrainConfig
  ): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    // Multi-octave noise function
    const noise = (x: number, z: number): number => {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;

      for (let i = 0; i < config.noiseOctaves; i++) {
        value += this.hashNoise2D(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= config.gain;
        frequency *= config.lacunarity;
      }

      // Normalize and apply exponent
      const normalized = value / maxValue;
      return Math.pow(Math.abs(normalized), config.heightExponent) * 
             (normalized >= 0 ? 1 : -1);
    };

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Calculate noise at vertex position
      const noiseValue = noise(
        vertex.x * config.noiseScale,
        vertex.z * config.noiseScale
      );
      
      // Apply height
      vertex.y = noiseValue * config.maxHeight;
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;
  }

  /**
   * Apply color gradient based on height
   */
  protected applyTerrainColors(
    geometry: THREE.PlaneGeometry,
    config: TerrainConfig
  ): void {
    const positionAttribute = geometry.attributes.position;
    const count = positionAttribute.count;
    
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    // Color stops (height, color)
    const colorStops = [
      { height: -0.1, color: new THREE.Color(0x8B4513) }, // Deep brown (underwater)
      { height: 0.0, color: new THREE.Color(0xC2B280) },  // Sand
      { height: 0.3, color: new THREE.Color(0x556B2F) },  // Grass
      { height: 0.6, color: new THREE.Color(0x696969) },  // Rock
      { height: 1.0, color: new THREE.Color(0xFFFFFF) },  // Snow
    ];

    for (let i = 0; i < count; i++) {
      const y = positionAttribute.getY(i);
      const normalizedHeight = (y + config.maxHeight * 0.1) / (config.maxHeight * 1.1);
      const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));

      // Find color between stops
      color.copy(this.interpolateColor(clampedHeight, colorStops));
      
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Interpolate between color stops
   */
  protected interpolateColor(
    t: number,
    stops: Array<{ height: number; color: THREE.Color }>
  ): THREE.Color {
    // Find surrounding stops
    for (let i = 0; i < stops.length - 1; i++) {
      const stop1 = stops[i];
      const stop2 = stops[i + 1];
      
      if (t >= stop1.height && t <= stop2.height) {
        const localT = (t - stop1.height) / (stop2.height - stop1.height);
        return stop1.color.clone().lerp(stop2.color, localT);
      }
    }

    // Return edge colors
    if (t < stops[0].height) return stops[0].color.clone();
    return stops[stops.length - 1].color.clone();
  }

  /**
   * Create water plane
   */
  protected createWaterPlane(config: TerrainConfig): THREE.Mesh {
    const waterLevel = config.waterLevel * config.maxHeight;
    
    const geometry = new THREE.PlaneGeometry(config.width, config.depth);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1E90FF),
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = waterLevel;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * 2D hash-based noise function
   */
  protected hashNoise2D(x: number, z: number): number {
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Generate terrain chunk for LOD system
   */
  async generateChunk(
    x: number,
    z: number,
    chunkSize: number,
    lod: number,
    config?: Partial<TerrainConfig>
  ): Promise<THREE.Mesh> {
    const finalConfig = this.mergeConfig(config);
    
    // Adjust resolution based on LOD
    const segmentSize = 2 * (lod + 1);
    const segments = Math.floor(chunkSize / segmentSize);
    
    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    
    // Offset to chunk position
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      vertex.x += x;
      vertex.z += z;
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    // Apply height map
    this.applyHeightMap(geometry, finalConfig);
    
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
}

export default TerrainFactory;
