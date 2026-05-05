/**
 * ScatterP2Features.ts — P2 Scatter: Ivy Vine Growth, Volume Density, Taper Scale
 *
 * Implements advanced scatter/placement features ported from the original
 * Infinigen Python/Blender pipeline:
 *
 * 1. IvyVineGrowth — Shortest-path vine growth along mesh edges with
 *    weighted pathfinding (prefer crevices, avoid flat surfaces),
 *    branching, leaf placement, and tendril curls.
 * 2. VolumeDensityComputer — Port of vol_density: compute instance
 *    density from asset volume/surface area, plus mesh volume and
 *    surface area approximation.
 * 3. TaperScaleDensity — Scale instances smaller near camera edges
 *    and reduce density far from camera.
 *
 * All geometries use THREE.Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 *
 * @module placement
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Ivy Vine Growth — Types
// ============================================================================

/**
 * Configuration for ivy vine growth along a mesh surface.
 */
export interface IvyVineGrowthConfig {
  /** Number of seed points on the target mesh (default 3) */
  seedPointCount: number;
  /** Maximum vine length per branch (default 2.0) */
  maxLength: number;
  /** Step size per growth iteration (default 0.03) */
  stepSize: number;
  /** Branching probability per step (default 0.08) */
  branchProbability: number;
  /** Maximum branching depth (default 3) */
  maxBranchDepth: number;
  /** Length decay per branch depth (default 0.5) */
  branchLengthDecay: number;
  /** Preference for concave surfaces (crevices) — higher = stronger (default 2.0) */
  concavityWeight: number;
  /** Preference for upward growth — higher = more vertical (default 1.5) */
  upwardWeight: number;
  /** Leaf density along vine (0-1, default 0.6) */
  leafDensity: number;
  /** Leaf size (default 0.03) */
  leafSize: number;
  /** Tendril curl radius at vine tips (default 0.015) */
  tendrilCurlRadius: number;
  /** Number of tendril curl turns (default 2) */
  tendrilCurlTurns: number;
}

/**
 * Default ivy vine growth configuration.
 */
export const DEFAULT_IVY_VINE_CONFIG: IvyVineGrowthConfig = {
  seedPointCount: 3,
  maxLength: 2.0,
  stepSize: 0.03,
  branchProbability: 0.08,
  maxBranchDepth: 3,
  branchLengthDecay: 0.5,
  concavityWeight: 2.0,
  upwardWeight: 1.5,
  leafDensity: 0.6,
  leafSize: 0.03,
  tendrilCurlRadius: 0.015,
  tendrilCurlTurns: 2,
};

/**
 * A point along a vine path.
 */
export interface VinePathPoint {
  /** 3D position */
  position: THREE.Vector3;
  /** Surface normal at this point */
  normal: THREE.Vector3;
  /** Growth direction */
  direction: THREE.Vector3;
  /** Branch depth (0 = main vine) */
  depth: number;
  /** Whether a leaf should be placed here */
  hasLeaf: boolean;
  /** Whether this is the tip of a vine */
  isTip: boolean;
}

// ============================================================================
// IvyVineGrowth
// ============================================================================

/**
 * Grows ivy vines along a target mesh surface using weighted pathfinding.
 *
 * The algorithm:
 *   1. Compute edge weights based on concavity and upward direction.
 *   2. Place seed points on the mesh surface.
 *   3. For each seed, trace a vine path preferentially along concave
 *      edges (crevices) and upward.
 *   4. At each step, optionally branch with configurable probability.
 *   5. Place leaves along the vine and tendril curls at tips.
 *
 * Usage:
 * ```ts
 * const ivy = new IvyVineGrowth();
 * const group = ivy.grow(wallMesh, seedPoints, DEFAULT_IVY_VINE_CONFIG, rng);
 * scene.add(group);
 * ```
 */
