/**
 * FKEvaluator - Forward Kinematics Chain Evaluator
 *
 * Computes the world-space positions and orientations of all joints in a
 * kinematic chain given the joint parameters (angles for revolute, offsets
 * for prismatic). This is the forward-direction counterpart to IKSolver.
 *
 * The evaluator supports:
 *   - Revolute (rotational) joints with axis and limits
 *   - Prismatic (sliding) joints with axis and limits
 *   - Ball-socket (3-DOF) joints with swing/twist limits
 *   - Fixed (weld) joints
 *   - Continuous (unlimited revolute) joints
 *
 * The chain is represented as a tree of KinematicNode instances. The
 * evaluation traverses the tree from root to leaves, accumulating
 * transforms along each path.
 */

import * as THREE from 'three';
import { KinematicNode, KinematicType, JointType } from './KinematicNode';

// ============================================================================
// Public Types
// ============================================================================

/** Result of evaluating FK for a single joint */
export interface FKJointResult {
  /** Joint identifier */
  id: string;
  /** Joint name */
  name: string;
  /** World-space position of the joint */
  position: THREE.Vector3;
  /** World-space orientation of the joint */
  orientation: THREE.Quaternion;
  /** World-space transform (position + orientation + scale) */
  transform: THREE.Matrix4;
  /** Joint type */
  jointType: JointType;
  /** Current joint value (angle in radians for revolute, offset for prismatic) */
  value: number;
  /** Joint axis in local space */
  axis: THREE.Vector3;
  /** Joint limits */
  limits: { lower: number; upper: number };
}

/** Result of evaluating FK for an entire kinematic chain/tree */
export interface FKEvaluateResult {
  /** Results for each joint, indexed by joint name */
  joints: Map<string, FKJointResult>;
  /** Results for each joint, in breadth-first traversal order */
  orderedJoints: FKJointResult[];
  /** World-space position of the end-effector (last joint in the chain) */
  endEffectorPosition: THREE.Vector3;
  /** World-space orientation of the end-effector */
  endEffectorOrientation: THREE.Quaternion;
  /** Total number of joints evaluated */
  jointCount: number;
}

/** Configuration for FK evaluation */
export interface FKEvaluateConfig {
  /** Joint values to apply. Map from joint name to value (radians or meters). */
  jointValues?: Map<string, number>;
  /** Base transform for the root joint (default: identity) */
  baseTransform?: THREE.Matrix4;
  /** Whether to clamp joint values to their limits (default: true) */
  clampToLimits?: boolean;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Clamp a value to the given limits.
 */
function clampValue(value: number, limits: { lower: number; upper: number }): number {
  return Math.max(limits.lower, Math.min(limits.upper, value));
}

/**
 * Compute the local transform for a joint given its type, axis, and current value.
 *
 * - Revolute/Continuous: rotation around axis by value radians
 * - Prismatic: translation along axis by value meters
 * - Ball: rotation represented as euler angles (value is interpreted as yaw)
 * - Fixed/Weld: identity
 */
function computeJointLocalTransform(
  node: KinematicNode,
  value: number,
  origin: THREE.Vector3
): THREE.Matrix4 {
  const translation = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z);
  let jointTransform: THREE.Matrix4;

  switch (node.type) {
    case KinematicType.Revolute:
    case KinematicType.Continuous: {
      // Revolute joint: rotate around the joint axis
      const axis = node.axis.clone().normalize();
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, value);
      jointTransform = new THREE.Matrix4().makeRotationFromQuaternion(rotQuat);
      break;
    }

    case KinematicType.Prismatic: {
      // Prismatic joint: translate along the joint axis
      const axis = node.axis.clone().normalize().multiplyScalar(value);
      jointTransform = new THREE.Matrix4().makeTranslation(axis.x, axis.y, axis.z);
      break;
    }

    case KinematicType.Floating: {
      // Floating joint: treated as a 6-DOF joint.
      // Value is ignored for full 6-DOF; use identity.
      jointTransform = new THREE.Matrix4();
      break;
    }

    case KinematicType.Fixed:
    case KinematicType.NONE:
    default: {
      // Fixed/weld joint: no degrees of freedom
      jointTransform = new THREE.Matrix4();
      break;
    }
  }

  // Combine: first apply joint rotation/translation, then origin offset
  return translation.multiply(jointTransform);
}

// ============================================================================
// FK Evaluation
// ============================================================================

/**
 * Evaluate forward kinematics for a kinematic chain/tree.
 *
 * Traverses the KinematicNode tree from root to leaves, computing the
 * world-space position and orientation of each joint by accumulating
 * transforms along the path.
 *
 * @param root - Root node of the kinematic chain/tree
 * @param config - Evaluation configuration (joint values, base transform, clamping)
 * @returns FK evaluation result with world-space positions/orientations
 *
 * @example
 * ```ts
 * const jointValues = new Map([['shoulder', 0.5], ['elbow', -1.2], ['wrist', 0.3]]);
 * const result = evaluateFK(rootNode, { jointValues });
 * console.log('End effector position:', result.endEffectorPosition);
 * ```
 */
