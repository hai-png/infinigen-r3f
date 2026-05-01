/**
 * PepperGrinder Generator - Rotating top pepper grinder
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class PepperGrinderGenerator extends ArticulatedObjectBase {
  protected category = 'PepperGrinder';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'PepperGrinder';

    const woodMat = this.createMaterial({ color: 0x3E2723, roughness: 0.8 });
    const metalMat = this.createMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
    const s = this.scale;

    // Body
    const body = this.createCylinder('grinder_body', 0.025, 0.03, 0.18, woodMat, new THREE.Vector3(0, 0.09, 0));
    group.add(body);

    // Metal band
    const band = this.createCylinder('grinder_band', 0.032, 0.032, 0.01, metalMat, new THREE.Vector3(0, 0.04, 0));
    group.add(band);

    // Knob (rotates to grind)
    const knobGroup = new THREE.Group();
    knobGroup.name = 'grinder_knob_group';
    knobGroup.position.set(0, 0.18 * s, 0);

    const knob = this.createCylinder('grinder_knob', 0.02, 0.015, 0.04, metalMat, new THREE.Vector3(0, 0.02, 0));
    const knobTop = this.createCylinder('grinder_knob_top', 0.022, 0.022, 0.008, woodMat, new THREE.Vector3(0, 0.044, 0));
    knobGroup.add(knob, knobTop);
    group.add(knobGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'grinder_knob_rotate',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [-Math.PI * 4, Math.PI * 4],
        childMesh: 'grinder_knob',
        parentMesh: 'grinder_body',
        anchor: [0, 0.18, 0],
        damping: 0.3,
        friction: 0.6,
        actuated: true,
        motor: { ctrlRange: [-3, 3], gearRatio: 2 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('grinder_body', { size: new THREE.Vector3(0.06, 0.18, 0.06), pos: new THREE.Vector3(0, 0.09, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('pepper_grinder', joints, meshGeometries) };
  }
}
