/**
 * SnowLayerScatter.ts — Snow Accumulation on Surfaces
 *
 * Generates snow layer scatter instances with:
 *   - Snow accumulation based on surface slope (more on flat, less on steep)
 *   - Snow depth variation with noise
 *   - Edge feathering (thinner at edges)
 *   - Snow material with sparkle
 *
 * @module assets/objects/vegetation/scatter
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededNoise2D, seededFbm } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

export interface SnowLayerConfig {
  /** Area size to cover */
  areaSize: number;
  /** Snow depth (meters) */
  depth: number;
  /** Snow instance density (per square meter) */
  density: number;
  /** Maximum slope for snow accumulation (radians, default PI/4) */
  maxSlope: number;
  /** Noise scale for depth variation */
  noiseScale: number;
  /** Edge feather distance */
  edgeFeather: number;
  /** Random seed */
  seed: number;
  /** Whether to include sparkle */
  sparkle: boolean;
}

// ============================================================================
// SnowLayerScatter
// ============================================================================

/**
 * Scatters snow patches on surfaces, respecting slope and adding
 * depth variation with noise.
 *
 * Usage:
 * ```ts
 * const scatter = new SnowLayerScatter({ areaSize: 20, depth: 0.1 });
 * const snow = scatter.generate();
 * ```
 */
export class SnowLayerScatter {
  private config: SnowLayerConfig;
  private rng: SeededRandom;

  constructor(config: Partial<SnowLayerConfig> = {}) {
    this.config = {
      areaSize: 20,
      depth: 0.1,
      density: 5,
      maxSlope: Math.PI / 4,
      noiseScale: 0.3,
      edgeFeather: 0.5,
      seed: 42,
      sparkle: true,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate the snow layer scatter as a group.
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    const { areaSize, density, depth } = this.config;

    // Snow material with sparkle
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4ff,
      roughness: 0.6,
      metalness: 0.0,
    });

    // Add sparkle via emissive micro-highlights
    if (this.config.sparkle) {
      snowMat.emissive = new THREE.Color(0x405070);
      snowMat.emissiveIntensity = 0.05;
    }

    // Create instanced snow patches
    const patchGeo = this.createSnowPatchGeometry();
    const count = Math.floor(areaSize * areaSize * density);

    const mesh = new THREE.InstancedMesh(patchGeo, snowMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * areaSize;
      const z = (this.rng.next() - 0.5) * areaSize;

      // Compute slope at this position (using noise to simulate terrain)
      const slope = this.getSlopeAt(x, z);

      // Snow only accumulates on surfaces below max slope
      if (slope > this.config.maxSlope) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Depth varies with noise
      const noiseVal = seededNoise2D(
        x * this.config.noiseScale,
        z * this.config.noiseScale,
        2.0,
        this.config.seed,
      );
      const localDepth = depth * (0.5 + noiseVal * 0.5);

      // Edge feathering: thinner near edges
      const edgeDist = this.getDistanceFromEdge(x, z);
      const featherFactor = Math.min(1, edgeDist / this.config.edgeFeather);

      // Slope factor: less snow on steeper surfaces
      const slopeFactor = 1 - (slope / this.config.maxSlope);

      const finalDepth = localDepth * featherFactor * slopeFactor;

      // Position
      const y = finalDepth * 0.5;
      dummy.position.set(x, y, z);

      // Scale: patch size varies
      const patchScale = this.rng.uniform(0.5, 1.5);
      dummy.scale.set(patchScale, Math.max(0.01, finalDepth / depth), patchScale);

      dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color variation: slightly blue-white variation
      const color = new THREE.Color(0xf0f4ff).offsetHSL(
        this.rng.uniform(-0.01, 0.01),
        this.rng.uniform(-0.05, 0),
        this.rng.uniform(-0.05, 0.03),
      );
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    group.userData.tags = ['vegetation', 'scatter', 'snow'];
    return group;
  }

  /**
   * Create a single snow patch geometry — a flat rounded disc.
   */
  private createSnowPatchGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const radius = 0.15;
    const segments = 12;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
      steps: 1,
    });
  }

  /**
   * Simulate terrain slope at a position using noise derivatives.
   */
  private getSlopeAt(x: number, z: number): number {
    const eps = 0.1;
    const h = this.config.noiseScale;
    const seed = this.config.seed;

    const hL = seededNoise2D((x - eps) * h, z * h, 2.0, seed);
    const hR = seededNoise2D((x + eps) * h, z * h, 2.0, seed);
    const hD = seededNoise2D(x * h, (z - eps) * h, 2.0, seed);
    const hU = seededNoise2D(x * h, (z + eps) * h, 2.0, seed);

    const dx = (hR - hL) / (2 * eps);
    const dz = (hU - hD) / (2 * eps);

    // Slope angle from gradient magnitude
    return Math.atan(Math.sqrt(dx * dx + dz * dz) * 5);
  }

  /**
   * Compute distance from nearest edge of the area.
   */
  private getDistanceFromEdge(x: number, z: number): number {
    const halfSize = this.config.areaSize / 2;
    return Math.min(
      Math.abs(x + halfSize),
      Math.abs(x - halfSize),
      Math.abs(z + halfSize),
      Math.abs(z - halfSize),
    );
  }
}

/**
 * Convenience function: generate snow layer scatter.
 */
export function generateSnowLayer(config: Partial<SnowLayerConfig> = {}): THREE.Group {
  const scatter = new SnowLayerScatter(config);
  return scatter.generate();
}
