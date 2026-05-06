import { SeededRandom } from '@/core/util/MathUtils';
/**
 * InsectGenerator - Procedural insect generation
 * Generates insects with 3 body segments, 6 legs, antennae, and optional wings
 *
 * Geometry improvements:
 * - Wings use ShapeGeometry with proper wing outlines (butterfly, dragonfly, bee)
 *   instead of flat ellipsoids
 * - Procedural vein patterns generated using recursive branching from wing root
 * - Body segments use LatheGeometry for smoother profiles
 * - Subdivision smoothing applied at segment junctions
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, DoubleSide, Shape, ShapeGeometry, Vector2, LatheGeometry, CylinderGeometry } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { smoothCreatureJunction } from '../../../core/util/GeometryUtils';

export interface InsectParameters extends CreatureParams {
  legCount: number;
  hasWings: boolean;
  bodySegments: number;
  primaryColor: string;
  wingType: 'butterfly' | 'dragonfly' | 'bee' | 'beetle';
}

export type InsectSpecies = 'ant' | 'bee' | 'beetle' | 'butterfly' | 'spider' | 'grasshopper';

export class InsectGenerator extends CreatureBase {
  private _rng = new SeededRandom(42);
  constructor(params: Partial<InsectParameters> = {}) {
    super({ ...params, seed: params.seed || 42 });
  }

  getDefaultConfig(): InsectParameters {
    return {
      ...this.params,
      creatureType: CreatureType.INSECT,
      legCount: 6,
      hasWings: false,
      bodySegments: 3,
      primaryColor: '#2F2F2F',
      wingType: 'butterfly',
    } as InsectParameters;
  }

  generate(species: InsectSpecies = 'ant', params: Partial<InsectParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const insect = new Group();
    insect.name = `Insect_${species}`;

    const mat = new MeshStandardMaterial({ color: parameters.primaryColor, roughness: 0.5, metalness: 0.1 });

    // 3 body segments: head, thorax, abdomen — using LatheGeometry
    const segments = this.generateBodySegments(parameters, mat);
    segments.forEach(seg => insect.add(seg));

    // Eyes on head
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.08);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.12, s * 0.15, s * 0.35);
    leftEye.name = 'leftEye';
    insect.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.12, s * 0.15, s * 0.35);
    rightEye.name = 'rightEye';
    insect.add(rightEye);

    // 6 legs (3 pairs) attached to thorax
    const legs = this.generateLegs(parameters, mat);
    legs.forEach(l => insect.add(l));

    // Antennae
    const antennae = this.generateAntennae(parameters, mat);
    antennae.forEach(a => insect.add(a));

    // Optional wings — now with proper shapes and vein patterns
    if (parameters.hasWings) {
      const wings = this.generateWings(parameters);
      wings.forEach(w => insect.add(w));
    }

    return insect;
  }

  generateBodyCore(): Object3D {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    return this.generateBodySegments(params, mat)[1]; // Thorax
  }

  generateHead(): Object3D {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    // Head segment — using LatheGeometry for smooth profile
    const headProfile: [number, number][] = [
      [0.0, 0.05],
      [0.15, 0.50],
      [0.35, 0.90],
      [0.50, 1.00],
      [0.70, 0.85],
      [0.85, 0.50],
      [1.0, 0.10],
    ];
    const headGeo = this.createSegmentLatheGeometry(headProfile, params.size * 0.2, params.size * 0.2);
    const head = new Mesh(headGeo, mat);
    head.position.set(0, params.size * 0.1, params.size * 0.3);
    head.rotation.x = Math.PI / 2;
    head.name = 'head';
    headGroup.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(params.size * 0.08);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-params.size * 0.12, params.size * 0.15, params.size * 0.35);
    leftEye.name = 'leftEye';
    headGroup.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(params.size * 0.12, params.size * 0.15, params.size * 0.35);
    rightEye.name = 'rightEye';
    headGroup.add(rightEye);

    return headGroup;
  }

  generateLimbs(): Object3D[] {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    return this.generateLegs(params, mat);
  }

  generateAppendages(): Object3D[] {
    const params = this.getDefaultConfig();
    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.5 });
    const app: Object3D[] = [];
    app.push(...this.generateAntennae(params, mat));
    if (params.hasWings) {
      app.push(...this.generateWings(params));
    }
    return app;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: InsectSpecies, params: InsectParameters): void {
    switch (species) {
      case 'ant':
        params.size = 0.02; params.legCount = 6; params.hasWings = false;
        params.primaryColor = '#2F2F2F'; params.wingType = 'bee'; break;
      case 'bee':
        params.size = 0.03; params.legCount = 6; params.hasWings = true;
        params.primaryColor = '#FFD700'; params.wingType = 'bee'; break;
      case 'beetle':
        params.size = 0.05; params.legCount = 6; params.hasWings = true;
        params.primaryColor = '#228B22'; params.wingType = 'beetle'; break;
      case 'butterfly':
        params.size = 0.08; params.legCount = 6; params.hasWings = true;
        params.primaryColor = '#FF69B4'; params.wingType = 'butterfly'; break;
      case 'spider':
        params.size = 0.04; params.legCount = 8; params.hasWings = false;
        params.primaryColor = '#2F2F2F'; params.wingType = 'bee'; break;
      case 'grasshopper':
        params.size = 0.06; params.legCount = 6; params.hasWings = true;
        params.primaryColor = '#228B22'; params.wingType = 'dragonfly'; break;
    }
  }

  /**
   * Create a LatheGeometry segment from a profile.
   * The profile is [t, radiusFactor] pairs.
   */
  private createSegmentLatheGeometry(
    profile: [number, number][],
    maxRadius: number,
    length: number,
  ): LatheGeometry {
    const segments = 16;
    const points: Vector2[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let r = 0;
      for (let c = 0; c < profile.length - 1; c++) {
        const [t0, r0] = profile[c];
        const [t1, r1] = profile[c + 1];
        if (t >= t0 && t <= t1) {
          const localT = (t - t0) / (t1 - t0);
          const st = localT * localT * (3 - 2 * localT);
          r = r0 + (r1 - r0) * st;
          break;
        }
      }
      points.push(new Vector2(Math.max(0.001, r * maxRadius), t * length));
    }

    return new LatheGeometry(points, 12);
  }

  private generateBodySegments(params: InsectParameters, mat: MeshStandardMaterial): Mesh[] {
    const s = params.size;
    const segments: Mesh[] = [];

    // Head - small, round using LatheGeometry
    const headProfile: [number, number][] = [
      [0.0, 0.05],
      [0.15, 0.50],
      [0.35, 0.90],
      [0.50, 1.00],
      [0.70, 0.85],
      [0.85, 0.50],
      [1.0, 0.10],
    ];
    const headGeo = this.createSegmentLatheGeometry(headProfile, s * 0.2, s * 0.2);
    const head = new Mesh(headGeo, mat);
    head.position.set(0, s * 0.1, s * 0.3);
    head.rotation.x = Math.PI / 2;
    head.name = 'head';
    segments.push(head);

    // Thorax - medium ellipsoid using LatheGeometry
    const thoraxProfile: [number, number][] = [
      [0.0, 0.08],
      [0.10, 0.40],
      [0.25, 0.80],
      [0.45, 1.00],
      [0.65, 0.90],
      [0.80, 0.55],
      [1.0, 0.08],
    ];
    const thoraxGeo = this.createSegmentLatheGeometry(thoraxProfile, s * 0.18, s * 0.25);
    const thorax = new Mesh(thoraxGeo, mat);
    thorax.position.set(0, s * 0.05, 0);
    thorax.rotation.x = Math.PI / 2;
    thorax.name = 'thorax';
    segments.push(thorax);

    // Abdomen - larger, more elongated using LatheGeometry
    const abdomenProfile: [number, number][] = [
      [0.0, 0.05],
      [0.08, 0.35],
      [0.20, 0.70],
      [0.35, 0.95],
      [0.50, 1.00],
      [0.65, 0.85],
      [0.80, 0.55],
      [0.90, 0.30],
      [1.0, 0.05],
    ];
    const abdomenGeo = this.createSegmentLatheGeometry(abdomenProfile, s * 0.22, s * 0.4);
    const smoothedAbdomenGeo = smoothCreatureJunction(abdomenGeo, 1);
    const abdomen = new Mesh(smoothedAbdomenGeo, mat);
    abdomen.position.set(0, s * 0.05, -s * 0.4);
    abdomen.rotation.x = Math.PI / 2;
    abdomen.name = 'abdomen';
    segments.push(abdomen);

    return segments;
  }

  private generateLegs(params: InsectParameters, mat: MeshStandardMaterial): Group[] {
    const s = params.size;
    const legs: Group[] = [];
    const numPairs = Math.floor(params.legCount / 2);

    for (let pair = 0; pair < numPairs; pair++) {
      for (const side of [-1, 1]) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${pair}`;
        const zOffset = -s * 0.05 + pair * s * 0.1;

        // Upper leg segment
        const upperLen = s * 0.3;
        const upperGeo = this.createCylinderGeometry(s * 0.015, s * 0.012, upperLen);
        const upper = new Mesh(upperGeo, mat);
        upper.rotation.z = side * 0.8;
        upper.position.set(side * s * 0.1, -s * 0.05, zOffset);
        legGroup.add(upper);

        // Lower leg segment
        const lowerLen = s * 0.35;
        const lowerGeo = this.createCylinderGeometry(s * 0.012, s * 0.005, lowerLen);
        const lower = new Mesh(lowerGeo, mat);
        lower.rotation.z = side * 0.4;
        lower.position.set(side * s * 0.2, -s * 0.2, zOffset);
        legGroup.add(lower);

        legs.push(legGroup);
      }
    }

    return legs;
  }

  private generateAntennae(params: InsectParameters, mat: MeshStandardMaterial): Group[] {
    const s = params.size;
    const antennae: Group[] = [];

    for (const side of [-1, 1]) {
      const group = new Group();
      group.name = side === -1 ? 'leftAntenna' : 'rightAntenna';

      // Antenna stalk
      const stalkGeo = this.createCylinderGeometry(s * 0.008, s * 0.005, s * 0.3);
      const stalk = new Mesh(stalkGeo, mat);
      stalk.rotation.z = side * -0.6;
      stalk.rotation.x = -0.3;
      stalk.position.set(side * s * 0.08, s * 0.25, s * 0.35);
      group.add(stalk);

      // Tip
      const tipGeo = this.createSphereGeometry(s * 0.02);
      const tip = new Mesh(tipGeo, mat);
      tip.position.set(side * s * 0.18, s * 0.38, s * 0.4);
      group.add(tip);

      antennae.push(group);
    }

    return antennae;
  }

  /**
   * Generate insect wings with proper wing outlines and vein patterns.
   *
   * Instead of flat ellipsoids, this creates recognizable wing shapes using
   * ShapeGeometry with species-specific outlines:
   *   - Butterfly: rounded forewing + hindwing with scalloped edges
   *   - Dragonfly: long, narrow wings with dense vein network
   *   - Bee: small, transparent wings with simple vein pattern
   *   - Beetle: hardened elytra (wing cases)
   *
   * Vein patterns are generated procedurally using recursive branching
   * from the wing root, producing a realistic network of veins.
   */
  private generateWings(params: InsectParameters): Group[] {
    const s = params.size;
    const wings: Group[] = [];

    for (const side of [-1, 1]) {
      const wingGroup = new Group();
      wingGroup.name = side === -1 ? 'leftWing' : 'rightWing';

      switch (params.wingType) {
        case 'butterfly':
          this.buildButterflyWings(wingGroup, s, side, params.primaryColor);
          break;
        case 'dragonfly':
          this.buildDragonflyWings(wingGroup, s, side);
          break;
        case 'bee':
          this.buildBeeWings(wingGroup, s, side);
          break;
        case 'beetle':
          this.buildBeetleWings(wingGroup, s, side, params.primaryColor);
          break;
        default:
          this.buildBeeWings(wingGroup, s, side);
      }

      wings.push(wingGroup);
    }

    return wings;
  }

  // ── Butterfly Wings ──────────────────────────────────────────────

  /**
   * Build butterfly wings with proper wing outlines and vein patterns.
   * Butterflies have 4 wings per side (forewing + hindwing), but we simplify
   * to 2 per side with distinctive shapes.
   */
  private buildButterflyWings(
    group: Group, s: number, side: number, color: string,
  ): void {
    const wingSpan = s * 0.4;
    const wingMat = new MeshStandardMaterial({
      color: color === '#FF69B4' ? 0xffaacc : 0xffaacc,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3,
      side: DoubleSide,
    });
    const veinMat = new MeshStandardMaterial({
      color: 0x2a1a0a,
      roughness: 0.6,
      side: DoubleSide,
    });

    // Forewing — larger, more triangular with rounded tip
    const foreShape = new Shape();
    const fw = wingSpan;
    const fh = wingSpan * 0.6;
    foreShape.moveTo(0, 0);
    foreShape.bezierCurveTo(
      fw * 0.15, fh * 0.5,
      fw * 0.5, fh * 0.9,
      fw * 0.8, fh * 0.7,
    );
    foreShape.bezierCurveTo(
      fw * 0.95, fh * 0.5,
      fw * 1.0, fh * 0.2,
      fw * 0.9, 0,
    );
    // Scalloped trailing edge
    const scallops = 5;
    for (let i = 0; i < scallops; i++) {
      const t0 = 1 - (i / scallops);
      const t1 = 1 - ((i + 0.5) / scallops);
      const t2 = 1 - ((i + 1) / scallops);
      const x0 = fw * t0 * 0.9;
      const x1 = fw * t1 * 0.9;
      const x2 = fw * t2 * 0.9;
      const y0 = -fh * 0.05 * Math.sin(i * 0.5);
      const y1 = -fh * 0.08;
      const y2 = -fh * 0.05 * Math.sin((i + 1) * 0.5);
      foreShape.quadraticCurveTo(x1, y1, x2, y2);
    }
    foreShape.lineTo(0, 0);

    const foreGeo = new ShapeGeometry(foreShape, 12);
    const forewing = new Mesh(foreGeo, wingMat);
    forewing.name = 'forewing';
    forewing.scale.x = side;
    group.add(forewing);

    // Hindwing — smaller, more rounded
    const hindShape = new Shape();
    const hw = wingSpan * 0.7;
    const hh = wingSpan * 0.4;
    hindShape.moveTo(0, 0);
    hindShape.bezierCurveTo(
      hw * 0.15, -hh * 0.3,
      hw * 0.5, -hh * 0.8,
      hw * 0.7, -hh * 0.6,
    );
    hindShape.bezierCurveTo(
      hw * 0.9, -hh * 0.4,
      hw * 0.8, -hh * 0.1,
      hw * 0.5, -hh * 0.05,
    );
    // Scalloped trailing edge for hindwing
    for (let i = 0; i < 4; i++) {
      const t0 = 1 - (i / 4);
      const t1 = 1 - ((i + 0.5) / 4);
      const t2 = 1 - ((i + 1) / 4);
      const x0 = hw * t0 * 0.5;
      const x1 = hw * t1 * 0.5;
      const x2 = hw * t2 * 0.5;
      const y0 = -hh * 0.1 - hh * 0.05 * Math.sin(i * 0.7);
      const y1 = -hh * 0.15;
      const y2 = -hh * 0.1 - hh * 0.05 * Math.sin((i + 1) * 0.7);
      hindShape.quadraticCurveTo(x1, y1, x2, y2);
    }
    hindShape.lineTo(0, 0);

    const hindGeo = new ShapeGeometry(hindShape, 10);
    const hindwing = new Mesh(hindGeo, wingMat.clone());
    (hindwing.material as MeshStandardMaterial).color.set(0xcc4488);
    hindwing.position.z = -s * 0.01;
    hindwing.name = 'hindwing';
    hindwing.scale.x = side;
    group.add(hindwing);

    // ── Vein patterns ──────────────────────────────────────────
    this.generateVeinPattern(group, veinMat, fw, fh, side, 'forewing');
    this.generateVeinPattern(group, veinMat, hw, hh, side, 'hindwing');

    // Position the wing group
    group.position.set(side * s * 0.15, s * 0.15, -s * 0.05);
    group.rotation.z = side * -0.3;
    group.rotation.y = side * 0.2;
  }

  // ── Dragonfly Wings ──────────────────────────────────────────────

  /**
   * Build dragonfly wings: long, narrow with dense vein network.
   * Dragonflies have 4 wings (2 per side) that are similar in size.
   */
  private buildDragonflyWings(group: Group, s: number, side: number): void {
    const wingSpan = s * 0.5;
    const wingMat = new MeshStandardMaterial({
      color: 0xddddff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
      side: DoubleSide,
    });
    const veinMat = new MeshStandardMaterial({
      color: 0x1a1a2a,
      roughness: 0.5,
      side: DoubleSide,
    });

    // Forewing — slightly wider
    const foreShape = new Shape();
    const fw = wingSpan;
    const fh = wingSpan * 0.15; // Narrow wings
    foreShape.moveTo(0, 0);
    foreShape.bezierCurveTo(fw * 0.2, fh * 0.8, fw * 0.6, fh * 0.9, fw, fh * 0.3);
    foreShape.bezierCurveTo(fw * 0.8, -fh * 0.1, fw * 0.3, -fh * 0.15, 0, 0);

    const foreGeo = new ShapeGeometry(foreShape, 10);
    const forewing = new Mesh(foreGeo, wingMat);
    forewing.name = 'forewing';
    forewing.scale.x = side;
    group.add(forewing);

    // Hindwing — slightly shorter, same width
    const hindShape = new Shape();
    const hw = wingSpan * 0.85;
    const hh = wingSpan * 0.15;
    hindShape.moveTo(0, 0);
    hindShape.bezierCurveTo(hw * 0.2, -hh * 0.6, hw * 0.6, -hh * 0.8, hw, -hh * 0.2);
    hindShape.bezierCurveTo(hw * 0.7, hh * 0.1, hw * 0.3, hh * 0.15, 0, 0);

    const hindGeo = new ShapeGeometry(hindShape, 10);
    const hindwing = new Mesh(hindGeo, wingMat);
    hindwing.position.z = -s * 0.01;
    hindwing.name = 'hindwing';
    hindwing.scale.x = side;
    group.add(hindwing);

    // Dense vein network for dragonfly
    this.generateDragonflyVeins(group, veinMat, fw, fh, side, 'forewing');
    this.generateDragonflyVeins(group, veinMat, hw, hh, side, 'hindwing');

    group.position.set(side * s * 0.15, s * 0.15, -s * 0.05);
    group.rotation.z = side * -0.2;
    group.rotation.y = side * 0.15;
  }

  // ── Bee Wings ────────────────────────────────────────────────────

  /**
   * Build bee wings: small, transparent with simple vein pattern.
   */
  private buildBeeWings(group: Group, s: number, side: number): void {
    const wingSpan = s * 0.3;
    const wingMat = new MeshStandardMaterial({
      color: 0xccccdd,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      side: DoubleSide,
    });
    const veinMat = new MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.5,
      side: DoubleSide,
    });

    // Simple oval wing
    const wingShape = new Shape();
    const ww = wingSpan;
    const wh = wingSpan * 0.3;
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(ww * 0.2, wh * 0.8, ww * 0.6, wh * 0.9, ww, wh * 0.2);
    wingShape.bezierCurveTo(ww * 0.8, -wh * 0.3, ww * 0.3, -wh * 0.4, 0, 0);

    const wingGeo = new ShapeGeometry(wingShape, 8);
    const wing = new Mesh(wingGeo, wingMat);
    wing.name = 'wing';
    wing.scale.x = side;
    group.add(wing);

    // Simple vein pattern (3 main veins)
    for (let v = 0; v < 3; v++) {
      const t = 0.3 + v * 0.25;
      const veinLen = wingSpan * t * 0.7;
      const veinGeo = new CylinderGeometry(s * 0.002, s * 0.003, veinLen, 4);
      const vein = new Mesh(veinGeo, veinMat);
      vein.position.set(side * veinLen * 0.3, 0, 0);
      vein.rotation.z = side * (-Math.PI / 2 + v * 0.12);
      vein.name = `vein_${v}`;
      group.add(vein);
    }

    group.position.set(side * s * 0.15, s * 0.15, -s * 0.05);
    group.rotation.z = side * -0.4;
  }

  // ── Beetle Wings (Elytra) ────────────────────────────────────────

  /**
   * Build beetle elytra (hardened wing cases).
   * These are opaque, colored wing covers that don't have visible veins.
   */
  private buildBeetleWings(group: Group, s: number, side: number, color: string): void {
    const wingSpan = s * 0.25;
    const wingMat = new MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0.2,
      side: DoubleSide,
    });

    // Hardened elytron shape
    const elytraShape = new Shape();
    const ew = wingSpan;
    const eh = wingSpan * 0.25;
    elytraShape.moveTo(0, 0);
    elytraShape.bezierCurveTo(ew * 0.1, eh * 0.7, ew * 0.5, eh * 0.8, ew * 0.8, eh * 0.3);
    elytraShape.bezierCurveTo(ew * 0.9, eh * 0.1, ew * 0.7, -eh * 0.2, ew * 0.4, -eh * 0.15);
    elytraShape.bezierCurveTo(ew * 0.2, -eh * 0.1, 0, 0, 0, 0);

    const elytraGeo = new ShapeGeometry(elytraShape, 8);
    const elytra = new Mesh(elytraGeo, wingMat);
    elytra.name = 'elytra';
    elytra.scale.x = side;
    // Elytra curve over the abdomen
    elytra.position.y = s * 0.03;
    group.add(elytra);

    group.position.set(side * s * 0.08, s * 0.1, -s * 0.1);
    group.rotation.z = side * -0.2;
  }

  // ── Vein Pattern Generation ──────────────────────────────────────

  /**
   * Generate a recursive branching vein pattern on a wing.
   *
   * The pattern starts from the wing root and branches outward toward
   * the wing edges, similar to how real insect wings develop their veins.
   * Each vein is rendered as a thin CylinderGeometry.
   *
   * @param group - The wing group to add veins to
   * @param mat - Material for veins
   * @param wingWidth - Wing width (spanwise)
   * @param wingHeight - Wing height (chordwise)
   * @param side - -1 for left, 1 for right
   * @param prefix - Name prefix for veins
   */
  private generateVeinPattern(
    group: Group, mat: MeshStandardMaterial,
    wingWidth: number, wingHeight: number, side: number, prefix: string,
  ): void {
    // Main veins: 4-5 veins radiating from the wing root
    const mainVeinCount = 5;
    for (let v = 0; v < mainVeinCount; v++) {
      const angle = -0.3 + (v / (mainVeinCount - 1)) * 0.8; // Spread angle
      const veinLength = wingWidth * (0.5 + v * 0.1);

      this.addVeinBranch(
        group, mat,
        0, 0, // Start at wing root
        Math.cos(angle) * veinLength,
        Math.sin(angle) * wingHeight * 0.8,
        s => Math.max(0.001, s), // Thickness function
        wingWidth * 0.004, // Base thickness
        2, // Recursion depth
        `${prefix}_vein_${v}`,
        side,
      );
    }
  }

  /**
   * Generate dense vein network for dragonfly wings.
   * Dragonflies have many parallel veins connected by cross-veins.
   */
  private generateDragonflyVeins(
    group: Group, mat: MeshStandardMaterial,
    wingWidth: number, wingHeight: number, side: number, prefix: string,
  ): void {
    // Longitudinal veins (5-7 parallel veins from root to tip)
    const longVeinCount = 6;
    for (let v = 0; v < longVeinCount; v++) {
      const yOffset = (v / (longVeinCount - 1) - 0.5) * wingHeight * 1.5;
      const veinLen = wingWidth * 0.85;

      const veinGeo = new CylinderGeometry(
        wingWidth * 0.002, wingWidth * 0.003, veinLen, 3,
      );
      const vein = new Mesh(veinGeo, mat);
      vein.position.set(side * veinLen * 0.4, yOffset, 0);
      vein.rotation.z = side * -Math.PI / 2;
      vein.name = `${prefix}_longvein_${v}`;
      group.add(vein);
    }

    // Cross-veins connecting the longitudinal veins
    const crossVeinCount = 8;
    for (let c = 0; c < crossVeinCount; c++) {
      const xPos = wingWidth * (0.1 + c * 0.1);
      const crossLen = wingHeight * 0.8;

      const crossGeo = new CylinderGeometry(
        wingWidth * 0.001, wingWidth * 0.0015, crossLen, 3,
      );
      const crossVein = new Mesh(crossGeo, mat);
      crossVein.position.set(side * xPos, 0, 0);
      crossVein.name = `${prefix}_crossvein_${c}`;
      group.add(crossVein);
    }
  }

  /**
   * Recursively add a branching vein to a group.
   *
   * @param group - Group to add vein to
   * @param mat - Vein material
   * @param x0 - Start x
   * @param y0 - Start y
   * @param x1 - End x
   * @param y1 - End y
   * @param thicknessFn - Function to compute thickness at each recursion level
   * @param thickness - Current vein thickness
   * @param depth - Remaining recursion depth
   * @param name - Vein name
   * @param side - Wing side (-1 or 1)
   */
  private addVeinBranch(
    group: Group, mat: MeshStandardMaterial,
    x0: number, y0: number, x1: number, y1: number,
    thicknessFn: (t: number) => number,
    thickness: number, depth: number, name: string, side: number,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 0.001) return;

    const veinGeo = new CylinderGeometry(
      thicknessFn(thickness * 0.5),
      thicknessFn(thickness),
      length, 3,
    );

    const vein = new Mesh(veinGeo, mat);
    vein.position.set(side * (x0 + dx * 0.5), y0 + dy * 0.5, 0);

    // Orient vein along the direction
    const angle = Math.atan2(dy, dx);
    vein.rotation.z = side * (-Math.PI / 2 + angle * side);

    vein.name = name;
    group.add(vein);

    // Recurse: branch at the endpoint
    if (depth > 0 && length > 0.01) {
      const branchAngle1 = angle + 0.3;
      const branchAngle2 = angle - 0.3;
      const branchLength = length * 0.5;
      const newThickness = thickness * 0.5;

      this.addVeinBranch(
        group, mat,
        x1, y1,
        x1 + Math.cos(branchAngle1) * branchLength,
        y1 + Math.sin(branchAngle1) * branchLength,
        thicknessFn, newThickness, depth - 1, `${name}_a`, side,
      );
      this.addVeinBranch(
        group, mat,
        x1, y1,
        x1 + Math.cos(branchAngle2) * branchLength,
        y1 + Math.sin(branchAngle2) * branchLength,
        thicknessFn, newThickness, depth - 1, `${name}_b`, side,
      );
    }
  }
}