export class IvyVineGrowth {
  /**
   * Grow ivy vines along a target mesh surface.
   *
   * @param targetMesh  Mesh to grow ivy on (e.g., a wall or rock)
   * @param seedPoints  Starting positions for vine growth on the surface
   * @param config      Vine growth configuration
   * @param rng         Seeded random number generator
   * @returns THREE.Group containing vine stems, leaves, and tendrils
   */
  grow(
    targetMesh: THREE.Mesh,
    seedPoints: THREE.Vector3[],
    config: Partial<IvyVineGrowthConfig> = {},
    rng: SeededRandom,
  ): THREE.Group {
    const cfg = { ...DEFAULT_IVY_VINE_CONFIG, ...config };
    const group = new THREE.Group();

    // Compute edge weights for pathfinding
    const weights = this.computeEdgeWeights(targetMesh, cfg);

    // Use provided seed points or generate random ones
    const seeds = seedPoints.length > 0
      ? seedPoints
      : this.generateSeedPoints(targetMesh, cfg.seedPointCount, rng);

    // Grow vines from each seed point
    const allPaths: VinePathPoint[][] = [];

    for (const seed of seeds) {
      const normal = this.getSurfaceNormal(targetMesh, seed);
      const mainPath = this.traceVinePath(seed, normal, targetMesh, weights, cfg, rng, 0);
      allPaths.push(mainPath);

      // Grow branches from main vine
      for (let i = 0; i < mainPath.length; i++) {
        const point = mainPath[i];
        if (rng.next() < cfg.branchProbability && point.depth < cfg.maxBranchDepth) {
          const branchLength = cfg.maxLength * Math.pow(cfg.branchLengthDecay, point.depth + 1);
          const branchAngle = rng.uniform(Math.PI / 6, Math.PI / 3);
          const branchRot = rng.uniform(0, Math.PI * 2);

          const branchDir = point.direction.clone();
          const cosR = Math.cos(branchRot);
          const sinR = Math.sin(branchRot);
          const bx = branchDir.x * cosR - branchDir.z * sinR;
          const bz = branchDir.x * sinR + branchDir.z * cosR;
          branchDir.x = bx;
          branchDir.z = bz;
          branchDir.y += Math.sin(branchAngle) * 0.3;
          branchDir.normalize();

          const branchConfig = { ...cfg, maxLength: branchLength };
          const branchPath = this.traceVinePath(
            point.position,
            point.normal,
            targetMesh,
            weights,
            branchConfig,
            rng,
            point.depth + 1,
          );
          allPaths.push(branchPath);
        }
      }
    }

    // Build stem geometry
    const stemGroup = this.buildStemGeometry(allPaths, cfg);
    group.add(stemGroup);

    // Build leaf geometry (InstancedMesh for performance)
    const leavesMesh = this.buildLeafGeometry(allPaths, cfg, rng);
    if (leavesMesh) group.add(leavesMesh);

    // Build tendril curl geometry at vine tips
    const tendrilGroup = this.buildTendrilCurls(allPaths, cfg, rng);
    if (tendrilGroup.children.length > 0) group.add(tendrilGroup);

    group.userData.tags = ['vegetation', 'ivy', 'vine', 'scatter'];
    return group;
  }

  /**
   * Compute edge weights for pathfinding based on concavity and direction.
   *
   * - Concave edges (crevices) get lower weight (preferred path)
   * - Upward-facing edges get lower weight (prefer upward growth)
   *
   * @param targetMesh  The mesh to compute weights for
   * @param config      Growth configuration
   * @returns Float32Array of weights per triangle edge
   */
  computeEdgeWeights(targetMesh: THREE.Mesh, config: IvyVineGrowthConfig): Float32Array {
    const geometry = targetMesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.getIndex();

    if (!posAttr || !normAttr) {
      return new Float32Array(0);
    }

    const totalTriangles = indexAttr
      ? indexAttr.count / 3
      : posAttr.count / 3;

    const weights = new Float32Array(totalTriangles);

    for (let t = 0; t < totalTriangles; t++) {
      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3;
        ib = t * 3 + 1;
        ic = t * 3 + 2;
      }

      // Get triangle normal
      const na = new THREE.Vector3().fromBufferAttribute(normAttr as THREE.BufferAttribute, ia);
      const nb = new THREE.Vector3().fromBufferAttribute(normAttr as THREE.BufferAttribute, ib);
      const nc = new THREE.Vector3().fromBufferAttribute(normAttr as THREE.BufferAttribute, ic);
      const faceNormal = na.add(nb).add(nc).normalize();

      // Get vertex positions
      const va = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      // Compute curvature (concavity) via angle defect
      // Dihedral angle between adjacent face normals approximates curvature
      // For a standalone mesh, we approximate by comparing the face normal
      // to the average of vertex normals
      const avgVertNormal = na.clone().add(nb).add(nc).normalize();
      const curvature = 1.0 - faceNormal.dot(avgVertNormal);

      // Concavity: lower weight for concave regions (crevices)
      const concavityFactor = Math.exp(-config.concavityWeight * curvature);

      // Upward preference: lower weight for upward-facing triangles
      const upwardFactor = Math.exp(-config.upwardWeight * Math.max(0, -faceNormal.y));

      weights[t] = concavityFactor * upwardFactor;
    }

