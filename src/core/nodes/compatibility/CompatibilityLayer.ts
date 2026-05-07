/**
 * Node Compatibility Layer
 *
 * Ports: infinigen/core/nodes/compatibility.py
 *
 * Handles Blender version differences by intercepting `new_node()` calls and
 * converting deprecated node types to their modern equivalents. This ensures
 * that procedural generation code written against older Blender APIs continues
 * to work when new Blender versions remove or rename nodes.
 *
 * ## Supported Conversions
 *
 * | Deprecated Type              | Modern Equivalent                  | Trigger               |
 * |------------------------------|------------------------------------|-----------------------|
 * | `ShaderNodeMixRGB`           | `ShaderNodeMix` (data_type=RGBA)   | Always                |
 * | `GeometryNodeAttributeTransfer` | `GeometryNodeSampleNearestSurface` | mapping=NEAREST_FACE_INTERPOLATED |
 * | `GeometryNodeAttributeTransfer` | `GeometryNodeSampleNearest`        | mapping=NEAREST (throws) |
 * | `GeometryNodeAttributeTransfer` | `GeometryNodeSampleIndex`          | mapping=INDEX         |
 * | `GeometryNodeTexMusgrave`    | `ShaderNodeTexNoise`               | Always                |
 * | `GeometryNodeCaptureAttribute` | Same type, restructured inputs     | Multi-capture items   |
 * | `ShaderNodeBsdfPrincipled`   | Same type, adjusted inputs         | Version differences   |
 * | `GeometryNodeSampleCurve`    | Same type, remapped input "Curve"→"Curves" | Always         |
 *
 * ## Usage
 *
 * ```ts
 * import { applyCompatibility } from './compatibility/CompatibilityLayer';
 *
 * const result = applyCompatibility(
 *   'ShaderNodeMixRGB',
 *   [0.5, color1, color2],     // inputArgs
 *   {},                         // inputKwargs
 *   { blend_type: 'MIX' }      // attrs
 * );
 * // result.nodeType === 'ShaderNodeMix'
 * // result.inputKwargs === { Factor: 0.5, A: color1, B: color2 }
 * // result.attrs === { blend_type: 'MIX', data_type: 'RGBA' }
 * ```
 *
 * @module core/nodes/compatibility
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a deferred computation that the NodeWrangler must expand
 * into intermediate helper nodes before creating the main node.
 *
 * When the compatibility layer encounters a conversion that requires creating
 * intermediate nodes (e.g., Musgrave→Noise roughness formula with socket
 * inputs), it returns these specs instead of trying to create nodes directly.
 *
 * The NodeWrangler processes each `DeferredNodeSpec` by creating the node,
 * then substituting the resulting socket reference into the main node's
 * `inputKwargs`.
 */
export interface DeferredNodeSpec {
  /** Canonical Blender-style node type for the intermediate node */
  nodeType: string;
  /** Keyword arguments (socket name → value or socket reference) */
  inputKwargs: Record<string, unknown>;
  /** Node attributes/properties (e.g., operation mode) */
  attrs: Record<string, unknown>;
  /**
   * The key in the **main** node's `inputKwargs` that should receive the
   * output of this deferred node. If the main node reads this key, it
   * will find the socket reference produced by this intermediate node.
   */
  targetKey: string;
}

/**
 * Result of applying the compatibility layer to a node creation request.
 *
 * If the original node type requires no conversion, all fields are returned
 * unchanged and `converted` is `false`. If a conversion was applied, the
 * fields contain the transformed data and `converted` is `true`.
 */
export interface CompatibilityResult {
  /** The (potentially converted) canonical node type string */
  nodeType: string;
  /** Positional input arguments (usually empty after conversion to kwargs) */
  inputArgs: unknown[];
  /** Named input arguments (socket name → value or socket reference) */
  inputKwargs: Record<string, unknown>;
  /** Node attributes/properties (e.g., blend_type, data_type) */
  attrs: Record<string, unknown>;
  /** Whether any compatibility conversion was applied */
  converted: boolean;
  /**
   * Intermediate nodes that must be created before the main node.
   * The NodeWrangler should create these nodes first, then substitute
   * their output socket references into the main node's `inputKwargs`.
   *
   * Empty if no intermediate nodes are needed.
   */
  deferredNodes: DeferredNodeSpec[];
}

