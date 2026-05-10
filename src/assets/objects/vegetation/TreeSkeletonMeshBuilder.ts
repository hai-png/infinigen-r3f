/**
 * TreeSkeletonMeshBuilder.ts — Connects SpaceColonization output to Three.js meshes
 *
 * Converts a TreeSkeleton (from SpaceColonization) into a smooth THREE.BufferGeometry
 * with tapered branches, smooth trunk via CatmullRomCurve3, and per-generation
 * vertex attributes for material variation.
 *
 * The builder:
 *   1. Traces connected edge chains through the skeleton graph
 *   2. Groups chains by generation (trunk, primary branches, secondary, etc.)
 *   3. Creates CatmullRomCurve3 paths for smooth shapes
 *   4. Builds varying-radius tube geometry along each path
 *   5. Merges everything into a single BufferGeometry with a 'generation' attribute
 */

import * as THREE from 'three';
import type { TreeSkeleton, TreeVertex, TreeEdge } from './SpaceColonization';
import { computeRevDepth } from './BranchSkinner';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the TreeSkeletonMeshBuilder.
 */
export interface SkeletonMeshConfig {
  /** Radial segments for the trunk tube (default 8) */
  trunkRadialSegments: number;
  /** Radial segments for branch tubes (default 6) */
  branchRadialSegments: number;
  /** Minimum radius for any branch segment (default 0.02) */
  minRadius: number;
  /** Whether to use CatmullRomCurve3 for smooth trunk path (default true) */
  smoothTrunk: boolean;
  /** Radius multiplier per generation — how much thinner branches get (default 0.65) */
  generationRadiusDecay: number;
  /** Number of tubular segments per unit length for trunk (default 8) */
  trunkTubularSegments: number;
  /** Number of tubular segments per unit length for branches (default 6) */
  branchTubularSegments: number;
  /** Radius boost factor at branch junctions (default 1.15) */
  junctionBoost: number;
  /** Closed flag for tubes (default false) */
  closed: boolean;
  /** Whether to use rev_depth for radius computation (default true) */
  useRevDepth: boolean;
  /** Exponent for rev_depth-based radius (default 0.5, square root = pipe model) */
  revDepthExponent: number;
  /** Blend factor between rev_depth and generation-based radius (0=generation, 1=rev_depth, default 0.7) */
  revDepthBlend: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_SKELETON_MESH_CONFIG: SkeletonMeshConfig = {
  trunkRadialSegments: 8,
  branchRadialSegments: 6,
  minRadius: 0.02,
  smoothTrunk: true,
  generationRadiusDecay: 0.65,
  trunkTubularSegments: 8,
  branchTubularSegments: 6,
  junctionBoost: 1.15,
  closed: false,
  useRevDepth: true,
  revDepthExponent: 0.5,
  revDepthBlend: 0.7,
};

// ============================================================================
// Internal Types
// ============================================================================

/**
 * A traced chain of vertices forming a continuous branch or trunk path.
 */
interface BranchChain {
  /** Ordered list of vertex indices from base to tip */
  vertexIndices: number[];
  /** Generation of this chain (0 = trunk, 1+ = branches) */
  generation: number;
  /** Index in the parent chain where this chain branches off (-1 for root) */
  parentBranchPointIndex: number;
}

// ============================================================================
// TreeSkeletonMeshBuilder
// ============================================================================

/**
 * TreeSkeletonMeshBuilder converts a TreeSkeleton into a renderable
 * THREE.BufferGeometry with smooth branches and trunk.
 *
 * Usage:
 *   const builder = new TreeSkeletonMeshBuilder();
 *   const geometry = builder.buildFromSkeleton(skeleton, config);
 *   const mesh = new THREE.Mesh(geometry, barkMaterial);
 */
export class TreeSkeletonMeshBuilder {
  /**
   * Build a complete BufferGeometry from a TreeSkeleton.
   *
   * @param skeleton The tree skeleton from SpaceColonization
   * @param config Optional configuration overrides
   * @returns A merged BufferGeometry with 'generation' vertex attribute
   */
  buildFromSkeleton(
    skeleton: TreeSkeleton,
    config: Partial<SkeletonMeshConfig> = {}
  ): THREE.BufferGeometry {
    const cfg: SkeletonMeshConfig = { ...DEFAULT_SKELETON_MESH_CONFIG, ...config };

    // Handle degenerate case: no edges
    if (skeleton.edges.length === 0 || skeleton.vertices.length === 0) {
      return this.createEmptyGeometry();
    }

    // Compute rev_depth for the skeleton
    const revDepthArray = computeRevDepth(skeleton);
    let maxRevDepth = 0;
    for (let i = 0; i < revDepthArray.length; i++) {
      if (revDepthArray[i] > maxRevDepth) maxRevDepth = revDepthArray[i];
    }

    // Step 1: Trace all branch chains from the skeleton
    const chains = this.traceBranchChains(skeleton);

    // Handle degenerate case: no traceable chains
    if (chains.length === 0) {
      return this.createEmptyGeometry();
    }

    // Step 2: Find branch point vertices (vertices with multiple children)
    const branchPoints = this.findBranchPoints(skeleton);

    // Step 3: Build geometry for each chain
    const geometries: THREE.BufferGeometry[] = [];

    for (const chain of chains) {
      const isTrunk = chain.generation === 0;
      const radialSegments = isTrunk ? cfg.trunkRadialSegments : cfg.branchRadialSegments;
      const tubularSegmentsPerUnit = isTrunk ? cfg.trunkTubularSegments : cfg.branchTubularSegments;

      const chainGeo = this.buildChainGeometry(
        skeleton,
        chain,
        branchPoints,
        radialSegments,
        tubularSegmentsPerUnit,
        cfg,
        revDepthArray,
        maxRevDepth
      );

      if (chainGeo.attributes.position.count > 0) {
        geometries.push(chainGeo);
      }
    }

    // Step 4: Merge all geometries
    if (geometries.length === 0) {
      return this.createEmptyGeometry();
    }

    const merged = this.mergeGeometriesWithGenerationAndRevDepth(geometries);
    merged.computeVertexNormals();

    // Store rev_depth as a vertex attribute for shader access
    if (cfg.useRevDepth && maxRevDepth > 0) {
      const posAttr = merged.attributes.position;
      if (posAttr) {
        const revDepthAttr = new Float32Array(posAttr.count);
        // For each vertex in the merged geometry, interpolate rev_depth from chain data
        // We already stored per-vertex rev_depth in the chain geometries, just copy them
        let offset = 0;
        for (const geo of geometries) {
          const rdAttr = geo.attributes.aRevDepth;
          const count = geo.attributes.position.count;
          if (rdAttr) {
            for (let i = 0; i < count; i++) {
              revDepthAttr[offset + i] = rdAttr.getX(i);
            }
          }
          offset += count;
        }
        merged.setAttribute('aRevDepth', new THREE.BufferAttribute(revDepthAttr, 1));
      }
    }

    return merged;
  }

