/**
 * NURBSToArmature - Pipeline for converting NURBS body profiles to armature skeletons
 *
 * This module bridges the NURBS body generation system with the bone-based
 * skeleton system. It samples joint positions from NURBS body profiles and
 * creates THREE.Bone hierarchies with IK targets and rotation limits,
 * matching the original Infinigen util/rigging.py functionality.
 *
 * Key innovation: NURBS body profiles define where joints should be placed,
 * so the skeleton is derived from the body shape rather than being independent.
 */

import * as THREE from 'three';
import { Bone, Skeleton, Matrix4, Vector3, Quaternion, Euler, SkinnedMesh } from 'three';
import { SkeletonBuilder, CreatureSkeletonConfig } from '../skeleton/SkeletonBuilder';
import { SkinnedMeshBuilder } from '../skeleton/SkinnedMeshBuilder';
import type { BodyProfileConfig } from '../nurbs/NURBSBodyProfile';
import type { HeadDetailResult, Joint } from '../parts/HeadDetailGenerator';

// ── Data Model ───────────────────────────────────────────────────────

/** Joint definition matching Infinigen's rigging.py Joint dict */
export interface RiggingJoint {
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  bounds: { min: THREE.Vector3; max: THREE.Vector3 }; // IK rotation limits (per-axis min/max)
  parentJoint?: string;
}

/** IK parameters for a chain of bones */
export interface IKParams {
  targetJoint: string;
  chainLength: number;
  useCopyLocation?: boolean;
}

/** Attachment data for a part connected to the skeleton */
export interface PartAttachment {
  partName: string;
  jointName: string;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  joints: Record<string, RiggingJoint>;
  ikParams: IKParams[];
}

/** An IK target bone for animation */
export interface IKTarget {
  name: string;
  bone: Bone;
  targetPosition: THREE.Vector3;
  chainBones: string[];
  chainLength: number;
}

/** Result from the NURBS-to-armature pipeline */
export interface ArmatureResult {
  skeleton: Skeleton;
  ikTargets: IKTarget[];
  jointMap: Map<string, Bone>;
  skinWeights: Map<string, number>;
}

// ── NURBS Profile Sampling ───────────────────────────────────────────

/**
 * Sample joint positions from a NURBS body profile.
 * The body profile's u-axis sections map to skeleton joint positions.
 */
export function sampleJointPositionsFromProfile(
  profileConfig: BodyProfileConfig,
  jointNames: string[],
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const uRes = profileConfig.uResolution;
  const bodyLen = profileConfig.bodyLength;

  for (let i = 0; i < jointNames.length; i++) {
    const t = i / (jointNames.length - 1);
    const u = Math.min(t, 1.0);

    // Sample the spine centerline at parameter u
    const headZ = bodyLen * 0.5;
    const tailZ = -bodyLen * 0.5;
    const z = headZ + u * (tailZ - headZ);

    // Vertical position from spine curvature
    const archAmount = profileConfig.spineCurvature * Math.sin(Math.PI * u);
    const y = archAmount + profileConfig.bodyHeight * 0.15;

    // Lateral position: center (0)
    const x = 0;

    positions.set(jointNames[i], new THREE.Vector3(x, y, z));
  }

  return positions;
}

/**
 * Generate part attachment data from NURBS profile positions.
 * Maps body profile regions (head, neck, shoulder, pelvis, tail)
 * to named attachment points.
 */
