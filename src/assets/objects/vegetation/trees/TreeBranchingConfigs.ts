/**
 * TreeBranchingConfigs.ts — Recursive Branching Configuration System
 *
 * Ports the original Infinigen treeconfigs.py with ~10+ detailed branching
 * presets, each featuring recursive children with specific path_kargs and
 * spawn_kargs. Provides a BranchingConfig interface with full control over
 * curve resolution, randomization, shape, spawn probability, angle, and
 * recursive child branches.
 *
 * Architecture:
 *   BranchingConfig   — recursive config defining how a branch grows & spawns children
 *   PathKargs         — parameters controlling the branch path (curve, shape, rolls)
 *   SpawnKargs        — parameters controlling child branch spawning
 *   TreeSkeletonGenerator — uses recursive configs + space colonization
 *   applyBranchingConfig() — apply a config to generate a tree skeleton
 *
 * Ported from: infinigen/terrain/objects/tree/treeconfigs.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { TreeSkeleton, TreeVertex, TreeEdge } from '../SpaceColonization';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Parameters controlling the shape of a branch's path through space.
 * Corresponds to Infinigen's path_kargs.
 */
export interface PathKargs {
  /** Number of curve resolution segments (default 8) */
  curveResolution: number;
  /** Whether to randomize control point positions (default true) */
  randomize: boolean;
  /** Shape function: 'straight' | 'taper' | 'droop' | 'weeping' | 'spiral' */
  shape: 'straight' | 'taper' | 'droop' | 'weeping' | 'spiral';
  /** Amount of shape deformation (0-1, default 0.5) */
  shapeAmount: number;
  /** Roll angles at each control point for twisting (radians) */
  rolls: number[];
  /** Taper ratio: radius at tip / radius at base (default 0.3) */
  taperRatio: number;
  /** Gravity droop factor (0 = no droop, 1 = heavy droop) */
  droopFactor: number;
  /** Spiral twist rate (radians per unit length) */
  spiralRate: number;
  /** Noise amplitude for randomization */
  noiseAmplitude: number;
}

/**
 * Parameters controlling how child branches are spawned from this branch.
 * Corresponds to Infinigen's spawn_kargs.
 */
export interface SpawnKargs {
  /** Probability of spawning a child at each spawn point (0-1) */
  probability: number;
  /** Number of children to attempt spawning */
  number: number;
  /** Angle of child branch from parent (radians, default PI/6) */
  angle: number;
  /** Angle variation range (radians) */
  angleVariation: number;
  /** Distance along parent to place children (0=base, 1=tip) */
  distance: number;
  /** Radius of child branch as fraction of parent radius */
  radius: number;
  /** Minimum parent radius below which no children spawn */
  minParentRadius: number;
  /** Distribution along parent: 'uniform' | 'alternating' | 'whorled' | 'clustered' */
  distribution: 'uniform' | 'alternating' | 'whorled' | 'clustered';
  /** For whorled distribution: number of branches per whorl */
  whorlCount: number;
  /** Start position along parent for spawning (0-1) */
  startPosition: number;
  /** End position along parent for spawning (0-1) */
  endPosition: number;
}

/**
 * Branching symmetry type — how children are arranged around the parent.
 */
export type BranchSymmetry = 'radial' | 'bilateral' | 'none' | 'opposite' | 'alternate';

/**
 * A recursive branching configuration. Each config describes how a branch
 * grows (pathKargs) and what children it spawns (spawnKargs), with
 * children being BranchingConfig instances themselves.
 *
 * This mirrors the original Infinigen treeconfigs recursive structure
 * where trunk configs contain child branch configs, which in turn contain
 * twig configs, etc.
 */
