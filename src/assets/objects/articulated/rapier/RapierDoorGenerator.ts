/**
 * Rapier-Backed Door Generator — P8.3: Rapier-Backed Articulated Objects
 *
 * Door generator with Rapier RevoluteJoint.
 * Creates a door panel that rotates around a vertical axis (hinge).
 * Angular limits: 0 (closed) to PI/2 (open at 90 degrees).
 * Supports spring-back for auto-closing.
 *
 * @deprecated Use `articulated/DoorGenerator` (extends ArticulatedObjectBase) instead,
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
 * @deprecated Use `import { DoorGenerator } from '../DoorGenerator'` instead.
 */
export class RapierDoorGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierDoor';

    const frameMat = createMaterial({ color: 0x8B7355, roughness: 0.8 });
    const doorMat = createMaterial({ color: 0xD2B48C, roughness: 0.7 });
    const handleMat = createMaterial({ color: 0xC0C0C0, metalness: 0.8, roughness: 0.2 });

    // Door frame (fixed base)
    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 * s, 2.1 * s, 0.08 * s),
      frameMat
    );
    frameLeft.position.set(-0.475 * s, 1.05 * s, 0);
    frameLeft.name = 'door_frame_left';
    frameLeft.castShadow = true;
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 * s, 2.1 * s, 0.08 * s),
      frameMat
    );
    frameRight.position.set(0.475 * s, 1.05 * s, 0);
    frameRight.name = 'door_frame_right';
    frameRight.castShadow = true;
    group.add(frameRight);

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.95 * s, 0.05 * s, 0.08 * s),
      frameMat
    );
    frameTop.position.set(0, 2.075 * s, 0);
    frameTop.name = 'door_frame_top';
    frameTop.castShadow = true;
    group.add(frameTop);

    // Door panel (dynamic body — rotates around left edge)
    const doorGroup = new THREE.Group();
    doorGroup.name = 'door_pivot';
    doorGroup.position.set(-0.45 * s, 0, 0);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.88 * s, 2.0 * s, 0.03 * s),
      doorMat
    );
    doorPanel.position.set(0.44 * s, 1.0 * s, 0);
    doorPanel.name = 'door_panel';
    doorPanel.castShadow = true;
    doorGroup.add(doorPanel);

    // Door handle
    const handleKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.06 * s, 12),
      handleMat
    );
    handleKnob.position.set(0.75 * s, 1.0 * s, 0.05 * s);
    handleKnob.rotation.x = Math.PI / 2;
    handleKnob.name = 'door_handle';
    doorGroup.add(handleKnob);

    group.add(doorGroup);

    // Rapier joint configuration
    const joints: RapierJointConfig[] = [
      {
        id: 'door_hinge',
        type: 'revolute',
        bodyA: 'door_frame_left',
        bodyB: 'door_panel',
        anchorA: new THREE.Vector3(-0.45 * s, 1.0 * s, 0),
        anchorB: new THREE.Vector3(0, 1.0 * s, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge axis
        limits: [0, Math.PI / 2],
        springStiffness: 5.0, // Auto-close spring
        springDamping: 1.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'door_frame_left',
        type: 'fixed',
        position: new THREE.Vector3(-0.475 * s, 1.05 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.025 * s, 1.05 * s, 0.04 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'door_panel',
        type: 'dynamic',
        position: new THREE.Vector3(0, 1.0 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.44 * s, 1.0 * s, 0.015 * s),
        mass: 15, // 15 kg door
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Door' };
  }
}
