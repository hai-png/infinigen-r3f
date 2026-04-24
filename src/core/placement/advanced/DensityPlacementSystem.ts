import * as THREE from 'three';

/**
 * Density-Based Placement System
 * 
 * Places objects based on density fields and distribution maps:
 * - Heat map driven placement (higher density = more objects)
 * - Gradient-based distribution
 * - Multi-region density control
 * - Attraction/repulsion fields
 * - Procedural density functions (noise, radial, custom)
 * 
 * @module DensityPlacementSystem
 */

/**
 * Types of density functions
 */
export enum DensityFunctionType {
  /** Constant density everywhere */
  CONSTANT = 'constant',
  /** Radial falloff from center point */
  RADIAL = 'radial',
  /** Gradient along an axis */
  GRADIENT = 'gradient',
  /** Perlin/Simplex noise based */
  NOISE = 'noise',
  /** Multiple Gaussian peaks */
  GAUSSIAN = 'gaussian',
  /** Custom function provided by user */
  CUSTOM = 'custom',
  /** From texture/heightmap */
  TEXTURE = 'texture',
}

/**
 * Density field configuration
 */
export interface DensityField {
  /** Type of density function */
  type: DensityFunctionType;
  /** Center point for radial/gaussian */
  center?: THREE.Vector3;
  /** Radius of influence */
  radius?: number;
  /** Direction for gradient */
  direction?: THREE.Vector3;
  /** Scale/multiplier for density */
  scale?: number;
  /** Offset to add to density */
  offset?: number;
  /** Noise parameters */
  noiseParams?: {
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
  };
  /** Gaussian parameters */
  gaussianParams?: {
    sigma: number;
    amplitude: number;
  }[];
  /** Custom density function */
  customFunction?: (position: THREE.Vector3) => number;
  /** Texture for texture-based density */
  texture?: THREE.Texture;
  /** Texture mapping bounds */
  textureBounds?: THREE.Box2;
}

/**
 * Configuration for density-based placement
 */
export interface DensityPlacementConfig {
  /** Bounding region for placement */
  bounds: THREE.Box3;
  /** Target number of objects */
  targetCount: number;
  /** Density fields that define distribution */
  densityFields: DensityField[];
  /** Surface mesh to place on (optional) */
  surface?: THREE.Mesh;
  /** Minimum spacing between objects */
  minSpacing?: number;
  /** Maximum attempts per object */
  maxAttempts?: number;
  /** Density threshold below which placement is rejected */
  minDensityThreshold?: number;
  /** Use rejection sampling vs weighted sampling */
  samplingMethod?: 'rejection' | 'weighted';
  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Placement result from density-based system
 */
export interface DensityPlacementInstance {
  /** Position in world space */
  position: THREE.Vector3;
  /** Density value at this position */
  density: number;
  /** Which density field contributed most */
  primaryFieldIndex: number;
  /** Normal if placed on surface */
  normal?: THREE.Vector3;
}

/**
 * Complete density placement result
 */
export interface DensityPlacementResult {
  /** All placed instances */
  instances: DensityPlacementInstance[];
  /** Actual count placed */
  actualCount: number;
  /** Requested count */
  requestedCount: number;
  /** Success rate */
  successRate: number;
  /** Density statistics */
  statistics: {
    averageDensity: number;
    maxDensity: number;
    minDensity: number;
    densityVariance: number;
    coveragePercentage: number;
    boundingBox: THREE.Box3;
  };
  /** Total attempts made */
  totalAttempts: number;
}

/**
 * Simple pseudo-random number generator for seeded randomness
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number = Math.random()) {
    this.seed = seed;
  }
  
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

/**
 * Simple noise implementation (simplified Perlin-like)
 */
class SimpleNoise {
  private permutation: number[];
  
  constructor(seed: number = Math.random()) {
    this.permutation = [];
    for (let i = 0; i < 256; i++) {
      this.permutation[i] = i;
    }
    
    // Shuffle based on seed
    const rng = new SeededRandom(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
    }
    
    // Duplicate for overflow handling
    this.permutation = [...this.permutation, ...this.permutation];
  }
  
  fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    
    const A = this.permutation[X] + Y;
    const AA = this.permutation[A] + Z;
    const AB = this.permutation[A + 1] + Z;
    const B = this.permutation[X + 1] + Y;
    const BA = this.permutation[B] + Z;
    const BB = this.permutation[B + 1] + Z;
    
