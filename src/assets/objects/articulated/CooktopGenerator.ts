/**
 * Cooktop Generator - Articulated cooktop with knob controls
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class CooktopGenerator extends ArticulatedObjectBase {
  protected category = 'Cooktop';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Cooktop';

    const bodyMat = this.createMaterial({ color: 0x1A1A1A, metalness: 0.4, roughness: 0.4 });
    const burnerMat = this.createMaterial({ color: 0x333333, roughness: 0.8 });
    const knobMat = this.createMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.3 });
    const s = this.scale;

    // Surface
    const surface = this.createBox('cooktop_surface', 0.6, 0.03, 0.45, bodyMat, new THREE.Vector3(0, 0.015, 0));
    group.add(surface);

    // Burner grates
    const burner1 = this.createCylinder('burner_1', 0.06, 0.06, 0.008, burnerMat, new THREE.Vector3(-0.12, 0.034, 0));
    const burner2 = this.createCylinder('burner_2', 0.06, 0.06, 0.008, burnerMat, new THREE.Vector3(0.12, 0.034, 0));
    group.add(burner1, burner2);

    // Knobs (4 rotating knobs)
    const joints: JointInfo[] = [];
    const knobPositions = [
      { x: -0.18, label: 'knob_back_left' },
      { x: -0.06, label: 'knob_back_right' },
      { x: 0.06, label: 'knob_front_left' },
      { x: 0.18, label: 'knob_front_right' },
    ];

    for (let i = 0; i < knobPositions.length; i++) {
      const knobGroup = new THREE.Group();
      knobGroup.name = `knob_group_${i}`;
      knobGroup.position.set(knobPositions[i].x * s, 0.03 * s, 0.2 * s);

      const knob = this.createCylinder(knobPositions[i].label, 0.012, 0.012, 0.015, knobMat, new THREE.Vector3(0, 0.01, 0));
      knobGroup.add(knob);
      group.add(knobGroup);

      joints.push(this.createJoint({
        id: `cooktop_knob_${i}`,
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 0.75],
        childMesh: knobPositions[i].label,
        parentMesh: 'cooktop_surface',
        anchor: [knobPositions[i].x, 0.03, 0.2],
        damping: 0.8,
        friction: 0.5,
        actuated: true,
        motor: { ctrlRange: [0, 1], gearRatio: 1 },
      }));
    }

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('cooktop_surface', { size: new THREE.Vector3(0.6, 0.03, 0.45), pos: new THREE.Vector3(0, 0.015, 0) });

    return { group, joints, category: this.category, config: cfg, toMJCF: () => generateMJCF('cooktop', joints, meshGeometries) };
  }
}
