/**
 * BranchSkinner.ts — P4.3: Branch Skinning and Leaf Placement
 *
 * Converts a TreeSkeleton (vertex/edge representation from SpaceColonization)
 * into a renderable THREE.js BufferGeometry with radius-varying cross-sections
 * and procedural bark texture. Also places leaf instances at branch tips
 * and along outer branches, supporting multiple leaf types.
 *
 * The skinning algorithm creates smooth branches by:
 *   1. For each edge, creating a tapered cylinder with radial segments
 *   2. Merging all cylinders into a single BufferGeometry
 *   3. Applying noise-based bark displacement
 *   4. Generating leaf instances at terminal and near-terminal vertices
 *
 * Ported from: infinigen/terrain/objects/tree/skinning.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededFbm } from '@/core/util/MathUtils';
import type { TreeSkeleton, TreeVertex, TreeEdge } from './SpaceColonization';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported leaf types for branch skinning.
 * Extends the existing LeafType from LeafGeometry with additional types
 * needed by the genome-driven system.
 */
export type LeafType =
  | 'broadleaf'
  | 'maple'
  | 'ginkgo'
  | 'pine_needle'
  | 'palm_frond'
  | 'oak'
  | 'willow'
  | 'birch';

/**
 * Configuration for branch skinning.
 */
export interface BranchSkinningConfig {
  /** Number of radial segments per branch cross-section (default 8) */
  radialSegments: number;
  /** Bark color as a hex number (default 0x4a3728) */
  barkColor: number;
  /** Bark roughness for PBR material (default 0.9) */
  barkRoughness: number;
  /** Bark noise frequency for procedural displacement (default 5.0) */
  barkNoiseFrequency: number;
  /** Bark noise amplitude for displacement (default 0.05) */
  barkNoiseAmplitude: number;
  /** Random seed for bark texture (default 42) */
  barkSeed: number;
  /** Minimum branch radius (default 0.01) */
  minRadius: number;
  /** Whether to apply bark displacement (default true) */
  applyBarkDisplacement: boolean;
  /** Leaf type to place at branch tips (default 'broadleaf') */
  leafType: LeafType;
  /** Leaf size scale factor (default 1.0) */
  leafScale: number;
  /** Leaf color as a hex number (default 0x2d5a1d) */
  leafColor: number;
  /** Whether to place leaves (default true) */
  placeLeaves: boolean;
  /** Number of leaves per terminal vertex (default 5) */
  leavesPerTip: number;
  /** Also place leaves along non-terminal outer branches (default true) */
  placeLeavesAlongBranches: boolean;
  /** Generation threshold for branch leaf placement: leaves on gen >= this (default 2) */
  leafGenerationThreshold: number;
  /** Random seed for leaf placement (default 42) */
  leafSeed: number;
  /** Double-sided leaf material (default true) */
  leafDoubleSided: boolean;
}

/**
 * The result of skinning a tree skeleton.
 */
