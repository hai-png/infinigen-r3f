/**
 * TagMaterialMapper — Maps TerrainTagSystem tags to TerrainMaterialZone enums
 *
 * Bridges the gap between the TerrainTagSystem (which produces per-face tag
 * attributes like TAG_Cave, TAG_LiquidCovered, etc.) and the TerrainSurfaceBridge
 * (which assigns material zones based on height/slope heuristics alone).
 *
 * The TagMaterialMapper reads the tag dictionary from TerrainTagSystem.tagTerrain()
 * and per-face tag attributes on the geometry, then produces a per-face material
 * zone assignment that takes tags into account alongside altitude/slope data.
 *
 * Priority rules (matching original Infinigen's tag_terrain → material flow):
 * 1. Cave tag → CAVE_STONE zone
 * 2. LiquidCovered tag → WET zone (if above water) or UNDERWATER zone (if below)
 * 3. Snow tag + high altitude → SNOW zone
 * 4. Beach tag → SAND zone
 * 5. Eroded tag + steep → CLIFF zone
 * 6. Lava tag → ROCK zone (with lava emissive custom params)
 * 7. Otherwise, fall back to altitude/slope heuristics from TerrainSurfaceBridge
 *
 * @module terrain/surface
 */

import * as THREE from 'three';
import {
  TerrainTagSystem,
  TerrainTags,
  type TagResult,
} from '@/terrain/tags';
import {
  TerrainMaterialZone,
  type TerrainVertexAttributes,
  type TerrainSurfaceBridgeConfig,
} from '@/terrain/surface/SurfaceKernelPipeline';

// ============================================================================
// TagMaterialMapper
// ============================================================================

/**
 * Per-face material zone assignment result.
 */
export interface TagZoneAssignment {
  /** Per-face material zone assignments */
  faceZones: TerrainMaterialZone[];
  /** Unique zones present in the assignment */
  uniqueZones: Set<TerrainMaterialZone>;
  /** Number of faces */
  faceCount: number;
}

/**
 * Configuration for the TagMaterialMapper.
 */
export interface TagMaterialMapperConfig {
  /** Height threshold for snow zone (default: 20.0) */
  snowLine: number;
  /** Height threshold for rock zone (default: 12.0) */
  rockLine: number;
  /** Slope threshold for cliff zone in radians (default: PI/4) */
  cliffSlope: number;
  /** Slope threshold for flat/sand zone in radians (default: PI/12) */
  flatSlope: number;
  /** Distance from water for wet zone (default: 3.0) */
  waterProximity: number;
}

const DEFAULT_MAPPER_CONFIG: TagMaterialMapperConfig = {
  snowLine: 20.0,
  rockLine: 12.0,
  cliffSlope: Math.PI / 4,
  flatSlope: Math.PI / 12,
  waterProximity: 3.0,
};

/**
 * TagMaterialMapper maps terrain tags to material zones.
 *
 * This class reads the tag attributes produced by TerrainTagSystem and
 * combines them with altitude/slope data to produce a per-face material
 * zone assignment. It replaces the pure altitude/slope heuristic in
 * TerrainSurfaceBridge with a tag-aware version.
 *
 * Usage:
 * ```typescript
 * const tagResult = tagSystem.tagTerrain(geometry);
 * const mapper = new TagMaterialMapper();
 * const assignment = mapper.assignZones(geometry, tagResult, vertexAttributes);
 * ```
 */
export class TagMaterialMapper {
  private config: TagMaterialMapperConfig;

  constructor(config: Partial<TagMaterialMapperConfig> = {}) {
    this.config = { ...DEFAULT_MAPPER_CONFIG, ...config };
  }

