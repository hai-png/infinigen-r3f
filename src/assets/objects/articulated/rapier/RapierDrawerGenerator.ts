/**
 * Rapier-Backed Drawer Generator — P8.3: Rapier-Backed Articulated Objects
 *
 * Drawer generator with Rapier PrismaticJoint.
 * Creates a cabinet with a drawer that slides along the Z axis.
 * Linear limits: 0 (closed) to 0.35m (fully open).
 *
 * @deprecated Use `articulated/DrawerGenerator` (extends ArticulatedObjectBase) instead,
 *           which provides a unified ArticulatedObjectResult with joint metadata
 *           and MJCF/URDF export. This Rapier-specific standalone will be removed
 *           in a future release once the unified articulated system supports
 *           Rapier physics natively.
 *
 * @phase 8
 * @p-number P8.3
 */

import * as THREE from 'three';
import {
  DEFAULT_FURNITURE_CONFIG,
  createMaterial,
  type ArticulatedFurnitureConfig,
  type ArticulatedFurnitureResult,
  type RapierJointConfig,
  type RigidBodyDef,
} from './RapierTypes';

/**
 * @deprecated Use `import { DrawerGenerator } from '../DrawerGenerator'` instead.
 */
export class RapierDrawerGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierDrawer';

    const cabinetMat = createMaterial({ color: 0x8B6914, roughness: 0.75 });
    const drawerMat = createMaterial({ color: 0xDEB887, roughness: 0.7 });
    const handleMat = createMaterial({ color: 0xA0A0A0, metalness: 0.7, roughness: 0.3 });

    // Cabinet shell (fixed base)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.3 * s, 0.02 * s), cabinetMat);
    back.position.set(0, 0.15 * s, -0.25 * s);
    back.name = 'cabinet_back';
    back.castShadow = true;
    group.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.3 * s, 0.5 * s), cabinetMat);
    left.position.set(-0.26 * s, 0.15 * s, 0);
    left.name = 'cabinet_left';
    left.castShadow = true;
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.3 * s, 0.5 * s), cabinetMat);
    right.position.set(0.26 * s, 0.15 * s, 0);
    right.name = 'cabinet_right';
    right.castShadow = true;
    group.add(right);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.02 * s, 0.5 * s), cabinetMat);
    top.position.set(0, 0.3 * s, 0);
    top.name = 'cabinet_top';
    top.castShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.02 * s, 0.5 * s), cabinetMat);
    bottom.position.set(0, 0, 0);
    bottom.name = 'cabinet_bottom';
    bottom.castShadow = true;
    group.add(bottom);

    // Drawer box (dynamic body — slides out)
    const drawerGroup = new THREE.Group();
    drawerGroup.name = 'drawer_slide_group';

    const drawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.28 * s, 0.02 * s), drawerMat);
    drawerFront.position.set(0, 0.14 * s, 0.24 * s);
    drawerFront.name = 'drawer_front';
    drawerFront.castShadow = true;

    const drawerBottom = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.01 * s, 0.42 * s), drawerMat);
    drawerBottom.position.set(0, 0.01 * s, 0);
    drawerBottom.name = 'drawer_bottom';

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.1 * s, 8),
      handleMat
    );
    handle.position.set(0, 0.14 * s, 0.28 * s);
    handle.rotation.z = Math.PI / 2;
    handle.name = 'drawer_handle';

    drawerGroup.add(drawerFront, drawerBottom, handle);
    group.add(drawerGroup);

    // Rapier joint configuration
    const joints: RapierJointConfig[] = [
      {
        id: 'drawer_slide',
        type: 'prismatic',
        bodyA: 'cabinet_bottom',
        bodyB: 'drawer_front',
        anchorA: new THREE.Vector3(0, 0.01 * s, 0),
        anchorB: new THREE.Vector3(0, 0, -0.22 * s),
        axis: new THREE.Vector3(0, 0, 1), // Slide along Z
        limits: [0, 0.35 * s],
        springStiffness: 0,
        springDamping: 3.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'cabinet_bottom',
        type: 'fixed',
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.25 * s, 0.01 * s, 0.25 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'drawer_front',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.14 * s, 0.24 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.24 * s, 0.14 * s, 0.01 * s),
        mass: 3,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Drawer' };
  }
}
