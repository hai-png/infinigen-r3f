/**
 * Infinigen R3F Port - Phase 3: Scatter Systems
 * Climbing Plant Generator
 * 
 * Generates ivy, vines, creepers, and moss that climb on vertical surfaces
 * with procedural growth patterns and surface adhesion.
 */

import { Vector3, Color, BufferGeometry, Mesh, Raycaster, Triangle } from 'three';
import { SeededRandom } from '../../util/MathUtils';
import { BiomeType } from '../biomes/BiomeSystem';

export type ClimbingPlantType = 
  | 'ivy'
  | 'vine'
  | 'creeper'
  | 'moss_wall'
  | 'liana'
  | 'kudzu';

export interface ClimbingPlantConfig {
  name: string;
  type: ClimbingPlantType;
  growthRate: number; // How fast it spreads (0-1)
  maxCoverage: number; // Maximum surface coverage (0-1)
  branchProbability: number; // Chance of branching
  segmentLength: [number, number]; // Min/max segment length
  thicknessBase: number;
  thicknessVariation: number;
  leafDensity: number; // Leaves per segment
  leafSize: [number, number];
  colorPrimary: Color;
  colorSecondary?: Color;
  seasonalVariation: boolean;
  biomes: BiomeType[];
  surfacePreference: ('rock' | 'wood' | 'concrete' | 'any')[];
}

export interface ClimbingSegment {
  start: Vector3;
  end: Vector3;
  normal: Vector3;
  thickness: number;
  hasLeaves: boolean;
  leafPositions: Vector3[];
}

export interface ClimbingPlantInstance {
  segments: ClimbingSegment[];
  type: ClimbingPlantType;
  startPoint: Vector3;
  coverage: number;
  age: number; // 0-1 growth stage
}

