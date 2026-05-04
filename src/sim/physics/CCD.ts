/**
 * ContinuousCollisionDetector (CCD) - Prevents tunneling of fast-moving bodies
 *
 * Features:
 * - Conservative advancement with binary search for TOI (time of impact)
 * - Swept AABB for broad phase
 * - GJK-based precise TOI computation
 * - Processes CCD collisions in order of increasing TOI
 *
 * Algorithm:
 * 1. After discrete collision step, identify bodies with ccdEnabled and high velocity
 * 2. Compute swept AABB from current position to predicted next position
 * 3. Find potential collisions using broadphase with swept AABB
 * 4. For each potential collision, perform TOI calculation:
 *    - Conservative advancement: binary search between t=0 and t=1
 *    - At each step, move the body to t*velocity and check for overlap
 *    - When overlap is found, compute the exact TOI
 * 5. Process collisions in order of increasing TOI
 * 6. Apply collision response at the TOI position
 */
import { Vector3, Matrix4, Quaternion } from 'three';
import { RigidBody } from './RigidBody';
import { Collider } from './Collider';
import { BroadPhase, BroadPhasePair } from './collision/BroadPhase';
import { NarrowPhase, ContactPoint } from './collision/NarrowPhase';
import { gjkIntersect, getSupportFunction, minkowskiSupport, EPAResult, epaPenetration } from './collision/GJK';

// ============================================================================
// Constants
// ============================================================================

const CCD_VELOCITY_THRESHOLD = 1.0; // Minimum speed to trigger CCD
const CCD_TOI_BINARY_SEARCH_ITERATIONS = 20;
const CCD_TOI_TOLERANCE = 1e-4;
const CCD_MAX_TOI_EVENTS = 8; // Max CCD events per body per frame

// ============================================================================
// Types
// ============================================================================

export interface CCDEvent {
  body: RigidBody;
  otherBody: RigidBody;
  colliderA: Collider;
  colliderB: Collider;
  toi: number; // Time of impact in [0, 1] as fraction of dt
  contacts: ContactPoint[];
}

// ============================================================================
// ContinuousCollisionDetector
// ============================================================================

export class ContinuousCollisionDetector {
  private broadPhase: BroadPhase;
  private narrowPhase: NarrowPhase;

  constructor() {
    this.broadPhase = new BroadPhase();
    this.narrowPhase = new NarrowPhase();
  }

  /**
   * Detect CCD events for all bodies that have ccdEnabled and are moving fast enough.
   *
   * @param bodies Map of all bodies in the world
   * @param colliders Map of all colliders in the world
   * @param dt The timestep duration
   * @returns Array of CCDEvents sorted by TOI
   */
  detect(
    bodies: Map<string, RigidBody>,
    colliders: Map<string, Collider>,
    dt: number
  ): CCDEvent[] {
    const events: CCDEvent[] = [];

    // Find all CCD-eligible bodies — uses per-body ccdMotionThreshold
    const ccdBodies: RigidBody[] = [];
    for (const body of bodies.values()) {
      if (!body.ccdEnabled) continue;
      if (body.bodyType === 'static') continue;
      if (!body.awake) continue;

      const speed = body.linearVelocity.length();
      if (speed > body.ccdMotionThreshold) {
        ccdBodies.push(body);
      }
    }

    if (ccdBodies.length === 0) return [];

    // For each CCD body, find potential collisions using swept AABB
    for (const body of ccdBodies) {
      const colliderId = body.colliderId;
      if (!colliderId) continue;

      const collider = colliders.get(colliderId);
      if (!collider) continue;

      // Compute the predicted position at the end of the timestep
      const predictedPosition = body.position.clone().add(
        body.linearVelocity.clone().multiplyScalar(dt)
      );

      // Compute swept AABB that covers the entire motion
      const sweptAABB = this.computeSweptAABB(collider, body.position, predictedPosition);

      // Create a temporary collider with the swept AABB for broadphase
      const sweptCollider = this.createSweptCollider(collider, sweptAABB);

      // Run broadphase with the swept collider + all other colliders
      const otherColliders: Collider[] = [];
      for (const c of colliders.values()) {
        if (c.id !== colliderId) {
          otherColliders.push(c);
        }
      }

      this.broadPhase.update([sweptCollider, ...otherColliders]);
      const broadPairs = this.broadPhase.findPairs();

      // For each potential collision pair, compute TOI
      for (const pair of broadPairs) {
        let collA = pair.colliderA;
        let collB = pair.colliderB;

        // Determine which is the CCD body's collider
        let ccdCollider: Collider;
        let otherCollider: Collider;

        if (collA.id === sweptCollider.id) {
          ccdCollider = collider; // Use original collider, not swept
          otherCollider = collB;
        } else if (collB.id === sweptCollider.id) {
          ccdCollider = collider;
          otherCollider = collA;
        } else {
          continue; // Not a CCD pair
        }

        // Get the other body
        const otherBody = otherCollider.bodyId ? bodies.get(otherCollider.bodyId) : null;
        if (!otherBody) continue;

        // Compute TOI
        const toi = this.computeTOI(body, ccdCollider, otherBody, otherCollider, dt);

        if (toi >= 0 && toi <= 1.0) {
          // Compute contacts at the TOI position
          const toiContacts = this.computeContactsAtTOI(
            body, ccdCollider, otherBody, otherCollider, toi, dt
          );

          if (toiContacts.length > 0) {
            events.push({
              body,
              otherBody,
              colliderA: ccdCollider,
              colliderB: otherCollider,
              toi,
              contacts: toiContacts,
            });
          }
        }
      }

      // Limit events per body
      if (events.length > CCD_MAX_TOI_EVENTS) {
        events.sort((a, b) => a.toi - b.toi);
        events.length = CCD_MAX_TOI_EVENTS;
      }
    }

    // Sort by TOI (process earliest impacts first)
    events.sort((a, b) => a.toi - b.toi);

    return events;
  }

