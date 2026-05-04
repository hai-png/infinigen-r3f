/**
 * CreatureRiggingSystem - Integration system for rigging creatures
 *
 * Takes a CreatureBase with all attached parts, collects all PartAttachment
 * data from each part, uses NURBSToArmature to build the skeleton,
 * creates IK targets for locomotion, applies joint rotation limits,
 * and builds the final SkinnedMesh.
 *
 * Returns a RiggedCreature object with skeleton, skinned mesh, and IK targets
 * that is directly usable by the existing LocomotionSystem and IKController.
 */

import * as THREE from 'three';
import { Bone, Skeleton, SkinnedMesh, Group, Matrix4, Vector3, Quaternion } from 'three';
import { NURBSToArmature, PartAttachment, IKParams, IKTarget, RiggingJoint } from './NURBSToArmature';
import { SkeletonBuilder, CreatureSkeletonConfig } from '../skeleton/SkeletonBuilder';
import { SkinnedMeshBuilder } from '../skeleton/SkinnedMeshBuilder';
import { IKController, IKChain, IKEffector } from '../animation/IKController';
import type { BodyProfileConfig } from '../nurbs/NURBSBodyProfile';
import type { Joint } from '../parts/HeadDetailGenerator';

// ── Types ────────────────────────────────────────────────────────────

/** A fully rigged creature ready for animation */
export interface RiggedCreature {
  /** The root group containing the skinned mesh and bones */
  root: Group;
  /** The armature skeleton */
  skeleton: Skeleton;
  /** The skinned body mesh */
  skinnedMesh: SkinnedMesh;
  /** IK targets for locomotion */
  ikTargets: IKTarget[];
  /** IK controller for runtime animation */
  ikController: IKController;
  /** Map of joint names to bone references */
  jointMap: Map<string, Bone>;
}

/** Configuration for the rigging system */
export interface RiggingConfig {
  /** NURBS body profile config for joint position sampling */
  bodyProfileConfig?: BodyProfileConfig;
  /** Creature type for default skeleton building */
  creatureType: string;
  /** Size of the creature */
  size: number;
  /** Seed for deterministic generation */
  seed: number;
  /** Optional skeleton configuration overrides */
  skeletonConfig?: CreatureSkeletonConfig;
}

/** Part rigging data collected from individual part generators */
export interface PartRiggingData {
  partName: string;
  joints: Record<string, Joint>;
  ikParams: IKParams[];
  attachmentBone?: string;
}

// ── Creature Rigging System ──────────────────────────────────────────

