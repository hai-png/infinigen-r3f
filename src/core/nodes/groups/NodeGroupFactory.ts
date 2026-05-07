/**
 * NodeGroupFactory — TypeScript equivalents of Infinigen's `@to_nodegroup`
 * and `@to_material` decorators, plus `add_geomod` and `shaderfunc_to_material`.
 *
 * In Python, `@to_nodegroup` and `@to_material` are decorators that wrap a
 * builder function so it creates a new node group (or material) every time it
 * is called (or reuses a cached one when `singleton: true`).
 *
 * TypeScript does not support Python-style decorators that transparently
 * replace the decorated function, so we implement these as **higher-order
 * functions**: you pass a builder, and get back a factory function.
 *
 * ## Quick reference
 *
 * | Python                       | TypeScript                         |
 * |------------------------------|------------------------------------|
 * | `@to_nodegroup(name)`        | `to_nodegroup(name)(builder)`      |
 * | `@to_material(name, singleton)` | `to_material(builder, opts)`    |
 * | `surface.add_geomod(...)`    | `add_geomod(obj, geoFunc, opts)`   |
 * | `surface.shaderfunc_to_material(...)` | `shaderfunc_to_material(fn, ...args)` |
 *
 * @module core/nodes/groups/NodeGroupFactory
 */

import * as THREE from 'three';
import { NodeWrangler } from '../node-wrangler';
import type { NodeGroup } from '../types';
import { SocketType } from '../registry/socket-types';
import { evaluateToMaterial } from '../execution/EvaluateToMaterial';
import type { EvaluateToMaterialOptions } from '../execution/EvaluateToMaterial';
import { GeometryNodePipeline } from '../execution/GeometryNodeExecutor';

// ============================================================================
// Types
// ============================================================================

/**
 * A builder function that constructs nodes inside a NodeWrangler.
 *
 * This is the TypeScript equivalent of the Python functions decorated with
 * `@to_nodegroup` or `@to_material`. The first argument is always the
 * `NodeWrangler`; additional arguments are passed through from the factory
 * call site.
 *
 * @example
 * ```ts
 * const myNoiseGroup = (nw: NodeWrangler, scale: number, detail: number) => {
 *   const noise = nw.new_node('ShaderNodeTexNoise', [], {}, { Scale: scale, Detail: detail });
 *   nw.new_node('NodeGroupOutput', [noise]);
 * };
 * ```
 */
export type NodeGroupBuilder = (nw: NodeWrangler, ...args: any[]) => void;

/**
 * Options for the `to_nodegroup` higher-order function.
 */
export interface ToNodeGroupOptions {
  /**
   * When `true`, the node group is created only once and cached. Subsequent
   * calls to the returned factory return the same `NodeGroup` instance.
   *
   * In the original Python code, singleton groups are suffixed with
   * `" (no gc)"` to signal that Blender's garbage collector should not
   * reclaim them. In this TypeScript port the suffix is retained for
   * semantic parity but has no runtime effect.
   *
   * @default false
   */
  singleton?: boolean;

  /**
   * The type of node tree to create. Mirrors Blender's `bpy.data.node_groups.new(name, type)`.
   *
   * - `'GeometryNodeTree'` — for geometry node groups
   * - `'ShaderNodeTree'`   — for shader node groups
   *
   * @default 'GeometryNodeTree'
   */
  type?: 'GeometryNodeTree' | 'ShaderNodeTree';
}

/**
 * Options for the `add_geomod` function.
 */
export interface AddGeomodOptions {
  /**
   * A human-readable name for the modifier. Stored as the active group's
   * name and used in logging.
   */
  name?: string;

  /**
   * When `true`, the resulting geometry is **applied** to the
   * `THREE.Object3D` immediately (replacing its `geometry`).
   * When `false`, the geometry is computed but not assigned — the caller
   * can read it from the return value.
   *
   * @default true
   */
  apply?: boolean;

  /**
   * Named input attributes to pass into the geometry node graph.
   *
   * Keys are socket names on the GroupInput node; values are the
   * corresponding data (numbers, vectors, geometry references, etc.).
   */
  inputAttributes?: Record<string, any>;
}

/**
 * Options for the `to_material` higher-order function.
 */
export interface ToMaterialOptions {
  /**
   * A human-readable name for the material. Will be set on the
   * resulting `THREE.MeshPhysicalMaterial.name`.
   */
  name?: string;

  /**
   * When `true`, the material is created only once and cached. Subsequent
   * calls with the same builder return the same material instance.
   *
   * @default false
   */
  singleton?: boolean;

  /**
   * Options forwarded to `evaluateToMaterial()` controlling texture
   * resolution, normal-map strength, etc.
   */
  evalOptions?: EvaluateToMaterialOptions;
}

// ============================================================================
// Singleton Caches
// ============================================================================

