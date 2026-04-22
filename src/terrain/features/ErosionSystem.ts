/**
 * Infinigen R3F Port - Phase 2: Advanced Terrain Features
 * Advanced Erosion System with Hydraulic, Thermal, and Wind Erosion
 */

import { Vector2, Vector3 } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { HeightMap } from '../core/TerrainGenerator';

export interface ErosionConfig {
  seed: number;
  width: number;
  height: number;
  hydraulicEnabled: boolean;
  thermalEnabled: boolean;
  windEnabled: boolean;
  hydraulicIterations: number;
  thermalIterations: number;
  windIterations: number;
  erosionStrength: number;
  sedimentCapacity: number;
  evaporationRate: number;
  windSpeed: number;
  windDirection: Vector2;
  thermalCreep: number;
  rainfall: number;
}

export interface ErosionData {
  heightMap: HeightMap;
  erosionMap: Float32Array;
  depositionMap: Float32Array;
  moistureMap: Float32Array;
  sedimentMap: Float32Array;
  config: ErosionConfig;
}

export class ErosionSystem {
  private rng: SeededRandom;
  private config: ErosionConfig;

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = {
      seed: Math.floor(Math.random() * 10000),
      width: 512,
      height: 512,
      hydraulicEnabled: true,
      thermalEnabled: true,
      windEnabled: true,
      hydraulicIterations: 30,
      thermalIterations: 10,
      windIterations: 15,
      erosionStrength: 0.3,
      sedimentCapacity: 4,
      evaporationRate: 0.01,
      windSpeed: 2.0,
      windDirection: new Vector2(1, 0),
      thermalCreep: 0.02,
      rainfall: 1.0,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Apply all erosion processes to heightmap
   */
  public erode(heightMap: HeightMap): ErosionData {
    console.log(`Applying erosion with seed ${this.config.seed}...`);

    const erosionMap = new Float32Array(heightMap.length);
    const depositionMap = new Float32Array(heightMap.length);
    const moistureMap = new Float32Array(heightMap.length);
    const sedimentMap = new Float32Array(heightMap.length);

    // Create working copy
    const workMap = new Float32Array(heightMap);

    // 1. Hydraulic erosion (water-based)
    if (this.config.hydraulicEnabled) {
      this.applyHydraulicErosion(workMap, erosionMap, depositionMap, moistureMap, sedimentMap);
    }

    // 2. Thermal erosion (temperature-based weathering)
    if (this.config.thermalEnabled) {
      this.applyThermalErosion(workMap, erosionMap, depositionMap);
    }

    // 3. Wind erosion
    if (this.config.windEnabled) {
      this.applyWindErosion(workMap, erosionMap, depositionMap);
    }

    // Copy result back
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = Math.max(0, Math.min(1, workMap[i]));
    }

    return {
      heightMap,
      erosionMap,
      depositionMap,
      moistureMap,
      sedimentMap,
      config: { ...this.config },
    };
  }

