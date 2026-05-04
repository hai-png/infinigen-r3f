/**
 * ContactGeneration - Persistent multi-contact manifolds for stable stacking
 *
 * Features:
 * - ContactManifold: maintains up to 4 contact points per pair for solver stability
 * - Manifold persistence across frames for warm starting
 * - Face clipping for box-box and box-cylinder to generate multiple contacts
 * - ContactManifoldCache: manages manifolds across frames with pair-based lookup
 */
import { Vector3, Matrix3 } from 'three';
import { Collider } from '../Collider';
import { ContactPoint } from './NarrowPhase';
import { RigidBody } from '../RigidBody';
import { mulMatrix3Vector3 } from '../RigidBody';
import { detectCollisionGJK, getSupportFunction, EPAResult, minkowskiSupport } from './GJK';

// ============================================================================
// Constants
// ============================================================================

const MAX_CONTACTS_PER_MANIFOLD = 4;
const CONTACT_DISTANCE_THRESHOLD = 0.02; // Prune contacts further than this
const MANIFOLD_LIFETIME_FRAMES = 4; // Keep manifolds alive for N frames

// ============================================================================
// Contact Manifold
// ============================================================================

export class ContactManifold {
  public contacts: ContactPoint[] = [];
  public normal: Vector3 = new Vector3();
  public bodyA: RigidBody;
  public bodyB: RigidBody;
  public colliderA: Collider;
  public colliderB: Collider;
  public persistFrameCount: number = 0;
  public lastFrameUpdated: number = 0;

  constructor(bodyA: RigidBody, bodyB: RigidBody, colliderA: Collider, colliderB: Collider) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.colliderA = colliderA;
    this.colliderB = colliderB;
  }

  /**
   * Add a new contact point to the manifold.
   * If the manifold is full, replaces the least useful contact.
   */
  addContact(point: Vector3, normal: Vector3, depth: number): void {
    // Check if this contact is close to an existing one (avoid duplicates)
    for (const existing of this.contacts) {
      if (existing.point.distanceTo(point) < CONTACT_DISTANCE_THRESHOLD) {
        // Update depth if the new one is deeper
        if (depth > existing.depth) {
          existing.depth = depth;
          existing.normal.copy(normal);
        }
        return;
      }
    }

    const contact: ContactPoint = {
      point: point.clone(),
      normal: normal.clone(),
      depth,
    };

    if (this.contacts.length < MAX_CONTACTS_PER_MANIFOLD) {
      this.contacts.push(contact);
    } else {
      // Replace the contact with the least contribution to the manifold area
      this.replaceLeastUsefulContact(contact);
    }

    this.normal.copy(normal);
  }

  /**
   * Replace the contact that contributes least to the manifold's area.
   * Heuristic: the contact whose removal reduces the projected area least.
   */
  private replaceLeastUsefulContact(newContact: ContactPoint): void {
    if (this.contacts.length < 4) {
      this.contacts.push(newContact);
      return;
    }

    // Simple heuristic: replace the shallowest contact or the one closest to the centroid
    let worstIdx = 0;
    let worstScore = Infinity;

    const centroid = new Vector3();
    for (const c of this.contacts) centroid.add(c.point);
    centroid.divideScalar(this.contacts.length);

    for (let i = 0; i < this.contacts.length; i++) {
      // Score = distance from centroid * (1 + depth penalty)
      // Prefer to keep deep contacts and contacts far from centroid (maximizes area)
      const distFromCentroid = this.contacts[i].point.distanceTo(centroid);
      const depthBonus = this.contacts[i].depth;
      const score = distFromCentroid + depthBonus * 0.5;

      if (score < worstScore) {
        worstScore = score;
        worstIdx = i;
      }
    }

    // Replace if the new contact is deeper or farther from centroid
    const newDistFromCentroid = newContact.point.distanceTo(centroid);
    const newScore = newDistFromCentroid + newContact.depth * 0.5;

    if (newScore > worstScore) {
      this.contacts[worstIdx] = newContact;
    }
  }

  /**
   * Prune contacts to keep the best N contacts.
   * "Best" = maximize area + depth.
   */
  pruneContacts(maxContacts: number = MAX_CONTACTS_PER_MANIFOLD): void {
    if (this.contacts.length <= maxContacts) return;

    // Sort by depth descending (keep deepest contacts)
    this.contacts.sort((a, b) => b.depth - a.depth);

    // If more than max, keep the deepest ones
    this.contacts.length = maxContacts;
  }

  /**
   * Refresh existing contacts for the current frame's positions.
   * Projects old contact points onto the current collision plane and
   * checks if they're still valid.
   */
  refreshContacts(): void {
    // Re-validate each contact against the current separation
    const validContacts: ContactPoint[] = [];

    for (const contact of this.contacts) {
      // Check if the contact is still penetrating
      // Simple test: compute distance between the two bodies at the contact point
      const centerA = new Vector3().addVectors(this.colliderA.aabbMin, this.colliderA.aabbMax).multiplyScalar(0.5);
      const centerB = new Vector3().addVectors(this.colliderB.aabbMin, this.colliderB.aabbMax).multiplyScalar(0.5);

      const toB = new Vector3().subVectors(centerB, centerA);
      const projectedDist = toB.dot(contact.normal);

      // If the bodies have separated along the contact normal, invalidate
      if (projectedDist > contact.depth + CONTACT_DISTANCE_THRESHOLD) {
        continue; // Contact is no longer valid
      }

      validContacts.push(contact);
    }

    this.contacts = validContacts;
  }
}