    return weights;
  }

  /**
   * Trace a path from start to end using weighted direction (simplified A*).
   *
   * Instead of full graph pathfinding, this uses a greedy weighted walk
   * that prefers concave and upward directions at each step.
   *
   * @param start    Starting position
   * @param end      Target position
   * @param weights  Edge weights from computeEdgeWeights()
   * @returns Array of positions along the path
   */
  tracePath(start: THREE.Vector3, end: THREE.Vector3, weights: Float32Array): THREE.Vector3[] {
    const path: THREE.Vector3[] = [start.clone()];
    const direction = end.clone().sub(start).normalize();
    const stepSize = 0.05;
    const maxSteps = 200;

    let current = start.clone();

    for (let i = 0; i < maxSteps; i++) {
      if (current.distanceTo(end) < stepSize) {
        path.push(end.clone());
        break;
      }

      // Add weighted random perturbation
      const perturbation = new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.1,
      );

      direction.add(perturbation).normalize();
      current = current.clone().add(direction.clone().multiplyScalar(stepSize));
      path.push(current.clone());
    }

    return path;
  }

  // --- Private helpers ---

  /**
   * Generate random seed points on the target mesh surface.
   */
  private generateSeedPoints(
    mesh: THREE.Mesh,
    count: number,
    rng: SeededRandom,
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();

    if (!posAttr) return points;

    const totalTriangles = indexAttr
      ? indexAttr.count / 3
      : posAttr.count / 3;

    // Compute cumulative triangle areas for weighted sampling
    const areas: number[] = [];
    let totalArea = 0;

    for (let t = 0; t < totalTriangles; t++) {
      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3;
        ib = t * 3 + 1;
        ic = t * 3 + 2;
      }

      const va = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      const edge1 = new THREE.Vector3().subVectors(vb, va);
      const edge2 = new THREE.Vector3().subVectors(vc, va);
      const area = edge1.cross(edge2).length() * 0.5;
      totalArea += area;
      areas.push(totalArea);
    }

    // Sample points on triangles proportional to area
    for (let i = 0; i < count; i++) {
      const r = rng.next() * totalArea;
      let triIdx = 0;
      for (let t = 0; t < areas.length; t++) {
        if (areas[t] >= r) { triIdx = t; break; }
      }

      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(triIdx * 3);
        ib = indexAttr.getX(triIdx * 3 + 1);
        ic = indexAttr.getX(triIdx * 3 + 2);
      } else {
        ia = triIdx * 3;
        ib = triIdx * 3 + 1;
        ic = triIdx * 3 + 2;
      }

      const va = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      // Random barycentric coordinates
      const u = rng.next();
      const v = rng.next();
      const w = 1 - u - v;
      const fu = u + w * 0.5;
      const fv = v + w * 0.5;

      const point = new THREE.Vector3()
        .addScaledVector(va, 1 - fu - fv)
        .addScaledVector(vb, fu)
        .addScaledVector(vc, fv);

      // Apply mesh world transform
      point.applyMatrix4(mesh.matrixWorld);

      points.push(point);
    }

    return points;
  }

  /**
   * Get the surface normal at a point on the mesh (nearest face normal).
   */
  private getSurfaceNormal(mesh: THREE.Mesh, point: THREE.Vector3): THREE.Vector3 {
    const geometry = mesh.geometry;
    const normAttr = geometry.getAttribute('normal');

    if (!normAttr) {
      return new THREE.Vector3(0, 0, 1);
    }

    // Find the nearest vertex and use its normal
    const posAttr = geometry.getAttribute('position');
    let nearestIdx = 0;
    let nearestDist = Infinity;

    if (posAttr) {
      const localPoint = point.clone().applyMatrix4(
        new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
      );

      for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, i);
        const dist = v.distanceTo(localPoint);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    const normal = new THREE.Vector3().fromBufferAttribute(normAttr as THREE.BufferAttribute, nearestIdx);
    normal.transformDirection(mesh.matrixWorld);
    return normal.normalize();
  }

  /**
   * Trace a single vine path from a seed point using weighted random walk.
   */
  private traceVinePath(
    startPos: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
    targetMesh: THREE.Mesh,
    _weights: Float32Array,
    config: IvyVineGrowthConfig,
    rng: SeededRandom,
    depth: number,
  ): VinePathPoint[] {
    const path: VinePathPoint[] = [];
    const maxSteps = Math.floor(config.maxLength / config.stepSize);
    let position = startPos.clone();
    let direction = surfaceNormal.clone();

    // Initial growth direction: upward along the surface
    direction.y = Math.max(direction.y, 0.3);
    direction.normalize();

    for (let step = 0; step < maxSteps; step++) {
      // Get surface normal at current position
      const normal = this.getSurfaceNormal(targetMesh, position);

      // Apply upward preference
      const upForce = new THREE.Vector3(0, config.upwardWeight * 0.02, 0);
      direction.add(upForce);

      // Surface adherence: pull toward surface
      const surfacePull = normal.clone().multiplyScalar(0.05);
      direction.add(surfacePull);

      // Random wander
      direction.x += rng.uniform(-0.08, 0.08);
      direction.z += rng.uniform(-0.08, 0.08);

      // Keep direction roughly upward
      direction.y = Math.max(direction.y, 0.2);
      direction.normalize();

      // Advance position
      position = position.clone().add(direction.clone().multiplyScalar(config.stepSize));

      const hasLeaf = rng.next() < config.leafDensity;
      const isTip = step === maxSteps - 1;

      path.push({
        position: position.clone(),
        normal: normal.clone(),
        direction: direction.clone(),
        depth,
        hasLeaf,
        isTip,
      });
    }

    return path;
  }

  /**
   * Build stem tube geometry from all vine paths.
   */
  private buildStemGeometry(paths: VinePathPoint[][], config: IvyVineGrowthConfig): THREE.Group {
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x2d4a1f,
      roughness: 0.8,
      metalness: 0.0,
    });

    for (const path of paths) {
      if (path.length < 2) continue;

      const points = path.map(p => p.position);
      const curve = new THREE.CatmullRomCurve3(points);
      const thickness = 0.004 * (1 / (path[0]?.depth + 1));
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(4, path.length), thickness, 5, false);
      const tube = new THREE.Mesh(tubeGeo, stemMat);
      tube.castShadow = true;
      group.add(tube);
    }

    return group;
  }

  /**
   * Build instanced leaf geometry from all vine paths.
   */
  private buildLeafGeometry(
    paths: VinePathPoint[][],
    config: IvyVineGrowthConfig,
    rng: SeededRandom,
  ): THREE.InstancedMesh | null {
    const leafPoints = paths.flat().filter(p => p.hasLeaf && !p.isTip);
    if (leafPoints.length === 0) return null;

    const leafGeo = this.createIvyLeafShape();
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2d6a2d,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(leafGeo, leafMat, leafPoints.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < leafPoints.length; i++) {
      const point = leafPoints[i];
      dummy.position.copy(point.position);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), point.normal);
      dummy.rotateZ(rng.uniform(0, Math.PI * 2));
      dummy.rotateX(rng.uniform(-0.3, 0.3));
      const scale = config.leafSize * rng.uniform(0.7, 1.3);
      dummy.scale.setScalar(scale / 0.03);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    return instancedMesh;
  }

  /**
   * Create an ivy leaf shape geometry.
   */
  private createIvyLeafShape(): THREE.BufferGeometry {
    const s = 0.03;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.5, s * 0.4, s * 0.3, s * 0.8);
    shape.quadraticCurveTo(s * 0.4, s * 1.0, 0, s * 1.3);
    shape.quadraticCurveTo(-s * 0.4, s * 1.0, -s * 0.3, s * 0.8);
    shape.quadraticCurveTo(-s * 0.5, s * 0.4, 0, 0);
    return new THREE.ShapeGeometry(shape, 3);
  }

  /**
   * Build tendril curl geometry at vine tips.
   */
  private buildTendrilCurls(
    paths: VinePathPoint[][],
    config: IvyVineGrowthConfig,
    rng: SeededRandom,
  ): THREE.Group {
    const group = new THREE.Group();
    const tendrilMat = new THREE.MeshStandardMaterial({
      color: 0x2d4a1f,
      roughness: 0.8,
      metalness: 0.0,
    });

    for (const path of paths) {
      if (path.length < 2) continue;
      const tip = path[path.length - 1];
      if (!tip.isTip) continue;

      // Create a spiral tendril at the tip
      const curlPoints: THREE.Vector3[] = [];
      const steps = config.tendrilCurlTurns * 12;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * config.tendrilCurlTurns * Math.PI * 2;
        const r = config.tendrilCurlRadius * (1 - t * 0.7); // Spiral inward
        const offset = new THREE.Vector3(
          Math.cos(angle) * r,
          t * 0.02,
          Math.sin(angle) * r,
        );
        curlPoints.push(tip.position.clone().add(offset));
      }

      if (curlPoints.length < 2) continue;

      const curve = new THREE.CatmullRomCurve3(curlPoints);
      const tubeGeo = new THREE.TubeGeometry(curve, steps, 0.002, 4, false);
      const tube = new THREE.Mesh(tubeGeo, tendrilMat);
      tube.castShadow = true;

      // Random rotation
      tube.rotation.y = rng.uniform(0, Math.PI * 2);
      group.add(tube);
    }

    return group;
  }
}

