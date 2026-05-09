/**
 * Terrain Tag System
 *
 * Implements the `tag_terrain()` function from the original Princeton Infinigen's
 * `infinigen/terrain/core.py`. The `TerrainTagSystem` converts per-vertex element
 * tags and attribute values into face-level boolean tag masks on a
 * `THREE.BufferGeometry`, enabling downstream asset placement and material
 * selection systems to query tagged regions of the terrain mesh.
 *
 * The original Python implementation:
 * 1. Reads the `ElementTag` per-vertex attribute and converts it to face-level
 *    via `facewise_intmax` (a face gets the maximum element tag of its vertices)
 * 2. Creates `TAG_<ElementTag.map[i]>` face attributes for each distinct tag value
 * 3. Applies threshold-based tag conversion for continuous attributes:
 *    - Cave (threshold 0.5, vertex-level → remove after conversion)
 *    - LiquidCovered (threshold 0.5, vertex-level → remove)
 *    - Eroded (threshold 0.1)
 *    - Lava (threshold 0.1)
 *    - Snow (threshold 0.1)
 *    - UpsidedownMountainsLowerPart (threshold 0.5, remove)
 *    - Beach (threshold 0.5)
 *    - OutOfView (threshold 0.5, remove)
 *
 * In the R3F port, we operate on `THREE.BufferGeometry` directly and store
 * face-level tags as `THREE.BufferAttribute` with `itemSize=1` on the `FACE`
 * domain (represented as per-vertex attributes with one value per triangle,
 * since Three.js does not natively support face-domain attributes).
 *
 * @module terrain/tags
 */

import * as THREE from 'three';

// ============================================================================
// Tag Definitions
// ============================================================================

/**
 * Standard terrain tag names, matching the original Infinigen Tags and Materials
 * constants used in `tag_terrain()`.
 */
export const TerrainTags = {
  /** Tag for landscape surfaces (terrain + water) */
  Landscape: 'Landscape',
  /** Tag for cave-interior surfaces */
  Cave: 'Cave',
  /** Tag for water-covered surfaces */
  LiquidCovered: 'LiquidCovered',
  /** Tag for eroded terrain surfaces */
  Eroded: 'Eroded',
  /** Tag for lava surfaces */
  Lava: 'Lava',
  /** Tag for snow-covered surfaces */
  Snow: 'Snow',
  /** Tag for upside-down mountain lower parts */
  UpsidedownMountainsLowerPart: 'UpsidedownMountainsLowerPart',
  /** Tag for beach/shoreline surfaces */
  Beach: 'Beach',
  /** Tag for out-of-view surfaces (camera frustum culling) */
  OutOfView: 'OutOfView',
} as const;

export type TerrainTagName = typeof TerrainTags[keyof typeof TerrainTags];

/**
 * Element tag enumeration values.
 *
 * Each terrain element type is assigned a unique integer tag value. The
 * `ElementTag.map` maps these integers to human-readable strings. This
 * mirrors the original Python `ElementTag` class.
 */
export const ElementTag = {
  /** Ground terrain */
  Ground: 0,
  /** LandTiles terrain */
  LandTiles: 1,
  /** Mountain terrain */
  Mountains: 2,
  /** Cave surfaces */
  Cave: 3,
  /** Voronoi rock surfaces */
  VoronoiRocks: 4,
  /** Warped rock surfaces */
  WarpedRocks: 5,
  /** Water/liquid surfaces */
  Liquid: 6,
  /** Upside-down mountain surfaces */
  UpsidedownMountains: 7,
  /** Atmosphere surfaces */
  Atmosphere: 8,
  /** Volcano surfaces */
  Volcanos: 9,
  /** Floating ice surfaces */
  FloatingIce: 10,
  /** Total count of element tag values */
  total_cnt: 11,
} as const;

export type ElementTagValue = typeof ElementTag[keyof typeof ElementTag];

/**
 * Mapping from element tag integer values to string names.
 *
 * Used to create `TAG_<name>` face attributes during tag_terrain processing.
 */
export const ElementTagMap: Record<number, string> = {
  [ElementTag.Ground]: 'Ground',
  [ElementTag.LandTiles]: 'LandTiles',
  [ElementTag.Mountains]: 'Mountains',
  [ElementTag.Cave]: 'Cave',
  [ElementTag.VoronoiRocks]: 'VoronoiRocks',
  [ElementTag.WarpedRocks]: 'WarpedRocks',
  [ElementTag.Liquid]: 'Liquid',
  [ElementTag.UpsidedownMountains]: 'UpsidedownMountains',
  [ElementTag.Atmosphere]: 'Atmosphere',
  [ElementTag.Volcanos]: 'Volcanos',
  [ElementTag.FloatingIce]: 'FloatingIce',
};

