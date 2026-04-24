/**
 * Scatter System for InfiniGen R3F
 * 
 * Provides advanced scattering capabilities:
 * - Distribution maps (density, exclusion zones)
 * - Clumping and grouping behaviors
 * - Instance variation (scale, rotation, mesh selection)
 * - LOD-based culling
 * - Semantic-aware scattering
 */

import { Vector3, Mesh, BufferGeometry, Material } from 'three';
import { BBox } from '../math/bbox';
import { AdvancedPlacer, PlacementConfig, createDefaultConfig } from './AdvancedPlacer';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ScatterConfig {
  /** Base density (instances per square unit) */
  density: number;
  /** Minimum distance between instances */
  minDistance: number;
  /** Maximum number of instances */
  maxInstances: number;
  /** Scale variation range [min, max] */
  scaleRange: [number, number];
  /** Rotation variation (radians) around Y axis */
  rotationVariation: number;
  /** Whether to align to surface normal */
  alignToSurface: boolean;
  /** Distribution map for density control */
  distributionMap?: DensityMap;
  /** Clumping configuration */
  clumping?: ClumpingConfig;
  /** Exclusion zones */
  exclusionZones?: BBox[];
  /** Mesh variants to choose from */
  meshVariants?: Mesh[];
  /** LOD distances */
  lodDistances?: [number, number, number]; // near, mid, far
}

export interface ClumpingConfig {
  /** Number of clumps */
  numClumps: number;
  /** Clump radius */
  clumpRadius: number;
  /** Instances per clump (average) */
  instancesPerClump: number;
  /** Clump centers (if predefined) */
  clumpCenters?: Vector3[];
}

export interface DensityMap {
  /** Map resolution */
  resolution: [number, number];
  /** Density values (0-1) */
  values: Float32Array;
  /** Bounds of the map */
  bounds: BBox;
}

export interface ScatteredInstance {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  meshIndex: number;
  lodLevel: number;
}

// ============================================================================
// Density Map Generator
// ============================================================================

export class DensityMapGenerator {
  private resolution: [number, number];
  private values: Float32Array;
  private bounds: BBox;

  constructor(resolution: [number, number], bounds: BBox) {
    this.resolution = resolution;
    this.values = new Float32Array(resolution[0] * resolution[1]);
    this.bounds = bounds;
  }

  /**
   * Set density value at grid position
   */
  setValue(x: number, y: number, value: number): void {
    const idx = y * this.resolution[0] + x;
    this.values[idx] = Math.max(0, Math.min(1, value));
  }

  /**
   * Get density value at world position
   */
  getValue(worldPos: Vector3): number {
    const x = Math.floor(
      ((worldPos.x - this.bounds.min.x) / (this.bounds.max.x - this.bounds.min.x)) * 
      (this.resolution[0] - 1)
    );
    const y = Math.floor(
      ((worldPos.z - this.bounds.min.z) / (this.bounds.max.z - this.bounds.min.z)) * 
      (this.resolution[1] - 1)
    );

    if (x < 0 || x >= this.resolution[0] || y < 0 || y >= this.resolution[1]) {
      return 0;
    }

    return this.values[y * this.resolution[0] + x];
  }

  /**
   * Create gradient density map
   */
  createGradient(direction: 'x' | 'z', startValue: number, endValue: number): void {
    for (let y = 0; y < this.resolution[1]; y++) {
      for (let x = 0; x < this.resolution[0]; x++) {
        let t: number;
        if (direction === 'x') {
          t = x / (this.resolution[0] - 1);
        } else {
          t = y / (this.resolution[1] - 1);
        }
        this.setValue(x, y, startValue + t * (endValue - startValue));
      }
    }
  }

