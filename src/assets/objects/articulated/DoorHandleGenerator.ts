/**
 * DoorHandle Generator - Articulated door handle/lever
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class DoorHandleGenerator extends ArticulatedObjectBase {
  protected category = 'DoorHandle';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'DoorHandle';

    const metalMat = this.createMaterial({ color: 0xB8860B, metalness: 0.8, roughness: 0.2 });
    const s = this.scale;

    // Backplate
    const backplate = this.createBox('handle_backplate', 0.04, 0.14, 0.005, metalMat, new THREE.Vector3(0, 0.07, 0));
    group.add(backplate);

    // Lever pivot
    const leverPivot = new THREE.Group();
    leverPivot.name = 'handle_lever_pivot';
    leverPivot.position.set(0, 0.07 * s, 0.005 * s);

    // Lever handle
    const leverGrip = this.createCylinder('handle_lever', 0.008, 0.008, 0.1, metalMat, new THREE.Vector3(0.05, 0, 0));
    leverGrip.rotation.z = Math.PI / 2;
    leverPivot.add(leverGrip);

    // Lever end cap
    const endCap = this.createCylinder('handle_endcap', 0.012, 0.012, 0.015, metalMat, new THREE.Vector3(0.1, 0, 0));
    endCap.rotation.z = Math.PI / 2;
    leverPivot.add(endCap);

    group.add(leverPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'door_handle_lever',
        type: 'hinge',
        axis: [0, 0, 1],
        limits: [-Math.PI * 0.25, 0],
        childMesh: 'handle_lever',
        parentMesh: 'handle_backplate',
        anchor: [0, 0.07, 0.005],
        damping: 0.5,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-0.3, 0], gearRatio: 2 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('handle_backplate', { size: new THREE.Vector3(0.04, 0.14, 0.005), pos: new THREE.Vector3(0, 0.07, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('door_handle', joints, meshGeometries) };
  }
}
