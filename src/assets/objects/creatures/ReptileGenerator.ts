/**
 * ReptileGenerator - Procedural reptile generation
 * Generates reptiles with flat body, triangular head with jaw, 4 splayed legs, tapered tail, scale material
 */
import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface ReptileParameters extends CreatureParams {
  scalePattern: 'smooth' | 'keeled' | 'granular';
  limbCount: number;
  hasShell: boolean;
  primaryColor: string;
}

export type ReptileSpecies = 'lizard' | 'snake' | 'turtle' | 'crocodile' | 'gecko';

export class ReptileGenerator extends CreatureBase {
  constructor(params: Partial<ReptileParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): ReptileParameters {
    return {
      ...this.params,
      creatureType: CreatureType.REPTILE,
      scalePattern: 'smooth',
      limbCount: 4,
      hasShell: false,
      primaryColor: '#228B22',
    } as ReptileParameters;
  }

  generate(species: ReptileSpecies = 'lizard', params: Partial<ReptileParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const reptile = new Group();
    reptile.name = `Reptile_${species}`;

    const scaleMat = this.createScaleMaterial(parameters);

    // Flat body
    const body = this.generateBody(parameters, scaleMat);
    reptile.add(body);

    // Triangular head with jaw
    const head = this.buildHead(parameters, scaleMat);
    head.position.set(0, s * 0.05, s * 0.4);
    reptile.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0xaa8800, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.025);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.06, s * 0.1, s * 0.48);
    reptile.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.06, s * 0.1, s * 0.48);
    reptile.add(rightEye);

    // 4 splayed legs (unless snake)
    if (parameters.limbCount > 0) {
      const legs = this.generateLegs(parameters, scaleMat);
      legs.forEach(l => reptile.add(l));
    }

    // Tapered tail
    const tail = this.generateTail(parameters, scaleMat);
    reptile.add(tail);

    // Shell (turtle)
    if (parameters.hasShell) {
      const shell = this.generateShell(parameters);
      reptile.add(shell);
    }

    return reptile;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig(), this.createScaleMaterial(this.getDefaultConfig()));
  }

  generateHead(): Mesh {
    return this.buildHead(this.getDefaultConfig(), this.createScaleMaterial(this.getDefaultConfig()));
  }

  generateLimbs(): Mesh[] {
    return this.generateLegs(this.getDefaultConfig(), this.createScaleMaterial(this.getDefaultConfig()));
  }

  generateAppendages(): Mesh[] {
    const params = this.getDefaultConfig();
    const mat = this.createScaleMaterial(params);
    const app: Mesh[] = [this.generateTail(params, mat)];
    if (params.hasShell) app.push(this.generateShell(params));
    return app;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: ReptileSpecies, params: ReptileParameters): void {
    switch (species) {
      case 'lizard':
        params.size = 0.3; params.scalePattern = 'smooth'; params.limbCount = 4;
        params.hasShell = false; params.primaryColor = '#228B22'; break;
      case 'snake':
        params.size = 1.0; params.scalePattern = 'smooth'; params.limbCount = 0;
        params.hasShell = false; params.primaryColor = '#228B22'; break;
      case 'turtle':
        params.size = 0.5; params.scalePattern = 'keeled'; params.limbCount = 4;
        params.hasShell = true; params.primaryColor = '#2E8B57'; break;
      case 'crocodile':
        params.size = 2.0; params.scalePattern = 'keeled'; params.limbCount = 4;
        params.hasShell = false; params.primaryColor = '#556B2F'; break;
      case 'gecko':
        params.size = 0.1; params.scalePattern = 'granular'; params.limbCount = 4;
        params.hasShell = false; params.primaryColor = '#32CD32'; break;
    }
  }

  private createScaleMaterial(params: ReptileParameters): MeshStandardMaterial {
    const roughness = params.scalePattern === 'smooth' ? 0.5 : params.scalePattern === 'keeled' ? 0.7 : 0.9;
    return new MeshStandardMaterial({
      color: params.primaryColor,
      roughness,
      metalness: 0.05,
    });
  }

  private generateBody(params: ReptileParameters, mat: MeshStandardMaterial): Mesh {
    const s = params.size;
    // Flat body - wider and flatter than mammal
    const geo = this.createEllipsoidGeometry(s * 0.2, s * 0.08, s * 0.35);
    const mesh = new Mesh(geo, mat);
    mesh.name = 'body';
    return mesh;
  }

  private buildHead(params: ReptileParameters, mat: MeshStandardMaterial): Mesh {
    const s = params.size;
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    // Triangular head
    const headGeo = this.createEllipsoidGeometry(s * 0.08, s * 0.05, s * 0.12);
    const head = new Mesh(headGeo, mat);
    head.name = 'head';
    headGroup.add(head);

    // Jaw / snout
    const jawGeo = this.createEllipsoidGeometry(s * 0.06, s * 0.025, s * 0.1);
    const jawMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.6 });
    const jaw = new Mesh(jawGeo, jawMat);
    jaw.position.set(0, -s * 0.04, s * 0.03);
    jaw.name = 'jaw';
    headGroup.add(jaw);

    return headGroup as unknown as Mesh;
  }

  private generateLegs(params: ReptileParameters, mat: MeshStandardMaterial): Mesh[] {
    const s = params.size;
    const legs: Mesh[] = [];
    const footMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });

    const legPositions = [
      { x: -s * 0.18, z: s * 0.15, angle: -0.6, name: 'frontLeft' },
      { x: s * 0.18, z: s * 0.15, angle: 0.6, name: 'frontRight' },
      { x: -s * 0.18, z: -s * 0.15, angle: -0.5, name: 'backLeft' },
      { x: s * 0.18, z: -s * 0.15, angle: 0.5, name: 'backRight' },
    ];

    for (const pos of legPositions) {
      const legGroup = new Group();
      legGroup.name = pos.name;
      legGroup.position.set(pos.x, -s * 0.03, pos.z);

      // Upper leg (splayed outward)
      const upperGeo = this.createCylinderGeometry(s * 0.02, s * 0.018, s * 0.1);
      const upper = new Mesh(upperGeo, mat);
      upper.rotation.z = pos.angle;
      upper.position.x = Math.sign(pos.x) * s * 0.04;
      upper.position.y = -s * 0.04;
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = this.createCylinderGeometry(s * 0.018, s * 0.012, s * 0.08);
      const lower = new Mesh(lowerGeo, mat);
      lower.position.set(Math.sign(pos.x) * s * 0.08, -s * 0.1, 0);
      legGroup.add(lower);

      // Foot / claw
      const footGeo = this.createBoxGeometry(s * 0.04, s * 0.01, s * 0.05);
      const foot = new Mesh(footGeo, footMat);
      foot.position.set(Math.sign(pos.x) * s * 0.09, -s * 0.14, 0);
      legGroup.add(foot);

      legs.push(legGroup as unknown as Mesh);
    }

    return legs;
  }

  private generateTail(params: ReptileParameters, mat: MeshStandardMaterial): Mesh {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';

    // Tapered tail - series of segments getting smaller
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const radius = s * 0.04 * (1 - t * 0.8);
      const segLen = s * 0.08;
      const segGeo = this.createCylinderGeometry(radius, radius * 0.85, segLen);
      const seg = new Mesh(segGeo, mat);
      seg.position.set(0, -s * 0.02 * t, -s * 0.35 - t * s * 0.25);
      seg.rotation.x = 0.1 * t;
      tailGroup.add(seg);
    }

    return tailGroup as unknown as Mesh;
  }

  private generateShell(params: ReptileParameters): Mesh {
    const s = params.size;
    const shellGeo = this.createShellGeometry(s * 0.25, s * 0.12);
    const shellMat = new MeshStandardMaterial({
      color: '#5C4033',
      roughness: 0.9,
      metalness: 0.0,
    });
    const shell = new Mesh(shellGeo, shellMat);
    shell.position.set(0, s * 0.06, 0);
    shell.name = 'shell';
    return shell;
  }
}
