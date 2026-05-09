/**
 * LeafGeometry - Per-leaf geometry generation for trees
 *
 * Generates individual leaf geometries (flat quads with leaf shapes) instead
 * of sphere approximations. Princeton Infinigen renders individual leaf
 * geometry for realistic foliage, and this module replicates that approach.
 *
 * Each leaf type has a proper shape with:
 * - position, normal, uv attributes
 * - UV maps covering [0,1] range for texture mapping
 * - Subtle bend along the midrib for realism
 *
 * LeafCluster creates groups of leaves with deterministic placement via SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

export type LeafType =
  | 'broad'
  | 'narrow'
  | 'needle'
  | 'palm'
  | 'oak'
  | 'maple'
  | 'birch'
  | 'willow'
  | 'fern';

export interface LeafConfig {
  /** Leaf length along midrib (default 0.1) */
  size: number;
  /** Leaf width perpendicular to midrib (default 0.05) */
  width: number;
  /** Curvature of the leaf surface along Z axis (default 0.1) */
  curvature: number;
  /** Length of the stem at the base of the leaf (default 0.03) */
  stemLength: number;
}

export interface ClusterConfig {
  /** Radius of the cluster sphere (default 0.3) */
  radius: number;
  /** Density multiplier affecting leaf count (default 1.0) */
  density: number;
  /** Seed for deterministic placement (default 42) */
  seed: number;
  /** Preferred leaf orientation (default 'outward') */
  orientationBias: 'up' | 'outward' | 'random';
}

const DEFAULT_LEAF_CONFIG: LeafConfig = {
  size: 0.1,
  width: 0.05,
  curvature: 0.1,
  stemLength: 0.03,
};

const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  radius: 0.3,
  density: 1.0,
  seed: 42,
  orientationBias: 'outward',
};

// ============================================================================
// LeafGeometry - Static leaf geometry factory
// ============================================================================

export class LeafGeometry {
  /**
   * Creates a single leaf geometry for the given type.
   *
   * Each leaf is a flat quad-like mesh with proper UV mapping for texture
   * mapping. The geometry includes a subtle bend along the midrib for realism.
   */
  static createLeaf(type: LeafType, config?: Partial<LeafConfig>): THREE.BufferGeometry {
    const cfg: LeafConfig = { ...DEFAULT_LEAF_CONFIG, ...config };

    switch (type) {
      case 'broad':      return LeafGeometry.createBroadLeaf(cfg);
      case 'narrow':     return LeafGeometry.createNarrowLeaf(cfg);
      case 'needle':     return LeafGeometry.createNeedleLeaf(cfg);
      case 'palm':       return LeafGeometry.createPalmLeaf(cfg);
      case 'oak':        return LeafGeometry.createOakLeaf(cfg);
      case 'maple':      return LeafGeometry.createMapleLeaf(cfg);
      case 'birch':      return LeafGeometry.createBirchLeaf(cfg);
      case 'willow':     return LeafGeometry.createWillowLeaf(cfg);
      case 'fern':       return LeafGeometry.createFernLeaf(cfg);
      default:           return LeafGeometry.createBroadLeaf(cfg);
    }
  }

  // --------------------------------------------------------------------------
  // Leaf shape implementations
  // --------------------------------------------------------------------------

  /**
   * Broad: Wide elliptical leaf with slight cupping (curvature on Z axis).
   * Classic deciduous leaf — wide and rounded.
   */
  private static createBroadLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const segments = 6;
    const halfSeg = segments / 2;

    // Build leaf outline as a series of vertices along the midrib and edges
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem point
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Leaf body: elliptical shape with midrib bend
    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // 0 → 1 along midrib
      const y = t * size;
      const u = t; // UV along midrib

      // Elliptical width: widest at center, tapered at ends
      const widthScale = Math.sin(t * Math.PI);
      const w = width * widthScale;

      // Subtle midrib bend (curvature)
      const zBend = curvature * Math.sin(t * Math.PI) * size;

      // Left vertex
      positions.push(-w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0, u);

      // Right vertex
      positions.push(w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(1, u);
    }

    // Build triangles from stem to leaf body
    // Stem → first pair
    indices.push(0, 1, 2);