/**
 * Global cache for singleton node groups, keyed by the group name.
 *
 * In Python, singleton groups live in `bpy.data.node_groups` and are
 * looked up by name. Here we use a plain `Map`.
 */
const nodeGroupSingletonCache = new Map<string, NodeGroup>();

/**
 * Global cache for singleton materials, keyed by the material name.
 *
 * In Python, singleton materials live in `bpy.data.materials` and are
 * looked up by name.
 */
const materialSingletonCache = new Map<string, THREE.Material>();

// ============================================================================
// to_nodegroup
// ============================================================================

/**
 * Higher-order function that wraps a node-group builder, returning a
 * **factory function** that creates (or reuses) a populated `NodeGroup`.
 *
 * This is the TypeScript equivalent of Infinigen's `@to_nodegroup` decorator.
 *
 * ## How it maps from Python
 *
 * ```python
 * # Python (Infinigen)
 * @to_nodegroup("my_noise", singleton=False)
 * def my_noise(nw: NodeWrangler, scale=5.0):
 *     noise = nw.new_node(Nodes.NoiseTexture, input_kwargs={"Scale": scale})
 *     ...
 *     return noise
 *
 * # Usage
 * group = my_noise(scale=10.0)
 * ```
 *
 * ```typescript
 * // TypeScript
 * const myNoise = to_nodegroup("my_noise")((nw, scale = 5.0) => {
 *   const noise = nw.new_node("ShaderNodeTexNoise", [], {}, { Scale: scale });
 *   ...
 * });
 *
 * // Usage
 * const group = myNoise(10.0);
 * ```
 *
 * @param name    - The name for the created node group. If omitted the
 *                  builder's `name` property (or `'UnnamedNodeGroup'`) is used.
 * @param options - Optional configuration (singleton, type).
 * @returns A function that accepts a builder and returns a factory.
 *
 * @example
 * ```ts
 * // Create a reusable noise node-group factory
 * const makeNoiseGroup = to_nodegroup("MyNoise", { singleton: true })(
 *   (nw, scale: number, detail: number) => {
 *     const noise = nw.new_node("ShaderNodeTexNoise", [], {}, { Scale: scale, Detail: detail });
 *     nw.new_node("NodeGroupOutput", [noise]);
 *   },
 * );
 *
 * // First call creates the group; subsequent calls return the cached instance
 * const group = makeNoiseGroup(5.0, 3.0);
 * ```
 */
export function to_nodegroup(
  name?: string,
  options?: ToNodeGroupOptions,
): (builder: NodeGroupBuilder) => (...args: any[]) => NodeGroup {
  const opts: Required<ToNodeGroupOptions> = {
    singleton: options?.singleton ?? false,
    type: options?.type ?? 'GeometryNodeTree',
  };

  return (builder: NodeGroupBuilder): ((...args: any[]) => NodeGroup) => {
    // Resolve the group name: explicit > builder.name > fallback
    const groupName = name ?? (builder.name || 'UnnamedNodeGroup');
    const cacheKey = opts.singleton ? `${groupName} (no gc)` : groupName;

    const factory = (...args: any[]): NodeGroup => {
      // ── Singleton fast-path ──
      if (opts.singleton && nodeGroupSingletonCache.has(cacheKey)) {
        return nodeGroupSingletonCache.get(cacheKey)!;
      }

      // ── Create a fresh NodeWrangler with a named root group ──
      const nw = new NodeWrangler();
      const group = nw.getActiveGroup();
      group.name = cacheKey;

      // ── Invoke the builder to populate the group ──
      builder(nw, ...args);

      // ── Cache if singleton ──
      if (opts.singleton) {
        nodeGroupSingletonCache.set(cacheKey, group);
      }

      return group;
    };

    // Preserve the builder's name for debugging / introspection
    Object.defineProperty(factory, 'name', {
      value: `to_nodegroup:${cacheKey}`,
      writable: false,
      enumerable: true,
    });

    return factory;
  };
}

// ============================================================================
// to_material
// ============================================================================

/**
 * Higher-order function that wraps a shader builder, returning a
 * **factory function** that creates (or reuses) a Three.js `Material`.
 *
 * This is the TypeScript equivalent of Infinigen's `@to_material` decorator.
 *
 * ## How it maps from Python
 *
 * ```python
 * # Python (Infinigen)
 * @to_material("bark_material", singleton=True)
 * def bark_shader(nw: NodeWrangler, base_color=(0.4, 0.25, 0.1)):
 *     principled = nw.new_node(Nodes.PrincipledBSDF, ...)
 *     ...
 *
 * # Usage
 * mat = bark_shader(base_color=(0.3, 0.2, 0.1))
 * ```
 *
 * ```typescript
 * // TypeScript
 * const barkMaterial = to_material((nw, baseColor = [0.4, 0.25, 0.1]) => {
 *   nw.new_node("ShaderNodeBsdfPrincipled", [], {}, { "Base Color": baseColor });
 *   ...
 * }, { name: "bark_material", singleton: true });
 *
 * // Usage
 * const mat = barkMaterial([0.3, 0.2, 0.1]);
 * ```
 *
 * @param builder - A function that takes a `NodeWrangler` and optional extra
 *                  arguments, and constructs a shader node graph.
 * @param options - Optional configuration (name, singleton, evalOptions).
 * @returns A factory function that, when called, evaluates the shader graph
 *          and returns a `THREE.Material`.
 */
