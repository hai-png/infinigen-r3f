/**
 * RiverNetwork - Procedural river system generation
 * 
 * Generates realistic river networks with:
 * - Watershed analysis and flow accumulation
 * - Meandering river paths
 * - Erosion and sediment transport
 * - Tributary formation
 * - Delta creation at endpoints
 * 
 * Ported from: infinigen/terrain/water/river_network.py
 */

import * as THREE from 'three';
import { Vector3 } from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';

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

interface FlowData {
  direction: number; // 0-7 for 8 directions
  accumulation: number;
  slope: number;
}

interface RiverPoint {
  position: THREE.Vector3;
  width: number;
  depth: number;
  flowRate: number;
}

export class RiverNetwork {
  private config: RiverConfig;
  private noise: NoiseUtils;
  private flowData: FlowData[] | null = null;
  
  constructor(config?: Partial<RiverConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      minElevation: 0.0,
      maxElevation: 500.0,
      riverDensity: 0.3,
      meanderIntensity: 0.5,
      erosionRate: 0.1,
      sedimentCapacity: 0.2,
      minRiverLength: 50.0,
      maxRiverLength: 500.0,
      tributaryProbability: 0.4,
      deltaSize: 20.0,
      ...config,
    };
    
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Compute flow direction and accumulation for entire heightmap
   */
  computeFlowField(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): FlowData[] {
    const flowData: FlowData[] = [];
    const cellSize = worldSize / resolution;
    
    // Initialize flow data
    for (let i = 0; i < heightmap.length; i++) {
      flowData.push({
        direction: -1,
        accumulation: 1.0, // Each cell starts with unit water
        slope: 0.0,
      });
    }
    
    // Compute flow direction using D8 algorithm (8 directions)
    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        const elevation = heightmap[idx];
        
        let steepestSlope = 0.0;
        let steepestDir = -1;
        
        // Check all 8 neighbors
        const neighbors = [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0],           [1, 0],
          [-1, 1],  [0, 1],  [1, 1]
        ];
        
        for (let d = 0; d < neighbors.length; d++) {
          const [dc, dr] = neighbors[d];
          const nc = col + dc;
          const nr = row + dr;
          
          if (nc >= 0 && nc < resolution && nr >= 0 && nr < resolution) {
            const nIdx = nr * resolution + nc;
            const nElev = heightmap[nIdx];
            
            const dist = (Math.abs(dc) + Math.abs(dr) === 2) ? 
              Math.SQRT2 * cellSize : cellSize;
            const slope = (elevation - nElev) / dist;
            
            if (slope > steepestSlope) {
              steepestSlope = slope;
              steepestDir = d;
            }
          }
        }
        
