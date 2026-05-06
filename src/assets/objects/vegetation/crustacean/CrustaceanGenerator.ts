/**
 * CrustaceanGenerator — Procedural crustacean generation with species-specific
 * body plans, articulated claws, and glossy chitin material.
 *
 * Features:
 * - Three species: crab, lobster, shrimp
 * - Crab: wide flat shell (LatheGeometry), 8 legs (4 pairs, CylinderGeometry),
 *   2 claws with articulation (LatheGeometry for pincers)
 * - Lobster: elongated segmented body (multiple LatheGeometry segments),
 *   tail fan, large crusher/cutter claws
 * - Shrimp: thin curved body segments, small legs, long antennae (CylinderGeometry)
 * - Glossy chitin material via CreatureSkinSystem (or MeshPhysicalMaterial fallback)
 * - Configurable per-species: size, colorVariation, legLength
 *
 * @module vegetation/crustacean
 */

import {
  Object3D, Group, Mesh, Material, MeshStandardMaterial, MeshPhysicalMaterial,
  DoubleSide, LatheGeometry, CylinderGeometry, SphereGeometry, Vector2, Color,
  Float32BufferAttribute,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { CreatureSkinSystem, type CreatureSkinConfig } from '../../creatures/skin/CreatureSkinSystem';

// ── Types ──────────────────────────────────────────────────────────────

export type CrustaceanSpecies = 'crab' | 'lobster' | 'shrimp';

export interface CrustaceanConfig {
  species: CrustaceanSpecies;
  size: number;
  shellColor: string;
  tipColor: string;
  bellyColor: string;
  colorVariation: number;    // 0-1, how much random color shift per segment
  legLength: number;         // multiplier for leg length (1.0 = default)
  legCount: number;
  clawSize: number;          // multiplier for claw size
  antennaLength: number;
  tailFanSize: number;
  glossiness: number;        // 0-1, controls roughness inversely
  seed: number;
}

const DEFAULT_CONFIG: CrustaceanConfig = {
  species: 'crab',
  size: 0.2,
  shellColor: '#FF6347',
  tipColor: '#FFD700',
  bellyColor: '#FAEBD7',
  colorVariation: 0.1,
  legLength: 1.0,
  legCount: 8,
  clawSize: 0.6,
  antennaLength: 0.3,
  tailFanSize: 0,
  glossiness: 0.7,
  seed: 42,
};

const SPECIES_DEFAULTS: Record<CrustaceanSpecies, Partial<CrustaceanConfig>> = {
  crab: {
    size: 0.2, shellColor: '#FF6347', tipColor: '#FFD700', bellyColor: '#FAEBD7',
    colorVariation: 0.08, legLength: 1.0, legCount: 8, clawSize: 0.6,
    antennaLength: 0.1, tailFanSize: 0, glossiness: 0.7,
  },
  lobster: {
    size: 0.5, shellColor: '#8B0000', tipColor: '#FF4500', bellyColor: '#F5DEB3',
    colorVariation: 0.12, legLength: 0.8, legCount: 10, clawSize: 0.8,
    antennaLength: 0.5, tailFanSize: 0.6, glossiness: 0.65,
  },
  shrimp: {
    size: 0.15, shellColor: '#FFB6C1', tipColor: '#FFA07A', bellyColor: '#FFF8DC',
    colorVariation: 0.15, legLength: 0.5, legCount: 10, clawSize: 0,
    antennaLength: 0.6, tailFanSize: 0.4, glossiness: 0.75,
  },
};

// ── CrustaceanGenerator ───────────────────────────────────────────────

export class CrustaceanGenerator {
  private rng: SeededRandom;
  private skinSystem: CreatureSkinSystem;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.skinSystem = new CreatureSkinSystem(seed);
  }

  /**
   * Generate a crustacean mesh group.
   */
  generate(config: Partial<CrustaceanConfig> = {}): Group {
    const cfg = { ...DEFAULT_CONFIG, ...SPECIES_DEFAULTS[config.species ?? 'crab'], ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new Group();
    group.name = `Crustacean_${cfg.species}`;

    // Build chitin skin config
    const skinConfig = this.createChitinSkinConfig(cfg);

    // Body
    const body = this.generateBody(cfg);
    group.add(body);

    // Head
    const head = this.generateHead(cfg);
    group.add(head);

    // Legs
    this.generateLegs(cfg).forEach(l => group.add(l));

    // Appendages (claws, rostrum, tail fan)
    this.generateAppendages(cfg).forEach(a => group.add(a));

    // Apply chitin skin material
    this.applyChitinSkin(group, skinConfig, cfg);

    return group;
  }

  // ── Color Helper ───────────────────────────────────────────────────

  /** Apply per-segment color variation based on config */
  private varyColor(baseColor: string, cfg: CrustaceanConfig, segmentIndex: number): Color {
    const base = new Color(baseColor);
    const variation = (this.rng.next() - 0.5) * 2 * cfg.colorVariation;
    const hueShift = variation * 0.05;
    const satShift = variation * 0.1;
    const lightShift = variation * 0.15 + segmentIndex * 0.01;

    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    hsl.h = (hsl.h + hueShift + 1) % 1;
    hsl.s = Math.max(0, Math.min(1, hsl.s + satShift));
    hsl.l = Math.max(0, Math.min(1, hsl.l + lightShift));
    base.setHSL(hsl.h, hsl.s, hsl.l);
    return base;
  }

  // ── Body Generation with LatheGeometry ─────────────────────────────

  private generateBody(cfg: CrustaceanConfig): Object3D {
    switch (cfg.species) {
      case 'crab': return this.generateCrabBody(cfg);
      case 'lobster': return this.generateLobsterBody(cfg);
      case 'shrimp': return this.generateShrimpBody(cfg);
    }
  }

  /** Crab: wide flattened shell with LatheGeometry dome + articulated claws */
  private generateCrabBody(cfg: CrustaceanConfig): Group {
    const s = cfg.size;
    const group = new Group();
    group.name = 'body';

    // Lower body — flattened ellipsoid (belly)
    const bellyColor = this.varyColor(cfg.bellyColor, cfg, 0);
    const bellyMat = new MeshStandardMaterial({ color: bellyColor, roughness: 0.7 });
    const bodyGeo = new SphereGeometry(1, 24, 16);
    bodyGeo.scale(s * 0.2, s * 0.06, s * 0.18);
    const body = new Mesh(bodyGeo, bellyMat);
    body.name = 'belly';
    group.add(body);

    // Top shell dome — LatheGeometry for smooth profile
    const shellColor = this.varyColor(cfg.shellColor, cfg, 0);
    const shellProfile: Vector2[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI * 0.55;
      const r = Math.sin(angle) * s * 0.19;
      const y = Math.cos(angle) * s * 0.07;
      shellProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const shellGeo = new LatheGeometry(shellProfile, 24);
    const shellMat = new MeshStandardMaterial({
      color: shellColor, roughness: 1 - cfg.glossiness, metalness: 0.1,
    });
    const shell = new Mesh(shellGeo, shellMat);
    shell.position.y = s * 0.02;
    shell.name = 'shell';
    group.add(shell);

    // Shell rim detail — slight ridge around the edge
    const rimProfile: Vector2[] = [];
    const rimSteps = 10;
    for (let i = 0; i <= rimSteps; i++) {
      const t = i / rimSteps;
      const r = s * 0.19 + Math.sin(t * Math.PI) * s * 0.015;
      const y = s * 0.02 - t * s * 0.02;
      rimProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const rimGeo = new LatheGeometry(rimProfile, 24);
    const rimMat = new MeshStandardMaterial({
      color: shellColor.clone().multiplyScalar(0.85),
      roughness: 1 - cfg.glossiness, metalness: 0.05,
    });
    const rim = new Mesh(rimGeo, rimMat);
    rim.name = 'shellRim';
    group.add(rim);

    return group;
  }

  /** Lobster: cephalothorax + segmented abdomen with LatheGeometry */
  private generateLobsterBody(cfg: CrustaceanConfig): Group {
    const s = cfg.size;
    const group = new Group();
    group.name = 'body';

    const mainColor = this.varyColor(cfg.shellColor, cfg, 0);

    // Cephalothorax — LatheGeometry
    const cephalothoraxProfile: Vector2[] = [];
    const ctSteps = 16;
    for (let i = 0; i <= ctSteps; i++) {
      const t = i / ctSteps;
      const r = Math.sin(t * Math.PI) * s * 0.12;
      const y = (t - 0.5) * s * 0.36;
      cephalothoraxProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const ctGeo = new LatheGeometry(cephalothoraxProfile, 16);
    const ctMat = new MeshStandardMaterial({
      color: mainColor, roughness: 1 - cfg.glossiness, metalness: 0.1,
    });
    const ctMesh = new Mesh(ctGeo, ctMat);
    ctMesh.rotation.x = Math.PI / 2;
    ctMesh.name = 'cephalothorax';
    group.add(ctMesh);

    // Abdomen — 6 tail segments using LatheGeometry, each with color variation
    const abdomenGroup = new Group();
    abdomenGroup.name = 'abdomen';
    for (let i = 0; i < 6; i++) {
      const segColor = this.varyColor(cfg.shellColor, cfg, i + 1);
      const segProfile: Vector2[] = [];
      const segSteps = 8;
      const segR = s * 0.1 * (1 - i * 0.08);
      for (let j = 0; j <= segSteps; j++) {
        const t = j / segSteps;
        const r = Math.sin(t * Math.PI) * segR;
        const y = (t - 0.5) * s * 0.08;
        segProfile.push(new Vector2(Math.max(0.001, r), y));
      }
      const segGeo = new LatheGeometry(segProfile, 12);
      const segMat = new MeshStandardMaterial({
        color: segColor, roughness: 1 - cfg.glossiness * 0.9, metalness: 0.05,
      });
      const seg = new Mesh(segGeo, segMat);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -s * 0.12 - i * s * 0.08;
      seg.position.y = -s * 0.01;
      seg.name = `abdomenSegment_${i}`;
      abdomenGroup.add(seg);

      // Segment ridge (groove between segments)
      if (i < 5) {
        const ridgeGeo = new CylinderGeometry(segR * 1.02, segR * 1.02, s * 0.005, 12);
        const ridgeMat = new MeshStandardMaterial({
          color: segColor.clone().multiplyScalar(0.7), roughness: 0.6,
        });
        const ridge = new Mesh(ridgeGeo, ridgeMat);
        ridge.position.z = -s * 0.12 - i * s * 0.08 - s * 0.04;
        ridge.position.y = -s * 0.01;
        ridge.rotation.x = Math.PI / 2;
        ridge.name = `segmentRidge_${i}`;
        abdomenGroup.add(ridge);
      }
    }

    // Tail fan — 5 overlapping plates
    const fanMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.shellColor, cfg, 7),
      roughness: 0.5, side: DoubleSide, metalness: 0.05,
    });
    const tailFanGroup = new Group();
    tailFanGroup.name = 'tailFan';
    for (let i = 0; i < 5; i++) {
      const angle = (i / 4 - 0.5) * 1.2;
      const fanLen = s * 0.2 * cfg.tailFanSize;
      const fanGeo = new CylinderGeometry(s * 0.005, s * 0.06 * cfg.tailFanSize, fanLen, 4);
      const fan = new Mesh(fanGeo, fanMat);
      fan.position.set(Math.sin(angle) * fanLen * 0.3, -s * 0.05, -s * 0.6);
      fan.rotation.x = Math.PI * 0.1;
      fan.rotation.z = angle * 0.5;
      fan.name = `tailPlate_${i}`;
      tailFanGroup.add(fan);
    }
    abdomenGroup.add(tailFanGroup);
    group.add(abdomenGroup);

    return group;
  }

  /** Shrimp: thin curved body using LatheGeometry segments */
  private generateShrimpBody(cfg: CrustaceanConfig): Group {
    const s = cfg.size;
    const group = new Group();
    group.name = 'body';

    // 8 body segments, each a LatheGeometry capsule with color variation
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const segColor = this.varyColor(cfg.shellColor, cfg, i);
      const segR = s * 0.04 * (1 - t * 0.3);
      const profile: Vector2[] = [];
      const steps = 8;
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        const r = Math.sin(u * Math.PI) * segR;
        const y = (u - 0.5) * segR * 2.4;
        profile.push(new Vector2(Math.max(0.001, r), y));
      }
      const segGeo = new LatheGeometry(profile, 10);
      const segMat = new MeshStandardMaterial({
        color: segColor, roughness: 1 - cfg.glossiness, metalness: 0.1,
        transparent: true, opacity: 0.85,
      });
      const seg = new Mesh(segGeo, segMat);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -s * 0.05 - i * s * 0.06;
      seg.position.y = -t * s * 0.1; // Curved downward
      seg.name = `bodySegment_${i}`;
      group.add(seg);
    }

    // Semi-translucent belly stripe
    const bellyColor = this.varyColor(cfg.bellyColor, cfg, 0);
    const bellyMat = new MeshStandardMaterial({
      color: bellyColor, roughness: 0.6, transparent: true, opacity: 0.5,
    });
    const bellyGeo = new CylinderGeometry(s * 0.02, s * 0.015, s * 0.5, 8);
    const belly = new Mesh(bellyGeo, bellyMat);
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, -s * 0.03, -s * 0.25);
    belly.name = 'bellyStripe';
    group.add(belly);

    // Tail fan — smaller, more delicate
    const fanMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.tipColor, cfg, 8),
      roughness: 0.4, side: DoubleSide, transparent: true, opacity: 0.8,
    });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 4 - 0.5) * 1.0;
      const fanLen = s * 0.08 * cfg.tailFanSize;
      const fanGeo = new CylinderGeometry(s * 0.003, s * 0.03 * cfg.tailFanSize, fanLen, 4);
      const fan = new Mesh(fanGeo, fanMat);
      fan.position.set(Math.sin(angle) * fanLen * 0.3, -s * 0.1, -s * 0.5);
      fan.rotation.x = Math.PI * 0.15;
      fan.rotation.z = angle * 0.5;
      fan.name = `tailPlate_${i}`;
      group.add(fan);
    }

    return group;
  }

  // ── Head Generation ─────────────────────────────────────────────────

  private generateHead(cfg: CrustaceanConfig): Object3D {
    const s = cfg.size;
    const group = new Group();
    group.name = 'headGroup';

    const eyeMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
    const stalkMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.shellColor, cfg, -1),
      roughness: 1 - cfg.glossiness,
    });

    switch (cfg.species) {
      case 'crab': {
        // Eyestalks — crabs have prominent stalked eyes
        for (const side of [-1, 1]) {
          const stalkGeo = new CylinderGeometry(s * 0.01, s * 0.01, s * 0.08);
          const stalk = new Mesh(stalkGeo, stalkMat);
          stalk.position.set(side * s * 0.08, s * 0.08, s * 0.12);
          stalk.name = `eyeStalk_${side === -1 ? 'L' : 'R'}`;
          group.add(stalk);
          const eyeGeo = new SphereGeometry(s * 0.02, 12, 12);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.08, s * 0.12, s * 0.12);
          eye.name = `eye_${side === -1 ? 'L' : 'R'}`;
          group.add(eye);
        }
        break;
      }
      case 'lobster': {
        for (const side of [-1, 1]) {
          const stalkGeo = new CylinderGeometry(s * 0.008, s * 0.008, s * 0.04);
          const stalk = new Mesh(stalkGeo, stalkMat);
          stalk.position.set(side * s * 0.08, s * 0.06, s * 0.15);
          stalk.name = `eyeStalk_${side === -1 ? 'L' : 'R'}`;
          group.add(stalk);
          const eyeGeo = new SphereGeometry(s * 0.015, 12, 12);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.08, s * 0.08, s * 0.15);
          eye.name = `eye_${side === -1 ? 'L' : 'R'}`;
          group.add(eye);
        }
        // Long antennae (two pairs: antennules + antennae)
        const antennaMat = new MeshStandardMaterial({ color: 0x6B4226, roughness: 0.7 });
        for (const side of [-1, 1]) {
          // Main antennae — long, thick
          const antennaGeo = new CylinderGeometry(s * 0.005, s * 0.002, s * cfg.antennaLength);
          const antenna = new Mesh(antennaGeo, antennaMat);
          antenna.rotation.z = side * 0.3;
          antenna.rotation.x = -0.8;
          antenna.position.set(side * s * 0.06, s * 0.05, s * 0.18);
          antenna.name = `antenna_${side === -1 ? 'L' : 'R'}`;
          group.add(antenna);

          // Antennules — shorter, thinner
          const antennuleGeo = new CylinderGeometry(s * 0.003, s * 0.001, s * cfg.antennaLength * 0.6);
          const antennule = new Mesh(antennuleGeo, antennaMat);
          antennule.rotation.z = side * 0.2;
          antennule.rotation.x = -0.6;
          antennule.position.set(side * s * 0.04, s * 0.06, s * 0.18);
          antennule.name = `antennule_${side === -1 ? 'L' : 'R'}`;
          group.add(antennule);
        }
        break;
      }
      case 'shrimp': {
        for (const side of [-1, 1]) {
          const eyeGeo = new SphereGeometry(s * 0.015, 12, 12);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.04, s * 0.02, s * 0.08);
          eye.name = `eye_${side === -1 ? 'L' : 'R'}`;
          group.add(eye);
        }
        // Very long antennae — shrimp signature feature
        const antennaMat = new MeshStandardMaterial({ color: 0x8B7355, roughness: 0.6 });
        for (const side of [-1, 1]) {
          // Main antennae
          const antennaGeo = new CylinderGeometry(s * 0.003, s * 0.001, s * cfg.antennaLength);
          const antenna = new Mesh(antennaGeo, antennaMat);
          antenna.rotation.z = side * 0.2;
          antenna.rotation.x = -0.9;
          antenna.position.set(side * s * 0.03, s * 0.02, s * 0.1);
          antenna.name = `antenna_${side === -1 ? 'L' : 'R'}`;
          group.add(antenna);

          // Antennules — shorter forked pair
          const antennuleGeo = new CylinderGeometry(s * 0.002, s * 0.001, s * cfg.antennaLength * 0.4);
          const antennule = new Mesh(antennuleGeo, antennaMat);
          antennule.rotation.z = side * 0.15;
          antennule.rotation.x = -0.7;
          antennule.position.set(side * s * 0.02, s * 0.025, s * 0.09);
          antennule.name = `antennule_${side === -1 ? 'L' : 'R'}`;
          group.add(antennule);
        }
        break;
      }
    }
    return group;
  }

  // ── Leg Generation ──────────────────────────────────────────────────

  private generateLegs(cfg: CrustaceanConfig): Object3D[] {
    const s = cfg.size;
    const legMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.shellColor, cfg, -2),
      roughness: 0.8,
    });
    const limbs: Object3D[] = [];
    const numPairs = Math.floor(cfg.legCount / 2);
    const legScale = cfg.legLength;

    for (const side of [-1, 1]) {
      for (let i = 0; i < numPairs; i++) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;

        switch (cfg.species) {
          case 'crab': {
            // Crab legs: lateral splaying, 2 segments
            const z = s * 0.1 - i * s * 0.07;
            const upperLen = s * 0.1 * legScale;
            const upperGeo = new CylinderGeometry(s * 0.012, s * 0.01, upperLen);
            const upper = new Mesh(upperGeo, legMat);
            upper.rotation.z = side * -0.6;
            upper.position.set(side * s * 0.15, -s * 0.02, z);
            upper.name = 'femur';
            legGroup.add(upper);

            const lowerLen = s * 0.1 * legScale;
            const lowerGeo = new CylinderGeometry(s * 0.01, s * 0.005, lowerLen);
            const lower = new Mesh(lowerGeo, legMat);
            lower.position.set(side * s * 0.22, -s * 0.08, z);
            lower.name = 'tibia';
            legGroup.add(lower);

            // Dactyl (foot tip)
            const dactylGeo = new CylinderGeometry(s * 0.005, s * 0.002, s * 0.03 * legScale);
            const dactyl = new Mesh(dactylGeo, legMat);
            dactyl.rotation.z = side * 0.4;
            dactyl.position.set(side * s * 0.25, -s * 0.12, z);
            dactyl.name = 'dactyl';
            legGroup.add(dactyl);
            break;
          }
          case 'lobster': {
            // Lobster walker legs: shorter, more compact
            const z = s * 0.08 - i * s * 0.06;
            const segLen = s * 0.08 * legScale;
            const segRad = s * 0.01 * (1 - i * 0.1);
            const upperGeo = new CylinderGeometry(segRad, segRad * 0.8, segLen);
            const upper = new Mesh(upperGeo, legMat);
            upper.rotation.z = side * -0.5;
            upper.position.set(side * s * 0.12, -s * 0.02, z);
            upper.name = 'femur';
            legGroup.add(upper);

            const lowerGeo = new CylinderGeometry(segRad * 0.8, segRad * 0.4, segLen);
            const lower = new Mesh(lowerGeo, legMat);
            lower.position.set(side * s * 0.18, -s * 0.06, z);
            lower.name = 'tibia';
            legGroup.add(lower);
            break;
          }
          case 'shrimp': {
            // Shrimp pleopods: small, thin
            const segGeo = new CylinderGeometry(s * 0.005, s * 0.003, s * 0.06 * legScale);
            const seg = new Mesh(segGeo, legMat);
            seg.rotation.z = side * -0.4;
            seg.position.set(side * s * 0.05, -s * 0.03, -s * 0.05 - i * s * 0.06);
            seg.name = 'pleopod';
            legGroup.add(seg);
            break;
          }
        }
        limbs.push(legGroup);
      }
    }

    // Lobster swimmerets (under tail)
    if (cfg.species === 'lobster') {
      for (let i = 0; i < 5; i++) {
        for (const side of [-1, 1]) {
          const swimGeo = new CylinderGeometry(s * 0.01, s * 0.005, s * 0.03 * legScale);
          const swim = new Mesh(swimGeo, legMat);
          swim.position.set(side * s * 0.06, -s * 0.06, -s * 0.15 - i * s * 0.08);
          swim.rotation.z = side * 0.3;
          swim.name = `swimmeret_${side === -1 ? 'L' : 'R'}${i}`;
          limbs.push(swim);
        }
      }
    }

    // Shrimp swimmerets (more numerous, smaller)
    if (cfg.species === 'shrimp') {
      for (let i = 0; i < 5; i++) {
        for (const side of [-1, 1]) {
          const swimGeo = new CylinderGeometry(s * 0.004, s * 0.002, s * 0.025 * legScale);
          const swim = new Mesh(swimGeo, legMat);
          swim.position.set(side * s * 0.04, -s * 0.04, -s * 0.2 - i * s * 0.05);
          swim.rotation.z = side * 0.4;
          swim.name = `swimmeret_${side === -1 ? 'L' : 'R'}${i}`;
          limbs.push(swim);
        }
      }
    }

    return limbs;
  }

  // ── Appendage Generation (Claws with LatheGeometry articulation) ───

  private generateAppendages(cfg: CrustaceanConfig): Object3D[] {
    const s = cfg.size;
    const legMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.shellColor, cfg, -3),
      roughness: 0.8,
    });
    const appendages: Object3D[] = [];

    switch (cfg.species) {
      case 'crab': {
        // 2 articulated claws with LatheGeometry pincers
        for (const side of [-1, 1]) {
          const clawGroup = new Group();
          clawGroup.name = side === -1 ? 'leftClaw' : 'rightClaw';

          // Arm segment
          const armGeo = new CylinderGeometry(s * 0.03, s * 0.025, s * 0.15 * cfg.clawSize);
          const arm = new Mesh(armGeo, legMat);
          arm.rotation.z = side * -0.8;
          arm.position.set(side * s * 0.25, s * 0.02, s * 0.1);
          arm.name = 'clawArm';
          clawGroup.add(arm);

          // Palm — LatheGeometry bulb
          const palmProfile: Vector2[] = [];
          const palmSteps = 10;
          for (let i = 0; i <= palmSteps; i++) {
            const t = i / palmSteps;
            const r = Math.sin(t * Math.PI) * s * 0.04 * cfg.clawSize;
            const y = (t - 0.5) * s * 0.06 * cfg.clawSize;
            palmProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const palmGeo = new LatheGeometry(palmProfile, 8);
          const palmMat = new MeshStandardMaterial({
            color: this.varyColor(cfg.shellColor, cfg, side * 10),
            roughness: 1 - cfg.glossiness, metalness: 0.1,
          });
          const palm = new Mesh(palmGeo, palmMat);
          palm.rotation.x = Math.PI / 2;
          palm.position.set(side * s * 0.35, s * 0.03, s * 0.1);
          palm.name = 'palm';
          clawGroup.add(palm);

          // Upper pincer — LatheGeometry elongated shape
          const upperPincerProfile: Vector2[] = [];
          const pincerSteps = 8;
          for (let i = 0; i <= pincerSteps; i++) {
            const t = i / pincerSteps;
            const r = Math.sin(t * Math.PI * 0.8) * s * 0.02 * cfg.clawSize;
            const y = t * s * 0.06 * cfg.clawSize;
            upperPincerProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const upperPincerGeo = new LatheGeometry(upperPincerProfile, 6);
          const pincerMat = new MeshStandardMaterial({
            color: this.varyColor(cfg.tipColor, cfg, side * 11),
            roughness: 1 - cfg.glossiness, metalness: 0.15,
          });
          const upperPincer = new Mesh(upperPincerGeo, pincerMat);
          upperPincer.rotation.x = Math.PI / 2;
          upperPincer.rotation.z = side * -0.3;
          upperPincer.position.set(side * s * 0.38, s * 0.05, s * 0.1);
          upperPincer.name = 'upperPincer';
          clawGroup.add(upperPincer);

          // Lower pincer — slightly smaller
          const lowerPincerProfile: Vector2[] = [];
          for (let i = 0; i <= pincerSteps; i++) {
            const t = i / pincerSteps;
            const r = Math.sin(t * Math.PI * 0.8) * s * 0.016 * cfg.clawSize;
            const y = t * s * 0.05 * cfg.clawSize;
            lowerPincerProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const lowerPincerGeo = new LatheGeometry(lowerPincerProfile, 6);
          const lowerPincer = new Mesh(lowerPincerGeo, pincerMat);
          lowerPincer.rotation.x = Math.PI / 2;
          lowerPincer.rotation.z = side * 0.2;
          lowerPincer.position.set(side * s * 0.38, s * 0.015, s * 0.1);
          lowerPincer.name = 'lowerPincer';
          clawGroup.add(lowerPincer);

          appendages.push(clawGroup);
        }
        break;
      }
      case 'lobster': {
        // Crusher and cutter claws — asymmetric (one bigger)
        for (const side of [-1, 1]) {
          const clawGroup = new Group();
          clawGroup.name = side === -1 ? 'crusherClaw' : 'cutterClaw';
          const isCrusher = side === -1;
          const scale = isCrusher ? 1.3 : 1.0;

          // Arm
          const armGeo = new CylinderGeometry(s * 0.025 * scale, s * 0.02, s * 0.18 * cfg.clawSize);
          const arm = new Mesh(armGeo, legMat);
          arm.rotation.z = side * -0.7;
          arm.position.set(side * s * 0.2, s * 0.03, s * 0.12);
          arm.name = 'clawArm';
          clawGroup.add(arm);

          // Palm — LatheGeometry
          const palmProfile: Vector2[] = [];
          const palmSteps = 10;
          for (let i = 0; i <= palmSteps; i++) {
            const t = i / palmSteps;
            const r = Math.sin(t * Math.PI) * s * 0.05 * scale * cfg.clawSize;
            const y = (t - 0.5) * s * 0.08 * scale * cfg.clawSize;
            palmProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const palmGeo = new LatheGeometry(palmProfile, 8);
          const palmMat = new MeshStandardMaterial({
            color: this.varyColor(cfg.shellColor, cfg, side * 20),
            roughness: 1 - cfg.glossiness, metalness: 0.1,
          });
          const palm = new Mesh(palmGeo, palmMat);
          palm.rotation.x = Math.PI / 2;
          palm.position.set(side * s * 0.3, s * 0.04, s * 0.12);
          palm.name = 'palm';
          clawGroup.add(palm);

          // Upper pincer — LatheGeometry
          const pw = s * 0.06 * scale * cfg.clawSize;
          const upperPincerProfile: Vector2[] = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const r = Math.sin(t * Math.PI * 0.7) * s * 0.025 * scale * cfg.clawSize;
            const y = t * s * 0.1 * scale * cfg.clawSize;
            upperPincerProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const upperGeo = new LatheGeometry(upperPincerProfile, 6);
          const pincerMat = new MeshStandardMaterial({
            color: this.varyColor(cfg.tipColor, cfg, side * 21),
            roughness: 1 - cfg.glossiness * 0.8, metalness: 0.15,
          });
          const upper = new Mesh(upperGeo, pincerMat);
          upper.rotation.x = Math.PI / 2;
          upper.rotation.z = side * -0.2;
          upper.position.set(side * s * 0.35, s * 0.06, s * 0.12);
          upper.name = 'upperPincer';
          clawGroup.add(upper);

          // Lower pincer
          const lowerPincerProfile: Vector2[] = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const r = Math.sin(t * Math.PI * 0.7) * s * 0.02 * scale * cfg.clawSize;
            const y = t * s * 0.08 * scale * cfg.clawSize;
            lowerPincerProfile.push(new Vector2(Math.max(0.001, r), y));
          }
          const lowerGeo = new LatheGeometry(lowerPincerProfile, 6);
          const lower = new Mesh(lowerGeo, pincerMat);
          lower.rotation.x = Math.PI / 2;
          lower.rotation.z = side * 0.15;
          lower.position.set(side * s * 0.35, s * 0.02, s * 0.12);
          lower.name = 'lowerPincer';
          clawGroup.add(lower);

          appendages.push(clawGroup);
        }
        break;
      }
      case 'shrimp': {
        // Rostrum (pointed beak)
        const rostrumMat = new MeshStandardMaterial({
          color: this.varyColor(cfg.shellColor, cfg, -5),
          roughness: 1 - cfg.glossiness, metalness: 0.1,
        });
        const rostrumProfile: Vector2[] = [];
        const rostrumSteps = 10;
        for (let i = 0; i <= rostrumSteps; i++) {
          const t = i / rostrumSteps;
          const r = Math.sin(t * Math.PI * 0.3) * s * 0.015 * (1 - t);
          const y = t * s * 0.1;
          rostrumProfile.push(new Vector2(Math.max(0.001, r), y));
        }
        const rostrumGeo = new LatheGeometry(rostrumProfile, 6);
        const rostrum = new Mesh(rostrumGeo, rostrumMat);
        rostrum.rotation.x = -Math.PI / 2;
        rostrum.position.set(0, s * 0.01, s * 0.15);
        rostrum.name = 'rostrum';
        appendages.push(rostrum);

        // Small chelipeds (front claws)
        for (const side of [-1, 1]) {
          const chelaGroup = new Group();
          chelaGroup.name = side === -1 ? 'leftChela' : 'rightChela';

          const armGeo = new CylinderGeometry(s * 0.008, s * 0.006, s * 0.06);
          const arm = new Mesh(armGeo, rostrumMat);
          arm.rotation.z = side * -0.5;
          arm.position.set(side * s * 0.06, -s * 0.01, s * 0.08);
          arm.name = 'chelaArm';
          chelaGroup.add(arm);

          // Tiny pincer
          const tipGeo = new CylinderGeometry(s * 0.004, s * 0.008, s * 0.02, 4);
          const tip = new Mesh(tipGeo, rostrumMat);
          tip.rotation.z = side * -0.3;
          tip.position.set(side * s * 0.09, -s * 0.03, s * 0.08);
          tip.name = 'chelaTip';
          chelaGroup.add(tip);

          appendages.push(chelaGroup);
        }
        break;
      }
    }
    return appendages;
  }

  // ── Chitin Skin Application ─────────────────────────────────────────

  private createChitinSkinConfig(cfg: CrustaceanConfig): CreatureSkinConfig {
    return this.skinSystem.createSkinConfig('insectoid', {
      skinType: 'shell',
      pattern: 'solid',
      primaryColor: new Color(cfg.shellColor),
      secondaryColor: new Color(cfg.tipColor),
      accentColor: new Color(cfg.shellColor).multiplyScalar(0.6),
      roughness: 1 - cfg.glossiness,
      metalness: 0.1,
      bumpStrength: 0.5,
      textureResolution: 256,
    });
  }

  private applyChitinSkin(group: Group, skinConfig: CreatureSkinConfig, cfg: CrustaceanConfig): void {
    const material = this.skinSystem.generateMaterial(skinConfig);

    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        const name = child.name.toLowerCase();
        const isSpecialPart = name.includes('eye') || name.includes('pupil') ||
          name.includes('mouth') || name.includes('inner') || name.includes('antenna') ||
          name.includes('antennule');
        if (!isSpecialPart) {
          const newMat = material.clone();
          // Preserve the varied per-segment color
          if (child.material.color) {
            newMat.color.copy(child.material.color);
          }
          child.material = newMat;
        }
      }
    });
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateCrustacean(config: Partial<CrustaceanConfig> = {}): Group {
  const generator = new CrustaceanGenerator(config.seed ?? 42);
  return generator.generate(config);
}
