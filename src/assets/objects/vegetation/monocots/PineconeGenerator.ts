/**
 * PineconeGenerator.ts — Spiral Phyllotaxis Pinecone Generation
 *
 * Generates pinecones with spiral phyllotaxis scale arrangement,
 * supporting multiple species (pine, fir, spruce) with open/closed states
 * and individual seed patterns on scales.
 *
 * Features:
 *   - Fibonacci spiral phyllotaxis scale placement
 *   - Multiple species: pine, fir, spruce cones
 *   - Open/closed state (scales reflexed vs. appressed)
 *   - Individual scale geometry with seed patterns
 *   - Stem attachment point
 *
 * @module assets/objects/vegetation/monocots
 */

import * as THREE from 'three';
import { BaseObjectGenerator, type BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** Supported pinecone species */
export type PineconeSpecies = 'pine' | 'fir' | 'spruce';

/** Pinecone open/closed state */
export type PineconeState = 'open' | 'closed';

/** Configuration for pinecone generation */
export interface PineconeConfig extends BaseGeneratorConfig {
  /** Species of pinecone */
  species: PineconeSpecies;
  /** Open or closed state */
  state: PineconeState;
  /** Overall length of the cone (meters) */
  length: number;
  /** Maximum radius of the cone (meters) */
  radius: number;
  /** Number of spiral rows (Fibonacci pairs) */
  spiralRows: number;
  /** Scale tilt angle for open cones (radians) */
  scaleTilt: number;
  /** Scale color */
  scaleColor: THREE.Color;
  /** Whether to show seeds */
  showSeeds: boolean;
}

/** Species-specific defaults */
const PINECONE_SPECIES_DEFAULTS: Record<PineconeSpecies, Partial<PineconeConfig>> = {
  pine: {
    length: 0.08,
    radius: 0.03,
    spiralRows: 8,
    scaleTilt: 0.4,
    scaleColor: new THREE.Color(0x6b4a2a),
  },
  fir: {
    length: 0.12,
    radius: 0.035,
    spiralRows: 10,
    scaleTilt: 0.3,
    scaleColor: new THREE.Color(0x5a3a1a),
  },
  spruce: {
    length: 0.06,
    radius: 0.02,
    spiralRows: 6,
    scaleTilt: 0.5,
    scaleColor: new THREE.Color(0x7a5a3a),
  },
};

// ============================================================================
// PineconeGenerator
// ============================================================================

/**
 * Generates procedural pinecones with Fibonacci spiral phyllotaxis.
 *
 * The scales follow the golden angle (≈137.508°) spiral arrangement,
 * which produces the characteristic interlocking pattern seen in real pinecones.
 *
 * Usage:
 * ```ts
 * const generator = new PineconeGenerator(42);
 * const cone = generator.generate({ species: 'pine', state: 'open' });
 * ```
 */
export class PineconeGenerator extends BaseObjectGenerator<PineconeConfig> {
  getDefaultConfig(): PineconeConfig {
    return {
      species: 'pine',
      state: 'closed',
      length: 0.08,
      radius: 0.03,
      spiralRows: 8,
      scaleTilt: 0.4,
      scaleColor: new THREE.Color(0x6b4a2a),
      showSeeds: true,
      seed: 42,
    };
  }

  generate(config: Partial<PineconeConfig> = {}): THREE.Group {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const speciesDefaults = PINECONE_SPECIES_DEFAULTS[cfg.species];
    const fullCfg = { ...cfg, ...speciesDefaults, ...config };
    const rng = new SeededRandom(fullCfg.seed ?? this.seed);
    const group = new THREE.Group();

    // Core body (hidden inside scales)
    const core = this.createCore(fullCfg, rng);
    group.add(core);

    // Scales in Fibonacci spiral arrangement
    const scales = this.createScales(fullCfg, rng);
    group.add(scales);

    // Stem at base
    const stem = this.createStem(fullCfg, rng);
    group.add(stem);

    group.userData.tags = ['vegetation', 'pinecone', fullCfg.species, fullCfg.state];
    return group;
  }

  // --------------------------------------------------------------------------
  // Core
  // --------------------------------------------------------------------------

  /**
   * Create the inner core (central axis) of the pinecone.
   */
  private createCore(cfg: PineconeConfig, rng: SeededRandom): THREE.Mesh {
    // Tapered cylinder for the core
    const points: THREE.Vector2[] = [];
    const segments = 10;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Elongated ellipsoid profile
      let r = Math.sin(t * Math.PI) * cfg.radius * 0.6;
      // Taper more at the tip
      if (t > 0.7) {
        r *= 1 - ((t - 0.7) / 0.3) * 0.7;
      }
      points.push(new THREE.Vector2(Math.max(0.001, r), t * cfg.length));
    }

    const geo = new THREE.LatheGeometry(points, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a3a1a,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Scales (Fibonacci Spiral Phyllotaxis)
  // --------------------------------------------------------------------------

  /**
   * Create all scales arranged in Fibonacci spiral phyllotaxis.
   *
   * The golden angle (≈137.508°) ensures optimal packing and creates
   * the characteristic spiral pattern seen in real pinecones and sunflowers.
   */
  private createScales(cfg: PineconeConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈137.508° in radians

    // Calculate total number of scales from spiral rows
    const totalScales = cfg.spiralRows * 5 + rng.nextInt(0, 5);
    const isOpen = cfg.state === 'open';

    // Create instanced scale geometry
    const scaleGeo = this.createScaleGeometry(cfg, rng);
    const scaleMat = new THREE.MeshStandardMaterial({
      color: cfg.scaleColor.clone().offsetHSL(
        rng.uniform(-0.02, 0.02),
        rng.uniform(-0.1, 0.1),
        rng.uniform(-0.05, 0.05),
      ),
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const instancedScales = new THREE.InstancedMesh(scaleGeo, scaleMat, totalScales);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < totalScales; i++) {
      const t = i / totalScales; // Position along cone length (0=base, 1=tip)
      const y = t * cfg.length;

      // Fibonacci spiral angle
      const angle = i * goldenAngle;

      // Radius at this height — ellipsoid profile
      const heightRatio = t;
      const localRadius = cfg.radius * Math.sin(heightRatio * Math.PI) * 1.1;
      const offsetRadius = isOpen ? localRadius * 1.3 : localRadius;

      // Position on the cone surface
      const x = Math.cos(angle) * offsetRadius;
      const z = Math.sin(angle) * offsetRadius;

      dummy.position.set(x, y, z);

      // Orient scale to point outward and slightly upward
      const outwardDir = new THREE.Vector3(x, 0, z).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, outwardDir);

      dummy.quaternion.copy(quat);

      // Tilt scale based on open/closed state
      const tiltAngle = isOpen ? cfg.scaleTilt + rng.uniform(-0.1, 0.1) : 0.1 + rng.uniform(-0.05, 0.05);
      dummy.rotateX(-tiltAngle);

      // Scale variation
      const scaleVariation = rng.uniform(0.8, 1.2);
      dummy.scale.set(scaleVariation, scaleVariation, scaleVariation);

      dummy.updateMatrix();
      instancedScales.setMatrixAt(i, dummy.matrix);

      // Color variation per instance
      const color = cfg.scaleColor.clone().offsetHSL(
        rng.uniform(-0.03, 0.03),
        rng.uniform(-0.1, 0.1),
        rng.uniform(-0.08, 0.08),
      );
      instancedScales.setColorAt(i, color);
    }

    instancedScales.instanceMatrix.needsUpdate = true;
    if (instancedScales.instanceColor) instancedScales.instanceColor.needsUpdate = true;
    instancedScales.castShadow = true;
    instancedScales.receiveShadow = true;
    group.add(instancedScales);

    // Seeds (visible in open cones)
    if (cfg.showSeeds && isOpen) {
      const seeds = this.createSeeds(cfg, rng, totalScales, goldenAngle);
      group.add(seeds);
    }

    return group;
  }

  /**
   * Create a single scale geometry — shield-shaped with a raised umbo (boss).
   */
  private createScaleGeometry(cfg: PineconeConfig, rng: SeededRandom): THREE.BufferGeometry {
    const scaleLength = cfg.radius * 1.2;
    const scaleWidth = cfg.radius * 0.7;

    // Create scale as a curved plate
    const shape = new THREE.Shape();
    shape.moveTo(-scaleWidth * 0.5, 0);
    shape.quadraticCurveTo(-scaleWidth * 0.6, scaleLength * 0.5, -scaleWidth * 0.3, scaleLength * 0.8);
    shape.quadraticCurveTo(0, scaleLength * 1.1, scaleWidth * 0.3, scaleLength * 0.8);
    shape.quadraticCurveTo(scaleWidth * 0.6, scaleLength * 0.5, scaleWidth * 0.5, 0);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: scaleWidth * 0.15,
      bevelEnabled: true,
      bevelThickness: scaleWidth * 0.05,
      bevelSize: scaleWidth * 0.03,
      bevelSegments: 2,
      steps: 1,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Add umbo (raised boss at tip)
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const x = posAttr.getX(i);
      const t = y / scaleLength;

      // Curve the scale
      if (t > 0.5) {
        const bulge = Math.sin((t - 0.5) * 2 * Math.PI) * scaleWidth * 0.1;
        posAttr.setZ(i, posAttr.getZ(i) + bulge);
      }

      // Umbo near the tip
      const distFromCenter = Math.abs(x);
      if (t > 0.7 && distFromCenter < scaleWidth * 0.2) {
        const umboHeight = (1 - distFromCenter / (scaleWidth * 0.2)) * scaleWidth * 0.08;
        posAttr.setZ(i, posAttr.getZ(i) + umboHeight);
      }
    }

    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Create seed instances inside the open cone.
   */
  private createSeeds(
    cfg: PineconeConfig,
    rng: SeededRandom,
    totalScales: number,
    goldenAngle: number,
  ): THREE.InstancedMesh {
    const seedCount = Math.floor(totalScales * 0.6);
    const seedGeo = new THREE.SphereGeometry(cfg.radius * 0.12, 5, 4);
    seedGeo.scale(1, 1.5, 0.8);

    const seedMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      roughness: 0.7,
      metalness: 0.0,
    });

    const instancedSeeds = new THREE.InstancedMesh(seedGeo, seedMat, seedCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < seedCount; i++) {
      const t = (i + 0.5) / seedCount;
      const y = t * cfg.length;
      const angle = i * goldenAngle;
      const localRadius = cfg.radius * Math.sin(t * Math.PI) * 0.6;

      dummy.position.set(
        Math.cos(angle) * localRadius,
        y,
        Math.sin(angle) * localRadius,
      );
      dummy.rotation.set(rng.uniform(0, 0.3), rng.uniform(0, Math.PI * 2), rng.uniform(0, 0.3));
      dummy.scale.setScalar(rng.uniform(0.7, 1.3));
      dummy.updateMatrix();
      instancedSeeds.setMatrixAt(i, dummy.matrix);
    }

    instancedSeeds.instanceMatrix.needsUpdate = true;
    instancedSeeds.castShadow = true;
    return instancedSeeds;
  }

  // --------------------------------------------------------------------------
  // Stem
  // --------------------------------------------------------------------------

  /**
   * Create the attachment stem at the base of the pinecone.
   */
  private createStem(cfg: PineconeConfig, rng: SeededRandom): THREE.Mesh {
    const stemLength = cfg.length * 0.15;
    const stemRadius = cfg.radius * 0.15;
    const geo = new THREE.CylinderGeometry(stemRadius * 0.6, stemRadius, stemLength, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f,
      roughness: 0.8,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -stemLength * 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * Convenience function: generate a pinecone from config.
 */
export function generatePinecone(config: Partial<PineconeConfig> = {}, seed: number = 42): THREE.Group {
  const generator = new PineconeGenerator(seed);
  return generator.generate(config);
}