  /**
   * Compute the time of impact between a moving body and another body.
   * Uses conservative advancement with binary search.
   *
   * @returns TOI in [0, 1] as fraction of dt, or -1 if no collision
   */
  computeTOI(
    bodyA: RigidBody, colliderA: Collider,
    bodyB: RigidBody, colliderB: Collider,
    dt: number
  ): number {
    // Conservative advancement: binary search between t=0 and t=1
    let tMin = 0;
    let tMax = 1.0;

    const startPosA = bodyA.position.clone();
    const startRotA = bodyA.rotation.clone();
    const velocityA = bodyA.linearVelocity.clone();

    const startPosB = bodyB.position.clone();
    const startRotB = bodyB.rotation.clone();
    const velocityB = bodyB.linearVelocity.clone();

    // First check: are they already overlapping at t=0?
    if (this.checkOverlapAtTime(colliderA, colliderB, startPosA, startPosB, 0, velocityA, velocityB, dt)) {
      return 0; // Already overlapping
    }

    // Binary search for TOI
    for (let iter = 0; iter < CCD_TOI_BINARY_SEARCH_ITERATIONS; iter++) {
      const tMid = (tMin + tMax) / 2;

      if (this.checkOverlapAtTime(colliderA, colliderB, startPosA, startPosB, tMid, velocityA, velocityB, dt)) {
        // Overlap found at tMid — search earlier
        tMax = tMid;
      } else {
        // No overlap — search later
        tMin = tMid;
      }

      if (tMax - tMin < CCD_TOI_TOLERANCE) {
        break;
      }
    }

    // If tMax is still 1.0 and there's no overlap, no collision
    if (tMax > 0.999 && !this.checkOverlapAtTime(colliderA, colliderB, startPosA, startPosB, 1.0, velocityA, velocityB, dt)) {
      return -1; // No collision
    }

    return tMax;
  }

