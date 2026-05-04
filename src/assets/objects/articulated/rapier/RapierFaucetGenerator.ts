/**
 * Rapier-Backed Faucet Generator — P8.3: Rapier-Backed Articulated Objects
 *
 * Faucet generator with Rapier RevoluteJoint.
 * Creates a faucet with:
 * - Lever handle: RevoluteJoint for up/down rotation
 * - Spout: RevoluteJoint for swivel rotation
 *
 * @deprecated Use `articulated/FaucetGenerator` (extends ArticulatedObjectBase) instead,
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
 * @deprecated Use `import { FaucetGenerator } from '../FaucetGenerator'` instead.
 */
export class RapierFaucetGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierFaucet';

    const metalMat = createMaterial({ color: 0xC0C0C0, metalness: 0.85, roughness: 0.15 });

    // Base (fixed)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * s, 0.025 * s, 0.03 * s, 16),
      metalMat
    );
    base.position.set(0, 0.015 * s, 0);
    base.name = 'faucet_base';
    base.castShadow = true;
    group.add(base);

    // Column (fixed)
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.12 * s, 12),
      metalMat
    );
    column.position.set(0, 0.09 * s, 0);
    column.name = 'faucet_column';
    column.castShadow = true;
    group.add(column);

    // Spout (dynamic — swivel rotation)
    const spoutGroup = new THREE.Group();
    spoutGroup.name = 'faucet_spout_pivot';
    spoutGroup.position.set(0, 0.14 * s, 0);

    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.1 * s, 12),
      metalMat
    );
    spout.position.set(0.04 * s, 0, 0);
    spout.rotation.z = -Math.PI / 4;
    spout.name = 'faucet_spout';
    spout.castShadow = true;

    spoutGroup.add(spout);
    group.add(spoutGroup);

    // Lever handle (dynamic — rotates to control flow)
    const leverGroup = new THREE.Group();
    leverGroup.name = 'faucet_lever_pivot';
    leverGroup.position.set(0, 0.14 * s, 0);

    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.06 * s, 8),
      metalMat
    );
    lever.position.set(0, 0, -0.03 * s);
    lever.rotation.x = Math.PI / 2;
    lever.name = 'faucet_lever';
    lever.castShadow = true;

    leverGroup.add(lever);
    group.add(leverGroup);

    // Rapier joint configurations
    const joints: RapierJointConfig[] = [
      {
        id: 'faucet_lever_hinge',
        type: 'revolute',
        bodyA: 'faucet_column',
        bodyB: 'faucet_lever',
        anchorA: new THREE.Vector3(0, 0.14 * s, 0),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(1, 0, 0), // Rotate around X for up/down
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        springStiffness: 3.0, // Spring-back to center
        springDamping: 0.5,
      },
      {
        id: 'faucet_spout_swivel',
        type: 'revolute',
        bodyA: 'faucet_column',
        bodyB: 'faucet_spout',
        anchorA: new THREE.Vector3(0, 0.14 * s, 0),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Rotate around Y for swivel
        limits: [-Math.PI * 0.5, Math.PI * 0.5],
        springStiffness: 2.0,
        springDamping: 1.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'faucet_column',
        type: 'fixed',
        position: new THREE.Vector3(0, 0.09 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.01 * s, 0.06 * s, 0.01 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'faucet_lever',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.14 * s, -0.03 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.003 * s, 0.03 * s, 0.003 * s),
        mass: 0.1,
        isBase: false,
      },
      {
        name: 'faucet_spout',
        type: 'dynamic',
        position: new THREE.Vector3(0.04 * s, 0.14 * s, 0),
        rotation: new THREE.Euler(0, 0, -Math.PI / 4),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.004 * s, 0.05 * s, 0.004 * s),
        mass: 0.2,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Faucet' };
  }
}
