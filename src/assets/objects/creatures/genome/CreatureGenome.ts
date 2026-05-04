/**
 * CreatureGenome.ts — Genome-driven interpolation for creature blending
 *
 * Implements genome-driven interpolation between creature types using maximum
 * bipartite matching (Hungarian algorithm), enabling smooth blending between
 * species. Ports the interp_genome() concept from the original Infinigen.
 *
 * Key components:
 * - CreatureGene: Individual gene definition with typed values
 * - CreatureGenome: Named gene collection with mutation support
 * - MaximumBipartiteMatching: Hungarian algorithm for optimal gene pairing
 * - GenomeInterpolator: Blending two genomes with/without bipartite matching
 * - AttachmentInterpolator: Interpolating attachment points between creatures
 * - GenomeFactory: Species templates and child genome creation
 */

import { Vector3, Color } from 'three';
import { SeededRandom, rgbToHsv, hsvToRgb } from '@/core/util/MathUtils';
import type { PartAttachment } from '../BodyPlanSystem';

// ============================================================================
// Gene Type Definitions
// ============================================================================

/**
 * Supported gene value types.
 * - float: continuous numeric value
 * - int: discrete integer value
 * - color: RGB color stored as { r, g, b } in [0,1]
 * - vector3: 3D vector stored as { x, y, z }
 * - enum: discrete choice from a set of string options
 */
export type GeneValueType = 'float' | 'int' | 'color' | 'vector3' | 'enum';

/**
 * RGB color representation in [0,1] range
 */
export interface GeneColor {
  r: number;
  g: number;
  b: number;
}

/**
 * A single gene in a creature genome.
 * Each gene has a name, type, current value, optional min/max bounds,
 * and a mutation rate controlling the standard deviation of variation.
 */
export interface CreatureGene {
  /** Unique gene name within the genome */
  name: string;
  /** Value type determining interpolation and mutation behavior */
  type: GeneValueType;
  /** Current gene value — type depends on `type` field */
  value: number | GeneColor | { x: number; y: number; z: number } | string;
  /** Minimum allowed value (for float/int); ignored for color/vector3/enum */
  minValue?: number;
  /** Maximum allowed value (for float/int); ignored for color/vector3/enum */
  maxValue?: number;
  /**
   * How much this gene can vary during mutation.
   * For float/int: standard deviation as fraction of value range.
   * For color: overall color shift magnitude (0–1).
   * For vector3: positional displacement factor (0–1).
   * For enum: probability of switching to a different option (0–1).
   */
  mutationRate: number;
  /** For enum genes: the set of valid options */
  enumOptions?: string[];
}

// ============================================================================
// Attachment Gene (for interpolation between body plan attachments)
// ============================================================================

/**
 * An attachment that can be interpolated between two creatures.
 * Extends PartAttachment with joint angles for smooth blending.
 */
export interface InterpolatableAttachment {
  /** Type of attached part */
  partType: PartAttachment['partType'];
  /** Name of the parent bone */
  parentBone: string;
  /** Position offset from parent bone */
  offset: Vector3;
  /** Side of the body */
  side: 'left' | 'right' | 'center';
  /** Symmetry type */
  symmetry: 'bilateral' | 'radial' | 'none';
  /** Joint rotation angles in radians (Euler XYZ) */
  jointAngles: { x: number; y: number; z: number };
  /** Scale of the attached part */
  scale: number;
}

// ============================================================================
// CreatureGenome Class
// ============================================================================

/**
 * A creature genome is a named collection of genes that fully specifies
 * a creature's morphological and aesthetic parameters. Genomes can be
 * mutated, cloned, and interpolated with other genomes.
 */
export class CreatureGenome {
  /** Named gene collection */
  public genes: Map<string, CreatureGene>;

  /** Species name this genome belongs to */
  public species: string;

  constructor(species: string = 'unknown') {
    this.genes = new Map();
    this.species = species;
  }

  /**
   * Set a gene in the genome. Overwrites any existing gene with the same name.
   */
  setGene(name: string, gene: CreatureGene): void {
    this.genes.set(name, { ...gene, name });
  }

  /**
   * Get a gene by name. Returns undefined if not found.
   */
  getGene(name: string): CreatureGene | undefined {
    return this.genes.get(name);
  }

  /**
   * Check if a gene exists in the genome.
   */
  hasGene(name: string): boolean {
    return this.genes.has(name);
  }

  /**
   * Get all gene names in this genome.
   */
  getGeneNames(): string[] {
    return Array.from(this.genes.keys());
  }

  /**
   * Get the number of genes in this genome.
   */
  getGeneCount(): number {
    return this.genes.size;
  }

  /**
   * Apply random mutations to all genes using the provided RNG.
   * Each gene's mutationRate controls the standard deviation of variation.
   * Deterministic given the same RNG seed.
   *
   * @param rng Seeded random number generator
   * @param rate Global mutation rate multiplier (default 1.0)
   */
  mutate(rng: SeededRandom, rate: number = 1.0): void {
    for (const [name, gene] of this.genes) {
      const effectiveRate = gene.mutationRate * rate;
      const mutated = this.mutateGene(gene, rng, effectiveRate);
      this.genes.set(name, mutated);
    }
  }

  /**
   * Create a deep copy of this genome.
   */
  clone(): CreatureGenome {
    const copy = new CreatureGenome(this.species);
    for (const [name, gene] of this.genes) {
      copy.genes.set(name, this.cloneGene(gene));
    }
    return copy;
  }

