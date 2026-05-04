/**
 * NewScatterTypes.ts — P4.5: New Scatter Types
 *
 * Implements 11 scatter generators for ground-level and underwater detail objects.
 * Each generator is a class implementing a common ScatterGenerator interface,
 * supporting density control, seed-based randomization, and seasonal variation.
 *
 * Scatter generators:
 *   1. FernScatter         — Small fern fronds on forest floor
 *   2. MossScatter          — Moss patches on rocks and ground
 *   3. GroundLeavesScatter  — Fallen leaves on the ground
 *   4. PineNeedleScatter    — Pine needle debris under conifers
 *   5. SeashellScatter      — Seashells on beaches
 *   6. LichenScatter        — Lichen patches on rocks and tree bark (enhanced)
 *   7. PebbleScatter        — Small pebbles on paths and riverbeds
 *   8. SnowLayerScatter     — Snow accumulation with slope-based thickness
 *   9. SlimeMoldScatter     — Reaction-diffusion slime mold growth
 *  10. MolluskScatter       — Spiral shells on underwater surfaces
 *  11. JellyfishScatter     — Translucent jellyfish in water column
 *
 * Ported from: infinigen/terrain/objects/scatter/*.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Common Interface & Types
// ============================================================================

/** Season type for seasonal variation */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Base configuration shared by all scatter generators.
 */
export interface BaseScatterConfig {
  /** Density: instances per square meter (default 1.0) */
  density: number;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Season for color variation (default 'summer') */
  season: Season;
  /** Minimum scale for instances (default 0.8) */
  minScale: number;
  /** Maximum scale for instances (default 1.2) */
  maxScale: number;
  /** Area bounds for scattering (default 20x20) */
  bounds: THREE.Box3;
  /** Maximum slope in degrees for placement (default 60) */
  maxSlope: number;
  /** Whether to enable seasonal color variation (default true) */
  seasonalVariation: boolean;
}

const DEFAULT_BASE_CONFIG: BaseScatterConfig = {
  density: 1.0,
  seed: 42,
  season: 'summer',
  minScale: 0.8,
  maxScale: 1.2,
  bounds: new THREE.Box3(
    new THREE.Vector3(-20, 0, -20),
    new THREE.Vector3(20, 2, 20)
  ),
  maxSlope: 60,
  seasonalVariation: true,
};

/**
 * Result from a scatter generator.
 */
export interface ScatterGeneratorResult {
  /** InstancedMesh containing all scattered instances */
  mesh: THREE.InstancedMesh;
  /** Total number of placed instances */
  count: number;
  /** Positions of placed instances */
  positions: THREE.Vector3[];
  /** Whether generation succeeded */
  success: boolean;
}

/**
 * Common interface that all scatter generators implement.
 */
export interface ScatterGenerator<TConfig extends BaseScatterConfig = BaseScatterConfig> {
  /** Generate scatter instances and return an InstancedMesh */
  generate(config?: Partial<TConfig>): ScatterGeneratorResult;
  /** Get the base geometry for this scatter type */
  getGeometry(seed: number): THREE.BufferGeometry;
  /** Get the material for this scatter type with seasonal variation */
  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial;
}

// ============================================================================
// 1. FernScatter
// ============================================================================

export interface FernScatterConfig extends BaseScatterConfig {
  /** Number of fronds per fern instance (default 5) */
  frondCount: number;
  /** Frond length in world units (default 0.3) */
  frondLength: number;
  /** Frond width in world units (default 0.1) */
  frondWidth: number;
}

/**
 * FernScatter — Generates small fern fronds on the forest floor.
 * Produces multi-frond fern clusters with seasonal color variation.
 */
