/**
 * Drawer Generator - Sliding articulated drawer
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, generateMJCF } from './types';

export class DrawerGenerator extends ArticulatedObjectBase {
  protected category = 'Drawer';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const s = cfg.scale ?? 1;

    const group = new THREE.Group();
    group.name = 'Drawer';

    // Cabinet shell
    const cabinetMat = this.createMaterial({ color: 0x8B6914, roughness: 0.75 });
    const back = this.createBox('cabinet_back', 0.5, 0.3, 0.02, cabinetMat, new THREE.Vector3(0, 0.15, -0.25));
    const left = this.createBox('cabinet_left', 0.02, 0.3, 0.5, cabinetMat, new THREE.Vector3(-0.26, 0.15, 0));
    const right = this.createBox('cabinet_right', 0.02, 0.3, 0.5, cabinetMat, new THREE.Vector3(0.26, 0.15, 0));
    const top = this.createBox('cabinet_top', 0.5, 0.02, 0.5, cabinetMat, new THREE.Vector3(0, 0.3, 0));
    const bottom = this.createBox('cabinet_bottom', 0.5, 0.02, 0.5, cabinetMat, new THREE.Vector3(0, 0, 0));
    group.add(back, left, right, top, bottom);

    // Drawer box (slides out along Z)
    const drawerMat = this.createMaterial({ color: 0xDEB887, roughness: 0.7 });
    const drawerGroup = new THREE.Group();
    drawerGroup.name = 'drawer_slide';

    const drawerFront = this.createBox('drawer_front', 0.48, 0.28, 0.02, drawerMat, new THREE.Vector3(0, 0.14, 0.24));
    const drawerBottom = this.createBox('drawer_bottom', 0.44, 0.01, 0.42, drawerMat, new THREE.Vector3(0, 0.01, 0));
    const drawerLeft = this.createBox('drawer_left', 0.01, 0.12, 0.42, drawerMat, new THREE.Vector3(-0.22, 0.07, 0));
    const drawerRight = this.createBox('drawer_right', 0.01, 0.12, 0.42, drawerMat, new THREE.Vector3(0.22, 0.07, 0));
    const drawerBack = this.createBox('drawer_back', 0.44, 0.12, 0.01, drawerMat, new THREE.Vector3(0, 0.07, -0.21));

    // Handle
    const handleMat = this.createMaterial({ color: 0xA0A0A0, metalness: 0.7, roughness: 0.3 });
    const handle = this.createCylinder('drawer_handle', 0.01, 0.01, 0.1, handleMat, new THREE.Vector3(0, 0.14, 0.28));
    handle.rotation.z = Math.PI / 2;

    drawerGroup.add(drawerFront, drawerBottom, drawerLeft, drawerRight, drawerBack, handle);
    group.add(drawerGroup);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'drawer_slide',
        type: 'prismatic',
        axis: [0, 0, 1],
        limits: [0, 0.35],
        childMesh: 'drawer_front',
        parentMesh: 'cabinet_bottom',
        anchor: [0, 0.01, 0],
        damping: 3.0,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 20 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>();
    meshGeometries.set('cabinet_back', { size: new THREE.Vector3(0.5, 0.3, 0.02), pos: new THREE.Vector3(0, 0.15, -0.25) });
    meshGeometries.set('drawer_front', { size: new THREE.Vector3(0.48, 0.28, 0.02), pos: new THREE.Vector3(0, 0.14, 0.24) });

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('drawer', joints, meshGeometries),
    };
  }
}