  /**
   * Convert genome to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    const genesObj: Record<string, CreatureGene> = {};
    for (const [name, gene] of this.genes) {
      genesObj[name] = this.cloneGene(gene);
    }
    return { species: this.species, genes: genesObj };
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private mutateGene(gene: CreatureGene, rng: SeededRandom, rate: number): CreatureGene {
    const mutated = this.cloneGene(gene);

    switch (gene.type) {
      case 'float': {
        const val = mutated.value as number;
        const range = (mutated.maxValue ?? 1.0) - (mutated.minValue ?? 0.0);
        const delta = rng.gaussian(0, rate * range);
        mutated.value = Math.max(
          mutated.minValue ?? -Infinity,
          Math.min(mutated.maxValue ?? Infinity, val + delta),
        );
        break;
      }
      case 'int': {
        const val = mutated.value as number;
        const range = (mutated.maxValue ?? 10) - (mutated.minValue ?? 0);
        const delta = Math.round(rng.gaussian(0, rate * range));
        mutated.value = Math.max(
          mutated.minValue ?? -Infinity,
          Math.min(mutated.maxValue ?? Infinity, val + delta),
        );
        break;
      }
      case 'color': {
        const col = mutated.value as GeneColor;
        // Mutate in HSV space for natural color shifts
        const hsv = rgbToHsv(col.r, col.g, col.b);
        hsv.h = ((hsv.h + rng.gaussian(0, rate * 0.15)) % 1 + 1) % 1;
        hsv.s = Math.max(0, Math.min(1, hsv.s + rng.gaussian(0, rate * 0.1)));
        hsv.v = Math.max(0, Math.min(1, hsv.v + rng.gaussian(0, rate * 0.1)));
        const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        mutated.value = { r: rgb.r, g: rgb.g, b: rgb.b };
        break;
      }
      case 'vector3': {
        const vec = mutated.value as { x: number; y: number; z: number };
        mutated.value = {
          x: vec.x + rng.gaussian(0, rate * 0.1),
          y: vec.y + rng.gaussian(0, rate * 0.1),
          z: vec.z + rng.gaussian(0, rate * 0.1),
        };
        break;
      }
      case 'enum': {
        // With probability proportional to rate, switch to a different option
        if (rng.next() < rate && mutated.enumOptions && mutated.enumOptions.length > 1) {
          const currentIdx = mutated.enumOptions.indexOf(mutated.value as string);
          const otherOptions = mutated.enumOptions.filter((_, i) => i !== currentIdx);
          mutated.value = rng.choice(otherOptions);
        }
        break;
      }
    }

    return mutated;
  }

  private cloneGene(gene: CreatureGene): CreatureGene {
    if (gene.type === 'color') {
      const col = gene.value as GeneColor;
      return { ...gene, value: { r: col.r, g: col.g, b: col.b } };
    } else if (gene.type === 'vector3') {
      const vec = gene.value as { x: number; y: number; z: number };
      return { ...gene, value: { x: vec.x, y: vec.y, z: vec.z } };
    } else {
      return { ...gene };
    }
  }
}

// ============================================================================
// Maximum Bipartite Matching (Hungarian Algorithm)
// ============================================================================

/**
 * Implements the Hungarian algorithm for maximum-weight bipartite matching.
 * Used to find the optimal pairing of genes between two different species
 * based on gene name similarity and type compatibility.
 *
 * The algorithm operates on a cost/similarity matrix and finds the assignment
 * that maximizes total similarity. When gene sets have different sizes,
 * unmatched genes default to the parent that owns them.
 */
export class MaximumBipartiteMatching {
  /**
   * Compute the optimal matching between two sets using the Hungarian algorithm.
   * Returns pairs of indices [indexA, indexB] representing matched elements.
   *
   * The algorithm works with a cost matrix where costMatrix[i][j] represents
   * the similarity between setA[i] and setB[j]. Higher values mean more similar.
   * The algorithm maximizes total similarity.
   *
   * @param setA Labels for the first set (used for result identification)
   * @param setB Labels for the second set
   * @param costMatrix Similarity matrix: costMatrix[i][j] = similarity of A[i] to B[j]
   * @returns Array of matched pairs [indexA, indexB]
   */
  computeMatching(
    setA: string[],
    setB: string[],
    costMatrix: number[][],
  ): [number, number][] {
    const n = setA.length;
    const m = setB.length;

    if (n === 0 || m === 0) return [];

    // Use the larger dimension for square matrix
    const size = Math.max(n, m);

    // Build a square cost matrix padded with zeros
    const cost: number[][] = [];
    for (let i = 0; i < size; i++) {
      cost[i] = [];
      for (let j = 0; j < size; j++) {
        cost[i][j] = i < n && j < m ? costMatrix[i][j] : 0;
      }
    }

    // Convert to minimization problem by negating costs
    // (Hungarian algorithm minimizes, we want to maximize similarity)
    let maxCost = -Infinity;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        maxCost = Math.max(maxCost, cost[i][j]);
      }
    }

    // Create minimization matrix
    const minMatrix: number[][] = [];
    for (let i = 0; i < size; i++) {
      minMatrix[i] = [];
      for (let j = 0; j < size; j++) {
        minMatrix[i][j] = maxCost - cost[i][j];
      }
    }

    // Hungarian algorithm
    const match = this.hungarian(minMatrix, size);

    // Extract only real matches (within bounds)
    const result: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const j = match[i];
      if (j !== -1 && j < m) {
        result.push([i, j]);
      }
    }

    return result;
  }

  /**
   * Compute a gene similarity matrix between two gene sets.
   * Similarity is based on:
   * 1. Name similarity (Levenshtein-based normalized score)
   * 2. Type compatibility (same type = high, compatible types = medium, incompatible = low)
   * 3. Value range overlap for numeric types
   *
   * @param genesA First gene collection
   * @param genesB Second gene collection
   * @returns Similarity matrix where [i][j] = similarity of genesA[i] to genesB[j]
   */
  computeGeneSimilarityMatrix(
    genesA: CreatureGene[],
    genesB: CreatureGene[],
  ): number[][] {
    const matrix: number[][] = [];

    for (let i = 0; i < genesA.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < genesB.length; j++) {
        matrix[i][j] = this.computeGeneSimilarity(genesA[i], genesB[j]);
      }
    }

    return matrix;
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Hungarian algorithm for minimum-cost assignment.
   * Returns an array where result[i] = column assigned to row i.
   * Based on the classic O(n^3) implementation.
   */
  private hungarian(cost: number[][], n: number): number[] {
    const INF = 1e18;
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0);
    const way = new Array(n + 1).fill(0);

    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(INF);
      const used = new Array(n + 1).fill(false);

      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF;
        let j1 = 0;

        for (let j = 1; j <= n; j++) {
          if (!used[j]) {
            const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
            if (cur < minv[j]) {
              minv[j] = cur;
              way[j] = j0;
            }
            if (minv[j] < delta) {
              delta = minv[j];
              j1 = j;
            }
          }
        }

        for (let j = 0; j <= n; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }

        j0 = j1;
      } while (p[j0] !== 0);

      // Update matching along augmenting path
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    // Convert to 0-indexed result
    const result = new Array(n).fill(-1);
    for (let j = 1; j <= n; j++) {
      if (p[j] > 0) {
        result[p[j] - 1] = j - 1;
      }
    }

    return result;
  }

  /**
   * Compute similarity between two individual genes.
   * Returns a value in [0, 1] where 1 = perfect match.
   */
  private computeGeneSimilarity(a: CreatureGene, b: CreatureGene): number {
    // Name similarity using normalized Levenshtein distance
    const nameSim = this.nameSimilarity(a.name, b.name);

    // Type compatibility
    const typeSim = this.typeCompatibility(a.type, b.type);

    // Combined score: name similarity is primary, type is secondary
    // Weight: 60% name, 40% type
    return 0.6 * nameSim + 0.4 * typeSim;
  }

  /**
   * Compute normalized name similarity using Levenshtein distance.
   * Returns 1.0 for identical names, 0.0 for completely different names.
   */
  private nameSimilarity(a: string, b: string): number {
    const dist = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1.0 : 1.0 - dist / maxLen;
  }

  /**
   * Compute Levenshtein edit distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = [];

    for (let i = 0; i <= m; i++) {
      dp[i] = [];
      for (let j = 0; j <= n; j++) {
        if (i === 0) {
          dp[i][j] = j;
        } else if (j === 0) {
          dp[i][j] = i;
        } else {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,      // deletion
            dp[i][j - 1] + 1,      // insertion
            dp[i - 1][j - 1] + cost, // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Compute type compatibility score.
   * Same type = 1.0, compatible types = 0.5, incompatible = 0.0
   */
  private typeCompatibility(a: GeneValueType, b: GeneValueType): number {
    if (a === b) return 1.0;

    // Numeric types are compatible with each other
    const numericTypes: GeneValueType[] = ['float', 'int'];
    if (numericTypes.includes(a) && numericTypes.includes(b)) return 0.5;

    // Color and vector3 both represent spatial data
    const spatialTypes: GeneValueType[] = ['color', 'vector3'];
    if (spatialTypes.includes(a) && spatialTypes.includes(b)) return 0.3;

    return 0.0;
  }
}