/**
 * Type guard: checks whether a value is a "socket reference" (i.e., a value
 * that represents a connection to another node's output) versus a plain
 * literal value (number, string, boolean, null, undefined).
 *
 * In the Python version this is `nw.is_socket(value)`. In the TypeScript
 * version we follow the convention that socket references are objects with
 * an `id` property (matching `NodeInstance`) or are `NodeSocket` instances.
 *
 * @param value - The value to check
 * @returns `true` if the value is a socket reference, `false` for literals
 */
export function isSocketReference(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean') return false;
  // Objects with an `id` field are treated as NodeInstance / NodeSocket refs
  if (t === 'object' && 'id' in (value as object)) return true;
  return false;
}

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Rename keys in a plain object according to a mapping dictionary.
 *
 * For each `(fromKey, toKey)` pair in `mapping`, if `fromKey` exists in
 * `obj`, it is removed and its value is re-inserted under `toKey`.
 *
 * Throws if the target key already exists in the object (prevents silent
 * data loss from key collisions).
 *
 * @param obj     - The object whose keys should be remapped (mutated in-place)
 * @param mapping - Key-value pairs where key = old name, value = new name
 * @returns The same object reference (mutated in-place)
 *
 * @example
 * ```ts
 * const kwargs = { Fac: 0.5, Color1: red };
 * mapDictKeys(kwargs, { Fac: 'Factor', Color1: 'A' });
 * // kwargs === { Factor: 0.5, A: red }
 * ```
 */
export function mapDictKeys(
  obj: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  for (const [fromKey, toKey] of Object.entries(mapping)) {
    if (!(fromKey in obj)) continue;
    if (toKey in obj) {
      throw new Error(
        `CompatibilityLayer.mapDictKeys: "${fromKey}" would map to "${toKey}", ` +
        `but the object already contains key "${toKey}". ` +
        `Object keys: ${Object.keys(obj).join(', ')}`,
      );
    }
    obj[toKey] = obj[fromKey];
    delete obj[fromKey];
  }
  return obj;
}

// ============================================================================
// Compatibility Handlers
// ============================================================================

/**
 * Convert a `ShaderNodeMixRGB` node to the modern `ShaderNodeMix` node.
 *
 * In Blender 3.4+, `ShaderNodeMixRGB` was replaced by the generic
 * `ShaderNodeMix` with `data_type: 'RGBA'`. This handler:
 *
 * 1. Sets `data_type: 'RGBA'` in attrs
 * 2. Remaps input kwargs: `Fac` → `Factor`, `Color1` → `A`, `Color2` → `B`
 * 3. Converts any positional `inputArgs` into named `inputKwargs` using the
 *    same mapping (since the Mix node has type-dependent hidden sockets that
 *    make positional args unreliable)
 *
 * @param inputArgs    - Positional arguments [Fac?, Color1?, Color2?]
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Node attributes (e.g., blend_type)
 * @returns Compatibility result with nodeType changed to `ShaderNodeMix`
 */
function convertMixRGB(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  const newAttrs = { ...attrs, data_type: 'RGBA' };

  const keyMapping: Record<string, string> = {
    Fac: 'Factor',
    Color1: 'A',
    Color2: 'B',
  };

  const newKwargs: Record<string, unknown> = { ...inputKwargs };
  mapDictKeys(newKwargs, keyMapping);

  // Convert positional args to named kwargs — the Mix node has
  // type-dependent hidden sockets, so positional args are unreliable
  const mappedNames = Object.values(keyMapping); // ['Factor', 'A', 'B']
  for (let i = 0; i < inputArgs.length; i++) {
    const targetName = mappedNames[i];
    if (!targetName) continue;
    if (targetName in newKwargs) {
      throw new Error(
        `CompatibilityLayer.convertMixRGB: positional arg at index ${i} ` +
        `maps to "${targetName}", but that key already exists in inputKwargs. ` +
        `inputArgs length=${inputArgs.length}, inputKwargs keys=${Object.keys(newKwargs).join(', ')}`,
      );
    }
    newKwargs[targetName] = inputArgs[i];
  }

  return {
    nodeType: 'ShaderNodeMix',
    inputArgs: [],
    inputKwargs: newKwargs,
    attrs: newAttrs,
    converted: true,
    deferredNodes: [],
  };
}