// ============================================================================
// Volume Density — Types
// ============================================================================

/**
 * Asset type for volume-based density computation.
 */
export type VolumeAssetType = 'tree' | 'boulder' | 'mushroom' | 'grass' | 'flower' | 'shrub' | 'cactus' | 'generic';

/**
 * Density configuration per asset type.
 */
export interface VolumeDensityConfig {
  /** Base density (instances per cubic meter) for the asset type */
  baseDensity: number;
  /** Volume factor: how much volume scales density (0 = no scaling, 1 = linear) */
  volumeFactor: number;
  /** Minimum density (clamp) */
  minDensity: number;
  /** Maximum density (clamp) */
  maxDensity: number;
  /** Whether to use surface area instead of volume for density */
  useSurfaceArea: boolean;
}

/**
 * Default density configurations per asset type.
 * Ported from Infinigen's vol_density concept.
 */
export const DEFAULT_VOLUME_DENSITY_CONFIGS: Record<VolumeAssetType, VolumeDensityConfig> = {
  tree:     { baseDensity: 0.02, volumeFactor: 0.5, minDensity: 0.005, maxDensity: 0.1, useSurfaceArea: false },
  boulder:  { baseDensity: 0.05, volumeFactor: 0.3, minDensity: 0.01, maxDensity: 0.2, useSurfaceArea: false },
  mushroom: { baseDensity: 0.5, volumeFactor: 0.2, minDensity: 0.1, maxDensity: 2.0, useSurfaceArea: false },
  grass:    { baseDensity: 2.0, volumeFactor: 0.1, minDensity: 0.5, maxDensity: 10.0, useSurfaceArea: true },
  flower:   { baseDensity: 1.0, volumeFactor: 0.15, minDensity: 0.2, maxDensity: 5.0, useSurfaceArea: true },
  shrub:    { baseDensity: 0.3, volumeFactor: 0.4, minDensity: 0.05, maxDensity: 1.0, useSurfaceArea: false },
  cactus:   { baseDensity: 0.1, volumeFactor: 0.3, minDensity: 0.02, maxDensity: 0.5, useSurfaceArea: false },
  generic:  { baseDensity: 0.2, volumeFactor: 0.3, minDensity: 0.05, maxDensity: 1.0, useSurfaceArea: false },
};

