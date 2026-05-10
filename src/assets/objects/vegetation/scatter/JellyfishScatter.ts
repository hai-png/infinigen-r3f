/**
 * JellyfishScatter.ts — Bioluminescent Jellyfish Scatter
 *
 * Generates jellyfish scatter instances with:
 *   - Bell geometry with pulsing animation support
 *   - Tentacle trailing physics
 *   - Bioluminescent emission
 *   - Multiple species variants
 *
 * @module assets/objects/vegetation/scatter
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Jellyfish species variant */
export type JellyfishSpecies = 'moon_jelly' | 'lion_mane' | 'crystal_jelly' | 'comb_jelly';

export interface JellyfishScatterConfig {
  /** Number of jellyfish to scatter */
  count: number;
  /** Scatter volume (width x height x depth) */
  volumeSize: THREE.Vector3;
  /** Species to generate */
  species: JellyfishSpecies;
  /** Bell radius range [min, max] */
  bellRadiusRange: [number, number];
  /** Bioluminescence intensity (0-1) */
  bioluminescence: number;
  /** Pulsing animation enabled */
  pulseEnabled: boolean;
  /** Random seed */
  seed: number;
}

/** Species-specific parameters */
const JELLYFISH_SPECIES: Record<JellyfishSpecies, {
  bellColor: number;
  emissiveColor: number;
  tentacleCount: number;
  tentacleLength: number;
  bellOpacity: number;
}> = {
  moon_jelly: {
    bellColor: 0x8090c0,
    emissiveColor: 0x4060a0,
    tentacleCount: 16,
    tentacleLength: 0.3,
    bellOpacity: 0.5,
  },
  lion_mane: {
    bellColor: 0xc06020,
    emissiveColor: 0x804010,
    tentacleCount: 24,
    tentacleLength: 0.8,
    bellOpacity: 0.7,
  },
  crystal_jelly: {
    bellColor: 0xa0e0e0,
    emissiveColor: 0x40c0c0,
    tentacleCount: 8,
    tentacleLength: 0.2,
    bellOpacity: 0.3,
  },
  comb_jelly: {
    bellColor: 0xc080e0,
    emissiveColor: 0x8040c0,
    tentacleCount: 4,
    tentacleLength: 0.15,
    bellOpacity: 0.4,
  },
};

// ============================================================================
// JellyfishScatter
// ============================================================================

/**
 * Scatters jellyfish in a volume with bell geometry, tentacles,
 * and bioluminescent emission.
 *
 * Usage:
 * ```ts
 * const scatter = new JellyfishScatter({ count: 10, species: 'moon_jelly' });
 * const jellyfish = scatter.generate();
 * ```
 */
export class JellyfishScatter {
  private config: JellyfishScatterConfig;
  private rng: SeededRandom;

