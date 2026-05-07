/**
 * Composition Scorer — Quality metrics for scene composition.
 *
 * Extracted from CompositionEngine.ts. Computes balance, rhythm,
 * proportion, and overall composition quality scores, as well as
 * density distribution across octants.
 *
 * @module composition/CompositionScorer
 */

import { Vector3, Sphere } from 'three';
import type {
  CompositionContext,
  CompositionMetrics,
  CompositionConflict,
} from './types';

// ============================================================================
// CompositionScorer
// ============================================================================

/**
 * Stateless scorer for composition quality metrics.
 *
 * All methods are pure functions that accept a CompositionContext and
 * return scores / metrics.
 */
export class CompositionScorer {
  /**
   * Calculate full composition quality metrics for the given context.
   */
  calculateMetrics(context: CompositionContext): CompositionMetrics {
    const centers = context.existingObjects.map(obj => obj.center);

    // Center of mass
    const centerOfMass = new Vector3();
    if (centers.length > 0) {
      for (const center of centers) {
        centerOfMass.add(center);
      }
      centerOfMass.divideScalar(centers.length);
    }

    // Bounding volume
    const boundingSphere = new Sphere(context.center, 0);
    for (const obj of context.existingObjects) {
      boundingSphere.expandByPoint(obj.bounds.min);
      boundingSphere.expandByPoint(obj.bounds.max);
    }

    const densityDistribution = this.calculateDensityDistribution(context);
    const balanceScore = this.calculateBalanceScore(context, centerOfMass);
    const rhythmScore = this.calculateRhythmScore(context);
    const proportionScore = this.calculateProportionScore(context);
    const harmonyScore = 0.8; // Placeholder

    const overallScore = (balanceScore + rhythmScore + proportionScore + harmonyScore) / 4;

    return {
      balanceScore,
      rhythmScore,
      proportionScore,
      harmonyScore,
      overallScore,
      details: {
        centerOfMass,
        boundingVolume: boundingSphere,
        densityDistribution,
        symmetryAxis: undefined,
        goldenRatioDeviations: [],
      },
    };
  }

  /**
   * Calculate overall score from metrics and conflicts.
   * Penalizes for each conflict based on severity.
   */
  calculateOverallScore(
    metrics: CompositionMetrics,
    conflicts: CompositionConflict[],
  ): number {
    let score = metrics.overallScore;

    for (const conflict of conflicts) {
      switch (conflict.severity) {
        case 'error':
          score *= 0.5;
          break;
        case 'warning':
          score *= 0.8;
          break;
        case 'info':
          score *= 0.95;
          break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  /**
   * Calculate density distribution across 8 octants.
   */
  private calculateDensityDistribution(context: CompositionContext): number[] {
    const distribution = new Array(8).fill(0);
    const center = context.center;

    for (const obj of context.existingObjects) {
      const relative = obj.center.clone().sub(center);
      const octant = (
        (relative.x >= 0 ? 4 : 0) +
        (relative.y >= 0 ? 2 : 0) +
        (relative.z >= 0 ? 1 : 0)
      );
      distribution[octant]++;
    }

    const total = distribution.reduce((a, b) => a + b, 0);
    if (total > 0) {
      return distribution.map(d => d / total);
    }
    return distribution;
  }

  /**
   * Calculate balance score based on symmetry (center of mass vs scene center).
   */
  private calculateBalanceScore(context: CompositionContext, centerOfMass: Vector3): number {
    const deviation = centerOfMass.distanceTo(context.center);
    const maxDeviation = context.bounds.getSize(new Vector3()).length() / 2;

    if (maxDeviation === 0) return 1.0;

    return Math.max(0, 1 - deviation / maxDeviation);
  }

  /**
   * Calculate rhythm score based on spacing patterns.
   * Lower variance in inter-object distances → higher score.
   */
  private calculateRhythmScore(context: CompositionContext): number {
    if (context.existingObjects.length < 2) return 1.0;

    const distances: number[] = [];
    for (let i = 0; i < context.existingObjects.length; i++) {
      for (let j = i + 1; j < context.existingObjects.length; j++) {
        distances.push(
          context.existingObjects[i].center.distanceTo(
            context.existingObjects[j].center,
          ),
        );
      }
    }

    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    const normalizedStdDev = stdDev / (mean || 1);
    return Math.max(0, 1 - normalizedStdDev);
  }

  /**
   * Calculate proportion score based on golden ratio adherence.
   */
  private calculateProportionScore(context: CompositionContext): number {
    const phi = 1.618033988749895;
    const deviations: number[] = [];

    const sizes = context.existingObjects.map(obj =>
      obj.bounds.getSize(new Vector3()),
    );

    for (const size of sizes) {
      const ratios = [
        Math.max(size.x, size.y) / Math.min(size.x, size.y),
        Math.max(size.y, size.z) / Math.min(size.y, size.z),
        Math.max(size.x, size.z) / Math.min(size.x, size.z),
      ].filter(r => isFinite(r) && r > 0);

      for (const ratio of ratios) {
        const deviation = Math.abs(ratio - phi) / phi;
        deviations.push(deviation);
      }
    }

    if (deviations.length === 0) return 1.0;

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.max(0, 1 - avgDeviation);
  }
}
