/**
 * WingGenerator - Procedural wing generation with deep detail
 *
 * Supports:
 * - Bird wing with feather sub-generator (primary, secondary, covert feathers)
 * - Bat/dragon wing with membrane generator
 * - Insect wing with vein patterns
 * - InstanceOnPoints-based feather placement along skeleton curve
 * - symmetricClone for mirroring
 *
 * Phase 2: Now returns Joint and IKParams data for the NURBS-to-armature pipeline.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/MathUtils';
import type { Joint } from './HeadDetailGenerator';
import type { IKParams } from '../rigging/NURBSToArmature';

// ── Types ────────────────────────────────────────────────────────────

export type WingType = 'soaring' | 'flapping' | 'folded' | 'hovering' | 'membrane' | 'butterfly' | 'bird' | 'bat' | 'dragon' | 'insect';

export interface WingConfig {
  type: WingType;
  side: 'left' | 'right';
  span: number;
  featherCount?: number;
  membraneOpacity?: number;
  color?: number;
  secondaryColor?: number;
}

export interface WingResult {
  group: THREE.Group;
  joints: Record<string, Joint>;
  ikParams: IKParams[];
}

// ── Feather Sub-Generator ────────────────────────────────────────────

export class FeatherGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a single feather mesh.
   * @param length - Total length of the feather
   * @param width - Width of the feather vane
   * @param curvature - How much the feather curves
   * @param color - Feather color
   */
  generateFeather(
    length: number,
    width: number,
    curvature: number = 0.1,
    color: number = 0x4a3a2a,
  ): THREE.Mesh {
    const shape = new THREE.Shape();

    // Rachis (central shaft) offset
    const shaftOffset = width * 0.05;

    // Left vane
    shape.moveTo(0, 0);
    shape.bezierCurveTo(
      -width * 0.4, length * 0.2,
      -width * 0.3, length * 0.6,
      -width * 0.1, length * 0.9,
    );
    shape.lineTo(0, length); // Tip

    // Right vane (slightly asymmetric like real feathers)
    shape.bezierCurveTo(
      width * 0.15, length * 0.9,
      width * 0.35, length * 0.6,
      width * 0.45, length * 0.2,
    );
    shape.lineTo(0, 0);

    const geo = new THREE.ShapeGeometry(shape, 4);

    // Apply curvature
    if (curvature > 0) {
      const positions = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1];
        const t = y / length;
        // Curvature: slight dome shape
        positions[i + 2] += curvature * length * Math.sin(t * Math.PI) * 0.3;
      }
      geo.computeVertexNormals();
    }

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'feather';
    return mesh;
  }

  /**
   * Generate a row of feathers placed along a skeleton curve.
   * Simulates InstanceOnPoints by placing feathers at regular intervals.
   */
  generateFeatherRow(
    curve: THREE.CatmullRomCurve3,
    count: number,
    featherLength: number,
    featherWidth: number,
    color: number = 0x4a3a2a,
    spreadAngle: number = 0.1,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'featherRow';

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);

      const feather = this.generateFeather(
        featherLength * (1 - t * 0.3), // Shorter toward tip
        featherWidth * (1 - t * 0.2),
        0.05 + t * 0.1,
        color,
      );

      feather.position.copy(point);
      // Orient feather along the tangent
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, tangent.normalize());
      feather.quaternion.copy(quaternion);

      // Add slight spread
      feather.rotation.z += (t - 0.5) * spreadAngle;
      feather.name = `feather_${i}`;
      group.add(feather);
    }

    return group;
  }
}

// ── Membrane Sub-Generator ───────────────────────────────────────────