// ============================================================================
// Tag Threshold Configuration
// ============================================================================

/**
 * Configuration for a single threshold-based tag.
 *
 * Each threshold tag reads a vertex-level float attribute, converts it to
 * face-level via averaging, then applies the threshold to produce a boolean
 * face-level mask.
 *
 * `toRemove` controls whether the original vertex-level attribute is removed
 * after conversion (matching the original Python behavior where some tags
 * like LiquidCovered and OutOfView are consumed and not kept as vertex attrs).
 */
export interface TagThresholdConfig {
  /** Name of the source attribute on the geometry */
  attributeName: string;
  /** Threshold value: face-level average > threshold => tagged */
  threshold: number;
  /** Whether to remove the source attribute after conversion */
  toRemove: boolean;
  /** Target tag name (defaults to attributeName) */
  tagName?: string;
}

/**
 * Default tag thresholds matching the original Infinigen `tag_terrain()`.
 *
 * The thresholds are:
 * - Cave: 0.5, remove source attribute after conversion
 * - LiquidCovered: 0.5, remove source attribute
 * - Eroded: 0.1, keep source attribute
 * - Lava: 0.1, keep source attribute
 * - Snow: 0.1, keep source attribute
 * - UpsidedownMountainsLowerPart: 0.5, remove source attribute
 * - Beach: 0.5, keep source attribute
 * - OutOfView: 0.5, remove source attribute
 */
export const DEFAULT_TAG_THRESHOLDS: TagThresholdConfig[] = [
  { attributeName: 'Cave', threshold: 0.5, toRemove: true },
  { attributeName: 'LiquidCovered', threshold: 0.5, toRemove: true },
  { attributeName: 'Eroded', threshold: 0.1, toRemove: false },
  { attributeName: 'Lava', threshold: 0.1, toRemove: false },
  { attributeName: 'Snow', threshold: 0.1, toRemove: false },
  { attributeName: 'UpsidedownMountainsLowerPart', threshold: 0.5, toRemove: true },
  { attributeName: 'Beach', threshold: 0.5, toRemove: false },
  { attributeName: 'OutOfView', threshold: 0.5, toRemove: true },
];

// ============================================================================
// Face-Level Conversion Helpers
// ============================================================================

/**
 * Compute face-level integer max from a per-vertex integer attribute.
 *
 * For each triangle face, takes the maximum of the three vertex values.
 * This mirrors the Python `mesh.facewise_intmax(element_tag)`.
 *
 * @param vertexValues - Per-vertex integer values (length = vertexCount)
 * @param indexBuffer - Triangle index buffer (length = faceCount * 3)
 * @returns Per-face integer values (length = faceCount)
 */
function facewiseIntMax(
  vertexValues: Int32Array,
  indexBuffer: Uint32Array | Uint16Array,
): Int32Array {
  const faceCount = indexBuffer.length / 3;
  const result = new Int32Array(faceCount);

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexBuffer[f * 3];
    const i1 = indexBuffer[f * 3 + 1];
    const i2 = indexBuffer[f * 3 + 2];

    result[f] = Math.max(
      vertexValues[i0],
      vertexValues[i1],
      vertexValues[i2],
    );
  }

  return result;
}

/**
 * Compute face-level mean from a per-vertex float attribute.
 *
 * For each triangle face, takes the average of the three vertex values.
 * This mirrors the Python `mesh.facewise_mean(tag)`.
 *
 * @param vertexValues - Per-vertex float values (length = vertexCount)
 * @param indexBuffer - Triangle index buffer (length = faceCount * 3)
 * @returns Per-face float values (length = faceCount)
 */
function facewiseMean(
  vertexValues: Float32Array,
  indexBuffer: Uint32Array | Uint16Array,
): Float32Array {
  const faceCount = indexBuffer.length / 3;
  const result = new Float32Array(faceCount);

  for (let f = 0; f < faceCount; f++) {
    const i0 = indexBuffer[f * 3];
    const i1 = indexBuffer[f * 3 + 1];
    const i2 = indexBuffer[f * 3 + 2];

    result[f] = (vertexValues[i0] + vertexValues[i1] + vertexValues[i2]) / 3.0;
  }

  return result;
}

/**
 * Convert a boolean mask (per-face) to a Float32Array of 0.0/1.0 values.
 */
function boolMaskToFloat(mask: boolean[]): Float32Array {
  const result = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = mask[i] ? 1.0 : 0.0;
  }
  return result;
}