  // --------------------------------------------------------------------------
  // Chain Tracing
  // --------------------------------------------------------------------------

  /**
   * Trace all branch chains through the skeleton graph.
   * A chain is a sequence of vertices where each vertex (except the last)
   * has exactly one child edge in the same generation.
   */
  private traceBranchChains(skeleton: TreeSkeleton): BranchChain[] {
    const { vertices, edges } = skeleton;
    const chains: BranchChain[] = [];

    // Build adjacency: parent → children
    const childrenOf: Map<number, number[]> = new Map();
    for (const edge of edges) {
      if (!childrenOf.has(edge.parent)) {
        childrenOf.set(edge.parent, []);
      }
      childrenOf.get(edge.parent)!.push(edge.child);
    }

    // Build reverse: child → parent
    const parentOf: Map<number, number> = new Map();
    for (const edge of edges) {
      parentOf.set(edge.child, edge.parent);
    }

    // Find all branch points (vertices with 2+ children) and leaf nodes
    const branchPointSet = new Set<number>();
    for (const [parent, children] of childrenOf) {
      if (children.length >= 2) {
        branchPointSet.add(parent);
      }
    }

    // Find roots of chains: vertices that are either the root of the skeleton,
    // or children of branch points
    const chainRoots: number[] = [skeleton.rootIndex];

    for (const [parent, children] of childrenOf) {
      if (children.length >= 2) {
        for (const child of children) {
          chainRoots.push(child);
        }
      }
    }

    // Also include vertices whose parent has a different generation
    for (const edge of edges) {
      const parentGen = vertices[edge.parent].generation;
      const childGen = vertices[edge.child].generation;
      if (childGen > parentGen) {
        // This is a generation transition — child starts a new chain
        if (!chainRoots.includes(edge.child)) {
          chainRoots.push(edge.child);
        }
      }
    }

    // Remove duplicates
    const uniqueRoots = [...new Set(chainRoots)];

    // For each chain root, trace the chain to its end
    const visited = new Set<number>();

    for (const rootIdx of uniqueRoots) {
      if (visited.has(rootIdx)) continue;

      const chain: number[] = [];
      let current = rootIdx;

      while (current >= 0 && current < vertices.length && !visited.has(current)) {
        visited.add(current);
        chain.push(current);

        const children = childrenOf.get(current);
        if (!children || children.length === 0) {
          // Leaf node — end of chain
          break;
        }

        if (children.length === 1) {
          // Continue chain
          current = children[0];
        } else {
          // Branch point — end this chain (children will be traced as separate chains)
          break;
        }
      }

      if (chain.length >= 2) {
        // Determine the generation of this chain from the first vertex
        const generation = vertices[chain[0]].generation;

        // Find the parent branch point
        const parentIdx = parentOf.get(chain[0]);
        const parentBranchPointIndex = parentIdx !== undefined && branchPointSet.has(parentIdx)
          ? parentIdx
          : -1;

        chains.push({
          vertexIndices: chain,
          generation,
          parentBranchPointIndex,
        });
      }
    }

    return chains;
  }

