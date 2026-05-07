/**
 * Input Consistency Manager
 *
 * Ports: infinigen/core/nodes/node_wrangler.py — `force_input_consistency`,
 *        `position_translation_seed`, `auto_inject_texture_inputs`
 *
 * In the original infinigen Python codebase, `NodeWrangler` has a feature
 * called `force_input_consistency` that ensures procedural textures produce
 * consistent, tileable results across objects at different world positions.
 *
 * ## How it works in Python
 *
 * 1. When `force_input_consistency()` is called, the wrangler sets a flag
 *    (`input_consistency_forced = 1`).
 * 2. Later, when `new_node()` creates a texture node (NoiseTexture,
 *    VoronoiTexture, MusgraveTexture, WaveTexture, WhiteNoiseTexture) and
 *    **no Vector input** is explicitly provided, the wrangler automatically
 *    injects a Position node (or ShaderNodeNewGeometry for shader trees)
 *    as the Vector input. This prevents all texture nodes from evaluating
 *    at the same default position, which would make them identical.
 * 3. `position_translation_seed` is a dict keyed by an arbitrary identifier
 *    (e.g. `"content0"`, `"mask1"`, `"crack2"`). For each key, a random
 *    3D vector is generated once and cached. Materials then add this offset
 *    to the Position node before feeding it into texture nodes, so that
 *    different "layers" of the material get different random offsets —
 *    producing varied but deterministic patterns per object.
 *
 * ## TypeScript adaptation
 *
 * This module provides:
 * - **`InputConsistencyManager`** — holds the per-wrangler consistency state
 *   (enabled flag, position seeds, attribute data).
 * - **`shouldAutoInjectTextureInputs()`** — determines if a node type is a
 *   texture that needs auto-injection.
 * - **`autoInjectTextureInputs()`** — injects a position+noise vector into a
 *   texture node's Vector input when no explicit connection exists.
 * - **`applyPositionTranslation()`** — offsets all texture nodes in a graph
 *   based on a world position and seed, ensuring different objects at
 *   different positions produce different patterns.
 * - **`generateConsistentSeed()`** — deterministic seed generation from an
 *   object ID and base seed.
 *
 * @module core/nodes/core/InputConsistency
 */

import * as THREE from 'three';
import type { NodeInstance, NodeGroup } from '../types';
import type { NodeSocket } from '../registry';

// ============================================================================
// Texture Node Type Identifiers
// ============================================================================

/**
 * Set of canonical Blender-style node type identifiers for texture nodes
 * that should receive auto-injected Vector inputs when
 * `force_input_consistency` is enabled.
 *
 * This matches the Python implementation in `NodeWrangler.new_node()` which
 * checks for `VoronoiTexture`, `NoiseTexture`, `WaveTexture`,
 * `WhiteNoiseTexture`, and `MusgraveTexture`.
 *
 * Additional texture types (Gradient, Magic, Brick, Checker) are included
 * because they also accept a Vector input and benefit from consistent
 * positioning.
 */
const TEXTURE_NODE_TYPES: ReadonlySet<string> = new Set([
  // Core texture nodes from the Python implementation
  'ShaderNodeTexVoronoi',
  'ShaderNodeTexNoise',
  'ShaderNodeTexWave',
  'ShaderNodeTexWhiteNoise',
  'ShaderNodeTexMusgrave',

  // Additional texture nodes that accept Vector input
  'ShaderNodeTexGradient',
  'ShaderNodeTexMagic',
  'ShaderNodeTexBrick',
  'ShaderNodeTexChecker',
  'ShaderNodeTexImage',
  'ShaderNodeTexEnvironment',
  'ShaderNodeTexSky',
  'ShaderNodePointDensity',

  // NodeTypes enum aliases (used in the legacy code paths)
  'VoronoiTexture',
  'NoiseTexture',
  'WaveTexture',
  'WhiteNoiseTexture',
  'MusgraveTexture',
  'GradientTexture',
  'MagicTexture',
  'BrickTexture',
  'CheckerTexture',
  'ImageTexture',
]);

// ============================================================================
// InputConsistencyManager
// ============================================================================

