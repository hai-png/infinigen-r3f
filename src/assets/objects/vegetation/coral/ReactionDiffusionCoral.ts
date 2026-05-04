/**
 * ReactionDiffusionCoral.ts — Gray-Scott Reaction-Diffusion Coral Generator
 *
 * Implements the Gray-Scott reaction-diffusion model applied to 3D mesh surfaces
 * for generating coral patterns. Unlike the 2D grid-based GrayScottReactionDiffusion,
 * this operates directly on mesh vertices using edge message-passing (vertex neighbors)
 * for Laplacian computation.
 *
 * Core algorithm:
 *   new_a = a + (diffA * lapA - a*b² + feed*(1-a)) * dt
 *   new_b = b + (diffB * lapB + a*b² - (kill+feed)*b) * dt
 *
 * Ported from: infinigen/terrain/objects/coral/reaction_diffusion.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Preset patterns for the Gray-Scott model on mesh surfaces */
export type ReactionDiffusionCoralPreset = 'brain' | 'honeycomb' | 'fingerprint' | 'maze' | 'spots';

/** Parameters for the ReactionDiffusionCoralGenerator */
export interface ReactionDiffusionCoralParams {
  /** Number of simulation steps (default 80) */
  steps: number;
  /** Time step per simulation iteration (default 1.0) */
  dt: number;
  /** Diffusion rate for chemical A (default 0.16) */
  diffA: number;
  /** Diffusion rate for chemical B (default 0.08) */
  diffB: number;
  /** Feed rate F (default depends on preset) */
  feedRate: number;
  /** Kill rate k (default depends on preset) */
  killRate: number;
  /** Initial perturbation strength for seeding (default 0.05) */
  perturbation: number;
  /** Scale of displacement driven by the B concentration (default 0.3) */
  displacementScale: number;
  /** Random seed (default 42) */
  seed: number;
  /** Base mesh resolution for icosahedron (default 3) */
  baseResolution: number;
  /** Base radius of the icosahedron (default 1.0) */
  baseRadius: number;
}

// ============================================================================
// Presets
// ============================================================================

/**
 * Gray-Scott preset parameters for different coral patterns.
 * The feed2kill helper: k = sqrt(F)/2 - F
 */
export const REACTION_DIFFUSION_CORAL_PRESETS: Record<ReactionDiffusionCoralPreset, {
  feedRate: number;
  killRate: number;
  description: string;
}> = {
  brain: {
    feedRate: 0.055,
    killRate: 0.062,
    description: 'Brain coral meandering pattern — warm browns and creams',
  },
  honeycomb: {
    feedRate: 0.070,
    killRate: 0.060,
    description: 'Honeycomb coral hexagonal pattern',
  },
  fingerprint: {
    feedRate: 0.055,
    killRate: 0.062,
    description: 'Fingerprint-like ridges — same params as brain but different seed topology',
  },
  maze: {
    feedRate: 0.029,
    killRate: 0.057,
    description: 'Maze-like complex labyrinthine pattern',
  },
  spots: {
    feedRate: 0.035,
    killRate: 0.065,
    description: 'Spot pattern resembling polyp structures',
  },
};

/**
 * Helper: compute kill rate from feed rate using the relation k = sqrt(F)/2 - F.
 * This gives a valid (F, k) pair on the Turing pattern boundary.
 */
export function feed2kill(feed: number): number {
  return Math.sqrt(feed) / 2 - feed;
}

// ============================================================================
// ReactionDiffusionCoralGenerator
// ============================================================================

/**
 * ReactionDiffusionCoralGenerator applies the Gray-Scott reaction-diffusion
 * model directly on a 3D mesh surface, using vertex neighbor Laplacian
 * computation (edge message-passing).
 *
 * The resulting B concentration is used as:
 * 1. Vertex colors for surface patterning
 * 2. Vertex displacement along normals for 3D texture
 *
 * Usage:
 *   const gen = new ReactionDiffusionCoralGenerator({ preset: 'brain', seed: 42 });
 *   const geometry = gen.generate();
 */
export class ReactionDiffusionCoralGenerator {
  private params: ReactionDiffusionCoralParams;
  private rng: SeededRandom;

  constructor(params: Partial<ReactionDiffusionCoralParams> & { preset?: ReactionDiffusionCoralPreset } = {}) {
    const { preset, ...rest } = params;

    // Start with defaults
    const baseParams: ReactionDiffusionCoralParams = {
      steps: 80,
      dt: 1.0,
      diffA: 0.16,
      diffB: 0.08,
      feedRate: 0.055,
      killRate: 0.062,
      perturbation: 0.05,
      displacementScale: 0.3,
      seed: 42,
      baseResolution: 3,
      baseRadius: 1.0,
    };

    // Apply preset if given
    if (preset && REACTION_DIFFUSION_CORAL_PRESETS[preset]) {
      const p = REACTION_DIFFUSION_CORAL_PRESETS[preset];
      baseParams.feedRate = p.feedRate;
      baseParams.killRate = p.killRate;
      // Fingerprint uses different seed pattern
      if (preset === 'fingerprint') {
        baseParams.seed = 77;
      }
    }

    // Apply user overrides
    this.params = { ...baseParams, ...rest };
    this.rng = new SeededRandom(this.params.seed);
  }