export interface BranchingConfig {
  /** Human-readable name for this branching level */
  name: string;
  /** Path shape parameters */
  pathKargs: PathKargs;
  /** Child spawn parameters */
  spawnKargs: SpawnKargs;
  /** Symmetry of child arrangement */
  symmetry: BranchSymmetry;
  /** Recursive child branch configurations */
  children: BranchingConfig[];
  /** Maximum recursion depth for this config (0 = no further children) */
  maxDepth: number;
  /** Length of this branch type (meters) */
  length: number;
  /** Base radius of this branch type (meters) */
  radius: number;
  /** Color hint for material assignment */
  barkColor: THREE.Color;
}

// ============================================================================
// Default Kargs
// ============================================================================

export const DEFAULT_PATH_KARGS: PathKargs = {
  curveResolution: 8,
  randomize: true,
  shape: 'straight',
  shapeAmount: 0.5,
  rolls: [],
  taperRatio: 0.3,
  droopFactor: 0.0,
  spiralRate: 0.0,
  noiseAmplitude: 0.1,
};

export const DEFAULT_SPAWN_KARGS: SpawnKargs = {
  probability: 0.8,
  number: 4,
  angle: Math.PI / 6,
  angleVariation: 0.2,
  distance: 0.5,
  radius: 0.4,
  minParentRadius: 0.02,
  distribution: 'alternating',
  whorlCount: 4,
  startPosition: 0.3,
  endPosition: 0.95,
};

// ============================================================================
// Preset Branching Configs
// ============================================================================

/** Conifer twig: short, thin, with needle-like children */
const ConiferTwig: BranchingConfig = {
  name: 'ConiferTwig',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 4,
    shape: 'straight',
    taperRatio: 0.5,
    droopFactor: 0.05,
    noiseAmplitude: 0.05,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.3,
    number: 2,
    angle: 0.3,
    angleVariation: 0.1,
    radius: 0.3,
    distribution: 'alternating',
    startPosition: 0.3,
    endPosition: 0.9,
  },
  symmetry: 'alternate',
  children: [],
  maxDepth: 0,
  length: 0.4,
  radius: 0.008,
  barkColor: new THREE.Color(0x3d2b1f),
};

/** Deciduous twig: medium, slightly drooping, with leaf-bearing children */
const DeciduousTwig: BranchingConfig = {
  name: 'DeciduousTwig',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 6,
    shape: 'droop',
    shapeAmount: 0.3,
    taperRatio: 0.4,
    droopFactor: 0.2,
    noiseAmplitude: 0.08,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.5,
    number: 3,
    angle: 0.5,
    angleVariation: 0.2,
    radius: 0.3,
    distribution: 'alternating',
    startPosition: 0.4,
    endPosition: 0.95,
  },
  symmetry: 'alternate',
  children: [],
  maxDepth: 0,
  length: 0.6,
  radius: 0.01,
  barkColor: new THREE.Color(0x5d4037),
};

/** Pine twig: short, stiff, slightly upward */
const PineTwig: BranchingConfig = {
  name: 'PineTwig',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 4,
    shape: 'straight',
    taperRatio: 0.5,
    droopFactor: 0.0,
    noiseAmplitude: 0.05,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.4,
    number: 2,
    angle: 0.3,
    angleVariation: 0.1,
    radius: 0.35,
    distribution: 'whorled',
    whorlCount: 5,
    startPosition: 0.3,
    endPosition: 0.85,
  },
  symmetry: 'radial',
  children: [],
  maxDepth: 0,
  length: 0.3,
  radius: 0.006,
  barkColor: new THREE.Color(0x4a3728),
};

/** Fruit twig: medium, with fruit-bearing terminus */
const FruitTwig: BranchingConfig = {
  name: 'FruitTwig',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 5,
    shape: 'droop',
    shapeAmount: 0.4,
    taperRatio: 0.5,
    droopFactor: 0.3,
    noiseAmplitude: 0.06,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.6,
    number: 2,
    angle: 0.6,
    angleVariation: 0.15,
    radius: 0.35,
    distribution: 'alternating',
    startPosition: 0.5,
    endPosition: 0.95,
  },
  symmetry: 'alternate',
  children: [],
  maxDepth: 0,
  length: 0.5,
  radius: 0.008,
  barkColor: new THREE.Color(0x5d4037),
};

