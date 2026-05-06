/**
 * FanCoralGenerator — Flat fan-shaped mesh with radial vein pattern.
 *
 * Generates sea fan / gorgonian-style coral with a curved planar
 * fan surface, radial veins, and horizontal crossbars.
 *
 * @module objects/coral
 */

import * as THREE from 'three';
import { SeededRandom, seededFbm } from '@/core/util/MathUtils';

// ── Types ──────────────────────────────────────────────────────────────

export interface FanCoralConfig {
  width: number;
  height: number;
  thickness: number;
  veinCount: number;
  veinThickness: number;
  crossBarCount: number;
  resolution: number;
  color: string;
  veinColor: string;
  curvature: number;
  seed: number;
}

const DEFAULT_CONFIG: FanCoralConfig = {
  width: 1.0,
  height: 0.8,
  thickness: 0.02,
  veinCount: 12,
  veinThickness: 0.01,
  crossBarCount: 8,
  resolution: 32,
  color: '#FF69B4',
  veinColor: '#C71585',
  curvature: 0.3,
  seed: 42,
};

// ── FanCoralGenerator Class ───────────────────────────────────────────

export class FanCoralGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a fan coral group.
   */
  generate(config: Partial<FanCoralConfig> = {}): THREE.Group {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new THREE.Group();
    group.name = 'FanCoral';

    // Stalk
    const stalkMat = new THREE.MeshStandardMaterial({ color: cfg.veinColor, roughness: 0.7 });
    const stalkGeo = new THREE.CylinderGeometry(cfg.thickness * 2, cfg.thickness * 3, cfg.height * 0.3, 8);
    const stalk = new THREE.Mesh(stalkGeo, stalkMat);
    stalk.position.y = cfg.height * 0.15;
    stalk.name = 'stalk';
    group.add(stalk);

    // Fan surface
    const fanMat = new THREE.MeshStandardMaterial({
      color: cfg.color, roughness: 0.6, side: THREE.DoubleSide,
      transparent: true, opacity: 0.85,
    });
    const fanGeo = this.createFanGeometry(cfg);
    const fan = new THREE.Mesh(fanGeo, fanMat);
    fan.position.y = cfg.height * 0.3;
    fan.name = 'fan';
    group.add(fan);

    // Radial veins
    const veinMat = new THREE.MeshStandardMaterial({
      color: cfg.veinColor, roughness: 0.5, metalness: 0.05,
    });
    for (let v = 0; v < cfg.veinCount; v++) {
      const angle = -Math.PI * 0.4 + (v / (cfg.veinCount - 1)) * Math.PI * 0.8;
      const veinLength = cfg.height * (0.7 + this.rng.next() * 0.3);
      const veinGeo = new THREE.CylinderGeometry(cfg.veinThickness * 0.5, cfg.veinThickness, veinLength, 4);
      const vein = new THREE.Mesh(veinGeo, veinMat);
      vein.position.set(
        Math.sin(angle) * veinLength * 0.4,
        cfg.height * 0.3 + Math.cos(angle) * veinLength * 0.4,
        0,
      );
      vein.rotation.z = angle;
      vein.name = `vein_${v}`;
      group.add(vein);
    }

    // Horizontal crossbars
    for (let c = 0; c < cfg.crossBarCount; c++) {
      const t = (c + 1) / (cfg.crossBarCount + 1);
      const barY = cfg.height * 0.3 + t * cfg.height * 0.7;
      const barWidth = cfg.width * t * Math.sin(t * Math.PI) * 0.8;
      if (barWidth < 0.05) continue;
      const barGeo = new THREE.CylinderGeometry(cfg.veinThickness * 0.3, cfg.veinThickness * 0.3, barWidth, 4);
      const bar = new THREE.Mesh(barGeo, veinMat);
      bar.position.y = barY;
      bar.rotation.z = Math.PI * 0.5;
      bar.name = `crossBar_${c}`;
      group.add(bar);
    }

    return group;
  }

  /** Create the fan-shaped geometry with curvature */
  private createFanGeometry(config: FanCoralConfig): THREE.BufferGeometry {
    const res = config.resolution;
    const halfWidth = config.width * 0.5;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let row = 0; row <= res; row++) {
      const v = row / res;
      const heightFrac = v;
      const widthAtHeight = Math.sin(heightFrac * Math.PI) * halfWidth;

      for (let col = 0; col <= res; col++) {
        const u = col / res;
        const x = (u - 0.5) * 2 * widthAtHeight;
        const y = v * config.height;
        const curvatureOffset = Math.sin(v * Math.PI) * config.curvature * config.thickness * 5;
        const z = curvatureOffset * (1 - Math.abs(u - 0.5) * 2);

        // Organic noise
        const noise = seededFbm(
          x * 5 + config.seed, y * 5, z * 5 + config.seed,
          2, 2.0, 0.5, config.seed + 100,
        ) * 0.005;

        positions.push(x, y, z + noise);
        normals.push(0, 0, 1);
        uvs.push(u, v);
      }
    }

    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const a = row * (res + 1) + col;
        const b = a + 1;
        const c = a + (res + 1);
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateFanCoral(config: Partial<FanCoralConfig> = {}): THREE.Group {
  const generator = new FanCoralGenerator(config.seed ?? 42);
  return generator.generate(config);
}
