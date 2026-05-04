/**
 * Rapier-Backed Cabinet Generator — P8.3: Rapier-Backed Articulated Objects
 *
 * Cabinet generator with Rapier RevoluteJoint and spring-back.
 * Creates a cabinet with a hinged door that auto-closes via spring.
 * Angular limits: 0 (closed) to PI/2 (open).
 * Spring-back: door returns to closed position when released.
 *
 * @deprecated Use `articulated/CabinetGenerator` (extends ArticulatedObjectBase) instead,
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
 * @deprecated Use `import { CabinetGenerator } from '../CabinetGenerator'` instead.
 */
export class RapierCabinetGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierCabinet';

    const woodMat = createMaterial({ color: 0x6B4226, roughness: 0.75 });
    const doorMat = createMaterial({ color: 0x8B6914, roughness: 0.7 });
    const knobMat = createMaterial({ color: 0xB8860B, metalness: 0.6, roughness: 0.3 });

    // Cabinet body (fixed base)
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.02 * s, 0.4 * s), woodMat);
    top.position.set(0, 0.9 * s, 0);
    top.name = 'cab_top';
    top.castShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.02 * s, 0.4 * s), woodMat);
    bottom.position.set(0, 0, 0);
    bottom.name = 'cab_bottom';
    bottom.castShadow = true;
    group.add(bottom);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.9 * s, 0.4 * s), woodMat);
    left.position.set(-0.31 * s, 0.45 * s, 0);
    left.name = 'cab_left';
    left.castShadow = true;
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.9 * s, 0.4 * s), woodMat);
    right.position.set(0.31 * s, 0.45 * s, 0);
    right.name = 'cab_right';
    right.castShadow = true;
    group.add(right);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.9 * s, 0.01 * s), woodMat);
    back.position.set(0, 0.45 * s, -0.2 * s);
    back.name = 'cab_back';
    back.castShadow = true;
    group.add(back);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.015 * s, 0.38 * s), woodMat);
    shelf.position.set(0, 0.45 * s, 0);
    shelf.name = 'cab_shelf';
    shelf.castShadow = true;
    group.add(shelf);

    // Cabinet door (dynamic — hinged on left)
    const doorPivot = new THREE.Group();
    doorPivot.name = 'cabinet_door_pivot';
    doorPivot.position.set(-0.3 * s, 0, 0);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.58 * s, 0.88 * s, 0.015 * s),
      doorMat
    );
    doorPanel.position.set(0.29 * s, 0.45 * s, 0.2 * s);
    doorPanel.name = 'cabinet_door';
    doorPanel.castShadow = true;

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.015 * s, 12, 8),
      knobMat
    );
    knob.position.set(0.5 * s, 0.45 * s, 0.22 * s);
    knob.name = 'cabinet_knob';

    doorPivot.add(doorPanel, knob);
    group.add(doorPivot);

    // Rapier joint with spring-back
    const joints: RapierJointConfig[] = [
      {
        id: 'cabinet_hinge',
        type: 'revolute',
        bodyA: 'cab_left',
        bodyB: 'cabinet_door',
        anchorA: new THREE.Vector3(-0.3 * s, 0.45 * s, 0.2 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge
        limits: [0, Math.PI / 2],
        springStiffness: 10.0, // Spring-back force
        springDamping: 2.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'cab_left',
        type: 'fixed',
        position: new THREE.Vector3(-0.31 * s, 0.45 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.01 * s, 0.45 * s, 0.2 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'cabinet_door',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.45 * s, 0.2 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.29 * s, 0.44 * s, 0.0075 * s),
        mass: 5,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Cabinet' };
  }
}
