/**
 * ScatterSelectionMasks.ts — Surface Selection Masks for Scatter Placement
 *
 * Implements the missing scatter_lower / scatter_upward selection masks from
 * original Infinigen, plus slope, altitude, and noise-based masks.
 *
 * Each mask function returns a Float32Array weight mask (0-1 per face/vertex)
 * that can be used to control where scatter instances are placed.
 *
 * @module assets/scatters
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Scatter Lower — Selects faces pointing downward
// ============================================================================

/**
 * Selects faces pointing downward (normal.y < threshold).
 * Used for placing objects on the undersides of surfaces (e.g., stalactites, hanging moss).
 *
 * @param geometry The surface geometry
 * @param threshold Normal Y threshold (default -0.3, meaning slightly downward)
 * @param noiseScale Scale for noise-based variation (default 0, no noise)
 * @param seed Random seed for noise
 * @returns Float32Array weight mask (0-1 per vertex)
 */
export function scatterLower(
  geometry: THREE.BufferGeometry,
  threshold: number = -0.3,
  noiseScale: number = 0,
  seed: number = 42
): Float32Array {
  const normAttr = geometry.attributes.normal;
  const posAttr = geometry.attributes.position;
  if (!normAttr || !posAttr) return new Float32Array(0);

  const count = posAttr.count;
  const mask = new Float32Array(count);
  const rng = new SeededRandom(seed);

  const normal = new THREE.Vector3();
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    normal.fromBufferAttribute(normAttr, i);

    // Weight based on how downward the normal is
    const ny = normal.y;
    if (ny < threshold) {
      // Fully downward — weight 1.0
      mask[i] = 1.0;
    } else if (ny < threshold + 0.3) {
      // Transition zone — fade from 1.0 to 0.0
      mask[i] = 1.0 - (ny - threshold) / 0.3;
    } else {
      mask[i] = 0.0;
    }

    // Apply noise variation if requested
    if (noiseScale > 0) {
      position.fromBufferAttribute(posAttr, i);
      const noise = Math.sin(position.x * noiseScale + seed * 0.1) * 0.5 +
                     Math.sin(position.z * noiseScale + seed * 0.3) * 0.5;
      mask[i] *= 0.5 + 0.5 * noise;
    }

    // Add slight random variation
    mask[i] *= 0.8 + rng.next() * 0.2;
  }

  return mask;
}

// ============================================================================
// Scatter Upward — Selects faces pointing upward
// ============================================================================

/**
 * Selects faces pointing upward (normal.y > threshold).
 * Used for placing objects on top of surfaces (e.g., grass, ground cover, snow).
 *
 * @param geometry The surface geometry
 * @param threshold Normal Y threshold (default 0.3, meaning slightly upward)
 * @param noiseScale Scale for noise-based variation (default 0, no noise)
 * @param seed Random seed for noise
 * @returns Float32Array weight mask (0-1 per vertex)
 */
export function scatterUpward(
  geometry: THREE.BufferGeometry,
  threshold: number = 0.3,
  noiseScale: number = 0,
  seed: number = 42
): Float32Array {
  const normAttr = geometry.attributes.normal;
  const posAttr = geometry.attributes.position;
  if (!normAttr || !posAttr) return new Float32Array(0);

  const count = posAttr.count;
  const mask = new Float32Array(count);
  const rng = new SeededRandom(seed);

  const normal = new THREE.Vector3();
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    normal.fromBufferAttribute(normAttr, i);

    const ny = normal.y;
    if (ny > threshold) {
      mask[i] = 1.0;
    } else if (ny > threshold - 0.3) {
      mask[i] = (ny - (threshold - 0.3)) / 0.3;
    } else {
      mask[i] = 0.0;
    }

    if (noiseScale > 0) {
      position.fromBufferAttribute(posAttr, i);
      const noise = Math.sin(position.x * noiseScale + seed * 0.1) * 0.5 +
                     Math.sin(position.z * noiseScale + seed * 0.3) * 0.5;
      mask[i] *= 0.5 + 0.5 * noise;
    }

    mask[i] *= 0.8 + rng.next() * 0.2;
  }

  return mask;
}

// ============================================================================
// Scatter By Slope
// ============================================================================

/**
 * Selects faces within a slope range.
 * Useful for placing objects on cliffs (steep) or plains (flat).
 *
 * @param geometry The surface geometry
 * @param minSlope Minimum slope angle in radians (0=flat, PI/2=vertical)
 * @param maxSlope Maximum slope angle in radians
 * @returns Float32Array weight mask (0-1 per vertex)
 */
export function scatterBySlope(
  geometry: THREE.BufferGeometry,
  minSlope: number = 0,
  maxSlope: number = Math.PI / 2
): Float32Array {
  const normAttr = geometry.attributes.normal;
  const posAttr = geometry.attributes.position;
  if (!normAttr || !posAttr) return new Float32Array(0);

  const count = posAttr.count;
  const mask = new Float32Array(count);

  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    normal.fromBufferAttribute(normAttr, i);

    // Slope = angle from vertical = acos(|normal.y|)
    const slope = Math.acos(Math.abs(normal.y));

    if (slope >= minSlope && slope <= maxSlope) {
      mask[i] = 1.0;
    } else if (slope > minSlope - 0.1 && slope < minSlope) {
      mask[i] = (slope - (minSlope - 0.1)) / 0.1;
    } else if (slope > maxSlope && slope < maxSlope + 0.1) {
      mask[i] = (maxSlope + 0.1 - slope) / 0.1;
    } else {
      mask[i] = 0.0;
    }
  }

  return mask;
}