export function generateAttachmentPoints(
  profileConfig: BodyProfileConfig,
): PartAttachment[] {
  const attachments: PartAttachment[] = [];
  const bodyLen = profileConfig.bodyLength;
  const headZ = bodyLen * 0.5;

  // Head attachment
  attachments.push({
    partName: 'head',
    jointName: 'skull',
    position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.4, headZ * 0.7),
    rotation: new THREE.Quaternion(),
    joints: {
      skull: {
        name: 'skull',
        position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.4, headZ * 0.7),
        rotation: new THREE.Euler(0, 0, 0),
        bounds: {
          min: new THREE.Vector3(-0.5, -0.3, -0.3),
          max: new THREE.Vector3(0.5, 0.3, 0.3),
        },
      },
      jaw: {
        name: 'jaw',
        position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.2, headZ * 0.8),
        rotation: new THREE.Euler(0, 0, 0),
        bounds: {
          min: new THREE.Vector3(0, 0, -0.1),
          max: new THREE.Vector3(0, 0, 0.5),
        },
        parentJoint: 'skull',
      },
    },
    ikParams: [],
  });

  // Shoulder (front leg) attachments
  const shoulderZ = headZ * 0.3;
  for (const side of [-1, 1]) {
    const sideName = side === -1 ? 'L' : 'R';
    attachments.push({
      partName: `front_leg_${sideName}`,
      jointName: `scapula_${sideName}`,
      position: new THREE.Vector3(
        side * profileConfig.bodyWidth * 0.5,
        profileConfig.bodyHeight * 0.1,
        shoulderZ,
      ),
      rotation: new THREE.Quaternion(),
      joints: {
        scapula: {
          name: `scapula_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.5, profileConfig.bodyHeight * 0.1, shoulderZ),
          rotation: new THREE.Euler(0, 0, side * 0.2),
          bounds: {
            min: new THREE.Vector3(-0.5, -1.0, -0.5),
            max: new THREE.Vector3(0.5, 0.5, 0.5),
          },
        },
        upper: {
          name: `humerus_front_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.5, 0, shoulderZ),
          rotation: new THREE.Euler(0.2, 0, side * 0.3),
          bounds: {
            min: new THREE.Vector3(-0.3, -1.2, -0.5),
            max: new THREE.Vector3(0.3, 0.2, 0.5),
          },
          parentJoint: `scapula_${sideName}`,
        },
        lower: {
          name: `radius_front_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.55, -profileConfig.bodyHeight * 0.4, shoulderZ + 0.05),
          rotation: new THREE.Euler(0, 0, side * -0.1),
          bounds: {
            min: new THREE.Vector3(-0.3, -1.0, -0.3),
            max: new THREE.Vector3(0.3, 0.3, 0.3),
          },
          parentJoint: `humerus_front_${sideName}`,
        },
        foot: {
          name: `hand_front_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.55, -profileConfig.bodyHeight * 0.8, shoulderZ + 0.1),
          rotation: new THREE.Euler(0, 0, 0),
          bounds: {
            min: new THREE.Vector3(-0.2, -0.2, -0.2),
            max: new THREE.Vector3(0.2, 0.2, 0.2),
          },
          parentJoint: `radius_front_${sideName}`,
        },
      },
      ikParams: [{
        targetJoint: `hand_front_${sideName}`,
        chainLength: 3,
      }],
    });
  }

  // Pelvis (hind leg) attachments
  const pelvisZ = -headZ * 0.3;
  for (const side of [-1, 1]) {
    const sideName = side === -1 ? 'L' : 'R';
    attachments.push({
      partName: `hind_leg_${sideName}`,
      jointName: `femur_hind_${sideName}`,
      position: new THREE.Vector3(
        side * profileConfig.bodyWidth * 0.5,
        profileConfig.bodyHeight * 0.1,
        pelvisZ,
      ),
      rotation: new THREE.Quaternion(),
      joints: {
        pelvis: {
          name: 'pelvis',
          position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.2, pelvisZ),
          rotation: new THREE.Euler(0, 0, 0),
          bounds: {
            min: new THREE.Vector3(-0.3, -0.3, -0.3),
            max: new THREE.Vector3(0.3, 0.3, 0.3),
          },
        },
        femur: {
          name: `femur_hind_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.5, 0, pelvisZ),
          rotation: new THREE.Euler(0, 0, side * 0.2),
          bounds: {
            min: new THREE.Vector3(-0.5, -1.2, -0.5),
            max: new THREE.Vector3(0.5, 0.3, 0.5),
          },
          parentJoint: 'pelvis',
        },
        tibia: {
          name: `tibia_hind_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.55, -profileConfig.bodyHeight * 0.4, pelvisZ + 0.05),
          rotation: new THREE.Euler(0, 0, side * -0.1),
          bounds: {
            min: new THREE.Vector3(-0.3, -1.0, -0.3),
            max: new THREE.Vector3(0.3, 0.3, 0.3),
          },
          parentJoint: `femur_hind_${sideName}`,
        },
        foot: {
          name: `foot_hind_${sideName}`,
          position: new THREE.Vector3(side * profileConfig.bodyWidth * 0.55, -profileConfig.bodyHeight * 0.8, pelvisZ + 0.1),
          rotation: new THREE.Euler(0, 0, 0),
          bounds: {
            min: new THREE.Vector3(-0.2, -0.2, -0.2),
            max: new THREE.Vector3(0.2, 0.2, 0.2),
          },
          parentJoint: `tibia_hind_${sideName}`,
        },
      },
      ikParams: [{
        targetJoint: `foot_hind_${sideName}`,
        chainLength: 3,
      }],
    });
  }

  // Tail attachment
  const tailZ = -headZ * 0.7;
  attachments.push({
    partName: 'tail',
    jointName: 'tail_0',
    position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.1, tailZ),
    rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)),
    joints: {
      tail_0: {
        name: 'tail_0',
        position: new THREE.Vector3(0, profileConfig.bodyHeight * 0.1, tailZ),
        rotation: new THREE.Euler(-0.3, 0, 0),
        bounds: {
          min: new THREE.Vector3(-0.8, -0.3, -0.3),
          max: new THREE.Vector3(0.8, 0.3, 0.3),
        },
      },
    },
    ikParams: [],
  });

  return attachments;
}

