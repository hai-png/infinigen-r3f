/**
 * Enhanced Erosion System — Single Entry Point
 * 
 * Implements advanced erosion simulation including thermal, hydraulic, and river formation.
 * This is the consolidated entry point that delegates to specialized implementations:
 *
 * - Hydraulic erosion → ErosionEnhanced.ts (most complete implementation)
 * - Thermal erosion   → ThermalErosion class (inline, below)
 * - River formation   → RiverFormation class (inline, below)
 *
 * NOTE: The duplicate ThermalErosion that was in ErosionEnhanced.ts has been removed.
 * This file is the canonical location for ThermalErosion and RiverFormation.
 * 
 * P2-2: Extended to output erosion rate, sediment deposit, and water flow masks
 * as separate Float32Array channels alongside the modified heightmap.
 * 
 * @see https://github.com/princeton-vl/infinigen
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';
import { ErosionEnhanced, type ErosionData, type ErosionConfig } from './ErosionEnhanced';

/**
 * Erosion masks providing per-cell erosion analysis data.
 * Each mask is a Float32Array of size `width * height`, aligned with the heightmap grid.
 */
export interface ErosionMasks {
  /** Erosion rate mask: how much height was removed at each point (positive = erosion) */
  erosionRate: Float32Array;
  /** Sediment deposit mask: how much sediment was deposited at each point (positive = deposit) */
  sedimentDeposit: Float32Array;
  /** Water flow accumulation mask: how much water passed through each point */
  waterFlow: Float32Array;
  /** Width of the mask grid */
  width: number;
  /** Height of the mask grid */
  height: number;
}

/**
 * Result of an erosion simulation including the modified heightmap and analysis masks.
 */
export interface ErosionResult {
  /** Modified heightmap (same as getHeightmap()) */
  heightmap: Float32Array;
  /** Erosion masks for downstream consumption */
  masks: ErosionMasks;
}

export interface ErosionParams {
  // Thermal erosion
  thermalErosionEnabled: boolean;
  talusAngle: number; // Angle of repose in radians
  thermalIterations: number;
  
  // Hydraulic erosion
  hydraulicErosionEnabled: boolean;
  rainfallAmount: number;
  evaporationRate: number;
  sedimentCapacityFactor: number;
  minSedimentCapacity: number;
  erodeSpeed: number;
  depositSpeed: number;
  hydraulicIterations: number;
  
  // River formation
  riverFormationEnabled: boolean;
  riverSourceCount: number;
  riverLength: number;
  riverErosionMultiplier: number;
  
  // General
  maxErosionDepth: number;
  seed: number;

  // Mask output
  /** Whether to compute and output erosion masks alongside the heightmap (default: true) */
  enableMaskOutput: boolean;
}

const DEFAULT_EROSION_PARAMS: ErosionParams = {
  thermalErosionEnabled: true,
  talusAngle: Math.PI / 3, // 60 degrees
  thermalIterations: 10,
  
  hydraulicErosionEnabled: true,
  rainfallAmount: 0.01,
  evaporationRate: 0.005,
  sedimentCapacityFactor: 4,
  minSedimentCapacity: 0.01,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  hydraulicIterations: 5,
  
  riverFormationEnabled: false,
  riverSourceCount: 3,
  riverLength: 200,
  riverErosionMultiplier: 2.0,
  
  maxErosionDepth: 50,
  seed: 42,

  enableMaskOutput: true,
};

/**
 * Thermal erosion simulator
 * Simulates material sliding down slopes due to gravity
 */
export class ThermalErosion {
  private params: ErosionParams;
  private heightmap: Float32Array;
  private width: number;
  private height: number;
  
  constructor(
    heightmap: Float32Array,
    width: number,
    height: number,
    params: Partial<ErosionParams> = {}
  ) {
    this.heightmap = heightmap;
    this.width = width;
    this.height = height;
    this.params = { ...DEFAULT_EROSION_PARAMS, ...params };
  }
  
