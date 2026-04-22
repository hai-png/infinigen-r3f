/**
 * ErosionEnhanced.ts
 * Hydraulic and thermal erosion with sediment transport
 * Part of Phase 4: Advanced Features - 100% Completion
 */

import * as THREE from 'three';

export interface ErosionConfig {
  hydraulicEnabled: boolean;
  thermalEnabled: boolean;
  iterations: number;
  dropletCount: number;
  sedimentCapacityFactor: number;
  minSedimentCapacity: number;
  erodeSpeed: number;
  depositSpeed: number;
  evaporateSpeed: number;
  gravity: number;
  inertia: number;
  erosionRadius: number;
  sedimentKd: number; // Dissolution rate
  thermalErosionIterations: number;
  talusAngle: number; // Angle of repose in degrees
}

export interface Droplet {
  position: THREE.Vector2;
  direction: THREE.Vector2;
  speed: number;
  water: number;
  sediment: number;
  active: boolean;
}

export interface ErosionData {
  heightMap: Float32Array;
  normalMap?: Float32Array;
  width: number;
  height: number;
  scale: number;
}

const defaultConfig: Required<ErosionConfig> = {
  hydraulicEnabled: true,
  thermalEnabled: true,
  iterations: 50,
  dropletCount: 2000,
  sedimentCapacityFactor: 4,
  minSedimentCapacity: 0.01,
  erodeSpeed: 0.3,
  depositSpeed: 0.3,
  evaporateSpeed: 0.01,
  gravity: 9.81,
  inertia: 0.05,
  erosionRadius: 3,
  sedimentKd: 0.01,
  thermalErosionIterations: 10,
  talusAngle: 30,
};

export class HydraulicErosion {
  private config: Required<ErosionConfig>;
  private droplets: Droplet[];

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.droplets = [];
  }

  erode(data: ErosionData): ErosionData {
    const { heightMap, width, height } = data;
    
    if (!this.config.hydraulicEnabled) {
      return data;
    }

    // Initialize droplets
    this.droplets = [];
    for (let i = 0; i < this.config.dropletCount; i++) {
      this.droplets.push({
        position: new THREE.Vector2(
          Math.random() * width,
          Math.random() * height
        ),
        direction: new THREE.Vector2(
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
        speed: 1,
        water: 1,
        sediment: 0,
        active: true,
      });
    }

    // Simulate erosion for each iteration
    for (let iter = 0; iter < this.config.iterations; iter++) {
      this.simulateDroplets(data);
    }

    // Apply thermal erosion
    if (this.config.thermalEnabled) {
      this.applyThermalErosion(data);
    }

    return data;
  }

  private simulateDroplets(data: ErosionData): void {
    const { heightMap, width, height } = data;
    const radius = this.config.erosionRadius;
    const diameter = radius * 2;

    for (const droplet of this.droplets) {
      if (!droplet.active) continue;

      // Track droplet path for erosion distribution
      const path: THREE.Vector2[] = [];
      let x = droplet.position.x;
      let y = droplet.position.y;

      // Simulate droplet movement
      for (let step = 0; step < 20; step++) {
        const nodeX = Math.floor(x);
        const nodeY = Math.floor(y);

        if (nodeX < 0 || nodeX >= width - 1 || nodeY < 0 || nodeY >= height - 1) {
          droplet.active = false;
          break;
        }

        const idx = nodeY * width + nodeX;
        const currentHeight = heightMap[idx];

        // Find lowest neighbor
        let lowestX = nodeX;
        let lowestY = nodeY;
        let lowestHeight = currentHeight;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = nodeX + dx;
            const ny = nodeY + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const nHeight = heightMap[nIdx];
              
              if (nHeight < lowestHeight) {
                lowestHeight = nHeight;
                lowestX = nx;
                lowestY = ny;
              }
            }
          }
        }

        // Calculate direction to lowest neighbor
        const dirX = lowestX - x;
        const dirY = lowestY - y;
        const len = Math.sqrt(dirX * dirX + dirY * dirY);

        if (len > 0) {
          // Update droplet direction with inertia
          droplet.direction.x = droplet.direction.x * this.config.inertia + 
            (dirX / len) * (1 - this.config.inertia);
          droplet.direction.y = droplet.direction.y * this.config.inertia + 
            (dirY / len) * (1 - this.config.inertia);
          droplet.direction.normalize();

          // Move droplet
          x += droplet.direction.x;
          y += droplet.direction.y;
          path.push(new THREE.Vector2(x, y));

          // Update speed based on height difference
          const deltaH = lowestHeight - currentHeight;
          droplet.speed = Math.sqrt(
            Math.max(0, droplet.speed * droplet.speed + 2 * this.config.gravity * Math.abs(deltaH))
          );

          // Calculate sediment capacity
          const capacity = Math.max(
            this.config.minSedimentCapacity,
            this.config.sedimentCapacityFactor * 
              droplet.speed * Math.abs(deltaH) * droplet.water
          );

          // Erode or deposit sediment
          if (droplet.sediment > capacity) {
            // Deposit sediment
            const depositAmount = (droplet.sediment - capacity) * this.config.depositSpeed;
            droplet.sediment -= depositAmount;
            
            // Distribute deposit over erosion radius
            this.distributeDeposit(heightMap, x, y, depositAmount, radius, width, height);
          } else {
            // Erode terrain
            const erodeAmount = Math.min(
              (capacity - droplet.sediment) * this.config.erodeSpeed,
              currentHeight - lowestHeight
            );

            if (erodeAmount > 0) {
              droplet.sediment += erodeAmount;
              
              // Distribute erosion over erosion radius
              this.distributeErosion(heightMap, x, y, erodeAmount, radius, width, height);
            }
          }

          // Evaporate water
          droplet.water *= (1 - this.config.evaporateSpeed);
          
          if (droplet.water < 0.01) {
            droplet.active = false;
            break;
          }
        } else {
          // No slope, stop droplet
          droplet.active = false;
          break;
        }
      }

      // Update droplet position
      droplet.position.set(x, y);
    }
  }

  private distributeErosion(
    heightMap: Float32Array,
    centerX: number,
    centerY: number,
    amount: number,
    radius: number,
    width: number,
    height: number
  ): void {
    const rSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        
        if (distSq <= rSquared) {
          const x = Math.floor(centerX + dx);
          const y = Math.floor(centerY + dy);
          
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = y * width + x;
            const weight = 1 - Math.sqrt(distSq) / radius;
            heightMap[idx] -= amount * weight * 0.1;
          }
        }
      }
    }
  }

  private distributeDeposit(
    heightMap: Float32Array,
    centerX: number,
    centerY: number,
    amount: number,
    radius: number,
    width: number,
    height: number
  ): void {
    const rSquared = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        
        if (distSq <= rSquared) {
          const x = Math.floor(centerX + dx);
          const y = Math.floor(centerY + dy);
          
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = y * width + x;
            const weight = 1 - Math.sqrt(distSq) / radius;
            heightMap[idx] += amount * weight * 0.1;
          }
        }
      }
    }
  }

  private applyThermalErosion(data: ErosionData): void {
    const { heightMap, width, height } = data;
    const talusRad = this.config.talusAngle * (Math.PI / 180);
    const maxDiff = Math.tan(talusRad);

    for (let iter = 0; iter < this.config.thermalErosionIterations; iter++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const centerHeight = heightMap[idx];

          // Check all neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;

              const nx = x + dx;
              const ny = y + dy;

              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                const neighborHeight = heightMap[nIdx];
                const diff = centerHeight - neighborHeight;

                if (diff > maxDiff) {
                  const transfer = (diff - maxDiff) * 0.5 * this.config.sedimentKd;
                  heightMap[idx] -= transfer;
                  heightMap[nIdx] += transfer;
                }
              }
            }
          }
        }
      }
    }
  }
}

