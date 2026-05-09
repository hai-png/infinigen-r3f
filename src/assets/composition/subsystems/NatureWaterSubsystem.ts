/**
 * Nature Water Subsystem — Handles rivers, lakes, and waterfalls.
 *
 * Extracted from NatureSceneComposer (Phase C decomposition).
 * Responsible for:
 *   - addRiversAndWaterfalls() — procedural river path generation
 *
 * @module composition/subsystems/NatureWaterSubsystem
 */

import { Vector3 } from 'three';
import type { WaterParams, RiverData } from '../NatureSceneComposer';

// ============================================================================
// Seeded RNG (shared lightweight deterministic RNG)
// ============================================================================

class WaterRNG {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number {
    const x = Math.sin(this.s++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

// ============================================================================
// NatureWaterSubsystem
// ============================================================================

/**
 * NatureWaterSubsystem — handles river and waterfall generation.
 *
 * Extracted from NatureSceneComposer so the composer can remain a thin orchestrator.
 */
export class NatureWaterSubsystem {
  private rng: WaterRNG;

  constructor(seed: number) {
    this.rng = new WaterRNG(seed);
  }

  /** Re-initialize with a new seed */
  resetSeed(seed: number): void {
    this.rng = new WaterRNG(seed);
  }

  // -----------------------------------------------------------------------
  // Rivers and waterfalls
  // -----------------------------------------------------------------------

  /**
   * Generate procedural river paths.
   *
   * Each river is defined as a winding path from a high-elevation start
   * point down toward the scene boundary. Width, depth, and flow speed
   * are randomized per river.
   */
  addRiversAndWaterfalls(waterConfig: WaterParams): RiverData[] {
    const rivers: RiverData[] = [];

    if (waterConfig.riverEnabled) {
      const riverCount = this.rng.int(1, 3);
      for (let r = 0; r < riverCount; r++) {
        const path: Vector3[] = [];
        const startX = this.rng.range(-60, 60);
        const startZ = this.rng.range(-60, 60);
        const segments = this.rng.int(10, 25);

        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          path.push(new Vector3(
            startX + t * this.rng.range(20, 60) + Math.sin(t * 4) * 10,
            Math.max(0, 15 - t * 15),
            startZ + t * this.rng.range(20, 60) + Math.cos(t * 3) * 8,
          ));
        }

        rivers.push({
          path,
          width: this.rng.range(2, 8),
          depth: this.rng.range(0.5, 2),
          flowSpeed: this.rng.range(0.5, 2),
        });
      }
    }

    return rivers;
  }
}
