/**
 * Box Generator - Hinged lid box
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class BoxGenerator extends ArticulatedObjectBase {
  protected category = 'Box';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Box';

    const woodMat = this.createMaterial({ color: 0x8B6914, roughness: 0.75 });
    const s = this.scale;

    // Bottom
    const bottom = this.createBox('box_bottom', 0.4, 0.01, 0.25, woodMat, new THREE.Vector3(0, 0.005, 0));
    const front = this.createBox('box_front', 0.4, 0.15, 0.01, woodMat, new THREE.Vector3(0, 0.075, 0.12));
    const back = this.createBox('box_back', 0.4, 0.15, 0.01, woodMat, new THREE.Vector3(0, 0.075, -0.12));
    const left = this.createBox('box_left', 0.01, 0.15, 0.25, woodMat, new THREE.Vector3(-0.2, 0.075, 0));
    const right = this.createBox('box_right', 0.01, 0.15, 0.25, woodMat, new THREE.Vector3(0.2, 0.075, 0));
    group.add(bottom, front, back, left, right);

    // Lid (hinged at back)
    const lidPivot = new THREE.Group();
    lidPivot.name = 'box_lid_pivot';
    lidPivot.position.set(0, 0.15 * s, -0.125 * s);

    const lid = this.createBox('box_lid', 0.42, 0.015, 0.27, woodMat, new THREE.Vector3(0, 0, 0.125));
    lidPivot.add(lid);
    group.add(lidPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'box_lid_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [0, Math.PI * 0.8],
        childMesh: 'box_lid',
        parentMesh: 'box_back',
        anchor: [0, 0.15, -0.125],
        damping: 1.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-0.3, 0.3], gearRatio: 8 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('box_bottom', { size: new THREE.Vector3(0.4, 0.01, 0.25), pos: new THREE.Vector3(0, 0.005, 0) });
    meshGeometries.set('box_lid', { size: new THREE.Vector3(0.42, 0.015, 0.27), pos: new THREE.Vector3(0, 0.15, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('box', joints, meshGeometries) };
  }
}
