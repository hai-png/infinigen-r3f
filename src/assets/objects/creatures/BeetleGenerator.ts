/**
 * BeetleGenerator — Procedural beetle generation with elytra, mandibles,
 * and glossy chitin material from CreatureSkinSystem.
 *
 * Features:
 * - Three species: stag_beetle, rhinoceros_beetle, ladybug
 * - Body: 3 segments (head, thorax, abdomen) using LatheGeometry
 * - Elytra: hardened wing cases covering the abdomen (ExtrudeGeometry)
 * - Mandibles: pincer-like front appendages (CylinderGeometry curves)
 * - 6 legs (3 pairs)
 * - Ladybug: spotted pattern on elytra using canvas texture with random spots
 * - Stag beetle: large mandibles, dark brown/black
 * - Rhinoceros beetle: horn on head, glossy black
 * - Glossy chitin material from CreatureSkinSystem
 * - Configurable per-species: size, colorVariation, legLength
 *
 * Also provides a CreatureBase-based adapter (BeetleAdapter) for backward compatibility.
 *
 * CANONICAL location for BeetleGenerator. Previously in vegetation/beetle/.
 *
 * @module creatures
 */

import {
  Object3D, Group, Mesh, Material, MeshStandardMaterial, MeshPhysicalMaterial,
  DoubleSide, LatheGeometry, CylinderGeometry, SphereGeometry, ConeGeometry,
  ExtrudeGeometry, Shape, Vector2, Vector3, Color, CanvasTexture,
  Float32BufferAttribute,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import { CreatureSkinSystem, type CreatureSkinConfig } from './skin/CreatureSkinSystem';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

// ── Types ──────────────────────────────────────────────────────────────

export type BeetleSpecies = 'stag_beetle' | 'rhinoceros_beetle' | 'ladybug';

export interface BeetleConfig {
  species: BeetleSpecies;
  size: number;
  elytraColor: string;
  bodyColor: string;
  colorVariation: number;    // 0-1, per-segment color shift
  legLength: number;         // multiplier for leg length
  mandibleSize: number;      // multiplier for mandible size
  glossiness: number;
  spotCount: number;         // For ladybug variant
  hornLength: number;        // For rhinoceros variant
  seed: number;
}

/** @deprecated Use BeetleConfig instead */
export interface BeetleParams extends CreatureParams {
  elytraColor: string;
  mandibleSize: number; // 0-1
  glossiness: number;   // 0-1
  hornType: 'none' | 'rhinoceros' | 'stag' | 'hercules';
}

const DEFAULT_CONFIG: BeetleConfig = {
  species: 'stag_beetle',
  size: 0.05,
  elytraColor: '#1A1A2E',
  bodyColor: '#3D2B1F',
  colorVariation: 0.08,
  legLength: 1.0,
  mandibleSize: 0.4,
  glossiness: 0.8,
  spotCount: 7,
  hornLength: 0.08,
  seed: 42,
};

const SPECIES_DEFAULTS: Record<BeetleSpecies, Partial<BeetleConfig>> = {
  stag_beetle: {
    elytraColor: '#2D1B0E', bodyColor: '#3D2B1F',
    colorVariation: 0.06, legLength: 1.0,
    mandibleSize: 0.8, glossiness: 0.7, hornLength: 0,
  },
  rhinoceros_beetle: {
    elytraColor: '#1A1A2E', bodyColor: '#2A1A0E',
    colorVariation: 0.05, legLength: 0.9,
    mandibleSize: 0.3, glossiness: 0.9, hornLength: 0.15,
  },
  ladybug: {
    elytraColor: '#CC2222', bodyColor: '#111111',
    colorVariation: 0.1, legLength: 0.7,
    mandibleSize: 0.2, glossiness: 0.85, spotCount: 7, hornLength: 0,
  },
};

// ── BeetleGenerator (Canonical Implementation) ────────────────────────

export class BeetleGenerator {
  private rng: SeededRandom;
  private skinSystem: CreatureSkinSystem;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.skinSystem = new CreatureSkinSystem(seed);
  }

  /**
   * Generate a beetle mesh group.
   */
  generate(config: Partial<BeetleConfig> = {}): Group {
    const cfg = { ...DEFAULT_CONFIG, ...SPECIES_DEFAULTS[config.species ?? 'stag_beetle'], ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new Group();
    group.name = `Beetle_${cfg.species}`;

    // Body core (head + prothorax + elytra + abdomen)
    const body = this.generateBody(cfg);
    group.add(body);

    // Head with mandibles and eyes
    const head = this.generateHead(cfg);
    group.add(head);

    // 6 legs (3 pairs)
    this.generateLegs(cfg).forEach(l => group.add(l));

    // Apply glossy chitin skin
    const skinConfig = this.createChitinSkinConfig(cfg);
    this.applyChitinSkin(group, skinConfig, cfg);

    return group;
  }

  // ── Color Helper ───────────────────────────────────────────────────

  /** Apply per-segment color variation */
  private varyColor(baseColor: string, cfg: BeetleConfig, segmentIndex: number): Color {
    const base = new Color(baseColor);
    const variation = (this.rng.next() - 0.5) * 2 * cfg.colorVariation;
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    hsl.h = (hsl.h + variation * 0.05 + 1) % 1;
    hsl.s = Math.max(0, Math.min(1, hsl.s + variation * 0.1));
    hsl.l = Math.max(0, Math.min(1, hsl.l + variation * 0.15 + segmentIndex * 0.008));
    base.setHSL(hsl.h, hsl.s, hsl.l);
    return base;
  }

  // ── Body Generation with Elytra (ExtrudeGeometry) ─────────────────

  private generateBody(cfg: BeetleConfig): Object3D {
    const s = cfg.size;
    const bodyGroup = new Group();
    bodyGroup.name = 'body';

    // ── Prothorax (front thorax segment) ── LatheGeometry
    const prothoraxColor = this.varyColor(cfg.elytraColor, cfg, 0);
    const proProfile: Vector2[] = [];
    const proSteps = 10;
    for (let i = 0; i <= proSteps; i++) {
      const t = i / proSteps;
      const r = Math.sin(t * Math.PI) * s * 0.06;
      const y = (t - 0.5) * s * 0.12;
      proProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const proGeo = new LatheGeometry(proProfile, 12);
    const prothoraxMat = new MeshStandardMaterial({
      color: prothoraxColor, roughness: 1 - cfg.glossiness, metalness: 0.2,
    });
    const prothorax = new Mesh(proGeo, prothoraxMat);
    prothorax.rotation.x = Math.PI / 2;
    prothorax.position.z = s * 0.08;
    prothorax.name = 'prothorax';
    bodyGroup.add(prothorax);

    // ── Mesothorax (middle segment connecting prothorax to elytra) ── LatheGeometry
    const mesoProfile: Vector2[] = [];
    const mesoSteps = 8;
    for (let i = 0; i <= mesoSteps; i++) {
      const t = i / mesoSteps;
      const r = Math.sin(t * Math.PI) * s * 0.055;
      const y = (t - 0.5) * s * 0.08;
      mesoProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const mesoGeo = new LatheGeometry(mesoProfile, 10);
    const mesothoraxMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.bodyColor, cfg, 1),
      roughness: 1 - cfg.glossiness * 0.7, metalness: 0.1,
    });
    const mesothorax = new Mesh(mesoGeo, mesothoraxMat);
    mesothorax.rotation.x = Math.PI / 2;
    mesothorax.position.z = s * 0.02;
    mesothorax.position.y = -s * 0.005;
    mesothorax.name = 'mesothorax';
    bodyGroup.add(mesothorax);

    // ── Elytra (hardened wing cases) ── ExtrudeGeometry
    const elytraGroup = new Group();
    elytraGroup.name = 'elytra';

    for (const side of [-1, 1]) {
      const elytraMesh = this.createElytraHalf(s, side, cfg);
      elytraGroup.add(elytraMesh);
    }
    bodyGroup.add(elytraGroup);

    // ── Abdomen underneath elytra ── LatheGeometry
    const abdomenMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.bodyColor, cfg, 3),
      roughness: 0.8,
    });
    const abdomenProfile: Vector2[] = [];
    const abdSteps = 12;
    for (let i = 0; i <= abdSteps; i++) {
      const t = i / abdSteps;
      const r = Math.sin(t * Math.PI) * s * 0.045;
      const y = (t - 0.5) * s * 0.2;
      abdomenProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const abdGeo = new LatheGeometry(abdomenProfile, 10);
    const abdomen = new Mesh(abdGeo, abdomenMat);
    abdomen.rotation.x = Math.PI / 2;
    abdomen.position.z = -s * 0.06;
    abdomen.position.y = -s * 0.01;
    abdomen.name = 'abdomen';
    bodyGroup.add(abdomen);

    return bodyGroup;
  }

  /** Create one half of the elytra (wing case) using ExtrudeGeometry */
  private createElytraHalf(
    s: number, side: number, cfg: BeetleConfig,
  ): Mesh {
    // Define the elytra cross-section shape (dome profile)
    const elytraLength = s * 0.2;
    const elytraWidth = s * 0.08;
    const elytraHeight = s * 0.04;

    const shape = new Shape();
    shape.moveTo(0, 0);
    // Top curve (dome)
    shape.bezierCurveTo(
      elytraWidth * 0.3, elytraHeight * 0.8,
      elytraWidth * 0.7, elytraHeight * 0.9,
      elytraWidth, elytraHeight * 0.3,
    );
    // Back edge
    shape.bezierCurveTo(
      elytraWidth * 1.05, elytraHeight * 0.1,
      elytraWidth * 1.0, -elytraHeight * 0.05,
      elytraWidth, -elytraHeight * 0.05,
    );
    // Bottom edge back to start
    shape.lineTo(0, 0);

    // Extrude along the length axis
    const extrudeSettings = {
      depth: elytraLength,
      bevelEnabled: true,
      bevelThickness: s * 0.003,
      bevelSize: s * 0.003,
      bevelSegments: 2,
      curveSegments: 8,
    };

    const geo = new ExtrudeGeometry(shape, extrudeSettings);

    const elytraColor = this.varyColor(cfg.elytraColor, cfg, side * 5);

    // For ladybug, create canvas texture with spots
    let elytraMat: MeshStandardMaterial;
    if (cfg.species === 'ladybug') {
      elytraMat = this.createLadybugElytraMaterial(elytraColor, side, cfg);
    } else {
      elytraMat = new MeshStandardMaterial({
        color: elytraColor,
        roughness: 1 - cfg.glossiness,
        metalness: 0.3,
      });
    }

    const elytra = new Mesh(geo, elytraMat);
    // Position and rotate the elytra half
    elytra.rotation.y = Math.PI / 2;
    elytra.rotation.x = Math.PI * 0.5;
    elytra.rotation.z = side * 0.05; // Slight splay
    elytra.position.set(
      side * s * 0.005,
      s * 0.01,
      -s * 0.02,
    );
    elytra.name = side === -1 ? 'leftElytra' : 'rightElytra';

    return elytra;
  }

  /** Create ladybug elytra material with canvas texture spots */
  private createLadybugElytraMaterial(
    baseColor: Color, side: number, cfg: BeetleConfig,
  ): MeshStandardMaterial {
    const texSize = 256;
    const canvas = createCanvas();
    canvas.width = texSize;
    canvas.height = texSize;
    const ctx = canvas.getContext('2d')!;

    // Fill with base red color
    const r = Math.round(baseColor.r * 255);
    const g = Math.round(baseColor.g * 255);
    const b = Math.round(baseColor.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, texSize, texSize);

    // Draw center line (black seam where elytra meet)
    ctx.fillStyle = '#111111';
    if (side === -1) {
      ctx.fillRect(texSize * 0.9, 0, texSize * 0.1, texSize);
    } else {
      ctx.fillRect(0, 0, texSize * 0.1, texSize);
    }

    // Draw random black spots
    const spotRng = new SeededRandom(cfg.seed + side * 100);
    for (let sp = 0; sp < cfg.spotCount; sp++) {
      const spotX = texSize * (0.15 + spotRng.next() * 0.65);
      const spotY = texSize * (0.1 + spotRng.next() * 0.8);
      const spotRadius = texSize * (0.04 + spotRng.next() * 0.06);

      // Slightly elliptical spots for realism
      ctx.save();
      ctx.translate(spotX, spotY);
      ctx.rotate(spotRng.next() * Math.PI * 0.3);
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.ellipse(0, 0, spotRadius, spotRadius * (0.8 + spotRng.next() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Add subtle color variation/noise
    const imageData = ctx.getImageData(0, 0, texSize, texSize);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (spotRng.next() - 0.5) * 8;
      data[i]     = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new CanvasTexture(canvas);
    return new MeshStandardMaterial({
      map: texture,
      roughness: 1 - cfg.glossiness,
      metalness: 0.15,
    });
  }

  // ── Head Generation with Mandibles & Species Features ──────────────

  private generateHead(cfg: BeetleConfig): Object3D {
    const s = cfg.size;
    const group = new Group();
    group.name = 'headGroup';

    // Head capsule
    const headColor = this.varyColor(cfg.elytraColor, cfg, -1);
    const headMat = new MeshStandardMaterial({
      color: headColor, roughness: 1 - cfg.glossiness * 0.8, metalness: 0.15,
    });
    const headGeo = new SphereGeometry(s * 0.04, 12, 12);
    headGeo.scale(1, 0.8, 1.1);
    const head = new Mesh(headGeo, headMat);
    head.position.z = s * 0.14;
    head.name = 'head';
    group.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const eyeGeo = new SphereGeometry(s * 0.012, 10, 10);
      const eye = new Mesh(eyeGeo, eyeMat);
      eye.position.set(side * s * 0.035, s * 0.015, s * 0.15);
      eye.name = `eye_${side === -1 ? 'L' : 'R'}`;
      group.add(eye);
    }

    // Antennae (segmented, elbowed)
    const antennaMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.bodyColor, cfg, -2),
      roughness: 0.6,
    });
    for (const side of [-1, 1]) {
      const antennaGroup = new Group();
      antennaGroup.name = `antenna_${side === -1 ? 'L' : 'R'}`;

      // Scape (first segment)
      const scapeGeo = new CylinderGeometry(s * 0.005, s * 0.004, s * 0.02);
      const scape = new Mesh(scapeGeo, antennaMat);
      scape.rotation.x = -0.5;
      scape.position.set(0, s * 0.01, 0);
      antennaGroup.add(scape);

      // Pedicel (elbowed joint)
      const pedicelGeo = new SphereGeometry(s * 0.005, 6, 6);
      const pedicel = new Mesh(pedicelGeo, antennaMat);
      pedicel.position.set(0, s * 0.02, -s * 0.005);
      antennaGroup.add(pedicel);

      // Flagellum (segmented club)
      for (let seg = 0; seg < 6; seg++) {
        const segLen = s * 0.012 * (1 - seg * 0.08);
        const segGeo = new CylinderGeometry(segLen, segLen * 0.85, s * 0.015);
        const segMesh = new Mesh(segGeo, antennaMat);
        segMesh.position.z = -seg * s * 0.012;
        segMesh.position.y = s * 0.02 - seg * s * 0.003;
        segMesh.rotation.x = -0.2;
        antennaGroup.add(segMesh);
      }

      antennaGroup.position.set(side * s * 0.025, s * 0.03, s * 0.16);
      antennaGroup.rotation.x = -0.3;
      antennaGroup.rotation.z = side * 0.2;
      group.add(antennaGroup);
    }

    // Mandibles (species-specific)
    this.generateMandibles(cfg).forEach(m => group.add(m));

    // Species-specific head features
    if (cfg.species === 'rhinoceros_beetle' && cfg.hornLength > 0) {
      // Central horn on head
      const hornMat = new MeshStandardMaterial({
        color: headColor, roughness: 1 - cfg.glossiness, metalness: 0.2,
      });
      const hornGeo = new ConeGeometry(s * 0.015, s * cfg.hornLength, 8);
      const horn = new Mesh(hornGeo, hornMat);
      horn.rotation.x = -Math.PI * 0.4;
      horn.position.set(0, s * 0.04, s * 0.16);
      horn.name = 'rhinocerosHorn';
      group.add(horn);

      // Thoracic horn (smaller, behind main horn)
      const thoracicHornGeo = new ConeGeometry(s * 0.01, s * cfg.hornLength * 0.6, 6);
      const thoracicHorn = new Mesh(thoracicHornGeo, hornMat);
      thoracicHorn.rotation.x = -Math.PI * 0.35;
      thoracicHorn.position.set(0, s * 0.035, s * 0.12);
      thoracicHorn.name = 'thoracicHorn';
      group.add(thoracicHorn);
    }

    if (cfg.species === 'stag_beetle') {
      // Stag beetle: prominent branched mandibles are handled in generateMandibles
      // Additional head shield (clypeus)
      const shieldMat = new MeshStandardMaterial({
        color: headColor.clone().multiplyScalar(0.9),
        roughness: 1 - cfg.glossiness, metalness: 0.15,
      });
      const shieldGeo = new SphereGeometry(s * 0.025, 8, 8);
      shieldGeo.scale(1.2, 0.5, 1.0);
      const shield = new Mesh(shieldGeo, shieldMat);
      shield.position.set(0, s * 0.03, s * 0.17);
      shield.name = 'headShield';
      group.add(shield);
    }

    return group;
  }

  /** Generate mandible geometry (pincer-like front appendages) */
  private generateMandibles(cfg: BeetleConfig): Mesh[] {
    const s = cfg.size;
    const mSize = cfg.mandibleSize;
    const mandibleMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.bodyColor, cfg, -3),
      roughness: 0.6, metalness: 0.1,
    });
    const mandibles: Mesh[] = [];

    for (const side of [-1, 1]) {
      switch (cfg.species) {
        case 'stag_beetle': {
          // Large branching antler-like mandibles
          // Main shaft — curved outward
          const shaftLen = s * 0.12 * mSize;
          const shaftGeo = new CylinderGeometry(
            s * 0.008 * mSize, s * 0.018 * mSize, shaftLen, 6,
          );
          const shaft = new Mesh(shaftGeo, mandibleMat);
          shaft.rotation.z = side * 0.5;
          shaft.rotation.x = 0.3;
          shaft.position.set(side * s * 0.03, -s * 0.01, s * 0.18);
          shaft.name = `mandible_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(shaft);

          // Upper branch
          const upperBranchLen = s * 0.06 * mSize;
          const upperGeo = new CylinderGeometry(
            s * 0.004 * mSize, s * 0.008 * mSize, upperBranchLen, 4,
          );
          const upperBranch = new Mesh(upperGeo, mandibleMat);
          upperBranch.rotation.z = side * 0.3;
          upperBranch.rotation.x = -0.2;
          upperBranch.position.set(
            side * (s * 0.06 + s * 0.02 * mSize),
            s * 0.02 * mSize,
            s * 0.2,
          );
          upperBranch.name = `mandibleUpper_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(upperBranch);

          // Lower branch (tine)
          const lowerBranchLen = s * 0.04 * mSize;
          const lowerGeo = new CylinderGeometry(
            s * 0.003 * mSize, s * 0.006 * mSize, lowerBranchLen, 4,
          );
          const lowerBranch = new Mesh(lowerGeo, mandibleMat);
          lowerBranch.rotation.z = side * -0.1;
          lowerBranch.position.set(
            side * (s * 0.05 + s * 0.01 * mSize),
            -s * 0.03 * mSize,
            s * 0.21,
          );
          lowerBranch.name = `mandibleLower_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(lowerBranch);

          // Tip prong
          const tipLen = s * 0.03 * mSize;
          const tipGeo = new ConeGeometry(s * 0.006 * mSize, tipLen, 4);
          const tip = new Mesh(tipGeo, mandibleMat);
          tip.rotation.z = side * -0.2;
          tip.position.set(
            side * (s * 0.08 + s * 0.02 * mSize),
            -s * 0.015 * mSize,
            s * 0.22,
          );
          tip.name = `mandibleTip_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(tip);
          break;
        }

        case 'rhinoceros_beetle': {
          // Shorter, stockier mandibles
          const shaftLen = s * 0.05 * mSize;
          const shaftGeo = new CylinderGeometry(
            s * 0.006 * mSize, s * 0.015 * mSize, shaftLen, 4,
          );
          const shaft = new Mesh(shaftGeo, mandibleMat);
          shaft.rotation.z = side * 0.35;
          shaft.rotation.x = 0.2;
          shaft.position.set(side * s * 0.02, -s * 0.01, s * 0.19);
          shaft.name = `mandible_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(shaft);

          const tipLen = s * 0.02 * mSize;
          const tipGeo = new ConeGeometry(s * 0.007 * mSize, tipLen, 4);
          const tip = new Mesh(tipGeo, mandibleMat);
          tip.rotation.z = side * -0.15;
          tip.position.set(side * s * 0.04, -s * 0.02 * mSize, s * 0.21);
          tip.name = `mandibleTip_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(tip);
          break;
        }

        case 'ladybug': {
          // Small, simple mandibles
          const shaftLen = s * 0.03 * mSize;
          const shaftGeo = new CylinderGeometry(
            s * 0.004 * mSize, s * 0.01 * mSize, shaftLen, 4,
          );
          const shaft = new Mesh(shaftGeo, mandibleMat);
          shaft.rotation.z = side * 0.3;
          shaft.rotation.x = 0.15;
          shaft.position.set(side * s * 0.015, -s * 0.008, s * 0.18);
          shaft.name = `mandible_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(shaft);

          const tipLen = s * 0.015 * mSize;
          const tipGeo = new ConeGeometry(s * 0.005 * mSize, tipLen, 4);
          const tip = new Mesh(tipGeo, mandibleMat);
          tip.rotation.z = side * -0.1;
          tip.position.set(side * s * 0.025, -s * 0.015 * mSize, s * 0.195);
          tip.name = `mandibleTip_${side === -1 ? 'L' : 'R'}`;
          mandibles.push(tip);
          break;
        }
      }
    }

    return mandibles;
  }

  // ── Leg Generation ──────────────────────────────────────────────────

  private generateLegs(cfg: BeetleConfig): Object3D[] {
    const s = cfg.size;
    const legMat = new MeshStandardMaterial({
      color: this.varyColor(cfg.bodyColor, cfg, -4),
      roughness: 0.7,
    });
    const limbs: Object3D[] = [];
    const legScale = cfg.legLength;

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;
        const z = s * 0.1 - i * s * 0.06;

        // Femur
        const femurLen = s * 0.05 * legScale;
        const femurGeo = new CylinderGeometry(s * 0.008, s * 0.006, femurLen);
        const femur = new Mesh(femurGeo, legMat);
        femur.rotation.z = side * -0.7;
        femur.position.set(side * s * 0.07, -s * 0.02, z);
        femur.name = 'femur';
        legGroup.add(femur);

        // Tibia
        const tibiaLen = s * 0.05 * legScale;
        const tibiaGeo = new CylinderGeometry(s * 0.006, s * 0.003, tibiaLen);
        const tibia = new Mesh(tibiaGeo, legMat);
        tibia.rotation.z = side * 0.3;
        tibia.position.set(side * s * 0.1, -s * 0.05, z);
        tibia.name = 'tibia';
        legGroup.add(tibia);

        // Tarsus (foot) — 5 small segments
        const tarsusGroup = new Group();
        tarsusGroup.name = 'tarsus';
        for (let t = 0; t < 5; t++) {
          const tarsusSegLen = s * 0.006 * (1 - t * 0.15) * legScale;
          const tarsusGeo = new CylinderGeometry(
            s * 0.003 * (1 - t * 0.1),
            s * 0.002 * (1 - t * 0.1),
            tarsusSegLen,
          );
          const tarsusSeg = new Mesh(tarsusGeo, legMat);
          tarsusSeg.position.set(
            side * (s * 0.11 + t * s * 0.003),
            -s * 0.07 - t * s * 0.002,
            z,
          );
          tarsusSeg.name = `tarsusSeg_${t}`;
          tarsusGroup.add(tarsusSeg);
        }

        // Claw at tip
        const clawGeo = new ConeGeometry(s * 0.002, s * 0.005 * legScale, 3);
        const claw = new Mesh(clawGeo, legMat);
        claw.position.set(
          side * (s * 0.11 + 5 * s * 0.003),
          -s * 0.07 - 5 * s * 0.002,
          z,
        );
        claw.name = 'legClaw';
        tarsusGroup.add(claw);

        legGroup.add(tarsusGroup);
        limbs.push(legGroup);
      }
    }

    return limbs;
  }

  // ── Chitin Skin ─────────────────────────────────────────────────────

  private createChitinSkinConfig(cfg: BeetleConfig): CreatureSkinConfig {
    return this.skinSystem.createSkinConfig('insectoid', {
      skinType: 'shell',
      pattern: 'solid',
      primaryColor: new Color(cfg.elytraColor),
      secondaryColor: new Color(cfg.bodyColor),
      accentColor: new Color(cfg.elytraColor).multiplyScalar(0.6),
      roughness: 1 - cfg.glossiness,
      metalness: 0.15,
      bumpStrength: 0.5,
      textureResolution: 256,
    });
  }

  private applyChitinSkin(group: Group, skinConfig: CreatureSkinConfig, cfg: BeetleConfig): void {
    const material = this.skinSystem.generateMaterial(skinConfig);

    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        const name = child.name.toLowerCase();
        const isSpecialPart = name.includes('eye') || name.includes('mandible') ||
          name.includes('horn') || name.includes('mouth') || name.includes('antenna') ||
          name.includes('claw');
        // Don't override ladybug elytra that already have a canvas texture map
        const hasTextureMap = !!(child.material as MeshStandardMaterial).map;
        if (!isSpecialPart && !hasTextureMap) {
          const newMat = material.clone();
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

export function generateBeetle(config: Partial<BeetleConfig> = {}): Group {
  const generator = new BeetleGenerator(config.seed ?? 42);
  return generator.generate(config);
}

// ── CreatureBase Adapter (backward compatibility) ─────────────────────

/**
 * Adapter that wraps BeetleGenerator in the CreatureBase API.
 * Preserves backward compatibility for code using the CreatureBase-based API.
 *
 * Previously named BeetleGenerator in this file; renamed to avoid
 * collision with the canonical implementation class.
 */
export class BeetleAdapter extends CreatureBase {
  private _params: BeetleParams | null = null;

  constructor(params: Partial<BeetleParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INSECT });
  }

  getDefaultConfig(): BeetleParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      elytraColor: '#1A1A2E',
      mandibleSize: 0.4,
      glossiness: 0.8,
      hornType: 'none',
    } as BeetleParams;
  }

  /**
   * Generate a beetle mesh group.
   * Maps legacy BeetleParams to BeetleConfig and delegates to BeetleGenerator.
   */
  generate(params: Partial<BeetleParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    // Map legacy hornType → BeetleSpecies
    const species: BeetleSpecies = this._params.hornType === 'rhinoceros'
      ? 'rhinoceros_beetle'
      : this._params.hornType === 'stag'
        ? 'stag_beetle'
        : 'ladybug'; // 'none' and 'hercules' both map to ladybug as closest fallback

    // Map legacy params → new BeetleConfig
    const config: Partial<BeetleConfig> = {
      species,
      size: this._params.size,
      elytraColor: this._params.elytraColor,
      glossiness: this._params.glossiness,
      mandibleSize: this._params.mandibleSize,
      seed: this._params.seed,
    };

    const generator = new BeetleGenerator(this._params.seed);
    return generator.generate(config);
  }

  // CreatureBase abstract method stubs — all generation is delegated
  // to the canonical implementation via generate().

  generateBodyCore(): Object3D {
    return new Group();
  }

  generateHead(): Object3D {
    return new Group();
  }

  generateLimbs(): Object3D[] {
    return [];
  }

  generateAppendages(): Object3D[] {
    return [];
  }

  applySkin(materials: Material[]): Material[] {
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        mat.roughness = Math.min(mat.roughness, 1 - (this._params?.glossiness ?? 0.8) * 0.5);
        mat.metalness = Math.max(mat.metalness, 0.1);
      }
    }
    return materials;
  }
}
