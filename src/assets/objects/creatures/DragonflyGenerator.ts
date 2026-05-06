/**
 * DragonflyGenerator — Procedural dragonfly with elongated body,
 * compound eyes, and wing venation patterns.
 *
 * @module creatures
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, Shape, ShapeGeometry, DoubleSide, BufferGeometry, Float32BufferAttribute } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { SeededRandom } from '@/core/util/MathUtils';

export interface DragonflyParams extends CreatureParams {
  bodyColor: string;
  wingColor: string;
  wingOpacity: number;
  compoundEyeColor: string;
  abdomenPattern: 'solid' | 'striped' | 'spotted' | 'metallic';
}

export class DragonflyGenerator extends CreatureBase {
  private _rng: SeededRandom;
  private _params: DragonflyParams | null = null;

  constructor(params: Partial<DragonflyParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INSECT });
    this._rng = new SeededRandom(params.seed ?? 42);
  }

  getDefaultConfig(): DragonflyParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      bodyColor: '#2E8B57',
      wingColor: '#E0F0FF',
      wingOpacity: 0.4,
      compoundEyeColor: '#4169E1',
      abdomenPattern: 'striped',
    } as DragonflyParams;
  }

  generate(params: Partial<DragonflyParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };
    const s = this._params.size;

    const group = new Group();
    group.name = 'Dragonfly';

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

    const bodyGroup = new Group();
    bodyGroup.name = 'body';

    // Thorax (compact middle section)
    const thoraxMat = new MeshStandardMaterial({ color: params.bodyColor, roughness: 0.6, metalness: 0.1 });
    const thorax = new Mesh(this.createEllipsoidGeometry(s * 0.04, s * 0.04, s * 0.06), thoraxMat);
    thorax.name = 'thorax';
    bodyGroup.add(thorax);

    // Abdomen (long, slender, segmented)
    const abdomenGroup = new Group();
    abdomenGroup.name = 'abdomen';

    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const segRadius = s * 0.025 * (1 - t * 0.4); // Tapers toward tail
      const segLen = s * 0.025;
      const segMat = new MeshStandardMaterial({ color: params.bodyColor, roughness: 0.5 });

      // Apply pattern variation
      if (params.abdomenPattern === 'striped' && i % 2 === 0) {
        segMat.color = new THREE.Color(params.bodyColor).multiplyScalar(1.3);
      } else if (params.abdomenPattern === 'metallic') {
        segMat.metalness = 0.4;
        segMat.roughness = 0.2;
      }

      const seg = new Mesh(this.createEllipsoidGeometry(segRadius, segRadius * 0.8, segLen), segMat);
      seg.position.z = -s * 0.08 - i * segLen;
      abdomenGroup.add(seg);
    }

    // Tail appendages (cerci)
    const cerciMat = new MeshStandardMaterial({ color: params.bodyColor, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const cerciGeo = this.createCylinderGeometry(s * 0.003, s * 0.001, s * 0.04);
      const cerci = new Mesh(cerciGeo, cerciMat);
      cerci.rotation.z = side * 0.3;
      cerci.position.set(side * s * 0.01, 0, -s * 0.3);
      abdomenGroup.add(cerci);
    }

    bodyGroup.add(abdomenGroup);
    return bodyGroup;
  }

  generateHead(): Object3D {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;

    const group = new Group();
    group.name = 'headGroup';

    // Head (large, mostly eyes)
    const headMat = new MeshStandardMaterial({ color: params.bodyColor, roughness: 0.6 });
    const head = new Mesh(this.createEllipsoidGeometry(s * 0.03, s * 0.025, s * 0.025), headMat);
    head.position.z = s * 0.1;
    group.add(head);

    // Compound eyes (large, covering most of the head)
    const eyeMat = new MeshStandardMaterial({
      color: params.compoundEyeColor,
      roughness: 0.3,
      metalness: 0.2,
    });

    for (const side of [-1, 1]) {
      const eyeGeo = this.createSphereGeometry(s * 0.025);
      const eye = new Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.8, 1, 1); // Slightly flattened
      eye.position.set(side * s * 0.025, s * 0.005, s * 0.11);
      group.add(eye);

      // Compound eye facet texture (vertex color variation)
      const colors = new Float32Array(eyeGeo.attributes.position.count * 3);
      const rng = new SeededRandom(params.seed + side * 100);
      for (let i = 0; i < colors.length; i += 3) {
        const variation = rng.next() * 0.15;
        colors[i] = 0.25 + variation;     // R
        colors[i + 1] = 0.41 + variation; // G
        colors[i + 2] = 0.88 + variation; // B
      }
      eyeGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      eyeMat.vertexColors = true;
    }

    // Mouthparts (labium)
    const labiumMat = new MeshStandardMaterial({ color: '#3D2B1F' });
    const labiumGeo = this.createBoxGeometry(s * 0.015, s * 0.005, s * 0.03);
    const labium = new Mesh(labiumGeo, labiumMat);
    labium.position.set(0, -s * 0.02, s * 0.1);
    group.add(labium);

    // Short antennae (bristle-like)
    const antennaMat = new MeshStandardMaterial({ color: '#3D2B1F' });
    for (const side of [-1, 1]) {
      const antennaGeo = this.createCylinderGeometry(s * 0.002, s * 0.001, s * 0.03);
      const antenna = new Mesh(antennaGeo, antennaMat);
      antenna.rotation.z = side * 0.3;
      antenna.rotation.x = -0.5;
      antenna.position.set(side * s * 0.015, s * 0.02, s * 0.12);
      group.add(antenna);
    }

    return group;
  }

  generateLimbs(): Object3D[] {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: '#3D2B1F', roughness: 0.7 });
    const limbs: Object3D[] = [];

    // 6 legs (3 pairs), all clustered near thorax
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;

        const z = s * 0.03 - i * s * 0.025;
        // Femur
        const femurGeo = this.createCylinderGeometry(s * 0.004, s * 0.003, s * 0.03);
        const femur = new Mesh(femurGeo, legMat);
        femur.rotation.z = side * -0.8;
        femur.position.set(side * s * 0.05, -s * 0.02, z);
        legGroup.add(femur);

        // Tibia + tarsus
        const tibiaGeo = this.createCylinderGeometry(s * 0.003, s * 0.001, s * 0.04);
        const tibia = new Mesh(tibiaGeo, legMat);
        tibia.position.set(side * s * 0.07, -s * 0.05, z);
        legGroup.add(tibia);

        limbs.push(legGroup);
      }
    }

    return limbs;
  }

  generateAppendages(): Object3D[] {
    const params = this._params ?? this.getDefaultConfig();
    const s = params.size;
    const appendages: Object3D[] = [];

    // 4 wings (2 forewings, 2 hindwings) with venation
    const wingGroup = new Group();
    wingGroup.name = 'wings';

    for (let wingIdx = 0; wingIdx < 4; wingIdx++) {
      const isForewing = wingIdx < 2;
      const side = wingIdx % 2 === 0 ? -1 : 1;

      const wing = this.createDragonflyWing(s, isForewing, side, params);
      wing.position.set(side * s * 0.03, s * 0.03, isForewing ? s * 0.02 : -s * 0.02);
      wing.rotation.x = 0.1; // Slight dihedral angle
      wing.name = `${isForewing ? 'fore' : 'hind'}Wing_${side === -1 ? 'L' : 'R'}`;
      wingGroup.add(wing);
    }

    appendages.push(wingGroup);
    return appendages;
  }

  applySkin(materials: Material[]): Material[] {
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        // Dragonflies have slightly metallic bodies
        mat.roughness = Math.min(mat.roughness, 0.5);
        mat.metalness = Math.max(mat.metalness, 0.05);
      }
    }
    return materials;
  }

  // ── Wing Generation with Venation ──────────────────────────────────

  /**
   * Create a dragonfly wing with venation pattern.
   * Uses ShapeGeometry for the wing outline and line geometry for veins.
   */
  private createDragonflyWing(
    s: number,
    isForewing: boolean,
    side: number,
    params: DragonflyParams,
  ): Group {
    const wingGroup = new Group();

    // Wing shape: elongated, narrow for dragonfly
    const wingLength = isForewing ? s * 0.25 : s * 0.22;
    const wingWidth = isForewing ? s * 0.04 : s * 0.035;

    const shape = new Shape();
    shape.moveTo(0, 0);
    // Leading edge (curved)
    shape.bezierCurveTo(
      wingLength * 0.3, wingWidth * 1.2,
      wingLength * 0.7, wingWidth * 0.8,
      wingLength, wingWidth * 0.1,
    );
    // Tip
    shape.bezierCurveTo(
      wingLength * 1.02, -wingWidth * 0.05,
      wingLength * 0.98, -wingWidth * 0.15,
      wingLength * 0.95, -wingWidth * 0.2,
    );
    // Trailing edge (less curved)
    shape.bezierCurveTo(
      wingLength * 0.6, -wingWidth * 0.5,
      wingLength * 0.2, -wingWidth * 0.3,
      0, 0,
    );

    const wingGeo = new ShapeGeometry(shape);
    const wingMat = new MeshStandardMaterial({
      color: params.wingColor,
      transparent: true,
      opacity: params.wingOpacity,
      roughness: 0.1,
      metalness: 0.0,
      side: DoubleSide,
      depthWrite: false,
    });

    const wing = new Mesh(wingGeo, wingMat);
    wing.rotation.y = side * Math.PI * 0.5;
    wing.rotation.z = -Math.PI * 0.5;
    wingGroup.add(wing);

    // Vein geometry: longitudinal veins + cross-veins
    this.addWingVeins(wingGroup, wingLength, wingWidth, s, params.seed + (isForewing ? 0 : 50));

    // Pterostigma (dark spot near wing tip)
    const stigMat = new MeshStandardMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
    });
    const stigGeo = new THREE.ShapeGeometry(new THREE.Shape());
    const stigShape = new Shape();
    stigShape.moveTo(wingLength * 0.8, -wingWidth * 0.1);
    stigShape.lineTo(wingLength * 0.85, wingWidth * 0.2);
    stigShape.lineTo(wingLength * 0.9, wingWidth * 0.15);
    stigShape.lineTo(wingLength * 0.87, -wingWidth * 0.05);
    stigShape.lineTo(wingLength * 0.8, -wingWidth * 0.1);
    const stigGeo2 = new ShapeGeometry(stigShape);
    const stig = new Mesh(stigGeo2, stigMat);
    stig.rotation.y = side * Math.PI * 0.5;
    stig.rotation.z = -Math.PI * 0.5;
    wingGroup.add(stig);

    return wingGroup;
  }

  /**
   * Add vein lines to a dragonfly wing.
   * Dragonfly wings have:
   * - 5-7 longitudinal veins running from base to tip
   * - Many cross-veins connecting them
   */
  private addWingVeins(
    wingGroup: Group,
    wingLength: number,
    wingWidth: number,
    s: number,
    seed: number,
  ): void {
    const veinMat = new MeshStandardMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.5,
    });

    // Longitudinal veins
    const numLongVeins = 6;
    for (let v = 0; v < numLongVeins; v++) {
      const yFrac = (v / (numLongVeins - 1) - 0.5) * 2; // -1 to 1
      const veinY = yFrac * wingWidth * 0.4;

      // Create vein as a thin cylinder
      const veinLen = wingLength * (0.9 - Math.abs(yFrac) * 0.1);
      const veinGeo = this.createCylinderGeometry(s * 0.0005, s * 0.0003, veinLen);
      const vein = new Mesh(veinGeo, veinMat);
      vein.rotation.z = Math.PI * 0.5;
      vein.position.set(0, veinY, -veinLen * 0.5);
      vein.rotation.y = Math.PI * 0.5;
      wingGroup.add(vein);
    }

    // Cross-veins (perpendicular connections)
    const numCrossVeins = 12;
    for (let c = 0; c < numCrossVeins; c++) {
      const t = (c + 1) / (numCrossVeins + 1);
      const x = -wingLength * t;

      // Cross-vein spans from top to bottom vein
      const topY = wingWidth * 0.4 * (1 - t * 0.2);
      const botY = -wingWidth * 0.4 * (1 - t * 0.2);
      const crossLen = Math.abs(topY - botY);
      const crossGeo = this.createCylinderGeometry(s * 0.0003, s * 0.0002, crossLen);
      const cross = new Mesh(crossGeo, veinMat);
      cross.position.set(x, (topY + botY) * 0.5, 0);
      wingGroup.add(cross);
    }
  }
}

// Need THREE import for Shape geometry
import * as THREE from 'three';
