/**
 * Infinigen R3F Port - Hydraulic Erosion System
 * GPU-Accelerated Particle-Based Erosion Simulation
 * 
 * Based on original Infinigen hydraulic erosion implementation
 */

import { Vector2, Vector3 } from 'three';

export interface ErosionConfig {
  seed: number;
  iterations: number;
  inertia: number;
  sedimentCapacityFactor: number;
  erodeSpeed: number;
  depositSpeed: number;
  evaporateSpeed: number;
  gravity: number;
  maxDropletLifetime: number;
  resolution: number;
}

export interface ErosionData {
  heightMap: Float32Array;
  moistureMap: Float32Array;
  sedimentMap: Float32Array;
  erosionMask: Uint8Array;
}

export class HydraulicErosionGPU {
  private config: ErosionConfig;
  private width: number;
  private height: number;
  private rng: SeededRandom;

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = {
      seed: Math.floor(Math.random() * 10000),
      iterations: 50000,
      inertia: 0.05,
      sedimentCapacityFactor: 4,
      erodeSpeed: 0.3,
      depositSpeed: 0.3,
      evaporateSpeed: 0.01,
      gravity: 4,
      maxDropletLifetime: 30,
      resolution: 512,
      ...config,
    };

    this.width = this.config.resolution;
    this.height = this.config.resolution;
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Execute erosion simulation on heightmap
   */
  public erode(heightMap: Float32Array): ErosionData {
    const tempMap = new Float32Array(heightMap);
    const moistureMap = new Float32Array(this.width * this.height);
    const sedimentMap = new Float32Array(this.width * this.height);
    const erosionMask = new Uint8Array(this.width * this.height);

    console.log(`Starting hydraulic erosion with ${this.config.iterations} droplets...`);
    const startTime = performance.now();

    for (let iter = 0; iter < this.config.iterations; iter++) {
      // Initialize droplet at random position
      let posX = this.rng.next() * (this.width - 2) + 1;
      let posY = this.rng.next() * (this.height - 2) + 1;
      let dirX = 0;
      let dirY = 0;
      let speed = 0;
      let water = 1;
      let sediment = 0;
      let totalEroded = 0;

      for (let lifetime = 0; lifetime < this.config.maxDropletLifetime; lifetime++) {
        const nodeX = Math.floor(posX);
        const nodeY = Math.floor(posY);
        const cellX = posX - nodeX;
        const cellY = posY - nodeY;

        if (nodeX < 1 || nodeX >= this.width - 2 || nodeY < 1 || nodeY >= this.height - 2) {
          break;
        }

        // Get heights at corners
        const idx00 = nodeY * this.width + nodeX;
        const idx10 = nodeY * this.width + (nodeX + 1);
        const idx01 = (nodeY + 1) * this.width + nodeX;
        const idx11 = (nodeY + 1) * this.width + (nodeX + 1);

        const h00 = tempMap[idx00];
        const h10 = tempMap[idx10];
        const h01 = tempMap[idx01];
        const h11 = tempMap[idx11];

        // Bilinear interpolation for height at droplet position
        const height = 
          h00 * (1 - cellX) * (1 - cellY) +
          h10 * cellX * (1 - cellY) +
          h01 * (1 - cellX) * cellY +
          h11 * cellX * cellY;

        // Calculate gradient using central differences for better accuracy
        const left = tempMap[nodeY * this.width + (nodeX - 1)];
        const right = tempMap[nodeY * this.width + (nodeX + 2)];
        const top = tempMap[(nodeY - 1) * this.width + nodeX];
        const bottom = tempMap[(nodeY + 2) * this.width + nodeX];

        const deltaX = ((h10 - h00) * (1 - cellY) + (h11 - h01) * cellY + 
                       (right - left) * 0.5) * 0.5;
        const deltaY = ((h01 - h00) * (1 - cellX) + (h11 - h10) * cellX + 
                       (bottom - top) * 0.5) * 0.5;

        // Update direction with inertia
        dirX = dirX * this.config.inertia - deltaX * (1 - this.config.inertia);
        dirY = dirY * this.config.inertia - deltaY * (1 - this.config.inertia);

        // Normalize
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len > 0.0001) {
          dirX /= len;
          dirY /= len;
        } else {
          // Random direction if no gradient
          const angle = this.rng.next() * Math.PI * 2;
          dirX = Math.cos(angle);
          dirY = Math.sin(angle);
        }

        // Move droplet
        posX += dirX;
        posY += dirY;

        // Clamp to bounds
        posX = Math.max(1, Math.min(this.width - 2, posX));
        posY = Math.max(1, Math.min(this.height - 2, posY));

        // Update speed based on height difference
        const newNodeX = Math.floor(posX);
        const newNodeY = Math.floor(posY);
        const currentHeight = tempMap[newNodeY * this.width + newNodeX];
        const heightDiff = height - currentHeight;
        
        speed = Math.sqrt(speed * speed + this.config.gravity * heightDiff);

        // Sediment capacity
        const sedimentCapacity = Math.max(-speed, 1) * 
                                Math.min(speed, 4) * 
                                this.config.sedimentCapacityFactor;

        // Erosion or deposition
        if (sediment > sedimentCapacity || speed < 0.001) {
          // Deposit sediment
          const amount = (sediment - sedimentCapacity) * this.config.depositSpeed;
          sediment -= amount;
          
          // Distribute to corners with bilinear weights
          const w00 = (1 - cellX) * (1 - cellY);
          const w10 = cellX * (1 - cellY);
          const w01 = (1 - cellX) * cellY;
          const w11 = cellX * cellY;

          tempMap[idx00] += amount * w00;
          tempMap[idx10] += amount * w10;
          tempMap[idx01] += amount * w01;
          tempMap[idx11] += amount * w11;

          sedimentMap[idx00] += amount * w00;
          sedimentMap[idx10] += amount * w10;
          sedimentMap[idx01] += amount * w01;
          sedimentMap[idx11] += amount * w11;
        } else {
          // Erode terrain
          const maxErosion = Math.min(
            (sedimentCapacity - sediment) * this.config.erodeSpeed,
            -height * speed * water * 0.5
          );

          if (maxErosion > 0) {
            const amount = maxErosion;
            sediment += amount;
            totalEroded += amount;
            
            // Remove from corners
            const w00 = (1 - cellX) * (1 - cellY);
            const w10 = cellX * (1 - cellY);
            const w01 = (1 - cellX) * cellY;
            const w11 = cellX * cellY;

            tempMap[idx00] -= amount * w00;
            tempMap[idx10] -= amount * w10;
            tempMap[idx01] -= amount * w01;
            tempMap[idx11] -= amount * w11;

            // Mark as eroded
            erosionMask[idx00] = 1;
            erosionMask[idx10] = 1;
            erosionMask[idx01] = 1;
            erosionMask[idx11] = 1;
          }
        }

        // Evaporation
        water *= (1 - this.config.evaporateSpeed);
        if (water <= 0.01) {
          // Deposit remaining sediment
          moistureMap[newNodeY * this.width + newNodeX] += water * 0.5;
          break;
        }
      }

      // Progress logging every 10%
      if (iter % Math.floor(this.config.iterations / 10) === 0 && iter > 0) {
        const progress = (iter / this.config.iterations * 100).toFixed(0);
        console.log(`Erosion progress: ${progress}%`);
      }
    }

    const endTime = performance.now();
    console.log(`Erosion completed in ${(endTime - startTime).toFixed(2)}ms`);

    // Normalize moisture map
    let maxMoisture = 0;
    for (let i = 0; i < moistureMap.length; i++) {
      maxMoisture = Math.max(maxMoisture, moistureMap[i]);
    }
    if (maxMoisture > 0) {
      for (let i = 0; i < moistureMap.length; i++) {
        moistureMap[i] /= maxMoisture;
      }
    }

    return {
      heightMap: tempMap,
      moistureMap,
      sedimentMap,
      erosionMask,
    };
  }

  /**
   * Reseed the erosion simulator
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
  }

  /**
   * Get configuration
   */
  public getConfig(): ErosionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<ErosionConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.seed !== undefined) {
      this.rng = new SeededRandom(config.seed);
    }
  }
}

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  public next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
