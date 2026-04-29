/**
 * Tag System for Infinigen R3F
 * Ported from infinigen/core/tags.py
 */
import { Node } from '../constraints/language/types.js';
/**
 * Base class for all tags
 */
export declare abstract class Tag extends Node {
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
export declare class SemanticsTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): SemanticsTag;
}
/**
 * Material tags
 */
export declare class MaterialTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): MaterialTag;
}
/**
 * Surface type tags
 */
export declare class SurfaceTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): SurfaceTag;
}
/**
 * Room type tags
 */
export declare class RoomTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): RoomTag;
}
/**
 * Function tags (what an object is used for)
 */
export declare class FunctionTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): FunctionTag;
}
/**
 * Size tags
 */
export declare class SizeTag extends Tag {
    readonly value: 'small' | 'medium' | 'large';
    constructor(value: 'small' | 'medium' | 'large');
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): SizeTag;
}
/**
 * Style tags
 */
export declare class StyleTag extends Tag {
    readonly value: string;
    constructor(value: string);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): StyleTag;
}
/**
 * Negated tag wrapper
 */
export declare class NegatedTag extends Tag {
    readonly tag: Tag;
    constructor(tag: Tag);
    get category(): string;
    children(): Map<string, Node>;
    toString(): string;
    matches(other: Tag): boolean;
    clone(): NegatedTag;
}
/**
 * Set of tags with operations
 */
export declare class TagSet {
    readonly tags: Set<Tag>;
    constructor(tags?: Set<Tag>);
    /**
     * Add a tag to the set
     */
    add(tag: Tag): TagSet;
    /**
     * Remove a tag from the set
     */
    remove(tag: Tag): TagSet;
    /**
     * Check if this set contains a tag
     */
    has(tag: Tag): boolean;
    /**
     * Union with another tag set
     */
    union(other: TagSet): TagSet;
    /**
     * Intersection with another tag set
     */
    intersection(other: TagSet): TagSet;
    /**
     * Difference with another tag set
     */
    difference(other: TagSet): TagSet;
    /**
     * Check if this set is a subset of another
     */
    isSubset(other: TagSet): boolean;
    /**
     * Get tags by category
     */
    getByCategory(category: string): Tag[];
    /**
     * Convert to array
     */
    toArray(): Tag[];
    /**
     * Check if empty
     */
    isEmpty(): boolean;
    /**
     * Get size
     */
    size(): number;
    /**
     * Clone the tag set
     */
    clone(): TagSet;
    /**
     * String representation
     */
    toString(): string;
}
/**
 * Common semantic tags
 */
export declare const Semantics: {
    WALL: SemanticsTag;
    FLOOR: SemanticsTag;
    CEILING: SemanticsTag;
    DOOR: SemanticsTag;
    WINDOW: SemanticsTag;
    FURNITURE: SemanticsTag;
    CHAIR: SemanticsTag;
    TABLE: SemanticsTag;
    SOFA: SemanticsTag;
    BED: SemanticsTag;
    LAMP: SemanticsTag;
    SHELF: SemanticsTag;
    CABINET: SemanticsTag;
    DESK: SemanticsTag;
    PLANT: SemanticsTag;
    DECORATION: SemanticsTag;
    APPLIANCE: SemanticsTag;
    KITCHEN: SemanticsTag;
    BATHROOM: SemanticsTag;
    SINK: SemanticsTag;
    TOILET: SemanticsTag;
    BATHTUB: SemanticsTag;
    STOVE: SemanticsTag;
    REFRIGERATOR: SemanticsTag;
    TV: SemanticsTag;
    BOOKSHELF: SemanticsTag;
    PICTURE: SemanticsTag;
    RUG: SemanticsTag;
    CURTAIN: SemanticsTag;
    MIRROR: SemanticsTag;
    VASE: SemanticsTag;
    CUSHION: SemanticsTag;
    BLANKET: SemanticsTag;
    PILLOW: SemanticsTag;
};
/**
 * Common material tags
 */
export declare const Material: {
    WOOD: MaterialTag;
    METAL: MaterialTag;
    PLASTIC: MaterialTag;
    GLASS: MaterialTag;
    FABRIC: MaterialTag;
    LEATHER: MaterialTag;
    CERAMIC: MaterialTag;
    STONE: MaterialTag;
    CONCRETE: MaterialTag;
    BRICK: MaterialTag;
    PAINT: MaterialTag;
    CARPET: MaterialTag;
    TILE: MaterialTag;
    MARBLE: MaterialTag;
    GRANITE: MaterialTag;
};
/**
 * Common surface tags
 */
export declare const Surface: {
    FLAT: SurfaceTag;
    ROUGH: SurfaceTag;
    SMOOTH: SurfaceTag;
    TEXTURED: SurfaceTag;
    REFLECTIVE: SurfaceTag;
    MATTE: SurfaceTag;
    GLOSSY: SurfaceTag;
};
/**
 * Common room tags
 */
export declare const Room: {
    LIVING_ROOM: RoomTag;
    BEDROOM: RoomTag;
    KITCHEN: RoomTag;
    BATHROOM: RoomTag;
    DINING_ROOM: RoomTag;
    OFFICE: RoomTag;
    HALLWAY: RoomTag;
    GARAGE: RoomTag;
    BASEMENT: RoomTag;
    ATTIC: RoomTag;
    BALCONY: RoomTag;
    PATIO: RoomTag;
    LAUNDRY: RoomTag;
    STUDY: RoomTag;
    PLAYROOM: RoomTag;
};
/**
 * Common function tags
 */
export declare const Function: {
    SITTING: FunctionTag;
    SLEEPING: FunctionTag;
    EATING: FunctionTag;
    WORKING: FunctionTag;
    STORAGE: FunctionTag;
    DISPLAY: FunctionTag;
    COOKING: FunctionTag;
    CLEANING: FunctionTag;
    RELAXING: FunctionTag;
    READING: FunctionTag;
    ENTERTAINMENT: FunctionTag;
};
/**
 * Common size tags
 */
export declare const Size: {
    SMALL: SizeTag;
    MEDIUM: SizeTag;
    LARGE: SizeTag;
};
/**
 * Common style tags
 */
export declare const Style: {
    MODERN: StyleTag;
    CONTEMPORARY: StyleTag;
    TRADITIONAL: StyleTag;
    INDUSTRIAL: StyleTag;
    RUSTIC: StyleTag;
    MINIMALIST: StyleTag;
    SCANDINAVIAN: StyleTag;
    MID_CENTURY: StyleTag;
    BOHEMIAN: StyleTag;
    CLASSICAL: StyleTag;
    ART_DECO: StyleTag;
    FARMHOUSE: StyleTag;
};
//# sourceMappingURL=index.d.ts.map