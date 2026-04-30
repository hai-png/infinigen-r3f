/**
 * WaterfallGenerator - Procedural waterfall generation system
 * 
 * Generates realistic waterfalls with:
 * - Cliff detection and waterfall placement
 * - Multi-tier waterfall structures
 * - Plunge pool erosion
 * - Mist particle generation
 * - Sound zone markers
 * 
 * Ported from: infinigen/terrain/water/waterfall_generator.py
 */

import * as THREE from 'three';
import { Vector3 } from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';
import { RiverPoint } from './RiverNetwork';

export interface WaterfallConfig {
  seed: number;
  minHeight: number;
  maxHeight: number;
  minSlope: number;
  plungePoolRadius: number;
  plungePoolDepth: number;
  mistDensity: number;
  tierProbability: number;
}

export interface Waterfall {
  position: Vector3;
  height: number;
  width: number;
  flowRate: number;
  tiers: WaterfallTier[];
  plungePool: PlungePool;
  mistParticles: Vector3[];
}

export interface WaterfallTier {
  position: Vector3;
  height: number;
  width: number;
  overhang: number;
}

export interface PlungePool {
  position: Vector3;
  radius: number;
  depth: number;
  erosion: Float32Array;
}

export class WaterfallGenerator {
  private config: WaterfallConfig;
  private noise: NoiseUtils;
  
  constructor(config?: Partial<WaterfallConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      minHeight: 5.0,
      maxHeight: 100.0,
      minSlope: 1.5,
      plungePoolRadius: 10.0,
      plungePoolDepth: 5.0,
      mistDensity: 0.7,
      tierProbability: 0.3,
      ...config,
    };
    
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Detect potential waterfall locations along river paths
   */
  detectWaterfallLocations(
    rivers: RiverPoint[][],
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): { riverPoint: RiverPoint; slope: number; height: number }[] {
    const locations: { riverPoint: RiverPoint; slope: number; height: number }[] = [];
    const cellSize = worldSize / resolution;
    
    for (const river of rivers) {
      for (let i = 0; i < river.length - 1; i++) {
        const current = river[i];
        const next = river[i + 1];
        
        const dx = next.position.x - current.position.x;
        const dz = next.position.z - current.position.z;
        const dy = next.position.y - current.position.y;
        
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        if (horizontalDist < 0.001) continue;
        
        const slope = Math.abs(dy) / horizontalDist;
        
        // Check if this is a significant drop
        if (slope > this.config.minSlope && Math.abs(dy) > this.config.minHeight) {
          locations.push({
            riverPoint: current,
            slope,
            height: Math.abs(dy),
          });
        }
      }
    }
    
    return locations;
  }
  
  /**
   * Generate waterfall structure at detected location
   */
  generateWaterfall(
    location: { riverPoint: RiverPoint; slope: number; height: number },
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): Waterfall | null {
    const { riverPoint, height, slope } = location;
    
    // Clamp height to configured range
    const clampedHeight = Math.max(
      this.config.minHeight,
      Math.min(this.config.maxHeight, height)
    );
    
    // Determine number of tiers
    const numTiers = this.determineNumTiers(clampedHeight);
    
    // Generate tiers
    const tiers: WaterfallTier[] = [];
    let currentY = riverPoint.position.y;
    let currentX = riverPoint.position.x;
    let currentZ = riverPoint.position.z;
    
    const remainingHeight = clampedHeight;
    const heightPerTier = remainingHeight / numTiers;
    
    for (let i = 0; i < numTiers; i++) {
      const tierHeight = heightPerTier * (0.8 + Math.random() * 0.4);
      const tierWidth = riverPoint.width * (1.5 - i * 0.2);
      const overhang = this.computeOverhang(tierHeight, tierWidth);
      
      tiers.push({
        position: new Vector3(currentX, currentY, currentZ),
        height: tierHeight,
        width: Math.max(2, tierWidth),
        overhang,
      });
      
      currentY -= tierHeight;
      currentX += (Math.random() - 0.5) * tierWidth * 0.3;
      currentZ += (Math.random() - 0.5) * tierWidth * 0.3;
    }
    
    // Generate plunge pool
    const plungePool = this.generatePlungePool(
      new Vector3(currentX, currentY, currentZ),
      riverPoint.width,
      heightmap,
      resolution,
      worldSize
    );
    
    // Generate mist particles
    const mistParticles = this.generateMistParticles(tiers, plungePool);
    
    return {
      position: riverPoint.position.clone(),
      height: clampedHeight,
      width: riverPoint.width,
      flowRate: riverPoint.flowRate,
      tiers,
      plungePool,
      mistParticles,
    };
  }
  
