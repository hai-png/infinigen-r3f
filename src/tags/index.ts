/**
 * Tag System for Infinigen R3F
 * Ported from infinigen/core/tags.py
 */

import { Node, Variable } from '../constraints/language/types.js';

/**
 * Base class for all tags
 */
export abstract class Tag extends Node {
  /**
   * Get the string representation of this tag
   */
  abstract toString(): string;

  /**
   * Check if this tag matches another tag
   */
  abstract matches(other: Tag): boolean;

  /**
   * Get the category of this tag
   */
  abstract get category(): string;
}

/**
 * Semantic tags for object classification
 */
export class SemanticsTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'semantics';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Semantics(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof SemanticsTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): SemanticsTag {
    return new SemanticsTag(this.value);
  }
}

/**
 * Material tags
 */
export class MaterialTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'material';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Material(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof MaterialTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): MaterialTag {
    return new MaterialTag(this.value);
  }
}

/**
 * Surface type tags
 */
export class SurfaceTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'surface';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Surface(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof SurfaceTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): SurfaceTag {
    return new SurfaceTag(this.value);
  }
}

/**
 * Room type tags
 */
export class RoomTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'room';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Room(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof RoomTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): RoomTag {
    return new RoomTag(this.value);
  }
}

/**
 * Function tags (what an object is used for)
 */
export class FunctionTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'function';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Function(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof FunctionTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): FunctionTag {
    return new FunctionTag(this.value);
  }
}

/**
 * Size tags
 */
export class SizeTag extends Tag {
  constructor(public readonly value: 'small' | 'medium' | 'large') {
    super();
  }

  get category(): string {
    return 'size';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Size(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof SizeTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): SizeTag {
    return new SizeTag(this.value);
  }
}

/**
 * Style tags
 */
export class StyleTag extends Tag {
  constructor(public readonly value: string) {
    super();
  }

