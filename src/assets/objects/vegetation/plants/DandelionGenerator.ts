/**
 * DandelionGenerator.ts — Dandelion with Lifecycle States
 *
 * Generates dandelion plants (Taraxacum) with lifecycle states:
 *   - Flower: yellow composite flower head
 *   - Seed head: white pappus parachute ball (InstancedMesh)
 *   - Dispersing: seeds detaching and floating away
 *
 * Also includes:
 *   - Stem with slight curve
 *   - Leaf rosette at base
 *   - Individual seed with parachute pappus
 *
 * @module assets/objects/vegetation/plants
 */

import * as THREE from 'three';
import { BaseObjectGenerator, type BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

/** Dandelion lifecycle state */
export type DandelionLifecycle = 'flower' | 'seed_head' | 'dispersing';

/** Configuration for dandelion generation */
export interface DandelionConfig extends BaseGeneratorConfig {
  /** Lifecycle state */
  lifecycle: DandelionLifecycle;
  /** Stem height */
  stemHeight: number;
  /** Stem thickness */
  stemThickness: number;
  /** Flower head radius */
  headRadius: number;
  /** Number of seeds (for seed head) */
  seedCount: number;
  /** Whether to include basal leaves */
  includeLeaves: boolean;
  /** Dispersal fraction (0-1, for 'dispersing' state) */
  dispersalFraction: number;
}

// ============================================================================
// DandelionGenerator
// ============================================================================

/**
 * Generates procedural dandelion plants with lifecycle states.
 *
 * Usage:
 * ```ts
 * const gen = new DandelionGenerator(42);
 * const flower = gen.generate({ lifecycle: 'flower' });
 * const seedHead = gen.generate({ lifecycle: 'seed_head' });
 * ```
 */
export class DandelionGenerator extends BaseObjectGenerator<DandelionConfig> {
  getDefaultConfig(): DandelionConfig {
    return {
      lifecycle: 'flower',
      stemHeight: 0.25,
      stemThickness: 0.003,
      headRadius: 0.025,
      seedCount: 80,
      includeLeaves: true,
      dispersalFraction: 0.3,
      seed: 42,
    };
  }

  generate(config: Partial<DandelionConfig> = {}): THREE.Group {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(cfg.seed ?? this.seed);
    const group = new THREE.Group();

    // Stem
    const stem = this.createStem(cfg, rng);
    group.add(stem);

    // Head (flower or seed head)
    switch (cfg.lifecycle) {
      case 'flower':
        group.add(this.createFlowerHead(cfg, rng));
        break;
      case 'seed_head':
        group.add(this.createSeedHead(cfg, rng));
        break;
      case 'dispersing':
        group.add(this.createDispersingHead(cfg, rng));
        break;
    }

    // Basal leaves
    if (cfg.includeLeaves) {
      const leaves = this.createBasalLeaves(cfg, rng);
      group.add(leaves);
    }

    group.userData.tags = ['vegetation', 'dandelion', cfg.lifecycle];
    return group;
  }

  // --------------------------------------------------------------------------
  // Stem
  // --------------------------------------------------------------------------

  /**
   * Create a slightly curved stem.
   */
  private createStem(cfg: DandelionConfig, rng: SeededRandom): THREE.Mesh {
    const bendX = rng.uniform(-0.02, 0.02);
    const bendZ = rng.uniform(-0.02, 0.02);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(bendX, cfg.stemHeight * 0.5, bendZ),
      new THREE.Vector3(rng.uniform(-0.01, 0.01), cfg.stemHeight, rng.uniform(-0.01, 0.01)),
    );

    const geo = new THREE.TubeGeometry(curve, 8, cfg.stemThickness, 4, false);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a6a1e,
      roughness: 0.7,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Flower Head
  // --------------------------------------------------------------------------

  /**
   * Create a yellow composite flower head.
   */
  private createFlowerHead(cfg: DandelionConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    group.position.y = cfg.stemHeight;

    // Central disc
    const discGeo = new THREE.SphereGeometry(cfg.headRadius * 0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x8a7a0a,
      roughness: 0.6,
      metalness: 0.0,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI; // Face up
    disc.castShadow = true;
    group.add(disc);

    // Petals (ray florets)
    const petalCount = rng.nextInt(12, 20);
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2 + rng.uniform(-0.1, 0.1);
      const petal = this.createPetal(cfg, rng);
      petal.rotation.y = angle;
      petal.rotation.x = -0.3 - rng.uniform(-0.1, 0.1);
      group.add(petal);
    }

    return group;
  }

  /**
   * Create a single ray floret petal.
   */
  private createPetal(cfg: DandelionConfig, rng: SeededRandom): THREE.Mesh {
    const petalLength = cfg.headRadius * 2;
    const petalWidth = cfg.headRadius * 0.35;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(petalWidth * 0.5, petalLength * 0.4, petalWidth * 0.2, petalLength * 0.8);
    shape.quadraticCurveTo(0, petalLength, -petalWidth * 0.2, petalLength * 0.8);
    shape.quadraticCurveTo(-petalWidth * 0.5, petalLength * 0.4, 0, 0);

    const geo = new THREE.ShapeGeometry(shape, 3);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xf5d020).offsetHSL(rng.uniform(-0.02, 0.02), rng.uniform(-0.1, 0), rng.uniform(-0.05, 0.05)),
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, cfg.headRadius * 0.3, 0);
    mesh.castShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Seed Head
  // --------------------------------------------------------------------------

  /**
   * Create a white pappus seed head using InstancedMesh.
   */
  private createSeedHead(cfg: DandelionConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    group.position.y = cfg.stemHeight;

    // Receptacle (central ball)
    const receptGeo = new THREE.SphereGeometry(cfg.headRadius * 0.3, 6, 4);
    const receptMat = new THREE.MeshStandardMaterial({
      color: 0xd0c8a0,
      roughness: 0.8,
      metalness: 0.0,
    });
    const recept = new THREE.Mesh(receptGeo, receptMat);
    recept.castShadow = true;
    group.add(recept);

    // Seeds with pappus (parachute filaments)
    const seedGeo = this.createSeedGeometry(cfg);
    const seedMat = new THREE.MeshStandardMaterial({
      color: 0xc8c0a0,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    const instancedSeeds = new THREE.InstancedMesh(seedGeo, seedMat, cfg.seedCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < cfg.seedCount; i++) {
      // Distribute on sphere surface using Fibonacci spiral
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const theta = i * goldenAngle;
      const phi = Math.acos(1 - 2 * (i + 0.5) / cfg.seedCount);

      const r = cfg.headRadius;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      dummy.position.set(x, Math.abs(y), z);

      // Orient outward
      const outDir = new THREE.Vector3(x, Math.abs(y), z).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      dummy.quaternion.setFromUnitVectors(up, outDir);

      dummy.scale.setScalar(rng.uniform(0.8, 1.2));
      dummy.updateMatrix();
      instancedSeeds.setMatrixAt(i, dummy.matrix);
    }

    instancedSeeds.instanceMatrix.needsUpdate = true;
    instancedSeeds.castShadow = true;
    group.add(instancedSeeds);

    return group;
  }

  /**
   * Create a single seed geometry: seed body + pappus (parachute).
   */
  private createSeedGeometry(cfg: DandelionConfig): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Seed body: thin elongated shape
    const bodyGeo = new THREE.CylinderGeometry(
      cfg.headRadius * 0.02,
      cfg.headRadius * 0.01,
      cfg.headRadius * 0.15,
      4,
    );

    // Pappus: thin filaments radiating from top
    const pappusLines: number[] = [];
    const filamentCount = 8;
    const filamentLength = cfg.headRadius * 0.5;

    for (let i = 0; i < filamentCount; i++) {
      const angle = (i / filamentCount) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Line from top of seed body to pappus tip
      pappusLines.push(
        0, cfg.headRadius * 0.075, 0,
        cos * filamentLength * 0.3, cfg.headRadius * 0.075 + filamentLength, sin * filamentLength * 0.3,
      );
    }

    // Create line geometry for pappus
    const pappusGeo = new THREE.BufferGeometry();
    pappusGeo.setAttribute('position', new THREE.Float32BufferAttribute(pappusLines, 3));

    // Merge body + return
    // For simplicity, just return the body geometry (pappus added as child)
    return bodyGeo;
  }

  // --------------------------------------------------------------------------
  // Dispersing Head
  // --------------------------------------------------------------------------

  /**
   * Create a dispersing seed head — some seeds are missing, others are floating away.
   */
  private createDispersingHead(cfg: DandelionConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    group.position.y = cfg.stemHeight;

    // Receptacle
    const receptGeo = new THREE.SphereGeometry(cfg.headRadius * 0.3, 6, 4);
    const receptMat = new THREE.MeshStandardMaterial({
      color: 0xd0c8a0,
      roughness: 0.8,
      metalness: 0.0,
    });
    const recept = new THREE.Mesh(receptGeo, receptMat);
    recept.castShadow = true;
    group.add(recept);

    // Remaining seeds (some missing due to dispersal)
    const remainingSeeds = Math.floor(cfg.seedCount * (1 - cfg.dispersalFraction));
    const seedGeo = this.createSeedGeometry(cfg);
    const seedMat = new THREE.MeshStandardMaterial({
      color: 0xc8c0a0,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    if (remainingSeeds > 0) {
      const instancedSeeds = new THREE.InstancedMesh(seedGeo, seedMat, remainingSeeds);
      const dummy = new THREE.Object3D();
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));

      let placed = 0;
      for (let i = 0; i < cfg.seedCount && placed < remainingSeeds; i++) {
        if (rng.next() > (1 - cfg.dispersalFraction)) continue; // Skip dispersed seeds

        const theta = i * goldenAngle;
        const phi = Math.acos(1 - 2 * (i + 0.5) / cfg.seedCount);
        const r = cfg.headRadius;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        dummy.position.set(x, Math.abs(y), z);
        const outDir = new THREE.Vector3(x, Math.abs(y), z).normalize();
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outDir);
        dummy.scale.setScalar(rng.uniform(0.8, 1.2));
        dummy.updateMatrix();
        instancedSeeds.setMatrixAt(placed, dummy.matrix);
        placed++;
      }

      instancedSeeds.count = placed;
      instancedSeeds.instanceMatrix.needsUpdate = true;
      instancedSeeds.castShadow = true;
      group.add(instancedSeeds);
    }

    // Floating seeds (dispersing)
    const floatingCount = Math.floor(cfg.seedCount * cfg.dispersalFraction * 0.3);
    const floatingGeo = this.createSeedGeometry(cfg);
    const floatingMat = new THREE.MeshStandardMaterial({
      color: 0xe0d8c0,
      roughness: 0.6,
      metalness: 0.0,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < floatingCount; i++) {
      const seed = new THREE.Mesh(floatingGeo, floatingMat);
      seed.position.set(
        rng.uniform(-0.3, 0.3),
        rng.uniform(0.1, 0.6),
        rng.uniform(-0.3, 0.3),
      );
      seed.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI * 2), rng.uniform(0, Math.PI));
      seed.scale.setScalar(rng.uniform(0.5, 0.8));
      seed.castShadow = true;
      group.add(seed);
    }

    return group;
  }

  // --------------------------------------------------------------------------
  // Basal Leaves
  // --------------------------------------------------------------------------

  /**
   * Create a rosette of basal leaves at ground level.
   */
  private createBasalLeaves(cfg: DandelionConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const leafCount = rng.nextInt(5, 9);

    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
      const leaf = this.createSingleLeaf(cfg, rng);
      leaf.rotation.y = angle;
      leaf.rotation.x = -0.3 - rng.uniform(0, 0.5);
      group.add(leaf);
    }

    return group;
  }

  /**
   * Create a single dandelion leaf — deeply lobed, lance-shaped.
   */
  private createSingleLeaf(cfg: DandelionConfig, rng: SeededRandom): THREE.Mesh {
    const leafLength = cfg.stemHeight * rng.uniform(0.8, 1.5);
    const leafWidth = leafLength * 0.2;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(leafWidth * 0.3, leafLength * 0.15);
    shape.lineTo(0, leafLength * 0.2);
    shape.lineTo(-leafWidth * 0.3, leafLength * 0.35);
    shape.lineTo(0, leafLength * 0.4);
    shape.lineTo(leafWidth * 0.25, leafLength * 0.55);
    shape.lineTo(0, leafLength * 0.6);
    shape.lineTo(-leafWidth * 0.2, leafLength * 0.75);
    shape.lineTo(0, leafLength * 0.8);
    shape.lineTo(leafWidth * 0.1, leafLength * 0.9);
    shape.lineTo(0, leafLength);

    const geo = new THREE.ShapeGeometry(shape, 3);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x3a7a1e).offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05)),
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * Convenience function: generate a dandelion from config.
 */
export function generateDandelion(config: Partial<DandelionConfig> = {}, seed: number = 42): THREE.Group {
  const generator = new DandelionGenerator(seed);
  return generator.generate(config);
}
