/**
 * HeadDetailGenerator - Detailed head part generators
 *
 * Provides EarGenerator, NoseGenerator, HornGenerator, and AntlerGenerator
 * matching the depth of Infinigen's parts/head_detail.py and parts/horn.py.
 *
 * Each generator returns mesh geometry, joint data for rigging, and
 * attachment points for connecting to a head skeleton bone.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/MathUtils';

// ── Shared Types ─────────────────────────────────────────────────────

/** Joint definition for rigging integration */
export interface Joint {
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  parentJoint?: string;
}

/** Result from a head detail generator */
export interface HeadDetailResult {
  mesh: THREE.Mesh | THREE.Group;
  joints: Record<string, Joint>;
  attachmentPoint: THREE.Vector3;
}

// ── Ear Generator ────────────────────────────────────────────────────

export type EarType = 'cat' | 'dog' | 'round' | 'long' | 'none';

export interface EarConfig {
  earType: EarType;
  earSize: number;
  earSpread: number;
  earRotation: number;
  innerColor: number;
  outerColor: number;
}

const DEFAULT_EAR_CONFIG: EarConfig = {
  earType: 'cat',
  earSize: 0.06,
  earSpread: 0.08,
  earRotation: 0.15,
  innerColor: 0xffcccc,
  outerColor: 0x8b7355,
};

export class EarGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(config: Partial<EarConfig> = {}): HeadDetailResult {
    const cfg = { ...DEFAULT_EAR_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'ears';

    const joints: Record<string, Joint> = {};

    for (const side of [-1, 1]) {
      const sideName = side === -1 ? 'L' : 'R';
      const earGroup = new THREE.Group();
      earGroup.name = `ear_${sideName}`;

      switch (cfg.earType) {
        case 'cat':
          this.buildCatEar(earGroup, cfg, side);
          break;
        case 'dog':
          this.buildDogEar(earGroup, cfg, side);
          break;
        case 'round':
          this.buildRoundEar(earGroup, cfg, side);
          break;
        case 'long':
          this.buildLongEar(earGroup, cfg, side);
          break;
        default:
          this.buildCatEar(earGroup, cfg, side);
      }

      // Position the ear on the head
      earGroup.position.set(
        side * cfg.earSpread,
        cfg.earSize * 0.8,
        cfg.earSize * 0.2,
      );
      earGroup.rotation.z = side * cfg.earRotation;
      group.add(earGroup);

      // Joint at ear base for ear twitch animation
      joints[`ear_${sideName}`] = {
        name: `ear_${sideName}`,
        position: earGroup.position.clone(),
        rotation: new THREE.Euler(0, 0, side * cfg.earRotation),
        bounds: {
          min: new THREE.Vector3(-0.3, -0.1, -0.2),
          max: new THREE.Vector3(0.3, 0.1, 0.2),
        },
      };
    }

    return {
      mesh: group,
      joints,
      attachmentPoint: new THREE.Vector3(0, cfg.earSize * 0.8, 0),
    };
  }

