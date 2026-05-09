/**
 * JellyfishGenerator — Standalone jellyfish with bell pulsation,
 * trailing tentacles, and translucent material.
 *
 * Three variants:
 * - Moon jelly: small bell, short tentacles, translucent white/purple
 * - Box jelly: cube-shaped bell, long trailing tentacles, more opaque
 * - Lion's mane: large bell, dense mass of long tentacles, orange/red
 *
 * Features:
 * - Bell: SphereGeometry (top half) or BoxGeometry (box jelly) with tentacle attachment ring
 * - Pulsation parameters: bellContractAmount, pulseFrequency for animation
 * - Tentacles: TubeGeometry chains with slight curvature and wave animation via CatmullRomCurve3
 * - Translucent material: MeshPhysicalMaterial with high transmission + low roughness
 *
 * Also provides a CreatureBase-based adapter (JellyfishAdapter) for backward compatibility.
 *
 * CANONICAL location for JellyfishGenerator. Previously in vegetation/jellyfish/.
 *
 * @module creatures
 */

import {
  Object3D, Group, Mesh, Material, MeshPhysicalMaterial, MeshStandardMaterial, DoubleSide,
  SphereGeometry, BoxGeometry, CylinderGeometry, LatheGeometry, TubeGeometry,
  TorusGeometry, Vector2, Vector3, CatmullRomCurve3, Color,
  AnimationClip, NumberKeyframeTrack,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

// ── Types ──────────────────────────────────────────────────────────────

export type JellyfishVariant = 'moon_jelly' | 'box_jelly' | 'lions_mane';

export interface JellyfishConfig {
  variant: JellyfishVariant;
  size: number;
  bellColor: string;
  innerBellColor: string;
  tentacleColor: string;
  bellRadius: number;
  bellHeight: number;
  tentacleCount: number;
  tentacleLength: number;
  oralArmCount: number;
  oralArmLength: number;
  /** Bell contraction amount for pulsation animation (0.0 - 1.0) */
  bellContractAmount: number;
  /** Pulse frequency in Hz for pulsation animation */
  pulseFrequency: number;
  radialCanalCount: number;
  bioluminescence: boolean;
  bioluminescenceColor: string;
  /** Transmission amount for translucent material (0 = opaque, 1 = fully transparent) */
  transmission: number;
  seed: number;
}

/** @deprecated Use JellyfishConfig instead */
export interface JellyfishParams extends CreatureParams {
  bellColor: string;
  innerBellColor: string;
  tentacleColor: string;
  bellRadius: number;
  bellHeight: number;
  tentacleCount: number;
  tentacleLength: number;
  oralArmCount: number;
  oralArmLength: number;
  transparency: number; // 0-1
  pulseSpeed: number;   // pulses per second
  radialCanalCount: number;
  bioluminescence: boolean;
  bioluminescenceColor: string;
}

const DEFAULT_CONFIG: JellyfishConfig = {
  variant: 'moon_jelly',
  size: 0.3,
  bellColor: '#FF69B4',
  innerBellColor: '#FFFFFF',
  tentacleColor: '#FFB6C1',
  bellRadius: 0.15,
  bellHeight: 0.12,
  tentacleCount: 16,
  tentacleLength: 0.4,
  oralArmCount: 4,
  oralArmLength: 0.2,
  bellContractAmount: 0.15,
  pulseFrequency: 0.8,
  radialCanalCount: 8,
  bioluminescence: false,
  bioluminescenceColor: '#00FFFF',
  transmission: 0.6,
  seed: 42,
};

const VARIANT_DEFAULTS: Record<JellyfishVariant, Partial<JellyfishConfig>> = {
  moon_jelly: {
    bellColor: '#C8A2C8', innerBellColor: '#E8D8E8', tentacleColor: '#D8BFD8',
    bellRadius: 0.15, bellHeight: 0.08, tentacleCount: 24, tentacleLength: 0.3,
    oralArmCount: 4, transmission: 0.7, bellContractAmount: 0.12, pulseFrequency: 0.6,
  },
  box_jelly: {
    bellColor: '#00BFFF', innerBellColor: '#87CEEB', tentacleColor: '#4682B4',
    bellRadius: 0.08, bellHeight: 0.12, tentacleCount: 12, tentacleLength: 1.0,
    oralArmCount: 4, transmission: 0.4, bellContractAmount: 0.2, pulseFrequency: 1.2,
    bioluminescence: true, bioluminescenceColor: '#00FFFF',
  },
  lions_mane: {
    bellColor: '#FF8C00', innerBellColor: '#FFD700', tentacleColor: '#FFA500',
    bellRadius: 0.25, bellHeight: 0.15, tentacleCount: 40, tentacleLength: 0.8,
    oralArmCount: 8, oralArmLength: 0.4, transmission: 0.5, bellContractAmount: 0.1, pulseFrequency: 0.5,
  },
};

// ── JellyfishGenerator (Canonical Implementation) ─────────────────────

export class JellyfishGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a jellyfish mesh group.
   */
  generate(config: Partial<JellyfishConfig> = {}): Group {
    const cfg = { ...DEFAULT_CONFIG, ...VARIANT_DEFAULTS[config.variant ?? 'moon_jelly'], ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new Group();
    group.name = `Jellyfish_${cfg.variant}`;

    // Bell
    const bell = this.generateBell(cfg);
    group.add(bell);

    // Tentacles
    this.generateTentacles(cfg).forEach(t => group.add(t));

    // Oral arms
    this.generateOralArms(cfg).forEach(a => group.add(a));

    // Add pulse animation data
    const pulseClip = this.createPulseAnimation(cfg);
    group.userData.animations = [pulseClip];
    group.userData.pulseFrequency = cfg.pulseFrequency;
    group.userData.bellContractAmount = cfg.bellContractAmount;

    return group;
  }

  // ── Bell Generation ─────────────────────────────────────────────────

  private generateBell(cfg: JellyfishConfig): Object3D {
    const r = cfg.bellRadius;
    const bellGroup = new Group();
    bellGroup.name = 'bell';

    if (cfg.variant === 'box_jelly') {
      // Box jelly: cube-shaped bell using BoxGeometry
      this.generateBoxBell(bellGroup, cfg);
    } else {
      // Moon jelly / Lion's mane: hemispherical dome with LatheGeometry
      this.generateDomeBell(bellGroup, cfg);
    }

    // Tentacle attachment ring at bell margin
    const ringMat = new MeshPhysicalMaterial({
      color: cfg.bellColor,
      roughness: 0.15,
      metalness: 0.0,
      transmission: cfg.transmission,
      ior: 1.3,
      thickness: 0.05,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      depthWrite: false,
    });
    const ringGeo = new TorusGeometry(r * 0.95, r * 0.012, 8, 32);
    const ring = new Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = -cfg.bellHeight * 0.7;
    ring.name = 'tentacleRing';
    bellGroup.add(ring);

    // Bioluminescence glow
    if (cfg.bioluminescence) {
      const glowMat = new MeshStandardMaterial({
        color: cfg.bioluminescenceColor,
        emissive: cfg.bioluminescenceColor,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.4,
        roughness: 0.0,
      });
      const glowGeo = new SphereGeometry(r * 0.5, 16, 16);
      const glow = new Mesh(glowGeo, glowMat);
      glow.position.y = -cfg.bellHeight * 0.3;
      glow.name = 'bioluminescence';
      bellGroup.add(glow);
    }

    return bellGroup;
  }

  /** Generate a hemispherical dome bell (moon jelly, lion's mane) */
  private generateDomeBell(bellGroup: Group, cfg: JellyfishConfig): void {
    const r = cfg.bellRadius;

    // Outer bell: hemisphere dome with scalloped rim using LatheGeometry
    const bellMat = new MeshPhysicalMaterial({
      color: cfg.bellColor,
      roughness: 0.1,
      metalness: 0.0,
      transmission: cfg.transmission,
      ior: 1.3,
      thickness: 0.1,
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
      depthWrite: false,
    });

    const profile: Vector2[] = [];
    const profileSteps = 24;
    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const angle = t * Math.PI * 0.55;
      const x = Math.sin(angle) * r;
      const y = Math.cos(angle) * cfg.bellHeight - cfg.bellHeight;
      profile.push(new Vector2(Math.max(0.001, x), y));
    }

    const bellGeo = new LatheGeometry(profile, 32);

    // Scalloped rim: add subtle undulation near the rim
    const positions = bellGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      if (y > -cfg.bellHeight * 0.15) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const angle = Math.atan2(z, x);
        const scallop = Math.sin(angle * cfg.radialCanalCount) * r * 0.05;
        positions.setY(i, y + scallop * (1 - (y + cfg.bellHeight * 0.15) / (cfg.bellHeight * 0.15)));
      }
    }
    bellGeo.computeVertexNormals();

    const bell = new Mesh(bellGeo, bellMat);
    bell.name = 'outerBell';
    bellGroup.add(bell);

    // Inner bell (subumbrella)
    const innerMat = new MeshPhysicalMaterial({
      color: cfg.innerBellColor,
      roughness: 0.05,
      metalness: 0.0,
      transmission: cfg.transmission * 0.8,
      ior: 1.2,
      thickness: 0.05,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
      depthWrite: false,
    });

    const innerProfile: Vector2[] = [];
    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const angle = t * Math.PI * 0.5;
      const x = Math.sin(angle) * r * 0.7;
      const y = Math.cos(angle) * cfg.bellHeight * 0.6 - cfg.bellHeight * 0.9;
      innerProfile.push(new Vector2(Math.max(0.001, x), y));
    }

    const innerGeo = new LatheGeometry(innerProfile, 24);
    const inner = new Mesh(innerGeo, innerMat);
    inner.position.y = -cfg.bellHeight * 0.05;
    inner.name = 'innerBell';
    bellGroup.add(inner);

    // Radial canals
    if (cfg.radialCanalCount > 0) {
      const canalMat = new MeshPhysicalMaterial({
        color: cfg.innerBellColor, transparent: true, opacity: 0.3, roughness: 0.05,
        transmission: cfg.transmission * 0.5, ior: 1.2, thickness: 0.02,
      });
      for (let c = 0; c < cfg.radialCanalCount; c++) {
        const angle = (c / cfg.radialCanalCount) * Math.PI * 2;
        const canalGeo = new CylinderGeometry(r * 0.008, r * 0.005, cfg.bellHeight * 0.8);
        const canal = new Mesh(canalGeo, canalMat);
        canal.position.set(
          Math.cos(angle) * r * 0.4,
          -cfg.bellHeight * 0.3,
          Math.sin(angle) * r * 0.4,
        );
        canal.rotation.z = Math.cos(angle) * 0.3;
        canal.rotation.x = Math.sin(angle) * 0.3;
        canal.name = `radialCanal_${c}`;
        bellGroup.add(canal);
      }
    }
  }

  /** Generate a cube-shaped bell (box jelly) */
  private generateBoxBell(bellGroup: Group, cfg: JellyfishConfig): void {
    const r = cfg.bellRadius;
    const h = cfg.bellHeight;

    // Main cube bell
    const boxMat = new MeshPhysicalMaterial({
      color: cfg.bellColor,
      roughness: 0.1,
      metalness: 0.0,
      transmission: cfg.transmission,
      ior: 1.3,
      thickness: 0.15,
      transparent: true,
      opacity: 0.7,
      side: DoubleSide,
      depthWrite: false,
    });

    // Slightly rounded box shape
    const boxGeo = new BoxGeometry(r * 1.5, h, r * 1.5, 4, 4, 4);

    // Slight rounding at the bottom edges
    const positions = boxGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const x = positions.getX(i);
      const z = positions.getZ(i);
      // Taper bottom slightly
      if (y < 0) {
        const t = Math.abs(y) / (h * 0.5);
        const taper = 1 - t * 0.15;
        positions.setX(i, x * taper);
        positions.setZ(i, z * taper);
      }
    }
    boxGeo.computeVertexNormals();

    const box = new Mesh(boxGeo, boxMat);
    box.name = 'boxBell';
    bellGroup.add(box);

    // Inner bell for box jelly
    const innerMat = new MeshPhysicalMaterial({
      color: cfg.innerBellColor,
      roughness: 0.05,
      metalness: 0.0,
      transmission: cfg.transmission * 0.8,
      ior: 1.2,
      thickness: 0.05,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
      depthWrite: false,
    });
    const innerGeo = new BoxGeometry(r * 1.0, h * 0.7, r * 1.0, 2, 2, 2);
    const inner = new Mesh(innerGeo, innerMat);
    inner.position.y = -h * 0.05;
    inner.name = 'innerBell';
    bellGroup.add(inner);

    // Pedalia (corner structures unique to box jellies)
    const pedaliumMat = new MeshPhysicalMaterial({
      color: cfg.bellColor, roughness: 0.15, transmission: cfg.transmission * 0.5,
      ior: 1.2, thickness: 0.03, transparent: true, opacity: 0.6,
    });
    for (let corner = 0; corner < 4; corner++) {
      const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
      const pedaliumGeo = new CylinderGeometry(r * 0.03, r * 0.015, h * 0.4, 4);
      const pedalium = new Mesh(pedaliumGeo, pedaliumMat);
      pedalium.position.set(
        Math.cos(angle) * r * 0.85,
        -h * 0.6,
        Math.sin(angle) * r * 0.85,
      );
      pedalium.name = `pedalium_${corner}`;
      bellGroup.add(pedalium);
    }

    // Rhopalia (sensory structures at corners)
    for (let corner = 0; corner < 4; corner++) {
      const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
      const rhopaliaGeo = new SphereGeometry(r * 0.04, 8, 8);
      const rhopaliaMat = new MeshPhysicalMaterial({
        color: cfg.bioluminescenceColor,
        emissive: cfg.bioluminescenceColor,
        emissiveIntensity: 0.8,
        roughness: 0.05,
        transmission: 0.3,
        ior: 1.5,
        thickness: 0.02,
        transparent: true,
        opacity: 0.7,
      });
      const rhopalia = new Mesh(rhopaliaGeo, rhopaliaMat);
      rhopalia.position.set(
        Math.cos(angle) * r * 0.85,
        h * 0.3,
        Math.sin(angle) * r * 0.85,
      );
      rhopalia.name = `rhopalia_${corner}`;
      bellGroup.add(rhopalia);
    }
  }

  // ── Tentacle Generation using TubeGeometry chains ───────────────────

  private generateTentacles(cfg: JellyfishConfig): Object3D[] {
    const r = cfg.bellRadius;
    const appendages: Object3D[] = [];

    const tentacleMat = new MeshPhysicalMaterial({
      color: cfg.tentacleColor,
      roughness: 0.15,
      metalness: 0.0,
      transmission: cfg.transmission * 0.5,
      ior: 1.2,
      thickness: 0.02,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < cfg.tentacleCount; i++) {
      const angle = (i / cfg.tentacleCount) * Math.PI * 2;
      const tentacleGroup = new Group();
      tentacleGroup.name = `tentacle_${i}`;

      // Create a wavy curve for the tentacle using CatmullRomCurve3 + TubeGeometry
      const rng = new SeededRandom(cfg.seed + i * 37);
      const points: Vector3[] = [];
      const segments = 8;
      for (let seg = 0; seg <= segments; seg++) {
        const t = seg / segments;
        const wave = Math.sin(t * Math.PI * 3 + i) * r * 0.08;
        const x = Math.cos(angle) * (r * 0.7 + wave * 0.3);
        const y = -cfg.bellHeight * 0.8 - t * cfg.tentacleLength;
        const z = Math.sin(angle) * (r * 0.7 + wave * 0.3);
        points.push(new Vector3(x, y, z));
      }

      const curve = new CatmullRomCurve3(points);
      // Taper tentacle radius from base to tip
      const tubeRadius = Math.max(0.001, r * 0.015);
      const tentacleGeo = new TubeGeometry(curve, segments, tubeRadius, 4, false);
      const tentacle = new Mesh(tentacleGeo, tentacleMat);
      tentacleGroup.add(tentacle);

      appendages.push(tentacleGroup);
    }

    return appendages;
  }

  // ── Oral Arms ────────────────────────────────────────────────────────

  private generateOralArms(cfg: JellyfishConfig): Object3D[] {
    const r = cfg.bellRadius;
    const appendages: Object3D[] = [];

    const armMat = new MeshPhysicalMaterial({
      color: 0xffccdd,
      roughness: 0.2,
      metalness: 0.0,
      transmission: cfg.transmission * 0.4,
      ior: 1.2,
      thickness: 0.03,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < cfg.oralArmCount; i++) {
      const angle = (i / cfg.oralArmCount) * Math.PI * 2 + Math.PI / cfg.oralArmCount;

      // Oral arm as TubeGeometry following a CatmullRomCurve3
      const armRng = new SeededRandom(cfg.seed + i * 53 + 1000);
      const points: Vector3[] = [];
      const armSegments = 6;
      for (let seg = 0; seg <= armSegments; seg++) {
        const t = seg / armSegments;
        const waveX = Math.sin(t * Math.PI * 2 + i * 1.5) * r * 0.05;
        const waveZ = Math.cos(t * Math.PI * 2 + i * 1.5) * r * 0.05;
        const x = Math.cos(angle) * r * 0.25 + waveX * t;
        const y = -cfg.bellHeight - t * cfg.oralArmLength;
        const z = Math.sin(angle) * r * 0.25 + waveZ * t;
        points.push(new Vector3(x, y, z));
      }

      const curve = new CatmullRomCurve3(points);
      const armRadius = Math.max(0.001, r * 0.02);
      const armGeo = new TubeGeometry(curve, armSegments, armRadius, 4, false);
      const arm = new Mesh(armGeo, armMat);
      arm.name = `oralArm_${i}`;
      appendages.push(arm);
    }

    return appendages;
  }

  // ── Pulse Animation ─────────────────────────────────────────────────

  /**
   * Create a bell pulsation animation clip.
   * The bell contracts and expands rhythmically using bellContractAmount
   * and pulseFrequency parameters.
   */
  private createPulseAnimation(cfg: JellyfishConfig): AnimationClip {
    const duration = 1.0 / cfg.pulseFrequency;
    const frames = 30;
    const contract = cfg.bellContractAmount;

    const scaleYValues: number[] = [];
    const scaleXZValues: number[] = [];
    const times: number[] = [];

    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      times.push(t * duration);
      // Bell contracts (y scale decreases) then expands
      scaleYValues.push(1.0 - contract * Math.sin(t * Math.PI * 2));
      // XZ expand when contracting (volume preservation)
      scaleXZValues.push(1.0 + contract * 0.5 * Math.sin(t * Math.PI * 2));
    }

    const scaleYTrack = new NumberKeyframeTrack('bell.scale[y]', times, scaleYValues);
    const scaleXTrack = new NumberKeyframeTrack('bell.scale[x]', times, scaleXZValues);
    const scaleZTrack = new NumberKeyframeTrack('bell.scale[z]', times, scaleXZValues);

    return new AnimationClip(
      'jellyfish_pulse',
      duration,
      [scaleXTrack, scaleYTrack, scaleZTrack],
    );
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateJellyfish(config: Partial<JellyfishConfig> = {}): Group {
  const generator = new JellyfishGenerator(config.seed ?? 42);
  return generator.generate(config);
}

// ── CreatureBase Adapter (backward compatibility) ─────────────────────

/**
 * Adapter that wraps JellyfishGenerator in the CreatureBase API.
 * Preserves backward compatibility for code using the CreatureBase-based API.
 *
 * Previously named JellyfishGenerator in this file; renamed to avoid
 * collision with the canonical implementation class.
 */
export class JellyfishAdapter extends CreatureBase {
  private _params: JellyfishParams | null = null;

  constructor(params: Partial<JellyfishParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INVERTEBRATE });
  }

  getDefaultConfig(): JellyfishParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      bellColor: '#FF69B4',
      innerBellColor: '#FFFFFF',
      tentacleColor: '#FFB6C1',
      bellRadius: 0.15,
      bellHeight: 0.12,
      tentacleCount: 16,
      tentacleLength: 0.4,
      oralArmCount: 4,
      oralArmLength: 0.2,
      transparency: 0.7,
      pulseSpeed: 0.8,
      radialCanalCount: 8,
      bioluminescence: false,
      bioluminescenceColor: '#00FFFF',
    } as JellyfishParams;
  }

  /**
   * Generate a jellyfish mesh group.
   * Maps legacy JellyfishParams to JellyfishConfig and delegates to JellyfishGenerator.
   */
  generate(params: Partial<JellyfishParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    // Map legacy pulseSpeed → bellContractAmount + pulseFrequency
    const config: Partial<JellyfishConfig> = {
      variant: 'moon_jelly' as JellyfishVariant,
      size: this._params.size,
      bellColor: this._params.bellColor,
      innerBellColor: this._params.innerBellColor,
      tentacleColor: this._params.tentacleColor,
      bellRadius: this._params.bellRadius,
      bellHeight: this._params.bellHeight,
      tentacleCount: this._params.tentacleCount,
      tentacleLength: this._params.tentacleLength,
      oralArmCount: this._params.oralArmCount,
      oralArmLength: this._params.oralArmLength,
      bellContractAmount: 0.15,
      pulseFrequency: this._params.pulseSpeed,
      radialCanalCount: this._params.radialCanalCount,
      bioluminescence: this._params.bioluminescence,
      bioluminescenceColor: this._params.bioluminescenceColor,
      transmission: this._params.transparency,
      seed: this._params.seed,
    };

    const generator = new JellyfishGenerator(this._params.seed);
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
        mat.roughness = Math.min(mat.roughness, 0.3);
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity ?? 1.0, 0.75);
        mat.side = 2; // DoubleSide
      }
    }
    return materials;
  }
}
