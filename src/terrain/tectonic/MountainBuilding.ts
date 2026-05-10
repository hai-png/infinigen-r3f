/**
 * MountainBuilding — Real Orogenic Process Simulation
 *
 * Implements physically-grounded mountain building (orogeny) with support
 * for different orogenic belt types based on tectonic boundary classification:
 *
 * - Continental-continental collision → Broad orogenic belt (Himalayas-like)
 *   with crustal thickening, fold-thrust belts, and high plateaus
 * - Oceanic-continental subduction → Volcanic arc + accretionary wedge
 *   (Andes-like) with coastal range, inland volcanic chain, and back-arc basin
 * - Oceanic-oceanic subduction → Island arc chain (Japan-like)
 *   with volcanic islands, back-arc spreading, and deep trenches
 *
 * Orogenic processes modeled:
 * - Crustal thickening via Airy isostasy
 * - Fold-and-thrust belt generation with proper structural geometry
 * - Anticline/syncline fold structures with wavelength and amplitude
 * - Thrust fault system with imbricate fan geometry
 * - Isostatic adjustment (mountain roots, foreland basins)
 * - Erosional modification (fluvial, glacial, slope-dependent)
 * - Exhumation and cooling of orogenic core
 * - Foreland basin formation through lithospheric flexure
 *
 * Ported/inspired by: infinigen/terrain/tectonic/mountain_building.py
 */

import { Vector3, Matrix4 } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import type {
  TectonicPlate,
  PlateBoundary,
  ConvergentSubType,
} from './TectonicPlateSimulator';

// ============================================================================
// Configuration Types
// ============================================================================

/** Parameters for mountain building simulation. */
export interface MountainBuildingParams {
  /** Rate of vertical displacement (mm/year equivalent) */
  upliftRate: number;
  /** Maximum mountain elevation (meters) */
  maxElevation: number;
  /** Initial crustal thickness (km) */
  crustalThickness: number;
  /** Wavelength of fold structures (km) */
  foldWavelength: number;
  /** Amplitude of fold structures (m) */
  foldAmplitude: number;
  /** Fold tightness: 0 = open/sinusoidal, 1 = tight/chevron */
  foldTightness: number;
  /** Number of fold sets with different orientations */
  foldSetCount: number;
  /** Spacing between thrust faults (km) */
  thrustSpacing: number;
  /** Dip angle of thrust faults (degrees) */
  thrustDip: number;
  /** Displacement along thrust faults (m) */
  thrustDisplacement: number;
  /** Isostatic response factor (0-1) */
  isostaticResponse: number;
  /** Erosional unloading response factor (0-1) */
  erosionalUnloading: number;
  /** Glacial carving intensity (0-1) */
  glacialCarving: number;
  /** Total simulation time (Myr) */
  simulationTime: number;
  /** Time step duration (Myr) */
  timeStep: number;
  /** Flexural rigidity of lithosphere (controls foreland basin depth) */
  flexuralRigidity: number;
  /** Density of mantle for isostatic calculations (g/cm³) */
  mantleDensity: number;
  /** Density of crust for isostatic calculations (g/cm³) */
  crustDensity: number;
  /** Random seed */
  seed: number;
}

// ============================================================================
// Mountain Data Types
// ============================================================================

/** A thrust fault in the orogenic belt. */
export interface ThrustFault {
  /** Surface position of the fault trace */
  position: Vector3;
  /** Normal direction of the fault plane */
  normal: Vector3;
  /** Dip angle (degrees) */
  dipAngle: number;
  /** Total displacement (m) */
  displacement: number;
  /** Length of the fault trace (m) */
  length: number;
  /** Fault orientation direction (strike) */
  strike: Vector3;
  /** Whether this is a leading (frontal) or trailing thrust */
  isLeading: boolean;
}

/** A fold structure in the orogenic belt. */
export interface FoldStructure {
  /** Axis direction of the fold */
  axisDirection: Vector3;
  /** Hinge line points */
  hingeLine: Vector3[];
  /** Wavelength (m) */
  wavelength: number;
  /** Amplitude (m) */
  amplitude: number;
  /** Fold type */
  type: 'anticline' | 'syncline' | 'monocline' | 'dome' | 'basin';
  /** Tightness (0 = open, 1 = isoclinal) */
  tightness: number;
  /** Plunge angle (degrees) */
  plunge: number;
}

/** A foreland basin adjacent to the orogenic belt. */
export interface ForelandBasin {
  /** Basin center line (closest to mountains) */
  proximalEdge: Vector3[];
  /** Basin center line (farthest from mountains) */
  distalEdge: Vector3[];
  /** Maximum basin depth (m) */
  maxDepth: number;
  /** Basin width (m) */
  width: number;
  /** Flexural profile (depth vs distance) */
  flexuralProfile: Float32Array;
}

/** Orogenic belt type classification. */
export type OrogenicBeltType =
  | 'continental_collision'    // Himalayas-type
  | 'continental_arc'          // Andes-type
  | 'island_arc'               // Japan-type
  | 'rift_shoulder'             // East African Rift-type
  | 'intracratonic';           // Ural-type

/** Complete mountain range data. */
export interface MountainRange {
  /** Peak positions with elevations */
  peaks: Vector3[];
  /** Ridge line segments */
  ridges: Vector3[][];
  /** Valley line segments */
  valleys: Vector3[][];
  /** Elevation map */
  elevationMap: Float32Array;
  /** Fold structures */
  foldAxes: FoldStructure[];
  /** Thrust fault system */
  thrustFaults: ThrustFault[];
  /** Foreland basins */
  forelandBasins: ForelandBasin[];
  /** Orogenic belt type */
  beltType: OrogenicBeltType;
  /** Maximum elevation reached */
  peakElevation: number;
  /** Total orogenic shortening (m) */
  totalShortening: number;
  /** Crustal thickening factor (1.0 = no thickening) */
  thickeningFactor: number;
}