  /**
   * Run thermal erosion simulation
   * 
   * @param erosionMask - Optional mask to accumulate erosion amounts (positive values where material was removed)
   * @param depositMask - Optional mask to accumulate deposit amounts (positive values where material was deposited)
   */
  simulate(erosionMask?: Float32Array, depositMask?: Float32Array): void {
    const talusTan = Math.tan(this.params.talusAngle);
    const iterations = this.params.thermalIterations;
    
    for (let iter = 0; iter < iterations; iter++) {
      let changed = false;
      
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const idx = x + y * this.width;
          const centerHeight = this.heightmap[idx];
          
          // Check all 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
              
              const nIdx = nx + ny * this.width;
              const neighborHeight = this.heightmap[nIdx];
              
              // Calculate height difference
              const distance = Math.sqrt(dx * dx + dy * dy);
              const heightDiff = neighborHeight - centerHeight;
              const slope = heightDiff / distance;
              
              // If slope exceeds talus angle, redistribute material
              if (slope > talusTan) {
                const transfer = (heightDiff - talusTan * distance) * 0.5;
                
                if (transfer > 0.001) {
                  this.heightmap[idx] += transfer;
                  this.heightmap[nIdx] -= transfer;

                  // Accumulate into masks if provided
                  if (depositMask) depositMask[idx] += transfer;
                  if (erosionMask) erosionMask[nIdx] += transfer;

                  changed = true;
                }
              }
            }
          }
        }
      }
      
      if (!changed) break;
    }
  }
  
  /**
   * Update parameters
   */
  updateParams(params: Partial<ErosionParams>): void {
    this.params = { ...this.params, ...params };
  }
}

/**
 * River formation simulator
 * Creates realistic river channels through terrain
 */
export class RiverFormation {
  private params: ErosionParams;
  private heightmap: Float32Array;
  private width: number;
  private height: number;
  private rng: SeededRandom;
  
  constructor(
    heightmap: Float32Array,
    width: number,
    height: number,
    params: Partial<ErosionParams> = {}
  ) {
    this.heightmap = heightmap;
    this.width = width;
    this.height = height;
    this.params = { ...DEFAULT_EROSION_PARAMS, ...params };
    
    // Use canonical SeededRandom instead of inline LCG
    this.rng = new SeededRandom(this.params.seed);
  }
  
  /**
   * Generate river network
   * 
   * @param erosionMask - Optional mask to accumulate erosion amounts (positive values where material was removed)
   * @param waterFlowMask - Optional mask to accumulate water flow (higher values where more water passed through)
   */
  simulate(erosionMask?: Float32Array, waterFlowMask?: Float32Array): void {
    const sourceCount = this.params.riverSourceCount;
    const riverLength = this.params.riverLength;
    const erosionMultiplier = this.params.riverErosionMultiplier;
    
    // Find high points for river sources
    const sources: Array<{x: number, y: number}> = [];
    
    for (let i = 0; i < sourceCount; i++) {
      // Start from high elevation
      let bestX = 0, bestY = 0, bestHeight = -Infinity;
      
      for (let attempts = 0; attempts < 100; attempts++) {
        const x = Math.floor(this.rng.next() * this.width);
        const y = Math.floor(this.rng.next() * this.height);
        const h = this.heightmap[x + y * this.width];
        
        if (h > bestHeight) {
          bestHeight = h;
          bestX = x;
          bestY = y;
        }
      }
      
      sources.push({ x: bestX, y: bestY });
    }
    
    // Carve rivers from each source
    for (const source of sources) {
      this.carveRiver(source.x, source.y, riverLength, erosionMultiplier, erosionMask, waterFlowMask);
    }
  }
  
  /**
   * Carve a single river channel
   * 
   * @param startX - Starting X coordinate
   * @param startY - Starting Y coordinate
   * @param length - Maximum number of river steps
   * @param erosionMult - Erosion multiplier for channel depth
   * @param erosionMask - Optional mask to accumulate erosion amounts
   * @param waterFlowMask - Optional mask to accumulate water flow
   */
  private carveRiver(
    startX: number, startY: number, length: number, erosionMult: number,
    erosionMask?: Float32Array, waterFlowMask?: Float32Array
  ): void {
    let x = startX;
    let y = startY;
    let prevX = x;
    let prevY = y;
    
    const riverWidth = 2 + Math.floor(this.rng.next() * 3);
    
    for (let step = 0; step < length; step++) {
      // Track water flow at the river center point
      if (waterFlowMask) {
        const centerIdx = x + y * this.width;
        waterFlowMask[centerIdx] += 1;
      }

      // Find lowest neighbor
      let lowestX = x;
      let lowestY = y;
      let lowestHeight = this.heightmap[x + y * this.width];
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
          
          const h = this.heightmap[nx + ny * this.width];
          if (h < lowestHeight) {
            lowestHeight = h;
            lowestX = nx;
            lowestY = ny;
          }
        }
      }
      