  /**
   * Assign material zones per face based on tags + altitude/slope.
   *
   * This is the main entry point. It reads TAG_* attributes from the
   * geometry and combines them with per-vertex TerrainVertexAttributes
   * to produce per-face material zone assignments.
   *
   * @param geometry - Tagged terrain geometry (has TAG_* attributes)
   * @param tagResult - Result from TerrainTagSystem.tagTerrain()
   * @param vertexAttrs - Per-vertex terrain attributes (height, slope, etc.)
   * @returns Per-face zone assignment
   */
  assignZones(
    geometry: THREE.BufferGeometry,
    tagResult: TagResult,
    vertexAttrs: TerrainVertexAttributes[],
  ): TagZoneAssignment {
    const indexAttr = geometry.getIndex();
    const faceCount = indexAttr ? indexAttr.count / 3 : vertexAttrs.length / 3;

    const faceZones: TerrainMaterialZone[] = new Array(faceCount);
    const uniqueZones = new Set<TerrainMaterialZone>();

    for (let f = 0; f < faceCount; f++) {
      const zone = this.computeFaceZone(geometry, f, vertexAttrs, indexAttr);
      faceZones[f] = zone;
      uniqueZones.add(zone);
    }

    return { faceZones, uniqueZones, faceCount };
  }

  /**
   * Assign material zones per vertex (simpler API for non-indexed geometry).
   *
   * Each vertex gets a zone based on its tags and attributes.
   *
   * @param geometry - Tagged terrain geometry
   * @param tagResult - Result from TerrainTagSystem.tagTerrain()
   * @param vertexAttrs - Per-vertex terrain attributes
   * @returns Per-vertex zone array
   */
  assignZonesPerVertex(
    geometry: THREE.BufferGeometry,
    tagResult: TagResult,
    vertexAttrs: TerrainVertexAttributes[],
  ): { zones: TerrainMaterialZone[]; uniqueZones: Set<TerrainMaterialZone> } {
    const vertexCount = vertexAttrs.length;
    const zones: TerrainMaterialZone[] = new Array(vertexCount);
    const uniqueZones = new Set<TerrainMaterialZone>();

    for (let v = 0; v < vertexCount; v++) {
      const attr = vertexAttrs[v];
      const tags = this.getVertexTags(geometry, v);
      const zone = this.resolveZone(tags, attr.height, attr.slope, attr.caveTag, attr.liquidCovered);
      zones[v] = zone;
      uniqueZones.add(zone);
    }

    return { zones, uniqueZones };
  }

  /**
   * Compute the material zone for a single face.
   */
  private computeFaceZone(
    geometry: THREE.BufferGeometry,
    faceIndex: number,
    vertexAttrs: TerrainVertexAttributes[],
    indexAttr: THREE.BufferAttribute | null,
  ): TerrainMaterialZone {
    // Gather tags and attributes for this face
    const faceTags = this.getFaceTags(geometry, faceIndex);
    let avgHeight = 0;
    let avgSlope = 0;
    let anyCave = false;
    let anyLiquid = false;

    if (indexAttr) {
      const i0 = indexAttr.getX(faceIndex * 3);
      const i1 = indexAttr.getX(faceIndex * 3 + 1);
      const i2 = indexAttr.getX(faceIndex * 3 + 2);

      for (const idx of [i0, i1, i2]) {
        if (idx < vertexAttrs.length) {
          avgHeight += vertexAttrs[idx].height;
          avgSlope += vertexAttrs[idx].slope;
          if (vertexAttrs[idx].caveTag) anyCave = true;
          if (vertexAttrs[idx].liquidCovered) anyLiquid = true;
        }
      }
      avgHeight /= 3;
      avgSlope /= 3;
    } else {
      // Non-indexed: use vertex directly
      const vIdx = faceIndex * 3;
      if (vIdx < vertexAttrs.length) {
        avgHeight = vertexAttrs[vIdx].height;
        avgSlope = vertexAttrs[vIdx].slope;
        anyCave = vertexAttrs[vIdx].caveTag;
        anyLiquid = vertexAttrs[vIdx].liquidCovered;
      }
    }

    // Also check TAG_ attributes
    if (TerrainTagSystem.faceHasTag(geometry, faceIndex, TerrainTags.Cave)) anyCave = true;
    if (TerrainTagSystem.faceHasTag(geometry, faceIndex, TerrainTags.LiquidCovered)) anyLiquid = true;

    return this.resolveZone(faceTags, avgHeight, avgSlope, anyCave, anyLiquid);
  }