  get category(): string {
    return 'style';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return `Style(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (!(other instanceof StyleTag)) {
      return false;
    }
    return this.value === other.value;
  }

  clone(): StyleTag {
    return new StyleTag(this.value);
  }
}

/**
 * Negated tag wrapper
 */
export class NegatedTag extends Tag {
  constructor(public readonly tag: Tag) {
    super();
  }

  get category(): string {
    return this.tag.category;
  }

  children(): Map<string, Node> {
    return new Map([['tag', this.tag]]);
  }

  toString(): string {
    return `NOT(${this.tag})`;
  }

  matches(other: Tag): boolean {
    if (other instanceof NegatedTag) {
      return !this.tag.matches(other.tag);
    }
    return !this.tag.matches(other);
  }

  clone(): NegatedTag {
    return new NegatedTag(this.tag.clone());
  }
}

/**
 * Set of tags with operations
 */
export class TagSet {
  constructor(public readonly tags: Set<Tag> = new Set()) {}

  /**
   * Add a tag to the set
   */
  add(tag: Tag): TagSet {
    const newTags = new Set(this.tags);
    newTags.add(tag);
    return new TagSet(newTags);
  }

  /**
   * Remove a tag from the set
   */
  remove(tag: Tag): TagSet {
    const newTags = new Set(this.tags);
    for (const t of newTags) {
      if (t.matches(tag)) {
        newTags.delete(t);
        break;
      }
    }
    return new TagSet(newTags);
  }

  /**
   * Check if this set contains a tag
   */
  has(tag: Tag): boolean {
    for (const t of this.tags) {
      if (t.matches(tag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Union with another tag set
   */
  union(other: TagSet): TagSet {
    const newTags = new Set(this.tags);
    for (const tag of other.tags) {
      newTags.add(tag);
    }
    return new TagSet(newTags);
  }

  /**
   * Intersection with another tag set
   */
  intersection(other: TagSet): TagSet {
    const newTags = new Set<Tag>();
    for (const tag of this.tags) {
      if (other.has(tag)) {
        newTags.add(tag);
      }
    }
    return new TagSet(newTags);
  }

  /**
   * Difference with another tag set
   */
  difference(other: TagSet): TagSet {
    const newTags = new Set<Tag>();
    for (const tag of this.tags) {
      if (!other.has(tag)) {
        newTags.add(tag);
      }
    }
    return new TagSet(newTags);
  }

  /**
   * Check if this set is a subset of another
   */
  isSubset(other: TagSet): boolean {
    for (const tag of this.tags) {
      if (!other.has(tag)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get tags by category
   */
  getByCategory(category: string): Tag[] {
    const result: Tag[] = [];
    for (const tag of this.tags) {
      if (tag.category === category) {
        result.push(tag);
      }
    }
    return result;
  }

  /**
   * Convert to array
   */
  toArray(): Tag[] {
    return Array.from(this.tags);
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  /**
   * Get size
   */
  size(): number {
    return this.tags.size;
  }

  /**
   * Clone the tag set
   */
  clone(): TagSet {
    return new TagSet(new Set(this.tags));
  }

  /**
   * String representation
   */
  toString(): string {
    return `TagSet{${Array.from(this.tags).map(t => t.toString()).join(', ')}}`;
  }
}

/**
 * Common semantic tags
 */
export const Semantics = {
  WALL: new SemanticsTag('wall'),
  FLOOR: new SemanticsTag('floor'),
  CEILING: new SemanticsTag('ceiling'),
  DOOR: new SemanticsTag('door'),
  WINDOW: new SemanticsTag('window'),
  FURNITURE: new SemanticsTag('furniture'),
  CHAIR: new SemanticsTag('chair'),
  TABLE: new SemanticsTag('table'),
  SOFA: new SemanticsTag('sofa'),
  BED: new SemanticsTag('bed'),
  LAMP: new SemanticsTag('lamp'),
  SHELF: new SemanticsTag('shelf'),
  CABINET: new SemanticsTag('cabinet'),
  DESK: new SemanticsTag('desk'),
  PLANT: new SemanticsTag('plant'),
  DECORATION: new SemanticsTag('decoration'),
  APPLIANCE: new SemanticsTag('appliance'),
  KITCHEN: new SemanticsTag('kitchen'),
  BATHROOM: new SemanticsTag('bathroom'),
  SINK: new SemanticsTag('sink'),
  TOILET: new SemanticsTag('toilet'),
  BATHTUB: new SemanticsTag('bathtub'),
  STOVE: new SemanticsTag('stove'),
  REFRIGERATOR: new SemanticsTag('refrigerator'),
  TV: new SemanticsTag('tv'),
  BOOKSHELF: new SemanticsTag('bookshelf'),
  PICTURE: new SemanticsTag('picture'),
  RUG: new SemanticsTag('rug'),
  CURTAIN: new SemanticsTag('curtain'),
  MIRROR: new SemanticsTag('mirror'),
  VASE: new SemanticsTag('vase'),
  CUSHION: new SemanticsTag('cushion'),
  BLANKET: new SemanticsTag('blanket'),
  PILLOW: new SemanticsTag('pillow')
};

/**
 * Common material tags
 */
export const Material = {
  WOOD: new MaterialTag('wood'),
  METAL: new MaterialTag('metal'),
  PLASTIC: new MaterialTag('plastic'),
  GLASS: new MaterialTag('glass'),
  FABRIC: new MaterialTag('fabric'),
  LEATHER: new MaterialTag('leather'),
  CERAMIC: new MaterialTag('ceramic'),
  STONE: new MaterialTag('stone'),
  CONCRETE: new MaterialTag('concrete'),
  BRICK: new MaterialTag('brick'),
  PAINT: new MaterialTag('paint'),
  CARPET: new MaterialTag('carpet'),
  TILE: new MaterialTag('tile'),
  MARBLE: new MaterialTag('marble'),
  GRANITE: new MaterialTag('granite')
};

/**
 * Common surface tags
 */
export const Surface = {
  FLAT: new SurfaceTag('flat'),
  ROUGH: new SurfaceTag('rough'),
  SMOOTH: new SurfaceTag('smooth'),
  TEXTURED: new SurfaceTag('textured'),
  REFLECTIVE: new SurfaceTag('reflective'),
  MATTE: new SurfaceTag('matte'),
  GLOSSY: new SurfaceTag('glossy')
};

/**
 * Common room tags
 */
export const Room = {
  LIVING_ROOM: new RoomTag('living_room'),
  BEDROOM: new RoomTag('bedroom'),
  KITCHEN: new RoomTag('kitchen'),
  BATHROOM: new RoomTag('bathroom'),
  DINING_ROOM: new RoomTag('dining_room'),
  OFFICE: new RoomTag('office'),
  HALLWAY: new RoomTag('hallway'),
  GARAGE: new RoomTag('garage'),
  BASEMENT: new RoomTag('basement'),
  ATTIC: new RoomTag('attic'),
  BALCONY: new RoomTag('balcony'),
  PATIO: new RoomTag('patio'),
  LAUNDRY: new RoomTag('laundry'),
  STUDY: new RoomTag('study'),
  PLAYROOM: new RoomTag('playroom')
};

/**
 * Common function tags
 */
export const Function = {
  SITTING: new FunctionTag('sitting'),
  SLEEPING: new FunctionTag('sleeping'),
  EATING: new FunctionTag('eating'),
  WORKING: new FunctionTag('working'),
  STORAGE: new FunctionTag('storage'),
  DISPLAY: new FunctionTag('display'),
  COOKING: new FunctionTag('cooking'),
  CLEANING: new FunctionTag('cleaning'),
  RELAXING: new FunctionTag('relaxing'),
  READING: new FunctionTag('reading'),
  ENTERTAINMENT: new FunctionTag('entertainment')
};

/**
 * Common size tags
 */
export const Size = {
  SMALL: new SizeTag('small'),
  MEDIUM: new SizeTag('medium'),
  LARGE: new SizeTag('large')
};

/**
 * Common style tags
 */
export const Style = {
  MODERN: new StyleTag('modern'),
  CONTEMPORARY: new StyleTag('contemporary'),
  TRADITIONAL: new StyleTag('traditional'),
  INDUSTRIAL: new StyleTag('industrial'),
  RUSTIC: new StyleTag('rustic'),
  MINIMALIST: new StyleTag('minimalist'),
  SCANDINAVIAN: new StyleTag('scandinavian'),
  MID_CENTURY: new StyleTag('mid_century'),
  BOHEMIAN: new StyleTag('bohemian'),
  CLASSICAL: new StyleTag('classical'),
  ART_DECO: new StyleTag('art_deco'),
  FARMHOUSE: new StyleTag('farmhouse')
};