        flowData[idx].direction = steepestDir;
        flowData[idx].slope = steepestSlope;
      }
    }
    
    // Compute flow accumulation using recursive approach
    // Start from highest elevations and work down
    const visited = new Uint8Array(heightmap.length);
    const elevationOrder = heightmap
      .map((elev, idx) => ({ elev, idx }))
      .sort((a, b) => b.elev - a.elev);
    
    for (const { idx } of elevationOrder) {
      if (!visited[idx]) {
        this.traceFlow(idx, flowData, heightmap, resolution, visited);
      }
    }
    
    this.flowData = flowData;
    return flowData;
  }
  
  /**
   * Trace flow path and accumulate water
   */
  private traceFlow(
    startIdx: number,
    flowData: FlowData[],
    heightmap: Float32Array,
    resolution: number,
    visited: Uint8Array
  ): void {
    let idx = startIdx;
    const path: number[] = [];
    
    while (idx !== -1 && !visited[idx]) {
      visited[idx] = 1;
      path.push(idx);
      
      const dir = flowData[idx].direction;
      if (dir === -1) break;
      
      const row = Math.floor(idx / resolution);
      const col = idx % resolution;
      
      const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
      ];
      
      const [dc, dr] = neighbors[dir];
      const nc = col + dc;
      const nr = row + dr;
      
      if (nc >= 0 && nc < resolution && nr >= 0 && nr < resolution) {
        idx = nr * resolution + nc;
      } else {
        idx = -1;
      }
    }
    
    // Accumulate flow along path
    for (const pathIdx of path) {
      flowData[pathIdx].accumulation += 1;
    }
  }
  
  /**
   * Extract river paths from flow field
   */
  extractRiverPaths(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): RiverPoint[][] {
    if (!this.flowData) {
      throw new Error('Must call computeFlowField first');
    }
    
    const rivers: RiverPoint[][] = [];
    const cellSize = worldSize / resolution;
    const used = new Uint8Array(heightmap.length);
    
    // Find river sources (high accumulation, high elevation)
    const sources: number[] = [];
    for (let i = 0; i < heightmap.length; i++) {
      const flow = this.flowData[i];
      const row = Math.floor(i / resolution);
      const col = i % resolution;
      
      // Source criteria: high accumulation, not on edge, high elevation
      if (flow.accumulation > 10 * this.config.riverDensity &&
          col > 2 && col < resolution - 2 &&
          row > 2 && row < resolution - 2 &&
          heightmap[i] > (this.config.maxElevation - this.config.minElevation) * 0.6) {
        sources.push(i);
      }
    }
    
    // Sort sources by elevation (highest first)
    sources.sort((a, b) => heightmap[b] - heightmap[a]);
    
    // Generate rivers from sources
    for (const sourceIdx of sources) {
      if (used[sourceIdx]) continue;
      
      const riverPath = this.traceRiverPath(
        sourceIdx,
        heightmap,
        resolution,
        worldSize,
        used
      );
      
      if (riverPath.length > this.config.minRiverLength / cellSize) {
        rivers.push(riverPath);
      }
    }
    
    return rivers;
  }
  
  /**
   * Trace a single river path with meandering
   */
  private traceRiverPath(
    startIdx: number,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
    used: Uint8Array
  ): RiverPoint[] {
    const riverPoints: RiverPoint[] = [];
    const cellSize = worldSize / resolution;
    let idx = startIdx;
    let length = 0;
    
    while (idx !== -1 && length < this.config.maxRiverLength) {
      used[idx] = 1;
      
      const row = Math.floor(idx / resolution);
      const col = idx % resolution;
      const x = col * cellSize;
      const z = row * cellSize;
      const y = heightmap[idx];
      
      // Calculate river properties based on flow accumulation
      const flow = this.flowData![idx];
      const width = 1 + Math.log(flow.accumulation) * 0.5;
      const depth = 0.5 + Math.log(flow.accumulation) * 0.2;
      const flowRate = flow.accumulation;
      
      // Add meandering offset
      const meanderOffset = this.computeMeanderOffset(x, z, width);
      const meanderedX = x + meanderOffset.x;
      const meanderedZ = z + meanderOffset.z;
      
      riverPoints.push({
        position: new THREE.Vector3(meanderedX, y, meanderedZ),
        width,
        depth,
        flowRate,
      });
      
      length += cellSize;
      
      // Move to next cell downstream
      const dir = flow.direction;
      if (dir === -1) break;
      
      const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
      ];
      
      const [dc, dr] = neighbors[dir];
      const nc = col + dc;
      const nr = row + dr;
      
      if (nc >= 0 && nc < resolution && nr >= 0 && nr < resolution) {
        idx = nr * resolution + nc;
      } else {
        idx = -1;
      }
      
      // Chance to spawn tributary
      if (Math.random() < this.config.tributaryProbability && 
          riverPoints.length > 10) {
        // Tributary logic would go here
      }
    }
    
    return riverPoints;
  }
  
  /**
   * Compute meandering offset using noise
   */
  private computeMeanderOffset(
    x: number,
    z: number,
    width: number
  ): THREE.Vector3 {
    const meanderScale = 0.01;
    const nx = this.noise.perlin2D(x * meanderScale, z * meanderScale);
    const nz = this.noise.perlin2D(x * meanderScale + 100, z * meanderScale + 100);
    
    return new THREE.Vector3(
      nx * this.config.meanderIntensity * width,
      0,
      nz * this.config.meanderIntensity * width
    );
  }
  
  /**
   * Carve river channel into terrain
   */
  carveRiverChannel(
    heightmap: Float32Array,
    rivers: RiverPoint[][],
    resolution: number,
    worldSize: number
  ): Float32Array {
    const result = new Float32Array(heightmap);
    const cellSize = worldSize / resolution;
    
    for (const river of rivers) {
      for (const point of river) {
        const col = Math.round(point.position.x / cellSize);
        const row = Math.round(point.position.z / cellSize);
        
        if (col < 0 || col >= resolution || row < 0 || row >= resolution) {
          continue;
        }
        
        // Carve channel with smooth edges
        const radius = point.width * 2;
        const radiusSq = radius * radius;
        
        const minCol = Math.max(0, col - Math.ceil(radius));
        const maxCol = Math.min(resolution - 1, col + Math.ceil(radius));
        const minRow = Math.max(0, row - Math.ceil(radius));
        const maxRow = Math.min(resolution - 1, row + Math.ceil(radius));
        
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const idx = r * resolution + c;
            const dx = (c - col) * cellSize;
            const dz = (r - row) * cellSize;
            const distSq = dx * dx + dz * dz;
            
            if (distSq < radiusSq) {
              const dist = Math.sqrt(distSq);
              const normalizedDist = dist / radius;
              
              // Smooth channel profile (parabolic)
              const depthFactor = 1 - normalizedDist * normalizedDist;
              const carveDepth = point.depth * depthFactor;
              
              // Apply erosion
              const erodedY = point.position.y - carveDepth;
              result[idx] = Math.min(result[idx], erodedY);
            }
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Create delta at river endpoint
   */
  createDelta(
    riverEnd: RiverPoint,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): Float32Array {
    const result = new Float32Array(heightmap);
    const cellSize = worldSize / resolution;
    
    const col = Math.round(riverEnd.position.x / cellSize);
    const row = Math.round(riverEnd.position.z / cellSize);
    
    const deltaRadius = this.config.deltaSize / cellSize;
    
    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        const idx = r * resolution + c;
        const dx = c - col;
        const dz = r - row;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < deltaRadius) {
          const normalizedDist = dist / deltaRadius;
          const sedimentHeight = riverEnd.position.y * (1 - normalizedDist);
          
          // Deposit sediment
          result[idx] = Math.max(result[idx], sedimentHeight);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Generate complete river network
   */
  generate(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): {
    carvedTerrain: Float32Array;
    rivers: RiverPoint[][];
    flowData: FlowData[];
  } {
    // Compute flow field
    const flowData = this.computeFlowField(heightmap, resolution, worldSize);
    
    // Extract river paths
    const rivers = this.extractRiverPaths(heightmap, resolution, worldSize);
    
    // Carve river channels
    const carvedTerrain = this.carveRiverChannel(
      heightmap,
      rivers,
      resolution,
      worldSize
    );
    
    // Create deltas at river endpoints
    for (const river of rivers) {
      if (river.length > 0) {
        const endPoint = river[river.length - 1];
        // Only create delta if near base level
        if (endPoint.position.y < this.config.minElevation + 50) {
          const deltaTerrain = this.createDelta(
            endPoint,
            carvedTerrain,
            resolution,
            worldSize
          );
          // Merge delta terrain
          for (let i = 0; i < carvedTerrain.length; i++) {
            carvedTerrain[i] = Math.max(carvedTerrain[i], deltaTerrain[i]);
          }
        }
      }
    }
    
    return {
      carvedTerrain,
      rivers,
      flowData,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<RiverConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.flowData = null; // Reset flow data
  }
}
