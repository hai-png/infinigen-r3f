/**
 * LichenScatter.ts — Lichen Patch Scatter on Surfaces
 *
 * Scatters lichen patches on rocks and trees with:
 *   - Surface-colored patches matching substrate
 *   - Growth pattern simulation (circular expansion)
 *   - Size variation and clustering
 *
 * @module assets/objects/vegetation/scatter
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededNoise2D } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export interface LichenScatterConfig {
  /** Area size to cover */
  areaSize: number;
  /** Lichen density (patches per square meter) */
  density: number;
  /** Maximum patch radius */
  maxPatchRadius: number;
  /** Minimum patch radius */
  minPatchRadius: number;
  /** Lichen color (greenish-grey) */
  color: THREE.Color;
  /** Secondary color for variation */
  secondaryColor: THREE.Color;
  /** Cluster strength (0-1: how much patches cluster together) */
  clusterStrength: number;
  /** Surface type: 'rock' | 'bark' | 'ground' */
  surfaceType: 'rock' | 'bark' | 'ground';
  /** Random seed */
  seed: number;
}

// ============================================================================
// LichenScatter
// ============================================================================

/**
 * Scatters lichen patches on surfaces with growth pattern simulation.
 *
 * Usage:
 * ```ts
 * const scatter = new LichenScatter({ areaSize: 10, surfaceType: 'rock' });
 * const lichen = scatter.generate();
 * ```
 */
export class LichenScatter {
  private config: LichenScatterConfig;
  private rng: SeededRandom;

  constructor(config: Partial<LichenScatterConfig> = {}) {
    this.config = {
      areaSize: 10,
      density: 3,
      maxPatchRadius: 0.08,
      minPatchRadius: 0.02,
      color: new THREE.Color(0x7a8a5a),
      secondaryColor: new THREE.Color(0x8a9a6a),
      clusterStrength: 0.5,
      surfaceType: 'rock',
      seed: 42,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate lichen scatter as a group.
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    const { areaSize, density, minPatchRadius, maxPatchRadius } = this.config;

    // Generate cluster centers
    const clusterCenters: THREE.Vector2[] = [];
    const clusterCount = Math.floor(areaSize * areaSize * density * 0.1);
    for (let i = 0; i < clusterCount; i++) {
      clusterCenters.push(new THREE.Vector2(
        (this.rng.next() - 0.5) * areaSize,
        (this.rng.next() - 0.5) * areaSize,
      ));
    }

    // Generate lichen patches
    const patchCount = Math.floor(areaSize * areaSize * density);
    const patchGeo = this.createPatchGeometry();
    const patchMat = this.createPatchMaterial();

    const mesh = new THREE.InstancedMesh(patchGeo, patchMat, patchCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < patchCount; i++) {
      let x: number, z: number;

      // Clustering: some patches cluster around centers
      if (this.rng.next() < this.config.clusterStrength && clusterCenters.length > 0) {
        const center = this.rng.choice(clusterCenters);
        x = center.x + this.rng.gaussian(0, areaSize * 0.05);
        z = center.y + this.rng.gaussian(0, areaSize * 0.05);
      } else {
        x = (this.rng.next() - 0.5) * areaSize;
        z = (this.rng.next() - 0.5) * areaSize;
      }

      // Growth noise: prefer areas with high moisture (noise > 0)
      const growthNoise = seededNoise2D(
        x * 0.5,
        z * 0.5,
        2.0,
        this.config.seed,
      );
      if (growthNoise < -0.2) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const radius = this.rng.uniform(minPatchRadius, maxPatchRadius);
      dummy.position.set(x, 0.001, z);
      dummy.scale.set(radius * 20, 1, radius * 20);
      dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color variation based on surface type and position
      const baseColor = this.config.color.clone().lerp(
        this.config.secondaryColor,
        this.rng.next() * 0.5,
      );

      // Surface-adaptive color tinting
      if (this.config.surfaceType === 'rock') {
        baseColor.offsetHSL(0, -0.1, this.rng.uniform(-0.05, 0.05));
      } else if (this.config.surfaceType === 'bark') {
        baseColor.offsetHSL(-0.02, 0, this.rng.uniform(-0.05, 0.05));
      }

      baseColor.offsetHSL(
        this.rng.uniform(-0.02, 0.02),
        this.rng.uniform(-0.1, 0.1),
        this.rng.uniform(-0.1, 0.1),
      );
      mesh.setColorAt(i, baseColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.userData.tags = ['vegetation', 'scatter', 'lichen', this.config.surfaceType];
    return group;
  }

  /**
   * Create a lichen patch geometry — flat irregular disc.
   */
  private createPatchGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const segments = 10;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const r = 0.05 * (0.8 + Math.sin(angle * 3) * 0.1 + Math.cos(angle * 5) * 0.1);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    return new THREE.ShapeGeometry(shape, 2);
  }

  /**
   * Create lichen patch material.
   */
  private createPatchMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
}

/**
 * Convenience function: generate lichen scatter.
 */
export function generateLichenScatter(config: Partial<LichenScatterConfig> = {}): THREE.Group {
  const scatter = new LichenScatter(config);
  return scatter.generate();
}