export class CreatureRiggingSystem {
  private nurbsToArmature: NURBSToArmature;
  private skeletonBuilder: SkeletonBuilder;
  private skinnedMeshBuilder: SkinnedMeshBuilder;
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.nurbsToArmature = new NURBSToArmature(seed);
    this.skeletonBuilder = new SkeletonBuilder(seed);
    this.skinnedMeshBuilder = new SkinnedMeshBuilder();
  }

  /**
   * Build a fully rigged creature from collected part data.
   *
   * This is the main entry point. Callers should:
   * 1. Generate all parts (legs, wings, eyes, mouth, etc.)
   * 2. Collect PartRiggingData from each part
   * 3. Call this method to assemble the rig
   */
  buildRiggedCreature(
    partsData: PartRiggingData[],
    bodyMesh: THREE.Mesh,
    config: RiggingConfig,
  ): RiggedCreature {
    const root = new Group();
    root.name = `RiggedCreature_${config.creatureType}`;

    // 1. Collect all part attachments from parts data
    const partAttachments = this.collectPartAttachments(partsData);

    // 2. Build skeleton using NURBS-to-armature pipeline
    const skeleton = this.nurbsToArmature.createBones(partAttachments);

    // 3. Collect all IK params
    const allIKParams: IKParams[] = [];
    for (const part of partsData) {
      allIKParams.push(...part.ikParams);
    }

    // 4. Create IK targets
    const ikTargets = this.nurbsToArmature.createIKTargets(skeleton, allIKParams);

    // 5. Apply joint constraints to bones
    const jointMap = new Map<string, Bone>();
    for (const bone of skeleton.bones) {
      jointMap.set(bone.name, bone);
    }

    for (const part of partsData) {
      for (const [name, joint] of Object.entries(part.joints)) {
        const bone = jointMap.get(name);
        if (bone) {
          this.nurbsToArmature.applyJointConstraints(
            this.convertToRiggingJoint(joint),
            bone,
          );
        }
      }
    }

    // 6. Build skinned mesh
    const skinnedMesh = this.nurbsToArmature.buildSkinnedMesh(bodyMesh, skeleton);

    // 7. Set up IK controller
    const ikController = this.buildIKController(skeleton, ikTargets);

    // 8. Assemble the root group
    root.add(skinnedMesh);
    if (skeleton.bones.length > 0) {
      root.add(skeleton.bones[0]);
    }

    // Store metadata
    root.userData.skeleton = skeleton;
    root.userData.ikTargets = ikTargets;
    root.userData.creatureType = config.creatureType;

    return {
      root,
      skeleton,
      skinnedMesh,
      ikTargets,
      ikController,
      jointMap,
    };
  }

  /**
   * Build a rigged creature using the existing SkeletonBuilder for the base skeleton,
   * then enhance it with NURBS-derived joint positions.
   */
  buildRiggedCreatureWithBaseSkeleton(
    partsData: PartRiggingData[],
    bodyMesh: THREE.Mesh,
    config: RiggingConfig,
  ): RiggedCreature {
    const root = new Group();
    root.name = `RiggedCreature_${config.creatureType}`;

    // 1. Build base skeleton using existing SkeletonBuilder
    const skeleton = this.skeletonBuilder.buildSkeleton(
      config.creatureType as any,
      {
        size: config.size,
        ...config.skeletonConfig,
      },
    );

    // 2. Enhance with joint constraints from parts
    const jointMap = new Map<string, Bone>();
    for (const bone of skeleton.bones) {
      jointMap.set(bone.name, bone);
    }

    for (const part of partsData) {
      for (const [name, joint] of Object.entries(part.joints)) {
        const bone = jointMap.get(name);
        if (bone) {
          this.nurbsToArmature.applyJointConstraints(
            this.convertToRiggingJoint(joint),
            bone,
          );
        }
      }
    }

    // 3. Collect IK params from parts
    const allIKParams: IKParams[] = [];
    for (const part of partsData) {
      allIKParams.push(...part.ikParams);
    }

    // 4. Create IK targets
    const ikTargets = this.nurbsToArmature.createIKTargets(skeleton, allIKParams);

    // 5. Build skinned mesh
    const skinnedMesh = this.skinnedMeshBuilder.buildSkinnedMesh(
      bodyMesh.geometry.clone(),
      skeleton,
      new Map(),
      bodyMesh.material instanceof THREE.MeshStandardMaterial
        ? bodyMesh.material.clone()
        : undefined,
    );

    // 6. Set up IK controller
    const ikController = this.buildIKController(skeleton, ikTargets);

    // 7. Assemble
    root.add(skinnedMesh);
    if (skeleton.bones.length > 0) {
      root.add(skeleton.bones[0]);
    }

    root.userData.skeleton = skeleton;
    root.userData.ikTargets = ikTargets;

    return {
      root,
      skeleton,
      skinnedMesh,
      ikTargets,
      ikController,
      jointMap,
    };
  }

  /**
   * Convert part data to PartAttachment format for NURBSToArmature
   */
  private collectPartAttachments(partsData: PartRiggingData[]): PartAttachment[] {
    const attachments: PartAttachment[] = [];

    for (const part of partsData) {
      const joints: Record<string, RiggingJoint> = {};
      for (const [name, joint] of Object.entries(part.joints)) {
        joints[name] = this.convertToRiggingJoint(joint);
      }

      attachments.push({
        partName: part.partName,
        jointName: part.attachmentBone ?? Object.keys(part.joints)[0] ?? 'root',
        position: Object.values(part.joints)[0]?.position ?? new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        joints,
        ikParams: part.ikParams,
      });
    }

    return attachments;
  }

  /**
   * Convert a Joint from HeadDetailGenerator format to RiggingJoint format
   */
  private convertToRiggingJoint(joint: Joint): RiggingJoint {
    return {
      name: joint.name,
      position: joint.position,
      rotation: joint.rotation,
      bounds: joint.bounds,
      parentJoint: joint.parentJoint,
    };
  }

  /**
   * Build an IKController from the skeleton and IK targets.
   * Maps IKTarget data to IKChain format used by IKController.
   */
  private buildIKController(skeleton: Skeleton, ikTargets: IKTarget[]): IKController {
    const controller = new IKController();

    for (const target of ikTargets) {
      // Find the chain bones
      const chainBones: Bone[] = [];
      for (const boneName of target.chainBones) {
        const bone = skeleton.bones.find(b => b.name === boneName);
        if (bone) {
          chainBones.push(bone);
        }
      }

      if (chainBones.length < 2) continue;

      // Create effector for the end of the chain
      const effectorBone = chainBones[chainBones.length - 1];
      const effectorPos = new THREE.Vector3();
      effectorBone.getWorldPosition(effectorPos);

      const effector: IKEffector = {
        bone: effectorBone,
        targetPosition: target.targetPosition.clone(),
        weight: 1.0,
      };

      const chain: IKChain = {
        bones: chainBones,
        effector,
      };

      controller.addChain(chain);
    }

    return controller;
  }

  // ── Static Utilities ────────────────────────────────────────────────

  /**
   * Quick utility to extract joints from a part result.
   * Useful when integrating with the updated generators that return
   * result objects with joint data.
   */
  static extractPartData(
    partName: string,
    result: { joints: Record<string, Joint>; ikParams?: IKParams[] },
    attachmentBone?: string,
  ): PartRiggingData {
    return {
      partName,
      joints: result.joints,
      ikParams: result.ikParams ?? [],
      attachmentBone,
    };
  }

  /**
   * Merge multiple PartRiggingData objects into a single collection.
   */
  static mergePartData(data: PartRiggingData[]): PartRiggingData {
    const merged: PartRiggingData = {
      partName: 'merged',
      joints: {},
      ikParams: [],
    };

    for (const d of data) {
      Object.assign(merged.joints, d.joints);
      merged.ikParams.push(...d.ikParams);
    }

    return merged;
  }
}
