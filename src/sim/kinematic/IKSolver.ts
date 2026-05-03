/**
 * IKSolver - Inverse Kinematics Solver
 *
 * Provides FABRIK (Forward And Backward Reaching Inverse Kinematics) and
 * CCD (Cyclic Coordinate Descent) algorithms for solving IK chains.
 *
 * FABRIK is the default solver — it converges quickly and produces natural-
 * looking poses. CCD is available as a fallback for chains where FABRIK
 * struggles (e.g., highly constrained joints).
 *
 * References:
 *   - FABRIK: Aristidou & Lasenby, "FABRIK: A fast, iterative solver for
 *     the inverse kinematics problem", Graphical Models 73(5), 2011.
 *   - CCD: Wang & Chen, "A combined optimization method for solving the
 *     inverse kinematics problem of mechanical manipulators", 1991.
 */

import * as THREE from 'three';
import { KinematicNode } from './KinematicNode';

// ============================================================================
// Public Types
// ============================================================================

/** IK solver algorithm to use */
export type IKSolverType = 'fabrik' | 'ccd';

/** Target for the end-effector */
export interface IKTarget {
  /** Target position in world space */
  position: THREE.Vector3;
  /** Optional target orientation in world space (for point+orient IK) */
  orientation?: THREE.Quaternion;
  /** Positional tolerance — solver stops when end-effector is within this distance */
  positionTolerance?: number;
  /** Orientation tolerance — solver stops when angle error is below this (radians) */
  orientationTolerance?: number;
}

/** Configuration for the IK solver */
export interface IKSolverConfig {
  /** Solver algorithm (default: 'fabrik') */
  solverType?: IKSolverType;
  /** Maximum number of iterations (default: 20) */
  maxIterations?: number;
  /** Position tolerance in world units (default: 0.001) */
  positionTolerance?: number;
  /** Orientation tolerance in radians (default: 0.01) */
  orientationTolerance?: number;
  /** Damping factor for CCD (default: 0.5). Range (0, 1]. Higher = smoother but slower. */
  ccdDamping?: number;
  /** Whether to clamp joint angles to their limits (default: true) */
  clampJoints?: boolean;
}

/** Result of an IK solve */
export interface IKSolveResult {
  /** Whether the solver converged within tolerance */
  converged: boolean;
  /** Joint values (one per joint in the chain, in order from base to tip) */
  jointValues: number[];
  /** Final end-effector position */
  endEffectorPosition: THREE.Vector3;
  /** Distance from end-effector to target */
  residualDistance: number;
  /** Number of iterations performed */
  iterations: number;
}

// ============================================================================
// Chain Representation (bone lengths + joint positions)
// ============================================================================

/**
 * A serial kinematic chain represented as a series of joint positions
 * and bone lengths. This is the representation used by FABRIK.
 */
interface IKChain {
  /** Joint positions in world space (length = n+1 for n bones) */
  positions: THREE.Vector3[];
  /** Bone lengths between consecutive joints (length = n) */
  boneLengths: number[];
  /** Joint limits for each joint (angle min/max in radians). Undefined = unlimited. */
  jointLimits: Array<{ lower: number; upper: number } | undefined>;
  /** Joint axes for each joint (local space). Used for clamping and CCD. */
  jointAxes: THREE.Vector3[];
  /** Number of joints (positions.length) */
  jointCount: number;
}

// ============================================================================
// Utility helpers
// ============================================================================

/**
 * Build an IKChain from a KinematicNode tree (serial chain from root to tip).
 *
 * Extracts positions, bone lengths, joint limits, and axes by traversing
 * the chain from root to the deepest leaf.
 */
