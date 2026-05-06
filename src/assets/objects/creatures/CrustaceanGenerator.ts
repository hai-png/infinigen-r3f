/**
 * CrustaceanGenerator — Procedural crustacean generation (crab, lobster, shrimp)
 *
 * Extends the UnderwaterGenerator crab code into a standalone generator
 * for crustacean creatures. Based on the CreatureBase abstract method chain.
 *
 * Features:
 * - Crab: wide flat body, eye stalks, 8 walking legs, 2 claws
 * - Lobster: elongated body, tail fan, 10 legs, 2 large claws
 * - Shrimp: slender curved body, long antennae, 10 swimmerets, tail fan
 *
 * @module creatures
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, DoubleSide } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { SeededRandom } from '@/core/util/MathUtils';

export type CrustaceanSpecies = 'crab' | 'lobster' | 'shrimp';

export interface CrustaceanParams extends CreatureParams {
  species: CrustaceanSpecies;
  hasShell: boolean;
  shellColor: string;
  legCount: number;
  clawSize: number; // 0-1 relative to body
  antennaLength: number;
  tailFanSize: number; // 0 for crab, >0 for lobster/shrimp
}

export class CrustaceanGenerator extends CreatureBase {
  private _rng: SeededRandom;
  private _currentSpecies: CrustaceanSpecies = 'crab';
  private _currentParams: CrustaceanParams | null = null;

  constructor(params: Partial<CrustaceanParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INVERTEBRATE });
    this._rng = new SeededRandom(params.seed ?? 42);
  }

  getDefaultConfig(): CrustaceanParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      species: 'crab',
      hasShell: true,
      shellColor: '#FF6347',
      legCount: 8,
      clawSize: 0.6,
      antennaLength: 0.3,
      tailFanSize: 0,
    } as CrustaceanParams;
  }

  generate(species: CrustaceanSpecies = 'crab', params: Partial<CrustaceanParams> = {}): Group {
    const defaults = this.getDefaultConfig();
    const parameters = this.mergeParameters(defaults, params) as CrustaceanParams;

    // Apply species defaults
    this._currentSpecies = species;
    this._currentParams = parameters;
    this.applySpeciesDefaults(species, parameters);

    const group = new Group();
    group.name = `Crustacean_${species}`;

    // Assemble through the chain
    const body = this.generateBodyCore();
    if (body) group.add(body);
    const head = this.generateHead();
    if (head) group.add(head);
    this.generateLimbs().forEach(l => { if (l) group.add(l); });
    this.generateAppendages().forEach(a => { if (a) group.add(a); });

    // Apply skin
    const baseMaterials = this.collectMaterialsFromGroup(group);
    const skinned = this.applySkin(baseMaterials);
    this.applySkinnedMaterialsToGroup(group, skinned, baseMaterials);

    return group;
  }

  generateBodyCore(): Object3D {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;

    switch (this._currentSpecies) {
      case 'crab': {
        const mat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.7 });
        const body = new Mesh(this.createEllipsoidGeometry(s * 0.2, s * 0.06, s * 0.18), mat);
        body.name = 'body';

        // Top shell dome
        const shellMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.6, metalness: 0.1 });
        const shell = new Mesh(this.createShellGeometry(s * 0.18, s * 0.06), shellMat);
        shell.position.y = s * 0.02;
        shell.name = 'shell';

        const bodyGroup = new Group();
        bodyGroup.add(body);
        bodyGroup.add(shell);
        return bodyGroup;
      }
      case 'lobster': {
        const mat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.6 });
        // Cephalothorax
        const cephalothorax = new Mesh(this.createEllipsoidGeometry(s * 0.12, s * 0.08, s * 0.18), mat);
        cephalothorax.name = 'cephalothorax';

        // Abdomen (tail segments)
        const abdomenGroup = new Group();
        abdomenGroup.name = 'abdomen';
        for (let i = 0; i < 6; i++) {
          const segRadius = s * 0.1 * (1 - i * 0.08);
          const segGeo = this.createEllipsoidGeometry(segRadius, s * 0.06, segRadius);
          const seg = new Mesh(segGeo, mat);
          seg.position.z = -s * 0.12 - i * s * 0.08;
          seg.position.y = -s * 0.01;
          abdomenGroup.add(seg);
        }

        // Tail fan
        const fanMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.5, side: DoubleSide });
        const tailFan = new Mesh(this.createFinGeometry(s * 0.2, s * 0.05, s * 0.15), fanMat);
        tailFan.position.z = -s * 0.6;
        tailFan.rotation.x = Math.PI * 0.1;
        tailFan.name = 'tailFan';
        abdomenGroup.add(tailFan);

        const bodyGroup = new Group();
        bodyGroup.add(cephalothorax);
        bodyGroup.add(abdomenGroup);
        return bodyGroup;
      }
      case 'shrimp': {
        const mat = new MeshStandardMaterial({
          color: params.shellColor, roughness: 0.5, transparent: true, opacity: 0.85,
        });
        // Slender curved body
        const bodyGroup = new Group();
        bodyGroup.name = 'body';

        for (let i = 0; i < 8; i++) {
          const t = i / 7;
          const segRadius = s * 0.04 * (1 - t * 0.3);
          const segGeo = this.createEllipsoidGeometry(segRadius, segRadius * 0.8, segRadius * 1.2);
          const seg = new Mesh(segGeo, mat);
          seg.position.z = -s * 0.05 - i * s * 0.06;
          seg.position.y = -t * s * 0.1; // Curved downward
          bodyGroup.add(seg);
        }

        // Tail fan
        const fanMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.4, side: DoubleSide });
        const tailFan = new Mesh(this.createFinGeometry(s * 0.08, s * 0.03, s * 0.1), fanMat);
        tailFan.position.z = -s * 0.5;
        tailFan.position.y = -s * 0.1;
        tailFan.rotation.x = Math.PI * 0.15;
        tailFan.name = 'tailFan';
        bodyGroup.add(tailFan);

        return bodyGroup;
      }
    }
  }

  generateHead(): Object3D {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;
    const group = new Group();
    group.name = 'headGroup';

    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const stalkMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.5 });

    switch (this._currentSpecies) {
      case 'crab': {
        // Eye stalks
        for (const side of [-1, 1]) {
          const stalkGeo = this.createCylinderGeometry(s * 0.01, s * 0.01, s * 0.08);
          const stalk = new Mesh(stalkGeo, stalkMat);
          stalk.position.set(side * s * 0.08, s * 0.08, s * 0.12);
          group.add(stalk);
          const eyeGeo = this.createSphereGeometry(s * 0.02);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.08, s * 0.12, s * 0.12);
          group.add(eye);
        }
        break;
      }
      case 'lobster': {
        // Eyes on short stalks
        for (const side of [-1, 1]) {
          const stalkGeo = this.createCylinderGeometry(s * 0.008, s * 0.008, s * 0.04);
          const stalk = new Mesh(stalkGeo, stalkMat);
          stalk.position.set(side * s * 0.08, s * 0.06, s * 0.15);
          group.add(stalk);
          const eyeGeo = this.createSphereGeometry(s * 0.015);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.08, s * 0.08, s * 0.15);
          group.add(eye);
        }
        // Long antennae
        const antennaMat = new MeshStandardMaterial({ color: 0x6B4226 });
        for (const side of [-1, 1]) {
          const antennaGeo = this.createCylinderGeometry(s * 0.005, s * 0.002, s * 0.4);
          const antenna = new Mesh(antennaGeo, antennaMat);
          antenna.rotation.z = side * 0.3;
          antenna.rotation.x = -0.8;
          antenna.position.set(side * s * 0.06, s * 0.05, s * 0.18);
          group.add(antenna);
        }
        break;
      }
      case 'shrimp': {
        // Eyes
        for (const side of [-1, 1]) {
          const eyeGeo = this.createSphereGeometry(s * 0.015);
          const eye = new Mesh(eyeGeo, eyeMat);
          eye.position.set(side * s * 0.04, s * 0.02, s * 0.08);
          group.add(eye);
        }
        // Very long antennae
        const antennaMat = new MeshStandardMaterial({ color: 0x8B7355 });
        for (const side of [-1, 1]) {
          const antennaGeo = this.createCylinderGeometry(s * 0.003, s * 0.001, s * params.antennaLength);
          const antenna = new Mesh(antennaGeo, antennaMat);
          antenna.rotation.z = side * 0.2;
          antenna.rotation.x = -0.9;
          antenna.position.set(side * s * 0.03, s * 0.02, s * 0.1);
          group.add(antenna);
        }
        break;
      }
    }
    return group;
  }

  generateLimbs(): Object3D[] {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.8 });
    const limbs: Object3D[] = [];

    switch (this._currentSpecies) {
      case 'crab': {
        // 8 walking legs (4 per side)
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const z = s * 0.1 - i * s * 0.07;
            const legGroup = new Group();
            legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;
            const upperGeo = this.createCylinderGeometry(s * 0.012, s * 0.01, s * 0.1);
            const upper = new Mesh(upperGeo, legMat);
            upper.rotation.z = side * -0.6;
            upper.position.set(side * s * 0.15, -s * 0.02, z);
            legGroup.add(upper);
            const lowerGeo = this.createCylinderGeometry(s * 0.01, s * 0.005, s * 0.1);
            const lower = new Mesh(lowerGeo, legMat);
            lower.position.set(side * s * 0.22, -s * 0.08, z);
            legGroup.add(lower);
            limbs.push(legGroup);
          }
        }
        break;
      }
      case 'lobster': {
        // 10 legs (5 per side): 4 pairs walking + 1 pair small claws
        for (const side of [-1, 1]) {
          for (let i = 0; i < 5; i++) {
            const z = s * 0.08 - i * s * 0.06;
            const legGroup = new Group();
            legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;
            const segLen = s * 0.08;
            const segRad = s * 0.01 * (1 - i * 0.1);
            const upperGeo = this.createCylinderGeometry(segRad, segRad * 0.8, segLen);
            const upper = new Mesh(upperGeo, legMat);
            upper.rotation.z = side * -0.5;
            upper.position.set(side * s * 0.12, -s * 0.02, z);
            legGroup.add(upper);
            const lowerGeo = this.createCylinderGeometry(segRad * 0.8, segRad * 0.4, segLen);
            const lower = new Mesh(lowerGeo, legMat);
            lower.position.set(side * s * 0.18, -s * 0.06, z);
            legGroup.add(lower);
            limbs.push(legGroup);
          }
        }
        // Swimmerets under the tail
        for (let i = 0; i < 5; i++) {
          for (const side of [-1, 1]) {
            const swimmeretGeo = this.createBoxGeometry(s * 0.02, s * 0.01, s * 0.03);
            const swimmeret = new Mesh(swimmeretGeo, legMat);
            swimmeret.position.set(side * s * 0.06, -s * 0.06, -s * 0.15 - i * s * 0.08);
            swimmeret.rotation.z = side * 0.3;
            limbs.push(swimmeret);
          }
        }
        break;
      }
      case 'shrimp': {
        // 10 legs (5 pairs of swimmerets)
        for (let i = 0; i < 5; i++) {
          for (const side of [-1, 1]) {
            const legGroup = new Group();
            legGroup.name = `swimmeret_${side === -1 ? 'L' : 'R'}${i}`;
            const segGeo = this.createCylinderGeometry(s * 0.005, s * 0.003, s * 0.06);
            const seg = new Mesh(segGeo, legMat);
            seg.rotation.z = side * -0.4;
            seg.position.set(side * s * 0.05, -s * 0.03, -s * 0.05 - i * s * 0.06);
            legGroup.add(seg);
            limbs.push(legGroup);
          }
        }
        break;
      }
    }
    return limbs;
  }

  generateAppendages(): Object3D[] {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.8 });
    const appendages: Object3D[] = [];

    switch (this._currentSpecies) {
      case 'crab': {
        // 2 claws (chelipeds)
        for (const side of [-1, 1]) {
          const clawGroup = new Group();
          clawGroup.name = side === -1 ? 'leftClaw' : 'rightClaw';
          const armGeo = this.createCylinderGeometry(s * 0.03, s * 0.025, s * 0.15);
          const arm = new Mesh(armGeo, legMat);
          arm.rotation.z = side * -0.8;
          arm.position.set(side * s * 0.25, s * 0.02, s * 0.1);
          clawGroup.add(arm);
          const pincerMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.5 });
          const upperGeo = this.createBoxGeometry(s * 0.06, s * 0.015, s * 0.08);
          const upper = new Mesh(upperGeo, pincerMat);
          upper.position.set(side * s * 0.35, s * 0.04, s * 0.1);
          clawGroup.add(upper);
          const lower = new Mesh(upperGeo, pincerMat);
          lower.position.set(side * s * 0.35, s * 0.005, s * 0.1);
          clawGroup.add(lower);
          appendages.push(clawGroup);
        }
        break;
      }
      case 'lobster': {
        // 2 large claws (crusher and cutter)
        for (const side of [-1, 1]) {
          const clawGroup = new Group();
          clawGroup.name = side === -1 ? 'crusherClaw' : 'cutterClaw';
          const isCrusher = side === -1;
          const clawScale = isCrusher ? 1.3 : 1.0;
          const armGeo = this.createCylinderGeometry(s * 0.025 * clawScale, s * 0.02, s * 0.18);
          const arm = new Mesh(armGeo, legMat);
          arm.rotation.z = side * -0.7;
          arm.position.set(side * s * 0.2, s * 0.03, s * 0.12);
          clawGroup.add(arm);
          const pincerMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.4 });
          const pincerW = s * 0.06 * clawScale;
          const pincerH = s * 0.02 * clawScale;
          const pincerD = s * 0.1 * clawScale;
          const upperGeo = this.createBoxGeometry(pincerW, pincerH, pincerD);
          const upper = new Mesh(upperGeo, pincerMat);
          upper.position.set(side * s * 0.32, s * 0.06, s * 0.12);
          clawGroup.add(upper);
          const lower = new Mesh(upperGeo, pincerMat);
          lower.position.set(side * s * 0.32, s * 0.01, s * 0.12);
          clawGroup.add(lower);
          appendages.push(clawGroup);
        }
        break;
      }
      case 'shrimp': {
        // Rostrum (pointed beak)
        const rostrumMat = new MeshStandardMaterial({ color: params.shellColor, roughness: 0.5 });
        const rostrumGeo = this.createConeGeometry(s * 0.02, s * 0.1, 4);
        const rostrum = new Mesh(rostrumGeo, rostrumMat);
        rostrum.rotation.x = -Math.PI / 2;
        rostrum.position.set(0, s * 0.01, s * 0.15);
        rostrum.name = 'rostrum';
        appendages.push(rostrum);
        break;
      }
    }
    return appendages;
  }

  applySkin(materials: Material[]): Material[] {
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        // Crustacean shells are glossy and slightly metallic
        mat.roughness = Math.min(mat.roughness, 0.5);
        mat.metalness = Math.max(mat.metalness, 0.05);
      }
    }
    return materials;
  }

  private applySpeciesDefaults(species: CrustaceanSpecies, params: CrustaceanParams): void {
    switch (species) {
      case 'crab':
        params.size = 0.2; params.shellColor = '#FF6347'; params.legCount = 8;
        params.clawSize = 0.6; params.tailFanSize = 0; params.antennaLength = 0.1;
        break;
      case 'lobster':
        params.size = 0.5; params.shellColor = '#8B0000'; params.legCount = 10;
        params.clawSize = 0.8; params.tailFanSize = 0.6; params.antennaLength = 0.5;
        break;
      case 'shrimp':
        params.size = 0.15; params.shellColor = '#FFB6C1'; params.legCount = 10;
        params.clawSize = 0; params.tailFanSize = 0.4; params.antennaLength = 0.6;
        break;
    }
  }

  private collectMaterialsFromGroup(group: Group): Material[] {
    const materials: Material[] = [];
    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        materials.push(child.material);
      }
    });
    return materials;
  }

  private applySkinnedMaterialsToGroup(group: Group, skinned: Material[], original: Material[]): void {
    let matIndex = 0;
    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        if (matIndex < skinned.length) {
          child.material = skinned[matIndex] as MeshStandardMaterial;
        }
        matIndex++;
      }
    });
  }
}