export class ClimbingPlantGenerator {
  private rng: SeededRandom;
  private plantConfigs: Map<string, ClimbingPlantConfig>;
  private currentSeason: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer';

  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
    this.plantConfigs = new Map();
    this.initializeDefaultPlants();
  }

  /**
   * Initialize default climbing plant configurations
   */
  private initializeDefaultPlants(): void {
    // English Ivy
    this.plantConfigs.set('english_ivy', {
      name: 'English Ivy',
      type: 'ivy',
      growthRate: 0.6,
      maxCoverage: 0.85,
      branchProbability: 0.4,
      segmentLength: [0.3, 0.8],
      thicknessBase: 0.02,
      thicknessVariation: 0.01,
      leafDensity: 0.7,
      leafSize: [0.05, 0.12],
      colorPrimary: new Color(0.1, 0.4, 0.15),
      colorSecondary: new Color(0.15, 0.5, 0.2),
      seasonalVariation: true,
      biomes: ['temperate_forest', 'deciduous_forest'],
      surfacePreference: ['rock', 'wood', 'concrete'],
    });

    // Grape Vine
    this.plantConfigs.set('grape_vine', {
      name: 'Grape Vine',
      type: 'vine',
      growthRate: 0.5,
      maxCoverage: 0.6,
      branchProbability: 0.35,
      segmentLength: [0.4, 1.0],
      thicknessBase: 0.03,
      thicknessVariation: 0.015,
      leafDensity: 0.5,
      leafSize: [0.08, 0.15],
      colorPrimary: new Color(0.15, 0.45, 0.2),
      colorSecondary: new Color(0.2, 0.55, 0.25),
      seasonalVariation: true,
      biomes: ['temperate_forest', 'grassland', 'mediterranean'],
      surfacePreference: ['wood', 'concrete'],
    });

    // Creeping Fig
    this.plantConfigs.set('creeping_fig', {
      name: 'Creeping Fig',
      type: 'creeper',
      growthRate: 0.7,
      maxCoverage: 0.9,
      branchProbability: 0.5,
      segmentLength: [0.2, 0.5],
      thicknessBase: 0.015,
      thicknessVariation: 0.008,
      leafDensity: 0.8,
      leafSize: [0.03, 0.08],
      colorPrimary: new Color(0.12, 0.42, 0.17),
      seasonalVariation: false,
      biomes: ['temperate_forest', 'subtropical'],
      surfacePreference: ['rock', 'concrete', 'any'],
    });

    // Wall Moss
    this.plantConfigs.set('wall_moss', {
      name: 'Wall Moss',
      type: 'moss_wall',
      growthRate: 0.3,
      maxCoverage: 0.7,
      branchProbability: 0.2,
      segmentLength: [0.1, 0.3],
      thicknessBase: 0.01,
      thicknessVariation: 0.005,
      leafDensity: 0.0, // No distinct leaves
      leafSize: [0.01, 0.02],
      colorPrimary: new Color(0.08, 0.35, 0.12),
      colorSecondary: new Color(0.12, 0.4, 0.15),
      seasonalVariation: false,
      biomes: ['temperate_forest', 'rainforest', 'taiga'],
      surfacePreference: ['rock', 'wood'],
    });

    // Tropical Liana
    this.plantConfigs.set('tropical_liana', {
      name: 'Tropical Liana',
      type: 'liana',
      growthRate: 0.8,
      maxCoverage: 0.5,
      branchProbability: 0.3,
      segmentLength: [0.8, 2.0],
      thicknessBase: 0.05,
      thicknessVariation: 0.02,
      leafDensity: 0.3,
      leafSize: [0.1, 0.25],
      colorPrimary: new Color(0.18, 0.48, 0.22),
      colorSecondary: new Color(0.25, 0.55, 0.28),
      seasonalVariation: false,
      biomes: ['rainforest', 'jungle'],
      surfacePreference: ['wood', 'any'],
    });

    // Kudzu
    this.plantConfigs.set('kudzu', {
      name: 'Kudzu',
      type: 'kudzu',
      growthRate: 0.9,
      maxCoverage: 0.95,
      branchProbability: 0.6,
      segmentLength: [0.5, 1.2],
      thicknessBase: 0.025,
      thicknessVariation: 0.012,
      leafDensity: 0.9,
      leafSize: [0.1, 0.2],
      colorPrimary: new Color(0.13, 0.43, 0.18),
      colorSecondary: new Color(0.18, 0.5, 0.23),
      seasonalVariation: true,
      biomes: ['temperate_forest', 'subtropical'],
      surfacePreference: ['wood', 'concrete', 'any'],
    });
  }

  /**
   * Generate climbing plants on a surface
   */
  public generateOnSurface(
    surfacePoints: Vector3[],
    surfaceNormals: Vector3[],
    configName: string,
    numStartPoints: number = 10
  ): ClimbingPlantInstance[] {
    const config = this.plantConfigs.get(configName);
    if (!config) {
      throw new Error(`Unknown climbing plant config: ${configName}`);
    }

    const instances: ClimbingPlantInstance[] = [];

    // Select random start points
    const usedIndices = new Set<number>();
    
    for (let i = 0; i < numStartPoints; i++) {
      let attempts = 0;
      let startIndex: number;
      
      do {
        startIndex = Math.floor(this.rng.next() * surfacePoints.length);
        attempts++;
      } while (usedIndices.has(startIndex) && attempts < 100);

      if (attempts >= 100) break;
      
      usedIndices.add(startIndex);

      const instance = this.growPlant(
        surfacePoints[startIndex],
        surfaceNormals[startIndex],
        surfacePoints,
        surfaceNormals,
        config
      );

      if (instance.segments.length > 0) {
        instances.push(instance);
      }
    }

    return instances;
  }

  /**
   * Grow a single climbing plant using diffusion-limited aggregation approach
   */
  private growPlant(
    startPos: Vector3,
    startNormal: Vector3,
    surfacePoints: Vector3[],
    surfaceNormals: Vector3[],
    config: ClimbingPlantConfig
  ): ClimbingPlantInstance {
    const segments: ClimbingSegment[] = [];
    const activeTips: Array<{ pos: Vector3; dir: Vector3; depth: number }> = [
      { pos: startPos.clone(), dir: new Vector3(0, 1, 0), depth: 0 }
    ];

    const maxDepth = 15 + Math.floor(this.rng.next() * 10);
    const maxSegments = 50 + Math.floor(this.rng.next() * 100);
    let segmentCount = 0;

    while (activeTips.length > 0 && segmentCount < maxSegments) {
      const tip = activeTips.shift()!;
      
      if (tip.depth >= maxDepth) continue;

      // Determine segment length
      const segLen = config.segmentLength[0] + 
                     this.rng.next() * (config.segmentLength[1] - config.segmentLength[0]);
      
      // Calculate new position following surface
      const newPos = this.findSurfacePoint(
        tip.pos,
        tip.dir,
        segLen,
        surfacePoints,
        surfaceNormals
      );

      if (!newPos) continue;

      // Create segment
      const thickness = config.thicknessBase + 
                       this.rng.next() * config.thicknessVariation * (1 - tip.depth / maxDepth);
      
      const segment: ClimbingSegment = {
        start: tip.pos.clone(),
        end: newPos.pos,
        normal: newPos.normal,
        thickness,
        hasLeaves: this.rng.next() < config.leafDensity,
        leafPositions: [],
      };

      // Add leaves if applicable
      if (segment.hasLeaves) {
        const numLeaves = 1 + Math.floor(this.rng.next() * 2);
        for (let l = 0; l < numLeaves; l++) {
          const t = 0.3 + this.rng.next() * 0.5;
          const leafPos = new Vector3().lerpVectors(segment.start, segment.end, t);
          
          // Offset from surface
          const offset = segment.normal.clone().multiplyScalar(0.02);
          leafPos.add(offset);
          
          segment.leafPositions.push(leafPos);
        }
      }

      segments.push(segment);
      segmentCount++;

      // Branch?
      if (this.rng.next() < config.branchProbability && activeTips.length < 10) {
        const branchDir = this.calculateBranchDirection(newPos.normal, tip.dir);
        activeTips.push({
          pos: newPos.pos.clone(),
          dir: branchDir,
          depth: tip.depth + 1,
        });
      }

      // Continue growing
      const continueDir = this.calculateGrowthDirection(newPos.normal, tip.dir);
      activeTips.push({
        pos: newPos.pos.clone(),
        dir: continueDir,
        depth: tip.depth + 1,
      });
    }

    return {
      segments,
      type: config.type,
      startPoint: startPos,
      coverage: segments.length / maxSegments,
      age: Math.min(1, segments.length / 20),
    };
  }

  /**
   * Find nearest surface point in growth direction
   */
  private findSurfacePoint(
    from: Vector3,
    dir: Vector3,
    distance: number,
    surfacePoints: Vector3[],
    surfaceNormals: Vector3[]
  ): { pos: Vector3; normal: Vector3 } | null {
    const target = from.clone().add(dir.clone().multiplyScalar(distance));
    
    // Find nearest surface point
    let minDist = Infinity;
    let nearestPoint: Vector3 | null = null;
    let nearestNormal: Vector3 | null = null;

    const searchRadius = distance * 1.5;
    
    for (let i = 0; i < surfacePoints.length; i++) {
      const dist = target.distanceTo(surfacePoints[i]);
      
      if (dist < searchRadius && dist < minDist) {
        minDist = dist;
        nearestPoint = surfacePoints[i];
        nearestNormal = surfaceNormals[i];
      }
    }

    if (nearestPoint && nearestNormal) {
      return { pos: nearestPoint, normal: nearestNormal };
    }

    return null;
  }

  /**
   * Calculate growth direction based on surface normal and previous direction
   */
  private calculateGrowthDirection(normal: Vector3, prevDir: Vector3): Vector3 {
    // Prefer upward growth with some randomness
    const upBias = new Vector3(0, 1, 0);
    const noise = new Vector3(
      (this.rng.next() - 0.5) * 0.5,
      (this.rng.next() - 0.5) * 0.5,
      (this.rng.next() - 0.5) * 0.5
    );

    const dir = upBias.clone().add(prevDir).add(noise).normalize();
    
    // Project onto surface plane
    const projected = dir.sub(normal.clone().multiplyScalar(dir.dot(normal)));
    
    return projected.normalize();
  }

  /**
   * Calculate branch direction
   */
  private calculateBranchDirection(normal: Vector3, parentDir: Vector3): Vector3 {
    const angle = (this.rng.next() - 0.5) * Math.PI * 0.5;
    const axis = new Vector3().crossVectors(parentDir, normal).normalize();
    
    const branchDir = parentDir.clone().applyAxisAngle(axis, angle);
    
    return branchDir.normalize();
  }

  /**
   * Apply seasonal color variation
   */
  public applySeasonalColors(
    instances: ClimbingPlantInstance[],
    configName: string
  ): void {
    const config = this.plantConfigs.get(configName);
    if (!config || !config.seasonalVariation) return;

    let colorShift: Color;
    
    switch (this.currentSeason) {
      case 'autumn':
        colorShift = new Color(0.6, 0.4, 0.2);
        break;
      case 'winter':
        colorShift = new Color(0.3, 0.3, 0.3);
        break;
      case 'spring':
        colorShift = new Color(0.2, 0.6, 0.2);
        break;
      default: // summer
        colorShift = new Color(1, 1, 1);
    }

    // Color modification would be applied during mesh generation
  }

  /**
   * Set current season
   */
  public setSeason(season: 'spring' | 'summer' | 'autumn' | 'winter'): void {
    this.currentSeason = season;
  }

  /**
   * Add custom climbing plant configuration
   */
  public addPlant(config: ClimbingPlantConfig): void {
    this.plantConfigs.set(config.name, config);
  }

  /**
   * Get plant configuration by name
   */
  public getPlantConfig(name: string): ClimbingPlantConfig | undefined {
    return this.plantConfigs.get(name);
  }

  /**
   * Reseed the generator
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Filter instances by type
   */
  public filterByType(
    instances: ClimbingPlantInstance[],
    types: ClimbingPlantType[]
  ): ClimbingPlantInstance[] {
    return instances.filter(inst => types.includes(inst.type));
  }

  /**
   * Get total coverage statistics
   */
  public getCoverageStats(instances: ClimbingPlantInstance[]): {
    totalSegments: number;
    averageCoverage: number;
    maxCoverage: number;
    byType: Record<ClimbingPlantType, number>;
  } {
    const stats = {
      totalSegments: 0,
      averageCoverage: 0,
      maxCoverage: 0,
      byType: {} as Record<ClimbingPlantType, number>,
    };

    for (const inst of instances) {
      stats.totalSegments += inst.segments.length;
      stats.maxCoverage = Math.max(stats.maxCoverage, inst.coverage);
      
      if (!stats.byType[inst.type]) {
        stats.byType[inst.type] = 0;
      }
      stats.byType[inst.type] += inst.segments.length;
    }

    stats.averageCoverage = instances.length > 0 
      ? instances.reduce((sum, inst) => sum + inst.coverage, 0) / instances.length 
      : 0;

    return stats;
  }
}