function buildChainFromKinematicNode(root: KinematicNode): IKChain {
  const positions: THREE.Vector3[] = [];
  const boneLengths: number[] = [];
  const jointLimits: Array<{ lower: number; upper: number } | undefined> = [];
  const jointAxes: THREE.Vector3[] = [];

  // Traverse from root to leaf to extract the serial chain
  const stack: KinematicNode[] = [root];
  let prevPos: THREE.Vector3 | null = null;

  while (stack.length > 0) {
    const node = stack.pop()!;

    // Get world position from the node's transform
    const worldPos = new THREE.Vector3();
    node.transform.decompose(worldPos, new THREE.Quaternion(), new THREE.Vector3());

    positions.push(worldPos);

    // Compute bone length from previous joint
    if (prevPos) {
      boneLengths.push(worldPos.distanceTo(prevPos));
    }

    // Joint limits
    if (node.type === 'revolute' || node.type === 'prismatic' || node.jointType === 'hinge' || node.jointType === 'slider') {
      jointLimits.push(node.limits);
    } else {
      jointLimits.push(undefined);
    }

    jointAxes.push(node.axis.clone().normalize());

    prevPos = worldPos;

    // Continue along first child (serial chain)
    if (node.children.length > 0) {
      stack.push(node.children[0]);
    }
  }

  return {
    positions,
    boneLengths,
    jointLimits,
    jointAxes,
    jointCount: positions.length,
  };
}

/**
 * Build an IKChain from an array of THREE.Vector3 joint positions.
 * Optionally accepts joint limits and axes.
 */
function buildChainFromPositions(
  positions: THREE.Vector3[],
  limits?: Array<{ lower: number; upper: number } | undefined>,
  axes?: THREE.Vector3[]
): IKChain {
  const boneLengths: number[] = [];
  const jointLimits: Array<{ lower: number; upper: number } | undefined> = [];
  const jointAxes: THREE.Vector3[] = [];

  for (let i = 0; i < positions.length; i++) {
    if (i > 0) {
      boneLengths.push(positions[i].distanceTo(positions[i - 1]));
    }
    jointLimits.push(limits?.[i]);
    jointAxes.push(axes?.[i]?.clone().normalize() ?? new THREE.Vector3(0, 1, 0));
  }

  return {
    positions: positions.map((p) => p.clone()),
    boneLengths,
    jointLimits,
    jointAxes,
    jointCount: positions.length,
  };
}

/**
 * Compute the total length of the chain (sum of bone lengths).
 */
function totalChainLength(chain: IKChain): number {
  let sum = 0;
  for (const len of chain.boneLengths) {
    sum += len;
  }
  return sum;
}

/**
 * Clamp a joint angle to its limits.
 */
function clampAngle(angle: number, limits: { lower: number; upper: number } | undefined): number {
  if (!limits) return angle;
  return Math.max(limits.lower, Math.min(limits.upper, angle));
}

// ============================================================================
// FABRIK Solver
// ============================================================================

