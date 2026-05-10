/**
 * CoconutPalmGenerator.ts — Coconut Palm Tree Extension
 *
 * Extends PalmGenerator with:
 *   - Coconut fruit cluster generation at crown
 *   - Curved trunk with ring patterns (leaf scar texture)
 *   - Frond detail with midrib
 *   - Hairy and green coconut variants
 *
 * @module assets/objects/vegetation/trees
 */

import * as THREE from 'three';
import { BaseObjectGenerator, type BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Coconut variant type */
export type CoconutVariant = 'hairy' | 'green';

/** Configuration for coconut palm generation */
export interface CoconutPalmConfig extends BaseGeneratorConfig {
  /** Trunk height */
  trunkHeight: number;
  /** Trunk base radius */
  trunkRadius: number;
  /** Trunk curvature amount */
  curvature: number;
  /** Number of fronds */
  frondCount: number;
  /** Frond length */
  frondLength: number;
  /** Number of coconuts */
  coconutCount: number;
  /** Coconut variant */
  coconutVariant: CoconutVariant;
  /** Coconut size */
  coconutSize: number;
  /** Ring pattern density (rings per meter) */
  ringDensity: number;
}

// ============================================================================
// CoconutPalmGenerator
// ============================================================================

/**
 * Generates a detailed coconut palm tree with coconuts, ringed trunk,
 * and fronds with midribs.
 *
 * Usage:
 * ```ts
 * const gen = new CoconutPalmGenerator(42);
 * const palm = gen.generate({ coconutVariant: 'hairy' });
 * ```
 */
export class CoconutPalmGenerator extends BaseObjectGenerator<CoconutPalmConfig> {
  getDefaultConfig(): CoconutPalmConfig {
    return {
      trunkHeight: 7.0,
      trunkRadius: 0.15,
      curvature: 0.3,
      frondCount: 12,
      frondLength: 2.0,
      coconutCount: 4,
      coconutVariant: 'hairy',
      coconutSize: 0.08,
      ringDensity: 8,
      seed: 42,
    };
  }

  generate(config: Partial<CoconutPalmConfig> = {}): THREE.Group {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(cfg.seed ?? this.seed);
    const group = new THREE.Group();

    // Curved trunk with rings
    const trunk = this.createRingedTrunk(cfg, rng);
    group.add(trunk);

    // Fronds with midrib detail
    const crown = this.createCrown(cfg, rng);
    crown.position.y = cfg.trunkHeight;
    group.add(crown);

    // Coconut cluster
    const coconuts = this.createCoconutCluster(cfg, rng);
    coconuts.position.y = cfg.trunkHeight - 0.3;
    group.add(coconuts);

    group.userData.tags = ['vegetation', 'tree', 'palm', 'coconut', cfg.coconutVariant];
    return group;
  }

  // --------------------------------------------------------------------------
  // Trunk with Ring Patterns
  // --------------------------------------------------------------------------

  /**
   * Create a curved trunk with ring (leaf scar) patterns.
   */
  private createRingedTrunk(cfg: CoconutPalmConfig, rng: SeededRandom): THREE.Mesh {
    // Create curved trunk path
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(cfg.curvature * 0.5, cfg.trunkHeight * 0.3, rng.uniform(-0.1, 0.1)),
      new THREE.Vector3(cfg.curvature, cfg.trunkHeight * 0.7, rng.uniform(-0.1, 0.1)),
      new THREE.Vector3(cfg.curvature * 0.8, cfg.trunkHeight, 0),
    ]);

    // Build trunk with varying radius
    const tubularSegments = 40;
    const radialSegments = 10;
    const frames = curve.computeFrenetFrames(tubularSegments, false);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const point = curve.getPointAt(t);
      const N = frames.normals[i];
      const B = frames.binormals[i];

      // Taper: wider at base, thinner at top
      const baseTaper = 1.0 - t * 0.3;
      // Root flare
      const rootFlare = t < 0.1 ? 1.0 + (0.1 - t) * 3 : 1.0;
      const radius = cfg.trunkRadius * baseTaper * rootFlare;

      // Ring pattern: slight radius variation for leaf scars
      const ringPhase = t * cfg.trunkHeight * cfg.ringDensity * Math.PI * 2;
      const ringModulation = Math.sin(ringPhase) * radius * 0.03;

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;

        const r = radius + ringModulation;
        positions.push(
          point.x + r * nx,
          point.y + r * ny,
          point.z + r * nz,
        );
        normals.push(nx, ny, nz);
        uvs.push(j / radialSegments, t);
      }
    }

    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = (i + 1) * (radialSegments + 1) + (j + 1);
        const d = i * (radialSegments + 1) + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x7a6a4a,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Crown (Fronds)
  // --------------------------------------------------------------------------

  /**
   * Create the frond crown at the top of the trunk.
   */
  private createCrown(cfg: CoconutPalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    // Crown shaft (swollen area below fronds)
    const shaftGeo = new THREE.CylinderGeometry(
      cfg.trunkRadius * 1.2,
      cfg.trunkRadius * 0.9,
      0.3,
      8,
    );
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x5a8a3a,
      roughness: 0.7,
      metalness: 0.0,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = -0.15;
    shaft.castShadow = true;
    group.add(shaft);

    // Fronds with midribs
    for (let i = 0; i < cfg.frondCount; i++) {
      const angle = (i / cfg.frondCount) * Math.PI * 2 + rng.uniform(-0.05, 0.05);
      const frond = this.createDetailedFrond(cfg, rng);
      frond.rotation.y = angle;
      frond.rotation.x = -0.3 - rng.uniform(0, 0.5);
      group.add(frond);
    }

    return group;
  }

  /**
   * Create a single frond with visible midrib and blade segments.
   */
  private createDetailedFrond(cfg: CoconutPalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    // Frond curve
    const frondCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(cfg.frondLength * 0.4, 0.15, 0),
      new THREE.Vector3(cfg.frondLength * 0.7, 0.05, 0),
      new THREE.Vector3(cfg.frondLength, -0.25, 0),
    ]);

    // Midrib (thick central vein)
    const midribGeo = new THREE.TubeGeometry(frondCurve, 12, 0.015, 4, false);
    const midribMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1f,
      roughness: 0.7,
      metalness: 0.0,
    });
    const midrib = new THREE.Mesh(midribGeo, midribMat);
    midrib.castShadow = true;
    group.add(midrib);

    // Leaf blades along the midrib
    const bladeCount = 16;
    for (let j = 1; j <= bladeCount; j++) {
      const t = j / (bladeCount + 1);
      const point = frondCurve.getPointAt(t);
      const bladeLen = cfg.frondLength * 0.25 * (1 - t * 0.6);
      const bladeWidth = 0.08 * (1 - t * 0.4);

      for (const side of [-1, 1]) {
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0, 0);
        bladeShape.quadraticCurveTo(side * bladeWidth, bladeLen * 0.5, 0, bladeLen);
        bladeShape.quadraticCurveTo(side * bladeWidth * 0.3, bladeLen * 0.5, 0, 0);

        const bladeGeo = new THREE.ShapeGeometry(bladeShape, 3);
        const bladeMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x3d8a2f).offsetHSL(rng.uniform(-0.02, 0.02), rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)),
          roughness: 0.6,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });

        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.copy(point);
        blade.rotation.y = side * 0.5;
        blade.rotation.x = -0.2 * t;
        blade.castShadow = true;
        blade.receiveShadow = true;
        group.add(blade);
      }
    }

    return group;
  }

  // --------------------------------------------------------------------------
  // Coconut Cluster
  // --------------------------------------------------------------------------

  /**
   * Create a cluster of coconuts at the base of the fronds.
   */
  private createCoconutCluster(cfg: CoconutPalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    for (let i = 0; i < cfg.coconutCount; i++) {
      const angle = (i / cfg.coconutCount) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
      const coconut = this.createSingleCoconut(cfg, rng);
      coconut.position.set(
        Math.cos(angle) * cfg.trunkRadius * 1.5,
        rng.uniform(-0.1, 0.1),
        Math.sin(angle) * cfg.trunkRadius * 1.5,
      );
      coconut.rotation.set(
        rng.uniform(-0.2, 0.2),
        angle,
        rng.uniform(-0.1, 0.1),
      );
      group.add(coconut);
    }

    return group;
  }

  /**
   * Create a single coconut with variant-specific appearance.
   */
  private createSingleCoconut(cfg: CoconutPalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const r = cfg.coconutSize;

    // Coconut body
    const bodyPoints: THREE.Vector2[] = [];
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = Math.sin(t * Math.PI) * r;
      // Slightly oval
      pr *= t < 0.5 ? 1.0 : 0.9;
      bodyPoints.push(new THREE.Vector2(Math.max(0.001, pr), t * r * 2.2));
    }

    const bodyGeo = new THREE.LatheGeometry(bodyPoints, 10);
    let bodyColor: THREE.Color;
    let roughness: number;

    if (cfg.coconutVariant === 'hairy') {
      bodyColor = new THREE.Color(0x5c3a1e).offsetHSL(rng.uniform(-0.02, 0.02), 0, rng.uniform(-0.05, 0.05));
      roughness = 0.95;

      // Add fibrous texture
      const posAttr = bodyGeo.attributes.position;
      const normalAttr = bodyGeo.attributes.normal;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const fiberNoise = Math.sin(x * 50 + rng.next() * 10) * 0.002 + Math.sin(z * 50 + rng.next() * 10) * 0.002;
        const nx = normalAttr.getX(i);
        const ny = normalAttr.getY(i);
        const nz = normalAttr.getZ(i);
        posAttr.setXYZ(i, x + nx * fiberNoise, y + ny * fiberNoise, z + nz * fiberNoise);
      }
      bodyGeo.computeVertexNormals();
    } else {
      // Green coconut (young)
      bodyColor = new THREE.Color(0x4a7a2a).offsetHSL(rng.uniform(-0.02, 0.02), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05));
      roughness = 0.7;
    }

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Three "eyes" at top
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1a0e05,
      roughness: 0.9,
      metalness: 0.0,
    });
    const eyeGeo = new THREE.SphereGeometry(r * 0.06, 5, 4);
    for (let i = 0; i < 3; i++) {
      const eyeAngle = (i / 3) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(
        Math.cos(eyeAngle) * r * 0.25,
        r * 2.2 * 0.95,
        Math.sin(eyeAngle) * r * 0.25,
      );
      eye.scale.y = 0.5;
      group.add(eye);
    }

    // Stem attachment
    const stemGeo = new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.15, 5);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x3d5a1e,
      roughness: 0.8,
      metalness: 0.0,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = r * 2.2;
    stem.castShadow = true;
    group.add(stem);

    return group;
  }
}

/**
 * Convenience function: generate a coconut palm from config.
 */
export function createCoconutPalm(config: Partial<CoconutPalmConfig> = {}, seed: number = 42): THREE.Group {
  const generator = new CoconutPalmGenerator(seed);
  return generator.generate(config);
}
