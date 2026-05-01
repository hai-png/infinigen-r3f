/**
 * ContactGeneration - Generates contact data between colliders
 * Helper module for the narrow phase
 */
import { Vector3 } from 'three';
import { Collider } from '../Collider';
import { ContactPoint } from './NarrowPhase';

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

export default { generateContacts };
