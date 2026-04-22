/**
 * Infinigen R3F Port - Phase 2: Advanced Terrain Features
 * Cave System Generator with 3D Noise, stalactites/stalagmites, and Cave Networks
 */

import { Vector3 } from 'three';
import { SeededRandom } from '../../util/MathUtils';

export interface CaveConfig {
  seed: number;
  width: number;
  height: number;
  depth: number;
  scale: number;
  caveDensity: number;
  tunnelRadius: number;
  tunnelVariation: number;
  chamberFrequency: number;
  chamberSize: number;
  stalactiteDensity: number;
  waterLevel: number;
  enableVerticalShafts: boolean;
  enableHorizontalTunnels: boolean;
  enableChambers: boolean;
}

export interface CavePoint {
  position: Vector3;
  radius: number;
  type: 'tunnel' | 'chamber' | 'shaft' | 'connection';
}

export interface CaveSystem {
  points: CavePoint[];
  densityMap: Float32Array;
  waterMap: Uint8Array;
  decorations: CaveDecoration[];
  config: CaveConfig;
}

export interface CaveDecoration {
  position: Vector3;
  type: 'stalactite' | 'stalagmite' | 'column' | 'flowstone' | 'pool';
  size: number;
  rotation: number;
}

export class CaveGenerator {
  private rng: SeededRandom;
  private config: CaveConfig;
  private permutationTable: number[];

