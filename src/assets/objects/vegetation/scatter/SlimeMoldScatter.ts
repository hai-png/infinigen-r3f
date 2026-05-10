/**
 * SlimeMoldScatter.ts — Slime Mold Growth Pattern Scatter
 *
 * Generates slime mold (Physarum polycephalum) vein-like networks with:
 *   - Shortest-path growth algorithm
 *   - Vein-like network patterns
 *   - Color gradient from center to tips
 *   - Pulsing animation support
 *
 * @module assets/objects/vegetation/scatter
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededNoise2D } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export interface SlimeMoldConfig {
  /** Area size */
  areaSize: number;
  /** Number of growth origins */
  originCount: number;
  /** Maximum number of vein segments per origin */
  maxSegments: number;
  /** Step length for growth */
  stepLength: number;
  /** Branch probability (0-1) */
  branchProbability: number;
  /** Turn angle range (radians) */
  turnAngle: number;
  /** Center color (brighter) */
  centerColor: THREE.Color;
  /** Tip color (darker) */
  tipColor: THREE.Color;
  /** Vein thickness at center */
  centerThickness: number;
  /** Vein thickness at tips */
  tipThickness: number;
  /** Pulsing animation enabled */
  pulseEnabled: boolean;
  /** Random seed */
  seed: number;
}

// ============================================================================
// Internal Types
// ============================================================================

interface VeinNode {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  generation: number;
  parentIndex: number;
}

// ============================================================================
// SlimeMoldScatter
// ============================================================================

/**
 * Scatters slime mold vein networks using a growth simulation algorithm.
 *
 * The algorithm simulates Physarum polycephalum growth by iteratively
 * extending vein tips, with branching and direction influenced by
 * noise fields that simulate nutrient gradients.
 *
 * Usage:
 * ```ts
 * const scatter = new SlimeMoldScatter({ areaSize: 5, originCount: 3 });
 * const mold = scatter.generate();
 * ```
 */
export class SlimeMoldScatter {
  private config: SlimeMoldConfig;
  private rng: SeededRandom;