export class ThermalErosion {
  private config: Required<ErosionConfig>;

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  erode(data: ErosionData): ErosionData {
    if (!this.config.thermalEnabled) {
      return data;
    }

    const { heightMap, width, height } = data;
    const talusRad = this.config.talusAngle * (Math.PI / 180);
    const maxDiff = Math.tan(talusRad);

    for (let iter = 0; iter < this.config.thermalErosionIterations * 2; iter++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const centerHeight = heightMap[idx];

          // Check 4 cardinal neighbors
          const neighbors = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
          ];

          for (const { dx, dy } of neighbors) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const neighborHeight = heightMap[nIdx];
              const diff = centerHeight - neighborHeight;

              if (diff > maxDiff) {
                const transfer = (diff - maxDiff) * 0.5;
                heightMap[idx] -= transfer;
                heightMap[nIdx] += transfer;
              }
            }
          }
        }
      }
    }

    return data;
  }
}

export class SedimentTransport {
  private config: Required<ErosionConfig>;

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  transport(data: ErosionData): ErosionData {
    const { heightMap, width, height } = data;
    const transported = new Float32Array(heightMap.length);

    // Simple diffusion-based sediment transport
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const centerHeight = heightMap[idx];
        let totalDiff = 0;
        let neighborCount = 0;

        const neighbors = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];

        for (const { dx, dy } of neighbors) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            const diff = centerHeight - heightMap[nIdx];
            
            if (diff > 0) {
              totalDiff += diff;
              neighborCount++;
            }
          }
        }

        if (neighborCount > 0) {
          const avgDiff = totalDiff / neighborCount;
          transported[idx] = avgDiff * this.config.sedimentKd * 0.1;
        }
      }
    }

    // Apply transport
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] -= transported[i];
    }

    return data;
  }
}

export class ErosionEnhanced {
  private hydraulic: HydraulicErosion;
  private thermal: ThermalErosion;
  private sediment: SedimentTransport;
  private config: Required<ErosionConfig>;

  constructor(config: Partial<ErosionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.hydraulic = new HydraulicErosion(this.config);
    this.thermal = new ThermalErosion(this.config);
    this.sediment = new SedimentTransport(this.config);
  }

  erode(data: ErosionData): ErosionData {
    console.log('Starting enhanced erosion...');
    console.log(`- Hydraulic erosion: ${this.config.hydraulicEnabled ? 'enabled' : 'disabled'}`);
    console.log(`- Thermal erosion: ${this.config.thermalEnabled ? 'enabled' : 'disabled'}`);
    console.log(`- Iterations: ${this.config.iterations}`);
    console.log(`- Droplet count: ${this.config.dropletCount}`);

    // Apply hydraulic erosion (includes thermal as part of process)
    if (this.config.hydraulicEnabled) {
      data = this.hydraulic.erode(data);
    }

    // Apply additional thermal erosion
    if (this.config.thermalEnabled && !this.config.hydraulicEnabled) {
      data = this.thermal.erode(data);
    }

    // Apply sediment transport
    data = this.sediment.transport(data);

    console.log('Erosion complete.');
    return data;
  }

  updateConfig(config: Partial<ErosionConfig>): void {
    this.config = { ...this.config, ...config };
    this.hydraulic = new HydraulicErosion(this.config);
    this.thermal = new ThermalErosion(this.config);
    this.sediment = new SedimentTransport(this.config);
  }
}

export default ErosionEnhanced;
