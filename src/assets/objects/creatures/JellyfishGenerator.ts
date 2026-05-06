/**
 * JellyfishGenerator — Standalone jellyfish with bell pulsation,
 * trailing tentacles, and translucent material.
 *
 * Unlike the UnderwaterGenerator's jellyfish (which is one of many species),
 * this is a dedicated generator focused solely on jellyfish with:
 * - Bell pulsation animation data
 * - Trailing tentacles with varying lengths
 * - Oral arms
 * - Radial canal structure
 * - Translucent material with subsurface scattering approximation
 *
 * @module creatures
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, DoubleSide, SphereGeometry, CylinderGeometry, LatheGeometry, Vector2, AnimationClip, KeyframeTrack, NumberKeyframeTrack } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { SeededRandom, seededFbm } from '@/core/util/MathUtils';

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
  pulseSpeed: number; // pulses per second
  radialCanalCount: number;
  bioluminescence: boolean;
  bioluminescenceColor: string;
}

export class JellyfishGenerator extends CreatureBase {
  private _rng: SeededRandom;
  private _params: JellyfishParams | null = null;

  constructor(params: Partial<JellyfishParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INVERTEBRATE });
    this._rng = new SeededRandom(params.seed ?? 42);
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

  generate(params: Partial<JellyfishParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    const group = new Group();
    group.name = 'Jellyfish';

    const body = this.generateBodyCore();
    if (body) group.add(body);
    const head = this.generateHead();
    if (head) group.add(head);
    this.generateLimbs().forEach(l => { if (l) group.add(l); });
    this.generateAppendages().forEach(a => { if (a) group.add(a); });

    // Add pulse animation data
    const pulseClip = this.createPulseAnimation();
    group.userData.animations = [pulseClip];
    group.userData.pulseSpeed = this._params.pulseSpeed;

    return group;
  }

  generateBodyCore(): Object3D {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;
    const r = params.bellRadius;

    const bellGroup = new Group();
    bellGroup.name = 'bell';

    // Outer bell: hemisphere dome with scalloped rim
    const bellMat = new MeshStandardMaterial({
      color: params.bellColor,
      transparent: true,
      opacity: params.transparency,
      roughness: 0.2,
      metalness: 0.0,
      side: DoubleSide,
      depthWrite: false,
    });

    // Bell profile for LatheGeometry
    const profile: Vector2[] = [];
    const profileSteps = 24;

    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps; // 0 at top, 1 at rim
      const angle = t * Math.PI * 0.55; // Slightly more than hemisphere
      const x = Math.sin(angle) * r;
      const y = Math.cos(angle) * params.bellHeight - params.bellHeight;
      profile.push(new Vector2(x, y));
    }

    // Scalloped rim: add subtle undulation
    const bellGeo = new LatheGeometry(profile, 32);
    const positions = bellGeo.attributes.position;
    const rng = new SeededRandom(params.seed);

    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      // Only modify vertices near the rim
      if (y > -params.bellHeight * 0.15) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const angle = Math.atan2(z, x);
        const scallop = Math.sin(angle * params.radialCanalCount) * r * 0.05;
        positions.setY(i, y + scallop * (1 - (y + params.bellHeight * 0.15) / (params.bellHeight * 0.15)));
      }
    }
    bellGeo.computeVertexNormals();

    const bell = new Mesh(bellGeo, bellMat);
    bell.name = 'outerBell';
    bellGroup.add(bell);

    // Inner bell (subumbrella)
    const innerMat = new MeshStandardMaterial({
      color: params.innerBellColor,
      transparent: true,
      opacity: params.transparency * 0.5,
      roughness: 0.1,
      side: DoubleSide,
      depthWrite: false,
    });

    const innerProfile: Vector2[] = [];
    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const angle = t * Math.PI * 0.5;
      const x = Math.sin(angle) * r * 0.7;
      const y = Math.cos(angle) * params.bellHeight * 0.6 - params.bellHeight * 0.9;
      innerProfile.push(new Vector2(x, y));
    }

    const innerGeo = new LatheGeometry(innerProfile, 24);
    const inner = new Mesh(innerGeo, innerMat);
    inner.position.y = -params.bellHeight * 0.05;
    inner.name = 'innerBell';
    bellGroup.add(inner);

    // Radial canals (visible through translucent bell)
    if (params.radialCanalCount > 0) {
      const canalMat = new MeshStandardMaterial({
        color: params.innerBellColor,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
      });

      for (let c = 0; c < params.radialCanalCount; c++) {
        const angle = (c / params.radialCanalCount) * Math.PI * 2;
        const canalGeo = this.createCylinderGeometry(r * 0.008, r * 0.005, params.bellHeight * 0.8);
        const canal = new Mesh(canalGeo, canalMat);
        canal.position.set(
          Math.cos(angle) * r * 0.4,
          -params.bellHeight * 0.3,
          Math.sin(angle) * r * 0.4,
        );
        canal.rotation.z = Math.cos(angle) * 0.3;
        canal.rotation.x = Math.sin(angle) * 0.3;
        canal.name = `radialCanal_${c}`;
        bellGroup.add(canal);
      }
    }

    // Bioluminescence glow
    if (params.bioluminescence) {
      const glowMat = new MeshStandardMaterial({
        color: params.bioluminescenceColor,
        emissive: params.bioluminescenceColor,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.4,
        roughness: 0.0,
      });
      const glowGeo = new SphereGeometry(r * 0.5, 16, 16);
      const glow = new Mesh(glowGeo, glowMat);
      glow.position.y = -params.bellHeight * 0.3;
      glow.name = 'bioluminescence';
      bellGroup.add(glow);
    }

    return bellGroup;
  }

  generateHead(): Object3D {
    // Jellyfish don't have a distinct head; the bell serves as both
    return new Group(); // Empty group — head is integrated into bell
  }

  generateLimbs(): Object3D[] {
    // Jellyfish don't have traditional limbs; tentacles are appendages
    return [];
  }

  generateAppendages(): Object3D[] {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;
    const r = params.bellRadius;
    const appendages: Object3D[] = [];

    // Trailing tentacles
    const tentacleMat = new MeshStandardMaterial({
      color: params.tentacleColor,
      transparent: true,
      opacity: params.transparency * 0.6,
      roughness: 0.3,
      side: DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < params.tentacleCount; i++) {
      const angle = (i / params.tentacleCount) * Math.PI * 2;
      const tentacleGroup = new Group();
      tentacleGroup.name = `tentacle_${i}`;

      // Multi-segment tentacle with slight curl
      const segments = 6;
      const rng = new SeededRandom(params.seed + i * 37);

      for (let segIdx = 0; segIdx < segments; segIdx++) {
        const t = segIdx / segments;
        const segLen = params.tentacleLength / segments;
        const segRadius = r * 0.015 * (1 - t * 0.6);
        const segGeo = this.createCylinderGeometry(segRadius, segRadius * 0.7, segLen);

        // Slight wavy displacement
        const wave = Math.sin(t * Math.PI * 3 + i) * r * 0.05;

        const seg = new Mesh(segGeo, tentacleMat);
        seg.position.y = -segIdx * segLen - segLen * 0.5;
        seg.position.x = Math.cos(angle) * wave;
        seg.position.z = Math.sin(angle) * wave;
        seg.rotation.x = Math.sin(t * Math.PI * 2 + i * 0.5) * 0.1;
        tentacleGroup.add(seg);
      }

      tentacleGroup.position.set(
        Math.cos(angle) * r * 0.7,
        -params.bellHeight * 0.8,
        Math.sin(angle) * r * 0.7,
      );
      appendages.push(tentacleGroup);
    }

    // Oral arms (frilled, shorter)
    const armMat = new MeshStandardMaterial({
      color: 0xffccdd,
      transparent: true,
      opacity: params.transparency * 0.5,
      roughness: 0.4,
      side: DoubleSide,
      depthWrite: false,
    });

    for (let i = 0; i < params.oralArmCount; i++) {
      const angle = (i / params.oralArmCount) * Math.PI * 2 + Math.PI / params.oralArmCount;
      const armGeo = this.createCylinderGeometry(r * 0.025, r * 0.01, params.oralArmLength);
      const arm = new Mesh(armGeo, armMat);
      arm.position.set(
        Math.cos(angle) * r * 0.25,
        -params.bellHeight - params.oralArmLength * 0.5,
        Math.sin(angle) * r * 0.25,
      );
      arm.rotation.x = Math.cos(angle) * 0.15;
      arm.rotation.z = Math.sin(angle) * 0.15;
      arm.name = `oralArm_${i}`;
      appendages.push(arm);
    }

    return appendages;
  }

  applySkin(materials: Material[]): Material[] {
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        // Jellyfish are very smooth and translucent
        mat.roughness = Math.min(mat.roughness, 0.3);
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity ?? 1.0, 0.75);
        mat.side = DoubleSide;
      }
    }
    return materials;
  }

  /**
   * Create a bell pulsation animation clip.
   * The bell contracts and expands rhythmically.
   */
  private createPulseAnimation(): AnimationClip {
    const params = this._params ?? this.getDefaultConfig();
    const duration = 1.0 / params.pulseSpeed;
    const frames = 30;

    // Scale Y keyframes: contract then expand
    const scaleYValues: number[] = [];
    const scaleYTimes: number[] = [];

    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      scaleYTimes.push(t * duration);
      // Bell contracts (y scale decreases) then expands (y scale increases)
      const pulse = 1.0 - 0.15 * Math.sin(t * Math.PI * 2);
      scaleYValues.push(pulse);
    }

    // Scale XZ keyframes: expand when contracting, contract when expanding
    const scaleXZValues: number[] = [];

    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      // Inverse of Y scale for volume preservation
      const pulse = 1.0 + 0.08 * Math.sin(t * Math.PI * 2);
      scaleXZValues.push(pulse);
    }

    const scaleYTrack = new NumberKeyframeTrack(
      'bell.scale[y]',
      scaleYTimes,
      scaleYValues,
    );

    const scaleXTrack = new NumberKeyframeTrack(
      'bell.scale[x]',
      scaleYTimes,
      scaleXZValues,
    );

    const scaleZTrack = new NumberKeyframeTrack(
      'bell.scale[z]',
      scaleYTimes,
      scaleXZValues,
    );

    return new AnimationClip(
      'jellyfish_pulse',
      duration,
      [scaleXTrack, scaleYTrack, scaleZTrack],
    );
  }
}