// ============================================================================
// Orogenic Belt Presets
// ============================================================================

/** Preset parameters for different orogenic belt types. */
interface OrogenicPreset {
  upliftRate: number;
  maxElevation: number;
  foldWavelength: number;
  foldAmplitude: number;
  foldTightness: number;
  thrustSpacing: number;
  thrustDip: number;
  thrustDisplacement: number;
  isostaticResponse: number;
  flexuralRigidity: number;
  foldSetCount: number;
  glacialCarving: number;
}

/** Get preset parameters for an orogenic belt type. */
function getOrogenicPreset(type: OrogenicBeltType): OrogenicPreset {
  switch (type) {
    case 'continental_collision':
      return {
        upliftRate: 0.8,
        maxElevation: 8848,
        foldWavelength: 40,
        foldAmplitude: 3000,
        foldTightness: 0.7,
        thrustSpacing: 15,
        thrustDip: 25,
        thrustDisplacement: 8000,
        isostaticResponse: 0.85,
        flexuralRigidity: 1e23,
        foldSetCount: 4,
        glacialCarving: 0.5,
      };
    case 'continental_arc':
      return {
        upliftRate: 0.5,
        maxElevation: 7000,
        foldWavelength: 30,
        foldAmplitude: 2000,
        foldTightness: 0.5,
        thrustSpacing: 20,
        thrustDip: 30,
        thrustDisplacement: 5000,
        isostaticResponse: 0.75,
        flexuralRigidity: 5e22,
        foldSetCount: 3,
        glacialCarving: 0.3,
      };
    case 'island_arc':
      return {
        upliftRate: 0.3,
        maxElevation: 4000,
        foldWavelength: 20,
        foldAmplitude: 1000,
        foldTightness: 0.4,
        thrustSpacing: 25,
        thrustDip: 35,
        thrustDisplacement: 3000,
        isostaticResponse: 0.6,
        flexuralRigidity: 2e22,
        foldSetCount: 2,
        glacialCarving: 0.2,
      };
    case 'rift_shoulder':
      return {
        upliftRate: 0.2,
        maxElevation: 3000,
        foldWavelength: 50,
        foldAmplitude: 500,
        foldTightness: 0.2,
        thrustSpacing: 40,
        thrustDip: 60,
        thrustDisplacement: 1000,
        isostaticResponse: 0.9,
        flexuralRigidity: 8e22,
        foldSetCount: 2,
        glacialCarving: 0.1,
      };
    case 'intracratonic':
      return {
        upliftRate: 0.15,
        maxElevation: 2000,
        foldWavelength: 60,
        foldAmplitude: 800,
        foldTightness: 0.3,
        thrustSpacing: 30,
        thrustDip: 40,
        thrustDisplacement: 2000,
        isostaticResponse: 0.7,
        flexuralRigidity: 3e23,
        foldSetCount: 2,
        glacialCarving: 0.1,
      };
  }
}

// ============================================================================
// MountainBuilding
// ============================================================================

/**
 * Real orogenic process simulator for mountain range formation.
 *
 * This class models mountain building as a series of coupled processes:
 * 1. Tectonic convergence drives crustal thickening
 * 2. Isostasy adjusts the crust-mantle boundary
 * 3. Fold-thrust belts develop in the upper crust
 * 4. Erosion modifies the topography and triggers isostatic rebound
 * 5. Foreland basins form from lithospheric flexure
 *
 * The type of mountain belt depends on the tectonic setting:
 * - Continental collision (both plates continental)
 * - Continental volcanic arc (oceanic subducting under continental)
 * - Island arc (oceanic subducting under oceanic)
 *
 * Usage:
 * ```typescript
 * const mb = new MountainBuilding({ simulationTime: 50 });
 * const range = mb.generateFromBoundary(boundary, plates, 256, 1000);
 * ```
 */
export class MountainBuilding {
  private params: MountainBuildingParams;
  private plateSimulator: unknown; // TectonicPlateSimulator reference
  private rng: SeededRandom;
  private noise: NoiseUtils;

  constructor(params?: Partial<MountainBuildingParams>) {
    this.params = {
      upliftRate: 0.5,
      maxElevation: 8848,
      crustalThickness: 35,
      foldWavelength: 50,
      foldAmplitude: 2000,
      foldTightness: 0.6,
      foldSetCount: 3,
      thrustSpacing: 20,
      thrustDip: 30,
      thrustDisplacement: 5000,
      isostaticResponse: 0.8,
      erosionalUnloading: 0.7,
      glacialCarving: 0.3,
      simulationTime: 50,
      timeStep: 0.1,
      flexuralRigidity: 1e23,
      mantleDensity: 3.3,
      crustDensity: 2.7,
      seed: 42,
      ...params,
    };
    this.rng = new SeededRandom(this.params.seed);
    this.noise = new NoiseUtils(this.params.seed);
  }

  /**
   * Set the tectonic plate simulator for coupled simulation.
   */
  setPlateSimulator(simulator: unknown): void {
    this.plateSimulator = simulator;
  }

  /**
   * Update parameters and re-seed.
   */
  updateParams(params: Partial<MountainBuildingParams>): void {
    this.params = { ...this.params, ...params };
    if (params.seed !== undefined) {
      this.rng = new SeededRandom(params.seed);
      this.noise = new NoiseUtils(params.seed);
    }
  }