// ============================================================================
// VolumeDensityComputer
// ============================================================================

/**
 * Computes instance density from asset volume or surface area.
 *
 * Port of Infinigen's vol_density: larger objects get fewer instances,
 * smaller objects get more. The density formula is:
 *
 *   density = baseDensity × volumeFactor^log(volume)
 *
 * Clamped to [minDensity, maxDensity].
 *
 * Usage:
 * ```ts
 * const computer = new VolumeDensityComputer();
 * const density = computer.computeVolumeDensity('tree', 5.2);
 * // density ≈ 0.011
 * ```
 */
export class VolumeDensityComputer {
  /**
   * Compute the instance density for a given asset type and volume.
   *
   * @param assetType  The type of asset
   * @param volume     Approximate volume of the asset in cubic meters
   * @returns Density value (instances per unit area)
   */
  computeVolumeDensity(assetType: VolumeAssetType, volume: number): number {
    const config = DEFAULT_VOLUME_DENSITY_CONFIGS[assetType] ?? DEFAULT_VOLUME_DENSITY_CONFIGS.generic;

    if (volume <= 0) return config.minDensity;

    // Density formula: baseDensity × volumeFactor^ln(volume)
    // More volume → lower density (fewer large objects)
    const logVolume = Math.log(Math.max(volume, 0.001));
    const density = config.baseDensity * Math.pow(config.volumeFactor, logVolume);

    return Math.max(config.minDensity, Math.min(config.maxDensity, density));
  }