// ============================================================================
// TerrainTagSystem
// ============================================================================

/**
 * Tag application result containing the tagged geometry and tag dictionary.
 */
export interface TagResult {
  /** The geometry with tag attributes applied */
  geometry: THREE.BufferGeometry;
  /**
   * Dictionary mapping composite tag keys to integer IDs.
   * Used by downstream placement systems to query tagged faces.
   *
   * Keys are dot-separated tag combinations (e.g., "Landscape.Cave"),
   * values are sequential integer IDs.
   */
  tagDict: Map<string, number>;
}

/**
 * Terrain tag system implementing the original Infinigen `tag_terrain()` logic.
 *
 * This class processes a terrain mesh geometry and applies face-level tags
 * based on:
 * 1. Element tags: Per-vertex integer tags converted to face-level via max
 * 2. Threshold tags: Per-vertex float attributes converted to face-level
 *    boolean masks via averaging + threshold comparison
 *
 * The tagging process produces `TAG_<name>` attributes on the geometry that
 * can be queried by asset placement systems for constraint satisfaction.
 *
 * Usage:
 * ```typescript
 * const tagSystem = new TerrainTagSystem();
 * const result = tagSystem.tagTerrain(geometry);
 * // result.geometry now has TAG_Cave, TAG_LiquidCovered, etc.
 * // result.tagDict maps "Landscape.Cave" -> 0, etc.
 * ```
 */
export class TerrainTagSystem {
  /** Tag thresholds to apply */
  private thresholds: TagThresholdConfig[];

  /** Whether to add the "Landscape" base tag */
  private addLandscapeTag: boolean;

  /** Built tag dictionary for downstream queries */
  private tagDict: Map<string, number>;

  /** Next available tag ID for the tag dictionary */
  private nextTagId: number;

  /**
   * Create a new TerrainTagSystem.
   *
   * @param thresholds - Tag threshold configurations (defaults to DEFAULT_TAG_THRESHOLDS)
   * @param addLandscapeTag - Whether to add a "Landscape" base tag to all tagged objects
   */
  constructor(
    thresholds: TagThresholdConfig[] = DEFAULT_TAG_THRESHOLDS,
    addLandscapeTag: boolean = true,
  ) {
    this.thresholds = thresholds;
    this.addLandscapeTag = addLandscapeTag;
    this.tagDict = new Map();
    this.nextTagId = 0;
  }

  /**
   * Apply terrain tags to a geometry.
   *
   * This is the main entry point, equivalent to calling `tag_terrain(obj)`
   * in the original Infinigen. It processes element tags and threshold tags,
   * adding face-level tag attributes to the geometry.
   *
   * @param geometry - The terrain mesh geometry to tag
   * @returns Tag result with the modified geometry and tag dictionary
   */
  tagTerrain(geometry: THREE.BufferGeometry): TagResult {
    // Reset tag dictionary for this tagging session
    this.tagDict = new Map();
    this.nextTagId = 0;

    // Check for empty geometry
    const posAttr = geometry.getAttribute('position');
    if (!posAttr || posAttr.count === 0) {
      return { geometry, tagDict: this.tagDict };
    }

    // Get index buffer (or create one if non-indexed)
    let indexBuffer: Uint32Array | Uint16Array;
    if (geometry.index) {
      indexBuffer = geometry.index.array as Uint32Array | Uint16Array;
    } else {
      // Non-indexed geometry: create a synthetic index buffer
      const vertexCount = posAttr.count;
      const faceCount = vertexCount / 3;
      indexBuffer = new Uint32Array(faceCount * 3);
      for (let i = 0; i < vertexCount; i++) {
        indexBuffer[i] = i;
      }
    }

    // ====================================================================
    // Step 1: Process ElementTag
    // ====================================================================
    this.processElementTags(geometry, indexBuffer);

    // ====================================================================
    // Step 2: Process Threshold Tags
    // ====================================================================
    this.processThresholdTags(geometry, indexBuffer);

    return { geometry, tagDict: this.tagDict };
  }

  /**
   * Get the current tag dictionary after processing.
   *
   * The tag dictionary maps composite tag keys (dot-separated) to integer IDs.
   * This is used by placement systems to query tagged face regions.
   *
   * @returns The tag dictionary
   */
  getTagDict(): Map<string, number> {
    return this.tagDict;
  }

  // ========================================================================
  // Private: Element Tag Processing
  // ========================================================================

