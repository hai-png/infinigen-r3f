/**
 * Fluid Scene Composition (P2-5)
 *
 * High-level scene composition functions that compose FLIP fluid bodies with
 * terrain, obstacles, and inflow/outflow conditions. Inspired by Infinigen's
 * make_river(), make_beach(), make_still_water() factory methods.
 *
 * Components:
 *   1. FluidSceneConfig   — describes a complete fluid simulation domain
 *   2. FluidBodyDescription — describes a single fluid body with boundaries
 *   3. FluidTerrainCouplingConfig — how fluid interacts with terrain
 *   4. FluidInflowConfig / FluidOutflowConfig — boundary conditions
 *   5. FluidObstacleConfig  — per-obstacle description for scene composition
 *   6. Parameter interfaces — StillWaterParams, RiverParams, BeachParams, TiltedRiverParams
 *   7. FluidSceneComposer   — main orchestrator class
 *
 * The FluidSceneComposer creates a FLIPFluidSolver, wires inflow/outflow sources,
 * carves the domain around terrain via SDF, builds Three.js scene geometry, and
 * provides per-frame simulation stepping with surface mesh + foam particle access.
 *
 * @module FluidSceneComposer
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { FLIPFluidSolver } from './FLIPFluidSolver';
import type { FLIPParticle, FLIPConfig } from './FLIPFluidSolver';
import {
  FluidObstacle,
  FluidInflowOutflow,
  WhitewaterSystem,
  FluidSurfaceExtractor,
} from './FLIPSurfaceExtractor';
import type {
  FluidParticle as SurfaceFluidParticle,
  SurfaceExtractionConfig,
  WhitewaterConfig,
  WhitewaterParticles,
} from './FLIPSurfaceExtractor';
import { FluidObstacleManager } from '../SimulationObstacleAndExport';
import type { FluidObstacleConfig as ObstacleManagerConfig } from '../SimulationObstacleAndExport';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FluidSceneConfig Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Describes a complete fluid simulation domain.
 * Contains all global parameters needed to initialize the FLIP solver
 * and define the physical extent of the simulation.
 */
export interface FluidSceneConfig {
  /** Fluid simulation domain bounds in world space */
  domainBounds: THREE.Box3;
  /** Grid resolution [nx, ny, nz] for the Eulerian grid */
  resolution: [number, number, number];
  /** Fluid density in kg/m³ (default 1000 for water) */
  fluidDensity: number;
  /** Gravity vector (default [0, -9.81, 0]) */
  gravity: THREE.Vector3;
  /** Simulation time step in seconds */
  timeStep: number;
  /** Number of sub-steps per frame for stability */
  subSteps: number;
  /** FLIP/PIC blend ratio (0 = pure PIC, 1 = pure FLIP) */
  flipRatio: number;
  /** Pressure solver iterations per sub-step */
  pressureIterations: number;
  /** Boundary condition type */
  boundaryType: 'noslip' | 'freeslip';
  /** Particle spacing for initialization */
  particleSpacing: number;
  /** Random seed for deterministic generation */
  seed: number;
}

/** Default fluid scene configuration */
export const DEFAULT_FLUID_SCENE_CONFIG: FluidSceneConfig = {
  domainBounds: new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(4, 2, 4),
  ),
  resolution: [32, 16, 32],
  fluidDensity: 1000,
  gravity: new THREE.Vector3(0, -9.81, 0),
  timeStep: 1 / 60,
  subSteps: 2,
  flipRatio: 0.95,
  pressureIterations: 40,
  boundaryType: 'noslip',
  particleSpacing: 0.08,
  seed: 42,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FluidInflowConfig / FluidOutflowConfig
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inflow boundary condition — generates new fluid particles at a position
 * with a given velocity and rate.
 */
export interface FluidInflowConfig {
  /** World-space position of the inflow source */
  position: THREE.Vector3;
  /** Initial velocity of generated particles */
  velocity: THREE.Vector3;
  /** Radius of the spherical inflow region */
  radius: number;
  /** Particle generation rate (particles per second) */
  rate: number;
}

/**
 * Outflow boundary condition — removes fluid particles within a region.
 */
