/**
 * Lamp Generator - Articulated desk/floor lamp with adjustable arm (Sim-Ready)
 *
 * Sim-ready features:
 * - Ball joints at elbow and head (multi-DOF rotation)
 * - Collision geometry for base, arms, and shade
 * - Mass/inertia estimated from geometry
 * - URDF, MJCF, and USD export
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, SimReadyMetadata, generateMJCF } from './types';
import { generateURDF, URDFExportOptions } from './URDFExporter';
import { generateUSD } from './USDExporter';

export class LampGenerator extends ArticulatedObjectBase {
  protected category = 'Lamp';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Lamp';

    const metalMat = this.createMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const shadeMat = this.createMaterial({ color: 0xFFF8DC, roughness: 0.9 });
    const s = this.scale;

    // Base
    const base = this.createCylinder('lamp_base', 0.08, 0.08, 0.015, metalMat, new THREE.Vector3(0, 0.0075, 0));
    group.add(base);

    // Lower arm
    const lowerArm = this.createCylinder('lamp_lower_arm', 0.012, 0.012, 0.35, metalMat, new THREE.Vector3(0, 0.175, 0));
    group.add(lowerArm);

    // Elbow joint (ball joint)
    const elbowGroup = new THREE.Group();
    elbowGroup.name = 'lamp_elbow';
    elbowGroup.position.set(0, 0.35 * s, 0);

    // Upper arm
    const upperArm = this.createCylinder('lamp_upper_arm', 0.012, 0.012, 0.3, metalMat, new THREE.Vector3(0, 0.15, 0));
    elbowGroup.add(upperArm);

    // Head joint
    const headGroup = new THREE.Group();
    headGroup.name = 'lamp_head';
    headGroup.position.set(0, 0.3 * s, 0);

    // Shade
    const shade = this.createCylinder('lamp_shade', 0.03, 0.07, 0.06, shadeMat, new THREE.Vector3(0, 0, 0));
    headGroup.add(shade);

    elbowGroup.add(headGroup);
    group.add(elbowGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'lamp_elbow_joint',
        type: 'ball',
        axis: [0, 1, 0],
        limits: [-Math.PI * 0.4, Math.PI * 0.4],
        childMesh: 'lamp_upper_arm',
        parentMesh: 'lamp_lower_arm',
        anchor: [0, 0.35, 0],
        damping: 1.0,
        friction: 0.5,
        actuated: false,
      }),
      this.createJoint({
        id: 'lamp_head_joint',
        type: 'ball',
        axis: [0, 1, 0],
        limits: [-Math.PI * 0.5, Math.PI * 0.5],
        childMesh: 'lamp_shade',
        parentMesh: 'lamp_upper_arm',
        anchor: [0, 0.65, 0],
        damping: 0.8,
        friction: 0.5,
        actuated: false,
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>();
    // Base + lower arm (static)
    meshGeometries.set('lamp_base', { size: new THREE.Vector3(0.08, 0.015, 0.08), pos: new THREE.Vector3(0, 0.0075, 0) });
    meshGeometries.set('lamp_lower_arm', { size: new THREE.Vector3(0.012, 0.35, 0.012), pos: new THREE.Vector3(0, 0.175, 0) });
    // Upper arm (dynamic — steel)
    const upperArmVolume = Math.PI * 0.012 * 0.012 * 0.3;
    const upperArmMass = upperArmVolume * 7800 * 0.7;
    meshGeometries.set('lamp_upper_arm', { size: new THREE.Vector3(0.012, 0.3, 0.012), pos: new THREE.Vector3(0, 0.35 + 0.15, 0), mass: upperArmMass });
    // Shade (dynamic — lightweight)
    const shadeVolume = Math.PI * 0.07 * 0.07 * 0.06 - Math.PI * 0.03 * 0.03 * 0.06;
    const shadeMass = shadeVolume * 1200 * 0.3; // plastic/fabric
    meshGeometries.set('lamp_shade', { size: new THREE.Vector3(0.07, 0.06, 0.07), pos: new THREE.Vector3(0, 0.65, 0), mass: shadeMass });

    const collisionHints = new Map<string, 'box' | 'sphere' | 'cylinder'>();
    collisionHints.set('lamp_base', 'cylinder');
    collisionHints.set('lamp_lower_arm', 'cylinder');
    collisionHints.set('lamp_upper_arm', 'cylinder');
    collisionHints.set('lamp_shade', 'cylinder');

    const simReady: SimReadyMetadata = {
      density: 7800,
      friction: 0.4,
      restitution: 0.2,
      rootBodyStatic: true,
      collisionHints,
    };

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('lamp', joints, meshGeometries),
      toURDF: (options?: URDFExportOptions) => generateURDF('lamp', joints, meshGeometries, { includeInertial: true, includeCollision: true, estimateMassFromGeometry: true, defaultDensity: 7800, ...options }),
      toUSD: () => generateUSD('lamp', joints, meshGeometries),
      meshGeometries,
      simReady,
    };
  }
}
