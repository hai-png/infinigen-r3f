/**
 * Refrigerator Generator - Hinged door refrigerator
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class RefrigeratorGenerator extends ArticulatedObjectBase {
  protected category = 'Refrigerator';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Refrigerator';

    const bodyMat = this.createMaterial({ color: 0xDDDDDD, metalness: 0.4, roughness: 0.3 });
    const s = this.scale;

    // Main body
    const body = this.createBox('fridge_body', 0.7, 1.8, 0.65, bodyMat, new THREE.Vector3(0, 0.9, -0.05));
    group.add(body);

    // Freezer door (upper)
    const freezerPivot = new THREE.Group();
    freezerPivot.name = 'freezer_door_pivot';
    freezerPivot.position.set(-0.35 * s, 1.35, 0.275 * s);

    const freezerDoor = this.createBox('freezer_door', 0.68, 0.58, 0.03, bodyMat, new THREE.Vector3(0.34, 0, 0.01));
    freezerPivot.add(freezerDoor);

    // Fridge door (lower)
    const fridgePivot = new THREE.Group();
    fridgePivot.name = 'fridge_door_pivot';
    fridgePivot.position.set(-0.35 * s, 0.52, 0.275 * s);

    const fridgeDoor = this.createBox('fridge_door', 0.68, 0.98, 0.03, bodyMat, new THREE.Vector3(0.34, 0, 0.01));
    fridgePivot.add(fridgeDoor);

    // Handles
    const handleMat = this.createMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.2 });
    const freezerHandle = this.createCylinder('freezer_handle', 0.008, 0.008, 0.2, handleMat, new THREE.Vector3(0.6, 0, 0.04));
    freezerHandle.rotation.z = Math.PI / 2;
    const fridgeHandle = this.createCylinder('fridge_handle', 0.008, 0.008, 0.3, handleMat, new THREE.Vector3(0.6, 0, 0.04));
    fridgeHandle.rotation.z = Math.PI / 2;

    freezerPivot.add(freezerHandle);
    fridgePivot.add(fridgeHandle);
    group.add(freezerPivot, fridgePivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'freezer_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.2],
        childMesh: 'freezer_door',
        parentMesh: 'fridge_body',
        anchor: [-0.35, 1.35, 0.275],
        damping: 3.0,
        friction: 0.2,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 60 },
      }),
      this.createJoint({
        id: 'fridge_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.2],
        childMesh: 'fridge_door',
        parentMesh: 'fridge_body',
        anchor: [-0.35, 0.52, 0.275],
        damping: 3.0,
        friction: 0.2,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 60 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('fridge_body', { size: new THREE.Vector3(0.7, 1.8, 0.65), pos: new THREE.Vector3(0, 0.9, -0.05) });
    meshGeometries.set('fridge_door', { size: new THREE.Vector3(0.68, 0.98, 0.03), pos: new THREE.Vector3(0, 0.52, 0.275) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('refrigerator', joints, meshGeometries) };
  }
}