// ============================================================================
// GenomeInterpolator Class
// ============================================================================

/**
 * Interpolates between two creature genomes, enabling smooth blending
 * between species. Supports both direct interpolation (matching genes by name)
 * and bipartite-matching-based interpolation for cross-species blending
 * where gene names may differ.
 */
export class GenomeInterpolator {
  private bipartiteMatcher: MaximumBipartiteMatching;

  constructor() {
    this.bipartiteMatcher = new MaximumBipartiteMatching();
  }

  /**
   * Interpolate two genomes at parameter t.
   * Genes with matching names are blended directly.
   * Unmatched genes from parentA are kept when t < 0.5, from parentB when t >= 0.5.
   *
   * @param parentA First parent genome
   * @param parentB Second parent genome
   * @param t Interpolation parameter (0 = parentA, 1 = parentB)
   * @returns New interpolated genome
   */
  interpolate(parentA: CreatureGenome, parentB: CreatureGenome, t: number): CreatureGenome {
    const result = new CreatureGenome(
      t < 0.5 ? parentA.species : parentB.species,
    );

    // Collect all gene names from both parents
    const allNames = new Set([
      ...parentA.getGeneNames(),
      ...parentB.getGeneNames(),
    ]);

    for (const name of allNames) {
      const geneA = parentA.getGene(name);
      const geneB = parentB.getGene(name);

      if (geneA && geneB) {
        // Both have this gene — interpolate
        const interpolated = this.interpolateGene(geneA, geneB, t);
        result.setGene(name, interpolated);
      } else if (geneA) {
        // Only parentA has this gene
        const cloned = this.cloneGeneWithWeight(geneA, t < 0.5 ? 1.0 : 0.5);
        result.setGene(name, cloned);
      } else if (geneB) {
        // Only parentB has this gene
        const cloned = this.cloneGeneWithWeight(geneB, t >= 0.5 ? 1.0 : 0.5);
        result.setGene(name, cloned);
      }
    }

    return result;
  }