  /**
   * Create radial density map from center points
   */
  createRadial(centers: Vector3[], maxRadius: number, falloff: 'linear' | 'exponential' = 'linear'): void {
    // Clear values
    this.values.fill(0);

    const centerX = this.resolution[0] / 2;
    const centerY = this.resolution[1] / 2;

    for (let y = 0; y < this.resolution[1]; y++) {
      for (let x = 0; x < this.resolution[0]; x++) {
        // Convert grid position to world
        const worldX = this.bounds.min.x + (x / (this.resolution[0] - 1)) * (this.bounds.max.x - this.bounds.min.x);
        const worldZ = this.bounds.min.z + (y / (this.resolution[1] - 1)) * (this.bounds.max.z - this.bounds.min.z);
        const pos = new Vector3(worldX, 0, worldZ);

        // Find minimum distance to any center
        let minDist = Infinity;
        for (const center of centers) {
          const dist = new Vector2(pos.x, pos.z).distanceTo(new Vector2(center.x, center.z));
          minDist = Math.min(minDist, dist);
        }

        // Calculate density based on distance
        if (minDist < maxRadius) {
          const t = minDist / maxRadius;
          let value: number;
          
          if (falloff === 'linear') {
            value = 1 - t;
          } else {
            value = Math.exp(-3 * t);
          }
          
          this.setValue(x, y, value);
        }
      }
    }
  }

  /**
   * Create noise-based density map
   */
  createNoise(noiseFn: (x: number, y: number) => number, scale: number = 1): void {
    for (let y = 0; y < this.resolution[1]; y++) {
      for (let x = 0; x < this.resolution[0]; x++) {
        const nx = (x / this.resolution[0]) * scale;
        const ny = (y / this.resolution[1]) * scale;
        const value = (noiseFn(nx, ny) + 1) / 2; // Normalize to 0-1
        this.setValue(x, y, value);
      }
    }
  }

  getDensityMap(): DensityMap {
    return {
      resolution: this.resolution,
      values: this.values,
      bounds: this.bounds
    };
  }
}

// Simple 2D vector helper
class Vector2 {
  constructor(public x: number, public z: number) {}
  
  distanceTo(other: Vector2): number {
    const dx = this.x - other.x;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}

// ============================================================================
// Clumping System
// ============================================================================

export class ClumpingSystem {
  private config: ClumpingConfig;
  private clumpCenters: Vector3[];

  constructor(config: ClumpingConfig) {
    this.config = config;
    this.clumpCenters = config.clumpCenters || [];
    
    // Generate clump centers if not provided
    if (this.clumpCenters.length === 0) {
      this.generateClumpCenters();
    }
  }

  private generateClumpCenters(): void {
    this.clumpCenters = [];
    
    for (let i = 0; i < this.config.numClumps; i++) {
      // Random position within a reasonable area
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 50; // Adjust based on scene size
      
      this.clumpCenters.push(new Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ));
    }
  }

  /**
   * Generate positions with clumping behavior
   */
  generatePositions(totalCount: number): Vector3[] {
    const positions: Vector3[] = [];
    const instancesPerClump = Math.ceil(totalCount / this.clumpCenters.length);

    for (const center of this.clumpCenters) {
      for (let i = 0; i < instancesPerClump; i++) {
        // Random position within clump radius
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * this.config.clumpRadius; // Uniform distribution in circle
        
        const pos = new Vector3(
          center.x + Math.cos(angle) * r,
          0,
          center.z + Math.sin(angle) * r
        );
        
        positions.push(pos);
      }
    }

    // Trim to exact count if needed
    while (positions.length > totalCount) {
      positions.pop();
    }

    return positions;
  }

  getClumpCenters(): Vector3[] {
    return [...this.clumpCenters];
  }
}

// ============================================================================
// Variation Engine
// ============================================================================

export class VariationEngine {
  private scaleRange: [number, number];
  private rotationVariation: number;
  private meshVariants: Mesh[];

  constructor(scaleRange: [number, number], rotationVariation: number, meshVariants: Mesh[] = []) {
    this.scaleRange = scaleRange;
    this.rotationVariation = rotationVariation;
    this.meshVariants = meshVariants;
  }