  // ========================================================================
  // Generation from Tectonic Boundary
  // ========================================================================

  /**
   * Generate a mountain range from a tectonic boundary.
   *
   * Automatically determines the orogenic belt type and applies
   * appropriate parameters based on the plate types and convergence rate.
   *
   * @param boundary - The convergent plate boundary
   * @param plates - Array of all tectonic plates
   * @param gridSize - Grid dimensions
   * @param resolution - World-space resolution
   * @returns Complete mountain range data
   */
  generateFromBoundary(
    boundary: PlateBoundary,
    plates: TectonicPlate[],
    gridSize: number,
    resolution: number
  ): MountainRange {
    const p1 = plates[boundary.plate1];
    const p2 = plates[boundary.plate2];

    // Determine orogenic belt type
    let beltType: OrogenicBeltType;
    if (boundary.subType === 'continental_continental') {
      beltType = 'continental_collision';
    } else if (boundary.subType === 'oceanic_continental') {
      beltType = 'continental_arc';
    } else if (boundary.subType === 'oceanic_oceanic') {
      beltType = 'island_arc';
    } else {
      beltType = 'intracratonic';
    }

    // Apply orogenic preset parameters
    const preset = getOrogenicPreset(beltType);
    const scaledParams: Partial<MountainBuildingParams> = {
      ...preset,
      // Scale by convergence rate
      upliftRate: preset.upliftRate * (1 + Math.abs(boundary.convergenceRate) * 3),
      thrustDisplacement: preset.thrustDisplacement * (1 + Math.abs(boundary.convergenceRate) * 2),
    };

    this.updateParams(scaledParams);

    // Compute collision zone geometry
    const collisionZone = this.computeCollisionZone(boundary, p1, p2, gridSize, resolution);
    const plateVelocity = boundary.relativeVelocity.clone();

    return this.generateMountainRange(
      collisionZone, plateVelocity, gridSize, resolution, beltType
    );
  }

  /**
   * Compute the collision zone geometry from boundary data.
   */
  private computeCollisionZone(
    boundary: PlateBoundary,
    p1: TectonicPlate,
    p2: TectonicPlate,
    gridSize: number,
    resolution: number
  ): Vector3[] {
    const cellSize = resolution / gridSize;
    const zone: Vector3[] = [];
    const halfWorld = resolution / 2;

    for (const idx of boundary.cells) {
      const row = Math.floor(idx / gridSize);
      const col = idx % gridSize;
      const x = col * cellSize - halfWorld + cellSize / 2;
      const z = row * cellSize - halfWorld + cellSize / 2;
      zone.push(new Vector3(x, 0, z));
    }

    // If no cells, use centroid midpoint
    if (zone.length === 0) {
      zone.push(p1.centroid.clone().add(p2.centroid).multiplyScalar(0.5));
    }

    return zone;
  }

  // ========================================================================
  // Core Mountain Range Generation
  // ========================================================================

  /**
   * Generate a mountain range from collision zone data.
   *
   * This is the main generation pipeline:
   * 1. Crustal thickening from convergence
   * 2. Isostatic adjustment
   * 3. Fold structure generation
   * 4. Thrust fault system generation
   * 5. Foreland basin formation
   * 6. Erosional modification
   * 7. Peak and ridge extraction
   *
   * @param collisionZone - Points along the collision boundary
   * @param plateVelocity - Relative velocity of converging plates
   * @param gridSize - Grid dimensions
   * @param resolution - World-space resolution
   * @param beltType - Type of orogenic belt
   * @returns Complete mountain range data
   */
  generateMountainRange(
    collisionZone: Vector3[],
    plateVelocity: Vector3,
    gridSize: number,
    resolution: number,
    beltType: OrogenicBeltType = 'continental_collision'
  ): MountainRange {
    const {
      upliftRate, maxElevation, foldWavelength, foldAmplitude,
      thrustSpacing, thrustDip, thrustDisplacement,
      simulationTime, timeStep, crustalThickness,
    } = this.params;

    const numPoints = gridSize * gridSize;
    const elevationMap = new Float32Array(numPoints);
    const cellSize = resolution / gridSize;

    // Compute total convergence
    const convergenceSpeed = plateVelocity.length();
    const totalConvergence = convergenceSpeed * simulationTime * 1e6; // meters

    // Step 1: Apply crustal thickening
    const thickeningFactor = this.applyCrustalThickening(
      elevationMap, collisionZone, gridSize, cellSize,
      totalConvergence, beltType
    );

    // Step 2: Apply isostatic adjustment
    this.applyIsostaticAdjustment(
      elevationMap, gridSize, cellSize, thickeningFactor
    );

    // Step 3: Generate fold structures
    const foldAxes = this.generateFoldStructures(
      elevationMap, collisionZone, gridSize, cellSize,
      foldWavelength, foldAmplitude, beltType
    );

    // Step 4: Create thrust fault system
    const thrustFaults = this.createThrustFaultSystem(
      elevationMap, collisionZone, gridSize, cellSize,
      thrustSpacing, thrustDip * Math.PI / 180, thrustDisplacement,
      beltType
    );

    // Step 5: Form foreland basins
    const forelandBasins = this.generateForelandBasins(
      elevationMap, collisionZone, gridSize, cellSize,
      thrustFaults, beltType
    );

    // Step 6: Apply erosional modification
    this.applyErosionalModification(
      elevationMap, gridSize, cellSize, simulationTime, timeStep
    );

    // Step 7: Extract peaks and ridges
    const { peaks, ridges, valleys } = this.extractTopographicFeatures(
      elevationMap, gridSize, cellSize
    );

    // Cap elevation at maximum
    let peakElevation = 0;
    for (let i = 0; i < numPoints; i++) {
      elevationMap[i] = Math.min(elevationMap[i], maxElevation);
      peakElevation = Math.max(peakElevation, elevationMap[i]);
    }

    return {
      peaks,
      ridges,
      valleys,
      elevationMap,
      foldAxes,
      thrustFaults,
      forelandBasins,
      beltType,
      peakElevation,
      totalShortening: totalConvergence,
      thickeningFactor,
    };
  }