  /**
   * Interpolate two genomes using bipartite matching for optimal gene pairing.
   * This is the key method for cross-species blending where gene names may differ.
   *
   * The algorithm:
   * 1. Compute a similarity matrix between all gene pairs
   * 2. Use Hungarian algorithm to find optimal matching
   * 3. Interpolate matched gene pairs
   * 4. Unmatched genes default to the parent that owns them
   *
   * @param parentA First parent genome
   * @param parentB Second parent genome
   * @param t Interpolation parameter (0 = parentA, 1 = parentB)
   * @param rng Seeded RNG for enum interpolation randomness
   * @returns New interpolated genome
   */
  interpGenomeWithMatching(
    parentA: CreatureGenome,
    parentB: CreatureGenome,
    t: number,
    rng: SeededRandom,
  ): CreatureGenome {
    const result = new CreatureGenome(
      t < 0.5 ? parentA.species : parentB.species,
    );

    const namesA = parentA.getGeneNames();
    const namesB = parentB.getGeneNames();

    // Build gene arrays for matching
    const genesA = namesA.map(n => parentA.getGene(n)!);
    const genesB = namesB.map(n => parentB.getGene(n)!);

    // Compute similarity matrix
    const simMatrix = this.bipartiteMatcher.computeGeneSimilarityMatrix(genesA, genesB);

    // Compute optimal matching
    const matching = this.bipartiteMatcher.computeMatching(namesA, namesB, simMatrix);

    // Track which genes have been matched
    const matchedA = new Set<number>();
    const matchedB = new Set<number>();

    // Interpolate matched pairs
    for (const [idxA, idxB] of matching) {
      const geneA = genesA[idxA];
      const geneB = genesB[idxB];
      const similarity = simMatrix[idxA][idxB];

      matchedA.add(idxA);
      matchedB.add(idxB);

      if (similarity < 0.15) {
        // Very low similarity — treat as unmatched, keep dominant parent's gene
        if (t < 0.5) {
          result.setGene(geneA.name, this.cloneGeneWithWeight(geneA, 1.0));
        } else {
          result.setGene(geneB.name, this.cloneGeneWithWeight(geneB, 1.0));
        }
      } else {
        // Interpolate the matched pair
        const interpolated = this.interpolateGene(geneA, geneB, t, rng);

        // Use the name from the dominant parent, or a combined name if t ~0.5
        const name = t < 0.5 ? geneA.name : (t > 0.5 ? geneB.name : geneA.name);
        result.setGene(name, interpolated);
      }
    }

    // Handle unmatched genes from A
    for (let i = 0; i < genesA.length; i++) {
      if (!matchedA.has(i)) {
        // Unmatched gene defaults to parentA, scaled by (1 - t)
        const gene = genesA[i];
        const scaled = this.cloneGeneWithWeight(gene, 1.0 - t);
        result.setGene(gene.name, scaled);
      }
    }

    // Handle unmatched genes from B
    for (let j = 0; j < genesB.length; j++) {
      if (!matchedB.has(j)) {
        // Unmatched gene defaults to parentB, scaled by t
        const gene = genesB[j];
        const scaled = this.cloneGeneWithWeight(gene, t);
        result.setGene(gene.name, scaled);
      }
    }

    return result;
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Interpolate two individual genes based on their types.
   */
  private interpolateGene(
    a: CreatureGene,
    b: CreatureGene,
    t: number,
    rng?: SeededRandom,
  ): CreatureGene {
    // If types match, interpolate directly
    if (a.type === b.type) {
      return this.interpolateSameType(a, b, t, rng);
    }

    // If types are compatible (float/int), convert and interpolate
    if (
      (a.type === 'float' || a.type === 'int') &&
      (b.type === 'float' || b.type === 'int')
    ) {
      // Treat both as float for interpolation
      const floatA: CreatureGene = { ...a, type: 'float', value: a.value as number };
      const floatB: CreatureGene = { ...b, type: 'float', value: b.value as number };
      const result = this.interpolateSameType(floatA, floatB, t, rng);
      // Round if the dominant parent was int
      if ((t < 0.5 && a.type === 'int') || (t >= 0.5 && b.type === 'int')) {
        result.type = 'int';
        result.value = Math.round(result.value as number);
      }
      return result;
    }

    // Incompatible types: use dominant parent's gene
    return t < 0.5 ? { ...a } : { ...b };
  }

  /**
   * Interpolate two genes of the same type.
   */
  private interpolateSameType(
    a: CreatureGene,
    b: CreatureGene,
    t: number,
    rng?: SeededRandom,
  ): CreatureGene {
    switch (a.type) {
      case 'float':
        return this.interpolateFloat(a, b, t);
      case 'int':
        return this.interpolateInt(a, b, t);
      case 'color':
        return this.interpolateColor(a, b, t);
      case 'vector3':
        return this.interpolateVector3(a, b, t);
      case 'enum':
        return this.interpolateEnum(a, b, t, rng);
      default:
        return t < 0.5 ? { ...a } : { ...b };
    }
  }

  private interpolateFloat(a: CreatureGene, b: CreatureGene, t: number): CreatureGene {
    const va = a.value as number;
    const vb = b.value as number;
    const result = va + (vb - va) * t;
    const minVal = Math.min(a.minValue ?? -Infinity, b.minValue ?? -Infinity);
    const maxVal = Math.max(a.maxValue ?? Infinity, b.maxValue ?? Infinity);
    return {
      ...a,
      value: Math.max(minVal, Math.min(maxVal, result)),
      minValue: minVal === -Infinity ? undefined : minVal,
      maxValue: maxVal === Infinity ? undefined : maxVal,
      mutationRate: a.mutationRate + (b.mutationRate - a.mutationRate) * t,
    };
  }

  private interpolateInt(a: CreatureGene, b: CreatureGene, t: number): CreatureGene {
    const va = a.value as number;
    const vb = b.value as number;
    const result = Math.round(va + (vb - va) * t);
    const minVal = Math.min(a.minValue ?? -Infinity, b.minValue ?? -Infinity);
    const maxVal = Math.max(a.maxValue ?? Infinity, b.maxValue ?? Infinity);
    return {
      ...a,
      value: Math.max(minVal === -Infinity ? result : minVal, Math.min(maxVal === Infinity ? result : maxVal, result)),
      minValue: minVal === -Infinity ? undefined : minVal,
      maxValue: maxVal === Infinity ? undefined : maxVal,
      mutationRate: a.mutationRate + (b.mutationRate - a.mutationRate) * t,
    };
  }

  /**
   * Interpolate colors in HSV space for natural color transitions.
   * Handles hue wrap-around correctly by choosing the shortest path
   * around the color wheel.
   */
  private interpolateColor(a: CreatureGene, b: CreatureGene, t: number): CreatureGene {
    const colA = a.value as GeneColor;
    const colB = b.value as GeneColor;

    const hsvA = rgbToHsv(colA.r, colA.g, colA.b);
    const hsvB = rgbToHsv(colB.r, colB.g, colB.b);

    // Interpolate hue with wrap-around handling
    const hueA = hsvA.h;
    const hueB = hsvB.h;

    // Find the shortest path around the color wheel
    let hueDiff = hueB - hueA;
    if (hueDiff > 0.5) hueDiff -= 1.0;
    if (hueDiff < -0.5) hueDiff += 1.0;

    let interpHue = hueA + hueDiff * t;
    // Normalize to [0, 1)
    interpHue = ((interpHue % 1) + 1) % 1;

    // Interpolate saturation and value linearly
    const interpSat = hsvA.s + (hsvB.s - hsvA.s) * t;
    const interpVal = hsvA.v + (hsvB.v - hsvA.v) * t;

    const rgb = hsvToRgb(interpHue, interpSat, interpVal);

    return {
      ...a,
      value: { r: rgb.r, g: rgb.g, b: rgb.b },
      mutationRate: a.mutationRate + (b.mutationRate - a.mutationRate) * t,
    };
  }

  /**
   * Component-wise lerp for vector3 genes.
   */
  private interpolateVector3(a: CreatureGene, b: CreatureGene, t: number): CreatureGene {
    const va = a.value as { x: number; y: number; z: number };
    const vb = b.value as { x: number; y: number; z: number };

    return {
      ...a,
      value: {
        x: va.x + (vb.x - va.x) * t,
        y: va.y + (vb.y - va.y) * t,
        z: va.z + (vb.z - va.z) * t,
      },
      mutationRate: a.mutationRate + (b.mutationRate - a.mutationRate) * t,
    };
  }

  /**
   * Interpolate enum genes by random choice weighted by t.
   * At t=0, always choose A's value; at t=1, always choose B's value.
   * For intermediate values, uses weighted random selection.
   */
  private interpolateEnum(
    a: CreatureGene,
    b: CreatureGene,
    t: number,
    rng?: SeededRandom,
  ): CreatureGene {
    const valA = a.value as string;
    const valB = b.value as string;

    // If same value, no interpolation needed
    if (valA === valB) {
      return { ...a };
    }

    // At extremes, return the corresponding parent's value
    if (t <= 0) return { ...a };
    if (t >= 1) return { ...b };

    // Weighted random choice
    const effectiveRng = rng ?? new SeededRandom(42);
    const chosenValue = effectiveRng.next() < (1 - t) ? valA : valB;

    // Merge enum options from both parents
    const optionsA = a.enumOptions ?? [valA];
    const optionsB = b.enumOptions ?? [valB];
    const mergedOptions = [...new Set([...optionsA, ...optionsB])];

    return {
      ...a,
      value: chosenValue,
      enumOptions: mergedOptions,
      mutationRate: a.mutationRate + (b.mutationRate - a.mutationRate) * t,
    };
  }

  /**
   * Clone a gene with an optional influence weight.
   * For numeric genes, this scales the deviation from a neutral value.
   */
  private cloneGeneWithWeight(gene: CreatureGene, weight: number): CreatureGene {
    const cloned = { ...gene };

    if (weight < 1.0) {
      // Reduce the gene's influence by pulling toward neutral
      switch (gene.type) {
        case 'float':
        case 'int': {
          const val = gene.value as number;
          const minV = gene.minValue ?? 0;
          const maxV = gene.maxValue ?? (gene.type === 'int' ? 10 : 1);
          const neutral = (minV + maxV) / 2;
          cloned.value = neutral + (val - neutral) * weight;
          if (gene.type === 'int') {
            cloned.value = Math.round(cloned.value as number);
          }
          break;
        }
        case 'color': {
          // Pull color toward neutral gray
          const col = gene.value as GeneColor;
          const gray = 0.5;
          cloned.value = {
            r: gray + (col.r - gray) * weight,
            g: gray + (col.g - gray) * weight,
            b: gray + (col.b - gray) * weight,
          };
          break;
        }
        case 'vector3': {
          // Scale vector toward zero
          const vec = gene.value as { x: number; y: number; z: number };
          cloned.value = {
            x: vec.x * weight,
            y: vec.y * weight,
            z: vec.z * weight,
          };
          break;
        }
        // enum: weight doesn't change the value, just the probability
      }
    }

    return cloned;
  }
}

// ============================================================================
// AttachmentInterpolator Class
// ============================================================================

/**
 * Interpolates attachment points between two creatures.
 * Handles coordinate system interpolation (position lerp),
 * joint type interpolation (angle lerp), and scale blending.
 */
export class AttachmentInterpolator {
  /**
   * Interpolate between two attachments at parameter t.
   *
   * @param attachA First parent's attachment
   * @param attachB Second parent's attachment
   * @param t Interpolation parameter (0 = attachA, 1 = attachB)
   * @returns Interpolated attachment
   */
  interpAttachment(
    attachA: InterpolatableAttachment,
    attachB: InterpolatableAttachment,
    t: number,
  ): InterpolatableAttachment {
    // Interpolate offset position
    const offset = new Vector3().lerpVectors(attachA.offset, attachB.offset, t);

    // Interpolate joint angles (lerp each Euler component)
    const jointAngles = {
      x: attachA.jointAngles.x + (attachB.jointAngles.x - attachA.jointAngles.x) * t,
      y: attachA.jointAngles.y + (attachB.jointAngles.y - attachA.jointAngles.y) * t,
      z: attachA.jointAngles.z + (attachB.jointAngles.z - attachA.jointAngles.z) * t,
    };

    // Interpolate scale
    const scale = attachA.scale + (attachB.scale - attachA.scale) * t;

    // For discrete properties, use dominant parent
    const partType = t < 0.5 ? attachA.partType : attachB.partType;
    const parentBone = t < 0.5 ? attachA.parentBone : attachB.parentBone;
    const side = t < 0.5 ? attachA.side : attachB.side;
    const symmetry = t < 0.5 ? attachA.symmetry : attachB.symmetry;

    return {
      partType,
      parentBone,
      offset,
      side,
      symmetry,
      jointAngles,
      scale,
    };
  }

