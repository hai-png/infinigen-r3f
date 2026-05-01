/**
 * Window Generator - Hinged/sliding window
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class WindowGenerator extends ArticulatedObjectBase {
  protected category = 'Window';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Window';

    const frameMat = this.createMaterial({ color: 0xF5F5DC, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.0 });
    const s = this.scale;

    // Frame
    const frameTop = this.createBox('win_frame_top', 1.0, 0.04, 0.06, frameMat, new THREE.Vector3(0, 0.7, 0));
    const frameBot = this.createBox('win_frame_bot', 1.0, 0.04, 0.06, frameMat, new THREE.Vector3(0, -0.7, 0));
    const frameLeft = this.createBox('win_frame_left', 0.04, 1.44, 0.06, frameMat, new THREE.Vector3(-0.5, 0, 0));
    const frameRight = this.createBox('win_frame_right', 0.04, 1.44, 0.06, frameMat, new THREE.Vector3(0.5, 0, 0));
    group.add(frameTop, frameBot, frameLeft, frameRight);

    // Casement window (hinged on left)
    const casementPivot = new THREE.Group();
    casementPivot.name = 'window_casement_pivot';
    casementPivot.position.set(-0.48 * s, 0, 0);

    const casementFrame = this.createBox('casement_frame', 0.92, 1.34, 0.02, frameMat, new THREE.Vector3(0.46, 0, 0.01));
    const glass = this.createBox('window_glass', 0.84, 1.26, 0.005, glassMat, new THREE.Vector3(0.46, 0, 0.02));
    casementPivot.add(casementFrame, glass);
    group.add(casementPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'window_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 0.75],
        childMesh: 'window_glass',
        parentMesh: 'win_frame_left',
        anchor: [-0.48, 0, 0.01],
        damping: 1.5,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 30 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('window_glass', { size: new THREE.Vector3(0.84, 1.26, 0.005), pos: new THREE.Vector3(0, 0, 0.02) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('window', joints, meshGeometries) };
  }
}