export interface FluidOutflowConfig {
  /** World-space position of the outflow drain */
  position: THREE.Vector3;
  /** Velocity hint for outgoing fluid (used for visual effects) */
  velocity: THREE.Vector3;
  /** Radius of the spherical outflow region */
  radius: number;
  /** Maximum removal rate (particles per second, 0 = unlimited) */
  rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FluidObstacleConfig (for scene composition)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Describes an obstacle in the fluid scene.
 * Can be a mesh-based obstacle or an analytical primitive.
 */
export interface FluidObstacleSceneConfig {
  /** Obstacle type */
  type: 'box' | 'sphere' | 'cylinder' | 'mesh';
  /** Center position in world space */
  position: THREE.Vector3;
  /** Size parameters: box [sx, sy, sz], sphere [radius], cylinder [radius, height] */
  sizeParams: number[];
  /** Optional rotation as Euler angles */
  rotation?: THREE.Euler;
  /** Optional THREE.Mesh for mesh-type obstacles */
  mesh?: THREE.Mesh;
  /** Obstacle velocity (for moving obstacles) */
  velocity: THREE.Vector3;
  /** SDF voxelization resolution */
  sdfResolution: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FluidTerrainCouplingConfig
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for how fluid interacts with terrain.
 * Terrain is represented as a signed distance function (SDF) where
 * negative values indicate inside the terrain (solid) and positive
 * values indicate outside (fluid/air).
 */
export interface FluidTerrainCouplingConfig {
  /**
   * Terrain signed distance function.
   * Returns negative values inside terrain, positive outside.
   * Used to carve the fluid domain and deflect particles.
   */
  terrainSDF: (pos: THREE.Vector3) => number;
  /** Optional terrain mesh for collision (used if SDF is approximate) */
  terrainMesh?: THREE.Mesh;
  /** Width of the shoreline/foam zone in world units */
  shorelineWidth: number;
  /** Wave force strength at the shoreline (N/m²) */
  wavePusherStrength: number;
  /** Rate at which terrain absorbs fluid (0 = none, 1 = full absorption) */
  absorptionRate: number;
  /** Terrain friction coefficient (0 = frictionless, 1 = full friction) */
  friction: number;
}

/** Default terrain coupling configuration (no terrain interaction) */
export const DEFAULT_TERRAIN_COUPLING: FluidTerrainCouplingConfig = {
  terrainSDF: () => 1.0, // Everything is outside terrain
  shorelineWidth: 0.2,
  wavePusherStrength: 0.5,
  absorptionRate: 0.0,
  friction: 0.3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FluidBodyDescription Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Describes a single fluid body within a scene.
 * Contains all information needed to set up the initial particle distribution,
 * boundary conditions, and obstacles for one coherent body of water.
 */
export interface FluidBodyDescription {
  /** Type of fluid body */
  type: 'river' | 'lake' | 'ocean' | 'still_water' | 'waterfall';
  /** Bounding box of the fluid body in world space */
  bounds: THREE.Box3;
  /** Initial fluid fill height (Y coordinate of water surface) */
  initialFluidLevel: number;
  /** Inflow sources that continuously inject particles */
  inflows: FluidInflowConfig[];
  /** Outflow drains that continuously remove particles */
  outflows: FluidOutflowConfig[];
  /** Obstacles within the fluid domain */
  obstacles: FluidObstacleSceneConfig[];
  /** Terrain coupling (if the fluid interacts with terrain) */
  terrainCoupling?: FluidTerrainCouplingConfig;
  /** Initial velocity field for the fluid body */
  initialVelocity: THREE.Vector3;
  /** Optional name for identification */
  name?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Parameter Interfaces for Presets
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parameters for creating a still water body (calm lake, pool, basin).
 * Water fills a rectangular basin up to the specified water level.
 */
export interface StillWaterParams {
  /** Bounding box of the basin */
  basinBounds: THREE.Box3;
  /** Height of the water surface (Y coordinate) */
  waterLevel: number;
  /** Terrain coupling configuration (optional) */
  terrainCoupling?: FluidTerrainCouplingConfig;
  /** Optional small perturbation velocity for surface ripples */
  perturbationStrength: number;
}

/**
 * Parameters for creating a river body.
 * Water flows between two points with configurable width, depth, and flow speed.
 */
export interface RiverParams {
  /** Start point of the river (upstream) */
  startPoint: THREE.Vector3;
  /** End point of the river (downstream) */
  endPoint: THREE.Vector3;
  /** Width of the river channel */
  width: number;
  /** Depth of the river channel */
  depth: number;
  /** Flow speed in m/s */
  flowSpeed: number;
  /** Bank slope angle in radians (steepness of river banks) */
  bankSlope: number;
  /** Optional rapid sections: each entry is [z_start, z_end, speed_multiplier] */
  rapidSections: [number, number, number][];
  /** Terrain coupling (optional, for riverbed interaction) */
  terrainCoupling?: FluidTerrainCouplingConfig;
}

/**
 * Parameters for creating a beach scene.
 * Features a sloped shoreline with incoming waves and tidal variation.
 */
export interface BeachParams {
  /** Shoreline direction and position (X component = shore normal) */
  shoreLine: THREE.Vector3;
  /** Depth of the ocean portion */
  oceanDepth: number;
  /** Wave height amplitude */
  waveHeight: number;
  /** Tidal range (peak-to-peak variation in water level) */
  tidalRange: number;
  /** Beach sand slope angle in radians */
  sandSlope: number;
  /** Beach width (along shore) */
  beachWidth: number;
  /** Beach depth (perpendicular to shore, shore to deep water) */
  beachDepth: number;
  /** Terrain coupling for the sand/foam interaction */
  terrainCoupling?: FluidTerrainCouplingConfig;
}

/**
 * Parameters for creating a tilted/sloped river.
 * The entire river channel is inclined, causing gravity-driven flow.
 */
export interface TiltedRiverParams {
  /** Start point of the river (top of slope) */
  startPoint: THREE.Vector3;
  /** End point of the river (bottom of slope) */
  endPoint: THREE.Vector3;
  /** Width of the river channel */
  width: number;
  /** Depth of the river channel */
  depth: number;
  /** Slope angle in radians */
  slopeAngle: number;
  /** Flow speed in m/s (overrides gravity-computed speed if > 0) */
  flowSpeed: number;
  /** Terrain coupling (optional) */
  terrainCoupling?: FluidTerrainCouplingConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FluidSceneComposer Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main orchestrator for fluid scene composition.
 *
 * Provides high-level factory methods (makeStillWater, makeRiver, makeBeach,
 * makeTiltedRiver) that create FluidBodyDescription objects with correct
 * inflow/outflow boundary conditions, obstacles, and terrain coupling.
 *
 * The buildScene() method converts a FluidBodyDescription into a complete
 * Three.js scene group including:
 *   - Fluid surface mesh (updated each frame from solver particles)
 *   - Terrain/obstacle meshes
 *   - Whitewater particle system (foam, spray, bubbles)
 *   - Domain boundary visualization (optional)
 *
 * The simulateStep() method advances the FLIP solver and updates all
 * visual representations.
 *
 * @example
 * ```ts
 * const composer = new FluidSceneComposer({
 *   domainBounds: new THREE.Box3(new THREE.Vector3(0,0,0), new THREE.Vector3(4,2,4)),
 *   resolution: [32, 16, 32],
 *   fluidDensity: 1000,
 *   gravity: new THREE.Vector3(0, -9.81, 0),
 *   timeStep: 1/60,
 *   subSteps: 2,
 *   flipRatio: 0.95,
 *   pressureIterations: 40,
 *   boundaryType: 'noslip',
 *   particleSpacing: 0.08,
 *   seed: 42,
 * });
 *
 * const river = composer.makeRiver({
 *   startPoint: new THREE.Vector3(2, 1, 0),
 *   endPoint: new THREE.Vector3(2, 1, 8),
 *   width: 2,
 *   depth: 0.5,
 *   flowSpeed: 1.5,
 *   bankSlope: Math.PI / 6,
 *   rapidSections: [],
 * });
 *
 * const sceneGroup = composer.buildScene(river);
 * // In animation loop:
 * composer.simulateStep();
 * const fluidMesh = composer.getFluidMesh();
 * const foam = composer.getFoamParticles();
 * ```
 */
export class FluidSceneComposer {
  private config: FluidSceneConfig;
  private rng: SeededRandom;

  // Solver and managers
  private solver: FLIPFluidSolver | null = null;
  private obstacleManager: FluidObstacleManager;
  private whitewaterSystem: WhitewaterSystem;

  // Active inflow/outflow handlers
  private inflowHandlers: FluidInflowOutflow[] = [];
  private outflowHandlers: FluidInflowOutflow[] = [];

  // Scene objects
  private sceneGroup: THREE.Group | null = null;
  private fluidMesh: THREE.Mesh | null = null;
  private foamPoints: THREE.Points | null = null;
  private sprayPoints: THREE.Points | null = null;
  private bubblePoints: THREE.Points | null = null;
  private obstacleMeshes: THREE.Mesh[] = [];
  private domainHelper: THREE.Box3Helper | null = null;

  // Terrain coupling
  private terrainCoupling: FluidTerrainCouplingConfig | null = null;

  // Surface extraction config
  private surfaceConfig: SurfaceExtractionConfig;

  // State tracking
  private isBuilt: boolean = false;
  private frameCount: number = 0;
  private simulationTime: number = 0;

  /**
   * Create a new FluidSceneComposer.
   *
   * @param config - Fluid scene configuration. Uses defaults for omitted fields.
   */
  constructor(config: Partial<FluidSceneConfig> = {}) {
    this.config = { ...DEFAULT_FLUID_SCENE_CONFIG, ...config };
    if (!config.gravity) {
      this.config.gravity = DEFAULT_FLUID_SCENE_CONFIG.gravity.clone();
    }
    if (!config.domainBounds) {
      this.config.domainBounds = DEFAULT_FLUID_SCENE_CONFIG.domainBounds.clone();
    }
    this.rng = new SeededRandom(this.config.seed);

    this.obstacleManager = new FluidObstacleManager();
    this.whitewaterSystem = new WhitewaterSystem();

    // Default surface extraction configuration
    const domainSize = new THREE.Vector3();
    this.config.domainBounds.getSize(domainSize);
    this.surfaceConfig = {
      method: 'marching_cubes',
      smoothing: 0.3,
      resolution: 24,
      particleRadius: 0.12,
      isoLevel: 0.5,
      bounds: this.config.domainBounds.clone(),
      smoothingIterations: 2,
      smoothingFactor: 0.3,
      boundsPadding: 0.15,
      useGridDensity: false,
    };
  }

  // ── Factory Methods ──────────────────────────────────────────────────────

  /**
   * Create a still water body description (calm lake, pool, basin).
   *
   * Fills a rectangular basin with water up to the specified level.
   * No inflows or outflows by default — the water is static.
   * Optional terrain coupling allows the water to interact with a basin floor.
   *
   * @param params - Still water parameters
   * @returns FluidBodyDescription ready for buildScene()
   */
  makeStillWater(params: StillWaterParams): FluidBodyDescription {
    const bounds = params.basinBounds.clone();
    const waterLevel = Math.min(params.waterLevel, bounds.max.y);

    return {
      type: 'still_water',
      bounds,
      initialFluidLevel: waterLevel,
      inflows: [],
      outflows: [],
      obstacles: [],
      terrainCoupling: params.terrainCoupling ?? DEFAULT_TERRAIN_COUPLING,
      initialVelocity: new THREE.Vector3(0, 0, 0),
      name: 'still_water',
    };
  }

  /**
   * Create a river body description with flow, banks, and optional rapids.
   *
   * The river flows from startPoint to endPoint along the Z axis.
   * Inflow is placed at the upstream end; outflow at the downstream end.
   * Bank slope controls how steep the channel walls are.
   * Rapid sections increase flow speed locally.
   *
   * @param params - River parameters
   * @returns FluidBodyDescription ready for buildScene()
   */
  makeRiver(params: RiverParams): FluidBodyDescription {
    const start = params.startPoint.clone();
    const end = params.endPoint.clone();
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    direction.normalize();

    // Compute bounds from river path
    const minY = Math.min(start.y, end.y) - params.depth;
    const maxY = Math.max(start.y, end.y) + params.depth;
    const bounds = new THREE.Box3(
      new THREE.Vector3(
        Math.min(start.x, end.x) - params.width / 2,
        minY,
        Math.min(start.z, end.z),
      ),
      new THREE.Vector3(
        Math.max(start.x, end.x) + params.width / 2,
        maxY,
        Math.max(start.z, end.z) + length,
      ),
    );

    // Inflow at upstream end
    const inflowPos = start.clone().add(direction.clone().multiplyScalar(0.5));
    inflowPos.y += params.depth / 2;
    const inflowVelocity = direction.clone().multiplyScalar(params.flowSpeed);

    const inflow: FluidInflowConfig = {
      position: inflowPos,
      velocity: inflowVelocity,
      radius: Math.max(params.width, params.depth) * 0.35,
      rate: 200,
    };

    // Outflow at downstream end
    const outflowPos = end.clone().sub(direction.clone().multiplyScalar(0.5));
    outflowPos.y += params.depth / 2;
    const outflow: FluidOutflowConfig = {
      position: outflowPos,
      velocity: inflowVelocity.clone(),
      radius: Math.max(params.width, params.depth) * 0.35,
      rate: 0,
    };

    // Create bank obstacles (left and right walls)
    const bankHeight = params.depth * 2;
    const bankThickness = 0.3;
    const bankOffset = params.width / 2 + bankThickness / 2;

    const leftBankPos = start.clone().add(end).multiplyScalar(0.5);
    leftBankPos.x -= bankOffset;
    leftBankPos.y = minY + bankHeight / 2;

    const rightBankPos = leftBankPos.clone();
    rightBankPos.x += params.width + bankThickness;

    const leftBank: FluidObstacleSceneConfig = {
      type: 'box',
      position: leftBankPos,
      sizeParams: [bankThickness, bankHeight, length],
      velocity: new THREE.Vector3(0, 0, 0),
      sdfResolution: 8,
    };

    const rightBank: FluidObstacleSceneConfig = {
      type: 'box',
      position: rightBankPos,
      sizeParams: [bankThickness, bankHeight, length],
      velocity: new THREE.Vector3(0, 0, 0),
      sdfResolution: 8,
    };

    // Add rock obstacles for rapid sections
    const obstacles: FluidObstacleSceneConfig[] = [leftBank, rightBank];
    const rng = new SeededRandom(this.config.seed + 100);

    for (const [zStart, zEnd, _speedMult] of params.rapidSections) {
      const rapidLength = zEnd - zStart;
      const numRocks = Math.max(2, Math.floor(rapidLength / 0.5));
      for (let i = 0; i < numRocks; i++) {
        const rockZ = zStart + rng.uniform(0, rapidLength);
        const rockX = start.x + rng.uniform(-params.width * 0.3, params.width * 0.3);
        const rockRadius = rng.uniform(0.08, 0.2);

        obstacles.push({
          type: 'sphere',
          position: new THREE.Vector3(rockX, minY + rockRadius, rockZ),
          sizeParams: [rockRadius],
          velocity: new THREE.Vector3(0, 0, 0),
          sdfResolution: 8,
        });
      }
    }

    return {
      type: 'river',
      bounds,
      initialFluidLevel: minY + params.depth,
      inflows: [inflow],
      outflows: [outflow],
      obstacles,
      terrainCoupling: params.terrainCoupling ?? DEFAULT_TERRAIN_COUPLING,
      initialVelocity: inflowVelocity,
      name: 'river',
    };
  }

  /**
   * Create a beach scene description with waves and shore interaction.
   *
   * The beach has a sloped sand terrain that transitions from deep water
   * to dry land. Incoming waves break near the shore, generating foam.
   * The terrain SDF is computed from the sand slope angle.
   *
   * @param params - Beach parameters
   * @returns FluidBodyDescription ready for buildScene()
   */
  makeBeach(params: BeachParams): FluidBodyDescription {
    const shoreNormal = params.shoreLine.clone().normalize();
    const width = params.beachWidth;
    const depth = params.beachDepth;

    // Domain bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(-width / 2, -0.5, 0),
      new THREE.Vector3(width / 2, params.oceanDepth * 1.5, depth),
    );

    // Inflow at the deep end (far from shore)
    const inflowY = params.oceanDepth * 0.6;
    const inflow: FluidInflowConfig = {
      position: new THREE.Vector3(0, inflowY, depth * 0.15),
      velocity: new THREE.Vector3(0, 0, -0.3),
      radius: width * 0.3,
      rate: 80,
    };

    // Beach terrain SDF: sloped plane where z increases → height increases
    const sandSlope = params.sandSlope;
    const oceanDepth = params.oceanDepth;
    const beachTerrainSDF = (pos: THREE.Vector3): number => {
      // Terrain surface: height increases linearly with z
      // At z=0: terrain_y = -oceanDepth (underwater)
      // At z=depth: terrain_y = depth * tan(sandSlope) - oceanDepth
      const terrainY = pos.z * Math.tan(sandSlope) - oceanDepth;
      return pos.y - terrainY;
    };

    const terrainCoupling: FluidTerrainCouplingConfig = {
      terrainSDF: beachTerrainSDF,
      shorelineWidth: params.shoreLine ? 0.5 : params.waveHeight * 2,
      wavePusherStrength: params.waveHeight * 2,
      absorptionRate: 0.01,
      friction: 0.4,
    };

    // Create a terrain mesh for visual representation
    const terrainGeo = new THREE.PlaneGeometry(width, depth, 32, 32);
    // Deform vertices to match slope
    const positions = terrainGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i);
      const y = (z + depth / 2) * Math.tan(sandSlope) - oceanDepth;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
      color: 0xc2b280,
      roughness: 0.9,
      metalness: 0.0,
    }));
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(0, 0, depth / 2);
    terrainMesh.updateMatrixWorld(true);

