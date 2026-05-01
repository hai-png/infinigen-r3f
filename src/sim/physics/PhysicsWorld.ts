/**
 * PhysicsWorld - Main physics simulation engine
 * 
 * Features:
 * - Body management (add/remove)
 * - Fixed timestep with accumulator
 * - Full collision pipeline (broad + narrow phase)
 * - Gravity
 * - Collision response with friction/restitution
 * - Joint system
 */
import { Vector3 } from 'three';
import { RigidBody, RigidBodyConfig, BodyType } from './RigidBody';
import { Collider, ColliderConfig } from './Collider';
import { Joint, JointConfig } from './Joint';
import { BroadPhase, BroadPhasePair } from './collision/BroadPhase';
import { NarrowPhase, CollisionPair, ContactPoint } from './collision/NarrowPhase';
import { PhysicsMaterial, materialPresets, combineFriction, combineRestitution } from './Material';

export interface PhysicsWorldConfig {
  gravity?: Vector3;
  fixedTimestep?: number;
  maxSubSteps?: number;
  velocityIterations?: number;
  positionIterations?: number;
}

export interface CollisionEvent {
  bodyA: RigidBody;
  bodyB: RigidBody;
  contacts: ContactPoint[];
  combinedFriction: number;
  combinedRestitution: number;
}

export class PhysicsWorld {
  // Bodies and colliders
  private bodies: Map<string, RigidBody> = new Map();
  private colliders: Map<string, Collider> = new Map();
  private joints: Map<string, Joint> = new Map();

  // Collision pipeline
  private broadPhase: BroadPhase;
  private narrowPhase: NarrowPhase;

  // Configuration
  public gravity: Vector3;
  public fixedTimestep: number;
  public maxSubSteps: number;
  public velocityIterations: number;
  public positionIterations: number;

  // Accumulator for fixed timestep
  private accumulator: number = 0;

  // Callbacks
  public onCollision?: (event: CollisionEvent) => void;

  constructor(config: PhysicsWorldConfig = {}) {
    this.gravity = config.gravity ?? new Vector3(0, -9.81, 0);
    this.fixedTimestep = config.fixedTimestep ?? 1 / 60;
    this.maxSubSteps = config.maxSubSteps ?? 4;
    this.velocityIterations = config.velocityIterations ?? 8;
    this.positionIterations = config.positionIterations ?? 3;

    this.broadPhase = new BroadPhase();
    this.narrowPhase = new NarrowPhase();
  }

  /**
   * Add a rigid body to the world
   */
  addBody(config: RigidBodyConfig): RigidBody {
    const body = new RigidBody(config);
    this.bodies.set(body.id, body);
    return body;
  }

  /**
   * Remove a rigid body from the world
   */
  removeBody(bodyId: string): void {
    this.bodies.delete(bodyId);
    // Remove associated collider
    const body = this.bodies.get(bodyId);
    if (body?.colliderId) {
      this.colliders.delete(body.colliderId);
    }
  }

  /**
   * Get a body by ID
   */
  getBody(bodyId: string): RigidBody | undefined {
    return this.bodies.get(bodyId);
  }

  /**
   * Add a collider to the world and attach it to a body
   */
  addCollider(config: ColliderConfig, bodyId: string): Collider {
    const collider = new Collider(config);
    collider.bodyId = bodyId;
    this.colliders.set(collider.id, collider);

    // Link collider to body
    const body = this.bodies.get(bodyId);
    if (body) {
      body.colliderId = collider.id;
    }

    return collider;
  }

  /**
   * Remove a collider
   */
  removeCollider(colliderId: string): void {
    const collider = this.colliders.get(colliderId);
    if (collider?.bodyId) {
      const body = this.bodies.get(collider.bodyId);
      if (body) body.colliderId = null;
    }
    this.colliders.delete(colliderId);
  }

  /**
   * Add a joint
   */
  addJoint(config: JointConfig): Joint {
    const joint = new Joint(config);
    this.joints.set(joint.id, joint);
    return joint;
  }

  /**
   * Remove a joint
   */
  removeJoint(jointId: string): void {
    this.joints.delete(jointId);
  }

