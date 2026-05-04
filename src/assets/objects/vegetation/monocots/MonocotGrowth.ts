/**
 * MonocotGrowth.ts — Phyllotaxis-Based Monocot Growth System
 *
 * Generates monocot plants (grasses, reeds, palms, etc.) using:
 * - Phyllotaxis: accumulated y_rotation + z_rotation per leaf
 * - FloatCurve scaling along stem parameter (smaller at tip, larger at base)
 * - Y-axis and Z-axis bend deformation
 * - Gravity droop: z += y_ratio * y²
 * - Noise displacement for organic feel
 * - Musgrave-driven color ramp (bright/dark green) via shader
 *
 * Uses THREE.InstancedMesh for efficient leaf rendering.
 *
 * Ported from: infinigen/terrain/objects/monocots/growth.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { SeededNoiseGenerator } from '@/core/util/math/noise';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Monocot growth parameters */
export interface MonocotGrowthParams {
  /** Number of leaves along the stem (default 12) */
  count: number;
  /** Phyllotaxis angle (rotation per leaf) in radians (default 2.4 ≈ golden angle) */
  angle: number;
  /** Probability a leaf exists at each position (default 0.9) */
  leafProb: number;
  /** Vertical offset between leaves (default 0.15) */
  stemOffset: number;
  /** Stem radius (default 0.02) */
  radius: number;
  /** Y-axis bend angle in radians (default 0.3) */
  bendAngle: number;
  /** Z-axis twist angle in radians (default 0.2) */
  twistAngle: number;
  /** Overall stem height (default 1.5) */
  height: number;
  /** Individual leaf length (default 0.5) */
  leafLength: number;
  /** Individual leaf width (default 0.05) */
  leafWidth: number;
  /** Gravity droop amount (default 0.3) */
  droopAmount: number;
  /** Noise displacement strength (default 0.02) */
  noiseStrength: number;
  /** Number of leaf segments (default 8) */
  leafSegments: number;
  /** Stem segments (default 12) */
  stemSegments: number;
  /** Whether to use instanced mesh for leaves (default true) */
  useInstancing: boolean;
  /** Random seed (default 42) */
  seed: number;
  /** Primary green color */
  primaryColor: THREE.Color;
  /** Secondary green color (darker) */
  secondaryColor: THREE.Color;
}

/** Result of monocot generation */
export interface MonocotResult {
  /** Group containing stem and leaves */
  group: THREE.Group;
  /** Stem mesh */
  stemMesh: THREE.Mesh;
  /** Leaf instanced mesh (if useInstancing) or group of leaf meshes */
  leaves: THREE.InstancedMesh | THREE.Group;
  /** Bounding box */
  boundingBox: THREE.Box3;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MONOCOT_GROWTH_PARAMS: MonocotGrowthParams = {
  count: 12,
  angle: 2.399963, // Golden angle ≈ 137.5° in radians
  leafProb: 0.9,
  stemOffset: 0.15,
  radius: 0.02,
  bendAngle: 0.3,
  twistAngle: 0.2,
  height: 1.5,
  leafLength: 0.5,
  leafWidth: 0.05,
  droopAmount: 0.3,
  noiseStrength: 0.02,
  leafSegments: 8,
  stemSegments: 12,
  useInstancing: true,
  seed: 42,
  primaryColor: new THREE.Color(0.35, 0.6, 0.25),
  secondaryColor: new THREE.Color(0.2, 0.4, 0.15),
};

// ============================================================================
// MonocotGrowthFactory
// ============================================================================

/**
 * MonocotGrowthFactory generates complete monocot plants using
 * phyllotaxis-based leaf placement, bend/twist deformation,
 * and gravity droop.
 *
 * The phyllotaxis algorithm places leaves at regular intervals along
 * the stem, with each leaf rotated by an accumulated angle. This
 * produces the characteristic spiral arrangement of leaves seen in
 * real monocots (grasses, palms, lilies, etc.).
 *
 * Leaf deformation:
 *   - Y-axis bend: SIMPE_DEFORM BEND equivalent
 *   - Z-axis twist: rotation around the stem axis
 *   - Gravity droop: z += y_ratio * y²
 *   - Noise: small random perturbation for organic feel
 *
 * Usage:
 *   const factory = new MonocotGrowthFactory({ count: 15, seed: 42 });
 *   const result = factory.generate();
 *   scene.add(result.group);
 */
export class MonocotGrowthFactory {
  private params: MonocotGrowthParams;
  private rng: SeededRandom;
  private noise: SeededNoiseGenerator;

