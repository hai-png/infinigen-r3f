/**
 * Microwave Generator - Hinged door microwave
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class MicrowaveGenerator extends ArticulatedObjectBase {
  protected category = 'Microwave';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Microwave';

    const bodyMat = this.createMaterial({ color: 0x2A2A2A, metalness: 0.3, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223322, transparent: true, opacity: 0.35, roughness: 0.1 });
    const s = this.scale;

    const body = this.createBox('microwave_body', 0.5, 0.3, 0.35, bodyMat, new THREE.Vector3(0, 0.15, 0));
    group.add(body);

    // Door (hinged on left)
    const doorPivot = new THREE.Group();
    doorPivot.name = 'microwave_door_pivot';
    doorPivot.position.set(-0.25 * s, 0.15 * s, 0.175 * s);

    const doorFrame = this.createBox('mw_door_frame', 0.48, 0.26, 0.02, bodyMat, new THREE.Vector3(0.24, 0, 0.01));
    const doorGlass = this.createBox('mw_door_glass', 0.36, 0.2, 0.005, glassMat, new THREE.Vector3(0.24, 0, 0.025));
    doorPivot.add(doorFrame, doorGlass);
    group.add(doorPivot);

    // Handle
    const handleMat = this.createMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.25 });
    const handle = this.createCylinder('mw_handle', 0.008, 0.008, 0.12, handleMat, new THREE.Vector3(0.42, 0, 0.03));
    handle.rotation.z = Math.PI / 2;
    doorPivot.add(handle);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'microwave_door_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.3],
        childMesh: 'mw_door_frame',
        parentMesh: 'microwave_body',
        anchor: [-0.25, 0.15, 0.175],
        damping: 2.0,
        friction: 0.2,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 15 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('microwave_body', { size: new THREE.Vector3(0.5, 0.3, 0.35), pos: new THREE.Vector3(0, 0.15, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('microwave', joints, meshGeometries) };
  }
}