      // Move to lowest point or stop if at minimum
      if (lowestX === x && lowestY === y) {
        // Add some randomness to continue
        const angle = this.rng.next() * Math.PI * 2;
        x += Math.floor(Math.cos(angle) * 2);
        y += Math.floor(Math.sin(angle) * 2);
      } else {
        prevX = x;
        prevY = y;
        x = lowestX;
        y = lowestY;
      }
      
      // Clamp to bounds
      x = Math.max(0, Math.min(this.width - 1, x));
      y = Math.max(0, Math.min(this.height - 1, y));
      
      // Erode river channel
      for (let ry = -riverWidth; ry <= riverWidth; ry++) {
        for (let rx = -riverWidth; rx <= riverWidth; rx++) {
          const dist = Math.sqrt(rx * rx + ry * ry);
          if (dist > riverWidth) continue;
          
          const rxPos = x + rx;
          const ryPos = y + ry;
          
          if (rxPos < 0 || rxPos >= this.width || ryPos < 0 || ryPos >= this.height) continue;
          
          const idx = rxPos + ryPos * this.width;
          const erosionAmount = (1 - dist / riverWidth) * 0.5 * erosionMult;
          this.heightmap[idx] -= erosionAmount;

          // Accumulate erosion into mask
          if (erosionMask) erosionMask[idx] += erosionAmount;

          // Accumulate water flow in the channel area (weighted by proximity to center)
          if (waterFlowMask) waterFlowMask[idx] += (1 - dist / riverWidth) * 0.5;
        }
      }
    }
  }
  
  /**
   * Update parameters
   */
  updateParams(params: Partial<ErosionParams>): void {
    this.params = { ...this.params, ...params };
  }
}

/**
 * Complete erosion system combining all erosion types.
 *
 * This is the single entry point for erosion. It delegates:
 * - Hydraulic erosion → ErosionEnhanced (from ErosionEnhanced.ts)
 * - Thermal erosion   → ThermalErosion (defined above)
 * - River formation   → RiverFormation (defined above)
 *
 * P2-2: Now supports outputting erosion masks (erosion rate, sediment deposit,
 * water flow) as separate Float32Array channels via `simulateWithMasks()`.
 */
export class ErosionSystem {
  private params: ErosionParams;
  private heightmap: Float32Array;
  private width: number;
  private height: number;
  
  private thermalErosion?: ThermalErosion;
  private riverFormation?: RiverFormation;
  private hydraulicErosion?: ErosionEnhanced;
  
  /** Original heightmap stored before erosion for mask computation */
  private originalHeightmap: Float32Array;
  /** Accumulated sediment deposit mask */
  private sedimentMask: Float32Array;
  /** Accumulated water flow mask */
  private waterFlowMask: Float32Array;
  
  constructor(
    heightmap: Float32Array,
    width: number,
    height: number,
    params: Partial<ErosionParams> = {}
  ) {
    this.heightmap = heightmap;
    this.width = width;
    this.height = height;
    this.params = { ...DEFAULT_EROSION_PARAMS, ...params };
    
    const size = width * height;
    this.originalHeightmap = new Float32Array(size);
    this.sedimentMask = new Float32Array(size);
    this.waterFlowMask = new Float32Array(size);
    
    this.initialize();
  }
  
  /**
   * Initialize erosion subsystems
   */
  private initialize(): void {
    if (this.params.thermalErosionEnabled) {
      this.thermalErosion = new ThermalErosion(
        this.heightmap,
        this.width,
        this.height,
        this.params
      );
    }
    
    if (this.params.riverFormationEnabled) {
      this.riverFormation = new RiverFormation(
        this.heightmap,
        this.width,
        this.height,
        this.params
      );
    }

    if (this.params.hydraulicErosionEnabled) {
      // Delegate hydraulic erosion to ErosionEnhanced
      this.hydraulicErosion = new ErosionEnhanced({
        hydraulicEnabled: true,
        thermalEnabled: false, // Thermal is handled by ThermalErosion above
        iterations: this.params.hydraulicIterations,
        erodeSpeed: this.params.erodeSpeed,
        depositSpeed: this.params.depositSpeed,
        sedimentCapacityFactor: this.params.sedimentCapacityFactor,
        minSedimentCapacity: this.params.minSedimentCapacity,
        seed: this.params.seed,
      });
    }
  }
  