export interface SkinnedTreeResult {
  /** Merged branch geometry */
  branchGeometry: THREE.BufferGeometry;
  /** Bark material */
  barkMaterial: THREE.MeshStandardMaterial;
  /** Merged leaf geometry (empty if no leaves) */
  leafGeometry: THREE.BufferGeometry;
  /** Leaf material */
  leafMaterial: THREE.MeshStandardMaterial;
  /** World-space positions of leaf placement points */
  leafPositions: THREE.Vector3[];
  /** Bounding box of the entire tree */
  boundingBox: THREE.Box3;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_BRANCH_SKINNING_CONFIG: BranchSkinningConfig = {
  radialSegments: 8,
  barkColor: 0x4a3728,
  barkRoughness: 0.9,
  barkNoiseFrequency: 5.0,
  barkNoiseAmplitude: 0.05,
  barkSeed: 42,
  minRadius: 0.01,
  applyBarkDisplacement: true,
  leafType: 'broadleaf',
  leafScale: 1.0,
  leafColor: 0x2d5a1d,
  placeLeaves: true,
  leavesPerTip: 5,
  placeLeavesAlongBranches: true,
  leafGenerationThreshold: 2,
  leafSeed: 42,
  leafDoubleSided: true,
};

// ============================================================================
// BranchSkinner
// ============================================================================

/**
 * BranchSkinner converts a TreeSkeleton into renderable THREE.js geometry.
 *
 * Usage:
 *   const result = BranchSkinner.skinSkeleton(skeleton, config);
 *   const branchMesh = new THREE.Mesh(result.branchGeometry, result.barkMaterial);
 *   const leafMesh = new THREE.Mesh(result.leafGeometry, result.leafMaterial);
 */
export class BranchSkinner {
  /**
   * Skin a tree skeleton into branch and leaf geometry.
   *
   * @param skeleton The tree skeleton from SpaceColonization
   * @param config Skinning configuration
   * @returns SkinnedTreeResult with geometry and materials
   */
  static skinSkeleton(
    skeleton: TreeSkeleton,
    config: Partial<BranchSkinningConfig> = {}
  ): SkinnedTreeResult {
    const cfg: BranchSkinningConfig = { ...DEFAULT_BRANCH_SKINNING_CONFIG, ...config };
    const rng = new SeededRandom(cfg.barkSeed);

    // Build branch geometry
    const branchGeometries: THREE.BufferGeometry[] = [];
    for (const edge of skeleton.edges) {
      const parentVertex = skeleton.vertices[edge.parent];
      const childVertex = skeleton.vertices[edge.child];
      const branchGeo = BranchSkinner.createBranchSegment(
        parentVertex,
        childVertex,
        cfg.radialSegments,
        cfg.minRadius,
        rng
      );
      branchGeometries.push(branchGeo);
    }

    // Merge all branch segments
    const branchGeometry = branchGeometries.length > 0
      ? BranchSkinner.mergeGeometries(branchGeometries)
      : new THREE.BufferGeometry();

    // Apply bark displacement
    if (cfg.applyBarkDisplacement && branchGeometry.attributes.position) {
      BranchSkinner.applyBarkDisplacement(
        branchGeometry,
        cfg.barkNoiseFrequency,
        cfg.barkNoiseAmplitude,
        cfg.barkSeed
      );
    }

    // Create bark material
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: cfg.barkColor,
      roughness: cfg.barkRoughness,
      metalness: 0.0,
    });

    // Build leaf geometry
    const leafPositions: THREE.Vector3[] = [];
    let leafGeometry = new THREE.BufferGeometry();
    let leafMaterial = new THREE.MeshStandardMaterial();