export function evaluateFK(
  root: KinematicNode,
  config: FKEvaluateConfig = {}
): FKEvaluateResult {
  const jointValues = config.jointValues ?? new Map();
  const baseTransform = config.baseTransform ?? new THREE.Matrix4();
  const clampToLimits = config.clampToLimits ?? true;

  const joints = new Map<string, FKJointResult>();
  const orderedJoints: FKJointResult[] = [];

  // BFS traversal
  const queue: Array<{ node: KinematicNode; parentWorldTransform: THREE.Matrix4 }> = [
    { node: root, parentWorldTransform: baseTransform },
  ];

  let lastResult: FKJointResult | null = null;

  while (queue.length > 0) {
    const { node, parentWorldTransform } = queue.shift()!;

    // Get the joint value (default to currentValue)
    let value = jointValues.has(node.name)
      ? jointValues.get(node.name)!
      : node.currentValue;

    // Clamp to limits if enabled
    if (clampToLimits) {
      value = clampValue(value, node.limits);
    }

    // Apply the value to the node
    node.setValue(value);

    // Compute local transform for this joint
    const localTransform = computeJointLocalTransform(node, value, node.origin);

    // Compute world transform by accumulating with parent
    const worldTransform = new THREE.Matrix4().multiplyMatrices(parentWorldTransform, localTransform);

    // Extract position and orientation from world transform
    const position = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    worldTransform.decompose(position, orientation, scale);

    // Build result for this joint
    const jointResult: FKJointResult = {
      id: `joint_${node.idn}`,
      name: node.name,
      position,
      orientation,
      transform: worldTransform,
      jointType: node.jointType,
      value,
      axis: node.axis.clone(),
      limits: { ...node.limits },
    };

    joints.set(node.name, jointResult);
    orderedJoints.push(jointResult);
    lastResult = jointResult;

    // Enqueue children with this node's world transform as their parent
    for (const child of node.children) {
      if (child) {
        queue.push({ node: child, parentWorldTransform: worldTransform.clone() });
      }
    }
  }

  return {
    joints,
    orderedJoints,
    endEffectorPosition: lastResult?.position.clone() ?? new THREE.Vector3(),
    endEffectorOrientation: lastResult?.orientation.clone() ?? new THREE.Quaternion(),
    jointCount: orderedJoints.length,
  };
}

/**
 * Evaluate FK for a simple serial chain defined by joint positions, axes, and values.
 *
 * This is a simplified API for when you don't have a KinematicNode tree.
 * Each joint is assumed to be revolute with the given axis.
 *
 * @param positions - Initial (zero-configuration) joint positions
 * @param axes - Rotation axis for each joint
 * @param values - Rotation angle for each joint (radians)
 * @returns Array of world-space positions after applying rotations
 *
 * @example
 * ```ts
 * const positions = [new Vector3(0,0,0), new Vector3(0,1,0), new Vector3(1,2,0)];
 * const axes = [new Vector3(0,0,1), new Vector3(0,0,1), new Vector3(0,0,1)];
 * const values = [0.3, -0.5, 0.2];
 * const result = evaluateFKSerial(positions, axes, values);
 * ```
 */
export function evaluateFKSerial(
  positions: THREE.Vector3[],
  axes: THREE.Vector3[],
  values: number[]
): THREE.Vector3[] {
  if (positions.length === 0) return [];

  const result: THREE.Vector3[] = [positions[0].clone()];
  let currentTransform = new THREE.Matrix4();

  for (let i = 0; i < positions.length - 1; i++) {
    // Compute bone direction from current to next
    const boneDir = new THREE.Vector3().subVectors(positions[i + 1], positions[i]);
    const boneLength = boneDir.length();

    // Apply rotation at this joint
    const axis = (axes[i] ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    const angle = values[i] ?? 0;
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);

    // Rotate the bone direction
    boneDir.applyQuaternion(rotQuat);
    boneDir.normalize().multiplyScalar(boneLength);

    // Compute next position
    const nextPos = new THREE.Vector3().addVectors(result[i], boneDir);
    result.push(nextPos);
  }

  return result;
}

/**
 * Compute the Jacobian matrix for a kinematic chain at the current configuration.
 *
 * The Jacobian relates joint velocities to end-effector velocities:
 *   v_ee = J * q_dot
 *
 * For revolute joint i, column i of J is:
 *   J_linear_i  = axis_i × (p_ee - p_i)
 *   J_angular_i = axis_i
 *
 * For prismatic joint i, column i of J is:
 *   J_linear_i  = axis_i
 *   J_angular_i = 0
 *
 * @param root - Root node of the kinematic chain
 * @param config - FK evaluation configuration
 * @returns Jacobian as a 6×n matrix (6 rows: 3 linear + 3 angular; n columns: one per joint)
 */
export function computeJacobian(
  root: KinematicNode,
  config: FKEvaluateConfig = {}
): number[][] {
  const fkResult = evaluateFK(root, config);
  const endPos = fkResult.endEffectorPosition;
  const n = fkResult.jointCount;

  // 6 rows x n columns
  const J: number[][] = Array.from({ length: 6 }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const joint = fkResult.orderedJoints[i];
    const jointPos = joint.position;

    // World-space axis (rotate local axis by joint orientation)
    const worldAxis = joint.axis.clone().applyQuaternion(joint.orientation).normalize();

    if (joint.jointType === JointType.Slider) {
      // Prismatic joint
      J[0][i] = worldAxis.x; // J_linear_x
      J[1][i] = worldAxis.y; // J_linear_y
      J[2][i] = worldAxis.z; // J_linear_z
      J[3][i] = 0;           // J_angular_x
      J[4][i] = 0;           // J_angular_y
      J[5][i] = 0;           // J_angular_z
    } else {
      // Revolute joint
      const r = new THREE.Vector3().subVectors(endPos, jointPos);
      const cross = new THREE.Vector3().crossVectors(worldAxis, r);

      J[0][i] = cross.x;     // J_linear_x
      J[1][i] = cross.y;     // J_linear_y
      J[2][i] = cross.z;     // J_linear_z
      J[3][i] = worldAxis.x; // J_angular_x
      J[4][i] = worldAxis.y; // J_angular_y
      J[5][i] = worldAxis.z; // J_angular_z
    }
  }

  return J;
}

export default { evaluateFK, evaluateFKSerial, computeJacobian };