/**
 * Manages input consistency state for a `NodeWrangler` instance.
 *
 * When enabled, texture nodes that lack an explicit Vector input connection
 * will automatically receive a noise-perturbed position vector. This prevents
 * all textures from evaluating at the same default position (which would make
 * them identical across surfaces) and ensures that the same procedural
 * material applied to different objects at different world positions produces
 * different but consistent patterns.
 *
 * ## Usage
 *
 * ```ts
 * const consistency = new InputConsistencyManager();
 * consistency.enable();
 *
 * // When creating a texture node, check and inject:
 * if (consistency.enabled && shouldAutoInjectTextureInputs(node.type)) {
 *   autoInjectTextureInputs(nw, node, consistency.getOrCreatSeed('layer0'));
 * }
 *
 * // Apply world-position offset for object placement:
 * applyPositionTranslation(nw, new THREE.Vector3(10, 0, 5), 'object_42');
 * ```
 */
export class InputConsistencyManager {
  // -------------------------------------------------------------------------
  // Public State
  // -------------------------------------------------------------------------

  /**
   * Whether `force_input_consistency` is currently active.
   *
   * When `true`, texture nodes without an explicit Vector input will
   * automatically have a position+noise vector injected as their Vector
   * input during node creation.
   */
  enabled: boolean = false;

  /**
   * Per-object position translation seeds.
   *
   * Maps an arbitrary string key (e.g. `"content0"`, `"mask1"`,
   * `"crack2"`, or an object identifier) to a cached random 3D vector.
   * Each key is generated lazily on first access and then reused, so the
   * same material layer always gets the same offset within a single
   * wrangler session.
   *
   * In the Python implementation this is `position_translation_seed: dict`,
   * and each value is a `mathutils.Vector` of three random integers in
   * `[0, 999)`.
   */
  positionTranslationSeed: Map<string, THREE.Vector3> = new Map<string, THREE.Vector3>();

  /**
   * Attribute data for inputs.
   *
   * Maps input socket names or identifiers to their associated attribute
   * configuration. This is used when inputs should reference named
   * attributes on the geometry rather than static values or connections.
   *
   * In the Python implementation this is `input_attribute_data: dict`,
   * populated by `surface.add_geomod()` when `input_attributes` are
   * specified — it records which modifier inputs should read from geometry
   * attributes instead of direct values.
   */
  inputAttributeData: Map<string, InputAttributeData> = new Map();

  // -------------------------------------------------------------------------
  // Methods
  // -------------------------------------------------------------------------

  /**
   * Enable `force_input_consistency`.
   *
   * After calling this method, texture nodes created through the wrangler
   * will automatically receive a noise-perturbed position vector as their
   * Vector input if no explicit connection is provided.
   *
   * Mirrors the Python `NodeWrangler.force_input_consistency()` method.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable `force_input_consistency`.
   *
   * Texture nodes will no longer receive auto-injected Vector inputs.
   * Existing injected connections are **not** removed.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Get or create a position translation seed for the given key.
   *
   * If the key already exists, returns the cached vector. Otherwise,
   * generates a new random 3D vector (each component is a random integer
   * in `[0, 999)`), stores it, and returns it.
   *
   * This is the TypeScript equivalent of the Python method
   * `NodeWrangler.get_position_translation_seed(i)`, which uses
   * `random_vector3()` — i.e. `Vector((randint(999), randint(999), randint(999)))`.
   *
   * @param key - An arbitrary string identifier for the seed
   *   (e.g. `"content0"`, `"mask1"`, `"crack2"`)
   * @returns A `THREE.Vector3` with random integer components in `[0, 999)`
   */
  getOrCreateSeed(key: string): THREE.Vector3 {
    if (!this.positionTranslationSeed.has(key)) {
      const x = Math.floor(Math.random() * 999);
      const y = Math.floor(Math.random() * 999);
      const z = Math.floor(Math.random() * 999);
      const vec = new THREE.Vector3(x, y, z);
      this.positionTranslationSeed.set(key, vec);
    }
    return this.positionTranslationSeed.get(key)!;
  }