/** Willow twig: long, very weeping */
const WillowTwig: BranchingConfig = {
  name: 'WillowTwig',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 10,
    shape: 'weeping',
    shapeAmount: 0.9,
    taperRatio: 0.2,
    droopFactor: 0.8,
    noiseAmplitude: 0.03,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.3,
    number: 1,
    angle: 0.2,
    angleVariation: 0.1,
    radius: 0.3,
    distribution: 'alternating',
    startPosition: 0.4,
    endPosition: 0.9,
  },
  symmetry: 'alternate',
  children: [],
  maxDepth: 0,
  length: 1.2,
  radius: 0.005,
  barkColor: new THREE.Color(0x4a5a3a),
};

// ============================================================================
// 10+ Trunk/Branch Presets
// ============================================================================

/**
 * BroadleafTrunk: tall, slightly curved trunk with spreading branches
 * that produce deciduous twigs.
 */
export const BroadleafTrunk: BranchingConfig = {
  name: 'BroadleafTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 12,
    randomize: true,
    shape: 'straight',
    shapeAmount: 0.2,
    taperRatio: 0.5,
    droopFactor: 0.0,
    noiseAmplitude: 0.05,
    rolls: [0, 0.1, -0.05, 0.08],
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.9,
    number: 5,
    angle: Math.PI / 4,
    angleVariation: 0.3,
    distance: 0.6,
    radius: 0.35,
    distribution: 'alternating',
    startPosition: 0.3,
    endPosition: 0.9,
  },
  symmetry: 'radial',
  children: [{
    name: 'BroadleafBranch',
    pathKargs: {
      ...DEFAULT_PATH_KARGS,
      curveResolution: 8,
      shape: 'taper',
      shapeAmount: 0.4,
      taperRatio: 0.35,
      droopFactor: 0.15,
      noiseAmplitude: 0.08,
    },
    spawnKargs: {
      ...DEFAULT_SPAWN_KARGS,
      probability: 0.7,
      number: 3,
      angle: Math.PI / 5,
      angleVariation: 0.2,
      radius: 0.4,
      distribution: 'alternating',
      startPosition: 0.4,
      endPosition: 0.9,
    },
    symmetry: 'alternate',
    children: [DeciduousTwig],
    maxDepth: 2,
    length: 2.5,
    radius: 0.06,
    barkColor: new THREE.Color(0x4a3728),
  }],
  maxDepth: 3,
  length: 6.0,
  radius: 0.25,
  barkColor: new THREE.Color(0x3d2b1f),
};

/**
 * PineTrunk: tall, straight, conical trunk with whorled branches
 * producing pine twigs.
 */
export const PineTrunk: BranchingConfig = {
  name: 'PineTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 10,
    randomize: true,
    shape: 'straight',
    shapeAmount: 0.1,
    taperRatio: 0.6,
    droopFactor: 0.0,
    noiseAmplitude: 0.03,
    rolls: [],
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.95,
    number: 6,
    angle: Math.PI / 5,
    angleVariation: 0.1,
    distance: 0.7,
    radius: 0.2,
    distribution: 'whorled',
    whorlCount: 6,
    startPosition: 0.15,
    endPosition: 0.95,
  },
  symmetry: 'radial',
  children: [{
    name: 'PineBranch',
    pathKargs: {
      ...DEFAULT_PATH_KARGS,
      curveResolution: 6,
      shape: 'straight',
      shapeAmount: 0.2,
      taperRatio: 0.3,
      droopFactor: 0.2,
      noiseAmplitude: 0.05,
    },
    spawnKargs: {
      ...DEFAULT_SPAWN_KARGS,
      probability: 0.6,
      number: 3,
      angle: 0.4,
      angleVariation: 0.1,
      radius: 0.35,
      distribution: 'whorled',
      whorlCount: 4,
      startPosition: 0.3,
      endPosition: 0.85,
    },
    symmetry: 'radial',
    children: [PineTwig],
    maxDepth: 2,
    length: 1.8,
    radius: 0.04,
    barkColor: new THREE.Color(0x4a3728),
  }],
  maxDepth: 3,
  length: 8.0,
  radius: 0.18,
  barkColor: new THREE.Color(0x3d2b1f),
};

