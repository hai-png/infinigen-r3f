/**
 * LSystemTreeGenerator - Thin adapter over LSystemEngine for BaseObjectGenerator compatibility
 *
 * This class extends BaseObjectGenerator<LSystemConfig> and delegates all
 * L-system computation (string derivation, turtle interpretation) to the
 * canonical LSystemEngine. It handles geometry construction and leaf
 * placement using the engine's output.
 *
 * Previously contained a duplicate L-system implementation; now all
 * algorithmic work is done by LSystemEngine.
 *
 * Ported from: infinigen/terrain/objects/tree/lsystem.py
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';
import { LeafCluster, LeafType, ClusterConfig } from './LeafGeometry';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';
import {
  LSystemEngine,
  LSystemPresets,
  type LSystemPreset,
  type LSystemProductionRule,
  type LSystemOutput,
  type BranchSegment,
} from './LSystemEngine';

// ============================================================================
// Interfaces
// ============================================================================

export interface LSystemRule {
  /** Single-character predecessor symbol (e.g., 'F') */
  predecessor: string;
  /** Replacement string (e.g., 'FF+[+F-F-F]-[-F+F+F]') */
  successor: string;
  /** Probability of applying this rule (0-1, for stochastic L-systems) */
  probability: number;
}

export interface LSystemConfig extends BaseGeneratorConfig {
  /** The initial axiom string */
  axiom: string;
  /** Production rules */
  rules: LSystemRule[];
  /** Number of derivation iterations */
  iterations: number;
  /** Branch angle in radians */
  angle: number;
  /** Initial segment length */
  length: number;
  /** Segment length multiplier per iteration */
  lengthDecay: number;
  /** Initial trunk thickness (radius) */
  thickness: number;
  /** Thickness multiplier per branching level */
  thicknessDecay: number;
  /** Random seed for stochastic rule application */
  seed: number;
  /** Leaf type used for terminal branch foliage */
  leafType: LeafType;
}

// Re-export engine types for backward compatibility
export type TurtleState = import('./LSystemEngine').TurtleState;
export { type BranchSegment };

// ============================================================================
// LSystemTreeGenerator
// ============================================================================

export class LSystemTreeGenerator extends BaseObjectGenerator<LSystemConfig> {
  private engine: LSystemEngine;

  constructor(seed: number = 42) {
    super();
    this.engine = new LSystemEngine(seed);
  }

  getDefaultConfig(): LSystemConfig {
    return {
      axiom: 'F',
      rules: [{ predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 1.0 }],
      iterations: 4,
      angle: 25 * (Math.PI / 180),
      length: 2.0,
      lengthDecay: 0.7,
      thickness: 0.3,
      thicknessDecay: 0.65,
      seed: 42,
      leafType: 'broad',
    };
  }

  generate(config: Partial<LSystemConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(fullConfig.seed);
    const group = new THREE.Group();

    // Delegate to LSystemEngine
    const output = this.runEngine(fullConfig);

    // Build branch geometry from engine output
    const trunkGroup = this.buildBranchGeometry(output.segments, fullConfig);
    group.add(trunkGroup);

    // Add leaves at terminal branches
    const leavesGroup = this.buildLeaves(output.segments, fullConfig, rng);
    group.add(leavesGroup);

    group.userData.tags = ['vegetation', 'tree', 'lsystem'];
    return group;
  }

  // ------------------------------------------------------------------
  // Engine delegation
  // ------------------------------------------------------------------

  /**
   * Convert LSystemConfig to LSystemPreset and delegate to LSystemEngine.
   */
  private runEngine(config: LSystemConfig): LSystemOutput {
    const preset: LSystemPreset = {
      name: 'custom',
      description: 'Adapter-generated preset',
      axiom: config.axiom,
      rules: config.rules.map(r => ({
        predecessor: r.predecessor,
        successor: r.successor,
        probability: r.probability,
      } as LSystemProductionRule)),
      iterations: config.iterations,
      angle: config.angle,
      length: config.length,
      lengthDecay: config.lengthDecay,
      thickness: config.thickness,
      thicknessDecay: config.thicknessDecay,
      deterministic: config.rules.every(r => r.probability >= 1.0),
    };

    this.engine = new LSystemEngine(config.seed);
    return this.engine.generate(preset, config.seed);
  }

