/**
 * Kinematic Node - Joint and bone representation for kinematic chains
 * 
 * Used by the KinematicCompiler for building articulated structures
 * like robot arms, character skeletons, and mechanical linkages.
 */

import * as THREE from 'three';

export enum KinematicType {
  Revolute = 'revolute',
  Prismatic = 'prismatic',
  Fixed = 'fixed',
  Continuous = 'continuous',
  Planar = 'planar',
  Floating = 'floating',
}

export enum JointType {
  Hinge = 'hinge',
  Ball = 'ball',
  Slider = 'slider',
  Universal = 'universal',
  Cylindrical = 'cylindrical',
  Screw = 'screw',
}

export interface KinematicNodeConfig {
  name: string;
  type: KinematicType;
  jointType: JointType;
  parent: string | null;
  axis: THREE.Vector3;
  origin: THREE.Vector3;
  limits: { lower: number; upper: number };
  damping: number;
  friction: number;
  maxVelocity: number;
  maxEffort: number;
}

export class KinematicNode {
  public name: string;
  public type: KinematicType;
  public jointType: JointType;
  public parent: KinematicNode | null;
  public children: KinematicNode[];
  public axis: THREE.Vector3;
  public origin: THREE.Vector3;
  public limits: { lower: number; upper: number };
  public currentValue: number;
  public transform: THREE.Matrix4;

  constructor(config: Partial<KinematicNodeConfig> & { name: string }) {
    this.name = config.name;
    this.type = config.type || KinematicType.Revolute;
    this.jointType = config.jointType || JointType.Hinge;
    this.parent = null;
    this.children = [];
    this.axis = config.axis || new THREE.Vector3(0, 1, 0);
    this.origin = config.origin || new THREE.Vector3();
    this.limits = config.limits || { lower: -Math.PI, upper: Math.PI };
    this.currentValue = 0;
    this.transform = new THREE.Matrix4();
  }

  setParent(parent: KinematicNode): void {
    this.parent = parent;
    parent.children.push(this);
  }

  setValue(value: number): void {
    this.currentValue = Math.max(this.limits.lower, Math.min(this.limits.upper, value));
    this.updateTransform();
  }

  protected updateTransform(): void {
    this.transform = new THREE.Matrix4();
  }

  getWorldTransform(): THREE.Matrix4 {
    if (this.parent) {
      return new THREE.Matrix4().multiplyMatrices(this.parent.getWorldTransform(), this.transform);
    }
    return this.transform.clone();
  }
}

export function kinematicNodeFactory(config: Partial<KinematicNodeConfig> & { name: string }): KinematicNode {
  return new KinematicNode(config);
}