export function to_material(
  builder: NodeGroupBuilder,
  options?: ToMaterialOptions,
): (...args: any[]) => THREE.Material {
  const matName = options?.name ?? builder.name ?? 'UnnamedMaterial';
  const cacheKey = options?.singleton ? `${matName} (no gc)` : matName;

  const factory = (...args: any[]): THREE.Material => {
    // ── Singleton fast-path ──
    if (options?.singleton && materialSingletonCache.has(cacheKey)) {
      return materialSingletonCache.get(cacheKey)!;
    }

    // ── Create a NodeWrangler with a ShaderNodeTree-named group ──
    const nw = new NodeWrangler();
    const group = nw.getActiveGroup();
    group.name = cacheKey;

    // ── Invoke the builder to construct the shader graph ──
    builder(nw, ...args);

    // ── Evaluate the graph to produce a material ──
    // NodeWrangler uses its own NodeInstance type which differs from the
    // core/types NodeInstance. We adapt here using `as any`, matching the
    // same pattern used in SurfaceIntegration.ts and EvaluateToMaterial.ts.
    const nodeGraph: any = {
      nodes: group.nodes,
      links: Array.from(group.links.values()),
    };

    const result = evaluateToMaterial(nodeGraph, options?.evalOptions);
    const material = result.material;
    material.name = cacheKey;

    // ── Cache if singleton ──
    if (options?.singleton) {
      materialSingletonCache.set(cacheKey, material);
    }

    return material;
  };

  // Preserve a readable name for debugging
  Object.defineProperty(factory, 'name', {
    value: `to_material:${cacheKey}`,
    writable: false,
    enumerable: true,
  });

  return factory;
}

// ============================================================================
// add_geomod
// ============================================================================

/**
 * Apply a geometry-node modifier to a Three.js `Object3D`.
 *
 * This is the TypeScript equivalent of Infinigen's `surface.add_geomod()`.
 *
 * The function:
 * 1. Creates a `NodeWrangler` with a named geometry-node group.
 * 2. Calls `geoFunc(nw, ...)` to populate the node graph.
 * 3. Evaluates the graph through `GeometryNodePipeline` to produce
 *    a modified `BufferGeometry`.
 * 4. If `options.apply` is `true` (the default), replaces the mesh's
 *    geometry with the result.
 *
 * @param obj      - The Three.js object whose mesh geometry will be modified.
 *                   Must have a `geometry` property (`THREE.BufferGeometry`).
 * @param geoFunc  - A builder function that constructs a geometry node graph
 *                   using the provided `NodeWrangler`.
 * @param options  - Optional configuration (name, apply, inputAttributes).
 * @returns The resulting `THREE.BufferGeometry` after evaluation.
 *
 * @example
 * ```ts
 * const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32));
 *
 * add_geomod(mesh, (nw) => {
 *   // Build geometry nodes — e.g. add displacement
 *   const noise = nw.new_node("ShaderNodeTexNoise", [], {}, { Scale: 5.0 });
 *   const setPos = nw.new_node("GeometryNodeSetPosition", [noise]);
 *   nw.new_node("NodeGroupOutput", [setPos]);
 * }, { name: "terrain_displacement" });
 * ```
 */