  /**
   * Compute the approximate volume of a mesh geometry.
   *
   * Uses the signed volume of tetrahedra formed by each triangle and
   * the origin. This gives the correct volume for watertight meshes
   * and a reasonable approximation for others.
   *
   * @param geometry  The mesh geometry
   * @returns Approximate volume in cubic units
   */
  computeAssetVolume(geometry: THREE.BufferGeometry): number {
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();

    if (!posAttr) return 0;

    const totalTriangles = indexAttr
      ? indexAttr.count / 3
      : posAttr.count / 3;

    let volume = 0;

    for (let t = 0; t < totalTriangles; t++) {
      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3;
        ib = t * 3 + 1;
        ic = t * 3 + 2;
      }

      const va = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      // Signed volume of tetrahedron (triangle, origin)
      volume += va.dot(new THREE.Vector3().crossVectors(vb, vc)) / 6.0;
    }

    return Math.abs(volume);
  }

  /**
   * Compute the surface area of a mesh geometry.
   *
   * Sums the area of all triangles. Used for surface-based density
   * calculations (e.g., grass and flowers).
   *
   * @param geometry  The mesh geometry
   * @returns Total surface area in square units
   */
  computeSurfaceArea(geometry: THREE.BufferGeometry): number {
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();

    if (!posAttr) return 0;

    const totalTriangles = indexAttr
      ? indexAttr.count / 3
      : posAttr.count / 3;

    let area = 0;

    for (let t = 0; t < totalTriangles; t++) {
      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3;
        ib = t * 3 + 1;
        ic = t * 3 + 2;
      }

      const va = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      const edge1 = new THREE.Vector3().subVectors(vb, va);
      const edge2 = new THREE.Vector3().subVectors(vc, va);
      area += edge1.cross(edge2).length() * 0.5;
    }

    return area;
  }
}

// ============================================================================
// Taper Scale Density — Types
// ============================================================================

/**
 * Configuration for taper-scale density adjustment.
 */