  /**
   * Check if two colliders overlap at a given time fraction.
   * Moves the colliders to their interpolated positions and checks.
   */
  private checkOverlapAtTime(
    colliderA: Collider, colliderB: Collider,
    startPosA: Vector3, startPosB: Vector3,
    t: number,
    velocityA: Vector3, velocityB: Vector3,
    dt: number
  ): boolean {
    // Compute positions at time t
    const posA = startPosA.clone().add(velocityA.clone().multiplyScalar(t * dt));
    const posB = startPosB.clone().add(velocityB.clone().multiplyScalar(t * dt));

    // Update AABBs at the interpolated positions
    const transformA = new Matrix4().compose(posA, new Quaternion(), new Vector3(1, 1, 1));
    const transformB = new Matrix4().compose(posB, new Quaternion(), new Vector3(1, 1, 1));

    // Temporarily update AABBs
    const savedAABBMinA = colliderA.aabbMin.clone();
    const savedAABBMaxA = colliderA.aabbMax.clone();
    const savedAABBMinB = colliderB.aabbMin.clone();
    const savedAABBMaxB = colliderB.aabbMax.clone();

    colliderA.updateAABB(posA, transformA);
    colliderB.updateAABB(posB, transformB);

    // Check AABB overlap first (cheap)
    const aabbOverlaps = (
      colliderA.aabbMin.x <= colliderB.aabbMax.x && colliderA.aabbMax.x >= colliderB.aabbMin.x &&
      colliderA.aabbMin.y <= colliderB.aabbMax.y && colliderA.aabbMax.y >= colliderB.aabbMin.y &&
      colliderA.aabbMin.z <= colliderB.aabbMax.z && colliderA.aabbMax.z >= colliderB.aabbMin.z
    );

    let overlaps = false;
    if (aabbOverlaps) {
      // Precise check using GJK
      const supportA = getSupportFunction(colliderA);
      const supportB = getSupportFunction(colliderB);
      const centerA = new Vector3().addVectors(colliderA.aabbMin, colliderA.aabbMax).multiplyScalar(0.5);
      const centerB = new Vector3().addVectors(colliderB.aabbMin, colliderB.aabbMax).multiplyScalar(0.5);
      const initialDir = new Vector3().subVectors(centerB, centerA);
      if (initialDir.lengthSq() < 1e-8) initialDir.set(0, 1, 0);

      const gjkResult = gjkIntersect(supportA, supportB, initialDir);
      overlaps = gjkResult.intersects;
    }

    // Restore AABBs
    colliderA.aabbMin.copy(savedAABBMinA);
    colliderA.aabbMax.copy(savedAABBMaxA);
    colliderB.aabbMin.copy(savedAABBMinB);
    colliderB.aabbMax.copy(savedAABBMaxB);

    return overlaps;
  }

  /**
   * Compute contact points at the TOI position.
   */
  private computeContactsAtTOI(
    bodyA: RigidBody, colliderA: Collider,
    bodyB: RigidBody, colliderB: Collider,
    toi: number,
    dt: number
  ): ContactPoint[] {
    // Move bodies to TOI positions
    const posA = bodyA.position.clone().add(bodyA.linearVelocity.clone().multiplyScalar(toi * dt));
    const posB = bodyB.position.clone().add(bodyB.linearVelocity.clone().multiplyScalar(toi * dt));

    // Temporarily update AABBs and narrowphase
    const savedAABBMinA = colliderA.aabbMin.clone();
    const savedAABBMaxA = colliderA.aabbMax.clone();
    const savedAABBMinB = colliderB.aabbMin.clone();
    const savedAABBMaxB = colliderB.aabbMax.clone();

    const transformA = new Matrix4().compose(posA, new Quaternion(), new Vector3(1, 1, 1));
    const transformB = new Matrix4().compose(posB, new Quaternion(), new Vector3(1, 1, 1));

    colliderA.updateAABB(posA, transformA);
    colliderB.updateAABB(posB, transformB);

    // Detect contacts
    const contacts = this.narrowPhase.detectPair(colliderA, colliderB);

    // Restore AABBs
    colliderA.aabbMin.copy(savedAABBMinA);
    colliderA.aabbMax.copy(savedAABBMaxA);
    colliderB.aabbMin.copy(savedAABBMinB);
    colliderB.aabbMax.copy(savedAABBMaxB);

    return contacts;
  }

  /**
   * Compute a swept AABB that covers the entire motion from startPos to endPos.
   */
  private computeSweptAABB(
    collider: Collider,
    currentPosition: Vector3,
    predictedPosition: Vector3
  ): { min: Vector3; max: Vector3 } {
    // Union of current and predicted AABBs
    const currentAABBMin = collider.aabbMin.clone();
    const currentAABBMax = collider.aabbMax.clone();

    // Compute predicted AABB by offsetting current AABB by the displacement
    const displacement = new Vector3().subVectors(predictedPosition, currentPosition);
    const predictedAABBMin = currentAABBMin.clone().add(displacement);
    const predictedAABBMax = currentAABBMax.clone().add(displacement);

    // Union of both AABBs
    const sweptMin = new Vector3(
      Math.min(currentAABBMin.x, predictedAABBMin.x),
      Math.min(currentAABBMin.y, predictedAABBMin.y),
      Math.min(currentAABBMin.z, predictedAABBMin.z)
    );
    const sweptMax = new Vector3(
      Math.max(currentAABBMax.x, predictedAABBMax.x),
      Math.max(currentAABBMax.y, predictedAABBMax.y),
      Math.max(currentAABBMax.z, predictedAABBMax.z)
    );

    return { min: sweptMin, max: sweptMax };
  }

