/**
 * MouthGenerator - Procedural mouth generation with deep detail
 *
 * Supports:
 * - Jaw with articulation joint at the hinge point
 * - Teeth geometry (incisors, canines, molars) with species-specific shapes
 * - Tongue geometry
 * - Lip geometry that wraps around teeth
 * - Beak for birds, mandibles for insects, snout, filter mouth, tube mouth
 *
 * Phase 2: Now returns Joint and IKParams data for the NURBS-to-armature pipeline,
 * including jaw articulation joint at the hinge point.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/MathUtils';
import type { Joint } from './HeadDetailGenerator';
import type { IKParams } from '../rigging/NURBSToArmature';

// ── Types ────────────────────────────────────────────────────────────

export type MouthType = 'jaw' | 'beak' | 'mandible' | 'snout' | 'filter' | 'tube';
export type TeethType = 'herbivore' | 'carnivore' | 'omnivore';

export interface MouthConfig {
  type: MouthType;
  size: number;
  color: number;
  teethColor?: number;
  openAmount?: number;     // 0 = closed, 1 = fully open
  jawWidth?: number;
  jawDepth?: number;
  jawLength?: number;
  toothCount?: number;
  teethType?: TeethType;
  tongueLength?: number;
  hasLips?: boolean;
  lipColor?: number;
}

export interface MouthResult {
  group: THREE.Group;
  joints: Record<string, Joint>;
  ikParams: IKParams[];
}

// ── Mouth Generator ──────────────────────────────────────────────────

export class MouthGenerator {
  private seed: number;
  private rng: SeededRandom;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
    this.rng = new SeededRandom(this.seed);
  }

  generate(type: string, size: number): THREE.Group;
  generate(config: Partial<MouthConfig>): THREE.Group;
  generate(typeOrConfig: string | Partial<MouthConfig>, size?: number): THREE.Group {
    const result = this.generateWithJoints(typeOrConfig, size);
    return result.group;
  }

  /**
   * Generate mouth with full joint and IK data for rigging.
   */
  generateWithJoints(typeOrConfig: string | Partial<MouthConfig>, size?: number): MouthResult {
    let config: MouthConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as MouthType,
        size: size ?? 0.1,
        color: typeOrConfig === 'beak' ? 0xFFD700 : 0x8B0000,
        teethColor: 0xffffee,
        openAmount: 0.2,
        jawWidth: size ? size * 0.5 : 0.05,
        jawDepth: size ? size * 0.3 : 0.03,
        jawLength: size ? size * 0.3 : 0.03,
        toothCount: 8,
        teethType: 'omnivore',
        tongueLength: size ? size * 0.4 : 0.04,
        hasLips: true,
        lipColor: 0xcc7777,
      };
    } else {
      config = {
        type: 'jaw',
        size: 0.1,
        color: 0x8B0000,
        teethColor: 0xffffee,
        openAmount: 0.2,
        jawWidth: 0.05,
        jawDepth: 0.03,
        jawLength: 0.03,
        toothCount: 8,
        teethType: 'omnivore',
        tongueLength: 0.04,
        hasLips: true,
        lipColor: 0xcc7777,
        ...typeOrConfig,
      };
    }

    const group = new THREE.Group();
    group.name = 'mouth';

    const joints: Record<string, Joint> = {};
    const ikParams: IKParams[] = [];

    switch (config.type) {
      case 'jaw':
        this.buildJaw(group, config, joints);
        break;
      case 'beak':
        this.buildBeak(group, config, joints);
        break;
      case 'mandible':
        this.buildMandible(group, config, joints);
        break;
      case 'snout':
        this.buildSnout(group, config, joints);
        break;
      case 'filter':
        this.buildFilterMouth(group, config, joints);
        break;
      case 'tube':
        this.buildTubeMouth(group, config, joints);
        break;
      default:
        this.buildJaw(group, config, joints);
    }

    // Jaw articulation joint at the hinge point
    joints['jaw_hinge'] = {
      name: 'jaw_hinge',
      position: new THREE.Vector3(0, -config.size * 0.05, -config.jawDepth! * 0.5),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(0, 0, 0),    // closed
        max: new THREE.Vector3(0, -0.8, 0), // open wide
      },
    };

    return { group, joints, ikParams };
  }

  /**
   * Jaw with teeth for mammals
   */
  private buildJaw(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color, teethColor, openAmount, jawWidth, jawDepth, jawLength, toothCount, teethType, tongueLength, hasLips, lipColor } = config;
    const w = jawWidth ?? size * 0.5;
    const d = jawDepth ?? size * 0.3;
    const open = openAmount ?? 0.2;
    const jl = jawLength ?? size * 0.3;

    const gumMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const teethMat = new THREE.MeshStandardMaterial({ color: teethColor ?? 0xffffee, roughness: 0.3 });

    // Upper jaw (fixed)
    const upperJawGeo = new THREE.BoxGeometry(w, size * 0.08, jl);
    const upperJaw = new THREE.Mesh(upperJawGeo, gumMat);
    upperJaw.position.y = open * size * 0.15;
    upperJaw.name = 'upperJaw';
    group.add(upperJaw);

    // Upper teeth (species-specific)
    this.buildUpperTeeth(group, config, teethMat);

    // Lower jaw (articulated - can rotate at hinge)
    const lowerJawGroup = new THREE.Group();
    lowerJawGroup.name = 'lowerJawGroup';

    const lowerJawGeo = new THREE.BoxGeometry(w, size * 0.06, jl);
    const lowerJaw = new THREE.Mesh(lowerJawGeo, gumMat);
    lowerJaw.position.y = -open * size * 0.15;
    lowerJaw.name = 'lowerJaw';
    lowerJawGroup.add(lowerJaw);

    // Lower teeth
    this.buildLowerTeeth(lowerJawGroup, config, teethMat);

    // Set pivot at the hinge point (back of the jaw)
    lowerJawGroup.position.set(0, 0, -d * 0.5);
    group.add(lowerJawGroup);

    // Tongue
    this.buildTongue(group, config);

    // Lips
    if (hasLips !== false) {
      this.buildLips(group, config);
    }

    // Joint for jaw animation
    joints['lowerJaw'] = {
      name: 'lowerJaw',
      position: new THREE.Vector3(0, -open * size * 0.15, -d * 0.5),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(0, 0, 0),
        max: new THREE.Vector3(0, -0.8, 0),
      },
    };
  }

  /**
   * Build upper teeth with species-specific shapes
   */
  private buildUpperTeeth(group: THREE.Group, config: MouthConfig, teethMat: THREE.MeshStandardMaterial): void {
    const { size, jawWidth, toothCount, teethType } = config;
    const w = jawWidth ?? size * 0.5;
    const tc = toothCount ?? 8;
    const tt = teethType ?? 'omnivore';
    const d = config.jawDepth ?? size * 0.3;
    const open = config.openAmount ?? 0.2;

    switch (tt) {
      case 'herbivore': {
        // Flat incisors for cutting, large flat molars for grinding
        const incisors = Math.max(2, Math.floor(tc * 0.25));
        // Incisors
        for (let i = 0; i < incisors; i++) {
          const x = ((i / (incisors - 1 || 1)) - 0.5) * w * 0.5;
          const toothGeo = new THREE.BoxGeometry(w * 0.12, size * 0.03, size * 0.04);
          const tooth = new THREE.Mesh(toothGeo, teethMat);
          tooth.position.set(x, open * size * 0.15 - size * 0.04, d * 0.4);
          tooth.name = `upperIncisor_${i}`;
          group.add(tooth);
        }
        // Molars (large, flat)
        const molars = Math.max(2, tc - incisors);
        for (let i = 0; i < molars; i++) {
          for (const side of [-1, 1]) {
            const toothGeo = new THREE.BoxGeometry(w * 0.12, size * 0.03, size * 0.08);
            const tooth = new THREE.Mesh(toothGeo, teethMat);
            const x = side * (w * 0.35 + i * w * 0.06);
            tooth.position.set(x, open * size * 0.15 - size * 0.03, d * 0.15);
            tooth.name = `upperMolar_${side}_${i}`;
            group.add(tooth);
          }
        }
        break;
      }
      case 'carnivore': {
        // Small incisors, large canines, sharp molars (carnassials)
        const incisors = Math.max(2, Math.floor(tc * 0.3));
        // Incisors
        for (let i = 0; i < incisors; i++) {
          const x = ((i / (incisors - 1 || 1)) - 0.5) * w * 0.5;
          const toothGeo = new THREE.BoxGeometry(w * 0.08, size * 0.035, size * 0.03);
          const tooth = new THREE.Mesh(toothGeo, teethMat);
          tooth.position.set(x, open * size * 0.15 - size * 0.035, d * 0.35);
          tooth.name = `upperIncisor_${i}`;
          group.add(tooth);
        }
        // Canines (large, pointed)
        for (const side of [-1, 1]) {
          const canineGeo = new THREE.ConeGeometry(w * 0.04, size * 0.08, 6);
          const canine = new THREE.Mesh(canineGeo, teethMat);
          canine.position.set(side * w * 0.3, open * size * 0.15 - size * 0.06, d * 0.3);
          canine.name = `upperCanine_${side}`;
          group.add(canine);
        }
        // Carnassials (blade-like)
        for (const side of [-1, 1]) {
          const carnassialGeo = new THREE.BoxGeometry(w * 0.06, size * 0.03, size * 0.06);
          const carnassial = new THREE.Mesh(carnassialGeo, teethMat);
          carnassial.position.set(side * (w * 0.42), open * size * 0.15 - size * 0.03, d * 0.18);
          carnassial.name = `carnassial_${side}`;
          group.add(carnassial);
        }
        break;
      }
      case 'omnivore':
      default: {
        // Mix of incisors, canines, molars (original behavior)
        const incisors = Math.floor(tc * 0.3);
        const canines = 2;
        // Incisors (front)
        for (let i = 0; i < incisors; i++) {
          const toothGeo = new THREE.BoxGeometry(w * 0.12, size * 0.04, size * 0.03);
          const tooth = new THREE.Mesh(toothGeo, teethMat);
          const x = (i / (incisors - 1 || 1) - 0.5) * w * 0.6;
          tooth.position.set(x, open * size * 0.15 - size * 0.04, d * 0.4);
          tooth.name = `upperIncisor_${i}`;
          group.add(tooth);
        }
        // Canines
        for (const side of [-1, 1]) {
          const toothGeo = new THREE.ConeGeometry(w * 0.04, size * 0.06, 6);
          const tooth = new THREE.Mesh(toothGeo, teethMat);
          tooth.position.set(side * w * 0.35, open * size * 0.15 - size * 0.05, d * 0.35);
          tooth.name = `upperCanine_${side}`;
          group.add(tooth);
        }
        // Molars (back)
        const molars = tc - incisors - canines;
        for (let i = 0; i < molars; i++) {
          for (const side of [-1, 1]) {
            const toothGeo = new THREE.BoxGeometry(w * 0.1, size * 0.03, size * 0.06);
            const tooth = new THREE.Mesh(toothGeo, teethMat);
            const x = side * (w * 0.4 + i * w * 0.08);
            tooth.position.set(x, open * size * 0.15 - size * 0.03, d * 0.2);
            tooth.name = `upperMolar_${side}_${i}`;
            group.add(tooth);
          }
        }
        break;
      }
    }
  }

  /**
   * Build lower teeth (simpler than upper)
   */
  private buildLowerTeeth(group: THREE.Group, config: MouthConfig, teethMat: THREE.MeshStandardMaterial): void {
    const { size, jawWidth, toothCount } = config;
    const w = jawWidth ?? size * 0.5;
    const tc = toothCount ?? 8;
    const open = config.openAmount ?? 0.2;

    for (let i = 0; i < tc; i++) {
      const x = ((i / (tc - 1 || 1)) - 0.5) * w * 0.8;
      const toothGeo = new THREE.BoxGeometry(w * 0.08, size * 0.03, size * 0.025);
      const tooth = new THREE.Mesh(toothGeo, teethMat);
      tooth.position.set(x, open * size * 0.15 + size * 0.03, (config.jawDepth ?? size * 0.3) * 0.35);
      tooth.name = `lowerTooth_${i}`;
      group.add(tooth);
    }
  }

  /**
   * Build tongue geometry
   */
  private buildTongue(group: THREE.Group, config: MouthConfig): void {
    const { size, jawWidth, tongueLength } = config;
    const w = jawWidth ?? size * 0.5;
    const tl = tongueLength ?? size * 0.4;
    const d = config.jawDepth ?? size * 0.3;

    // Main tongue body
    const tongueShape = new THREE.Shape();
    tongueShape.moveTo(0, 0);
    tongueShape.bezierCurveTo(-w * 0.15, tl * 0.3, -w * 0.08, tl * 0.8, 0, tl);
    tongueShape.bezierCurveTo(w * 0.08, tl * 0.8, w * 0.15, tl * 0.3, 0, 0);

    const tongueGeo = new THREE.ExtrudeGeometry(tongueShape, {
      depth: size * 0.015,
      bevelEnabled: true,
      bevelThickness: size * 0.005,
      bevelSize: size * 0.005,
      bevelSegments: 2,
    });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xcc4444, roughness: 0.8 });
    const tongue = new THREE.Mesh(tongueGeo, tongueMat);
    tongue.position.set(0, -size * 0.01, d * 0.1);
    tongue.rotation.x = Math.PI / 2;
    tongue.name = 'tongue';
    group.add(tongue);

    // Tongue midline groove
    const grooveGeo = new THREE.BoxGeometry(w * 0.03, size * 0.003, tl * 0.6);
    const grooveMat = new THREE.MeshStandardMaterial({ color: 0xaa3333, roughness: 0.9 });
    const groove = new THREE.Mesh(grooveGeo, grooveMat);
    groove.position.set(0, size * 0.012, d * 0.2);
    groove.name = 'tongueGroove';
    group.add(groove);
  }

  /**
   * Build lip geometry that wraps around teeth
   */
  private buildLips(group: THREE.Group, config: MouthConfig): void {
    const { size, jawWidth, lipColor } = config;
    const w = jawWidth ?? size * 0.5;
    const d = config.jawDepth ?? size * 0.3;
    const open = config.openAmount ?? 0.2;
    const color = lipColor ?? new THREE.Color(config.color).offsetHSL(0, 0, 0.1).getHex();

    const lipMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

    // Upper lip
    const lipGeo = new THREE.TorusGeometry(w * 0.35, size * 0.015, 6, 12, Math.PI);
    const upperLip = new THREE.Mesh(lipGeo, lipMat);
    upperLip.position.set(0, open * size * 0.15, d * 0.35);
    upperLip.rotation.x = Math.PI;
    upperLip.name = 'upperLip';
    group.add(upperLip);

    // Lower lip
    const lowerLip = new THREE.Mesh(lipGeo.clone(), lipMat);
    lowerLip.position.set(0, -open * size * 0.15, d * 0.35);
    lowerLip.name = 'lowerLip';
    group.add(lowerLip);
  }

  /**
   * Beak for birds
   */
  private buildBeak(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color, jawWidth, jawDepth, openAmount } = config;
    const w = jawWidth ?? size * 0.3;
    const d = jawDepth ?? size * 0.4;
    const open = openAmount ?? 0.15;

    const beakMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

    // Upper beak (mandible) - curved, tapered
    const upperBeakShape = new THREE.Shape();
    upperBeakShape.moveTo(-w / 2, 0);
    upperBeakShape.bezierCurveTo(-w / 2, d * 0.3, -w * 0.1, d * 0.5, 0, d);
    upperBeakShape.bezierCurveTo(w * 0.1, d * 0.5, w / 2, d * 0.3, w / 2, 0);
    upperBeakShape.lineTo(-w / 2, 0);

    const upperBeakGeo = new THREE.ExtrudeGeometry(upperBeakShape, {
      depth: size * 0.08,
      bevelEnabled: true,
      bevelThickness: size * 0.02,
      bevelSize: size * 0.01,
      bevelSegments: 2,
    });
    const upperBeak = new THREE.Mesh(upperBeakGeo, beakMat);
    upperBeak.position.y = open * size * 0.1;
    upperBeak.rotation.x = Math.PI / 2;
    upperBeak.name = 'upperBeak';
    group.add(upperBeak);

    // Lower beak (mandible) - smaller, thinner
    const lowerBeakShape = new THREE.Shape();
    lowerBeakShape.moveTo(-w * 0.35, 0);
    lowerBeakShape.bezierCurveTo(-w * 0.35, d * 0.2, -w * 0.05, d * 0.35, 0, d * 0.8);
    lowerBeakShape.bezierCurveTo(w * 0.05, d * 0.35, w * 0.35, d * 0.2, w * 0.35, 0);
    lowerBeakShape.lineTo(-w * 0.35, 0);

    const lowerBeakGeo = new THREE.ExtrudeGeometry(lowerBeakShape, {
      depth: size * 0.04,
      bevelEnabled: true,
      bevelThickness: size * 0.01,
      bevelSize: size * 0.005,
      bevelSegments: 2,
    });
    const lowerBeakGroup = new THREE.Group();
    lowerBeakGroup.name = 'lowerBeakGroup';
    const lowerBeak = new THREE.Mesh(lowerBeakGeo, beakMat);
    lowerBeak.position.y = -open * size * 0.1;
    lowerBeak.rotation.x = Math.PI / 2;
    lowerBeak.name = 'lowerBeak';
    lowerBeakGroup.add(lowerBeak);
    group.add(lowerBeakGroup);

    // Nostril (cere)
    const cereMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).offsetHSL(0.05, 0, 0.2),
      roughness: 0.6,
    });
    const cereGeo = new THREE.SphereGeometry(w * 0.15, 6, 4);
    for (const side of [-1, 1]) {
      const cere = new THREE.Mesh(cereGeo, cereMat);
      cere.position.set(side * w * 0.2, size * 0.05, size * 0.02);
      cere.name = `cere_${side}`;
      group.add(cere);
    }

    // Hook tip for raptors
    const hookMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).offsetHSL(0, 0, -0.15),
      roughness: 0.3,
    });
    const hookGeo = new THREE.ConeGeometry(size * 0.02, size * 0.04, 6);
    const hook = new THREE.Mesh(hookGeo, hookMat);
    hook.position.set(0, size * 0.03, d * 0.95);
    hook.rotation.x = 0.3;
    hook.name = 'hook';
    group.add(hook);

    // Jaw joint for beak open/close
    joints['lowerBeak'] = {
      name: 'lowerBeak',
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(0, 0, 0),
        max: new THREE.Vector3(0, -0.5, 0),
      },
    };
  }

  /**
   * Mandibles for insects (pincer-like)
   */
  private buildMandible(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color } = config;
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 });

    // Labrum (upper lip)
    const labrumGeo = new THREE.BoxGeometry(size * 0.3, size * 0.05, size * 0.1);
    const labrum = new THREE.Mesh(labrumGeo, mat);
    labrum.position.y = size * 0.05;
    labrum.name = 'labrum';
    group.add(labrum);

    // Two mandibles (pincers)
    for (const side of [-1, 1]) {
      const sideName = side === -1 ? 'L' : 'R';
      const mandibleGroup = new THREE.Group();
      mandibleGroup.name = `mandible_${sideName}`;

      // Mandible base
      const baseGeo = new THREE.CylinderGeometry(size * 0.04, size * 0.05, size * 0.08, 6);
      const base = new THREE.Mesh(baseGeo, mat);
      base.name = 'mandibleBase';
      mandibleGroup.add(base);

      // Mandible blade (curved pincer)
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, 0);
      bladeShape.bezierCurveTo(side * size * 0.05, size * 0.1, side * size * 0.03, size * 0.2, 0, size * 0.25);
      bladeShape.lineTo(-side * size * 0.01, size * 0.2);
      bladeShape.lineTo(0, 0);

      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
        depth: size * 0.03,
        bevelEnabled: false,
      });
      const blade = new THREE.Mesh(bladeGeo, mat);
      blade.name = 'mandibleBlade';
      mandibleGroup.add(blade);

      // Teeth on inner edge of mandible
      const teethMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
      for (let t = 0; t < 3; t++) {
        const toothGeo = new THREE.ConeGeometry(size * 0.008, size * 0.02, 4);
        const tooth = new THREE.Mesh(toothGeo, teethMat);
        tooth.position.set(-side * size * 0.005, size * 0.08 + t * size * 0.05, size * 0.02);
        tooth.rotation.z = side * 0.5;
        tooth.name = `mandibleTooth_${t}`;
        mandibleGroup.add(tooth);
      }

      mandibleGroup.position.set(side * size * 0.12, -size * 0.02, size * 0.05);
      mandibleGroup.rotation.y = side * 0.2;
      group.add(mandibleGroup);

      // Joint for mandible animation
      joints[`mandible_${sideName}`] = {
        name: `mandible_${sideName}`,
        position: mandibleGroup.position.clone(),
        rotation: new THREE.Euler(0, side * 0.2, 0),
        bounds: {
          min: new THREE.Vector3(0, -0.3, 0),
          max: new THREE.Vector3(0, 0.3, 0),
        },
      };
    }

    // Maxillae (inner mouthparts)
    const maxillaMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const maxillaGeo = new THREE.CylinderGeometry(size * 0.01, size * 0.02, size * 0.12, 4);
      const maxilla = new THREE.Mesh(maxillaGeo, maxillaMat);
      maxilla.position.set(side * size * 0.06, -size * 0.04, size * 0.03);
      maxilla.rotation.z = side * 0.4;
      maxilla.rotation.x = 0.3;
      maxilla.name = `maxilla_${side}`;
      group.add(maxilla);
    }

    // Labium (lower lip)
    const labiumGeo = new THREE.BoxGeometry(size * 0.25, size * 0.03, size * 0.08);
    const labium = new THREE.Mesh(labiumGeo, mat);
    labium.position.y = -size * 0.06;
    labium.name = 'labium';
    group.add(labium);
  }

  /**
   * Snout (pig, dog, etc.)
   */
  private buildSnout(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color } = config;
    const skinColor = new THREE.Color(color).offsetHSL(0, -0.1, 0.15);
    const snoutMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });

    // Snout cylinder
    const snoutGeo = new THREE.CylinderGeometry(size * 0.15, size * 0.2, size * 0.3, 8);
    const snout = new THREE.Mesh(snoutGeo, snoutMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.z = size * 0.15;
    snout.name = 'snout';
    group.add(snout);

    // Nostrils
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const nostrilGeo = new THREE.CircleGeometry(size * 0.04, 8);
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * size * 0.06, size * 0.02, size * 0.3);
      nostril.name = `nostril_${side}`;
      group.add(nostril);
    }

    // Mouth opening
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x660000, roughness: 0.8 });
    const mouthGeo = new THREE.BoxGeometry(size * 0.2, size * 0.03, size * 0.05);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -size * 0.05, size * 0.25);
    mouth.name = 'mouthOpening';
    group.add(mouth);

    joints['snout'] = {
      name: 'snout',
      position: new THREE.Vector3(0, 0, size * 0.15),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.1, -0.2, -0.1),
        max: new THREE.Vector3(0.1, 0.2, 0.1),
      },
    };
  }

  /**
   * Filter mouth (flamingo, baleen whale)
   */
  private buildFilterMouth(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color, jawWidth } = config;
    const w = jawWidth ?? size * 0.4;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

    // Upper jaw
    const upperGeo = new THREE.BoxGeometry(w, size * 0.05, size * 0.3);
    const upper = new THREE.Mesh(upperGeo, mat);
    upper.position.y = size * 0.03;
    upper.name = 'upperJaw';
    group.add(upper);

    // Lower jaw
    const lowerGeo = new THREE.BoxGeometry(w, size * 0.04, size * 0.3);
    const lower = new THREE.Mesh(lowerGeo, mat);
    lower.position.y = -size * 0.03;
    lower.name = 'lowerJaw';
    group.add(lower);

    // Baleen/filter plates
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xccaa88, roughness: 0.7, side: THREE.DoubleSide,
    });
    const plateCount = 10;
    for (let i = 0; i < plateCount; i++) {
      const t = i / plateCount;
      const plateGeo = new THREE.PlaneGeometry(w * 0.08, size * 0.15, 1, 2);
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set((t - 0.5) * w * 0.9, 0, size * 0.05);
      plate.rotation.y = (t - 0.5) * 0.1;
      plate.name = `filterPlate_${i}`;
      group.add(plate);
    }

    joints['filterJaw'] = {
      name: 'filterJaw',
      position: new THREE.Vector3(0, -size * 0.03, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(0, 0, 0),
        max: new THREE.Vector3(0, -0.6, 0),
      },
    };
  }

  /**
   * Tube mouth (butterfly proboscis, hummingbird)
   */
  private buildTubeMouth(group: THREE.Group, config: MouthConfig, joints: Record<string, Joint>): void {
    const { size, color } = config;
    const tubeRadius = size * 0.03;

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

    // Coiled tube (proboscis)
    const curve = new THREE.CatmullRomCurve3([]);
    const coilTurns = 3;
    const coilPoints = 40;
    for (let i = 0; i < coilPoints; i++) {
      const t = i / coilPoints;
      const angle = t * coilTurns * Math.PI * 2;
      const r = size * 0.15 * (1 - t * 0.3);
      curve.points.push(new THREE.Vector3(
        Math.cos(angle) * r,
        -t * size * 0.3,
        Math.sin(angle) * r
      ));
    }

    const tubeGeo = new THREE.TubeGeometry(curve, coilPoints, tubeRadius, 6, false);
    const tube = new THREE.Mesh(tubeGeo, mat);
    tube.name = 'proboscis';
    group.add(tube);

    // Base (labial palps)
    const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, -0.1), roughness: 0.5 });
    for (const side of [-1, 1]) {
      const palpGeo = new THREE.CapsuleGeometry(tubeRadius * 2, size * 0.1, 4, 6);
      const palp = new THREE.Mesh(palpGeo, baseMat);
      palp.position.set(side * size * 0.05, 0, 0);
      palp.rotation.z = side * 0.4;
      palp.name = `palp_${side}`;
      group.add(palp);
    }

    joints['proboscis'] = {
      name: 'proboscis',
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.5, -0.5),
        max: new THREE.Vector3(0.5, 0.5, 0.5),
      },
    };
  }
}

export const BeakGenerator = MouthGenerator;
