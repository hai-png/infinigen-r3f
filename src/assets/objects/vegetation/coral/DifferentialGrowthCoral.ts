/**
 * DifferentialGrowthCoral.ts — Differential Growth Coral Generator
 *
 * Implements polygon-based differential growth for coral generation.
 * Starts with a base n-gon and iteratively grows vertices outward
 * with noise and repulsion from neighbors, producing organic coral surfaces.
 *
 * Two variants:
 *   - leather_coral: upward growth vector (vertical fan/plate shapes)
 *   - flat_coral: lateral growth vector (spreading table/shelf shapes)
 *
 * Ported from: infinigen/terrain/objects/coral/diff_growth.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { SeededNoiseGenerator } from '@/core/util/math/noise';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Coral growth variant */
export type DifferentialGrowthCoralVariant = 'leather_coral' | 'flat_coral';

/** Parameters for differential growth coral */
export interface DifferentialGrowthCoralParams {
  /** Maximum number of polygons before stopping (default 3000) */
  maxPolygons: number;
  /** Noise factor applied to face growth direction (default 0.3) */
  facNoise: number;
  /** Time step for growth simulation (default 0.05) */
  dt: number;
  /** Overall growth scale multiplier (default 1.0) */
  growthScale: number;
  /** Growth direction vector (default depends on variant) */
  growthVec: THREE.Vector3;
  /** Radius within which vertices repel each other (default 0.15) */
  repulsionRadius: number;
  /** Strength of repulsion force (default 0.5) */
  repulsionStrength: number;
  /** Distance threshold for edge splitting (default 0.2) */
  splitDistance: number;
  /** Random seed (default 42) */
  seed: number;
  /** Number of initial polygon sides (default 6) */
  baseSides: number;
  /** Base polygon radius (default 0.3) */
  baseRadius: number;
  /** Variant type (default 'leather_coral') */
  variant: DifferentialGrowthCoralVariant;
}

// ============================================================================
// Default Parameters by Variant
// ============================================================================

const VARIANT_DEFAULTS: Record<DifferentialGrowthCoralVariant, Partial<DifferentialGrowthCoralParams>> = {
  leather_coral: {
    growthVec: new THREE.Vector3(0, 1, 0),
    growthScale: 1.0,
    maxPolygons: 3000,
    facNoise: 0.3,
    repulsionRadius: 0.15,
    splitDistance: 0.2,
  },
  flat_coral: {
    growthVec: new THREE.Vector3(1, 0.1, 1).normalize(),
    growthScale: 1.5,
    maxPolygons: 2500,
    facNoise: 0.25,
    repulsionRadius: 0.18,
    splitDistance: 0.25,
  },
};

// ============================================================================
// Internal: Dynamic Mesh Structure
// ============================================================================

interface GrowthVertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  neighbors: Set<number>;
  age: number;
}

interface GrowthFace {
  vertices: [number, number, number]; // vertex indices
}

/**
 * Lightweight dynamic mesh for differential growth.
 * Supports vertex insertion, edge splitting, and neighbor tracking.
 */
class GrowthMesh {
  vertices: GrowthVertex[] = [];
  faces: GrowthFace[] = [];

  addVertex(pos: THREE.Vector3, normal: THREE.Vector3 = new THREE.Vector3(0, 1, 0)): number {
    const idx = this.vertices.length;
    this.vertices.push({
      position: pos.clone(),
      normal: normal.clone(),
      neighbors: new Set(),
      age: 0,
    });
    return idx;
  }

  addFace(a: number, b: number, c: number): void {
    this.faces.push({ vertices: [a, b, c] });
    this.vertices[a].neighbors.add(b);
    this.vertices[a].neighbors.add(c);
    this.vertices[b].neighbors.add(a);
    this.vertices[b].neighbors.add(c);
    this.vertices[c].neighbors.add(a);
    this.vertices[c].neighbors.add(b);
  }

  getPolygonCount(): number {
    return this.faces.length;
  }

  getVertexCount(): number {
    return this.vertices.length;
  }

