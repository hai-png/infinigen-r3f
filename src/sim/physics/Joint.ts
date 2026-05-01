/**
 * Joint - Physics joint system
 * Supports hinge, ball-socket, prismatic, and fixed joints
 */
import { Vector3, Quaternion } from 'three';
import { RigidBody } from './RigidBody';

export type JointType = 'hinge' | 'ball-socket' | 'prismatic' | 'fixed';

export interface JointConfig {
  id: string;
  type: JointType;
  bodyAId: string;
  bodyBId: string;
  /** Anchor point on body A in local space */
  anchorA: Vector3;
  /** Anchor point on body B in local space */
  anchorB: Vector3;
  /** Axis for hinge/prismatic joints in local space of body A */
  axis?: Vector3;
  /** Limits for hinge/prismatic joints */
  limits?: { min: number; max: number };
  /** Motor configuration */
  motor?: { targetVelocity: number; maxForce: number };
  /** Break force (0 = unbreakable) */
  breakForce?: number;
}

export class Joint {
  public id: string;
  public type: JointType;
  public bodyAId: string;
  public bodyBId: string;
  public anchorA: Vector3;
  public anchorB: Vector3;
  public axis: Vector3;
  public limits: { min: number; max: number } | null;
  public motor: { targetVelocity: number; maxForce: number } | null;
  public breakForce: number;

  // Current constraint error (for debugging)
  public positionError: Vector3 = new Vector3();
  public angleError: number = 0;

  constructor(config: JointConfig) {
    this.id = config.id;
    this.type = config.type;
    this.bodyAId = config.bodyAId;
    this.bodyBId = config.bodyBId;
    this.anchorA = config.anchorA.clone();
    this.anchorB = config.anchorB.clone();
    this.axis = config.axis?.clone().normalize() || new Vector3(0, 1, 0);
    this.limits = config.limits || null;
    this.motor = config.motor || null;
    this.breakForce = config.breakForce || 0;
  }

  /**
   * Solve the joint constraint using position-based dynamics
   * Returns true if the joint was broken
   */
  solve(bodyA: RigidBody, bodyB: RigidBody, dt: number): boolean {
    // Get world-space anchor positions
    const worldAnchorA = this.getWorldAnchor(bodyA, this.anchorA);
    const worldAnchorB = this.getWorldAnchor(bodyB, this.anchorB);

    // Position error
    this.positionError.subVectors(worldAnchorB, worldAnchorA);

    // Check break force
    if (this.breakForce > 0) {
      const forceMag = this.positionError.length() / (dt * dt);
      if (forceMag > this.breakForce) {
        return true; // Joint broken
      }
    }

    switch (this.type) {
      case 'fixed':
        this.solveFixed(bodyA, bodyB, worldAnchorA, worldAnchorB, dt);
        break;
      case 'ball-socket':
        this.solveBallSocket(bodyA, bodyB, worldAnchorA, worldAnchorB, dt);
        break;
      case 'hinge':
        this.solveHinge(bodyA, bodyB, worldAnchorA, worldAnchorB, dt);
        break;
      case 'prismatic':
        this.solvePrismatic(bodyA, bodyB, worldAnchorA, worldAnchorB, dt);
        break;
    }

    return false;
  }

  /**
   * Fixed joint: anchors must coincide, rotations must match
   */
  private solveFixed(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vector3, anchorB: Vector3, dt: number): void {
    const correction = this.positionError.clone().multiplyScalar(0.5);

    if (bodyA.bodyType !== 'static') {
      bodyA.position.add(correction);
      // Partially align rotation
      const targetQuat = bodyA.rotation.clone().slerp(bodyB.rotation, 0.1);
      bodyA.rotation.copy(targetQuat);
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.position.sub(correction);
      const targetQuat = bodyB.rotation.clone().slerp(bodyA.rotation, 0.1);
      bodyB.rotation.copy(targetQuat);
    }
  }