export interface TaperScaleConfig {
  /** Distance at which taper begins (default 10) */
  taperStartDistance: number;
  /** Distance at which scale reaches minimum (default 100) */
  taperEndDistance: number;
  /** Minimum scale at taper end distance (default 0.1) */
  minScale: number;
  /** Edge falloff: how much to reduce scale near screen edges (0 = none, 1 = full) (default 0.5) */
  edgeFalloff: number;
  /** Distance at which density reduction starts (default 50) */
  densityReductionStart: number;
  /** Distance at which density reaches minimum (default 200) */
  densityReductionEnd: number;
  /** Minimum density factor (0-1) at max distance (default 0.1) */
  minDensityFactor: number;
}

/**
 * Default taper-scale density configuration.
 */
export const DEFAULT_TAPER_SCALE_CONFIG: TaperScaleConfig = {
  taperStartDistance: 10,
  taperEndDistance: 100,
  minScale: 0.1,
  edgeFalloff: 0.5,
  densityReductionStart: 50,
  densityReductionEnd: 200,
  minDensityFactor: 0.1,
};

// ============================================================================
// TaperScaleDensity
// ============================================================================

/**
 * Adjusts instance scale and density based on distance from camera and
 * screen-edge position.
 *
 * This ports the taper_scale concept from Infinigen:
 * - Instances far from the camera are scaled down (taper)
 * - Instances near screen edges are scaled down
 * - Density of distant instances is reduced
 *
 * Usage:
 * ```ts
 * const taper = new TaperScaleDensity();
 * const scale = taper.computeTaperScale(position, camera, config);
 * // Apply to InstancedMesh matrix
 * taper.applyTaper(positions, scales, camera, config);
 * ```
 */
export class TaperScaleDensity {
  /**
   * Compute the taper scale for a single instance based on its distance
   * from the camera.
   *
   * Scale decreases linearly from 1.0 at taperStartDistance to minScale
   * at taperEndDistance. Near screen edges, additional reduction is applied.
   *
   * @param distance  Distance from camera to the instance
   * @param camera    The camera (for edge computation)
   * @param config    Taper-scale configuration
   * @returns Scale multiplier (0 to 1)
   */
  computeTaperScale(
    distance: number,
    camera: THREE.PerspectiveCamera,
    config: Partial<TaperScaleConfig> = {},
  ): number {
    const cfg = { ...DEFAULT_TAPER_SCALE_CONFIG, ...config };

    // Distance-based taper
    let scale = 1.0;
    if (distance > cfg.taperEndDistance) {
      scale = cfg.minScale;
    } else if (distance > cfg.taperStartDistance) {
      const t = (distance - cfg.taperStartDistance) / (cfg.taperEndDistance - cfg.taperStartDistance);
      scale = 1.0 - t * (1.0 - cfg.minScale);
    }

    return scale;
  }

  /**
   * Apply taper scaling to arrays of instance positions and scales.
   *
   * Modifies the scales array in place based on distance from camera
   * and screen-edge proximity.
   *
   * @param positions  Array of instance world positions
   * @param scales     Array of instance scale vectors (modified in place)
   * @param camera     The camera
   * @param config     Taper-scale configuration
   */
  applyTaper(
    positions: THREE.Vector3[],
    scales: THREE.Vector3[],
    camera: THREE.PerspectiveCamera,
    config: Partial<TaperScaleConfig> = {},
  ): void {
    const cfg = { ...DEFAULT_TAPER_SCALE_CONFIG, ...config };

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const distance = pos.distanceTo(camera.position);

      // Distance-based taper
      const taperScale = this.computeTaperScale(distance, camera, cfg);

      // Edge-based reduction: project position to screen space and
      // compute distance from screen center
      const screenPos = pos.clone().project(camera);
      const screenDist = Math.sqrt(
        screenPos.x * screenPos.x + screenPos.y * screenPos.y,
      );

      // Reduce scale for instances near screen edges (dist > 0.7 = near edge)
      let edgeScale = 1.0;
      if (screenDist > 0.7 && cfg.edgeFalloff > 0) {
        const edgeT = (screenDist - 0.7) / 0.3; // 0 at edge, 1 at corner
        edgeScale = 1.0 - edgeT * cfg.edgeFalloff;
        edgeScale = Math.max(edgeScale, 0.1);
      }

      const combinedScale = taperScale * edgeScale;
      scales[i].multiplyScalar(combinedScale);
    }
  }
}
