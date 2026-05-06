import { SeededRandom } from '@/core/util/MathUtils';
/**
 * AmphibianGenerator - Procedural amphibian generation
 * Generates amphibians with smooth body, wide head with large eyes, 4 legs (hind larger), webbed feet
 */
import { Object3D, Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export type AmphibianSpecies = 'frog' | 'salamander' | 'newt' | 'toad';
export interface AmphibianParameters extends CreatureParams {
  skinTexture: 'smooth' | 'warty' | 'ridged';
  hasTail: boolean;
  webbedFeet: boolean;
  primaryColor: string;
}

export class AmphibianGenerator extends CreatureBase {
  private _rng = new SeededRandom(42);
  constructor(params: Partial<AmphibianParameters> = {}) {
    super({ ...params, seed: params.seed || 42 });
  }

  getDefaultConfig(): AmphibianParameters {
    return {
      ...this.params,
      creatureType: CreatureType.AMPHIBIAN,
      skinTexture: 'smooth',
      hasTail: false,
      webbedFeet: true,
      primaryColor: '#228B22',
    } as AmphibianParameters;
  }

  generate(species: AmphibianSpecies = 'frog', params: Partial<AmphibianParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const amphibian = new Group();
    amphibian.name = `Amphibian_${species}`;

    const skinMat = this.createSkinMaterial(parameters);

    // Smooth body
    const body = this.generateBody(parameters, skinMat);
    amphibian.add(body);

    // Wide head with large eyes
    const head = this.buildHead(parameters, skinMat);
    head.position.set(0, s * 0.1, s * 0.25);
    amphibian.add(head);

    // Large eyes
    const eyeMat = new MeshStandardMaterial({ color: 0xaacc00, roughness: 0.3, metalness: 0.2 });
    const pupilMat = new MeshStandardMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      // Eyeball
      const eyeGeo = this.createSphereGeometry(s * 0.06);
      const eye = new Mesh(eyeGeo, eyeMat);
      eye.position.set(side * s * 0.15, s * 0.22, s * 0.32);
      amphibian.add(eye);
      // Pupil
      const pupilGeo = this.createSphereGeometry(s * 0.025);
      const pupil = new Mesh(pupilGeo, pupilMat);
      pupil.position.set(side * s * 0.17, s * 0.22, s * 0.36);
      amphibian.add(pupil);
    }

    // 4 legs (hind larger)
    const legs = this.generateLegs(parameters, skinMat);
    legs.forEach(l => amphibian.add(l));

    // Tail
    if (parameters.hasTail) {
      const tail = this.generateTail(parameters, skinMat);
      amphibian.add(tail);
    }

    return amphibian;
  }

  generateBodyCore(): Object3D {
    return this.generateBody(this.getDefaultConfig(), this.createSkinMaterial(this.getDefaultConfig()));
  }

  generateHead(): Object3D {
    const params = this.getDefaultConfig();
    const s = params.size;
    const headGroup = this.buildHead(params, this.createSkinMaterial(params));

    // Eyes (needed for complete head via abstract method chain)
    const eyeMat = new MeshStandardMaterial({ color: 0xaacc00, roughness: 0.3, metalness: 0.2 });
    const pupilMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.06);
    const pupilGeo = this.createSphereGeometry(s * 0.025);
    for (const side of [-1, 1]) {
      const eye = new Mesh(eyeGeo, eyeMat);
      eye.position.set(side * s * 0.15, s * 0.22, s * 0.32);
      eye.name = side === -1 ? 'leftEye' : 'rightEye';
      headGroup.add(eye);
      const pupil = new Mesh(pupilGeo, pupilMat);
      pupil.position.set(side * s * 0.17, s * 0.22, s * 0.36);
      pupil.name = side === -1 ? 'leftPupil' : 'rightPupil';
      headGroup.add(pupil);
    }

    return headGroup;
  }

  generateLimbs(): Object3D[] {
    return this.generateLegs(this.getDefaultConfig(), this.createSkinMaterial(this.getDefaultConfig()));
  }

  generateAppendages(): Object3D[] {
    const params = this.getDefaultConfig();
    const mat = this.createSkinMaterial(params);
    if (params.hasTail) return [this.generateTail(params, mat)];
    return [];
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: AmphibianSpecies, params: AmphibianParameters): void {
    switch (species) {
      case 'frog': params.hasTail = false; params.size = 0.1; params.webbedFeet = true; params.primaryColor = '#32CD32'; break;
      case 'salamander': params.hasTail = true; params.size = 0.2; params.skinTexture = 'smooth'; params.primaryColor = '#FF8C00'; break;
      case 'newt': params.hasTail = true; params.size = 0.15; params.primaryColor = '#FFD700'; break;
      case 'toad': params.hasTail = false; params.size = 0.12; params.skinTexture = 'warty'; params.primaryColor = '#8B4513'; break;
    }
  }

  private createSkinMaterial(params: AmphibianParameters): MeshStandardMaterial {
    const roughness = params.skinTexture === 'smooth' ? 0.4 : params.skinTexture === 'warty' ? 0.9 : 0.7;
    return new MeshStandardMaterial({
      color: params.primaryColor,
      roughness,
      metalness: 0.05,
    });
  }

  private generateBody(params: AmphibianParameters, mat: MeshStandardMaterial): Mesh {
    const s = params.size;
    // Smooth, slightly flattened body
    const geo = this.createEllipsoidGeometry(s * 0.2, s * 0.12, s * 0.25);
    const mesh = new Mesh(geo, mat);
    mesh.name = 'body';
    return mesh;
  }

  private buildHead(params: AmphibianParameters, mat: MeshStandardMaterial): Group {
    const s = params.size;
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    // Wide, flat head
    const headGeo = this.createEllipsoidGeometry(s * 0.18, s * 0.06, s * 0.12);
    const head = new Mesh(headGeo, mat);
    head.name = 'head';
    headGroup.add(head);

    // Mouth line
    const mouthGeo = this.createBoxGeometry(s * 0.2, s * 0.005, s * 0.01);
    const mouthMat = new MeshStandardMaterial({ color: 0x333333 });
    const mouth = new Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -s * 0.04, s * 0.08);
    headGroup.add(mouth);

    return headGroup;
  }

  private generateLegs(params: AmphibianParameters, mat: MeshStandardMaterial): Group[] {
    const s = params.size;
    const legs: Group[] = [];
    const footMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.6 });

    // Front legs (smaller)
    for (const side of [-1, 1]) {
      const legGroup = new Group();
      legGroup.name = `frontLeg_${side === -1 ? 'L' : 'R'}`;
      legGroup.position.set(side * s * 0.15, -s * 0.05, s * 0.1);

      // Upper
      const upperGeo = this.createCylinderGeometry(s * 0.025, s * 0.02, s * 0.08);
      const upper = new Mesh(upperGeo, mat);
      upper.position.y = -s * 0.04;
      upper.rotation.z = side * 0.3;
      legGroup.add(upper);

      // Lower
      const lowerGeo = this.createCylinderGeometry(s * 0.02, s * 0.015, s * 0.06);
      const lower = new Mesh(lowerGeo, mat);
      lower.position.y = -s * 0.09;
      legGroup.add(lower);

      // Webbed foot
      const foot = this.createWebbedFoot(s * 0.05, params.webbedFeet, footMat);
      foot.position.y = -s * 0.12;
      legGroup.add(foot);

      legs.push(legGroup);
    }

    // Hind legs (larger)
    for (const side of [-1, 1]) {
      const legGroup = new Group();
      legGroup.name = `hindLeg_${side === -1 ? 'L' : 'R'}`;
      legGroup.position.set(side * s * 0.15, -s * 0.05, -s * 0.12);

      // Thigh (larger)
      const thighGeo = this.createEllipsoidGeometry(s * 0.04, s * 0.06, s * 0.04);
      const thigh = new Mesh(thighGeo, mat);
      thigh.position.set(side * s * 0.04, -s * 0.04, 0);
      thigh.rotation.z = side * 0.5;
      legGroup.add(thigh);

      // Shin
      const shinGeo = this.createCylinderGeometry(s * 0.025, s * 0.018, s * 0.12);
      const shin = new Mesh(shinGeo, mat);
      shin.position.y = -s * 0.12;
      shin.rotation.x = 0.3;
      legGroup.add(shin);

      // Webbed foot
      const foot = this.createWebbedFoot(s * 0.06, params.webbedFeet, footMat);
      foot.position.y = -s * 0.18;
      legGroup.add(foot);

      legs.push(legGroup);
    }

    return legs;
  }

  private createWebbedFoot(size: number, webbed: boolean, mat: MeshStandardMaterial): Group {
    const group = new Group();
    group.name = 'foot';

    // Palm
    const palmGeo = this.createBoxGeometry(size, size * 0.15, size * 0.6);
    const palm = new Mesh(palmGeo, mat);
    group.add(palm);

    if (webbed) {
      // Webbed toes - flat triangular shapes
      for (let i = -1; i <= 1; i++) {
        const toeGeo = this.createFinGeometry(size * 0.3, size * 0.4, size * 0.03);
        const toe = new Mesh(toeGeo, mat);
        toe.position.set(i * size * 0.2, 0, size * 0.3);
        toe.rotation.x = Math.PI / 2;
        group.add(toe);
      }
    } else {
      // Simple toes
      for (let i = -1; i <= 1; i++) {
        const toeGeo = this.createCylinderGeometry(size * 0.05, size * 0.03, size * 0.2);
        const toe = new Mesh(toeGeo, mat);
        toe.position.set(i * size * 0.2, 0, size * 0.3);
        toe.rotation.x = Math.PI / 2;
        group.add(toe);
      }
    }

    return group;
  }

  private generateTail(params: AmphibianParameters, mat: MeshStandardMaterial): Group {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';

    // Tapered tail
    const tailGeo = this.createCylinderGeometry(s * 0.04, s * 0.01, s * 0.3);
    const tail = new Mesh(tailGeo, mat);
    tail.rotation.x = Math.PI * 0.4;
    tail.position.set(0, -s * 0.02, -s * 0.3);
    tailGroup.add(tail);

    return tailGroup;
  }
}
