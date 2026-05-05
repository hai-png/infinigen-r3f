/**
 * MushroomGenerator - Enhanced procedural mushroom generation
 *
 * Features:
 * - Cap shapes: convex, flat, conical, funnel, umbonate
 * - Gills/pores underside detail
 * - Stem with ring/annulus
 * - 5+ species: agaric, bolete, chanterelle, morel, shelf
 * - Color variation per species
 * - Instanced cluster generation
 * - KDTree-based collision avoidance for natural cluster placement
 *
 * All geometries use Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

// ============================================================================
// Types
// ============================================================================

export type MushroomCapShape = 'convex' | 'flat' | 'conical' | 'funnel' | 'umbonate';
export type MushroomSpecies = 'agaric' | 'bolete' | 'chanterelle' | 'morel' | 'shelf' | 'button' | 'shiitake';

export interface MushroomCapConfig {
  /** Cap shape */
  shape: MushroomCapShape;
  /** Cap radius */
  radius: number;
  /** Cap height (for non-spherical shapes) */
  height: number;
  /** Whether the cap has an umbo (central bump) */
  hasUmbo: boolean;
  /** Whether the cap edge curves inward */
  inrolledEdge: boolean;
  /** Cap texture scale (for bumps) */
  textureScale: number;
}

export interface MushroomGillConfig {
  /** Gill type: lamellae (blades), pores, or none */
  type: 'lamellae' | 'pores' | 'none';
  /** Number of gills (for lamellae) */
  count: number;
  /** Gill depth */
  depth: number;
  /** Color */
  color: number;
}

export interface MushroomStemConfig {
  /** Stem height */
  height: number;
  /** Stem radius at top */
  radiusTop: number;
  /** Stem radius at bottom */
  radiusBottom: number;
  /** Whether the stem has a ring/annulus */
  hasRing: boolean;
  /** Ring position as fraction of stem height */
  ringPosition: number;
  /** Ring size multiplier */
  ringSize: number;
}

export interface MushroomConfig extends BaseGeneratorConfig {
  cap: MushroomCapConfig;
  gills: MushroomGillConfig;
  stem: MushroomStemConfig;
  species: MushroomSpecies;
  capColor: number;
  stemColor: number;
  gillDetail: boolean;
  /**
   * Minimum spacing between mushrooms in a cluster, in world units.
   * This base value is scaled by each mushroom's random scale factor,
   * so larger mushrooms push neighbors further away.
   * @default 0.05
   */
  minSpacing: number;
}

// ============================================================================
// SimpleKDTree2D — Inline 2D KD-Tree for collision avoidance
// ============================================================================

/**
 * A point stored in the KDTree, representing a placed mushroom's
 * position on the ground plane (x, z).
 */
interface KDPoint {
  x: number;
  z: number;
}

/**
 * A node in the {@link SimpleKDTree2D}.
 *
 * The tree alternates splitting on the x-axis (depth % 2 === 0) and
 * z-axis (depth % 2 === 1) at each level, following the classic
 * KD-tree construction.
 */
interface KDNode {
  point: KDPoint;
  left: KDNode | null;
  right: KDNode | null;
}

/**
 * SimpleKDTree2D — A lightweight, inline 2D KD-tree for spatial queries
 * on the x-z ground plane.
 *
 * Designed specifically for mushroom cluster collision avoidance:
 * - {@link insert} adds a new point to the tree.
 * - {@link findNearest} returns the closest existing point to a query.
 * - {@link findAllWithinRadius} returns all points within a given distance.
 *
 * The implementation is recursive and prioritises readability over
 * production-grade performance. For typical cluster sizes (10–50 mushrooms)
 * the overhead is negligible.
 *
 * @example
 * ```ts
 * const tree = new SimpleKDTree2D();
 * tree.insert(0.1, 0.2);
 * tree.insert(0.5, 0.3);
 *
 * const nearest = tree.findNearest(0.12, 0.18);
 * // nearest => { x: 0.1, z: 0.2, dist: ~0.028 }
 *
 * const nearby = tree.findAllWithinRadius(0.1, 0.2, 0.5);
 * // nearby => [{ x: 0.1, z: 0.2, dist: 0 }, { x: 0.5, z: 0.3, dist: ~0.412 }]
 * ```
 */
