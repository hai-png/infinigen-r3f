/**
 * RootSystemGenerator.ts — Procedural Tree Root System Generator
 *
 * Generates visible tree root systems on the ground plane using a space
 * colonization algorithm. Roots emerge from the trunk base and spread
 * radially outward with natural curvature, tapering, and branching.
 *
 * The generator produces:
 * - RootSegment[] describing the raw skeleton of the root system
 * - THREE.Group containing tapered cylinder geometry with bark material
 * - Bounding radius for culling / collision
 *
 * Presets are provided for common tree species (oak, pine, palm, banyan,
 * mangrove, desert) that tune the root count, spread, curvature, etc.
 *
 * Usage:
 *   const gen = new RootSystemGenerator({ seed: 42 });
 *   const result = gen.generate(trunkPosition, trunkRadius);
 *   scene.add(result.mesh);
 *
 * Ported from: infinigen/terrain/objects/tree/roots_spacecol.py
 */

import * as THREE from 'three';
import { SeededRandom, seededNoise3D, seededFbm, hsvToRgb, clamp } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Configuration for the root system generator.
 * Controls the density, spread, curvature, branching, and surface
 * following behavior of the generated root network.
 */
export interface RootSystemConfig {
  /** Enable root system generation (default true) */
  rootsSpacecol: boolean;
  /** Number of primary roots emanating from the trunk base (default 5) */
  rootCount: number;
  /** Maximum root length in world units (default 2.0) */
  rootLength: number;
  /** Maximum root radius at the trunk connection (default 0.08) */
  rootThickness: number;
  /** How much roots thin toward tips — 0 = uniform, 1 = extreme taper (default 0.7) */
  rootTaperFactor: number;
  /** Maximum angle from horizontal for root emergence (radians, default PI/6) */
  rootSpreadAngle: number;
  /** How much roots curve — 0 = straight, 1 = very curved (default 0.3) */
  rootCurvature: number;
  /** Probability of a branch forming per segment (default 0.15) */
  rootBranchProbability: number;
  /** Branch length as a fraction of the parent (default 0.5) */
  rootBranchLengthFactor: number;
  /** Branch thickness as a fraction of the parent (default 0.5) */
  rootBranchThicknessFactor: number;
  /** Roots follow ground surface via groundHeightFn (default true) */
  surfaceCollision: boolean;
  /** Function returning the ground height at a given (x, z) position */
  groundHeightFn?: (x: number, z: number) => number;
  /** Random seed for deterministic generation */
  seed: number;
}

/**
 * A single segment of a root — a tapered cylinder between two 3D points.
 * Multiple connected segments form one root; branching creates sub-segments.
 */
export interface RootSegment {
  /** Start point of this root segment */
  start: THREE.Vector3;
  /** End point of this root segment */
  end: THREE.Vector3;
  /** Radius at the start (thicker, near trunk) */
  radiusStart: number;
  /** Radius at the end (thinner, toward tip) */
  radiusEnd: number;
  /** Recursion depth — 0 = primary, 1 = secondary, etc. */
  depth: number;
}

/**
 * Result of root system generation containing the raw segments,
 * the Three.js group with geometry, and bounding information.
 */
