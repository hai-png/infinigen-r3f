/**
 * LichenGenerator.ts — Lichen Growth on Surfaces
 *
 * Generates three major lichen growth forms:
 *   - Crustose: flat, paint-like patches tightly attached to substrate
 *   - Foliose: leaf-like lobes with some lifting from surface
 *   - Fruticose: shrubby, branching structures standing off the surface
 *
 * Features:
 *   - Surface-adaptive growth (conforms to rocks, tree bark)
 *   - Texture-based application for crustose lichen
 *   - Geometric lobes for foliose lichen
 *   - Branching geometry for fruticose lichen
 *   - Color variation (green-grey, yellow-green, white-grey)
 *
 * @module assets/objects/vegetation/plants
 */

import * as THREE from 'three';
import { BaseObjectGenerator, type BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededNoise2D, seededFbm } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Lichen growth form */
export type LichenGrowthForm = 'crustose' | 'foliose' | 'fruticose';

/** Configuration for lichen generation */
export interface LichenConfig extends BaseGeneratorConfig {
  /** Growth form of the lichen */
  growthForm: LichenGrowthForm;
  /** Approximate patch size (meters) */
  patchSize: number;
  /** Number of patches to generate */
  patchCount: number;
  /** Primary color */
  color: THREE.Color;
  /** Secondary color (for variation) */
  secondaryColor: THREE.Color;
  /** Surface normal direction (for orientation) */
  surfaceNormal: THREE.Vector3;
  /** Surface position (center of the lichen colony) */
  surfacePosition: THREE.Vector3;
  /** Detail level (1-3) */
  detail: number;
}

/** Growth form color defaults */
const LICHEN_COLORS: Record<LichenGrowthForm, { primary: number; secondary: number }> = {
  crustose: { primary: 0x8a9a6a, secondary: 0x7a8a5a },
  foliose: { primary: 0x6a8a4a, secondary: 0x5a7a3a },
  fruticose: { primary: 0x7a9a5a, secondary: 0x6a8a4a },
};

// ============================================================================
// LichenGenerator
// ============================================================================

/**
 * Generates procedural lichen patches in three growth forms.
 *
 * Usage:
 * ```ts
 * const gen = new LichenGenerator(42);
 * const crustose = gen.generate({ growthForm: 'crustose' });
 * const foliose = gen.generate({ growthForm: 'foliose' });
 * const fruticose = gen.generate({ growthForm: 'fruticose' });
 * ```
 */
export class LichenGenerator extends BaseObjectGenerator<LichenConfig> {
  getDefaultConfig(): LichenConfig {
    return {
      growthForm: 'crustose',
      patchSize: 0.1,
      patchCount: 5,
      color: new THREE.Color(LICHEN_COLORS.crustose.primary),
      secondaryColor: new THREE.Color(LICHEN_COLORS.crustose.secondary),
      surfaceNormal: new THREE.Vector3(0, 1, 0),
      surfacePosition: new THREE.Vector3(0, 0, 0),
      detail: 2,
      seed: 42,
    };
  }

  generate(config: Partial<LichenConfig> = {}): THREE.Group {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const defaultColors = LICHEN_COLORS[cfg.growthForm];
    if (!config.color) cfg.color = new THREE.Color(defaultColors.primary);
    if (!config.secondaryColor) cfg.secondaryColor = new THREE.Color(defaultColors.secondary);

    const rng = new SeededRandom(cfg.seed ?? this.seed);
    const group = new THREE.Group();

    // Orient the group to the surface
    if (cfg.surfaceNormal.length() > 0.01) {
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, cfg.surfaceNormal.clone().normalize());
      group.quaternion.copy(quat);
    }
    group.position.copy(cfg.surfacePosition);

    // Generate patches based on growth form
    switch (cfg.growthForm) {
      case 'crustose':
        this.generateCrustosePatches(group, cfg, rng);
        break;
      case 'foliose':
        this.generateFoliosePatches(group, cfg, rng);
        break;
      case 'fruticose':
        this.generateFruticosePatches(group, cfg, rng);
        break;
    }