/**
 * Convert a `GeometryNodeAttributeTransfer` node to its modern equivalent.
 *
 * In Blender 3.4+, `TransferAttribute` was split into three separate nodes
 * depending on the `mapping` property:
 *
 * - `NEAREST_FACE_INTERPOLATED` → `GeometryNodeSampleNearestSurface`
 *   Remaps: Source→Mesh, Attribute→Value, Source Position→Sample Position
 * - `NEAREST` → throws (not supported; requires manual code update)
 * - `INDEX` → `GeometryNodeSampleIndex`
 *   Remaps: Source→Geometry, Attribute→Value
 *
 * @param inputArgs    - Positional arguments (unused)
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Must contain `mapping` property
 * @returns Compatibility result with the appropriate replacement node type
 * @throws If `attrs` is missing or `mapping` is not one of the known values
 */
function convertTransferAttribute(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  if (!attrs || !('mapping' in attrs)) {
    throw new Error(
      'CompatibilityLayer.convertTransferAttribute: attrs is missing or does ' +
      'not contain a "mapping" property. Cannot infer correct node type mapping.',
    );
  }

  const newKwargs: Record<string, unknown> = { ...inputKwargs };
  const newAttrs = { ...attrs };
  let mappedType: string;

  const mapping = attrs.mapping as string;

  switch (mapping) {
    case 'NEAREST_FACE_INTERPOLATED':
      mappedType = 'GeometryNodeSampleNearestSurface';
      mapDictKeys(newKwargs, {
        Source: 'Mesh',
        Attribute: 'Value',
        'Source Position': 'Sample Position',
      });
      break;

    case 'NEAREST':
      throw new Error(
        'CompatibilityLayer.convertTransferAttribute: mapping="NEAREST" is ' +
        'not supported. Please update the calling code to use ' +
        'GeometryNodeSampleNearest directly.',
      );

    case 'INDEX':
      mappedType = 'GeometryNodeSampleIndex';
      mapDictKeys(newKwargs, {
        Source: 'Geometry',
        Attribute: 'Value',
      });
      break;

    default:
      throw new Error(
        `CompatibilityLayer.convertTransferAttribute: unknown mapping "${mapping}". ` +
        `Expected "NEAREST_FACE_INTERPOLATED", "NEAREST", or "INDEX".`,
      );
  }

  // Remove the 'mapping' attr since the replacement nodes don't have it
  delete newAttrs.mapping;

  return {
    nodeType: mappedType,
    inputArgs: [...inputArgs],
    inputKwargs: newKwargs,
    attrs: newAttrs,
    converted: true,
    deferredNodes: [],
  };
}

/**
 * Convert a `GeometryNodeSampleCurve` node's input names for newer Blender.
 *
 * In newer Blender versions, the input socket "Curve" was renamed to "Curves".
 *
 * @param inputArgs    - Positional arguments (passed through)
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Node attributes (passed through)
 * @returns Compatibility result with "Curve" → "Curves" remapping
 */
function convertSampleCurve(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  const newKwargs: Record<string, unknown> = { ...inputKwargs };
  mapDictKeys(newKwargs, { Curve: 'Curves' });

  return {
    nodeType: 'GeometryNodeSampleCurve',
    inputArgs: [...inputArgs],
    inputKwargs: newKwargs,
    attrs: { ...attrs },
    converted: true,
    deferredNodes: [],
  };
}

/**
 * Convert a `ShaderNodeTexMusgrave` node to `ShaderNodeTexNoise`.
 *
 * The Musgrave texture node was removed in Blender 4.1. It maps to the
 * Noise texture node with the following conversions:
 *
 * - **Roughness**: `lacunarity ^ (-dimension)` (literal or deferred)
 * - **Detail**: `detail - 1` (literal or deferred)
 * - Attribute renames: `musgrave_dimensions` → `noise_dimensions`,
 *   `musgrave_type` → `noise_type`
 * - Sets `normalize: false`
 * - Default values: Dimension=2, Lacunarity=2, Detail=2
 *
 * When `Dimension` or `Lacunarity` are socket references (not literal
 * numbers), the roughness formula requires creating intermediate Math nodes.
 * In this case, `deferredNodes` is populated with the specs for those
 * intermediate nodes.
 *
 * @param inputArgs    - Positional args [Vector?, W?, Scale?, Detail?, Dimension?, Lacunarity?, Offset?, Gain?]
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Node attributes (may include musgrave_dimensions, musgrave_type)
 * @returns Compatibility result with nodeType changed to `ShaderNodeTexNoise`
 */
