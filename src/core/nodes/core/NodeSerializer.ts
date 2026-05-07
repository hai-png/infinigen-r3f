/**
 * NodeSerializer — Complete serialization/deserialization with round-trip verification
 *
 * Provides a production-quality system for converting a {@link NodeWrangler} graph
 * to and from JSON.  The serialization format preserves every aspect of the graph:
 *
 * - All node groups (id, name, parent)
 * - All nodes in each group (id, type, name, location, properties)
 * - All sockets on each node (name, type, value, isInput, connectedTo)
 * - All links (id, fromNode, fromSocket, toNode, toSocket)
 * - Group interface (exposed inputs/outputs)
 *
 * Deserialization reconstructs the full in-memory representation, including
 * `Map<string, NodeSocket>` for inputs/outputs, verifies referential integrity,
 * and normalises node types through the registry's `resolveNodeType`.
 *
 * @module core/nodes/core/NodeSerializer
 */

import type { NodeInstance, NodeLink, NodeGroup } from '../types';
import type { NodeSocket } from '../registry/socket-types';
import { SocketType } from '../registry/socket-types';
import { resolveNodeType } from '../registry/node-type-registry';
import { NodeWrangler } from '../node-wrangler';

// ============================================================================
// Serialized shape interfaces
// ============================================================================

/**
 * Serialized representation of a single {@link NodeSocket}.
 *
 * Only the fields that are needed for faithful reconstruction are persisted;
 * the `definition` reference is omitted because it is re-attached at runtime
 * from the node-definition registry.
 */
export interface SerializedSocket {
  /** Socket name (matches the key in the parent Map) */
  name: string;
  /** Socket type — stored as the string key of {@link SocketType} */
  type: string;
  /** Current value on the socket, or `undefined` if connected */
  value?: unknown;
  /** Default value when unconnected */
  defaultValue?: unknown;
  /** ID of the socket this one is wired to, or `undefined` */
  connectedTo?: string;
  /** `true` for input sockets, `false` for output sockets */
  isInput: boolean;
}

/**
 * Serialized representation of a single {@link NodeInstance}.
 */
export interface SerializedNode {
  /** Unique node identifier within its group */
  id: string;
  /** Canonical Blender-style node type string */
  type: string;
  /** Human-readable display name */
  name: string;
  /** Canvas position [x, y] */
  location: [number, number];
  /** Node-specific property values */
  properties: Record<string, unknown>;
  /** Whether the node is collapsed in the editor */
  hidden?: boolean;
  /** Whether the node is muted/bypassed */
  muted?: boolean;
  /** Parent group ID if nested */
  parent?: string;
  /** Input sockets */
  inputs: SerializedSocket[];
  /** Output sockets */
  outputs: SerializedSocket[];
}

/**
 * Serialized representation of a single {@link NodeLink}.
 */
export interface SerializedLink {
  /** Unique link identifier */
  id: string;
  /** Source node ID */
  fromNode: string;
  /** Source output socket name */
  fromSocket: string;
  /** Destination node ID */
  toNode: string;
  /** Destination input socket name */
  toSocket: string;
}

/**
 * Serialized representation of a single {@link NodeGroup}.
 */
export interface SerializedGroup {
  /** Unique group identifier */
  id: string;
  /** Human-readable group name */
  name: string;
  /** Parent group ID for nested groups */
  parent?: string;
  /** Nodes in this group */
  nodes: SerializedNode[];
  /** Links in this group */
  links: SerializedLink[];
  /** Exposed group-input sockets */
  inputs: SerializedSocket[];
  /** Exposed group-output sockets */
  outputs: SerializedSocket[];
}

/**
 * Top-level serialized representation of a {@link NodeWrangler} graph.
 */
export interface SerializedNodeWrangler {
  /** Schema version for forward-compatible migrations */
  version: string;
  /** All node groups that make up the graph */
  groups: SerializedGroup[];
  /** Which group is currently active */
  activeGroup: string;
  /** The next node counter value (so new IDs don't collide) */
  nodeCounter: number;
  /** The next link counter value */
  linkCounter: number;
}

// ============================================================================
// Version constant
// ============================================================================

