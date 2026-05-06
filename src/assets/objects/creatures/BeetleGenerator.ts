/**
 * BeetleGenerator — Procedural beetle generation with elytra, mandibles,
 * and glossy chitin material.
 *
 * @module creatures
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, Color, LatheGeometry, Vector2, ShapeGeometry, Shape } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { SeededRandom } from '@/core/util/MathUtils';

export interface BeetleParams extends CreatureParams {
  elytraColor: string;
  mandibleSize: number; // 0-1
  glossiness: number; // 0-1
  hornType: 'none' | 'rhinoceros' | 'stag' | 'hercules';
}

export class BeetleGenerator extends CreatureBase {
  private _rng: SeededRandom;
  private _params: BeetleParams | null = null;

  constructor(params: Partial<BeetleParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INSECT });
    this._rng = new SeededRandom(params.seed ?? 42);
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

  generate(params: Partial<BeetleParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };
    const s = this._params.size;

    const group = new Group();
    group.name = `Beetle_${this._params.hornType}`;

    // Body through the abstract chain
    const body = this.generateBodyCore();
    if (body) group.add(body);
    const head = this.generateHead();
    if (head) group.add(head);
    this.generateLimbs().forEach(l => { if (l) group.add(l); });
    this.generateAppendages().forEach(a => { if (a) group.add(a); });

    return group;
  }

  generateBodyCore(): Object3D {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;

    // Prothorax (front segment)
    const thoraxMat = new MeshStandardMaterial({
      color: params.elytraColor,
      roughness: 1 - params.glossiness,
      metalness: 0.2,
    });
    const prothorax = new Mesh(this.createEllipsoidGeometry(s * 0.06, s * 0.04, s * 0.06), thoraxMat);
    prothorax.position.z = s * 0.08;
    prothorax.name = 'prothorax';

    // Elytra (wing cases) — two halves covering the abdomen
    const elytraGroup = new Group();
    elytraGroup.name = 'elytra';

    const elytraMat = new MeshStandardMaterial({
      color: params.elytraColor,
      roughness: 1 - params.glossiness,
      metalness: 0.3,
    });

    for (const side of [-1, 1]) {
      // Elytra half: elongated dome shape
      const profile: Vector2[] = [];
      const segments = 12;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * s * 0.2;
        const y = Math.sin(t * Math.PI) * s * 0.04 * (1 - t * 0.3);
        profile.push(new Vector2(x, y));
      }
      const elytraGeo = new LatheGeometry(profile, 8, 0, Math.PI);
      elytraGeo.scale(1, 1, side);
      const elytra = new Mesh(elytraGeo, elytraMat);
      elytra.position.set(side * s * 0.03, s * 0.01, -s * 0.02);
      elytra.rotation.y = side * Math.PI * 0.5;
      elytra.rotation.x = Math.PI * 0.5;
      elytra.name = side === -1 ? 'leftElytra' : 'rightElytra';
      elytraGroup.add(elytra);
    }

    // Abdomen underneath elytra
    const abdomenMat = new MeshStandardMaterial({ color: '#3D2B1F', roughness: 0.8 });
    const abdomen = new Mesh(this.createEllipsoidGeometry(s * 0.05, s * 0.035, s * 0.1), abdomenMat);
    abdomen.position.z = -s * 0.06;
    abdomen.name = 'abdomen';

    const bodyGroup = new Group();
    bodyGroup.add(prothorax);
    bodyGroup.add(elytraGroup);
    bodyGroup.add(abdomen);
    return bodyGroup;
  }

  generateHead(): Object3D {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;

    const group = new Group();
    group.name = 'headGroup';

    // Head
    const headMat = new MeshStandardMaterial({
      color: params.elytraColor,
      roughness: 1 - params.glossiness * 0.8,
      metalness: 0.15,
    });
    const head = new Mesh(this.createEllipsoidGeometry(s * 0.04, s * 0.03, s * 0.04), headMat);
    head.position.z = s * 0.14;
    head.name = 'head';
    group.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      const eye = new Mesh(this.createSphereGeometry(s * 0.012), eyeMat);
      eye.position.set(side * s * 0.035, s * 0.015, s * 0.15);
      group.add(eye);
    }

    // Antennae
    const antennaMat = new MeshStandardMaterial({ color: '#3D2B1F' });
    for (const side of [-1, 1]) {
      const antennaGroup = new Group();
      for (let seg = 0; seg < 6; seg++) {
        const segLen = s * 0.015 * (1 - seg * 0.1);
        const segGeo = this.createCylinderGeometry(segLen, segLen * 0.7, s * 0.02);
        const segMesh = new Mesh(segGeo, antennaMat);
        segMesh.position.z = seg * s * 0.015;
        segMesh.rotation.x = -0.2;
        antennaGroup.add(segMesh);
      }
      antennaGroup.position.set(side * s * 0.025, s * 0.03, s * 0.16);
      antennaGroup.rotation.x = -0.3;
      antennaGroup.rotation.z = side * 0.2;
      group.add(antennaGroup);
    }

    // Mandibles
    const mandibleMat = new MeshStandardMaterial({ color: '#4A3520', roughness: 0.6 });
    for (const side of [-1, 1]) {
      const mandibleSize = params.mandibleSize;
      const mandibleGeo = this.createConeGeometry(s * 0.015 * mandibleSize, s * 0.06 * mandibleSize, 4);
      const mandible = new Mesh(mandibleGeo, mandibleMat);
      mandible.rotation.z = side * 0.4;
      mandible.rotation.x = 0.3;
      mandible.position.set(side * s * 0.02, -s * 0.01, s * 0.18);
      group.add(mandible);
    }

    // Horn (species-specific)
    if (params.hornType !== 'none') {
      const hornMat = new MeshStandardMaterial({
        color: params.elytraColor,
        roughness: 1 - params.glossiness,
        metalness: 0.2,
      });

      switch (params.hornType) {
        case 'rhinoceros': {
          // Single forward-pointing horn
          const hornGeo = this.createConeGeometry(s * 0.015, s * 0.08, 8);
          const horn = new Mesh(hornGeo, hornMat);
          horn.rotation.x = -Math.PI * 0.4;
          horn.position.set(0, s * 0.04, s * 0.16);
          horn.name = 'horn';
          group.add(horn);
          break;
        }
        case 'stag': {
          // Two curved mandible-like horns
          for (const side of [-1, 1]) {
            const hornGeo = this.createConeGeometry(s * 0.012, s * 0.1, 6);
            const horn = new Mesh(hornGeo, hornMat);
            horn.rotation.z = side * 0.6;
            horn.rotation.x = -0.3;
            horn.position.set(side * s * 0.03, s * 0.035, s * 0.16);
            horn.name = side === -1 ? 'leftHorn' : 'rightHorn';
            group.add(horn);
          }
          break;
        }
        case 'hercules': {
          // Long single horn extending from prothorax
          const hornGeo = this.createConeGeometry(s * 0.01, s * 0.15, 8);
          const horn = new Mesh(hornGeo, hornMat);
          horn.rotation.x = -Math.PI * 0.35;
          horn.position.set(0, s * 0.04, s * 0.12);
          horn.name = 'herculesHorn';
          group.add(horn);
          break;
        }
      }
    }

    return group;
  }

  generateLimbs(): Object3D[] {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: '#3D2B1F', roughness: 0.7 });
    const limbs: Object3D[] = [];

    // 6 legs (3 pairs)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;

        const z = s * 0.1 - i * s * 0.06;
        // Femur
        const femurGeo = this.createCylinderGeometry(s * 0.008, s * 0.006, s * 0.05);
        const femur = new Mesh(femurGeo, legMat);
        femur.rotation.z = side * -0.7;
        femur.position.set(side * s * 0.07, -s * 0.02, z);
        legGroup.add(femur);

        // Tibia
        const tibiaGeo = this.createCylinderGeometry(s * 0.006, s * 0.003, s * 0.05);
        const tibia = new Mesh(tibiaGeo, legMat);
        tibia.rotation.z = side * 0.3;
        tibia.position.set(side * s * 0.1, -s * 0.05, z);
        legGroup.add(tibia);

        // Tarsus (foot)
        const tarsusGeo = this.createCylinderGeometry(s * 0.003, s * 0.002, s * 0.02);
        const tarsus = new Mesh(tarsusGeo, legMat);
        tarsus.position.set(side * s * 0.11, -s * 0.07, z);
        legGroup.add(tarsus);

        limbs.push(legGroup);
      }
    }

    return limbs;
  }

  generateAppendages(): Object3D[] {
    // Beetles have no major appendages beyond legs and mandibles (already in head)
    return [];
  }

  applySkin(materials: Material[]): Material[] {
    const params = this._params ?? this.getDefaultConfig();
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        // Chitin is glossy
        mat.roughness = Math.min(mat.roughness, 1 - params.glossiness * 0.5);
        mat.metalness = Math.max(mat.metalness, 0.1);
      }
    }
    return materials;
  }
}