  /**
   * Convert a PartAttachment to an InterpolatableAttachment with default
   * joint angles and scale.
   */
  fromPartAttachment(attach: PartAttachment, scale: number = 1.0): InterpolatableAttachment {
    return {
      partType: attach.partType,
      parentBone: attach.parentBone,
      offset: attach.offset.clone(),
      side: attach.side ?? 'center',
      symmetry: attach.symmetry ?? 'none',
      jointAngles: { x: 0, y: 0, z: 0 },
      scale,
    };
  }

  /**
   * Interpolate arrays of attachments using bipartite matching
   * to find optimal pairings based on part type and position.
   *
   * @param attachmentsA First parent's attachments
   * @param attachmentsB Second parent's attachments
   * @param t Interpolation parameter
   * @param rng Seeded RNG for discrete choice resolution
   * @returns Array of interpolated attachments
   */
  interpAttachmentsWithMatching(
    attachmentsA: InterpolatableAttachment[],
    attachmentsB: InterpolatableAttachment[],
    t: number,
    rng: SeededRandom,
  ): InterpolatableAttachment[] {
    if (attachmentsA.length === 0 && attachmentsB.length === 0) return [];
    if (attachmentsA.length === 0) return attachmentsB.map(a => ({ ...a }));
    if (attachmentsB.length === 0) return attachmentsA.map(a => ({ ...a }));

    // Build similarity matrix based on attachment properties
    const matcher = new MaximumBipartiteMatching();
    const labelsA = attachmentsA.map(a => a.partType);
    const labelsB = attachmentsB.map(b => b.partType);

    const simMatrix: number[][] = [];
    for (let i = 0; i < attachmentsA.length; i++) {
      simMatrix[i] = [];
      for (let j = 0; j < attachmentsB.length; j++) {
        simMatrix[i][j] = this.attachmentSimilarity(attachmentsA[i], attachmentsB[j]);
      }
    }

    const matching = matcher.computeMatching(labelsA, labelsB, simMatrix);

    const matchedA = new Set<number>();
    const matchedB = new Set<number>();
    const result: InterpolatableAttachment[] = [];

    // Interpolate matched pairs
    for (const [idxA, idxB] of matching) {
      matchedA.add(idxA);
      matchedB.add(idxB);
      const sim = simMatrix[idxA][idxB];

      if (sim > 0.15) {
        result.push(this.interpAttachment(attachmentsA[idxA], attachmentsB[idxB], t));
      } else {
        // Low similarity — keep dominant parent's attachment
        result.push(t < 0.5 ? { ...attachmentsA[idxA] } : { ...attachmentsB[idxB] });
      }
    }

    // Add unmatched attachments from A (scaled by 1-t)
    for (let i = 0; i < attachmentsA.length; i++) {
      if (!matchedA.has(i)) {
        const a = attachmentsA[i];
        result.push({
          ...a,
          offset: a.offset.clone().multiplyScalar(1 - t),
          scale: a.scale * (1 - t),
          jointAngles: {
            x: a.jointAngles.x * (1 - t),
            y: a.jointAngles.y * (1 - t),
            z: a.jointAngles.z * (1 - t),
          },
        });
      }
    }

    // Add unmatched attachments from B (scaled by t)
    for (let j = 0; j < attachmentsB.length; j++) {
      if (!matchedB.has(j)) {
        const b = attachmentsB[j];
        result.push({
          ...b,
          offset: b.offset.clone().multiplyScalar(t),
          scale: b.scale * t,
          jointAngles: {
            x: b.jointAngles.x * t,
            y: b.jointAngles.y * t,
            z: b.jointAngles.z * t,
          },
        });
      }
    }

    return result;
  }

  /**
   * Compute similarity between two attachments.
   */
  private attachmentSimilarity(
    a: InterpolatableAttachment,
    b: InterpolatableAttachment,
  ): number {
    let score = 0;

    // Same part type is a strong signal
    if (a.partType === b.partType) {
      score += 0.5;
    }

    // Same side
    if (a.side === b.side) {
      score += 0.2;
    }

    // Same parent bone
    if (a.parentBone === b.parentBone) {
      score += 0.2;
    }

    // Position proximity (normalized)
    const dist = a.offset.distanceTo(b.offset);
    score += Math.max(0, 0.1 * (1 - dist));

    return Math.min(1, score);
  }
}

// ============================================================================
// GenomeFactory Class
// ============================================================================

/**
 * Species type for genome factory
 */
export type SpeciesType = 'mammal' | 'reptile' | 'bird' | 'fish' | 'amphibian' | 'insect';

/**
 * Factory for creating creature genomes from species templates and
 * producing child genomes from parent pairs.
 *
 * Each species has a pre-built genome template defining characteristic
 * gene ranges and values. The factory uses seeded RNG for deterministic
 * generation.
 */
export class GenomeFactory {
  private rng: SeededRandom;
  private interpolator: GenomeInterpolator;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.interpolator = new GenomeInterpolator();
  }

  /**
   * Create a random genome for the given species type.
   *
   * @param species Species type
   * @param rng Optional RNG override (uses factory's RNG if not provided)
   * @returns A new CreatureGenome with species-appropriate genes
   */
  createGenome(species: SpeciesType, rng?: SeededRandom): CreatureGenome {
    const effectiveRng = rng ?? this.rng;
    const template = this.getSpeciesTemplate(species);
    const genome = new CreatureGenome(species);

    // Apply template genes with random variation
    for (const gene of template) {
      const randomized = this.randomizeGene(gene, effectiveRng);
      genome.setGene(randomized.name, randomized);
    }

    return genome;
  }