  constructor(params: Partial<MonocotGrowthParams> = {}) {
    this.params = { ...DEFAULT_MONOCOT_GROWTH_PARAMS, ...params };
    this.rng = new SeededRandom(this.params.seed);
    this.noise = new SeededNoiseGenerator(this.params.seed);
  }

  /**
   * Generate a complete monocot plant.
   *
   * @returns MonocotResult containing stem mesh + leaf instances
   */
  generate(): MonocotResult {
    const { seed } = this.params;
    this.rng = new SeededRandom(seed);
    this.noise = new SeededNoiseGenerator(seed);

    const group = new THREE.Group();

    // Generate stem
    const stemMesh = this.generateStem();
    group.add(stemMesh);

    // Generate leaves
    const leaves = this.generateLeaves();
    group.add(leaves instanceof THREE.InstancedMesh ? leaves : leaves);

    // Compute bounding box
    const boundingBox = new THREE.Box3().setFromObject(group);

    return {
      group,
      stemMesh,
      leaves,
      boundingBox,
    };
  }

  // --------------------------------------------------------------------------
  // Stem Generation
  // --------------------------------------------------------------------------

  /**
   * Generate the stem as a CurveLine geometry with configurable height and radius.
   * The stem tapers from base (wider) to tip (narrower) using a FloatCurve.
   */
  private generateStem(): THREE.Mesh {
    const { height, radius, stemSegments, primaryColor, secondaryColor } = this.params;

    // Create stem using CylinderGeometry with taper
    const topRadius = radius * 0.6;
    const geometry = new THREE.CylinderGeometry(
      topRadius,
      radius,
      height,
      8, // radial segments
      stemSegments // height segments
    );

    // Apply slight curve and noise to stem vertices
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // FloatCurve: scale radius along height (smaller at top)
      const heightRatio = (y + height / 2) / height;
      const scale = 1.0 - heightRatio * 0.3;

      // Apply subtle bend
      const bendOffset = Math.sin(heightRatio * Math.PI) * this.params.bendAngle * 0.1;

      // Noise displacement
      const nx = this.noise.perlin3D(x * 5, y * 3, z * 5) * this.params.noiseStrength;
      const nz = this.noise.perlin3D(x * 5 + 100, y * 3, z * 5 + 100) * this.params.noiseStrength;

      positions.setX(i, x * scale + bendOffset + nx);
      positions.setY(i, y);
      positions.setZ(i, z * scale + nz);
    }

    geometry.computeVertexNormals();