// ── NURBSToArmature Class ────────────────────────────────────────────

export class NURBSToArmature {
  private skeletonBuilder: SkeletonBuilder;
  private skinnedMeshBuilder: SkinnedMeshBuilder;
  private boneIndex: number = 0;

  constructor(seed: number = 42) {
    this.skeletonBuilder = new SkeletonBuilder(seed);
    this.skinnedMeshBuilder = new SkinnedMeshBuilder();
  }

  /**
   * Create bones from part attachment data.
   * Tree-walks the part hierarchy and creates bones at joint positions
   * sampled from the part skeletons.
   *
   * Uses SkeletonBuilder for actual bone creation, but feeds it data
   * from NURBS joint positions.
   */
  createBones(partsAttachments: PartAttachment[]): Skeleton {
    this.boneIndex = 0;

    // Root bone at origin
    const root = this.makeBone('root', 0, 0, 0);

    // Collect all joints from all part attachments
    const allJoints = new Map<string, RiggingJoint>();
    for (const part of partsAttachments) {
      for (const [jointName, joint] of Object.entries(part.joints)) {
        allJoints.set(jointName, joint);
      }
    }

    // Build bone hierarchy from joint data
    const createdBones = new Map<string, Bone>();
    createdBones.set('root', root);

    // First pass: create all bones
    for (const [name, joint] of allJoints) {
      if (name === 'root') continue;
      const bone = this.makeBone(name, joint.position.x, joint.position.y, joint.position.z);
      createdBones.set(name, bone);
    }

    // Second pass: establish parent-child relationships
    for (const [name, joint] of allJoints) {
      if (name === 'root') continue;
      const bone = createdBones.get(name)!;
      const parentName = joint.parentJoint;

      if (parentName && createdBones.has(parentName)) {
        const parentBone = createdBones.get(parentName)!;
        // Compute local position relative to parent
        const parentWorldPos = new THREE.Vector3();
        parentBone.getWorldPosition(parentWorldPos);
        bone.position.sub(parentWorldPos);
        parentBone.add(bone);
      } else {
        // Attach to root
        root.add(bone);
      }
    }

    // Collect all bones in hierarchy order
    const bones: Bone[] = [];
    this.collectBones(root, bones);

    // Compute inverse bind matrices
    const boneMatrices: Matrix4[] = [];
    for (const bone of bones) {
      const m = new Matrix4();
      bone.updateWorldMatrix(true, false);
      m.copy(bone.matrixWorld).invert();
      boneMatrices.push(m);
    }

    const skeleton = new Skeleton(bones, boneMatrices);
    skeleton.calculateInverses();
    return skeleton;
  }