  /**
   * Step the simulation forward by dt
   * Uses fixed timestep with accumulator pattern
   */
  step(dt: number): void {
    // Clamp dt to avoid spiral of death
    dt = Math.min(dt, this.fixedTimestep * this.maxSubSteps);
    this.accumulator += dt;

    let subSteps = 0;
    while (this.accumulator >= this.fixedTimestep && subSteps < this.maxSubSteps) {
      this.fixedStep(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      subSteps++;
    }
  }

  /**
   * Perform a single fixed-timestep physics step
   */
  private fixedStep(dt: number): void {
    // 1. Integrate velocities and positions (semi-implicit Euler)
    for (const body of this.bodies.values()) {
      body.integrate(dt, this.gravity);
    }

    // 2. Update collider AABBs
    for (const collider of this.colliders.values()) {
      const body = collider.bodyId ? this.bodies.get(collider.bodyId) : null;
      if (body) {
        collider.updateAABB(body.position, body.getTransform());
      }
    }

    // 3. Broad phase - find potentially colliding pairs
    const colliderList = Array.from(this.colliders.values());
    this.broadPhase.update(colliderList);
    const broadPairs = this.broadPhase.findPairs();

    // 4. Narrow phase - find actual contacts
    const collisionPairs = this.narrowPhase.detect(broadPairs);

    // 5. Resolve collisions
    this.resolveCollisions(collisionPairs, dt);

    // 6. Solve joints
    this.solveJoints(dt);
  }

  /**
   * Resolve all collision pairs
   */
  private resolveCollisions(pairs: CollisionPair[], dt: number): void {
    for (const pair of pairs) {
      const bodyA = pair.colliderA.bodyId ? this.bodies.get(pair.colliderA.bodyId) : null;
      const bodyB = pair.colliderB.bodyId ? this.bodies.get(pair.colliderB.bodyId) : null;

      if (!bodyA || !bodyB) continue;

      // Skip if both are static or sleeping
      if (bodyA.bodyType === 'static' && bodyB.bodyType === 'static') continue;
      if (!bodyA.awake && !bodyB.awake) continue;

      // Skip triggers
      if (pair.colliderA.isTrigger || pair.colliderB.isTrigger) {
        // Fire callback but no physical response
        this.fireCollisionEvent(bodyA, bodyB, pair.contacts, pair.colliderA, pair.colliderB);
        continue;
      }

      for (const contact of pair.contacts) {
        this.resolveContact(bodyA, bodyB, contact, pair.colliderA, pair.colliderB);
      }

      // Fire collision callback
      this.fireCollisionEvent(bodyA, bodyB, pair.contacts, pair.colliderA, pair.colliderB);

      // Wake both bodies
      bodyA.wake();
      bodyB.wake();
    }
  }

  /**
   * Resolve a single contact between two bodies
   */
  private resolveContact(
    bodyA: RigidBody, bodyB: RigidBody,
    contact: ContactPoint,
    colliderA: Collider, colliderB: Collider
  ): void {
    // Compute relative velocity at contact point
    const velA = bodyA.getVelocityAtPoint(contact.point);
    const velB = bodyB.getVelocityAtPoint(contact.point);
    const relVel = new Vector3().subVectors(velB, velA);
    const velAlongNormal = relVel.dot(contact.normal);

    // Only resolve if bodies are moving towards each other
    if (velAlongNormal > 0) return;

    // Get combined material properties
    const matA = materialPresets[colliderA.id] || materialPresets.default;
    const matB = materialPresets[colliderB.id] || materialPresets.default;
    const friction = combineFriction(
      { friction: colliderA.friction, restitution: colliderA.restitution, density: 1 },
      { friction: colliderB.friction, restitution: colliderB.restitution, density: 1 }
    );
    const restitution = combineRestitution(
      { friction: 1, restitution: colliderA.restitution, density: 1 },
      { friction: 1, restitution: colliderB.restitution, density: 1 }
    );

    // Compute impulse magnitude
    const invMassA = bodyA.bodyType === 'static' ? 0 : bodyA.inverseMass;
    const invMassB = bodyB.bodyType === 'static' ? 0 : bodyB.inverseMass;

    let impulseScalar = -(1 + restitution) * velAlongNormal;
    impulseScalar /= (invMassA + invMassB);

    // Apply normal impulse
    const impulse = contact.normal.clone().multiplyScalar(impulseScalar);
    if (bodyA.bodyType !== 'static') {
      bodyA.linearVelocity.sub(impulse.clone().multiplyScalar(invMassA));
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.linearVelocity.add(impulse.clone().multiplyScalar(invMassB));
    }

    // Friction impulse
    const tangent = relVel.clone().sub(contact.normal.clone().multiplyScalar(velAlongNormal));
    const tangentLen = tangent.length();
    if (tangentLen > 1e-6) {
      tangent.normalize();
      const frictionImpulse = Math.min(Math.abs(impulseScalar) * friction, tangentLen / (invMassA + invMassB));
      const frictionVec = tangent.clone().multiplyScalar(-frictionImpulse);
      if (bodyA.bodyType !== 'static') {
        bodyA.linearVelocity.add(frictionVec.clone().multiplyScalar(invMassA));
      }
      if (bodyB.bodyType !== 'static') {
        bodyB.linearVelocity.sub(frictionVec.clone().multiplyScalar(invMassB));
      }
    }

    // Positional correction (Baumgarte stabilization)
    const slop = 0.005;
    const percent = 0.4;
    const correction = contact.normal.clone().multiplyScalar(
      Math.max(contact.depth - slop, 0) / (invMassA + invMassB) * percent
    );
    if (bodyA.bodyType !== 'static') {
      bodyA.position.sub(correction.clone().multiplyScalar(invMassA));
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.position.add(correction.clone().multiplyScalar(invMassB));
    }
  }

  /**
   * Solve all joint constraints
   */
  private solveJoints(dt: number): void {
    const brokenJoints: string[] = [];

    for (const [id, joint] of this.joints) {
      const bodyA = this.bodies.get(joint.bodyAId);
      const bodyB = this.bodies.get(joint.bodyBId);

      if (!bodyA || !bodyB) {
        brokenJoints.push(id);
        continue;
      }

      const broken = joint.solve(bodyA, bodyB, dt);
      if (broken) {
        brokenJoints.push(id);
      }
    }

    // Remove broken joints
    for (const id of brokenJoints) {
      this.joints.delete(id);
    }
  }

  /**
   * Fire collision event callback
   */
  private fireCollisionEvent(
    bodyA: RigidBody, bodyB: RigidBody,
    contacts: ContactPoint[],
    colliderA: Collider, colliderB: Collider
  ): void {
    if (this.onCollision) {
      this.onCollision({
        bodyA,
        bodyB,
        contacts,
        combinedFriction: combineFriction(
          { friction: colliderA.friction, restitution: 0, density: 0 },
          { friction: colliderB.friction, restitution: 0, density: 0 }
        ),
        combinedRestitution: combineRestitution(
          { friction: 0, restitution: colliderA.restitution, density: 0 },
          { friction: 0, restitution: colliderB.restitution, density: 0 }
        ),
      });
    }
  }

  /**
   * Get all bodies
   */
  getBodies(): RigidBody[] {
    return Array.from(this.bodies.values());
  }

  /**
   * Get all colliders
   */
  getColliders(): Collider[] {
    return Array.from(this.colliders.values());
  }

  /**
   * Get all joints
   */
  getJoints(): Joint[] {
    return Array.from(this.joints.values());
  }

  /**
   * Set gravity
   */
  setGravity(gravity: Vector3): void {
    this.gravity.copy(gravity);
  }

  /**
   * Raycast - find the closest body hit by a ray
   */
  raycast(origin: Vector3, direction: Vector3, maxDistance: number = Infinity): { body: RigidBody; point: Vector3; distance: number } | null {
    let closest: { body: RigidBody; point: Vector3; distance: number } | null = null;

    for (const collider of this.colliders.values()) {
      const body = collider.bodyId ? this.bodies.get(collider.bodyId) : null;
      if (!body) continue;

      const center = collider.aabbMin.clone().add(collider.aabbMax).multiplyScalar(0.5);
      const toCenter = new Vector3().subVectors(center, origin);
      const proj = toCenter.dot(direction);

      if (proj < 0) continue; // Behind the ray
      if (proj > maxDistance) continue;

      const closestPoint = origin.clone().add(direction.clone().multiplyScalar(proj));
      const distToCenter = closestPoint.distanceTo(center);

      let hitRadius: number;
      switch (collider.shape) {
        case 'sphere': hitRadius = collider.radius; break;
        case 'box': hitRadius = collider.halfExtents.length(); break;
        case 'cylinder': hitRadius = Math.max(collider.radius, collider.height / 2); break;
        default: hitRadius = 0.5;
      }

      if (distToCenter <= hitRadius) {
        const distance = proj - Math.sqrt(Math.max(0, hitRadius * hitRadius - distToCenter * distToCenter));
        if (distance < (closest?.distance ?? Infinity)) {
          const point = origin.clone().add(direction.clone().multiplyScalar(distance));
          closest = { body, point, distance };
        }
      }
    }

    return closest;
  }

  /**
   * Clear the entire physics world
   */
  clear(): void {
    this.bodies.clear();
    this.colliders.clear();
    this.joints.clear();
    this.accumulator = 0;
  }
}

export default PhysicsWorld;