  /**
   * Create a child genome from two parent genomes using bipartite
   * matching interpolation and mutation.
   *
   * @param parentA First parent genome
   * @param parentB Second parent genome
   * @param rng Optional RNG override
   * @param mutationRate Global mutation rate for the child (default 0.1)
   * @returns A new child CreatureGenome
   */
  createChildGenome(
    parentA: CreatureGenome,
    parentB: CreatureGenome,
    rng?: SeededRandom,
    mutationRate: number = 0.1,
  ): CreatureGenome {
    const effectiveRng = rng ?? this.rng;

    // Use bipartite matching for optimal gene pairing
    const child = this.interpolator.interpGenomeWithMatching(
      parentA,
      parentB,
      0.5, // Equal blend
      effectiveRng,
    );

    // Apply mutation
    child.mutate(effectiveRng, mutationRate);

    // Set species to the dominant parent or hybrid name
    child.species = `${parentA.species}_${parentB.species}_hybrid`;

    return child;
  }

  /**
   * Get available species types.
   */
  getAvailableSpecies(): SpeciesType[] {
    return ['mammal', 'reptile', 'bird', 'fish', 'amphibian', 'insect'];
  }

  // ── Species Templates ────────────────────────────────────────────

  /**
   * Get the gene template for a species type.
   * Each template defines characteristic genes with typical value ranges.
   */
  private getSpeciesTemplate(species: SpeciesType): CreatureGene[] {
    switch (species) {
      case 'mammal':
        return this.mammalTemplate();
      case 'reptile':
        return this.reptileTemplate();
      case 'bird':
        return this.birdTemplate();
      case 'fish':
        return this.fishTemplate();
      case 'amphibian':
        return this.amphibianTemplate();
      case 'insect':
        return this.insectTemplate();
    }
  }

