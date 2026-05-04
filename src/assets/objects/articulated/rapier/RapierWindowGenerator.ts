/**
 * Rapier-Backed Window Generator — P8.3: Rapier-Backed Articulated Objects
 *
 * Window generator with Rapier joints.
 * Supports two window types:
 * - Sliding: PrismaticJoint for horizontal sliding motion
 * - Casement: RevoluteJoint for hinged opening motion
 *
 * @deprecated Use `articulated/WindowGenerator` (extends ArticulatedObjectBase) instead,
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
 * @deprecated Use `import { WindowGenerator } from '../WindowGenerator'` instead.
 */
export class RapierWindowGenerator {
  private config: ArticulatedFurnitureConfig;
  private windowType: 'sliding' | 'casement';

  constructor(
    config: Partial<ArticulatedFurnitureConfig> = {},
    windowType: 'sliding' | 'casement' = 'casement'
  ) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
    this.windowType = windowType;
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierWindow';

    const frameMat = createMaterial({ color: 0xF5F5DC, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xADD8E6,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      metalness: 0.0,
    });

    // Frame (fixed base)
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.04 * s, 0.06 * s), frameMat);
    frameTop.position.set(0, 0.7 * s, 0);
    frameTop.name = 'win_frame_top';
    frameTop.castShadow = true;
    group.add(frameTop);

    const frameBot = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.04 * s, 0.06 * s), frameMat);
    frameBot.position.set(0, -0.7 * s, 0);
    frameBot.name = 'win_frame_bot';
    frameBot.castShadow = true;
    group.add(frameBot);

    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 1.44 * s, 0.06 * s), frameMat);
    frameLeft.position.set(-0.5 * s, 0, 0);
    frameLeft.name = 'win_frame_left';
    frameLeft.castShadow = true;
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 1.44 * s, 0.06 * s), frameMat);
    frameRight.position.set(0.5 * s, 0, 0);
    frameRight.name = 'win_frame_right';
    frameRight.castShadow = true;
    group.add(frameRight);

    const joints: RapierJointConfig[] = [];
    const rigidBodies: RigidBodyDef[] = [];

    if (this.windowType === 'sliding') {
      // Sliding window — PrismaticJoint along X axis
      const slidingPanel = new THREE.Group();
      slidingPanel.name = 'window_sliding_pivot';

      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 1.34 * s, 0.02 * s), frameMat);
      panel.position.set(0.23 * s, 0, 0.01 * s);
      panel.name = 'window_panel_sliding';
      panel.castShadow = true;

      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 1.26 * s, 0.005 * s), glassMat);
      glass.position.set(0.23 * s, 0, 0.02 * s);
      glass.name = 'window_glass_sliding';

      slidingPanel.add(panel, glass);
      group.add(slidingPanel);

      joints.push({
        id: 'window_slide',
        type: 'prismatic',
        bodyA: 'win_frame_left',
        bodyB: 'window_panel_sliding',
        anchorA: new THREE.Vector3(0, 0, 0.01 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(1, 0, 0), // Slide horizontally
        limits: [0, 0.46 * s],
        springStiffness: 0,
        springDamping: 2.0,
      });

      rigidBodies.push(
        {
          name: 'win_frame_left',
          type: 'fixed',
          position: new THREE.Vector3(-0.5 * s, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.02 * s, 0.72 * s, 0.03 * s),
          mass: 0,
          isBase: true,
        },
        {
          name: 'window_panel_sliding',
          type: 'dynamic',
          position: new THREE.Vector3(0, 0, 0.01 * s),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.23 * s, 0.67 * s, 0.01 * s),
          mass: 5,
          isBase: false,
        }
      );
    } else {
      // Casement window — RevoluteJoint hinged on left
      const casementPivot = new THREE.Group();
      casementPivot.name = 'window_casement_pivot';
      casementPivot.position.set(-0.48 * s, 0, 0);

      const casementFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.92 * s, 1.34 * s, 0.02 * s),
        frameMat
      );
      casementFrame.position.set(0.46 * s, 0, 0.01 * s);
      casementFrame.name = 'window_casement_frame';
      casementFrame.castShadow = true;

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.84 * s, 1.26 * s, 0.005 * s),
        glassMat
      );
      glass.position.set(0.46 * s, 0, 0.02 * s);
      glass.name = 'window_glass_casement';

      casementPivot.add(casementFrame, glass);
      group.add(casementPivot);

      joints.push({
        id: 'window_hinge',
        type: 'revolute',
        bodyA: 'win_frame_left',
        bodyB: 'window_casement_frame',
        anchorA: new THREE.Vector3(-0.48 * s, 0, 0.01 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge
        limits: [0, Math.PI * 0.75],
        springStiffness: 2.0,
        springDamping: 0.5,
      });

      rigidBodies.push(
        {
          name: 'win_frame_left',
          type: 'fixed',
          position: new THREE.Vector3(-0.5 * s, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.02 * s, 0.72 * s, 0.03 * s),
          mass: 0,
          isBase: true,
        },
        {
          name: 'window_casement_frame',
          type: 'dynamic',
          position: new THREE.Vector3(0, 0, 0.01 * s),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.46 * s, 0.67 * s, 0.01 * s),
          mass: 4,
          isBase: false,
        }
      );
    }

    return { group, joints, rigidBodies, category: 'Window' };
  }
}
