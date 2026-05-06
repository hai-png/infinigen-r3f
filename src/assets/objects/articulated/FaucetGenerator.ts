/**
 * Faucet Generator - Articulated faucet with dual handles (Sim-Ready)
 *
 * Sim-ready features:
 * - Hinge joints for hot/cold handles [-54°, +54°] each
 * - Collision geometry for base, column, spout, and handles
 * - Mass/inertia estimated from metal density (stainless steel ~7800 kg/m³)
 * - URDF, MJCF, and USD export
 *
 * Supports two faucet styles:
 * - 'modern': single-lever (1 hinge joint)
 * - 'traditional': dual-handle (2 hinge joints — hot + cold)
 */

import * as THREE from 'three';
import { ArticulatedObjectBase, ArticulatedObjectConfig, ArticulatedObjectResult, JointInfo, SimReadyMetadata, generateMJCF } from './types';
import { generateURDF, URDFExportOptions } from './URDFExporter';
import { generateUSD } from './USDExporter';

export class FaucetGenerator extends ArticulatedObjectBase {
  protected category = 'Faucet';

  generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult {
    const cfg: ArticulatedObjectConfig = { style: this.style, scale: this.scale, ...config };
    const group = new THREE.Group();
    group.name = 'Faucet';

    const metalMat = this.createMaterial({ color: 0xC0C0C0, metalness: 0.85, roughness: 0.15 });
    const s = this.scale;
    const isTraditional = cfg.style === 'traditional';

    // Base
    const base = this.createCylinder('faucet_base', 0.02, 0.025, 0.03, metalMat, new THREE.Vector3(0, 0.015, 0));
    group.add(base);

    // Vertical column
    const column = this.createCylinder('faucet_column', 0.01, 0.01, 0.12, metalMat, new THREE.Vector3(0, 0.09, 0));
    group.add(column);

    // Spout (curved - approximated as angled cylinder)
    const spout = this.createCylinder('faucet_spout', 0.008, 0.008, 0.1, metalMat, new THREE.Vector3(0.04, 0.14, 0));
    spout.rotation.z = -Math.PI / 4;
    group.add(spout);

    const joints: JointInfo[] = [];
    const meshGeometries = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>();

    // Base + column + spout (static body)
    meshGeometries.set('faucet_base', { size: new THREE.Vector3(0.04, 0.03, 0.04), pos: new THREE.Vector3(0, 0.015, 0) });
    meshGeometries.set('faucet_column', { size: new THREE.Vector3(0.02, 0.12, 0.02), pos: new THREE.Vector3(0, 0.09, 0) });
    meshGeometries.set('faucet_spout', { size: new THREE.Vector3(0.016, 0.016, 0.1), pos: new THREE.Vector3(0.04, 0.14, 0) });

    if (isTraditional) {
      // ---- Dual-handle traditional faucet ----

      // Hot handle (left side, hinged)
      const hotPivot = new THREE.Group();
      hotPivot.name = 'faucet_hot_pivot';
      hotPivot.position.set(-0.03 * s, 0.12 * s, 0);

      const hotHandle = this.createCylinder('faucet_hot_handle', 0.006, 0.006, 0.04, metalMat, new THREE.Vector3(0, 0, 0));
      hotHandle.rotation.x = Math.PI / 2;
      const hotLever = this.createCylinder('faucet_hot_lever', 0.005, 0.005, 0.03, metalMat, new THREE.Vector3(0, 0.01, -0.015));
      hotLever.rotation.x = Math.PI / 2;
      hotPivot.add(hotHandle, hotLever);
      group.add(hotPivot);

      // Cold handle (right side, hinged)
      const coldPivot = new THREE.Group();
      coldPivot.name = 'faucet_cold_pivot';
      coldPivot.position.set(0.03 * s, 0.12 * s, 0);

      const coldHandle = this.createCylinder('faucet_cold_handle', 0.006, 0.006, 0.04, metalMat, new THREE.Vector3(0, 0, 0));
      coldHandle.rotation.x = Math.PI / 2;
      const coldLever = this.createCylinder('faucet_cold_lever', 0.005, 0.005, 0.03, metalMat, new THREE.Vector3(0, 0.01, -0.015));
      coldLever.rotation.x = Math.PI / 2;
      coldPivot.add(coldHandle, coldLever);
      group.add(coldPivot);

      // Hot handle joint
      joints.push(this.createJoint({
        id: 'faucet_hot_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        childMesh: 'faucet_hot_handle',
        parentMesh: 'faucet_column',
        anchor: [-0.03, 0.12, 0],
        damping: 0.5,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 3 },
      }));

      // Cold handle joint
      joints.push(this.createJoint({
        id: 'faucet_cold_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        childMesh: 'faucet_cold_handle',
        parentMesh: 'faucet_column',
        anchor: [0.03, 0.12, 0],
        damping: 0.5,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 3 },
      }));

