/**
 * RigidBody - Physics rigid body with position, rotation, velocity,
 * force accumulation, and semi-implicit Euler integration
 */
import { Vector3, Quaternion, Matrix4 } from 'three';

export type BodyType = 'static' | 'dynamic' | 'kinematic';

export interface RigidBodyConfig {
  id: string;
  bodyType: BodyType;
  position?: Vector3;
  rotation?: Quaternion;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  ccdEnabled?: boolean;
  sleepThreshold?: number;
}

export class RigidBody {
  public id: string;
  public bodyType: BodyType;

  // State
  public position: Vector3;
  public rotation: Quaternion;
  public linearVelocity: Vector3;
  public angularVelocity: Vector3;

  // Forces (accumulated per frame, cleared after integration)
  public force: Vector3;
  public torque: Vector3;

  // Properties
  public mass: number;
  public inverseMass: number;
  public inertia: number; // simplified scalar inertia
  public inverseInertia: number;
  public linearDamping: number;
  public angularDamping: number;
  public gravityScale: number;
  public ccdEnabled: boolean;
  public sleepThreshold: number;

  // Sleeping
  public awake: boolean = true;
  public sleepTimer: number = 0;

  // Collider reference
  public colliderId: string | null = null;

  // User data
  public userData: Record<string, unknown> = {};

  constructor(config: RigidBodyConfig) {
    this.id = config.id;
    this.bodyType = config.bodyType;

    this.position = config.position?.clone() || new Vector3();
    this.rotation = config.rotation?.clone() || new Quaternion();
    this.linearVelocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.force = new Vector3();
    this.torque = new Vector3();

    if (config.bodyType === 'static') {
      this.mass = 0;
      this.inverseMass = 0;
      this.inertia = 0;
      this.inverseInertia = 0;
      this.awake = false;
    } else {
      this.mass = config.mass || 1.0;
      this.inverseMass = 1.0 / this.mass;
      this.inertia = this.mass * 0.4; // simplified: 2/5 * m * r^2 with r=1
      this.inverseInertia = 1.0 / this.inertia;
    }

    this.linearDamping = config.linearDamping ?? 0.05;
    this.angularDamping = config.angularDamping ?? 0.05;
    this.gravityScale = config.gravityScale ?? 1.0;
    this.ccdEnabled = config.ccdEnabled ?? false;
    this.sleepThreshold = config.sleepThreshold ?? 0.01;
  }

  /**
   * Apply a force at center of mass
   */
  applyForce(force: Vector3): void {
    if (this.bodyType === 'static') return;
    this.force.add(force);
    this.wake();
  }

  /**
   * Apply a force at a specific world point (generates torque)
   */
  applyForceAtPoint(force: Vector3, point: Vector3): void {
    if (this.bodyType === 'static') return;
    this.force.add(force);
    const leverArm = new Vector3().subVectors(point, this.position);
    const torque = new Vector3().crossVectors(leverArm, force);
    this.torque.add(torque);
    this.wake();
  }

  /**
   * Apply an impulse (instantaneous velocity change)
   */
  applyImpulse(impulse: Vector3): void {
    if (this.bodyType === 'static') return;
    this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
    this.wake();
  }

  /**
   * Apply an impulse at a specific point
   */
  applyImpulseAtPoint(impulse: Vector3, point: Vector3): void {
    if (this.bodyType === 'static') return;
    this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
    const leverArm = new Vector3().subVectors(point, this.position);
    const angularImpulse = new Vector3().crossVectors(leverArm, impulse);
    this.angularVelocity.add(angularImpulse.multiplyScalar(this.inverseInertia));
    this.wake();
  }

  /**
   * Apply torque
   */
  applyTorque(torque: Vector3): void {
    if (this.bodyType === 'static') return;
    this.torque.add(torque);
    this.wake();
  }

  /**
   * Semi-implicit Euler integration step
   */
  integrate(dt: number, gravity: Vector3): void {
    if (!this.awake || this.bodyType === 'static') return;

    // Apply gravity
    const gravityForce = gravity.clone().multiplyScalar(this.mass * this.gravityScale);
    this.force.add(gravityForce);

    // Semi-implicit Euler: update velocity first, then position
    // Linear
    const linearAcceleration = this.force.clone().multiplyScalar(this.inverseMass);
    this.linearVelocity.add(linearAcceleration.multiplyScalar(dt));
    this.linearVelocity.multiplyScalar(1.0 - this.linearDamping * dt);

    // Angular
    const angularAcceleration = this.torque.clone().multiplyScalar(this.inverseInertia);
    this.angularVelocity.add(angularAcceleration.multiplyScalar(dt));
    this.angularVelocity.multiplyScalar(1.0 - this.angularDamping * dt);

    // Update position using new velocity (semi-implicit)
    this.position.add(this.linearVelocity.clone().multiplyScalar(dt));

    // Update rotation using new angular velocity
    if (this.angularVelocity.lengthSq() > 1e-8) {
      const angle = this.angularVelocity.length() * dt;
      const axis = this.angularVelocity.clone().normalize();
      const deltaQuat = new Quaternion().setFromAxisAngle(axis, angle);
      this.rotation.multiply(deltaQuat);
      this.rotation.normalize();
    }

    // Clear accumulated forces
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);

    // Sleep check
    this.checkSleep(dt);
  }

  /**
   * Check if body should go to sleep
   */
  private checkSleep(dt: number): void {
    const energy = this.linearVelocity.lengthSq() + this.angularVelocity.lengthSq();
    if (energy < this.sleepThreshold) {
      this.sleepTimer += dt;
      if (this.sleepTimer > 1.0) {
        this.awake = false;
        this.linearVelocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
      }
    } else {
      this.sleepTimer = 0;
    }
  }

  /**
   * Wake the body up
   */
  wake(): void {
    this.awake = true;
    this.sleepTimer = 0;
  }

  /**
   * Get the transformation matrix
   */
  getTransform(): Matrix4 {
    return new Matrix4().compose(this.position, this.rotation, new Vector3(1, 1, 1));
  }

  /**
   * Get world-space velocity at a point
   */
  getVelocityAtPoint(point: Vector3): Vector3 {
    const r = new Vector3().subVectors(point, this.position);
    return this.linearVelocity.clone().add(new Vector3().crossVectors(this.angularVelocity, r));
  }

  /**
   * Set position directly (for kinematic bodies)
   */
  setPosition(pos: Vector3): void {
    this.position.copy(pos);
  }

  /**
   * Set rotation directly (for kinematic bodies)
   */
  setRotation(rot: Quaternion): void {
    this.rotation.copy(rot);
  }

  /**
   * Set linear velocity
   */
  setLinearVelocity(vel: Vector3): void {
    this.linearVelocity.copy(vel);
    this.wake();
  }

  /**
   * Set angular velocity
   */
  setAngularVelocity(vel: Vector3): void {
    this.angularVelocity.copy(vel);
    this.wake();
  }
}

export default RigidBody;