  /**
   * Find all branch point vertex indices (vertices with 2+ children).
   */
  private findBranchPoints(skeleton: TreeSkeleton): Set<number> {
    const childrenCount: Map<number, number> = new Map();
    for (const edge of skeleton.edges) {
      childrenCount.set(edge.parent, (childrenCount.get(edge.parent) || 0) + 1);
    }
    const branchPoints = new Set<number>();
    for (const [vertex, count] of childrenCount) {
      if (count >= 2) {
        branchPoints.add(vertex);
      }
    }
    return branchPoints;
  }

  // --------------------------------------------------------------------------
  // Geometry Building
  // --------------------------------------------------------------------------

  /**
   * Build geometry for a single branch chain using CatmullRomCurve3 for the path
   * and custom varying-radius tube construction.
   */
  private buildChainGeometry(
    skeleton: TreeSkeleton,
    chain: BranchChain,
    branchPoints: Set<number>,
    radialSegments: number,
    tubularSegmentsPerUnit: number,
    cfg: SkeletonMeshConfig,
    revDepthArray?: Float32Array,
    maxRevDepth?: number
  ): THREE.BufferGeometry {
    const { vertices } = skeleton;
    const { vertexIndices, generation } = chain;

    if (vertexIndices.length < 2) {
      return this.createEmptyGeometry();
    }

    // Collect positions and radii along the chain
    const positions: THREE.Vector3[] = [];
    const radii: number[] = [];
    const revDepths: number[] = [];

    for (let i = 0; i < vertexIndices.length; i++) {
      const vIdx = vertexIndices[i];
      const vertex = vertices[vIdx];
      positions.push(vertex.position.clone());

      // Compute radius for this vertex
      let radius = Math.max(vertex.radius, cfg.minRadius);

      // Apply rev_depth-based radius if enabled
      if (cfg.useRevDepth && revDepthArray && maxRevDepth && maxRevDepth > 0) {
        const revDepth = revDepthArray[vIdx];
        const normalizedRevDepth = revDepth / maxRevDepth;

        // Rev-depth based radius (pipe model)
        const revDepthRadius = vertex.radius * Math.pow(normalizedRevDepth, cfg.revDepthExponent);

        // Generation-based radius
        const generationRadius = radius;

        // Blend
        radius = revDepthRadius * cfg.revDepthBlend + generationRadius * (1 - cfg.revDepthBlend);
        radius = Math.max(radius, cfg.minRadius);
      } else if (generation > 0) {
        // Apply generation decay for generation > 0
        radius = Math.max(radius, cfg.minRadius);
      }

      // Boost radius at branch junctions
      if (branchPoints.has(vIdx)) {
        radius *= cfg.junctionBoost;
      }

      // Also boost at the base of a branch (first vertex after a branch point)
      if (i === 0 && chain.parentBranchPointIndex >= 0) {
        radius *= cfg.junctionBoost;
      }

      radii.push(radius);
      revDepths.push(revDepthArray ? revDepthArray[vIdx] : 0);
    }

    // Create smooth path using CatmullRomCurve3
    const useSmooth = cfg.smoothTrunk || generation > 0;
    let curve: THREE.CatmullRomCurve3;

    if (useSmooth && positions.length >= 2) {
      curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5);
    } else {
      // For non-smooth paths, use a simple line curve
      curve = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0);
    }

