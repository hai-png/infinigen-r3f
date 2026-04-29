/**
 * AssetTypes.ts
 *
 * Core TypeScript interfaces and types for all asset categories in Infinigen R3F.
 * Provides type-safe definitions for procedural generators, materials, and loaded assets.
 */
/**
 * Asset categories for organization and filtering
 */
export var AssetCategory;
(function (AssetCategory) {
    AssetCategory["VEGETATION"] = "vegetation";
    AssetCategory["ROCK_TERRAIN"] = "rock_terrain";
    AssetCategory["WATER_FEATURE"] = "water_feature";
    AssetCategory["MAN_MADE"] = "man_made";
    AssetCategory["MISCELLANEOUS"] = "miscellaneous";
    AssetCategory["MATERIAL"] = "material";
    AssetCategory["BIOME"] = "biome";
})(AssetCategory || (AssetCategory = {}));
/**
 * Seasonal variations for vegetation
 */
export var Season;
(function (Season) {
    Season["SPRING"] = "spring";
    Season["SUMMER"] = "summer";
    Season["AUTUMN"] = "autumn";
    Season["WINTER"] = "winter";
})(Season || (Season = {}));
export var RockType;
(function (RockType) {
    RockType["GRANITE"] = "granite";
    RockType["LIMESTONE"] = "limestone";
    RockType["BASALT"] = "basalt";
    RockType["SLATE"] = "slate";
    RockType["SANDSTONE"] = "sandstone";
    RockType["MARBLE"] = "marble";
})(RockType || (RockType = {}));
export var ArchitecturalStyle;
(function (ArchitecturalStyle) {
    ArchitecturalStyle["MEDIEVAL"] = "medieval";
    ArchitecturalStyle["VICTORIAN"] = "victorian";
    ArchitecturalStyle["MODERN"] = "modern";
    ArchitecturalStyle["RUSTIC"] = "rustic";
    ArchitecturalStyle["INDUSTRIAL"] = "industrial";
    ArchitecturalStyle["FANTASY"] = "fantasy";
})(ArchitecturalStyle || (ArchitecturalStyle = {}));
export var BlendMode;
(function (BlendMode) {
    BlendMode["LINEAR"] = "linear";
    BlendMode["NOISE"] = "noise";
    BlendMode["GRADIENT"] = "gradient";
    BlendMode["MASK"] = "mask";
})(BlendMode || (BlendMode = {}));
export var SoilType;
(function (SoilType) {
    SoilType["CLAY"] = "clay";
    SoilType["SAND"] = "sand";
    SoilType["SILT"] = "silt";
    SoilType["LOAM"] = "loam";
    SoilType["PEAT"] = "peat";
    SoilType["ROCK"] = "rock";
})(SoilType || (SoilType = {}));
export var CollisionShape;
(function (CollisionShape) {
    CollisionShape["BOX"] = "box";
    CollisionShape["SPHERE"] = "sphere";
    CollisionShape["CYLINDER"] = "cylinder";
    CollisionShape["CAPSULE"] = "capsule";
    CollisionShape["CONVEX_HULL"] = "convex_hull";
    CollisionShape["MESH"] = "mesh";
})(CollisionShape || (CollisionShape = {}));
/**
 * Event types for asset system
 */
export var AssetEventType;
(function (AssetEventType) {
    AssetEventType["LOAD_START"] = "load_start";
    AssetEventType["LOAD_PROGRESS"] = "load_progress";
    AssetEventType["LOAD_COMPLETE"] = "load_complete";
    AssetEventType["LOAD_ERROR"] = "load_error";
    AssetEventType["CACHE_HIT"] = "cache_hit";
    AssetEventType["CACHE_MISS"] = "cache_miss";
    AssetEventType["LOD_SWITCH"] = "lod_switch";
})(AssetEventType || (AssetEventType = {}));
//# sourceMappingURL=AssetTypes.js.map