    if (cfg.placeLeaves) {
      const leafRng = new SeededRandom(cfg.leafSeed);
      const leafGeometries: THREE.BufferGeometry[] = [];

      // Place leaves at terminal vertices
      for (const idx of skeleton.terminalIndices) {
        const vertex = skeleton.vertices[idx];
        if (vertex.generation < cfg.leafGenerationThreshold) continue;

        for (let l = 0; l < cfg.leavesPerTip; l++) {
          const leafGeo = BranchSkinner.createLeafGeometry(
            cfg.leafType,
            vertex,
            cfg.leafScale,
            leafRng
          );
          leafGeometries.push(leafGeo);
          leafPositions.push(vertex.position.clone());
        }
      }

      // Place leaves along outer branches
      if (cfg.placeLeavesAlongBranches) {
        for (const vertex of skeleton.vertices) {
          if (vertex.isTerminal) continue; // Already handled
          if (vertex.generation < cfg.leafGenerationThreshold) continue;

          // Place fewer leaves along branches
          if (leafRng.next() > 0.3) continue;

          const leafGeo = BranchSkinner.createLeafGeometry(
            cfg.leafType,
            vertex,
            cfg.leafScale * 0.8,
            leafRng
          );
          leafGeometries.push(leafGeo);
          leafPositions.push(vertex.position.clone());
        }
      }

      if (leafGeometries.length > 0) {
        leafGeometry = BranchSkinner.mergeGeometries(leafGeometries);
      }

      leafMaterial = new THREE.MeshStandardMaterial({
        color: cfg.leafColor,
        roughness: 0.6,
        metalness: 0.0,
        side: cfg.leafDoubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
    }

    // Compute bounding box
    const allPositions = skeleton.vertices.map(v => v.position);
    const boundingBox = new THREE.Box3().setFromPoints(
      allPositions.length > 0 ? allPositions : [new THREE.Vector3()]
    );

    return {
      branchGeometry,
      barkMaterial,
      leafGeometry,
      leafMaterial,
      leafPositions,
      boundingBox,
    };
  }

  // --------------------------------------------------------------------------
  // Branch Segment Geometry
  // --------------------------------------------------------------------------

  /**
   * Create a tapered cylinder for a single branch segment.
   * Uses custom vertex generation for smooth radius variation.
   */
  private static createBranchSegment(
    parent: TreeVertex,
    child: TreeVertex,
    radialSegments: number,
    minRadius: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const start = parent.position;
    const end = child.position;
    const startRadius = Math.max(parent.radius, minRadius);
    const endRadius = Math.max(child.radius, minRadius);

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.001) {
      return new THREE.BufferGeometry();
    }

    direction.normalize();

    // Build a custom tapered cylinder
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create two rings of vertices: start and end
    const rings = [
      { center: start, radius: startRadius, v: 0 },
      { center: end, radius: endRadius, v: 1 },
    ];

    // Find perpendicular axes for the cross-section
    const arbitrary = Math.abs(direction.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const perp1 = new THREE.Vector3().crossVectors(direction, arbitrary).normalize();
    const perp2 = new THREE.Vector3().crossVectors(direction, perp1).normalize();

    for (const ring of rings) {
      for (let i = 0; i < radialSegments; i++) {
        const angle = (i / radialSegments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Position on the ring
        const px = ring.center.x + (perp1.x * cosA + perp2.x * sinA) * ring.radius;
        const py = ring.center.y + (perp1.y * cosA + perp2.y * sinA) * ring.radius;
        const pz = ring.center.z + (perp1.z * cosA + perp2.z * sinA) * ring.radius;

        positions.push(px, py, pz);

        // Normal: direction from center to vertex on ring
        const normal = new THREE.Vector3(
          perp1.x * cosA + perp2.x * sinA,
          perp1.y * cosA + perp2.y * sinA,
          perp1.z * cosA + perp2.z * sinA
        ).normalize();
        normals.push(normal.x, normal.y, normal.z);

        // UV: wrap around the circumference
        uvs.push(i / radialSegments, ring.v);
      }
    }

    // Build triangles connecting the two rings
    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      const a = i;
      const b = next;
      const c = radialSegments + i;
      const d = radialSegments + next;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    // Cap the start (fan from center)
    const startCenterIdx = positions.length / 3;
    positions.push(start.x, start.y, start.z);
    normals.push(-direction.x, -direction.y, -direction.z);
    uvs.push(0.5, 0);

    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      indices.push(startCenterIdx, next, i);
    }

    // Cap the end (fan from center)
    const endCenterIdx = positions.length / 3;
    positions.push(end.x, end.y, end.z);
    normals.push(direction.x, direction.y, direction.z);
    uvs.push(0.5, 1);

    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      indices.push(endCenterIdx, radialSegments + i, radialSegments + next);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // --------------------------------------------------------------------------
  // Bark Displacement
  // --------------------------------------------------------------------------

  /**
   * Apply noise-based bark displacement to branch geometry vertices.
   * Displaces vertices along their normals using FBM noise for a realistic
   * bark texture effect.
   */
  private static applyBarkDisplacement(
    geometry: THREE.BufferGeometry,
    frequency: number,
    amplitude: number,
    seed: number
  ): void {
    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      normal.fromBufferAttribute(normAttr, i);

      // Use FBM noise for bark-like displacement
      const noiseVal = seededFbm(
        vertex.x * frequency + seed,
        vertex.y * frequency,
        vertex.z * frequency,
        4, // octaves
        2.0, // lacunarity
        0.5, // gain
        seed
      );

      // Displace along normal
      vertex.add(normal.clone().multiplyScalar(noiseVal * amplitude));
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
  }

  // --------------------------------------------------------------------------
  // Leaf Geometry
  // --------------------------------------------------------------------------

  /**
   * Create a single leaf geometry at a vertex position.
   * The leaf shape depends on the LeafType.
   */
  private static createLeafGeometry(
    leafType: LeafType,
    vertex: TreeVertex,
    scale: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    // Create leaf shape based on type
    const leafGeo = BranchSkinner.createLeafShape(leafType, scale, rng);

    // Orient the leaf to face outward from the branch direction
    const up = new THREE.Vector3(0, 0, 1);
    const targetDir = vertex.direction.clone().normalize();

    // Add slight random rotation for natural variation
    const randomAxis = new THREE.Vector3(
      rng.uniform(-1, 1),
      rng.uniform(-1, 1),
      rng.uniform(-1, 1)
    ).normalize();
    const randomAngle = rng.uniform(-0.3, 0.3);

    const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, targetDir);
    const randomQuat = new THREE.Quaternion().setFromAxisAngle(randomAxis, randomAngle);
    alignQuat.multiply(randomQuat);

    leafGeo.applyQuaternion(alignQuat);

    // Translate to vertex position
    leafGeo.translate(vertex.position.x, vertex.position.y, vertex.position.z);

    return leafGeo;
  }

  /**
   * Create the base leaf shape geometry for each leaf type.
   */
  private static createLeafShape(
    leafType: LeafType,
    scale: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    switch (leafType) {
      case 'broadleaf':
        return BranchSkinner.createBroadleafShape(scale);
      case 'maple':
        return BranchSkinner.createMapleShape(scale);
      case 'ginkgo':
        return BranchSkinner.createGinkgoShape(scale);
      case 'pine_needle':
        return BranchSkinner.createPineNeedleShape(scale, rng);
      case 'palm_frond':
        return BranchSkinner.createPalmFrondShape(scale);
      case 'oak':
        return BranchSkinner.createOakShape(scale);
      case 'willow':
        return BranchSkinner.createWillowShape(scale);
      case 'birch':
        return BranchSkinner.createBirchShape(scale);
      default:
        return BranchSkinner.createBroadleafShape(scale);
    }
  }

  /** Broadleaf: wide elliptical shape */
  private static createBroadleafShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.08;
    const positions = new Float32Array([
      0, 0, 0,
      -s * 0.4, s * 0.5, 0,
      0, s, 0,
      s * 0.4, s * 0.5, 0,
    ]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);
    const indices = [0, 1, 2, 0, 2, 3];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Maple: 5-point star shape */
  private static createMapleShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.1;
    const positions = new Float32Array([
      0, 0, 0,            // 0: center
      -s * 0.6, s * 0.3, 0,  // 1: left
      -s * 0.2, s * 0.8, 0,  // 2: upper left
      0, s * 0.5, 0,      // 3: upper center
      s * 0.2, s * 0.8, 0,   // 4: upper right
      s * 0.6, s * 0.3, 0,   // 5: right
      0, s, 0,              // 6: top
    ]);
    const normals = new Float32Array(Array.from({ length: 7 }, () => [0, 0, 1]).flat());
    const uvs = new Float32Array([0.5, 0, 0, 0.3, 0.15, 0.8, 0.5, 0.5, 0.85, 0.8, 1, 0.3, 0.5, 1]);
    const indices = [0, 1, 3, 1, 2, 3, 0, 3, 5, 3, 4, 5, 3, 6, 4];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Ginkgo: fan-shaped leaf */
  private static createGinkgoShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.09;
    const segments = 8;
    const positions: number[] = [0, 0, 0]; // center
    const normals: number[] = [0, 0, 1];
    const uvs: number[] = [0.5, 0];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = -Math.PI * 0.4 + (i / segments) * Math.PI * 0.8;
      const x = Math.sin(angle) * s * 0.8;
      const y = Math.cos(angle) * s * 0.5 + s * 0.5;
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push(i / segments, 0.8);
    }

