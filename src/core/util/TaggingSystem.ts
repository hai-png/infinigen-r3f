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
export type TagType = 
  | 'semantic'      // Semantic category (e.g., 'chair', 'table')
  | 'functional'    // Functional role (e.g., 'sittable', 'graspable')
  | 'material'      // Material type (e.g., 'wooden', 'metallic')
  | 'spatial'       // Spatial relationship (e.g., 'floor-mounted', 'wall-hung')
  | 'custom';       // User-defined tags

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
 * Tag hierarchy node for efficient inheritance queries
 */
interface TagHierarchyNode {
  tag: Tag;
  children: Map<string, TagHierarchyNode>;
  parent: TagHierarchyNode | null;
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
 * Default tag registry configuration
 */
const DEFAULT_CONFIG: TagRegistryConfig = {
  enableInheritance: true,
  allowRuntimeCreation: true,
  validateCombinations: false,
};

/**
 * Main Tagging System Class
 * 
 * Provides comprehensive tagging functionality for scene objects including:
 * - Tag registration and hierarchy management
 * - Object tagging and untagging
 * - Tag-based queries and filters
 * - Inheritance and combination rules
 */
export class TaggingSystem {
  /** Registered tags map */
  private tags: Map<string, Tag> = new Map();
  
  /** Tag hierarchy tree */
  private tagHierarchy: Map<string, TagHierarchyNode> = new Map();
  
  /** Tagged objects registry */
  private taggedObjects: Map<string, TaggedObject> = new Map();
  
  /** Objects indexed by tag for fast lookup */
  private objectsByTag: Map<string, Set<string>> = new Map();
  
  /** System configuration */
  private config: TagRegistryConfig;

  constructor(config: Partial<TagRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultTags();
  }

  /**
   * Initialize default semantic and functional tags
   */
  private initializeDefaultTags(): void {
    // Semantic categories
    this.registerTag({
      id: 'furniture',
      name: 'Furniture',
      type: 'semantic',
      children: [],
      combinable: true,
    });

    this.registerTag({
      id: 'appliance',
      name: 'Appliance',
      type: 'semantic',
      parent: 'furniture',
      combinable: true,
    });

    this.registerTag({
      id: 'decor',
      name: 'Decoration',
      type: 'semantic',
      parent: 'furniture',
      combinable: true,
    });

    // Functional tags
    this.registerTag({
      id: 'sittable',
      name: 'Sittable',
      type: 'functional',
      combinable: true,
      metadata: { typicalHeight: 0.45 },
    });

    this.registerTag({
      id: 'graspable',
      name: 'Graspable',
      type: 'functional',
      combinable: true,
    });

    this.registerTag({
      id: 'openable',
      name: 'Openable',
      type: 'functional',
      combinable: true,
    });

    this.registerTag({
      id: 'movable',
      name: 'Movable',
      type: 'functional',
      combinable: true,
    });

    this.registerTag({
      id: 'static',
      name: 'Static',
      type: 'functional',
      combinable: true,
    });

    // Material tags
    this.registerTag({
      id: 'wooden',
      name: 'Wooden',
      type: 'material',
      combinable: true,
    });

    this.registerTag({
      id: 'metallic',
      name: 'Metallic',
      type: 'material',
      combinable: true,
    });

    this.registerTag({
      id: 'plastic',
      name: 'Plastic',
      type: 'material',
      combinable: true,
    });

    this.registerTag({
      id: 'glass',
      name: 'Glass',
      type: 'material',
      combinable: true,
    });

    this.registerTag({
      id: 'fabric',
      name: 'Fabric',
      type: 'material',
      combinable: true,
    });

    // Spatial tags
    this.registerTag({
      id: 'floor-mounted',
      name: 'Floor Mounted',
      type: 'spatial',
      combinable: true,
    });

    this.registerTag({
      id: 'wall-mounted',
      name: 'Wall Mounted',
      type: 'spatial',
      combinable: true,
    });

    this.registerTag({
      id: 'ceiling-mounted',
      name: 'Ceiling Mounted',
      type: 'spatial',
      combinable: true,
    });

    this.registerTag({
      id: 'freestanding',
      name: 'Freestanding',
      type: 'spatial',
      combinable: true,
    });
  }

