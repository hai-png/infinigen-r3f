/**
 * NarrowPhase - Precise collision detection using SAT (Separating Axis Theorem)
 * Generates contact points, normals, and penetration depths
 */
import { Vector3 } from 'three';
import { Collider } from '../Collider';

export interface ContactPoint {
  point: Vector3;
  normal: Vector3; // From A to B
  depth: number;
}

export interface CollisionPair {
  colliderA: Collider;
  colliderB: Collider;
  contacts: ContactPoint[];
}

export class NarrowPhase {
  /**
   * Detect precise contacts for a set of broad phase pairs
   */
  detect(pairs: { colliderA: Collider; colliderB: Collider }[]): CollisionPair[] {
    const results: CollisionPair[] = [];

    for (const pair of pairs) {
      const contacts = this.detectPair(pair.colliderA, pair.colliderB);
      if (contacts.length > 0) {
        results.push({
          colliderA: pair.colliderA,
          colliderB: pair.colliderB,
          contacts,
        });
      }
    }

    return results;
  }

  /**
   * Detect contacts between two colliders
   */
  detectPair(a: Collider, b: Collider): ContactPoint[] {
    const posA = a.getWorldCenter(new Vector3()); // approximate: use AABB center
    const posB = b.getWorldCenter(new Vector3());

    // Use center of AABB as world position approximation
    const centerA = a.aabbMin.clone().add(a.aabbMax).multiplyScalar(0.5);
    const centerB = b.aabbMin.clone().add(b.aabbMax).multiplyScalar(0.5);

    switch (a.shape) {
      case 'sphere':
        if (b.shape === 'sphere') return this.sphereVsSphere(a, b, centerA, centerB);
        if (b.shape === 'box') return this.sphereVsBox(a, b, centerA, centerB);
        if (b.shape === 'cylinder') return this.sphereVsCylinder(a, b, centerA, centerB);
        break;
      case 'box':
        if (b.shape === 'box') return this.boxVsBox(a, b, centerA, centerB);
        if (b.shape === 'sphere') {
          const contacts = this.sphereVsBox(b, a, centerB, centerA);
          // Flip normals
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        if (b.shape === 'cylinder') return this.boxVsCylinder(a, b, centerA, centerB);
        break;
      case 'cylinder':
        if (b.shape === 'sphere') {
          const contacts = this.sphereVsCylinder(b, a, centerB, centerA);
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        if (b.shape === 'box') {
          const contacts = this.boxVsCylinder(b, a, centerB, centerA);
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        break;
    }

    return [];
  }

  /**
   * Sphere vs Sphere collision
   */
  private sphereVsSphere(a: Collider, b: Collider, centerA: Vector3, centerB: Vector3): ContactPoint[] {
    const direction = new Vector3().subVectors(centerB, centerA);
    const distance = direction.length();
    const minDistance = a.radius + b.radius;

    if (distance >= minDistance) return [];

    direction.normalize();
    const contactPoint = centerA.clone().add(direction.clone().multiplyScalar(a.radius));
    const penetration = minDistance - distance;

    return [{
      point: contactPoint,
      normal: direction,
      depth: penetration,
    }];
  }

  /**
   * Sphere vs Box collision (using SAT-like approach)
   */
  private sphereVsBox(sphere: Collider, box: Collider, sphereCenter: Vector3, boxCenter: Vector3): ContactPoint[] {
    // Find closest point on box to sphere center
    const halfExtents = box.halfExtents;
    const localSphere = sphereCenter.clone().sub(boxCenter);

    // Clamp to box
    const closest = new Vector3(
      Math.max(-halfExtents.x, Math.min(halfExtents.x, localSphere.x)),
      Math.max(-halfExtents.y, Math.min(halfExtents.y, localSphere.y)),
      Math.max(-halfExtents.z, Math.min(halfExtents.z, localSphere.z)),
    );

    const diff = new Vector3().subVectors(localSphere, closest);
    const distance = diff.length();

    if (distance >= sphere.radius) return [];

    const normal = distance > 1e-6 ? diff.normalize() : new Vector3(0, 1, 0);
    const contactPoint = boxCenter.clone().add(closest);

    return [{
      point: contactPoint,
      normal,
      depth: sphere.radius - distance,
    }];
  }

  /**
   * Sphere vs Cylinder collision
   */
  private sphereVsCylinder(sphere: Collider, cylinder: Collider, sphereCenter: Vector3, cylCenter: Vector3): ContactPoint[] {
    const halfHeight = cylinder.height / 2;
    const localSphere = sphereCenter.clone().sub(cylCenter);

    // Clamp to cylinder volume
    const radialDist = Math.sqrt(localSphere.x * localSphere.x + localSphere.z * localSphere.z);
    const clampedRadial = Math.min(radialDist, cylinder.radius);
    const clampedY = Math.max(-halfHeight, Math.min(halfHeight, localSphere.y));

    // Closest point on cylinder
    let closestX, closestZ;
    if (radialDist > 1e-6) {
      closestX = (localSphere.x / radialDist) * clampedRadial;
      closestZ = (localSphere.z / radialDist) * clampedRadial;
    } else {
      closestX = 0;
      closestZ = 0;
    }

    const closest = new Vector3(closestX, clampedY, closestZ);
    const diff = new Vector3().subVectors(localSphere, closest);
    const distance = diff.length();

    if (distance >= sphere.radius) return [];

    const normal = distance > 1e-6 ? diff.normalize() : new Vector3(0, 1, 0);
    const contactPoint = cylCenter.clone().add(closest);

    return [{
      point: contactPoint,
      normal,
      depth: sphere.radius - distance,
    }];
  }

  /**
   * Box vs Box collision using SAT
   */
  private boxVsBox(a: Collider, b: Collider, centerA: Vector3, centerB: Vector3): ContactPoint[] {
    // Simplified SAT for axis-aligned boxes
    const heA = a.halfExtents;
    const heB = b.halfExtents;
    const diff = new Vector3().subVectors(centerB, centerA);

    // Test overlap on each axis
    const overlaps = [
      heA.x + heB.x - Math.abs(diff.x),
      heA.y + heB.y - Math.abs(diff.y),
      heA.z + heB.z - Math.abs(diff.z),
    ];

    // No overlap on any axis = no collision
    if (overlaps[0] <= 0 || overlaps[1] <= 0 || overlaps[2] <= 0) return [];

    // Find minimum overlap (penetration) axis
    let minOverlap = overlaps[0];
    let minAxis = 0;
    for (let i = 1; i < 3; i++) {
      if (overlaps[i] < minOverlap) {
        minOverlap = overlaps[i];
        minAxis = i;
      }
    }

    // Contact normal along minimum overlap axis
    const normal = new Vector3();
    if (minAxis === 0) normal.x = diff.x > 0 ? 1 : -1;
    else if (minAxis === 1) normal.y = diff.y > 0 ? 1 : -1;
    else normal.z = diff.z > 0 ? 1 : -1;

    // Contact point: center of overlap region
    const contactPoint = centerA.clone().add(centerB).multiplyScalar(0.5);

    return [{
      point: contactPoint,
      normal,
      depth: minOverlap,
    }];
  }

  /**
   * Box vs Cylinder collision (simplified)
   */
  private boxVsCylinder(box: Collider, cylinder: Collider, boxCenter: Vector3, cylCenter: Vector3): ContactPoint[] {
    // Treat cylinder as a box for simplicity (conservative)
    const cylHalfExtents = new Vector3(cylinder.radius, cylinder.height / 2, cylinder.radius);
    const pseudoCylinderCollider = new Collider({
      id: 'temp',
      shape: 'box',
      halfExtents: cylHalfExtents,
    });
    pseudoCylinderCollider.aabbMin.copy(cylinder.aabbMin);
    pseudoCylinderCollider.aabbMax.copy(cylinder.aabbMax);

    return this.boxVsBox(box, pseudoCylinderCollider, boxCenter, cylCenter);
  }
}

export default NarrowPhase;