  /**
   * Generate coral geometry with reaction-diffusion pattern.
   *
   * @returns THREE.BufferGeometry with displaced vertices and color attribute
   */
  generate(): THREE.BufferGeometry {
    const { baseRadius, baseResolution, steps, dt, diffA, diffB, feedRate, killRate, perturbation, displacementScale, seed } = this.params;
    this.rng = new SeededRandom(seed);

    // Step 1: Create base mesh (icosahedron)
    const baseGeo = new THREE.IcosahedronGeometry(baseRadius, baseResolution);
    baseGeo.computeVertexNormals();

    const vertexCount = baseGeo.attributes.position.count;

    // Step 2: Build adjacency (vertex neighbors) via edge message-passing
    const neighbors = this.buildAdjacency(baseGeo);

    // Step 3: Initialize chemical concentrations
    // A starts at 1.0 everywhere, B starts at 0.0 with random seed patches
    const chemA = new Float32Array(vertexCount).fill(1.0);
    const chemB = new Float32Array(vertexCount).fill(0.0);

    // Seed random patches of B
    this.seedInitialB(chemA, chemB, vertexCount, perturbation);

    // Step 4: Run reaction-diffusion simulation
    for (let step = 0; step < steps; step++) {
      this.simulationStep(chemA, chemB, neighbors, diffA, diffB, feedRate, killRate, dt);
    }

    // Step 5: Normalize B for visualization
    let minB = Infinity, maxB = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      if (chemB[i] < minB) minB = chemB[i];
      if (chemB[i] > maxB) maxB = chemB[i];
    }
    const range = maxB - minB;
    const normalizedB = new Float32Array(vertexCount);
    if (range > 0.0001) {
      for (let i = 0; i < vertexCount; i++) {
        normalizedB[i] = (chemB[i] - minB) / range;
      }
    }

    // Step 6: Apply displacement and colors
    const positions = baseGeo.attributes.position;
    const normals = baseGeo.attributes.normal;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const b = normalizedB[i];