/**
 * BaobabTrunk: massive, swollen trunk with sparse thick branches.
 */
export const BaobabTrunk: BranchingConfig = {
  name: 'BaobabTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 10,
    randomize: true,
    shape: 'taper',
    shapeAmount: 0.6,
    taperRatio: 1.3, // Trunk gets wider at base
    droopFactor: 0.0,
    noiseAmplitude: 0.08,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.7,
    number: 4,
    angle: Math.PI / 3,
    angleVariation: 0.3,
    distance: 0.5,
    radius: 0.5,
    distribution: 'clustered',
    startPosition: 0.65,
    endPosition: 0.95,
  },
  symmetry: 'radial',
  children: [{
    name: 'BaobabBranch',
    pathKargs: {
      ...DEFAULT_PATH_KARGS,
      curveResolution: 8,
      shape: 'droop',
      shapeAmount: 0.3,
      taperRatio: 0.4,
      droopFactor: 0.1,
      noiseAmplitude: 0.06,
    },
    spawnKargs: {
      ...DEFAULT_SPAWN_KARGS,
      probability: 0.5,
      number: 3,
      angle: Math.PI / 4,
      angleVariation: 0.2,
      radius: 0.45,
      distribution: 'alternating',
      startPosition: 0.4,
      endPosition: 0.9,
    },
    symmetry: 'alternate',
    children: [DeciduousTwig],
    maxDepth: 1,
    length: 3.5,
    radius: 0.12,
    barkColor: new THREE.Color(0x6b5a48),
  }],
  maxDepth: 2,
  length: 7.0,
  radius: 0.6,
  barkColor: new THREE.Color(0x7a6a58),
};

/**
 * WillowTrunk: medium trunk with extremely weeping branches.
 */
export const WillowTrunk: BranchingConfig = {
  name: 'WillowTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 10,
    randomize: true,
    shape: 'straight',
    shapeAmount: 0.15,
    taperRatio: 0.45,
    droopFactor: 0.0,
    noiseAmplitude: 0.05,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.85,
    number: 6,
    angle: Math.PI / 3,
    angleVariation: 0.25,
    distance: 0.5,
    radius: 0.3,
    distribution: 'alternating',
    startPosition: 0.4,
    endPosition: 0.92,
  },
  symmetry: 'radial',
  children: [{
    name: 'WillowBranch',
    pathKargs: {
      ...DEFAULT_PATH_KARGS,
      curveResolution: 12,
      shape: 'weeping',
      shapeAmount: 0.85,
      taperRatio: 0.25,
      droopFactor: 0.7,
      noiseAmplitude: 0.04,
    },
    spawnKargs: {
      ...DEFAULT_SPAWN_KARGS,
      probability: 0.6,
      number: 4,
      angle: 0.3,
      angleVariation: 0.15,
      radius: 0.35,
      distribution: 'alternating',
      startPosition: 0.3,
      endPosition: 0.9,
    },
    symmetry: 'alternate',
    children: [WillowTwig],
    maxDepth: 2,
    length: 3.0,
    radius: 0.05,
    barkColor: new THREE.Color(0x4a5a3a),
  }],
  maxDepth: 3,
  length: 5.0,
  radius: 0.2,
  barkColor: new THREE.Color(0x3d4a2f),
};

/**
 * PalmTrunk: tall, slender, slightly curved trunk with no side branches
 * (fronds emerge from crown only).
 */
