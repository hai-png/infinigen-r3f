/**
 * TectonicPlateSimulator — Real Dynamic Plate Tectonics Simulation
 *
 * Implements a physically-grounded tectonic plate simulation with:
 * - Voronoi-based plate generation from random seed points
 * - Plate motion driven by mantle convection, ridge push, and slab pull
 * - Euler pole rotation for realistic plate kinematics
 * - Boundary classification (convergent, divergent, transform)
 * - Full boundary interaction modeling (orogeny, subduction, rifting, etc.)
 * - Time-stepped simulation with configurable duration
 * - Seed-based reproducibility
 *
 * Ported/inspired by: infinigen/terrain/tectonic/plate_simulator.py
 * Enhanced with real geophysical force models.
 */

import * as THREE from 'three';
import { Vector3 } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Configuration Types
// ============================================================================

/** Configuration for the tectonic plate simulator. */
export interface PlateConfig {
  /** Random seed for reproducibility */
  seed: number;
  /** Number of tectonic plates to generate */
  numPlates: number;
  /** Base plate velocity scale (cm/year equivalent, normalized) */
  plateVelocity: number;
  /** Rate of uplift at convergent boundaries (meters per sim step) */
  convergenceUpliftRate: number;
  /** Rate of subsidence at divergent boundaries (meters per sim step) */
  divergenceSubsidenceRate: number;
  /** Intensity multiplier for mountain building processes */
  mountainBuildingIntensity: number;
  /** Maximum depth of rift valleys (meters) */
  riftDepth: number;
  /** Probability of volcanic activity at subduction zones (0-1) */
  volcanicActivity: number;
  /** Number of simulation time steps to run */
  simulationSteps: number;
  /** Duration of each time step (million years) */
  timeStepDuration: number;
  /** Mantle convection strength (drives plate motion) */
  mantleConvectionStrength: number;
  /** Mantle viscosity (damping factor for plate motion) */
  mantleViscosity: number;
  /** Ridge push force coefficient */
  ridgePushCoefficient: number;
  /** Slab pull force coefficient */
  slabPullCoefficient: number;
  /** Plate boundary classification threshold (cosine angle) */
  boundaryAngleThreshold: number;
  /** Volcanic arc offset distance from trench (km) */
  volcanicArcOffset: number;
  /** Maximum volcanic cone height (meters) */
  volcanicConeHeight: number;
}

// ============================================================================
// Plate Data Types
// ============================================================================

/** Represents a single tectonic plate with full geophysical properties. */
export interface TectonicPlate {
  /** Unique plate identifier */
  id: number;
  /** Center of mass of the plate in world coordinates */
  centroid: THREE.Vector3;
  /** Translational velocity vector (cm/year normalized) */
  velocity: THREE.Vector3;
  /** Current rotation angle (radians) */
  rotation: number;
  /** Angular velocity around the Euler pole (radians/Myr) */
  angularVelocity: number;
  /** Euler pole position (axis of rotation) */
  eulerPole: THREE.Vector3;
  /** Plate type: continental (thick, low density) or oceanic (thin, high density) */
  type: 'continental' | 'oceanic';
  /** Crustal thickness in km (continental: 30-50, oceanic: 5-10) */
  thickness: number;
  /** Density in g/cm³ (continental: ~2.7, oceanic: ~3.0) */
  density: number;
  /** Plate age in Myr (affects subduction behavior) */
  age: number;
  /** Total area of the plate in world units² */
  area: number;
  /** Grid cells belonging to this plate */
  cells: number[];
  /** Grid cells at the boundary of this plate */
  boundaryCells: number[];
  /** Accumulated stress at plate boundaries */
  stress: number;
  /** Force accumulator for plate motion calculation */
  netForce: THREE.Vector3;
}

/** Classified plate boundary types based on relative plate motion. */
export type BoundaryType = 'convergent' | 'divergent' | 'transform';

/** Sub-type classification for convergent boundaries. */
export type ConvergentSubType =
  | 'continental_continental'  // Orogenic belt (e.g., Himalayas)
  | 'oceanic_continental'      // Subduction trench + volcanic arc (e.g., Andes)
  | 'oceanic_oceanic';         // Island arc (e.g., Japan)

/** Sub-type classification for divergent boundaries. */
export type DivergentSubType =
  | 'continental_rift'  // Rift valley (e.g., East African Rift)
  | 'oceanic_ridge';    // Mid-ocean ridge (e.g., Mid-Atlantic Ridge)

/** Represents a boundary between two tectonic plates. */
export interface PlateBoundary {
  /** First plate ID */
  plate1: number;
  /** Second plate ID */
  plate2: number;
  /** Main boundary classification */
  type: BoundaryType;
  /** Sub-type classification (depends on plate types) */
  subType: ConvergentSubType | DivergentSubType | null;
  /** Grid cells along this boundary */
  cells: number[];
  /** Per-cell uplift/subsidence values */
  uplift: Float32Array;
  /** Convergence rate (positive = converging, negative = diverging) */
  convergenceRate: number;
  /** Relative velocity at the boundary */
  relativeVelocity: THREE.Vector3;
  /** Boundary normal direction (pointing from plate1 toward plate2) */
  normal: THREE.Vector3;
  /** Boundary stress magnitude */
  stress: number;
}

/** Volcanic feature generated at subduction zones. */
export interface VolcanicFeature {
  /** Position in world coordinates */
  position: THREE.Vector3;
  /** Cone height in meters */
  height: number;
  /** Base radius in meters */
  radius: number;
  /** Eruption intensity (0-1) */
  intensity: number;
  /** Whether this is a stratovolcano or shield volcano */
  volcanoType: 'stratovolcano' | 'shield';
  /** Host plate ID */
  plateId: number;
}

/** Rift valley feature at divergent boundaries. */
export interface RiftFeature {
  /** Center line points of the rift */
  centerLine: THREE.Vector3[];
  /** Rift width in meters */
  width: number;
  /** Rift depth in meters */
  depth: number;
  /** Rift type (continental or oceanic) */
  type: DivergentSubType;
  /** Boundary plates */
  plate1Id: number;
  plate2Id: number;
}

/** Complete result of a tectonic simulation. */
export interface TectonicSimulationResult {
  /** Modified heightmap from tectonic processes */
  finalHeightmap: Float32Array;
  /** All plates with their final state */
  plates: TectonicPlate[];
  /** All classified boundaries */
  boundaries: PlateBoundary[];
  /** Volcanic features generated at subduction zones */
  volcanicFeatures: VolcanicFeature[];
  /** Rift features at divergent boundaries */
  riftFeatures: RiftFeature[];
  /** Plate assignment map (per-cell plate ID) */
  plateMap: Int32Array;
  /** Boundary tag map for material assignment */
  boundaryTags: Int32Array;
  /** Total simulated time in Myr */
  simulatedTime: number;
}