export function add_geomod(
  obj: THREE.Object3D,
  geoFunc: NodeGroupBuilder,
  options?: AddGeomodOptions,
): THREE.BufferGeometry {
  const opts: Required<AddGeomodOptions> = {
    name: options?.name ?? 'UnnamedGeomod',
    apply: options?.apply ?? true,
    inputAttributes: options?.inputAttributes ?? {},
  };

  // ── Retrieve the current geometry from the object ──
  let geometry: THREE.BufferGeometry;

  if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) {
    geometry = obj.geometry;
  } else {
    console.warn(
      `[add_geomod] Object "${obj.name || obj.uuid}" has no BufferGeometry. ` +
      'Creating an empty geometry as fallback.',
    );
    geometry = new THREE.BufferGeometry();
  }

  // ── Create a NodeWrangler with a named geometry group ──
  const nw = new NodeWrangler();
  const group = nw.getActiveGroup();
  group.name = opts.name;

  // ── Apply input attributes to the group's interface ──
  for (const [socketName, value] of Object.entries(opts.inputAttributes)) {
    const groupInput = nw.new_node('NodeGroupInput');
    if (!group.inputs.has(socketName)) {
      group.inputs.set(socketName, {
        id: `group_input_${socketName}`,
        name: socketName,
        type: typeof value === 'number' ? SocketType.FLOAT : SocketType.VECTOR,
        value,
        defaultValue: value,
        isInput: true,
      });
    }
    // Ensure the GroupInput node has a matching output
    if (!groupInput.outputs.has(socketName)) {
      groupInput.outputs.set(socketName, {
        id: `${groupInput.id}_out_${socketName}`,
        name: socketName,
        type: typeof value === 'number' ? SocketType.FLOAT : SocketType.VECTOR,
        isInput: false,
      });
    }
  }

  // ── Invoke the builder ──
  try {
    geoFunc(nw);
  } catch (err) {
    console.warn(`[add_geomod] Builder threw for "${opts.name}":`, err);
    return geometry;
  }

  // ── Evaluate the pipeline ──
  let resultGeometry: THREE.BufferGeometry;

  const activeGroup = nw.getActiveGroup();
  if (activeGroup.nodes.size > 0) {
    try {
      resultGeometry = GeometryNodePipeline.evaluate(geometry, nw as any);
    } catch (err) {
      console.warn(`[add_geomod] Pipeline evaluation failed for "${opts.name}":`, err);
      return geometry;
    }
  } else {
    // Builder didn't create any nodes — return original
    resultGeometry = geometry;
  }

  // ── Apply to the object if requested ──
  if (opts.apply && 'geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) {
    (obj as THREE.Mesh).geometry = resultGeometry;
  }

  return resultGeometry;
}

// ============================================================================
// shaderfunc_to_material
// ============================================================================

/**
 * Create a Three.js `Material` from a shader builder function.
 *
 * This is the TypeScript equivalent of Infinigen's
 * `surface.shaderfunc_to_material()`.
 *
 * The function:
 * 1. Creates a `NodeWrangler` with a `ShaderNodeTree`-named group.
 * 2. Invokes `shaderFunc(nw, ...args)` to build the shader graph.
 * 3. Evaluates the graph via `evaluateToMaterial()` to produce a
 *    `THREE.MeshPhysicalMaterial`.
 *
 * @param shaderFunc - A builder function that constructs a shader node graph.
 * @param args       - Extra arguments forwarded to the builder after `nw`.
 * @returns A compiled `THREE.Material`.
 *
 * @example
 * ```ts
 * const barkMat = shaderfunc_to_material((nw, roughness = 0.8) => {
 *   const principled = nw.new_node(
 *     "ShaderNodeBsdfPrincipled",
 *     [],
 *     {},
 *     { "Base Color": [0.4, 0.25, 0.1], Roughness: roughness },
 *   );
 *   nw.new_node("ShaderNodeOutputMaterial", [principled]);
 * }, 0.9);
 * ```
 */
export function shaderfunc_to_material(
  shaderFunc: NodeGroupBuilder,
  ...args: any[]
): THREE.Material {
  // ── Create a NodeWrangler with a ShaderNodeTree-named group ──
  const nw = new NodeWrangler();
  const group = nw.getActiveGroup();
  group.name = shaderFunc.name || 'UnnamedShaderFunc';

  // ── Invoke the builder ──
  try {
    shaderFunc(nw, ...args);
  } catch (err) {
    console.warn(
      `[shaderfunc_to_material] Builder "${group.name}" threw:`,
      err,
    );
    // Return a fallback material
    return new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.5,
      metalness: 0.0,
      name: `${group.name}_fallback`,
    });
  }

  // ── Evaluate the graph ──
  // Use `as any` for the same type-adaptation reason as to_material()
  const nodeGraph: any = {
    nodes: group.nodes,
    links: Array.from(group.links.values()),
  };

  const result = evaluateToMaterial(nodeGraph);
  const material = result.material;
  material.name = group.name;

  return material;
}

// ============================================================================
// Cache management utilities
// ============================================================================

/**
 * Clear the singleton node-group cache.
 *
 * Useful for hot-reloading or when the application needs to rebuild
 * all node groups from scratch.
 */
export function clearNodeGroupCache(): void {
  nodeGroupSingletonCache.clear();
}

/**
 * Clear the singleton material cache.
 *
 * Disposes of all cached materials (calls `material.dispose()`) before
 * removing them from the cache map.
 */
export function clearMaterialCache(): void {
  for (const material of materialSingletonCache.values()) {
    material.dispose();
  }
  materialSingletonCache.clear();
}

/**
 * Clear all singleton caches (both node groups and materials).
 */
export function clearAllCaches(): void {
  clearNodeGroupCache();
  clearMaterialCache();
}
