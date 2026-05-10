/**
 * ScatterClustering.ts — Spatial Clustering for Natural Scatter Distribution
 *
 * Implements Poisson Disk Sampling, Clustered Distribution, and Natural Distribution
 * for realistic scatter placement. Replaces simple random placement with
 * blue-noise and clustered patterns that look more natural.
 *
 * @module assets/scatters
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Poisson Disk Sampler
// ============================================================================

/**
 * Blue-noise distribution with minimum distance constraint.
 * Produces well-spaced, natural-looking point distributions.
 *
 * Uses Bridson's algorithm for O(N) Poisson disk sampling.
 */
export class PoissonDiskSampler {
  private minDistance: number;
  private maxAttempts: number;
  private rng: SeededRandom;

  constructor(
    minDistance: number = 1.0,
    maxAttempts: number = 30,
    seed: number = 42
  ) {
    this.minDistance = minDistance;
    this.maxAttempts = maxAttempts;
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate Poisson disk samples within a 2D area.
   *
   * @param width Area width
   * @param height Area height
   * @param center Center of the area
   * @returns Array of 2D sample positions
   */
  sample2D(
    width: number,
    height: number,
    center: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ): THREE.Vector2[] {
    const cellSize = this.minDistance / Math.SQRT2;
    const gridW = Math.ceil(width / cellSize);
    const gridH = Math.ceil(height / cellSize);
    const grid: (number | null)[][] = Array.from({ length: gridW }, () =>
      Array(gridH).fill(null)
    );

    const points: THREE.Vector2[] = [];
    const active: number[] = [];

    // Initial point at center
    const p0 = new THREE.Vector2(
      center.x + this.rng.uniform(0, width),
      center.z + this.rng.uniform(0, height)
    );
    points.push(p0);
    active.push(0);
    this.insertGrid(grid, p0, 0, cellSize, center, width, height);

    while (active.length > 0) {
      const activeIdx = Math.floor(this.rng.next() * active.length);
      const pointIdx = active[activeIdx];
      const point = points[pointIdx];

      let found = false;
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        // Generate random point in annulus [minDist, 2*minDist]
        const angle = this.rng.uniform(0, Math.PI * 2);
        const dist = this.minDistance * (1 + this.rng.next());
        const newPoint = new THREE.Vector2(
          point.x + Math.cos(angle) * dist,
          point.y + Math.sin(angle) * dist
        );

        // Check if within bounds
        if (
          newPoint.x < center.x ||
          newPoint.x > center.x + width ||
          newPoint.y < center.z ||
          newPoint.y > center.z + height
        ) {
          continue;
        }

        // Check if far enough from existing points
        if (this.isFarEnough(grid, newPoint, points, cellSize, center, width, height)) {
          const newIdx = points.length;
          points.push(newPoint);
          active.push(newIdx);
          this.insertGrid(grid, newPoint, newIdx, cellSize, center, width, height);
          found = true;
          break;
        }
      }

      if (!found) {
        // Remove from active list
        active.splice(activeIdx, 1);
      }
    }

    return points;
  }

  /**
   * Generate Poisson disk samples on a 3D surface (projected to 2D, then lifted).
   *
   * @param geometry Surface geometry to sample on
   * @param density Samples per unit area
   * @returns Array of 3D sample positions
   */
  sampleOnSurface(
    geometry: THREE.BufferGeometry,
    density: number = 1.0
  ): THREE.Vector3[] {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);

    const area = size.x * size.z;
    const numSamples = Math.floor(area * density);
    const minDist = Math.sqrt(area / numSamples) * 0.8;

    const sampler = new PoissonDiskSampler(minDist, 30, this.rng.nextInt(0, 9999));
    const points2D = sampler.sample2D(size.x, size.z, box.min);

    // Project 2D points onto the surface (simplified: use bounding box Y)
    const positions: THREE.Vector3[] = [];
    for (const pt of points2D) {
      positions.push(new THREE.Vector3(pt.x, box.min.y, pt.y));
    }

    return positions;
  }

  private insertGrid(
    grid: (number | null)[][],
    point: THREE.Vector2,
    idx: number,
    cellSize: number,
    center: THREE.Vector3,
    width: number,
    height: number
  ): void {
    const gx = Math.floor((point.x - center.x) / cellSize);
    const gy = Math.floor((point.y - center.z) / cellSize);
    if (gx >= 0 && gx < grid.length && gy >= 0 && gy < grid[0].length) {
      grid[gx][gy] = idx;
    }
  }

  private isFarEnough(
    grid: (number | null)[][],
    point: THREE.Vector2,
    points: THREE.Vector2[],
    cellSize: number,
    center: THREE.Vector3,
    _width: number,
    _height: number
  ): boolean {
    const gx = Math.floor((point.x - center.x) / cellSize);
    const gy = Math.floor((point.y - center.z) / cellSize);

    // Check 5x5 neighborhood
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= grid.length || ny < 0 || ny >= grid[0].length) continue;

        const idx = grid[nx][ny];
        if (idx === null) continue;

        const other = points[idx];
        const dist = point.distanceTo(other);
        if (dist < this.minDistance) return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Clustered Distribution
