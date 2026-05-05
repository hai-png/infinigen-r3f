/**
 * ExecutorTypes — Shared type definitions for the node execution subsystem
 *
 * Replaces raw `any` and `Record<string, any>` annotations with explicit,
 * safer types across executor modules. These types are intentionally loose
 * enough to accommodate the dynamic nature of node graph evaluation while
 * still providing compile-time safety and IDE autocompletion.
 *
 * @module @infinigen/r3f/nodes/execution/ExecutorTypes
 */

import * as THREE from 'three';

// ============================================================================
// Core I/O Types
// ============================================================================

/**
 * NodeInputs — The standard input bag for any node executor function.
 * Replaces `Record<string, any>`.
 *
 * Keys are socket names (e.g. "Geometry", "Vector", "Scale").
 * Values are the resolved data passed along the connection edge.
 */
export type NodeInputs = Record<string, unknown>;

/**
 * NodeOutput — The standard return type for any node executor function.
 * Replaces bare `any` return annotations.
 *
 * Keys are output socket names (e.g. "Geometry", "Color", "Fac").
 * Values are the computed output data.
 */
export type NodeOutput = Record<string, any>;

// ============================================================================
// Value-like Types
// ============================================================================

/**
 * Vector3Like — A relaxed 3-component vector representation.
 * Covers the `normalizeVec` pattern used across every executor module:
 *   - `THREE.Vector3` instances
 *   - Plain `{ x, y, z }` objects
 *   - Tuple arrays `[x, y, z]`
 *   - Partial objects (fallback to 0 for missing components)
 */
export type Vector3Like = { x: number; y: number; z: number };

/**
 * ColorLike — A relaxed RGBA color representation.
 * Matches the pattern used in texture and color node executors where
 * color values may be plain objects with optional alpha.
 */
export type ColorLike = { r: number; g: number; b: number; a?: number };

/**
 * GeometryLike — The standard geometry representation in the executor layer.
 * Most geometry executors accept a `BufferGeometry | null` (null for missing input).
 */
export type GeometryLike = THREE.BufferGeometry | null;

// ============================================================================
// Function Types
// ============================================================================

/**
 * NodeExecutorFunction — The canonical signature for a node executor.
 * Replaces `(inputs: Record<string, any>, ...) => any`.
 *
 * @param inputs  - The named input values from upstream connections
 * @param settings - Optional execution settings / node properties
 * @returns A keyed object matching the node's output sockets
 */
export type NodeExecutorFunction = (
  inputs: NodeInputs,
  settings?: Record<string, unknown>,
) => NodeOutput;