  /**
   * Create a temporary swept collider for broadphase.
   * This collider has an enlarged AABB covering the full sweep path.
   */
  private createSweptCollider(
    originalCollider: Collider,
    sweptAABB: { min: Vector3; max: Vector3 }
  ): Collider {
    // Create a temporary collider with the swept AABB
    const sweptConfig = {
      id: `__swept_${originalCollider.id}`,
      shape: originalCollider.shape as any,
      halfExtents: originalCollider.halfExtents?.clone(),
      radius: originalCollider.radius,
      height: originalCollider.height,
      offset: originalCollider.offset?.clone(),
      collisionLayers: originalCollider.collisionLayers,
      collisionMask: originalCollider.collisionMask,
      isTrigger: originalCollider.isTrigger,
      friction: originalCollider.friction,
      restitution: originalCollider.restitution,
    };

    const sweptCollider = new Collider(sweptConfig);
    sweptCollider.aabbMin.copy(sweptAABB.min);
    sweptCollider.aabbMax.copy(sweptAABB.max);

    return sweptCollider;
  }

  /**
   * Apply CCD collision response at the TOI position.
   * Moves the body to the TOI position and applies impulse-based response.
   */
  applyCCDResponse(
    event: CCDEvent,
    dt: number
  ): void {
    const { body, otherBody, toi, contacts } = event;

    // Move the CCD body to the TOI position
    const toiPosition = body.position.clone().add(
      body.linearVelocity.clone().multiplyScalar(toi * dt)
    );
    body.position.copy(toiPosition);

    // Apply collision response for each contact
    for (const contact of contacts) {
      const invMassA = body.bodyType === 'static' ? 0 : body.inverseMass;
      const invMassB = otherBody.bodyType === 'static' ? 0 : otherBody.inverseMass;

      const velA = body.getVelocityAtPoint(contact.point);
      const velB = otherBody.getVelocityAtPoint(contact.point);
      const relVel = new Vector3().subVectors(velB, velA);
      const velAlongNormal = relVel.dot(contact.normal);

      // Only resolve if approaching
      if (velAlongNormal > 0) continue;

      // Impulse with restitution
      const restitution = Math.min(
        event.colliderA.restitution,
        event.colliderB.restitution
      );

      let impulseScalar = -(1 + restitution) * velAlongNormal;
      impulseScalar /= (invMassA + invMassB);

      const impulse = contact.normal.clone().multiplyScalar(impulseScalar);

      if (body.bodyType !== 'static') {
        body.linearVelocity.sub(impulse.clone().multiplyScalar(invMassA));
      }
      if (otherBody.bodyType !== 'static') {
        otherBody.linearVelocity.add(impulse.clone().multiplyScalar(invMassB));
      }

      // Friction
      const tangent = relVel.clone().sub(contact.normal.clone().multiplyScalar(velAlongNormal));
      const tangentLen = tangent.length();
      if (tangentLen > 1e-6) {
        tangent.normalize();
        const friction = Math.sqrt(event.colliderA.friction * event.colliderB.friction);
        const frictionImpulse = Math.min(
          Math.abs(impulseScalar) * friction,
          tangentLen / (invMassA + invMassB)
        );
        const frictionVec = tangent.clone().multiplyScalar(-frictionImpulse);

        if (body.bodyType !== 'static') {
          body.linearVelocity.add(frictionVec.clone().multiplyScalar(invMassA));
        }
        if (otherBody.bodyType !== 'static') {
          otherBody.linearVelocity.sub(frictionVec.clone().multiplyScalar(invMassB));
        }
      }
    }

    // Wake both bodies
    body.wake();
    otherBody.wake();
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import CCD from './CCD'` and `import { CCD } from './CCD'` both work.
 */
export { ContinuousCollisionDetector as CCD };
export default CCD;