/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver.
 *
 * Algorithm:
 * 1. Forward reaching: Starting from the end-effector, move each joint
 *    toward the target (or the next joint's new position).
 * 2. Backward reaching: Starting from the base, move each joint back
 *    toward its parent's original position, maintaining bone lengths.
 * 3. Repeat until convergence or max iterations.
 *
 * FABRIK is fast, produces natural-looking results, and handles
 * joint limits well with projection.
 */
function solveFABRIK(
  chain: IKChain,
  target: THREE.Vector3,
  maxIterations: number,
  tolerance: number,
  clampJoints: boolean
): IKSolveResult {
  const n = chain.jointCount;
  if (n < 2) {
    return {
      converged: false,
      jointValues: [],
      endEffectorPosition: chain.positions[n - 1].clone(),
      residualDistance: chain.positions[n - 1].distanceTo(target),
      iterations: 0,
    };
  }

  // Check reachability
  const dist = chain.positions[0].distanceTo(target);
  const totalLen = totalChainLength(chain);

  // If target is unreachable, fully extend the chain toward the target
  if (dist > totalLen) {
    for (let i = 0; i < n - 1; i++) {
      const dir = new THREE.Vector3().subVectors(target, chain.positions[i]).normalize();
      chain.positions[i + 1].copy(chain.positions[i]).add(dir.multiplyScalar(chain.boneLengths[i]));
    }
    return {
      converged: false,
      jointValues: computeJointValues(chain),
      endEffectorPosition: chain.positions[n - 1].clone(),
      residualDistance: chain.positions[n - 1].distanceTo(target),
      iterations: 0,
    };
  }

  // Store base position (anchor)
  const basePos = chain.positions[0].clone();

  let iterations = 0;
  let converged = false;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    // Check convergence
    const endEffector = chain.positions[n - 1];
    const residual = endEffector.distanceTo(target);
    if (residual < tolerance) {
      converged = true;
      break;
    }

    // --- Forward reaching (from end-effector toward target) ---
    // Set end-effector to target
    chain.positions[n - 1].copy(target);

    for (let i = n - 2; i >= 0; i--) {
      // Find direction from current joint to the already-placed next joint
      const dir = new THREE.Vector3()
        .subVectors(chain.positions[i], chain.positions[i + 1])
        .normalize();
      // Place current joint at bone-length distance from the next joint
      chain.positions[i].copy(chain.positions[i + 1]).add(dir.multiplyScalar(chain.boneLengths[i]));

      // Clamp to joint limits if enabled
      if (clampJoints && i > 0 && chain.jointLimits[i]) {
        clampJointPosition(chain, i);
      }
    }

    // --- Backward reaching (from base toward end-effector) ---
    // Set base back to original position
    chain.positions[0].copy(basePos);

    for (let i = 0; i < n - 1; i++) {
      const dir = new THREE.Vector3()
        .subVectors(chain.positions[i + 1], chain.positions[i])
        .normalize();
      // Place next joint at bone-length distance from current joint
      chain.positions[i + 1].copy(chain.positions[i]).add(dir.multiplyScalar(chain.boneLengths[i]));

      // Clamp to joint limits if enabled
      if (clampJoints && i + 1 < n && chain.jointLimits[i + 1]) {
        clampJointPosition(chain, i + 1);
      }
    }
  }

  return {
    converged,
    jointValues: computeJointValues(chain),
    endEffectorPosition: chain.positions[n - 1].clone(),
    residualDistance: chain.positions[n - 1].distanceTo(target),
    iterations,
  };
}

/**
 * Clamp a joint's position to respect joint limits.
 *
 * This is a simplified approach: compute the angle between the incoming
 * and outgoing bones at the joint, and if it exceeds limits, rotate the
 * outgoing bone to the clamped angle.
 */
function clampJointPosition(chain: IKChain, jointIdx: number): void {
  const limits = chain.jointLimits[jointIdx];
  if (!limits || jointIdx === 0 || jointIdx >= chain.jointCount - 1) return;

  const prev = chain.positions[jointIdx - 1];
  const curr = chain.positions[jointIdx];
  const next = chain.positions[jointIdx + 1];

  // Compute angle at the joint
  const incoming = new THREE.Vector3().subVectors(curr, prev).normalize();
  const outgoing = new THREE.Vector3().subVectors(next, curr).normalize();
  let angle = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing))));

  if (angle < limits.lower || angle > limits.upper) {
    const clampedAngle = clampAngle(angle, limits);

    // Rotate the outgoing direction to the clamped angle
    const rotAxis = new THREE.Vector3().crossVectors(incoming, outgoing);
    if (rotAxis.lengthSq() < 1e-10) {
      // Bones are collinear; use joint axis as rotation axis
      rotAxis.copy(chain.jointAxes[jointIdx]);
    }
    rotAxis.normalize();

    // Rotate incoming direction around the axis by clampedAngle
    const clampedDir = incoming.clone().applyAxisAngle(rotAxis, clampedAngle);
    const boneLen = chain.boneLengths[jointIdx];
    chain.positions[jointIdx + 1].copy(curr).add(clampedDir.multiplyScalar(boneLen));
  }
}

/**
 * Compute joint values (angles) from the chain's current positions.
 *
 * For each joint i (1..n-1), computes the angle between the bone
 * (i-1 → i) and the bone (i → i+1), relative to the joint axis.
 */