  /**
   * Get or create a position translation seed using a deterministic PRNG.
   *
   * Unlike `getOrCreateSeed()` which uses `Math.random()`, this method
   * produces reproducible results by using the provided seed for a simple
   * LCG (Linear Congruential Generator) PRNG. This ensures that the same
   * key + seed combination always produces the same vector, which is
   * critical for deterministic scene generation.
   *
   * @param key  - An arbitrary string identifier for the seed
   * @param seed - A numeric seed for deterministic generation
   * @returns A `THREE.Vector3` with deterministic pseudo-random components
   */
  getOrCreateDeterministicSeed(key: string, seed: number): THREE.Vector3 {
    if (!this.positionTranslationSeed.has(key)) {
      const v = deterministicRandomVector3(key, seed);
      this.positionTranslationSeed.set(key, v);
    }
    return this.positionTranslationSeed.get(key)!;
  }

  /**
   * Clear all cached position translation seeds.
   *
   * Useful when resetting a wrangler session or switching to a new scene.
   */
  clearSeeds(): void {
    this.positionTranslationSeed.clear();
  }

  /**
   * Reset the entire consistency manager to its initial state.
   *
   * Disables consistency enforcement and clears all cached seeds and
   * attribute data.
   */
  reset(): void {
    this.enabled = false;
    this.positionTranslationSeed.clear();
    this.inputAttributeData.clear();
  }
}

// ============================================================================
// Input Attribute Data
// ============================================================================

/**
 * Configuration for an input that should reference a named geometry attribute.
 *
 * In the Python implementation, when `surface.add_geomod()` is called with
 * `input_attributes`, it sets `modifier[id_use_attribute] = True` and
 * `modifier[id_attribute_name] = attr_name` on the corresponding modifier
 * input. This tells Blender to read the input value from a per-vertex
 * attribute on the geometry rather than from a static value.
 */
export interface InputAttributeData {
  /** The name of the geometry attribute to read from */
  attributeName: string;
  /** The domain of the attribute (point, face, etc.) */
  domain?: 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'curve' | 'instance';
  /** The data type of the attribute (float, vector, color, etc.) */
  dataType?: 'FLOAT' | 'FLOAT_VECTOR' | 'FLOAT_COLOR' | 'INT' | 'BOOLEAN' | 'STRING';
}

// ============================================================================
// shouldAutoInjectTextureInputs
// ============================================================================

/**
 * Determine whether a node type should receive auto-injected Vector inputs
 * when `force_input_consistency` is enabled.
 *
 * Returns `true` for texture node types (NoiseTexture, VoronoiTexture,
 * MusgraveTexture, WaveTexture, etc.) that accept a Vector input and
 * would produce identical results on every surface if no position
 * information is provided.
 *
 * This matches the check in the Python `NodeWrangler.new_node()`:
 *
 * ```python
 * if node_type in [
 *     Nodes.VoronoiTexture,
 *     Nodes.NoiseTexture,
 *     Nodes.WaveTexture,
 *     Nodes.WhiteNoiseTexture,
 *     Nodes.MusgraveTexture,
 * ]:
 *     if not (input_args != [] or "Vector" in input_kwargs):
 *         # auto-inject position
 * ```
 *
 * @param nodeType - The canonical Blender-style node type identifier
 * @returns `true` if this node type should receive auto-injected Vector inputs
 */
export function shouldAutoInjectTextureInputs(nodeType: string): boolean {
  return TEXTURE_NODE_TYPES.has(nodeType);
}

// ============================================================================
// autoInjectTextureInputs
// ============================================================================

