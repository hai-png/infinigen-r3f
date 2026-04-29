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
export class Tag {
    /**
     * Returns negated version of this tag
     */
    negate() {
        return new NegatedTag(this);
    }
}
/**
 * String-based tag
 */
export class StringTag extends Tag {
    constructor(desc) {
        super();
        this.desc = desc;
    }
}
/**
 * Semantic tags for object classification
 * Ported from Python Semantics EnumTag
 */
export var Semantics;
(function (Semantics) {
    // Mesh types
    Semantics["Room"] = "room";
    Semantics["Object"] = "object";
    Semantics["Cutter"] = "cutter";
    // Room types
    Semantics["Kitchen"] = "kitchen";
    Semantics["Bedroom"] = "bedroom";
    Semantics["LivingRoom"] = "living-room";
    Semantics["Closet"] = "closet";
    Semantics["Hallway"] = "hallway";
    Semantics["Bathroom"] = "bathroom";
    Semantics["Garage"] = "garage";
    Semantics["Balcony"] = "balcony";
    Semantics["DiningRoom"] = "dining-room";
    Semantics["Utility"] = "utility";
    Semantics["StaircaseRoom"] = "staircase-room";
    Semantics["Warehouse"] = "warehouse";
    Semantics["Office"] = "office";
    Semantics["MeetingRoom"] = "meeting-room";
    Semantics["OpenOffice"] = "open-office";
    Semantics["BreakRoom"] = "break-room";
    Semantics["Restroom"] = "restroom";
    Semantics["FactoryOffice"] = "factory-office";
    Semantics["Root"] = "root";
    Semantics["New"] = "new";
    Semantics["RoomNode"] = "room-node";
    Semantics["GroundFloor"] = "ground";
    Semantics["SecondFloor"] = "second-floor";
    Semantics["ThirdFloor"] = "third-floor";
    Semantics["Exterior"] = "exterior";
    Semantics["Staircase"] = "staircase";
    Semantics["Visited"] = "visited";
    Semantics["RoomContour"] = "room-contour";
    // Object types
    Semantics["Furniture"] = "furniture";
    Semantics["FloorMat"] = "FloorMat";
    Semantics["WallDecoration"] = "wall-decoration";
    Semantics["HandheldItem"] = "handheld-item";
    // Furniture functions
    Semantics["Storage"] = "storage";
    Semantics["Seating"] = "seating";
    Semantics["LoungeSeating"] = "lounge-seating";
    Semantics["Table"] = "table";
    Semantics["Bathing"] = "bathing";
    Semantics["SideTable"] = "side-table";
    Semantics["Watchable"] = "watchable";
    Semantics["Desk"] = "desk";
    Semantics["Bed"] = "bed";
    Semantics["Sink"] = "sink";
    Semantics["CeilingLight"] = "ceiling-light";
    Semantics["Lighting"] = "lighting";
    Semantics["KitchenCounter"] = "kitchen-counter";
    Semantics["KitchenAppliance"] = "kitchen-appliance";
    // Small Object Functions
    Semantics["TableDisplayItem"] = "table-display-item";
    Semantics["OfficeShelfItem"] = "office-shelf-item";
    Semantics["KitchenCounterItem"] = "kitchen-counter-item";
    Semantics["FoodPantryItem"] = "food-pantry";
    Semantics["BathroomItem"] = "bathroom-item";
    Semantics["ShelfTrinket"] = "shelf-trinket";
    Semantics["Dishware"] = "dishware";
    Semantics["Cookware"] = "cookware";
    Semantics["Utensils"] = "utensils";
    Semantics["ClothDrapeItem"] = "cloth-drape";
    // Object Access Type
    Semantics["AccessTop"] = "access-top";
    Semantics["AccessFront"] = "access-front";
    Semantics["AccessAnySide"] = "access-any-side";
    Semantics["AccessAllSides"] = "access-all-sides";
    // Object Access Method
    Semantics["AccessStandingNear"] = "access-stand-near";
    Semantics["AccessSit"] = "access-stand-near";
    Semantics["AccessOpenDoor"] = "access-open-door";
    Semantics["AccessHand"] = "access-with-hand";
    // Special Case Objects
    Semantics["Chair"] = "chair";
    Semantics["Window"] = "window";
    Semantics["Open"] = "open";
    Semantics["Entrance"] = "entrance";
    Semantics["Door"] = "door";
    // Solver feature flags - Per-Asset Behavior Config
    Semantics["RealPlaceholder"] = "real-placeholder";
    Semantics["OversizePlaceholder"] = "oversize-placeholder";
    Semantics["AssetAsPlaceholder"] = "asset-as-placeholder";
    Semantics["AssetPlaceholderForChildren"] = "asset-placeholder-for-children";
    Semantics["PlaceholderBBox"] = "placeholder-bbox";
    Semantics["SingleGenerator"] = "single-generator";
    Semantics["NoRotation"] = "no-rotation";
    Semantics["NoCollision"] = "no-collision";
    Semantics["NoChildren"] = "no-children";
})(Semantics || (Semantics = {}));
/**
 * Subpart tags for geometry regions
 */