  /**
   * Resolve the material zone from tags, height, slope, and flags.
   *
   * Priority: Cave > Lava > LiquidCovered > Beach > Snow > Eroded+Cliff > Height/Slope
   */
  private resolveZone(
    tags: string[],
    height: number,
    slope: number,
    caveTag: boolean,
    liquidCovered: boolean,
  ): TerrainMaterialZone {
    // 1. Cave tag → CAVE_STONE
    if (caveTag || tags.includes(TerrainTags.Cave)) {
      return TerrainMaterialZone.CAVE_STONE;
    }

    // 2. Lava tag → ROCK (with lava custom params handled downstream)
    if (tags.includes(TerrainTags.Lava)) {
      return TerrainMaterialZone.ROCK;
    }

    // 3. LiquidCovered → WET or UNDERWATER
    if (liquidCovered || tags.includes(TerrainTags.LiquidCovered)) {
      if (height < 0) {
        return TerrainMaterialZone.UNDERWATER;
      }
      return TerrainMaterialZone.WET;
    }

    // 4. Beach tag → SAND
    if (tags.includes(TerrainTags.Beach)) {
      return TerrainMaterialZone.SAND;
    }

    // 5. Snow tag + high altitude → SNOW
    if (tags.includes(TerrainTags.Snow) || height > this.config.snowLine) {
      return TerrainMaterialZone.SNOW;
    }

    // 6. Eroded + steep → CLIFF
    if (tags.includes(TerrainTags.Eroded) && slope > this.config.cliffSlope) {
      return TerrainMaterialZone.CLIFF;
    }

    // 7. Steep → CLIFF
    if (slope > this.config.cliffSlope) {
      return TerrainMaterialZone.CLIFF;
    }

    // 8. High altitude → ROCK
    if (height > this.config.rockLine) {
      return TerrainMaterialZone.ROCK;
    }

    // 9. Near water + flat → SAND
    if (height < 1.5 && height > -0.5 && slope < this.config.flatSlope) {
      return TerrainMaterialZone.SAND;
    }

    // 10. Low + flat → GRASS
    if (height < 5 && slope < Math.PI / 10) {
      return TerrainMaterialZone.GRASS;
    }

    // 11. Moderate slope → SOIL
    if (slope > Math.PI / 8) {
      return TerrainMaterialZone.SOIL;
    }

    // 12. Default → GRASS
    return TerrainMaterialZone.GRASS;
  }

  /**
   * Get all tags applied to a face.
   */
  private getFaceTags(geometry: THREE.BufferGeometry, faceIndex: number): string[] {
    return TerrainTagSystem.getFaceTags(geometry, faceIndex);
  }

  /**
   * Get tags for a vertex by checking TAG_ attributes.
   */
  private getVertexTags(geometry: THREE.BufferGeometry, vertexIndex: number): string[] {
    const tags: string[] = [];
    const allAttrs = geometry.attributes;

    for (const name of Object.keys(allAttrs)) {
      if (name.startsWith('TAG_')) {
        const attr = allAttrs[name] as THREE.BufferAttribute;
        if (vertexIndex < attr.count && attr.getX(vertexIndex) > 0.5) {
          tags.push(name.substring(5)); // Remove TAG_ prefix
        }
      }
    }

    return tags;
  }

  /**
   * Convert a TerrainMaterialZone to a numeric index for geometry groups.
   *
   * Each unique zone gets a sequential index starting from 0.
   *
   * @param zones - Set of unique zones
   * @returns Map from zone to numeric index
   */
  static zoneToIndexMap(zones: Set<TerrainMaterialZone>): Map<TerrainMaterialZone, number> {
    const map = new Map<TerrainMaterialZone, number>();
    let idx = 0;
    // Sort for deterministic ordering
    const sorted = Array.from(zones).sort();
    for (const zone of sorted) {
      map.set(zone, idx++);
    }
    return map;
  }
}