  constructor(config: Partial<SlimeMoldConfig> = {}) {
    this.config = {
      areaSize: 5,
      originCount: 2,
      maxSegments: 50,
      stepLength: 0.05,
      branchProbability: 0.15,
      turnAngle: Math.PI / 4,
      centerColor: new THREE.Color(0xccaa30),
      tipColor: new THREE.Color(0x6a4a10),
      centerThickness: 0.01,
      tipThickness: 0.003,
      pulseEnabled: true,
      seed: 42,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate the slime mold scatter as a group.
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    const halfSize = this.config.areaSize / 2;

    for (let o = 0; o < this.config.originCount; o++) {
      const originX = this.rng.uniform(-halfSize * 0.5, halfSize * 0.5);
      const originZ = this.rng.uniform(-halfSize * 0.5, halfSize * 0.5);

      const veinNetwork = this.growVeinNetwork(originX, originZ);
      const mesh = this.createVeinMesh(veinNetwork);
      group.add(mesh);
    }

    group.userData.tags = ['vegetation', 'scatter', 'slime_mold'];
    if (this.config.pulseEnabled) {
      group.userData.animationType = 'slime_mold_pulse';
    }
    return group;
  }

  // --------------------------------------------------------------------------
  // Growth Algorithm
  // --------------------------------------------------------------------------

  /**
   * Simulate vein network growth from an origin point.
   * Uses a shortest-path-like algorithm with noise-guided direction.
   */
  private growVeinNetwork(originX: number, originZ: number): VeinNode[] {
    const nodes: VeinNode[] = [];
    const activeTips: number[] = [];

    // Create origin node
    const origin: VeinNode = {
      position: new THREE.Vector3(originX, 0.002, originZ),
      direction: new THREE.Vector3(1, 0, 0),
      generation: 0,
      parentIndex: -1,
    };
    nodes.push(origin);
    activeTips.push(0);

    let iterations = 0;
    const maxIterations = this.config.maxSegments * 2;

    while (activeTips.length > 0 && iterations < maxIterations) {
      iterations++;

      const tipIndex = activeTips.shift()!;
      const tip = nodes[tipIndex];

      // Check bounds
      if (Math.abs(tip.position.x) > this.config.areaSize / 2 ||
          Math.abs(tip.position.z) > this.config.areaSize / 2) {
        continue;
      }

      // Determine new direction using noise (nutrient gradient simulation)
      const noiseVal = seededNoise2D(
        tip.position.x * 2,
        tip.position.z * 2,
        3.0,
        this.config.seed + tip.generation,
      );

      const turnAmount = noiseVal * this.config.turnAngle;
      const currentAngle = Math.atan2(tip.direction.z, tip.direction.x);
      const newAngle = currentAngle + turnAmount + this.rng.gaussian(0, 0.1);

      const newDir = new THREE.Vector3(
        Math.cos(newAngle),
        0,
        Math.sin(newAngle),
      ).normalize();

      // Create new node
      const newPos = tip.position.clone().add(
        newDir.clone().multiplyScalar(this.config.stepLength),
      );

      const newNode: VeinNode = {
        position: newPos,
        direction: newDir,
        generation: tip.generation + 1,
        parentIndex: tipIndex,
      };

      nodes.push(newNode);
      const newNodeIndex = nodes.length - 1;
      activeTips.push(newNodeIndex);

      // Branch with probability
      if (this.rng.next() < this.config.branchProbability && tip.generation < this.config.maxSegments * 0.7) {
        const branchAngle = newAngle + this.rng.choice([-1, 1]) * this.rng.uniform(0.3, this.config.turnAngle);
        const branchDir = new THREE.Vector3(
          Math.cos(branchAngle),
          0,
          Math.sin(branchAngle),
        ).normalize();

        const branchPos = tip.position.clone().add(
          branchDir.clone().multiplyScalar(this.config.stepLength),
        );

        const branchNode: VeinNode = {
          position: branchPos,
          direction: branchDir,
          generation: tip.generation + 1,
          parentIndex: tipIndex,
        };

        nodes.push(branchNode);
        activeTips.push(nodes.length - 1);
      }
    }

    return nodes;
  }

  // --------------------------------------------------------------------------
  // Mesh Creation
  // --------------------------------------------------------------------------

  /**
   * Create a mesh from the vein network using tube segments.
   */
  private createVeinMesh(nodes: VeinNode[]): THREE.Group {
    const group = new THREE.Group();

    // Create tube segments for each connection
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const parent = nodes[node.parentIndex];

      // Compute thickness based on generation
      const t = Math.min(1, node.generation / this.config.maxSegments);
      const thickness = THREE.MathUtils.lerp(this.config.centerThickness, this.config.tipThickness, t);

      // Compute color gradient from center to tip
      const color = this.config.centerColor.clone().lerp(this.config.tipColor, t);
      color.offsetHSL(
        this.rng.uniform(-0.02, 0.02),
        this.rng.uniform(-0.1, 0.1),
        this.rng.uniform(-0.05, 0.05),
      );

      // Create tube segment
      const curve = new THREE.LineCurve3(parent.position, node.position);
      const tubeGeo = new THREE.TubeGeometry(curve, 1, Math.max(0.001, thickness), 4, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.05,
        transparent: true,
        opacity: 0.9 - t * 0.2,
      });

      const mesh = new THREE.Mesh(tubeGeo, tubeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // Add small blob at junction nodes
      if (node.generation % 5 === 0) {
        const blobGeo = new THREE.SphereGeometry(thickness * 1.5, 5, 4);
        blobGeo.scale(1, 0.5, 1);
        const blobMat = new THREE.MeshStandardMaterial({
          color: color.clone().offsetHSL(0, 0, 0.05),
          roughness: 0.7,
          metalness: 0.05,
        });
        const blob = new THREE.Mesh(blobGeo, blobMat);
        blob.position.copy(node.position);
        blob.castShadow = true;
        group.add(blob);
      }
    }

    return group;
  }
}

/**
 * Convenience function: generate slime mold scatter.
 */
export function generateSlimeMoldScatter(config: Partial<SlimeMoldConfig> = {}): THREE.Group {
  const scatter = new SlimeMoldScatter(config);
  return scatter.generate();
}