  /**
   * Register a new tag in the system
   */
  registerTag(tag: Tag): boolean {
    if (this.tags.has(tag.id)) {
      console.warn(`Tag '${tag.id}' already exists. Updating...`);
    }

    // Validate tag
    if (this.config.validateCombinations && tag.parent) {
      const parent = this.tags.get(tag.parent);
      if (!parent) {
        console.error(`Parent tag '${tag.parent}' not found for tag '${tag.id}'`);
        return false;
      }
    }

    // Store tag
    this.tags.set(tag.id, tag);

    // Update hierarchy
    this.updateTagHierarchy(tag);

    // Initialize object set for this tag
    if (!this.objectsByTag.has(tag.id)) {
      this.objectsByTag.set(tag.id, new Set());
    }

    return true;
  }

  /**
   * Update the tag hierarchy tree
   */
  private updateTagHierarchy(tag: Tag): void {
    let node = this.tagHierarchy.get(tag.id);
    
    if (!node) {
      node = {
        tag,
        children: new Map(),
        parent: null,
      };
      this.tagHierarchy.set(tag.id, node);
    } else {
      node.tag = tag;
    }

    // Handle parent relationship
    if (tag.parent) {
      const parentNode = this.tagHierarchy.get(tag.parent);
      if (parentNode) {
        node.parent = parentNode;
        parentNode.children.set(tag.id, node);
      } else {
        console.warn(`Parent tag '${tag.parent}' not found in hierarchy`);
      }
    }

    // Handle children
    if (tag.children) {
      for (const childId of tag.children) {
        const childNode = this.tagHierarchy.get(childId);
        if (childNode) {
          childNode.parent = node;
          node.children.set(childId, childNode);
        }
      }
    }
  }

  /**
   * Get a tag by ID
   */
  getTag(tagId: string): Tag | undefined {
    return this.tags.get(tagId);
  }

  /**
   * Get all tags
   */
  getAllTags(): Tag[] {
    return Array.from(this.tags.values());
  }

  /**
   * Get tags by type
   */
  getTagsByType(type: TagType): Tag[] {
    return this.getAllTags().filter(tag => tag.type === type);
  }

  /**
   * Get all ancestor tags (parents, grandparents, etc.)
   */
  getAncestorTags(tagId: string): Tag[] {
    const ancestors: Tag[] = [];
    let currentNode = this.tagHierarchy.get(tagId);

    while (currentNode?.parent) {
      ancestors.push(currentNode.parent.tag);
      currentNode = currentNode.parent;
    }

    return ancestors;
  }

  /**
   * Get all descendant tags (children, grandchildren, etc.)
   */
  getDescendantTags(tagId: string): Tag[] {
    const descendants: Tag[] = [];
    const node = this.tagHierarchy.get(tagId);

    if (!node) return descendants;

    const traverse = (n: TagHierarchyNode) => {
      for (const [, childNode] of n.children) {
        descendants.push(childNode.tag);
        traverse(childNode);
      }
    };

    traverse(node);
    return descendants;
  }

  /**
   * Get effective tags for a tag (including ancestors if inheritance enabled)
   */
  getEffectiveTags(tagId: string): Set<string> {
    const effective = new Set<string>([tagId]);

    if (this.config.enableInheritance) {
      const ancestors = this.getAncestorTags(tagId);
      ancestors.forEach(a => effective.add(a.id));
    }

    return effective;
  }