  /**
   * Ball-socket: anchors must coincide, free rotation
   */
  private solveBallSocket(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vector3, anchorB: Vector3, dt: number): void {
    const correction = this.positionError.clone().multiplyScalar(0.5);

    if (bodyA.bodyType !== 'static') {
      bodyA.position.add(correction);
      // Apply velocity correction
      const relVel = bodyB.getVelocityAtPoint(anchorB).sub(bodyA.getVelocityAtPoint(anchorA));
      bodyA.linearVelocity.add(relVel.multiplyScalar(0.3 * bodyA.inverseMass));
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.position.sub(correction);
    }
  }

  /**
   * Hinge: anchors coincide, rotation allowed only around axis
   */
  private solveHinge(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vector3, anchorB: Vector3, dt: number): void {
    // Positional constraint (same as ball-socket)
    const correction = this.positionError.clone().multiplyScalar(0.5);
    if (bodyA.bodyType !== 'static') bodyA.position.add(correction);
    if (bodyB.bodyType !== 'static') bodyB.position.sub(correction);

    // Apply motor
    if (this.motor) {
      const targetAngVel = this.axis.clone().multiplyScalar(this.motor.targetVelocity);
      if (bodyA.bodyType !== 'static') {
        bodyA.angularVelocity.lerp(targetAngVel, 0.1);
      }
      if (bodyB.bodyType !== 'static') {
        bodyB.angularVelocity.lerp(targetAngVel.clone().negate(), 0.1);
      }
    }

    // Enforce limits
    if (this.limits) {
      const axisA = this.axis.clone().applyQuaternion(bodyA.rotation);
      const axisB = this.axis.clone().applyQuaternion(bodyB.rotation);
      const angle = Math.acos(Math.max(-1, Math.min(1, axisA.dot(axisB))));
      if (angle < this.limits.min || angle > this.limits.max) {
        const clampedAngle = Math.max(this.limits.min, Math.min(this.limits.max, angle));
        const correctionQuat = new Quaternion().setFromAxisAngle(
          new Vector3().crossVectors(axisA, axisB).normalize(),
          clampedAngle - angle
        );
        if (bodyB.bodyType !== 'static') {
          bodyB.rotation.multiply(correctionQuat);
          bodyB.rotation.normalize();
        }
      }
    }
  }

  /**
   * Prismatic: anchors coincide along axis, translation allowed only along axis
   */
  private solvePrismatic(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vector3, anchorB: Vector3, dt: number): void {
    // Remove perpendicular error, keep along-axis error
    const axisWorld = this.axis.clone().applyQuaternion(bodyA.rotation).normalize();
    const alongAxis = this.positionError.dot(axisWorld);
    const perpendicularError = this.positionError.clone().sub(axisWorld.clone().multiplyScalar(alongAxis));
    const correction = perpendicularError.multiplyScalar(0.5);

    if (bodyA.bodyType !== 'static') bodyA.position.add(correction);
    if (bodyB.bodyType !== 'static') bodyB.position.sub(correction);

    // Enforce limits
    if (this.limits) {
      const clamped = Math.max(this.limits.min, Math.min(this.limits.max, alongAxis));
      if (clamped !== alongAxis) {
        const limitCorrection = axisWorld.clone().multiplyScalar((clamped - alongAxis) * 0.5);
        if (bodyB.bodyType !== 'static') {
          bodyB.position.add(limitCorrection);
        }
      }
    }

    // Apply motor
    if (this.motor) {
      const motorForce = axisWorld.clone().multiplyScalar(this.motor.targetVelocity * this.motor.maxForce);
      if (bodyB.bodyType !== 'static') {
        bodyB.applyForce(motorForce);
      }
    }
  }

  /**
   * Get world-space position of a local anchor point
   */
  private getWorldAnchor(body: RigidBody, localAnchor: Vector3): Vector3 {
    const worldAnchor = localAnchor.clone().applyQuaternion(body.rotation);
    worldAnchor.add(body.position);
    return worldAnchor;
  }
}

export default Joint;
