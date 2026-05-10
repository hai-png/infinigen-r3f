/**
 * Tag System for Infinigen R3F
 * Ported from infinigen/core/tags.py
 *
 * Enhanced with face-level tagging system equivalent to the original Infinigen's
 * Subpart / tagged_face_mask / tag_canonical_surfaces API.
 *
 * Key additions:
 *  - SubpartTag: Per-face subpart labels (Front, Back, Top, Bottom, Left, Right,
 *    SupportSurface, Interior, Exterior)
 *  - Subpart: Type equivalent with negation support for constraint expressions
 *  - taggedFaceMask(mesh, tags): Efficient face lookup by semantic tag
 *  - tagCanonicalSurfaces(mesh, angleThreshold?): Auto-tag faces by normal direction
 *  - Integration with the constraint evaluator for geometry queries
 */

import * as THREE from 'three';
import { Node, Variable } from '../language/types';

export type { Variable };

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

  /**
   * Clone this tag
   */
  abstract clone(): Tag;
}

/**
 * Semantic tags for object classification
 */
export class SemanticsTag extends Tag {
  readonly type = 'SemanticsTag';
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
  readonly type = 'MaterialTag';
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
  readonly type = 'SurfaceTag';
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
  readonly type = 'RoomTag';
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
  readonly type = 'FunctionTag';
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
  readonly type = 'SizeTag';
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
  readonly type = 'StyleTag';
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
  readonly type = 'NegatedTag';
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
 * Check if tags satisfy a set of required tags
 */
export function satisfies(objTags: Set<Tag> | Tag[], requiredTags: Set<Tag> | Tag[]): boolean {
  const objSet = objTags instanceof Set ? objTags : new Set(objTags);
  const reqSet = requiredTags instanceof Set ? requiredTags : new Set(requiredTags);
  for (const tag of reqSet) {
    let found = false;
    for (const objTag of objSet) {
      if (tag === objTag || (tag instanceof Tag && objTag instanceof Tag && tag.matches(objTag))) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Common semantic tags
 */
export const SemanticsObj = {
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
  PILLOW: new SemanticsTag('pillow'),
  Room: new SemanticsTag('room'),
  Cutter: new SemanticsTag('cutter')
};

export type Semantics = typeof SemanticsObj;
/** @deprecated Use SemanticsObj directly or import Semantics type */
export const Semantics = SemanticsObj;

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

// ============================================================================
// Face-Level Tag System (Subpart equivalent)
// ============================================================================

/**
 * Canonical subpart names for face-level tagging.
 *
 * These correspond to the original Infinigen's Subpart enum, which
 * identifies the semantic role of each face on an object:
 *
 *  - **Front/Back**: Faces along the Z axis (forward/backward)
 *  - **Top/Bottom**: Faces along the Y axis (up/down)
 *  - **Left/Right**: Faces along the X axis (left/right)
 *  - **SupportSurface**: Upward-facing horizontal surface that can support objects
 *  - **Interior**: Faces inside the object (e.g., inner surfaces of a cabinet)
 *  - **Exterior**: Outer-facing surfaces that don't match other categories
 */
export type SubpartName =
  | 'Front' | 'Back'
  | 'Top' | 'Bottom'
  | 'Left' | 'Right'
  | 'SupportSurface'
  | 'Interior' | 'Exterior';

/**
 * Subpart tag for face-level classification.
 *
 * Represents a semantic label applied to individual mesh faces,
 * indicating their role in the object's structure (e.g., the "top"
 * face of a table, the "front" face of a cabinet).
 *
 * Supports negation via the `negated` flag, which inverts the match:
 * `SubpartTag('Front', true)` matches any face that is NOT the front.
 */
export class SubpartTag extends Tag {
  readonly type = 'SubpartTag';

  /** The subpart name (e.g., 'Top', 'Front', 'SupportSurface') */
  readonly value: SubpartName;

  /** Whether this tag is negated (!SubpartName) */
  readonly negated: boolean;

  constructor(value: SubpartName, negated: boolean = false) {
    super();
    this.value = value;
    this.negated = negated;
  }

  get category(): string {
    return 'subpart';
  }

  children(): Map<string, Node> {
    return new Map();
  }

  toString(): string {
    return this.negated ? `!Subpart(${this.value})` : `Subpart(${this.value})`;
  }

  matches(other: Tag): boolean {
    if (other instanceof SubpartTag) {
      if (this.negated && !other.negated) {
        return this.value !== other.value;
      }
      if (!this.negated && !other.negated) {
        return this.value === other.value;
      }
      if (this.negated && other.negated) {
        return this.value !== other.value;
      }
      return false;
    }
    return false;
  }

  /**
   * Negate this subpart tag.
   *
   * @returns A new SubpartTag with the opposite negation state
   */
  negate(): SubpartTag {
    return new SubpartTag(this.value, !this.negated);
  }

  clone(): SubpartTag {
    return new SubpartTag(this.value, this.negated);
  }
}

/**
 * Subpart type with negation support.
 *
 * This is the TypeScript equivalent of the original Infinigen's Subpart
 * type used in constraint expressions. It wraps a SubpartName with an
 * optional negation flag, enabling constraint expressions like:
 *
 *  - `Subpart('Top')` — matches the top surface
 *  - `Subpart('Top', true)` — matches any surface that is NOT the top
 *
 * Used by the constraint evaluator for geometry queries that need
 * to filter by face subpart labels.
 */
export class Subpart {
  /** The subpart name */
  readonly name: SubpartName;

  /** Whether this subpart is negated */
  readonly negated: boolean;

  constructor(name: SubpartName, negated: boolean = false) {
    this.name = name;
    this.negated = negated;
  }

  /**
   * Check if this subpart matches a face tag.
   *
   * A non-negated subpart matches faces with the same name.
   * A negated subpart matches faces with a DIFFERENT name.
   *
   * @param faceTag The subpart tag on the face
   * @returns true if this subpart matches the face tag
   */
  matches(faceTag: SubpartTag): boolean {
    if (this.negated) {
      return this.name !== faceTag.value;
    }
    return this.name === faceTag.value;
  }

  /**
   * Check if this subpart matches a set of face tags.
   *
   * @param faceTags Set of subpart tags on a face
   * @returns true if any tag in the set matches this subpart
   */
  matchesAny(faceTags: Set<SubpartTag> | SubpartTag[]): boolean {
    for (const tag of faceTags) {
      if (this.matches(tag)) return true;
    }
    return false;
  }

  /**
   * Negate this subpart.
   */
  negate(): Subpart {
    return new Subpart(this.name, !this.negated);
  }

  /**
   * Convert to a SubpartTag.
   */
  toTag(): SubpartTag {
    return new SubpartTag(this.name, this.negated);
  }

  toString(): string {
    return this.negated ? `!${this.name}` : this.name;
  }

  clone(): Subpart {
    return new Subpart(this.name, this.negated);
  }
}

/**
 * Face-level tag storage for a mesh.
 *
 * Maps each face index to a set of subpart tags, enabling efficient
 * lookup of faces by semantic role.
 */
export class FaceTagMap {
  /** Map from face index to set of subpart tags */
  private tags: Map<number, Set<SubpartTag>> = new Map();

  /** The mesh UUID this map belongs to */
  readonly meshUuid: string;

  constructor(meshUuid: string) {
    this.meshUuid = meshUuid;
  }

  /**
   * Set tags for a specific face.
   *
   * @param faceIndex The face index
   * @param tags The subpart tags for this face
   */
  setFaceTags(faceIndex: number, tags: Set<SubpartTag>): void {
    this.tags.set(faceIndex, tags);
  }

  /**
   * Add a tag to a specific face.
   *
   * @param faceIndex The face index
   * @param tag The subpart tag to add
   */
  addFaceTag(faceIndex: number, tag: SubpartTag): void {
    let faceTags = this.tags.get(faceIndex);
    if (!faceTags) {
      faceTags = new Set();
      this.tags.set(faceIndex, faceTags);
    }
    faceTags.add(tag);
  }

  /**
   * Get tags for a specific face.
   *
   * @param faceIndex The face index
   * @returns The set of subpart tags for this face, or empty set
   */
  getFaceTags(faceIndex: number): Set<SubpartTag> {
    return this.tags.get(faceIndex) ?? new Set();
  }

  /**
   * Get all face indices matching any of the given tags.
   *
   * This is the efficient face lookup method used by the constraint
   * evaluator for geometry queries.
   *
   * @param tags Array of subpart tags to match
   * @returns Array of face indices that match any of the given tags
   */
  getMatchingFaces(tags: SubpartTag[]): number[] {
    const result: number[] = [];

    for (const [faceIndex, faceTags] of this.tags) {
      for (const queryTag of tags) {
        for (const faceTag of faceTags) {
          if (queryTag.matches(faceTag)) {
            result.push(faceIndex);
            break; // Only add each face once
          }
        }
      }
    }

    return result;
  }

  /**
   * Get all face indices matching a set of Subpart constraints.
   *
   * @param subparts Array of Subpart objects to match
   * @returns Array of face indices matching the subpart constraints
   */
  getMatchingFacesBySubpart(subparts: Subpart[]): number[] {
    const result: number[] = [];

    for (const [faceIndex, faceTags] of this.tags) {
      let matches = true;
      for (const subpart of subparts) {
        if (!subpart.matchesAny(Array.from(faceTags))) {
          matches = false;
          break;
        }
      }
      if (matches) {
        result.push(faceIndex);
      }
    }

    return result;
  }

  /**
   * Get the total number of tagged faces.
   */
  get size(): number {
    return this.tags.size;
  }

  /**
   * Check if a face has been tagged.
   */
  hasFace(faceIndex: number): boolean {
    return this.tags.has(faceIndex);
  }
}

// ============================================================================
// Face-Level Tag Functions
// ============================================================================

/** Cache of face tag maps, keyed by mesh UUID */
const faceTagCache: Map<string, FaceTagMap> = new Map();

/**
 * Auto-tag mesh faces by normal direction.
 *
 * This is the TypeScript equivalent of the original Infinigen's
 * `tag_canonical_surfaces(mesh)` function, which automatically
 * assigns semantic Subpart tags to mesh faces based on their normal direction:
 *
 *  - **Top**: Normal pointing upward (Y+) — e.g., table top, shelf surface
 *  - **Bottom**: Normal pointing downward (Y-) — e.g., underside
 *  - **Front**: Normal pointing forward (Z+) — e.g., front face
 *  - **Back**: Normal pointing backward (Z-) — e.g., back face
 *  - **Left**: Normal pointing left (X-) — e.g., left side
 *  - **Right**: Normal pointing right (X+) — e.g., right side
 *  - **SupportSurface**: Horizontal surface with upward normal
 *  - **Exterior**: Any face not matching the above categories
 *
 * The tagging is cached for fast subsequent lookups.
 *
 * @param mesh The THREE.Object3D to tag
 * @param angleThreshold Angle threshold in radians for considering a normal
 *                       "aligned" with an axis (default: 0.35 rad ≈ 20°)
 * @returns FaceTagMap with the assigned tags
 */
export function tagCanonicalSurfaces(
  mesh: THREE.Object3D,
  angleThreshold: number = 0.35
): FaceTagMap {
  // Check cache
  const cached = faceTagCache.get(mesh.uuid);
  if (cached) return cached;

  const tagMap = new FaceTagMap(mesh.uuid);
  const cosThreshold = Math.cos(angleThreshold);

  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const backward = new THREE.Vector3(0, 0, -1);
  const left = new THREE.Vector3(-1, 0, 0);
  const right = new THREE.Vector3(1, 0, 0);

  mesh.updateMatrixWorld(true);
  let faceIndex = 0;

  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!geometry) return;

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return;

    const index = geometry.index;
    const faceCount = index ? index.count / 3 : posAttr.count / 3;

    for (let f = 0; f < faceCount; f++) {
      // Compute face normal
      const normal = computeFaceNormal(geometry, f, normalMatrix);
      if (!normal || normal.lengthSq() < 1e-10) {
        faceIndex++;
        continue;
      }

      const faceTags = new Set<SubpartTag>();

      // Check alignment with canonical directions
      if (normal.dot(up) >= cosThreshold) {
        faceTags.add(new SubpartTag('Top'));
        faceTags.add(new SubpartTag('SupportSurface'));
      }
      if (normal.dot(down) >= cosThreshold) {
        faceTags.add(new SubpartTag('Bottom'));
      }
      if (normal.dot(forward) >= cosThreshold) {
        faceTags.add(new SubpartTag('Front'));
      }
      if (normal.dot(backward) >= cosThreshold) {
        faceTags.add(new SubpartTag('Back'));
      }
      if (normal.dot(left) >= cosThreshold) {
        faceTags.add(new SubpartTag('Left'));
      }
      if (normal.dot(right) >= cosThreshold) {
        faceTags.add(new SubpartTag('Right'));
      }

      // Surfaces that are nearly horizontal and upward-facing can support objects
      if (normal.dot(up) >= Math.cos(Math.PI / 6)) {
        faceTags.add(new SubpartTag('SupportSurface'));
      }

      // If no canonical direction matched, tag as exterior
      if (faceTags.size === 0) {
        faceTags.add(new SubpartTag('Exterior'));
      }

      tagMap.setFaceTags(faceIndex, faceTags);
      faceIndex++;
    }
  });

  // Cache the result
  faceTagCache.set(mesh.uuid, tagMap);

  // Also store as userData for persistence
  mesh.userData._faceTagMap = tagMap;

  return tagMap;
}

/**
 * Get face indices matching semantic tags.
 *
 * This is the TypeScript equivalent of the original Infinigen's
 * `tagged_face_mask(mesh, tags)` function, which returns the indices
 * of faces that have been tagged with specific subpart labels.
 *
 * First checks the cache for previously computed tag data, then
 * falls back to auto-tagging if no data is available.
 *
 * @param mesh The THREE.Object3D to query
 * @param tags Array of SubpartTag objects to match
 * @returns Array of face indices matching any of the given tags
 */
export function taggedFaceMask(mesh: THREE.Object3D, tags: SubpartTag[]): number[] {
  // Get or create tag map
  let tagMap = faceTagCache.get(mesh.uuid);

  if (!tagMap) {
    // Check mesh userData
    const userData = mesh.userData?._faceTagMap as FaceTagMap | undefined;
    if (userData && userData.meshUuid === mesh.uuid) {
      tagMap = userData;
      faceTagCache.set(mesh.uuid, tagMap);
    } else {
      // Auto-tag and cache
      tagMap = tagCanonicalSurfaces(mesh);
    }
  }

  return tagMap.getMatchingFaces(tags);
}

/**
 * Get face indices matching a set of Subpart constraints.
 *
 * @param mesh The THREE.Object3D to query
 * @param subparts Array of Subpart objects to match
 * @returns Array of face indices matching the subpart constraints
 */
export function taggedFaceMaskBySubpart(mesh: THREE.Object3D, subparts: Subpart[]): number[] {
  let tagMap = faceTagCache.get(mesh.uuid);

  if (!tagMap) {
    const userData = mesh.userData?._faceTagMap as FaceTagMap | undefined;
    if (userData && userData.meshUuid === mesh.uuid) {
      tagMap = userData;
      faceTagCache.set(mesh.uuid, tagMap);
    } else {
      tagMap = tagCanonicalSurfaces(mesh);
    }
  }

  return tagMap.getMatchingFacesBySubpart(subparts);
}

/**
 * Invalidate the face tag cache for a specific mesh.
 *
 * @param meshUuid The UUID of the mesh to invalidate
 */
export function invalidateFaceTagCache(meshUuid: string): void {
  faceTagCache.delete(meshUuid);
}

/**
 * Clear the entire face tag cache.
 */
export function clearFaceTagCache(): void {
  faceTagCache.clear();
}

/**
 * Common subpart tags for convenience.
 */
export const Subparts = {
  FRONT: new SubpartTag('Front'),
  BACK: new SubpartTag('Back'),
  TOP: new SubpartTag('Top'),
  BOTTOM: new SubpartTag('Bottom'),
  LEFT: new SubpartTag('Left'),
  RIGHT: new SubpartTag('Right'),
  SUPPORT_SURFACE: new SubpartTag('SupportSurface'),
  INTERIOR: new SubpartTag('Interior'),
  EXTERIOR: new SubpartTag('Exterior'),
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Compute the face normal for a specific face of a BufferGeometry.
 */
function computeFaceNormal(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  normalMatrix: THREE.Matrix3
): THREE.Vector3 | null {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return null;

  const index = geometry.index;
  const i0 = faceIndex * 3;

  const getVertex = (idx: number, target: THREE.Vector3) => {
    const i = index ? index.getX(idx) : idx;
    target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
  };

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  getVertex(i0, vA);
  getVertex(i0 + 1, vB);
  getVertex(i0 + 2, vC);

  cb.subVectors(vC, vB);
  ab.subVectors(vA, vB);
  cb.cross(ab);

  const normal = cb.applyMatrix3(normalMatrix).normalize();
  if (normal.lengthSq() < 1e-10) return null;

  return normal;
}