function convertMusgraveTexture(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  // Musgrave positional input names (from Python compatibility.py)
  const musgraveInputNames = [
    'Vector', 'W', 'Scale', 'Detail', 'Dimension', 'Lacunarity', 'Offset', 'Gain',
  ];

  // Default values for Musgrave inputs
  const defaultValues: Record<string, number> = {
    Dimension: 2,
    Lacunarity: 2,
    Detail: 2,
  };

  const newKwargs: Record<string, unknown> = { ...inputKwargs };
  const newAttrs: Record<string, unknown> = { ...attrs };
  const deferredNodes: DeferredNodeSpec[] = [];

  // Convert positional args to named kwargs
  for (let i = 0; i < inputArgs.length && i < musgraveInputNames.length; i++) {
    const name = musgraveInputNames[i];
    if (name && !(name in newKwargs)) {
      newKwargs[name] = inputArgs[i];
    }
  }

  // Apply defaults for missing values
  for (const [name, value] of Object.entries(defaultValues)) {
    if (!(name in newKwargs)) {
      newKwargs[name] = value;
    }
  }

  // --- Roughness conversion: lacunarity ^ (-dimension) ---
  const dimension = newKwargs.Dimension;
  const lacunarity = newKwargs.Lacunarity;
  const dimensionIsSocket = isSocketReference(dimension);
  const lacunarityIsSocket = isSocketReference(lacunarity);

  if (dimensionIsSocket || lacunarityIsSocket) {
    // Need intermediate Math nodes to compute roughness at runtime.
    // Step 1: negate dimension → scalar_sub(0, dimension)
    // Step 2: power(lacunarity, negated_dimension)
    const negDimKey = '__compat_musgrave_neg_dimension';
    const roughnessKey = '__compat_musgrave_roughness';

    // Deferred node: negate the dimension
    deferredNodes.push({
      nodeType: 'ShaderNodeMath',
      inputKwargs: { Value: 0, Value_001: dimension },
      attrs: { operation: 'SUBTRACT' },
      targetKey: negDimKey,
    });

    // Deferred node: power(lacunarity, negated_dimension)
    deferredNodes.push({
      nodeType: 'ShaderNodeMath',
      inputKwargs: { Value: lacunarity, Value_001: { __deferredRef: negDimKey } },
      attrs: { operation: 'POWER' },
      targetKey: roughnessKey,
    });

    // Mark Roughness as a deferred reference
    newKwargs.Roughness = { __deferredRef: roughnessKey };
  } else {
    // Both are literal numbers — compute directly
    const dimVal = typeof dimension === 'number' ? dimension : 2;
    const lacVal = typeof lacunarity === 'number' ? lacunarity : 2;
    newKwargs.Roughness = Math.pow(lacVal, -dimVal);
  }

  // Remove Dimension (not present in Noise texture)
  delete newKwargs.Dimension;

  // --- Detail conversion: detail - 1 ---
  const detail = newKwargs.Detail;
  if (isSocketReference(detail)) {
    // Need an intermediate subtraction node
    const detailKey = '__compat_musgrave_detail';
    deferredNodes.push({
      nodeType: 'ShaderNodeMath',
      inputKwargs: { Value: detail, Value_001: 1 },
      attrs: { operation: 'SUBTRACT' },
      targetKey: detailKey,
    });
    newKwargs.Detail = { __deferredRef: detailKey };
  } else if (typeof detail === 'number') {
    newKwargs.Detail = detail - 1;
  }

  // Remove Lacunarity (not present in Noise texture)
  delete newKwargs.Lacunarity;

  // Remove Offset and Gain (not present in Noise texture)
  delete newKwargs.Offset;
  delete newKwargs.Gain;

  // Rename attribute keys
  if ('musgrave_dimensions' in newAttrs) {
    newAttrs.noise_dimensions = newAttrs.musgrave_dimensions;
    delete newAttrs.musgrave_dimensions;
  }
  if ('musgrave_type' in newAttrs) {
    newAttrs.noise_type = newAttrs.musgrave_type;
    delete newAttrs.musgrave_type;
  }

  // Noise texture does not normalize by default for Musgrave compat
  newAttrs.normalize = false;

  return {
    nodeType: 'ShaderNodeTexNoise',
    inputArgs: [],
    inputKwargs: newKwargs,
    attrs: newAttrs,
    converted: true,
    deferredNodes,
  };
}

