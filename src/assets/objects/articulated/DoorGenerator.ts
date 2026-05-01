/**
 * Door Generator - Hinged articulated door
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class DoorGenerator extends ArticulatedObjectBase {
  protected category = 'Door';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const s = cfg.scale ?? 1;

    const group = new THREE.Group();
    group.name = 'Door';

    // Frame
    const frameMat = this.createMaterial({ color: 0x8B7355, roughness: 0.8 });
    const frameLeft = this.createBox('frame_left', 0.05, 2.1, 0.08, frameMat, new THREE.Vector3(-0.475, 1.05, 0));
    const frameRight = this.createBox('frame_right', 0.05, 2.1, 0.08, frameMat, new THREE.Vector3(0.475, 1.05, 0));
    const frameTop = this.createBox('frame_top', 0.95, 0.05, 0.08, frameMat, new THREE.Vector3(0, 2.075, 0));
    group.add(frameLeft, frameRight, frameTop);

    // Door panel (pivots around left edge)
    const doorMat = this.createMaterial({ color: 0xD2B48C, roughness: 0.7 });
    const doorPivot = new THREE.Group();
    doorPivot.name = 'door_pivot';
    doorPivot.position.set(-0.45 * s, 0, 0);

    const doorPanel = this.createBox('door_panel', 0.88, 2.0, 0.03, doorMat, new THREE.Vector3(0.44, 1.0, 0));
    doorPivot.add(doorPanel);
    group.add(doorPivot);

    // Door handle
    const handleMat = this.createMaterial({ color: 0xC0C0C0, metalness: 0.8, roughness: 0.2 });
    const handleBase = this.createCylinder('handle_base', 0.015, 0.015, 0.04, handleMat, new THREE.Vector3(0.75, 1.0, 0.035));
    const handleKnob = this.createCylinder('handle_knob', 0.02, 0.02, 0.06, handleMat, new THREE.Vector3(0.75, 1.0, 0.07));
    handleKnob.rotation.x = Math.PI / 2;
    doorPivot.add(handleBase, handleKnob);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'door_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.5],
        childMesh: 'door_panel',
        parentMesh: 'frame_left',
        anchor: [-0.45, 0, 0],
        damping: 2.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 50 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('frame_left', { size: new THREE.Vector3(0.05, 2.1, 0.08), pos: new THREE.Vector3(-0.475, 1.05, 0) });
    meshGeometries.set('frame_right', { size: new THREE.Vector3(0.05, 2.1, 0.08), pos: new THREE.Vector3(0.475, 1.05, 0) });
    meshGeometries.set('frame_top', { size: new THREE.Vector3(0.95, 0.05, 0.08), pos: new THREE.Vector3(0, 2.075, 0) });
    meshGeometries.set('door_panel', { size: new THREE.Vector3(0.88, 2.0, 0.03), pos: new THREE.Vector3(0, 1.0, 0) });

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('door', joints, meshGeometries),
    };
  }
}
