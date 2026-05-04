/**
 * LegGenerator - Procedural jointed legs with deep detail
 *
 * Supports:
 * - Surface muscle bulge profiles (thigh/calf curves)
 * - Joint objects at hip, knee, ankle positions for rigging
 * - IKParams for foot targeting via the NURBS-to-armature pipeline
 * - Leg types: quadruped front, quadruped back, bird, insect, reptile
 * - Each leg returns proper Joint and IKParams data
 *
 * Phase 2: Returns Joint and IKParams data for the NURBS-to-armature pipeline.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/MathUtils';
import type { Joint } from './HeadDetailGenerator';
import type { IKParams } from '../rigging/NURBSToArmature';

// ── Types ────────────────────────────────────────────────────────────

export type LegType = 'insect' | 'mammal' | 'bird' | 'reptile';
export type LegSubType = 'quadruped_front' | 'quadruped_back' | 'bird' | 'insect';
export type FootType = 'claw' | 'hoof' | 'webbed' | 'pad' | 'tarsus';

export interface LegConfig {
  type: LegType;
  subType?: LegSubType;
  count: number;
  size: number;
  upperRatio: number;
  footType: FootType;
  jointAngle: number;
  spread: number;
  color?: number;
  muscleBulge?: number; // 0-1, how pronounced the muscle profiles are
}

export interface LegResult {
  group: THREE.Group;
  joints: Record<string, Joint>;
  ikParams: IKParams[];
}

// ── Leg Generator ────────────────────────────────────────────────────

export class LegGenerator {
  private seed: number;
  private rng: SeededRandom;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
    this.rng = new SeededRandom(this.seed);
  }

  generate(type: string, count: number, size: number): THREE.Group;
  generate(config: Partial<LegConfig>): THREE.Group;
  generate(typeOrConfig: string | Partial<LegConfig>, count?: number, size?: number): THREE.Group {
    const result = this.generateWithJoints(typeOrConfig, count, size);
    return result.group;
  }

  /**
   * Generate legs with full joint and IK data for rigging.
   */
  generateWithJoints(typeOrConfig: string | Partial<LegConfig>, count?: number, size?: number): LegResult {
    let config: LegConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as LegType,
        count: count ?? 4,
        size: size ?? 1.0,
        upperRatio: 0.5,
        footType: 'claw',
        jointAngle: 0.4,
        spread: 0.15,
        color: 0x8B4513,
        muscleBulge: 0.5,
      };
    } else {
      config = {
        type: 'mammal',
        count: 4,
        size: 1.0,
        upperRatio: 0.5,
        footType: 'claw',
        jointAngle: 0.4,
        spread: 0.15,
        color: 0x8B4513,
        muscleBulge: 0.5,
        ...typeOrConfig,
      };
    }

    const legs = new THREE.Group();
    legs.name = 'legs';

    const allJoints: Record<string, Joint> = {};
    const allIKParams: IKParams[] = [];

    const legCount = config.count;
    for (let i = 0; i < legCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const pair = Math.floor(i / 2);
      const totalPairs = Math.ceil(legCount / 2);
      const zOffset = (pair / (totalPairs - 1 || 1) - 0.5) * config.size * 0.4;

      // Determine leg sub-type
      let subType: LegSubType;
      if (config.type === 'bird') {
        subType = 'bird';
      } else if (config.type === 'insect') {
        subType = 'insect';
      } else if (config.type === 'mammal' && config.count >= 4) {
        subType = pair === 0 ? 'quadruped_front' : 'quadruped_back';
      } else {
        subType = 'quadruped_front';
      }

      const legResult = this.createJointedLeg(config, side, zOffset, i, subType);
      legResult.group.name = `leg_${i}`;
      legs.add(legResult.group);

      // Merge joints and IK params
      Object.assign(allJoints, legResult.joints);
      allIKParams.push(...legResult.ikParams);
    }

    return { group: legs, joints: allJoints, ikParams: allIKParams };
  }

  private createJointedLeg(
    config: LegConfig, side: number, zOffset: number, index: number, subType: LegSubType,
  ): LegResult {
    const group = new THREE.Group();
    const s = config.size;
    const upperLen = s * config.upperRatio;
    const lowerLen = s * (1 - config.upperRatio);
    const bulge = config.muscleBulge ?? 0.5;

    const joints: Record<string, Joint> = {};
    const ikParams: IKParams[] = [];

    const legMat = new THREE.MeshStandardMaterial({
      color: config.color ?? 0x8B4513,
      roughness: 0.7,
    });

    // Position the leg root
    group.position.set(side * s * config.spread, 0, zOffset);

    const sideName = side === -1 ? 'L' : 'R';
    const legPrefix = `leg_${index}`;

    // Hip joint at t=0
    joints[`${legPrefix}_hip`] = {
      name: `${legPrefix}_hip`,
      position: new THREE.Vector3(side * s * config.spread, 0, zOffset),
      rotation: new THREE.Euler(0, 0, side * 0.15),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.3, -0.5),
        max: new THREE.Vector3(0.5, 0.8, 0.5),
      },
    };

    switch (config.type) {
      case 'insect':
        this.buildInsectLeg(group, s, upperLen, lowerLen, side, legMat, config, index);
        break;
      case 'mammal':
        this.buildMammalLeg(group, s, upperLen, lowerLen, side, legMat, config, index, subType, bulge, joints);
        break;
      case 'bird':
        this.buildBirdLeg(group, s, upperLen, lowerLen, side, legMat, config, index, joints);
        break;
      case 'reptile':
        this.buildReptileLeg(group, s, upperLen, lowerLen, side, legMat, config, index);
        break;
      default:
        this.buildMammalLeg(group, s, upperLen, lowerLen, side, legMat, config, index, subType, bulge, joints);
    }

    // Knee joint at t=0.5
    joints[`${legPrefix}_knee`] = {
      name: `${legPrefix}_knee`,
      position: new THREE.Vector3(side * s * 0.03, -upperLen, 0),
      rotation: new THREE.Euler(0, 0, side * -0.1),
      bounds: {
        min: new THREE.Vector3(-0.3, -1.0, -0.3),
        max: new THREE.Vector3(0.3, 0.3, 0.3),
      },
    };

    // Ankle joint at foot position
    joints[`${legPrefix}_ankle`] = {
      name: `${legPrefix}_ankle`,
      position: new THREE.Vector3(side * s * 0.05, -upperLen - lowerLen, s * 0.05),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.3, -0.3, -0.3),
        max: new THREE.Vector3(0.3, 0.3, 0.3),
      },
    };

    // IK for foot targeting
    ikParams.push({
      targetJoint: `${legPrefix}_ankle`,
      chainLength: 3, // hip → knee → ankle
    });

    return { group, joints, ikParams };
  }

  /**
   * Mammal leg with muscle bulge profiles
   */
  private buildMammalLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig,
    index: number, subType: LegSubType, bulge: number,
    joints: Record<string, Joint>,
  ): void {
    // Upper leg with muscle bulge
    const upperGeo = this.createMuscleProfileGeometry(
      s * 0.04,   // top radius (hip)
      s * 0.05 * (1 + bulge * 0.3), // mid bulge (thigh)
      s * 0.04,   // bottom radius (knee)
      upperLen,
      8,
    );
    const upper = new THREE.Mesh(upperGeo, mat);
    upper.position.set(0, -upperLen * 0.5, 0);
    upper.rotation.z = side * 0.15;
    upper.name = 'upperLeg';
    group.add(upper);

    // Knee joint sphere
    const jointGeo = new THREE.SphereGeometry(s * 0.05, 8, 8);
    const joint = new THREE.Mesh(jointGeo, mat);
    joint.position.set(side * s * 0.03, -upperLen, 0);
    joint.name = 'knee';
    group.add(joint);

    // Lower leg with calf muscle
    const lowerGeo = this.createMuscleProfileGeometry(
      s * 0.03 * (1 + bulge * 0.15), // top (below knee)
      s * 0.035 * (1 + bulge * 0.1),  // mid (calf)
      s * 0.025,                       // bottom (ankle)
      lowerLen,
      8,
    );
    const lower = new THREE.Mesh(lowerGeo, mat);
    lower.position.set(side * s * 0.05, -upperLen - lowerLen * 0.5, s * 0.03);
    lower.rotation.z = side * -0.1;
    lower.rotation.x = 0.2;
    lower.name = 'lowerLeg';
    group.add(lower);

    // Foot
    this.buildFoot(group, s, side, -upperLen - lowerLen, mat, config);

    // Quadruped-specific adjustments
    if (subType === 'quadruped_back') {
      // Hind legs are thicker and more angled
      upper.scale.set(1.15, 1.0, 1.15);
      lower.rotation.z = side * -0.15;
    }
  }

  /**
   * Create a leg segment geometry with muscle bulge profile
   * Uses a lathe-like approach to create a profile that bulges at the midpoint
   */
  private createMuscleProfileGeometry(
    topRadius: number,
    midBulgeRadius: number,
    bottomRadius: number,
    length: number,
    radialSegments: number = 8,
  ): THREE.BufferGeometry {
    // Create profile points for a lathe geometry
    const profilePoints: THREE.Vector2[] = [];
    const profileSteps = 8;

    for (let i = 0; i <= profileSteps; i++) {
      const t = i / profileSteps;
      const y = -length * 0.5 + t * length;

      // Interpolate radius: top → mid → bottom with smooth bulge
      let radius: number;
      if (t < 0.5) {
        // Top to mid: smooth interpolation with bulge
        const st = t * 2; // 0 to 1
        const bulgeFactor = Math.sin(st * Math.PI);
        radius = THREE.MathUtils.lerp(topRadius, midBulgeRadius, st) +
                 (midBulgeRadius - topRadius) * bulgeFactor * 0.5;
      } else {
        // Mid to bottom: taper
        const st = (t - 0.5) * 2; // 0 to 1
        radius = THREE.MathUtils.lerp(midBulgeRadius, bottomRadius, st * st);
      }

      radius = Math.max(0.001, radius);
      profilePoints.push(new THREE.Vector2(radius, y));
    }

    return new THREE.LatheGeometry(profilePoints, radialSegments);
  }

  /**
   * Insect leg
   */
  private buildInsectLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig, index: number,
  ): void {
    const tarsusLen = s * 0.15;

    // Coxa (hip joint)
    const coxaGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.025, s * 0.06, 6);
    const coxa = new THREE.Mesh(coxaGeo, mat);
    coxa.position.set(side * s * 0.02, -s * 0.03, 0);
    coxa.rotation.z = side * 0.5;
    coxa.rotation.x = side * 0.3;
    coxa.name = 'coxa';
    group.add(coxa);

    // Femur
    const femurGeo = new THREE.CylinderGeometry(s * 0.02, s * 0.025, upperLen, 6);
    const femur = new THREE.Mesh(femurGeo, mat);
    femur.position.set(side * s * 0.06, -s * 0.06 - upperLen * 0.4, 0);
    femur.rotation.z = side * 1.0;
    femur.name = 'femur';
    group.add(femur);

    // Tibia
    const tibiaGeo = new THREE.CylinderGeometry(s * 0.01, s * 0.018, lowerLen, 6);
    const tibia = new THREE.Mesh(tibiaGeo, mat);
    tibia.position.set(side * s * 0.06, -s * 0.06 - upperLen * 0.8 - lowerLen * 0.4, 0);
    tibia.rotation.z = side * -0.3;
    tibia.name = 'tibia';
    group.add(tibia);

    // Tarsus
    this.buildTarsus(group, s, tarsusLen, side, mat, config);
  }

  /**
   * Bird leg
   */
  private buildBirdLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig,
    index: number, joints: Record<string, Joint>,
  ): void {
    const legMat = new THREE.MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });

    // Thigh (short, feather-covered)
    const thighGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.04, upperLen * 0.7, 6);
    const thigh = new THREE.Mesh(thighGeo, mat);
    thigh.position.set(0, -upperLen * 0.35, 0);
    thigh.name = 'thigh';
    group.add(thigh);

    // Tibiotarsus (long lower leg)
    const tibiotarsusGeo = new THREE.CylinderGeometry(s * 0.015, s * 0.02, lowerLen, 6);
    const tibiotarsus = new THREE.Mesh(tibiotarsusGeo, legMat);
    tibiotarsus.position.set(side * s * 0.02, -upperLen * 0.7 - lowerLen * 0.4, s * 0.05);
    tibiotarsus.rotation.x = 0.3;
    tibiotarsus.name = 'tibiotarsus';
    group.add(tibiotarsus);

    // Tarsometatarsus (foot segment)
    const tarsusGeo = new THREE.CylinderGeometry(s * 0.01, s * 0.012, s * 0.08, 6);
    const tarsus = new THREE.Mesh(tarsusGeo, legMat);
    tarsus.position.set(side * s * 0.02, -upperLen * 0.7 - lowerLen * 0.9, s * 0.08);
    tarsus.rotation.x = Math.PI / 2;
    tarsus.name = 'tarsometatarsus';
    group.add(tarsus);

    // Toes (3 forward, 1 back)
    const toeMat = new THREE.MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });
    const toeGeo = new THREE.CylinderGeometry(s * 0.004, s * 0.006, s * 0.05, 4);
    const footY = -upperLen * 0.7 - lowerLen * 0.9;
    const footZ = s * 0.12;

    for (let t = -1; t <= 1; t++) {
      const toe = new THREE.Mesh(toeGeo, toeMat);
      toe.position.set(side * s * 0.02 + t * s * 0.02, footY, footZ);
      toe.rotation.x = Math.PI / 3;
      toe.name = `toe_${t}`;
      group.add(toe);
    }

    // Back toe
    const backToe = new THREE.Mesh(toeGeo, toeMat);
    backToe.position.set(side * s * 0.02, footY, footZ - s * 0.06);
    backToe.rotation.x = -Math.PI / 4;
    backToe.name = 'backToe';
    group.add(backToe);

    // Claw tips
    const clawGeo = new THREE.ConeGeometry(s * 0.004, s * 0.015, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    for (let t = -1; t <= 1; t++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.02 + t * s * 0.02, footY - s * 0.02, footZ + s * 0.04);
      claw.rotation.x = Math.PI / 2;
      claw.name = `claw_${t}`;
      group.add(claw);
    }

    // Bird-specific ankle joint
    joints[`leg_${index}_ankle`] = {
      name: `leg_${index}_ankle`,
      position: new THREE.Vector3(side * s * 0.02, -upperLen * 0.7 - lowerLen * 0.9, s * 0.08),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.2, -0.3, -0.2),
        max: new THREE.Vector3(0.2, 0.3, 0.2),
      },
    };
  }

  /**
   * Reptile leg
   */
  private buildReptileLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig, index: number,
  ): void {
    const scaleMat = new THREE.MeshStandardMaterial({
      color: config.color ?? 0x4a6a3a, roughness: 0.6,
    });

    // Upper leg - splayed outward
    const upperGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.04, upperLen, 6);
    const upper = new THREE.Mesh(upperGeo, scaleMat);
    upper.position.set(side * s * 0.04, -upperLen * 0.4, 0);
    upper.rotation.z = side * 0.7;
    upper.name = 'upperLeg';
    group.add(upper);

    // Lower leg - angles back down
    const lowerGeo = new THREE.CylinderGeometry(s * 0.02, s * 0.03, lowerLen, 6);
    const lower = new THREE.Mesh(lowerGeo, scaleMat);
    lower.position.set(side * s * 0.08, -upperLen * 0.7 - lowerLen * 0.4, s * 0.03);
    lower.rotation.z = side * -0.3;
    lower.rotation.x = 0.4;
    lower.name = 'lowerLeg';
    group.add(lower);

    // Foot with claws
    const footY = -upperLen * 0.7 - lowerLen * 0.9;
    const footZ = s * 0.06;
    const footGeo = new THREE.BoxGeometry(s * 0.05, s * 0.015, s * 0.08);
    const foot = new THREE.Mesh(footGeo, scaleMat);
    foot.position.set(side * s * 0.08, footY, footZ);
    foot.name = 'foot';
    group.add(foot);

    // Claws
    const clawGeo = new THREE.ConeGeometry(s * 0.006, s * 0.025, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.08 + c * s * 0.015, footY - s * 0.01, footZ + s * 0.05);
      claw.rotation.x = Math.PI / 3;
      claw.name = `claw_${c}`;
      group.add(claw);
    }
  }

  /**
   * Build insect tarsus (foot) with tiny claws
   */
  private buildTarsus(
    group: THREE.Group, s: number, tarsusLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    const tarsusGeo = new THREE.CylinderGeometry(s * 0.005, s * 0.008, tarsusLen, 4);
    const tarsus = new THREE.Mesh(tarsusGeo, mat);
    const baseY = -s * 0.06 - s * config.upperRatio * 0.8 - s * (1 - config.upperRatio) * 0.8;
    tarsus.position.set(side * s * 0.04, baseY - tarsusLen * 0.5, s * 0.02);
    tarsus.rotation.z = side * 0.2;
    tarsus.name = 'tarsus';
    group.add(tarsus);

    // Tiny claws at tip
    const clawGeo = new THREE.ConeGeometry(s * 0.004, s * 0.015, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    for (const cSide of [-1, 1]) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.04 + cSide * s * 0.005, baseY - tarsusLen, s * 0.04);
      claw.rotation.x = Math.PI / 4;
      claw.name = `tarsalClaw_${cSide}`;
      group.add(claw);
    }
  }

  /**
   * Build mammal foot/paw/hoof
   */
  private buildFoot(
    group: THREE.Group, s: number, side: number, y: number,
    mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    switch (config.footType) {
      case 'hoof': {
        const hoofGeo = new THREE.CylinderGeometry(s * 0.04, s * 0.05, s * 0.04, 8);
        const hoofMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 });
        const hoof = new THREE.Mesh(hoofGeo, hoofMat);
        hoof.position.set(side * s * 0.05, y - s * 0.02, s * 0.05);
        hoof.name = 'hoof';
        group.add(hoof);
        break;
      }
      case 'webbed': {
        const webGeo = new THREE.CircleGeometry(s * 0.06, 8);
        const webMat = new THREE.MeshStandardMaterial({
          color: 0xcc8833, roughness: 0.5, side: THREE.DoubleSide,
        });
        const web = new THREE.Mesh(webGeo, webMat);
        web.position.set(side * s * 0.05, y - s * 0.02, s * 0.05);
        web.rotation.x = -Math.PI / 3;
        web.name = 'webbedFoot';
        group.add(web);
        break;
      }
      case 'pad': {
        const padGeo = new THREE.SphereGeometry(s * 0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.9 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(side * s * 0.05, y - s * 0.01, s * 0.05);
        pad.rotation.x = Math.PI;
        pad.name = 'pawPad';
        group.add(pad);

        // Toe pads
        for (let t = -1; t <= 1; t++) {
          const toePadGeo = new THREE.SphereGeometry(s * 0.015, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
          const toePad = new THREE.Mesh(toePadGeo, padMat);
          toePad.position.set(side * s * 0.05 + t * s * 0.02, y - s * 0.015, s * 0.07);
          toePad.rotation.x = Math.PI;
          toePad.name = `toePad_${t}`;
          group.add(toePad);
        }
        break;
      }
      default: {
        // Default claw foot
        const footGeo = new THREE.BoxGeometry(s * 0.05, s * 0.02, s * 0.06);
        const foot = new THREE.Mesh(footGeo, mat);
        foot.position.set(side * s * 0.05, y - s * 0.01, s * 0.05);
        foot.name = 'foot';
        group.add(foot);

        // Claws
        const clawGeo = new THREE.ConeGeometry(s * 0.006, s * 0.02, 4);
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
        for (let c = -1; c <= 1; c++) {
          const claw = new THREE.Mesh(clawGeo, clawMat);
          claw.position.set(side * s * 0.05 + c * s * 0.015, y - s * 0.025, s * 0.08);
          claw.rotation.x = Math.PI / 3;
          claw.name = `claw_${c}`;
          group.add(claw);
        }
        break;
      }
    }
  }
}