  constructor(config: Partial<JellyfishScatterConfig> = {}) {
    this.config = {
      count: 5,
      volumeSize: new THREE.Vector3(10, 5, 10),
      species: 'moon_jelly',
      bellRadiusRange: [0.1, 0.3],
      bioluminescence: 0.5,
      pulseEnabled: true,
      seed: 42,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Generate jellyfish scatter as a group.
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    const speciesParams = JELLYFISH_SPECIES[this.config.species];

    for (let i = 0; i < this.config.count; i++) {
      const jellyfish = this.createJellyfish(speciesParams);
      group.add(jellyfish);
    }

    group.userData.tags = ['vegetation', 'scatter', 'jellyfish', this.config.species];
    if (this.config.pulseEnabled) {
      group.userData.animationType = 'jellyfish_pulse';
    }
    return group;
  }

  /**
   * Create a single jellyfish with bell, tentacles, and bioluminescence.
   */
  private createJellyfish(
    speciesParams: typeof JELLYFISH_SPECIES[JellyfishSpecies],
  ): THREE.Group {
    const group = new THREE.Group();
    const bellRadius = this.rng.uniform(
      this.config.bellRadiusRange[0],
      this.config.bellRadiusRange[1],
    );

    // Position within volume
    group.position.set(
      (this.rng.next() - 0.5) * this.config.volumeSize.x,
      (this.rng.next() - 0.5) * this.config.volumeSize.y,
      (this.rng.next() - 0.5) * this.config.volumeSize.z,
    );

    // Bell
    const bell = this.createBell(bellRadius, speciesParams);
    group.add(bell);

    // Tentacles
    const tentacles = this.createTentacles(bellRadius, speciesParams);
    group.add(tentacles);

    // Bioluminescent glow
    if (this.config.bioluminescence > 0) {
      const glow = this.createBioluminescentGlow(bellRadius, speciesParams);
      group.add(glow);
    }

    // Animation data
    group.userData.pulsePhase = this.rng.uniform(0, Math.PI * 2);
    group.userData.pulseSpeed = this.rng.uniform(0.5, 1.5);

    return group;
  }

  /**
   * Create the bell (dome) geometry.
   */
  private createBell(
    radius: number,
    speciesParams: typeof JELLYFISH_SPECIES[JellyfishSpecies],
  ): THREE.Mesh {
    // Hemisphere bell with slight scalloping at the rim
    const geo = new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);

    // Scalloped rim
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const distFromCenter = Math.sqrt(x * x + z * z);

      // Only scallop near the rim
      if (distFromCenter > radius * 0.7 && y < radius * 0.3) {
        const angle = Math.atan2(z, x);
        const scallop = Math.sin(angle * 8) * radius * 0.03;
        posAttr.setY(i, y + scallop);
      }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: speciesParams.bellColor,
      roughness: 0.3,
      metalness: 0.0,
      transparent: true,
      opacity: speciesParams.bellOpacity,
      side: THREE.DoubleSide,
      emissive: speciesParams.emissiveColor,
      emissiveIntensity: this.config.bioluminescence * 0.3,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * Create trailing tentacles.
   */
  private createTentacles(
    bellRadius: number,
    speciesParams: typeof JELLYFISH_SPECIES[JellyfishSpecies],
  ): THREE.Group {
    const group = new THREE.Group();
    const count = speciesParams.tentacleCount;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = bellRadius * 0.6;

      const startX = Math.cos(angle) * r;
      const startZ = Math.sin(angle) * r;

      // Create wavy tentacle using curve
      const tentacleLength = speciesParams.tentacleLength * this.rng.uniform(0.7, 1.3);
      const waveCount = 3;
      const waveAmp = tentacleLength * 0.05;
      const points: THREE.Vector3[] = [];

      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        const wave = Math.sin(t * Math.PI * waveCount + angle) * waveAmp * t;
        points.push(new THREE.Vector3(
          startX + wave * Math.cos(angle + Math.PI / 2),
          -t * tentacleLength,
          startZ + wave * Math.sin(angle + Math.PI / 2),
        ));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tentacleGeo = new THREE.TubeGeometry(
        curve, 8, 0.003 * (1 - 0.5 * (1 / 10)), 3, false,
      );

      const tentacleMat = new THREE.MeshStandardMaterial({
        color: speciesParams.bellColor,
        roughness: 0.4,
        metalness: 0.0,
        transparent: true,
        opacity: speciesParams.bellOpacity * 0.7,
        emissive: speciesParams.emissiveColor,
        emissiveIntensity: this.config.bioluminescence * 0.15,
      });

      const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
      tentacle.castShadow = true;
      group.add(tentacle);
    }

    // Oral arms (shorter, thicker tentacles)
    const armCount = 4;
    for (let i = 0; i < armCount; i++) {
      const angle = (i / armCount) * Math.PI * 2 + Math.PI / 4;
      const r = bellRadius * 0.3;

      const armLength = speciesParams.tentacleLength * 0.4 * this.rng.uniform(0.8, 1.2);
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        points.push(new THREE.Vector3(
          Math.cos(angle) * r * (1 - t * 0.3),
          -t * armLength,
          Math.sin(angle) * r * (1 - t * 0.3),
        ));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const armGeo = new THREE.TubeGeometry(curve, 6, 0.006, 4, false);
      const armMat = new THREE.MeshStandardMaterial({
        color: speciesParams.bellColor,
        roughness: 0.4,
        metalness: 0.0,
        transparent: true,
        opacity: speciesParams.bellOpacity * 0.8,
        emissive: speciesParams.emissiveColor,
        emissiveIntensity: this.config.bioluminescence * 0.2,
      });

      const arm = new THREE.Mesh(armGeo, armMat);
      arm.castShadow = true;
      group.add(arm);
    }

    return group;
  }

  /**
   * Create a bioluminescent glow sphere.
   */
  private createBioluminescentGlow(
    radius: number,
    speciesParams: typeof JELLYFISH_SPECIES[JellyfishSpecies],
  ): THREE.Mesh {
    const glowGeo = new THREE.SphereGeometry(radius * 0.6, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: speciesParams.emissiveColor,
      transparent: true,
      opacity: this.config.bioluminescence * 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.scale.set(1.5, 1.0, 1.5);
    return glow;
  }
}

/**
 * Convenience function: generate jellyfish scatter.
 */
export function generateJellyfishScatter(config: Partial<JellyfishScatterConfig> = {}): THREE.Group {
  const scatter = new JellyfishScatter(config);
  return scatter.generate();
}