  // ------------------------------------------------------------------
  // Branch geometry construction
  // ------------------------------------------------------------------

  private buildBranchGeometry(
    segments: BranchSegment[],
    config: LSystemConfig
  ): THREE.Group {
    const group = new THREE.Group();

    const barkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
      metalness: 0.0,
    });

    const geometries: THREE.BufferGeometry[] = [];

    for (const seg of segments) {
      const geom = this.createBranchCylinder(
        seg.start,
        seg.end,
        Math.max(seg.startThickness, 0.01),
        Math.max(seg.endThickness, 0.005)
      );
      geometries.push(geom);
    }

    if (geometries.length > 0) {
      const merged = GeometryPipeline.mergeGeometries(geometries);
      const mesh = new THREE.Mesh(merged, barkMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }

  private createBranchCylinder(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radiusTop: number,
    radiusBottom: number
  ): THREE.BufferGeometry {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.001) {
      return new THREE.CylinderGeometry(0.01, 0.01, 0.001, 4);
    }

    const segments = Math.max(4, Math.min(8, Math.ceil(radiusBottom * 20)));
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments);

    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
    geometry.applyQuaternion(quaternion);

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    geometry.translate(midpoint.x, midpoint.y, midpoint.z);

    return geometry;
  }

  // ------------------------------------------------------------------
  // Leaf construction
  // ------------------------------------------------------------------

  private buildLeaves(
    segments: BranchSegment[],
    config: LSystemConfig,
    rng: SeededRandom
  ): THREE.Group {
    const group = new THREE.Group();

    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a1d,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const leafGeometries: THREE.BufferGeometry[] = [];
    const terminalSegments = segments.filter(s => s.isTerminal);

    for (const seg of terminalSegments) {
      const clusterRadius = Math.max(seg.endThickness * 3, 0.15);
      const leafCount = rng.nextInt(3, 6);
      const clusterSeed = rng.nextInt(0, 100000);

      const clusterConfig: Partial<ClusterConfig> = {
        radius: clusterRadius,
        density: 1.0,
        seed: clusterSeed,
        orientationBias: 'outward',
      };

      const clusterGeometry = LeafCluster.createMergedCluster(
        config.leafType,
        leafCount,
        clusterConfig
      );

      clusterGeometry.translate(seg.end.x, seg.end.y, seg.end.z);
      leafGeometries.push(clusterGeometry);
    }

    if (leafGeometries.length > 0) {
      const merged = GeometryPipeline.mergeGeometries(leafGeometries);
      const mesh = new THREE.Mesh(merged, leafMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }
}

// ============================================================================
// Tree Species Presets
//
// @deprecated These presets are maintained for backward compatibility.
// New code should use SpeciesRegistry (from ../SpeciesRegistry) as the
// single source of truth for species data. Use lsystemTreePresetFromRegistry()
// to convert a SpeciesEntry into an LSystemConfig.
// ============================================================================

import { getSpeciesRegistry, type SpeciesEntry } from '../SpeciesRegistry';

function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * @deprecated Use SpeciesRegistry instead. This object is kept for backward compat.
 */
export const LSystemTreePresets: Record<string, LSystemConfig> = {
  /** Oak: broad, spreading canopy with lobed oak leaves */
  oak: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 1.0 },
    ],
    iterations: 4,
    angle: degToRad(25),
    length: 2.0,
    lengthDecay: 0.7,
    thickness: 0.35,
    thicknessDecay: 0.65,
    seed: 42,
    leafType: 'oak',
  },

  /** Pine: conical shape with layered branches and needle leaves */
  pine: {
    axiom: 'FF',
    rules: [
      { predecessor: 'F', successor: 'FF-[-F+F+F]+[+F-F-F]', probability: 1.0 },
    ],
    iterations: 3,
    angle: degToRad(22.5),
    length: 1.8,
    lengthDecay: 0.75,
    thickness: 0.25,
    thicknessDecay: 0.6,
    seed: 42,
    leafType: 'needle',
  },

  /** Birch: slender, multiple thin branches with small birch leaves */
  birch: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 1.0 },
    ],
    iterations: 4,
    angle: degToRad(25.7),
    length: 1.5,
    lengthDecay: 0.65,
    thickness: 0.2,
    thicknessDecay: 0.6,
    seed: 42,
    leafType: 'birch',
  },

  /** Willow: drooping branches with long narrow willow leaves */
  willow: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 0.7 },
      { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 0.3 },
    ],
    iterations: 4,
    angle: degToRad(30),
    length: 1.8,
    lengthDecay: 0.68,
    thickness: 0.3,
    thicknessDecay: 0.62,
    seed: 42,
    leafType: 'willow',
  },

  /** Palm: tall trunk with fan-shaped palm leaves at top */
  palm: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 5,
    angle: degToRad(25),
    length: 1.5,
    lengthDecay: 0.95,
    thickness: 0.3,
    thicknessDecay: 0.9,
    seed: 42,
    leafType: 'palm',
  },
};