  /**
   * Generate random scale
   */
  generateScale(seed?: number): Vector3 {
    const t = seed !== undefined ? (Math.sin(seed) + 1) / 2 : Math.random();
    const scale = this.scaleRange[0] + t * (this.scaleRange[1] - this.scaleRange[0]);
    return new Vector3(scale, scale, scale);
  }

  /**
   * Generate random rotation (primarily around Y axis)
   */
  generateRotation(alignToSurface: boolean, normal?: Vector3, seed?: number): Vector3 {
    const t = seed !== undefined ? (Math.sin(seed + 1) + 1) / 2 : Math.random();
    const yaw = (t - 0.5) * 2 * this.rotationVariation;

    if (alignToSurface && normal) {
      // Calculate pitch and roll to align with normal
      const pitch = Math.atan2(normal.z, normal.y);
      const roll = -Math.atan2(normal.x, normal.y);
      return new Vector3(pitch, yaw, roll);
    }

    return new Vector3(0, yaw, 0);
  }

  /**
   * Select mesh variant
   */
  selectMesh(seed?: number): number {
    if (this.meshVariants.length <= 1) {
      return 0;
    }

    const t = seed !== undefined ? (Math.sin(seed + 2) + 1) / 2 : Math.random();
    return Math.floor(t * this.meshVariants.length);
  }

  /**
   * Generate complete instance data
   */
  generateInstance(position: Vector3, normal?: Vector3, seed?: number): ScatteredInstance {
    return {
      position: position.clone(),
      rotation: this.generateRotation(false, normal, seed),
      scale: this.generateScale(seed),
      meshIndex: this.selectMesh(seed),
      lodLevel: 0
    };
  }
}

// ============================================================================
// LOD Manager
// ============================================================================

export class LODManager {
  private lodDistances: [number, number, number];

  constructor(lodDistances?: [number, number, number]) {
    this.lodDistances = lodDistances || [10, 30, 100];
  }

  /**
   * Determine LOD level based on camera distance
   */
  getLODLevel(cameraPosition: Vector3, instancePosition: Vector3): number {
    const distance = cameraPosition.distanceTo(instancePosition);

    if (distance < this.lodDistances[0]) {
      return 0; // High detail
    } else if (distance < this.lodDistances[1]) {
      return 1; // Medium detail
    } else if (distance < this.lodDistances[2]) {
      return 2; // Low detail
    } else {
      return 3; // Cull
    }
  }

  /**
   * Update LOD levels for all instances
   */
  updateLODs(instances: ScatteredInstance[], cameraPosition: Vector3): number {
    let visibleCount = 0;

    for (const instance of instances) {
      instance.lodLevel = this.getLODLevel(cameraPosition, instance.position);
      if (instance.lodLevel < 3) {
        visibleCount++;
      }
    }

    return visibleCount;
  }
}

// ============================================================================
// Main Scatter System
// ============================================================================

export interface ScatterOptions {
  config: ScatterConfig;
  bounds: BBox;
  meshes?: Mesh[];
  cameraPosition?: Vector3;
}

export class ScatterSystem {
  private config: ScatterConfig;
  private bounds: BBox;
  private placer: AdvancedPlacer | null;
  private clumpingSystem: ClumpingSystem | null;
  private variationEngine: VariationEngine;
  private lodManager: LODManager;

  constructor(options: ScatterOptions) {
    this.config = options.config;
    this.bounds = options.bounds;
    this.placer = null;
    this.clumpingSystem = null;
    this.variationEngine = new VariationEngine(
      this.config.scaleRange,
      this.config.rotationVariation,
      this.config.meshVariants || []
    );
    this.lodManager = new LODManager(this.config.lodDistances);

    // Initialize clumping if configured
    if (this.config.clumping) {
      this.clumpingSystem = new ClumpingSystem(this.config.clumping);
    }
  }