  /**
   * Apply hydraulic erosion simulation
   */
  private applyHydraulicErosion(
    heightMap: HeightMap,
    erosionMap: Float32Array,
    depositionMap: Float32Array,
    moistureMap: Float32Array,
    sedimentMap: Float32Array
  ): void {
    const iterations = this.config.hydraulicIterations;
    const inertia = 0.05;
    const erodeSpeed = this.config.erosionStrength;
    const depositSpeed = 0.3;
    const evaporateSpeed = this.config.evaporationRate;
    const gravity = 4;
    const maxDropletLifetime = 30;
    const sedimentCapacityFactor = this.config.sedimentCapacity;

    for (let iter = 0; iter < iterations; iter++) {
      // Initialize droplet at random position
      let posX = this.rng.next() * this.config.width;
      let posY = this.rng.next() * this.config.height;
      let dirX = 0;
      let dirY = 0;
      let speed = 0;
      let water = 1;
      let sediment = 0;

      for (let lifetime = 0; lifetime < maxDropletLifetime; lifetime++) {
        const nodeX = Math.floor(posX);
        const nodeY = Math.floor(posY);
        const cellX = posX - nodeX;
        const cellY = posY - nodeY;

        // Check bounds
        if (nodeX < 0 || nodeX >= this.config.width - 1 || 
            nodeY < 0 || nodeY >= this.config.height - 1) {
          break;
        }

        // Get heights at corners
        const idx00 = nodeY * this.config.width + nodeX;
        const idx10 = nodeY * this.config.width + (nodeX + 1);
        const idx01 = (nodeY + 1) * this.config.width + nodeX;
        const idx11 = (nodeY + 1) * this.config.width + (nodeX + 1);

        const h00 = heightMap[idx00];
        const h10 = heightMap[idx10];
        const h01 = heightMap[idx01];
        const h11 = heightMap[idx11];

        // Bilinear interpolation for height at droplet position
        const height = 
          h00 * (1 - cellX) * (1 - cellY) +
          h10 * cellX * (1 - cellY) +
          h01 * (1 - cellX) * cellY +
          h11 * cellX * cellY;

        // Calculate gradient
        const deltaX = (h10 - h00) * (1 - cellY) + (h11 - h01) * cellY;
        const deltaY = (h01 - h00) * (1 - cellX) + (h11 - h10) * cellX;

        // Update direction with inertia
        dirX = dirX * inertia - deltaX * (1 - inertia);
        dirY = dirY * inertia - deltaY * (1 - inertia);

        // Normalize
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len > 0) {
          dirX /= len;
          dirY /= len;
        }

        // Move droplet
        posX += dirX;
        posY += dirY;

        // Update speed based on height difference
        const currentHeight = heightMap[Math.floor(posY) * this.config.width + Math.floor(posX)];
        speed = Math.sqrt(speed * speed + gravity * (height - currentHeight));

        // Sediment capacity
        const sedimentCapacity = Math.max(-speed, 1) * Math.min(speed, sedimentCapacityFactor) * sedimentCapacityFactor;

        // Erosion or deposition
        if (sediment > sedimentCapacity || speed === 0) {
          // Deposit sediment
          const amount = (sediment - sedimentCapacity) * depositSpeed;
          sediment -= amount;
          
          // Distribute to corners
          const distrib = (1 - cellX) * (1 - cellY);
          const depositAmount = amount * distrib;
          
          heightMap[idx00] += depositAmount;
          heightMap[idx10] += amount * cellX * (1 - cellY);
          heightMap[idx01] += amount * (1 - cellX) * cellY;
          heightMap[idx11] += amount * cellX * cellY;

          depositionMap[idx00] += depositAmount;
          depositionMap[idx10] += amount * cellX * (1 - cellY);
          depositionMap[idx01] += amount * (1 - cellX) * cellY;
          depositionMap[idx11] += amount * cellX * cellY;
        } else {
          // Erode
          const amount = Math.min((sedimentCapacity - sediment) * erodeSpeed, -height * speed * water);
          
          if (amount > 0) {
            sediment += amount;
            
            // Remove from corners
            const distrib = (1 - cellX) * (1 - cellY);
            const erodeAmount = amount * distrib;
            
            heightMap[idx00] -= erodeAmount;
            heightMap[idx10] -= amount * cellX * (1 - cellY);
            heightMap[idx01] -= amount * (1 - cellX) * cellY;
            heightMap[idx11] -= amount * cellX * cellY;

            erosionMap[idx00] += erodeAmount;
            erosionMap[idx10] += amount * cellX * (1 - cellY);
            erosionMap[idx01] += amount * (1 - cellX) * cellY;
            erosionMap[idx11] += amount * cellX * cellY;
          }
        }

        // Add moisture to ground
        const moistureIdx = nodeY * this.config.width + nodeX;
        moistureMap[moistureIdx] = Math.min(1, moistureMap[moistureIdx] + water * this.config.rainfall * 0.1);

        // Evaporation
        water *= (1 - evaporateSpeed);
        if (water <= 0) break;
      }

      // Store final sediment
      if (sediment > 0) {
        const finalIdx = Math.floor(posY) * this.config.width + Math.floor(posX);
        if (finalIdx >= 0 && finalIdx < sedimentMap.length) {
          sedimentMap[finalIdx] += sediment;
        }
      }
    }
  }

  /**
   * Apply thermal erosion (simulates temperature-based weathering and material creep)
   */
  private applyThermalErosion(
    heightMap: HeightMap,
    erosionMap: Float32Array,
    depositionMap: Float32Array
  ): void {
    const iterations = this.config.thermalIterations;
    const creep = this.config.thermalCreep;
    const talusAngle = 0.6; // Maximum stable slope angle

    const tempMap = new Float32Array(heightMap);

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < this.config.height; y++) {
        for (let x = 0; x < this.config.width; x++) {
          const idx = y * this.config.width + x;
          const centerHeight = heightMap[idx];

          // Check all 8 neighbors
          let totalTransfer = 0;
          const transfers: number[] = [];

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const nx = x + dx;
              const ny = y + dy;

              if (nx < 0 || nx >= this.config.width || ny < 0 || ny >= this.config.height) {
                transfers.push(0);
                continue;
              }

              const nIdx = ny * this.config.width + nx;
              const neighborHeight = heightMap[nIdx];

              // Calculate slope
              const dist = Math.sqrt(dx * dx + dy * dy);
              const slope = (centerHeight - neighborHeight) / dist;

              // If slope is steeper than talus angle, material creeps down
              if (slope > talusAngle) {
                const transfer = (slope - talusAngle) * creep;
                transfers.push(transfer);
                totalTransfer += transfer;
              } else {
                transfers.push(0);
              }
            }
          }

          // Apply transfers
          if (totalTransfer > 0) {
            let transferIdx = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < this.config.width && ny >= 0 && ny < this.config.height) {
                  const nIdx = ny * this.config.width + nx;
                  const transfer = transfers[transferIdx];

                  if (transfer > 0) {
                    tempMap[idx] -= transfer;
                    tempMap[nIdx] += transfer;

                    erosionMap[idx] += transfer;
                    depositionMap[nIdx] += transfer;
                  }
                  transferIdx++;
                }
              }
            }
          }
        }
      }

      // Apply accumulated changes
      for (let i = 0; i < heightMap.length; i++) {
        heightMap[i] += tempMap[i];
        tempMap[i] = 0;
      }
    }
  }

  /**
   * Apply wind erosion (simulates aeolian processes)
   */
  private applyWindErosion(
    heightMap: HeightMap,
    erosionMap: Float32Array,
    depositionMap: Float32Array
  ): void {
    const iterations = this.config.windIterations;
    const windSpeed = this.config.windSpeed;
    const windDir = this.config.windDirection.clone().normalize();

    const tempMap = new Float32Array(heightMap.length);
    const sedimentLoad = new Float32Array(heightMap.length);

    for (let iter = 0; iter < iterations; iter++) {
      // Process wind in wind direction
      for (let y = 0; y < this.config.height; y++) {
        for (let x = 0; x < this.config.width; x++) {
          // Calculate upwind position
          const upwindX = x - windDir.x;
          const upwindY = y - windDir.y;

          if (upwindX < 0 || upwindX >= this.config.width || 
              upwindY < 0 || upwindY >= this.config.height) {
            continue;
          }

          const idx = y * this.config.width + x;
          const upwindIdx = Math.floor(upwindY) * this.config.width + Math.floor(upwindX);

          const height = heightMap[idx];
          const upwindHeight = heightMap[upwindIdx];
          const upwindSediment = sedimentLoad[upwindIdx];

          // Calculate exposure (how much this cell is exposed to wind)
          const exposure = Math.max(0, height - upwindHeight);

          // Erosion on windward side
          if (exposure > 0) {
            const erosionAmount = exposure * windSpeed * this.config.erosionStrength * 0.1;
            tempMap[idx] -= erosionAmount;
            sedimentLoad[idx] += erosionAmount;
            erosionMap[idx] += erosionAmount;
          }

          // Deposition on leeward side
          if (upwindSediment > 0) {
            const depositionAmount = upwindSediment * 0.1; // Sediment drops out
            tempMap[idx] += depositionAmount;
            sedimentLoad[idx] += upwindSediment - depositionAmount;
            depositionMap[idx] += depositionAmount;
          }
        }
      }

      // Apply accumulated changes
      for (let i = 0; i < heightMap.length; i++) {
        heightMap[i] += tempMap[i];
        tempMap[i] = 0;
      }
    }
  }

  /**
   * Reseed the erosion system
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
  }

  /**
   * Get preset erosion configurations
   */
  public static getPreset(name: string): Partial<ErosionConfig> {
    const presets: Record<string, Partial<ErosionConfig>> = {
      desert: {
        hydraulicEnabled: false,
        thermalEnabled: true,
        windEnabled: true,
        windIterations: 25,
        thermalIterations: 5,
        windSpeed: 3.0,
        erosionStrength: 0.2,
      },
      tropical: {
        hydraulicEnabled: true,
        thermalEnabled: true,
        windEnabled: false,
        hydraulicIterations: 50,
        thermalIterations: 15,
        rainfall: 2.0,
        erosionStrength: 0.4,
      },
      temperate: {
        hydraulicEnabled: true,
        thermalEnabled: true,
        windEnabled: true,
        hydraulicIterations: 30,
        thermalIterations: 10,
        windIterations: 15,
        rainfall: 1.0,
        erosionStrength: 0.3,
      },
      arctic: {
        hydraulicEnabled: false,
        thermalEnabled: true,
        windEnabled: true,
        thermalIterations: 20,
        windIterations: 20,
        thermalCreep: 0.03,
        windSpeed: 2.5,
      },
      canyon: {
        hydraulicEnabled: true,
        thermalEnabled: false,
        windEnabled: false,
        hydraulicIterations: 80,
        erosionStrength: 0.5,
        sedimentCapacity: 6,
      },
    };

    return presets[name] || {};
  }
}
