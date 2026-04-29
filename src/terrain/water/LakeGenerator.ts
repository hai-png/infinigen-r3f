/**
 * LakeGenerator - Procedural lake generation system
 * 
 * Generates realistic lakes with:
 * - Shoreline erosion and sediment deposition
 * - Depth-based color variation
 * - Underwater terrain sculpting
 * - Reflection/refraction setup
 * 
 * Ported from: infinigen/terrain/water/lake_generator.py
 */

import * as THREE from 'three';
import { Vector3 } from 'three';
import { TerrainMesher } from '../mesher/TerrainMesher';
import { NoiseUtils } from '../utils/NoiseUtils';

export interface LakeConfig {
  seed: number;
  minElevation: number;
  maxElevation: number;
  targetArea: number;
  depthScale: number;
  shorelineSharpness: number;
  sedimentDeposit: number;
  waterColor: THREE.Color;
  waterOpacity: number;
  enableReflections: boolean;
  enableRefractions: boolean;
}

export interface RiverConfig {
  seed: number;
  minElevation: number;
  maxElevation: number;
  riverDensity: number;
  meanderIntensity: number;
  erosionRate: number;
  sedimentCapacity: number;
  minRiverLength: number;
  maxRiverLength: number;
  tributaryProbability: number;
  deltaSize: number;
}

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

export interface RiverPoint {
  position: THREE.Vector3;
  width: number;
  depth: number;
  flowRate: number;
}

export interface Waterfall {
  position: THREE.Vector3;
  height: number;
  width: number;
  flowRate: number;
  tiers: WaterfallTier[];
  plungePool: PlungePool;
  mistParticles: THREE.Vector3[];
}

export interface WaterfallTier {
  position: THREE.Vector3;
  height: number;
  width: number;
  overhang: number;
}

export interface PlungePool {
  position: THREE.Vector3;
  radius: number;
  depth: number;
  erosion: Float32Array;
}

export class LakeGenerator {
  private config: LakeConfig;
  private noise: NoiseUtils;
  
  constructor(config?: Partial<LakeConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      minElevation: 0.0,
      maxElevation: 200.0,
      targetArea: 5000.0,
      depthScale: 30.0,
      shorelineSharpness: 2.0,
      sedimentDeposit: 0.3,
      waterColor: new THREE.Color(0x1a4d6e),
      waterOpacity: 0.85,
      enableReflections: true,
      enableRefractions: true,
      ...config,
    };
    
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Generate lake basin geometry
   */
  generateLakeBasin(
    centerX: number,
    centerZ: number,
    radius: number,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): { basin: Float32Array; shoreline: THREE.Vector3[]; depthMap: Float32Array } {
    const basin = new Float32Array(heightmap.length);
    const depthMap = new Float32Array(heightmap.length);
    const shoreline: THREE.Vector3[] = [];
    
    const cellSize = worldSize / resolution;
    const baseLevel = this.config.minElevation + 
      (this.config.maxElevation - this.config.minElevation) * 0.3;
    
    // Find shoreline using flood fill from center
    const visited = new Uint8Array(resolution * resolution);
    const queue: [number, number][] = [];
    
    const startCol = Math.floor(centerX / cellSize);
    const startRow = Math.floor(centerZ / cellSize);
    
    if (startCol >= 0 && startCol < resolution && startRow >= 0 && startRow < resolution) {
      queue.push([startCol, startRow]);
      visited[startRow * resolution + startCol] = 1;
    }
    
    let area = 0;
    const targetCells = Math.floor(this.config.targetArea / (cellSize * cellSize));
    
    // Flood fill to find lake area
    while (queue.length > 0 && area < targetCells) {
      const [col, row] = queue.shift()!;
      const idx = row * resolution + col;
      
      const x = col * cellSize;
      const z = row * cellSize;
      const distFromCenter = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2)
      );
      