// ============================================================================

/** Configuration for clustered distribution */
export interface ClusterConfig {
  /** Size of each cluster (radius) */
  clusterRadius: number;
  /** Number of clusters per area unit */
  clusterCount: number;
  /** Density within clusters (instances per cluster) */
  intraClusterDensity: number;
  /** Minimum gap between cluster centers */
  interClusterGap: number;
  /** Random seed */
  seed: number;
}

const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  clusterRadius: 2.0,
  clusterCount: 10,
  intraClusterDensity: 15,
  interClusterGap: 3.0,
  seed: 42,
};

/**
 * Groups instances into clusters for natural distribution.
 * Plants, rocks, and other scatter objects in nature tend to cluster
 * rather than distribute uniformly.
 */
export class ClusteredDistribution {
  private config: ClusterConfig;
  private rng: SeededRandom;

  constructor(config: Partial<ClusterConfig> = {}) {
    this.config = { ...DEFAULT_CLUSTER_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate clustered point positions within an area.
   *
   * @param width Area width
   * @param height Area depth
   * @param center Area center
   * @returns Array of 3D point positions
   */
  generate(
    width: number,
    height: number,
    center: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];

    // Step 1: Generate cluster centers with minimum inter-cluster gap
    const clusterCenters: THREE.Vector3[] = [];
    let attempts = 0;
    const maxAttempts = this.config.clusterCount * 20;

    while (clusterCenters.length < this.config.clusterCount && attempts < maxAttempts) {
      attempts++;
      const cx = center.x + this.rng.uniform(-width / 2, width / 2);
      const cz = center.z + this.rng.uniform(-height / 2, height / 2);
      const candidate = new THREE.Vector3(cx, center.y, cz);

      // Check minimum gap from existing clusters
      let tooClose = false;
      for (const existing of clusterCenters) {
        if (candidate.distanceTo(existing) < this.config.interClusterGap) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        clusterCenters.push(candidate);
      }
    }

    // Step 2: For each cluster, generate points within the cluster radius
    for (const clusterCenter of clusterCenters) {
      for (let i = 0; i < this.config.intraClusterDensity; i++) {
        // Gaussian-like distribution within cluster (more points near center)
        const angle = this.rng.uniform(0, Math.PI * 2);
        const dist = this.rng.next() * this.config.clusterRadius;
        const r = dist * dist / this.config.clusterRadius; // Quadratic falloff

        const px = clusterCenter.x + Math.cos(angle) * r;
        const pz = clusterCenter.z + Math.sin(angle) * r;
        const py = clusterCenter.y + this.rng.uniform(-0.05, 0.05);

        points.push(new THREE.Vector3(px, py, pz));
      }
    }

    return points;
  }
}

// ============================================================================
// Natural Distribution
// ============================================================================

/**
 * Combines Poisson disk + clusters for the most natural-looking distribution.
 * Background points are well-spaced (Poisson disk), with occasional
 * dense clusters (like groves of trees or patches of flowers).
 *
 * This matches how vegetation naturally distributes: some areas are dense
 * thickets, others are sparse, and overall there's a natural spacing.
 */
export class NaturalDistribution {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate naturally distributed points combining blue-noise background
   * with clustered foreground.
   *
   * @param width Area width
   * @param height Area depth
   * @param totalDensity Average points per unit area
   * @param clusterFraction Fraction of points that are in clusters (0-1, default 0.3)
   * @param center Area center
   * @returns Array of 3D point positions
   */
  generate(
    width: number,
    height: number,
    totalDensity: number = 0.5,
    clusterFraction: number = 0.3,
    center: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ): THREE.Vector3[] {
    const area = width * height;
    const totalPoints = Math.floor(area * totalDensity);
    const clusterPoints = Math.floor(totalPoints * clusterFraction);
    const backgroundPoints = totalPoints - clusterPoints;

    const points: THREE.Vector3[] = [];

    // Background: Poisson disk for well-spaced distribution
    if (backgroundPoints > 0) {
      const minDist = Math.sqrt(area / backgroundPoints) * 0.7;
      const poisson = new PoissonDiskSampler(minDist, 20, this.rng.nextInt(0, 9999));
      const bgPoints = poisson.sample2D(width, height, center);

      for (const pt of bgPoints) {
        if (points.length >= backgroundPoints) break;
        points.push(new THREE.Vector3(pt.x, center.y, pt.y));
      }
    }

    // Foreground: Clustered distribution for dense patches
    if (clusterPoints > 0) {
      const numClusters = Math.max(1, Math.floor(clusterPoints / 10));
      const clustered = new ClusteredDistribution({
        clusterRadius: Math.min(width, height) * 0.1,
        clusterCount: numClusters,
        intraClusterDensity: Math.ceil(clusterPoints / numClusters),
        interClusterGap: Math.min(width, height) * 0.2,
        seed: this.rng.nextInt(0, 9999),
      });

      const clusterPts = clustered.generate(width, height, center);
      points.push(...clusterPts);
    }

    return points;
  }
}