    for (let i = 0; i < segments; i++) {
      indices.push(0, i + 1, i + 2);
    }

    return BranchSkinner.buildLeafGeo(
      new Float32Array(positions),
      new Float32Array(normals),
      new Float32Array(uvs),
      indices
    );
  }

  /** Pine needle: thin elongated triangle */
  private static createPineNeedleShape(scale: number, rng: SeededRandom): THREE.BufferGeometry {
    const s = scale * 0.12;
    const w = s * 0.05;
    const positions = new Float32Array([
      -w, 0, 0,
      w, 0, 0,
      0, s, 0,
    ]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const indices = [0, 1, 2];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Palm frond: elongated fan shape */
  private static createPalmFrondShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.2;
    const positions = new Float32Array([
      0, 0, 0,
      -s * 0.3, s * 0.4, 0,
      0, s * 0.3, 0,
      s * 0.3, s * 0.4, 0,
      0, s, 0,
    ]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0.5, 0, 0, 0.4, 0.5, 0.5, 1, 0.4, 0.5, 1]);
    const indices = [0, 1, 2, 0, 2, 3, 2, 4, 3];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Oak: lobed leaf shape */
  private static createOakShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.08;
    const positions = new Float32Array([
      0, 0, 0,
      -s * 0.5, s * 0.2, 0,
      -s * 0.35, s * 0.4, 0,
      -s * 0.55, s * 0.6, 0,
      -s * 0.25, s * 0.75, 0,
      0, s, 0,
      s * 0.25, s * 0.75, 0,
      s * 0.55, s * 0.6, 0,
      s * 0.35, s * 0.4, 0,
      s * 0.5, s * 0.2, 0,
    ]);
    const normals = new Float32Array(Array.from({ length: 10 }, () => [0, 0, 1]).flat());
    const uvs = new Float32Array([
      0.5, 0, 0.1, 0.2, 0.15, 0.4, 0.05, 0.6, 0.2, 0.75,
      0.5, 1, 0.8, 0.75, 0.95, 0.6, 0.85, 0.4, 0.9, 0.2,
    ]);
    const indices = [0, 1, 9, 1, 2, 9, 9, 2, 8, 2, 3, 8, 8, 3, 7, 3, 4, 7, 7, 4, 6, 4, 5, 6];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Willow: long narrow leaf */
  private static createWillowShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.15;
    const w = s * 0.1;
    const positions = new Float32Array([
      0, 0, 0,
      -w, s * 0.3, 0,
      -w * 0.7, s * 0.7, 0,
      0, s, 0,
      w * 0.7, s * 0.7, 0,
      w, s * 0.3, 0,
    ]);
    const normals = new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1]).flat());
    const uvs = new Float32Array([0.5, 0, 0, 0.3, 0, 0.7, 0.5, 1, 1, 0.7, 1, 0.3]);
    const indices = [0, 1, 5, 1, 2, 5, 5, 2, 4, 2, 3, 4];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  /** Birch: small triangular leaf */
  private static createBirchShape(scale: number): THREE.BufferGeometry {
    const s = scale * 0.06;
    const positions = new Float32Array([
      0, 0, 0,
      -s * 0.35, s * 0.5, 0,
      0, s, 0,
      s * 0.35, s * 0.5, 0,
    ]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);
    const indices = [0, 1, 2, 0, 2, 3];
    return BranchSkinner.buildLeafGeo(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Geometry Utilities
  // --------------------------------------------------------------------------

  /**
   * Build a BufferGeometry from raw arrays.
   */
  private static buildLeafGeo(
    positions: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    indices: number[]
  ): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Merge multiple BufferGeometries into a single geometry.
   * Delegates to the canonical GeometryPipeline.mergeGeometries.
   */
  static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }
}
