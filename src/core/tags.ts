/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 * 
 * Authors: Ported from Python InfiniGen
 * - Alexander Raistrick (original Python author)
 */

import Generator from './generator';

/**
 * Tag system for semantic labeling of geometry
 * Based on original InfiniGen tags.py
 */

/**
 * Base Tag class
 */
export abstract class Tag {
  /**
   * Returns negated version of this tag
   */
  negate(): Tag {
    return new NegatedTag(this);
  }
}

/**
 * String-based tag
 */
export class StringTag extends Tag {
  constructor(public desc: string) {
    super();
  }
}

/**
 * Semantic tags for object classification
 * Ported from Python Semantics EnumTag
 */
export enum Semantics {
  // Mesh types
  Room = 'room',
  Object = 'object',
  Cutter = 'cutter',

  // Room types
  Kitchen = 'kitchen',
  Bedroom = 'bedroom',
  LivingRoom = 'living-room',
  Closet = 'closet',
  Hallway = 'hallway',
  Bathroom = 'bathroom',
  Garage = 'garage',
  Balcony = 'balcony',
  DiningRoom = 'dining-room',
  Utility = 'utility',
  StaircaseRoom = 'staircase-room',
  Warehouse = 'warehouse',
  Office = 'office',
  MeetingRoom = 'meeting-room',
  OpenOffice = 'open-office',
  BreakRoom = 'break-room',
  Restroom = 'restroom',
  FactoryOffice = 'factory-office',

  Root = 'root',
  New = 'new',
  RoomNode = 'room-node',
  GroundFloor = 'ground',
  SecondFloor = 'second-floor',
  ThirdFloor = 'third-floor',
  Exterior = 'exterior',
  Staircase = 'staircase',
  Visited = 'visited',
  RoomContour = 'room-contour',

  // Object types
  Furniture = 'furniture',
  FloorMat = 'FloorMat',
  WallDecoration = 'wall-decoration',
  HandheldItem = 'handheld-item',

  // Furniture functions
  Storage = 'storage',
  Seating = 'seating',
  LoungeSeating = 'lounge-seating',
  Table = 'table',
  Bathing = 'bathing',
  SideTable = 'side-table',
  Watchable = 'watchable',
  Desk = 'desk',
  Bed = 'bed',
  Sink = 'sink',
  CeilingLight = 'ceiling-light',
  Lighting = 'lighting',
  KitchenCounter = 'kitchen-counter',
  KitchenAppliance = 'kitchen-appliance',

  // Small Object Functions
  TableDisplayItem = 'table-display-item',
  OfficeShelfItem = 'office-shelf-item',
  KitchenCounterItem = 'kitchen-counter-item',
  FoodPantryItem = 'food-pantry',
  BathroomItem = 'bathroom-item',
  ShelfTrinket = 'shelf-trinket',
  Dishware = 'dishware',
  Cookware = 'cookware',
  Utensils = 'utensils',
  ClothDrapeItem = 'cloth-drape',

  // Object Access Type
  AccessTop = 'access-top',
  AccessFront = 'access-front',
  AccessAnySide = 'access-any-side',
  AccessAllSides = 'access-all-sides',

  // Object Access Method
  AccessStandingNear = 'access-stand-near',
  AccessSit = 'access-stand-near',
  AccessOpenDoor = 'access-open-door',
  AccessHand = 'access-with-hand',

  // Special Case Objects
  Chair = 'chair',
  Window = 'window',
  Open = 'open',
  Entrance = 'entrance',
  Door = 'door',

  // Solver feature flags - Per-Asset Behavior Config
  RealPlaceholder = 'real-placeholder',
  OversizePlaceholder = 'oversize-placeholder',
  AssetAsPlaceholder = 'asset-as-placeholder',
  AssetPlaceholderForChildren = 'asset-placeholder-for-children',
  PlaceholderBBox = 'placeholder-bbox',
  SingleGenerator = 'single-generator',
  NoRotation = 'no-rotation',
  NoCollision = 'no-collision',
  NoChildren = 'no-children',
}

/**
 * Subpart tags for geometry regions
 */
export enum Subpart {
  SupportSurface = 'support',
  Interior = 'interior',
  Visible = 'visible',
  Bottom = 'bottom',
  Top = 'top',
  Side = 'side',
  Back = 'back',
  Front = 'front',
  Ceiling = 'ceiling',
  Wall = 'wall',
  StaircaseWall = 'staircase-wall',
}

/**
 * Tag indicating geometry comes from a specific generator
 */
export class FromGeneratorTag extends Tag {
  constructor(public generatorName: string) {
    super();
  }

  toString(): string {
    return `FromGenerator(${this.generatorName})`;
  }
}

/**
 * Negated tag wrapper
 */
export class NegatedTag extends Tag {
  constructor(public tag: Tag) {
    super();
    if (tag instanceof NegatedTag) {
      throw new Error('Cannot construct double negative tags');
    }
  }

  toString(): string {
    return `-${this.tag.toString()}`;
  }

  /**
   * Double negation returns original tag
   */
  negate(): Tag {
    return this.tag;
  }
}

/**
 * Variable tag for dynamic tagging
 */
