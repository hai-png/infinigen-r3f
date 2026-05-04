/**
 * AttributeIO - Per-vertex/face data I/O system for geometry nodes
 *
 * Matches Infinigen's attribute system (from `core/surface.py` and Blender's
 * attribute architecture). Provides:
 *
 * - Typed attribute data containers (NamedAttribute) for FLOAT, FLOAT2,
 *   FLOAT3, FLOAT4, INT, BOOLEAN, and STRING data on POINT, EDGE, FACE,
 *   CORNER, or INSTANCE domains.
 * - An AttributeManager that tracks all named attributes on a geometry and
 *   handles round-tripping to / from THREE.BufferGeometry.
 * - Helper functions for reading, writing, and creating attributes.
 * - Standard attribute name constants matching Blender/Infinigen conventions.
 *
 * Port of: Princeton Infinigen's attribute I/O system
 */

import * as THREE from 'three';

// ============================================================================
// Enums
// ============================================================================

/**
 * Data types for named attributes, matching Blender's attribute types.
 */
export enum AttributeType {
  FLOAT = 'FLOAT',
  FLOAT2 = 'FLOAT2',
  FLOAT3 = 'FLOAT3',
  FLOAT4 = 'FLOAT4',
  INT = 'INT',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
}

/**
 * Domains that an attribute can live on, matching Blender's attribute domains.
 */
export enum AttributeDomain {
  POINT = 'POINT',
  EDGE = 'EDGE',
  FACE = 'FACE',
  CORNER = 'CORNER',
  INSTANCE = 'INSTANCE',
}

// ============================================================================
// Item size lookup
// ============================================================================

/** Number of float components per element for each AttributeType */
const ATTRIBUTE_ITEM_SIZE: Record<AttributeType, number> = {
  [AttributeType.FLOAT]: 1,
  [AttributeType.FLOAT2]: 2,
  [AttributeType.FLOAT3]: 3,
  [AttributeType.FLOAT4]: 4,
  [AttributeType.INT]: 1,
  [AttributeType.BOOLEAN]: 1,
  [AttributeType.STRING]: 1, // stored as an index; actual strings kept externally
};

// ============================================================================
// NamedAttribute
// ============================================================================

/**
 * A named attribute holding per-element data on a specific domain.
 *
 * The data is stored in a typed array whose kind depends on the attribute type:
 * - FLOAT, FLOAT2, FLOAT3, FLOAT4 → Float32Array
 * - INT → Int32Array
 * - BOOLEAN → Uint8Array (0 = false, nonzero = true)
 * - STRING → string[] (external array, index stored in Int32Array for GPU)
 *
 * This mirrors Blender's `Attribute` data-block.
 */
export class NamedAttribute {
  /** Attribute name (e.g. 'position', 'my_custom_attr') */
  name: string;

  /** Which mesh domain this attribute lives on */
  domain: AttributeDomain;

  /** The data type of each element */
  dataType: AttributeType;

  /** The raw data buffer */
  data: Float32Array | Int32Array | Uint8Array | string[];