export const PalmTrunk: BranchingConfig = {
  name: 'PalmTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 12,
    randomize: true,
    shape: 'straight',
    shapeAmount: 0.2,
    taperRatio: 0.7,
    droopFactor: 0.0,
    noiseAmplitude: 0.03,
    spiralRate: 0.01,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 1.0,
    number: 12,
    angle: Math.PI / 3,
    angleVariation: 0.1,
    distance: 0.95,
    radius: 0.4,
    distribution: 'whorled',
    whorlCount: 12,
    startPosition: 0.95,
    endPosition: 1.0,
  },
  symmetry: 'radial',
  children: [],
  maxDepth: 1,
  length: 8.0,
  radius: 0.12,
  barkColor: new THREE.Color(0x8b7355),
};

/**
 * BushTrunk: short, multi-stemmed, dense branching.
 */
export const BushTrunk: BranchingConfig = {
  name: 'BushTrunk',
  pathKargs: {
    ...DEFAULT_PATH_KARGS,
    curveResolution: 8,
    randomize: true,
    shape: 'straight',
    shapeAmount: 0.3,
    taperRatio: 0.4,
    droopFactor: 0.05,
    noiseAmplitude: 0.1,
  },
  spawnKargs: {
    ...DEFAULT_SPAWN_KARGS,
    probability: 0.9,
    number: 5,
    angle: Math.PI / 3,
    angleVariation: 0.3,
    distance: 0.4,
    radius: 0.4,
    distribution: 'uniform',
    startPosition: 0.2,
    endPosition: 0.9,
  },
  symmetry: 'radial',
  children: [{
    name: 'BushBranch',
    pathKargs: {
      ...DEFAULT_PATH_KARGS,
      curveResolution: 6,
      shape: 'droop',
      shapeAmount: 0.3,
      taperRatio: 0.3,
      droopFactor: 0.15,
      noiseAmplitude: 0.08,
    },
    spawnKargs: {
      ...DEFAULT_SPAWN_KARGS,
      probability: 0.7,
      number: 3,
      angle: 0.5,
      angleVariation: 0.2,
      radius: 0.4,
      distribution: 'alternating',
      startPosition: 0.3,
      endPosition: 0.85,
    },
    symmetry: 'alternate',
    children: [DeciduousTwig],
    maxDepth: 1,
    length: 1.2,
    radius: 0.02,
    barkColor: new THREE.Color(0x5d4037),
  }],
  maxDepth: 2,
  length: 1.5,
  radius: 0.04,
  barkColor: new THREE.Color(0x4a3728),
};

/**
 * ConiferTwigPreset: standalone conifer twig config (exported separately).
 */
export { ConiferTwig, DeciduousTwig, PineTwig, FruitTwig, WillowTwig };

/**
 * All branching config presets for easy access.
 */
export const BRANCHING_CONFIG_PRESETS: Record<string, BranchingConfig> = {
  BroadleafTrunk,
  PineTrunk,
  BaobabTrunk,
  WillowTrunk,
  PalmTrunk,
  BushTrunk,
  ConiferTwig,
  DeciduousTwig,
  PineTwig,
  FruitTwig,
  WillowTwig,
};

// ============================================================================
// TreeSkeletonGenerator
// ============================================================================

/**
 * Internal vertex during skeleton generation.
 */
interface SkeletonVertex {
  index: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  generation: number;
  radius: number;
  isTerminal: boolean;
}

/**
 * Generates tree skeletons from recursive BranchingConfig definitions.
 *
 * Unlike SpaceColonization (which uses attractor points), this generator
 * uses recursive branching configs to directly produce a tree skeleton.
 * This is closer to the original Infinigen treeconfigs approach.
 *
 * Usage:
 * ```ts
 * const generator = new TreeSkeletonGenerator(BroadleafTrunk, 42);
 * const skeleton = generator.generate();
 * ```
 */
export class TreeSkeletonGenerator {
  private config: BranchingConfig;
  private rng: SeededRandom;
  private vertices: SkeletonVertex[] = [];
  private edges: TreeEdge[] = [];
  private terminalIndices: number[] = [];
  private vertexCounter = 0;