// ============================================================================
// Scatter By Altitude
// ============================================================================

/**
 * Selects faces within an altitude (Y) range.
 * Useful for altitude-dependent vegetation zones.
 *
 * @param geometry The surface geometry
 * @param minH Minimum height (default 0)
 * @param maxH Maximum height (default Infinity)
 * @returns Float32Array weight mask (0-1 per vertex)
 */
export function scatterByAltitude(
  geometry: THREE.BufferGeometry,
  minH: number = 0,
  maxH: number = Infinity
): Float32Array {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return new Float32Array(0);

  const count = posAttr.count;
  const mask = new Float32Array(count);

  const fadeRange = (maxH - minH) * 0.1; // 10% fade at edges

  for (let i = 0; i < count; i++) {
    const y = posAttr.getY(i);

    if (y >= minH && y <= maxH) {
      mask[i] = 1.0;
      // Fade at lower edge
      if (y < minH + fadeRange) {
        mask[i] = (y - minH) / fadeRange;
      }
      // Fade at upper edge
      if (maxH !== Infinity && y > maxH - fadeRange) {
        mask[i] = (maxH - y) / fadeRange;
      }
    } else {
      mask[i] = 0.0;
    }
  }

  return mask;
}

// ============================================================================
// Scatter By Noise
// ============================================================================

/**
 * Selects faces using noise-based threshold.
 * Creates organic, natural-looking distribution patterns.
 *
 * @param geometry The surface geometry
 * @param seed Random seed for noise
 * @param threshold Noise threshold (0-1, higher = fewer selections, default 0.5)
 * @param noiseScale Spatial scale of the noise pattern (default 1.0)
 * @returns Float32Array weight mask (0-1 per vertex)
 */
export function scatterByNoise(
  geometry: THREE.BufferGeometry,
  seed: number = 42,
  threshold: number = 0.5,
  noiseScale: number = 1.0
): Float32Array {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return new Float32Array(0);

  const count = posAttr.count;
  const mask = new Float32Array(count);
  const rng = new SeededRandom(seed);

  const position = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    position.fromBufferAttribute(posAttr, i);

    // Multi-octave noise for natural variation
    let noiseVal = 0;
    let amplitude = 1.0;
    let frequency = noiseScale;

    for (let oct = 0; oct < 4; oct++) {
      noiseVal += amplitude * (
        Math.sin(position.x * frequency + rng.next() * 100) * 0.5 +
        Math.sin(position.y * frequency + rng.next() * 100) * 0.25 +
        Math.sin(position.z * frequency + rng.next() * 100) * 0.25
      );
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    // Normalize to 0-1 range
    noiseVal = (noiseVal + 1) * 0.5;
    noiseVal = Math.max(0, Math.min(1, noiseVal));

    // Apply threshold with smooth transition
    if (noiseVal > threshold) {
      mask[i] = Math.min(1.0, (noiseVal - threshold) / (1.0 - threshold));
    } else {
      mask[i] = 0.0;
    }
  }

  return mask;
}

// ============================================================================
// Mask Combination Utilities
// ============================================================================

/**
 * Combine multiple masks by multiplying (intersection).
 * Only areas where ALL masks have high values will have high output.
 */
export function combineMasksAnd(masks: Float32Array[]): Float32Array {
  if (masks.length === 0) return new Float32Array(0);
  if (masks.length === 1) return masks[0];

  const length = masks[0].length;
  const result = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let val = 1.0;
    for (const mask of masks) {
      val *= i < mask.length ? mask[i] : 0;
    }
    result[i] = val;
  }

  return result;
}

/**
 * Combine multiple masks by adding (union).
 * Areas where ANY mask has high values will have high output.
 */
export function combineMasksOr(masks: Float32Array[]): Float32Array {
  if (masks.length === 0) return new Float32Array(0);
  if (masks.length === 1) return masks[0];

  const length = masks[0].length;
  const result = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let val = 0.0;
    for (const mask of masks) {
      val = Math.max(val, i < mask.length ? mask[i] : 0);
    }
    result[i] = val;
  }

  return result;
}

/**
 * Invert a mask (1 - value).
 */
export function invertMask(mask: Float32Array): Float32Array {
  const result = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = 1.0 - mask[i];
  }
  return result;
}

/**
 * Apply a mask to filter scatter positions.
 * Returns only positions where the mask value exceeds the threshold.
 */
export function filterPositionsByMask(
  positions: THREE.Vector3[],
  mask: Float32Array,
  threshold: number = 0.5
): THREE.Vector3[] {
  return positions.filter((_, i) => i < mask.length && mask[i] >= threshold);
}