  constructor(
    name: string,
    domain: AttributeDomain,
    dataType: AttributeType,
    data: Float32Array | Int32Array | Uint8Array | string[],
  ) {
    this.name = name;
    this.domain = domain;
    this.dataType = dataType;
    this.data = data;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /**
   * Number of float/int components per element.
   * For STRING attributes, returns 1 (index-based).
   */
  getItemSize(): number {
    return ATTRIBUTE_ITEM_SIZE[this.dataType];
  }

  /**
   * Number of elements in this attribute.
   * For typed arrays, derived from data.length / itemSize.
   * For string arrays, returns the array length directly.
   */
  getCount(): number {
    if (Array.isArray(this.data)) {
      return this.data.length;
    }
    const itemSize = this.getItemSize();
    return itemSize > 0 ? Math.floor(this.data.length / itemSize) : 0;
  }

  /**
   * Get the value at the given element index as an array of numbers.
   * For STRING attributes, returns [stringIndex].
   */
  get(index: number): number[] {
    const itemSize = this.getItemSize();
    const result: number[] = [];

    if (this.dataType === AttributeType.STRING) {
      // Strings stored externally; data is an index map
      if (this.data instanceof Int32Array) {
        result.push(this.data[index]);
      } else if (Array.isArray(this.data)) {
        result.push(index);
      }
      return result;
    }

    if (this.dataType === AttributeType.BOOLEAN) {
      const boolData = this.data as Uint8Array;
      result.push(boolData[index] !== 0 ? 1 : 0);
      return result;
    }

    const typedData = this.data as Float32Array | Int32Array;
    const base = index * itemSize;
    for (let i = 0; i < itemSize; i++) {
      result.push(typedData[base + i]);
    }
    return result;
  }

  /**
   * Set the value at the given element index from an array of numbers.
   */
  set(index: number, value: number[]): void {
    const itemSize = this.getItemSize();

    if (this.dataType === AttributeType.BOOLEAN) {
      const boolData = this.data as Uint8Array;
      boolData[index] = value[0] !== 0 ? 1 : 0;
      return;
    }

    if (this.dataType === AttributeType.STRING) {
      // Strings are stored externally; update the index
      if (this.data instanceof Int32Array) {
        this.data[index] = value[0] ?? 0;
      }
      return;
    }

    const typedData = this.data as Float32Array | Int32Array;
    const base = index * itemSize;
    for (let i = 0; i < itemSize && i < value.length; i++) {
      typedData[base + i] = value[i];
    }
  }

  /**
   * Get a single float value at the given index (for FLOAT attributes).
   */
  getFloat(index: number): number {
    if (this.data instanceof Float32Array) return this.data[index];
    if (this.data instanceof Int32Array) return this.data[index];
    if (this.data instanceof Uint8Array) return this.data[index];
    return 0;
  }

  /**
   * Set a single float value at the given index (for FLOAT attributes).
   */
  setFloat(index: number, value: number): void {
    if (this.data instanceof Float32Array) {
      this.data[index] = value;
    } else if (this.data instanceof Int32Array) {
      this.data[index] = Math.round(value);
    } else if (this.data instanceof Uint8Array) {
      this.data[index] = value !== 0 ? 1 : 0;
    }
  }

  /**
   * Get a boolean value at the given index (for BOOLEAN attributes).
   */
  getBoolean(index: number): boolean {
    if (this.data instanceof Uint8Array) return this.data[index] !== 0;
    if (this.data instanceof Float32Array) return this.data[index] !== 0;
    return false;
  }

  /**
   * Set a boolean value at the given index (for BOOLEAN attributes).
   */
  setBoolean(index: number, value: boolean): void {
    if (this.data instanceof Uint8Array) {
      this.data[index] = value ? 1 : 0;
    } else if (this.data instanceof Float32Array) {
      this.data[index] = value ? 1 : 0;
    }
  }

  /**
   * Get a 3-component vector value at the given index (for FLOAT3 attributes).
   */
  getFloat3(index: number): [number, number, number] {
    if (this.data instanceof Float32Array) {
      const base = index * 3;
      return [this.data[base], this.data[base + 1], this.data[base + 2]];
    }
    return [0, 0, 0];
  }

  /**
   * Set a 3-component vector value at the given index (for FLOAT3 attributes).
   */
  setFloat3(index: number, value: [number, number, number]): void {
    if (this.data instanceof Float32Array) {
      const base = index * 3;
      this.data[base] = value[0];
      this.data[base + 1] = value[1];
      this.data[base + 2] = value[2];
    }
  }

  /**
   * Fill every element with the same scalar value.
   */
  fill(value: number): void {
    if (this.data instanceof Float32Array || this.data instanceof Int32Array || this.data instanceof Uint8Array) {
      this.data.fill(value);
    }
  }

  /**
   * Deep-clone this attribute.
   */
  clone(): NamedAttribute {
    let clonedData: Float32Array | Int32Array | Uint8Array | string[];

    if (this.data instanceof Float32Array) {
      clonedData = new Float32Array(this.data);
    } else if (this.data instanceof Int32Array) {
      clonedData = new Int32Array(this.data);
    } else if (this.data instanceof Uint8Array) {
      clonedData = new Uint8Array(this.data);
    } else {
      // string[]
      clonedData = [...(this.data as string[])];
    }

    return new NamedAttribute(this.name, this.domain, this.dataType, clonedData);
  }
}

// ============================================================================
// AttributeManager
// ============================================================================

/**
 * Manages all named attributes on a geometry.
 *
 * Provides CRUD operations for named attributes and bidirectional conversion
 * to / from THREE.BufferGeometry buffer attributes.
 *
 * This mirrors Blender's `AttributeOwner` interface and Infinigen's
 * `readAttributeData` / `writeAttributeData` / `newAttributeData` helpers.
 */
export class AttributeManager {
  private attributes: Map<string, NamedAttribute> = new Map();

