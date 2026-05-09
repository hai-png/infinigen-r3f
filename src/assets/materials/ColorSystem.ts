/**
 * ColorSystem — Centralized color distribution system
 *
 * Ported from infinigen/assets/colors.py — provides mixture-of-Gaussians
 * sampling over HSV color space, with pre-defined color distributions
 * for various material categories (sofa fabric, leather, metal, bark, etc.).
 *
 * Uses seeded randomness for reproducibility.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/** HSV distribution parameters (Gaussian) */
export interface HSVDistribution {
  /** Hue — circular 0-1 */
  h: { mean: number; std: number };
  /** Saturation 0-1 */
  s: { mean: number; std: number };
  /** Value (brightness) 0-1 */
  v: { mean: number; std: number };
}

/** Component in a mixture-of-Gaussians */
export interface MixtureComponent {
  /** Sampling weight (higher = more likely) */
  weight: number;
  /** HSV distribution for this component */
  dist: HSVDistribution;
}

// ============================================================================
// ColorSystem
// ============================================================================

export class ColorSystem {
  // ===========================================================================
  // Mixture-of-Gaussians Sampling
  // ===========================================================================

  /**
   * Sample a color from a mixture of Gaussians in HSV space.
   *
   * - Selects a component based on weights
   * - Samples from the selected Gaussian with wrapping for hue (circular)
   * - Uses seeded randomness for reproducibility
   *
   * @param components - Array of {weight, dist} entries
   * @param seed - Random seed for reproducibility
   * @returns THREE.Color in linear RGB
   */
  static sampleMixtureOfGaussians(
    components: MixtureComponent[],
    seed: number = 42,
  ): THREE.Color {
    if (components.length === 0) {
      return new THREE.Color(0.5, 0.5, 0.5);
    }

    const rng = new SeededRandom(seed);

    // 1. Select a component based on weights
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    let roll = rng.nextFloat() * totalWeight;
    let selectedIdx = 0;

    for (let i = 0; i < components.length; i++) {
      roll -= components[i].weight;
      if (roll <= 0) {
        selectedIdx = i;
        break;
      }
    }

    const dist = components[selectedIdx].dist;

    // 2. Sample from the selected Gaussian
    const h = ColorSystem.wrapGaussian(dist.h.mean, dist.h.std); // Wraps for hue (circular)
    const s = Math.max(0, Math.min(1, ColorSystem.wrapGaussian(dist.s.mean, dist.s.std)));
    const v = Math.max(0, Math.min(1, ColorSystem.wrapGaussian(dist.v.mean, dist.v.std)));

    return ColorSystem.hsv2rgba(h, s, v);
  }

  // ===========================================================================
  // Pre-defined Color Distributions
  // ===========================================================================

