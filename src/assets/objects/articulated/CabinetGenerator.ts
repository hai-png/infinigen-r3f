/**
 * Cabinet Generator - Hinged cabinet with door + optional internal drawer (Sim-Ready)
 *
 * Sim-ready features:
 * - Hinge joint for door [0, 252°]
 * - Prismatic joint for internal drawer (optional)
 * - Collision geometry for all panels + door
 * - Mass/inertia estimated from geometry
 * - URDF, MJCF, and USD export
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, SimReadyMetadata, generateMJCF } from './types';
import { generateURDF, URDFExportOptions } from './URDFExporter';
import { generateUSD } from './USDExporter';

export class CabinetGenerator extends ArticulatedObjectBase {
  protected category = 'Cabinet';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Cabinet';

    const woodMat = this.createMaterial({ color: 0x6B4226, roughness: 0.75 });
    const s = this.scale;

    // Cabinet body
    const top = this.createBox('cab_top', 0.6, 0.02, 0.4, woodMat, new THREE.Vector3(0, 0.9, 0));
    const bottom = this.createBox('cab_bottom', 0.6, 0.02, 0.4, woodMat, new THREE.Vector3(0, 0, 0));
    const left = this.createBox('cab_left', 0.02, 0.9, 0.4, woodMat, new THREE.Vector3(-0.31, 0.45, 0));
    const right = this.createBox('cab_right', 0.02, 0.9, 0.4, woodMat, new THREE.Vector3(0.31, 0.45, 0));
    const back = this.createBox('cab_back', 0.6, 0.9, 0.01, woodMat, new THREE.Vector3(0, 0.45, -0.2));
    const shelf = this.createBox('cab_shelf', 0.56, 0.015, 0.38, woodMat, new THREE.Vector3(0, 0.45, 0));
    group.add(top, bottom, left, right, back, shelf);

    // Cabinet door (hinged on left side)
    const doorMat = this.createMaterial({ color: 0x8B6914, roughness: 0.7 });
    const doorPivot = new THREE.Group();
    doorPivot.name = 'cabinet_door_pivot';
    doorPivot.position.set(-0.3 * s, 0, 0);

    const doorPanel = this.createBox('cabinet_door', 0.58, 0.88, 0.015, doorMat, new THREE.Vector3(0.29, 0.45, 0.2));
    doorPivot.add(doorPanel);

    // Door knob
    const knobMat = this.createMaterial({ color: 0xB8860B, metalness: 0.6, roughness: 0.3 });
    const knob = this.createSphere('cabinet_knob', 0.015, knobMat, new THREE.Vector3(0.5, 0.45, 0.22));
    doorPivot.add(knob);

    group.add(doorPivot);

    // Internal drawer (prismatic joint)
    const drawerGroup = new THREE.Group();
    drawerGroup.name = 'cabinet_drawer_pivot';
    const drawerFront = this.createBox('cabinet_drawer_front', 0.54, 0.2, 0.015, doorMat, new THREE.Vector3(0, 0.1, 0.19));
    const drawerBottomPanel = this.createBox('cabinet_drawer_bottom', 0.5, 0.01, 0.3, woodMat, new THREE.Vector3(0, 0.005, 0.05));
    drawerGroup.add(drawerFront, drawerBottomPanel);
    group.add(drawerGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'cabinet_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.4],
        childMesh: 'cabinet_door',
        parentMesh: 'cab_left',
        anchor: [-0.3, 0.45, 0.2],
        damping: 2.5,
        friction: 0.2,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 40 },
      }),
      this.createJoint({
        id: 'cabinet_drawer_slide',
        type: 'prismatic',
        axis: [0, 0, 1],
        limits: [0, 0.25],
        childMesh: 'cabinet_drawer_front',
        parentMesh: 'cab_bottom',
        anchor: [0, 0.1, 0.19],
        damping: 2.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-0.3, 0.3], gearRatio: 15 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>();
    // Cabinet structure (static)
    meshGeometries.set('cab_top', { size: new THREE.Vector3(0.6, 0.02, 0.4), pos: new THREE.Vector3(0, 0.9, 0) });
    meshGeometries.set('cab_bottom', { size: new THREE.Vector3(0.6, 0.02, 0.4), pos: new THREE.Vector3(0, 0, 0) });
    meshGeometries.set('cab_left', { size: new THREE.Vector3(0.02, 0.9, 0.4), pos: new THREE.Vector3(-0.31, 0.45, 0) });
    meshGeometries.set('cab_right', { size: new THREE.Vector3(0.02, 0.9, 0.4), pos: new THREE.Vector3(0.31, 0.45, 0) });
    // Door (dynamic)
    const doorVolume = 0.58 * 0.88 * 0.015;
    const doorMass = doorVolume * 600 * 0.5;
    meshGeometries.set('cabinet_door', { size: new THREE.Vector3(0.58, 0.88, 0.015), pos: new THREE.Vector3(0, 0.45, 0.2), mass: doorMass });
    // Drawer (dynamic)
    const drawerVolume = 0.54 * 0.2 * 0.015 + 0.5 * 0.01 * 0.3;
    const drawerMass = drawerVolume * 600 * 0.4;
    meshGeometries.set('cabinet_drawer_front', { size: new THREE.Vector3(0.54, 0.2, 0.015), pos: new THREE.Vector3(0, 0.1, 0.19), mass: drawerMass });

    const collisionHints = new Map<string, 'box' | 'sphere' | 'cylinder'>();
    collisionHints.set('cab_top', 'box');
    collisionHints.set('cab_bottom', 'box');
    collisionHints.set('cab_left', 'box');
    collisionHints.set('cab_right', 'box');
    collisionHints.set('cabinet_door', 'box');
    collisionHints.set('cabinet_drawer_front', 'box');

    const simReady: SimReadyMetadata = {
      density: 600,
      friction: 0.5,
      restitution: 0.2,
      rootBodyStatic: true,
      collisionHints,
    };

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('cabinet', joints, meshGeometries),
      toURDF: (options?: URDFExportOptions) => generateURDF('cabinet', joints, meshGeometries, { includeInertial: true, includeCollision: true, estimateMassFromGeometry: true, defaultDensity: 600, ...options }),
      toUSD: () => generateUSD('cabinet', joints, meshGeometries),
      meshGeometries,
      simReady,
    };
  }

  private createSphere(name: string, radius: number, material: THREE.Material, position: THREE.Vector3): THREE.Mesh {
    const geo = new THREE.SphereGeometry(radius * this.scale, 12, 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.position.copy(position.multiplyScalar(this.scale));
    return mesh;
  }
}