  /**
   * Create a new named attribute with the given type and domain.
   *
   * @param name   - Unique attribute name
   * @param domain - Which domain the attribute lives on
   * @param type   - Data type of each element
   * @param count  - Number of elements
   * @returns The newly created NamedAttribute
   */
  createAttribute(
    name: string,
    domain: AttributeDomain,
    type: AttributeType,
    count: number,
  ): NamedAttribute {
    if (this.attributes.has(name)) {
      throw new Error(`Attribute "${name}" already exists`);
    }

    const itemSize = ATTRIBUTE_ITEM_SIZE[type];
    const totalSize = count * itemSize;

    let data: Float32Array | Int32Array | Uint8Array | string[];
    switch (type) {
      case AttributeType.FLOAT:
      case AttributeType.FLOAT2:
      case AttributeType.FLOAT3:
      case AttributeType.FLOAT4:
        data = new Float32Array(totalSize);
        break;
      case AttributeType.INT:
        data = new Int32Array(totalSize);
        break;
      case AttributeType.BOOLEAN:
        data = new Uint8Array(totalSize);
        break;
      case AttributeType.STRING:
        data = new Array<string>(count).fill('');
        break;
      default:
        data = new Float32Array(totalSize);
    }

    const attr = new NamedAttribute(name, domain, type, data);
    this.attributes.set(name, attr);
    return attr;
  }

  /**
   * Get a named attribute, or undefined if not found.
   */
  getAttribute(name: string): NamedAttribute | undefined {
    return this.attributes.get(name);
  }

  /**
   * Remove a named attribute.
   */
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  /**
   * Check if an attribute with the given name exists.
   */
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  /**
   * List all attribute names.
   */
  listAttributes(): string[] {
    return Array.from(this.attributes.keys());
  }

  /**
   * Get all attributes on a specific domain.
   */
  getAttributesByDomain(domain: AttributeDomain): NamedAttribute[] {
    const result: NamedAttribute[] = [];
    for (const attr of this.attributes.values()) {
      if (attr.domain === domain) {
        result.push(attr);
      }
    }
    return result;
  }

  /**
   * Write all managed attributes back to a THREE.BufferGeometry.
   *
   * Standard attributes (position, normal, uv, color) are written to their
   * canonical BufferGeometry slots. Custom attributes are written as named
   * buffer attributes.
   */
  applyToGeometry(geometry: THREE.BufferGeometry): void {
    for (const [name, attr] of this.attributes) {
      // Skip string attributes (cannot be represented as buffer attributes)
      if (attr.dataType === AttributeType.STRING) continue;

      const itemSize = attr.getItemSize();
      let array: Float32Array;

      if (attr.data instanceof Float32Array) {
        array = attr.data;
      } else if (attr.data instanceof Int32Array) {
        // Convert to Float32Array for Three.js compatibility
        array = new Float32Array(attr.data.length);
        for (let i = 0; i < attr.data.length; i++) {
          array[i] = attr.data[i];
        }
      } else if (attr.data instanceof Uint8Array) {
        // Convert booleans to float
        array = new Float32Array(attr.data.length);
        for (let i = 0; i < attr.data.length; i++) {
          array[i] = attr.data[i] !== 0 ? 1.0 : 0.0;
        }
      } else {
        continue;
      }

      // Map standard attribute names to Three.js conventions
      const mappedName = this.mapAttributeNameToThreeJS(name, attr.dataType);
      geometry.setAttribute(mappedName, new THREE.BufferAttribute(array, itemSize));
    }
  }

