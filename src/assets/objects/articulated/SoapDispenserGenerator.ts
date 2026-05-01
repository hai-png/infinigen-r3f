/**
 * SoapDispenser Generator - Pump-action soap dispenser
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class SoapDispenserGenerator extends ArticulatedObjectBase {
  protected category = 'SoapDispenser';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'SoapDispenser';

    const bodyMat = this.createMaterial({ color: 0xE8E8E8, roughness: 0.2, metalness: 0.0 });
    const capMat = this.createMaterial({ color: 0xCCCCCC, metalness: 0.6, roughness: 0.2 });
    const s = this.scale;

    // Body
    const body = this.createCylinder('dispenser_body', 0.025, 0.02, 0.12, bodyMat, new THREE.Vector3(0, 0.06, 0));
    group.add(body);

    // Neck
    const neck = this.createCylinder('dispenser_neck', 0.012, 0.012, 0.02, capMat, new THREE.Vector3(0, 0.13, 0));
    group.add(neck);

    // Spout
    const spout = this.createCylinder('dispenser_spout', 0.004, 0.004, 0.04, capMat, new THREE.Vector3(0.02, 0.155, 0));
    spout.rotation.z = -Math.PI / 6;
    group.add(spout);

    // Pump head (prismatic - pushes down)
    const pumpGroup = new THREE.Group();
    pumpGroup.name = 'dispenser_pump_group';

    const pumpHead = this.createCylinder('dispenser_pump', 0.018, 0.018, 0.008, capMat, new THREE.Vector3(0, 0.145, 0));
    const pumpStem = this.createCylinder('dispenser_stem', 0.005, 0.005, 0.015, capMat, new THREE.Vector3(0, 0.135, 0));
    pumpGroup.add(pumpHead, pumpStem);
    group.add(pumpGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'dispenser_pump_slide',
        type: 'prismatic',
        axis: [0, -1, 0],
        limits: [0, 0.012],
        childMesh: 'dispenser_pump',
        parentMesh: 'dispenser_neck',
        anchor: [0, 0.14, 0],
        damping: 0.5,
        friction: 0.6,
        actuated: true,
        motor: { ctrlRange: [-1, 0], gearRatio: 2 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('dispenser_body', { size: new THREE.Vector3(0.05, 0.12, 0.05), pos: new THREE.Vector3(0, 0.06, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('soap_dispenser', joints, meshGeometries) };
  }
}