export class MembraneGenerator {
  /**
   * Generate a membrane wing surface between finger bones.
   */
  generateMembrane(
    points: THREE.Vector3[],
    color: number = 0x4a3a3a,
    opacity: number = 0.85,
  ): THREE.Mesh {
    // Create triangulated membrane from a set of boundary points
    const vertices: number[] = [];
    const uvs: number[] = [];

    // Simple fan triangulation from the first point (wing root)
    for (let i = 1; i < points.length - 1; i++) {
      vertices.push(
        points[0].x, points[0].y, points[0].z,
        points[i].x, points[i].y, points[i].z,
        points[i + 1].x, points[i + 1].y, points[i + 1].z,
      );

      // UV mapping
      const uv0 = new THREE.Vector2(0, 0);
      const uv1 = new THREE.Vector2(i / points.length, 0.5);
      const uv2 = new THREE.Vector2((i + 1) / points.length, 0.5);
      uvs.push(uv0.x, uv0.y, uv1.x, uv1.y, uv2.x, uv2.y);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
    });

    return new THREE.Mesh(geo, mat);
  }
}

// ── Wing Generator ───────────────────────────────────────────────────

export class WingGenerator {
  private seed: number;
  private rng: SeededRandom;
  private featherGen: FeatherGenerator;
  private membraneGen: MembraneGenerator;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
    this.rng = new SeededRandom(this.seed);
    this.featherGen = new FeatherGenerator(this.seed);
    this.membraneGen = new MembraneGenerator();
  }

  /**
   * Generate a single wing (left or right).
   * Returns group with joints and IK data for rigging.
   */
  generateWithJoints(side: 'left' | 'right', span: number, pattern: string = 'soaring'): WingResult {
    const wingType = pattern as WingType;
    const wingGroup = new THREE.Group();
    wingGroup.name = `${side}Wing`;

    const dir = side === 'left' ? -1 : 1;
    const joints: Record<string, Joint> = {};
    const ikParams: IKParams[] = [];

    switch (wingType) {
      case 'bird':
      case 'soaring':
        this.buildBirdWing(wingGroup, span, dir, joints);
        break;
      case 'flapping':
        this.buildFlappingWing(wingGroup, span, dir, joints);
        break;
      case 'folded':
        this.buildFoldedWing(wingGroup, span, dir, joints);
        break;
      case 'hovering':
        this.buildHoveringWing(wingGroup, span, dir, joints);
        break;
      case 'bat':
      case 'membrane':
        this.buildBatWing(wingGroup, span, dir, joints);
        break;
      case 'dragon':
        this.buildDragonWing(wingGroup, span, dir, joints);
        break;
      case 'insect':
      case 'butterfly':
        this.buildButterflyWing(wingGroup, span, dir, joints);
        break;
      default:
        this.buildBirdWing(wingGroup, span, dir, joints);
    }

    // Wing root joint
    const sideName = side === 'left' ? 'L' : 'R';
    joints[`wing_root_${sideName}`] = {
      name: `wing_root_${sideName}`,
      position: new THREE.Vector3(dir * span * 0.05, 0, 0),
      rotation: new THREE.Euler(0, 0, dir * -0.1),
      bounds: {
        min: new THREE.Vector3(0, -0.3, -0.5),
        max: new THREE.Vector3(0, 1.0, 0.5),
      },
    };

    // Wing IK for fold/flap
    ikParams.push({
      targetJoint: `wing_tip_${sideName}`,
      chainLength: 2,
    });

    return { group: wingGroup, joints, ikParams };
  }

  /**
   * Legacy API: generate a wing group without joint data
   */
  generate(side: 'left' | 'right', span: number, pattern: string = 'soaring'): THREE.Group {
    return this.generateWithJoints(side, span, pattern).group;
  }

  /**
   * Create a symmetric clone of a wing (mirror across XZ plane)
   */
  symmetricClone(wingGroup: THREE.Group, originalSide: 'left' | 'right'): THREE.Group {
    const clone = wingGroup.clone();
    clone.name = originalSide === 'left' ? 'rightWing' : 'leftWing';

    // Mirror the geometry by scaling X by -1
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.scale.x *= -1;
      }
    });

    return clone;
  }

  /**
   * Bird wing with feather sub-generator
   */
  private buildBirdWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a, roughness: 0.8, side: THREE.DoubleSide,
    });

    // Skeleton curve for feather placement
    const skeletonPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      skeletonPoints.push(new THREE.Vector3(
        dir * span * t,
        span * 0.05 * Math.sin(t * Math.PI * 0.5),
        -span * 0.03 * t * t,
      ));
    }
    const skeletonCurve = new THREE.CatmullRomCurve3(skeletonPoints);

    // Main wing surface
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.3, span * 0.08, span * 0.7, span * 0.06, span, 0);
    wingShape.bezierCurveTo(span * 0.7, -span * 0.03, span * 0.3, -span * 0.04, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 12);
    this.applyWingCurvature(wingGeo, span, 0.08);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    // Primary feathers at the tip using FeatherGenerator
    const primaryCount = 6;
    for (let i = 0; i < primaryCount; i++) {
      const t = i / (primaryCount - 1);
      const featherLen = span * (0.15 + t * 0.12);
      const feather = this.featherGen.generateFeather(
        featherLen,
        span * 0.04,
        0.08 + t * 0.05,
        0x3a2a1a,
      );
      feather.position.set(dir * (span - span * 0.05 + t * span * 0.03), 0, -featherLen * 0.3);
      feather.rotation.z = dir * (t - 0.5) * 0.15;
      feather.name = `primaryFeather_${i}`;
      group.add(feather);
    }

    // Secondary feathers along trailing edge
    const secCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dir * span * 0.3, 0, 0),
      new THREE.Vector3(dir * span * 0.5, -span * 0.02, 0),
      new THREE.Vector3(dir * span * 0.7, -span * 0.03, 0),
    ]);
    const secRow = this.featherGen.generateFeatherRow(secCurve, 8, span * 0.1, span * 0.02, 0x4a3a2a, 0.08);
    secRow.name = 'secondaryFeathers';
    group.add(secRow);

    // Covert feathers (overlapping rows)
    const rowColors = [0x5a4a3a, 0x7a6a5a];
    for (let row = 0; row < 2; row++) {
      const count = 6 + row * 3;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const x = dir * span * (0.15 + t * 0.65);
        const y = row * span * 0.015;
        const featherLen = span * (0.06 + row * 0.04);
        const featherGeo = new THREE.PlaneGeometry(span * 0.025, featherLen, 1, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: rowColors[row], roughness: 0.75, side: THREE.DoubleSide,
        });
        const feather = new THREE.Mesh(featherGeo, mat);
        feather.position.set(x, y, -featherLen * 0.3);
        feather.rotation.z = dir * -0.03 * (1 - t);
        feather.name = `covert_${row}_${i}`;
        group.add(feather);
      }
    }

    // Wing tip joint
    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.5, -0.3),
        max: new THREE.Vector3(0.5, 0.8, 0.3),
      },
    };
  }

  /**
   * Flapping wing: shorter, broader with more surface area
   */
  private buildFlappingWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x6a5a4a, roughness: 0.75, side: THREE.DoubleSide,
    });

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.25, span * 0.1, span * 0.6, span * 0.09, span * 0.85, 0);
    wingShape.bezierCurveTo(span * 0.6, -span * 0.06, span * 0.25, -span * 0.06, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 10);
    this.applyWingCurvature(wingGeo, span, 0.12);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    // Covert feathers (overlapping rows)
    const rowColors = [0x5a4a3a, 0x7a6a5a];
    for (let row = 0; row < 2; row++) {
      const count = 6 + row * 3;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const x = dir * span * (0.15 + t * 0.65);
        const y = row * span * 0.015;
        const featherLen = span * (0.06 + row * 0.04);
        const featherGeo = new THREE.PlaneGeometry(span * 0.025, featherLen, 1, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: rowColors[row], roughness: 0.75, side: THREE.DoubleSide,
        });
        const feather = new THREE.Mesh(featherGeo, mat);
        feather.position.set(x, y, -featherLen * 0.3);
        feather.rotation.z = dir * -0.03 * (1 - t);
        feather.name = `covert_${row}_${i}`;
        group.add(feather);
      }
    }

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span * 0.85, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.5, -0.3),
        max: new THREE.Vector3(0.5, 0.8, 0.3),
      },
    };
  }

  /**
   * Folded wing: wing folded against the body
   */
  private buildFoldedWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a, roughness: 0.8, side: THREE.DoubleSide,
    });

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.15, span * 0.04, span * 0.4, span * 0.03, span * 0.5, -span * 0.05);
    wingShape.bezierCurveTo(span * 0.4, -span * 0.07, span * 0.15, -span * 0.03, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.rotation.x = 0.3;
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span * 0.5, -span * 0.05, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.3, -0.5, -0.3),
        max: new THREE.Vector3(0.3, 0.3, 0.3),
      },
    };
  }

  /**
   * Hovering wing: short and broad (hummingbird style)
   */
  private buildHoveringWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x3a6a3a, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.3, span * 0.12, span * 0.7, span * 0.1, span, 0);
    wingShape.bezierCurveTo(span * 0.7, -span * 0.08, span * 0.3, -span * 0.06, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
    this.applyWingCurvature(wingGeo, span, 0.15);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.8, -0.3),
        max: new THREE.Vector3(0.5, 0.8, 0.3),
      },
    };
  }

  /**
   * Bat wing: membrane with finger bones using MembraneGenerator
   */
  private buildBatWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const boneMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });

    // Finger bones that support the membrane
    const fingerCount = 5;
    const fingerAngles = [0.05, 0.15, 0.12, 0.05, -0.05];
    const fingerLengths = [0.5, 0.7, 0.9, 0.8, 0.4];

    const membranePoints: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];

    for (let i = 0; i < fingerCount; i++) {
      const fingerLen = span * fingerLengths[i];
      const angle = dir * (0.1 + fingerAngles[i]);
      const boneGeo = new THREE.CylinderGeometry(span * 0.008, span * 0.012, fingerLen, 6);
      const bone = new THREE.Mesh(boneGeo, boneMat);
      bone.position.set(dir * fingerLen * 0.4 * Math.cos(angle), fingerLen * 0.4 * Math.sin(angle), 0);
      bone.rotation.z = dir * (-Math.PI / 2 + angle);
      bone.name = `fingerBone_${i}`;
      group.add(bone);

      // Membrane point at finger tip
      membranePoints.push(new THREE.Vector3(
        dir * fingerLen * Math.cos(angle),
        fingerLen * Math.sin(angle),
        0,
      ));
    }

    // Generate membrane between fingers
    const membrane = this.membraneGen.generateMembrane(membranePoints, 0x4a3a3a, 0.85);
    membrane.name = 'membrane';
    group.add(membrane);

    // Add body-side membrane edge
    const edgePoints: THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dir * span * 0.3, -span * 0.02, 0),
      new THREE.Vector3(dir * span * 0.5, -span * 0.06, -span * 0.05),
    ];
    const edgeMembrane = this.membraneGen.generateMembrane(edgePoints, 0x4a3a3a, 0.8);
    edgeMembrane.name = 'bodyMembrane';
    group.add(edgeMembrane);

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span * 0.9, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.3, -0.5, -0.5),
        max: new THREE.Vector3(0.3, 0.8, 0.5),
      },
    };
  }

  /**
   * Dragon wing: larger membrane wing with more structure
   */
  private buildDragonWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const boneMat = new THREE.MeshStandardMaterial({ color: 0x3a2a2a, roughness: 0.5 });

    // Main wing spar
    const sparGeo = new THREE.CylinderGeometry(span * 0.012, span * 0.018, span * 0.9, 8);
    const spar = new THREE.Mesh(sparGeo, boneMat);
    spar.position.set(dir * span * 0.45, 0, 0);
    spar.rotation.z = dir * -Math.PI / 2;
    spar.name = 'wingSpar';
    group.add(spar);

    // Finger bones
    const fingerCount = 4;
    const membranePoints: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];

    for (let i = 0; i < fingerCount; i++) {
      const t = (i + 1) / (fingerCount + 1);
      const fingerLen = span * (0.4 + (i === 1 ? 0.5 : i === 2 ? 0.4 : 0.2));
      const boneGeo = new THREE.CylinderGeometry(span * 0.006, span * 0.01, fingerLen, 6);
      const bone = new THREE.Mesh(boneGeo, boneMat);
      bone.position.set(dir * span * t, fingerLen * 0.1, 0);
      bone.rotation.z = dir * (-Math.PI / 2 + (i - 1) * 0.1);
      bone.name = `dragonFinger_${i}`;
      group.add(bone);

      membranePoints.push(new THREE.Vector3(
        dir * span * t,
        fingerLen * 0.15,
        0,
      ));
    }

    // Dragon membrane with slightly different color
    const membrane = this.membraneGen.generateMembrane(membranePoints, 0x5a3a3a, 0.75);
    membrane.name = 'dragonMembrane';
    group.add(membrane);

    // Claw at wing thumb
    const clawGeo = new THREE.ConeGeometry(span * 0.01, span * 0.04, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.3 });
    const claw = new THREE.Mesh(clawGeo, clawMat);
    claw.position.set(dir * span * 0.1, span * 0.08, span * 0.02);
    claw.rotation.x = Math.PI / 4;
    claw.name = 'wingClaw';
    group.add(claw);

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span * 0.9, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.3, -0.5, -0.5),
        max: new THREE.Vector3(0.3, 0.8, 0.5),
      },
    };
  }

  /**
   * Butterfly/insect wing: colorful, with vein patterns
   */
  private buildButterflyWing(
    group: THREE.Group, span: number, dir: number,
    joints: Record<string, Joint>,
  ): void {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xdd6622, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });

    // Forewing
    const foreShape = new THREE.Shape();
    foreShape.moveTo(0, 0);
    foreShape.bezierCurveTo(span * 0.3, span * 0.15, span * 0.8, span * 0.12, span, 0);
    foreShape.bezierCurveTo(span * 0.7, -span * 0.05, span * 0.3, -span * 0.03, 0, 0);

    const foreGeo = new THREE.ShapeGeometry(foreShape, 8);
    const forewing = new THREE.Mesh(foreGeo, wingMat);
    forewing.name = 'forewing';
    group.add(forewing);

    // Hindwing
    const hindMat = new THREE.MeshStandardMaterial({
      color: 0xcc4411, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });
    const hindShape = new THREE.Shape();
    hindShape.moveTo(0, 0);
    hindShape.bezierCurveTo(span * 0.2, -span * 0.1, span * 0.5, -span * 0.12, span * 0.6, -span * 0.03);
    hindShape.bezierCurveTo(span * 0.4, -span * 0.02, span * 0.2, -span * 0.01, 0, 0);

    const hindGeo = new THREE.ShapeGeometry(hindShape, 8);
    const hindwing = new THREE.Mesh(hindGeo, hindMat);
    hindwing.position.z = -span * 0.01;
    hindwing.name = 'hindwing';
    group.add(hindwing);

    // Wing veins
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.25;
      const veinLen = span * t;
      const veinGeo = new THREE.CylinderGeometry(span * 0.002, span * 0.003, veinLen, 4);
      const vein = new THREE.Mesh(veinGeo, veinMat);
      vein.position.set(dir * veinLen * 0.35, 0, 0);
      vein.rotation.z = dir * (-Math.PI / 2 + i * 0.1);
      vein.name = `vein_${i}`;
      group.add(vein);
    }

    const sideName = dir === -1 ? 'L' : 'R';
    joints[`wing_tip_${sideName}`] = {
      name: `wing_tip_${sideName}`,
      position: new THREE.Vector3(dir * span, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: {
        min: new THREE.Vector3(-0.5, -0.5, -0.3),
        max: new THREE.Vector3(0.5, 0.5, 0.3),
      },
    };
  }

  /**
   * Apply curvature to a wing geometry (dome shape for lift)
   */
  private applyWingCurvature(geometry: THREE.BufferGeometry, span: number, curvature: number): void {
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const t = Math.abs(x) / span;
      positions[i + 2] += curvature * span * Math.sin(t * Math.PI) * 0.5;
    }
    geometry.computeVertexNormals();
  }
}