  /**
   * Cat ear: triangular pointed ear using polar bezier curve
   */
  private buildCatEar(group: THREE.Group, cfg: EarConfig, side: number): void {
    const s = cfg.earSize;
    const outerMat = new THREE.MeshStandardMaterial({
      color: cfg.outerColor,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: cfg.innerColor,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    // Outer ear shape: triangular with slightly curved sides
    const outerShape = new THREE.Shape();
    outerShape.moveTo(0, 0);
    outerShape.bezierCurveTo(
      -s * 0.5, s * 0.3,
      -s * 0.3, s * 0.8,
      0, s,
    );
    outerShape.bezierCurveTo(
      s * 0.3, s * 0.8,
      s * 0.5, s * 0.3,
      0, 0,
    );

    const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
      depth: s * 0.08,
      bevelEnabled: true,
      bevelThickness: s * 0.01,
      bevelSize: s * 0.01,
      bevelSegments: 2,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.name = `catEarOuter_${side}`;
    group.add(outerMesh);

    // Inner ear: smaller, pinkish triangle
    const innerShape = new THREE.Shape();
    innerShape.moveTo(0, s * 0.1);
    innerShape.bezierCurveTo(
      -s * 0.3, s * 0.35,
      -s * 0.2, s * 0.7,
      0, s * 0.85,
    );
    innerShape.bezierCurveTo(
      s * 0.2, s * 0.7,
      s * 0.3, s * 0.35,
      0, s * 0.1,
    );

    const innerGeo = new THREE.ShapeGeometry(innerShape);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.z = s * 0.05;
    innerMesh.name = `catEarInner_${side}`;
    group.add(innerMesh);
  }

  /**
   * Dog ear: floppy drooping shape
   */
  private buildDogEar(group: THREE.Group, cfg: EarConfig, side: number): void {
    const s = cfg.earSize;
    const droop = this.rng.nextFloat(0.4, 0.8); // How much the ear droops

    const outerMat = new THREE.MeshStandardMaterial({
      color: cfg.outerColor,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    // Floppy ear shape: starts upright then curves down
    const shape = new THREE.Shape();
    shape.moveTo(-s * 0.3, 0);
    shape.bezierCurveTo(
      -s * 0.4, s * 0.3,
      -s * 0.35, s * 0.6,
      -s * 0.2, s * (0.8 - droop * 0.3),
    );
    shape.bezierCurveTo(
      -s * 0.1, s * (1.0 - droop * 0.5),
      s * 0.05, s * (0.7 - droop * 0.4),
      s * 0.1, s * (0.3 - droop * 0.2),
    );
    shape.bezierCurveTo(
      s * 0.15, s * 0.1,
      s * 0.1, 0,
      s * 0.2, -s * droop * 0.3,
    );
    shape.lineTo(-s * 0.3, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: s * 0.06,
      bevelEnabled: true,
      bevelThickness: s * 0.01,
      bevelSize: s * 0.01,
      bevelSegments: 2,
    });
    const mesh = new THREE.Mesh(geo, outerMat);
    mesh.name = `dogEar_${side}`;
    group.add(mesh);
  }

  /**
   * Round ear: mouse/rabbit style circular ear
   */
  private buildRoundEar(group: THREE.Group, cfg: EarConfig, side: number): void {
    const s = cfg.earSize;

    const outerMat = new THREE.MeshStandardMaterial({
      color: cfg.outerColor,
      roughness: 0.7,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: cfg.innerColor,
      roughness: 0.6,
    });

    // Outer disc
    const outerGeo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.06, 16);
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.rotation.z = Math.PI / 2;
    outerMesh.name = `roundEarOuter_${side}`;
    group.add(outerMesh);

    // Inner disc (slightly smaller, different color)
    const innerGeo = new THREE.CylinderGeometry(s * 0.35, s * 0.35, s * 0.07, 16);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.rotation.z = Math.PI / 2;
    innerMesh.position.x = s * 0.01;
    innerMesh.name = `roundEarInner_${side}`;
    group.add(innerMesh);
  }

  /**
   * Long ear: rabbit-like elongated ear
   */
  private buildLongEar(group: THREE.Group, cfg: EarConfig, side: number): void {
    const s = cfg.earSize;
    const length = s * this.rng.nextFloat(2.5, 4.0);

    const outerMat = new THREE.MeshStandardMaterial({
      color: cfg.outerColor,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: cfg.innerColor,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    // Elongated elliptical ear shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(
      -s * 0.25, s * 0.3,
      -s * 0.2, length * 0.7,
      0, length,
    );
    shape.bezierCurveTo(
      s * 0.2, length * 0.7,
      s * 0.25, s * 0.3,
      0, 0,
    );

    const outerGeo = new THREE.ExtrudeGeometry(shape, {
      depth: s * 0.06,
      bevelEnabled: true,
      bevelThickness: s * 0.01,
      bevelSize: s * 0.01,
      bevelSegments: 2,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.name = `longEarOuter_${side}`;
    group.add(outerMesh);

    // Inner stripe
    const innerShape = new THREE.Shape();
    innerShape.moveTo(0, s * 0.15);
    innerShape.bezierCurveTo(
      -s * 0.12, s * 0.35,
      -s * 0.1, length * 0.65,
      0, length * 0.85,
    );
    innerShape.bezierCurveTo(
      s * 0.1, length * 0.65,
      s * 0.12, s * 0.35,
      0, s * 0.15,
    );

    const innerGeo = new THREE.ShapeGeometry(innerShape);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.z = s * 0.04;
    innerMesh.name = `longEarInner_${side}`;
    group.add(innerMesh);
  }
}

// ── Nose Generator ───────────────────────────────────────────────────

export type NoseType = 'cat' | 'dog' | 'human' | 'snout' | 'beak';

export interface NoseConfig {
  noseType: NoseType;
  noseSize: number;
  nostrilWidth: number;
  bridgeHeight: number;
  color: number;
  nostrilColor: number;
}

const DEFAULT_NOSE_CONFIG: NoseConfig = {
  noseType: 'cat',
  noseSize: 0.03,
  nostrilWidth: 0.008,
  bridgeHeight: 0.01,
  color: 0x3a2a2a,
  nostrilColor: 0x1a0a0a,
};

export class NoseGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(config: Partial<NoseConfig> = {}): HeadDetailResult {
    const cfg = { ...DEFAULT_NOSE_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'nose';

    const joints: Record<string, Joint> = {};

    switch (cfg.noseType) {
      case 'cat':
        this.buildCatNose(group, cfg);
        break;
      case 'dog':
        this.buildDogNose(group, cfg);
        break;
      case 'human':
        this.buildHumanNose(group, cfg);
        break;
      case 'snout':
        this.buildSnoutNose(group, cfg);
        break;
      case 'beak':
        this.buildBeakNose(group, cfg);
        break;
      default:
        this.buildCatNose(group, cfg);
    }

    // Joint at nose tip for sniffing animation
    joints['nose'] = {
      name: 'nose',
      position: new THREE.Vector3(0, 0, cfg.noseSize),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.3, -0.2, -0.1),
        max: new THREE.Vector3(0.3, 0.2, 0.3),
      },
    };

    return {
      mesh: group,
      joints,
      attachmentPoint: new THREE.Vector3(0, 0, cfg.noseSize * 1.5),
    };
  }

  /**
   * Cat nose: small triangular shape with nostril indentations
   */
  private buildCatNose(group: THREE.Group, cfg: NoseConfig): void {
    const s = cfg.noseSize;
    const noseMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const nostrilMat = new THREE.MeshStandardMaterial({ color: cfg.nostrilColor, roughness: 0.9 });

    // Triangular nose pad
    const shape = new THREE.Shape();
    shape.moveTo(0, s * 0.5);
    shape.bezierCurveTo(-s * 0.4, s * 0.2, -s * 0.5, -s * 0.2, 0, -s * 0.3);
    shape.bezierCurveTo(s * 0.5, -s * 0.2, s * 0.4, s * 0.2, 0, s * 0.5);

    const noseGeo = new THREE.ExtrudeGeometry(shape, {
      depth: s * 0.3,
      bevelEnabled: true,
      bevelThickness: s * 0.05,
      bevelSize: s * 0.03,
      bevelSegments: 2,
    });
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    noseMesh.rotation.x = -Math.PI / 2;
    noseMesh.name = 'catNose';
    group.add(noseMesh);

    // Nostrils: two small indentations
    for (const side of [-1, 1]) {
      const nostrilGeo = new THREE.SphereGeometry(cfg.nostrilWidth, 8, 8);
      nostrilGeo.scale(1.5, 0.5, 1.0);
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * s * 0.15, -s * 0.05, s * 0.2);
      nostril.name = `nostril_${side}`;
      group.add(nostril);
    }
  }

  /**
   * Dog nose: larger rounded shape
   */
  private buildDogNose(group: THREE.Group, cfg: NoseConfig): void {
    const s = cfg.noseSize * 1.5;
    const noseMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4 });
    const nostrilMat = new THREE.MeshStandardMaterial({ color: cfg.nostrilColor, roughness: 0.9 });

    // Rounded nose
    const noseGeo = new THREE.SphereGeometry(s * 0.4, 12, 12);
    noseGeo.scale(1.0, 0.7, 0.8);
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    noseMesh.name = 'dogNose';
    group.add(noseMesh);

    // Nostrils
    for (const side of [-1, 1]) {
      const nostrilGeo = new THREE.SphereGeometry(cfg.nostrilWidth * 1.2, 8, 8);
      nostrilGeo.scale(1.2, 0.6, 1.0);
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * s * 0.15, -s * 0.05, s * 0.2);
      nostril.name = `nostril_${side}`;
      group.add(nostril);
    }
  }

  /**
   * Human-like nose: bridge + nostrils + tip
   */
  private buildHumanNose(group: THREE.Group, cfg: NoseConfig): void {
    const s = cfg.noseSize;
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.6 });

    // Bridge
    const bridgeGeo = new THREE.CylinderGeometry(s * 0.1, s * 0.15, cfg.bridgeHeight * 2, 8);
    bridgeGeo.scale(0.8, 1.0, 1.2);
    const bridge = new THREE.Mesh(bridgeGeo, mat);
    bridge.position.y = cfg.bridgeHeight * 0.5;
    bridge.name = 'noseBridge';
    group.add(bridge);

    // Tip (ball)
    const tipGeo = new THREE.SphereGeometry(s * 0.15, 10, 10);
    const tip = new THREE.Mesh(tipGeo, mat);
    tip.position.set(0, -cfg.bridgeHeight * 0.5, s * 0.1);
    tip.name = 'noseTip';
    group.add(tip);

    // Nostrils
    const nostrilMat = new THREE.MeshStandardMaterial({ color: cfg.nostrilColor, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const nostrilGeo = new THREE.SphereGeometry(cfg.nostrilWidth, 8, 8);
      nostrilGeo.scale(1.0, 0.6, 1.0);
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * cfg.nostrilWidth * 1.5, -cfg.bridgeHeight * 0.8, s * 0.05);
      nostril.name = `nostril_${side}`;
      group.add(nostril);
    }
  }

  /**
   * Snout nose: pig-like with large nostrils
   */
  private buildSnoutNose(group: THREE.Group, cfg: NoseConfig): void {
    const s = cfg.noseSize * 1.3;
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const nostrilMat = new THREE.MeshStandardMaterial({ color: cfg.nostrilColor, roughness: 0.9 });

    // Flat disc-like snout
    const snoutGeo = new THREE.CylinderGeometry(s * 0.4, s * 0.45, s * 0.2, 12);
    const snout = new THREE.Mesh(snoutGeo, mat);
    snout.rotation.x = Math.PI / 2;
    snout.name = 'snout';
    group.add(snout);

    // Large nostrils
    for (const side of [-1, 1]) {
      const nostrilGeo = new THREE.CylinderGeometry(cfg.nostrilWidth * 1.5, cfg.nostrilWidth * 1.2, s * 0.1, 8);
      const nostril = new THREE.Mesh(nostrilGeo, nostrilMat);
      nostril.position.set(side * s * 0.15, -s * 0.03, s * 0.12);
      nostril.rotation.x = Math.PI / 2;
      nostril.name = `nostril_${side}`;
      group.add(nostril);
    }
  }

  /**
   * Beak nose: bird-like pointed shape
   */
  private buildBeakNose(group: THREE.Group, cfg: NoseConfig): void {
    const s = cfg.noseSize;
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4 });

    const beakGeo = new THREE.ConeGeometry(s * 0.2, s * 1.5, 8);
    const beak = new THREE.Mesh(beakGeo, mat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.z = s * 0.75;
    beak.name = 'beakNose';
    group.add(beak);
  }
}