/**
 * Automatically inject a position+noise vector as the Vector input of a
 * texture node.
 *
 * When `force_input_consistency` is enabled, texture nodes that do not
 * have an explicit Vector input connection should receive an
 * auto-generated position vector. This ensures that:
 *
 * 1. **Textures are not identical everywhere** — Without a Vector input,
 *    texture nodes default to evaluating at `(0, 0, 0)` for every point,
 *    producing a single uniform value across the entire surface.
 * 2. **Textures are position-dependent** — By feeding in the actual
 *    surface position (potentially perturbed by noise), the texture
 *    varies naturally across the surface.
 *
 * In the Python implementation, this is done inline in `new_node()`:
 *
 * ```python
 * if self.input_consistency_forced:
 *     if self.node_group.type == "SHADER":
 *         input_kwargs["Vector"] = self.new_node("ShaderNodeNewGeometry")
 *     else:
 *         input_kwargs["Vector"] = self.new_node(Nodes.InputPosition)
 * ```
 *
 * In this TypeScript version, we:
 * 1. Check if the node already has a connected Vector input — if so, skip.
 * 2. Create a position node appropriate to the graph type (InputPosition
 *    for geometry nodes, or a position-providing node for shader graphs).
 * 3. Optionally add a noise perturbation scaled by `seed`, so that
 *    different seeds produce different position offsets.
 * 4. Connect the resulting vector to the texture node's Vector input.
 *
 * @param nw    - The NodeWrangler instance managing the graph
 * @param node  - The texture node that may need a Vector input injected
 * @param seed  - Optional seed value for noise perturbation of the position.
 *   When provided, a small noise offset is added to the position vector
 *   before connecting it to the texture. This ensures that different
 *   texture nodes in the same graph get slightly different inputs,
 *   preventing them from all looking the same.
 *
 * @example
 * ```ts
 * const noiseNode = nw.newNode('ShaderNodeTexNoise');
 * if (consistency.enabled && shouldAutoInjectTextureInputs(noiseNode.type)) {
 *   autoInjectTextureInputs(nw, noiseNode, 42);
 * }
 * ```
 */
export function autoInjectTextureInputs(
  nw: NodeWranglerLike,
  node: NodeInstance,
  seed?: number,
): void {
  // ── Step 1: Check if Vector input already has a connection ──
  const vectorInput = node.inputs.get('Vector');
  if (!vectorInput) {
    // This texture node doesn't have a Vector input socket — nothing to do
    return;
  }

  // If there's already a connection to the Vector input, skip injection
  if (vectorInput.connectedTo) {
    return;
  }

  // ── Step 2: Create a position source node ──
  // In geometry node trees, use GeometryNodeInputPosition.
  // In shader node trees, the equivalent is to use the Position output
  // from a ShaderNodeNewGeometry node. For simplicity in this TS port,
  // we always use InputPosition and let the executor resolve it.
  const positionNode = nw.newNode('GeometryNodeInputPosition');

  // ── Step 3: Optionally perturb the position with noise ──
  let positionSource: NodeInstance = positionNode;

  if (seed !== undefined) {
    // Create a NoiseTexture node to perturb the position
    const noiseNode = nw.newNode('ShaderNodeTexNoise');
    // Set a high scale for fine-grained perturbation
    noiseNode.properties['Scale'] = 0.001;
    noiseNode.properties['Seed'] = seed;

    // Connect the position to the noise's Vector input
    nw.connect(positionNode, 'Position', noiseNode, 'Vector');

    // Add the noise offset to the position using VectorMath ADD
    const addNode = nw.newNode('ShaderNodeVectorMath');
    addNode.properties['operation'] = 'ADD';

    nw.connect(positionNode, 'Position', addNode, 'Vector');
    nw.connect(noiseNode, 'Fac', addNode, 'Vector_001');

    positionSource = addNode;
  }

  // ── Step 4: Connect to the texture node's Vector input ──
  const outputSocketName = positionSource === positionNode ? 'Position' : 'Vector';
  nw.connect(positionSource, outputSocketName, node, 'Vector');
}

// ============================================================================
// applyPositionTranslation
// ============================================================================

/**
 * Add a position offset to all texture nodes in the graph based on the
 * given world position.
 *
 * When the same procedural material is applied to objects at different
 * world positions, this function ensures that each object gets a unique
 * but deterministic pattern. Without position translation, all objects
 * would produce identical textures because they all sample from the same
 * noise field.
 *
 * In the Python implementation, `position_translation_seed` provides
 * per-layer random offsets, and materials manually add them to the
 * position node:
 *
 * ```python
 * position_shift = nw.new_node(Nodes.Vector, label=f"position_shift{i}")
 * position_shift.vector = nw.get_position_translation_seed(f"content{i}")
 * content = nw.new_node(
 *     Nodes.NoiseTexture,
 *     input_kwargs={"Vector": nw.add(position, position_shift), ...}
 * )
 * ```
 *
 * This TypeScript version:
 * 1. Finds all texture nodes in the active graph that have a connected
 *    Vector input originating from a position source.
 * 2. Creates a Vector node with the translation offset derived from the
 *    world position and seed.
 * 3. Inserts a VectorMath ADD node between the position source and each
 *    texture node's Vector input, adding the translation offset.
 *
 * @param nw        - The NodeWrangler instance managing the graph
 * @param position  - The world position of the object (used to derive offset)
 * @param seed      - Optional string seed for deterministic offset generation.
 *   When provided, the offset is derived from a hash of the seed string
 *   combined with the world position. This ensures reproducibility.
 *
 * @example
 * ```ts
 * // Apply position translation for an object at (10, 5, 3)
 * applyPositionTranslation(nw, new THREE.Vector3(10, 5, 3), 'mountain_42');
 * ```
 */