class SimpleKDTree2D {
  private root: KDNode | null = null;

  /**
   * Insert a new point (x, z) into the tree.
   *
   * @param x - World-space x coordinate
   * @param z - World-space z coordinate
   */
  insert(x: number, z: number): void {
    const point: KDPoint = { x, z };
    this.root = this.insertNode(this.root, point, 0);
  }

  /**
   * Find the nearest existing point to (x, z).
   *
   * Returns `null` if the tree is empty. The distance is Euclidean
   * computed on the 2D x-z plane (y is ignored).
   *
   * @param x - Query x coordinate
   * @param z - Query z coordinate
   * @returns The nearest point with its distance, or null
   */
  findNearest(x: number, z: number): { x: number; z: number; dist: number } | null {
    if (!this.root) return null;
    return this.findNearestNode(this.root, x, z, 0, {
      x: 0,
      z: 0,
      dist: Infinity,
    });
  }

  /**
   * Find all existing points within `radius` of (x, z).
   *
   * Returns an array sorted by ascending distance. The distance is
   * Euclidean on the 2D x-z plane.
   *
   * @param x     - Query x coordinate
   * @param z     - Query z coordinate
   * @param radius - Search radius (must be >= 0)
   * @returns Array of nearby points with distances
   */
  findAllWithinRadius(x: number, z: number, radius: number): Array<{ x: number; z: number; dist: number }> {
    const results: Array<{ x: number; z: number; dist: number }> = [];
    this.searchRadius(this.root, x, z, radius, 0, results);
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Recursive insert following alternating axis splits. */
  private insertNode(node: KDNode | null, point: KDPoint, depth: number): KDNode {
    if (!node) {
      return { point, left: null, right: null };
    }

    const axis = depth % 2; // 0 = x, 1 = z
    const nodeVal = axis === 0 ? node.point.x : node.point.z;
    const pointVal = axis === 0 ? point.x : point.z;

    if (pointVal < nodeVal) {
      node.left = this.insertNode(node.left, point, depth + 1);
    } else {
      node.right = this.insertNode(node.right, point, depth + 1);
    }

    return node;
  }

  /** Recursive nearest-neighbour search with branch pruning. */
  private findNearestNode(
    node: KDNode,
    qx: number,
    qz: number,
    depth: number,
    best: { x: number; z: number; dist: number },
  ): { x: number; z: number; dist: number } {
    if (!node) return best;

    // Distance from query to current node
    const dx = node.point.x - qx;
    const dz = node.point.z - qz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < best.dist) {
      best = { x: node.point.x, z: node.point.z, dist };
    }

    const axis = depth % 2;
    const nodeVal = axis === 0 ? node.point.x : node.point.z;
    const queryVal = axis === 0 ? qx : qz;

    // Decide which side to explore first (the side containing the query point)
    const firstBranch = queryVal < nodeVal ? node.left : node.right;
    const secondBranch = queryVal < nodeVal ? node.right : node.left;

    // Explore the likely closer side first
    best = this.findNearestNode(firstBranch, qx, qz, depth + 1, best);

    // Only explore the other side if the splitting plane is within current best distance
    const planeDist = Math.abs(queryVal - nodeVal);
    if (planeDist < best.dist) {
      best = this.findNearestNode(secondBranch, qx, qz, depth + 1, best);
    }

    return best;
  }

  /** Recursive radius search with branch pruning. */
  private searchRadius(
    node: KDNode | null,
    qx: number,
    qz: number,
    radius: number,
    depth: number,
    results: Array<{ x: number; z: number; dist: number }>,
  ): void {
    if (!node) return;

    const dx = node.point.x - qx;
    const dz = node.point.z - qz;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= radius) {
      results.push({ x: node.point.x, z: node.point.z, dist });
    }

    const axis = depth % 2;
    const nodeVal = axis === 0 ? node.point.x : node.point.z;
    const queryVal = axis === 0 ? qx : qz;
    const planeDist = Math.abs(queryVal - nodeVal);