export var Subpart;
(function (Subpart) {
    Subpart["SupportSurface"] = "support";
    Subpart["Interior"] = "interior";
    Subpart["Visible"] = "visible";
    Subpart["Bottom"] = "bottom";
    Subpart["Top"] = "top";
    Subpart["Side"] = "side";
    Subpart["Back"] = "back";
    Subpart["Front"] = "front";
    Subpart["Ceiling"] = "ceiling";
    Subpart["Wall"] = "wall";
    Subpart["StaircaseWall"] = "staircase-wall";
})(Subpart || (Subpart = {}));
/**
 * Tag indicating geometry comes from a specific generator
 */
export class FromGeneratorTag extends Tag {
    constructor(generatorName) {
        super();
        this.generatorName = generatorName;
    }
    toString() {
        return `FromGenerator(${this.generatorName})`;
    }
}
/**
 * Negated tag wrapper
 */
export class NegatedTag extends Tag {
    constructor(tag) {
        super();
        this.tag = tag;
        if (tag instanceof NegatedTag) {
            throw new Error('Cannot construct double negative tags');
        }
    }
    toString() {
        return `-${this.tag.toString()}`;
    }
    /**
     * Double negation returns original tag
     */
    negate() {
        return this.tag;
    }
}
/**
 * Variable tag for dynamic tagging
 */
export class VariableTag extends Tag {
    constructor(name) {
        super();
        this.name = name;
        if (typeof name !== 'string') {
            throw new Error('Variable tag name must be a string');
        }
    }
    toString() {
        return this.name;
    }
}
/**
 * Specific object tag
 */
export class SpecificObjectTag extends Tag {
    constructor(name) {
        super();
        this.name = name;
    }
}
/**
 * Decompose tags into positive and negative sets
 */
export function decomposeTags(tags) {
    const positive = new Set();
    const negative = new Set();
    for (const tag of tags) {
        if (tag instanceof NegatedTag) {
            negative.add(tag.tag);
        }
        else {
            positive.add(tag);
        }
    }
    return { positive, negative };
}
/**
 * Check if a set of tags contains a contradiction
 */
export function hasContradiction(tags) {
    const { positive, negative } = decomposeTags(tags);
    // Check for direct contradictions
    for (const posTag of positive) {
        if (negative.has(posTag)) {
            return true;
        }
    }
    // Check for multiple FromGenerator tags
    const fromGeneratorCount = Array.from(tags).filter((t) => t instanceof FromGeneratorTag).length;
    if (fromGeneratorCount > 1) {
        return true;
    }
    // Check for multiple SpecificObject or Variable tags
    const specificCount = Array.from(tags).filter((t) => t instanceof SpecificObjectTag || t instanceof VariableTag).length;
    if (specificCount > 1) {
        return true;
    }
    return false;
}
/**
 * Check if tags t1 implies tags t2
 */
