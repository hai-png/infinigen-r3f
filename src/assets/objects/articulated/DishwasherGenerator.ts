/**
 * Dishwasher Generator - Sliding/hinged door dishwasher
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class DishwasherGenerator extends ArticulatedObjectBase {
  protected category = 'Dishwasher';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Dishwasher';

    const bodyMat = this.createMaterial({ color: 0xCCCCCC, metalness: 0.4, roughness: 0.35 });
    const s = this.scale;

    const body = this.createBox('dishwasher_body', 0.6, 0.85, 0.6, bodyMat, new THREE.Vector3(0, 0.425, -0.05));
    group.add(body);

    // Door (drops down from bottom)
    const doorPivot = new THREE.Group();
    doorPivot.name = 'dishwasher_door_pivot';
    doorPivot.position.set(0, 0.02 * s, 0.25 * s);

    const doorPanel = this.createBox('dw_door', 0.56, 0.58, 0.025, bodyMat, new THREE.Vector3(0, 0.29, 0.01));
    doorPivot.add(doorPanel);
    group.add(doorPivot);

    // Handle
    const handleMat = this.createMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.2 });
    const handle = this.createCylinder('dw_handle', 0.01, 0.01, 0.35, handleMat, new THREE.Vector3(0, 0.55, 0.04));
    handle.rotation.z = Math.PI / 2;
    doorPivot.add(handle);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'dishwasher_door_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [0, Math.PI * 0.6],
        childMesh: 'dw_door',
        parentMesh: 'dishwasher_body',
        anchor: [0, 0.02, 0.25],
        damping: 4.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 35 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('dishwasher_body', { size: new THREE.Vector3(0.6, 0.85, 0.6), pos: new THREE.Vector3(0, 0.425, -0.05) });
    meshGeometries.set('dw_door', { size: new THREE.Vector3(0.56, 0.58, 0.025), pos: new THREE.Vector3(0, 0.31, 0.26) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('dishwasher', joints, meshGeometries) };
  }
}