export function applyPositionTranslation(
  nw: NodeWranglerLike,
  position: THREE.Vector3,
  seed?: string,
): void {
  const group = nw.getActiveGroup();
  if (!group) return;

  // ── Step 1: Compute the translation offset vector ──
  let offset: THREE.Vector3;

  if (seed !== undefined) {
    // Deterministic offset: hash the seed + position components
    offset = computePositionOffset(position, seed);
  } else {
    // Use the world position directly as the offset
    offset = position.clone();
  }

  // ── Step 2: Create a constant Vector node holding the offset ──
  const offsetNode = nw.newNode('FunctionNodeInputVector');
  offsetNode.properties['Vector'] = [offset.x, offset.y, offset.z];

  // ── Step 3: Find all texture nodes and inject the offset ──
  for (const [_nodeId, node] of group.nodes.entries()) {
    if (!shouldAutoInjectTextureInputs(node.type)) {
      continue;
    }

    const vectorInput = node.inputs.get('Vector');
    if (!vectorInput || !vectorInput.connectedTo) {
      // Skip texture nodes without a connected Vector input
      // (they'll be handled by autoInjectTextureInputs instead)
      continue;
    }

    // Find the link feeding into the Vector input
    const vectorLink = findLinkToSocket(group, node.id, 'Vector');
    if (!vectorLink) {
      continue;
    }

    // Disconnect the existing connection
    nw.disconnect(vectorLink.toNode, vectorLink.toSocket);

    // Create an ADD node to combine original position + offset
    const addNode = nw.newNode('ShaderNodeVectorMath');
    addNode.properties['operation'] = 'ADD';

    // Connect the original source to the first ADD input
    nw.connect(vectorLink.fromNode, vectorLink.fromSocket, addNode, 'Vector');

    // Connect the offset to the second ADD input
    nw.connect(offsetNode, 'Vector', addNode, 'Vector_001');

    // Connect the ADD result to the texture node's Vector input
    nw.connect(addNode, 'Vector', node, 'Vector');
  }
}

// ============================================================================
// generateConsistentSeed
// ============================================================================

/**
 * Generate a deterministic seed from an object identifier and a base seed.
 *
 * Produces a reproducible numeric seed by combining an object's unique
 * identifier with a base seed value. This is used to ensure that:
 *
 * - The same object always gets the same seed across sessions
 * - Different objects get different seeds
 * - The base seed can be changed to vary all object seeds simultaneously
 *
 * The implementation uses a simple hash combining algorithm:
 * 1. Start with the base seed
 * 2. For each character in the object ID, mix it into the hash using
 *    multiplication and XOR (similar to a Java-style string hash but
 *    with additional avalanche mixing)
 * 3. Ensure the result is a positive integer
 *
 * @param objectId - A unique string identifier for the object
 *   (e.g. `"mountain_42"`, `"tree_7"`, `"rock_15"`)
 * @param seed     - A base seed value that shifts all generated seeds
 * @returns A deterministic positive integer seed
 *
 * @example
 * ```ts
 * const seed1 = generateConsistentSeed('mountain_42', 0);   // e.g. 2847561
 * const seed2 = generateConsistentSeed('mountain_42', 100); // e.g. 8294732
 * const seed3 = generateConsistentSeed('tree_7', 0);        // e.g. 1538294
 * ```
 */