  /**
   * Read all attributes from a THREE.BufferGeometry into this manager.
   *
   * Extracts position, normal, uv, color, and any custom named attributes.
   */
  readFromGeometry(geometry: THREE.BufferGeometry): void {
    this.attributes.clear();

    const attrNames = Object.keys((geometry as any).attributes || {});
    for (const attrName of attrNames) {
      const bufferAttr = geometry.getAttribute(attrName);
      if (!bufferAttr) continue;

      const itemSize = bufferAttr.itemSize;
      const count = bufferAttr.count;
      const domain = AttributeDomain.POINT; // Default to point domain
      let type: AttributeType;
      let data: Float32Array | Int32Array | Uint8Array | string[];

      switch (itemSize) {
        case 1:
          type = this.inferAttributeType(attrName, 1);
          data = new Float32Array(count);
          for (let i = 0; i < count; i++) {
            data[i] = bufferAttr.getX(i);
          }
          break;
        case 2:
          type = AttributeType.FLOAT2;
          data = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) {
            data[i * 2] = bufferAttr.getX(i);
            data[i * 2 + 1] = bufferAttr.getY(i);
          }
          break;
        case 3:
          type = this.inferAttributeType(attrName, 3);
          data = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            data[i * 3] = bufferAttr.getX(i);
            data[i * 3 + 1] = bufferAttr.getY(i);
            data[i * 3 + 2] = bufferAttr.getZ(i);
          }
          break;
        case 4:
          type = AttributeType.FLOAT4;
          data = new Float32Array(count * 4);
          for (let i = 0; i < count; i++) {
            data[i * 4] = bufferAttr.getX(i);
            data[i * 4 + 1] = bufferAttr.getY(i);
            data[i * 4 + 2] = bufferAttr.getZ(i);
            data[i * 4 + 3] = bufferAttr.getW ? bufferAttr.getW(i) : 1.0;
          }
          break;
        default:
          continue; // Skip attributes with unusual item sizes
      }

      // Map Three.js names back to canonical names
      const canonicalName = this.mapThreeJSNameToCanonical(attrName);
      const namedAttr = new NamedAttribute(canonicalName, domain, type, data);
      this.attributes.set(canonicalName, namedAttr);
    }
  }

  /**
   * Deep-clone this manager and all its attributes.
   */
  clone(): AttributeManager {
    const mgr = new AttributeManager();
    for (const [name, attr] of this.attributes) {
      mgr.attributes.set(name, attr.clone());
    }
    return mgr;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Map canonical attribute names to Three.js buffer attribute names */
  private mapAttributeNameToThreeJS(name: string, type: AttributeType): string {
    switch (name) {
      case StandardAttributes.POSITION: return 'position';
      case StandardAttributes.NORMAL: return 'normal';
      case StandardAttributes.UV: return 'uv';
      case StandardAttributes.COLOR: return 'color';
      default: return name;
    }
  }

  /** Map Three.js buffer attribute names to canonical names */
  private mapThreeJSNameToCanonical(name: string): string {
    switch (name) {
      case 'position': return StandardAttributes.POSITION;
      case 'normal': return StandardAttributes.NORMAL;
      case 'uv': return StandardAttributes.UV;
      case 'color': return StandardAttributes.COLOR;
      default: return name;
    }
  }

  /** Infer AttributeType from the attribute name and item size */
  private inferAttributeType(name: string, itemSize: number): AttributeType {
    switch (name) {
      case 'material_index':
        return AttributeType.INT;
      case 'sharp':
      case 'crease':
        return AttributeType.BOOLEAN;
      default:
        if (itemSize === 1) return AttributeType.FLOAT;
        if (itemSize === 3) return AttributeType.FLOAT3;
        return AttributeType.FLOAT;
    }
  }
}

// ============================================================================
// Standard attribute name constants
// ============================================================================

/**
 * Standard attribute names matching Blender/Infinigen conventions.
 * Use these constants instead of string literals for consistency.
 */