/**
 * Handle `GeometryNodeCaptureAttribute` compatibility for newer Blender
 * versions that support multi-capture items.
 *
 * In Blender 3.5+, `CaptureAttribute` supports multiple capture items.
 * This handler restructures the inputs so that:
 *
 * 1. The `Geometry` input is extracted and moved to `inputArgs[0]`
 * 2. All attribute values are moved into named kwargs under keys like
 *    "Attribute" (first), "Attribute_1" (second), etc.
 * 3. Data type information is collected per-item (if available)
 *
 * @param inputArgs    - Positional arguments
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Node attributes (may include data_type, domain)
 * @returns Compatibility result with restructured capture attribute inputs
 */
function convertCaptureAttribute(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  const newKwargs: Record<string, unknown> = {};
  const newAttrs: Record<string, unknown> = { ...attrs };
  const captureItemDataTypes: Array<{ name: string; dataType: string }> = [];

  // Extract geometry input
  let geometry: unknown;
  if ('Geometry' in inputKwargs) {
    geometry = inputKwargs.Geometry;
  } else if (inputArgs.length >= 1) {
    geometry = inputArgs[0];
  } else {
    throw new Error(
      'CompatibilityLayer.convertCaptureAttribute: Geometry input not found ' +
      'in inputKwargs or inputArgs.',
    );
  }

  // Extract data_type if provided (used for all items if no per-item type)
  const globalDataType = attrs.data_type as string | undefined;
  delete newAttrs.data_type;

  // Helper: determine the capture item name for a given index
  const getItemName = (index: number, isNamed: boolean): string => {
    if (isNamed) return index === 0 ? 'Attribute' : `Attribute_${index}`;
    return 'Attribute';
  };

  // Process named kwargs (excluding Geometry)
  let itemIndex = 0;
  for (const [key, value] of Object.entries(inputKwargs)) {
    if (key === 'Geometry') continue;

    const isNamed = typeof key === 'string' && key.length > 0;
    const itemName = isNamed ? key : getItemName(itemIndex, true);
    newKwargs[itemName] = value;

    // Determine per-item data type
    if (globalDataType) {
      captureItemDataTypes.push({ name: itemName, dataType: globalDataType });
    } else if (isSocketReference(value)) {
      // Infer data type from socket reference — we store a placeholder
      // The NodeWrangler can resolve the actual type from the socket definition
      captureItemDataTypes.push({ name: itemName, dataType: '__infer__' });
    }
    itemIndex++;
  }

  // Process remaining positional args (skip first which is geometry)
  for (let i = 1; i < inputArgs.length; i++) {
    const itemName = getItemName(i - 1, true);
    newKwargs[itemName] = inputArgs[i];

    if (globalDataType) {
      captureItemDataTypes.push({ name: itemName, dataType: globalDataType });
    } else if (isSocketReference(inputArgs[i])) {
      captureItemDataTypes.push({ name: itemName, dataType: '__infer__' });
    }
  }

  // Store capture item data types as metadata for the NodeWrangler to apply
  if (captureItemDataTypes.length > 0) {
    newAttrs.__captureItemDataTypes = captureItemDataTypes;
  }

  return {
    nodeType: 'GeometryNodeCaptureAttribute',
    inputArgs: [geometry],
    inputKwargs: newKwargs,
    attrs: newAttrs,
    converted: true,
    deferredNodes: [],
  };
}

/**
 * Handle `ShaderNodeBsdfPrincipled` compatibility across Blender versions.
 *
 * Different Blender versions have different input names for the Principled BSDF:
 *
 * - **Blender 4.0+**: Removed `Subsurface Color` input, added `Subsurface Scale`
 * - **Blender 4.1+**: Renamed `Specular` → `Specular IOR Level` (in some configs)
 *
 * This handler:
 * 1. Sets `Subsurface Scale` to `1` (was implicit in older versions)
 * 2. Removes `Subsurface Color` (no longer present in newer Blender)
 * 3. Warns about deprecated inputs
 *
 * @param inputArgs    - Positional arguments (passed through)
 * @param inputKwargs  - Named socket arguments
 * @param attrs        - Node attributes (e.g., distribution, subsurface_method)
 * @returns Compatibility result with adjusted PrincipledBSDF inputs
 */
