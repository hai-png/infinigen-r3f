/**
 * RockGenerator - Procedural rock and terrain asset generation
 * 
 * Generates realistic rocks, boulders, and terrain features using:
 * - Noise-based displacement on base geometries
 * - Multiple rock types with material variations
 * - LOD support for performance optimization
 * - Weathering and erosion effects
 * - Cluster and scatter generation
 * 
 * Features:
 * - Boulder generation (large rocks)
 * - Cliff face segments
 * - Scattered stones and pebbles
 * - Material variation (granite, limestone, sandstone, basalt)
 * - Surface weathering (cracks, moss, lichen)
 * - Instanced rendering support
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NoiseUtils } from '../../terrain/utils/NoiseUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export type RockType = 'granite' | 'limestone' | 'sandstone' | 'basalt' | 'cliff';

export interface RockMaterial {
  name: RockType;
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  roughness: number;
  metalness: number;
  bumpScale: number;
  normalStrength?: number;
}

export interface RockConfig {
  // Size properties
  size: number;
  width: number;
  height: number;
  depth: number;
  
  // Shape properties
  segments: number;
  irregularity: number;
  noiseScale: number;
  noiseDetail: number;
  octaves: number;
  
  // Material properties
  rockType: RockType;
  customMaterial?: RockMaterial;
  
  // Weathering
  weatheringIntensity: number;
  crackDensity: number;
  mossCoverage: number;
  lichenCoverage: number;
  
  // Variation
  seed: number;
  randomness: number;
  
  // LOD
  useLOD: boolean;
  lodLevels: number;
}

export interface RockInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  rockType: RockType;
  lodLevel: number;
}

// ============================================================================
// Rock Material Presets
// ============================================================================

const ROCK_MATERIALS: Record<RockType, RockMaterial> = {
  granite: {
    name: 'granite',
    colorBase: new THREE.Color(0.65, 0.62, 0.6),
    colorVariation: new THREE.Color(0.08, 0.07, 0.06),
    roughness: 0.75,
    metalness: 0.1,
    bumpScale: 0.03,
    normalStrength: 0.5
  },
  limestone: {
    name: 'limestone',
    colorBase: new THREE.Color(0.78, 0.76, 0.73),
    colorVariation: new THREE.Color(0.06, 0.05, 0.05),
    roughness: 0.7,
    metalness: 0.05,
    bumpScale: 0.025,
    normalStrength: 0.4
  },
  sandstone: {
    name: 'sandstone',
    colorBase: new THREE.Color(0.78, 0.72, 0.55),
    colorVariation: new THREE.Color(0.1, 0.08, 0.05),
    roughness: 0.85,
    metalness: 0.05,
    bumpScale: 0.035,
    normalStrength: 0.6
  },
  basalt: {
    name: 'basalt',
    colorBase: new THREE.Color(0.28, 0.26, 0.25),
    colorVariation: new THREE.Color(0.05, 0.04, 0.04),
    roughness: 0.9,
    metalness: 0.15,
    bumpScale: 0.04,
    normalStrength: 0.7
  },
  cliff: {
    name: 'cliff',
    colorBase: new THREE.Color(0.55, 0.52, 0.48),
    colorVariation: new THREE.Color(0.12, 0.1, 0.08),
    roughness: 0.95,
    metalness: 0.05,
    bumpScale: 0.05,
    normalStrength: 0.8
  }
};

// ============================================================================
// RockGenerator Class
// ============================================================================

export class RockGenerator {
  private config: RockConfig;
  private noise: NoiseUtils;
  private materialCache: Map<string, THREE.MeshStandardMaterial>;
  
  constructor(config: Partial<RockConfig> = {}) {
    this.config = {
      size: 1.0,
      width: 1.0,
      height: 0.6,
      depth: 0.8,
      segments: 3,
      irregularity: 0.4,
      noiseScale: 1.5,
      noiseDetail: 2,
      octaves: 3,
      rockType: 'granite',
      weatheringIntensity: 0.3,
      crackDensity: 0.2,
      mossCoverage: 0.1,
      lichenCoverage: 0.05,
      seed: Math.random() * 10000,
      randomness: 0.3,
      useLOD: true,
      lodLevels: 3,
      ...config
    };
    
    this.noise = new NoiseUtils(this.config.seed);
    this.materialCache = new Map();
  }
  
  /**
   * Generate a single rock mesh
   */
  generate(): THREE.Mesh {
    const geometry = this.createRockGeometry();
    const material = this.createRockMaterial();
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Apply weathering details
    if (this.config.weatheringIntensity > 0) {
      this.applyWeathering(mesh);
    }
    
    return mesh;
  }
  
  /**
   * Create rock geometry using noise displacement
   */
  private createRockGeometry(): THREE.BufferGeometry {
    // Start with icosahedron for good base topology
    const geometry = new THREE.IcosahedronGeometry(1, this.config.segments);
    
    // Apply noise-based vertex displacement
    this.displaceVertices(geometry);
    
    // Scale to desired dimensions
    geometry.scale(
      this.config.width * this.config.size,
      this.config.height * this.config.size,
      this.config.depth * this.config.size
    );
    
    // Add cracks if density > 0
    if (this.config.crackDensity > 0) {
      this.addCracks(geometry);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Apply noise-based vertex displacement
   */
  private displaceVertices(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Get original direction and distance
      const direction = vertex.clone().normalize();
      const originalDistance = vertex.length();
      
      // Calculate layered noise for detailed displacement
      const noiseValue = this.layeredNoise(
        vertex.x * this.config.noiseScale,
        vertex.y * this.config.noiseScale,
        vertex.z * this.config.noiseScale,
        this.config.octaves
      );
      
      // Apply irregularity
      const displacement = 1 + (noiseValue - 0.5) * this.config.irregularity;
      const newDistance = originalDistance * displacement;
      
      // Set new position
      vertex.copy(direction.multiplyScalar(newDistance));
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
  }
  
  /**
   * Add crack details to geometry
   */
  private addCracks(geometry: THREE.BufferGeometry): void {
    // Simplified crack implementation - could be enhanced with texture projection
    const uvAttribute = geometry.attributes.uv;
    if (!uvAttribute) {
      // Generate UVs if not present
      geometry.computeTexCoord();
    }
  }
  
  /**
   * Create rock material based on type
   */
  private createRockMaterial(): THREE.MeshStandardMaterial {
    const cacheKey = `${this.config.rockType}_${this.config.weatheringIntensity}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)!;
    }
    
    const materialPreset = this.config.customMaterial || ROCK_MATERIALS[this.config.rockType];
    
    // Add color variation
    const color = materialPreset.colorBase.clone();
    const variation = materialPreset.colorVariation;
    
    color.r += (Math.random() - 0.5) * variation.r;
    color.g += (Math.random() - 0.5) * variation.g;
    color.b += (Math.random() - 0.5) * variation.b;
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: materialPreset.roughness,
      metalness: materialPreset.metalness,
      bumpScale: materialPreset.bumpScale
    });
    
    this.materialCache.set(cacheKey, material);
    return material;
  }
  
  /**
   * Apply weathering effects (moss, lichen, discoloration)
   */
  private applyWeathering(mesh: THREE.Mesh): void {
    // This would typically involve vertex colors or decal projection
    // For now, we'll store weathering data in userData
    mesh.userData.weathering = {
      intensity: this.config.weatheringIntensity,
      mossCoverage: this.config.mossCoverage,
      lichenCoverage: this.config.lichenCoverage,
      crackDensity: this.config.crackDensity
    };
  }
  
  /**
   * Generate a cluster of rocks
   */
  generateCluster(count: number, spread: number): THREE.Group {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const material = this.createRockMaterial();
    
    for (let i = 0; i < count; i++) {
      const rockGeo = new THREE.IcosahedronGeometry(1, Math.max(1, this.config.segments - 1));
      this.displaceVertices(rockGeo);
      
      // Random position within spread
      const angle = (i / count) * Math.PI * 2;
      const radius = Math.random() * spread * 0.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.abs(x + z) * 0.1;
      
      rockGeo.translate(x, y, z);
      
      // Random rotation
      rockGeo.rotateX(Math.random() * Math.PI);
      rockGeo.rotateY(Math.random() * Math.PI);
      rockGeo.rotateZ(Math.random() * Math.PI);
      
      // Random scale variation
      const scale = 0.7 + Math.random() * 0.6;
      rockGeo.scale(
        scale * this.config.width * this.config.size,
        scale * this.config.height * this.config.size,
        scale * this.config.depth * this.config.size
      );
      
      geometries.push(rockGeo);
    }
    
    if (geometries.length > 0) {
      try {
        const mergedGeo = mergeGeometries(geometries);
        const mesh = new THREE.Mesh(mergedGeo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      } catch (e) {
        // Fallback: add individual meshes
        geometries.forEach(geo => {
          const mesh = new THREE.Mesh(geo, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        });
      }
    }
    
    return group;
  }
  
  /**
   * Generate LOD variants
   */
  generateLODVariants(): THREE.LOD {
    const lod = new THREE.LOD();
    const material = this.createRockMaterial();
    
    for (let level = 0; level < this.config.lodLevels; level++) {
      const lodFactor = level / (this.config.lodLevels - 1);
      const segments = Math.max(1, Math.floor(this.config.segments * (1 - lodFactor * 0.5)));
      
      const geometry = new THREE.IcosahedronGeometry(1, segments);
      this.displaceVertices(geometry);
      
      geometry.scale(
        this.config.width * this.config.size,
        this.config.height * this.config.size,
        this.config.depth * this.config.size
      );
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Distance decreases with higher LOD levels
      const distance = level * 10;
      lod.addLevel(mesh, distance);
    }
    
    return lod;
  }
  
  /**
   * Generate boulder variant (larger, smoother)
   */
  generateBoulder(): THREE.Mesh {
    const originalSegments = this.config.segments;
    const originalIrregularity = this.config.irregularity;
    
    this.config.segments = Math.max(1, this.config.segments - 1);
    this.config.irregularity = this.config.irregularity * 0.6;
    this.config.size = this.config.size * 2.5;
    
    const boulder = this.generate();
    boulder.userData.rockVariant = 'boulder';
    
    // Restore config
    this.config.segments = originalSegments;
    this.config.irregularity = originalIrregularity;
    this.config.size = this.config.size / 2.5;
    
    return boulder;
  }
  
  /**
   * Generate gravel (small rocks)
   */
  generateGravel(count: number, area: number): THREE.Group {
    const originalSize = this.config.size;
    const originalIrregularity = this.config.irregularity;
    
    this.config.size = this.config.size * 0.08;
    this.config.irregularity = this.config.irregularity * 1.5;
    
    const gravel = this.generateCluster(count, area);
    gravel.userData.rockVariant = 'gravel';
    
    // Restore config
    this.config.size = originalSize;
    this.config.irregularity = originalIrregularity;
    
    return gravel;
  }
  
  /**
   * Generate cliff face segment
   */
  generateCliffFace(width: number, height: number, depth: number): THREE.Mesh {
    const originalConfig = { ...this.config };
    
    this.config = {
      ...this.config,
      rockType: 'cliff',
      width,
      height,
      depth,
      irregularity: this.config.irregularity * 1.5,
      noiseScale: this.config.noiseScale * 0.7,
      segments: Math.max(2, this.config.segments)
    };
    
    const cliff = this.generate();
    cliff.userData.rockVariant = 'cliff';
    
    // Restore config
    this.config = originalConfig;
    
    return cliff;
  }
  
  /**
   * Layered noise for detailed surface variation
   */
  private layeredNoise(x: number, y: number, z: number, octaves: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise.perlin3D(
        x * frequency,
        y * frequency,
        z * frequency
      );
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value / maxValue;
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<RockConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): RockConfig {
    return { ...this.config };
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.materialCache.forEach(material => material.dispose());
    this.materialCache.clear();
  }
}

export default RockGenerator;