// ── Horn Generator ───────────────────────────────────────────────────

export type HornType = 'goat' | 'gazelle' | 'bull' | 'spiral' | 'straight';

export interface HornConfig {
  hornType: HornType;
  turns: number;
  baseRadius: number;
  tipRadius: number;
  height: number;
  ridgeFrequency: number;
  ridgeAmplitude: number;
  color: number;
}

const DEFAULT_HORN_CONFIG: HornConfig = {
  hornType: 'goat',
  turns: 1.5,
  baseRadius: 0.02,
  tipRadius: 0.005,
  height: 0.15,
  ridgeFrequency: 8,
  ridgeAmplitude: 0.003,
  color: 0xd2b48c,
};

export class HornGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(config: Partial<HornConfig> = {}): HeadDetailResult {
    const cfg = { ...DEFAULT_HORN_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'horns';

    const joints: Record<string, Joint> = {};

    for (const side of [-1, 1]) {
      const sideName = side === -1 ? 'L' : 'R';
      const hornMesh = this.createHorn(cfg, side);
      hornMesh.position.set(side * cfg.baseRadius * 2, cfg.height * 0.3, 0);
      hornMesh.rotation.z = side * -0.3;
      hornMesh.name = `horn_${sideName}`;
      group.add(hornMesh);

      // Joint at horn base
      joints[`horn_${sideName}`] = {
        name: `horn_${sideName}`,
        position: hornMesh.position.clone(),
        rotation: new THREE.Euler(0, 0, side * -0.3),
        bounds: {
          min: new THREE.Vector3(-0.1, -0.1, -0.1),
          max: new THREE.Vector3(0.1, 0.1, 0.1),
        },
      };
    }

    return {
      mesh: group,
      joints,
      attachmentPoint: new THREE.Vector3(0, cfg.height * 0.3, 0),
    };
  }