  /**
   * Split an edge by inserting a new vertex at the midpoint.
   * Returns the index of the new vertex, or -1 if edge not found.
   */
  splitEdge(a: number, b: number, midNormal: THREE.Vector3): number {
    const midPos = new THREE.Vector3().addVectors(
      this.vertices[a].position,
      this.vertices[b].position
    ).multiplyScalar(0.5);

    const newIdx = this.addVertex(midPos, midNormal);

    // Update neighbor sets
    this.vertices[a].neighbors.delete(b);
    this.vertices[a].neighbors.add(newIdx);
    this.vertices[b].neighbors.delete(a);
    this.vertices[b].neighbors.add(newIdx);
    this.vertices[newIdx].neighbors.add(a);
    this.vertices[newIdx].neighbors.add(b);

    // Find faces containing this edge and split them
    const facesToSplit: number[] = [];
    for (let fi = 0; fi < this.faces.length; fi++) {
      const f = this.faces[fi].vertices;
      if ((f[0] === a && f[1] === b) || (f[1] === a && f[2] === b) ||
          (f[2] === a && f[0] === b) || (f[0] === b && f[1] === a) ||
          (f[1] === b && f[2] === a) || (f[2] === b && f[0] === a)) {
        facesToSplit.push(fi);
      }
    }

    // Replace split faces with subdivided ones
    for (const fi of facesToSplit) {
      const f = this.faces[fi].vertices;
      let opp = -1;
      if (f[0] !== a && f[0] !== b) opp = f[0];
      else if (f[1] !== a && f[1] !== b) opp = f[1];
      else opp = f[2];

      if (opp >= 0) {
        // Replace this face with two new faces
        this.faces[fi] = { vertices: [a, newIdx, opp] };
        this.addFace(newIdx, b, opp);

        // Update neighbor sets for the opposite vertex
        this.vertices[newIdx].neighbors.add(opp);
        this.vertices[opp].neighbors.add(newIdx);
      }
    }

    return newIdx;
  }

  /**
   * Recompute vertex normals from face geometry.
   */
  computeNormals(): void {
    // Reset normals
    for (const v of this.vertices) {
      v.normal.set(0, 0, 0);
    }

    // Accumulate face normals
    for (const face of this.faces) {
      const [a, b, c] = face.vertices;
      const va = this.vertices[a].position;
      const vb = this.vertices[b].position;
      const vc = this.vertices[c].position;

      const edge1 = new THREE.Vector3().subVectors(vb, va);
      const edge2 = new THREE.Vector3().subVectors(vc, va);
      const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2);

      this.vertices[a].normal.add(faceNormal);
      this.vertices[b].normal.add(faceNormal);
      this.vertices[c].normal.add(faceNormal);
    }