function convertPrincipledBSDF(
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  const newKwargs: Record<string, unknown> = { ...inputKwargs };
  let converted = false;

  // Subsurface Scale was added in Blender 4.0 — set default of 1
  // (older Blender versions had this implicitly as 1)
  if (!('Subsurface Scale' in newKwargs)) {
    newKwargs['Subsurface Scale'] = 1;
    converted = true;
  }

  // Subsurface Color was removed in Blender 4.0
  if ('Subsurface Color' in newKwargs) {
    console.warn(
      '[CompatibilityLayer] PrincipledBSDF: "Subsurface Color" input is ' +
      'no longer supported in Blender 4.0+ and has been removed.',
    );
    delete newKwargs['Subsurface Color'];
    converted = true;
  }

  // Handle Specular → Specular IOR Level rename (Blender 4.1+)
  // Only rename if the new name is not already present
  if ('Specular' in newKwargs && !('Specular IOR Level' in newKwargs)) {
    // Keep both — the NodeWrangler / executor will use whichever is available
    // We don't auto-rename because some Blender versions still use "Specular"
  }

  return {
    nodeType: 'ShaderNodeBsdfPrincipled',
    inputArgs: [...inputArgs],
    inputKwargs: newKwargs,
    attrs: { ...attrs },
    converted,
    deferredNodes: [],
  };
}

// ============================================================================
// Compatibility Mappings Registry
// ============================================================================

/**
 * Type for a compatibility handler function.
 *
 * Each handler receives the node creation parameters and returns a
 * fully-resolved `CompatibilityResult`.
 */
type CompatibilityHandler = (
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
) => CompatibilityResult;

/**
 * Registry mapping deprecated node type strings to their compatibility handlers.
 *
 * The keys are the **original** (deprecated) Blender-style node type identifiers.
 * When `applyCompatibility()` encounters one of these types, it delegates to
 * the associated handler.
 *
 * Mirrors `COMPATIBILITY_MAPPINGS` in the Python original.
 */