  /**
   * Create a single horn with spiral curve and ridge modulation
   */
  private createHorn(cfg: HornConfig, side: number): THREE.Mesh {
    // Build spiral curve based on horn type
    const curve = this.buildHornCurve(cfg, side);
    const segments = 32;

    // Build tube geometry with ridge modulation
    const points = curve.getPoints(segments);
    const tangents: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      tangents.push(new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize());
    }
    tangents.push(tangents[tangents.length - 1].clone());

    // Build tube by creating rings of vertices with modulated radius
    const radialSegments = 8;
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const center = points[i];
      const tangent = tangents[i];

      // Interpolate radius from base to tip
      let radius = THREE.MathUtils.lerp(cfg.baseRadius, cfg.tipRadius, t);

      // Ridge modulation: sinusoidal bumps along the horn
      if (cfg.ridgeFrequency > 0 && cfg.ridgeAmplitude > 0) {
        radius += cfg.ridgeAmplitude * Math.sin(t * cfg.ridgeFrequency * Math.PI * 2);
      }

      // Noise displacement for surface roughness
      radius += this.rng.nextFloat(-0.001, 0.001) * cfg.baseRadius;

      radius = Math.max(0.001, radius);

      // Build a frame at this point
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(tangent.dot(up)) > 0.99) {
        up.set(1, 0, 0);
      }
      const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);

        const vx = center.x + radius * (cos * normal.x + sin * binormal.x);
        const vy = center.y + radius * (cos * normal.y + sin * binormal.y);
        const vz = center.z + radius * (cos * normal.z + sin * binormal.z);

        vertices.push(vx, vy, vz);

        const nx = cos * normal.x + sin * binormal.x;
        const ny = cos * normal.y + sin * binormal.y;
        const nz = cos * normal.z + sin * binormal.z;
        normals.push(nx, ny, nz);

        uvs.push(i / segments, j / radialSegments);
      }
    }

    // Build triangle indices
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = a + radialSegments + 1;
        const c = a + 1;
        const d = b + 1;

        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.4,
      metalness: 0.1,
    });

    return new THREE.Mesh(geo, mat);
  }

  /**
   * Build the parametric spiral curve for the horn
   */
  private buildHornCurve(cfg: HornConfig, side: number): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [];
    const segments = 32;

    switch (cfg.hornType) {
      case 'goat': {
        // Tight spiral: close-coiled
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = t * cfg.turns * Math.PI * 2;
          const r = cfg.baseRadius * 2 * (1 - t * 0.3);
          const y = t * cfg.height;
          const x = side * Math.cos(angle) * r;
          const z = Math.sin(angle) * r;
          points.push(new THREE.Vector3(x, y, z));
        }
        break;
      }
      case 'gazelle': {
        // Straight with slight backward curve
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const x = side * (0.01 + t * 0.02);
          const y = t * cfg.height;
          const z = -t * t * cfg.height * 0.3; // backward curve
          points.push(new THREE.Vector3(x, y, z));
        }
        break;
      }
      case 'bull': {
        // Wide curve outward
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = t * 0.8 * Math.PI;
          const r = cfg.height * 0.4;
          const x = side * (Math.sin(angle) * r + cfg.baseRadius);
          const y = Math.cos(angle * 0.5) * cfg.height * (1 - t * 0.3);
          const z = -Math.cos(angle) * r * 0.3;
          points.push(new THREE.Vector3(x, y, z));
        }
        break;
      }
      case 'spiral': {
        // Generic spiral
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = t * cfg.turns * Math.PI * 2;
          const r = cfg.baseRadius * 3 * (1 - t * 0.5);
          const x = side * Math.cos(angle) * r;
          const y = t * cfg.height;
          const z = Math.sin(angle) * r;
          points.push(new THREE.Vector3(x, y, z));
        }
        break;
      }
      case 'straight':
      default: {
        // Simple straight horn with slight backward tilt
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const x = side * 0.01;
          const y = t * cfg.height;
          const z = -t * t * cfg.height * 0.15;
          points.push(new THREE.Vector3(x, y, z));
        }
        break;
      }
    }

    return new THREE.CatmullRomCurve3(points);
  }
}