export const StandardAttributes = {
  /** Vertex positions (FLOAT3, POINT domain) */
  POSITION: 'position',
  /** Vertex normals (FLOAT3, POINT domain) */
  NORMAL: 'normal',
  /** UV texture coordinates (FLOAT2, CORNER domain) */
  UV: 'uv',
  /** Vertex colors (FLOAT4, POINT/CORNER domain) */
  COLOR: 'color',
  /** Material index per face (INT, FACE domain) */
  MATERIAL_INDEX: 'material_index',
  /** Sharp edge flag (BOOLEAN, EDGE domain) */
  SHARP: 'sharp',
  /** Subdivision crease weight (FLOAT, EDGE domain) */
  CREASE: 'crease',
  /** Generic tag for selection/filtering (BOOLEAN, any domain) */
  TAG: 'tag',
} as const;

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Read a named attribute from a BufferGeometry.
 *
 * @param geometry - The source geometry
 * @param name     - Attribute name to read
 * @param domain   - Which domain the attribute belongs to
 * @returns A NamedAttribute with the read data
 */
export function readAttrData(
  geometry: THREE.BufferGeometry,
  name: string,
  domain: AttributeDomain = AttributeDomain.POINT,
): NamedAttribute {
  const bufferAttr = geometry.getAttribute(name);
  if (!bufferAttr) {
    throw new Error(`Attribute "${name}" not found on geometry`);
  }

  const count = bufferAttr.count;
  const itemSize = bufferAttr.itemSize;
  let type: AttributeType;
  const data = new Float32Array(count * itemSize);

  switch (itemSize) {
    case 1: type = AttributeType.FLOAT; break;
    case 2: type = AttributeType.FLOAT2; break;
    case 3: type = AttributeType.FLOAT3; break;
    case 4: type = AttributeType.FLOAT4; break;
    default: type = AttributeType.FLOAT;
  }

  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) {
      data[i * itemSize + c] = bufferAttr.getComponent(i, c);
    }
  }

  return new NamedAttribute(name, domain, type, data);
}

/**
 * Write a NamedAttribute to a BufferGeometry.
 *
 * @param geometry - The target geometry
 * @param name     - Attribute name to write
 * @param attr     - The attribute data to write
 */
export function writeAttrData(
  geometry: THREE.BufferGeometry,
  name: string,
  attr: NamedAttribute,
): void {
  const itemSize = attr.getItemSize();

  let array: Float32Array;
  if (attr.data instanceof Float32Array) {
    array = attr.data;
  } else if (attr.data instanceof Int32Array) {
    array = new Float32Array(attr.data.length);
    for (let i = 0; i < attr.data.length; i++) {
      array[i] = attr.data[i];
    }
  } else if (attr.data instanceof Uint8Array) {
    array = new Float32Array(attr.data.length);
    for (let i = 0; i < attr.data.length; i++) {
      array[i] = attr.data[i] !== 0 ? 1.0 : 0.0;
    }
  } else {
    return; // string[] cannot be written to buffer
  }

  geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
}

/**
 * Create a new NamedAttribute filled with a default value.
 *
 * @param domain - Which domain the attribute lives on
 * @param type   - Data type
 * @param count  - Number of elements
 * @param fill   - Optional fill value (default 0)
 * @returns A new NamedAttribute
 */
export function newAttrData(
  domain: AttributeDomain,
  type: AttributeType,
  count: number,
  fill: number = 0,
): NamedAttribute {
  const itemSize = ATTRIBUTE_ITEM_SIZE[type];
  const totalSize = count * itemSize;

  let data: Float32Array | Int32Array | Uint8Array | string[];

  switch (type) {
    case AttributeType.FLOAT:
    case AttributeType.FLOAT2:
    case AttributeType.FLOAT3:
    case AttributeType.FLOAT4:
      data = new Float32Array(totalSize).fill(fill);
      break;
    case AttributeType.INT:
      data = new Int32Array(totalSize).fill(Math.round(fill));
      break;
    case AttributeType.BOOLEAN:
      data = new Uint8Array(totalSize).fill(fill !== 0 ? 1 : 0);
      break;
    case AttributeType.STRING:
      data = new Array<string>(count).fill('');
      break;
    default:
      data = new Float32Array(totalSize).fill(fill);
  }

  return new NamedAttribute('', domain, type, data);
}

/**
 * Filename-matching alias for backward compat.
 * `import AttributeIO from './AttributeIO'` and
 * `import { AttributeIO } from './AttributeIO'` both work.
 * AttributeIO is an alias for the primary class AttributeManager.
 */
export { AttributeManager as AttributeIO };
export default AttributeIO;