  /**
   * Process the ElementTag per-vertex attribute and create face-level tag masks.
   *
   * For each distinct element tag value present in the mesh:
   * 1. Compute face-level element tag via `facewiseIntMax`
   * 2. Create a boolean mask where facewise_tag == tagValue
   * 3. Add a `TAG_<ElementTagMap[tagValue]>` attribute
   * 4. Register the tag in the tag dictionary
   *
   * The original `ElementTag` attribute is removed after processing.
   *
   * @param geometry - The geometry to process
   * @param indexBuffer - Triangle index buffer
   */
  private processElementTags(
    geometry: THREE.BufferGeometry,
    indexBuffer: Uint32Array | Uint16Array,
  ): void {
    const elementTagAttr = geometry.getAttribute('ElementTag');
    if (!elementTagAttr) {
      // No element tag attribute; skip element tag processing
      return;
    }

    // Read per-vertex element tag values
    const vertexCount = elementTagAttr.count;
    const elementTagValues = new Int32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      elementTagValues[i] = Math.round(elementTagAttr.getX(i));
    }

    // Convert to face-level via max
    const faceElementTags = facewiseIntMax(elementTagValues, indexBuffer);
    const faceCount = faceElementTags.length;

    let firstTag = true;

    // For each possible element tag value, create a face-level mask
    for (let tagValue = 0; tagValue < ElementTag.total_cnt; tagValue++) {
      // Create mask: which faces have this element tag?
      const mask: boolean[] = new Array(faceCount);
      let hasAny = false;

      for (let f = 0; f < faceCount; f++) {
        mask[f] = faceElementTags[f] === tagValue;
        if (mask[f]) hasAny = true;
      }

      if (!hasAny) continue;

      // Get the tag name from the mapping
      const tagName = ElementTagMap[tagValue] ?? `Unknown_${tagValue}`;
      const attrName = `TAG_${tagName}`;

      // Create the face-level attribute
      const tagFloatData = boolMaskToFloat(mask);
      geometry.setAttribute(attrName, new THREE.BufferAttribute(tagFloatData, 1));

      // Register in tag dictionary
      this.registerTag(tagName);

      // Add the "Landscape" base tag on the first element tag found
      if (firstTag && this.addLandscapeTag) {
        this.registerTag(TerrainTags.Landscape);
        firstTag = false;
      }
    }