    // Stem material with color gradient (darker at base, lighter at top)
    const stemColor = new THREE.Color().lerpColors(secondaryColor, primaryColor, 0.5);
    const material = new THREE.MeshStandardMaterial({
      color: stemColor,
      roughness: 0.7,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  // --------------------------------------------------------------------------
  // Leaf Generation
  // --------------------------------------------------------------------------

  /**
   * Generate leaves using phyllotaxis placement.
   * Each leaf is bent, twisted, and drooped according to parameters.
   */
  private generateLeaves(): THREE.InstancedMesh | THREE.Group {
    const {
      count, angle, leafProb, stemOffset, height, leafLength,
      leafWidth, bendAngle, twistAngle, droopAmount, leafSegments,
      useInstancing, primaryColor, secondaryColor, noiseStrength,
    } = this.params;

    // Create base leaf geometry
    const leafGeometry = this.createLeafGeometry(leafLength, leafWidth, leafSegments);

    // Leaf material with musgrave-driven color (simulated via vertex colors)
    const leafMaterial = this.createLeafMaterial();

    if (useInstancing) {
      return this.createInstancedLeaves(
        leafGeometry, leafMaterial, count, angle, leafProb,
        stemOffset, height, leafLength, bendAngle, twistAngle,
        droopAmount, noiseStrength
      );
    } else {
      return this.createIndividualLeaves(
        leafGeometry, leafMaterial, count, angle, leafProb,
        stemOffset, height, leafLength, bendAngle, twistAngle,
        droopAmount, noiseStrength
      );
    }
  }

  /**
   * Create a single leaf geometry with curvature.
   */
  private createLeafGeometry(length: number, width: number, segments: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, length, 2, segments);

    // Taper and curve the leaf
    const positions = geometry.attributes.position.array as Float32Array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + length / 2) / length; // 0 at base, 1 at tip

      // Taper toward tip
      positions[i] *= (1.0 - t * 0.7);

      // Add curvature along length
      positions[i + 2] += Math.sin(t * Math.PI) * 0.05 * length;
    }

    // Add vertex colors (green gradient — simulating musgrave color ramp)
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + length / 2) / length;

      // Color ramp: base is darker, mid is brighter, tip is slightly yellow
      const rampT = Math.sin(t * Math.PI);
      const noiseVal = this.noise.perlin3D(positions[i] * 10, positions[i + 1] * 10, positions[i + 2] * 10) * 0.5 + 0.5;