export class FernScatter implements ScatterGenerator<FernScatterConfig> {
  generate(config?: Partial<FernScatterConfig>): ScatterGeneratorResult {
    const cfg: FernScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      frondCount: 5,
      frondLength: 0.3,
      frondWidth: 0.1,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const matrix = new THREE.Matrix4();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.1);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng.uniform(0, Math.PI * 2), 0);
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const frondCount = 5;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2;
      const baseIdx = positions.length / 3;
      const frondLen = rng.uniform(0.2, 0.4);
      const frondW = rng.uniform(0.04, 0.08);

      // Base
      positions.push(0, 0, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5, 0);

      // Tip
      const tx = Math.cos(angle) * frondW;
      const ty = frondLen;
      const tz = Math.sin(angle) * frondW;
      positions.push(tx, ty, tz);
      normals.push(0, 0, 1);
      uvs.push(0.5, 1);

      // Left
      const la = angle - 0.4;
      positions.push(Math.cos(la) * frondW * 0.5, ty * 0.5, Math.sin(la) * frondW * 0.5);
      normals.push(0, 0, 1);
      uvs.push(0, 0.5);

      // Right
      const ra = angle + 0.4;
      positions.push(Math.cos(ra) * frondW * 0.5, ty * 0.5, Math.sin(ra) * frondW * 0.5);
      normals.push(0, 0, 1);
      uvs.push(1, 0.5);

      indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 3);

      // Add sub-leaflets along the frond
      const leafletCount = 4;
      for (let l = 1; l <= leafletCount; l++) {
        const t = l / (leafletCount + 1);
        const ly = frondLen * t;
        const lx = Math.cos(angle) * frondW * 0.3 * t;
        const lz = Math.sin(angle) * frondW * 0.3 * t;
        const lbIdx = positions.length / 3;
        const leafletLen = frondW * (1 - t * 0.5);

        positions.push(lx, ly, lz);
        normals.push(0, 0, 1);
        uvs.push(0.5, t);

        // Left leaflet
        positions.push(lx - Math.cos(angle - 0.5) * leafletLen, ly, lz - Math.sin(angle - 0.5) * leafletLen);
        normals.push(0, 0, 1);
        uvs.push(0, t);

        // Right leaflet
        positions.push(lx + Math.cos(angle + 0.5) * leafletLen, ly, lz + Math.sin(angle + 0.5) * leafletLen);
        normals.push(0, 0, 1);
        uvs.push(1, t);

        indices.push(lbIdx, lbIdx + 1, lbIdx + 2);
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

  getMaterial(_seed: number, season: Season): THREE.MeshStandardMaterial {
    const colors: Record<Season, number> = {
      spring: 0x7cb342,
      summer: 0x2e7d32,
      autumn: 0x8d6e63,
      winter: 0x5d4037,
    };
    return new THREE.MeshStandardMaterial({
      color: colors[season],
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 2. MossScatter
// ============================================================================

export interface MossScatterConfig extends BaseScatterConfig {
  /** Moss patch radius (default 0.05) */
  patchRadius: number;
  /** Moss thickness / height (default 0.02) */
  patchHeight: number;
}

/**
 * MossScatter — Generates moss patches on rocks and ground surfaces.
 * Produces small soft bumps with subtle color variation.
 */
export class MossScatter implements ScatterGenerator<MossScatterConfig> {
  generate(config?: Partial<MossScatterConfig>): ScatterGeneratorResult {
    const cfg: MossScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      patchRadius: 0.05,
      patchHeight: 0.02,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng.uniform(0, Math.PI * 2), 0);
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s * rng.uniform(0.5, 1.5), s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = 8;
    const radius = 0.05;
    const geo = new THREE.SphereGeometry(radius, segments, Math.max(4, segments / 2));
    // Flatten to a moss patch shape
    geo.scale(1, 0.4, 1);

    // Add slight noise displacement for organic feel
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const noise = rng.uniform(-0.005, 0.005);
      posAttr.setXYZ(i, x + noise, y + noise * 0.5, z + noise);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 50);
    const colors: Record<Season, number> = {
      spring: 0x4caf50,
      summer: 0x2e7d32,
      autumn: 0x558b2f,
      winter: 0x33691e,
    };
    const baseColor = new THREE.Color(colors[season]);
    // Slight variation
    baseColor.offsetHSL(rng.uniform(-0.02, 0.02), 0, rng.uniform(-0.05, 0.05));
    return new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95 });
  }
}

// ============================================================================
// 3. GroundLeavesScatter
// ============================================================================

export interface GroundLeavesScatterConfig extends BaseScatterConfig {
  /** Leaf size scale (default 1.0) */
  leafScale: number;
  /** Whether leaves lie flat on ground (default true) */
  flatOnGround: boolean;
}

