/**
 * Toaster Generator - Hinged toaster with lever
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class ToasterGenerator extends ArticulatedObjectBase {
  protected category = 'Toaster';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Toaster';

    const bodyMat = this.createMaterial({ color: 0xC0C0C0, metalness: 0.7, roughness: 0.3 });
    const s = this.scale;

    // Body
    const body = this.createBox('toaster_body', 0.2, 0.15, 0.12, bodyMat, new THREE.Vector3(0, 0.075, 0));
    group.add(body);

    // Slot
    const slotMat = this.createMaterial({ color: 0x333333, roughness: 0.9 });
    const slot = this.createBox('toaster_slot', 0.14, 0.01, 0.04, slotMat, new THREE.Vector3(0, 0.15, 0));
    group.add(slot);

    // Lever (slides down)
    const leverMat = this.createMaterial({ color: 0x222222, roughness: 0.5 });
    const leverGroup = new THREE.Group();
    leverGroup.name = 'toaster_lever_group';
    const lever = this.createBox('toaster_lever', 0.02, 0.08, 0.02, leverMat, new THREE.Vector3(0.11, 0.08, 0));
    leverGroup.add(lever);
    group.add(leverGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'toaster_lever',
        type: 'prismatic',
        axis: [0, -1, 0],
        limits: [0, 0.06],
        childMesh: 'toaster_lever',
        parentMesh: 'toaster_body',
        anchor: [0.11, 0.08, 0],
        damping: 1.0,
        friction: 0.5,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 10 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('toaster_body', { size: new THREE.Vector3(0.2, 0.15, 0.12), pos: new THREE.Vector3(0, 0.075, 0) });
    meshGeometries.set('toaster_lever', { size: new THREE.Vector3(0.02, 0.08, 0.02), pos: new THREE.Vector3(0.11, 0.08, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('toaster', joints, meshGeometries) };
  }
}