  constructor(config: Partial<CaveConfig> = {}) {
    this.config = {
      seed: Math.floor(Math.random() * 10000),
      width: 128,
      height: 64,
      depth: 128,
      scale: 50,
      caveDensity: 0.3,
      tunnelRadius: 2.5,
      tunnelVariation: 1.5,
      chamberFrequency: 0.1,
      chamberSize: 8,
      stalactiteDensity: 0.05,
      waterLevel: 0.2,
      enableVerticalShafts: true,
      enableHorizontalTunnels: true,
      enableChambers: true,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
    this.permutationTable = [];
    this.initPermutationTable();
  }

  /**
   * Generate complete cave system
   */
  public generate(): CaveSystem {
    console.log(`Generating cave system with seed ${this.config.seed}...`);

    // 1. Generate 3D noise field for cave density
    const densityMap = this.generateDensityMap();

    // 2. Extract cave points using marching cubes-like approach
    const points = this.extractCavePoints(densityMap);

    // 3. Generate water level map
    const waterMap = this.generateWaterMap(densityMap);

    // 4. Place decorations (stalactites, stalagmites, etc.)
    const decorations = this.placeDecorations(points, densityMap);

    return {
      points,
      densityMap,
      waterMap,
      decorations,
      config: { ...this.config },
    };
  }

  /**
   * Generate 3D density map using FBM noise
   */
  private generateDensityMap(): Float32Array {
    const size = this.config.width * this.config.height * this.config.depth;
    const map = new Float32Array(size);

    const frequency = 1.0 / this.config.scale;
    const octaves = 4;
    const persistence = 0.5;
    const lacunarity = 2.0;

    for (let z = 0; z < this.config.depth; z++) {
      for (let y = 0; y < this.config.height; y++) {
        for (let x = 0; x < this.config.width; x++) {
          let value = 0;
          let amplitude = 1.0;
          let freq = frequency;

          // Multi-octave 3D noise
          for (let i = 0; i < octaves; i++) {
            const nx = x * freq;
            const ny = y * freq;
            const nz = z * freq;
            value += this.perlinNoise3D(nx, ny, nz) * amplitude;

            amplitude *= persistence;
            freq *= lacunarity;
          }

          // Apply depth gradient (caves more likely near surface but not at surface)
          const depthFactor = Math.sin((y / this.config.height) * Math.PI);
          const normalizedValue = (value + 1) / 2; // Normalize to 0-1
          
          const idx = z * this.config.width * this.config.height + y * this.config.width + x;
          map[idx] = normalizedValue * depthFactor * this.config.caveDensity;
        }
      }
    }

    return map;
  }

  /**
   * Extract cave tunnel/chamber points from density map
   */
  private extractCavePoints(densityMap: Float32Array): CavePoint[] {
    const points: CavePoint[] = [];
    const threshold = 0.4;

    // Find connected regions above threshold
    const visited = new Uint8Array(densityMap.length);

    for (let z = 0; z < this.config.depth; z++) {
      for (let y = 0; y < this.config.height; y++) {
        for (let x = 0; x < this.config.width; x++) {
          const idx = z * this.config.width * this.config.height + y * this.config.width + x;

          if (visited[idx] || densityMap[idx] < threshold) continue;

          // Flood fill to find connected region
          const region = this.floodFill(densityMap, visited, x, y, z, threshold);

          if (region.size > 10) {
            // Calculate centroid and average radius
            const centroid = new Vector3(0, 0, 0);
            let totalRadius = 0;

            for (const pos of region.points) {
              centroid.add(pos);
              const localDensity = this.getDensityAt(densityMap, pos);
              totalRadius += Math.sqrt(localDensity) * this.config.tunnelRadius;
            }

            centroid.divideScalar(region.points.length);
            const avgRadius = totalRadius / region.points.length;

            // Determine type based on size and shape
            const volume = region.points.length;
            let type: CavePoint['type'] = 'tunnel';

            if (volume > this.config.chamberSize * 100 && this.config.enableChambers) {
              type = 'chamber';
            } else if (region.extent.y > region.extent.x * 2 && region.extent.y > region.extent.z * 2 && this.config.enableVerticalShafts) {
              type = 'shaft';
            } else if (!this.config.enableHorizontalTunnels) {
              continue;
            }

            points.push({
              position: centroid,
              radius: avgRadius * (1 + this.rng.next() * this.config.tunnelVariation),
              type,
            });
          }
        }
      }
    }

    // Connect nearby points with tunnels
    this.connectPoints(points);

    return points;
  }

  /**
   * Flood fill to find connected cave regions
   */
  private floodFill(
    densityMap: Float32Array,
    visited: Uint8Array,
    startX: number,
    startY: number,
    startZ: number,
    threshold: number
  ): { points: Vector3[]; size: number; extent: Vector3 } {
    const points: Vector3[] = [];
    const stack: [number, number, number][] = [[startX, startY, startZ]];
    
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;
    let minZ = startZ, maxZ = startZ;

    while (stack.length > 0) {
      const [x, y, z] = stack.pop()!;
      const idx = z * this.config.width * this.config.height + y * this.config.width + x;

      if (visited[idx] || x < 0 || x >= this.config.width || 
          y < 0 || y >= this.config.height || z < 0 || z >= this.config.depth ||
          densityMap[idx] < threshold) {
        continue;
      }

      visited[idx] = 1;
      points.push(new Vector3(x, y, z));

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);

      // 6-connected neighborhood
      stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }

    return {
      points,
      size: points.length,
      extent: new Vector3(maxX - minX, maxY - minY, maxZ - minZ),
    };
  }

  /**
   * Connect nearby cave points with tunnels
   */
  private connectPoints(points: CavePoint[]): void {
    const connectionDistance = this.config.tunnelRadius * 6;

    for (let i = 0; i < points.length; i++) {
      const pointA = points[i];
      
      // Find nearest neighbor
      let nearestDist = Infinity;
      let nearestIdx = -1;

      for (let j = i + 1; j < points.length; j++) {
        const pointB = points[j];
        const dist = pointA.position.distanceTo(pointB.position);

        if (dist < nearestDist && dist < connectionDistance) {
          nearestDist = dist;
          nearestIdx = j;
        }
      }

      if (nearestIdx !== -1) {
        const pointB = points[nearestIdx];
        
        // Create connection point(s) along the path
        const direction = new Vector3().subVectors(pointB.position, pointA.position);
        const segments = Math.ceil(nearestDist / (this.config.tunnelRadius * 2));

        for (let s = 1; s < segments; s++) {
          const t = s / segments;
          const midPos = new Vector3().lerpVectors(pointA.position, pointB.position, t);
          const midRadius = (pointA.radius + pointB.radius) / 2 * (0.8 + this.rng.next() * 0.4);

          points.push({
            position: midPos,
            radius: midRadius,
            type: 'connection',
          });
        }
      }
    }
  }

