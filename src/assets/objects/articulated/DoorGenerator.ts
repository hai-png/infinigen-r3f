/**
 * Door Generator - Hinged articulated door (Sim-Ready)
 *
 * Sim-ready features:
 * - Hinge joint with limits [0, 270°]
 * - Collision geometry for frame + panel
 * - Mass/inertia estimated from geometry
 * - URDF, MJCF, and USD export
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, SimReadyMetadata, generateMJCF } from './types';
import { generateURDF, URDFExportOptions } from './URDFExporter';
import { generateUSD } from './USDExporter';

export class DoorGenerator extends ArticulatedObjectBase {
  protected category = 'Door';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const s = cfg.scale ?? 1;

    const group = new THREE.Group();
    group.name = 'Door';

    // Frame
    const frameMat = this.createMaterial({ color: 0x8B7355, roughness: 0.8 });
    const frameLeft = this.createBox('frame_left', 0.05, 2.1, 0.08, frameMat, new THREE.Vector3(-0.475, 1.05, 0));
    const frameRight = this.createBox('frame_right', 0.05, 2.1, 0.08, frameMat, new THREE.Vector3(0.475, 1.05, 0));
    const frameTop = this.createBox('frame_top', 0.95, 0.05, 0.08, frameMat, new THREE.Vector3(0, 2.075, 0));
    group.add(frameLeft, frameRight, frameTop);

    // Door panel (pivots around left edge)
    const doorMat = this.createMaterial({ color: 0xD2B48C, roughness: 0.7 });
    const doorPivot = new THREE.Group();
    doorPivot.name = 'door_pivot';
    doorPivot.position.set(-0.45 * s, 0, 0);

    const doorPanel = this.createBox('door_panel', 0.88, 2.0, 0.03, doorMat, new THREE.Vector3(0.44, 1.0, 0));
    doorPivot.add(doorPanel);
    group.add(doorPivot);

    // Door handle
    const handleMat = this.createMaterial({ color: 0xC0C0C0, metalness: 0.8, roughness: 0.2 });
    const handleBase = this.createCylinder('handle_base', 0.015, 0.015, 0.04, handleMat, new THREE.Vector3(0.75, 1.0, 0.035));
    const handleKnob = this.createCylinder('handle_knob', 0.02, 0.02, 0.06, handleMat, new THREE.Vector3(0.75, 1.0, 0.07));
    handleKnob.rotation.x = Math.PI / 2;
    doorPivot.add(handleBase, handleKnob);

    const joints: JointInfo[] = [
      this.createJoint({
        id: 'door_hinge',
        type: 'hinge',
        axis: [0, 1, 0],
        limits: [0, Math.PI * 1.5],
        childMesh: 'door_panel',
        parentMesh: 'frame_left',
        anchor: [-0.45, 0, 0],
        damping: 2.0,
        friction: 0.3,
        actuated: true,
        motor: { ctrlRange: [-1, 1], gearRatio: 50 },
      }),
    ];

    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>();
    // Frame pieces (static — mass 0)
    meshGeometries.set('frame_left', { size: new THREE.Vector3(0.05, 2.1, 0.08), pos: new THREE.Vector3(-0.475, 1.05, 0) });
    meshGeometries.set('frame_right', { size: new THREE.Vector3(0.05, 2.1, 0.08), pos: new THREE.Vector3(0.475, 1.05, 0) });
    meshGeometries.set('frame_top', { size: new THREE.Vector3(0.95, 0.05, 0.08), pos: new THREE.Vector3(0, 2.075, 0) });
    // Door panel (dynamic — estimate mass from wood density)
    const doorVolume = 0.88 * 2.0 * 0.03; // m³
    const doorMass = doorVolume * 600 * 0.6; // 600 kg/m³ pine wood × fill factor
    meshGeometries.set('door_panel', { size: new THREE.Vector3(0.88, 2.0, 0.03), pos: new THREE.Vector3(0, 1.0, 0), mass: doorMass });

    // Sim-ready metadata
    const collisionHints = new Map<string, 'box' | 'sphere' | 'cylinder'>();
    collisionHints.set('frame_left', 'box');
    collisionHints.set('frame_right', 'box');
    collisionHints.set('frame_top', 'box');
    collisionHints.set('door_panel', 'box');

    const simReady: SimReadyMetadata = {
      density: 600,
      friction: 0.5,
      restitution: 0.3,
      rootBodyStatic: true,
      collisionHints,
    };

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('door', joints, meshGeometries),
      toURDF: (options?: URDFExportOptions) => generateURDF('door', joints, meshGeometries, { includeInertial: true, includeCollision: true, estimateMassFromGeometry: true, defaultDensity: 600, ...options }),
      toUSD: () => generateUSD('door', joints, meshGeometries),
      meshGeometries,
      simReady,
    };
  }
}