      // Hot handle geometry (dynamic — stainless steel, ~7800 kg/m³)
      const hotHandleVolume = Math.PI * 0.006 * 0.006 * 0.04 + Math.PI * 0.005 * 0.005 * 0.03;
      const hotHandleMass = hotHandleVolume * 7800 * 0.8;
      meshGeometries.set('faucet_hot_handle', { size: new THREE.Vector3(0.012, 0.012, 0.04), pos: new THREE.Vector3(-0.03, 0.12, 0), mass: hotHandleMass });

      // Cold handle geometry (dynamic)
      const coldHandleVolume = Math.PI * 0.006 * 0.006 * 0.04 + Math.PI * 0.005 * 0.005 * 0.03;
      const coldHandleMass = coldHandleVolume * 7800 * 0.8;
      meshGeometries.set('faucet_cold_handle', { size: new THREE.Vector3(0.012, 0.012, 0.04), pos: new THREE.Vector3(0.03, 0.12, 0), mass: coldHandleMass });

    } else {
      // ---- Modern single-lever faucet ----

      // Lever handle (hinged)
      const leverPivot = new THREE.Group();
      leverPivot.name = 'faucet_lever_pivot';
      leverPivot.position.set(0, 0.14 * s, 0);

      const lever = this.createCylinder('faucet_lever', 0.006, 0.006, 0.06, metalMat, new THREE.Vector3(0, 0, -0.03));
      lever.rotation.x = Math.PI / 2;
      leverPivot.add(lever);
      group.add(leverPivot);

      joints.push(this.createJoint({
        id: 'faucet_lever_hinge',
        type: 'hinge',
        axis: [1, 0, 0],
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        childMesh: 'faucet_lever',
        parentMesh: 'faucet_column',
        anchor: [0, 0.14, 0],
        damping: 0.5,
        friction: 0.4,
        actuated: true,
        motor: { ctrlRange: [-0.5, 0.5], gearRatio: 3 },
      }));

      // Lever (dynamic — stainless steel, ~7800 kg/m³)
      const leverVolume = Math.PI * 0.006 * 0.006 * 0.06;
      const leverMass = leverVolume * 7800 * 0.8;
      meshGeometries.set('faucet_lever', { size: new THREE.Vector3(0.012, 0.012, 0.06), pos: new THREE.Vector3(0, 0.14, -0.03), mass: leverMass });
    }

    const collisionHints = new Map<string, 'box' | 'sphere' | 'cylinder'>();
    collisionHints.set('faucet_base', 'cylinder');
    collisionHints.set('faucet_column', 'cylinder');
    collisionHints.set('faucet_spout', 'cylinder');

    if (isTraditional) {
      collisionHints.set('faucet_hot_handle', 'cylinder');
      collisionHints.set('faucet_cold_handle', 'cylinder');
    } else {
      collisionHints.set('faucet_lever', 'cylinder');
    }

    const simReady: SimReadyMetadata = {
      density: 7800,
      friction: 0.4,
      restitution: 0.2,
      rootBodyStatic: true,
      collisionHints,
    };

    return {
      group,
      joints,
      category: this.category,
      config: cfg,
      toMJCF: () => generateMJCF('faucet', joints, meshGeometries),
      toURDF: (options?: URDFExportOptions) => generateURDF('faucet', joints, meshGeometries, { includeInertial: true, includeCollision: true, estimateMassFromGeometry: true, defaultDensity: 7800, ...options }),
      toUSD: () => generateUSD('faucet', joints, meshGeometries),
      meshGeometries,
      simReady,
    };
  }
}