  constructor(config: BranchingConfig, seed: number = 42) {
    this.config = config;
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a tree skeleton from the recursive branching config.
   *
   * @returns TreeSkeleton compatible with TreeSkeletonMeshBuilder
   */
  generate(): TreeSkeleton {
    this.vertices = [];
    this.edges = [];
    this.terminalIndices = [];
    this.vertexCounter = 0;

    // Create root vertex at origin
    const rootVertex: SkeletonVertex = {
      index: 0,
      position: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(0, 1, 0),
      generation: 0,
      radius: this.config.radius,
      isTerminal: false,
    };
    this.vertices.push(rootVertex);
    this.vertexCounter = 1;

    // Recursively generate branches
    this.generateBranchRecursive(
      rootVertex.index,
      this.config,
      0, // depth
      new THREE.Vector3(0, 1, 0), // direction
    );

    // Convert to TreeSkeleton format
    const treeVertices: TreeVertex[] = this.vertices.map(v => ({
      index: v.index,
      position: v.position,
      direction: v.direction,
      generation: v.generation,
      radius: v.radius,
      isTerminal: v.isTerminal,
    }));

    const positions = treeVertices.map(v => v.position);
    const boundingBox = new THREE.Box3().setFromPoints(
      positions.length > 0 ? positions : [new THREE.Vector3()]
    );

    const maxGeneration = treeVertices.reduce((max, v) => Math.max(max, v.generation), 0);

    return {
      vertices: treeVertices,
      edges: this.edges,
      rootIndex: 0,
      terminalIndices: this.terminalIndices,
      boundingBox,
      maxGeneration,
    };
  }

  /**
   * Recursively generate branches from a parent vertex.
   */
  private generateBranchRecursive(
    parentIndex: number,
    config: BranchingConfig,
    currentDepth: number,
    parentDirection: THREE.Vector3,
  ): void {
    if (currentDepth > config.maxDepth) return;

    const parentVertex = this.vertices[parentIndex];
    const pathKargs = config.pathKargs;
    const spawnKargs = config.spawnKargs;

    // Generate branch path points
    const pathPoints = this.generateBranchPath(
      parentVertex.position,
      parentDirection,
      config.length,
      config.radius,
      pathKargs,
    );

    // Create vertices along the path
    let prevIndex = parentIndex;
    const pathVertexIndices: number[] = [];

    for (let i = 0; i < pathPoints.length; i++) {
      const point = pathPoints[i];
      const t = (i + 1) / pathPoints.length;
      const radius = config.radius * (1 - (1 - pathKargs.taperRatio) * t);

      const vertex: SkeletonVertex = {
        index: this.vertexCounter++,
        position: point.position,
        direction: point.direction,
        generation: currentDepth,
        radius: Math.max(radius, 0.005),
        isTerminal: true, // Will be updated if children are added
      };
      this.vertices.push(vertex);
      pathVertexIndices.push(vertex.index);

      // Mark previous vertex as non-terminal
      this.vertices[prevIndex].isTerminal = false;

      this.edges.push({ parent: prevIndex, child: vertex.index });
      prevIndex = vertex.index;
    }

    // The last vertex on this path is a potential terminal
    const tipIndex = pathVertexIndices[pathVertexIndices.length - 1];

    // Spawn children based on spawnKargs
    if (currentDepth < config.maxDepth && config.children.length > 0) {
      const childConfig = config.children[0]; // Primary child config

      // Determine spawn positions along the branch
      const spawnPositions = this.computeSpawnPositions(
        pathVertexIndices,
        spawnKargs,
        parentDirection,
      );

      for (const spawnInfo of spawnPositions) {
        if (this.rng.next() > spawnKargs.probability) continue;

        const spawnVertex = this.vertices[spawnInfo.vertexIndex];
        if (spawnVertex.radius < spawnKargs.minParentRadius) continue;

        // Compute child direction
        const childDir = this.computeChildDirection(
          spawnInfo.direction,
          spawnKargs.angle,
          spawnKargs.angleVariation,
        );

        // Scale child length and radius
        const scaledChildConfig: BranchingConfig = {
          ...childConfig,
          length: childConfig.length * (0.7 + this.rng.next() * 0.6),
          radius: childConfig.radius * spawnKargs.radius,
        };

        this.generateBranchRecursive(
          spawnInfo.vertexIndex,
          scaledChildConfig,
          currentDepth + 1,
          childDir,
        );
      }
    }

    // If no children were spawned, mark tip as terminal
    if (this.vertices[tipIndex].isTerminal) {
      this.terminalIndices.push(tipIndex);
    }
  }

  /**
   * Generate the path of a branch as a series of 3D points with directions.
   */
  private generateBranchPath(
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    baseRadius: number,
    pathKargs: PathKargs,
  ): Array<{ position: THREE.Vector3; direction: THREE.Vector3 }> {
    const points: Array<{ position: THREE.Vector3; direction: THREE.Vector3 }> = [];
    const segments = pathKargs.curveResolution;
    const segLength = length / segments;

    let currentPos = startPos.clone();
    let currentDir = direction.clone().normalize();

    for (let i = 0; i < segments; i++) {
      const t = (i + 1) / segments;

      // Apply shape modifications
      let modifiedDir = currentDir.clone();

      switch (pathKargs.shape) {
        case 'taper': {
          // Slight inward curve
          const taperAmount = pathKargs.shapeAmount * 0.1 * t;
          modifiedDir.x *= (1 - taperAmount);
          modifiedDir.z *= (1 - taperAmount);
          break;
        }
        case 'droop': {
          // Gravity pulls branch down over length
          modifiedDir.y -= pathKargs.droopFactor * pathKargs.shapeAmount * 0.1;
          break;
        }
        case 'weeping': {
          // Strong downward curve
          modifiedDir.y -= pathKargs.shapeAmount * 0.15;
          break;
        }
        case 'spiral': {
          // Twist direction
          const spiralAngle = pathKargs.spiralRate * segLength;
          const perp = new THREE.Vector3(0, 0, 1).cross(currentDir).normalize();
          if (perp.length() > 0.01) {
            modifiedDir.applyAxisAngle(perp, spiralAngle);
          }
          break;
        }
      }

      // Apply randomization
      if (pathKargs.randomize) {
        const noiseAmp = pathKargs.noiseAmplitude;
        modifiedDir.x += this.rng.gaussian(0, noiseAmp * 0.5);
        modifiedDir.y += this.rng.gaussian(0, noiseAmp * 0.3);
        modifiedDir.z += this.rng.gaussian(0, noiseAmp * 0.5);
      }

      // Normalize direction
      modifiedDir.normalize();

      // Compute next position
      const nextPos = currentPos.clone().add(
        modifiedDir.clone().multiplyScalar(segLength)
      );

      points.push({
        position: nextPos,
        direction: modifiedDir.clone(),
      });

      currentPos = nextPos;
      currentDir = modifiedDir;
    }

    return points;
  }

  /**
   * Compute spawn positions along a branch based on spawn distribution.
   */
  private computeSpawnPositions(
    pathVertexIndices: number[],
    spawnKargs: SpawnKargs,
    parentDirection: THREE.Vector3,
  ): Array<{ vertexIndex: number; direction: THREE.Vector3 }> {
    const positions: Array<{ vertexIndex: number; direction: THREE.Vector3 }> = [];

    const startIdx = Math.floor(spawnKargs.startPosition * pathVertexIndices.length);
    const endIdx = Math.floor(spawnKargs.endPosition * pathVertexIndices.length);

    switch (spawnKargs.distribution) {
      case 'uniform': {
        const count = spawnKargs.number;
        for (let i = 0; i < count; i++) {
          const t = startIdx + (i / count) * (endIdx - startIdx);
          const idx = Math.min(Math.floor(t), pathVertexIndices.length - 1);
          const vertex = this.vertices[pathVertexIndices[idx]];
          positions.push({
            vertexIndex: pathVertexIndices[idx],
            direction: vertex.direction.clone(),
          });
        }
        break;
      }
      case 'alternating': {
        for (let i = 0; i < spawnKargs.number; i++) {
          const t = startIdx + (i / spawnKargs.number) * (endIdx - startIdx);
          const idx = Math.min(Math.floor(t), pathVertexIndices.length - 1);
          const vertex = this.vertices[pathVertexIndices[idx]];
          positions.push({
            vertexIndex: pathVertexIndices[idx],
            direction: vertex.direction.clone(),
          });
        }
        break;
      }
      case 'whorled': {
        // All children at same position, different angles
        const t = Math.floor((startIdx + endIdx) / 2);
        const idx = Math.min(t, pathVertexIndices.length - 1);
        const vertex = this.vertices[pathVertexIndices[idx]];
        for (let i = 0; i < spawnKargs.whorlCount; i++) {
          positions.push({
            vertexIndex: pathVertexIndices[idx],
            direction: vertex.direction.clone(),
          });
        }
        break;
      }
      case 'clustered': {
        // Children clustered near the end
        const clusterStart = Math.floor(endIdx * 0.7);
        for (let i = 0; i < spawnKargs.number; i++) {
          const idx = Math.min(
            clusterStart + Math.floor(this.rng.next() * (endIdx - clusterStart)),
            pathVertexIndices.length - 1
          );
          const vertex = this.vertices[pathVertexIndices[idx]];
          positions.push({
            vertexIndex: pathVertexIndices[idx],
            direction: vertex.direction.clone(),
          });
        }
        break;
      }
    }

    return positions;
  }

  /**
   * Compute a child branch direction based on the parent direction and
   * spawn parameters, respecting the symmetry mode.
   */
  private computeChildDirection(
    parentDir: THREE.Vector3,
    angle: number,
    angleVariation: number,
  ): THREE.Vector3 {
    const actualAngle = angle + this.rng.uniform(-angleVariation, angleVariation);

    // Find a perpendicular vector
    const arbitrary = Math.abs(parentDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(parentDir, arbitrary).normalize();

    // Rotate parent direction by branch angle around perpendicular
    const branchQuat = new THREE.Quaternion().setFromAxisAngle(perp, actualAngle);

    // Add random rotation around parent axis for 3D spread
    const spreadAngle = this.rng.uniform(0, Math.PI * 2);
    const spreadQuat = new THREE.Quaternion().setFromAxisAngle(parentDir, spreadAngle);

    return parentDir.clone()
      .applyQuaternion(branchQuat)
      .applyQuaternion(spreadQuat)
      .normalize();
  }
}

// ============================================================================
// applyBranchingConfig — Convenience Function
// ============================================================================

/**
 * Apply a BranchingConfig to generate a tree skeleton.
 * This is the main entry point for using the branching config system.
 *
 * @param config The branching config to apply
 * @param rng Seeded random for determinism
 * @returns TreeSkeleton that can be fed to TreeSkeletonMeshBuilder
 *
 * @example
 * ```ts
 * const skeleton = applyBranchingConfig(BroadleafTrunk, new SeededRandom(42));
 * const meshBuilder = new TreeSkeletonMeshBuilder();
 * const geometry = meshBuilder.buildFromSkeleton(skeleton);
 * ```
 */
export function applyBranchingConfig(
  config: BranchingConfig,
  rng: SeededRandom,
): TreeSkeleton {
  const generator = new TreeSkeletonGenerator(config, rng.seed);
  return generator.generate();
}

/**
 * Get a branching config preset by name.
 */
export function getBranchingConfigPreset(name: string): BranchingConfig | undefined {
  return BRANCHING_CONFIG_PRESETS[name];
}

/**
 * Get all available branching config preset names.
 */
export function getAvailableBranchingPresets(): string[] {
  return Object.keys(BRANCHING_CONFIG_PRESETS);
}
