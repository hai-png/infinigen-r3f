/**
 * BroadPhase - Sweep-and-prune broad phase collision detection
 * Sorts colliders by AABB and finds overlapping pairs
 */
import { Vector3 } from 'three';
import { Collider } from '../Collider';

export interface BroadPhasePair {
  colliderA: Collider;
  colliderB: Collider;
}

export class BroadPhase {
  private sortedX: Collider[] = [];

  /**
   * Update the broad phase with current colliders
   */
  update(colliders: Collider[]): void {
    this.sortedX = [...colliders];
    // Sort by AABB min X coordinate (sweep-and-prune)
    this.sortedX.sort((a, b) => a.aabbMin.x - b.aabbMin.x);
  }

  /**
   * Find all potentially colliding pairs using sweep-and-prune
   */
  findPairs(): BroadPhasePair[] {
    const pairs: BroadPhasePair[] = [];
    const n = this.sortedX.length;

    for (let i = 0; i < n; i++) {
      const a = this.sortedX[i];

      for (let j = i + 1; j < n; j++) {
        const b = this.sortedX[j];

        // Early exit: if b's min X > a's max X, no more overlaps possible
        if (b.aabbMin.x > a.aabbMax.x) {
          break;
        }

        // Check layer mask
        if (!a.canCollideWith(b)) continue;

        // Check full AABB overlap (Y and Z axes)
        if (this.aabbOverlap(a, b)) {
          pairs.push({ colliderA: a, colliderB: b });
        }
      }
    }

    return pairs;
  }

  /**
   * Check if two AABBs overlap on all three axes
   */
  private aabbOverlap(a: Collider, b: Collider): boolean {
    return (
      a.aabbMin.x <= b.aabbMax.x && a.aabbMax.x >= b.aabbMin.x &&
      a.aabbMin.y <= b.aabbMax.y && a.aabbMax.y >= b.aabbMin.y &&
      a.aabbMin.z <= b.aabbMax.z && a.aabbMax.z >= b.aabbMin.z
    );
  }
}

export default BroadPhase;