// ============================================================================
// Mantle Convection Cell
// ============================================================================

/** Simplified mantle convection cell that drives plate motion. */
interface ConvectionCell {
  /** Center of the upwelling */
  center: THREE.Vector3;
  /** Flow direction at the surface */
  flowDirection: THREE.Vector3;
  /** Strength of the convection cell */
  strength: number;
  /** Radius of influence */
  radius: number;
}

// ============================================================================
// TectonicPlateSimulator
// ============================================================================

/**
 * Full dynamic tectonic plate simulation.
 *
 * Simulates plate tectonics from initial plate generation through
 * time-stepped motion, boundary detection, classification, and
 * terrain modification. Each step applies geophysical force models
 * including mantle convection drag, ridge push, slab pull, and
 * viscous resistance.
 *
 * Usage:
 * ```typescript
 * const sim = new TectonicPlateSimulator({ seed: 42, numPlates: 12 });
 * const result = sim.simulate(heightmap, 512, 1000);
 * ```
 */
export class TectonicPlateSimulator {
  private config: PlateConfig;
  private noise: NoiseUtils;
  private rng: SeededRandom;
  private plates: TectonicPlate[] = [];
  private boundaries: PlateBoundary[] = [];
  private plateMap: Int32Array | null = null;
  private boundaryTags: Int32Array | null = null;
  private convectionCells: ConvectionCell[] = [];
  private volcanicFeatures: VolcanicFeature[] = [];
  private riftFeatures: RiftFeature[] = [];
  private simulatedTime: number = 0;

  constructor(config?: Partial<PlateConfig>) {
    this.config = {
      seed: 42,
      numPlates: 8,
      plateVelocity: 0.5,
      convergenceUpliftRate: 0.1,
      divergenceSubsidenceRate: 0.05,
      mountainBuildingIntensity: 2.0,
      riftDepth: 50.0,
      volcanicActivity: 0.7,
      simulationSteps: 100,
      timeStepDuration: 1.0,
      mantleConvectionStrength: 0.3,
      mantleViscosity: 0.85,
      ridgePushCoefficient: 0.4,
      slabPullCoefficient: 0.6,
      boundaryAngleThreshold: 0.3,
      volcanicArcOffset: 150,
      volcanicConeHeight: 3000,
      ...config,
    };

    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
  }

  // ========================================================================
  // Plate Generation — Voronoi Tessellation
  // ========================================================================

  /**
   * Generate tectonic plates using Voronoi tessellation from random seed points.
   *
   * Each plate is assigned a type (continental/oceanic), thickness, density,
   * velocity, Euler pole, and other geophysical properties based on the
   * random seed for reproducibility.
   *
   * @param resolution - Grid resolution (width = height)
   * @param worldSize - World-space size of the terrain
   * @returns Int32Array mapping each cell to its plate ID
   */
  initializePlates(resolution: number, worldSize: number): Int32Array {
    const plateMap = new Int32Array(resolution * resolution);
    const cellSize = worldSize / resolution;

    // Reset state
    this.plates = [];
    this.boundaries = [];
    this.volcanicFeatures = [];
    this.riftFeatures = [];
    this.simulatedTime = 0;
    this.rng = new SeededRandom(this.config.seed);

    // Generate plate seed points with Voronoi distribution
    // Use a mix of structured and random placement for natural-looking plates
    const seedPoints = this.generateVoronoiSeedPoints(worldSize);

    // Create plate objects with full geophysical properties
    for (let i = 0; i < seedPoints.length; i++) {
      const centroid = seedPoints[i];
      const isContinental = this.rng.next() > 0.45; // ~55% continental
      const thickness = isContinental
        ? this.rng.nextFloat(30, 50)   // Continental: 30-50 km
        : this.rng.nextFloat(5, 10);    // Oceanic: 5-10 km
      const density = isContinental
        ? this.rng.nextFloat(2.65, 2.8) // Continental: ~2.7 g/cm³
        : this.rng.nextFloat(2.9, 3.1);  // Oceanic: ~3.0 g/cm³

      // Initial velocity from random direction + mantle convection influence
      const velocityAngle = this.rng.next() * Math.PI * 2;
      const speed = this.config.plateVelocity * (0.3 + this.rng.next() * 0.7);
      const velocity = new THREE.Vector3(
        Math.cos(velocityAngle) * speed,
        0,
        Math.sin(velocityAngle) * speed
      );

      // Euler pole: axis of rotation for the plate
      // Random point on the world plane that serves as the rotation center
      const eulerAngle = this.rng.next() * Math.PI * 2;
      const eulerDist = this.rng.nextFloat(0.3, 0.8) * worldSize / 2;
      const eulerPole = new THREE.Vector3(
        Math.cos(eulerAngle) * eulerDist,
        0,
        Math.sin(eulerAngle) * eulerDist
      );

      this.plates.push({
        id: i,
        centroid: centroid.clone(),
        velocity,
        rotation: 0,
        angularVelocity: (this.rng.next() - 0.5) * 0.005,
        eulerPole,
        type: isContinental ? 'continental' : 'oceanic',
        thickness,
        density,
        age: this.rng.nextFloat(0, 200), // Myr
        area: 0,
        cells: [],
        boundaryCells: [],
        stress: 0,
        netForce: new THREE.Vector3(),
      });
    }

    // Generate mantle convection cells
    this.generateConvectionCells(worldSize);

    // Assign each cell to nearest plate centroid (Voronoi tessellation)
    this.assignCellsToPlates(plateMap, resolution, worldSize, cellSize);

    this.plateMap = plateMap;
    return plateMap;
  }

  /**
   * Generate Voronoi seed points for plate centroids.
   *
   * Uses a combination of random placement and Poisson-disk-like
   * spacing to avoid plates that are too close together.
   */
  private generateVoronoiSeedPoints(worldSize: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const halfWorld = worldSize / 2;
    const minDist = worldSize / (this.config.numPlates * 0.8);
    let attempts = 0;
    const maxAttempts = this.config.numPlates * 50;

    while (points.length < this.config.numPlates && attempts < maxAttempts) {
      const x = this.rng.nextFloat(-halfWorld * 0.85, halfWorld * 0.85);
      const z = this.rng.nextFloat(-halfWorld * 0.85, halfWorld * 0.85);
      const candidate = new THREE.Vector3(x, 0, z);

      // Check minimum distance from existing points
      let tooClose = false;
      for (const p of points) {
        if (candidate.distanceTo(p) < minDist) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        points.push(candidate);
      }
      attempts++;
    }

    // Fill remaining with purely random points if Poisson-like didn't fill all
    while (points.length < this.config.numPlates) {
      const x = this.rng.nextFloat(-halfWorld * 0.9, halfWorld * 0.9);
      const z = this.rng.nextFloat(-halfWorld * 0.9, halfWorld * 0.9);
      points.push(new THREE.Vector3(x, 0, z));
    }

    return points;
  }

