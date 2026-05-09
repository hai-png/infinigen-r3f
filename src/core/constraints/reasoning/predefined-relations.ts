/**
 * Predefined Relation Constants
 *
 * Ports: infinigen_examples/constraints/util.py
 *
 * Provides commonly-used relation presets for scene composition,
 * matching the original Infinigen's predefined placement patterns.
 *
 * These presets use the unified constraint system's Relation classes
 * with Tag-based subpart matching.
 */

import { TagSet } from '../unified/UnifiedConstraintSystem';
import {
  StableAgainstRelation,
  TouchingRelation,
  SupportedByRelation,
} from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Subpart Tag Sets
// ============================================================================

/** Bottom surface of an object */
export const bottom = new TagSet([new Tag('Bottom')]);

/** Top surface of an object */
export const top = new TagSet([new Tag('Top')]);

/** Front face of an object */
export const front = new TagSet([new Tag('Front')]);

/** Back face of an object */
export const back = new TagSet([new Tag('Back')]);

/** Side face of an object */
export const side = new TagSet([new Tag('Side')]);

/** Support surface (table top, shelf surface, etc.) */
export const supportSurface = new TagSet([new Tag('SupportSurface')]);

/** Visible surface */
export const visible = new TagSet([new Tag('Visible')]);

/** Floor tags */
export const floorTags = new TagSet([new Tag('Floor')]);

/** Wall tags */
export const wallTags = new TagSet([new Tag('Wall')]);

/** Ceiling tags */
export const ceilingTags = new TagSet([new Tag('Ceiling')]);

/** Left side */
export const left = new TagSet([new Tag('Left')]);

/** Right side */
export const right = new TagSet([new Tag('Right')]);

/** Interior surface */
export const interior = new TagSet([new Tag('Interior')]);

/** Exterior surface */
export const exterior = new TagSet([new Tag('Exterior')]);

/** Table surface */
export const tableSurface = new TagSet([new Tag('TableSurface')]);

/** Shelf surface */
export const shelfSurface = new TagSet([new Tag('ShelfSurface')]);

// ============================================================================
// Predefined Placement Patterns
// ============================================================================

/**
 * Object rests on the floor.
 * Child's bottom is against floor with small margin.
 */
export const onFloor = new StableAgainstRelation(bottom, floorTags, 0.01);

/**
 * Object's back is against a wall.
 * Standard wall distance with moderate margin.
 */
export const againstWall = new StableAgainstRelation(back, wallTags, 0.07);

/**
 * Object's back is flush against a wall.
 * Tight margin for objects that should be wall-mounted.
 */
export const flushWall = new StableAgainstRelation(back, wallTags, 0.02);

/**
 * Object's back is spaced away from a wall.
 * Large margin for objects that need space behind them.
 */
export const spacedWall = new StableAgainstRelation(back, wallTags, 0.8);

/**
 * Object hangs from the ceiling.
 * Child's top is against ceiling with small margin.
 */
export const hanging = new StableAgainstRelation(top, ceilingTags, 0.05);

/**
 * Object sits on top of a parent object.
 * Child's bottom is against parent's top surface.
 */
export const onTop = new StableAgainstRelation(bottom, top, 0.01);

/**
 * Object sits on a support surface.
 * Child's bottom is against parent's support surface.
 */
export const on = new StableAgainstRelation(bottom, supportSurface, 0.01);

/**
 * Object's front face is against parent's side.
 * Does not check Z-axis alignment.
 */
export const frontAgainst = new StableAgainstRelation(front, side, 0.01);

/**
 * Two objects face each other.
 * Front face against front face, not checking Z alignment.
 */
export const frontToFront = new StableAgainstRelation(front, front, 0.01);

/**
 * Two objects are back-to-back.
 */
export const backToBack = new StableAgainstRelation(back, back, 0.01);

/**
 * Object rests on a table surface.
 */
export const onTable = new StableAgainstRelation(bottom, tableSurface, 0.01);

/**
 * Object rests on a shelf surface.
 */
export const onShelf = new StableAgainstRelation(bottom, shelfSurface, 0.01);

/**
 * Object's left side is against parent.
 */
export const leftAgainst = new StableAgainstRelation(left, side, 0.01);

/**
 * Object's right side is against parent.
 */
export const rightAgainst = new StableAgainstRelation(right, side, 0.01);

// ============================================================================
// Helper: Tag class (imported from UnifiedConstraintSystem)
// ============================================================================

import { Tag } from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a custom StableAgainst relation with specified parameters.
 *
 * @param childTagName  Name of the child's contact surface tag
 * @param parentTagName Name of the parent's contact surface tag
 * @param margin        Maximum allowed gap
 * @returns A StableAgainstRelation configured with the given parameters
 */
export function createStableAgainst(
  childTagName: string,
  parentTagName: string,
  margin: number = 0.01
): StableAgainstRelation {
  return new StableAgainstRelation(
    new TagSet([new Tag(childTagName)]),
    new TagSet([new Tag(parentTagName)]),
    margin
  );
}

/**
 * Create a Touching relation with specified parameters.
 *
 * @param childTagName  Name of the child's contact surface tag
 * @param parentTagName Name of the parent's contact surface tag
 * @param threshold     Maximum distance to consider "touching"
 * @returns A TouchingRelation configured with the given parameters
 */
export function createTouching(
  childTagName: string,
  parentTagName: string,
  threshold: number = 0.01
): TouchingRelation {
  return new TouchingRelation(
    new TagSet([new Tag(childTagName)]),
    new TagSet([new Tag(parentTagName)]),
    threshold
  );
}

/**
 * Create a SupportedBy relation with specified parameters.
 *
 * @param childTagName  Name of the child's contact surface tag
 * @param parentTagName Name of the parent's support surface tag
 * @param tolerance     Vertical tolerance
 * @returns A SupportedByRelation configured with the given parameters
 */
export function createSupportedBy(
  childTagName: string,
  parentTagName: string,
  tolerance: number = 0.1
): SupportedByRelation {
  return new SupportedByRelation(
    new TagSet([new Tag(childTagName)]),
    new TagSet([new Tag(parentTagName)]),
    tolerance
  );
}

/**
 * Get all predefined relations as a map.
 *
 * @returns Map of relation name → Relation instance
 */
export function getPredefinedRelations(): Record<string, StableAgainstRelation> {
  return {
    onFloor,
    againstWall,
    flushWall,
    spacedWall,
    hanging,
    onTop,
    on,
    frontAgainst,
    frontToFront,
    backToBack,
    onTable,
    onShelf,
    leftAgainst,
    rightAgainst,
  };
}