      // Displace along normal proportional to B concentration
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);

      const displacement = b * displacementScale;
      positions.setXYZ(i,
        positions.getX(i) + nx * displacement,
        positions.getY(i) + ny * displacement,
        positions.getZ(i) + nz * displacement
      );

      // Coral coloring: warm browns/creams for high B, darker for low
      colors[i * 3] = 0.55 + b * 0.35;       // R
      colors[i * 3 + 1] = 0.35 + b * 0.3;    // G
      colors[i * 3 + 2] = 0.15 + b * 0.2;    // B
    }

    baseGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    baseGeo.computeVertexNormals();

    return baseGeo;
  }

  /**
   * Generate a flat disc base mesh and apply reaction-diffusion.
   * Useful for flat/table coral shapes.
   */
  generateFlatDisc(discRadius: number = 2.0, discSegments: number = 32): THREE.BufferGeometry {
    const { steps, dt, diffA, diffB, feedRate, killRate, perturbation, displacementScale, seed } = this.params;
    this.rng = new SeededRandom(seed);

    // Create disc geometry
    const baseGeo = new THREE.CircleGeometry(discRadius, discSegments);
    baseGeo.computeVertexNormals();

    const vertexCount = baseGeo.attributes.position.count;
    const neighbors = this.buildAdjacency(baseGeo);

    const chemA = new Float32Array(vertexCount).fill(1.0);
    const chemB = new Float32Array(vertexCount).fill(0.0);

    this.seedInitialB(chemA, chemB, vertexCount, perturbation);

    for (let step = 0; step < steps; step++) {
      this.simulationStep(chemA, chemB, neighbors, diffA, diffB, feedRate, killRate, dt);
    }

    // Normalize
    let minB = Infinity, maxB = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      if (chemB[i] < minB) minB = chemB[i];
      if (chemB[i] > maxB) maxB = chemB[i];
    }
    const range = maxB - minB;
    const normalizedB = new Float32Array(vertexCount);
    if (range > 0.0001) {
      for (let i = 0; i < vertexCount; i++) {
        normalizedB[i] = (chemB[i] - minB) / range;
      }
    }

    // Apply displacement (along Y for flat coral)
    const positions = baseGeo.attributes.position;
    const normals = baseGeo.attributes.normal;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const b = normalizedB[i];

      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);

      const displacement = b * displacementScale;
      positions.setXYZ(i,
        positions.getX(i) + nx * displacement,
        positions.getY(i) + ny * displacement,
        positions.getZ(i) + nz * displacement
      );

      colors[i * 3] = 0.55 + b * 0.35;
      colors[i * 3 + 1] = 0.35 + b * 0.3;
      colors[i * 3 + 2] = 0.15 + b * 0.2;
    }

    baseGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    baseGeo.computeVertexNormals();

    return baseGeo;
  }

  // --------------------------------------------------------------------------
  // Adjacency Building
  // --------------------------------------------------------------------------

  /**
   * Build vertex adjacency lists from the geometry's index buffer.
   * This enables edge message-passing for Laplacian computation.
   */
  private buildAdjacency(geometry: THREE.BufferGeometry): number[][] {
    const position = geometry.attributes.position;
    const vertexCount = position.count;
    const adjacency: number[][] = Array.from({ length: vertexCount }, () => []);

    const addEdge = (a: number, b: number) => {
      if (!adjacency[a].includes(b)) adjacency[a].push(b);
      if (!adjacency[b].includes(a)) adjacency[b].push(a);
    };

    if (geometry.index) {
      const idx = geometry.index;
      for (let f = 0; f < idx.count; f += 3) {
        const a = idx.getX(f);
        const b = idx.getX(f + 1);
        const c = idx.getX(f + 2);
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
      }
    } else {
      for (let f = 0; f < vertexCount; f += 3) {
        addEdge(f, f + 1);
        addEdge(f + 1, f + 2);
        addEdge(f + 2, f);
      }
    }

    return adjacency;
  }

  // --------------------------------------------------------------------------
  // Initial B Seeding
  // --------------------------------------------------------------------------

  /**
   * Seed initial B concentration at random patches on the mesh.
   */
  private seedInitialB(chemA: Float32Array, chemB: Float32Array, vertexCount: number, perturbation: number): void {
    const numSeeds = 5 + this.rng.nextInt(2, 8);

    for (let s = 0; s < numSeeds; s++) {
      const centerVertex = this.rng.nextInt(0, vertexCount - 1);
      // Seed a small cluster around the center vertex
      const seedStrength = 0.25 + this.rng.next() * 0.1;

      chemA[centerVertex] = 0.5;
      chemB[centerVertex] = seedStrength;

      // Also seed neighbors with diminishing strength
      // We need adjacency for this, so we use simple proximity instead
      // by perturbing a small fraction of random vertices
    }

    // Add overall noise perturbation
    for (let i = 0; i < vertexCount; i++) {
      if (this.rng.next() < 0.1) {
        chemA[i] = Math.max(0, Math.min(1, chemA[i] - perturbation * this.rng.next()));
        chemB[i] = Math.max(0, Math.min(1, chemB[i] + perturbation * this.rng.next()));
      }
    }
  }

  // --------------------------------------------------------------------------
  // Simulation Step
  // --------------------------------------------------------------------------

  /**
   * Single simulation step using vertex-neighbor Laplacian (edge message-passing).
   *
   * Laplacian for vertex i:
   *   lapA_i = sum(A[neighbor] for neighbor in neighbors(i)) / |neighbors(i)| - A[i]
   *   lapB_i = sum(B[neighbor] for neighbor in neighbors(i)) / |neighbors(i)| - B[i]
   *
   * Update:
   *   new_A = A + (diffA * lapA - A*B² + feed*(1-A)) * dt
   *   new_B = B + (diffB * lapB + A*B² - (kill+feed)*B) * dt
   */
  private simulationStep(
    chemA: Float32Array,
    chemB: Float32Array,
    neighbors: number[][],
    diffA: number,
    diffB: number,
    feed: number,
    kill: number,
    dt: number
  ): void {
    const vertexCount = chemA.length;
    const newA = new Float32Array(vertexCount);
    const newB = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const nbrs = neighbors[i];
      const nbrCount = nbrs.length;

      // Compute Laplacian via neighbor averaging
      let sumA = 0;
      let sumB = 0;
      for (let n = 0; n < nbrCount; n++) {
        sumA += chemA[nbrs[n]];
        sumB += chemB[nbrs[n]];
      }

      const lapA = nbrCount > 0 ? (sumA / nbrCount - chemA[i]) : 0;
      const lapB = nbrCount > 0 ? (sumB / nbrCount - chemB[i]) : 0;

      const abb = chemA[i] * chemB[i] * chemB[i];

      newA[i] = chemA[i] + (diffA * lapA - abb + feed * (1.0 - chemA[i])) * dt;
      newB[i] = chemB[i] + (diffB * lapB + abb - (kill + feed) * chemB[i]) * dt;

      // Clamp to prevent numerical instability
      newA[i] = Math.max(0, Math.min(1, newA[i]));
      newB[i] = Math.max(0, Math.min(1, newB[i]));
    }

    // Copy results back
    chemA.set(newA);
    chemB.set(newB);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a reaction-diffusion coral geometry.
 */
export function generateReactionDiffusionCoral(
  preset: ReactionDiffusionCoralPreset = 'brain',
  seed: number = 42
): THREE.BufferGeometry {
  const gen = new ReactionDiffusionCoralGenerator({ preset, seed });
  return gen.generate();
}