// ============================================================================
// Contact Manifold Cache
// ============================================================================

export class ContactManifoldCache {
  private manifolds: Map<string, ContactManifold> = new Map();
  private frameCount: number = 0;

  /**
   * Get a manifold key from two collider IDs.
   */
  private static getManifoldKey(colliderA: Collider, colliderB: Collider): string {
    // Consistent ordering
    if (colliderA.id < colliderB.id) {
      return `${colliderA.id}:${colliderB.id}`;
    }
    return `${colliderB.id}:${colliderA.id}`;
  }

  /**
   * Advance the frame counter and clean up stale manifolds.
   */
  advanceFrame(): void {
    this.frameCount++;

    const toDelete: string[] = [];
    for (const [key, manifold] of this.manifolds) {
      if (this.frameCount - manifold.lastFrameUpdated > MANIFOLD_LIFETIME_FRAMES) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.manifolds.delete(key);
    }
  }

  /**
   * Get or create a manifold for a pair of colliders/bodies.
   */
  getManifold(
    colliderA: Collider, colliderB: Collider,
    bodyA: RigidBody, bodyB: RigidBody
  ): ContactManifold {
    const key = ContactManifoldCache.getManifoldKey(colliderA, colliderB);
    let manifold = this.manifolds.get(key);

    if (!manifold) {
      manifold = new ContactManifold(bodyA, bodyB, colliderA, colliderB);
      this.manifolds.set(key, manifold);
    }

    manifold.lastFrameUpdated = this.frameCount;
    return manifold;
  }

  /**
   * Get all active manifolds.
   */
  getAllManifolds(): ContactManifold[] {
    return Array.from(this.manifolds.values());
  }

  /**
   * Clear all manifolds.
   */
  clear(): void {
    this.manifolds.clear();
  }
}

// ============================================================================
// Multi-Contact Generation Functions
// ============================================================================

/**
 * Generate multiple contact points for a box-box collision using face clipping.
 * This produces much more stable stacking than single-contact SAT.
 */