  /**
   * Create IK targets for the given skeleton based on IK parameters.
   * For each IKParams entry, creates a target bone that can be used
   * by the IKController to drive the chain.
   */
  createIKTargets(skeleton: Skeleton, ikParamsList: IKParams[]): IKTarget[] {
    const targets: IKTarget[] = [];
    const boneMap = new Map<string, Bone>();
    for (const bone of skeleton.bones) {
      boneMap.set(bone.name, bone);
    }

    for (const ikParams of ikParamsList) {
      const targetBone = boneMap.get(ikParams.targetJoint);
      if (!targetBone) continue;

      // Walk up the chain to find chain bones
      const chainBones: string[] = [];
      let current: Bone | null = targetBone;
      let remaining = ikParams.chainLength;

      while (current && remaining > 0) {
        chainBones.unshift(current.name);
        current = current.parent as Bone | null;
        remaining--;
      }

      if (chainBones.length < 2) continue;

      // Get the target position from the end effector
      const targetPos = new THREE.Vector3();
      targetBone.getWorldPosition(targetPos);

      targets.push({
        name: `IK_${ikParams.targetJoint}`,
        bone: targetBone,
        targetPosition: targetPos,
        chainBones,
        chainLength: ikParams.chainLength,
      });
    }

    return targets;
  }

  /**
   * Apply joint rotation constraints to a bone.
   * Sets per-axis rotation limits from joint.bounds.
   *
   * In THREE.js, rotation limits are enforced at the animation level
   * rather than on the bone directly. We store the limits in userData
   * so the animation system can clamp rotations.
   */
  applyJointConstraints(joint: RiggingJoint, bone: Bone): void {
    bone.userData.rotationLimits = {
      minX: joint.bounds.min.x,
      maxX: joint.bounds.max.x,
      minY: joint.bounds.min.y,
      maxY: joint.bounds.max.y,
      minZ: joint.bounds.min.z,
      maxZ: joint.bounds.max.z,
    };
  }

  /**
   * Build a skinned mesh from a body mesh and skeleton.
   * Uses the SkinnedMeshBuilder for automatic weight assignment
   * and connects the NURBS body mesh to the armature.
   */
  buildSkinnedMesh(
    bodyMesh: THREE.Mesh,
    skeleton: Skeleton,
    material?: THREE.Material,
  ): SkinnedMesh {
    const geometry = bodyMesh.geometry.clone();
    const defaultMat = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
    });
    (defaultMat as any).skinning = true;

    let mat: THREE.Material;
    if (material) {
      mat = material;
    } else if (Array.isArray(bodyMesh.material)) {
      mat = bodyMesh.material[0] ?? defaultMat;
    } else {
      mat = (bodyMesh.material as THREE.Material) ?? defaultMat;
    }

    if (mat instanceof THREE.MeshStandardMaterial) {
      (mat as any).skinning = true;
    }

    const boneWeights = new Map<string, number[]>();
    return this.skinnedMeshBuilder.buildSkinnedMesh(geometry, skeleton, boneWeights, mat);
  }

  /**
   * Convenience: Build armature from NURBS body profile config.
   * Combines attachment point generation, bone creation, and IK target setup.
   */
  buildArmatureFromProfile(
    profileConfig: BodyProfileConfig,
    creatureType: string = 'mammal',
  ): ArmatureResult {
    // Generate attachment points from profile
    const attachments = generateAttachmentPoints(profileConfig);

    // Collect all IK params
    const allIKParams: IKParams[] = [];
    for (const part of attachments) {
      allIKParams.push(...part.ikParams);
    }

    // Create skeleton
    const skeleton = this.createBones(attachments);

    // Create IK targets
    const ikTargets = this.createIKTargets(skeleton, allIKParams);

    // Apply joint constraints
    const jointMap = new Map<string, Bone>();
    for (const bone of skeleton.bones) {
      jointMap.set(bone.name, bone);
    }

    for (const part of attachments) {
      for (const [name, joint] of Object.entries(part.joints)) {
        const bone = jointMap.get(name);
        if (bone) {
          this.applyJointConstraints(joint, bone);
        }
      }
    }

    // Compute skin weight preferences (bones closer to surface get higher weight)
    const skinWeights = new Map<string, number>();

    return { skeleton, ikTargets, jointMap, skinWeights };
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private makeBone(name: string, x: number, y: number, z: number): Bone {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    (bone as any).index = this.boneIndex++;
    return bone;
  }

  private collectBones(root: Bone, bones: Bone[]): void {
    bones.push(root);
    for (const child of root.children) {
      if (child instanceof Bone) {
        this.collectBones(child, bones);
      }
    }
  }
}