  /**
   * Generate water level in lower cave regions
   */
  private generateWaterMap(densityMap: Float32Array): Uint8Array {
    const waterMap = new Uint8Array(densityMap.length);
    const waterThreshold = this.config.waterLevel;

    for (let z = 0; z < this.config.depth; z++) {
      for (let y = 0; y < this.config.height; y++) {
        for (let x = 0; x < this.config.width; x++) {
          const idx = z * this.config.width * this.config.height + y * this.config.width + x;
          
          // Water pools in low areas
          const relativeHeight = y / this.config.height;
          const isCave = densityMap[idx] > 0.4;
          
          if (isCave && relativeHeight < waterThreshold) {
            // Check if there's cave below (water needs support)
            let hasSupport = false;
            for (let below = y - 1; below >= 0; below--) {
              const belowIdx = z * this.config.width * this.config.height + below * this.config.width + x;
              if (densityMap[belowIdx] > 0.4) {
                hasSupport = true;
                break;
              }
            }

            if (hasSupport) {
              waterMap[idx] = 1;
            }
          }
        }
      }
    }

    return waterMap;
  }

  /**
   * Place cave decorations (stalactites, stalagmites, etc.)
   */
  private placeDecorations(points: CavePoint[], densityMap: Float32Array): CaveDecoration[] {
    const decorations: CaveDecoration[] = [];

    for (const point of points) {
      if (point.type === 'chamber' || point.type === 'tunnel') {
        // Try to place stalactites on ceiling
        if (this.rng.next() < this.config.stalactiteDensity) {
          const ceilY = Math.min(this.config.height - 1, Math.floor(point.position.y + point.radius));
          
          // Check if there's cave space below
          const checkIdx = this.getIndex(point.position.x, ceilY, point.position.z);
          if (checkIdx >= 0 && checkIdx < densityMap.length && densityMap[checkIdx] > 0.4) {
            const size = 0.2 + this.rng.next() * 0.8;
            decorations.push({
              position: new Vector3(point.position.x, ceilY, point.position.z),
              type: 'stalactite',
              size,
              rotation: this.rng.next() * Math.PI * 2,
            });
          }
        }

        // Try to place stalagmites on floor
        if (this.rng.next() < this.config.stalactiteDensity) {
          const floorY = Math.max(0, Math.floor(point.position.y - point.radius));
          
          const checkIdx = this.getIndex(point.position.x, floorY, point.position.z);
          if (checkIdx >= 0 && checkIdx < densityMap.length && densityMap[checkIdx] > 0.4) {
            const size = 0.2 + this.rng.next() * 0.8;
            decorations.push({
              position: new Vector3(point.position.x, floorY, point.position.z),
              type: 'stalagmite',
              size,
              rotation: this.rng.next() * Math.PI * 2,
            });
          }
        }

        // Chance for columns (connected stalactite + stalagmite)
        if (this.rng.next() < this.config.stalactiteDensity * 0.1) {
          decorations.push({
            position: point.position.clone(),
            type: 'column',
            size: 0.5 + this.rng.next() * 1.5,
            rotation: this.rng.next() * Math.PI * 2,
          });
        }

        // Flowstone on walls
        if (this.rng.next() < 0.15) {
          const angle = this.rng.next() * Math.PI * 2;
          const offset = new Vector3(
            Math.cos(angle) * point.radius * 0.9,
            (this.rng.next() - 0.5) * point.radius * 0.5,
            Math.sin(angle) * point.radius * 0.9
          );
          
          decorations.push({
            position: point.position.clone().add(offset),
            type: 'flowstone',
            size: 0.3 + this.rng.next() * 0.7,
            rotation: angle,
          });
        }

        // Water pools in chambers
        if (point.type === 'chamber' && this.rng.next() < 0.3) {
          decorations.push({
            position: new Vector3(point.position.x, point.position.y - point.radius * 0.9, point.position.z),
            type: 'pool',
            size: point.radius * 0.5,
            rotation: 0,
          });
        }
      }
    }

    return decorations;
  }

