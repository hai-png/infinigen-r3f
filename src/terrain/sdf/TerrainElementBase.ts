/**
 * Terrain Element Base Class and Core Types
 *
 * Extracted from TerrainElementSystem.ts to break the circular dependency
 * between TerrainElementSystem.ts and MissingElements.ts.
 *
 * MissingElements.ts imports TerrainElement (base class) from this file,
 * while TerrainElementSystem.ts imports derived classes from MissingElements.ts.
 * By placing the base class here, both can import without circularity.
 *
 * @module terrain/sdf/TerrainElementBase
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Result of evaluating a terrain element at a single point.
 *
 * Includes the SDF distance value, a material ID for multi-material support,
 * and an auxiliary data bag for element-specific outputs like cave tags,
 * boundary distances, liquid coverage flags, etc.
 */
export interface ElementEvalResult {
  /** Signed distance value at the query point (negative = inside solid) */
  distance: number;
  /** Material ID from TERRAIN_MATERIALS for multi-material support */
  materialId: number;
  /**
   * Auxiliary outputs specific to each element type.
   *
   * Common keys:
   * - `caveTag: boolean` — whether this point is inside a cave
   * - `boundarySDF: number` — distance to nearest cave/boundary surface
   * - `LiquidCovered: boolean` — whether this point is covered by water
   * - `waterPlaneHeight: number` — the water surface Y level at this point
   * - `sandDuneHeight: number` — sand dune displacement value
   * - `occupancy: number` — cave occupancy value (0 = empty, 1 = solid)
   */
  auxiliary: Record<string, any>;
}

/**
 * How to combine multiple element SDF results.
 *
 * - UNION: Smooth union of all elements (standard terrain composition)
 * - INTERSECTION: Intersection — keeps only the region inside ALL elements
 * - DIFFERENCE: Sequential difference — terrain minus caves minus waterbody
 */
export enum CompositionOperation {
  /** Smooth union: standard terrain composition */
  UNION = 'UNION',
  /** Intersection: keep only where all elements overlap */
  INTERSECTION = 'INTERSECTION',
  /** Sequential difference: terrain - caves - waterbody */
  DIFFERENCE = 'DIFFERENCE',
}

// ============================================================================
// TerrainElement Base Class
// ============================================================================

/**
 * Abstract base class for composable terrain SDF elements.
 *
 * Each element represents a terrain feature (ground, mountains, caves, rocks,
 * water) that can be composed using boolean operations. Elements declare
 * dependencies on other elements (e.g., Ground depends on Caves for
 * cave-aware boundary outputs).
 *
 * Lifecycle:
 * 1. Construct the element
 * 2. Call `init(params, rng)` to initialize parameters and pre-compute data
 * 3. Call `evaluate(point)` or `evaluateBatch(points)` as needed
 *
 * Subclasses MUST NOT call `rng.next()` inside `evaluate()` — all
 * randomness must be consumed during `init()` so that evaluation is
 * deterministic and reproducible.
 */
export abstract class TerrainElement {
  /** Human-readable element name (e.g., 'Ground', 'Caves', 'Mountains') */
  abstract readonly name: string;

  /** Names of elements this element depends on (resolved before this one) */
  abstract readonly dependencies: string[];

  /** Whether this element is active in the composition */
  enabled: boolean = true;

  /** Resolved references to dependency elements (set by ElementRegistry) */
  protected dependencyRefs: Map<string, TerrainElement> = new Map();

  /**
   * Initialize element parameters from config and pre-compute any data
   * structures needed for evaluation.
   *
   * All random state must be consumed here — the evaluate() method must
   * be deterministic given the same init() call.
   *
   * @param params - Configuration parameters for this element
   * @param rng - Seeded random number generator (consumed only during init)
   */
  abstract init(params: Record<string, any>, rng: SeededRandom): void;

  /**
   * Compute SDF + auxiliary at a single point.
   *
   * Must be deterministic — no calls to rng.next() or Math.random().
   *
   * @param point - Query point in world space
   * @returns Evaluation result with distance, material, and auxiliary data
   */
  abstract evaluate(point: THREE.Vector3): ElementEvalResult;

  /**
   * Batch evaluation for efficiency. Default implementation calls evaluate()
   * in a loop; subclasses may override for SIMD or cache-friendly access.
   *
   * @param points - Array of query points in world space
   * @returns Array of evaluation results, one per point
   */
  evaluateBatch(points: THREE.Vector3[]): ElementEvalResult[] {
    return points.map((p) => this.evaluate(p));
  }

  /**
   * Set a reference to a dependency element. Called by ElementRegistry
   * during dependency resolution.
   */
  setDependencyRef(name: string, element: TerrainElement): void {
    this.dependencyRefs.set(name, element);
  }
}