    // Normalize
    for (const v of this.vertices) {
      if (v.normal.lengthSq() > 0.0001) {
        v.normal.normalize();
      } else {
        v.normal.set(0, 1, 0);
      }
    }
  }

  /**
   * Convert to THREE.BufferGeometry.
   */
  toBufferGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];

    // Compute bounding box for UV mapping
    let minY = Infinity, maxY = -Infinity;
    for (const v of this.vertices) {
      if (v.position.y < minY) minY = v.position.y;
      if (v.position.y > maxY) maxY = v.position.y;
    }
    const yRange = Math.max(maxY - minY, 0.001);

    for (const face of this.faces) {
      for (const vi of face.vertices) {
        const v = this.vertices[vi];
        positions.push(v.position.x, v.position.y, v.position.z);
        normals.push(v.normal.x, v.normal.y, v.normal.z);

        // Color: warm coral tones based on age and height
        const heightRatio = (v.position.y - minY) / yRange;
        const ageFactor = Math.min(v.age / 50, 1.0);
        colors.push(
          0.5 + heightRatio * 0.3 + ageFactor * 0.1,
          0.3 + heightRatio * 0.2 + ageFactor * 0.1,
          0.15 + heightRatio * 0.15
        );

        // Simple UV from position
        uvs.push(
          (v.position.x / 3 + 0.5),
          (v.position.z / 3 + 0.5)
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    return geometry;
  }
}

// ============================================================================
// DifferentialGrowthCoralGenerator
// ============================================================================

/**
 * DifferentialGrowthCoralGenerator creates organic coral meshes through
 * iterative vertex growth with noise perturbation and neighbor repulsion.
 *
 * The algorithm:
 *   1. Start with a base n-gon polygon
 *   2. Each iteration:
 *      a. Move vertices outward along their normal + noise + growth direction
 *      b. Apply repulsion between nearby vertices
 *      c. Split edges that exceed the split distance
 *      d. Recompute normals
 *   3. Stop when maxPolygons is reached
 *
 * Usage:
 *   const gen = new DifferentialGrowthCoralGenerator({ variant: 'leather_coral', seed: 42 });
 *   const geometry = gen.generate();
 */
export class DifferentialGrowthCoralGenerator {
  private params: DifferentialGrowthCoralParams;
  private rng: SeededRandom;
  private noise: SeededNoiseGenerator;

  constructor(params: Partial<DifferentialGrowthCoralParams> = {}) {
    const variant = params.variant ?? 'leather_coral';
    const variantDefaults = VARIANT_DEFAULTS[variant];

    this.params = {
      maxPolygons: 3000,
      facNoise: 0.3,
      dt: 0.05,
      growthScale: 1.0,
      growthVec: new THREE.Vector3(0, 1, 0),
      repulsionRadius: 0.15,
      repulsionStrength: 0.5,
      splitDistance: 0.2,
      seed: 42,
      baseSides: 6,
      baseRadius: 0.3,
      variant,
      ...variantDefaults,
      ...params,
    };

    this.rng = new SeededRandom(this.params.seed);
    this.noise = new SeededNoiseGenerator(this.params.seed);
  }

  /**
   * Generate the coral mesh geometry.
   *
   * @returns THREE.BufferGeometry with coral surface
   */
  generate(): THREE.BufferGeometry {
    const { seed, maxPolygons, dt, growthScale, growthVec, repulsionRadius,
            repulsionStrength, splitDistance, facNoise, baseSides, baseRadius } = this.params;

    this.rng = new SeededRandom(seed);
    this.noise = new SeededNoiseGenerator(seed);

    // Step 1: Create base polygon mesh
    const mesh = this.createBaseNGon(baseSides, baseRadius);

    // Step 2: Iterative growth
    let iteration = 0;
    const maxIterations = 500;

    while (mesh.getPolygonCount() < maxPolygons && iteration < maxIterations) {
      iteration++;

      // a. Grow vertices outward
      this.applyGrowth(mesh, dt, growthScale, growthVec, facNoise, iteration);

      // b. Apply repulsion
      this.applyRepulsion(mesh, repulsionRadius, repulsionStrength);

      // c. Split long edges
      const addedSplits = this.splitLongEdges(mesh, splitDistance);

      // d. Recompute normals
      mesh.computeNormals();

      // Age all vertices
      for (const v of mesh.vertices) {
        v.age++;
      }

      // Safety: prevent runaway
      if (mesh.getVertexCount() > 15000) break;
    }

    return mesh.toBufferGeometry();
  }

  // --------------------------------------------------------------------------
  // Base Polygon Creation
  // --------------------------------------------------------------------------

  /**
   * Create a base n-gon mesh with a central vertex and triangulated faces.
   */
  private createBaseNGon(sides: number, radius: number): GrowthMesh {
    const mesh = new GrowthMesh();

    // Central vertex
    const centerIdx = mesh.addVertex(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0)
    );

    // Ring vertices
    const ringIndices: number[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const idx = mesh.addVertex(
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(0, 1, 0)
      );
      ringIndices.push(idx);
    }

    // Top cap vertices (slightly above)
    const topCenterIdx = mesh.addVertex(
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 1, 0)
    );
    const topRingIndices: number[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius * 0.9;
      const z = Math.sin(angle) * radius * 0.9;
      const idx = mesh.addVertex(
        new THREE.Vector3(x, 0.05, z),
        new THREE.Vector3(0, 1, 0)
      );
      topRingIndices.push(idx);
    }

    // Bottom face triangles
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      mesh.addFace(centerIdx, ringIndices[i], ringIndices[next]);
    }

    // Top face triangles
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      mesh.addFace(topCenterIdx, topRingIndices[next], topRingIndices[i]);
    }

    // Side faces (connecting bottom ring to top ring)
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      mesh.addFace(ringIndices[i], topRingIndices[i], topRingIndices[next]);
      mesh.addFace(ringIndices[i], topRingIndices[next], ringIndices[next]);
    }

    return mesh;
  }

  // --------------------------------------------------------------------------
  // Growth
  // --------------------------------------------------------------------------

  /**
   * Move vertices outward with noise perturbation.
   */
  private applyGrowth(
    mesh: GrowthMesh,
    dt: number,
    growthScale: number,
    growthVec: THREE.Vector3,
    facNoise: number,
    iteration: number
  ): void {
    for (let i = 0; i < mesh.vertices.length; i++) {
      const v = mesh.vertices[i];

      // Growth direction: combination of vertex normal + growth vector
      const growthDirection = v.normal.clone().add(
        growthVec.clone().multiplyScalar(0.3)
      ).normalize();

      // Add noise-based perturbation
      const nx = this.noise.perlin3D(
        v.position.x * 3.0 + iteration * 0.05,
        v.position.y * 3.0,
        v.position.z * 3.0
      );
      const ny = this.noise.perlin3D(
        v.position.x * 3.0,
        v.position.y * 3.0 + iteration * 0.05,
        v.position.z * 3.0 + 100
      );
      const nz = this.noise.perlin3D(
        v.position.x * 3.0 + 100,
        v.position.y * 3.0,
        v.position.z * 3.0 + iteration * 0.05
      );

      const noiseVec = new THREE.Vector3(nx, ny, nz).multiplyScalar(facNoise);

      // Distance from center affects growth rate
      const dist = v.position.length();
      const distFactor = 1.0 + dist * 0.3;

      // Apply growth
      const growthAmount = dt * growthScale * distFactor;
      v.position.add(growthDirection.multiplyScalar(growthAmount));
      v.position.add(noiseVec.multiplyScalar(dt * 0.5));
    }
  }

  // --------------------------------------------------------------------------
  // Repulsion
  // --------------------------------------------------------------------------

  /**
   * Apply repulsion force between nearby vertices to prevent overlap.
   */
  private applyRepulsion(
    mesh: GrowthMesh,
    radius: number,
    strength: number
  ): void {
    const displacements: THREE.Vector3[] = mesh.vertices.map(() => new THREE.Vector3());
    const radiusSq = radius * radius;

    // Simple O(n²) repulsion — acceptable for the vertex counts we handle
    for (let i = 0; i < mesh.vertices.length; i++) {
      for (let j = i + 1; j < mesh.vertices.length; j++) {
        const diff = new THREE.Vector3().subVectors(
          mesh.vertices[i].position,
          mesh.vertices[j].position
        );
        const distSq = diff.lengthSq();

        if (distSq < radiusSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const force = strength * (1.0 - dist / radius);
          const direction = diff.normalize();

          displacements[i].add(direction.clone().multiplyScalar(force * 0.5));
          displacements[j].sub(direction.clone().multiplyScalar(force * 0.5));
        }
      }
    }

    // Apply accumulated displacements
    for (let i = 0; i < mesh.vertices.length; i++) {
      mesh.vertices[i].position.add(displacements[i]);
    }
  }

  // --------------------------------------------------------------------------
  // Edge Splitting
  // --------------------------------------------------------------------------

  /**
   * Split edges that exceed the split distance, adding new vertices at midpoints.
   */
  private splitLongEdges(mesh: GrowthMesh, splitDist: number): number {
    const edgesToSplit: [number, number][] = [];
    const processed = new Set<string>();

    // Find long edges from face data
    for (const face of mesh.faces) {
      const pairs: [number, number][] = [
        [face.vertices[0], face.vertices[1]],
        [face.vertices[1], face.vertices[2]],
        [face.vertices[2], face.vertices[0]],
      ];

      for (const [a, b] of pairs) {
        const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
        if (processed.has(key)) continue;
        processed.add(key);

        const dist = mesh.vertices[a].position.distanceTo(mesh.vertices[b].position);
        if (dist > splitDist) {
          edgesToSplit.push([a, b]);
        }
      }
    }

    // Limit splits per iteration to prevent explosion
    const maxSplits = Math.max(1, Math.floor(mesh.vertices.length * 0.05));
    const splitsToProcess = edgesToSplit.slice(0, maxSplits);

    for (const [a, b] of splitsToProcess) {
      const midNormal = new THREE.Vector3().addVectors(
        mesh.vertices[a].normal,
        mesh.vertices[b].normal
      ).normalize();

      mesh.splitEdge(a, b, midNormal);
    }

    return splitsToProcess.length;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a differential growth coral geometry.
 */
export function generateDifferentialGrowthCoral(
  variant: DifferentialGrowthCoralVariant = 'leather_coral',
  seed: number = 42
): THREE.BufferGeometry {
  const gen = new DifferentialGrowthCoralGenerator({ variant, seed });
  return gen.generate();
}
