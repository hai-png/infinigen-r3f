import { SeededRandom } from '@/core/util/MathUtils';
/**
 * UnderwaterGenerator - Procedural underwater creature generation
 * Generates jellyfish, octopus, crab, starfish, whale, dolphin shapes
 *
 * Fix (w1-5): generateLimbs() and generateAppendages() now dispatch to
 * species-specific generation based on the stored _currentSpecies, so
 * CreatureBase.generate() produces creatures with proper limbs/appendages.
 */
import { Object3D, Group, Mesh, Material, MeshStandardMaterial, DoubleSide } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';

export interface MarineParameters extends CreatureParams {
  hasShell: boolean;
  swimMode: 'propulsion' | 'drift' | 'jet';
  depthRange: 'shallow' | 'mid' | 'deep';
  primaryColor: string;
  secondaryColor: string;
}

export type MarineSpecies = 'jellyfish' | 'crab' | 'starfish' | 'octopus' | 'whale' | 'dolphin';

export class UnderwaterGenerator extends CreatureBase {
  private _rng = new SeededRandom(42);
  /** Tracks the species most recently passed to generate(), used by generateLimbs/Appendages */
  private _currentSpecies: MarineSpecies = 'jellyfish';
  /** Cached params after species defaults are applied */
  private _currentParams: MarineParameters | null = null;

  constructor(params: Partial<MarineParameters> = {}) {
    super({ ...params, seed: params.seed || 42 });
  }