  /**
   * Generate scattered instances
   */
  async scatter(cameraPosition?: Vector3): Promise<ScatteredInstance[]> {
    const instances: ScatteredInstance[] = [];

    // Determine placement strategy
    let basePositions: Vector3[];

    if (this.clumpingSystem) {
      // Use clumping
      basePositions = this.clumpingSystem.generatePositions(this.config.maxInstances);
    } else {
      // Use Poisson disk sampling via AdvancedPlacer
      const placementConfig: PlacementConfig = {
        ...createDefaultConfig(),
        minDistance: this.config.minDistance,
        avoidCollisions: true
      };

      this.placer = new AdvancedPlacer({
        config: placementConfig,
        bounds: this.bounds,
        targetCount: this.config.maxInstances
      });

      basePositions = await this.placer.generatePlacements();
    }

    // Apply density map filtering
    if (this.config.distributionMap) {
      basePositions = basePositions.filter(pos => {
        const density = this.config.distributionMap!.values[
          Math.floor(((pos.x - this.bounds.min.x) / (this.bounds.max.x - this.bounds.min.x)) * 
                    (this.config.distributionMap!.resolution[0] - 1)) +
          Math.floor(((pos.z - this.bounds.min.z) / (this.bounds.max.z - this.bounds.min.z)) * 
                    (this.config.distributionMap!.resolution[1] - 1)) * 
          this.config.distributionMap!.resolution[0]
        ];
        return Math.random() < density;
      });
    }

    // Apply exclusion zones
    if (this.config.exclusionZones && this.config.exclusionZones.length > 0) {
      basePositions = basePositions.filter(pos => {
        for (const zone of this.config.exclusionZones!) {
          if (zone.containsPoint(pos)) {
            return false;
          }
        }
        return true;
      });
    }

    // Limit to max instances
    if (basePositions.length > this.config.maxInstances) {
      basePositions = basePositions.slice(0, this.config.maxInstances);
    }

    // Generate full instance data with variations
    for (let i = 0; i < basePositions.length; i++) {
      const seed = i * 0.1; // Deterministic seed for reproducibility
      const instance = this.variationEngine.generateInstance(basePositions[i], undefined, seed);
      
      // Update LOD if camera position provided
      if (cameraPosition) {
        instance.lodLevel = this.lodManager.getLODLevel(cameraPosition, instance.position);
      }

      // Skip culled instances
      if (instance.lodLevel < 3) {
        instances.push(instance);
      }
    }

    return instances;
  }

  /**
   * Update LODs for existing instances
   */
  updateLODs(instances: ScatteredInstance[], cameraPosition: Vector3): number {
    return this.lodManager.updateLODs(instances, cameraPosition);
  }

  /**
   * Get statistics about the scatter
   */
  getStatistics(instances: ScatteredInstance[]): ScatterStats {
    const lodCounts = [0, 0, 0, 0];
    
    for (const instance of instances) {
      lodCounts[instance.lodLevel]++;
    }

    return {
      totalInstances: instances.length,
      visibleInstances: lodCounts[0] + lodCounts[1] + lodCounts[2],
      culledInstances: lodCounts[3],
      lodBreakdown: {
        high: lodCounts[0],
        medium: lodCounts[1],
        low: lodCounts[2],
        culled: lodCounts[3]
      }
    };
  }
}

export interface ScatterStats {
  totalInstances: number;
  visibleInstances: number;
  culledInstances: number;
  lodBreakdown: {
    high: number;
    medium: number;
    low: number;
    culled: number;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create default scatter configuration
 */
export function createDefaultScatterConfig(): ScatterConfig {
  return {
    density: 1.0,
    minDistance: 0.5,
    maxInstances: 1000,
    scaleRange: [0.8, 1.2],
    rotationVariation: Math.PI,
    alignToSurface: true,
    lodDistances: [10, 30, 100]
  };
}

/**
 * Quick scatter helper
 */
export async function quickScatter(
  count: number,
  bounds: BBox,
  options?: Partial<ScatterConfig>
): Promise<ScatteredInstance[]> {
  const config = { ...createDefaultScatterConfig(), ...options, maxInstances: count };
  const system = new ScatterSystem({
    config,
    bounds
  });

  return system.scatter();
}