    // Remove the original ElementTag attribute
    geometry.deleteAttribute('ElementTag');
  }

  // ========================================================================
  // Private: Threshold Tag Processing
  // ========================================================================

  /**
   * Process threshold-based tags from continuous vertex attributes.
   *
   * For each configured threshold tag:
   * 1. Read the source attribute from the geometry
   * 2. Compute face-level mean via `facewiseMean`
   * 3. Apply threshold: faceMean > threshold => tagged
   * 4. If any faces are tagged, create `TAG_<tagName>` attribute
   * 5. If `toRemove` is true, delete the source attribute
   * 6. Register the tag in the tag dictionary
   *
   * @param geometry - The geometry to process
   * @param indexBuffer - Triangle index buffer
   */
  private processThresholdTags(
    geometry: THREE.BufferGeometry,
    indexBuffer: Uint32Array | Uint16Array,
  ): void {
    for (const config of this.thresholds) {
      const sourceAttr = geometry.getAttribute(config.attributeName);
      if (!sourceAttr) continue;

      // Read per-vertex float values
      const vertexCount = sourceAttr.count;
      const vertexValues = new Float32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) {
        vertexValues[i] = sourceAttr.getX(i);
      }

      // Compute face-level mean
      const faceMeans = facewiseMean(vertexValues, indexBuffer);
      const faceCount = faceMeans.length;

      // Apply threshold
      const mask: boolean[] = new Array(faceCount);
      let hasAny = false;

      for (let f = 0; f < faceCount; f++) {
        mask[f] = faceMeans[f] > config.threshold;
        if (mask[f]) hasAny = true;
      }

      // Remove source attribute if configured
      if (config.toRemove) {
        geometry.deleteAttribute(config.attributeName);
      }

      if (!hasAny) continue;

      // Create the face-level tag attribute
      const tagName = config.tagName ?? config.attributeName;
      const attrName = `TAG_${tagName}`;
      const tagFloatData = boolMaskToFloat(mask);
      geometry.setAttribute(attrName, new THREE.BufferAttribute(tagFloatData, 1));

      // Register in tag dictionary
      this.registerTag(tagName);
    }
  }

  // ========================================================================
  // Private: Tag Dictionary Management
  // ========================================================================

  /**
   * Register a tag in the tag dictionary.
   *
   * The tag dictionary maps composite tag keys to sequential integer IDs.
   * This enables downstream placement systems to efficiently query tagged
   * regions by integer ID rather than string comparison.
   *
   * @param tagName - The tag name to register
   */
  private registerTag(tagName: string): void {
    // Register the individual tag
    if (!this.tagDict.has(tagName)) {
      this.tagDict.set(tagName, this.nextTagId++);
    }

    // Also register composite tags (e.g., "Landscape.Cave")
    if (this.addLandscapeTag && tagName !== TerrainTags.Landscape) {
      const compositeKey = `${TerrainTags.Landscape}.${tagName}`;
      if (!this.tagDict.has(compositeKey)) {
        this.tagDict.set(compositeKey, this.nextTagId++);
      }
    }
  }

  // ========================================================================
  // Static Utility Methods
  // ========================================================================

  /**
   * Query whether a face has a specific tag.
   *
   * @param geometry - The tagged geometry
   * @param faceIndex - Index of the face (triangle)
   * @param tagName - Name of the tag to query (without TAG_ prefix)
   * @returns Whether the face has the tag
   */
  static faceHasTag(
    geometry: THREE.BufferGeometry,
    faceIndex: number,
    tagName: string,
  ): boolean {
    const attrName = `TAG_${tagName}`;
    const attr = geometry.getAttribute(attrName);
    if (!attr) return false;
    return attr.getX(faceIndex) > 0.5;
  }

  /**
   * Get all faces matching a specific tag.
   *
   * @param geometry - The tagged geometry
   * @param tagName - Name of the tag to query (without TAG_ prefix)
   * @returns Array of face indices that have the tag
   */
  static getTaggedFaces(
    geometry: THREE.BufferGeometry,
    tagName: string,
  ): number[] {
    const attrName = `TAG_${tagName}`;
    const attr = geometry.getAttribute(attrName);
    if (!attr) return [];

    const result: number[] = [];
    for (let i = 0; i < attr.count; i++) {
      if (attr.getX(i) > 0.5) {
        result.push(i);
      }
    }
    return result;
  }

  /**
   * Get all tags applied to a specific face.
   *
   * @param geometry - The tagged geometry
   * @param faceIndex - Index of the face
   * @returns Array of tag names applied to this face
   */
  static getFaceTags(
    geometry: THREE.BufferGeometry,
    faceIndex: number,
  ): string[] {
    const tags: string[] = [];
    const allAttrs = geometry.attributes;

    for (const name of Object.keys(allAttrs)) {
      if (name.startsWith('TAG_')) {
        const attr = allAttrs[name] as THREE.BufferAttribute;
        if (faceIndex < attr.count && attr.getX(faceIndex) > 0.5) {
          tags.push(name.substring(5)); // Remove TAG_ prefix
        }
      }
    }

    return tags;
  }

  /**
   * Count the number of faces with each tag.
   *
   * @param geometry - The tagged geometry
   * @returns Map of tag name to face count
   */
  static countTaggedFaces(
    geometry: THREE.BufferGeometry,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    const allAttrs = geometry.attributes;

    for (const name of Object.keys(allAttrs)) {
      if (name.startsWith('TAG_')) {
        const attr = allAttrs[name] as THREE.BufferAttribute;
        let count = 0;
        for (let i = 0; i < attr.count; i++) {
          if (attr.getX(i) > 0.5) count++;
        }
        counts.set(name.substring(5), count);
      }
    }

    return counts;
  }

  /**
   * Merge tag attributes from multiple geometries into a single geometry.
   *
   * Used when combining multiple terrain meshes (opaque, transparent, etc.)
   * into a unified mesh for placement queries.
   *
   * @param geometries - Array of geometries with tag attributes
   * @returns Merged tag attributes as a map of attribute name to Float32Array
   */
  static mergeTagAttributes(
    geometries: THREE.BufferGeometry[],
  ): Map<string, Float32Array> {
    const merged = new Map<string, Float32Array>();
    const tempArrays: Map<string, number[]> = new Map();

    for (const geom of geometries) {
      const allAttrs = geom.attributes;
      for (const name of Object.keys(allAttrs)) {
        if (!name.startsWith('TAG_')) continue;
        const attr = allAttrs[name] as THREE.BufferAttribute;
        if (!tempArrays.has(name)) {
          tempArrays.set(name, []);
        }
        const arr = tempArrays.get(name)!;
        for (let i = 0; i < attr.count; i++) {
          arr.push(attr.getX(i));
        }
      }
    }

    for (const [name, arr] of tempArrays) {
      merged.set(name, new Float32Array(arr));
    }

    return merged;
  }
}