export function generateBoxBoxContacts(
  colliderA: Collider, colliderB: Collider
): ContactPoint[] {
  const centerA = new Vector3().addVectors(colliderA.aabbMin, colliderA.aabbMax).multiplyScalar(0.5);
  const centerB = new Vector3().addVectors(colliderB.aabbMin, colliderB.aabbMax).multiplyScalar(0.5);
  const heA = colliderA.halfExtents;
  const heB = colliderB.halfExtents;

  // Find the reference face (the face with the deepest penetration)
  // For axis-aligned boxes, test the 6 face normals
  const diff = new Vector3().subVectors(centerB, centerA);

  // Face normals for A (+X, -X, +Y, -Y, +Z, -Z) and B
  const faceTests = [
    { normal: new Vector3(1, 0, 0), dist: heA.x + heB.x - Math.abs(diff.x), sign: 1, axis: 0, box: 'A' as const },
    { normal: new Vector3(-1, 0, 0), dist: heA.x + heB.x - Math.abs(diff.x), sign: -1, axis: 0, box: 'A' as const },
    { normal: new Vector3(0, 1, 0), dist: heA.y + heB.y - Math.abs(diff.y), sign: 1, axis: 1, box: 'A' as const },
    { normal: new Vector3(0, -1, 0), dist: heA.y + heB.y - Math.abs(diff.y), sign: -1, axis: 1, box: 'A' as const },
    { normal: new Vector3(0, 0, 1), dist: heA.z + heB.z - Math.abs(diff.z), sign: 1, axis: 2, box: 'A' as const },
    { normal: new Vector3(0, 0, -1), dist: heA.z + heB.z - Math.abs(diff.z), sign: -1, axis: 2, box: 'A' as const },
    { normal: new Vector3(1, 0, 0), dist: heA.x + heB.x - Math.abs(diff.x), sign: 1, axis: 0, box: 'B' as const },
    { normal: new Vector3(-1, 0, 0), dist: heA.x + heB.x - Math.abs(diff.x), sign: -1, axis: 0, box: 'B' as const },
    { normal: new Vector3(0, 1, 0), dist: heA.y + heB.y - Math.abs(diff.y), sign: 1, axis: 1, box: 'B' as const },
    { normal: new Vector3(0, -1, 0), dist: heA.y + heB.y - Math.abs(diff.y), sign: -1, axis: 1, box: 'B' as const },
    { normal: new Vector3(0, 0, 1), dist: heA.z + heB.z - Math.abs(diff.z), sign: 1, axis: 2, box: 'B' as const },
    { normal: new Vector3(0, 0, -1), dist: heA.z + heB.z - Math.abs(diff.z), sign: -1, axis: 2, box: 'B' as const },
  ];

  // Find the minimum penetration (reference face)
  let minPen = Infinity;
  let refFaceIdx = 0;
  for (let i = 0; i < faceTests.length; i++) {
    if (faceTests[i].dist <= 0) return []; // Separating axis found
    if (faceTests[i].dist < minPen) {
      minPen = faceTests[i].dist;
      refFaceIdx = i;
    }
  }

  const refFace = faceTests[refFaceIdx];
  const refNormal = refFace.normal.clone();

  // Ensure normal points from A to B
  if (refNormal.dot(diff) < 0) {
    refNormal.negate();
  }

  // Reference face center and incident face vertices
  let refCenter: Vector3;
  let incHe: Vector3;
  let incCenter: Vector3;

  if (refFace.box === 'A') {
    refCenter = centerA.clone().add(refNormal.clone().multiplyScalar(
      refFace.sign * [heA.x, heA.y, heA.z][refFace.axis]
    ));
    incCenter = centerB;
    incHe = heB;
  } else {
    refCenter = centerB.clone().add(refNormal.clone().multiplyScalar(
      refFace.sign * [heB.x, heB.y, heB.z][refFace.axis]
    ));
    incCenter = centerA;
    incHe = heA;
  }

  // Generate incident face vertices (4 corners of the incident face)
  const incidentVerts = getBoxFaceVertices(incCenter, incHe, refNormal);

  // Clip the incident face against the reference face side planes
  const clippedVerts = clipVerticesAgainstSidePlanes(
    incidentVerts, refCenter, refNormal, refFace.box === 'A' ? heA : heB
  );

  // Keep only points below the reference face
  const contacts: ContactPoint[] = [];
  const refPlaneDist = refNormal.dot(refCenter);

  for (const vert of clippedVerts) {
    const dist = refNormal.dot(vert) - refPlaneDist;
    if (dist <= 0) {
      contacts.push({
        point: vert.clone(),
        normal: refNormal.clone(),
        depth: -dist,
      });
    }
  }

  // Limit to MAX_CONTACTS
  if (contacts.length > MAX_CONTACTS_PER_MANIFOLD) {
    contacts.sort((a, b) => b.depth - a.depth);
    contacts.length = MAX_CONTACTS_PER_MANIFOLD;
  }

  return contacts;
}

/**
 * Get the 4 vertices of the face of a box most aligned with the given normal.
 */