  /**
   * Determine number of tiers based on waterfall height
   */
  private determineNumTiers(height: number): number {
    if (height < 15) return 1;
    if (height < 30) return Math.random() < this.config.tierProbability ? 2 : 1;
    if (height < 60) return Math.random() < 0.5 ? 2 : 3;
    return 3 + Math.floor(Math.random() * 2);
  }
  
  /**
   * Compute cliff overhang for realistic waterfall profile
   */
  private computeOverhang(height: number, width: number): number {
    const baseOverhang = height * 0.1;
    const noiseFactor = this.noise.perlin2D(width * 0.1, height * 0.1);
    return baseOverhang * (0.8 + noiseFactor * 0.4);
  }
  
  /**
   * Generate plunge pool at waterfall base
   */
  private generatePlungePool(
    basePosition: Vector3,
    riverWidth: number,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): PlungePool {
    const cellSize = worldSize / resolution;
    const poolRadius = this.config.plungePoolRadius * (riverWidth / 5);
    const poolDepth = this.config.plungePoolDepth * (riverWidth / 5);
    
    const col = Math.round(basePosition.x / cellSize);
    const row = Math.round(basePosition.z / cellSize);
    
    // Create erosion pattern for plunge pool
    const erosion = new Float32Array(resolution * resolution);
    const radiusInCells = poolRadius / cellSize;
    
    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        const idx = r * resolution + c;
        const dx = c - col;
        const dz = r - row;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < radiusInCells) {
          const normalizedDist = dist / radiusInCells;
          
          // Bowl-shaped depression
          const depthFactor = 1 - Math.pow(normalizedDist, 2);
          const erosionDepth = poolDepth * depthFactor;
          
          // Add turbulence patterns
          const turbulence = this.noise.perlin2D(c * 0.2, r * 0.2) * 0.3;
          erosion[idx] = erosionDepth * (1 + turbulence);
        } else {
          erosion[idx] = 0;
        }
      }
    }
    
    return {
      position: basePosition.clone(),
      radius: poolRadius,
      depth: poolDepth,
      erosion,
    };
  }
  
  /**
   * Generate mist particle positions
   */
  private generateMistParticles(
    tiers: WaterfallTier[],
    plungePool: PlungePool
  ): Vector3[] {
    const particles: Vector3[] = [];
    const particleCount = Math.floor(100 * this.config.mistDensity);
    
    // Mist from each tier impact
    for (const tier of tiers) {
      const impactX = tier.position.x;
      const impactZ = tier.position.z;
      const impactY = tier.position.y - tier.height;
      
      for (let i = 0; i < particleCount / tiers.length; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * tier.width * 1.5;
        
        particles.push(new Vector3(
          impactX + Math.cos(angle) * radius,
          impactY + Math.random() * tier.height * 0.5,
          impactZ + Math.sin(angle) * radius
        ));
      }
    }
    
    // Mist from plunge pool
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * plungePool.radius;
      
      particles.push(new Vector3(
        plungePool.position.x + Math.cos(angle) * radius,
        plungePool.position.y + Math.random() * plungePool.depth * 0.3,
        plungePool.position.z + Math.sin(angle) * radius
      ));
    }
    
    return particles;
  }
  
  /**
   * Carve waterfall into terrain
   */
  carveWaterfall(
    heightmap: Float32Array,
    waterfall: Waterfall,
    resolution: number,
    worldSize: number
  ): Float32Array {
    const result = new Float32Array(heightmap);
    const cellSize = worldSize / resolution;
    
    // Carve each tier
    for (const tier of waterfall.tiers) {
      const col = Math.round(tier.position.x / cellSize);
      const row = Math.round(tier.position.z / cellSize);
      
      // Carve vertical drop
      const widthInCells = Math.ceil(tier.width / cellSize);
      const overhangInCells = Math.ceil(tier.overhang / cellSize);
      
      for (let r = row - widthInCells; r <= row + widthInCells; r++) {
        for (let c = col - overhangInCells; c <= col + widthInCells; c++) {
          if (c < 0 || c >= resolution || r < 0 || r >= resolution) continue;
          
          const idx = r * resolution + c;
          const dx = (c - col) * cellSize;
          const dz = (r - row) * cellSize;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist < tier.width) {
            // Create vertical cliff face
            const cliffY = tier.position.y - tier.height;
            result[idx] = Math.min(result[idx], cliffY);
            
            // Add overhang
            if (dx < tier.overhang && dx > 0) {
              const overhangY = tier.position.y - (dx / tier.overhang) * tier.height * 0.3;
              result[idx] = Math.min(result[idx], overhangY);
            }
          }
        }
      }
    }
    
    // Apply plunge pool erosion
    const poolCol = Math.round(waterfall.plungePool.position.x / cellSize);
    const poolRow = Math.round(waterfall.plungePool.position.z / cellSize);
    
    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        const idx = r * resolution + c;
        const poolErosion = waterfall.plungePool.erosion[idx];
        
        if (poolErosion > 0) {
          result[idx] -= poolErosion;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Create waterfall mesh geometry
   */
  createWaterfallMesh(waterfall: Waterfall): THREE.BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    
    let vertexIndex = 0;
    
    // Create mesh for each tier
    for (const tier of waterfall.tiers) {
      const segments = Math.max(8, Math.floor(tier.width * 2));
      const heightSegments = Math.max(4, Math.floor(tier.height / 5));
      
      // Top edge
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = tier.position.x - tier.width / 2 + t * tier.width;
        const z = tier.position.z + Math.sin(t * Math.PI) * tier.width * 0.2;
        
        vertices.push(x, tier.position.y, z);
        uvs.push(t, 0);
      }
      
      // Bottom edge
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = tier.position.x - tier.width / 2 + t * tier.width;
        const z = tier.position.z + Math.sin(t * Math.PI) * tier.width * 0.2;
        const y = tier.position.y - tier.height;
        
        vertices.push(x, y, z);
        uvs.push(t, 1);
      }
      
      // Create triangles
      for (let i = 0; i < segments; i++) {
        const baseIdx = vertexIndex + i * 2;
        indices.push(
          baseIdx, baseIdx + 1, baseIdx + 2,
          baseIdx + 1, baseIdx + 3, baseIdx + 2
        );
      }
      
      vertexIndex += (segments + 1) * 2;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create waterfall material
   */
  createWaterfallMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x88ccff),
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 0.5,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x4488ff),
      emissiveIntensity: 0.1,
    });
  }
  
  /**
   * Generate all waterfalls in scene
   */
  generate(
    rivers: RiverPoint[][],
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): {
    waterfalls: Waterfall[];
    carvedTerrain: Float32Array;
  } {
    // Detect potential locations
    const locations = this.detectWaterfallLocations(
      rivers, heightmap, resolution, worldSize
    );
    
    const waterfalls: Waterfall[] = [];
    let terrain = new Float32Array(heightmap);
    
    // Generate waterfall at each suitable location
    for (const location of locations) {
      const waterfall = this.generateWaterfall(
        location, terrain, resolution, worldSize
      );
      
      if (waterfall) {
        waterfalls.push(waterfall);
        terrain = this.carveWaterfall(terrain, waterfall, resolution, worldSize);
      }
    }
    
    return {
      waterfalls,
      carvedTerrain: terrain,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<WaterfallConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }
}
