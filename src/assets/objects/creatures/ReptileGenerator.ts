import { SeededRandom } from '@/core/util/MathUtils';
/**
 * ReptileGenerator - Procedural reptile generation
 * Generates reptiles with flat body, triangular head with jaw, 4 splayed legs, tapered tail, scale material
 *
 * Geometry improvements:
 * - Non-snake body uses LatheGeometry for smooth, flat profiles
 * - Snake body uses LatheGeometry segments for smoother serpentine shape
 * - Subdivision smoothing applied to body for smooth transitions
 */
import { Object3D, Group, Mesh, Material, MeshStandardMaterial, Vector2, LatheGeometry } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { smoothCreatureJunction } from '../../../core/util/GeometryUtils';

export interface ReptileParameters extends CreatureParams {
  scalePattern: 'smooth' | 'keeled' | 'granular';
  limbCount: number;
  hasShell: boolean;
  primaryColor: string;
  species: ReptileSpecies;
}

export type ReptileSpecies = 'lizard' | 'snake' | 'turtle' | 'crocodile' | 'gecko';

export class ReptileGenerator extends CreatureBase {
  private _rng = new SeededRandom(42);
  constructor(params: Partial<ReptileParameters> = {}) {
    super({ ...params, seed: params.seed || 42 });
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

    // Body — LatheGeometry for smooth profiles
    const body = this.generateBody(parameters, scaleMat);
    reptile.add(body);

    // Triangular head with jaw
    const head = this.buildHead(parameters, scaleMat);
    if (parameters.species === 'snake') {
      head.position.set(0, s * 0.03, s * 0.44);
    } else {
      head.position.set(0, s * 0.05, s * 0.4);
    }
    reptile.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0xaa8800, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.025);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.06, s * 0.1, s * 0.48);
    leftEye.name = 'leftEye';
    reptile.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.06, s * 0.1, s * 0.48);
    rightEye.name = 'rightEye';
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

  generateBodyCore(): Object3D {
    return this.generateBody(this.getDefaultConfig(), this.createScaleMaterial(this.getDefaultConfig()));
  }

  generateHead(): Object3D {
    const params = this.getDefaultConfig();
    const s = params.size;
    const headGroup = this.buildHead(params, this.createScaleMaterial(params));

    // Eyes (needed for complete head via abstract method chain)
    const eyeMat = new MeshStandardMaterial({ color: 0xaa8800, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.025);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.06, s * 0.1, s * 0.48);
    leftEye.name = 'leftEye';
    headGroup.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.06, s * 0.1, s * 0.48);
    rightEye.name = 'rightEye';
    headGroup.add(rightEye);

    return headGroup;
  }

  generateLimbs(): Object3D[] {
    const params = this.getDefaultConfig();
    // Respect limbCount: snakes (limbCount=0) should return no legs
    if (params.limbCount <= 0) return [];
    return this.generateLegs(params, this.createScaleMaterial(params));
  }

  generateAppendages(): Object3D[] {
    const params = this.getDefaultConfig();
    const mat = this.createScaleMaterial(params);
    const app: Object3D[] = [this.generateTail(params, mat)];
    if (params.hasShell) app.push(this.generateShell(params));
    return app;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: ReptileSpecies, params: ReptileParameters): void {
    params.species = species;
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

  /**
   * Generate reptile body using LatheGeometry for smooth profiles.
   *
   * Reptile bodies are characteristically flatter (wider than tall) compared
   * to mammals. The LatheGeometry profile is species-specific:
   *   - Lizard: compact, slightly tapered
   *   - Crocodile: elongated, broad
   *   - Turtle: wide, domed for shell
   *   - Gecko: slender, small
   *   - Snake: serpentine with S-curve segments
   */
  private generateBody(params: ReptileParameters, mat: MeshStandardMaterial): Object3D {
    const s = params.size;

    // Snake: elongated serpentine body with S-curve segments using LatheGeometry
    if (params.species === 'snake') {
      const bodyGroup = new Group();
      bodyGroup.name = 'snakeBody';

      const segmentCount = 12;
      const bodyLength = s * 0.8;
      const bodyWidth = s * 0.05;
      const segLen = bodyLength / segmentCount;

      for (let i = 0; i < segmentCount; i++) {
        const t = i / (segmentCount - 1);
        const taperFactor = Math.sin(t * Math.PI);
        const maxRadius = bodyWidth * (0.6 + 0.4 * taperFactor);

        // Each segment uses a short LatheGeometry for smoothness
        const segProfile: [number, number][] = [
          [0.0, 0.10],
          [0.2, 0.70],
          [0.5, 1.00],
          [0.8, 0.70],
          [1.0, 0.10],
        ];
        const segments = 8;
        const points: Vector2[] = [];
        for (let j = 0; j <= segments; j++) {
          const pt = j / segments;
          let r = 0;
          for (let c = 0; c < segProfile.length - 1; c++) {
            const [t0, r0] = segProfile[c];
            const [t1, r1] = segProfile[c + 1];
            if (pt >= t0 && pt <= t1) {
              const localT = (pt - t0) / (t1 - t0);
              const st = localT * localT * (3 - 2 * localT);
              r = r0 + (r1 - r0) * st;
              break;
            }
          }
          points.push(new Vector2(
            Math.max(0.001, r * maxRadius),
            pt * segLen,
          ));
        }

        const segGeo = new LatheGeometry(points, 8);
        // Flatten vertically for snake cross-section
        segGeo.scale(1, 0.6, 1);
        // Apply subdivision for smooth segment junctions
        const smoothedGeo = smoothCreatureJunction(segGeo, 1);

        const seg = new Mesh(smoothedGeo, mat);
        seg.name = `bodySeg_${i}`;
        seg.rotation.x = Math.PI / 2;

        // S-curve: sinusoidal lateral offset
        const lateralOffset = Math.sin(t * Math.PI * 2) * bodyWidth * 2.5;
        seg.position.set(lateralOffset, 0, -t * bodyLength + bodyLength * 0.5);

        bodyGroup.add(seg);
      }

      return bodyGroup;
    }

    // Non-snake: flat body using LatheGeometry with species-specific profile
    const bodyWidth = s * 0.2;
    const bodyHeight = s * 0.08;
    const bodyLength = s * 0.7;

    // Species-specific profile control points
    const profileData = this.getReptileBodyProfile(params.species);

    const segments = 20;
    const points: Vector2[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let r = 0;
      for (let c = 0; c < profileData.length - 1; c++) {
        const [t0, r0] = profileData[c];
        const [t1, r1] = profileData[c + 1];
        if (t >= t0 && t <= t1) {
          const localT = (t - t0) / (t1 - t0);
          const st = localT * localT * (3 - 2 * localT);
          r = r0 + (r1 - r0) * st;
          break;
        }
      }
      points.push(new Vector2(
        Math.max(0.001, r * bodyWidth),
        t * bodyLength - bodyLength * 0.5,
      ));
    }

    const bodyGeo = new LatheGeometry(points, 14);
    // Scale to make flat cross-section (reptiles are wider than tall)
    bodyGeo.scale(1, bodyHeight / bodyWidth, 1);

    // Apply subdivision for smooth body
    const smoothedGeo = smoothCreatureJunction(bodyGeo, 1);

    const mesh = new Mesh(smoothedGeo, mat);
    mesh.name = 'body';
    mesh.rotation.x = Math.PI / 2;

    return mesh;
  }

  /**
   * Get species-specific body profile control points for LatheGeometry.
   */
  private getReptileBodyProfile(species: ReptileSpecies): [number, number][] {
    switch (species) {
      case 'crocodile':
        // Elongated, broad body
        return [
          [0.0,  0.08], // Tail tip
          [0.08, 0.35], // Tail base
          [0.20, 0.70], // Hindquarters
          [0.35, 0.90], // Mid body — broad
          [0.50, 1.00], // Widest
          [0.65, 0.90], // Ribcage
          [0.80, 0.65], // Shoulder
          [0.92, 0.30], // Neck
          [1.0,  0.10], // Head attachment
        ];
      case 'turtle':
        // Wide, dome-shaped for shell accommodation
        return [
          [0.0,  0.15],
          [0.10, 0.50],
          [0.25, 0.80],
          [0.40, 0.95],
          [0.50, 1.00], // Dome peak
          [0.65, 0.90],
          [0.80, 0.55],
          [0.92, 0.25],
          [1.0,  0.10],
        ];
      case 'gecko':
        // Slender, small
        return [
          [0.0,  0.05],
          [0.08, 0.30],
          [0.20, 0.65],
          [0.35, 0.90],
          [0.50, 1.00],
          [0.65, 0.85],
          [0.80, 0.55],
          [0.92, 0.25],
          [1.0,  0.08],
        ];
      case 'lizard':
      default:
        // Compact, slightly tapered
        return [
          [0.0,  0.06],
          [0.08, 0.30],
          [0.20, 0.60],
          [0.35, 0.85],
          [0.50, 1.00],
          [0.65, 0.85],
          [0.80, 0.55],
          [0.92, 0.25],
          [1.0,  0.08],
        ];
    }
  }

  private buildHead(params: ReptileParameters, mat: MeshStandardMaterial): Group {
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

    return headGroup;
  }

  private generateLegs(params: ReptileParameters, mat: MeshStandardMaterial): Group[] {
    const s = params.size;
    const legs: Group[] = [];
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
      foot.name = 'foot';
      legGroup.add(foot);

      legs.push(legGroup);
    }

    return legs;
  }

  private generateTail(params: ReptileParameters, mat: MeshStandardMaterial): Group {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';

    // Snake: much longer tapering tail
    if (params.species === 'snake') {
      const segments = 16;
      const tailLength = s * 0.6;
      const segLen = tailLength / segments;
      const baseRadius = s * 0.04;

      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const radius = baseRadius * (1 - t * 0.95);
        const segGeo = this.createCylinderGeometry(radius, radius * 0.85, segLen);
        const seg = new Mesh(segGeo, mat);
        // Continue the S-curve from the body
        const lateralOffset = Math.sin((t * 0.5 + 1.0) * Math.PI * 2) * s * 0.04;
        seg.position.set(lateralOffset, -s * 0.01 * t, -s * 0.4 - t * tailLength);
        seg.rotation.x = 0.05 * t;
        tailGroup.add(seg);
      }

      return tailGroup;
    }

    // Default: tapered tail - series of segments getting smaller
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

    return tailGroup;
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
