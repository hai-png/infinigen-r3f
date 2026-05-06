/**
 * BranchingCoralGenerator — Recursive CylinderGeometry branching
 * with noise-displaced endpoints.
 *
 * Generates staghorn/elkhorn-style branching coral using recursive
 * cylinder segments. Each branch endpoint is displaced by noise
 * for organic variation.
 *
 * @module objects/coral
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ── Types ──────────────────────────────────────────────────────────────

export interface BranchingCoralConfig {
  baseRadius: number;
  maxDepth: number;
  branchLength: number;
  lengthReduction: number;
  radiusReduction: number;
  branchCount: number;
  spreadAngle: number;
  upwardBias: number;
  color: string;
  tipColor: string;
  noiseScale: number;
  noiseStrength: number;
  seed: number;
  radialSegments: number;
}

const DEFAULT_CONFIG: BranchingCoralConfig = {
  baseRadius: 0.08,
  maxDepth: 5,
  branchLength: 0.3,
  lengthReduction: 0.72,
  radiusReduction: 0.65,
  branchCount: 3,
  spreadAngle: 0.8,
  upwardBias: 0.4,
  color: '#FF8C42',
  tipColor: '#FFD700',
  noiseScale: 3.0,
  noiseStrength: 0.15,
  seed: 42,
  radialSegments: 8,
};

// ── BranchingCoralGenerator Class ─────────────────────────────────────

export class BranchingCoralGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a branching coral group.
   */
  generate(config: Partial<BranchingCoralConfig> = {}): THREE.Group {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new THREE.Group();
    group.name = 'BranchingCoral';

    const baseMat = new THREE.MeshStandardMaterial({
      color: cfg.color, roughness: 0.7, metalness: 0.05,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: cfg.tipColor, roughness: 0.5, metalness: 0.1,
    });

    this.generateBranch(group, cfg, 0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), baseMat, tipMat);

    // Base attachment rock
    const baseMat2 = new THREE.MeshStandardMaterial({ color: '#5C4033', roughness: 0.9 });
    const baseGeo = new THREE.CylinderGeometry(cfg.baseRadius * 1.5, cfg.baseRadius * 2, cfg.baseRadius * 0.5, 12);
    const base = new THREE.Mesh(baseGeo, baseMat2);
    base.position.y = -cfg.baseRadius * 0.25;
    base.name = 'base';
    group.add(base);

    return group;
  }

  private generateBranch(
    parent: THREE.Group,
    config: BranchingCoralConfig,
    depth: number,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    baseMat: THREE.MeshStandardMaterial,
    tipMat: THREE.MeshStandardMaterial,
  ): void {
    if (depth >= config.maxDepth) return;

    const length = config.branchLength * Math.pow(config.lengthReduction, depth);
    const radius = config.baseRadius * Math.pow(config.radiusReduction, depth);

    if (radius < 0.002 || length < 0.01) return;

    // Noise-displaced endpoint
    const noiseDisplacement = new THREE.Vector3(
      (this.rng.next() - 0.5) * config.noiseStrength * length,
      (this.rng.next() - 0.3) * config.noiseStrength * length * 0.3,
      (this.rng.next() - 0.5) * config.noiseStrength * length,
    );

    const topRadius = radius * config.radiusReduction;
    const branchGeo = new THREE.CylinderGeometry(topRadius, radius, length, config.radialSegments);
    const mat = depth < config.maxDepth - 1 ? baseMat : tipMat;
    const branch = new THREE.Mesh(branchGeo, mat);

    // Position and orient
    branch.position.copy(position);
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    branch.quaternion.copy(quaternion);

    const endOffset = direction.clone().normalize().multiplyScalar(length * 0.5);
    branch.position.add(endOffset);
    parent.add(branch);

    // End position for children
    const endPosition = position.clone().add(direction.clone().normalize().multiplyScalar(length)).add(noiseDisplacement);

    // Recurse
    if (depth < config.maxDepth - 1) {
      for (let i = 0; i < config.branchCount; i++) {
        const angle = (i / config.branchCount) * Math.PI * 2 + this.rng.next() * 0.5;
        const spread = config.spreadAngle * (0.5 + this.rng.next() * 0.5);

        const spreadDir = new THREE.Vector3(
          Math.cos(angle) * Math.sin(spread),
          Math.cos(spread) * config.upwardBias + (1 - config.upwardBias) * this.rng.next() * 0.5,
          Math.sin(angle) * Math.sin(spread),
        ).normalize();

        const childDir = direction.clone().normalize().multiplyScalar(0.5).add(spreadDir).normalize();
        this.generateBranch(parent, config, depth + 1, endPosition, childDir, baseMat, tipMat);
      }
    }
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateBranchingCoral(config: Partial<BranchingCoralConfig> = {}): THREE.Group {
  const generator = new BranchingCoralGenerator(config.seed ?? 42);
  return generator.generate(config);
}