    // Subsequent pairs
    for (let i = 0; i < segments; i++) {
      const leftCurr = 1 + i * 2;
      const rightCurr = 2 + i * 2;
      const leftNext = 3 + i * 2;
      const rightNext = 4 + i * 2;

      // Left triangle
      indices.push(leftCurr, leftNext, rightCurr);
      // Right triangle
      indices.push(rightCurr, leftNext, rightNext);
    }

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Narrow: Long thin leaf (like grass).
   * Very elongated with minimal width.
   */
  private static createNarrowLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const narrowWidth = width * 0.4; // Much thinner
    const segments = 8;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * size;

      // Tapers linearly to a point
      const w = narrowWidth * (1 - t);
      const zBend = curvature * t * t * size; // Gradual droop

      positions.push(-w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0, t);

      positions.push(w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(1, t);
    }

    indices.push(0, 1, 2);
    for (let i = 0; i < segments; i++) {
      const lc = 1 + i * 2;
      const rc = 2 + i * 2;
      const ln = 3 + i * 2;
      const rn = 4 + i * 2;
      indices.push(lc, ln, rc);
      indices.push(rc, ln, rn);
    }

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Needle: Very thin elongated triangle (pine needle).
   * Almost no width, just a thin sliver.
   */
  private static createNeedleLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, stemLength } = cfg;
    const needleWidth = width * 0.2;

    const positions: number[] = [
      0, -stemLength, 0,        // 0: stem base
      -needleWidth, 0, 0,       // 1: base left
      needleWidth, 0, 0,        // 2: base right
      0, size, 0,               // 3: tip
    ];
    const normals: number[] = [
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ];
    const uvs: number[] = [
      0.5, 0,
      0, 0.1,
      1, 0.1,
      0.5, 1,
    ];
    const indices: number[] = [
      0, 1, 2,
      1, 3, 2,
    ];

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Palm: Fan-shaped leaf with segments radiating from a single point.
   * Multiple fingers spreading out from the base.
   */
  private static createPalmLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const segments = 5; // Number of finger segments
    const ptsPerSeg = 4; // Points per segment

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem base
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Fan origin
    positions.push(0, 0, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.15);

    const fanOriginIdx = 1;

    // Create fan segments
    for (let s = 0; s < segments; s++) {
      const angleStart = -Math.PI * 0.4 + (s / segments) * Math.PI * 0.8;
      const angleEnd = -Math.PI * 0.4 + ((s + 1) / segments) * Math.PI * 0.8;

      const baseIdx = positions.length / 3;

      // Left edge of segment
      const lx = Math.sin(angleStart) * width * 1.5;
      const ly = Math.cos(angleStart) * size * 0.5;
      const lz = curvature * Math.sin(0.5 * Math.PI) * size;
      positions.push(lx, ly, lz);
      normals.push(0, 0, 1);
      uvs.push(s / segments, 0.6);

      // Right edge of segment
      const rx = Math.sin(angleEnd) * width * 1.5;
      const ry = Math.cos(angleEnd) * size * 0.5;
      positions.push(rx, ry, lz);
      normals.push(0, 0, 1);
      uvs.push((s + 1) / segments, 0.6);

      // Tip of segment
      const tipAngle = (angleStart + angleEnd) / 2;
      const tx = Math.sin(tipAngle) * width * 0.8;
      const ty = size;
      const tz = curvature * size;
      positions.push(tx, ty, tz);
      normals.push(0, 0, 1);
      uvs.push((s + 0.5) / segments, 1);

      // Triangle: fanOrigin → left → right
      indices.push(fanOriginIdx, baseIdx, baseIdx + 1);
      // Triangle: left → tip → right
      indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
    }

    // Stem triangle
    indices.push(0, fanOriginIdx, fanOriginIdx); // degenerate — just connect stem

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Oak: Lobed leaf shape (multiple rounded lobes).
   * Classic oak leaf with 4-5 rounded lobes along each side.
   */
  private static createOakLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const lobeCount = 4;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Base of leaf
    positions.push(0, 0, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.1);

    // Build outline with lobes: go right side up, then left side down
    const outlinePoints: { x: number; y: number; u: number }[] = [];

    for (let i = 0; i <= lobeCount * 2; i++) {
      const t = i / (lobeCount * 2); // 0 → 1 along the leaf
      const y = t * size;

      // Lobe pattern: sinusoidal width modulation
      const lobeFreq = lobeCount * Math.PI;
      const baseWidth = width * (1 - Math.pow(2 * t - 1, 2) * 0.3); // Taper at ends
      const lobeModulation = 1 + 0.3 * Math.sin(t * lobeFreq);
      const w = baseWidth * lobeModulation;

      outlinePoints.push({ x: w, y, u: t });
    }

    // Right side vertices
    const rightStart = positions.length / 3;
    for (const pt of outlinePoints) {
      const zBend = curvature * Math.sin(pt.u * Math.PI) * size;
      positions.push(pt.x, pt.y, zBend);
      normals.push(0, 0, 1);
      uvs.push(1, pt.u);
    }

    // Left side vertices (reversed)
    const leftStart = positions.length / 3;
    for (let i = outlinePoints.length - 1; i >= 0; i--) {
      const pt = outlinePoints[i];
      const zBend = curvature * Math.sin(pt.u * Math.PI) * size;
      positions.push(-pt.x, pt.y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0, pt.u);
    }

    // Build triangle fan from center (vertex 1)
    const center = 1;
    for (let i = 0; i < outlinePoints.length - 1; i++) {
      const rCurr = rightStart + i;
      const rNext = rightStart + i + 1;
      indices.push(center, rCurr, rNext);
    }
    // Connect right tip to left tip
    indices.push(center, rightStart + outlinePoints.length - 1, leftStart);
    // Left side
    for (let i = 0; i < outlinePoints.length - 1; i++) {
      const lCurr = leftStart + i;
      const lNext = leftStart + i + 1;
      indices.push(center, lCurr, lNext);
    }

    // Stem triangle
    indices.push(0, center, rightStart);

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Maple: Pointed lobes (5-point star shape).
   * Classic maple leaf with 5 pointed lobes.
   */
  private static createMapleLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Center of leaf
    positions.push(0, size * 0.3, curvature * size * 0.2);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.4);

    // 5-point star outline
    const points = 5;
    const outerRadius = width * 1.5;
    const innerRadius = width * 0.5;
    const totalPts = points * 2;

    const outlineStart = positions.length / 3;
    for (let i = 0; i < totalPts; i++) {
      const angle = (i / totalPts) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * r;
      const y = size * 0.3 + Math.sin(angle) * r * (size / width) * 0.7;
      const zBend = curvature * Math.max(0, y / size) * size;
      positions.push(x, y, zBend);
      normals.push(0, 0, 1);
      const u = (x / (outerRadius * 2)) + 0.5;
      const v = y / size;
      uvs.push(
        Math.max(0, Math.min(1, u)),
        Math.max(0, Math.min(1, v))
      );
    }

    // Triangle fan from center (vertex 1)
    const center = 1;
    for (let i = 0; i < totalPts; i++) {
      const curr = outlineStart + i;
      const next = outlineStart + (i + 1) % totalPts;
      indices.push(center, curr, next);
    }

    // Stem
    indices.push(0, center, outlineStart + points); // Connect to bottom point

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Birch: Small rounded triangle with serrated edge.
   * Delicate, small leaf typical of birch trees.
   */
  private static createBirchLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const birchSize = size * 0.7; // Smaller
    const birchWidth = width * 0.8;
    const serrations = 5;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Center
    positions.push(0, birchSize * 0.4, curvature * birchSize * 0.15);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.5);

    // Right serrated edge
    const rightStart = positions.length / 3;
    for (let i = 0; i <= serrations * 2; i++) {
      const t = i / (serrations * 2);
      const y = t * birchSize;
      const baseW = birchWidth * Math.sin(t * Math.PI) * 0.8;
      const serration = (i % 2 === 0) ? 0 : birchWidth * 0.15;
      const w = baseW + serration;
      const zBend = curvature * Math.sin(t * Math.PI) * birchSize;

      positions.push(w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(1, t);
    }

    // Tip
    positions.push(0, birchSize, curvature * birchSize);
    normals.push(0, 0, 1);
    uvs.push(0.5, 1);

    // Left serrated edge (reversed)
    const leftStart = positions.length / 3;
    for (let i = serrations * 2; i >= 0; i--) {
      const t = i / (serrations * 2);
      const y = t * birchSize;
      const baseW = birchWidth * Math.sin(t * Math.PI) * 0.8;
      const serration = (i % 2 === 0) ? 0 : birchWidth * 0.15;
      const w = baseW + serration;
      const zBend = curvature * Math.sin(t * Math.PI) * birchSize;

      positions.push(-w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0, t);
    }

    // Triangle fan from center (vertex 1)
    const center = 1;
    const tipIdx = rightStart + serrations * 2 + 1;
    const totalRight = serrations * 2 + 1;

    // Right side
    for (let i = 0; i < totalRight; i++) {
      indices.push(center, rightStart + i, rightStart + i + 1);
    }

    // Tip to left
    indices.push(center, tipIdx, leftStart);

    // Left side
    for (let i = 0; i < totalRight; i++) {
      indices.push(center, leftStart + i, leftStart + i + 1);
    }

    // Stem
    indices.push(0, center, rightStart);

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Willow: Very long and narrow with slight droop.
   * Extremely elongated leaf that droops noticeably.
   */
  private static createWillowLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const willowSize = size * 2.5; // Much longer
    const willowWidth = width * 0.3; // Very narrow
    const segments = 10;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * willowSize;
      // Tapered both ends, widest at 1/3
      const widthScale = t < 0.33
        ? t / 0.33
        : (1 - t) / 0.67;
      const w = willowWidth * Math.max(0, widthScale);
      // Pronounced droop
      const zBend = curvature * t * t * willowSize * 1.5;

      positions.push(-w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0, t);

      positions.push(w, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(1, t);
    }

    // Stem → first pair
    indices.push(0, 1, 2);

    for (let i = 0; i < segments; i++) {
      const lc = 1 + i * 2;
      const rc = 2 + i * 2;
      const ln = 3 + i * 2;
      const rn = 4 + i * 2;
      indices.push(lc, ln, rc);
      indices.push(rc, ln, rn);
    }

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  /**
   * Fern: Multi-segment frond.
   * Central stem with paired leaflets branching off at regular intervals.
   */
  private static createFernLeaf(cfg: LeafConfig): THREE.BufferGeometry {
    const { size, width, curvature, stemLength } = cfg;
    const segmentCount = 6;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Stem base
    positions.push(0, -stemLength, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0);

    // Central stem points
    const stemIndices: number[] = [0]; // Start with stem base
    for (let s = 0; s <= segmentCount; s++) {
      const t = s / segmentCount;
      const y = t * size;
      const zBend = curvature * t * t * size;
      const idx = positions.length / 3;
      positions.push(0, y, zBend);
      normals.push(0, 0, 1);
      uvs.push(0.5, t);
      stemIndices.push(idx);
    }

    // Leaflets on each side at each stem point (except base and tip)
    for (let s = 1; s < segmentCount; s++) {
      const t = s / segmentCount;
      const y = t * size;
      const zBend = curvature * t * t * size;
      const leafletLength = width * (1 - t * 0.5) * 1.5;
      const stemIdx = stemIndices[s + 1]; // +1 because stemIndices[0] is stem base

      for (const side of [-1, 1]) {
        const baseIdx = positions.length / 3;

        // Leaflet base (at stem)
        positions.push(0, y, zBend);
        normals.push(0, 0, 1);
        uvs.push(side < 0 ? 0 : 1, t);

        // Leaflet tip
        positions.push(side * leafletLength, y + size * 0.03, zBend + curvature * size * 0.1);
        normals.push(0, 0, 1);
        uvs.push(side < 0 ? 0 : 1, t + 0.05);

        // Triangle: stem → leaflet base → leaflet tip
        indices.push(stemIdx, baseIdx, baseIdx + 1);
      }
    }

    // Connect stem segments
    for (let s = 0; s < segmentCount; s++) {
      const curr = stemIndices[s + 1];
      const next = stemIndices[s + 2];
      // Very thin stem representation — degenerate triangles
      // Not strictly necessary for visual, but connects the geometry
    }

    return LeafGeometry.buildGeometry(positions, normals, uvs, indices);
  }

  // --------------------------------------------------------------------------
  // Geometry assembly
  // --------------------------------------------------------------------------

  /**
   * Assemble raw arrays into a THREE.BufferGeometry.
   */
  private static buildGeometry(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[]
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

// ============================================================================
// LeafCluster - Creates groups of leaves with deterministic placement
// ============================================================================

export class LeafCluster {
  /**
   * Creates a cluster of leaves around a point, with randomized positions
   * and rotations. Uses SeededRandom for deterministic placement.
   *
   * @param leafType Type of leaf geometry to use
   * @param count Number of leaves in the cluster
   * @param config Cluster configuration
   * @returns THREE.Group containing all leaf meshes
   */
  static createCluster(
    leafType: LeafType,
    count: number,
    config?: Partial<ClusterConfig>
  ): THREE.Group {
    const cfg: ClusterConfig = { ...DEFAULT_CLUSTER_CONFIG, ...config };
    const rng = new SeededRandom(cfg.seed);
    const group = new THREE.Group();

    // Pre-create the leaf geometry (shared by all instances)
    const leafGeometry = LeafGeometry.createLeaf(leafType);
    const adjustedCount = Math.round(count * cfg.density);

    for (let i = 0; i < adjustedCount; i++) {
      // Clone geometry so each leaf can have independent transforms
      const geometry = leafGeometry.clone();

      // Random position within the cluster radius
      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.next() - 1);
      const r = cfg.radius * Math.cbrt(rng.next()); // Uniform volume distribution

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      // Apply orientation bias
      const rotation = LeafCluster.computeOrientation(
        cfg.orientationBias,
        new THREE.Vector3(x, y, z),
        rng
      );

      // Apply transform to geometry
      const matrix = new THREE.Matrix4();
      matrix.compose(
        new THREE.Vector3(x, y, z),
        rotation,
        new THREE.Vector3(1, 1, 1)
      );
      geometry.applyMatrix4(matrix);

      // Create a mesh for this leaf
      const mesh = new THREE.Mesh(geometry);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.leafIndex = i;
      mesh.userData.leafType = leafType;
      group.add(mesh);
    }

    return group;
  }

  /**
   * Creates a merged cluster as a single geometry (more efficient for rendering).
   * All leaves are merged into one BufferGeometry.
   */
  static createMergedCluster(
    leafType: LeafType,
    count: number,
    config?: Partial<ClusterConfig>
  ): THREE.BufferGeometry {
    const cfg: ClusterConfig = { ...DEFAULT_CLUSTER_CONFIG, ...config };
    const rng = new SeededRandom(cfg.seed);
    const adjustedCount = Math.round(count * cfg.density);

    const leafGeometry = LeafGeometry.createLeaf(leafType);
    const geometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < adjustedCount; i++) {
      const geometry = leafGeometry.clone();

      const theta = rng.uniform(0, Math.PI * 2);
      const phi = Math.acos(2 * rng.next() - 1);
      const r = cfg.radius * Math.cbrt(rng.next());

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const rotation = LeafCluster.computeOrientation(
        cfg.orientationBias,
        new THREE.Vector3(x, y, z),
        rng
      );

      const matrix = new THREE.Matrix4();
      matrix.compose(
        new THREE.Vector3(x, y, z),
        rotation,
        new THREE.Vector3(1, 1, 1)
      );
      geometry.applyMatrix4(matrix);
      geometries.push(geometry);
    }

    return LeafCluster.mergeGeometries(geometries);
  }

  /**
   * Compute orientation quaternion based on the bias mode.
   */
  private static computeOrientation(
    bias: 'up' | 'outward' | 'random',
    position: THREE.Vector3,
    rng: SeededRandom
  ): THREE.Quaternion {
    const quaternion = new THREE.Quaternion();

    switch (bias) {
      case 'up': {
        // Leaves face upward with slight random tilt
        const tiltX = rng.uniform(-0.2, 0.2);
        const tiltZ = rng.uniform(-0.2, 0.2);
        const rotY = rng.uniform(0, Math.PI * 2);
        const euler = new THREE.Euler(tiltX, rotY, tiltZ);
        quaternion.setFromEuler(euler);
        break;
      }
      case 'outward': {
        // Leaves face outward from the cluster center
        const direction = position.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);

        // Create rotation that aligns leaf normal (Z+) with the outward direction
        const quaternionAlign = new THREE.Quaternion();
        quaternionAlign.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

        // Add slight random rotation around the normal
        const randomAngle = rng.uniform(-0.3, 0.3);
        const randomRot = new THREE.Quaternion().setFromAxisAngle(direction, randomAngle);

        quaternion.copy(randomRot.multiply(quaternionAlign));
        break;
      }
      case 'random': {
        // Fully random orientation
        const rx = rng.uniform(0, Math.PI * 2);
        const ry = rng.uniform(0, Math.PI * 2);
        const rz = rng.uniform(0, Math.PI * 2);
        const euler = new THREE.Euler(rx, ry, rz);
        quaternion.setFromEuler(euler);
        break;
      }
    }

    return quaternion;
  }

  /**
   * Merge multiple BufferGeometries into one.
   * Delegates to the canonical GeometryPipeline.mergeGeometries().
   */
  private static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }
}
