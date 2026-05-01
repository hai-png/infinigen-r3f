/**
 * Collider - Collision shapes for physics bodies
 * Supports box, sphere, and cylinder shapes
 */
import { Vector3, Matrix4 } from 'three';

export type ColliderShape = 'box' | 'sphere' | 'cylinder';

export interface ColliderConfig {
  id: string;
  shape: ColliderShape;
  /** Half-extents for box */
  halfExtents?: Vector3;
  /** Radius for sphere, cylinder */
  radius?: number;
  /** Height for cylinder */
  height?: number;
  /** Local offset from body position */
  offset?: Vector3;
  /** Collision layer bits */
  collisionLayers?: number;
  /** Collision mask bits */
  collisionMask?: number;
  /** Is this a trigger (no physical response) */
  isTrigger?: boolean;
  /** Friction coefficient */
  friction?: number;
  /** Restitution (bounciness) */
  restitution?: number;
}

export class Collider {
  public id: string;
  public shape: ColliderShape;
  public halfExtents: Vector3;
  public radius: number;
  public height: number;
  public offset: Vector3;
  public collisionLayers: number;
  public collisionMask: number;
  public isTrigger: boolean;
  public friction: number;
  public restitution: number;

  // World-space AABB (computed during broadphase)
  public aabbMin: Vector3 = new Vector3();
  public aabbMax: Vector3 = new Vector3();

  // Reference to the body this collider is attached to
  public bodyId: string | null = null;

  constructor(config: ColliderConfig) {
    this.id = config.id;
    this.shape = config.shape;
    this.halfExtents = config.halfExtents?.clone() || new Vector3(0.5, 0.5, 0.5);
    this.radius = config.radius ?? 0.5;
    this.height = config.height ?? 1.0;
    this.offset = config.offset?.clone() || new Vector3();
    this.collisionLayers = config.collisionLayers ?? 0x1;
    this.collisionMask = config.collisionMask ?? 0xFFFFFFFF;
    this.isTrigger = config.isTrigger ?? false;
    this.friction = config.friction ?? 0.5;
    this.restitution = config.restitution ?? 0.3;
  }

  /**
   * Update the AABB based on the body's world transform
   */
  updateAABB(position: Vector3, rotation: Matrix4): void {
    const worldPos = position.clone().add(this.offset);

    switch (this.shape) {
      case 'box': {
        // Conservative AABB: use max half-extent for rotation
        const maxExtent = Math.max(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z);
        this.aabbMin.set(worldPos.x - maxExtent, worldPos.y - maxExtent, worldPos.z - maxExtent);
        this.aabbMax.set(worldPos.x + maxExtent, worldPos.y + maxExtent, worldPos.z + maxExtent);
        break;
      }
      case 'sphere': {
        this.aabbMin.set(worldPos.x - this.radius, worldPos.y - this.radius, worldPos.z - this.radius);
        this.aabbMax.set(worldPos.x + this.radius, worldPos.y + this.radius, worldPos.z + this.radius);
        break;
      }
      case 'cylinder': {
        const halfH = this.height / 2;
        const r = this.radius;
        this.aabbMin.set(worldPos.x - r, worldPos.y - halfH, worldPos.z - r);
        this.aabbMax.set(worldPos.x + r, worldPos.y + halfH, worldPos.z + r);
        break;
      }
    }
  }

  /**
   * Get the world-space center of the collider
   */
  getWorldCenter(position: Vector3): Vector3 {
    return position.clone().add(this.offset);
  }

  /**
   * Check if this collider can collide with another based on layer masks
   */
  canCollideWith(other: Collider): boolean {
    if (this.isTrigger && other.isTrigger) return false;
    return (this.collisionLayers & other.collisionMask) !== 0 &&
           (other.collisionLayers & this.collisionMask) !== 0;
  }
}

export default Collider;
