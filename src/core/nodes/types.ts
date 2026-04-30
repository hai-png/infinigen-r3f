/**
 * Common type definitions for the node system
 * Provides "Like" types that accept both Three.js types and plain objects
 */

import type { Color, Vector3, Vector2, Euler, Quaternion, Matrix4 } from 'three';

// Color types - accept both THREE.Color and plain objects
export type ColorLike = Color | { r: number; g: number; b: number };
export type ColorArrayLike = ColorLike | number[] | string;

// Vector types - accept both THREE.Vector3 and plain objects
export type Vector3Like = Vector3 | { x: number; y: number; z: number };
export type Vector2Like = Vector2 | { x: number; y: number };

// Other Three.js types
export type EulerLike = Euler | { x: number; y: number; z: number; order?: string };
export type QuaternionLike = Quaternion | { x: number; y: number; z: number; w: number };
export type Matrix4Like = Matrix4 | number[];

// Helper function to convert ColorLike to Color
export function toColor(color: ColorLike): Color {
  if (color instanceof Color) return color;
  return new Color(color.r, color.g, color.b);
}

// Helper function to convert Vector3Like to Vector3
export function toVector3(vec: Vector3Like): Vector3 {
  if (vec instanceof Vector3) return vec;
  return new Vector3(vec.x, vec.y, vec.z);
}