/** Current serialization schema version. */
const SERIALIZER_VERSION = '2.0.0';

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a {@link NodeWrangler} to a JSON string.
 *
 * The output is a self-contained JSON document that can be stored, transmitted,
 * or fed into {@link deserializeNodeWrangler} to reconstruct an identical graph.
 *
 * @param nw - The NodeWrangler instance to serialize
 * @param pretty - Whether to pretty-print the JSON (default: `true`)
 * @returns A JSON string representing the full graph
 *
 * @example
 * ```ts
 * const json = serializeNodeWrangler(myWrangler);
 * localStorage.setItem('myGraph', json);
 * ```
 */
export function serializeNodeWrangler(nw: NodeWrangler, pretty: boolean = true): string {
  const data = serializeToObj(nw);
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/**
 * Serialize a {@link NodeWrangler} to a plain object.
 *
 * Useful when the caller wants to embed the serialized graph inside a larger
 * JSON structure without an extra stringify/parse round-trip.
 *
 * @param nw - The NodeWrangler instance to serialize
 * @returns A plain object representing the full graph
 */
export function serializeToObj(nw: NodeWrangler): SerializedNodeWrangler {
  // Access private fields through the public API where possible.
  // We need the internal groups map, active group, and counters.
  // NodeWrangler exposes getActiveGroup() but not the full groups map.
  // We use toJSON() as the authoritative source of the graph structure
  // and then parse it back, or we directly access the internal state.
  // Since this module is part of the same package, we use (nw as any)
  // to access the private fields — this is intentional for the serializer.

  const nwAny = nw as any;
  const nodeGroups: Map<string, NodeGroup> = nwAny.nodeGroups;
  const activeGroup: string = nwAny.activeGroup;
  const nodeCounter: number = nwAny.nodeCounter;
  const linkCounter: number = nwAny.linkCounter;

  const groups: SerializedGroup[] = [];

  for (const [, group] of nodeGroups.entries()) {
    groups.push(serializeGroup(group));
  }

  return {
    version: SERIALIZER_VERSION,
    groups,
    activeGroup,
    nodeCounter,
    linkCounter,
  };
}

// ============================================================================
// Deserialization
// ============================================================================

/**
 * Deserialize a {@link NodeWrangler} from a JSON string.
 *
 * Reconstructs all `NodeGroup`, `NodeInstance`, `NodeSocket`, and `NodeLink`
 * objects — converting serialized arrays back into `Map` instances.  Node type
 * strings are normalised through the registry's `resolveNodeType`.
 *
 * Referential integrity is verified: every `fromNode`/`toNode` in a link must
 * reference a node that exists in the same group, and every `connectedTo` on a
 * socket must reference a socket ID that exists somewhere in the group.
 *
 * @param json - A JSON string produced by {@link serializeNodeWrangler}
 * @returns A fully reconstructed `NodeWrangler`
 * @throws {Error} If the JSON is malformed, structurally invalid, or contains
 *   dangling references
 *
 * @example
 * ```ts
 * const json = localStorage.getItem('myGraph')!;
 * const nw = deserializeNodeWrangler(json);
 * ```
 */
export function deserializeNodeWrangler(json: string): NodeWrangler {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `deserializeNodeWrangler: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return deserializeFromObj(data);
}

/**
 * Deserialize a {@link NodeWrangler} from a plain object.
 *
 * @param data - A plain object matching the {@link SerializedNodeWrangler} shape
 * @returns A fully reconstructed `NodeWrangler`
 * @throws {Error} If the data is structurally invalid or contains dangling references
 */
export function deserializeFromObj(data: unknown): NodeWrangler {
  // ---- Top-level validation ----
  if (!data || typeof data !== 'object') {
    throw new Error('deserializeNodeWrangler: input is not an object');
  }

  const root = data as Record<string, unknown>;

  if (!Array.isArray(root.groups)) {
    throw new Error('deserializeNodeWrangler: expected "groups" array');
  }

  if (typeof root.activeGroup !== 'string') {
    throw new Error('deserializeNodeWrangler: expected "activeGroup" string');
  }

  // ---- Reconstruct the NodeWrangler ----
  const wrangler = new NodeWrangler();

  // Access private fields to restore state
  const nwAny = wrangler as any;
  nwAny.nodeGroups.clear();

  const allGroupIds = new Set<string>();
  const maxCounters = { node: 0, link: 0 };

  for (const groupData of root.groups) {
    const group = deserializeGroup(groupData, maxCounters);
    if (allGroupIds.has(group.id)) {
      throw new Error(
        `deserializeNodeWrangler: duplicate group ID "${group.id}"`,
      );
    }
    allGroupIds.add(group.id);
    nwAny.nodeGroups.set(group.id, group);
  }

  // Validate active group
  if (!allGroupIds.has(root.activeGroup as string)) {
    throw new Error(
      `deserializeNodeWrangler: activeGroup "${root.activeGroup as string}" not found in groups`,
    );
  }

  nwAny.activeGroup = root.activeGroup as string;

  // Restore counters — use the greater of serialized value and extracted max
  nwAny.nodeCounter = Math.max(
    (root.nodeCounter as number) || 0,
    maxCounters.node,
  );
  nwAny.linkCounter = Math.max(
    (root.linkCounter as number) || 0,
    maxCounters.link,
  );

  // ---- Referential integrity verification ----
  for (const [, group] of (nwAny.nodeGroups as Map<string, NodeGroup>).entries()) {
    verifyGroupIntegrity(group);
  }

  return wrangler;
}

// ============================================================================
// Round-trip verification
// ============================================================================

/**
 * Result of a round-trip verification.
 */
export interface SerializationRoundTripResult {
  /** `true` if the serialized-then-deserialized graph is equivalent to the original */
  success: boolean;
  /** List of error descriptions (empty when `success` is `true`) */
  errors: string[];
}

/**
 * Verify that a {@link NodeWrangler} can survive a serialize → deserialize round-trip.
 *
 * Serializes the wrangler, immediately deserializes it, then compares the two
 * graphs for structural equivalence.  The comparison checks:
 *
 * - Same set of group IDs with matching names and parents
 * - Same set of node IDs per group with matching type, name, location, properties
 * - Same sockets per node with matching name, type, value, isInput, connectedTo
 * - Same links per group
 * - Same group interface (exposed inputs/outputs)
 * - Same active group
 *
 * @param nw - The NodeWrangler to test
 * @returns A {@link SerializationRoundTripResult} with `success` and any `errors`
 *
 * @example
 * ```ts
 * const result = verifyRoundTrip(myWrangler);
 * if (!result.success) {
 *   console.error('Round-trip failed:', result.errors);
 * }
 * ```
 */
export function verifyRoundTrip(nw: NodeWrangler): SerializationRoundTripResult {
  const errors: string[] = [];

  try {
    const json = serializeNodeWrangler(nw, false);
    const restored = deserializeNodeWrangler(json);

    const nwAny = nw as any;
    const restoredAny = restored as any;

    const originalGroups: Map<string, NodeGroup> = nwAny.nodeGroups;
    const restoredGroups: Map<string, NodeGroup> = restoredAny.nodeGroups;

    // ---- Compare group sets ----
    if (originalGroups.size !== restoredGroups.size) {
      errors.push(
        `Group count mismatch: original=${originalGroups.size}, restored=${restoredGroups.size}`,
      );
    }

    for (const [groupId, originalGroup] of originalGroups.entries()) {
      const restoredGroup = restoredGroups.get(groupId);
      if (!restoredGroup) {
        errors.push(`Group "${groupId}" missing in restored wrangler`);
        continue;
      }

      // Group metadata
      if (originalGroup.name !== restoredGroup.name) {
        errors.push(
          `Group "${groupId}" name mismatch: "${originalGroup.name}" vs "${restoredGroup.name}"`,
        );
      }
      if (originalGroup.parent !== restoredGroup.parent) {
        errors.push(
          `Group "${groupId}" parent mismatch: "${originalGroup.parent}" vs "${restoredGroup.parent}"`,
        );
      }

      // ---- Compare nodes ----
      if (originalGroup.nodes.size !== restoredGroup.nodes.size) {
        errors.push(
          `Group "${groupId}" node count mismatch: ${originalGroup.nodes.size} vs ${restoredGroup.nodes.size}`,
        );
      }

      for (const [nodeId, originalNode] of originalGroup.nodes.entries()) {
        const restoredNode = restoredGroup.nodes.get(nodeId);
        if (!restoredNode) {
          errors.push(`Node "${nodeId}" missing in restored group "${groupId}"`);
          continue;
        }
        compareNode(originalNode, restoredNode, groupId, errors);
      }

      // ---- Compare links ----
      if (originalGroup.links.size !== restoredGroup.links.size) {
        errors.push(
          `Group "${groupId}" link count mismatch: ${originalGroup.links.size} vs ${restoredGroup.links.size}`,
        );
      }

      for (const [linkId, originalLink] of originalGroup.links.entries()) {
        const restoredLink = restoredGroup.links.get(linkId);
        if (!restoredLink) {
          errors.push(`Link "${linkId}" missing in restored group "${groupId}"`);
          continue;
        }
        compareLink(originalLink, restoredLink, groupId, errors);
      }

      // ---- Compare group interface ----
      compareSocketMap(
        originalGroup.inputs,
        restoredGroup.inputs,
        `group "${groupId}" inputs`,
        errors,
      );
      compareSocketMap(
        originalGroup.outputs,
        restoredGroup.outputs,
        `group "${groupId}" outputs`,
        errors,
      );
    }

    // ---- Compare active group ----
    if (nwAny.activeGroup !== restoredAny.activeGroup) {
      errors.push(
        `Active group mismatch: "${nwAny.activeGroup}" vs "${restoredAny.activeGroup}"`,
      );
    }
  } catch (err) {
    errors.push(
      `Round-trip threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { success: errors.length === 0, errors } as SerializationRoundTripResult;
}

// ============================================================================
// Internal: serialization helpers
// ============================================================================

/**
 * Serialize a single {@link NodeGroup}.
 */
function serializeGroup(group: NodeGroup): SerializedGroup {
  const nodes: SerializedNode[] = [];
  for (const [, node] of group.nodes.entries()) {
    nodes.push(serializeNode(node));
  }

  const links: SerializedLink[] = [];
  for (const [, link] of group.links.entries()) {
    links.push({
      id: link.id,
      fromNode: link.fromNode,
      fromSocket: link.fromSocket,
      toNode: link.toNode,
      toSocket: link.toSocket,
    });
  }

  const inputs: SerializedSocket[] = [];
  for (const [, socket] of group.inputs.entries()) {
    inputs.push(serializeSocket(socket));
  }

  const outputs: SerializedSocket[] = [];
  for (const [, socket] of group.outputs.entries()) {
    outputs.push(serializeSocket(socket));
  }

  return {
    id: group.id,
    name: group.name,
    parent: group.parent,
    nodes,
    links,
    inputs,
    outputs,
  };
}

/**
 * Serialize a single {@link NodeInstance}.
 */
function serializeNode(node: NodeInstance): SerializedNode {
  const inputs: SerializedSocket[] = [];
  for (const [, socket] of node.inputs.entries()) {
    inputs.push(serializeSocket(socket));
  }

  const outputs: SerializedSocket[] = [];
  for (const [, socket] of node.outputs.entries()) {
    outputs.push(serializeSocket(socket));
  }

  return {
    id: node.id,
    type: node.type,
    name: node.name,
    location: node.location,
    properties: node.properties,
    hidden: node.hidden,
    muted: node.muted,
    parent: node.parent,
    inputs,
    outputs,
  };
}

/**
 * Serialize a single {@link NodeSocket}.
 *
 * The `definition` field is intentionally omitted because it is a runtime-only
 * reference to the node-definition registry and cannot be meaningfully
 * serialised.
 */
function serializeSocket(socket: NodeSocket): SerializedSocket {
  return {
    name: socket.name,
    type: socket.type as string,
    value: socket.value,
    defaultValue: socket.defaultValue,
    connectedTo: socket.connectedTo,
    isInput: socket.isInput,
  };
}

// ============================================================================
// Internal: deserialization helpers
// ============================================================================

/**
 * Deserialize a single {@link NodeGroup} from its serialized form.
 *
 * @param data - The serialized group data
 * @param maxCounters - Mutable tracker for the highest node/link counter values
 *   found in IDs (so the wrangler's counters can be set above them)
 * @returns A reconstructed `NodeGroup`
 * @throws {Error} If the data is structurally invalid
 */
function deserializeGroup(
  data: unknown,
  maxCounters: { node: number; link: number },
): NodeGroup {
  if (!data || typeof data !== 'object') {
    throw new Error('deserializeNodeWrangler: invalid group entry');
  }

  const g = data as Record<string, unknown>;

  if (typeof g.id !== 'string') {
    throw new Error('deserializeNodeWrangler: group missing "id" string');
  }
  if (typeof g.name !== 'string') {
    throw new Error(`deserializeNodeWrangler: group "${g.id}" missing "name" string`);
  }

  // ---- Rebuild nodes ----
  const nodesMap = new Map<string, NodeInstance>();
  if (Array.isArray(g.nodes)) {
    for (const nodeData of g.nodes) {
      const node = deserializeNode(nodeData, maxCounters);
      if (nodesMap.has(node.id)) {
        throw new Error(
          `deserializeNodeWrangler: duplicate node ID "${node.id}" in group "${g.id}"`,
        );
      }
      nodesMap.set(node.id, node);
    }
  }

  // ---- Rebuild links ----
  const linksMap = new Map<string, NodeLink>();
  if (Array.isArray(g.links)) {
    for (const linkData of g.links) {
      const link = deserializeLink(linkData, maxCounters);
      if (linksMap.has(link.id)) {
        throw new Error(
          `deserializeNodeWrangler: duplicate link ID "${link.id}" in group "${g.id}"`,
        );
      }
      linksMap.set(link.id, link);
    }
  }

  // ---- Rebuild group interface ----
  const inputsMap = deserializeSocketMap(g.inputs, 'group input');
  const outputsMap = deserializeSocketMap(g.outputs, 'group output');

  return {
    id: g.id,
    name: g.name,
    nodes: nodesMap,
    links: linksMap,
    inputs: inputsMap,
    outputs: outputsMap,
    parent: typeof g.parent === 'string' ? g.parent : undefined,
  };
}

/**
 * Deserialize a single {@link NodeInstance} from its serialized form.
 *
 * Node type strings are normalised through `resolveNodeType` so that aliases
 * are mapped to their canonical Blender-style form.
 *
 * @param data - The serialized node data
 * @param maxCounters - Mutable counter tracker
 * @returns A reconstructed `NodeInstance`
 * @throws {Error} If the data is structurally invalid
 */
function deserializeNode(
  data: unknown,
  maxCounters: { node: number; link: number },
): NodeInstance {
  if (!data || typeof data !== 'object') {
    throw new Error('deserializeNodeWrangler: invalid node entry');
  }

  const n = data as Record<string, unknown>;

  if (typeof n.id !== 'string') {
    throw new Error('deserializeNodeWrangler: node missing "id" string');
  }

  // Track counter from node ID (e.g. "node_5" → 5)
  const nodeNum = extractCounter(n.id, 'node_');
  if (nodeNum >= maxCounters.node) {
    maxCounters.node = nodeNum + 1;
  }

  // Resolve the type through the registry
  const rawType = String(n.type ?? '');
  const resolvedType = resolveNodeType(rawType);

  // Rebuild input sockets
  const inputsMap = new Map<string, NodeSocket>();
  if (Array.isArray(n.inputs)) {
    for (const sockData of n.inputs) {
      const socket = deserializeSocket(sockData, n.id, true);
      if (inputsMap.has(socket.name)) {
        throw new Error(
          `deserializeNodeWrangler: duplicate input socket "${socket.name}" on node "${n.id}"`,
        );
      }
      inputsMap.set(socket.name, socket);
    }
  }

  // Rebuild output sockets
  const outputsMap = new Map<string, NodeSocket>();
  if (Array.isArray(n.outputs)) {
    for (const sockData of n.outputs) {
      const socket = deserializeSocket(sockData, n.id, false);
      if (outputsMap.has(socket.name)) {
        throw new Error(
          `deserializeNodeWrangler: duplicate output socket "${socket.name}" on node "${n.id}"`,
        );
      }
      outputsMap.set(socket.name, socket);
    }
  }

  // Normalise location to [number, number]
  let location: [number, number] = [0, 0];
  if (Array.isArray(n.location) && n.location.length >= 2) {
    location = [Number(n.location[0]) || 0, Number(n.location[1]) || 0];
  }

  return {
    id: n.id,
    type: resolvedType,
    name: String(n.name ?? ''),
    location,
    inputs: inputsMap,
    outputs: outputsMap,
    properties:
      n.properties && typeof n.properties === 'object'
        ? (n.properties as Record<string, unknown>)
        : {},
    hidden: n.hidden === true,
    muted: n.muted === true,
    parent: typeof n.parent === 'string' ? n.parent : undefined,
  };
}

/**
 * Deserialize a single {@link NodeLink} from its serialized form.
 *
 * @param data - The serialized link data
 * @param maxCounters - Mutable counter tracker
 * @returns A reconstructed `NodeLink`
 * @throws {Error} If the data is structurally invalid
 */
function deserializeLink(
  data: unknown,
  maxCounters: { node: number; link: number },
): NodeLink {
  if (!data || typeof data !== 'object') {
    throw new Error('deserializeNodeWrangler: invalid link entry');
  }

  const l = data as Record<string, unknown>;

  if (typeof l.id !== 'string') {
    throw new Error('deserializeNodeWrangler: link missing "id" string');
  }
  if (typeof l.fromNode !== 'string') {
    throw new Error(`deserializeNodeWrangler: link "${l.id}" missing "fromNode" string`);
  }
  if (typeof l.fromSocket !== 'string') {
    throw new Error(`deserializeNodeWrangler: link "${l.id}" missing "fromSocket" string`);
  }
  if (typeof l.toNode !== 'string') {
    throw new Error(`deserializeNodeWrangler: link "${l.id}" missing "toNode" string`);
  }
  if (typeof l.toSocket !== 'string') {
    throw new Error(`deserializeNodeWrangler: link "${l.id}" missing "toSocket" string`);
  }

  // Track counter from link ID (e.g. "link_3" → 3)
  const linkNum = extractCounter(l.id, 'link_');
  if (linkNum >= maxCounters.link) {
    maxCounters.link = linkNum + 1;
  }

  return {
    id: l.id,
    fromNode: l.fromNode,
    fromSocket: l.fromSocket,
    toNode: l.toNode,
    toSocket: l.toSocket,
  };
}

/**
 * Deserialize a single {@link NodeSocket} from its serialized form.
 *
 * @param data - The serialized socket data
 * @param nodeId - The parent node ID (used to reconstruct the socket ID)
 * @param defaultIsInput - Default value for `isInput` if the field is missing
 * @returns A reconstructed `NodeSocket`
 * @throws {Error} If the data is structurally invalid
 */
function deserializeSocket(
  data: unknown,
  nodeId: string,
  defaultIsInput: boolean,
): NodeSocket {
  if (!data || typeof data !== 'object') {
    throw new Error(
      `deserializeNodeWrangler: invalid socket entry on node "${nodeId}"`,
    );
  }

  const s = data as Record<string, unknown>;

  if (typeof s.name !== 'string') {
    throw new Error(
      `deserializeNodeWrangler: socket on node "${nodeId}" missing "name" string`,
    );
  }

  // Resolve the socket type — accept both the enum key ('FLOAT') and the
  // enum value (SocketType.FLOAT = 'FLOAT').  If it's not a recognised
  // SocketType, store it as-is (extension sockets).
  const typeStr = String(s.type ?? 'VALUE');
  const socketType = resolveSocketType(typeStr);

  return {
    id: typeof s.id === 'string' ? s.id : `${nodeId}_${defaultIsInput ? 'in' : 'out'}_${s.name}`,
    name: s.name,
    type: socketType,
    value: s.value,
    defaultValue: s.defaultValue,
    connectedTo: typeof s.connectedTo === 'string' ? s.connectedTo : undefined,
    isInput: typeof s.isInput === 'boolean' ? s.isInput : defaultIsInput,
  };
}

/**
 * Deserialize an array of serialized sockets into a `Map<string, NodeSocket>`.
 *
 * @param data - The serialized socket array (or `undefined`)
 * @param context - A human-readable context string for error messages
 * @returns A `Map` keyed by socket name
 */
function deserializeSocketMap(
  data: unknown,
  context: string,
): Map<string, NodeSocket> {
  const map = new Map<string, NodeSocket>();
  if (!Array.isArray(data)) return map;

  for (const sockData of data) {
    if (!sockData || typeof sockData !== 'object') continue;
    const s = sockData as Record<string, unknown>;
    const name = String(s.name ?? '');
    if (!name) continue;

    const isInput = typeof s.isInput === 'boolean' ? s.isInput : context.includes('input');
    const typeStr = String(s.type ?? 'VALUE');
    const socketType = resolveSocketType(typeStr);

    const socket: NodeSocket = {
      id: typeof s.id === 'string' ? s.id : `group_${context}_${name}`,
      name,
      type: socketType,
      value: s.value,
      defaultValue: s.defaultValue,
      connectedTo: typeof s.connectedTo === 'string' ? s.connectedTo : undefined,
      isInput,
    };
    map.set(name, socket);
  }

  return map;
}

// ============================================================================
// Internal: integrity verification
// ============================================================================

/**
 * Verify referential integrity within a single {@link NodeGroup}.
 *
 * Checks that:
 * - Every link references nodes that exist in the group
 * - Every link references sockets that exist on those nodes
 * - Every `connectedTo` on a socket references a socket ID that exists
 *
 * @param group - The group to verify
 * @throws {Error} If any dangling reference is found
 */
function verifyGroupIntegrity(group: NodeGroup): void {
  const errors: string[] = [];

  // Build a set of all socket IDs in this group for connectedTo verification
  const socketIds = new Set<string>();
  for (const [, node] of group.nodes.entries()) {
    for (const [, socket] of node.inputs.entries()) {
      if (socket.id) socketIds.add(socket.id);
    }
    for (const [, socket] of node.outputs.entries()) {
      if (socket.id) socketIds.add(socket.id);
    }
  }

  // Verify links
  for (const [linkId, link] of group.links.entries()) {
    const fromNode = group.nodes.get(link.fromNode);
    if (!fromNode) {
      errors.push(
        `Link "${linkId}" references non-existent fromNode "${link.fromNode}"`,
      );
    } else {
      const fromSocket = fromNode.outputs.get(link.fromSocket);
      if (!fromSocket) {
        errors.push(
          `Link "${linkId}" references non-existent fromSocket "${link.fromSocket}" on node "${link.fromNode}"`,
        );
      }
    }

    const toNode = group.nodes.get(link.toNode);
    if (!toNode) {
      errors.push(
        `Link "${linkId}" references non-existent toNode "${link.toNode}"`,
      );
    } else {
      const toSocket = toNode.inputs.get(link.toSocket);
      if (!toSocket) {
        errors.push(
          `Link "${linkId}" references non-existent toSocket "${link.toSocket}" on node "${link.toNode}"`,
        );
      }
    }
  }

  // Verify connectedTo references
  for (const [nodeId, node] of group.nodes.entries()) {
    for (const [, socket] of node.inputs.entries()) {
      if (socket.connectedTo && !socketIds.has(socket.connectedTo)) {
        errors.push(
          `Node "${nodeId}" input "${socket.name}" connectedTo "${socket.connectedTo}" does not exist in group "${group.id}"`,
        );
      }
    }
    for (const [, socket] of node.outputs.entries()) {
      if (socket.connectedTo && !socketIds.has(socket.connectedTo)) {
        errors.push(
          `Node "${nodeId}" output "${socket.name}" connectedTo "${socket.connectedTo}" does not exist in group "${group.id}"`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `deserializeNodeWrangler: integrity check failed for group "${group.id}":\n  ${errors.join('\n  ')}`,
    );
  }
}

// ============================================================================
// Internal: comparison helpers (for round-trip verification)
// ============================================================================

/**
 * Compare two `NodeInstance` objects and push any differences into `errors`.
 */
function compareNode(
  a: NodeInstance,
  b: NodeInstance,
  groupId: string,
  errors: string[],
): void {
  const prefix = `Node "${a.id}" in group "${groupId}"`;

  if (a.type !== b.type) {
    errors.push(`${prefix}: type mismatch "${a.type}" vs "${b.type}"`);
  }
  if (a.name !== b.name) {
    errors.push(`${prefix}: name mismatch "${a.name}" vs "${b.name}"`);
  }
  if (a.location[0] !== b.location[0] || a.location[1] !== b.location[1]) {
    errors.push(
      `${prefix}: location mismatch [${a.location}] vs [${b.location}]`,
    );
  }
  if (a.hidden !== b.hidden) {
    errors.push(`${prefix}: hidden mismatch ${a.hidden} vs ${b.hidden}`);
  }
  if (a.muted !== b.muted) {
    errors.push(`${prefix}: muted mismatch ${a.muted} vs ${b.muted}`);
  }
  if (a.parent !== b.parent) {
    errors.push(`${prefix}: parent mismatch "${a.parent}" vs "${b.parent}"`);
  }

  // Compare properties
  const propsA = JSON.stringify(a.properties ?? {});
  const propsB = JSON.stringify(b.properties ?? {});
  if (propsA !== propsB) {
    errors.push(`${prefix}: properties mismatch`);
  }

  // Compare sockets
  compareSocketMap(a.inputs, b.inputs, `${prefix} inputs`, errors);
  compareSocketMap(a.outputs, b.outputs, `${prefix} outputs`, errors);
}

/**
 * Compare two `NodeLink` objects and push any differences into `errors`.
 */
function compareLink(
  a: NodeLink,
  b: NodeLink,
  groupId: string,
  errors: string[],
): void {
  const prefix = `Link "${a.id}" in group "${groupId}"`;

  if (a.fromNode !== b.fromNode) {
    errors.push(`${prefix}: fromNode mismatch "${a.fromNode}" vs "${b.fromNode}"`);
  }
  if (a.fromSocket !== b.fromSocket) {
    errors.push(`${prefix}: fromSocket mismatch "${a.fromSocket}" vs "${b.fromSocket}"`);
  }
  if (a.toNode !== b.toNode) {
    errors.push(`${prefix}: toNode mismatch "${a.toNode}" vs "${b.toNode}"`);
  }
  if (a.toSocket !== b.toSocket) {
    errors.push(`${prefix}: toSocket mismatch "${a.toSocket}" vs "${b.toSocket}"`);
  }
}

/**
 * Compare two `Map<string, NodeSocket>` instances and push any differences
 * into `errors`.
 */
function compareSocketMap(
  a: Map<string, NodeSocket>,
  b: Map<string, NodeSocket>,
  context: string,
  errors: string[],
): void {
  if (a.size !== b.size) {
    errors.push(`${context}: socket count mismatch ${a.size} vs ${b.size}`);
  }

  for (const [name, socketA] of a.entries()) {
    const socketB = b.get(name);
    if (!socketB) {
      errors.push(`${context}: socket "${name}" missing in restored`);
      continue;
    }
    compareSocket(socketA, socketB, context, errors);
  }
}

/**
 * Compare two `NodeSocket` instances and push any differences into `errors`.
 */
function compareSocket(
  a: NodeSocket,
  b: NodeSocket,
  context: string,
  errors: string[],
): void {
  const prefix = `${context} socket "${a.name}"`;

  if (a.type !== b.type) {
    errors.push(`${prefix}: type mismatch "${a.type}" vs "${b.type}"`);
  }
  if (a.isInput !== b.isInput) {
    errors.push(`${prefix}: isInput mismatch ${a.isInput} vs ${b.isInput}`);
  }
  if (a.connectedTo !== b.connectedTo) {
    errors.push(
      `${prefix}: connectedTo mismatch "${a.connectedTo}" vs "${b.connectedTo}"`,
    );
  }

  // Compare values — use JSON stringify for deep equality
  const valA = JSON.stringify(a.value);
  const valB = JSON.stringify(b.value);
  if (valA !== valB) {
    errors.push(`${prefix}: value mismatch`);
  }

  const defA = JSON.stringify(a.defaultValue);
  const defB = JSON.stringify(b.defaultValue);
  if (defA !== defB) {
    errors.push(`${prefix}: defaultValue mismatch`);
  }
}

// ============================================================================
// Internal: utility helpers
// ============================================================================

/**
 * Resolve a socket type string to a {@link SocketType} enum value.
 *
 * Accepts both the enum key form (e.g. `'FLOAT'`) and falls back to
 * storing the raw string if it is not a known {@link SocketType}.
 *
 * @param typeStr - The socket type string to resolve
 * @returns The resolved `SocketType`
 */
function resolveSocketType(typeStr: string): SocketType {
  // The SocketType enum values are upper-cased strings identical to
  // their keys, so `SocketType.FLOAT === 'FLOAT'`.  Check if the string
  // matches any enum value.
  const enumValues = Object.values(SocketType) as string[];
  if (enumValues.includes(typeStr)) {
    return typeStr as SocketType;
  }
  // Fallback: try looking it up by key (shouldn't normally be needed)
  const enumKeys = Object.keys(SocketType);
  for (const key of enumKeys) {
    if ((SocketType as Record<string, string>)[key] === typeStr) {
      return typeStr as SocketType;
    }
  }
  // Unknown type — return VALUE as a safe default
  return SocketType.VALUE;
}

/**
 * Extract a numeric counter from an ID string of the form `${prefix}${n}`.
 *
 * For example, `extractCounter('node_5', 'node_')` returns `5`.
 * Returns `-1` if the pattern doesn't match.
 *
 * @param id - The ID string to parse
 * @param prefix - The prefix before the numeric counter
 * @returns The extracted counter number, or `-1`
 */
function extractCounter(id: string, prefix: string): number {
  if (id.startsWith(prefix)) {
    const suffix = id.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num)) return num;
  }
  return -1;
}