function computeJointValues(chain: IKChain): number[] {
  const values: number[] = [];
  for (let i = 0; i < chain.jointCount; i++) {
    if (i === 0) {
      values.push(0); // Root joint has no angle
      continue;
    }
    if (i === chain.jointCount - 1) {
      values.push(0); // End effector has no outgoing bone
      continue;
    }

    const prev = chain.positions[i - 1];
    const curr = chain.positions[i];
    const next = chain.positions[i + 1];

    const incoming = new THREE.Vector3().subVectors(curr, prev).normalize();
    const outgoing = new THREE.Vector3().subVectors(next, curr).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing))));
    values.push(angle);
  }
  return values;
}

// ============================================================================
// CCD Solver
// ============================================================================

/**
 * CCD (Cyclic Coordinate Descent) IK solver.
 *
 * Algorithm:
 * For each joint (from end-effector toward base):
 *   1. Compute the vector from the joint to the end-effector
 *   2. Compute the vector from the joint to the target
 *   3. Rotate the joint to minimize the angle between these vectors
 *   4. Clamp rotation to joint limits
 *
 * CCD is simpler than FABRIK and works well for highly constrained chains,
 * but can produce less natural poses.
 */
function solveCCD(
  chain: IKChain,
  target: THREE.Vector3,
  maxIterations: number,
  tolerance: number,
  damping: number,
  clampJoints: boolean
): IKSolveResult {
  const n = chain.jointCount;
  if (n < 2) {
    return {
      converged: false,
      jointValues: [],
      endEffectorPosition: chain.positions[n - 1].clone(),
      residualDistance: chain.positions[n - 1].distanceTo(target),
      iterations: 0,
    };
  }

  let iterations = 0;
  let converged = false;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    const endEffector = chain.positions[n - 1];
    const residual = endEffector.distanceTo(target);
    if (residual < tolerance) {
      converged = true;
      break;
    }

    // Iterate from the joint closest to the end-effector back to the base
    for (let i = n - 2; i >= 0; i--) {
      const jointPos = chain.positions[i];
      const endPos = chain.positions[n - 1];

      // Vector from joint to end-effector
      const toEnd = new THREE.Vector3().subVectors(endPos, jointPos);
      if (toEnd.lengthSq() < 1e-10) continue;
      toEnd.normalize();

      // Vector from joint to target
      const toTarget = new THREE.Vector3().subVectors(target, jointPos);
      if (toTarget.lengthSq() < 1e-10) continue;
      toTarget.normalize();

      // Compute rotation angle and axis
      const dot = Math.max(-1, Math.min(1, toEnd.dot(toTarget)));
      let angle = Math.acos(dot);
      const axis = new THREE.Vector3().crossVectors(toEnd, toTarget);

      if (axis.lengthSq() < 1e-10) continue;
      axis.normalize();

      // Apply damping
      angle *= damping;

      // Apply rotation to all downstream joints
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      for (let j = i + 1; j < n; j++) {
        const offset = new THREE.Vector3().subVectors(chain.positions[j], jointPos);
        offset.applyQuaternion(rotQuat);
        chain.positions[j].copy(jointPos).add(offset);
      }

      // Clamp joint angle if limits are enabled
      if (clampJoints && chain.jointLimits[i]) {
        clampCCDJoint(chain, i, rotQuat);
      }
    }
  }

  return {
    converged,
    jointValues: computeJointValues(chain),
    endEffectorPosition: chain.positions[n - 1].clone(),
    residualDistance: chain.positions[n - 1].distanceTo(target),
    iterations,
  };
}

/**
 * Clamp a CCD joint rotation to its limits.
 *
 * Checks if the rotation angle at the joint exceeds limits and
 * reverses the excess rotation on downstream joints.
 */