// ── Antler Generator ─────────────────────────────────────────────────

export interface AntlerConfig {
  mainBeamLength: number;
  tineCount: number;
  tineLengths: number[];
  spreadAngle: number;
  baseRadius: number;
  color: number;
}

const DEFAULT_ANTLER_CONFIG: AntlerConfig = {
  mainBeamLength: 0.2,
  tineCount: 4,
  tineLengths: [0.06, 0.08, 0.05, 0.04],
  spreadAngle: 0.5,
  baseRadius: 0.01,
  color: 0x8b7355,
};

export class AntlerGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(config: Partial<AntlerConfig> = {}): HeadDetailResult {
    const cfg = { ...DEFAULT_ANTLER_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'antlers';

    const joints: Record<string, Joint> = {};

    for (const side of [-1, 1]) {
      const sideName = side === -1 ? 'L' : 'R';
      const antlerGroup = new THREE.Group();
      antlerGroup.name = `antler_${sideName}`;

      this.buildAntler(antlerGroup, cfg, side);

      antlerGroup.position.set(side * cfg.baseRadius * 3, cfg.mainBeamLength * 0.3, 0);
      antlerGroup.rotation.z = side * -cfg.spreadAngle * 0.3;
      group.add(antlerGroup);

      // Joint at antler base
      joints[`antler_${sideName}`] = {
        name: `antler_${sideName}`,
        position: antlerGroup.position.clone(),
        rotation: new THREE.Euler(0, 0, side * -cfg.spreadAngle * 0.3),
        bounds: {
          min: new THREE.Vector3(-0.1, -0.1, -0.1),
          max: new THREE.Vector3(0.1, 0.1, 0.1),
        },
      };
    }

    return {
      mesh: group,
      joints,
      attachmentPoint: new THREE.Vector3(0, cfg.mainBeamLength * 0.3, 0),
    };
  }