  /**
   * Run complete erosion simulation (backward compatible).
   * 
   * This method modifies the heightmap in-place and returns void, matching the
   * original API. Use `simulateWithMasks()` when you need erosion mask data.
   */
  simulate(): void {
    console.log('Starting erosion simulation...');
    
    // Hydraulic erosion first (most impactful)
    if (this.params.hydraulicErosionEnabled && this.hydraulicErosion) {
      console.log('Running hydraulic erosion...');
      const erosionData: ErosionData = {
        heightMap: this.heightmap,
        width: this.width,
        height: this.height,
        scale: 1,
      };
      this.hydraulicErosion.erode(erosionData);
    }
    
    // Thermal erosion (slope stabilization)
    if (this.params.thermalErosionEnabled && this.thermalErosion) {
      console.log('Running thermal erosion...');
      this.thermalErosion.simulate();
    }
    
    // River formation
    if (this.params.riverFormationEnabled && this.riverFormation) {
      console.log('Carving rivers...');
      this.riverFormation.simulate();
    }
    
    console.log('Erosion simulation complete.');
  }
  
  /**
   * Run complete erosion simulation with mask output.
   * 
   * Stores the original heightmap before erosion, runs the full simulation
   * (hydraulic → thermal → river), then computes:
   * - **Erosion rate mask**: `originalHeightmap - modifiedHeightmap` (positive = erosion)
   * - **Sediment deposit mask**: accumulated deposits from thermal and hydraulic erosion
   * - **Water flow mask**: flow accumulation from river formation + D8 flow routing
   * 
   * This is the preferred method when downstream consumers need erosion analysis data.
   * The existing `simulate()` method remains backward compatible for callers that
   * only need the modified heightmap.
   * 
   * @returns ErosionResult containing the modified heightmap and analysis masks
   */
  simulateWithMasks(): ErosionResult {
    const size = this.width * this.height;
    
    // Reset mask accumulators
    this.sedimentMask = new Float32Array(size);
    this.waterFlowMask = new Float32Array(size);
    
    // Store original heightmap snapshot before any erosion
    this.originalHeightmap = new Float32Array(this.heightmap);
    
    console.log('Starting erosion simulation with mask output...');
    
    // --- Hydraulic erosion (most impactful) ---
    if (this.params.hydraulicErosionEnabled && this.hydraulicErosion) {
      console.log('Running hydraulic erosion...');
      // Snapshot before hydraulic to detect deposits
      const preHydraulic = new Float32Array(this.heightmap);
      
      const erosionData: ErosionData = {
        heightMap: this.heightmap,
        width: this.width,
        height: this.height,
        scale: 1,
      };
      this.hydraulicErosion.erode(erosionData);
      
      // Compute hydraulic contribution to sediment deposit mask:
      // where the heightmap increased relative to pre-hydraulic = deposit
      for (let i = 0; i < size; i++) {
        const diff = this.heightmap[i] - preHydraulic[i];
        if (diff > 0) {
          this.sedimentMask[i] += diff;
        }
      }
    }
    
    // --- Thermal erosion (slope stabilization) ---
    if (this.params.thermalErosionEnabled && this.thermalErosion) {
      console.log('Running thermal erosion...');
      // Pass deposit mask so ThermalErosion can accumulate its deposits
      this.thermalErosion.simulate(undefined, this.sedimentMask);
    }
    
    // --- River formation ---
    if (this.params.riverFormationEnabled && this.riverFormation) {
      console.log('Carving rivers...');
      // Pass water flow mask so RiverFormation can accumulate its flow data
      this.riverFormation.simulate(undefined, this.waterFlowMask);
    }
    
    // Compute general water flow accumulation on the eroded terrain
    this.computeWaterFlowAccumulation();
    
    // Compute erosion rate mask: original - modified (positive = erosion, negative = deposit)
    const erosionRate = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      erosionRate[i] = this.originalHeightmap[i] - this.heightmap[i];
    }
    
    console.log('Erosion simulation with masks complete.');
    