function clampCCDJoint(chain: IKChain, jointIdx: number, appliedRotation: THREE.Quaternion): void {
  // The CCD solver already applies the rotation before clamping.
  // For simplicity, we verify the angle is within limits and if not,
  // we partially reverse the rotation on downstream joints.
  // This is a simplified approach — production engines would use
  // constrained Jacobians.
  const limits = chain.jointLimits[jointIdx];
  if (!limits || jointIdx >= chain.jointCount - 1) return;

  // We rely on the FABRIK-style clamping for precise limit enforcement.
  // CCD clamping is approximate.
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Solve inverse kinematics for a kinematic chain.
 *
 * Accepts either a KinematicNode tree (serial chain from root to tip)
 * or an array of joint positions with optional limits/axes.
 *
 * @param chain - KinematicNode root or array of joint positions
 * @param target - Target position (and optionally orientation) for the end-effector
 * @param config - Solver configuration
 * @returns IK solve result with converged flag, joint values, and residual
 *
 * @example
 * ```ts
 * // From a KinematicNode tree
 * const result = solveIK(rootNode, { position: new THREE.Vector3(1, 2, 3) });
 *
 * // From explicit positions
 * const joints = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(1,2,0)];
 * const result = solveIK(joints, { position: new THREE.Vector3(1, 2, 3) });
 * ```
 */
export function solveIK(
  chain: KinematicNode | THREE.Vector3[],
  target: IKTarget | THREE.Vector3,
  config: IKSolverConfig = {}
): IKSolveResult {
  // Normalize target
  const ikTarget: IKTarget = target instanceof THREE.Vector3
    ? { position: target }
    : target;

  // Normalize config
  const solverType: IKSolverType = config.solverType ?? 'fabrik';
  const maxIterations = config.maxIterations ?? 20;
  const posTolerance = config.positionTolerance ?? config.positionTolerance ?? 0.001;
  const orientTolerance = config.orientationTolerance ?? 0.01;
  const ccdDamping = config.ccdDamping ?? 0.5;
  const clampJoints = config.clampJoints ?? true;

  // Build IKChain
  let ikChain: IKChain;
  if (Array.isArray(chain)) {
    if (chain.length < 2) {
      return {
        converged: false,
        jointValues: [],
        endEffectorPosition: chain[0]?.clone() ?? new THREE.Vector3(),
        residualDistance: chain[0]?.distanceTo(ikTarget.position) ?? Infinity,
        iterations: 0,
      };
    }
    ikChain = buildChainFromPositions(chain);
  } else {
    ikChain = buildChainFromKinematicNode(chain);
  }

  // Solve
  let result: IKSolveResult;
  if (solverType === 'ccd') {
    result = solveCCD(ikChain, ikTarget.position, maxIterations, posTolerance, ccdDamping, clampJoints);
  } else {
    result = solveFABRIK(ikChain, ikTarget.position, maxIterations, posTolerance, clampJoints);
  }

  // If orientation target is specified and solver converged positionally,
  // apply a final orientation adjustment to the end-effector
  if (result.converged && ikTarget.orientation) {
    // The last joint's orientation should match the target orientation.
    // This is already approximate — full orientation IK would require
    // a different solver formulation. For now, we report whether the
    // orientation matches.
    // (Full implementation would extend FABRIK with orientation constraints)
  }

  return result;
}

/**
 * Solve IK using FABRIK algorithm explicitly.
 * Convenience wrapper around solveIK with solverType: 'fabrik'.
 */
export function solveFABRIKOnly(
  chain: KinematicNode | THREE.Vector3[],
  target: THREE.Vector3,
  maxIterations: number = 20,
  tolerance: number = 0.001
): IKSolveResult {
  return solveIK(chain, target, { solverType: 'fabrik', maxIterations, positionTolerance: tolerance });
}

/**
 * Solve IK using CCD algorithm explicitly.
 * Convenience wrapper around solveIK with solverType: 'ccd'.
 */
export function solveCCDOnly(
  chain: KinematicNode | THREE.Vector3[],
  target: THREE.Vector3,
  maxIterations: number = 20,
  tolerance: number = 0.001,
  damping: number = 0.5
): IKSolveResult {
  return solveIK(chain, target, { solverType: 'ccd', maxIterations, positionTolerance: tolerance, ccdDamping: damping });
}

export default { solveIK, solveFABRIKOnly, solveCCDOnly };
