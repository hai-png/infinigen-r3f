/**
 * TrashCan Generator - Hinged lid trash can
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class TrashCanGenerator extends ArticulatedObjectBase {
  protected category = 'TrashCan';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'TrashCan';

    const bodyMat = this.createMaterial({ color: 0x555555, metalness: 0.3, roughness: 0.6 });
    const lidMat = this.createMaterial({ color: 0x666666, metalness: 0.3, roughness: 0.5 });
    const s = this.scale;

    // Body (cylinder)
    const body = this.createCylinder('trashcan_body', 0.12, 0.1, 0.4, bodyMat, new THREE.Vector3(0, 0.2, 0));
    group.add(body);

    // Rim
    const rim = this.createCylinder('trashcan_rim', 0.125, 0.125, 0.01, lidMat, new THREE.Vector3(0, 0.4, 0));
    group.add(rim);

    // Lid (hinged at back)
    const lidPivot = new THREE.Group();
    lidPivot.name = 'trashcan_lid_pivot';
    lidPivot.position.set(0, 0.405 * s, -0.1 * s);

    const lid = this.createCylinder('trashcan_lid', 0.13, 0.13, 0.015, lidMat, new THREE.Vector3(0, 0, 0.1));
    lidPivot.add(lid);
    group.add(lidPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'trashcan_lid_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [0, Math.PI * 0.5],
        childMesh: 'trashcan_lid',
        parentMesh: 'trashcan_rim',
        anchor: [0, 0.405, -0.1],
        damping: 1.5,
        friction: 0.2,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 5 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('trashcan_body', { size: new THREE.Vector3(0.22, 0.4, 0.22), pos: new THREE.Vector3(0, 0.2, 0) });
    meshGeometries.set('trashcan_lid', { size: new THREE.Vector3(0.24, 0.015, 0.24), pos: new THREE.Vector3(0, 0.41, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('trashcan', joints, meshGeometries) };
  }
}