export interface RootSystemResult {
  /** All root segments produced by the algorithm */
  segments: RootSegment[];
  /** Three.js group containing the root geometry */
  mesh: THREE.Group;
  /** Approximate bounding radius of the root system on the ground plane */
  boundingRadius: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default root system configuration for a generic broadleaf tree */
const DEFAULT_ROOT_CONFIG: RootSystemConfig = {
  rootsSpacecol: true,
  rootCount: 5,
  rootLength: 2.0,
  rootThickness: 0.08,
  rootTaperFactor: 0.7,
  rootSpreadAngle: Math.PI / 6,
  rootCurvature: 0.3,
  rootBranchProbability: 0.15,
  rootBranchLengthFactor: 0.5,
  rootBranchThicknessFactor: 0.5,
  surfaceCollision: true,
  groundHeightFn: undefined,
  seed: 42,
};

// ============================================================================
// Attraction Point (internal)
// ============================================================================

/**
 * An attraction point used by the space colonization algorithm.
 * Root tips grow toward nearby attraction points and consume them
 * when they get close enough.
 */
interface AttractionPoint {
  /** World-space position of the attractor */
  position: THREE.Vector3;
  /** Whether this attractor has been reached and should be removed */
  reached: boolean;
}

/**
 * Internal state for a growing root tip.
 */
interface RootTip {
  /** Current position of the tip */
  position: THREE.Vector3;
  /** Direction the root is currently growing (unit vector) */
  direction: THREE.Vector3;
  /** Current radius at this tip */
  radius: number;
  /** Remaining length budget for this root */
  remainingLength: number;
  /** Depth (0 = primary root, 1+ = branch) */
  depth: number;
  /** Unique index of the root chain this tip belongs to */
  rootIndex: number;
  /** Cumulative distance traveled from origin — used for taper calculation */
  traveled: number;
  /** Total intended length — used for taper calculation */
  totalLength: number;
}

// ============================================================================
// RootSystemGenerator
// ============================================================================

/**
 * Procedural root system generator using space colonization.
 *
 * The algorithm works as follows:
 *   1. Place attraction points on a ring around the trunk on the ground plane
 *   2. Initialize root tips at the trunk base, spreading radially outward
 *   3. Each iteration, each tip finds the nearest attraction point within
 *      influence radius and grows one step toward it
 *   4. Attraction points that are reached (within kill radius) are removed
 *   5. When remaining attractors are far from a tip, the tip may branch
 *   6. Curvature is added via Perlin noise displacement on each step
 *   7. Surface following keeps roots on (or near) the ground plane
 *
 * All generation is deterministic when given the same seed.
 */
export class RootSystemGenerator {
  private config: RootSystemConfig;
  private rng: SeededRandom;