  /**
   * Generate simplified mantle convection cells.
   *
   * These cells represent the large-scale convective flow in the
   * mantle that drives plate motion. Each cell has an upwelling center
   * and a surface flow direction.
   */
  private generateConvectionCells(worldSize: number): ConvectionCell[] {
    this.convectionCells = [];
    const numCells = Math.max(3, Math.floor(this.config.numPlates / 2));
    const halfWorld = worldSize / 2;

    for (let i = 0; i < numCells; i++) {
      const angle = (i / numCells) * Math.PI * 2 + this.rng.nextFloat(-0.3, 0.3);
      const radius = this.rng.nextFloat(0.2, 0.6) * halfWorld;
      const center = new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );

      // Flow direction: tangential with some radial component
      const flowAngle = angle + Math.PI / 2 + this.rng.nextFloat(-0.5, 0.5);
      const flowDirection = new THREE.Vector3(
        Math.cos(flowAngle),
        0,
        Math.sin(flowAngle)
      ).normalize();

      this.convectionCells.push({
        center,
        flowDirection,
        strength: this.config.mantleConvectionStrength * (0.5 + this.rng.next() * 0.5),
        radius: this.rng.nextFloat(0.15, 0.35) * worldSize,
      });
    }

    return this.convectionCells;
  }

  /**
   * Assign each grid cell to the nearest plate centroid (Voronoi tessellation).
   *
   * Also computes the plate area and stores cell membership.
   */
  private assignCellsToPlates(
    plateMap: Int32Array,
    resolution: number,
    worldSize: number,
    cellSize: number
  ): void {
    const halfWorld = worldSize / 2;

    // Clear existing cell assignments
    for (const plate of this.plates) {
      plate.cells = [];
      plate.area = 0;
    }

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        const x = col * cellSize - halfWorld + cellSize / 2;
        const z = row * cellSize - halfWorld + cellSize / 2;
        const pos = new THREE.Vector3(x, 0, z);

        let minDist = Infinity;
        let nearestPlate = 0;

        for (let p = 0; p < this.plates.length; p++) {
          const dist = pos.distanceTo(this.plates[p].centroid);
          if (dist < minDist) {
            minDist = dist;
            nearestPlate = p;
          }
        }

        plateMap[idx] = nearestPlate;
        this.plates[nearestPlate].cells.push(idx);
        this.plates[nearestPlate].area += cellSize * cellSize;
      }
    }
  }

  // ========================================================================
  // Boundary Detection and Classification
  // ========================================================================

  /**
   * Detect and classify plate boundaries.
   *
   * For each pair of adjacent cells belonging to different plates,
   * we classify the boundary as convergent, divergent, or transform
   * based on the relative velocity of the two plates. The sub-type
   * is determined by the plate types (continental/oceanic).
   *
   * @param plateMap - Grid cell to plate ID mapping
   * @param resolution - Grid resolution
   * @returns Array of classified plate boundaries
   */
  detectBoundaries(plateMap: Int32Array, resolution: number): PlateBoundary[] {
    const boundaryMap = new Map<string, PlateBoundary>();

    // Clear boundary cells
    for (const plate of this.plates) {
      plate.boundaryCells = [];
    }

    // 4-connected neighborhood for thorough boundary detection
    const neighbors = [
      [1, 0],   // right
      [0, 1],   // down
      [-1, 0],  // left
      [0, -1],  // up
    ];

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const idx = row * resolution + col;
        const plate1 = plateMap[idx];

        for (const [dc, dr] of neighbors) {
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nc >= resolution || nr < 0 || nr >= resolution) continue;

          const nIdx = nr * resolution + nc;
          const plate2 = plateMap[nIdx];

          if (plate1 !== plate2) {
            // Create sorted boundary key
            const key = [Math.min(plate1, plate2), Math.max(plate1, plate2)].join('-');

            if (!boundaryMap.has(key)) {
              const p1 = this.plates[plate1];
              const p2 = this.plates[plate2];
              const classification = this.classifyBoundary(p1, p2);

              boundaryMap.set(key, {
                plate1: Math.min(plate1, plate2),
                plate2: Math.max(plate1, plate2),
                type: classification.type,
                subType: classification.subType,
                cells: [],
                uplift: new Float32Array(resolution * resolution),
                convergenceRate: classification.convergenceRate,
                relativeVelocity: classification.relativeVelocity,
                normal: classification.normal,
                stress: 0,
              });
            }

            const boundary = boundaryMap.get(key)!;
            if (!boundary.cells.includes(idx)) {
              boundary.cells.push(idx);
            }

            // Mark these cells as boundary cells for their plates
            if (!this.plates[plate1].boundaryCells.includes(idx)) {
              this.plates[plate1].boundaryCells.push(idx);
            }
            if (!this.plates[plate2].boundaryCells.includes(nIdx)) {
              this.plates[plate2].boundaryCells.push(nIdx);
            }
          }
        }
      }
    }

    // Calculate boundary stress from convergence rates and plate forces
    for (const boundary of boundaryMap.values()) {
      const p1 = this.plates[boundary.plate1];
      const p2 = this.plates[boundary.plate2];
      boundary.stress = Math.abs(boundary.convergenceRate) *
        (p1.density + p2.density) * 0.5;
      p1.stress += boundary.stress * 0.5;
      p2.stress += boundary.stress * 0.5;
    }

    this.boundaries = Array.from(boundaryMap.values());
    return this.boundaries;
  }

  /**
   * Classify the boundary between two plates based on relative motion.
   *
   * The classification uses the dot product of the relative velocity
   * with the plate-to-plate normal direction:
   * - Negative dot → convergent (plates moving toward each other)
   * - Positive dot → divergent (plates moving apart)
   * - Near zero → transform (plates sliding past each other)
   *
   * Sub-types are determined by the combination of plate types.
   */
  private classifyBoundary(
    p1: TectonicPlate,
    p2: TectonicPlate
  ): {
    type: BoundaryType;
    subType: ConvergentSubType | DivergentSubType | null;
    convergenceRate: number;
    relativeVelocity: THREE.Vector3;
    normal: THREE.Vector3;
  } {
    // Compute relative velocity of plate1 with respect to plate2
    const relativeVelocity = p1.velocity.clone().sub(p2.velocity);

    // Normal direction from plate1 centroid to plate2 centroid
    const normal = p2.centroid.clone().sub(p1.centroid).normalize();

    // Dot product: positive = divergent, negative = convergent
    const dotProduct = relativeVelocity.dot(normal);
    const convergenceRate = -dotProduct; // Positive = converging

    let type: BoundaryType;
    let subType: ConvergentSubType | DivergentSubType | null = null;

    const threshold = this.config.boundaryAngleThreshold;

    if (dotProduct < -threshold) {
      type = 'convergent';
      // Classify sub-type based on plate types
      if (p1.type === 'continental' && p2.type === 'continental') {
        subType = 'continental_continental';
      } else if (
        (p1.type === 'oceanic' && p2.type === 'continental') ||
        (p1.type === 'continental' && p2.type === 'oceanic')
      ) {
        subType = 'oceanic_continental';
      } else {
        subType = 'oceanic_oceanic';
      }
    } else if (dotProduct > threshold) {
      type = 'divergent';
      if (p1.type === 'continental' && p2.type === 'continental') {
        subType = 'continental_rift';
      } else {
        subType = 'oceanic_ridge';
      }
    } else {
      type = 'transform';
    }

    return { type, subType, convergenceRate, relativeVelocity, normal };
  }

  // ========================================================================
  // Plate Motion Simulation
  // ========================================================================

  /**
   * Compute forces on each plate from all geophysical sources.
   *
   * Forces include:
   * 1. Mantle convection drag — basal drag from convective flow
   * 2. Ridge push — gravitational push from elevated mid-ocean ridges
   * 3. Slab pull — gravitational pull of subducting oceanic lithosphere
   * 4. Viscous resistance — damping from mantle viscosity
   * 5. Boundary resistance — friction at plate boundaries
   */
  private computePlateForces(): void {
    for (const plate of this.plates) {
      // Reset net force
      plate.netForce.set(0, 0, 0);

      // 1. Mantle convection drag force
      // The mantle flow exerts a basal drag on the plate in the flow direction
      for (const cell of this.convectionCells) {
        const distToCell = plate.centroid.distanceTo(cell.center);
        if (distToCell < cell.radius) {
          // Influence decreases with distance from convection cell center
          const influence = Math.exp(-distToCell / (cell.radius * 0.5));
          const dragForce = cell.flowDirection.clone()
            .multiplyScalar(cell.strength * influence * plate.area * 0.0001);
          plate.netForce.add(dragForce);
        }
      }

      // 2. Ridge push force — at divergent boundaries
      // Hot, elevated ridge material pushes plates apart
      for (const boundary of this.boundaries) {
        if (boundary.type !== 'divergent') continue;
        if (boundary.plate1 !== plate.id && boundary.plate2 !== plate.id) continue;

        const pushDirection = boundary.type === 'divergent'
          ? boundary.normal.clone().multiplyScalar(
              boundary.plate1 === plate.id ? -1 : 1
            )
          : new THREE.Vector3();

        const pushMagnitude = this.config.ridgePushCoefficient *
          Math.abs(boundary.convergenceRate) *
          (1 + Math.abs(boundary.convergenceRate));

        plate.netForce.add(pushDirection.multiplyScalar(pushMagnitude));
      }

      // 3. Slab pull force — at convergent boundaries with oceanic subduction
      // Dense, cold subducting slab pulls the plate toward the trench
      for (const boundary of this.boundaries) {
        if (boundary.type !== 'convergent') continue;
        if (boundary.plate1 !== plate.id && boundary.plate2 !== plate.id) continue;

        // Only the oceanic plate gets pulled (denser plate subducts)
        const otherPlateId = boundary.plate1 === plate.id
          ? boundary.plate2 : boundary.plate1;
        const otherPlate = this.plates[otherPlateId];

        let pullMagnitude = 0;
        if (plate.type === 'oceanic' && otherPlate.type === 'continental') {
          // Oceanic plate subducting under continental — strong slab pull
          pullMagnitude = this.config.slabPullCoefficient *
            plate.density * Math.abs(boundary.convergenceRate) * 0.5;
        } else if (plate.type === 'oceanic' && otherPlate.type === 'oceanic') {
          // Older, denser oceanic plate subducts
          if (plate.age > otherPlate.age) {
            pullMagnitude = this.config.slabPullCoefficient *
              plate.density * Math.abs(boundary.convergenceRate) * 0.3;
          }
        }

        if (pullMagnitude > 0) {
          // Pull toward the subduction zone
          const pullDirection = boundary.normal.clone().multiplyScalar(
            boundary.plate1 === plate.id ? 1 : -1
          );
          plate.netForce.add(pullDirection.multiplyScalar(pullMagnitude));
        }
      }

      // 4. Viscous resistance from mantle — damps plate motion
      const viscousDrag = plate.velocity.clone()
        .multiplyScalar(-this.config.mantleViscosity);
      plate.netForce.add(viscousDrag);

      // 5. Boundary resistance — friction at convergent boundaries
      for (const boundary of this.boundaries) {
        if (boundary.plate1 !== plate.id && boundary.plate2 !== plate.id) continue;
        if (boundary.type === 'convergent') {
          const resistForce = plate.velocity.clone()
            .multiplyScalar(-0.1 * boundary.stress);
          plate.netForce.add(resistForce);
        }
      }
    }
  }

  /**
   * Apply Euler pole rotation to plate velocity.
   *
   * Real plates rotate around an Euler pole. The velocity at any
   * point on the plate is: v = ω × r, where ω is the angular
   * velocity vector and r is the position vector from the Euler pole.
   */
  private applyEulerPoleRotation(deltaTime: number): void {
    for (const plate of this.plates) {
      // Current position relative to Euler pole
      const r = plate.centroid.clone().sub(plate.eulerPole);

      // Angular velocity vector (pointing up for 2D simulation)
      const omega = new THREE.Vector3(0, plate.angularVelocity, 0);

      // Velocity from rotation: v = ω × r
      const rotVelocity = new THREE.Vector3().crossVectors(omega, r);

      // Blend rotational velocity with translational velocity
      // (real plates have both components)
      const blendFactor = 0.3; // 30% from rotation, 70% from translation
      plate.velocity.lerp(
        plate.velocity.clone().multiplyScalar(1 - blendFactor).add(
          rotVelocity.multiplyScalar(blendFactor)
        ),
        1.0
      );
    }
  }

  /**
   * Advance the simulation by one time step.
   *
   * Each step:
   * 1. Computes forces on each plate
   * 2. Applies Euler pole rotation
   * 3. Updates plate velocities from forces
   * 4. Moves plate centroids
   * 5. Reassigns cells to plates (Voronoi re-tessellation)
   * 6. Redetects boundaries
   * 7. Handles plate boundary interactions
   *
   * @param resolution - Grid resolution
   * @param worldSize - World-space terrain size
   * @param deltaTime - Time step duration in Myr
   */
  simulateStep(
    resolution: number,
    worldSize: number,
    deltaTime: number
  ): void {
    const cellSize = worldSize / resolution;

    // Step 1: Compute forces
    this.computePlateForces();

    // Step 2: Apply Euler pole rotation
    this.applyEulerPoleRotation(deltaTime);

    // Step 3: Update velocities from forces (F = ma, simplified)
    for (const plate of this.plates) {
      // Mass proportional to area × thickness × density
      const mass = plate.area * plate.thickness * plate.density * 0.0001;
      const acceleration = plate.netForce.clone().divideScalar(Math.max(mass, 0.001));

      // Clamp acceleration to prevent instability
      const maxAccel = 0.05;
      if (acceleration.length() > maxAccel) {
        acceleration.normalize().multiplyScalar(maxAccel);
      }

      plate.velocity.add(acceleration.multiplyScalar(deltaTime));

      // Clamp velocity to reasonable range
      const maxVelocity = this.config.plateVelocity * 3;
      if (plate.velocity.length() > maxVelocity) {
        plate.velocity.normalize().multiplyScalar(maxVelocity);
      }

      // Update angular velocity from torque (simplified)
      plate.angularVelocity += (this.rng.next() - 0.5) * 0.0001 * deltaTime;
      plate.angularVelocity = Math.max(-0.01, Math.min(0.01, plate.angularVelocity));
    }

    // Step 4: Move plate centroids
    const halfWorld = worldSize / 2;
    for (const plate of this.plates) {
      plate.centroid.add(plate.velocity.clone().multiplyScalar(deltaTime));
      plate.rotation += plate.angularVelocity * deltaTime;
      plate.age += deltaTime;

      // Wrap around world bounds (toroidal topology)
      if (plate.centroid.x > halfWorld) plate.centroid.x -= worldSize;
      if (plate.centroid.x < -halfWorld) plate.centroid.x += worldSize;
      if (plate.centroid.z > halfWorld) plate.centroid.z -= worldSize;
      if (plate.centroid.z < -halfWorld) plate.centroid.z += worldSize;
    }

    // Step 5: Reassign cells to plates
    if (this.plateMap) {
      this.assignCellsToPlates(this.plateMap, resolution, worldSize, cellSize);
    }

    // Step 6: Redetect boundaries
    if (this.plateMap) {
      this.detectBoundaries(this.plateMap, resolution);
    }

    // Track simulated time
    this.simulatedTime += deltaTime;
  }

  // ========================================================================
  // Boundary Interaction Effects
  // ========================================================================

  /**
   * Apply tectonic forces to the heightmap based on boundary interactions.
   *
   * Each boundary type produces distinct terrain modifications:
   * - Convergent: uplift (mountains), subduction trenches
   * - Divergent: rift valleys, mid-ocean ridges
   * - Transform: lateral displacement features
   *
   * @param heightmap - Input heightmap (not modified)
   * @param resolution - Grid resolution
   * @param worldSize - World-space terrain size
   * @returns Modified heightmap with tectonic effects
   */
  applyTectonicForces(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): Float32Array {
    const result = new Float32Array(heightmap);
    const cellSize = worldSize / resolution;
    const halfWorld = worldSize / 2;

    // Initialize boundary tag map
    this.boundaryTags = new Int32Array(resolution * resolution).fill(-1);

    for (const boundary of this.boundaries) {
      const p1 = this.plates[boundary.plate1];
      const p2 = this.plates[boundary.plate2];
      const convergenceMag = Math.abs(boundary.convergenceRate);

      // Compute boundary influence parameters
      const influenceWidth = this.computeInfluenceWidth(boundary, worldSize);
      const boundaryCenter = p1.centroid.clone()
        .add(p2.centroid).multiplyScalar(0.5);

      for (const idx of boundary.cells) {
        const row = Math.floor(idx / resolution);
        const col = idx % resolution;
        const x = col * cellSize - halfWorld + cellSize / 2;
        const z = row * cellSize - halfWorld + cellSize / 2;
        const pos = new THREE.Vector3(x, 0, z);

        // Distance to boundary center line
        const distToP1 = pos.distanceTo(p1.centroid);
        const distToP2 = pos.distanceTo(p2.centroid);
        const boundaryDist = Math.min(distToP1, distToP2);

        // Influence falls off with distance from boundary
        const influence = Math.max(0, 1 - boundaryDist / influenceWidth);

        // Tag this cell for material assignment
        this.boundaryTags[idx] = this.encodeBoundaryTag(boundary);

        // Apply effects based on boundary type
        switch (boundary.type) {
          case 'convergent':
            this.applyConvergentEffects(
              result, idx, influence, boundary, p1, p2,
              convergenceMag, pos, cellSize, resolution, worldSize
            );
            break;

          case 'divergent':
            this.applyDivergentEffects(
              result, idx, influence, boundary, p1, p2,
              pos, cellSize, resolution, worldSize
            );
            break;

          case 'transform':
            this.applyTransformEffects(
              result, idx, influence, boundary, pos,
              cellSize, resolution, worldSize
            );
            break;
        }
      }

      // Apply extended influence beyond immediate boundary cells
      this.applyExtendedInfluence(
        result, boundary, p1, p2, influenceWidth,
        cellSize, resolution, worldSize
      );
    }

    return result;
  }

  /**
   * Compute the influence width for a boundary based on its type and properties.
   */
  private computeInfluenceWidth(boundary: PlateBoundary, worldSize: number): number {
    const baseWidth = worldSize * 0.15;
    switch (boundary.type) {
      case 'convergent':
        return baseWidth * (1 + Math.abs(boundary.convergenceRate) * 2) *
          this.config.mountainBuildingIntensity;
      case 'divergent':
        return baseWidth * 0.7;
      case 'transform':
        return baseWidth * 0.4;
      default:
        return baseWidth;
    }
  }

  /**
   * Apply terrain effects for convergent boundaries.
   */
  private applyConvergentEffects(
    heightmap: Float32Array,
    idx: number,
    influence: number,
    boundary: PlateBoundary,
    p1: TectonicPlate,
    p2: TectonicPlate,
    convergenceMag: number,
    pos: THREE.Vector3,
    cellSize: number,
    resolution: number,
    worldSize: number
  ): void {
    if (boundary.subType === 'continental_continental') {
      // Orogenic belt: both plates are continental → massive uplift
      // Himalayas-like: broad, high mountain range
      const upliftRate = this.config.convergenceUpliftRate *
        this.config.mountainBuildingIntensity * influence *
        (1 + convergenceMag * 3);

      // Add ridge noise for realistic mountain range shape
      const ridgeNoise = this.noise.fbm(
        pos.x * 0.005 + this.config.seed * 0.1,
        0,
        pos.z * 0.005 + this.config.seed * 0.1,
        5
      );
      const ridgeProfile = Math.pow(Math.abs(ridgeNoise), 0.6) *
        Math.sign(ridgeNoise);

      // Cross-boundary profile: highest at center, slopes on both sides
      const crossProfile = Math.pow(influence, 0.8);

      heightmap[idx] += upliftRate * (1 + ridgeProfile * 0.5) * crossProfile;

    } else if (boundary.subType === 'oceanic_continental') {
      // Subduction zone: trench on oceanic side, volcanic arc on continental side
      const overridingPlate = p1.type === 'continental' ? p1 : p2;
      const subductingPlate = p1.type === 'oceanic' ? p1 : p2;

      // Determine which side of the boundary we're on
      const toOverriding = pos.clone().sub(overridingPlate.centroid).length();
      const toSubducting = pos.clone().sub(subductingPlate.centroid).length();
      const isOnOverridingSide = toOverriding < toSubducting;

      if (isOnOverridingSide) {
        // Volcanic arc: elevated region on overriding plate
        const arcUplift = this.config.convergenceUpliftRate *
          this.config.mountainBuildingIntensity * 0.7 * influence *
          (1 + convergenceMag * 2);

        const arcNoise = this.noise.fbm(
          pos.x * 0.008,
          0,
          pos.z * 0.008,
          4
        );
        heightmap[idx] += arcUplift * (1 + arcNoise * 0.4);
      } else {
        // Trench: deep depression on subducting plate side
        const trenchDepth = -this.config.riftDepth * 0.8 * influence *
          (1 + convergenceMag);
        heightmap[idx] += trenchDepth;
      }

    } else if (boundary.subType === 'oceanic_oceanic') {
      // Island arc: moderate uplift on overriding side, trench on subducting side
      const olderPlate = p1.age > p2.age ? p1 : p2;
      const youngerPlate = p1.age > p2.age ? p2 : p1;

      const toOlder = pos.clone().sub(olderPlate.centroid).length();
      const toYounger = pos.clone().sub(youngerPlate.centroid).length();
      const isOnYoungerSide = toYounger < toOlder;

      if (isOnYoungerSide) {
        // Island arc on younger (overriding) plate
        const islandUplift = this.config.convergenceUpliftRate *
          this.config.mountainBuildingIntensity * 0.5 * influence;
        heightmap[idx] += islandUplift;
      } else {
        // Trench on older (subducting) plate
        const trenchDepth = -this.config.riftDepth * 0.6 * influence;
        heightmap[idx] += trenchDepth;
      }
    }
  }

  /**
   * Apply terrain effects for divergent boundaries.
   */
  private applyDivergentEffects(
    heightmap: Float32Array,
    idx: number,
    influence: number,
    boundary: PlateBoundary,
    p1: TectonicPlate,
    p2: TectonicPlate,
    pos: THREE.Vector3,
    cellSize: number,
    resolution: number,
    worldSize: number
  ): void {
    if (boundary.subType === 'continental_rift') {
      // Rift valley: central depression with raised shoulders
      // Classic rift profile: V-shaped valley with escarpments
      const shoulderWidth = 0.3; // Fraction of influence zone that is shoulder
      const normalizedDist = 1 - influence; // 0 at boundary, 1 at edge

      if (normalizedDist < shoulderWidth) {
        // Rift floor — deep depression
        const riftFloorDepth = -this.config.riftDepth * influence *
          (1 + Math.abs(boundary.convergenceRate) * 0.5);
        heightmap[idx] += riftFloorDepth;

        // Add noise for rough rift floor
        const riftNoise = this.noise.fbm(
          pos.x * 0.02,
          0,
          pos.z * 0.02,
          3
        );
        heightmap[idx] += riftNoise * 2 * influence;
      } else {
        // Rift shoulders — slight uplift from isostatic rebound
        const shoulderUplift = this.config.convergenceUpliftRate * 0.2 *
          influence * (1 - normalizedDist);
        heightmap[idx] += shoulderUplift;
      }

    } else if (boundary.subType === 'oceanic_ridge') {
      // Mid-ocean ridge: elevated ridge with axial valley
      const ridgeProfile = Math.pow(influence, 0.5); // Broader than rift

      // Ridge uplift
      const ridgeUplift = this.config.convergenceUpliftRate * 0.5 * ridgeProfile;

      // Small axial valley at the very center
      const axialValley = influence > 0.9
        ? -this.config.riftDepth * 0.1 * (influence - 0.9) * 10
        : 0;

      heightmap[idx] += ridgeUplift + axialValley;

      // Add ridge segmentation noise
      const segNoise = this.noise.perlin2D(
        pos.x * 0.003 + this.config.seed,
        pos.z * 0.003
      );
      heightmap[idx] += segNoise * influence * 0.5;
    }
  }

  /**
   * Apply terrain effects for transform boundaries.
   */
  private applyTransformEffects(
    heightmap: Float32Array,
    idx: number,
    influence: number,
    boundary: PlateBoundary,
    pos: THREE.Vector3,
    cellSize: number,
    resolution: number,
    worldSize: number
  ): void {
    // Transform faults create linear features: ridges, valleys, offset streams
    const shearEffect = this.noise.fbm(
      pos.x * 0.015 + this.config.seed * 0.3,
      0,
      pos.z * 0.015,
      3
    );

    // Alternating ridges and valleys along the fault trace
    const linearFeature = Math.sin(
      pos.x * 0.01 * Math.cos(boundary.normal.x) +
      pos.z * 0.01 * Math.sin(boundary.normal.z)
    ) * influence * 0.5;

    heightmap[idx] += (shearEffect * 0.3 + linearFeature) * influence;
  }

  /**
   * Apply extended influence beyond immediate boundary cells.
   *
   * Tectonic effects (especially mountain building) affect a wide area
   * around the boundary, not just the cells that touch it.
   */
  private applyExtendedInfluence(
    heightmap: Float32Array,
    boundary: PlateBoundary,
    p1: TectonicPlate,
    p2: TectonicPlate,
    influenceWidth: number,
    cellSize: number,
    resolution: number,
    worldSize: number
  ): void {
    // Only apply extended influence for convergent boundaries
    // (mountains have the widest footprint)
    if (boundary.type !== 'convergent') return;

    const halfWorld = worldSize / 2;
    const extendedRadius = influenceWidth * 1.5;
    const boundaryCenter = p1.centroid.clone()
      .add(p2.centroid).multiplyScalar(0.5);

    // Determine bounding box of influence
    const minCol = Math.max(0, Math.floor(
      ((boundaryCenter.x - extendedRadius) + halfWorld) / cellSize
    ));
    const maxCol = Math.min(resolution - 1, Math.ceil(
      ((boundaryCenter.x + extendedRadius) + halfWorld) / cellSize
    ));
    const minRow = Math.max(0, Math.floor(
      ((boundaryCenter.z - extendedRadius) + halfWorld) / cellSize
    ));
    const maxRow = Math.min(resolution - 1, Math.ceil(
      ((boundaryCenter.z + extendedRadius) + halfWorld) / cellSize
    ));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const idx = row * resolution + col;
        const x = col * cellSize - halfWorld + cellSize / 2;
        const z = row * cellSize - halfWorld + cellSize / 2;
        const pos = new THREE.Vector3(x, 0, z);

        // Skip if already processed as boundary cell
        if (boundary.cells.includes(idx)) continue;

        // Check if this cell belongs to one of the boundary plates
        if (!this.plateMap || this.plateMap[idx] === undefined) continue;
        const plateId = this.plateMap[idx];
        if (plateId !== p1.id && plateId !== p2.id) continue;

        // Distance to nearest boundary cell
        let minDistToBoundary = Infinity;
        for (const bIdx of boundary.cells) {
          const bRow = Math.floor(bIdx / resolution);
          const bCol = bIdx % resolution;
          const bx = bCol * cellSize - halfWorld + cellSize / 2;
          const bz = bRow * cellSize - halfWorld + cellSize / 2;
          const dist = Math.sqrt((x - bx) ** 2 + (z - bz) ** 2);
          minDistToBoundary = Math.min(minDistToBoundary, dist);
          if (minDistToBoundary < cellSize) break; // Early exit
        }

        if (minDistToBoundary > extendedRadius) continue;

        const influence = Math.max(0, 1 - minDistToBoundary / extendedRadius);
        const decayedInfluence = Math.pow(influence, 2); // Quadratic falloff

        // Apply gentle foreland effects
        if (boundary.subType === 'continental_continental') {
          // Foreland basin: slight subsidence ahead of the mountain belt
          const forelandEffect = -this.config.convergenceUpliftRate * 0.05 *
            decayedInfluence;
          heightmap[idx] += forelandEffect;
        } else if (boundary.subType === 'oceanic_continental') {
          // Accretionary wedge: slight uplift on overriding side
          const wedgeUplift = this.config.convergenceUpliftRate * 0.15 *
            decayedInfluence;
          heightmap[idx] += wedgeUplift;
        }
      }
    }
  }

  // ========================================================================
  // Volcanic Feature Generation
  // ========================================================================

  /**
   * Generate volcanic features at subduction zones.
   *
   * Volcanoes form on the overriding plate at a characteristic distance
   * (the "volcanic arc offset") from the trench. The type and size
   * depend on the plate types and convergence rate.
   */
  generateVolcanicArcs(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): VolcanicFeature[] {
    this.volcanicFeatures = [];
    const cellSize = worldSize / resolution;
    const halfWorld = worldSize / 2;

    for (const boundary of this.boundaries) {
      if (boundary.type !== 'convergent') continue;
      if (boundary.subType === 'continental_continental') continue;

      const p1 = this.plates[boundary.plate1];
      const p2 = this.plates[boundary.plate2];

      // Determine overriding and subducting plates
      let overridingPlate: TectonicPlate;
      let subductingPlate: TectonicPlate;
      if (boundary.subType === 'oceanic_continental') {
        overridingPlate = p1.type === 'continental' ? p1 : p2;
        subductingPlate = p1.type === 'oceanic' ? p1 : p2;
      } else {
        // Oceanic-oceanic: younger plate overrides
        overridingPlate = p1.age < p2.age ? p1 : p2;
        subductingPlate = p1.age < p2.age ? p2 : p1;
      }

      // Direction from subducting toward overriding plate
      const arcDirection = overridingPlate.centroid.clone()
        .sub(subductingPlate.centroid).normalize();

      // Generate volcanic centers along the boundary
      const arcOffset = this.config.volcanicArcOffset;
      const volcanoSpacing = 50 + this.rng.nextFloat(0, 100); // km

      for (const idx of boundary.cells) {
        // Stochastic volcano placement
        if (this.rng.next() > this.config.volcanicActivity) continue;

        const row = Math.floor(idx / resolution);
        const col = idx % resolution;
        const x = col * cellSize - halfWorld + cellSize / 2;
        const z = row * cellSize - halfWorld + cellSize / 2;

        // Offset toward overriding plate (volcanic arc offset)
        const volcanoPos = new THREE.Vector3(
          x + arcDirection.x * arcOffset,
          heightmap[idx],
          z + arcDirection.z * arcOffset
        );

        // Determine volcano type based on plate configuration
        const volcanoType: 'stratovolcano' | 'shield' =
          boundary.subType === 'oceanic_continental'
            ? 'stratovolcano'  // Andes-like stratovolcanoes
            : 'shield';        // Oceanic shield volcanoes

        // Size based on convergence rate
        const convergenceFactor = 1 + Math.abs(boundary.convergenceRate) * 2;
        const height = this.config.volcanicConeHeight *
          (0.3 + this.rng.next() * 0.7) * convergenceFactor *
          (volcanoType === 'stratovolcano' ? 1.0 : 0.6);
        const baseRadius = height * (volcanoType === 'stratovolcano' ? 1.5 : 3.0);

        this.volcanicFeatures.push({
          position: volcanoPos,
          height,
          radius: baseRadius,
          intensity: this.rng.nextFloat(0.4, 1.0),
          volcanoType,
          plateId: overridingPlate.id,
        });
      }
    }

    return this.volcanicFeatures;
  }

  /**
   * Apply volcanic cone profiles to the heightmap.
   *
   * Stratovolcanoes: steep, conical profiles
   * Shield volcanoes: broad, gentle slopes
   */
  applyVolcanicProfileToHeightmap(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): void {
    const cellSize = worldSize / resolution;
    const halfWorld = worldSize / 2;

    for (const volcano of this.volcanicFeatures) {
      // Determine bounding box of volcano influence
      const maxRadius = volcano.radius * 2;
      const minCol = Math.max(0, Math.floor(
        ((volcano.position.x - maxRadius) + halfWorld) / cellSize
      ));
      const maxCol = Math.min(resolution - 1, Math.ceil(
        ((volcano.position.x + maxRadius) + halfWorld) / cellSize
      ));
      const minRow = Math.max(0, Math.floor(
        ((volcano.position.z - maxRadius) + halfWorld) / cellSize
      ));
      const maxRow = Math.min(resolution - 1, Math.ceil(
        ((volcano.position.z + maxRadius) + halfWorld) / cellSize
      ));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const idx = row * resolution + col;
          const x = col * cellSize - halfWorld + cellSize / 2;
          const z = row * cellSize - halfWorld + cellSize / 2;
          const dist = Math.sqrt(
            (x - volcano.position.x) ** 2 +
            (z - volcano.position.z) ** 2
          );

          if (dist > maxRadius) continue;

          const normalizedDist = dist / volcano.radius;

          // Cone profile
          let profile: number;
          if (volcano.volcanoType === 'stratovolcano') {
            // Steep conical profile with crater at top
            profile = normalizedDist < 0.9
              ? Math.pow(1 - normalizedDist, 1.5)
              : -Math.pow((normalizedDist - 0.9) / 0.1, 2) * 0.2; // Crater
          } else {
            // Shield volcano: broad, gentle profile
            profile = normalizedDist < 0.95
              ? Math.pow(1 - normalizedDist, 0.5) * 0.6
              : -0.05; // Very shallow crater
          }

          heightmap[idx] += volcano.height * profile * volcano.intensity;
        }
      }
    }
  }

  // ========================================================================
  // Rift Feature Generation
  // ========================================================================

  /**
   * Generate rift features at divergent boundaries.
   */
  generateRiftFeatures(
    resolution: number,
    worldSize: number
  ): RiftFeature[] {
    this.riftFeatures = [];
    const cellSize = worldSize / resolution;
    const halfWorld = worldSize / 2;

    for (const boundary of this.boundaries) {
      if (boundary.type !== 'divergent') continue;

      const p1 = this.plates[boundary.plate1];
      const p2 = this.plates[boundary.plate2];

      // Extract center line points from boundary cells
      const centerLine: THREE.Vector3[] = [];
      for (const idx of boundary.cells) {
        const row = Math.floor(idx / resolution);
        const col = idx % resolution;
        const x = col * cellSize - halfWorld + cellSize / 2;
        const z = row * cellSize - halfWorld + cellSize / 2;
        centerLine.push(new THREE.Vector3(x, 0, z));
      }

      // Sort center line points to form a continuous path
      this.sortCenterLinePoints(centerLine);

      const riftType: DivergentSubType =
        boundary.subType === 'continental_rift'
          ? 'continental_rift'
          : 'oceanic_ridge';

      this.riftFeatures.push({
        centerLine,
        width: riftType === 'continental_rift'
          ? 30 + Math.abs(boundary.convergenceRate) * 50
          : 15 + Math.abs(boundary.convergenceRate) * 30,
        depth: this.config.riftDepth * (1 + Math.abs(boundary.convergenceRate)),
        type: riftType,
        plate1Id: boundary.plate1,
        plate2Id: boundary.plate2,
      });
    }

    return this.riftFeatures;
  }

  /**
   * Sort center line points to form a continuous path.
   *
   * Uses nearest-neighbor chaining to order points along the boundary.
   */
  private sortCenterLinePoints(points: THREE.Vector3[]): void {
    if (points.length < 2) return;

    const sorted: THREE.Vector3[] = [points[0]];
    const remaining = points.slice(1);

    while (remaining.length > 0) {
      const last = sorted[sorted.length - 1];
      let minDist = Infinity;
      let minIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const dist = last.distanceTo(remaining[i]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }

      sorted.push(remaining[minIdx]);
      remaining.splice(minIdx, 1);
    }

    points.length = 0;
    points.push(...sorted);
  }

  // ========================================================================
  // Boundary Tag Encoding
  // ========================================================================

  /**
   * Encode boundary information into a tag for material assignment.
   *
   * Tags encode: boundary type + sub-type for downstream material systems.
   */
  private encodeBoundaryTag(boundary: PlateBoundary): number {
    const typeBase = boundary.type === 'convergent' ? 0 :
                     boundary.type === 'divergent' ? 100 : 200;

    let subOffset = 0;
    if (boundary.subType === 'continental_continental') subOffset = 1;
    else if (boundary.subType === 'oceanic_continental') subOffset = 2;
    else if (boundary.subType === 'oceanic_oceanic') subOffset = 3;
    else if (boundary.subType === 'continental_rift') subOffset = 1;
    else if (boundary.subType === 'oceanic_ridge') subOffset = 2;

    return typeBase + subOffset;
  }

  // ========================================================================
  // Full Simulation
  // ========================================================================

  /**
   * Run the complete tectonic simulation.
   *
   * This is the main entry point that orchestrates the full simulation:
   * 1. Initializes plates via Voronoi tessellation
   * 2. Detects initial boundaries
   * 3. Runs time-stepped simulation
   * 4. Applies tectonic forces to the heightmap
   * 5. Generates volcanic features
   * 6. Generates rift features
   * 7. Returns complete simulation results
   *
   * @param heightmap - Input heightmap
   * @param resolution - Grid resolution
   * @param worldSize - World-space terrain size
   * @returns Complete tectonic simulation result
   */
  simulate(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number
  ): TectonicSimulationResult {
    // Step 1: Initialize plates
    const plateMap = this.initializePlates(resolution, worldSize);

    // Step 2: Detect initial boundaries
    this.detectBoundaries(plateMap, resolution);

    // Step 3: Run time-stepped simulation
    const dt = this.config.timeStepDuration;
    for (let step = 0; step < this.config.simulationSteps; step++) {
      this.simulateStep(resolution, worldSize, dt);

      // Log progress periodically
      if (step % 25 === 0) {
        const maxVel = Math.max(...this.plates.map(p => p.velocity.length()));
        const maxStress = Math.max(...this.plates.map(p => p.stress));
        console.log(
          `[TectonicSim] Step ${step}/${this.config.simulationSteps}: ` +
          `maxVel=${maxVel.toFixed(4)}, maxStress=${maxStress.toFixed(4)}, ` +
          `boundaries=${this.boundaries.length}`
        );
      }
    }

    // Step 4: Apply tectonic forces to heightmap
    const modifiedHeightmap = this.applyTectonicForces(
      heightmap, resolution, worldSize
    );

    // Step 5: Generate volcanic features
    this.generateVolcanicArcs(modifiedHeightmap, resolution, worldSize);
    this.applyVolcanicProfileToHeightmap(modifiedHeightmap, resolution, worldSize);

    // Step 6: Generate rift features
    this.generateRiftFeatures(resolution, worldSize);

    return {
      finalHeightmap: modifiedHeightmap,
      plates: this.plates,
      boundaries: this.boundaries,
      volcanicFeatures: this.volcanicFeatures,
      riftFeatures: this.riftFeatures,
      plateMap,
      boundaryTags: this.boundaryTags ?? new Int32Array(0),
      simulatedTime: this.simulatedTime,
    };
  }

  // ========================================================================
  // Accessors
  // ========================================================================

  /** Get the current plate map. */
  getPlateMap(): Int32Array | null {
    return this.plateMap;
  }

  /** Get the current boundary tags map. */
  getBoundaryTags(): Int32Array | null {
    return this.boundaryTags;
  }

  /** Get the current plates. */
  getPlates(): TectonicPlate[] {
    return this.plates;
  }

  /** Get the current boundaries. */
  getBoundaries(): PlateBoundary[] {
    return this.boundaries;
  }

  /** Get the volcanic features. */
  getVolcanicFeatures(): VolcanicFeature[] {
    return this.volcanicFeatures;
  }

  /** Get the rift features. */
  getRiftFeatures(): RiftFeature[] {
    return this.riftFeatures;
  }

  /** Get the simulated time in Myr. */
  getSimulatedTime(): number {
    return this.simulatedTime;
  }

  /** Update the configuration. Resets all simulation state. */
  updateConfig(config: Partial<PlateConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
    this.plates = [];
    this.boundaries = [];
    this.plateMap = null;
    this.boundaryTags = null;
    this.convectionCells = [];
    this.volcanicFeatures = [];
    this.riftFeatures = [];
    this.simulatedTime = 0;
  }
}
