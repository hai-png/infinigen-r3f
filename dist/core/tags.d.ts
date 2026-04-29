/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Alexander Raistrick (original Python author)
 */
/**
 * Tag system for semantic labeling of geometry
 * Based on original InfiniGen tags.py
 */
/**
 * Base Tag class
 */
export declare abstract class Tag {
    /**
     * Returns negated version of this tag
     */
    negate(): NegatedTag;
}
/**
 * String-based tag
 */
export declare class StringTag extends Tag {
    desc: string;
    constructor(desc: string);
}
/**
 * Semantic tags for object classification
 * Ported from Python Semantics EnumTag
 */
export declare enum Semantics {
    Room = "room",
    Object = "object",
    Cutter = "cutter",
    Kitchen = "kitchen",
    Bedroom = "bedroom",
    LivingRoom = "living-room",
    Closet = "closet",
    Hallway = "hallway",
    Bathroom = "bathroom",
    Garage = "garage",
    Balcony = "balcony",
    DiningRoom = "dining-room",
    Utility = "utility",
    StaircaseRoom = "staircase-room",
    Warehouse = "warehouse",
    Office = "office",
    MeetingRoom = "meeting-room",
    OpenOffice = "open-office",
    BreakRoom = "break-room",
    Restroom = "restroom",
    FactoryOffice = "factory-office",
    Root = "root",
    New = "new",
    RoomNode = "room-node",
    GroundFloor = "ground",
    SecondFloor = "second-floor",
    ThirdFloor = "third-floor",
    Exterior = "exterior",
    Staircase = "staircase",
    Visited = "visited",
    RoomContour = "room-contour",
    Furniture = "furniture",
    FloorMat = "FloorMat",
    WallDecoration = "wall-decoration",
    HandheldItem = "handheld-item",
    Storage = "storage",
    Seating = "seating",
    LoungeSeating = "lounge-seating",
    Table = "table",
    Bathing = "bathing",
    SideTable = "side-table",
    Watchable = "watchable",
    Desk = "desk",
    Bed = "bed",
    Sink = "sink",
    CeilingLight = "ceiling-light",
    Lighting = "lighting",
    KitchenCounter = "kitchen-counter",
    KitchenAppliance = "kitchen-appliance",
    TableDisplayItem = "table-display-item",
    OfficeShelfItem = "office-shelf-item",
    KitchenCounterItem = "kitchen-counter-item",
    FoodPantryItem = "food-pantry",
    BathroomItem = "bathroom-item",
    ShelfTrinket = "shelf-trinket",
    Dishware = "dishware",
    Cookware = "cookware",
    Utensils = "utensils",
    ClothDrapeItem = "cloth-drape",
    AccessTop = "access-top",
    AccessFront = "access-front",
    AccessAnySide = "access-any-side",
    AccessAllSides = "access-all-sides",
    AccessStandingNear = "access-stand-near",
    AccessSit = "access-stand-near",
    AccessOpenDoor = "access-open-door",
    AccessHand = "access-with-hand",
    Chair = "chair",
    Window = "window",
    Open = "open",
    Entrance = "entrance",
    Door = "door",
    RealPlaceholder = "real-placeholder",
    OversizePlaceholder = "oversize-placeholder",
    AssetAsPlaceholder = "asset-as-placeholder",
    AssetPlaceholderForChildren = "asset-placeholder-for-children",
    PlaceholderBBox = "placeholder-bbox",
    SingleGenerator = "single-generator",
    NoRotation = "no-rotation",
    NoCollision = "no-collision",
    NoChildren = "no-children"
}
/**
 * Subpart tags for geometry regions
 */
export declare enum Subpart {
    SupportSurface = "support",
    Interior = "interior",
    Visible = "visible",
    Bottom = "bottom",
    Top = "top",
    Side = "side",
    Back = "back",
    Front = "front",
    Ceiling = "ceiling",
    Wall = "wall",
    StaircaseWall = "staircase-wall"
}
/**
 * Tag indicating geometry comes from a specific generator
 */
export declare class FromGeneratorTag extends Tag {
    generatorName: string;
    constructor(generatorName: string);
    toString(): string;
}
/**
 * Negated tag wrapper
 */
export declare class NegatedTag extends Tag {
    tag: Tag;
    constructor(tag: Tag);
    toString(): string;
    /**
     * Double negation returns original tag
     */
    negate(): Tag;
}
/**
 * Variable tag for dynamic tagging
 */
export declare class VariableTag extends Tag {
    name: string;
    constructor(name: string);
    toString(): string;
}
/**
 * Specific object tag
 */
export declare class SpecificObjectTag extends Tag {
    name: string;
    constructor(name: string);
}
/**
 * Decompose tags into positive and negative sets
 */
export declare function decomposeTags(tags: Set<Tag>): {
    positive: Set<Tag>;
    negative: Set<Tag>;
};
/**
 * Check if a set of tags contains a contradiction
 */
export declare function hasContradiction(tags: Set<Tag>): boolean;
/**
 * Check if tags t1 implies tags t2
 */
export declare function implies(t1: Set<Tag>, t2: Set<Tag>): boolean;
/**
 * Check if tags t1 satisfies tags t2
 */
export declare function satisfies(t1: Set<Tag>, t2: Set<Tag>): boolean;
/**
 * Return the difference between two tag sets
 */
export declare function tagDifference(t1: Set<Tag>, t2: Set<Tag>): Set<Tag>;
/**
 * Convert various inputs to a Tag
 */
export declare function toTag(s: string | Tag | {
    name: string;
}, facContext?: Map<{
    name: string;
}, any>): Tag;
/**
 * Convert a Tag to its string representation
 */
export declare function tagToString(tag: Tag | string): string;
/**
 * Convert input to a set of Tags
 */
export declare function toTagSet(x: null | undefined | Tag | string | Set<Tag | string> | Array<Tag | string>, facContext?: Map<{
    name: string;
}, any>): Set<Tag>;
declare const _default: {
    Tag: typeof Tag;
    StringTag: typeof StringTag;
    Semantics: typeof Semantics;
    Subpart: typeof Subpart;
    FromGeneratorTag: typeof FromGeneratorTag;
    NegatedTag: typeof NegatedTag;
    VariableTag: typeof VariableTag;
    SpecificObjectTag: typeof SpecificObjectTag;
    decomposeTags: typeof decomposeTags;
    hasContradiction: typeof hasContradiction;
    implies: typeof implies;
    satisfies: typeof satisfies;
    tagDifference: typeof tagDifference;
    toTag: typeof toTag;
    tagToString: typeof tagToString;
    toTagSet: typeof toTagSet;
};
export default _default;
//# sourceMappingURL=tags.d.ts.map