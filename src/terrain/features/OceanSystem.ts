/**
 * Infinigen R3F Port - Phase 2: Advanced Terrain Features
 * Ocean and Water System with Waves, Currents, and Coastal Features
 */

import { Vector2, Vector3 } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { HeightMap } from '../core/TerrainGenerator';

export interface OceanConfig {
  seed: number;
  width: number;
  height: number;
  seaLevel: number;
  waveHeight: number;
  waveLength: number;
  waveSpeed: number;
  waveDirection: Vector2;
  enableFoam: boolean;
  enableCurrents: boolean;
  enableCoastalErosion: boolean;
  foamThreshold: number;
  currentStrength: number;
  coastalErosionRate: number;
  waterDepth: number;
}

export interface WaveData {
  height: number;
  wavelength: number;
  speed: number;
  direction: Vector2;
  phase: number;
}

export interface OceanState {
  surfaceMap: Float32Array;
  velocityMap: Vector2[];
  foamMap: Uint8Array;
  depthMap: Float32Array;
  waves: WaveData[];
  config: OceanConfig;
}

export class OceanSystem {
  private rng: SeededRandom;
  private config: OceanConfig;
  private time: number = 0;

  constructor(config: Partial<OceanConfig> = {}) {
    this.config = {
      seed: Math.floor(Math.random() * 10000),
      width: 512,
      height: 512,
      seaLevel: 0.3,
      waveHeight: 0.5,
      waveLength: 20,
      waveSpeed: 1.0,
      waveDirection: new Vector2(1, 0),
      enableFoam: true,
      enableCurrents: true,
      enableCoastalErosion: true,
      foamThreshold: 0.7,
      currentStrength: 0.2,
      coastalErosionRate: 0.01,
      waterDepth: 10,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate ocean state at current time
   */
  public generate(heightMap: HeightMap): OceanState {
    console.log(`Generating ocean state with seed ${this.config.seed}...`);

    const size = this.config.width * this.config.height;
    const surfaceMap = new Float32Array(size);
    const velocityMap: Vector2[] = [];
    const foamMap = new Uint8Array(size);
    const depthMap = new Float32Array(size);

    // Generate multiple wave components
    const waves = this.generateWaves();

    // Calculate surface height, velocities, and foam
    for (let y = 0; y < this.config.height; y++) {
      for (let x = 0; x < this.config.width; x++) {
        const idx = y * this.config.width + x;
        const terrainHeight = heightMap[idx];

        // Calculate water depth
        const waterDepth = Math.max(0, this.config.seaLevel - terrainHeight);
        depthMap[idx] = waterDepth;

        if (waterDepth > 0.001) {
          // Calculate wave height at this position and time
          let waveHeight = 0;
          for (const wave of waves) {
            const dist = x * wave.direction.x + y * wave.direction.y;
            const wavePhase = (dist / wave.wavelength + this.time * wave.speed + wave.phase) * Math.PI * 2;
            waveHeight += Math.sin(wavePhase) * wave.height;
          }

          surfaceMap[idx] = this.config.seaLevel + waveHeight;

          // Calculate wave velocity (simplified Gerstner wave approximation)
          if (this.config.enableCurrents) {
            const velocity = this.calculateWaveVelocity(x, y, waves);
            velocityMap[idx] = velocity;
          } else {
            velocityMap[idx] = new Vector2(0, 0);
          }

          // Generate foam based on wave steepness and proximity to shore
          if (this.config.enableFoam) {
            const isNearShore = terrainHeight > this.config.seaLevel - 0.1;
            const waveSteepness = Math.abs(waveHeight) / this.config.waveHeight;
            
            if ((isNearShore && waveSteepness > this.config.foamThreshold * 0.5) || 
                waveSteepness > this.config.foamThreshold) {
              foamMap[idx] = 1;
            }
          }

          // Apply coastal erosion
          if (this.config.enableCoastalErosion && isNearShore && waterDepth > 0) {
            const erosionAmount = this.config.coastalErosionRate * (1 - waterDepth / 0.1);
            heightMap[idx] -= erosionAmount;
          }
        } else {
          surfaceMap[idx] = terrainHeight;
          velocityMap[idx] = new Vector2(0, 0);
          foamMap[idx] = 0;
        }
      }
    }

    return {
      surfaceMap,
      velocityMap,
      foamMap,
      depthMap,
      waves,
      config: { ...this.config },
    };
  }

  /**
   * Generate multiple wave components for realistic ocean surface
   */
  private generateWaves(): WaveData[] {
    const waves: WaveData[] = [];

    // Primary swell waves
    waves.push({
      height: this.config.waveHeight * 0.6,
      wavelength: this.config.waveLength * 1.5,
      speed: this.config.waveSpeed * 0.8,
      direction: this.config.waveDirection.clone().normalize(),
      phase: this.rng.next() * Math.PI * 2,
    });

    // Secondary waves (perpendicular)
    const perpDir = new Vector2(-this.config.waveDirection.y, this.config.waveDirection.x);
    waves.push({
      height: this.config.waveHeight * 0.3,
      wavelength: this.config.waveLength * 0.8,
      speed: this.config.waveSpeed * 1.2,
      direction: perpDir,
      phase: this.rng.next() * Math.PI * 2,
    });

    // Tertiary chop waves (random directions)
    for (let i = 0; i < 3; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      waves.push({
        height: this.config.waveHeight * 0.15 * (0.5 + this.rng.next()),
        wavelength: this.config.waveLength * 0.4 * (0.5 + this.rng.next()),
        speed: this.config.waveSpeed * (0.5 + this.rng.next()),
        direction: new Vector2(Math.cos(angle), Math.sin(angle)),
        phase: this.rng.next() * Math.PI * 2,
      });
    }

    return waves;
  }

  /**
   * Calculate wave orbital velocity at a point
   */
  private calculateWaveVelocity(x: number, y: number, waves: WaveData[]): Vector2 {
    const velocity = new Vector2(0, 0);

    for (const wave of waves) {
      const dist = x * wave.direction.x + y * wave.direction.y;
      const wavePhase = (dist / wave.wavelength + this.time * wave.speed + wave.phase) * Math.PI * 2;
      
      // Orbital velocity (simplified)
      const orbitalSpeed = (wave.height * wave.speed * 2 * Math.PI) / wave.wavelength;
      const vx = Math.cos(wavePhase) * orbitalSpeed * wave.direction.x;
      const vy = Math.cos(wavePhase) * orbitalSpeed * wave.direction.y;

      velocity.x += vx;
      velocity.y += vy;
    }

    // Add some turbulence
    velocity.x += (this.rng.next() - 0.5) * this.config.currentStrength * 0.1;
    velocity.y += (this.rng.next() - 0.5) * this.config.currentStrength * 0.1;

    return velocity.multiplyScalar(this.config.currentStrength);
  }

  /**
   * Update ocean state over time
   */
  public update(deltaTime: number): void {
    this.time += deltaTime;
  }

  /**
   * Get wave height at specific coordinates and time
   */
  public getWaveHeight(x: number, y: number, timeOffset: number = 0): number {
    const waves = this.generateWaves();
    let height = 0;

    for (const wave of waves) {
      const dist = x * wave.direction.x + y * wave.direction.y;
      const wavePhase = (dist / wave.wavelength + (this.time + timeOffset) * wave.speed + wave.phase) * Math.PI * 2;
      height += Math.sin(wavePhase) * wave.height;
    }

    return height;
  }

  /**
   * Get water depth at specific coordinates
   */
  public getWaterDepth(x: number, y: number, heightMap: HeightMap): number {
    const idx = Math.floor(y) * this.config.width + Math.floor(x);
    if (idx < 0 || idx >= heightMap.length) return 0;

    const terrainHeight = heightMap[idx];
    return Math.max(0, this.config.seaLevel - terrainHeight);
  }

  /**
   * Check if a point is underwater
   */
  public isUnderwater(x: number, y: number, heightMap: HeightMap): boolean {
    const depth = this.getWaterDepth(x, y, heightMap);
    return depth > 0.01;
  }

  /**
   * Reseed the ocean system
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
  }

  /**
   * Set simulation time
   */
  public setTime(time: number): void {
    this.time = time;
  }

  /**
   * Get preset ocean configurations
   */
  public static getPreset(name: string): Partial<OceanConfig> {
    const presets: Record<string, Partial<OceanConfig>> = {
      calm: {
        waveHeight: 0.2,
        waveLength: 30,
        waveSpeed: 0.5,
        enableFoam: false,
        enableCurrents: true,
        currentStrength: 0.1,
        enableCoastalErosion: false,
      },
      moderate: {
        waveHeight: 0.5,
        waveLength: 20,
        waveSpeed: 1.0,
        enableFoam: true,
        foamThreshold: 0.7,
        enableCurrents: true,
        currentStrength: 0.2,
        enableCoastalErosion: true,
        coastalErosionRate: 0.01,
      },
      stormy: {
        waveHeight: 1.5,
        waveLength: 40,
        waveSpeed: 2.0,
        enableFoam: true,
        foamThreshold: 0.4,
        enableCurrents: true,
        currentStrength: 0.5,
        enableCoastalErosion: true,
        coastalErosionRate: 0.05,
      },
      tsunami: {
        waveHeight: 3.0,
        waveLength: 100,
        waveSpeed: 5.0,
        enableFoam: true,
        foamThreshold: 0.3,
        enableCurrents: true,
        currentStrength: 0.8,
        enableCoastalErosion: true,
        coastalErosionRate: 0.2,
      },
      shallowSea: {
        waveHeight: 0.3,
        waveLength: 15,
        waveSpeed: 0.8,
        seaLevel: 0.2,
        enableFoam: true,
        foamThreshold: 0.6,
        enableCurrents: true,
        currentStrength: 0.3,
        enableCoastalErosion: true,
        coastalErosionRate: 0.02,
        waterDepth: 5,
      },
      deepOcean: {
        waveHeight: 1.0,
        waveLength: 50,
        waveSpeed: 1.5,
        seaLevel: 0.4,
        enableFoam: false,
        enableCurrents: true,
        currentStrength: 0.3,
        enableCoastalErosion: false,
        waterDepth: 50,
      },
    };

    return presets[name] || {};
  }
}