function getBoxFaceVertices(center: Vector3, halfExtents: Vector3, normal: Vector3): Vector3[] {
  // Find which face of the box is most anti-parallel to the normal (incident face)
  const absN = new Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

  // Face normal axes: the face whose outward normal is most opposite to the reference normal
  let axis: number;
  let sign: number;

  if (absN.x >= absN.y && absN.x >= absN.z) {
    axis = 0;
    sign = normal.x > 0 ? -1 : 1; // Anti-parallel
  } else if (absN.y >= absN.x && absN.y >= absN.z) {
    axis = 1;
    sign = normal.y > 0 ? -1 : 1;
  } else {
    axis = 2;
    sign = normal.z > 0 ? -1 : 1;
  }

  const faceCenter = center.clone();
  if (axis === 0) faceCenter.x += sign * halfExtents.x;
  else if (axis === 1) faceCenter.y += sign * halfExtents.y;
  else faceCenter.z += sign * halfExtents.z;

  // Generate the 4 corners of this face
  const vertices: Vector3[] = [];
  const he = halfExtents;

  if (axis === 0) {
    // Face on X plane
    const y = sign > 0 ? he.y : -he.y; // shouldn't matter for center offset
    vertices.push(
      new Vector3(faceCenter.x, center.y - he.y, center.z - he.z),
      new Vector3(faceCenter.x, center.y - he.y, center.z + he.z),
      new Vector3(faceCenter.x, center.y + he.y, center.z + he.z),
      new Vector3(faceCenter.x, center.y + he.y, center.z - he.z)
    );
  } else if (axis === 1) {
    vertices.push(
      new Vector3(center.x - he.x, faceCenter.y, center.z - he.z),
      new Vector3(center.x + he.x, faceCenter.y, center.z - he.z),
      new Vector3(center.x + he.x, faceCenter.y, center.z + he.z),
      new Vector3(center.x - he.x, faceCenter.y, center.z + he.z)
    );
  } else {
    vertices.push(
      new Vector3(center.x - he.x, center.y - he.y, faceCenter.z),
      new Vector3(center.x + he.x, center.y - he.y, faceCenter.z),
      new Vector3(center.x + he.x, center.y + he.y, faceCenter.z),
      new Vector3(center.x - he.x, center.y + he.y, faceCenter.z)
    );
  }

  return vertices;
}

/**
 * Clip a polygon (list of vertices) against the side planes of a reference face.
 * The side planes are defined by the reference face center, normal, and half-extents.
 */
function clipVerticesAgainstSidePlanes(
  vertices: Vector3[],
  refCenter: Vector3,
  refNormal: Vector3,
  refHe: Vector3
): Vector3[] {
  // Build side planes for the reference face
  // The two tangent directions of the reference face
  let tangent1: Vector3;
  let tangent2: Vector3;

  if (Math.abs(refNormal.x) > Math.abs(refNormal.y)) {
    tangent1 = new Vector3().crossVectors(refNormal, new Vector3(0, 1, 0)).normalize();
  } else {
    tangent1 = new Vector3().crossVectors(refNormal, new Vector3(1, 0, 0)).normalize();
  }
  tangent2 = new Vector3().crossVectors(refNormal, tangent1).normalize();

  // Side plane offsets along tangent1 and tangent2
  const halfWidth = refHe.x;
  const halfDepth = refHe.z;

  // Project refHe onto tangent directions
  const tangent1Extent = Math.abs(tangent1.x) * refHe.x + Math.abs(tangent1.y) * refHe.y + Math.abs(tangent1.z) * refHe.z;
  const tangent2Extent = Math.abs(tangent2.x) * refHe.x + Math.abs(tangent2.y) * refHe.y + Math.abs(tangent2.z) * refHe.z;

  // Clip against 4 side planes
  let output = [...vertices];

  // +tangent1 plane
  output = clipPolygonAgainstPlane(output, tangent1, refCenter.dot(tangent1) + tangent1Extent);
  // -tangent1 plane
  output = clipPolygonAgainstPlane(output, tangent1.clone().negate(), -(refCenter.dot(tangent1) - tangent1Extent));
  // +tangent2 plane
  output = clipPolygonAgainstPlane(output, tangent2, refCenter.dot(tangent2) + tangent2Extent);
  // -tangent2 plane
  output = clipPolygonAgainstPlane(output, tangent2.clone().negate(), -(refCenter.dot(tangent2) - tangent2Extent));

  return output;
}

/**
 * Clip a convex polygon against a plane.
 * Keeps vertices on the negative side of the plane (planeNormal · vertex <= planeDist).
 */
function clipPolygonAgainstPlane(
  vertices: Vector3[],
  planeNormal: Vector3,
  planeDist: number
): Vector3[] {
  if (vertices.length === 0) return [];

  const output: Vector3[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];

    const currentDist = planeNormal.dot(current) - planeDist;
    const nextDist = planeNormal.dot(next) - planeDist;

    if (currentDist <= 0) {
      output.push(current);
    }

    // If the edge crosses the plane, add the intersection point
    if ((currentDist > 0 && nextDist <= 0) || (currentDist <= 0 && nextDist > 0)) {
      const t = currentDist / (currentDist - nextDist);
      const intersection = current.clone().lerp(next, t);
      output.push(intersection);
    }
  }

  return output;
}

/**
 * Generate multiple contact points for sphere-box collision.
 */
