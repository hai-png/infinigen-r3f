/**
 * FishGenerator - Procedural fish generation
 * Generates fish with tapered body, tail fin, dorsal fin, pectoral fins, and eyes
 */
import { Group, Mesh, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface FishParameters extends CreatureParams {
  tailType: 'forked' | 'rounded' | 'square';
  scaleType: 'smooth' | 'cycloid' | 'ctenoid';
  hasFins: boolean;
  primaryColor: string;
  secondaryColor: string;
}

export type FishSpecies = 'goldfish' | 'tuna' | 'clownfish' | 'anglerfish' | 'seahorse';

export class FishGenerator extends CreatureBase {
  constructor(params: Partial<FishParameters> = {}) {
    super({ ...params, seed: params.seed || Math.random() * 10000 });
  }

  getDefaultConfig(): FishParameters {
    return {
      ...this.params,
      creatureType: CreatureType.FISH,
      tailType: 'forked',
      scaleType: 'smooth',
      hasFins: true,
      primaryColor: '#FF8C00',
      secondaryColor: '#FFFFFF',
    } as FishParameters;
  }

  generate(species: FishSpecies = 'goldfish', params: Partial<FishParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const fish = new Group();
    fish.name = `Fish_${species}`;

    // Tapered body
    const body = this.generateBody(parameters);
    fish.add(body);

    // Head / mouth
    const mouth = new Mesh(
      this.createSphereGeometry(s * 0.05),
      new MeshStandardMaterial({ color: 0x880000 })
    );
    mouth.position.set(0, 0, s * 0.45);
    mouth.scale.set(1, 0.6, 0.5);
    fish.add(mouth);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.03);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.1, s * 0.06, s * 0.3);
    fish.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.1, s * 0.06, s * 0.3);
    fish.add(rightEye);

    // Tail fin
    const tailFin = this.generateTailFin(parameters);
    fish.add(tailFin);

    // Dorsal fin
    const dorsalFin = this.generateDorsalFin(parameters);
    fish.add(dorsalFin);

    // Pectoral fins
    if (parameters.hasFins) {
      const pectoralFins = this.generatePectoralFins(parameters);
      pectoralFins.forEach(f => fish.add(f));
    }

    return fish;
  }

  generateBodyCore(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Mesh {
    return this.generateBody(this.getDefaultConfig());
  }

  generateLimbs(): Mesh[] {
    return this.generatePectoralFins(this.getDefaultConfig());
  }

  generateAppendages(): Mesh[] {
    const params = this.getDefaultConfig();
    return [this.generateTailFin(params), this.generateDorsalFin(params), ...this.generatePectoralFins(params)];
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: FishSpecies, params: FishParameters): void {
    switch (species) {
      case 'goldfish':
        params.size = 0.1; params.tailType = 'rounded'; params.primaryColor = '#FF8C00'; break;
      case 'tuna':
        params.size = 2.0; params.tailType = 'forked'; params.primaryColor = '#4169E1'; break;
      case 'clownfish':
        params.size = 0.1; params.tailType = 'rounded'; params.primaryColor = '#FF6347'; params.secondaryColor = '#FFFFFF'; break;
      case 'anglerfish':
        params.size = 0.5; params.tailType = 'forked'; params.primaryColor = '#2F2F2F'; break;
      case 'seahorse':
        params.size = 0.15; params.tailType = 'square'; params.primaryColor = '#FFD700'; break;
    }
  }

  private generateBody(params: FishParameters): Mesh {
    const s = params.size;
    // Tapered body: wider at front, narrower at back
    const geo = this.createEllipsoidGeometry(s * 0.15, s * 0.12, s * 0.35);
    geo.scale(1, 1, 1);
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    const mesh = new Mesh(geo, mat);
    mesh.name = 'body';
    return mesh;
  }

  private generateTailFin(params: FishParameters): Mesh {
    const s = params.size;
    const finMat = new MeshStandardMaterial({
      color: params.secondaryColor,
      transparent: true,
      opacity: 0.85,
      roughness: 0.4,
      side: 2,
    });
    const finGroup = new Group();
    finGroup.name = 'tailFin';

    if (params.tailType === 'forked') {
      // Two-pronged fork
      for (const side of [-1, 1]) {
        const finGeo = this.createFinGeometry(s * 0.15, s * 0.18, s * 0.01);
        const fin = new Mesh(finGeo, finMat);
        fin.position.set(0, side * s * 0.05, -s * 0.35);
        fin.rotation.x = side * 0.3;
        finGroup.add(fin);
      }
    } else if (params.tailType === 'rounded') {
      const finGeo = this.createFinGeometry(s * 0.2, s * 0.15, s * 0.01);
      const fin = new Mesh(finGeo, finMat);
      fin.position.set(0, 0, -s * 0.35);
      finGroup.add(fin);
    } else {
      // Square
      const geo = this.createBoxGeometry(s * 0.15, s * 0.15, s * 0.005);
      const fin = new Mesh(geo, finMat);
      fin.position.set(0, 0, -s * 0.35);
      finGroup.add(fin);
    }

    return finGroup as unknown as Mesh;
  }

  private generateDorsalFin(params: FishParameters): Mesh {
    const s = params.size;
    const finMat = new MeshStandardMaterial({
      color: params.primaryColor,
      transparent: true,
      opacity: 0.85,
      roughness: 0.4,
      side: 2,
    });
    const finGeo = this.createFinGeometry(s * 0.08, s * 0.12, s * 0.01);
    const fin = new Mesh(finGeo, finMat);
    fin.position.set(0, s * 0.12, -s * 0.05);
    fin.rotation.z = -0.2;
    fin.name = 'dorsalFin';
    return fin;
  }

  private generatePectoralFins(params: FishParameters): Mesh[] {
    const s = params.size;
    const finMat = new MeshStandardMaterial({
      color: params.secondaryColor,
      transparent: true,
      opacity: 0.8,
      roughness: 0.4,
      side: 2,
    });
    const fins: Mesh[] = [];

    for (const side of [-1, 1]) {
      const finGeo = this.createFinGeometry(s * 0.08, s * 0.06, s * 0.005);
      const fin = new Mesh(finGeo, finMat);
      fin.position.set(side * s * 0.14, -s * 0.02, s * 0.1);
      fin.rotation.z = side * 0.8;
      fin.name = side === -1 ? 'leftPectoral' : 'rightPectoral';
      fins.push(fin);
    }

    return fins;
  }
}