    return this.lerp(
      this.lerp(
        this.lerp(this.grad(this.permutation[AA], x, y, z), this.grad(this.permutation[BA], x - 1, y, z), u),
        this.lerp(this.grad(this.permutation[AB], x, y - 1, z), this.grad(this.permutation[BB], x - 1, y - 1, z), u),
        v
      ),
      this.lerp(
        this.lerp(this.grad(this.permutation[AA + 1], x, y, z - 1), this.grad(this.permutation[BA + 1], x - 1, y, z - 1), u),
        this.lerp(this.grad(this.permutation[AB + 1], x, y - 1, z - 1), this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }
  
  octaveNoise(x: number, y: number, z: number, octaves: number, persistence: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    
    return total / maxValue;
  }
}

/**
 * Density-Based Placement System Class
 * 
 * Generates object placements based on density fields and distribution functions.
 */
export class DensityPlacementSystem {
  /** Default minimum spacing */
  private static readonly DEFAULT_MIN_SPACING = 0.2;
  
  /** Default max attempts */
  private static readonly DEFAULT_MAX_ATTEMPTS = 100;
  
  /** Default density threshold */
  private static readonly DEFAULT_MIN_DENSITY = 0.01;
  
  /** RNG instance */
  private rng: SeededRandom;
  
  /** Noise generator */
  private noise: SimpleNoise;
  
  /** Spatial grid for collision detection */
  private spatialGrid: Map<string, DensityPlacementInstance[]>;
  
  /** Grid cell size */
  private gridSize: number = 0.3;
  
  /** Raycaster for surface projection */
  private raycaster: THREE.Raycaster;

  constructor() {
    this.rng = new SeededRandom();
    this.noise = new SimpleNoise();
    this.spatialGrid = new Map();
    this.raycaster = new THREE.Raycaster();
  }

  /**
   * Execute density-based placement
   */
  public place(config: DensityPlacementConfig): DensityPlacementResult {
    // Initialize with seed if provided
    if (config.seed !== undefined) {
      this.rng = new SeededRandom(config.seed);
      this.noise = new SimpleNoise(config.seed);
    }
    
    const instances: DensityPlacementInstance[] = [];
    this.spatialGrid.clear();
    
    const minSpacing = config.minSpacing ?? DensityPlacementSystem.DEFAULT_MIN_SPACING;
    const maxAttempts = config.maxAttempts ?? DensityPlacementSystem.DEFAULT_MAX_ATTEMPTS;
    const minDensity = config.minDensityThreshold ?? DensityPlacementSystem.DEFAULT_MIN_DENSITY;
    const samplingMethod = config.samplingMethod ?? 'rejection';
    
    let totalAttempts = 0;
    
    if (samplingMethod === 'rejection') {
      // Rejection sampling approach
      while (instances.length < config.targetCount && totalAttempts < maxAttempts * config.targetCount) {
        totalAttempts++;
        
        // Generate random position within bounds
        const position = this.randomPositionInBounds(config.bounds);
        
        // Calculate density at position
        const { density, primaryFieldIndex } = this.calculateDensity(position, config.densityFields);
        
        // Check density threshold
        if (density < minDensity) continue;
        
        // Probabilistic acceptance based on density
        const acceptanceProbability = Math.min(1, density);
        if (this.rng.next() > acceptanceProbability) continue;
        
        // Check spacing
        if (!this.checkSpacing(position, instances, minSpacing)) continue;
        
        // Project to surface if provided
        let finalPosition = position;
        let normal: THREE.Vector3 | undefined;
        
        if (config.surface) {
          const hit = this.projectToSurface(position, config.surface);
          if (hit) {
            finalPosition = hit.point;
            normal = hit.normal;
          } else {
            continue; // Skip if can't project to surface
          }
        }
        
        // Add instance
        const instance: DensityPlacementInstance = {
          position: finalPosition,
          density,
          primaryFieldIndex,
          normal,
        };
        
        instances.push(instance);
        this.addToSpatialGrid(instance);
      }
    } else {
      // Weighted sampling approach (more efficient for complex distributions)
      const samples = this.generateWeightedSamples(config);
      
      for (const sample of samples) {
        if (instances.length >= config.targetCount) break;
        
        // Check spacing
        if (!this.checkSpacing(sample.position, instances, minSpacing)) continue;
        
        // Project to surface if provided
        let finalPosition = sample.position;
        let normal: THREE.Vector3 | undefined;
        
        if (config.surface) {
          const hit = this.projectToSurface(sample.position, config.surface);
          if (hit) {
            finalPosition = hit.point;
            normal = hit.normal;
          } else {
            continue;
          }
        }
        
        const instance: DensityPlacementInstance = {
          position: finalPosition,
          density: sample.density,
          primaryFieldIndex: sample.primaryFieldIndex,
          normal,
        };
        
        instances.push(instance);
        this.addToSpatialGrid(instance);
        totalAttempts++;
      }
    }
    
    // Calculate statistics
    const stats = this.calculateStatistics(instances, config.bounds);
    
    return {
      instances,
      actualCount: instances.length,
      requestedCount: config.targetCount,
      successRate: instances.length / config.targetCount,
      statistics: stats,
      totalAttempts,
    };
  }

  /**
   * Calculate density at a position from all fields
   */
  private calculateDensity(
    position: THREE.Vector3,
    fields: DensityField[]
  ): { density: number; primaryFieldIndex: number } {
    let totalDensity = 0;
    let primaryFieldIndex = 0;
    let maxContribution = 0;
    
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const contribution = this.evaluateField(position, field);
      totalDensity += contribution;
      
      if (contribution > maxContribution) {
        maxContribution = contribution;
        primaryFieldIndex = i;
      }
    }
    
    return { density: totalDensity, primaryFieldIndex };
  }

  /**
   * Evaluate a single density field at a position
   */
  private evaluateField(position: THREE.Vector3, field: DensityField): number {
    const scale = field.scale ?? 1;
    const offset = field.offset ?? 0;
    
    switch (field.type) {
      case DensityFunctionType.CONSTANT:
        return scale + offset;
      
      case DensityFunctionType.RADIAL: {
        const center = field.center || new THREE.Vector3(0, 0, 0);
        const radius = field.radius || 1;
        const distance = position.distanceTo(center);
        
        if (distance > radius) return offset;
        
        const normalizedDistance = distance / radius;
        const falloff = 1 - normalizedDistance * normalizedDistance; // Quadratic falloff
        return Math.max(0, falloff * scale + offset);
      }
      
      case DensityFunctionType.GRADIENT: {
        const direction = field.direction?.normalize() || new THREE.Vector3(1, 0, 0);
        const dot = position.dot(direction);
        return Math.max(0, dot * scale + offset);
      }
      
      case DensityFunctionType.NOISE: {
        const params = field.noiseParams || { scale: 1, octaves: 3, persistence: 0.5, lacunarity: 2 };
        const noiseValue = this.noise.octaveNoise(
          position.x * params.scale,
          position.y * params.scale,
          position.z * params.scale,
          params.octaves,
          params.persistence
        );
        
        // Normalize noise from [-1, 1] to [0, 1]
        const normalizedNoise = (noiseValue + 1) / 2;
        return Math.max(0, normalizedNoise * scale + offset);
      }
      
      case DensityFunctionType.GAUSSIAN: {
        const gaussians = field.gaussianParams || [{ sigma: 1, amplitude: 1 }];
        let totalGaussian = 0;
        
        for (const gauss of gaussians) {
          const center = field.center || new THREE.Vector3(0, 0, 0);
          const distanceSq = position.distanceToSquared(center);
          const sigmaSq = gauss.sigma * gauss.sigma;
          
          const gaussianValue = gauss.amplitude * Math.exp(-distanceSq / (2 * sigmaSq));
          totalGaussian += gaussianValue;
        }
        
        return Math.max(0, totalGaussian * scale + offset);
      }
      
      case DensityFunctionType.CUSTOM: {
        if (field.customFunction) {
          return Math.max(0, field.customFunction(position) * scale + offset);
        }
        return offset;
      }
      
      case DensityFunctionType.TEXTURE: {
        if (!field.texture || !field.textureBounds) return offset;
        
        // Map 3D position to 2D UV coordinates
        const bounds = field.textureBounds;
        const u = (position.x - bounds.min.x) / (bounds.max.x - bounds.min.x);
        const v = (position.z - bounds.min.y) / (bounds.max.y - bounds.min.y);
        
        // Sample texture (simplified - would need proper texture sampling in real implementation)
        // For now, return a placeholder
        return 0.5 * scale + offset;
      }
      
      default:
        return offset;
    }
  }

  /**
   * Generate random position within bounds
   */
  private randomPositionInBounds(bounds: THREE.Box3): THREE.Vector3 {
    return new THREE.Vector3(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, this.rng.next()),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, this.rng.next()),
      THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, this.rng.next())
    );
  }

  /**
   * Generate weighted samples for efficient sampling
   */
  private generateWeightedSamples(config: DensityPlacementConfig): Array<{
    position: THREE.Vector3;
    density: number;
    primaryFieldIndex: number;
  }> {
    const samples: Array<{ position: THREE.Vector3; density: number; primaryFieldIndex: number }> = [];
    const numCandidates = config.targetCount * 10; // Generate extra candidates
    
    for (let i = 0; i < numCandidates; i++) {
      const position = this.randomPositionInBounds(config.bounds);
      const { density, primaryFieldIndex } = this.calculateDensity(position, config.densityFields);
      
      samples.push({ position, density, primaryFieldIndex });
    }
    
    // Sort by density (highest first)
    samples.sort((a, b) => b.density - a.density);
    
    return samples;
  }

  /**
   * Check spacing against existing instances
   */
  private checkSpacing(
    position: THREE.Vector3,
    instances: DensityPlacementInstance[],
    minSpacing: number
  ): boolean {
    const nearbyCells = this.getNearbyGridCells(position);
    
    for (const cell of nearbyCells) {
      const instancesInCell = this.spatialGrid.get(cell) || [];
      for (const instance of instancesInCell) {
        if (position.distanceTo(instance.position) < minSpacing) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Project position to surface
   */
  private projectToSurface(position: THREE.Vector3, surface: THREE.Mesh): THREE.Intersection | null {
    const rayOrigin = new THREE.Vector3(position.x, position.y + 10, position.z);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    
    this.raycaster.set(rayOrigin, rayDirection);
    const intersects = this.raycaster.intersectObject(surface);
    
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * Add instance to spatial grid
   */
  private addToSpatialGrid(instance: DensityPlacementInstance): void {
    const cellKey = this.getGridCellKey(instance.position);
    
    if (!this.spatialGrid.has(cellKey)) {
      this.spatialGrid.set(cellKey, []);
    }
    
    this.spatialGrid.get(cellKey)!.push(instance);
  }

  /**
   * Get grid cell key
   */
  private getGridCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.gridSize);
    const y = Math.floor(position.y / this.gridSize);
    const z = Math.floor(position.z / this.gridSize);
    return `${x},${y},${z}`;
  }

  /**
   * Get nearby grid cells
   */
  private getNearbyGridCells(position: THREE.Vector3): string[] {
    const x = Math.floor(position.x / this.gridSize);
    const y = Math.floor(position.y / this.gridSize);
    const z = Math.floor(position.z / this.gridSize);
    
    const cells: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          cells.push(`${x + dx},${y + dy},${z + dz}`);
        }
      }
    }
    
    return cells;
  }

  /**
   * Calculate placement statistics
   */
  private calculateStatistics(
    instances: DensityPlacementInstance[],
    bounds: THREE.Box3
  ): {
    averageDensity: number;
    maxDensity: number;
    minDensity: number;
    densityVariance: number;
    coveragePercentage: number;
    boundingBox: THREE.Box3;
  } {
    if (instances.length === 0) {
      return {
        averageDensity: 0,
        maxDensity: 0,
        minDensity: 0,
        densityVariance: 0,
        coveragePercentage: 0,
        boundingBox: new THREE.Box3(),
      };
    }
    
    let sumDensity = 0;
    let maxDensity = -Infinity;
    let minDensity = Infinity;
    const boundingBox = new THREE.Box3();
    
    for (const instance of instances) {
      sumDensity += instance.density;
      maxDensity = Math.max(maxDensity, instance.density);
      minDensity = Math.min(minDensity, instance.density);
      boundingBox.expandByPoint(instance.position);
    }
    
    const averageDensity = sumDensity / instances.length;
    
    // Calculate variance
    let varianceSum = 0;
    for (const instance of instances) {
      const diff = instance.density - averageDensity;
      varianceSum += diff * diff;
    }
    const densityVariance = varianceSum / instances.length;
    
    // Estimate coverage percentage
    const totalVolume = bounds.getSize(new THREE.Vector3()).lengthSq();
    const coveredArea = instances.length * Math.PI * Math.pow(this.gridSize, 2);
    const coveragePercentage = Math.min(100, (coveredArea / totalVolume) * 100);
    
    return {
      averageDensity,
      maxDensity,
      minDensity: minDensity === Infinity ? 0 : minDensity,
      densityVariance,
      coveragePercentage,
      boundingBox,
    };
  }

  /**
   * Visualize density field as points
   */
  public visualize(result: DensityPlacementResult, colorFn?: (density: number) => number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    
    const defaultColor = new THREE.Color(0xff0000);
    
    for (const instance of result.instances) {
      positions.push(instance.position.x, instance.position.y, instance.position.z);
      
      const color = colorFn ? new THREE.Color(colorFn(instance.density)) : defaultColor;
      colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
    });
    
    return new THREE.Points(geometry, material);
  }

  /**
   * Export to JSON
   */
  public toJSON(result: DensityPlacementResult): string {
    return JSON.stringify({
      instances: result.instances.map(i => ({
        position: [i.position.x, i.position.y, i.position.z],
        density: i.density,
        primaryFieldIndex: i.primaryFieldIndex,
        normal: i.normal ? [i.normal.x, i.normal.y, i.normal.z] : null,
      })),
      statistics: {
        ...result.statistics,
        boundingBox: {
          min: [result.statistics.boundingBox.min.x, result.statistics.boundingBox.min.y, result.statistics.boundingBox.min.z],
          max: [result.statistics.boundingBox.max.x, result.statistics.boundingBox.max.y, result.statistics.boundingBox.max.z],
        },
      },
      totalAttempts: result.totalAttempts,
    }, null, 2);
  }
}

export default DensityPlacementSystem;