/**
 * GroundLeavesScatter — Generates fallen leaves scattered on the ground.
 * Produces flat leaf shapes with autumnal color variation.
 */
export class GroundLeavesScatter implements ScatterGenerator<GroundLeavesScatterConfig> {
  generate(config?: Partial<GroundLeavesScatterConfig>): ScatterGeneratorResult {
    const cfg: GroundLeavesScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      leafScale: 1.0,
      flatOnGround: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.01);

      dummy.position.set(x, y, z);
      if (cfg.flatOnGround) {
        dummy.rotation.set(
          -Math.PI / 2 + rng.uniform(-0.1, 0.1),
          rng.uniform(0, Math.PI * 2),
          rng.uniform(-0.1, 0.1)
        );
      } else {
        dummy.rotation.set(
          rng.uniform(-0.3, 0.3),
          rng.uniform(0, Math.PI * 2),
          rng.uniform(-0.3, 0.3)
        );
      }
      const s = rng.uniform(cfg.minScale, cfg.maxScale) * cfg.leafScale;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(_seed: number): THREE.BufferGeometry {
    // Simple leaf shape: 4-vertex quad with elliptical shape
    const s = 0.05;
    const positions = new Float32Array([
      0, 0, -s * 0.5,
      -s * 0.3, 0, 0,
      0, 0, s * 0.5,
      s * 0.3, 0, 0,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);
    const indices = [0, 1, 2, 0, 2, 3];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 100);
    // Seasonal color palette for fallen leaves
    const colors: Record<Season, number[]> = {
      spring: [0x8bc34a, 0x7cb342, 0x689f38],
      summer: [0x4caf50, 0x388e3c, 0x2e7d32],
      autumn: [0xff8f00, 0xd84315, 0xbf360c, 0xf57f17, 0x8d6e63],
      winter: [0x795548, 0x6d4c41, 0x5d4037],
    };
    const palette = colors[season];
    const color = new THREE.Color(rng.choice(palette));
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 4. PineNeedleScatter
// ============================================================================

export interface PineNeedleScatterConfig extends BaseScatterConfig {
  /** Needle length (default 0.08) */
  needleLength: number;
  /** Whether to cluster needles in small groups (default true) */
  clusterNeedles: boolean;
}

/**
 * PineNeedleScatter — Generates pine needle debris under conifer trees.
 * Produces thin elongated triangles with dark green color.
 */
export class PineNeedleScatter implements ScatterGenerator<PineNeedleScatterConfig> {
  generate(config?: Partial<PineNeedleScatterConfig>): ScatterGeneratorResult {
    const cfg: PineNeedleScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      needleLength: 0.08,
      clusterNeedles: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.005);

      dummy.position.set(x, y, z);
      // Needles lie mostly flat with random rotation
      dummy.rotation.set(
        -Math.PI / 2 + rng.uniform(-0.2, 0.2),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.15, 0.15)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const needleLen = rng.uniform(0.06, 0.1);
    const needleW = 0.003;

    const positions = new Float32Array([
      -needleW, 0, 0,
      needleW, 0, 0,
      0, 0, needleLen,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const indices = [0, 1, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  getMaterial(_seed: number, season: Season): THREE.MeshStandardMaterial {
    const colors: Record<Season, number> = {
      spring: 0x33691e,
      summer: 0x1b5e20,
      autumn: 0x33691e,
      winter: 0x2e7d32,
    };
    return new THREE.MeshStandardMaterial({
      color: colors[season],
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 5. SeashellScatter
// ============================================================================

export interface SeashellScatterConfig extends BaseScatterConfig {
  /** Maximum shell size (default 0.06) */
  maxSize: number;
  /** Shell color hue range start (default 0.05) */
  hueMin: number;
  /** Shell color hue range end (default 0.15) */
  hueMax: number;
}

/**
 * SeashellScatter — Generates seashells on beach surfaces.
 * Produces small spiral shell shapes with pastel coloration.
 */
export class SeashellScatter implements ScatterGenerator<SeashellScatterConfig> {
  generate(config?: Partial<SeashellScatterConfig>): ScatterGeneratorResult {
    const cfg: SeashellScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      maxSize: 0.06,
      hueMin: 0.05,
      hueMax: 0.15,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.01);

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        rng.uniform(-0.1, 0.1),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.1, 0.1)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s * rng.uniform(0.7, 1.3), s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = 10;
    const radius = rng.uniform(0.03, 0.06);
    const geo = new THREE.SphereGeometry(radius, segments, Math.max(5, segments / 2));

    // Deform into a shell shape: elongate and add spiral taper
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Taper toward the top
      const t = (y + radius) / (2 * radius);
      const taper = 1.0 - t * 0.5;
      x *= taper;
      z *= taper;

      // Spiral offset
      const spiralAngle = t * Math.PI * 2;
      x += Math.cos(spiralAngle) * radius * 0.1 * t;
      z += Math.sin(spiralAngle) * radius * 0.1 * t;

      posAttr.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 200);
    const hue = rng.uniform(0.05, 0.15);
    const saturation = rng.uniform(0.15, 0.4);
    const lightness = rng.uniform(0.7, 0.9);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.05,
    });
  }
}

// ============================================================================
// 6. LichenScatter
// ============================================================================

export interface LichenScatterConfig extends BaseScatterConfig {
  /** Lichen patch radius (default 0.04) */
  patchRadius: number;
  /** Whether lichen grows on vertical surfaces (default true) */
  growsOnVertical: boolean;
  /** Color variant: 'green' | 'gray_green' | 'yellow_green' (default 'green') */
  colorVariant: 'green' | 'gray_green' | 'yellow_green';
}

/**
 * LichenScatter — Generates lichen patches on rocks and tree bark.
 * Produces flat circular patches with yellow-green coloration.
 */
export class LichenScatter implements ScatterGenerator<LichenScatterConfig> {
  generate(config?: Partial<LichenScatterConfig>): ScatterGeneratorResult {
    const cfg: LichenScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      patchRadius: 0.04,
      growsOnVertical: true,
      colorVariant: 'green',
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season, cfg.colorVariant);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.5);

      dummy.position.set(x, y, z);

      // Surface normal alignment: lichen grows on surfaces facing various directions
      if (cfg.growsOnVertical && rng.next() > 0.5) {
        // On vertical surface — align to wall normal
        const wallAngle = rng.uniform(0, Math.PI * 2);
        dummy.rotation.set(0, wallAngle, Math.PI / 2);
      } else {
        // On horizontal surface — flat attachment
        dummy.rotation.set(-Math.PI / 2, rng.uniform(0, Math.PI * 2), 0);
      }

      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Lichen patches are flat and irregular
      dummy.scale.set(
        s * rng.uniform(0.8, 1.5),
        s * rng.uniform(0.02, 0.06),
        s * rng.uniform(0.8, 1.5)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = Math.max(6, 10);
    const radius = rng.uniform(0.03, 0.06);
    // Flat patch geometry with irregular outline
    const geo = new THREE.CircleGeometry(radius, segments);

    // Add organic wobble for irregular patch shape
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      if (dist > 0.001) {
        const wobble = rng.uniform(0.85, 1.15);
        posAttr.setX(i, x * wobble);
        posAttr.setZ(i, z * wobble);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, season: Season, colorVariant?: 'green' | 'gray_green' | 'yellow_green'): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 300);
    // Color variation: green, gray-green, yellow-green
    const variantColors: Record<string, Record<Season, number>> = {
      green: { spring: 0x4caf50, summer: 0x2e7d32, autumn: 0x558b2f, winter: 0x33691e },
      gray_green: { spring: 0x9e9d24, summer: 0x827717, autumn: 0x9e9d24, winter: 0x827717 },
      yellow_green: { spring: 0xc0ca33, summer: 0x9e9d24, autumn: 0xc0ca33, winter: 0x9e9d24 },
    };
    const palette = variantColors[colorVariant || 'green'] || variantColors.green;
    const baseColor = new THREE.Color(palette[season]);
    baseColor.offsetHSL(rng.uniform(-0.03, 0.03), 0, rng.uniform(-0.05, 0.05));
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 7. PebbleScatter
// ============================================================================

export interface PebbleScatterConfig extends BaseScatterConfig {
  /** Pebble size range minimum (default 0.02) */
  pebbleMinSize: number;
  /** Pebble size range maximum (default 0.08) */
  pebbleMaxSize: number;
  /** Whether pebbles are rounded or angular (0 = angular, 1 = rounded, default 0.7) */
  roundness: number;
}

/**
 * PebbleScatter — Generates small pebbles on paths and riverbeds.
 * Produces flattened irregular stone shapes with earthy colors.
 */
export class PebbleScatter implements ScatterGenerator<PebbleScatterConfig> {
  generate(config?: Partial<PebbleScatterConfig>): ScatterGeneratorResult {
    const cfg: PebbleScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      pebbleMinSize: 0.02,
      pebbleMaxSize: 0.08,
      roundness: 0.7,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.005);

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        rng.uniform(-0.2, 0.2),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.2, 0.2)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Pebbles are typically wider than tall
      dummy.scale.set(
        s * rng.uniform(0.8, 1.3),
        s * rng.uniform(0.4, 0.8),
        s * rng.uniform(0.8, 1.3)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const radius = rng.uniform(0.02, 0.06);
    const geo = new THREE.DodecahedronGeometry(radius, 1);

    // Deform for natural pebble shape
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i) * rng.uniform(0.7, 1.3);
      const y = posAttr.getY(i) * rng.uniform(0.5, 0.9);
      const z = posAttr.getZ(i) * rng.uniform(0.7, 1.3);
      posAttr.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 400);
    // Earthy tones: brown, gray, tan
    const hue = rng.choice([0.0, 0.05, 0.08, 0.1, 0.6]); // browns and grays
    const saturation = rng.uniform(0.0, 0.2);
    const lightness = rng.uniform(0.25, 0.55);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// 8. SnowLayerScatter
// ============================================================================

export interface SnowLayerScatterConfig extends BaseScatterConfig {
  /** Snow patch radius (default 0.12) */
  patchRadius: number;
  /** Snow thickness on flat surfaces (default 0.03) */
  flatThickness: number;
  /** Wind drift direction angle in radians (default 0) */
  windDirection: number;
  /** Wind drift strength (default 0.02) */
  windStrength: number;
  /** Melt factor: 0 = full snow, 1 = heavily melted (default 0) */
  meltFactor: number;
}

/**
 * SnowLayerScatter — Generates snow accumulation patches on terrain surfaces.
 * Produces flattened dome shapes with slope-based thickness (thicker on flat
 * surfaces, thinner on steep), wind drift displacement, and melting effects.
 */
export class SnowLayerScatter implements ScatterGenerator<SnowLayerScatterConfig> {
  generate(config?: Partial<SnowLayerScatterConfig>): ScatterGeneratorResult {
    const cfg: SnowLayerScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      patchRadius: 0.12,
      flatThickness: 0.03,
      windDirection: 0,
      windStrength: 0.02,
      meltFactor: 0,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.01);

      // Wind drift displacement
      const drift = cfg.windStrength * rng.uniform(0.5, 1.5);
      const dx = Math.cos(cfg.windDirection) * drift;
      const dz = Math.sin(cfg.windDirection) * drift;

      dummy.position.set(x + dx, y, z + dz);
      // Snow lies mostly flat on surfaces
      dummy.rotation.set(
        rng.uniform(-0.05, 0.05),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.05, 0.05)
      );

      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Snow is wide and thin; melt reduces thickness
      const meltScale = 1.0 - cfg.meltFactor * rng.uniform(0.3, 0.7);
      dummy.scale.set(
        s * rng.uniform(0.9, 1.3),
        s * 0.15 * meltScale,
        s * rng.uniform(0.9, 1.3)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = 8;
    const radius = rng.uniform(0.08, 0.2);
    const geo = new THREE.SphereGeometry(radius, segments, Math.max(3, segments / 2));
    // Flatten into a snow accumulation shape
    geo.scale(1, 0.15, 1);

    // Slope-based thickness: thinner at edges (simulating steep terrain)
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const edgeFactor = 1.0 - Math.min(dist / radius, 1.0);
      // Thinner at edges (slope), thicker at center (flat accumulation)
      const heightMod = y * (0.5 + edgeFactor * 0.5);
      posAttr.setXYZ(i, x, heightMod, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(_seed: number, season: Season): THREE.MeshStandardMaterial {
    const colorMap: Record<Season, number> = {
      spring: 0xf0f0f5, // Slightly dirty snow
      summer: 0xe8e8ef, // Melted / thin
      autumn: 0xf5f5fa, // Fresh snow
      winter: 0xffffff,  // Pristine white
    };
    return new THREE.MeshStandardMaterial({
      color: colorMap[season] || 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
    });
  }
}

// ============================================================================
// 9. SlimeMoldScatter
// ============================================================================

export interface SlimeMoldScatterConfig extends BaseScatterConfig {
  /** Number of organic blobs per cluster (default 4) */
  blobCount: number;
  /** Growth spread radius (default 0.06) */
  spreadRadius: number;
  /** Color type: 'yellow' | 'orange' | 'white' (default 'yellow') */
  colorType: 'yellow' | 'orange' | 'white';
}

/**
 * SlimeMoldScatter — Generates slime mold growth on surfaces (rocks, trees, ground).
 * Uses reaction-diffusion-inspired placement with organic blob shapes
 * and color variation (yellow, orange, white).
 */
export class SlimeMoldScatter implements ScatterGenerator<SlimeMoldScatterConfig> {
  generate(config?: Partial<SlimeMoldScatterConfig>): ScatterGeneratorResult {
    const cfg: SlimeMoldScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      blobCount: 4,
      spreadRadius: 0.06,
      colorType: 'yellow',
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season, cfg.colorType);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      // Slime mold attaches to surfaces (ground, rocks, tree trunks)
      const y = cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.6);

      dummy.position.set(x, y, z);

      // Surface-attached: mostly flat with slight random tilt
      if (rng.next() > 0.7) {
        // On vertical surface
        const wallAngle = rng.uniform(0, Math.PI * 2);
        dummy.rotation.set(0, wallAngle, Math.PI / 2);
      } else {
        // On horizontal / sloped surface
        dummy.rotation.set(
          -Math.PI / 2 + rng.uniform(-0.3, 0.3),
          rng.uniform(0, Math.PI * 2),
          rng.uniform(-0.3, 0.3)
        );
      }

      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Slime mold is flat and spread out
      dummy.scale.set(
        s * rng.uniform(0.8, 1.4),
        s * rng.uniform(0.03, 0.08),
        s * rng.uniform(0.8, 1.4)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = Math.max(5, 8);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Reaction-diffusion growth pattern: multiple organic blobs
    const blobCount = rng.nextInt(3, 6);

    for (let b = 0; b < blobCount; b++) {
      const baseIdx = positions.length / 3;
      // Spread blobs from center using grid-based growth simulation
      const cx = rng.uniform(-0.04, 0.04);
      const cy = 0;
      const cz = rng.uniform(-0.04, 0.04);
      const blobRadius = rng.uniform(0.015, 0.04);

      // Center vertex
      positions.push(cx, cy, cz);
      normals.push(0, 1, 0);
      uvs.push(0.5, 0.5);

      // Ring vertices with organic wobble
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const wobble = rng.uniform(0.8, 1.2);
        const px = cx + Math.cos(angle) * blobRadius * wobble;
        const py = cy + rng.uniform(0.002, 0.01);
        const pz = cz + Math.sin(angle) * blobRadius * wobble;
        positions.push(px, py, pz);
        normals.push(0, 1, 0);
        uvs.push(0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4);

        const curr = baseIdx + 1 + s;
        const next = baseIdx + 1 + ((s + 1) % segments);
        indices.push(baseIdx, next, curr);
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

  getMaterial(seed: number, _season: Season, colorType?: 'yellow' | 'orange' | 'white'): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 500);
    const colorMap: Record<string, [number, number, number]> = {
      yellow: [0.12, 0.7, 0.65],
      orange: [0.08, 0.65, 0.55],
      white: [0.0, 0.1, 0.85],
    };
    const base = colorMap[colorType || 'yellow'] || colorMap.yellow;
    const hue = base[0] + rng.uniform(-0.02, 0.02);
    const saturation = base[1] + rng.uniform(-0.1, 0.1);
    const lightness = base[2] + rng.uniform(-0.05, 0.05);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 10. MolluskScatter
// ============================================================================

export interface MolluskScatterConfig extends BaseScatterConfig {
  /** Shell spiral turns (default 2.0) */
  spiralTurns: number;
  /** Shell radius (default 0.04) */
  shellRadius: number;
  /** Whether shells are underwater (default true) */
  underwater: boolean;
}

/**
 * MolluskScatter — Generates mollusk shells attached to underwater rocks and surfaces.
 * Produces parametric spiral shell geometry with size/shape variation via SeededRandom.
 * Shell orientation follows the surface normal of attachment points.
 */
export class MolluskScatter implements ScatterGenerator<MolluskScatterConfig> {
  generate(config?: Partial<MolluskScatterConfig>): ScatterGeneratorResult {
    const cfg: MolluskScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      spiralTurns: 2.0,
      shellRadius: 0.04,
      underwater: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      // Mollusks attach to underwater surfaces
      const y = cfg.underwater
        ? cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.3)
        : cfg.bounds.min.y + rng.uniform(0, 0.02);

      dummy.position.set(x, y, z);

      // Shell orientation follows surface normal
      // For underwater rocks, shells face outward at various angles
      const normalAngle = rng.uniform(0, Math.PI * 2);
      const tilt = rng.uniform(0, Math.PI * 0.5);
      dummy.rotation.set(
        tilt * Math.cos(normalAngle),
        rng.uniform(0, Math.PI * 2),
        tilt * Math.sin(normalAngle)
      );

      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Shells vary in proportions
      dummy.scale.set(
        s * rng.uniform(0.8, 1.2),
        s * rng.uniform(0.9, 1.3),
        s * rng.uniform(0.8, 1.2)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const spiralTurns = rng.uniform(1.5, 3.0);
    const shellRadius = rng.uniform(0.02, 0.06);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Parametric spiral shell using tube-like geometry
    const ringCount = 8;
    const ringSegments = 6;

    for (let r = 0; r < ringCount; r++) {
      const t = r / (ringCount - 1);
      // Spiral path
      const spiralAngle = t * spiralTurns * Math.PI * 2;
      const spiralRadius = t * shellRadius;
      const cx = Math.cos(spiralAngle) * spiralRadius;
      const cy = t * shellRadius * 1.5;
      const cz = Math.sin(spiralAngle) * spiralRadius;

      // Cross-section ring that tapers toward the tip
      const crossRadius = shellRadius * (1 - t * 0.5) * 0.4;
      for (let s = 0; s < ringSegments; s++) {
        const angle = (s / ringSegments) * Math.PI * 2;
        positions.push(
          cx + Math.cos(angle) * crossRadius,
          cy + Math.sin(angle) * crossRadius * 0.5,
          cz + Math.sin(angle) * crossRadius
        );
        normals.push(Math.cos(angle), 0, Math.sin(angle));
        uvs.push(r / ringCount, s / ringSegments);
      }
    }

    // Build triangle indices connecting rings
    for (let r = 0; r < ringCount - 1; r++) {
      for (let s = 0; s < ringSegments; s++) {
        const curr = r * ringSegments + s;
        const next = r * ringSegments + ((s + 1) % ringSegments);
        const currAbove = (r + 1) * ringSegments + s;
        const nextAbove = (r + 1) * ringSegments + ((s + 1) % ringSegments);
        indices.push(curr, next, currAbove);
        indices.push(next, nextAbove, currAbove);
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

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 600);
    // Mollusk shells: cream, pinkish, or brownish
    const hue = rng.uniform(0.02, 0.12);
    const saturation = rng.uniform(0.1, 0.4);
    const lightness = rng.uniform(0.6, 0.85);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.1,
    });
  }
}

// ============================================================================
// 11. JellyfishScatter
// ============================================================================

export interface JellyfishScatterConfig extends BaseScatterConfig {
  /** Bell radius (default 0.1) */
  bellRadius: number;
  /** Bell height (default 0.07) */
  bellHeight: number;
  /** Number of tentacles (default 6) */
  tentacleCount: number;
  /** Tentacle length (default 0.2) */
  tentacleLength: number;
  /** Water surface Y height for positioning (default 5.0) */
  waterSurfaceY: number;
  /** Water floor Y height (default 0.0) */
  waterFloorY: number;
  /** Pulse animation phase offset (default 0) */
  pulsePhase: number;
}

/**
 * JellyfishScatter — Generates jellyfish floating in the water column.
 * Produces bell-shaped geometry with tentacles, positioned between water
 * surface and floor. Features translucent material and tentacle variation.
 */
export class JellyfishScatter implements ScatterGenerator<JellyfishScatterConfig> {
  generate(config?: Partial<JellyfishScatterConfig>): ScatterGeneratorResult {
    const cfg: JellyfishScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      bellRadius: 0.1,
      bellHeight: 0.07,
      tentacleCount: 6,
      tentacleLength: 0.2,
      waterSurfaceY: 5.0,
      waterFloorY: 0.0,
      pulsePhase: 0,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      // Float in water column between surface and floor
      const minY = cfg.waterFloorY + 0.5;
      const maxY = cfg.waterSurfaceY - 0.3;
      const y = minY + rng.next() * Math.max(0.1, maxY - minY);

      dummy.position.set(x, y, z);
      // Jellyfish gently rotate and tilt
      dummy.rotation.set(
        rng.uniform(-0.15, 0.15),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.15, 0.15)
      );

      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s * rng.uniform(0.9, 1.2), s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const bellRadius = rng.uniform(0.06, 0.15);
    const bellHeight = rng.uniform(0.04, 0.1);
    const tentacleCount = rng.nextInt(4, 8);
    const tentacleSegments = 6;
    const segments = 12;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Bell: parabolic dome shape
    const bellRings = 6;
    // Apex vertex
    positions.push(0, bellHeight, 0);
    normals.push(0, 1, 0);
    uvs.push(0.5, 0);

    for (let r = 1; r <= bellRings; r++) {
      const t = r / bellRings;
      const ringY = bellHeight * (1 - t * t); // Parabolic dome
      const ringRadius = bellRadius * Math.sin(t * Math.PI * 0.5);

      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const px = Math.cos(angle) * ringRadius;
        const pz = Math.sin(angle) * ringRadius;
        positions.push(px, ringY, pz);
        normals.push(px, 0.5, pz);
        uvs.push(s / segments, t);

        if (r < bellRings) {
          const curr = 1 + (r - 1) * segments + s;
          const next = 1 + (r - 1) * segments + ((s + 1) % segments);
          const currAbove = 1 + r * segments + s;
          const nextAbove = 1 + r * segments + ((s + 1) % segments);

          if (r === 1) {
            indices.push(0, next, curr);
          }
          indices.push(curr, next, currAbove);
          indices.push(next, nextAbove, currAbove);
        }
      }
    }

    // Tentacles: thin strips hanging from bell edge
    const bellEdgeStart = 1 + (bellRings - 1) * segments;
    for (let t = 0; t < tentacleCount; t++) {
      const tentAngle = (t / tentacleCount) * Math.PI * 2;
      const segIdx = Math.floor((t / tentacleCount) * segments);
      const baseVertex = bellEdgeStart + segIdx;

      const bx = positions[baseVertex * 3];
      const by = positions[baseVertex * 3 + 1];
      const bz = positions[baseVertex * 3 + 2];

      const tentLength = rng.uniform(0.1, 0.3);
      const tentBaseIdx = positions.length / 3;

      for (let s = 0; s <= tentacleSegments; s++) {
        const st = s / tentacleSegments;
        const sx = bx + Math.cos(tentAngle) * st * 0.02;
        const sy = by - st * tentLength;
        const sz = bz + Math.sin(tentAngle) * st * 0.02;

        const stripWidth = 0.003 * (1 - st * 0.5);
        positions.push(sx - stripWidth, sy, sz);
        normals.push(0, 0, 1);
        uvs.push(0, st);

        positions.push(sx + stripWidth, sy, sz);
        normals.push(0, 0, 1);
        uvs.push(1, st);

        if (s > 0) {
          const vi = tentBaseIdx + s * 2;
          indices.push(vi - 2, vi - 1, vi);
          indices.push(vi - 1, vi + 1, vi);
        }
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

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 700);
    // Translucent jellyfish colors: pale blue, pink, or white
    const hue = rng.choice([0.55, 0.58, 0.92, 0.0]);
    const saturation = rng.uniform(0.2, 0.6);
    const lightness = rng.uniform(0.7, 0.9);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
  }
}