export function implies(t1, t2) {
    const { positive: p1, negative: n1 } = decomposeTags(t1);
    const { positive: p2, negative: n2 } = decomposeTags(t2);
    return !hasContradiction(t1) && isSuperset(p1, p2) && isSuperset(n1, n2);
}
/**
 * Check if tags t1 satisfies tags t2
 */
export function satisfies(t1, t2) {
    const { positive: p1, negative: n1 } = decomposeTags(t1);
    const { positive: p2, negative: n2 } = decomposeTags(t2);
    return isSuperset(p1, p2) && !setsIntersect(n1, p2) && !setsIntersect(n2, p1);
}
/**
 * Return the difference between two tag sets
 */
export function tagDifference(t1, t2) {
    const { positive: p1, negative: n1 } = decomposeTags(t1);
    const { positive: p2, negative: n2 } = decomposeTags(t2);
    const pos = new Set([...p1, ...setDifference(n2, n1)]);
    const neg = setDifference(n1, p2);
    const result = new Set(pos);
    for (const n of neg) {
        result.add(new NegatedTag(n));
    }
    return result;
}
/**
 * Convert various inputs to a Tag
 */
export function toTag(s, facContext) {
    if (s instanceof Tag) {
        return s;
    }
    if (typeof s === 'object' && 'name' in s && typeof s.name === 'string') {
        if (!facContext) {
            throw new Error(`toTag got ${s.name} but no facContext provided`);
        }
        if (!facContext.has(s)) {
            throw new Error(`toTag got ${s.name} but it was not in facContext`);
        }
        return new FromGeneratorTag(s.name);
    }
    if (typeof s === 'string') {
        s = s.trim().replace(/^["']|["']$/g, '');
        if (s.startsWith('-')) {
            return new NegatedTag(toTag(s.substring(1), facContext));
        }
        // Try to match with Semantics enum
        if (s in Semantics) {
            return Semantics[s];
        }
        // Try to match with Subpart enum
        if (s in Subpart) {
            return Subpart[s];
        }
        throw new Error(`toTag got "${s}" but could not resolve it. See Semantics and Subpart enums for available tags.`);
    }
    throw new Error(`toTag received invalid input type: ${typeof s}`);
}
/**
 * Convert a Tag to its string representation
 */
export function tagToString(tag) {
    if (typeof tag === 'string') {
        return tag;
    }
    if (tag instanceof Semantics || tag instanceof Subpart) {
        return tag.valueOf().toString();
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
export function toTagSet(x, facContext) {
    if (x == null) {
        return new Set();
    }
    if (x instanceof Set) {
        return new Set(Array.from(x).map((xi) => toTag(xi, facContext)));
    }
    if (Array.isArray(x)) {
        return new Set(x.map((xi) => toTag(xi, facContext)));
    }
    return new Set([toTag(x, facContext)]);
}
// Helper functions
function isSuperset(set1, set2) {
    for (const item of set2) {
        if (!set1.has(item)) {
            return false;
        }
    }
    return true;
}
function setsIntersect(set1, set2) {
    for (const item of set2) {
        if (set1.has(item)) {
            return true;
        }
    }
    return false;
}
function setDifference(set1, set2) {
    const result = new Set(set1);
    for (const item of set2) {
        result.delete(item);
    }
    return result;
}
export default {
    Tag,
    StringTag,
    Semantics,
    Subpart,
    FromGeneratorTag,
    NegatedTag,
    VariableTag,
    SpecificObjectTag,
    decomposeTags,
    hasContradiction,
    implies,
    satisfies,
    tagDifference,
    toTag,
    tagToString,
    toTagSet,
};
//# sourceMappingURL=tags.js.map