export function generateConsistentSeed(objectId: string, seed: number): number {
  let hash = seed | 0; // Ensure it's a 32-bit integer

  for (let i = 0; i < objectId.length; i++) {
    // Mix character code into hash with multiplication and XOR
    hash = ((hash << 5) - hash + objectId.charCodeAt(i)) | 0;
  }

  // Additional avalanche mixing for better distribution
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b | 0;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b | 0;
  hash = (hash >> 16) ^ hash;

  // Ensure positive integer
  return Math.abs(hash);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Minimal interface that `autoInjectTextureInputs` and
 * `applyPositionTranslation` need from a NodeWrangler.
 *
 * This decouples the consistency logic from the concrete `NodeWrangler`
 * class, making it easier to test and reuse.
 */
export interface NodeWranglerLike {
  /** Create a new node of the given type in the active group */
  newNode(type: string, name?: string, location?: [number, number], properties?: Record<string, unknown>): NodeInstance;
  /** Connect two sockets */
  connect(fromNode: string | NodeInstance, fromSocket: string, toNode: string | NodeInstance, toSocket: string): unknown;
  /** Disconnect a socket */
  disconnect(nodeId: string, socketName: string): void;
  /** Get the currently active node group */
  getActiveGroup(): NodeGroup;
}

/**
 * Compute a deterministic position offset from a world position and a seed string.
 *
 * The offset is computed by:
 * 1. Hashing the seed string to produce three pseudo-random coefficients
 * 2. Using those coefficients to scale and rotate the world position
 * 3. Quantizing the result to reduce floating-point drift
 *
 * This ensures that:
 * - Small changes in world position produce meaningfully different offsets
 * - The same position + seed always produces the same offset
 * - The offset values are in a reasonable range for procedural textures
 *
 * @param position - The world position of the object
 * @param seed     - A string seed for deterministic generation
 * @returns A `THREE.Vector3` offset to add to texture coordinates
 */
function computePositionOffset(position: THREE.Vector3, seed: string): THREE.Vector3 {
  // Generate three pseudo-random scaling factors from the seed
  const hash0 = generateConsistentSeed(seed + '_x', 0);
  const hash1 = generateConsistentSeed(seed + '_y', 0);
  const hash2 = generateConsistentSeed(seed + '_z', 0);

  // Map hash values to [0, 1) range
  const r0 = (hash0 % 1000) / 1000;
  const r1 = (hash1 % 1000) / 1000;
  const r2 = (hash2 % 1000) / 1000;

  // Combine the world position with the seed-derived coefficients
  // The result is a position-dependent but seed-varied offset
  const ox = position.x + r0 * 999;
  const oy = position.y + r1 * 999;
  const oz = position.z + r2 * 999;

  return new THREE.Vector3(ox, oy, oz);
}

/**
 * Generate a deterministic random 3D vector from a key and seed.
 *
 * Uses a simple LCG (Linear Congruential Generator) seeded with the
 * combined hash of the key and seed. Each component is an integer
 * in `[0, 999)`, matching the Python `random_vector3()` behavior.
 *
 * @param key  - String key for the vector
 * @param seed - Numeric seed
 * @returns A `THREE.Vector3` with deterministic pseudo-random components
 */
function deterministicRandomVector3(key: string, seed: number): THREE.Vector3 {
  const combinedSeed = generateConsistentSeed(key, seed);

  // LCG PRNG: state_n+1 = (a * state_n + c) mod m
  let state = combinedSeed;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };

  const x = Math.floor(next() * 999);
  const y = Math.floor(next() * 999);
  const z = Math.floor(next() * 999);

  return new THREE.Vector3(x, y, z);
}

/**
 * Find a link in the group that connects to a specific socket on a node.
 *
 * @param group      - The node group to search in
 * @param toNodeId   - The ID of the destination node
 * @param toSocket   - The name of the destination input socket
 * @returns The matching `NodeLink`, or `undefined` if not found
 */
function findLinkToSocket(
  group: NodeGroup,
  toNodeId: string,
  toSocket: string,
): { id: string; fromNode: string; fromSocket: string; toNode: string; toSocket: string } | undefined {
  for (const link of group.links.values()) {
    if (link.toNode === toNodeId && link.toSocket === toSocket) {
      return link;
    }
  }
  return undefined;
}