  // ========================================================================
  // Crustal Thickening
  // ========================================================================

  /**
   * Apply crustal thickening from plate convergence.
   *
   * Uses Airy isostasy model: the elevation increase is proportional
   * to the crustal thickening, which is proportional to the convergence.
   * Different belt types produce different thickening patterns.
   */
  private applyCrustalThickening(
    elevationMap: Float32Array,
    collisionZone: Vector3[],
    gridSize: number,
    cellSize: number,
    convergence: number,
    beltType: OrogenicBeltType
  ): number {
    const { crustalThickness, crustDensity, mantleDensity } = this.params;

    // Airy isostasy: surface elevation = thickening * (1 - ρc/ρm)
    const densityContrast = 1 - crustDensity / mantleDensity;

    // Maximum crustal thickening depends on convergence and belt type
    let maxThickening: number;
    let thickeningWidth: number;

    switch (beltType) {
      case 'continental_collision':
        // Broad thickening: Himalayas have ~70km crust vs 35km normal
        maxThickening = convergence * 0.4; // 40% of convergence → thickening
        thickeningWidth = 200 * 1000; // 200 km wide orogenic belt
        break;
      case 'continental_arc':
        // Narrower thickening focused on volcanic arc
        maxThickening = convergence * 0.25;
        thickeningWidth = 100 * 1000; // 100 km wide arc
        break;
      case 'island_arc':
        // Minimal thickening, focused on volcanic islands
        maxThickening = convergence * 0.15;
        thickeningWidth = 50 * 1000; // 50 km wide island arc
        break;
      case 'rift_shoulder':
        // Very minor thickening, mostly isostatic uplift
        maxThickening = convergence * 0.1;
        thickeningWidth = 80 * 1000;
        break;
      default:
        maxThickening = convergence * 0.2;
        thickeningWidth = 150 * 1000;
    }

    // Cap thickening at 2× original crust (realistic maximum)
    maxThickening = Math.min(maxThickening, crustalThickness);

    // Compute thickening factor (ratio of new to old crust thickness)
    const thickeningFactor = 1 + maxThickening / crustalThickness;

    // Apply thickening as elevation change around collision zone
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const worldX = x * cellSize;
        const worldZ = y * cellSize;
        const pos = new Vector3(worldX, 0, worldZ);

        // Find minimum distance to collision zone
        let minDistance = Infinity;
        for (const zonePoint of collisionZone) {
          const distance = pos.distanceTo(zonePoint);
          minDistance = Math.min(minDistance, distance);
          if (minDistance < cellSize) break; // Early exit
        }

        // Elevation from crustal thickening with distance falloff
        if (minDistance < thickeningWidth) {
          // Gaussian falloff from collision zone
          const sigma = thickeningWidth / 3;
          const falloff = Math.exp(-minDistance * minDistance / (2 * sigma * sigma));

          // Surface elevation = thickening * density_contrast
          const localUplift = maxThickening * 1000 * densityContrast * falloff; // Convert km to m

          // Add orographic noise for natural mountain range shape
          const noiseScale = 0.005;
          const orographicNoise = this.noise.fbm(
            worldX * noiseScale,
            0,
            worldZ * noiseScale,
            5
          );
          const noisyUplift = localUplift * (1 + orographicNoise * 0.3);

          const index = y * gridSize + x;
          elevationMap[index] += noisyUplift;
        }
      }
    }

    return thickeningFactor;
  }

  // ========================================================================
  // Isostatic Adjustment
  // ========================================================================

  /**
   * Apply isostatic adjustment to the elevation map.
   *
   * Airy isostasy: the crust floats on the mantle. Thickened crust
   * creates both a mountain root (downward) and surface uplift.
   * The surface elevation is: h = (ρm - ρc)/ρm × Δh
   *
   * Also applies regional isostatic compensation that spreads the
   * uplift over a wider area (flexural isostasy).
   */
  private applyIsostaticAdjustment(
    elevationMap: Float32Array,
    gridSize: number,
    cellSize: number,
    thickeningFactor: number
  ): void {
    const { isostaticResponse, crustDensity, mantleDensity, flexuralRigidity } = this.params;

    // Simple isostatic correction: multiply elevation by isostatic factor
    // Real isostasy gives: h_surface = thickening * (ρm - ρc) / ρm
    const isostaticFactor = isostaticResponse * (mantleDensity - crustDensity) / mantleDensity;

    // Apply isostatic factor to existing elevation
    for (let i = 0; i < elevationMap.length; i++) {
      elevationMap[i] *= isostaticFactor;
    }

    // Apply flexural isostasy (regional compensation)
    // This smooths the elevation over a flexural wavelength
    const flexuralWavelength = Math.pow(
      flexuralRigidity / (mantleDensity * 9.81 * 1000),
      0.25
    );
    const smoothingRadius = Math.min(
      Math.floor(flexuralWavelength / cellSize),
      gridSize / 4
    );

    if (smoothingRadius > 1) {
      this.applyGaussianSmoothing(elevationMap, gridSize, smoothingRadius);
    }
  }

  /**
   * Apply Gaussian smoothing to the elevation map (flexural isostasy).
   */
  private applyGaussianSmoothing(
    elevationMap: Float32Array,
    gridSize: number,
    radius: number
  ): void {
    const temp = new Float32Array(elevationMap.length);
    const sigma = radius / 3;

    // Compute Gaussian kernel
    const kernelSize = radius * 2 + 1;
    const kernel = new Float32Array(kernelSize);
    let kernelSum = 0;

    for (let i = 0; i < kernelSize; i++) {
      const x = i - radius;
      kernel[i] = Math.exp(-x * x / (2 * sigma * sigma));
      kernelSum += kernel[i];
    }

    // Normalize kernel
    for (let i = 0; i < kernelSize; i++) {
      kernel[i] /= kernelSum;
    }

    // Horizontal pass
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = Math.max(0, Math.min(gridSize - 1, x + k));
          sum += elevationMap[y * gridSize + sx] * kernel[k + radius];
        }
        temp[y * gridSize + x] = sum;
      }
    }

    // Vertical pass
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const sy = Math.max(0, Math.min(gridSize - 1, y + k));
          sum += temp[sy * gridSize + x] * kernel[k + radius];
        }
        elevationMap[y * gridSize + x] = sum;
      }
    }
  }

  // ========================================================================
  // Fold Structure Generation
  // ========================================================================

  /**
   * Generate fold structures in the orogenic belt.
   *
   * Folds are wave-like deformations of rock layers caused by
   * compressive stress. Different fold types form depending on
   * the stress regime and rock properties.
   */
  private generateFoldStructures(
    elevationMap: Float32Array,
    collisionZone: Vector3[],
    gridSize: number,
    cellSize: number,
    wavelength: number,
    amplitude: number,
    beltType: OrogenicBeltType
  ): FoldStructure[] {
    const { foldTightness, foldSetCount } = this.params;
    const foldStructures: FoldStructure[] = [];

    // Convert wavelength to grid units
    const wavelengthMeters = wavelength * 1000;
    const frequency = (2 * Math.PI) / wavelengthMeters;

    // Determine primary compression direction from collision zone
    let compressionDir = new Vector3(1, 0, 0);
    if (collisionZone.length >= 2) {
      const zoneDir = new Vector3()
        .subVectors(collisionZone[1], collisionZone[0]).normalize();
      compressionDir = new Vector3(-zoneDir.z, 0, zoneDir.x);
    }

    // Generate multiple fold sets with different orientations
    for (let set = 0; set < foldSetCount; set++) {
      // Each fold set has a slightly different orientation
      const orientation = Math.atan2(compressionDir.z, compressionDir.x) +
        (set / foldSetCount) * Math.PI * 0.5 - Math.PI * 0.25;
      const phaseOffset = set * (Math.PI / foldSetCount) + this.rng.next() * Math.PI;

      // Determine fold type
      const foldType = this.determineFoldType(set, beltType);

      // Fold amplitude varies by set (first set is dominant)
      const setAmplitude = amplitude * Math.pow(0.6, set);

      // Create fold structure
      const axisDir = new Vector3(
        Math.cos(orientation + Math.PI / 2), 0,
        Math.sin(orientation + Math.PI / 2)
      );
      const hingeLine: Vector3[] = [];
      const hingeLength = gridSize * cellSize * 0.5;
      const numHingePoints = 20;

      for (let i = 0; i < numHingePoints; i++) {
        const t = i / (numHingePoints - 1);
        const center = collisionZone.length > 0
          ? collisionZone[Math.floor(collisionZone.length / 2)]
          : new Vector3();
        hingeLine.push(
          center.clone().add(
            axisDir.clone().multiplyScalar((t - 0.5) * hingeLength)
          )
        );
      }

      foldStructures.push({
        axisDirection: axisDir,
        hingeLine,
        wavelength: wavelengthMeters,
        amplitude: setAmplitude,
        type: foldType,
        tightness: foldTightness * (1 - set * 0.15),
        plunge: this.rng.nextFloat(-10, 10),
      });

      // Apply fold displacement to elevation
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const worldX = x * cellSize;
          const worldZ = y * cellSize;

          // Project position onto fold direction
          const projectedDist =
            worldX * Math.cos(orientation) +
            worldZ * Math.sin(orientation);

          // Calculate fold displacement
          const foldPhase = projectedDist * frequency + phaseOffset;
          let foldDisplacement: number;

          if (foldTightness > 0.7) {
            // Chevron folds: sharp, angular
            foldDisplacement = setAmplitude *
              (2 * Math.abs(2 * (foldPhase / (2 * Math.PI) -
              Math.floor(foldPhase / (2 * Math.PI) + 0.5))) - 1);
          } else if (foldTightness > 0.4) {
            // Rounded chevron: modified sine
            foldDisplacement = setAmplitude *
              Math.pow(Math.abs(Math.sin(foldPhase)), 1.3) *
              Math.sign(Math.sin(foldPhase));
          } else {
            // Open folds: sinusoidal
            foldDisplacement = setAmplitude * Math.sin(foldPhase);
          }

          // Apply with decreasing amplitude away from collision zone
          const pos = new Vector3(worldX, 0, worldZ);
          let minDist = Infinity;
          for (const zp of collisionZone) {
            minDist = Math.min(minDist, pos.distanceTo(zp));
            if (minDist < cellSize) break;
          }
          const distFalloff = Math.exp(-minDist / (wavelengthMeters * 3));

          const index = y * gridSize + x;
          elevationMap[index] += foldDisplacement * 0.3 * distFalloff;
        }
      }
    }

    return foldStructures;
  }

  /**
   * Determine fold type from position in orogenic belt.
   */
  private determineFoldType(
    setIndex: number,
    beltType: OrogenicBeltType
  ): FoldStructure['type'] {
    if (beltType === 'continental_collision') {
      return setIndex === 0 ? 'anticline' :
             setIndex === 1 ? 'syncline' : 'anticline';
    } else if (beltType === 'island_arc') {
      return setIndex === 0 ? 'dome' : 'basin';
    }
    return setIndex % 2 === 0 ? 'anticline' : 'syncline';
  }

  // ========================================================================
  // Thrust Fault System Generation
  // ========================================================================

  /**
   * Create a thrust fault system in the orogenic belt.
   *
   * Thrust faults form an imbricate fan: a series of low-angle
   * faults that step progressively toward the foreland. The
   * leading thrust is the youngest and most active.
   */
  private createThrustFaultSystem(
    elevationMap: Float32Array,
    collisionZone: Vector3[],
    gridSize: number,
    cellSize: number,
    spacing: number,
    dipAngle: number,
    displacement: number,
    beltType: OrogenicBeltType
  ): ThrustFault[] {
    const thrustFaults: ThrustFault[] = [];
    const spacingMeters = spacing * 1000;

    // Determine compression direction (perpendicular to collision zone)
    let compressionDir = new Vector3(1, 0, 0);
    let strikeDir = new Vector3(0, 0, 1);

    if (collisionZone.length >= 2) {
      const zoneDir = new Vector3()
        .subVectors(
          collisionZone[Math.min(1, collisionZone.length - 1)],
          collisionZone[0]
        ).normalize();
      compressionDir = new Vector3(-zoneDir.z, 0, zoneDir.x);
      strikeDir = zoneDir.clone();
    }

    // Number of thrusts depends on belt type
    const maxThrusts = beltType === 'continental_collision' ? 12 :
                       beltType === 'continental_arc' ? 8 : 5;

    // Create imbricate fan of thrusts
    const centerPoint = collisionZone.length > 0
      ? collisionZone[Math.floor(collisionZone.length / 2)]
      : new Vector3();

    for (let i = 0; i < maxThrusts; i++) {
      // Each thrust steps toward the foreland
      const offset = i * spacingMeters;
      const faultPosition = centerPoint.clone()
        .add(compressionDir.clone().multiplyScalar(offset));

      // Dip angle decreases slightly for inner thrusts (listric geometry)
      const localDip = dipAngle - i * 0.02;

      // Displacement decreases toward the hinterland
      const localDisplacement = displacement * Math.pow(0.8, i);

      // Add some randomness to fault position and properties
      const jitter = (this.rng.next() - 0.5) * spacingMeters * 0.3;
      faultPosition.add(strikeDir.clone().multiplyScalar(jitter));

      const faultNormal = new Vector3(
        -compressionDir.x * Math.sin(localDip),
        Math.cos(localDip),
        -compressionDir.z * Math.sin(localDip)
      ).normalize();

      const fault: ThrustFault = {
        position: faultPosition,
        normal: faultNormal,
        dipAngle: localDip,
        displacement: localDisplacement,
        length: gridSize * cellSize * 0.7,
        strike: strikeDir.clone(),
        isLeading: i === 0,
      };

      thrustFaults.push(fault);

      // Apply thrust displacement to elevation map
      this.applyThrustDisplacement(
        elevationMap, fault, gridSize, cellSize, beltType
      );

      if (localDisplacement < displacement * 0.1) break; // Stop when displacement is too small
    }

    return thrustFaults;
  }

  /**
   * Apply displacement along a thrust fault to the elevation map.
   */
  private applyThrustDisplacement(
    elevationMap: Float32Array,
    fault: ThrustFault,
    gridSize: number,
    cellSize: number,
    beltType: OrogenicBeltType
  ): void {
    const { displacement, dipAngle } = fault;
    const verticalComponent = displacement * Math.sin(dipAngle);
    const horizontalComponent = displacement * Math.cos(dipAngle);

    // Hanging wall is on the side opposite the fault normal's horizontal component
    const hwDirection = new Vector3(
      -fault.normal.x, 0, -fault.normal.z
    ).normalize();

    // Influence width depends on belt type
    const influenceWidth = beltType === 'continental_collision'
      ? 80 * 1000   // 80 km for continental collision
      : beltType === 'continental_arc'
      ? 50 * 1000   // 50 km for volcanic arc
      : 30 * 1000;  // 30 km for island arc

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const worldX = x * cellSize;
        const worldZ = y * cellSize;
        const pos = new Vector3(worldX, 0, worldZ);

        // Check if point is in hanging wall
        const vectorToFault = new Vector3()
          .subVectors(pos, fault.position);
        const isInHangingWall = vectorToFault.dot(hwDirection) > 0;

        if (isInHangingWall) {
          // Distance from fault trace
          const distanceFromFault = Math.abs(
            vectorToFault.dot(new Vector3(fault.normal.x, 0, fault.normal.z))
          );

          // Displacement with exponential falloff
          const falloff = Math.exp(-distanceFromFault / (influenceWidth * 0.3));

          // Thrust faults create ramp-flat geometry
          // Near the fault: steep ramp (higher slope)
          // Far from fault: flat upper plate
          const rampWidth = influenceWidth * 0.2;
          let profileFactor: number;
          if (distanceFromFault < rampWidth) {
            // Steep ramp zone
            profileFactor = 1.0;
          } else {
            // Flat zone with gradual decrease
            profileFactor = Math.exp(-(distanceFromFault - rampWidth) / (influenceWidth * 0.4));
          }

          const index = y * gridSize + x;
          elevationMap[index] += verticalComponent * falloff * profileFactor;
        }
      }
    }
  }

  // ========================================================================
  // Foreland Basin Generation
  // ========================================================================

  /**
   * Generate foreland basins adjacent to the orogenic belt.
   *
   * Foreland basins form when the weight of the mountain belt
   * flexes the lithosphere downward, creating a depression on
   * the side of the foreland. The depth and width depend on
   * the flexural rigidity and mountain belt load.
   */
  private generateForelandBasins(
    elevationMap: Float32Array,
    collisionZone: Vector3[],
    gridSize: number,
    cellSize: number,
    thrustFaults: ThrustFault[],
    beltType: OrogenicBeltType
  ): ForelandBasin[] {
    const basins: ForelandBasin[] = [];
    if (thrustFaults.length === 0) return basins;

    // The leading thrust marks the mountain front
    const leadingThrust = thrustFaults.find(f => f.isLeading) ?? thrustFaults[0];
    const hwDir = new Vector3(
      -leadingThrust.normal.x, 0, -leadingThrust.normal.z
    ).normalize();

    // Foreland is on the opposite side of the hanging wall
    const forelandDir = hwDir.clone().negate();

    // Basin parameters from flexural rigidity
    const { flexuralRigidity, mantleDensity } = this.params;
    const flexuralWavelength = Math.pow(
      4 * flexuralRigidity / (mantleDensity * 9.81 * 1000),
      0.25
    );

    // Basin depth from mountain belt load (simplified)
    const totalLoad = thrustFaults.reduce(
      (sum, f) => sum + f.displacement * f.length * 2700 * 9.81,
      0
    );
    const maxBasinDepth = Math.min(
      5000, // Maximum 5 km deep
      totalLoad / (flexuralRigidity * 0.001)
    );
    const basinWidth = flexuralWavelength * 1.5;

    // Generate basin geometry
    const proximalEdge: Vector3[] = [];
    const distalEdge: Vector3[] = [];
    const flexuralProfile = new Float32Array(50);

    for (let i = 0; i < 50; i++) {
      const t = i / 49;
      const distance = t * basinWidth;
      const pos = leadingThrust.position.clone()
        .add(forelandDir.clone().multiplyScalar(distance));

      proximalEdge.push(pos.clone());
      distalEdge.push(pos.clone().add(
        leadingThrust.strike.clone().multiplyScalar(gridSize * cellSize * 0.3)
      ));

      // Flexural profile: exponential decay with possible forebulge
      const x = distance / flexuralWavelength;
      flexuralProfile[i] = -maxBasinDepth * Math.exp(-x) * Math.cos(x);
    }

    basins.push({
      proximalEdge,
      distalEdge,
      maxDepth: maxBasinDepth,
      width: basinWidth,
      flexuralProfile,
    });

    // Apply foreland basin subsidence to elevation map
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const worldX = x * cellSize;
        const worldZ = y * cellSize;
        const pos = new Vector3(worldX, 0, worldZ);

        // Distance from mountain front along foreland direction
        const distFromFront = pos.clone()
          .sub(leadingThrust.position)
          .dot(forelandDir);

        if (distFromFront > 0 && distFromFront < basinWidth) {
          const normalizedDist = distFromFront / flexuralWavelength;
          // Flexural profile: depression + possible forebulge
          const subsidence = -maxBasinDepth * Math.exp(-normalizedDist) *
            Math.cos(normalizedDist);

          const index = y * gridSize + x;
          elevationMap[index] += subsidence;
        }
      }
    }

    return basins;
  }

  // ========================================================================
  // Erosional Modification
  // ========================================================================

  /**
   * Apply erosional modification over geological time.
   *
   * Models three erosion processes:
   * 1. Slope-dependent erosion (fluvial/hillslope)
   * 2. Glacial erosion (above snowline)
   * 3. Isostatic rebound from erosional unloading
   */
  private applyErosionalModification(
    elevationMap: Float32Array,
    gridSize: number,
    cellSize: number,
    simulationTime: number,
    timeStep: number
  ): void {
    const { erosionalUnloading, glacialCarving } = this.params;
    const numSteps = Math.min(
      Math.floor(simulationTime / timeStep),
      200 // Cap iterations for performance
    );

    const tempElevation = new Float32Array(elevationMap.length);

    // Snowline elevation (approximate)
    const snowline = 2500; // meters

    for (let step = 0; step < numSteps; step++) {
      tempElevation.set(elevationMap);

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const index = y * gridSize + x;
          const elevation = elevationMap[index];

          // Slope-dependent erosion
          const slope = this.calculateSlope(
            elevationMap, x, y, gridSize, cellSize
          );
          const slopeErosion = slope * slope * 0.005 * timeStep; // Quadratic slope dependence

          // Glacial erosion (only above snowline)
          let glacialErosion = 0;
          if (elevation > snowline && glacialCarving > 0) {
            // Glacial erosion rate increases with elevation and slope
            const elevationFactor = (elevation - snowline) / 1000;
            glacialErosion = glacialCarving * slope *
              elevationFactor * 0.002 * timeStep;

            // U-shaped valley profile: enhance erosion in valleys
            // This is a simplified model; real glacial erosion
            // would require flow-line modeling
            const curvature = this.calculateCurvature(
              elevationMap, x, y, gridSize, cellSize
            );
            if (curvature > 0) { // Concave = valley
              glacialErosion *= (1 + curvature * 2);
            }
          }

          const totalErosion = slopeErosion + glacialErosion;
          tempElevation[index] -= totalErosion;

          // Isostatic rebound from erosional unloading
          // When material is removed, the crust rises to compensate
          const rebound = totalErosion * erosionalUnloading *
            (this.params.crustDensity / this.params.mantleDensity);
          tempElevation[index] += rebound;
        }
      }

      elevationMap.set(tempElevation);
    }
  }

  /**
   * Calculate the terrain slope at a grid point.
   */
  private calculateSlope(
    elevationMap: Float32Array,
    x: number,
    y: number,
    gridSize: number,
    cellSize: number
  ): number {
    const getElev = (px: number, py: number): number => {
      if (px < 0 || px >= gridSize || py < 0 || py >= gridSize) {
        return 0;
      }
      return elevationMap[py * gridSize + px];
    };

    const dzdx = (getElev(x + 1, y) - getElev(x - 1, y)) / (2 * cellSize);
    const dzdy = (getElev(x, y + 1) - getElev(x, y - 1)) / (2 * cellSize);

    return Math.sqrt(dzdx * dzdx + dzdy * dzdy);
  }

  /**
   * Calculate the terrain curvature at a grid point.
   *
   * Positive curvature = concave (valley)
   * Negative curvature = convex (ridge)
   */
  private calculateCurvature(
    elevationMap: Float32Array,
    x: number,
    y: number,
    gridSize: number,
    cellSize: number
  ): number {
    const getElev = (px: number, py: number): number => {
      if (px < 0 || px >= gridSize || py < 0 || py >= gridSize) {
        return 0;
      }
      return elevationMap[py * gridSize + px];
    };

    // Laplacian (second derivative)
    const center = getElev(x, y);
    const laplacian = (
      getElev(x + 1, y) + getElev(x - 1, y) +
      getElev(x, y + 1) + getElev(x, y - 1) -
      4 * center
    ) / (cellSize * cellSize);

    // Negative Laplacian = concave (valley)
    return -laplacian;
  }

  // ========================================================================
  // Topographic Feature Extraction
  // ========================================================================

  /**
   * Extract peaks, ridges, and valleys from the elevation map.
   */
  private extractTopographicFeatures(
    elevationMap: Float32Array,
    gridSize: number,
    cellSize: number
  ): { peaks: Vector3[]; ridges: Vector3[][]; valleys: Vector3[][] } {
    const peaks: Vector3[] = [];
    const ridges: Vector3[][] = [];
    const valleys: Vector3[][] = [];

    // Find local maxima (peaks) using a sliding window
    const windowSize = 3;
    const halfWindow = Math.floor(windowSize / 2);

    for (let y = halfWindow; y < gridSize - halfWindow; y++) {
      for (let x = halfWindow; x < gridSize - halfWindow; x++) {
        const index = y * gridSize + x;
        const centerElev = elevationMap[index];

        // Check if local maximum
        let isPeak = true;
        for (let dy = -halfWindow; dy <= halfWindow && isPeak; dy++) {
          for (let dx = -halfWindow; dx <= halfWindow; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighborIndex = (y + dy) * gridSize + (x + dx);
            if (elevationMap[neighborIndex] > centerElev) {
              isPeak = false;
            }
          }
        }

        // Only significant peaks (above minimum elevation)
        if (isPeak && centerElev > this.params.maxElevation * 0.1) {
          peaks.push(new Vector3(
            x * cellSize,
            centerElev,
            y * cellSize
          ));
        }
      }
    }

    // Extract ridgelines and valleys using curvature analysis
    this.extractLinearFeatures(elevationMap, gridSize, cellSize, ridges, valleys);

    return { peaks, ridges, valleys };
  }

  /**
   * Extract linear features (ridges and valleys) from curvature.
   */
  private extractLinearFeatures(
    elevationMap: Float32Array,
    gridSize: number,
    cellSize: number,
    ridges: Vector3[][],
    valleys: Vector3[][]
  ): void {
    const curvatureThreshold = 0.0001;

    for (let y = 1; y < gridSize - 1; y++) {
      const ridgeLine: Vector3[] = [];
      const valleyLine: Vector3[] = [];

      for (let x = 1; x < gridSize - 1; x++) {
        const index = y * gridSize + x;
        const left = elevationMap[y * gridSize + (x - 1)];
        const right = elevationMap[y * gridSize + (x + 1)];
        const center = elevationMap[index];

        // Second derivative (curvature)
        const curvature = left - 2 * center + right;
        const pos = new Vector3(x * cellSize, center, y * cellSize);

        if (curvature > curvatureThreshold && center > this.params.maxElevation * 0.05) {
          ridgeLine.push(pos);
        } else if (curvature < -curvatureThreshold) {
          valleyLine.push(pos);
        }
      }

      if (ridgeLine.length > 5) ridges.push(ridgeLine);
      if (valleyLine.length > 5) valleys.push(valleyLine);
    }
  }

  // ========================================================================
  // Mesh Integration
  // ========================================================================

  /**
   * Apply mountain building results to a terrain mesh.
   *
   * Displaces mesh vertices according to the mountain range elevation map.
   */
  applyToMesh(
    positions: Float32Array,
    mountainRange: MountainRange,
    transform: Matrix4
  ): void {
    const inverseTransform = new Matrix4().copy(transform).invert();

    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      );

      // Transform to mountain range coordinate space
      vertex.applyMatrix4(inverseTransform);

      // Find corresponding elevation
      const gridX = Math.floor(vertex.x);
      const gridZ = Math.floor(vertex.z);
      const gridSize = Math.sqrt(mountainRange.elevationMap.length);

      if (gridX >= 0 && gridX < gridSize && gridZ >= 0 && gridZ < gridSize) {
        const elevation = mountainRange.elevationMap[gridZ * gridSize + gridX];
        if (!isNaN(elevation)) {
          positions[i + 1] = elevation;
        }
      }
    }
  }
}
