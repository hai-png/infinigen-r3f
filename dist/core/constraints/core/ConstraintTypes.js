/**
 * Constraint Types for Infinigen R3F
 * Core constraint definitions ported from original Infinigen
 */
export var ConstraintType;
(function (ConstraintType) {
    // Spatial constraints
    ConstraintType["ABOVE"] = "above";
    ConstraintType["BELOW"] = "below";
    ConstraintType["LEFT_OF"] = "left_of";
    ConstraintType["RIGHT_OF"] = "right_of";
    ConstraintType["IN_FRONT_OF"] = "in_front_of";
    ConstraintType["BEHIND"] = "behind";
    ConstraintType["NEAR"] = "near";
    ConstraintType["FAR"] = "far";
    // Containment constraints
    ConstraintType["INSIDE"] = "inside";
    ConstraintType["OUTSIDE"] = "outside";
    ConstraintType["ON_TOP_OF"] = "on_top_of";
    ConstraintType["ATTACHED_TO"] = "attached_to";
    // Semantic constraints
    ConstraintType["SAME_ROOM"] = "same_room";
    ConstraintType["DIFFERENT_ROOM"] = "different_room";
    ConstraintType["VISIBLE_FROM"] = "visible_from";
    ConstraintType["OCCLUDED_FROM"] = "occluded_from";
    // Physical constraints
    ConstraintType["SUPPORTED_BY"] = "supported_by";
    ConstraintType["HANGING_FROM"] = "hanging_from";
    ConstraintType["STABLE"] = "stable";
    ConstraintType["BALANCED"] = "balanced";
    // Group constraints
    ConstraintType["ALIGNED_WITH"] = "aligned_with";
    ConstraintType["SYMMETRIC_TO"] = "symmetric_to";
    ConstraintType["GROUPED_WITH"] = "grouped_with";
    ConstraintType["DISTRIBUTE_ALONG"] = "distribute_along";
})(ConstraintType || (ConstraintType = {}));
//# sourceMappingURL=ConstraintTypes.js.map