  /**
   * Build a branching antler structure
   */
  private buildAntler(group: THREE.Group, cfg: AntlerConfig, side: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.6,
      metalness: 0.05,
    });

    // Main beam: curved cylinder
    const beamPoints: THREE.Vector3[] = [];
    const beamSegments = 16;
    for (let i = 0; i <= beamSegments; i++) {
      const t = i / beamSegments;
      const x = side * t * cfg.mainBeamLength * 0.3;
      const y = t * cfg.mainBeamLength;
      const z = -t * t * cfg.mainBeamLength * 0.2;
      beamPoints.push(new THREE.Vector3(x, y, z));
    }

    const beamCurve = new THREE.CatmullRomCurve3(beamPoints);
    const beamGeo = new THREE.TubeGeometry(beamCurve, beamSegments, cfg.baseRadius, 6, false);
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.name = 'antlerBeam';
    group.add(beam);

    // Tines: branches at configurable positions along the beam
    const tineCount = Math.min(cfg.tineCount, cfg.tineLengths.length);
    for (let i = 0; i < tineCount; i++) {
      const t = (i + 1) / (tineCount + 1);
      const beamPos = beamCurve.getPoint(t);
      const tineLength = cfg.tineLengths[i];

      // Tine angle: forward and outward
      const angle = side * cfg.spreadAngle * (0.5 + i * 0.3);
      const tineDir = new THREE.Vector3(
        Math.sin(angle) * tineLength,
        Math.cos(angle * 0.5) * tineLength * 0.5,
        -Math.abs(Math.sin(angle)) * tineLength * 0.3,
      );

      const tineEnd = beamPos.clone().add(tineDir);
      const tineCurve = new THREE.CatmullRomCurve3([beamPos, tineEnd]);
      const tineRadius = cfg.baseRadius * (0.7 - i * 0.1);
      const tineGeo = new THREE.TubeGeometry(
        tineCurve,
        6,
        Math.max(0.002, tineRadius),
        5,
        false,
      );
      const tine = new THREE.Mesh(tineGeo, mat);
      tine.name = `tine_${i}`;
      group.add(tine);

      // Small tip knob
      const tipGeo = new THREE.SphereGeometry(Math.max(0.002, tineRadius * 0.8), 6, 6);
      const tip = new THREE.Mesh(tipGeo, mat);
      tip.position.copy(tineEnd);
      tip.name = `tineTip_${i}`;
      group.add(tip);
    }

    // Tip knob for main beam
    const tipPos = beamPoints[beamPoints.length - 1];
    const tipGeo = new THREE.SphereGeometry(cfg.baseRadius * 0.6, 6, 6);
    const tip = new THREE.Mesh(tipGeo, mat);
    tip.position.copy(tipPos);
    tip.name = 'beamTip';
    group.add(tip);
  }
}