  /**
   * Add a tag to an object
   */
  addTagToObject(objectId: string, tagId: string): boolean {
    const tag = this.tags.get(tagId);
    if (!tag) {
      console.error(`Tag '${tagId}' not found`);
      return false;
    }

    let taggedObj = this.taggedObjects.get(objectId);
    
    if (!taggedObj) {
      taggedObj = {
        objectId,
        tags: new Set(),
      };
      this.taggedObjects.set(objectId, taggedObj);
    }

    // Add the tag
    taggedObj.tags.add(tagId);

    // Add to index
    if (!this.objectsByTag.has(tagId)) {
      this.objectsByTag.set(tagId, new Set());
    }
    this.objectsByTag.get(tagId)!.add(objectId);

    // Add inherited tags if enabled
    if (this.config.enableInheritance) {
      const ancestors = this.getAncestorTags(tagId);
      for (const ancestor of ancestors) {
        taggedObj.tags.add(ancestor.id);
        if (!this.objectsByTag.has(ancestor.id)) {
          this.objectsByTag.set(ancestor.id, new Set());
        }
        this.objectsByTag.get(ancestor.id)!.add(objectId);
      }
    }

    return true;
  }

  /**
   * Add multiple tags to an object
   */
  addTagsToObject(objectId: string, tagIds: string[]): boolean {
    let success = true;
    for (const tagId of tagIds) {
      if (!this.addTagToObject(objectId, tagId)) {
        success = false;
      }
    }
    return success;
  }

  /**
   * Remove a tag from an object
   */
  removeTagFromObject(objectId: string, tagId: string): boolean {
    const taggedObj = this.taggedObjects.get(objectId);
    if (!taggedObj) return false;

    taggedObj.tags.delete(tagId);

    // Remove from index
    const objectSet = this.objectsByTag.get(tagId);
    if (objectSet) {
      objectSet.delete(objectId);
    }

    // Remove inherited tags if they were only added through this tag
    if (this.config.enableInheritance) {
      const tag = this.tags.get(tagId);
      if (tag) {
        // Check if any other direct tags provide this inheritance
        const stillInherited = Array.from(taggedObj.tags).some(t => {
          if (t === tagId) return false;
          const ancestors = this.getAncestorTags(t);
          return ancestors.some(a => a.id === tagId);
        });

        if (!stillInherited) {
          taggedObj.tags.delete(tagId);
          const objectSet = this.objectsByTag.get(tagId);
          if (objectSet) {
            objectSet.delete(objectId);
          }
        }
      }
    }

    return true;
  }

  /**
   * Remove an object from the tagging system
   */
  removeObject(objectId: string): boolean {
    const taggedObj = this.taggedObjects.get(objectId);
    if (!taggedObj) return false;

    // Remove from all tag indices
    for (const tagId of taggedObj.tags) {
      const objectSet = this.objectsByTag.get(tagId);
      if (objectSet) {
        objectSet.delete(objectId);
      }
    }

    this.taggedObjects.delete(objectId);
    return true;
  }

  /**
   * Get all tags for an object
   */
  getObjectTags(objectId: string): Set<string> {
    const taggedObj = this.taggedObjects.get(objectId);
    return taggedObj ? new Set(taggedObj.tags) : new Set();
  }

  /**
   * Check if an object has a specific tag
   */
  objectHasTag(objectId: string, tagId: string, includeInherited: boolean = true): boolean {
    const taggedObj = this.taggedObjects.get(objectId);
    if (!taggedObj) return false;

    if (includeInherited) {
      return taggedObj.tags.has(tagId);
    }

    // For non-inherited check, we'd need to track direct vs inherited separately
    // For now, just check if it has the tag
    return taggedObj.tags.has(tagId);
  }