  /** Sofa fabric color distributions — warm, muted tones */
  static sofaFabricHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.08, std: 0.04 }, s: { mean: 0.4, std: 0.15 }, v: { mean: 0.55, std: 0.15 } },
      { h: { mean: 0.55, std: 0.05 }, s: { mean: 0.25, std: 0.1 }, v: { mean: 0.45, std: 0.12 } },
      { h: { mean: 0.0, std: 0.03 }, s: { mean: 0.5, std: 0.2 }, v: { mean: 0.4, std: 0.1 } },
      { h: { mean: 0.12, std: 0.03 }, s: { mean: 0.3, std: 0.15 }, v: { mean: 0.7, std: 0.1 } },
    ];
  }

  /** Leather color distributions — browns, tans, dark reds */
  static leatherHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.07, std: 0.02 }, s: { mean: 0.55, std: 0.15 }, v: { mean: 0.35, std: 0.1 } },
      { h: { mean: 0.05, std: 0.02 }, s: { mean: 0.4, std: 0.1 }, v: { mean: 0.5, std: 0.1 } },
      { h: { mean: 0.02, std: 0.01 }, s: { mean: 0.6, std: 0.15 }, v: { mean: 0.25, std: 0.08 } },
    ];
  }

  /** Velvet color distributions — deep, rich, saturated */
  static velvetHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.0, std: 0.03 }, s: { mean: 0.65, std: 0.15 }, v: { mean: 0.4, std: 0.1 } },
      { h: { mean: 0.75, std: 0.05 }, s: { mean: 0.5, std: 0.15 }, v: { mean: 0.35, std: 0.1 } },
      { h: { mean: 0.15, std: 0.03 }, s: { mean: 0.55, std: 0.15 }, v: { mean: 0.45, std: 0.1 } },
      { h: { mean: 0.35, std: 0.04 }, s: { mean: 0.4, std: 0.12 }, v: { mean: 0.3, std: 0.08 } },
    ];
  }

  /** General fabric color distributions */
  static fabricHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.6, std: 0.1 }, s: { mean: 0.2, std: 0.1 }, v: { mean: 0.65, std: 0.15 } },
      { h: { mean: 0.1, std: 0.05 }, s: { mean: 0.35, std: 0.15 }, v: { mean: 0.55, std: 0.12 } },
      { h: { mean: 0.0, std: 0.02 }, s: { mean: 0.5, std: 0.2 }, v: { mean: 0.5, std: 0.15 } },
      { h: { mean: 0.3, std: 0.06 }, s: { mean: 0.3, std: 0.12 }, v: { mean: 0.6, std: 0.1 } },
    ];
  }

  /** Metal color distributions — grays, golds, coppers */
  static metalHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.0, std: 0.02 }, s: { mean: 0.05, std: 0.05 }, v: { mean: 0.6, std: 0.15 } },
      { h: { mean: 0.1, std: 0.02 }, s: { mean: 0.35, std: 0.1 }, v: { mean: 0.65, std: 0.1 } },  // Gold
      { h: { mean: 0.06, std: 0.02 }, s: { mean: 0.45, std: 0.1 }, v: { mean: 0.55, std: 0.1 } },  // Copper
      { h: { mean: 0.58, std: 0.03 }, s: { mean: 0.1, std: 0.05 }, v: { mean: 0.7, std: 0.08 } },  // Silver/steel
    ];
  }

  /** Natural metal (oxidized/weathered) */
  static metalNaturalHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.08, std: 0.04 }, s: { mean: 0.25, std: 0.1 }, v: { mean: 0.4, std: 0.12 } },
      { h: { mean: 0.0, std: 0.02 }, s: { mean: 0.15, std: 0.08 }, v: { mean: 0.5, std: 0.1 } },
      { h: { mean: 0.15, std: 0.03 }, s: { mean: 0.2, std: 0.1 }, v: { mean: 0.35, std: 0.1 } },  // Rust
    ];
  }

  /** Bark color distributions */
  static barkHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.07, std: 0.02 }, s: { mean: 0.4, std: 0.12 }, v: { mean: 0.25, std: 0.08 } },
      { h: { mean: 0.05, std: 0.02 }, s: { mean: 0.3, std: 0.1 }, v: { mean: 0.35, std: 0.1 } },
      { h: { mean: 0.09, std: 0.03 }, s: { mean: 0.45, std: 0.1 }, v: { mean: 0.2, std: 0.06 } },
    ];
  }

  /** Plant green distributions */
  static plantGreen(): HSVDistribution[] {
    return [
      { h: { mean: 0.3, std: 0.04 }, s: { mean: 0.55, std: 0.15 }, v: { mean: 0.4, std: 0.12 } },
      { h: { mean: 0.25, std: 0.03 }, s: { mean: 0.4, std: 0.12 }, v: { mean: 0.5, std: 0.1 } },
      { h: { mean: 0.35, std: 0.04 }, s: { mean: 0.5, std: 0.1 }, v: { mean: 0.35, std: 0.1 } },
    ];
  }

  /** Water color distributions */
  static waterHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.55, std: 0.04 }, s: { mean: 0.4, std: 0.15 }, v: { mean: 0.6, std: 0.1 } },
      { h: { mean: 0.5, std: 0.03 }, s: { mean: 0.3, std: 0.1 }, v: { mean: 0.75, std: 0.08 } },
      { h: { mean: 0.58, std: 0.03 }, s: { mean: 0.5, std: 0.12 }, v: { mean: 0.5, std: 0.1 } },
    ];
  }

  /** Fur color distributions */
  static furHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.07, std: 0.03 }, s: { mean: 0.35, std: 0.15 }, v: { mean: 0.4, std: 0.15 } },
      { h: { mean: 0.05, std: 0.02 }, s: { mean: 0.2, std: 0.1 }, v: { mean: 0.55, std: 0.12 } },
      { h: { mean: 0.0, std: 0.01 }, s: { mean: 0.05, std: 0.05 }, v: { mean: 0.25, std: 0.1 } },
      { h: { mean: 0.08, std: 0.02 }, s: { mean: 0.5, std: 0.15 }, v: { mean: 0.3, std: 0.08 } },
    ];
  }

  /** Beak color distributions */
  static beakHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.1, std: 0.04 }, s: { mean: 0.5, std: 0.15 }, v: { mean: 0.6, std: 0.12 } },
      { h: { mean: 0.07, std: 0.03 }, s: { mean: 0.35, std: 0.1 }, v: { mean: 0.5, std: 0.1 } },
      { h: { mean: 0.0, std: 0.02 }, s: { mean: 0.6, std: 0.2 }, v: { mean: 0.55, std: 0.1 } },
    ];
  }

  /** Eye sclera distributions */
  static eyeScleraHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.08, std: 0.02 }, s: { mean: 0.1, std: 0.05 }, v: { mean: 0.85, std: 0.06 } },
    ];
  }

  /** Ceramic color distributions */
  static ceramicHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.0, std: 0.03 }, s: { mean: 0.05, std: 0.05 }, v: { mean: 0.9, std: 0.05 } },
      { h: { mean: 0.55, std: 0.05 }, s: { mean: 0.15, std: 0.1 }, v: { mean: 0.8, std: 0.08 } },
      { h: { mean: 0.08, std: 0.03 }, s: { mean: 0.2, std: 0.1 }, v: { mean: 0.75, std: 0.08 } },
    ];
  }

  /** Wood color distributions */
  static woodHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.07, std: 0.02 }, s: { mean: 0.45, std: 0.12 }, v: { mean: 0.45, std: 0.12 } },
      { h: { mean: 0.1, std: 0.03 }, s: { mean: 0.35, std: 0.1 }, v: { mean: 0.55, std: 0.1 } },
      { h: { mean: 0.05, std: 0.02 }, s: { mean: 0.5, std: 0.15 }, v: { mean: 0.3, std: 0.08 } },
      { h: { mean: 0.08, std: 0.03 }, s: { mean: 0.3, std: 0.1 }, v: { mean: 0.65, std: 0.08 } },
    ];
  }

  /** Stone color distributions */
  static stoneHSV(): HSVDistribution[] {
    return [
      { h: { mean: 0.08, std: 0.04 }, s: { mean: 0.1, std: 0.06 }, v: { mean: 0.55, std: 0.12 } },
      { h: { mean: 0.0, std: 0.02 }, s: { mean: 0.05, std: 0.03 }, v: { mean: 0.65, std: 0.1 } },
      { h: { mean: 0.05, std: 0.03 }, s: { mean: 0.15, std: 0.08 }, v: { mean: 0.45, std: 0.1 } },
    ];
  }

  // ===========================================================================
  // Utility Functions
  // ===========================================================================

  /**
   * Convert HSV to RGB (each channel 0-1).
   * H is 0-1 (wrapping), S and V are 0-1.
   */
  static hsv2rgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    // Wrap hue to [0,1)
    h = ((h % 1) + 1) % 1;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r: number, g: number, b: number;

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
      default: r = 0; g = 0; b = 0;
    }

    return { r, g, b };
  }

  /**
   * Convert HSV to THREE.Color (with optional alpha, though Color is RGB).
   */
  static hsv2rgba(h: number, s: number, v: number, _a?: number): THREE.Color {
    const { r, g, b } = ColorSystem.hsv2rgb(h, s, v);
    return new THREE.Color(r, g, b);
  }

  /**
   * Convert hex string to THREE.Color.
   */
  static hex2rgba(hex: string): THREE.Color {
    return new THREE.Color(hex);
  }

  /**
   * Sample from a wrapped Gaussian distribution.
   * For hue (circular), the result wraps to [0,1].
   * For saturation/value, the result is clamped to [0,1] by the caller.
   *
   * Uses Box-Muller transform for Gaussian sampling.
   */
  static wrapGaussian(mean: number, std: number, rng?: SeededRandom): number {
    if (std <= 0) return mean;

    // Box-Muller transform for Gaussian sampling
    let u1: number, u2: number;
    if (rng) {
      u1 = rng.nextFloat();
      u2 = rng.nextFloat();
    } else {
      u1 = Math.random();
      u2 = Math.random();
    }

    // Avoid log(0)
    u1 = Math.max(1e-10, u1);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return mean + z * std;
  }

  /**
   * Sample from a log-uniform distribution.
   * Returns a value in [low, high] where log(x) is uniform.
   */
  static logUniform(low: number, high: number, seed: number = 42): number {
    const rng = new SeededRandom(seed);
    const logLow = Math.log(low);
    const logHigh = Math.log(high);
    return Math.exp(rng.nextFloat() * (logHigh - logLow) + logLow);
  }

  /**
   * Sample from a uniform distribution.
   */
  static uniform(low: number, high: number, seed: number = 42): number {
    const rng = new SeededRandom(seed);
    return rng.nextFloat() * (high - low) + low;
  }

  // ===========================================================================
  // Convenience: Get color for a named material category
  // ===========================================================================

  /**
   * Get a randomized color for a named material category.
   * Uses the pre-defined HSV distributions with mixture-of-Gaussians sampling.
   */
  static getMaterialColor(category: string, seed: number = 42): THREE.Color {
    const distMap: Record<string, () => HSVDistribution[]> = {
      sofa_fabric: ColorSystem.sofaFabricHSV,
      leather: ColorSystem.leatherHSV,
      velvet: ColorSystem.velvetHSV,
      fabric: ColorSystem.fabricHSV,
      metal: ColorSystem.metalHSV,
      metal_natural: ColorSystem.metalNaturalHSV,
      bark: ColorSystem.barkHSV,
      plant_green: ColorSystem.plantGreen,
      water: ColorSystem.waterHSV,
      fur: ColorSystem.furHSV,
      beak: ColorSystem.beakHSV,
      eye_sclera: ColorSystem.eyeScleraHSV,
      ceramic: ColorSystem.ceramicHSV,
      wood: ColorSystem.woodHSV,
      stone: ColorSystem.stoneHSV,
    };

    const distFn = distMap[category];
    if (!distFn) {
      // Fallback: return a muted mid-gray
      return new THREE.Color(0.5, 0.5, 0.5);
    }

    const distributions = distFn();
    const components: MixtureComponent[] = distributions.map((dist) => ({
      weight: 1.0 / distributions.length,
      dist,
    }));

    return ColorSystem.sampleMixtureOfGaussians(components, seed);
  }
}

export default ColorSystem;