      colors[i] = 0.2 + rampT * 0.2 + noiseVal * 0.1;     // R
      colors[i + 1] = 0.4 + rampT * 0.25 + noiseVal * 0.15; // G
      colors[i + 2] = 0.12 + rampT * 0.08 + noiseVal * 0.05; // B
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create leaf material with noise-driven roughness.
   */
  private createLeafMaterial(): THREE.MeshStandardMaterial {
    const { primaryColor } = this.params;

    return new THREE.MeshStandardMaterial({
      color: primaryColor,
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
  }

  /**
   * Create leaves as an InstancedMesh for efficient rendering.
   */
  private createInstancedLeaves(
    leafGeometry: THREE.BufferGeometry,
    leafMaterial: THREE.MeshStandardMaterial,
    count: number,
    phyllotaxisAngle: number,
    leafProb: number,
    stemOffset: number,
    height: number,
    leafLength: number,
    bendAngle: number,
    twistAngle: number,
    droopAmount: number,
    noiseStrength: number
  ): THREE.InstancedMesh {
    // Count actual leaves (accounting for leafProb)
    let actualCount = 0;
    for (let i = 0; i < count; i++) {
      if (this.rng.next() < leafProb) actualCount++;
    }

    const instancedMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, Math.max(actualCount, 1));

    // Reset RNG for deterministic placement
    this.rng = new SeededRandom(this.params.seed);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let instanceIdx = 0;

    // Accumulated phyllotaxis rotations
    let accumulatedYRotation = 0;
    let accumulatedZRotation = 0;

    for (let i = 0; i < count; i++) {
      if (this.rng.next() >= leafProb) {
        accumulatedYRotation += phyllotaxisAngle;
        accumulatedZRotation += phyllotaxisAngle * 0.3;
        continue;
      }

      // Position along stem
      const stemT = Math.min((i + 1) * stemOffset / height, 0.95);
      const yPos = stemT * height;

      // Phyllotaxis rotation
      accumulatedYRotation += phyllotaxisAngle;
      accumulatedZRotation += phyllotaxisAngle * 0.3;

      // FloatCurve scale: larger at base, smaller at tip
      const sizeScale = 1.0 - stemT * 0.4;
      const scaledLeafLength = leafLength * sizeScale;

      // Y-axis bend deformation
      const bendQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), bendAngle * (0.5 + stemT * 0.5)
      );

      // Z-axis twist
      const twistQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), accumulatedZRotation * 0.1
      );

      // Phyllotaxis rotation around stem
      const phyloQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), accumulatedYRotation
      );

      // Combine rotations
      quaternion.copy(phyloQuat).multiply(bendQuat).multiply(twistQuat);

      // Position with gravity droop
      const droop = stemT * stemT * droopAmount;
      position.set(
        Math.sin(accumulatedYRotation) * this.params.radius * 2,
        yPos - droop,
        Math.cos(accumulatedYRotation) * this.params.radius * 2
      );

      // Add noise
      position.x += this.noise.perlin3D(position.x * 5, position.y * 5, position.z * 5) * noiseStrength;
      position.z += this.noise.perlin3D(position.x * 5 + 50, position.y * 5, position.z * 5 + 50) * noiseStrength;

      scale.set(sizeScale, sizeScale, sizeScale);

      matrix.compose(position, quaternion, scale);
      instancedMesh.setMatrixAt(instanceIdx, matrix);
      instanceIdx++;
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    return instancedMesh;
  }

  /**
   * Create leaves as individual meshes (for when instancing is disabled).
   */
  private createIndividualLeaves(
    leafGeometry: THREE.BufferGeometry,
    leafMaterial: THREE.MeshStandardMaterial,
    count: number,
    phyllotaxisAngle: number,
    leafProb: number,
    stemOffset: number,
    height: number,
    leafLength: number,
    bendAngle: number,
    twistAngle: number,
    droopAmount: number,
    noiseStrength: number
  ): THREE.Group {
    const group = new THREE.Group();

    let accumulatedYRotation = 0;
    let accumulatedZRotation = 0;

    for (let i = 0; i < count; i++) {
      if (this.rng.next() >= leafProb) {
        accumulatedYRotation += phyllotaxisAngle;
        accumulatedZRotation += phyllotaxisAngle * 0.3;
        continue;
      }

      const stemT = Math.min((i + 1) * stemOffset / height, 0.95);
      const yPos = stemT * height;

      accumulatedYRotation += phyllotaxisAngle;
      accumulatedZRotation += phyllotaxisAngle * 0.3;

      const sizeScale = 1.0 - stemT * 0.4;

      // Clone geometry for individual transforms
      const geometry = leafGeometry.clone();

      // Apply bend deformation to vertices
      const positions = geometry.attributes.position.array as Float32Array;
      for (let j = 0; j < positions.length; j += 3) {
        const localY = positions[j + 1];
        const t = (localY + leafLength / 2) / leafLength;

        // Y-axis bend
        positions[j + 2] += t * bendAngle * 0.3;

        // Gravity droop: z += y_ratio * y²
        const yRatio = t;
        positions[j + 1] -= yRatio * t * droopAmount * 0.2;

        // Noise displacement
        positions[j] += this.noise.perlin3D(positions[j] * 8, positions[j + 1] * 8, i * 0.1) * noiseStrength;
        positions[j + 2] += this.noise.perlin3D(positions[j] * 8 + 100, positions[j + 1] * 8, i * 0.1) * noiseStrength;
      }
      geometry.computeVertexNormals();

      const leaf = new THREE.Mesh(geometry, leafMaterial.clone());

      // Position and rotation
      const droop = stemT * stemT * droopAmount;
      leaf.position.set(
        Math.sin(accumulatedYRotation) * this.params.radius * 2,
        yPos - droop,
        Math.cos(accumulatedYRotation) * this.params.radius * 2
      );

      leaf.rotation.y = accumulatedYRotation;
      leaf.rotation.x = bendAngle * (0.5 + stemT * 0.5);
      leaf.rotation.z = accumulatedZRotation * 0.1;

      leaf.scale.setScalar(sizeScale);
      leaf.castShadow = true;
      leaf.receiveShadow = true;

      group.add(leaf);
    }

    return group;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick-generate a monocot plant.
 */
export function generateMonocot(params: Partial<MonocotGrowthParams> = {}): MonocotResult {
  const factory = new MonocotGrowthFactory(params);
  return factory.generate();
}
