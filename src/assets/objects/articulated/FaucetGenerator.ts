/**
 * Faucet Generator - Articulated faucet with lever
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class FaucetGenerator extends ArticulatedObjectBase {
  protected category = 'Faucet';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Faucet';

    const metalMat = this.createMaterial({ color: 0xC0C0C0, metalness: 0.85, roughness: 0.15 });
    const s = this.scale;

    // Base
    const base = this.createCylinder('faucet_base', 0.02, 0.025, 0.03, metalMat, new THREE.Vector3(0, 0.015, 0));
    group.add(base);

    // Vertical column
    const column = this.createCylinder('faucet_column', 0.01, 0.01, 0.12, metalMat, new THREE.Vector3(0, 0.09, 0));
    group.add(column);

    // Spout (curved - approximated as angled cylinder)
    const spout = this.createCylinder('faucet_spout', 0.008, 0.008, 0.1, metalMat, new THREE.Vector3(0.04, 0.14, 0));
    spout.rotation.z = -Math.PI / 4;
    group.add(spout);

    // Lever handle (hinged)
    const leverPivot = new THREE.Group();
    leverPivot.name = 'faucet_lever_pivot';
    leverPivot.position.set(0, 0.14 * s, 0);

    const lever = this.createCylinder('faucet_lever', 0.006, 0.006, 0.06, metalMat, new THREE.Vector3(0, 0, -0.03));
    lever.rotation.x = Math.PI / 2;
    leverPivot.add(lever);
    group.add(leverPivot);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'faucet_lever_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        childMesh: 'faucet_lever',
        parentMesh: 'faucet_column',
        anchor: [0, 0.14, 0],
        damping: 0.5,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 3 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('faucet_column', { size: new THREE.Vector3(0.02, 0.12, 0.02), pos: new THREE.Vector3(0, 0.09, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('faucet', joints, meshGeometries) };
  }
}