/**
 * Convenience function: generate a tree from a preset name.
 */
export function generateTreeFromPreset(
  presetName: string,
  seed: number = 42,
  overrides: Partial<LSystemConfig> = {}
): THREE.Group {
  const preset = LSystemTreePresets[presetName];
  if (!preset) {
    throw new Error(`Unknown L-system tree preset: ${presetName}. Available: ${Object.keys(LSystemTreePresets).join(', ')}`);
  }

  const generator = new LSystemTreeGenerator(seed);
  const config = { ...preset, seed, ...overrides };

  if (presetName === 'palm') {
    return generatePalmTree(generator, config);
  }

  return generator.generate(config);
}

/**
 * Bridge function: convert a SpeciesRegistry entry to an LSystemConfig.
 * This allows generators to query SpeciesRegistry and produce the format
 * LSystemTreeGenerator expects, without duplicating preset data.
 *
 * @param speciesName - Name of the species in the registry
 * @param overrides  - Optional overrides for the resulting config
 * @returns An LSystemConfig, or null if the species is not in the registry
 */
export function lsystemTreePresetFromRegistry(
  speciesName: string,
  overrides: Partial<LSystemConfig> = {}
): LSystemConfig | null {
  const registry = getSpeciesRegistry();
  const entry = registry.get(speciesName);
  if (!entry || !entry.lsystem) return null;

  const ls = entry.lsystem;
  const config: LSystemConfig = {
    axiom: (ls.axiom as string) ?? 'F',
    rules: ((ls.rules as Array<{ predecessor: string; successor: string; probability: number }>) ?? [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 1.0 },
    ]).map(r => ({
      predecessor: r.predecessor,
      successor: r.successor,
      probability: r.probability,
    })),
    iterations: (ls.iterations as number) ?? 4,
    angle: (ls.angle as number) ?? 25 * (Math.PI / 180),
    length: (ls.length as number) ?? 2.0,
    lengthDecay: (ls.lengthDecay as number) ?? 0.7,
    thickness: (ls.thickness as number) ?? 0.3,
    thicknessDecay: (ls.thicknessDecay as number) ?? 0.65,
    seed: overrides.seed ?? 42,
    leafType: (overrides.leafType ?? 'broad') as LeafType,
    ...overrides,
  };

  return config;
}

/**
 * Palm-specific generation: tall trunk with radiating frond canopy at the top.
 */
function generatePalmTree(
  generator: LSystemTreeGenerator,
  config: LSystemConfig
): THREE.Group {
  const group = generator.generate(config);

  const rng = new SeededRandom(config.seed + 1000);
  const frondGroup = new THREE.Group();

  const trunkHeight = config.length * Math.pow(2, config.iterations) * 0.5;

  const frondCount = rng.nextInt(8, 14);
  const frondMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d8a2f,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const palmClusterConfig: Partial<ClusterConfig> = {
    radius: 1.5,
    density: 1.0,
    seed: config.seed + 2000,
    orientationBias: 'outward',
  };

  const clusterGeometry = LeafCluster.createMergedCluster(
    'palm',
    frondCount,
    palmClusterConfig
  );

  clusterGeometry.translate(0, trunkHeight, 0);

  const frondMesh = new THREE.Mesh(clusterGeometry, frondMaterial);
  frondMesh.castShadow = true;
  frondMesh.receiveShadow = true;
  frondGroup.add(frondMesh);

  group.add(frondGroup);
  group.userData.tags = ['vegetation', 'tree', 'lsystem', 'palm'];

  return group;
}