    // Compute path length for tubular segment count
    const pathLength = curve.getLength();
    const tubularSegments = Math.max(2, Math.round(pathLength * tubularSegmentsPerUnit));

    // Build varying-radius tube geometry
    return this.buildVaryingRadiusTube(
      curve,
      radii,
      positions,
      tubularSegments,
      radialSegments,
      generation,
      revDepths,
      cfg
    );
  }

  /**
   * Build a tube geometry with varying radius along the path.
   * Uses CatmullRomCurve3 for the path and constructs custom ring vertices
   * with radius interpolated from the chain's vertex radii.
   */
  private buildVaryingRadiusTube(
    curve: THREE.CatmullRomCurve3,
    radii: number[],
    originalPositions: THREE.Vector3[],
    tubularSegments: number,
    radialSegments: number,
    generation: number,
    revDepths: number[],
    cfg: SkeletonMeshConfig
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const generationAttr: number[] = [];
    const revDepthAttr: number[] = [];
    const indices: number[] = [];

    // Sample the curve at regular intervals
    const frames = curve.computeFrenetFrames(tubularSegments, false);

    // Interpolate radius and rev_depth along the path
    const getRadiusAtT = (t: number): number => {
      // Map t to the index in the original positions/radii array
      const idx = t * (radii.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, radii.length - 1);
      const frac = idx - lo;
      return radii[lo] * (1 - frac) + radii[hi] * frac;
    };

    const getRevDepthAtT = (t: number): number => {
      const idx = t * (revDepths.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, revDepths.length - 1);
      const frac = idx - lo;
      return revDepths[lo] * (1 - frac) + revDepths[hi] * frac;
    };

    // Generate vertices ring by ring
    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const radius = Math.max(getRadiusAtT(t), cfg.minRadius);
      const revDepthVal = getRevDepthAtT(t);

      // Get point on curve
      const point = curve.getPointAt(t);

      // Get the Frenet frame
      const N = frames.normals[i];
      const B = frames.binormals[i];

      // Generate ring of vertices
      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);

        // Normal direction (perpendicular to curve)
        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;

        // Position on the ring
        positions.push(
          point.x + radius * nx,
          point.y + radius * ny,
          point.z + radius * nz
        );

        // Normal
        normals.push(nx, ny, nz);

        // UV
        uvs.push(j / radialSegments, t);

        // Generation attribute
        generationAttr.push(generation);

        // Rev depth attribute
        revDepthAttr.push(revDepthVal);
      }
    }

    // Generate indices connecting rings
    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = (i + 1) * (radialSegments + 1) + (j + 1);
        const d = i * (radialSegments + 1) + (j + 1);

        // Two triangles per quad
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Cap the start
    const startCenterIdx = positions.length / 3;
    const startPoint = curve.getPointAt(0);
    const startTangent = curve.getTangentAt(0).normalize();
    positions.push(startPoint.x, startPoint.y, startPoint.z);
    normals.push(-startTangent.x, -startTangent.y, -startTangent.z);
    uvs.push(0.5, 0);
    generationAttr.push(generation);
    revDepthAttr.push(revDepths.length > 0 ? revDepths[0] : 0);

    for (let j = 0; j < radialSegments; j++) {
      indices.push(startCenterIdx, j + 1, j);
    }

    // Cap the end
    const endCenterIdx = positions.length / 3;
    const endPoint = curve.getPointAt(1);
    const endTangent = curve.getTangentAt(1).normalize();
    positions.push(endPoint.x, endPoint.y, endPoint.z);
    normals.push(endTangent.x, endTangent.y, endTangent.z);
    uvs.push(0.5, 1);
    generationAttr.push(generation);
    revDepthAttr.push(revDepths.length > 0 ? revDepths[revDepths.length - 1] : 0);

    const lastRingStart = tubularSegments * (radialSegments + 1);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(endCenterIdx, lastRingStart + j, lastRingStart + j + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('generation', new THREE.Float32BufferAttribute(generationAttr, 1));
    geometry.setAttribute('aRevDepth', new THREE.Float32BufferAttribute(revDepthAttr, 1));
    geometry.setIndex(indices);

    return geometry;
  }

  // --------------------------------------------------------------------------
  // Geometry Utilities
  // --------------------------------------------------------------------------

  /**
   * Create an empty geometry with the generation attribute.
   */
  private createEmptyGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    geometry.setAttribute('generation', new THREE.Float32BufferAttribute([], 1));
    return geometry;
  }

  /**
   * Merge multiple BufferGeometries into one, preserving the 'generation'
   * and 'aRevDepth' custom vertex attributes.
   * Uses GeometryPipeline.mergeGeometries for the base merge, then
   * re-adds the custom attributes.
   */
  private mergeGeometriesWithGenerationAndRevDepth(
    geometries: THREE.BufferGeometry[]
  ): THREE.BufferGeometry {
    if (geometries.length === 0) return this.createEmptyGeometry();
    if (geometries.length === 1) return geometries[0];

    // Collect generation and rev_depth data before merging
    let totalVertices = 0;
    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
    }
    const mergedGeneration = new Float32Array(totalVertices);
    const mergedRevDepth = new Float32Array(totalVertices);
    let vertexOffset = 0;

    for (const geo of geometries) {
      const genAttr = geo.attributes.generation;
      const rdAttr = geo.attributes.aRevDepth;
      const count = geo.attributes.position.count;
      if (genAttr) {
        for (let i = 0; i < count; i++) {
          mergedGeneration[vertexOffset + i] = genAttr.getX(i);
        }
      }
      if (rdAttr) {
        for (let i = 0; i < count; i++) {
          mergedRevDepth[vertexOffset + i] = rdAttr.getX(i);
        }
      }
      vertexOffset += count;
    }

    const merged = GeometryPipeline.mergeGeometries(geometries);
    merged.setAttribute('generation', new THREE.BufferAttribute(mergedGeneration, 1));
    merged.setAttribute('aRevDepth', new THREE.BufferAttribute(mergedRevDepth, 1));

    return merged;
  }
}