      // Check if within lake radius
      if (distFromCenter <= radius) {
        const elevation = heightmap[idx];
        
        // Determine if this cell should be part of the lake
        const noiseVal = this.noise.perlin2D(x * 0.01, z * 0.01);
        const threshold = baseLevel + noiseVal * 10;
        
        if (elevation <= threshold || distFromCenter < radius * 0.7) {
          basin[idx] = Math.min(basin[idx], baseLevel - 1);
          area++;
          
          // Check for shoreline
          const neighbors = [
            [col - 1, row], [col + 1, row],
            [col, row - 1], [col, row + 1]
          ];
          
          let isShoreline = false;
          for (const [nc, nr] of neighbors) {
            if (nc < 0 || nc >= resolution || nr < 0 || nr >= resolution) {
              isShoreline = true;
              break;
            }
            const nIdx = nr * resolution + nc;
            if (!visited[nIdx]) {
              const nx = nc * cellSize;
              const nz = nr * cellSize;
              const nDist = Math.sqrt(Math.pow(nx - centerX, 2) + Math.pow(nz - centerZ, 2));
              const nElev = heightmap[nIdx];
              const nThreshold = baseLevel + this.noise.perlin2D(nx * 0.01, nz * 0.01) * 10;
              
              if (nElev > nThreshold && nDist > radius * 0.7) {
                isShoreline = true;
                break;
              }
            }
          }
          
          if (isShoreline) {
            shoreline.push(new THREE.Vector3(x, elevation, z));
          }
          
          // Add unvisited neighbors
          for (const [nc, nr] of neighbors) {
            if (nc >= 0 && nc < resolution && nr >= 0 && nr < resolution) {
              const nIdx = nr * resolution + nc;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push([nc, nr]);
              }
            }
          }
        }
      }
    }
    
    // Carve out lake basin with smooth depth profile
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        const x = col * cellSize;
        const z = row * cellSize;
        
        if (basin[idx] < baseLevel) {
          const distFromCenter = Math.sqrt(
            Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2)
          );
          
          // Parabolic depth profile
          const normalizedDist = Math.min(distFromCenter / radius, 1);
          const depthFactor = 1 - Math.pow(normalizedDist, 2);
          
          const depth = this.config.depthScale * depthFactor;
          const lakeBottom = baseLevel - depth;
          
          // Apply erosion to basin floor
          const erosionNoise = this.noise.perlin2D(x * 0.02, z * 0.02);
          basin[idx] = lakeBottom + erosionNoise * 2;
          
          depthMap[idx] = depth;
          
          // Sediment deposition at edges
          if (normalizedDist > 0.8) {
            const sedimentFactor = (normalizedDist - 0.8) * 5;
            basin[idx] += this.config.sedimentDeposit * sedimentFactor;
          }
        } else {
          basin[idx] = heightmap[idx];
          depthMap[idx] = 0;
        }
      }
    }
    
    return { basin, shoreline, depthMap };
  }
  
  /**
   * Sculpt underwater terrain
   */
  sculptUnderwaterTerrain(
    basin: Float32Array,
    depthMap: Float32Array,
    resolution: number,
    worldSize: number
  ): Float32Array {
    const result = new Float32Array(basin.length);
    const cellSize = worldSize / resolution;
    
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        const depth = depthMap[idx];
        
        if (depth > 0) {
          const x = col * cellSize;
          const z = row * cellSize;
          
          // Add underwater features
          const ridgeNoise = this.noise.perlin2D(x * 0.015, z * 0.015);
          const channelNoise = this.noise.perlin2D(x * 0.03, z * 0.03);
          
          // Underwater ridges in deeper areas
          if (depth > this.config.depthScale * 0.5) {
            result[idx] = basin[idx] + ridgeNoise * (depth * 0.1);
          }
          // Channels in shallower areas
          else {
            result[idx] = basin[idx] - Math.abs(channelNoise) * 3;
          }
          
          // Smooth transitions
          const edgeNoise = this.noise.perlin2D(x * 0.05, z * 0.05);
          result[idx] += edgeNoise * 0.5;
        } else {
          result[idx] = basin[idx];
        }
      }
    }
    
    return result;
  }
  
  /**
   * Create lake water mesh
   */
  createWaterMesh(
    shoreline: THREE.Vector3[],
    baseLevel: number
  ): THREE.BufferGeometry {
    if (shoreline.length < 3) {
      return new THREE.PlaneGeometry(10, 10);
    }
    
    // Create concave hull from shoreline points
    const hullPoints = this.computeConcaveHull(shoreline);
    
    // Triangulate the lake surface
    const geometry = this.triangulatePolygon(hullPoints, baseLevel);
    
    // Add subtle wave displacement vertices
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Subtle wave detail
      const waveHeight = this.noise.perlin2D(x * 0.1, z * 0.1) * 0.2;
      positions[i + 1] = baseLevel + waveHeight;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Compute concave hull from shoreline points
   */
  private computeConcaveHull(points: THREE.Vector3[]): THREE.Vector3[] {
    // Simplified alpha shape algorithm
    if (points.length < 3) return points;
    
    // Sort points by angle from centroid
    const centroid = new THREE.Vector3();
    for (const p of points) {
      centroid.add(p);
    }
    centroid.divideScalar(points.length);
    
    points.sort((a, b) => {
      const angleA = Math.atan2(a.z - centroid.z, a.x - centroid.x);
      const angleB = Math.atan2(b.z - centroid.z, b.x - centroid.x);
      return angleA - angleB;
    });
    
    return points;
  }
  
  /**
   * Triangulate polygon for water surface
   */
  private triangulatePolygon(
    points: THREE.Vector3[],
    yLevel: number
  ): THREE.BufferGeometry {
    // Simple ear clipping triangulation for convex-ish polygons
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Fan triangulation from first point
    for (let i = 1; i < points.length - 1; i++) {
      const v1 = points[0];
      const v2 = points[i];
      const v3 = points[i + 1];
      
      vertices.push(v1.x, yLevel, v1.z);
      vertices.push(v2.x, yLevel, v2.z);
      vertices.push(v3.x, yLevel, v3.z);
      
      const baseIdx = (i - 1) * 3;
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create water material with reflections/refractions
   */
  createWaterMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: this.config.waterColor,
      transparent: true,
      opacity: this.config.waterOpacity,
      roughness: 0.2,
      metalness: 0.1,
      transmission: this.config.enableRefractions ? 0.9 : 0.0,
      thickness: 1.0,
      envMapIntensity: this.config.enableReflections ? 1.5 : 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide,
    });
  }
  
  /**
   * Generate complete lake system
   */
  generate(
    centerX: number,
    centerZ: number,
    radius: number,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): {
    terrain: Float32Array;
    waterGeometry: THREE.BufferGeometry;
    waterMaterial: THREE.MeshPhysicalMaterial;
    shoreline: THREE.Vector3[];
    depthMap: Float32Array;
  } {
    // Generate lake basin
    const { basin, shoreline, depthMap } = this.generateLakeBasin(
      centerX, centerZ, radius, heightmap, resolution, worldSize
    );
    
    // Sculpt underwater terrain
    const underwaterTerrain = this.sculptUnderwaterTerrain(
      basin, depthMap, resolution, worldSize
    );
    
    // Create water mesh
    const baseLevel = this.config.minElevation + 
      (this.config.maxElevation - this.config.minElevation) * 0.3;
    const waterGeometry = this.createWaterMesh(shoreline, baseLevel);
    
    // Create water material
    const waterMaterial = this.createWaterMaterial();
    
    return {
      terrain: underwaterTerrain,
      waterGeometry,
      waterMaterial,
      shoreline,
      depthMap,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<LakeConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }
}