const COMPATIBILITY_MAPPINGS: Record<string, CompatibilityHandler> = {
  'ShaderNodeMixRGB': convertMixRGB,
  'GeometryNodeAttributeTransfer': convertTransferAttribute,
  'GeometryNodeSampleCurve': convertSampleCurve,
  'ShaderNodeTexMusgrave': convertMusgraveTexture,
  'GeometryNodeCaptureAttribute': convertCaptureAttribute,
  'ShaderNodeBsdfPrincipled': convertPrincipledBSDF,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply the compatibility layer to a node creation request.
 *
 * This is the main entry point for the compatibility system. It checks whether
 * the requested `nodeType` has a known compatibility handler and, if so,
 * delegates to that handler. If no handler is found, the inputs are returned
 * unchanged with `converted: false`.
 *
 * The NodeWrangler should call this function in its `new_node()` method
 * **before** creating the actual node. If `result.deferredNodes` is non-empty,
 * the NodeWrangler must create those intermediate nodes first and substitute
 * their output references into the main node's `inputKwargs`.
 *
 * @param nodeType     - The requested Blender-style node type identifier
 * @param inputArgs    - Positional input arguments
 * @param inputKwargs  - Named input arguments (socket name → value)
 * @param attrs        - Node attributes/properties (e.g., blend_type, mapping)
 * @returns A `CompatibilityResult` with potentially transformed type, args,
 *          kwargs, and attrs
 *
 * @example
 * ```ts
 * // MixRGB → Mix conversion
 * const result = applyCompatibility(
 *   'ShaderNodeMixRGB',
 *   [0.5],
 *   { Color1: redNode, Color2: blueNode },
 *   { blend_type: 'MULTIPLY' },
 * );
 * // result.nodeType === 'ShaderNodeMix'
 * // result.inputKwargs === { Factor: 0.5, A: redNode, B: blueNode }
 * // result.attrs === { blend_type: 'MULTIPLY', data_type: 'RGBA' }
 * // result.converted === true
 *
 * // Unknown type — no conversion
 * const result2 = applyCompatibility('ShaderNodeMath', [], {}, { operation: 'ADD' });
 * // result2.converted === false
 * // result2 is unchanged from input
 * ```
 */
export function applyCompatibility(
  nodeType: string,
  inputArgs: unknown[],
  inputKwargs: Record<string, unknown>,
  attrs: Record<string, unknown>,
): CompatibilityResult {
  const handler = COMPATIBILITY_MAPPINGS[nodeType];

  if (handler) {
    return handler(inputArgs, inputKwargs, attrs);
  }

  // No compatibility handler — return unchanged
  return {
    nodeType,
    inputArgs: [...inputArgs],
    inputKwargs: { ...inputKwargs },
    attrs: { ...attrs },
    converted: false,
    deferredNodes: [],
  };
}

/**
 * Check whether a given node type has a registered compatibility handler.
 *
 * Useful for pre-checking before calling `applyCompatibility()`, or for
 * warning users that their code uses deprecated node types.
 *
 * @param nodeType - The Blender-style node type identifier to check
 * @returns `true` if a compatibility handler exists for this type
 *
 * @example
 * ```ts
 * hasCompatibilityHandler('ShaderNodeMixRGB');   // true
 * hasCompatibilityHandler('ShaderNodeMath');      // false
 * ```
 */
export function hasCompatibilityHandler(nodeType: string): boolean {
  return nodeType in COMPATIBILITY_MAPPINGS;
}

/**
 * Get the list of all node types that have compatibility handlers registered.
 *
 * Returns the **original** (deprecated) type names, not the replacement types.
 *
 * @returns Array of deprecated node type strings
 *
 * @example
 * ```ts
 * getRegisteredCompatibilityTypes();
 * // ['ShaderNodeMixRGB', 'GeometryNodeAttributeTransfer', ...]
 * ```
 */
export function getRegisteredCompatibilityTypes(): string[] {
  return Object.keys(COMPATIBILITY_MAPPINGS);
}

/**
 * Resolve a deferred reference marker in `inputKwargs`.
 *
 * When the compatibility layer produces `DeferredNodeSpec`s, the main node's
 * `inputKwargs` may contain `{ __deferredRef: key }` markers that reference
 * the `targetKey` of a deferred node. After the NodeWrangler creates the
 * deferred node, it should call this function to substitute the actual
 * output socket reference.
 *
 * @param inputKwargs    - The main node's input kwargs (will be mutated)
 * @param refKey         - The deferred reference key (matches a targetKey)
 * @param socketReference - The actual socket reference to substitute
 * @returns The mutated inputKwargs object
 *
 * @example
 * ```ts
 * // After creating the deferred Math node for Musgrave roughness:
 * resolveDeferredRef(result.inputKwargs, '__compat_musgrave_roughness', mathNode);
 * ```
 */
export function resolveDeferredRef(
  inputKwargs: Record<string, unknown>,
  refKey: string,
  socketReference: unknown,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(inputKwargs)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      '__deferredRef' in (value as object) &&
      (value as { __deferredRef: string }).__deferredRef === refKey
    ) {
      inputKwargs[key] = socketReference;
    }
  }
  return inputKwargs;
}

/**
 * Resolve all deferred references in a CompatibilityResult.
 *
 * Convenience function that iterates through the `deferredNodes` array,
 * creates each one via the provided factory function, and substitutes
 * the results into the main node's `inputKwargs`.
 *
 * @param result           - The compatibility result to resolve
 * @param createNodeFn     - Factory function that creates a node from a
 *                           DeferredNodeSpec and returns a socket reference
 * @returns The resolved CompatibilityResult with no remaining deferred refs
 *
 * @example
 * ```ts
 * const resolved = resolveAllDeferred(result, (spec) => {
 *   const node = nw.newNode(spec.nodeType, undefined, undefined, spec.attrs);
 *   for (const [k, v] of Object.entries(spec.inputKwargs)) {
 *     nw.setInputValue(node, k, v);
 *   }
 *   return node;
 * });
 * ```
 */
export function resolveAllDeferred(
  result: CompatibilityResult,
  createNodeFn: (spec: DeferredNodeSpec) => unknown,
): CompatibilityResult {
  if (result.deferredNodes.length === 0) return result;

  const newResult = { ...result, inputKwargs: { ...result.inputKwargs } };

  for (const spec of result.deferredNodes) {
    const nodeRef = createNodeFn(spec);
    resolveDeferredRef(newResult.inputKwargs, spec.targetKey, nodeRef);
  }

  newResult.deferredNodes = [];
  return newResult;
}