    // Explore the side containing the query point
    if (queryVal < nodeVal) {
      this.searchRadius(node.left, qx, qz, radius, depth + 1, results);
      // Only cross the splitting plane if it's within the search radius
      if (planeDist <= radius) {
        this.searchRadius(node.right, qx, qz, radius, depth + 1, results);
      }
    } else {
      this.searchRadius(node.right, qx, qz, radius, depth + 1, results);
      if (planeDist <= radius) {
        this.searchRadius(node.left, qx, qz, radius, depth + 1, results);
      }
    }
  }
}

// ============================================================================
// Species Presets
// ============================================================================

export const MushroomSpeciesPresets: Record<MushroomSpecies, Partial<MushroomConfig>> = {
  agaric: {
    cap: { shape: 'convex', radius: 0.1, height: 0.06, hasUmbo: false, inrolledEdge: true, textureScale: 0.02 },
    gills: { type: 'lamellae', count: 24, depth: 0.04, color: 0xffc0cb },
    stem: { height: 0.12, radiusTop: 0.02, radiusBottom: 0.025, hasRing: true, ringPosition: 0.7, ringSize: 1.5 },
    capColor: 0xff0000,
    stemColor: 0xf5f5dc,
    /** Agarics are solitary — give them more breathing room */
    minSpacing: 0.08,
  },
  bolete: {
    cap: { shape: 'convex', radius: 0.12, height: 0.08, hasUmbo: false, inrolledEdge: false, textureScale: 0.03 },
    gills: { type: 'pores', count: 30, depth: 0.03, color: 0xeedd88 },
    stem: { height: 0.1, radiusTop: 0.03, radiusBottom: 0.04, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0x8b4513,
    stemColor: 0xd2b48c,
    /** Boletes are medium-spaced */
    minSpacing: 0.07,
  },
  chanterelle: {
    cap: { shape: 'funnel', radius: 0.08, height: 0.05, hasUmbo: false, inrolledEdge: true, textureScale: 0.01 },
    gills: { type: 'lamellae', count: 16, depth: 0.02, color: 0xffdd66 },
    stem: { height: 0.08, radiusTop: 0.015, radiusBottom: 0.02, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0xffaa00,
    stemColor: 0xffcc44,
    /** Chanterelles often grow in tight groups */
    minSpacing: 0.04,
  },
  morel: {
    cap: { shape: 'conical', radius: 0.06, height: 0.1, hasUmbo: false, inrolledEdge: false, textureScale: 0.05 },
    gills: { type: 'none', count: 0, depth: 0, color: 0x000000 },
    stem: { height: 0.06, radiusTop: 0.015, radiusBottom: 0.02, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0x8b6914,
    stemColor: 0xf0ead6,
    /** Morels can be fairly close but not touching */
    minSpacing: 0.06,
  },
  shelf: {
    cap: { shape: 'flat', radius: 0.1, height: 0.02, hasUmbo: false, inrolledEdge: false, textureScale: 0.04 },
    gills: { type: 'pores', count: 20, depth: 0.01, color: 0xeedd88 },
    stem: { height: 0.02, radiusTop: 0.02, radiusBottom: 0.03, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0x8b4513,
    stemColor: 0xd2b48c,
    /** Shelf mushrooms overlap naturally on tree trunks — very tight spacing */
    minSpacing: 0.02,
  },
  button: {
    cap: { shape: 'convex', radius: 0.06, height: 0.04, hasUmbo: false, inrolledEdge: true, textureScale: 0.01 },
    gills: { type: 'lamellae', count: 16, depth: 0.02, color: 0xffc0cb },
    stem: { height: 0.05, radiusTop: 0.012, radiusBottom: 0.015, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0xf5f5dc,
    stemColor: 0xf5f5dc,
    /** Buttons grow in tight clusters */
    minSpacing: 0.04,
  },
  shiitake: {
    cap: { shape: 'umbonate', radius: 0.1, height: 0.06, hasUmbo: true, inrolledEdge: true, textureScale: 0.03 },
    gills: { type: 'lamellae', count: 20, depth: 0.03, color: 0xffd0b0 },
    stem: { height: 0.06, radiusTop: 0.012, radiusBottom: 0.015, hasRing: false, ringPosition: 0, ringSize: 0 },
    capColor: 0x8b6914,
    stemColor: 0xf0ead6,
    /** Shiitake grow on logs with moderate spacing */
    minSpacing: 0.06,
  },
};

// ============================================================================
// MushroomGenerator
// ============================================================================

/** Maximum number of candidate-placement attempts before accepting the best position */
const MAX_PLACEMENT_ATTEMPTS = 10;

export class MushroomGenerator extends BaseObjectGenerator<MushroomConfig> {
  getDefaultConfig(): MushroomConfig {
    return {
      cap: { shape: 'convex', radius: 0.1, height: 0.06, hasUmbo: false, inrolledEdge: true, textureScale: 0.02 },
      gills: { type: 'lamellae', count: 16, depth: 0.03, color: 0xffc0cb },
      stem: { height: 0.15, radiusTop: 0.03, radiusBottom: 0.03, hasRing: false, ringPosition: 0, ringSize: 0 },
      species: 'button',
      capColor: 0xf5f5dc,
      stemColor: 0xf5f5dc,
      gillDetail: true,
      minSpacing: 0.05,
    };
  }

  generate(config: Partial<MushroomConfig> = {}): THREE.Group {
    // Merge with species preset
    const speciesDefaults = MushroomSpeciesPresets[config.species ?? this.getDefaultConfig().species] ?? {};
    const fullConfig = { ...this.getDefaultConfig(), ...speciesDefaults, ...config };

    const group = new THREE.Group();
    const rng = new SeededRandom(this.seed);

    // Stem
    const stem = this.createStem(fullConfig, rng);
    group.add(stem);

    // Cap
    const cap = this.createCap(fullConfig, rng);
    cap.position.y = fullConfig.stem.height;
    group.add(cap);

    // Gills (under the cap)
    if (fullConfig.gillDetail && fullConfig.gills.type !== 'none') {
      const gills = this.createGills(fullConfig, rng);
      gills.position.y = fullConfig.stem.height;
      group.add(gills);
    }

    // Stem ring/annulus
    if (fullConfig.stem.hasRing) {
      const ring = this.createRing(fullConfig);
      ring.position.y = fullConfig.stem.height * fullConfig.stem.ringPosition;
      group.add(ring);
    }

    group.userData.tags = ['vegetation', 'mushroom', fullConfig.species];
    return group;
  }

  /**
   * Generate a cluster of mushrooms with KDTree-based collision avoidance.
   *
   * Each mushroom is placed at a random position within `spreadRadius`,
   * but positions that would place the mushroom too close to an already-
   * placed neighbour (closer than `minSpacing * scale`) are rejected
   * and a new candidate is tried (up to {@link MAX_PLACEMENT_ATTEMPTS}).
   *
   * This produces natural-looking clusters where mushrooms are spaced
   * apart proportionally to their size — large mushrooms push neighbours
   * further away, while small mushrooms can sit closer together.
   *
   * @param config       - Partial mushroom configuration (species, colors, etc.)
   * @param count        - Number of mushrooms in the cluster (default 10)
   * @param spreadRadius - Maximum distance from cluster centre (default 0.3)
   * @returns A THREE.Group containing the clustered mushrooms
   */
  generateCluster(config: Partial<MushroomConfig> = {}, count: number = 10, spreadRadius: number = 0.3): THREE.Group {
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Merge with species preset to resolve minSpacing
    const speciesDefaults = MushroomSpeciesPresets[config.species ?? this.getDefaultConfig().species] ?? {};
    const resolvedConfig = { ...this.getDefaultConfig(), ...speciesDefaults, ...config };
    const minSpacing = resolvedConfig.minSpacing;

    // KD-tree to track placed positions on the x-z plane
    const placedTree = new SimpleKDTree2D();

    for (let i = 0; i < count; i++) {
      const mushroom = i === 0
        ? this.generate(config)
        : this.generate({ ...config, seed: this.seed + i });

      const scale = rng.uniform(0.6, 1.3);

      // Attempt to find a valid position that doesn't collide with existing mushrooms
      let bestCandidateX = 0;
      let bestCandidateZ = 0;
      let bestCandidateDist = Infinity;
      let accepted = false;

      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        const angle = rng.uniform(0, Math.PI * 2);
        const radius = rng.uniform(0, spreadRadius);
        const candidateX = Math.cos(angle) * radius;
        const candidateZ = Math.sin(angle) * radius;

        // Check the KD-tree for the nearest already-placed mushroom
        const nearest = placedTree.findNearest(candidateX, candidateZ);

        // The effective minimum spacing is scaled by the mushroom's size
        const effectiveMinSpacing = minSpacing * scale;

        if (nearest === null || nearest.dist >= effectiveMinSpacing) {
          // No collision — accept this position immediately
          bestCandidateX = candidateX;
          bestCandidateZ = candidateZ;
          accepted = true;
          break;
        }

        // Track the least-bad candidate in case we exhaust all attempts
        if (nearest.dist > bestCandidateDist || bestCandidateDist === Infinity) {
          // We want the candidate whose nearest neighbour is *farthest* away
          bestCandidateDist = nearest.dist;
          bestCandidateX = candidateX;
          bestCandidateZ = candidateZ;
        }
      }

      // Place the mushroom at the accepted (or best-available) position
      mushroom.position.set(bestCandidateX, 0, bestCandidateZ);
      mushroom.scale.setScalar(scale);
      mushroom.rotation.y = rng.uniform(0, Math.PI * 2);

      // Register the position so future mushrooms can avoid it
      placedTree.insert(bestCandidateX, bestCandidateZ);

      group.add(mushroom);
    }

    group.userData.tags = ['vegetation', 'mushroom', 'cluster'];
    return group;
  }

  // ------------------------------------------------------------------
  // Stem
  // ------------------------------------------------------------------

  private createStem(config: MushroomConfig, rng: SeededRandom): THREE.Mesh {
    const stemConfig = config.stem;
    const segments = 8;

    // Create a slightly curved stem
    const points: THREE.Vector3[] = [];
    const stemSegments = 6;
    for (let i = 0; i <= stemSegments; i++) {
      const t = i / stemSegments;
      const y = t * stemConfig.height;
      const wobble = Math.sin(t * Math.PI * 2 + rng.next() * 10) * 0.003;
      points.push(new THREE.Vector3(wobble, y, wobble * 0.5));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(
      curve,
      stemSegments,
      (stemConfig.radiusTop + stemConfig.radiusBottom) / 2,
      segments,
      false
    );

    const material = new THREE.MeshStandardMaterial({
      color: config.stemColor,
      roughness: 0.8,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Cap
  // ------------------------------------------------------------------

  private createCap(config: MushroomConfig, rng: SeededRandom): THREE.Mesh {
    const capConfig = config.cap;
    let geometry: THREE.BufferGeometry;

    switch (capConfig.shape) {
      case 'convex':
        geometry = new THREE.SphereGeometry(capConfig.radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        break;

      case 'flat':
        geometry = new THREE.CylinderGeometry(capConfig.radius, capConfig.radius, capConfig.height, 16, 1, false);
        // Round the top edges
        this.roundCapEdges(geometry, capConfig.radius, capConfig.height, rng);
        break;

      case 'conical':
        geometry = new THREE.ConeGeometry(capConfig.radius, capConfig.height * 2, 16);
        // Morel-like: add pits/ridges
        if (config.species === 'morel') {
          this.addMorelPits(geometry, capConfig, rng);
        }
        break;

      case 'funnel':
        // Chanterelle: inverted cone shape
        geometry = new THREE.CylinderGeometry(
          capConfig.radius * 0.3, capConfig.radius, capConfig.height * 2, 16, 1, false
        );
        break;

      case 'umbonate':
        // Like shiitake: dome with central bump
        geometry = new THREE.SphereGeometry(capConfig.radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.5);
        if (capConfig.hasUmbo) {
          this.addUmbo(geometry, capConfig, rng);
        }
        break;

      default:
        geometry = new THREE.SphereGeometry(capConfig.radius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    }

    // Add texture bumps for natural appearance
    if (capConfig.textureScale > 0) {
      this.applyCapTexture(geometry, capConfig, rng);
    }

    // Agaric: add white spots
    if (config.species === 'agaric') {
      this.addAgaricSpots(geometry, capConfig, rng);
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.capColor,
      roughness: 0.7,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private roundCapEdges(geometry: THREE.BufferGeometry, radius: number, height: number, rng: SeededRandom): void {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const dist = Math.sqrt(x * x + z * z) / radius;
      if (dist > 0.8 && y > 0) {
        positions.setY(i, y + (1 - dist) * height * 0.5);
      }
    }
    geometry.computeVertexNormals();
  }

  private addMorelPits(geometry: THREE.BufferGeometry, capConfig: MushroomCapConfig, rng: SeededRandom): void {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Create pit pattern using sin waves
      const pitFreq = 8;
      const pit = Math.sin(x * pitFreq) * Math.sin(z * pitFreq) * capConfig.textureScale * 0.5;
      const dist = Math.sqrt(x * x + z * z);
      if (dist < capConfig.radius * 0.9) {
        positions.setY(i, y + pit);
      }
    }
    geometry.computeVertexNormals();
  }

  private addUmbo(geometry: THREE.BufferGeometry, capConfig: MushroomCapConfig, rng: SeededRandom): void {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      if (dist < capConfig.radius * 0.3) {
        const umboHeight = (1 - dist / (capConfig.radius * 0.3)) * capConfig.height * 0.3;
        positions.setY(i, y + umboHeight);
      }
    }
    geometry.computeVertexNormals();
  }

  private applyCapTexture(geometry: THREE.BufferGeometry, capConfig: MushroomCapConfig, rng: SeededRandom): void {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const noise = Math.sin(x * 20) * Math.cos(z * 20) * capConfig.textureScale * 0.3;
      if (y > 0) {
        positions.setY(i, y + noise);
      }
    }
    geometry.computeVertexNormals();
  }

  private addAgaricSpots(geometry: THREE.BufferGeometry, capConfig: MushroomCapConfig, rng: SeededRandom): void {
    // Spots are purely visual — they affect vertex color, not geometry
    // For simplicity, we'll skip complex vertex coloring and rely on the material
  }

  // ------------------------------------------------------------------
  // Gills
  // ------------------------------------------------------------------

  private createGills(config: MushroomConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const gillConfig = config.gills;
    const capRadius = config.cap.radius;

    if (gillConfig.type === 'lamellae') {
      const gillMat = new THREE.MeshStandardMaterial({
        color: gillConfig.color,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      for (let i = 0; i < gillConfig.count; i++) {
        const angle = (i / gillConfig.count) * Math.PI * 2;
        const gillLength = capRadius * 0.85;
        const gillGeo = new THREE.PlaneGeometry(gillLength, gillConfig.depth, 1, 1);

        const gill = new THREE.Mesh(gillGeo, gillMat);
        gill.rotation.x = Math.PI / 2;
        gill.rotation.z = angle;
        gill.position.y = -0.005;
        gill.position.x = Math.cos(angle) * gillLength * 0.4;
        gill.position.z = Math.sin(angle) * gillLength * 0.4;

        group.add(gill);
      }
    } else if (gillConfig.type === 'pores') {
      // Bolete-style pores: small cylinders under the cap
      const poreMat = new THREE.MeshStandardMaterial({
        color: gillConfig.color,
        roughness: 0.8,
        metalness: 0.0,
      });

      const poreCount = gillConfig.count;
      for (let i = 0; i < poreCount; i++) {
        const angle = rng.uniform(0, Math.PI * 2);
        const r = rng.uniform(0, capRadius * 0.8);
        const poreGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.005, 4);
        const pore = new THREE.Mesh(poreGeo, poreMat);
        pore.position.set(
          Math.cos(angle) * r,
          -0.005,
          Math.sin(angle) * r
        );
        group.add(pore);
      }
    }

    return group;
  }

  // ------------------------------------------------------------------
  // Ring / Annulus
  // ------------------------------------------------------------------

  private createRing(config: MushroomConfig): THREE.Mesh {
    const ringConfig = config.stem;
    const innerRadius = ringConfig.radiusTop * 1.1;
    const outerRadius = ringConfig.radiusTop * ringConfig.ringSize;

    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 12);
    const material = new THREE.MeshStandardMaterial({
      color: config.stemColor,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }
}