export class VariableTag extends Tag {
  constructor(public name: string) {
    super();
    if (typeof name !== 'string') {
      throw new Error('Variable tag name must be a string');
    }
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Specific object tag
 */
export class SpecificObjectTag extends Tag {
  constructor(public name: string) {
    super();
  }
}

/**
 * Decompose tags into positive and negative sets
 */
export function decomposeTags(tags: Set<Tag>): { positive: Set<Tag>; negative: Set<Tag> } {
  const positive = new Set<Tag>();
  const negative = new Set<Tag>();

  for (const tag of tags) {
    if (tag instanceof NegatedTag) {
      negative.add(tag.tag);
    } else {
      positive.add(tag);
    }
  }

  return { positive, negative };
}

/**
 * Check if a set of tags contains a contradiction
 */
export function hasContradiction(tags: Set<Tag>): boolean {
  const { positive, negative } = decomposeTags(tags);

  // Check for direct contradictions
  for (const posTag of positive) {
    if (negative.has(posTag)) {
      return true;
    }
  }

  // Check for multiple FromGenerator tags
  const fromGeneratorCount = Array.from(tags).filter(
    (t) => t instanceof FromGeneratorTag
  ).length;
  if (fromGeneratorCount > 1) {
    return true;
  }

  // Check for multiple SpecificObject or Variable tags
  const specificCount = Array.from(tags).filter(
    (t) => t instanceof SpecificObjectTag || t instanceof VariableTag
  ).length;
  if (specificCount > 1) {
    return true;
  }

  return false;
}

/**
 * Check if tags t1 implies tags t2
 */
export function implies(t1: Set<Tag>, t2: Set<Tag>): boolean {
  const { positive: p1, negative: n1 } = decomposeTags(t1);
  const { positive: p2, negative: n2 } = decomposeTags(t2);

  return !hasContradiction(t1) && isSuperset(p1, p2) && isSuperset(n1, n2);
}

/**
 * Check if tags t1 satisfies tags t2
 */
export function satisfies(t1: Set<Tag>, t2: Set<Tag>): boolean {
  const { positive: p1, negative: n1 } = decomposeTags(t1);
  const { positive: p2, negative: n2 } = decomposeTags(t2);

  return isSuperset(p1, p2) && !setsIntersect(n1, p2) && !setsIntersect(n2, p1);
}

/**
 * Return the difference between two tag sets
 */
export function tagDifference(t1: Set<Tag>, t2: Set<Tag>): Set<Tag> {
  const { positive: p1, negative: n1 } = decomposeTags(t1);
  const { positive: p2, negative: n2 } = decomposeTags(t2);

  const pos = new Set<Tag>([...p1, ...setDifference(n2, n1)]);
  const neg = setDifference(n1, p2);

  const result = new Set<Tag>(pos);
  for (const n of neg) {
    result.add(new NegatedTag(n) as Tag);
  }

  return result;
}

/**
 * Convert various inputs to a Tag
 */
export function toTag(s: string | Tag | { name: string }, facContext?: Map<{ name: string }, any>): Tag {
  if (s instanceof Tag) {
    return s;
  }

  if (typeof s === 'object' && 'name' in s && typeof s.name === 'string') {
    if (!facContext) {
      throw new Error(`toTag got ${s.name} but no facContext provided`);
    }
    if (!facContext.has(s as any)) {
      throw new Error(`toTag got ${s.name} but it was not in facContext`);
    }
    return new FromGeneratorTag((s as any).name);
  }

  if (typeof s === 'string') {
    s = s.trim().replace(/^["']|["']$/g, '');

    if (s.startsWith('-')) {
      return new NegatedTag(toTag(s.substring(1), facContext));
    }

    // Try to match with Semantics enum
    if (s in Semantics) {
      return Semantics[s as keyof typeof Semantics] as any as Tag;
    }

    // Try to match with Subpart enum
    if (s in Subpart) {
      return Subpart[s as keyof typeof Subpart] as any as Tag;
    }

    throw new Error(
      `toTag got "${s}" but could not resolve it. See Semantics and Subpart enums for available tags.`
    );
  }

  throw new Error(`toTag received invalid input type: ${typeof s}`);
}

/**
 * Convert a Tag to its string representation
 */
export function tagToString(tag: Tag | string): string {
  if (typeof tag === 'string') {
    return tag;
  }

  if (Object.values(Semantics).includes(tag as any) || Object.values(Subpart).includes(tag as any)) {
    return (tag as any).valueOf().toString();
  }

  if (tag instanceof StringTag) {
    return tag.desc;
  }

  if (tag instanceof FromGeneratorTag) {
    return tag.generatorName;
  }

  if (tag instanceof NegatedTag) {
    throw new Error(`Negated tag ${tag.toString()} is not allowed here`);
  }

  throw new Error(`tagToString unhandled tag type: ${tag.constructor.name}`);
}

/**
 * Convert input to a set of Tags
 */
export function toTagSet(
  x: null | undefined | Tag | string | Set<Tag | string> | Array<Tag | string>,
  facContext?: Map<{ name: string }, any>
): Set<Tag> {
  if (x == null) {
    return new Set<Tag>();
  }

  if (x instanceof Set) {
    return new Set<Tag>(Array.from(x).map((xi) => toTag(xi as any, facContext)));
  }

  if (Array.isArray(x)) {
    return new Set<Tag>(x.map((xi) => toTag(xi, facContext)));
  }

  return new Set<Tag>([toTag(x as any, facContext)]);
}

// Helper functions
function isSuperset<T>(set1: Set<T>, set2: Set<T>): boolean {
  for (const item of set2) {
    if (!set1.has(item)) {
      return false;
    }
  }
  return true;
}

function setsIntersect<T>(set1: Set<T>, set2: Set<T>): boolean {
  for (const item of set2) {
    if (set1.has(item)) {
      return true;
    }
  }
  return false;
}

function setDifference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  const result = new Set<T>(set1);
  for (const item of set2) {
    result.delete(item);
  }
  return result;
}

/**
 * Default export – the base Tag class.
 *
 * Previously this file exported a bag-of-symbols object as default, which was
 * inconsistent with the rest of the codebase where the default matches the
 * primary named export.  Individual symbols are available as named exports.
 */
export default Tag;