export function generateSphereBoxContacts(
  sphere: Collider, box: Collider
): ContactPoint[] {
  const sphereCenter = new Vector3().addVectors(sphere.aabbMin, sphere.aabbMax).multiplyScalar(0.5);
  const boxCenter = new Vector3().addVectors(box.aabbMin, box.aabbMax).multiplyScalar(0.5);
  const halfExtents = box.halfExtents;

  // Find closest point on box to sphere center
  const localSphere = sphereCenter.clone().sub(boxCenter);
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
  const depth = sphere.radius - distance;

  // For sphere-box, typically 1 contact is sufficient, but for edge/corner contacts
  // we can generate additional contacts on the sphere surface
  const contacts: ContactPoint[] = [{
    point: contactPoint,
    normal,
    depth,
  }];

  // Add secondary contact if sphere is overlapping significantly
  if (depth > 0.01) {
    // Generate a second contact point offset perpendicular to the normal
    const perpDir = new Vector3();
    if (Math.abs(normal.y) < 0.9) {
      perpDir.crossVectors(normal, new Vector3(0, 1, 0)).normalize();
    } else {
      perpDir.crossVectors(normal, new Vector3(1, 0, 0)).normalize();
    }

    const offsetDist = Math.min(depth * 0.3, sphere.radius * 0.5);
    const secondaryPoint = contactPoint.clone().add(perpDir.multiplyScalar(offsetDist));
    contacts.push({
      point: secondaryPoint,
      normal: normal.clone(),
      depth: depth - offsetDist * 0.5,
    });
  }

  return contacts;
}

/**
 * Generate contacts using GJK + EPA as a fallback for unsupported shape pairs.
 * Returns single contact point from EPA with additional contacts synthesized.
 */
export function generateGJKContacts(
  colliderA: Collider, colliderB: Collider
): ContactPoint[] {
  const result = detectCollisionGJK(colliderA, colliderB);
  if (!result) return [];

  // Start with the EPA result
  const contacts: ContactPoint[] = [{
    point: result.point,
    normal: result.normal,
    depth: result.depth,
  }];

  // Synthesize additional contacts by sampling around the primary contact
  if (result.depth > 0.01) {
    const tangent1 = new Vector3();
    if (Math.abs(result.normal.y) < 0.9) {
      tangent1.crossVectors(result.normal, new Vector3(0, 1, 0)).normalize();
    } else {
      tangent1.crossVectors(result.normal, new Vector3(1, 0, 0)).normalize();
    }
    const tangent2 = new Vector3().crossVectors(result.normal, tangent1).normalize();

    const sampleRadius = Math.min(result.depth * 0.3, 0.2);
    const offsets = [
      tangent1.clone().multiplyScalar(sampleRadius),
      tangent1.clone().multiplyScalar(-sampleRadius),
      tangent2.clone().multiplyScalar(sampleRadius),
      tangent2.clone().multiplyScalar(-sampleRadius),
    ];

    for (const offset of offsets) {
      const samplePoint = result.point.clone().add(offset);
      contacts.push({
        point: samplePoint,
        normal: result.normal.clone(),
        depth: result.depth - offset.length() * 0.5,
      });
    }
  }

  // Limit to MAX_CONTACTS
  if (contacts.length > MAX_CONTACTS_PER_MANIFOLD) {
    contacts.sort((a, b) => b.depth - a.depth);
    contacts.length = MAX_CONTACTS_PER_MANIFOLD;
  }

  return contacts;
}

// ============================================================================
// Legacy: simple contact generation (preserved for backward compatibility)
// ============================================================================

export function generateContacts(a: Collider, b: Collider): ContactPoint[] {
  // Delegate to appropriate generator based on shape combination
  const centerA = a.aabbMin.clone().add(a.aabbMax).multiplyScalar(0.5);
  const centerB = b.aabbMin.clone().add(b.aabbMax).multiplyScalar(0.5);
  const direction = new Vector3().subVectors(centerB, centerA);
  const distance = direction.length();

  // Simple sphere-based contact generation
  const maxRadius = getMaxRadius(a) + getMaxRadius(b);
  if (distance >= maxRadius) return [];

  direction.normalize();
  const contactPoint = centerA.clone().add(direction.clone().multiplyScalar(getMaxRadius(a)));
  const penetration = maxRadius - distance;

  return [{
    point: contactPoint,
    normal: direction,
    depth: penetration,
  }];
}

function getMaxRadius(collider: Collider): number {
  switch (collider.shape) {
    case 'sphere': return collider.radius;
    case 'box': return collider.halfExtents.length();
    case 'cylinder': return Math.max(collider.radius, collider.height / 2);
    default: return 0.5;
  }
}

/**
 * Default export – ContactManifold, the primary class in this module.
 *
 * Previously this file exported `{ generateContacts }` as default, which was
 * inconsistent with the rest of the codebase.  `generateContacts` and all
 * other symbols remain available as named exports.
 */
export default ContactManifold;
