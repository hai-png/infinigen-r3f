/**
 * Oven Generator - Hinged door oven
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class OvenGenerator extends ArticulatedObjectBase {
  protected category = 'Oven';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Oven';

    const bodyMat = this.createMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.4, roughness: 0.1 });
    const s = this.scale;

    // Body
    const body = this.createBox('oven_body', 0.6, 0.85, 0.55, bodyMat, new THREE.Vector3(0, 0.425, 0));
    group.add(body);

    // Oven door (hinged at bottom - drops down)
    const doorPivot = new THREE.Group();
    doorPivot.name = 'oven_door_pivot';
    doorPivot.position.set(0, 0.05 * s, 0.275 * s);

    const doorFrame = this.createBox('oven_door_frame', 0.5, 0.4, 0.02, bodyMat, new THREE.Vector3(0, 0.2, 0.01));
    const doorGlass = this.createBox('oven_door_glass', 0.4, 0.3, 0.005, glassMat, new THREE.Vector3(0, 0.2, 0.025));
    doorPivot.add(doorFrame, doorGlass);
    group.add(doorPivot);

    // Handle
    const handleMat = this.createMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
    const handle = this.createCylinder('oven_handle', 0.01, 0.01, 0.35, handleMat, new THREE.Vector3(0, 0.4, 0.035));
    handle.rotation.z = Math.PI / 2;
    doorPivot.add(handle);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'oven_door_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [0, Math.PI * 0.7],
        childMesh: 'oven_door_frame',
        parentMesh: 'oven_body',
        anchor: [0, 0.05, 0.275],
        damping: 4.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 40 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('oven_body', { size: new THREE.Vector3(0.6, 0.85, 0.55), pos: new THREE.Vector3(0, 0.425, 0) });
    meshGeometries.set('oven_door_frame', { size: new THREE.Vector3(0.5, 0.4, 0.02), pos: new THREE.Vector3(0, 0.25, 0.28) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('oven', joints, meshGeometries) };
  }
}