    const terrainObstacle: FluidObstacleSceneConfig = {
      type: 'mesh',
      position: new THREE.Vector3(0, -oceanDepth * 0.5, depth / 2),
      sizeParams: [],
      mesh: terrainMesh,
      velocity: new THREE.Vector3(0, 0, 0),
      sdfResolution: 16,
    };

    // Outflow at the shore end (water that reaches the sand dissipates)
    const outflow: FluidOutflowConfig = {
      position: new THREE.Vector3(0, 0, depth * 0.9),
      velocity: new THREE.Vector3(0, 0, 0),
      radius: width * 0.3,
      rate: 50,
    };

    return {
      type: 'ocean',
      bounds,
      initialFluidLevel: 0,
      inflows: [inflow],
      outflows: [outflow],
      obstacles: [terrainObstacle],
      terrainCoupling,
      initialVelocity: new THREE.Vector3(0, 0, -0.2),
      name: 'beach',
    };
  }

  /**
   * Create a tilted/sloped river body description.
   *
   * The river channel is inclined at slopeAngle, causing gravity-driven
   * flow. If flowSpeed is > 0, it overrides the gravity-computed speed.
   * Otherwise, flow speed is estimated from the slope and channel length.
   *
   * @param params - Tilted river parameters
   * @returns FluidBodyDescription ready for buildScene()
   */
  makeTiltedRiver(params: TiltedRiverParams): FluidBodyDescription {
    const start = params.startPoint.clone();
    const end = params.endPoint.clone();
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    direction.normalize();

    // Compute flow speed from slope if not specified
    let flowSpeed = params.flowSpeed;
    if (flowSpeed <= 0) {
      flowSpeed = Math.sqrt(2 * 9.81 * length * Math.sin(params.slopeAngle)) * 0.3;
    }

    // Slope displaces the channel vertically
    const slopeDisplacement = length * Math.sin(params.slopeAngle);
    const horizontalLength = length * Math.cos(params.slopeAngle);

    // Compute bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(
        Math.min(start.x, end.x) - params.width / 2,
        Math.min(start.y, end.y) - params.depth - 0.5,
        Math.min(start.z, end.z),
      ),
      new THREE.Vector3(
        Math.max(start.x, end.x) + params.width / 2,
        Math.max(start.y, end.y) + slopeDisplacement + params.depth + 0.5,
        Math.max(start.z, end.z) + horizontalLength,
      ),
    );

    // Flow velocity components
    const flowVel = new THREE.Vector3(
      0,
      -flowSpeed * Math.sin(params.slopeAngle),
      flowSpeed * Math.cos(params.slopeAngle),
    );

    // Inflow at the top of the slope
    const inflowPos = start.clone().add(new THREE.Vector3(0, params.depth / 2, 0.5));
    const inflow: FluidInflowConfig = {
      position: inflowPos,
      velocity: flowVel,
      radius: params.width * 0.35,
      rate: 200,
    };

    // Outflow at the bottom of the slope
    const outflowPos = end.clone().add(new THREE.Vector3(0, 0, horizontalLength - 0.5));
    const outflow: FluidOutflowConfig = {
      position: outflowPos,
      velocity: flowVel.clone(),
      radius: params.width * 0.35,
      rate: 0,
    };

    // Bank obstacles (sloped walls)
    const bankHeight = params.depth * 2;
    const bankThickness = 0.3;
    const bankOffset = params.width / 2 + bankThickness / 2;
    const midX = (start.x + end.x) / 2;
    const midZ = (start.z + end.z) / 2 + horizontalLength / 2;
    const midY = (start.y + end.y) / 2 + slopeDisplacement / 2;

    const leftBank: FluidObstacleSceneConfig = {
      type: 'box',
      position: new THREE.Vector3(midX - bankOffset, midY, midZ),
      sizeParams: [bankThickness, bankHeight, horizontalLength],
      rotation: new THREE.Euler(0, 0, -params.slopeAngle),
      velocity: new THREE.Vector3(0, 0, 0),
      sdfResolution: 8,
    };

    const rightBank: FluidObstacleSceneConfig = {
      type: 'box',
      position: new THREE.Vector3(midX + bankOffset, midY, midZ),
      sizeParams: [bankThickness, bankHeight, horizontalLength],
      rotation: new THREE.Euler(0, 0, -params.slopeAngle),
      velocity: new THREE.Vector3(0, 0, 0),
      sdfResolution: 8,
    };

    return {
      type: 'river',
      bounds,
      initialFluidLevel: start.y + params.depth,
      inflows: [inflow],
      outflows: [outflow],
      obstacles: [leftBank, rightBank],
      terrainCoupling: params.terrainCoupling ?? DEFAULT_TERRAIN_COUPLING,
      initialVelocity: flowVel,
      name: 'tilted_river',
    };
  }

  // ── Scene Building ───────────────────────────────────────────────────────

  /**
   * Build the complete Three.js scene from a FluidBodyDescription.
   *
   * Creates:
   *   - FLIPFluidSolver initialized with the body's particle distribution
   *   - Obstacle meshes registered with the FluidObstacleManager
   *   - Inflow/outflow boundary condition handlers
   *   - Fluid surface mesh (initially empty, updated per frame)
   *   - Whitewater particle system (foam, spray, bubbles)
   *   - Optional domain bounds visualization
   *
   * @param description - The fluid body description to build
   * @param showDomainHelper - Whether to show the domain bounding box wireframe
   * @returns THREE.Group containing all scene objects
   */
  buildScene(description: FluidBodyDescription, showDomainHelper: boolean = false): THREE.Group {
    // Clean up any previous scene
    this.disposeInternal();

    this.sceneGroup = new THREE.Group();
    this.sceneGroup.name = description.name ?? 'fluid_scene';

    // Store terrain coupling
    this.terrainCoupling = description.terrainCoupling ?? null;

    // ── Initialize FLIP solver ──
    const domainSize = new THREE.Vector3();
    description.bounds.getSize(domainSize);

    const cellSize = Math.max(
      domainSize.x / this.config.resolution[0],
      domainSize.y / this.config.resolution[1],
      domainSize.z / this.config.resolution[2],
    );

    const solverConfig: Partial<FLIPConfig> = {
      gridSize: this.config.resolution,
      cellSize,
      gravity: this.config.gravity.clone(),
      flipRatio: this.config.flipRatio,
      pressureIterations: this.config.pressureIterations,
      boundaryType: this.config.boundaryType,
      domainSize: { x: domainSize.x, y: domainSize.y, z: domainSize.z },
      particlesPerMeter: Math.round(1 / this.config.particleSpacing),
      adaptiveTimeStep: true,
    };

    this.solver = new FLIPFluidSolver(solverConfig);

    // Offset solver domain to match description bounds
    const domainMin = description.bounds.min.clone();

    // ── Initialize particles ──
    this.initializeParticles(description, domainMin);

    // ── Register obstacles ──
    this.setupObstacles(description, domainMin);

    // ── Set up inflow/outflow handlers ──
    this.setupBoundaryConditions(description, domainMin);

    // ── Create fluid surface mesh ──
    this.createFluidMesh(description);

    // ── Create whitewater particle systems ──
    this.createWhitewaterSystems();

    // ── Add obstacle meshes to scene ──
    for (const mesh of this.obstacleMeshes) {
      this.sceneGroup.add(mesh);
    }

    // ── Domain bounds helper (optional) ──
    if (showDomainHelper) {
      this.domainHelper = new THREE.Box3Helper(description.bounds, 0x444444);
      this.sceneGroup.add(this.domainHelper);
    }

    // ── Update surface extraction bounds ──
    this.surfaceConfig.bounds = description.bounds.clone();

    this.isBuilt = true;
    this.frameCount = 0;
    this.simulationTime = 0;

    return this.sceneGroup;
  }

  /**
   * Initialize the FLIP solver particles from the body description.
   * Fills the domain up to initialFluidLevel with particles at the configured spacing.
   */
  private initializeParticles(description: FluidBodyDescription, domainMin: THREE.Vector3): void {
    if (!this.solver) return;

    const spacing = this.config.particleSpacing;
    const bounds = description.bounds;
    const waterLevel = description.initialFluidLevel;
    const initialVel = description.initialVelocity;

    // Compute fill region
    const fillMinX = bounds.min.x + spacing;
    const fillMinY = bounds.min.y + spacing;
    const fillMinZ = bounds.min.z + spacing;
    const fillMaxX = bounds.max.x - spacing;
    const fillMaxY = Math.min(waterLevel, bounds.max.y - spacing);
    const fillMaxZ = bounds.max.z - spacing;

    // Create initial block of particles
    const fillMin = new THREE.Vector3(fillMinX, fillMinY, fillMinZ);
    const fillMax = new THREE.Vector3(fillMaxX, fillMaxY, fillMaxZ);

    this.solver.initializeBlock(fillMin, fillMax, spacing, initialVel);

    // Carve particles inside terrain if terrain SDF is provided
    if (description.terrainCoupling) {
      const terrainSDF = description.terrainCoupling.terrainSDF;
      const particles = this.solver.getParticles();
      // Remove particles inside terrain (SDF < 0 means inside)
      const kept = particles.filter(p => terrainSDF(p.position) > 0);
      this.solver.initialize(kept);
    }

    // Add small random perturbation for still water to break symmetry
    if (description.type === 'still_water' || description.type === 'lake') {
      const particles = this.solver.getParticles();
      const pertRng = new SeededRandom(this.config.seed + 7);
      const strength = (description as StillWaterParams & FluidBodyDescription).perturbationStrength ?? 0.01;
      for (const p of particles) {
        p.velocity.x += pertRng.uniform(-strength, strength);
        p.velocity.z += pertRng.uniform(-strength, strength);
      }
    }
  }

  /**
   * Register obstacles from the description with the obstacle manager
   * and create visual meshes for them.
   */
  private setupObstacles(description: FluidBodyDescription, _domainMin: THREE.Vector3): void {
    this.obstacleMeshes = [];

    for (const obsConfig of description.obstacles) {
      let mesh: THREE.Mesh;

      switch (obsConfig.type) {
        case 'box': {
          const [sx, sy, sz] = obsConfig.sizeParams;
          const geo = new THREE.BoxGeometry(sx, sy, sz);
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x6b7280,
            roughness: 0.8,
            metalness: 0.1,
          }));
          mesh.position.copy(obsConfig.position);
          if (obsConfig.rotation) {
            mesh.rotation.copy(obsConfig.rotation);
          }
          break;
        }
        case 'sphere': {
          const [radius] = obsConfig.sizeParams;
          const geo = new THREE.SphereGeometry(radius, 12, 12);
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x78716c,
            roughness: 0.9,
            metalness: 0.0,
          }));
          mesh.position.copy(obsConfig.position);
          break;
        }
        case 'cylinder': {
          const [radius, height] = obsConfig.sizeParams;
          const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
          mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x78716c,
            roughness: 0.8,
            metalness: 0.1,
          }));
          mesh.position.copy(obsConfig.position);
          break;
        }
        case 'mesh': {
          if (!obsConfig.mesh) continue;
          mesh = obsConfig.mesh;
          break;
        }
        default:
          continue;
      }

      mesh.updateMatrixWorld(true);
      this.obstacleMeshes.push(mesh);

      // Register with obstacle manager
      this.obstacleManager.addMeshObstacle(mesh, {
        meshResolution: obsConfig.sdfResolution,
        padding: 0.05,
        velocityInfluence: 0.3,
        friction: 0.3,
      });
    }

    // Register terrain mesh if provided
    if (description.terrainCoupling?.terrainMesh) {
      this.obstacleManager.addTerrainObstacle(
        description.terrainCoupling.terrainMesh,
        24,
      );
    }
  }

  /**
   * Set up inflow/outflow boundary condition handlers.
   */
  private setupBoundaryConditions(description: FluidBodyDescription, _domainMin: THREE.Vector3): void {
    this.inflowHandlers = [];
    this.outflowHandlers = [];

    for (const inflowConfig of description.inflows) {
      this.inflowHandlers.push(new FluidInflowOutflow(
        'inflow',
        inflowConfig.position,
        inflowConfig.velocity,
        inflowConfig.radius,
        inflowConfig.rate,
      ));
    }

    for (const outflowConfig of description.outflows) {
      this.outflowHandlers.push(new FluidInflowOutflow(
        'outflow',
        outflowConfig.position,
        outflowConfig.velocity,
        outflowConfig.radius,
        outflowConfig.rate,
      ));
    }
  }

  /**
   * Create the fluid surface mesh (initially empty geometry).
   * This mesh is updated each frame with the extracted isosurface.
   */
  private createFluidMesh(description: FluidBodyDescription): void {
    // Water material with transparency and Fresnel-like effect
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1a7fa0,
      transparent: true,
      opacity: 0.75,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.6,
      thickness: 0.5,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
    });

    // Adjust material based on body type
    switch (description.type) {
      case 'ocean':
        waterMaterial.color.set(0x0e5f8a);
        waterMaterial.opacity = 0.8;
        waterMaterial.transmission = 0.5;
        break;
      case 'river':
        waterMaterial.color.set(0x2d8fa5);
        waterMaterial.roughness = 0.1;
        break;
      case 'still_water':
      case 'lake':
        waterMaterial.color.set(0x3aafc9);
        waterMaterial.opacity = 0.7;
        waterMaterial.roughness = 0.02;
        break;
      case 'waterfall':
        waterMaterial.color.set(0x8ecae6);
        waterMaterial.opacity = 0.6;
        waterMaterial.transmission = 0.7;
        break;
    }

    const geometry = new THREE.BufferGeometry();
    this.fluidMesh = new THREE.Mesh(geometry, waterMaterial);
    this.fluidMesh.name = 'fluid_surface';
    this.sceneGroup!.add(this.fluidMesh);
  }

  /**
   * Create whitewater particle systems (foam, spray, bubbles).
   * Uses THREE.Points with custom shaders for efficient rendering.
   */
  private createWhitewaterSystems(): void {
    // Foam particles (white, larger)
    const foamGeo = new THREE.BufferGeometry();
    const foamPositions = new Float32Array(0);
    const foamOpacities = new Float32Array(0);
    foamGeo.setAttribute('position', new THREE.BufferAttribute(foamPositions, 3));
    foamGeo.setAttribute('aOpacity', new THREE.BufferAttribute(foamOpacities, 1));

    const foamMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.foamPoints = new THREE.Points(foamGeo, foamMaterial);
    this.foamPoints.name = 'foam_particles';
    this.sceneGroup!.add(this.foamPoints);

    // Spray particles (light blue, medium)
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));

    const sprayMaterial = new THREE.PointsMaterial({
      color: 0xaaddff,
      size: 0.025,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.sprayPoints = new THREE.Points(sprayGeo, sprayMaterial);
    this.sprayPoints.name = 'spray_particles';
    this.sceneGroup!.add(this.sprayPoints);

    // Bubble particles (cyan, small)
    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));

    const bubbleMaterial = new THREE.PointsMaterial({
      color: 0x66ddff,
      size: 0.015,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.bubblePoints = new THREE.Points(bubbleGeo, bubbleMaterial);
    this.bubblePoints.name = 'bubble_particles';
    this.sceneGroup!.add(this.bubblePoints);
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  /**
   * Advance the simulation by one frame (multiple sub-steps).
   *
   * Each call:
   * 1. Processes inflow/outflow boundary conditions
   * 2. Steps the FLIP solver (with sub-stepping)
   * 3. Handles terrain collision via SDF
   * 4. Updates the fluid surface mesh via marching cubes extraction
   * 5. Updates whitewater particles (foam, spray, bubbles)
   *
   * Must be called after buildScene().
   */
  simulateStep(): void {
    if (!this.isBuilt || !this.solver) return;

    const dt = this.config.timeStep;
    const rng = new SeededRandom(this.config.seed + this.frameCount * 1000);

    // ── Process inflows: add new particles ──
    for (const inflow of this.inflowHandlers) {
      const newParticles = inflow.generateParticles(dt, rng);
      for (const p of newParticles) {
        this.solver.addParticle(p.position, p.velocity);
      }
    }

    // ── Step the FLIP solver ──
    for (let s = 0; s < this.config.subSteps; s++) {
      this.solver.step(dt / this.config.subSteps);
    }

    // ── Process outflows: remove particles ──
    for (const outflow of this.outflowHandlers) {
      const particles = this.solver.getParticles();
      const kept = particles.filter(p => !outflow.shouldRemove(p.position));
      if (kept.length < particles.length) {
        this.solver.initialize(kept);
      }
    }

    // ── Terrain collision via SDF ──
    if (this.terrainCoupling) {
      this.applyTerrainCollision();
    }

    // ── Cull particles outside domain ──
    const bounds = this.solver.getDomainMin();
    const boundsMax = this.solver.getDomainMax();
    this.solver.cullParticles(bounds, boundsMax);

    // ── Update particle properties ──
    this.solver.updateParticleProperties();

    // ── Update visual representations ──
    this.updateFluidMesh();
    this.updateWhitewaterParticles(dt);

    this.frameCount++;
    this.simulationTime += dt;
  }

  /**
   * Apply terrain collision by pushing particles out of the terrain SDF.
   * Uses the gradient of the SDF to compute the push direction.
   */
  private applyTerrainCollision(): void {
    if (!this.solver || !this.terrainCoupling) return;

    const terrainSDF = this.terrainCoupling.terrainSDF;
    const absorption = this.terrainCoupling.absorptionRate;
    const friction = this.terrainCoupling.friction;
    const eps = this.config.particleSpacing * 0.5;

    const particles = this.solver.getParticles();
    const rng = new SeededRandom(this.config.seed + this.frameCount);
    const toRemove: Set<number> = new Set();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const d = terrainSDF(p.position);

      if (d < 0) {
        // Particle is inside terrain — compute gradient to push out
        const dx = terrainSDF(new THREE.Vector3(p.position.x + eps, p.position.y, p.position.z)) - d;
        const dy = terrainSDF(new THREE.Vector3(p.position.x, p.position.y + eps, p.position.z)) - d;
        const dz = terrainSDF(new THREE.Vector3(p.position.x, p.position.y, p.position.z + eps)) - d;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 1e-10) {
          // Push particle out of terrain
          const pushDist = -d + eps;
          p.position.x += (dx / len) * pushDist;
          p.position.y += (dy / len) * pushDist;
          p.position.z += (dz / len) * pushDist;

          // Apply friction to tangential velocity
          const nx = dx / len;
          const ny = dy / len;
          const nz = dz / len;

          // Remove normal component of velocity and apply friction
          const vn = p.velocity.x * nx + p.velocity.y * ny + p.velocity.z * nz;
          if (vn < 0) {
            p.velocity.x -= vn * nx;
            p.velocity.y -= vn * ny;
            p.velocity.z -= vn * nz;
          }
          p.velocity.x *= (1 - friction);
          p.velocity.z *= (1 - friction);
        }

        // Absorption: some particles are removed when they penetrate terrain
        if (absorption > 0 && rng.uniform(0, 1) < absorption) {
          toRemove.add(i);
        }
      } else if (d < this.terrainCoupling.shorelineWidth) {
        // Particle is near the shoreline — apply wave pusher
        const dx = terrainSDF(new THREE.Vector3(p.position.x + eps, p.position.y, p.position.z)) - d;
        const dz = terrainSDF(new THREE.Vector3(p.position.x, p.position.y, p.position.z + eps)) - d;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 1e-10) {
          const strength = this.terrainCoupling.wavePusherStrength *
            (1 - d / this.terrainCoupling.shorelineWidth);
          // Push fluid away from shore (along +SDF gradient in XZ)
          p.velocity.x += (dx / len) * strength * this.config.timeStep;
          p.velocity.z += (dz / len) * strength * this.config.timeStep;
        }
      }
    }

    // Remove absorbed particles
    if (toRemove.size > 0) {
      const kept = particles.filter((_, i) => !toRemove.has(i));
      this.solver.initialize(kept);
    }
  }

  /**
   * Update the fluid surface mesh from current solver particles.
   * Uses marching cubes surface extraction via FluidSurfaceExtractor.
   */
  private updateFluidMesh(): void {
    if (!this.solver || !this.fluidMesh) return;

    const flipParticles = this.solver.getParticles();
    if (flipParticles.length === 0) {
      // Clear the mesh
      this.fluidMesh.geometry.dispose();
      this.fluidMesh.geometry = new THREE.BufferGeometry();
      return;
    }

    // Convert FLIPParticles to FluidParticles for surface extraction
    const surfaceParticles: SurfaceFluidParticle[] = flipParticles.map(p => ({
      position: p.position,
      velocity: p.velocity,
      density: p.density,
      type: 'fluid' as const,
    }));

    // Extract surface every few frames for performance
    if (this.frameCount % 2 === 0) {
      try {
        const newGeometry = FluidSurfaceExtractor.extractSurface(
          surfaceParticles,
          this.surfaceConfig,
        );

        if (newGeometry.attributes.position && (newGeometry.attributes.position as THREE.BufferAttribute).count > 0) {
          const oldGeometry = this.fluidMesh.geometry;
          this.fluidMesh.geometry = newGeometry;
          oldGeometry.dispose();
        } else {
          newGeometry.dispose();
        }
      } catch {
        // Surface extraction can fail with degenerate particle distributions
        // Silently continue with the previous mesh
      }
    }
  }

  /**
   * Update whitewater particle positions from the WhitewaterSystem.
   */
  private updateWhitewaterParticles(dt: number): void {
    if (!this.solver) return;

    const flipParticles = this.solver.getParticles();
    const surfaceParticles: SurfaceFluidParticle[] = flipParticles.map(p => ({
      position: p.position,
      velocity: p.velocity,
      density: p.density,
      type: 'fluid' as const,
    }));

    // Generate whitewater
    const whitewater = this.whitewaterSystem.generate(surfaceParticles, dt);

    // Update foam points
    if (this.foamPoints && whitewater.foamCount > 0) {
      const positions = new Float32Array(whitewater.foam.buffer, 0, whitewater.foamCount * 3);
      this.foamPoints.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(positions), 3),
      );
      this.foamPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Update spray points
    if (this.sprayPoints && whitewater.sprayCount > 0) {
      const positions = new Float32Array(whitewater.spray.buffer, 0, whitewater.sprayCount * 3);
      this.sprayPoints.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(positions), 3),
      );
      this.sprayPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Update bubble points
    if (this.bubblePoints && whitewater.bubbleCount > 0) {
      const positions = new Float32Array(whitewater.bubbles.buffer, 0, whitewater.bubbleCount * 3);
      this.bubblePoints.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(positions), 3),
      );
      this.bubblePoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ── Public Accessors ─────────────────────────────────────────────────────

  /**
   * Get the current fluid surface mesh.
   * Updated each simulation step via marching cubes extraction.
   *
   * @returns The fluid surface THREE.Mesh, or null if not built
   */
  getFluidMesh(): THREE.Mesh | null {
    return this.fluidMesh;
  }

  /**
   * Get the foam particles as THREE.Points.
   * Foam appears near the water surface at high-curvature regions.
   *
   * @returns Foam particle system, or null if not built
   */
  getFoamParticles(): THREE.Points | null {
    return this.foamPoints;
  }

  /**
   * Get the spray particles as THREE.Points.
   * Spray appears at high-vorticity regions above the water surface.
   *
   * @returns Spray particle system, or null if not built
   */
  getSprayParticles(): THREE.Points | null {
    return this.sprayPoints;
  }

  /**
   * Get the bubble particles as THREE.Points.
   * Bubbles appear below the water surface at high-pressure regions.
   *
   * @returns Bubble particle system, or null if not built
   */
  getBubbleParticles(): THREE.Points | null {
    return this.bubblePoints;
  }

  /**
   * Get the obstacle manager for advanced obstacle manipulation.
   *
   * @returns The FluidObstacleManager instance
   */
  getObstacleManager(): FluidObstacleManager {
    return this.obstacleManager;
  }

  /**
   * Get the underlying FLIP solver.
   *
   * @returns The FLIPFluidSolver instance, or null if not built
   */
  getSolver(): FLIPFluidSolver | null {
    return this.solver;
  }

  /**
   * Get the current number of fluid particles.
   */
  getParticleCount(): number {
    return this.solver?.getParticleCount() ?? 0;
  }

  /**
   * Get the current simulation time in seconds.
   */
  getSimulationTime(): number {
    return this.simulationTime;
  }

  /**
   * Get the frame count since buildScene().
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Get the scene configuration.
   */
  getConfig(): FluidSceneConfig {
    return this.config;
  }

  /**
   * Get the surface extraction configuration.
   * Can be modified to change extraction quality at runtime.
   */
  getSurfaceConfig(): SurfaceExtractionConfig {
    return this.surfaceConfig;
  }

  /**
   * Set the surface extraction configuration.
   */
  setSurfaceConfig(config: Partial<SurfaceExtractionConfig>): void {
    this.surfaceConfig = { ...this.surfaceConfig, ...config };
  }

  /**
   * Get the whitewater configuration.
   */
  getWhitewaterConfig(): WhitewaterConfig {
    return this.whitewaterSystem instanceof WhitewaterSystem
      ? (this.whitewaterSystem as unknown as { config: WhitewaterConfig }).config
      : { maxFoamParticles: 5000, maxSprayParticles: 3000, maxBubbleParticles: 2000,
          curvatureThreshold: 0.5, vorticityThreshold: 5.0, accelerationThreshold: 3.0,
          bubbleBuoyancy: 2.0, foamLifetime: 5.0, sprayLifetime: 2.0, bubbleLifetime: 3.0, seed: 42 };
  }

  // ── Terrain SDF Helpers ──────────────────────────────────────────────────

  /**
   * Create a terrain SDF from a heightmap function.
   * The SDF returns the vertical distance to the terrain surface.
   *
   * @param heightFunction - Function mapping (x, z) → terrain height (y)
   * @returns SDF function for use with FluidTerrainCouplingConfig
   */
  static createHeightmapTerrainSDF(
    heightFunction: (x: number, z: number) => number,
  ): (pos: THREE.Vector3) => number {
    return (pos: THREE.Vector3): number => {
      const terrainY = heightFunction(pos.x, pos.z);
      return pos.y - terrainY;
    };
  }

  /**
   * Create a sloped plane terrain SDF.
   * The terrain slopes upward along the Z axis with the given slope angle.
   *
   * @param slopeAngle - Slope angle in radians
   * @param baseHeight - Height at z=0 (default 0)
   * @returns SDF function for use with FluidTerrainCouplingConfig
   */
  static createSlopedTerrainSDF(
    slopeAngle: number,
    baseHeight: number = 0,
  ): (pos: THREE.Vector3) => number {
    return (pos: THREE.Vector3): number => {
      const terrainY = pos.z * Math.tan(slopeAngle) + baseHeight;
      return pos.y - terrainY;
    };
  }

  /**
   * Create a riverbed terrain SDF with a concave cross-section.
   * The riverbed curves downward in the center and rises at the banks.
   *
   * @param width - Total width of the river channel
   * @param depth - Maximum depth at the center
   * @param centerX - X position of the river center
   * @returns SDF function for use with FluidTerrainCouplingConfig
   */
  static createRiverbedTerrainSDF(
    width: number,
    depth: number,
    centerX: number = 0,
  ): (pos: THREE.Vector3) => number {
    const halfWidth = width / 2;
    return (pos: THREE.Vector3): number => {
      const dx = pos.x - centerX;
      const normalizedDist = Math.abs(dx) / halfWidth;

      if (normalizedDist > 1) {
        // Outside the channel — terrain is at y=0
        return pos.y;
      }

      // Parabolic cross-section: deepest at center
      const bedY = -depth * (1 - normalizedDist * normalizedDist);
      return pos.y - bedY;
    };
  }

  /**
   * Create a stepped terrain SDF with flat terraces and steep transitions.
   * Useful for waterfall scenes.
   *
   * @param stepPositions - Z positions of each step
   * @param stepHeights - Height of each step (y offset at each step position)
   * @returns SDF function for use with FluidTerrainCouplingConfig
   */
  static createSteppedTerrainSDF(
    stepPositions: number[],
    stepHeights: number[],
  ): (pos: THREE.Vector3) => number {
    return (pos: THREE.Vector3): number => {
      let terrainY = 0;
      for (let i = 0; i < stepPositions.length; i++) {
        if (pos.z >= stepPositions[i]) {
          terrainY = stepHeights[i];
        }
      }
      return pos.y - terrainY;
    };
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /**
   * Internal cleanup without marking as not-built.
   * Used when rebuilding the scene.
   */
  private disposeInternal(): void {
    // Dispose solver
    if (this.solver) {
      this.solver.dispose();
      this.solver = null;
    }

    // Dispose fluid mesh geometry
    if (this.fluidMesh) {
      this.fluidMesh.geometry.dispose();
      if (this.fluidMesh.material instanceof THREE.Material) {
        this.fluidMesh.material.dispose();
      }
      this.fluidMesh = null;
    }

    // Dispose whitewater systems
    if (this.foamPoints) {
      this.foamPoints.geometry.dispose();
      if (this.foamPoints.material instanceof THREE.Material) {
        this.foamPoints.material.dispose();
      }
      this.foamPoints = null;
    }

    if (this.sprayPoints) {
      this.sprayPoints.geometry.dispose();
      if (this.sprayPoints.material instanceof THREE.Material) {
        this.sprayPoints.material.dispose();
      }
      this.sprayPoints = null;
    }

    if (this.bubblePoints) {
      this.bubblePoints.geometry.dispose();
      if (this.bubblePoints.material instanceof THREE.Material) {
        this.bubblePoints.material.dispose();
      }
      this.bubblePoints = null;
    }

    // Dispose obstacle meshes
    for (const mesh of this.obstacleMeshes) {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
    this.obstacleMeshes = [];

    // Dispose domain helper
    if (this.domainHelper) {
      if (this.domainHelper.material instanceof THREE.Material) {
        this.domainHelper.material.dispose();
      }
      this.domainHelper = null;
    }

    // Clear scene group
    if (this.sceneGroup) {
      this.sceneGroup.clear();
    }

    // Clear handlers
    this.inflowHandlers = [];
    this.outflowHandlers = [];
    this.terrainCoupling = null;

    // Clear obstacle manager
    this.obstacleManager.clear();

    // Reset whitewater system
    this.whitewaterSystem.reset();
  }

  /**
   * Dispose all resources and clean up.
   * Call this when the fluid scene is no longer needed.
   */
  dispose(): void {
    this.disposeInternal();
    this.sceneGroup = null;
    this.isBuilt = false;
    this.frameCount = 0;
    this.simulationTime = 0;
  }
}

export default FluidSceneComposer;