  constructor(config: Partial<RootSystemConfig> = {}) {
    this.config = { ...DEFAULT_ROOT_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate the root system for a tree at the given position.
   *
   * @param trunkPosition World-space position of the trunk base
   * @param trunkRadius Radius of the trunk at the base — roots will be
   *   scaled proportionally and emerge from the trunk surface
   * @returns RootSystemResult with segments, mesh group, and bounding radius
   */
  generate(trunkPosition: THREE.Vector3, trunkRadius: number): RootSystemResult {
    if (!this.config.rootsSpacecol) {
      return { segments: [], mesh: new THREE.Group(), boundingRadius: 0 };
    }

    // Scale root thickness proportionally to trunk radius
    const thicknessScale = Math.max(1, trunkRadius / 0.4);
    const effectiveThickness = this.config.rootThickness * thicknessScale;
    const effectiveLength = this.config.rootLength * thicknessScale;

    // Step 1: Generate attraction points on a ring around the trunk
    const attractionPoints = this.generateAttractionPoints(
      trunkPosition,
      effectiveLength
    );

    // Step 2: Initialize root tips at the trunk base
    const rootTips = this.initializeRootTips(
      trunkPosition,
      trunkRadius,
      effectiveThickness,
      effectiveLength
    );

    // Step 3: Run the space colonization growth loop
    const segments = this.runGrowthLoop(
      rootTips,
      attractionPoints,
      effectiveLength
    );

    // Step 4: Build the Three.js geometry
    const mesh = createRootGeometry(segments, this.config);

    // Step 5: Compute bounding radius
    let maxDist = 0;
    for (const seg of segments) {
      const dStart = seg.start.distanceTo(trunkPosition);
      const dEnd = seg.end.distanceTo(trunkPosition);
      maxDist = Math.max(maxDist, dStart, dEnd);
    }

    return {
      segments,
      mesh,
      boundingRadius: maxDist,
    };
  }

  // --------------------------------------------------------------------------
  // Attraction Point Generation
  // --------------------------------------------------------------------------

  /**
   * Generate attraction points arranged on a ring around the trunk base.
   * Points are placed on the ground plane (y = trunkPosition.y) with slight
   * height variation for natural spread. The ring has inner and outer radii
   * so that roots fill a broad area rather than a single circle.
   */
  private generateAttractionPoints(
    center: THREE.Vector3,
    rootLength: number
  ): AttractionPoint[] {
    const points: AttractionPoint[] = [];

    // Generate more attraction points than roots for better coverage
    const pointCount = this.config.rootCount * 30;
    const innerRadius = rootLength * 0.25;
    const outerRadius = rootLength * 1.1;

    for (let i = 0; i < pointCount; i++) {
      const angle = this.rng.uniform(0, Math.PI * 2);
      // Bias points toward the outer ring for wider root spread
      const rFrac = Math.sqrt(this.rng.uniform(0.1, 1.0));
      const r = innerRadius + rFrac * (outerRadius - innerRadius);

      const x = center.x + r * Math.cos(angle);
      const z = center.z + r * Math.sin(angle);

      // Get ground height if surface collision is enabled
      let y = center.y;
      if (this.config.surfaceCollision && this.config.groundHeightFn) {
        y = this.config.groundHeightFn(x, z);
      } else {
        // Slight natural height variation
        y += this.rng.uniform(-0.02, 0.02);
      }

      points.push({
        position: new THREE.Vector3(x, y, z),
        reached: false,
      });
    }

    return points;
  }

  // --------------------------------------------------------------------------
  // Root Tip Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize root tips at the trunk base, spreading radially outward.
   * Each primary root starts at the trunk surface and points outward.
   */
  private initializeRootTips(
    trunkPosition: THREE.Vector3,
    trunkRadius: number,
    effectiveThickness: number,
    effectiveLength: number
  ): RootTip[] {
    const tips: RootTip[] = [];

    for (let i = 0; i < this.config.rootCount; i++) {
      // Spread roots evenly around the trunk with slight randomness
      const baseAngle = (i / this.config.rootCount) * Math.PI * 2;
      const angleJitter = this.rng.uniform(-0.3, 0.3);
      const angle = baseAngle + angleJitter;

      // Start position: on the trunk surface at ground level
      const startX = trunkPosition.x + trunkRadius * Math.cos(angle);
      const startZ = trunkPosition.z + trunkRadius * Math.sin(angle);
      let startY = trunkPosition.y;

      // Apply surface collision for start position
      if (this.config.surfaceCollision && this.config.groundHeightFn) {
        startY = this.config.groundHeightFn(startX, startZ);
      }

      // Direction: radially outward with slight downward/upward bias
      const spreadAngle = this.rng.uniform(
        -this.config.rootSpreadAngle,
        this.config.rootSpreadAngle
      );
      const dirX = Math.cos(angle) * Math.cos(spreadAngle);
      const dirY = Math.sin(spreadAngle);
      const dirZ = Math.sin(angle) * Math.cos(spreadAngle);
      const direction = new THREE.Vector3(dirX, dirY, dirZ).normalize();

      // Vary root length slightly per root for natural appearance
      const lengthVariation = this.rng.uniform(0.7, 1.3);
      const rootLength = effectiveLength * lengthVariation;

      tips.push({
        position: new THREE.Vector3(startX, startY, startZ),
        direction,
        radius: effectiveThickness * this.rng.uniform(0.7, 1.0),
        remainingLength: rootLength,
        depth: 0,
        rootIndex: i,
        traveled: 0,
        totalLength: rootLength,
      });
    }

    return tips;
  }

  // --------------------------------------------------------------------------
  // Space Colonization Growth Loop
  // --------------------------------------------------------------------------

  /**
   * Run the main space colonization loop.
   * Each iteration, root tips grow toward their nearest attraction point.
   * Attraction points are consumed when reached. Tips may branch when
   * attractors are nearby but not in the current growth direction.
   */
  private runGrowthLoop(
    initialTips: RootTip[],
    attractionPoints: AttractionPoint[],
    effectiveLength: number
  ): RootSegment[] {
    const segments: RootSegment[] = [];
    const tips: RootTip[] = [...initialTips];
    const stepSize = effectiveLength * 0.08; // Each growth step
    const killRadius = stepSize * 2.0; // Attraction point consumed within this distance
    const influenceRadius = effectiveLength * 0.6; // Max distance for attraction
    const maxIterations = 200;

    for (let iter = 0; iter < maxIterations && tips.length > 0; iter++) {
      const newTips: RootTip[] = [];

      for (let t = tips.length - 1; t >= 0; t--) {
        const tip = tips[t];

        if (tip.remainingLength <= 0) {
          tips.splice(t, 1);
          continue;
        }

        // Find the nearest attraction point within influence radius
        let nearestPoint: AttractionPoint | null = null;
        let nearestDist = Infinity;

        for (const ap of attractionPoints) {
          if (ap.reached) continue;
          const dist = tip.position.distanceTo(ap.position);
          if (dist < influenceRadius && dist < nearestDist) {
            nearestDist = dist;
            nearestPoint = ap;
          }
        }

        // If no attraction points nearby, this root tip dies
        if (!nearestPoint) {
          tips.splice(t, 1);
          continue;
        }

        // Compute growth direction toward nearest attractor
        const toAttractor = new THREE.Vector3()
          .subVectors(nearestPoint.position, tip.position)
          .normalize();

        // Blend current direction with attractor direction (persistence vs. attraction)
        const persistence = 0.6;
        const newDir = new THREE.Vector3()
          .addScaledVector(tip.direction, persistence)
          .addScaledVector(toAttractor, 1 - persistence);

        // Apply curvature via Perlin noise displacement
        this.applyCurvature(newDir, tip.position, tip.rootIndex, tip.traveled);

        newDir.normalize();

        // Compute end position
        const actualStep = Math.min(stepSize, tip.remainingLength);
        const endPos = new THREE.Vector3().addScaledVector(newDir, actualStep).add(tip.position);

        // Apply surface following
        if (this.config.surfaceCollision) {
          this.applySurfaceFollowing(endPos, tip.position);
        }

        // Compute taper
        const progressRatio = tip.traveled / tip.totalLength;
        const taperStart = tip.radius;
        const taperEnd = tip.radius * (1 - this.config.rootTaperFactor * progressRatio);
        const clampedTaperEnd = Math.max(taperEnd, tip.radius * 0.05);

        // Create segment
        segments.push({
          start: tip.position.clone(),
          end: endPos.clone(),
          radiusStart: taperStart,
          radiusEnd: clampedTaperEnd,
          depth: tip.depth,
        });

        // Kill attraction points that are close enough
        if (nearestDist < killRadius) {
          nearestPoint.reached = true;
        }

        // Possibly branch
        if (
          tip.depth < 3 &&
          tip.remainingLength > effectiveLength * 0.15 &&
          this.rng.next() < this.config.rootBranchProbability
        ) {
          const branchTip = this.createBranchTip(tip, endPos, newDir, effectiveLength);
          newTips.push(branchTip);
        }

        // Update tip state
        tip.position.copy(endPos);
        tip.direction.copy(newDir);
        tip.radius = clampedTaperEnd;
        tip.remainingLength -= actualStep;
        tip.traveled += actualStep;
      }

      // Add new branch tips
      tips.push(...newTips);
    }

    return segments;
  }

  // --------------------------------------------------------------------------
  // Curvature via Perlin Noise
  // --------------------------------------------------------------------------

  /**
   * Apply Perlin noise curvature to a root direction vector.
   * The noise is seeded by root index and position so each root curves
   * differently but deterministically.
   */
  private applyCurvature(
    direction: THREE.Vector3,
    position: THREE.Vector3,
    rootIndex: number,
    traveled: number
  ): void {
    if (this.config.rootCurvature <= 0) return;

    const noiseSeed = this.config.seed + rootIndex * 1000;
    const frequency = 1.5;
    const amplitude = this.config.rootCurvature * 0.5;

    // Sample noise in two perpendicular directions for 3D curvature
    const noiseX = seededNoise3D(
      position.x * frequency + traveled * 0.5,
      position.z * frequency,
      rootIndex * 7.3,
      1.0,
      noiseSeed
    );
    const noiseZ = seededNoise3D(
      position.x * frequency,
      position.z * frequency + traveled * 0.5,
      rootIndex * 13.7,
      1.0,
      noiseSeed + 50
    );

    // Apply displacement perpendicular to the current direction
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(direction, up).normalize();
    // If direction is nearly vertical, pick an alternative up vector
    if (right.lengthSq() < 0.001) {
      right.set(1, 0, 0).crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
    }
    const forward = new THREE.Vector3().crossVectors(right, direction).normalize();

    direction.addScaledVector(right, noiseX * amplitude);
    direction.addScaledVector(forward, noiseZ * amplitude);
  }

  // --------------------------------------------------------------------------
  // Surface Following
  // --------------------------------------------------------------------------

  /**
   * Project the end position onto (or near) the ground surface.
   * If a groundHeightFn is provided, roots follow the terrain.
   * Otherwise, roots are kept near y=0 (the ground plane).
   */
  private applySurfaceFollowing(
    endPos: THREE.Vector3,
    startPos: THREE.Vector3
  ): void {
    if (this.config.groundHeightFn) {
      const groundY = this.config.groundHeightFn(endPos.x, endPos.z);
      // Blend toward ground — roots don't perfectly follow terrain
      const blendFactor = 0.8;
      endPos.y = endPos.y + (groundY - endPos.y) * blendFactor;
      // Allow roots to be slightly above ground (visible root bumps)
      endPos.y = Math.max(endPos.y, groundY - 0.01);
    } else {
      // Without a ground function, keep roots near the start height
      // with slight natural variation
      const heightDrift = endPos.y - startPos.y;
      // Dampen vertical drift so roots stay near ground level
      endPos.y = startPos.y + heightDrift * 0.3;
    }
  }

  // --------------------------------------------------------------------------
  // Branching
  // --------------------------------------------------------------------------

  /**
   * Create a new branch tip diverging from the parent tip.
   * Branch direction is offset from the parent by a random angle.
   */
  private createBranchTip(
    parentTip: RootTip,
    branchOrigin: THREE.Vector3,
    parentDirection: THREE.Vector3,
    effectiveLength: number
  ): RootTip {
    // Branch angle: 30-70 degrees from parent direction
    const branchAngle = this.rng.uniform(Math.PI / 6, Math.PI / 2.5);

    // Choose a random rotation axis perpendicular to parent direction
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(parentDirection, up).normalize();
    if (perp.lengthSq() < 0.001) {
      perp.set(1, 0, 0);
    }

    // Rotate parent direction around the perpendicular axis
    const rotAxis = perp.applyAxisAngle(parentDirection, this.rng.uniform(0, Math.PI * 2));
    const branchDir = parentDirection.clone().applyAxisAngle(rotAxis, branchAngle).normalize();

    // Branch has reduced length and thickness
    const branchLength = effectiveLength * this.config.rootBranchLengthFactor * this.rng.uniform(0.6, 1.0);
    const branchRadius = parentTip.radius * this.config.rootBranchThicknessFactor;

    return {
      position: branchOrigin.clone(),
      direction: branchDir,
      radius: branchRadius,
      remainingLength: branchLength,
      depth: parentTip.depth + 1,
      rootIndex: parentTip.rootIndex,
      traveled: 0,
      totalLength: branchLength,
    };
  }
}

// ============================================================================
// Geometry Creation
// ============================================================================

/**
 * Create Three.js geometry for all root segments.
 *
 * Each segment becomes a tapered CylinderGeometry positioned and oriented
 * to connect its start and end points. Bark material with FBM noise-based
 * vertex displacement gives a natural textured look. Slight color variation
 * per root chain adds visual richness.
 *
 * @param segments Array of RootSegment data from the generator
 * @param config The root system configuration (used for seed, etc.)
 * @returns A THREE.Group containing all root meshes
 */
export function createRootGeometry(
  segments: RootSegment[],
  config: RootSystemConfig
): THREE.Group {
  const group = new THREE.Group();
  if (segments.length === 0) return group;

  const rng = new SeededRandom(config.seed + 777);

  // Group segments by root index (via depth 0 start) for color variation
  // We use a simpler approach: vary color by depth level
  const depthColors = generateDepthColors(rng);

  // Merge geometry per depth level for fewer draw calls
  const geometriesByDepth: Map<number, THREE.BufferGeometry[]> = new Map();

  for (const seg of segments) {
    if (!geometriesByDepth.has(seg.depth)) {
      geometriesByDepth.set(seg.depth, []);
    }
    const geo = createSegmentGeometry(seg, config);
    if (geo) {
      geometriesByDepth.get(seg.depth)!.push(geo);
    }
  }

  // Merge and add a mesh per depth level
  for (const [depth, geos] of geometriesByDepth) {
    if (geos.length === 0) continue;

    const merged = mergeBufferGeometries(geos);
    // Apply bark texture displacement via FBM noise
    applyBarkDisplacement(merged, config.seed + depth * 100);

    const color = depthColors[Math.min(depth, depthColors.length - 1)];
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85 + rng.uniform(0, 0.1),
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * Create a tapered cylinder geometry for a single root segment.
 * The cylinder is positioned and rotated to connect start → end.
 */
function createSegmentGeometry(
  segment: RootSegment,
  config: RootSystemConfig
): THREE.BufferGeometry | null {
  const { start, end, radiusStart, radiusEnd } = segment;

  const length = start.distanceTo(end);
  if (length < 0.001 || (radiusStart < 0.001 && radiusEnd < 0.001)) {
    return null;
  }

  // CylinderGeometry: radiusTop, radiusBottom, height, radialSegments
  const radialSegments = radiusStart > 0.03 ? 8 : 6;
  const geometry = new THREE.CylinderGeometry(
    Math.max(radiusEnd, 0.002),
    Math.max(radiusStart, 0.002),
    length,
    radialSegments,
    1,
    false
  );

  // Default cylinder is centered at origin along Y axis.
  // We need to orient it from `start` to `end`.

  // Translate so bottom is at origin
  geometry.translate(0, length / 2, 0);

  // Compute rotation: default up is (0,1,0), we want direction = end - start
  const direction = new THREE.Vector3().subVectors(end, start);
  const dirNorm = direction.clone().normalize();

  // Quaternion rotating from Y-axis to desired direction
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNorm);

  // Apply rotation
  geometry.applyQuaternion(quat);

  // Translate to start position
  geometry.translate(start.x, start.y, start.z);

  return geometry;
}

/**
 * Apply FBM noise displacement to geometry vertices for a bark-like texture.
 * The displacement is along vertex normals so the surface stays smooth.
 */
function applyBarkDisplacement(
  geometry: THREE.BufferGeometry,
  seed: number
): void {
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    // Sample FBM noise at the vertex position
    const noiseVal = seededFbm(
      vertex.x * 5.0,
      vertex.y * 5.0,
      vertex.z * 5.0,
      3,      // octaves
      2.0,    // lacunarity
      0.5,    // gain
      seed
    );

    // Displacement amount (small — just for surface detail)
    const displacement = noiseVal * 0.008;

    // Approximate normal displacement: push outward from cylinder axis
    // For simplicity, just scale position slightly from the centroid
    // A more accurate approach would use vertex normals
    posAttr.setXYZ(
      i,
      vertex.x * (1 + displacement),
      vertex.y,
      vertex.z * (1 + displacement)
    );
  }

  geometry.computeVertexNormals();
}

/**
 * Generate a palette of bark colors for different root depths.
 * Primary roots (depth 0) are darkest; deeper branches are lighter.
 */
function generateDepthColors(rng: SeededRandom): THREE.Color[] {
  const colors: THREE.Color[] = [];

  // Base bark hue: warm brown
  const baseHue = 0.07; // brown

  for (let d = 0; d <= 4; d++) {
    // Slight hue variation per depth
    const hue = baseHue + rng.uniform(-0.02, 0.02);
    // Saturation decreases slightly at deeper levels
    const saturation = clamp(0.5 - d * 0.08 + rng.uniform(-0.05, 0.05), 0.15, 0.7);
    // Value (brightness) increases slightly for thinner roots
    const value = clamp(0.2 + d * 0.06 + rng.uniform(-0.03, 0.03), 0.15, 0.45);

    const rgb = hsvToRgb(hue, saturation, value);
    colors.push(new THREE.Color(rgb.r, rgb.g, rgb.b));
  }

  return colors;
}

/**
 * Merge multiple BufferGeometries into a single geometry.
 * Delegates to the canonical GeometryPipeline.mergeGeometries.
 */
function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  return GeometryPipeline.mergeGeometries(geometries);
}

// ============================================================================
// Root Presets
// ============================================================================

/**
 * Pre-built root system configurations for different tree types.
 * Each preset tunes root count, spread, curvature, branching, and
 * thickness to match the characteristic root architecture of the species.
 */
export const ROOT_PRESETS: Record<string, RootSystemConfig> = {
  /**
   * Oak — wide-spreading, thick surface roots.
   * Oaks have prominent buttress roots that extend far from the trunk.
   */
  oak: {
    rootsSpacecol: true,
    rootCount: 7,
    rootLength: 3.5,
    rootThickness: 0.12,
    rootTaperFactor: 0.65,
    rootSpreadAngle: Math.PI / 8,
    rootCurvature: 0.4,
    rootBranchProbability: 0.2,
    rootBranchLengthFactor: 0.55,
    rootBranchThicknessFactor: 0.5,
    surfaceCollision: true,
    groundHeightFn: undefined,
    seed: 42,
  },

  /**
   * Pine — shallow, wide roots.
   * Pines develop a wide, flat root plate near the surface.
   */
  pine: {
    rootsSpacecol: true,
    rootCount: 6,
    rootLength: 2.5,
    rootThickness: 0.07,
    rootTaperFactor: 0.75,
    rootSpreadAngle: Math.PI / 12,
    rootCurvature: 0.2,
    rootBranchProbability: 0.12,
    rootBranchLengthFactor: 0.45,
    rootBranchThicknessFactor: 0.45,
    surfaceCollision: true,
    groundHeightFn: undefined,
    seed: 42,
  },

  /**
   * Palm — thin, dense, fibrous roots.
   * Palm roots are numerous but narrow and shallow.
   */
  palm: {
    rootsSpacecol: true,
    rootCount: 12,
    rootLength: 1.8,
    rootThickness: 0.04,
    rootTaperFactor: 0.8,
    rootSpreadAngle: Math.PI / 10,
    rootCurvature: 0.25,
    rootBranchProbability: 0.3,
    rootBranchLengthFactor: 0.4,
    rootBranchThicknessFactor: 0.4,
    surfaceCollision: true,
    groundHeightFn: undefined,
    seed: 42,
  },

  /**
   * Banyan — aerial prop roots descending from branches.
   * Banyan roots are thick, numerous, and drop vertically before
   * spreading on the ground. This preset simulates the ground portion.
   */
  banyan: {
    rootsSpacecol: true,
    rootCount: 10,
    rootLength: 4.0,
    rootThickness: 0.1,
    rootTaperFactor: 0.55,
    rootSpreadAngle: Math.PI / 5,
    rootCurvature: 0.5,
    rootBranchProbability: 0.25,
    rootBranchLengthFactor: 0.6,
    rootBranchThicknessFactor: 0.55,
    surfaceCollision: true,
    groundHeightFn: undefined,
    seed: 42,
  },

  /**
   * Mangrove — stilt roots above water.
   * Mangrove roots arch downward from the trunk and splay outward,
   * forming a dense network of support roots above the waterline.
   */
  mangrove: {
    rootsSpacecol: true,
    rootCount: 9,
    rootLength: 3.0,
    rootThickness: 0.09,
    rootTaperFactor: 0.6,
    rootSpreadAngle: Math.PI / 4,
    rootCurvature: 0.6,
    rootBranchProbability: 0.18,
    rootBranchLengthFactor: 0.5,
    rootBranchThicknessFactor: 0.5,
    surfaceCollision: false, // Roots arch above surface
    groundHeightFn: undefined,
    seed: 42,
  },

  /**
   * Desert — deep, sparse roots.
   * Desert trees develop long taproots with sparse lateral roots
   * seeking groundwater far below the surface.
   */
  desert: {
    rootsSpacecol: true,
    rootCount: 4,
    rootLength: 2.0,
    rootThickness: 0.06,
    rootTaperFactor: 0.85,
    rootSpreadAngle: Math.PI / 16,
    rootCurvature: 0.15,
    rootBranchProbability: 0.08,
    rootBranchLengthFactor: 0.35,
    rootBranchThicknessFactor: 0.35,
    surfaceCollision: true,
    groundHeightFn: undefined,
    seed: 42,
  },
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a root system mesh from a preset name.
 *
 * @param presetName Name from ROOT_PRESETS (e.g. 'oak', 'pine', 'mangrove')
 * @param trunkPosition World position of the trunk base
 * @param trunkRadius Radius of the trunk at the base
 * @returns THREE.Group containing the root geometry
 */
export function generateRootSystemFromPreset(
  presetName: string,
  trunkPosition: THREE.Vector3,
  trunkRadius: number
): THREE.Group {
  const preset = ROOT_PRESETS[presetName] ?? ROOT_PRESETS.oak;
  const generator = new RootSystemGenerator(preset);
  const result = generator.generate(trunkPosition, trunkRadius);
  return result.mesh;
}

/**
 * Generate a root system and return the full result data.
 *
 * @param config Partial RootSystemConfig (merged with defaults)
 * @param trunkPosition World position of the trunk base
 * @param trunkRadius Radius of the trunk at the base
 * @returns RootSystemResult with segments, mesh, and bounding radius
 */
export function generateRootSystem(
  config: Partial<RootSystemConfig>,
  trunkPosition: THREE.Vector3,
  trunkRadius: number
): RootSystemResult {
  const generator = new RootSystemGenerator(config);
  return generator.generate(trunkPosition, trunkRadius);
}