  /**
   * Query objects by tags
   */
  queryObjects(options: TagQueryOptions): TaggedObject[] {
    let candidateIds: Set<string>;

    // Start with most restrictive filter
    if (options.matchAll && options.matchAll.length > 0) {
      // AND logic - intersection of all tag sets
      candidateIds = new Set(this.objectsByTag.get(options.matchAll[0]) || []);
      for (let i = 1; i < options.matchAll.length; i++) {
        const tagSet = this.objectsByTag.get(options.matchAll[i]) || new Set();
        candidateIds = new Set([...candidateIds].filter(id => tagSet.has(id)));
      }
    } else if (options.matchAny && options.matchAny.length > 0) {
      // OR logic - union of tag sets
      candidateIds = new Set();
      for (const tagId of options.matchAny) {
        const tagSet = this.objectsByTag.get(tagId) || new Set();
        tagSet.forEach(id => candidateIds.add(id));
      }
    } else {
      // No tag filter - all objects
      candidateIds = new Set(this.taggedObjects.keys());
    }

    // Apply exclusion filter
    if (options.exclude && options.exclude.length > 0) {
      const excludeIds = new Set<string>();
      for (const tagId of options.exclude) {
        const tagSet = this.objectsByTag.get(tagId) || new Set();
        tagSet.forEach(id => excludeIds.add(id));
      }
      candidateIds = new Set([...candidateIds].filter(id => !excludeIds.has(id)));
    }

    // Apply tag type filter
    if (options.tagType) {
      const validTagIds = this.getTagsByType(options.tagType).map(t => t.id);
      candidateIds = new Set([...candidateIds].filter(id => {
        const obj = this.taggedObjects.get(id);
        if (!obj) return false;
        return Array.from(obj.tags).some(t => validTagIds.includes(t));
      }));
    }

    // Convert to results
    const results: TaggedObject[] = [];
    for (const id of candidateIds) {
      const obj = this.taggedObjects.get(id);
      if (obj) {
        results.push(obj);
      }
    }

    // Apply spatial filters
    return this.applySpatialFilters(results, options);
  }

  /**
   * Apply spatial filters to query results
   */
  private applySpatialFilters(
    objects: TaggedObject[],
    options: TagQueryOptions
  ): TaggedObject[] {
    let filtered = objects;

    // Bounding box filter
    if (options.boundingBox) {
      filtered = filtered.filter(obj => {
        if (!obj.boundingBox) return false;
        return options.boundingBox!.intersectsBox(obj.boundingBox);
      });
    }

    // Distance filter
    if (options.maxDistance !== undefined && options.distanceFrom) {
      filtered = filtered.filter(obj => {
        if (!obj.centroid) return false;
        return obj.centroid!.distanceTo(options.distanceFrom!) <= options.maxDistance!;
      });
    }

    return filtered;
  }

  /**
   * Get statistics about the tagging system
   */
  getStatistics(): TaggingStatistics {
    const tagCounts: Record<string, number> = {};
    
    this.tags.forEach((_, tagId) => {
      const objectSet = this.objectsByTag.get(tagId);
      tagCounts[tagId] = objectSet ? objectSet.size : 0;
    });

    return {
      totalTags: this.tags.size,
      totalObjects: this.taggedObjects.size,
      tagUsage: tagCounts,
      hierarchyDepth: this.getMaxHierarchyDepth(),
    };
  }

  /**
   * Get maximum hierarchy depth
   */
  private getMaxHierarchyDepth(): number {
    let maxDepth = 0;

    const traverse = (node: TagHierarchyNode | null, depth: number): void => {
      if (!node) return;
      maxDepth = Math.max(maxDepth, depth);
      node.children.forEach(child => traverse(child, depth + 1));
    };

    this.tagHierarchy.forEach(node => {
      if (!node.parent) {
        traverse(node, 1);
      }
    });

    return maxDepth;
  }

  /**
   * Export tags to JSON
   */
  exportToJSON(): string {
    const data = {
      tags: this.getAllTags(),
      objects: Array.from(this.taggedObjects.entries()).map(([id, obj]) => ({
        objectId: id,
        tags: Array.from(obj.tags),
      })),
      statistics: this.getStatistics(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import tags from JSON
   */
  importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);
      
      // Import tags
      if (data.tags) {
        for (const tag of data.tags) {
          this.registerTag(tag);
        }
      }

      // Import objects
      if (data.objects) {
        for (const obj of data.objects) {
          this.addTagsToObject(obj.objectId, obj.tags);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to import tags:', error);
      return false;
    }
  }

  /**
   * Clear all tags and objects
   */
  clear(): void {
    this.tags.clear();
    this.tagHierarchy.clear();
    this.taggedObjects.clear();
    this.objectsByTag.clear();
    this.initializeDefaultTags();
  }
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
export function createTaggingSystem(config?: Partial<TagRegistryConfig>): TaggingSystem {
  return new TaggingSystem(config);
}

export default TaggingSystem;