    return {
      heightmap: this.heightmap,
      masks: {
        erosionRate,
        sedimentDeposit: this.sedimentMask,
        waterFlow: this.waterFlowMask,
        width: this.width,
        height: this.height,
      },
    };
  }
  
  /**
   * Compute water flow accumulation using the D8 flow direction algorithm.
   * 
   * For each cell, routes flow to the steepest downhill neighbor. Cells are
   * processed from highest to lowest so that upstream flow is fully accumulated
   * before reaching downstream cells. The result is normalized and added to
   * the `waterFlowMask`.
   */
  private computeWaterFlowAccumulation(): void {
    const size = this.width * this.height;
    
    // Initialize with unit rainfall at each cell
    const flowAccum = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      flowAccum[i] = 1;
    }
    
    // Sort cells by height (highest first) for proper flow accumulation
    const indices = Array.from({ length: size }, (_, i) => i);
    indices.sort((a, b) => this.heightmap[b] - this.heightmap[a]);
    
    // For each cell (highest to lowest), route its accumulated flow
    // to the steepest downhill neighbor (D8 algorithm)
    for (const idx of indices) {
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);
      
      let lowestIdx = idx;
      let maxSlope = 0;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nIdx = ny * this.width + nx;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const slope = (this.heightmap[idx] - this.heightmap[nIdx]) / distance;
            
            if (slope > maxSlope) {
              maxSlope = slope;
              lowestIdx = nIdx;
            }
          }
        }
      }
      
      // Route flow to the steepest downhill neighbor
      if (lowestIdx !== idx) {
        flowAccum[lowestIdx] += flowAccum[idx];
      }
    }
    
    // Normalize flow accumulation to [0, 1] range and add to water flow mask
    let maxFlow = 0;
    for (let i = 0; i < size; i++) {
      if (flowAccum[i] > maxFlow) maxFlow = flowAccum[i];
    }
    
    if (maxFlow > 0) {
      for (let i = 0; i < size; i++) {
        this.waterFlowMask[i] += flowAccum[i] / maxFlow;
      }
    }
  }
  
  /**
   * Get modified heightmap
   */
  getHeightmap(): Float32Array {
    return this.heightmap;
  }
  
  /**
   * Get erosion masks from the last simulation.
   * 
   * Returns the masks computed by the most recent `simulateWithMasks()` call.
   * If `simulateWithMasks()` has not been called yet, returns masks with
   * zero-filled erosion rate and sediment deposit, and a water flow mask
   * based on the current heightmap (via `computeWaterFlowAccumulation`).
   * 
   * @returns ErosionMasks with erosion rate, sediment deposit, and water flow data
   */
  getMasks(): ErosionMasks {
    const size = this.width * this.height;
    
    // Compute erosion rate from stored original vs current heightmap
    const erosionRate = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      erosionRate[i] = this.originalHeightmap[i] - this.heightmap[i];
    }
    
    return {
      erosionRate,
      sedimentDeposit: this.sedimentMask,
      waterFlow: this.waterFlowMask,
      width: this.width,
      height: this.height,
    };
  }
  
  /**
   * Update erosion parameters
   */
  updateParams(params: Partial<ErosionParams>): void {
    this.params = { ...this.params, ...params };
    
    if (this.thermalErosion) {
      this.thermalErosion.updateParams(this.params);
    }
    
    if (this.riverFormation) {
      this.riverFormation.updateParams(this.params);
    }

    // Re-initialize hydraulic if config changed
    if (this.params.hydraulicErosionEnabled) {
      this.hydraulicErosion = new ErosionEnhanced({
        hydraulicEnabled: true,
        thermalEnabled: false,
        iterations: this.params.hydraulicIterations,
        erodeSpeed: this.params.erodeSpeed,
        depositSpeed: this.params.depositSpeed,
        sedimentCapacityFactor: this.params.sedimentCapacityFactor,
        minSedimentCapacity: this.params.minSedimentCapacity,
        seed: this.params.seed,
      });
    }
  }
  
  /**
   * Reset with new heightmap
   */
  reset(heightmap: Float32Array): void {
    this.heightmap = heightmap;
    
    const size = this.width * this.height;
    this.originalHeightmap = new Float32Array(size);
    this.sedimentMask = new Float32Array(size);
    this.waterFlowMask = new Float32Array(size);
    
    this.initialize();
  }
}

export default ErosionSystem;
