/**
 * KelpGenerator.ts — Underwater Kelp Generation
 *
 * Generates multiple kelp species with frond-based geometry:
 *   - Giant Kelp (Macrocystis): long stipe with many fronds and gas bladders
 *   - Bull Kelp (Nereocystis): single large bulb at top, long strap fronds
 *   - Bladderwrack (Fucus): branching with small air bladders
 *   - Sea Palm (Postelsia): short, palm-like with multiple frond clusters
 *
 * Features:
 *   - Stipe (stem) with tubular geometry
 *   - Blades (leaves) as elongated shape geometries
 *   - Gas bladder (pneumatocyst) geometry for buoyancy
 *   - Buoyancy animation (swaying in current)
 *
 * @module assets/objects/vegetation/monocots
 */

import * as THREE from 'three';
import { BaseObjectGenerator, type BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

/** Supported kelp species */
export type KelpSpecies = 'giant_kelp' | 'bull_kelp' | 'bladderwrack' | 'sea_palm';

/** Configuration for kelp generation */
export interface KelpConfig extends BaseGeneratorConfig {
  /** Species of kelp to generate */
  species: KelpSpecies;
  /** Total height of the kelp (meters) */
  height: number;
  /** Stipe (stem) radius */
  stipeRadius: number;
  /** Number of frond groups along stipe */
  frondGroups: number;
  /** Blade length per frond */
  bladeLength: number;
  /** Blade width */
  bladeWidth: number;
  /** Whether to include gas bladders */
  includeBladders: boolean;
  /** Sway intensity for animation (0-1) */
  swayIntensity: number;
  /** Water current direction (radians) */
  currentDirection: number;
}

/** Species-specific defaults */
const KELP_SPECIES_DEFAULTS: Record<KelpSpecies, Partial<KelpConfig>> = {
  giant_kelp: {
    height: 8.0,
    stipeRadius: 0.03,
    frondGroups: 8,
    bladeLength: 0.8,
    bladeWidth: 0.12,
    includeBladders: true,
    swayIntensity: 0.3,
  },
  bull_kelp: {
    height: 10.0,
    stipeRadius: 0.025,
    frondGroups: 1,
    bladeLength: 2.0,
    bladeWidth: 0.08,
    includeBladders: true,
    swayIntensity: 0.4,
  },
  bladderwrack: {
    height: 0.5,
    stipeRadius: 0.015,
    frondGroups: 4,
    bladeLength: 0.3,
    bladeWidth: 0.06,
    includeBladders: true,
    swayIntensity: 0.2,
  },
  sea_palm: {
    height: 0.8,
    stipeRadius: 0.02,
    frondGroups: 3,
    bladeLength: 0.4,
    bladeWidth: 0.1,
    includeBladders: false,
    swayIntensity: 0.25,
  },
};

// ============================================================================
// KelpGenerator
// ============================================================================

/**
 * Generates procedural kelp (seaweed) with stipe, blades, and gas bladders.
 *
 * Usage:
 * ```ts
 * const generator = new KelpGenerator(42);
 * const kelp = generator.generate({ species: 'giant_kelp' });
 * ```
 */
export class KelpGenerator extends BaseObjectGenerator<KelpConfig> {
  getDefaultConfig(): KelpConfig {
    return {
      species: 'giant_kelp',
      height: 8.0,
      stipeRadius: 0.03,
      frondGroups: 8,
      bladeLength: 0.8,
      bladeWidth: 0.12,
      includeBladders: true,
      swayIntensity: 0.3,
      currentDirection: 0,
      seed: 42,
    };
  }

  generate(config: Partial<KelpConfig> = {}): THREE.Group {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const speciesDefaults = KELP_SPECIES_DEFAULTS[cfg.species];
    const fullCfg = { ...cfg, ...speciesDefaults, ...config };
    const rng = new SeededRandom(fullCfg.seed ?? this.seed);
    const group = new THREE.Group();

    // Stipe (main stem)
    const stipe = this.createStipe(fullCfg, rng);
    group.add(stipe);

    // Fronds and bladders along the stipe
    this.addFrondsAndBladders(group, fullCfg, rng);

    // Buoyancy animation data
    group.userData.tags = ['vegetation', 'kelp', fullCfg.species];
    group.userData.swayIntensity = fullCfg.swayIntensity;
    group.userData.currentDirection = fullCfg.currentDirection;
    group.userData.animationType = 'buoyancy_sway';

    return group;
  }

  // --------------------------------------------------------------------------
  // Stipe (Stem)
  // --------------------------------------------------------------------------

  /**
   * Create the main stipe (stem) as a curved tube.
   */
  private createStipe(cfg: KelpConfig, rng: SeededRandom): THREE.Mesh {
    const swayPoints: THREE.Vector3[] = [];
    const segmentCount = 20;

    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const y = t * cfg.height;

      // S-curve sway from current
      const swayX = Math.sin(t * Math.PI * 2 + cfg.currentDirection) * cfg.swayIntensity * t * 0.5;
      const swayZ = Math.cos(t * Math.PI * 1.5 + cfg.currentDirection) * cfg.swayIntensity * t * 0.3;
      const noiseX = rng.gaussian(0, 0.02) * t;
      const noiseZ = rng.gaussian(0, 0.02) * t;

      swayPoints.push(new THREE.Vector3(swayX + noiseX, y, swayZ + noiseZ));
    }

    const curve = new THREE.CatmullRomCurve3(swayPoints, false, 'catmullrom', 0.5);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, cfg.stipeRadius, 6, false);
    const stipeMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a2a,
      roughness: 0.8,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(tubeGeo, stipeMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Fronds and Bladders
  // --------------------------------------------------------------------------

  /**
   * Add frond groups and gas bladders along the stipe.
   */
  private addFrondsAndBladders(
    group: THREE.Group,
    cfg: KelpConfig,
    rng: SeededRandom,
  ): void {
    const kelpColor = new THREE.Color(0x3a6a2a);
    const darkKelpColor = new THREE.Color(0x2a4a1a);

    for (let g = 0; g < cfg.frondGroups; g++) {
      const t = (g + 1) / (cfg.frondGroups + 1);
      const y = t * cfg.height;

      // Position along stipe with sway
      const swayX = Math.sin(t * Math.PI * 2 + cfg.currentDirection) * cfg.swayIntensity * t * 0.5;
      const swayZ = Math.cos(t * Math.PI * 1.5 + cfg.currentDirection) * cfg.swayIntensity * t * 0.3;

      const frondGroup = new THREE.Group();
      frondGroup.position.set(swayX, y, swayZ);

      if (cfg.species === 'bull_kelp' && g === 0) {
        // Bull kelp: single large bulb at top with strap fronds
        const bulb = this.createGasBladder(cfg.stipeRadius * 5, rng);
        bulb.position.y = cfg.height * 0.05;
        frondGroup.add(bulb);

        // Strap fronds from bulb
        const strapCount = rng.nextInt(8, 16);
        for (let i = 0; i < strapCount; i++) {
          const angle = (i / strapCount) * Math.PI * 2;
          const strap = this.createBlade(cfg.bladeLength * 1.5, cfg.bladeWidth * 0.6, kelpColor, rng);
          strap.position.y = cfg.height * 0.05;
          strap.rotation.y = angle;
          strap.rotation.x = -0.2 - rng.uniform(0, 0.4);
          frondGroup.add(strap);
        }
      } else if (cfg.species === 'bladderwrack') {
        // Bladderwrack: branching with small bladders
        const branchCount = rng.nextInt(2, 4);
        for (let i = 0; i < branchCount; i++) {
          const angle = (i / branchCount) * Math.PI * 2 + rng.uniform(-0.3, 0.3);
          const blade = this.createBlade(cfg.bladeLength, cfg.bladeWidth, kelpColor, rng);
          blade.rotation.y = angle;
          blade.rotation.x = -0.3 - rng.uniform(0, 0.3);
          frondGroup.add(blade);

          // Small bladders at blade tips
          if (cfg.includeBladders && rng.boolean(0.7)) {
            const bladder = this.createGasBladder(cfg.stipeRadius * 2, rng);
            bladder.position.y = cfg.bladeLength * 0.8;
            bladder.position.x = Math.sin(angle) * cfg.bladeWidth * 0.5;
            bladder.position.z = Math.cos(angle) * cfg.bladeWidth * 0.5;
            frondGroup.add(bladder);
          }
        }
      } else if (cfg.species === 'sea_palm') {
        // Sea palm: palm-like frond clusters
        const frondCount = rng.nextInt(4, 8);
        for (let i = 0; i < frondCount; i++) {
          const angle = (i / frondCount) * Math.PI * 2;
          const blade = this.createBlade(cfg.bladeLength, cfg.bladeWidth, darkKelpColor, rng);
          blade.rotation.y = angle;
          blade.rotation.x = -0.5 - rng.uniform(0, 0.3);
          frondGroup.add(blade);
        }
      } else {
        // Giant kelp: fronds with bladders at base
        const frondCount = rng.nextInt(3, 6);
        for (let i = 0; i < frondCount; i++) {
          const angle = (i / frondCount) * Math.PI * 2 + rng.uniform(-0.2, 0.2);

          // Small side stipe (branch) connecting to fronds
          const sideStipe = this.createSideStipe(cfg.bladeLength * 0.4, cfg.stipeRadius * 0.5, angle, kelpColor, rng);
          frondGroup.add(sideStipe);

          // Blades at end of side stipe
          const bladeCount = rng.nextInt(2, 5);
          for (let j = 0; j < bladeCount; j++) {
            const bladeAngle = angle + rng.uniform(-0.5, 0.5);
            const blade = this.createBlade(cfg.bladeLength, cfg.bladeWidth, kelpColor, rng);
            blade.position.set(
              Math.sin(angle) * cfg.bladeLength * 0.4,
              cfg.bladeLength * 0.3,
              Math.cos(angle) * cfg.bladeLength * 0.4,
            );
            blade.rotation.y = bladeAngle;
            blade.rotation.x = -0.2 - rng.uniform(0, 0.5);
            frondGroup.add(blade);
          }

          // Gas bladder at base of frond
          if (cfg.includeBladders && rng.boolean(0.6)) {
            const bladder = this.createGasBladder(cfg.stipeRadius * 3, rng);
            bladder.position.set(
              Math.sin(angle) * cfg.stipeRadius * 2,
              cfg.bladeLength * 0.1,
              Math.cos(angle) * cfg.stipeRadius * 2,
            );
            frondGroup.add(bladder);
          }
        }
      }

      group.add(frondGroup);
    }
  }

  /**
   * Create a single kelp blade (leaf-like frond segment).
   */
  private createBlade(
    length: number,
    width: number,
    color: THREE.Color,
    rng: SeededRandom,
  ): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width * 0.5, length * 0.3, width * 0.3, length * 0.6);
    shape.quadraticCurveTo(width * 0.1, length * 0.9, 0, length);
    shape.quadraticCurveTo(-width * 0.1, length * 0.9, -width * 0.3, length * 0.6);
    shape.quadraticCurveTo(-width * 0.5, length * 0.3, 0, 0);

    const geo = new THREE.ShapeGeometry(shape, 4);

    // Add waviness
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const wave = Math.sin(y * 8 + rng.next() * 2) * 0.02;
      posAttr.setZ(i, posAttr.getZ(i) + wave);
    }
    geo.computeVertexNormals();

    const bladeColor = color.clone().offsetHSL(
      rng.uniform(-0.02, 0.02),
      rng.uniform(-0.05, 0.05),
      rng.uniform(-0.05, 0.05),
    );

    const mat = new THREE.MeshStandardMaterial({
      color: bladeColor,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create a gas bladder (pneumatocyst) — a small sphere.
   */
  private createGasBladder(radius: number, rng: SeededRandom): THREE.Mesh {
    const geo = new THREE.SphereGeometry(radius, 8, 6);
    // Slightly elongate
    geo.scale(1, 1.3, 1);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x4a7a3a).offsetHSL(rng.uniform(-0.02, 0.02), 0, rng.uniform(-0.05, 0.05)),
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create a side stipe (short branch) connecting to fronds.
   */
  private createSideStipe(
    length: number,
    radius: number,
    angle: number,
    color: THREE.Color,
    rng: SeededRandom,
  ): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(
        Math.sin(angle) * length * 0.5,
        length * 0.3,
        Math.cos(angle) * length * 0.5,
      ),
      new THREE.Vector3(
        Math.sin(angle) * length,
        length * 0.4 + rng.uniform(-0.05, 0.05),
        Math.cos(angle) * length,
      ),
    ]);

    const geo = new THREE.TubeGeometry(curve, 6, radius, 4, false);
    const mat = new THREE.MeshStandardMaterial({
      color: color.clone().offsetHSL(0, 0, -0.05),
      roughness: 0.8,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * Convenience function: generate kelp from config.
 */
export function generateKelp(config: Partial<KelpConfig> = {}, seed: number = 42): THREE.Group {
  const generator = new KelpGenerator(seed);
  return generator.generate(config);
}