  /**
   * Get density value at specific coordinates
   */
  private getDensityAt(densityMap: Float32Array, pos: Vector3): number {
    const idx = this.getIndex(pos.x, pos.y, pos.z);
    if (idx < 0 || idx >= densityMap.length) return 0;
    return densityMap[idx];
  }

  /**
   * Convert 3D coordinates to array index
   */
  private getIndex(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);

    if (xi < 0 || xi >= this.config.width || 
        yi < 0 || yi >= this.config.height || 
        zi < 0 || zi >= this.config.depth) {
      return -1;
    }

    return zi * this.config.width * this.config.height + yi * this.config.width + xi;
  }

  /**
   * 3D Perlin noise implementation
   */
  private perlinNoise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.permutationTable[X] + Y;
    const B = this.permutationTable[X + 1] + Y;
    const AA = this.permutationTable[A] + Z;
    const BA = this.permutationTable[B] + Z;
    const AB = this.permutationTable[A + 1] + Z;
    const BB = this.permutationTable[B + 1] + Z;

    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.permutationTable[AA], x, y, z),
                     this.grad(this.permutationTable[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.permutationTable[AB], x, y - 1, z),
                     this.grad(this.permutationTable[BB], x - 1, y - 1, z))
      ),
      this.lerp(v,
        this.lerp(u, this.grad(this.permutationTable[AA + 1], x, y, z - 1),
                     this.grad(this.permutationTable[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.permutationTable[AB + 1], x, y - 1, z - 1),
                     this.grad(this.permutationTable[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Initialize permutation table for noise
   */
  private initPermutationTable(): void {
    this.permutationTable = new Array(512);
    const perm = new Array(256);

    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }

    // Shuffle based on seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.permutationTable[i] = perm[i & 255];
    }
  }

  /**
   * Reseed the generator
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
    this.initPermutationTable();
  }

  /**
   * Generate preset cave configurations
   */
  public static getPreset(name: string): Partial<CaveConfig> {
    const presets: Record<string, Partial<CaveConfig>> = {
      limestone: {
        caveDensity: 0.35,
        tunnelRadius: 3,
        chamberFrequency: 0.15,
        chamberSize: 10,
        stalactiteDensity: 0.08,
        enableVerticalShafts: true,
        enableChambers: true,
      },
      lavaTube: {
        caveDensity: 0.25,
        tunnelRadius: 4,
        tunnelVariation: 0.5,
        chamberFrequency: 0.05,
        chamberSize: 6,
        stalactiteDensity: 0.02,
        enableVerticalShafts: false,
        enableHorizontalTunnels: true,
        enableChambers: true,
      },
      iceCave: {
        caveDensity: 0.4,
        tunnelRadius: 2,
        chamberFrequency: 0.2,
        chamberSize: 12,
        stalactiteDensity: 0.1,
        waterLevel: 0.1,
        enableVerticalShafts: true,
        enableChambers: true,
      },
      seaCave: {
        caveDensity: 0.3,
        tunnelRadius: 5,
        chamberFrequency: 0.1,
        chamberSize: 8,
        stalactiteDensity: 0.01,
        waterLevel: 0.5,
        enableVerticalShafts: false,
        enableHorizontalTunnels: true,
        enableChambers: true,
      },
      crystalCavern: {
        caveDensity: 0.45,
        tunnelRadius: 3.5,
        chamberFrequency: 0.25,
        chamberSize: 15,
        stalactiteDensity: 0.12,
        enableVerticalShafts: true,
        enableChambers: true,
      },
    };

    return presets[name] || {};
  }
}