  getDefaultConfig(): MarineParameters {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      hasShell: false,
      swimMode: 'propulsion',
      depthRange: 'shallow',
      primaryColor: '#4169E1',
      secondaryColor: '#87CEEB',
    } as MarineParameters;
  }

  generate(species: MarineSpecies = 'jellyfish', params: Partial<MarineParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    // Store for generateLimbs()/generateAppendages() dispatch
    this._currentSpecies = species;
    this._currentParams = parameters;

    const marine = new Group();
    marine.name = `Marine_${species}`;

    switch (species) {
      case 'jellyfish':
        this.generateJellyfish(marine, parameters);
        break;
      case 'octopus':
        this.generateOctopus(marine, parameters);
        break;
      case 'crab':
        this.generateCrab(marine, parameters);
        break;
      case 'starfish':
        this.generateStarfish(marine, parameters);
        break;
      case 'whale':
      case 'dolphin':
        this.generateCetacean(marine, parameters, species);
        break;
    }

    return marine;
  }

  generateBodyCore(): Object3D {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;

    switch (this._currentSpecies) {
      case 'jellyfish': {
        const mat = new MeshStandardMaterial({
          color: params.primaryColor,
          transparent: true, opacity: 0.7, roughness: 0.3, side: DoubleSide,
        });
        const bell = new Mesh(this.createShellGeometry(s * 0.2, s * 0.15), mat);
        bell.name = 'bell';
        return bell;
      }
      case 'octopus': {
        const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.6 });
        const mantle = new Mesh(this.createEllipsoidGeometry(s * 0.15, s * 0.18, s * 0.12), mat);
        mantle.position.y = s * 0.1;
        mantle.name = 'mantle';
        return mantle;
      }
      case 'crab': {
        const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
        const body = new Mesh(this.createEllipsoidGeometry(s * 0.2, s * 0.06, s * 0.18), mat);
        body.name = 'body';
        return body;
      }
      case 'starfish': {
        const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });
        const discGeo = this.createSphereGeometry(s * 0.06);
        discGeo.scale(1, 0.4, 1);
        const disc = new Mesh(discGeo, mat);
        disc.name = 'disc';
        return disc;
      }
      case 'whale':
      case 'dolphin': {
        const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.4 });
        const body = new Mesh(this.createEllipsoidGeometry(s * 0.2, s * 0.12, s * 0.4), mat);
        body.name = 'body';
        return body;
      }
      default: {
        const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
        return new Mesh(this.createEllipsoidGeometry(0.15, 0.1, 0.2), mat);
      }
    }
  }

  generateHead(): Object3D {
    const params = this._currentParams ?? this.getDefaultConfig();
    const s = params.size;

    switch (this._currentSpecies) {
      case 'jellyfish': {
        // Jellyfish don't have a distinct head; the bell serves as both
        const innerMat = new MeshStandardMaterial({
          color: params.secondaryColor,
          transparent: true, opacity: 0.4, roughness: 0.2, side: DoubleSide,
        });
        const inner = new Mesh(this.createShellGeometry(s * 0.15, s * 0.1), innerMat);
        inner.position.y = -s * 0.01;
        inner.name = 'innerBell';
        return inner;
      }
      case 'crab': {
        // Crab eyes on stalks
        const group = new Group();
        group.name = 'headGroup';
        const stalkMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
        const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
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
        return group;
      }
      case 'octopus': {
        // Eyes
        const group = new Group();
        group.name = 'headGroup';
        const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
        const eyeGeo = this.createSphereGeometry(s * 0.04);
        const leftEye = new Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-s * 0.1, s * 0.05, s * 0.08);
        group.add(leftEye);
        const rightEye = new Mesh(eyeGeo, eyeMat);
        rightEye.position.set(s * 0.1, s * 0.05, s * 0.08);
        group.add(rightEye);
        return group;
      }
      case 'whale':
      case 'dolphin': {
        // Eyes + beak/mouth
        const group = new Group();
        group.name = 'headGroup';
        const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
        const eyeGeo = this.createSphereGeometry(s * 0.015);
        const leftEye = new Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-s * 0.16, s * 0.03, s * 0.3);
        group.add(leftEye);
        const rightEye = new Mesh(eyeGeo, eyeMat);
        rightEye.position.set(s * 0.16, s * 0.03, s * 0.3);
        group.add(rightEye);
        if (this._currentSpecies === 'dolphin') {
          const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.4 });
          const beakGeo = this.createConeGeometry(s * 0.03, s * 0.12, 8);
          const beak = new Mesh(beakGeo, mat);
          beak.rotation.x = -Math.PI / 2;
          beak.position.set(0, -s * 0.02, s * 0.45);
          beak.name = 'beak';
          group.add(beak);
        }
        return group;
      }
      case 'starfish':
      default: {
        // No distinct head for starfish
        const headMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
        const headGeo = this.createEllipsoidGeometry(s * 0.08, s * 0.08, s * 0.12);
        const head = new Mesh(headGeo, headMat);
        head.name = 'head';
        return head;
      }
    }
  }

  /**
   * Generate limbs based on the current species.
   * Dispatches to species-specific limb extractors so that
   * CreatureBase.generate() produces creatures with proper limbs.
   */
  generateLimbs(): Object3D[] {
    const params = this._currentParams ?? this.getDefaultConfig();
    switch (this._currentSpecies) {
      case 'octopus':
        return this.extractOctopusLimbs(params);
      case 'crab':
        return this.extractCrabLimbs(params);
      case 'starfish':
        return this.extractStarfishLimbs(params);
      case 'jellyfish':
      case 'whale':
      case 'dolphin':
      default:
        // Jellyfish have no walking/locomotion limbs; cetaceans have no walking limbs
        return [];
    }
  }

  /**
   * Generate appendages based on the current species.
   * Dispatches to species-specific appendage extractors so that
   * CreatureBase.generate() produces creatures with proper appendages.
   */
  generateAppendages(): Object3D[] {
    const params = this._currentParams ?? this.getDefaultConfig();
    switch (this._currentSpecies) {
      case 'jellyfish':
        return this.extractJellyfishAppendages(params);
      case 'crab':
        return this.extractCrabAppendages(params);
      case 'octopus':
        // Octopus tentacles are classified as limbs; no separate appendages
        return [];
      case 'starfish':
        // Starfish arms are classified as limbs; no separate appendages
        return [];
      case 'whale':
      case 'dolphin':
        return this.extractCetaceanAppendages(params);
      default:
        return [];
    }
  }

  applySkin(materials: Material[]): Material[] {
    const params = this._currentParams ?? this.getDefaultConfig();
    // Apply transparency and underwater-appropriate material properties
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        // Underwater creatures tend to have smoother, more translucent skin
        mat.roughness = Math.min(mat.roughness, 0.6);
        if (this._currentSpecies === 'jellyfish') {
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity ?? 1.0, 0.75);
          mat.side = DoubleSide;
        }
      }
    }
    return materials;
  }

  private applySpeciesDefaults(species: MarineSpecies, params: MarineParameters): void {
    switch (species) {
      case 'jellyfish':
        params.size = 0.3; params.hasShell = false; params.swimMode = 'drift';
        params.primaryColor = '#FF69B4'; params.secondaryColor = '#FFFFFF'; break;
      case 'crab':
        params.size = 0.2; params.hasShell = true; params.swimMode = 'propulsion';
        params.primaryColor = '#FF6347'; break;
      case 'starfish':
        params.size = 0.15; params.hasShell = false; params.swimMode = 'drift';
        params.primaryColor = '#FF8C00'; break;
      case 'octopus':
        params.size = 0.4; params.hasShell = false; params.swimMode = 'jet';
        params.primaryColor = '#8B4513'; break;
      case 'whale':
        params.size = 5.0; params.hasShell = false; params.swimMode = 'propulsion';
        params.depthRange = 'mid'; params.primaryColor = '#2F2F2F'; params.secondaryColor = '#FFFFFF'; break;
      case 'dolphin':
        params.size = 1.5; params.hasShell = false; params.swimMode = 'propulsion';
        params.depthRange = 'shallow'; params.primaryColor = '#708090'; break;
    }
  }

  // ── Full species generation (called by generate()) ────────────────

  private generateJellyfish(group: Group, params: MarineParameters): void {
    const s = params.size;
    const bellMat = new MeshStandardMaterial({
      color: params.primaryColor,
      transparent: true,
      opacity: 0.7,
      roughness: 0.3,
      side: DoubleSide,
    });

    // Bell - hemisphere dome
    const bellGeo = this.createShellGeometry(s * 0.2, s * 0.15);
    const bell = new Mesh(bellGeo, bellMat);
    bell.name = 'bell';
    group.add(bell);

    // Inner bell
    const innerMat = new MeshStandardMaterial({
      color: params.secondaryColor,
      transparent: true,
      opacity: 0.4,
      roughness: 0.2,
      side: DoubleSide,
    });
    const innerGeo = this.createShellGeometry(s * 0.15, s * 0.1);
    const inner = new Mesh(innerGeo, innerMat);
    inner.position.y = -s * 0.01;
    group.add(inner);

    // Tentacles + oral arms via appendage extractors
    this.extractJellyfishAppendages(params).forEach(a => group.add(a));
  }

  private generateOctopus(group: Group, params: MarineParameters): void {
    const s = params.size;
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.6 });

    // Mantle (head)
    const mantleGeo = this.createEllipsoidGeometry(s * 0.15, s * 0.18, s * 0.12);
    const mantle = new Mesh(mantleGeo, mat);
    mantle.position.y = s * 0.1;
    mantle.name = 'mantle';
    group.add(mantle);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.04);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.1, s * 0.05, s * 0.08);
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.1, s * 0.05, s * 0.08);
    group.add(rightEye);

    // Tentacles via limb extractors
    this.extractOctopusLimbs(params).forEach(l => group.add(l));
  }

  private generateCrab(group: Group, params: MarineParameters): void {
    const s = params.size;
    const shellMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });

    // Body shell - flattened dome
    const bodyGeo = this.createEllipsoidGeometry(s * 0.2, s * 0.06, s * 0.18);
    const body = new Mesh(bodyGeo, shellMat);
    body.name = 'body';
    group.add(body);

    // Top shell dome
    const shellGeo = this.createShellGeometry(s * 0.18, s * 0.06);
    const shell = new Mesh(shellGeo, shellMat);
    shell.position.y = s * 0.02;
    shell.name = 'shell';
    group.add(shell);

    // Eyes on stalks
    const stalkMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
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

    // Legs via limb extractors + claws via appendage extractors
    this.extractCrabLimbs(params).forEach(l => group.add(l));
    this.extractCrabAppendages(params).forEach(a => group.add(a));
  }

  private generateStarfish(group: Group, params: MarineParameters): void {
    const s = params.size;
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });

    // Central disc
    const discGeo = this.createSphereGeometry(s * 0.06);
    discGeo.scale(1, 0.4, 1);
    const disc = new Mesh(discGeo, mat);
    disc.name = 'disc';
    group.add(disc);

    // Arms via limb extractors
    this.extractStarfishLimbs(params).forEach(l => group.add(l));
  }

  private generateCetacean(group: Group, params: MarineParameters, species: string): void {
    const s = params.size;
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.4 });
    const bellyMat = new MeshStandardMaterial({ color: params.secondaryColor, roughness: 0.4 });

    // Torpedo body
    const bodyGeo = this.createEllipsoidGeometry(s * 0.2, s * 0.12, s * 0.4);
    const body = new Mesh(bodyGeo, mat);
    body.name = 'body';
    group.add(body);

    // Belly (lighter underside)
    const bellyGeo = this.createEllipsoidGeometry(s * 0.18, s * 0.1, s * 0.35);
    const belly = new Mesh(bellyGeo, bellyMat);
    belly.position.y = -s * 0.03;
    group.add(belly);

    // Fins + flukes via appendage extractors
    this.extractCetaceanAppendages(params).forEach(a => group.add(a));

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.015);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.16, s * 0.03, s * 0.3);
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.16, s * 0.03, s * 0.3);
    group.add(rightEye);

    // Beak/mouth
    if (species === 'dolphin') {
      const beakGeo = this.createConeGeometry(s * 0.03, s * 0.12, 8);
      const beak = new Mesh(beakGeo, mat);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, -s * 0.02, s * 0.45);
      group.add(beak);
    }
  }

  // ── Species-specific limb extractors ──────────────────────────────

  /** Octopus: 8 tentacles (used for locomotion → classified as limbs) */
  private extractOctopusLimbs(params: MarineParameters): Object3D[] {
    const s = params.size;
    const tentacleMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
    const limbs: Object3D[] = [];

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = s * 0.1;
      const tentacleGroup = new Group();
      tentacleGroup.name = `tentacle_${i}`;

      for (let j = 0; j < 4; j++) {
        const segLen = s * 0.12;
        const segRadius = s * 0.035 * (1 - j * 0.2);
        const segGeo = this.createCylinderGeometry(segRadius, segRadius * 0.75, segLen);
        const seg = new Mesh(segGeo, tentacleMat);
        seg.position.y = -j * segLen;
        seg.rotation.x = 0.15 + j * 0.1;
        tentacleGroup.add(seg);

        // Suction cup
        const cupGeo = this.createCylinderGeometry(segRadius * 0.5, segRadius * 0.6, s * 0.005);
        const cupMat = new MeshStandardMaterial({ color: 0xddbb99, roughness: 0.3 });
        const cup = new Mesh(cupGeo, cupMat);
        cup.position.set(0, -j * segLen, segRadius * 0.5);
        tentacleGroup.add(cup);
      }

      tentacleGroup.position.set(Math.cos(angle) * radius, -s * 0.05, Math.sin(angle) * radius);
      limbs.push(tentacleGroup);
    }
    return limbs;
  }

  /** Crab: 8 walking legs (4 per side) */
  private extractCrabLimbs(params: MarineParameters): Object3D[] {
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });
    const limbs: Object3D[] = [];

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
    return limbs;
  }

  /** Starfish: 5 arms (used for locomotion → classified as limbs) */
  private extractStarfishLimbs(params: MarineParameters): Object3D[] {
    const s = params.size;
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });
    const limbs: Object3D[] = [];

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const armGeo = this.createCylinderGeometry(s * 0.015, s * 0.04, s * 0.18);
      armGeo.scale(1, 0.4, 1);
      const arm = new Mesh(armGeo, mat);
      arm.position.set(Math.cos(angle) * s * 0.1, 0, Math.sin(angle) * s * 0.1);
      arm.rotation.y = -angle;
      arm.name = `arm_${i}`;
      limbs.push(arm);
    }
    return limbs;
  }

  // ── Species-specific appendage extractors ─────────────────────────

  /** Jellyfish: 8 tentacles + 4 oral arms */
  private extractJellyfishAppendages(params: MarineParameters): Object3D[] {
    const s = params.size;
    const appendages: Object3D[] = [];

    // 8 dangling tentacles
    const tentacleMat = new MeshStandardMaterial({
      color: params.primaryColor,
      transparent: true,
      opacity: 0.6,
      roughness: 0.5,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = s * 0.12;
      const tentacleGroup = new Group();
      tentacleGroup.name = `tentacle_${i}`;

      for (let j = 0; j < 3; j++) {
        const segLen = s * 0.15;
        const segRadius = s * 0.02 * (1 - j * 0.25);
        const segGeo = this.createCylinderGeometry(segRadius, segRadius * 0.7, segLen);
        const seg = new Mesh(segGeo, tentacleMat);
        seg.position.y = -s * 0.1 - j * segLen;
        seg.rotation.x = Math.sin(angle) * 0.1;
        seg.rotation.z = Math.cos(angle) * 0.1;
        tentacleGroup.add(seg);
      }

      tentacleGroup.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      appendages.push(tentacleGroup);
    }

    // 4 oral arms (shorter, frilled)
    const armMat = new MeshStandardMaterial({
      color: 0xffccdd,
      transparent: true,
      opacity: 0.65,
      roughness: 0.4,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const armGeo = this.createCylinderGeometry(s * 0.03, s * 0.015, s * 0.2);
      const arm = new Mesh(armGeo, armMat);
      arm.position.set(Math.cos(angle) * s * 0.06, -s * 0.15, Math.sin(angle) * s * 0.06);
      arm.rotation.x = Math.cos(angle) * 0.15;
      arm.rotation.z = Math.sin(angle) * 0.15;
      appendages.push(arm);
    }

    return appendages;
  }

  /** Crab: 2 claws */
  private extractCrabAppendages(params: MarineParameters): Object3D[] {
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.8 });
    const appendages: Object3D[] = [];

    for (const side of [-1, 1]) {
      const clawGroup = new Group();
      clawGroup.name = side === -1 ? 'leftClaw' : 'rightClaw';

      const armGeo = this.createCylinderGeometry(s * 0.03, s * 0.025, s * 0.15);
      const arm = new Mesh(armGeo, legMat);
      arm.rotation.z = side * -0.8;
      arm.position.set(side * s * 0.25, s * 0.02, s * 0.1);
      clawGroup.add(arm);

      const pincerMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
      const upperGeo = this.createBoxGeometry(s * 0.06, s * 0.015, s * 0.08);
      const upper = new Mesh(upperGeo, pincerMat);
      upper.position.set(side * s * 0.35, s * 0.04, s * 0.1);
      clawGroup.add(upper);
      const lower = new Mesh(upperGeo, pincerMat);
      lower.position.set(side * s * 0.35, s * 0.005, s * 0.1);
      clawGroup.add(lower);

      appendages.push(clawGroup);
    }
    return appendages;
  }

  /** Cetacean: dorsal fin + 2 tail flukes + 2 pectoral fins */
  private extractCetaceanAppendages(params: MarineParameters): Object3D[] {
    const s = params.size;
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.4 });
    const appendages: Object3D[] = [];

    // Dorsal fin
    const dorsalGeo = this.createFinGeometry(s * 0.06, s * 0.1, s * 0.01);
    const dorsal = new Mesh(dorsalGeo, mat);
    dorsal.position.set(0, s * 0.12, -s * 0.05);
    dorsal.name = 'dorsalFin';
    appendages.push(dorsal);

    // Tail flukes
    for (const side of [-1, 1]) {
      const flukeGeo = this.createFinGeometry(s * 0.15, s * 0.08, s * 0.01);
      const fluke = new Mesh(flukeGeo, mat);
      fluke.position.set(0, side * s * 0.04, -s * 0.4);
      fluke.rotation.x = side * 0.3;
      fluke.name = side === -1 ? 'leftFluke' : 'rightFluke';
      appendages.push(fluke);
    }

    // Pectoral fins
    for (const side of [-1, 1]) {
      const finGeo = this.createFinGeometry(s * 0.08, s * 0.05, s * 0.005);
      const fin = new Mesh(finGeo, mat);
      fin.position.set(side * s * 0.18, -s * 0.04, s * 0.1);
      fin.rotation.z = side * 0.7;
      fin.name = side === -1 ? 'leftFin' : 'rightFin';
      appendages.push(fin);
    }

    return appendages;
  }
}
