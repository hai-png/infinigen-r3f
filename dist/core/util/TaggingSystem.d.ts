/**
 * Tagging System for Object Classification
 *
 * Provides a flexible tagging system for object classification, filtering, and querying.
 * Based on Infinigen's tags.py and tagging.py implementation.
 *
 * @module TaggingSystem
 */
import { Vector3, Box3, Object3D } from 'three';
/**
 * Tag types supported by the system
 */
export type TagType = 'semantic' | 'functional' | 'material' | 'spatial' | 'custom';
/**
 * Tag definition interface
 */
export interface Tag {
    /** Unique tag identifier */
    id: string;
    /** Tag name/label */
    name: string;
    /** Tag type category */
    type: TagType;
    /** Parent tag for hierarchical relationships */
    parent?: string;
    /** Child tags */
    children?: string[];
    /** Metadata associated with the tag */
    metadata?: Record<string, any>;
    /** Whether this tag can be combined with others */
    combinable: boolean;
}
/**
 * Tagged object interface
 */
export interface TaggedObject {
    /** Unique object identifier */
    objectId: string;
    /** Reference to Three.js object */
    object?: Object3D;
    /** Set of tag IDs assigned to this object */
    tags: Set<string>;
    /** Optional bounding box for spatial queries */
    boundingBox?: Box3;
    /** Optional centroid for distance queries */
    centroid?: Vector3;
}
/**
 * Query options for tag-based searches
 */
export interface TagQueryOptions {
    /** Match all specified tags (AND logic) */
    matchAll?: string[];
    /** Match any of the specified tags (OR logic) */
    matchAny?: string[];
    /** Exclude objects with these tags */
    exclude?: string[];
    /** Include inherited tags from parent hierarchy */
    includeInherited?: boolean;
    /** Filter by tag type */
    tagType?: TagType;
    /** Spatial filter - only objects within this bounding box */
    boundingBox?: Box3;
    /** Maximum distance from point (if centroid is available) */
    maxDistance?: number;
    /** Distance origin point */
    distanceFrom?: Vector3;
}
/**
 * Tag Registry Configuration
 */
export interface TagRegistryConfig {
    /** Enable automatic tag inheritance from parents */
    enableInheritance: boolean;
    /** Allow runtime tag creation */
    allowRuntimeCreation: boolean;
    /** Validate tag combinations */
    validateCombinations: boolean;
}
/**
 * Main Tagging System Class
 *
 * Provides comprehensive tagging functionality for scene objects including:
 * - Tag registration and hierarchy management
 * - Object tagging and untagging
 * - Tag-based queries and filters
 * - Inheritance and combination rules
 */
export declare class TaggingSystem {
    /** Registered tags map */
    private tags;
    /** Tag hierarchy tree */
    private tagHierarchy;
    /** Tagged objects registry */
    private taggedObjects;
    /** Objects indexed by tag for fast lookup */
    private objectsByTag;
    /** System configuration */
    private config;
    constructor(config?: Partial<TagRegistryConfig>);
    /**
     * Initialize default semantic and functional tags
     */
    private initializeDefaultTags;
    /**
     * Register a new tag in the system
     */
    registerTag(tag: Tag): boolean;
    /**
     * Update the tag hierarchy tree
     */
    private updateTagHierarchy;
    /**
     * Get a tag by ID
     */
    getTag(tagId: string): Tag | undefined;
    /**
     * Get all tags
     */
    getAllTags(): Tag[];
    /**
     * Get tags by type
     */
    getTagsByType(type: TagType): Tag[];
    /**
     * Get all ancestor tags (parents, grandparents, etc.)
     */
    getAncestorTags(tagId: string): Tag[];
    /**
     * Get all descendant tags (children, grandchildren, etc.)
     */
    getDescendantTags(tagId: string): Tag[];
    /**
     * Get effective tags for a tag (including ancestors if inheritance enabled)
     */
    getEffectiveTags(tagId: string): Set<string>;
    /**
     * Add a tag to an object
     */
    addTagToObject(objectId: string, tagId: string): boolean;
    /**
     * Add multiple tags to an object
     */
    addTagsToObject(objectId: string, tagIds: string[]): boolean;
    /**
     * Remove a tag from an object
     */
    removeTagFromObject(objectId: string, tagId: string): boolean;
    /**
     * Remove an object from the tagging system
     */
    removeObject(objectId: string): boolean;
    /**
     * Get all tags for an object
     */
    getObjectTags(objectId: string): Set<string>;
    /**
     * Check if an object has a specific tag
     */
    objectHasTag(objectId: string, tagId: string, includeInherited?: boolean): boolean;
    /**
     * Query objects by tags
     */
    queryObjects(options: TagQueryOptions): TaggedObject[];
    /**
     * Apply spatial filters to query results
     */
    private applySpatialFilters;
    /**
     * Get statistics about the tagging system
     */
    getStatistics(): TaggingStatistics;
    /**
     * Get maximum hierarchy depth
     */
    private getMaxHierarchyDepth;
    /**
     * Export tags to JSON
     */
    exportToJSON(): string;
    /**
     * Import tags from JSON
     */
    importFromJSON(json: string): boolean;
    /**
     * Clear all tags and objects
     */
    clear(): void;
}
/**
 * Tagging system statistics
 */
export interface TaggingStatistics {
    totalTags: number;
    totalObjects: number;
    tagUsage: Record<string, number>;
    hierarchyDepth: number;
}
/**
 * Create a new tagging system instance
 */
export declare function createTaggingSystem(config?: Partial<TagRegistryConfig>): TaggingSystem;
export default TaggingSystem;
//# sourceMappingURL=TaggingSystem.d.ts.map