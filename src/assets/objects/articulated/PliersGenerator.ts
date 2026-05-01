/**
 * Pliers Generator - Articulated pliers with hinged jaws
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class PliersGenerator extends ArticulatedObjectBase {
  protected category = 'Pliers';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Pliers';

    const metalMat = this.createMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.25 });
    const gripMat = this.createMaterial({ color: 0xCC3333, roughness: 0.9 });
    const s = this.scale;

    // Lower jaw (fixed)
    const lowerJaw = this.createBox('pliers_lower_jaw', 0.03, 0.02, 0.06, metalMat, new THREE.Vector3(0, 0, 0.03));
    const lowerHandle = this.createBox('pliers_lower_handle', 0.015, 0.02, 0.1, gripMat, new THREE.Vector3(0, -0.005, -0.08));
    group.add(lowerJaw, lowerHandle);

    // Upper jaw (hinged)
    const upperPivot = new THREE.Group();
    upperPivot.name = 'pliers_upper_pivot';
    upperPivot.position.set(0, 0, -0.01 * s);

    const upperJaw = this.createBox('pliers_upper_jaw', 0.03, 0.02, 0.06, metalMat, new THREE.Vector3(0, 0.005, 0.04));
    const upperHandle = this.createBox('pliers_upper_handle', 0.015, 0.02, 0.1, gripMat, new THREE.Vector3(0, 0.005, -0.07));
    upperPivot.add(upperJaw, upperHandle);
    group.add(upperPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'pliers_jaw_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [0, Math.PI * 0.15],
        childMesh: 'pliers_upper_jaw',
        parentMesh: 'pliers_lower_jaw',
        anchor: [0, 0, -0.01],
        damping: 0.3,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [0, 1], gearRatio: 5 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('pliers_lower_jaw', { size: new THREE.Vector3(0.03, 0.02, 0.06), pos: new THREE.Vector3(0, 0, 0.03) });
    meshGeometries.set('pliers_upper_jaw', { size: new THREE.Vector3(0.03, 0.02, 0.06), pos: new THREE.Vector3(0, 0.005, 0.03) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('pliers', joints, meshGeometries) };
  }
}