    group.userData.tags = ['vegetation', 'lichen', cfg.growthForm];
    return group;
  }

  // --------------------------------------------------------------------------
  // Crustose Lichen
  // --------------------------------------------------------------------------

  /**
   * Generate crustose lichen: flat, paint-like patches on the surface.
   * Uses flat circular geometries with noise-based edge variation.
   */
  private generateCrustosePatches(
    group: THREE.Group,
    cfg: LichenConfig,
    rng: SeededRandom,
  ): void {
    for (let p = 0; p < cfg.patchCount; p++) {
      const patchRadius = cfg.patchSize * rng.uniform(0.5, 1.5);
      const segments = 16;
      const shape = new THREE.Shape();

      // Irregular edge using noise
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const noiseVal = seededNoise2D(
          Math.cos(angle) * 2 + p * 0.5,
          Math.sin(angle) * 2 + p * 0.5,
          3.0,
          rng.nextInt(0, 9999),
        );
        const r = patchRadius * (1 + noiseVal * 0.3);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }

      const geo = new THREE.ShapeGeometry(shape, 4);
      const color = cfg.color.clone().lerp(cfg.secondaryColor, rng.next());
      color.offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1));

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // Lay flat on surface
      mesh.position.set(
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.5,
        0.001,
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.5,
      );
      mesh.receiveShadow = true;
      group.add(mesh);

      // Inner texture variation: concentric rings
      if (cfg.detail >= 2) {
        const innerRingGeo = new THREE.RingGeometry(
          patchRadius * 0.2,
          patchRadius * 0.6,
          12,
          2,
        );
        const innerColor = cfg.secondaryColor.clone().offsetHSL(
          rng.uniform(-0.02, 0.02),
          rng.uniform(-0.1, 0.1),
          rng.uniform(-0.05, 0.05),
        );
        const innerMat = new THREE.MeshStandardMaterial({
          color: innerColor,
          roughness: 0.95,
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.copy(mesh.position);
        innerRing.position.y += 0.001;
        group.add(innerRing);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Foliose Lichen
  // --------------------------------------------------------------------------

  /**
   * Generate foliose lichen: leaf-like lobes that slightly lift from the surface.
   */
  private generateFoliosePatches(
    group: THREE.Group,
    cfg: LichenConfig,
    rng: SeededRandom,
  ): void {
    for (let p = 0; p < cfg.patchCount; p++) {
      const patchGroup = new THREE.Group();
      patchGroup.position.set(
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.3,
        0,
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.3,
      );

      // Generate lobes radiating outward from center
      const lobeCount = rng.nextInt(4, 8);
      for (let l = 0; l < lobeCount; l++) {
        const angle = (l / lobeCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
        const lobe = this.createFolioseLobe(cfg, rng);
        lobe.rotation.y = angle;
        // Slight lift at the edges
        lobe.rotation.x = -Math.PI / 2 + rng.uniform(0, 0.2);
        lobe.position.set(
          Math.cos(angle) * cfg.patchSize * 0.15,
          rng.uniform(0, 0.005),
          Math.sin(angle) * cfg.patchSize * 0.15,
        );
        patchGroup.add(lobe);
      }

      // Central cushion
      const cushionGeo = new THREE.SphereGeometry(cfg.patchSize * 0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const cushionMat = new THREE.MeshStandardMaterial({
        color: cfg.color.clone().offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05)),
        roughness: 0.9,
        metalness: 0.0,
      });
      const cushion = new THREE.Mesh(cushionGeo, cushionMat);
      cushion.position.y = 0.002;
      cushion.receiveShadow = true;
      cushion.castShadow = true;
      patchGroup.add(cushion);

      group.add(patchGroup);
    }
  }

  /**
   * Create a single foliose lobe.
   */
  private createFolioseLobe(cfg: LichenConfig, rng: SeededRandom): THREE.Mesh {
    const lobeLength = cfg.patchSize * rng.uniform(0.3, 0.6);
    const lobeWidth = lobeLength * rng.uniform(0.3, 0.5);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(lobeWidth * 0.5, lobeLength * 0.4, lobeWidth * 0.3, lobeLength * 0.7);
    shape.quadraticCurveTo(0, lobeLength, -lobeWidth * 0.3, lobeLength * 0.7);
    shape.quadraticCurveTo(-lobeWidth * 0.5, lobeLength * 0.4, 0, 0);

    const geo = new THREE.ShapeGeometry(shape, 3);

    // Add slight cupping (lift edges)
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const x = posAttr.getX(i);
      const distFromCenter = Math.sqrt(x * x + y * y) / lobeLength;
      const lift = distFromCenter * 0.01 * lobeLength;
      posAttr.setZ(i, lift);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color.clone().lerp(cfg.secondaryColor, rng.next() * 0.5).offsetHSL(
        rng.uniform(-0.03, 0.03),
        rng.uniform(-0.1, 0.1),
        rng.uniform(-0.1, 0.05),
      ),
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Fruticose Lichen
  // --------------------------------------------------------------------------

  /**
   * Generate fruticose lichen: shrubby, branching structures.
   */
  private generateFruticosePatches(
    group: THREE.Group,
    cfg: LichenConfig,
    rng: SeededRandom,
  ): void {
    for (let p = 0; p < cfg.patchCount; p++) {
      const branch = this.createFruticoseBranch(cfg, rng, 0, cfg.detail);
      branch.position.set(
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.3,
        0,
        rng.uniform(-cfg.patchSize, cfg.patchSize) * 0.3,
      );
      group.add(branch);
    }
  }

  /**
   * Create a fruticose branch (recursive).
   */
  private createFruticoseBranch(
    cfg: LichenConfig,
    rng: SeededRandom,
    depth: number,
    maxDepth: number,
  ): THREE.Group {
    const group = new THREE.Group();
    const branchHeight = cfg.patchSize * (0.5 - depth * 0.1);
    const branchRadius = cfg.patchSize * 0.02 * (1 - depth * 0.2);

    if (branchHeight <= 0.005 || branchRadius <= 0.001 || depth > maxDepth) {
      return group;
    }

    // Main stem
    const stemGeo = new THREE.CylinderGeometry(
      branchRadius * 0.5,
      branchRadius,
      branchHeight,
      5,
    );
    const color = cfg.color.clone().lerp(cfg.secondaryColor, rng.next() * 0.4);
    color.offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05));

    const stemMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.0,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = branchHeight / 2;
    stem.castShadow = true;
    stem.receiveShadow = true;
    group.add(stem);

    // Tip cup (apothecium — fruiting body)
    if (depth === maxDepth || rng.boolean(0.3)) {
      const cupGeo = new THREE.SphereGeometry(branchRadius * 2, 6, 4);
      cupGeo.scale(1, 0.5, 1);
      const cupColor = cfg.secondaryColor.clone().offsetHSL(rng.uniform(-0.05, 0.05), 0, rng.uniform(0, 0.1));
      const cupMat = new THREE.MeshStandardMaterial({
        color: cupColor,
        roughness: 0.7,
        metalness: 0.0,
      });
      const cup = new THREE.Mesh(cupGeo, cupMat);
      cup.position.y = branchHeight;
      cup.castShadow = true;
      group.add(cup);
    }

    // Child branches
    if (depth < maxDepth) {
      const childCount = rng.nextInt(1, 3);
      for (let i = 0; i < childCount; i++) {
        const child = this.createFruticoseBranch(cfg, rng, depth + 1, maxDepth);
        child.position.y = branchHeight * rng.uniform(0.5, 1.0);
        child.rotation.x = rng.uniform(-0.4, 0.4);
        child.rotation.z = rng.uniform(-0.4, 0.4);
        group.add(child);
      }
    }

    return group;
  }
}

/**
 * Convenience function: generate lichen from config.
 */
export function generateLichen(config: Partial<LichenConfig> = {}, seed: number = 42): THREE.Group {
  const generator = new LichenGenerator(seed);
  return generator.generate(config);
}