  private mammalTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 1.5, minValue: 0.8, maxValue: 3.0, mutationRate: 0.15 },
      { name: 'bodyWidth', type: 'float', value: 0.4, minValue: 0.2, maxValue: 0.8, mutationRate: 0.12 },
      { name: 'bodyHeight', type: 'float', value: 0.45, minValue: 0.25, maxValue: 0.7, mutationRate: 0.12 },
      { name: 'headSize', type: 'float', value: 0.25, minValue: 0.15, maxValue: 0.4, mutationRate: 0.1 },
      { name: 'legLength', type: 'float', value: 0.55, minValue: 0.3, maxValue: 0.8, mutationRate: 0.15 },
      { name: 'legThickness', type: 'float', value: 0.09, minValue: 0.04, maxValue: 0.16, mutationRate: 0.12 },
      { name: 'tailLength', type: 'float', value: 0.5, minValue: 0.1, maxValue: 0.9, mutationRate: 0.18 },
      { name: 'neckLength', type: 'float', value: 0.2, minValue: 0.05, maxValue: 0.5, mutationRate: 0.15 },
      { name: 'snoutLength', type: 'float', value: 0.15, minValue: 0.05, maxValue: 0.35, mutationRate: 0.12 },
      { name: 'earSize', type: 'float', value: 0.08, minValue: 0.02, maxValue: 0.2, mutationRate: 0.2 },
      { name: 'furDensity', type: 'float', value: 0.7, minValue: 0.1, maxValue: 1.0, mutationRate: 0.15 },
      { name: 'furLength', type: 'float', value: 0.4, minValue: 0.05, maxValue: 0.9, mutationRate: 0.2 },
      { name: 'primaryColor', type: 'color', value: { r: 0.55, g: 0.4, b: 0.25 }, mutationRate: 0.2 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.45, g: 0.35, b: 0.2 }, mutationRate: 0.2 },
      { name: 'patternType', type: 'enum', value: 'solid', enumOptions: ['solid', 'spotted', 'striped', 'banded', 'rosette'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 4, minValue: 0, maxValue: 4, mutationRate: 0.02 },
      { name: 'spineSegments', type: 'int', value: 6, minValue: 3, maxValue: 10, mutationRate: 0.05 },
      { name: 'locomotionType', type: 'enum', value: 'quadruped_walk', enumOptions: ['quadruped_walk', 'biped_walk', 'serpentine_slither'], mutationRate: 0.02 },
      { name: 'bodyShape', type: 'enum', value: 'stocky', enumOptions: ['stocky', 'slender', 'elongated', 'compact'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.15, y: 0.06, z: 0.08 }, mutationRate: 0.08 },
    ];
  }

  private reptileTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 2.5, minValue: 0.5, maxValue: 5.0, mutationRate: 0.2 },
      { name: 'bodyWidth', type: 'float', value: 0.12, minValue: 0.04, maxValue: 0.3, mutationRate: 0.15 },
      { name: 'bodyHeight', type: 'float', value: 0.1, minValue: 0.04, maxValue: 0.25, mutationRate: 0.15 },
      { name: 'headSize', type: 'float', value: 0.1, minValue: 0.05, maxValue: 0.2, mutationRate: 0.12 },
      { name: 'legLength', type: 'float', value: 0.3, minValue: 0.0, maxValue: 0.6, mutationRate: 0.2 },
      { name: 'legThickness', type: 'float', value: 0.04, minValue: 0.01, maxValue: 0.1, mutationRate: 0.15 },
      { name: 'tailLength', type: 'float', value: 0.4, minValue: 0.1, maxValue: 0.7, mutationRate: 0.2 },
      { name: 'neckLength', type: 'float', value: 0.03, minValue: 0.0, maxValue: 0.2, mutationRate: 0.2 },
      { name: 'snoutLength', type: 'float', value: 0.08, minValue: 0.03, maxValue: 0.2, mutationRate: 0.15 },
      { name: 'scaleSize', type: 'float', value: 0.5, minValue: 0.1, maxValue: 1.0, mutationRate: 0.15 },
      { name: 'scaleRoughness', type: 'float', value: 0.7, minValue: 0.2, maxValue: 1.0, mutationRate: 0.12 },
      { name: 'primaryColor', type: 'color', value: { r: 0.3, g: 0.45, b: 0.2 }, mutationRate: 0.25 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.2, g: 0.35, b: 0.15 }, mutationRate: 0.25 },
      { name: 'patternType', type: 'enum', value: 'scaled', enumOptions: ['solid', 'scaled', 'diamond', 'banded', 'mottled'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 0, minValue: 0, maxValue: 4, mutationRate: 0.03 },
      { name: 'spineSegments', type: 'int', value: 12, minValue: 5, maxValue: 20, mutationRate: 0.08 },
      { name: 'locomotionType', type: 'enum', value: 'serpentine_slither', enumOptions: ['serpentine_slither', 'quadruped_walk'], mutationRate: 0.03 },
      { name: 'bodyShape', type: 'enum', value: 'elongated', enumOptions: ['elongated', 'slender', 'compact', 'stocky'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.08, y: 0.03, z: 0.05 }, mutationRate: 0.08 },
      { name: 'jawOpenAngle', type: 'float', value: 0.6, minValue: 0.2, maxValue: 1.0, mutationRate: 0.1 },
    ];
  }

  private birdTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 0.45, minValue: 0.2, maxValue: 1.0, mutationRate: 0.15 },
      { name: 'bodyWidth', type: 'float', value: 0.25, minValue: 0.1, maxValue: 0.5, mutationRate: 0.12 },
      { name: 'bodyHeight', type: 'float', value: 0.25, minValue: 0.1, maxValue: 0.45, mutationRate: 0.12 },
      { name: 'headSize', type: 'float', value: 0.16, minValue: 0.08, maxValue: 0.28, mutationRate: 0.1 },
      { name: 'legLength', type: 'float', value: 0.35, minValue: 0.15, maxValue: 0.6, mutationRate: 0.15 },
      { name: 'legThickness', type: 'float', value: 0.04, minValue: 0.01, maxValue: 0.08, mutationRate: 0.12 },
      { name: 'tailLength', type: 'float', value: 0.25, minValue: 0.05, maxValue: 0.6, mutationRate: 0.2 },
      { name: 'neckLength', type: 'float', value: 0.18, minValue: 0.05, maxValue: 0.35, mutationRate: 0.15 },
      { name: 'wingSpan', type: 'float', value: 1.0, minValue: 0.3, maxValue: 2.5, mutationRate: 0.2 },
      { name: 'beakLength', type: 'float', value: 0.15, minValue: 0.03, maxValue: 0.4, mutationRate: 0.18 },
      { name: 'beakShape', type: 'enum', value: 'generalist', enumOptions: ['generalist', 'hooked', 'long_thin', 'short_thick', 'flat'], mutationRate: 0.12 },
      { name: 'primaryColor', type: 'color', value: { r: 0.4, g: 0.5, b: 0.55 }, mutationRate: 0.25 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.6, g: 0.6, b: 0.5 }, mutationRate: 0.25 },
      { name: 'patternType', type: 'enum', value: 'solid', enumOptions: ['solid', 'spotted', 'banded', 'iridescent', 'counter_shaded'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 2, minValue: 2, maxValue: 2, mutationRate: 0.0 },
      { name: 'spineSegments', type: 'int', value: 5, minValue: 3, maxValue: 8, mutationRate: 0.05 },
      { name: 'locomotionType', type: 'enum', value: 'avian_hop', enumOptions: ['avian_hop', 'biped_walk'], mutationRate: 0.02 },
      { name: 'bodyShape', type: 'enum', value: 'compact', enumOptions: ['compact', 'slender', 'stocky', 'elongated'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.1, y: 0.05, z: 0.06 }, mutationRate: 0.08 },
      { name: 'featherLength', type: 'float', value: 0.5, minValue: 0.1, maxValue: 1.0, mutationRate: 0.15 },
    ];
  }

  private fishTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 1.5, minValue: 0.3, maxValue: 4.0, mutationRate: 0.2 },
      { name: 'bodyWidth', type: 'float', value: 0.2, minValue: 0.05, maxValue: 0.5, mutationRate: 0.15 },
      { name: 'bodyHeight', type: 'float', value: 0.18, minValue: 0.05, maxValue: 0.4, mutationRate: 0.15 },
      { name: 'headSize', type: 'float', value: 0.15, minValue: 0.08, maxValue: 0.25, mutationRate: 0.1 },
      { name: 'finSize', type: 'float', value: 0.3, minValue: 0.1, maxValue: 0.6, mutationRate: 0.18 },
      { name: 'tailFinSize', type: 'float', value: 0.25, minValue: 0.05, maxValue: 0.5, mutationRate: 0.2 },
      { name: 'dorsalFinHeight', type: 'float', value: 0.15, minValue: 0.0, maxValue: 0.4, mutationRate: 0.2 },
      { name: 'scaleSize', type: 'float', value: 0.3, minValue: 0.05, maxValue: 0.8, mutationRate: 0.15 },
      { name: 'scaleShine', type: 'float', value: 0.6, minValue: 0.0, maxValue: 1.0, mutationRate: 0.12 },
      { name: 'primaryColor', type: 'color', value: { r: 0.3, g: 0.5, b: 0.6 }, mutationRate: 0.25 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.5, g: 0.6, b: 0.55 }, mutationRate: 0.25 },
      { name: 'patternType', type: 'enum', value: 'scaled', enumOptions: ['solid', 'scaled', 'spotted', 'striped', 'iridescent'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 0, minValue: 0, maxValue: 0, mutationRate: 0.0 },
      { name: 'spineSegments', type: 'int', value: 8, minValue: 4, maxValue: 15, mutationRate: 0.08 },
      { name: 'locomotionType', type: 'enum', value: 'aquatic_swim', enumOptions: ['aquatic_swim'], mutationRate: 0.0 },
      { name: 'bodyShape', type: 'enum', value: 'elongated', enumOptions: ['elongated', 'torpedo', 'flat', 'spherical'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.12, y: 0.04, z: 0.06 }, mutationRate: 0.08 },
      { name: 'gillCount', type: 'int', value: 2, minValue: 1, maxValue: 3, mutationRate: 0.02 },
      { name: 'whiskerLength', type: 'float', value: 0.05, minValue: 0.0, maxValue: 0.3, mutationRate: 0.2 },
    ];
  }

  private amphibianTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 0.8, minValue: 0.2, maxValue: 2.0, mutationRate: 0.18 },
      { name: 'bodyWidth', type: 'float', value: 0.3, minValue: 0.1, maxValue: 0.6, mutationRate: 0.12 },
      { name: 'bodyHeight', type: 'float', value: 0.2, minValue: 0.08, maxValue: 0.4, mutationRate: 0.12 },
      { name: 'headSize', type: 'float', value: 0.2, minValue: 0.1, maxValue: 0.35, mutationRate: 0.1 },
      { name: 'legLength', type: 'float', value: 0.4, minValue: 0.1, maxValue: 0.7, mutationRate: 0.18 },
      { name: 'legThickness', type: 'float', value: 0.06, minValue: 0.02, maxValue: 0.12, mutationRate: 0.12 },
      { name: 'tailLength', type: 'float', value: 0.3, minValue: 0.0, maxValue: 0.6, mutationRate: 0.2 },
      { name: 'neckLength', type: 'float', value: 0.02, minValue: 0.0, maxValue: 0.1, mutationRate: 0.15 },
      { name: 'skinMoisture', type: 'float', value: 0.8, minValue: 0.3, maxValue: 1.0, mutationRate: 0.1 },
      { name: 'skinWartSize', type: 'float', value: 0.2, minValue: 0.0, maxValue: 0.6, mutationRate: 0.18 },
      { name: 'primaryColor', type: 'color', value: { r: 0.35, g: 0.5, b: 0.2 }, mutationRate: 0.22 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.5, g: 0.55, b: 0.25 }, mutationRate: 0.22 },
      { name: 'bellyColor', type: 'color', value: { r: 0.6, g: 0.6, b: 0.4 }, mutationRate: 0.15 },
      { name: 'patternType', type: 'enum', value: 'mottled', enumOptions: ['solid', 'spotted', 'mottled', 'banded'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 4, minValue: 0, maxValue: 4, mutationRate: 0.03 },
      { name: 'spineSegments', type: 'int', value: 6, minValue: 3, maxValue: 10, mutationRate: 0.06 },
      { name: 'locomotionType', type: 'enum', value: 'quadruped_walk', enumOptions: ['quadruped_walk', 'aquatic_swim', 'biped_walk'], mutationRate: 0.05 },
      { name: 'bodyShape', type: 'enum', value: 'compact', enumOptions: ['compact', 'stocky', 'slender', 'elongated'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.14, y: 0.07, z: 0.08 }, mutationRate: 0.08 },
      { name: 'eyeSize', type: 'float', value: 0.12, minValue: 0.04, maxValue: 0.25, mutationRate: 0.15 },
    ];
  }

  private insectTemplate(): CreatureGene[] {
    return [
      { name: 'bodyLength', type: 'float', value: 0.5, minValue: 0.1, maxValue: 1.5, mutationRate: 0.18 },
      { name: 'bodyWidth', type: 'float', value: 0.2, minValue: 0.05, maxValue: 0.4, mutationRate: 0.12 },
      { name: 'bodyHeight', type: 'float', value: 0.15, minValue: 0.05, maxValue: 0.3, mutationRate: 0.12 },
      { name: 'headSize', type: 'float', value: 0.15, minValue: 0.08, maxValue: 0.25, mutationRate: 0.1 },
      { name: 'legLength', type: 'float', value: 0.35, minValue: 0.1, maxValue: 0.6, mutationRate: 0.18 },
      { name: 'legThickness', type: 'float', value: 0.03, minValue: 0.01, maxValue: 0.07, mutationRate: 0.12 },
      { name: 'antennaLength', type: 'float', value: 0.2, minValue: 0.05, maxValue: 0.5, mutationRate: 0.2 },
      { name: 'wingSpan', type: 'float', value: 0.3, minValue: 0.0, maxValue: 1.0, mutationRate: 0.25 },
      { name: 'exoskeletonHardness', type: 'float', value: 0.7, minValue: 0.2, maxValue: 1.0, mutationRate: 0.1 },
      { name: 'segmentCount', type: 'int', value: 3, minValue: 2, maxValue: 5, mutationRate: 0.05 },
      { name: 'primaryColor', type: 'color', value: { r: 0.3, g: 0.25, b: 0.15 }, mutationRate: 0.2 },
      { name: 'secondaryColor', type: 'color', value: { r: 0.4, g: 0.3, b: 0.1 }, mutationRate: 0.2 },
      { name: 'patternType', type: 'enum', value: 'solid', enumOptions: ['solid', 'spotted', 'striped', 'banded', 'iridescent'], mutationRate: 0.15 },
      { name: 'legCount', type: 'int', value: 6, minValue: 6, maxValue: 6, mutationRate: 0.01 },
      { name: 'spineSegments', type: 'int', value: 3, minValue: 2, maxValue: 5, mutationRate: 0.05 },
      { name: 'locomotionType', type: 'enum', value: 'insectoid_crawl', enumOptions: ['insectoid_crawl', 'avian_hop'], mutationRate: 0.02 },
      { name: 'bodyShape', type: 'enum', value: 'elongated', enumOptions: ['elongated', 'compact', 'spherical'], mutationRate: 0.1 },
      { name: 'eyePosition', type: 'vector3', value: { x: 0.08, y: 0.04, z: 0.06 }, mutationRate: 0.08 },
      { name: 'mandibleSize', type: 'float', value: 0.1, minValue: 0.01, maxValue: 0.3, mutationRate: 0.2 },
      { name: 'compoundEyeSize', type: 'float', value: 0.06, minValue: 0.02, maxValue: 0.12, mutationRate: 0.12 },
    ];
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Randomize a gene's value within its valid range, using the template
   * value as a baseline and applying seeded variation.
   */
  private randomizeGene(gene: CreatureGene, rng: SeededRandom): CreatureGene {
    const result = { ...gene };

    switch (gene.type) {
      case 'float': {
        const val = gene.value as number;
        const minV = gene.minValue ?? val * 0.5;
        const maxV = gene.maxValue ?? val * 1.5;
        result.value = rng.nextFloat(minV, maxV);
        break;
      }
      case 'int': {
        const val = gene.value as number;
        const minV = gene.minValue ?? Math.floor(val * 0.5);
        const maxV = gene.maxValue ?? Math.ceil(val * 1.5);
        result.value = rng.nextInt(minV, maxV);
        break;
      }
      case 'color': {
        const baseColor = gene.value as GeneColor;
        const hsv = rgbToHsv(baseColor.r, baseColor.g, baseColor.b);
        // Add variation to hue, saturation, and value
        hsv.h = ((hsv.h + rng.gaussian(0, 0.08)) % 1 + 1) % 1;
        hsv.s = Math.max(0, Math.min(1, hsv.s + rng.gaussian(0, 0.05)));
        hsv.v = Math.max(0, Math.min(1, hsv.v + rng.gaussian(0, 0.05)));
        const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        result.value = { r: rgb.r, g: rgb.g, b: rgb.b };
        break;
      }
      case 'vector3': {
        const baseVec = gene.value as { x: number; y: number; z: number };
        result.value = {
          x: baseVec.x + rng.gaussian(0, 0.02),
          y: baseVec.y + rng.gaussian(0, 0.02),
          z: baseVec.z + rng.gaussian(0, 0.02),
        };
        break;
      }
      case 'enum': {
        if (gene.enumOptions && gene.enumOptions.length > 0) {
          // Use the template value most of the time, occasionally pick randomly
          if (rng.next() < 0.7) {
            result.value = gene.value as string;
          } else {
            result.value = rng.choice(gene.enumOptions);
          }
        }
        break;
      }
    }

    return result;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a GeneColor to a THREE.Color instance.
 */
export function geneColorToThreeColor(color: GeneColor): Color {
  return new Color(color.r, color.g, color.b);
}

/**
 * Convert a THREE.Color to a GeneColor.
 */
export function threeColorToGeneColor(color: Color): GeneColor {
  return { r: color.r, g: color.g, b: color.b };
}

/**
 * Convert a CreatureGenome's gene values into a plain object
 * suitable for use as creature generation parameters.
 */
export function genomeToPlainObject(genome: CreatureGenome): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, gene] of genome.genes) {
    if (gene.type === 'vector3') {
      const v = gene.value as { x: number; y: number; z: number };
      result[name] = new Vector3(v.x, v.y, v.z);
    } else if (gene.type === 'color') {
      const c = gene.value as GeneColor;
      result[name] = new Color(c.r, c.g, c.b);
    } else {
      result[name] = gene.value;
    }
  }
  return result;
}
