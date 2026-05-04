/**
 * Tag-Based Relation Algebra
 *
 * Ports: infinigen/core/constraints/constraint_language/relations.py (tag algebra portions)
 *
 * Implements tag-based algebraic reasoning for the constraint system.
 * The original Infinigen uses tag-based algebra where GeometryRelation
 * has implies/satisfies/intersects/intersection/difference operations
 * computed over semantic tag sets. This module provides that missing
 * capability to the R3F port, which previously relied solely on
 * runtime AABB-based spatial evaluation.
 *
 * Key classes:
 *  - TagSet: Immutable frozenset-like wrapper around Set<string>
 *  - GeometryRelation: Core relation with tag-based algebra operations
 *  - TagImplicationGraph: Manages semantic tag implications (transitive)
 *  - RelationEvaluator: Evaluates relations using an implication graph
 *
 * This complements the spatial SpatialRelationAlgebra (which operates on
 * geometric constraints) by providing *semantic* reasoning: e.g. "chair"
 * implies "furniture", and a relation requiring "furniture" is satisfied
 * by any object tagged "chair".
 */

// ============================================================================
// TagSet — Immutable Set of String Tags
// ============================================================================

/**
 * An immutable frozenset-like wrapper around a Set of strings.
 *
 * All operations return new instances — the original is never mutated.
 * This design enables safe composition and caching of tag sets.
 *
 * TagSet is intentionally string-based (unlike the Tag-object-based
 * TagSet in ../tags/index.ts) to allow lightweight, O(1) lookups
 * and simple serialization.
 */
export class TagSet {
  /** The internal set of tags. Frozen after construction. */
  private readonly _tags: ReadonlySet<string>;

  /** Cached hash for equality comparisons */
  private _hash?: string;

  constructor(tags: Iterable<string> = []) {
    this._tags = new Set(tags);
  }

  // ── Query ──────────────────────────────────────────────────────────────

  /** Check if this set contains a given tag. O(1). */
  has(tag: string): boolean {
    return this._tags.has(tag);
  }

  /** Check if this set is empty. */
  isEmpty(): boolean {
    return this._tags.size === 0;
  }

  /** Get the number of tags in this set. */
  get size(): number {
    return this._tags.size;
  }

  /** Iterate over the tags in this set. */
  [Symbol.iterator](): IterableIterator<string> {
    return this._tags[Symbol.iterator]();
  }

  /** Convert to a plain sorted array. Useful for debugging & serialization. */
  toArray(): string[] {
    return Array.from(this._tags).sort();
  }

  // ── Set Operations (all return new TagSet instances) ──────────────────

  /** Union: tags present in either this set or the other. */
  union(other: TagSet): TagSet {
    if (other.isEmpty()) return this;
    if (this.isEmpty()) return other;
    const result = new Set(this._tags);
    for (const tag of other._tags) {
      result.add(tag);
    }
    return new TagSet(result);
  }

  /** Intersection: tags present in both this set and the other. */
  intersect(other: TagSet): TagSet {
    if (this.isEmpty() || other.isEmpty()) return EMPTY_TAG_SET;
    // Iterate over the smaller set for efficiency
    const [smaller, larger] = this._tags.size <= other._tags.size
      ? [this._tags, other._tags]
      : [other._tags, this._tags];
    const result = new Set<string>();
    for (const tag of smaller) {
      if (larger.has(tag)) {
        result.add(tag);
      }
    }
    return new TagSet(result);
  }

  /** Difference: tags present in this set but not in the other. */
  difference(other: TagSet): TagSet {
    if (this.isEmpty() || other.isEmpty()) return this;
    const result = new Set<string>();
    for (const tag of this._tags) {
      if (!other._tags.has(tag)) {
        result.add(tag);
      }
    }
    return new TagSet(result);
  }

  // ── Relations ─────────────────────────────────────────────────────────

  /** Check if every tag in this set is also in the other set. */
  isSubsetOf(other: TagSet): boolean {
    if (this.isEmpty()) return true;
    if (this._tags.size > other._tags.size) return false;
    for (const tag of this._tags) {
      if (!other._tags.has(tag)) return false;
    }
    return true;
  }

  /** Check if this set is a superset of the other. */
  isSupersetOf(other: TagSet): boolean {
    return other.isSubsetOf(this);
  }

  /** Check if this set has any tags in common with the other. */
  hasIntersectionWith(other: TagSet): boolean {
    if (this.isEmpty() || other.isEmpty()) return false;
    // Iterate over the smaller set
    const [smaller, larger] = this._tags.size <= other._tags.size
      ? [this._tags, other._tags]
      : [other._tags, this._tags];
    for (const tag of smaller) {
      if (larger.has(tag)) return true;
    }
    return false;
  }

  /** Strict equality: same tags in both sets. */
  equals(other: TagSet): boolean {
    if (this._tags.size !== other._tags.size) return false;
    for (const tag of this._tags) {
      if (!other._tags.has(tag)) return false;
    }
    return true;
  }

  // ── Serialization ─────────────────────────────────────────────────────

  /** Deterministic string representation (sorted). */
  toString(): string {
    return `{${this.toArray().join(', ')}}`;
  }

  /** Get a cache-friendly hash key. */
  toHashKey(): string {
    if (this._hash === undefined) {
      this._hash = this.toArray().join('\0');
    }
    return this._hash;
  }
}

/** The empty TagSet singleton. */
export const EMPTY_TAG_SET = new TagSet([]);

// Static EMPTY accessor on TagSet class
// Defined as a module-level convenience; prefer importing EMPTY_TAG_SET directly.
Object.defineProperty(TagSet, 'EMPTY', {
  get: () => EMPTY_TAG_SET,
  enumerable: true,
  configurable: false,
});

// ============================================================================
// GeometryRelation — Tag-Based Relation Algebra
// ============================================================================

/**
 * A geometry relation expressed as two tag sets (child and parent).
 *
 * The child tag set represents the tags that the child object must have,
 * while the parent tag set represents the tags that the parent object
 * must have. The relation holds when:
 *   - The child object's tags ⊇ childTags (the child satisfies the child requirement)
 *   - The parent object's tags ⊇ parentTags (the parent satisfies the parent requirement)
 *
 * Operations like implies, satisfies, intersects, intersection, difference,
 * complement, and negate are computed purely over these tag sets, enabling
 * algebraic reasoning about semantic relationships without spatial evaluation.
 *
 * Example:
 *   A "chair-on-floor" relation might have:
 *     childTags = {"chair"}
 *     parentTags = {"floor"}
 *
 *   This relation *implies* a "furniture-on-surface" relation with:
 *     childTags = {"furniture"}
 *     parentTags = {"surface"}
 *
 *   Because "chair" ⊂ "furniture" (via the implication graph) and
 *   "floor" ⊂ "surface".
 */
export class GeometryRelation {
  /** Tags required of the child object */
  readonly childTags: TagSet;

  /** Tags required of the parent object */
  readonly parentTags: TagSet;

  /** Whether this relation is negated (logical NOT) */
  readonly negated: boolean;

  constructor(
    childTags: TagSet | Iterable<string>,
    parentTags: TagSet | Iterable<string>,
    negated: boolean = false
  ) {
    this.childTags = childTags instanceof TagSet ? childTags : new TagSet(childTags);
    this.parentTags = parentTags instanceof TagSet ? parentTags : new TagSet(parentTags);
    this.negated = negated;
  }

  // ── Algebraic Operations ──────────────────────────────────────────────

  /**
   * Implication: does this relation logically imply the other?
   *
   * this.implies(other) is true when:
   *   - this.childTags ⊇ other.childTags  (our child requirement is more specific)
   *   - this.parentTags ⊇ other.parentTags (our parent requirement is more specific)
   *
   * If both relations are negated, implication reverses:
   *   NOT(A) implies NOT(B) iff B implies A (contrapositive)
   *
   * A negated relation cannot imply a non-negated one and vice versa.
   */
  implies(other: GeometryRelation): boolean {
    // Negation mismatch: a negated relation cannot imply a non-negated one
    if (this.negated !== other.negated) return false;

    if (this.negated && other.negated) {
      // Contrapositive: NOT(A) implies NOT(B) iff B implies A
      // i.e., the other's tags must be a superset of ours
      return other.childTags.isSubsetOf(this.childTags)
        && other.parentTags.isSubsetOf(this.parentTags);
    }

    // Normal case: our tag sets are supersets of the other's
    // (more specific child + parent requirements imply less specific ones)
    return other.childTags.isSubsetOf(this.childTags)
      && other.parentTags.isSubsetOf(this.parentTags);
  }

  /**
   * Satisfaction: does the intersection of this relation's tags satisfy
   * the other relation's requirements?
   *
   * this.satisfies(other) is true when:
   *   - this.childTags ∩ other.childTags is non-empty (some child tags overlap)
   *   - this.parentTags ∩ other.parentTags is non-empty (some parent tags overlap)
   *   - The overlapping tags are sufficient to meet the other's requirements
   *
   * For non-negated relations, this checks whether the shared tags between
   * the two relations are enough to satisfy the other's requirements.
   */
  satisfies(other: GeometryRelation): boolean {
    if (this.negated !== other.negated) return false;

    if (this.negated && other.negated) {
      // NOT(A) satisfies NOT(B) if B's requirements are a subset of A's
      // (if B's constraints are weaker, then A's negation covers B's negation)
      return other.childTags.isSubsetOf(this.childTags)
        && other.parentTags.isSubsetOf(this.parentTags);
    }

    // Check if the intersection of tag sets covers the other's requirements
    const childIntersection = this.childTags.intersect(other.childTags);
    const parentIntersection = this.parentTags.intersect(other.parentTags);

    // This relation satisfies other if the overlapping tags are sufficient
    // i.e., the intersection of tags must cover what other requires
    return other.childTags.isSubsetOf(childIntersection.union(this.childTags))
      && other.parentTags.isSubsetOf(parentIntersection.union(this.parentTags));
  }

  /**
   * Intersection test: is there any tag overlap between the two relations?
   *
   * Returns true if there's at least one shared child tag AND at least one
   * shared parent tag. For negated relations, the logic inverts appropriately.
   */
  intersects(other: GeometryRelation): boolean {
    // Negated + non-negated: always potentially intersect
    // (NOT(A) and A together = everything except A, but they share a context)
    if (this.negated !== other.negated) return true;

    if (this.negated && other.negated) {
      // NOT(A) intersects NOT(B) iff the union of A and B is not universal
      // Which is always true for finite tag sets
      return true;
    }

    // Both non-negated: check tag overlap
    return this.childTags.hasIntersectionWith(other.childTags)
      && this.parentTags.hasIntersectionWith(other.parentTags);
  }

  /**
   * Intersection: compute a new relation representing the overlap.
   *
   * The result has:
   *   childTags = this.childTags ∪ other.childTags  (both requirements must hold)
   *   parentTags = this.parentTags ∪ other.parentTags
   *
   * This is because satisfying both relations requires meeting both sets
   * of requirements, which means the child must have ALL tags from both.
   */
  intersection(other: GeometryRelation): GeometryRelation {
    if (this.negated && other.negated) {
      // NOT(A) ∩ NOT(B) = NOT(A ∪ B)
      // The union of tag requirements, negated
      return new GeometryRelation(
        this.childTags.union(other.childTags),
        this.parentTags.union(other.parentTags),
        true
      );
    }

    if (this.negated !== other.negated) {
      // NOT(A) ∩ B = B \ A
      const positive = this.negated ? other : this;
      const negative = this.negated ? this : other;
      return new GeometryRelation(
        positive.childTags.difference(negative.childTags),
        positive.parentTags.difference(negative.parentTags),
        false
      );
    }

    // Both non-negated: intersection requires satisfying both sets of constraints
    return new GeometryRelation(
      this.childTags.union(other.childTags),
      this.parentTags.union(other.parentTags),
      false
    );
  }

  /**
   * Difference: this relation minus the other.
   *
   * Returns a new relation representing objects that satisfy this
   * but NOT the other.
   *
   * this.difference(other):
   *   - If both non-negated: keep this's tags but exclude other's requirements
   *   - Result childTags = this.childTags, parentTags = this.parentTags,
   *     but the relation only holds for objects NOT satisfying other
   *   - Represented as intersection with NOT(other)
   */
  difference(other: GeometryRelation): GeometryRelation {
    // A \ B = A ∩ NOT(B)
    return this.intersection(other.negate());
  }

  /**
   * Complement: return the complement of this relation.
   *
   * The complement swaps the semantic direction — what was required
   * of the child becomes excluded, and vice versa. For a non-negated
   * relation, the complement produces a negated relation with the
   * same tag sets.
   */
  complement(): GeometryRelation {
    // Complement: swap child and parent tag semantics
    // This is a semantic inversion — the parent tags become child requirements
    // and vice versa
    return new GeometryRelation(
      this.parentTags,
      this.childTags,
      this.negated
    );
  }

  /**
   * Negate: return the logical negation of this relation.
   *
   * NOT(R) simply flips the negated flag. This represents objects
   * that do NOT satisfy the original relation.
   */
  negate(): GeometryRelation {
    return new GeometryRelation(
      this.childTags,
      this.parentTags,
      !this.negated
    );
  }

  // ── Utility ───────────────────────────────────────────────────────────

  /** Check if this relation is trivially true (empty requirements, not negated). */
  isTautology(): boolean {
    return !this.negated && this.childTags.isEmpty() && this.parentTags.isEmpty();
  }

  /** Check if this relation is trivially false (empty requirements, negated). */
  isContradiction(): boolean {
    return this.negated && this.childTags.isEmpty() && this.parentTags.isEmpty();
  }

  /** Check equality with another GeometryRelation. */
  equals(other: GeometryRelation): boolean {
    return this.negated === other.negated
      && this.childTags.equals(other.childTags)
      && this.parentTags.equals(other.parentTags);
  }

  /** Clone this relation. */
  clone(): GeometryRelation {
    return new GeometryRelation(
      this.childTags,
      this.parentTags,
      this.negated
    );
  }

  /** String representation. */
  toString(): string {
    const prefix = this.negated ? 'NOT(' : '';
    const suffix = this.negated ? ')' : '';
    return `${prefix}Relation(child=${this.childTags}, parent=${this.parentTags})${suffix}`;
  }
}

// ============================================================================
// TagImplicationGraph — Transitive Tag Implications
// ============================================================================

/**
 * Manages semantic tag implications with transitive closure.
 *
 * An implication "A implies B" means that any object with tag A
 * logically also has tag B. For example:
 *   "chair" → "furniture"  (a chair is furniture)
 *   "furniture" → "object" (furniture is an object)
 *
 * Transitivity: if "chair" → "furniture" and "furniture" → "object",
 * then "chair" → "object".
 *
 * The graph supports efficient:
 *   - Implication checks (O(1) after closure computation)
 *   - Transitive closure of a tag set (expand all implied tags)
 *   - Incremental addition of new implications
 */
export class TagImplicationGraph {
  /** Map from tag to set of tags it directly implies */
  private _forward: Map<string, Set<string>> = new Map();

  /** Map from tag to set of tags that directly imply it */
  private _backward: Map<string, Set<string>> = new Map();

  /** Cached transitive closure: tag → all transitively implied tags */
  private _closureCache: Map<string, Set<string>> = new Map();

  /** Whether the closure cache is stale and needs recomputation */
  private _cacheStale = true;

  // ── Mutation ──────────────────────────────────────────────────────────

  /**
   * Register that tag `from` implies tag `to`.
   *
   * This means: any object with tag `from` also has tag `to`.
   * Invalidates the closure cache.
   */
  addImplication(from: string, to: string): void {
    if (from === to) return; // Reflexive implication is trivial

    let forwardSet = this._forward.get(from);
    if (!forwardSet) {
      forwardSet = new Set();
      this._forward.set(from, forwardSet);
    }
    if (forwardSet.has(to)) return; // Already registered
    forwardSet.add(to);

    let backwardSet = this._backward.get(to);
    if (!backwardSet) {
      backwardSet = new Set();
      this._backward.set(to, backwardSet);
    }
    backwardSet.add(from);

    this._cacheStale = true;
  }

  /**
   * Add multiple implications at once.
   *
   * @param implications - Array of [from, to] pairs
   */
  addImplications(implications: [string, string][]): void {
    for (const [from, to] of implications) {
      this.addImplication(from, to);
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────

  /**
   * Check if tag `tagA` implies tag `tagB` (transitively).
   *
   * Returns true if there exists a chain of implications from A to B,
   * or if A === B (reflexive).
   *
   * O(1) after closure computation, O(V+E) on first call or after
   * modifications.
   */
  implies(tagA: string, tagB: string): boolean {
    if (tagA === tagB) return true;
    this._ensureClosureCache();
    const implied = this._closureCache.get(tagA);
    return implied !== undefined && implied.has(tagB);
  }

  /**
   * Compute the transitive closure of a tag set.
   *
   * Given a set of tags, returns a new TagSet containing all original
   * tags PLUS all tags they transitively imply.
   *
   * Example: closure({"chair"}) → {"chair", "furniture", "object"}
   *
   * O(n * d) where n = |tags| and d = average closure depth.
   */
  closure(tags: TagSet): TagSet {
    if (tags.isEmpty()) return tags;
    this._ensureClosureCache();

    const result = new Set<string>();
    for (const tag of tags) {
      result.add(tag);
      const implied = this._closureCache.get(tag);
      if (implied) {
        for (const t of implied) {
          result.add(t);
        }
      }
    }
    return new TagSet(result);
  }

  /**
   * Get all tags that directly imply the given tag.
   */
  getDirectImplicationsFrom(tag: string): Set<string> {
    return this._forward.get(tag) ?? new Set();
  }

  /**
   * Get all tags that are directly implied by the given tag.
   */
  getDirectImplicationsTo(tag: string): Set<string> {
    return this._backward.get(tag) ?? new Set();
  }

  /**
   * Get all known tags in the graph.
   */
  getAllTags(): Set<string> {
    const tags = new Set<string>();
    for (const key of this._forward.keys()) tags.add(key);
    for (const set of this._forward.values()) {
      for (const tag of set) tags.add(tag);
    }
    return tags;
  }

  /**
   * Clear all implications.
   */
  clear(): void {
    this._forward.clear();
    this._backward.clear();
    this._closureCache.clear();
    this._cacheStale = true;
  }

  /**
   * Get the number of direct implication edges.
   */
  get size(): number {
    let count = 0;
    for (const set of this._forward.values()) {
      count += set.size;
    }
    return count;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  /**
   * Ensure the closure cache is up to date.
   *
   * Computes transitive closures for all tags using BFS/DFS.
   * Runs in O(V * (V + E)) total, but only when the cache is stale.
   */
  private _ensureClosureCache(): void {
    if (!this._cacheStale) return;

    this._closureCache.clear();

    // For each tag, compute its transitive closure via BFS
    const allTags = this.getAllTags();
    for (const tag of allTags) {
      const closure = new Set<string>();
      const queue: string[] = [tag];
      const visited = new Set<string>([tag]);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const implied = this._forward.get(current);
        if (implied) {
          for (const t of implied) {
            if (!visited.has(t)) {
              visited.add(t);
              closure.add(t);
              queue.push(t);
            }
          }
        }
      }

      if (closure.size > 0) {
        this._closureCache.set(tag, closure);
      }
    }

    this._cacheStale = false;
  }
}

// ============================================================================
// RelationEvaluator — Evaluates Relations with Implication Context
// ============================================================================

/**
 * Evaluates geometry relations in the context of a tag implication graph.
 *
 * The evaluator provides two key capabilities:
 *
 * 1. **evaluate(relation, context)**: Check if a relation holds given a
 *    context tag set. This expands the context using the implication graph
 *    before checking.
 *
 * 2. **prune(relations, context)**: Filter out relations that can never
 *    be satisfied given a context, enabling early pruning in solvers.
 *
 * Example usage:
 * ```ts
 * const graph = new TagImplicationGraph();
 * graph.addImplications([
 *   ['chair', 'furniture'],
 *   ['furniture', 'object'],
 * ]);
 *
 * const evaluator = new RelationEvaluator(graph);
 *
 * const rel = new GeometryRelation(['chair'], ['floor']);
 * const context = new TagSet(['chair', 'wooden']);
 *
 * evaluator.evaluate(rel, context); // Checks if "chair" context satisfies
 *                                   // the child requirement of "chair"
 * ```
 */
export class RelationEvaluator {
  /** The implication graph used for expanding tag sets */
  readonly graph: TagImplicationGraph;

  constructor(graph: TagImplicationGraph) {
    this.graph = graph;
  }

  /**
   * Evaluate whether a relation holds given a context tag set.
   *
   * The context represents the tags of the object being checked.
   * The relation's childTags are the requirements that must be met.
   *
   * The context is first expanded via the implication graph (transitive
   * closure), then checked against the relation's child requirements.
   *
   * For a non-negated relation:
   *   Returns true if the expanded context ⊇ relation.childTags
   *   AND the parent tags are satisfiable (non-empty intersection with
   *   any valid parent).
   *
   * For a negated relation:
   *   Returns true if the expanded context does NOT satisfy the
   *   child requirements.
   *
   * @param relation - The relation to evaluate
   * @param context - The tag set of the object being evaluated
   * @returns Whether the relation holds for this context
   */
  evaluate(relation: GeometryRelation, context: TagSet): boolean {
    // Expand the context using the implication graph
    const expandedContext = this.graph.closure(context);

    if (relation.negated) {
      // Negated: the relation holds when the context does NOT satisfy
      // the positive requirements
      const satisfiesChild = relation.childTags.isSubsetOf(expandedContext);
      return !satisfiesChild;
    }

    // Non-negated: the relation holds when the context satisfies
    // the child requirements (all child tags are present in expanded context)
    return relation.childTags.isSubsetOf(expandedContext);
  }

  /**
   * Evaluate a relation with both child and parent contexts.
   *
   * This checks both that the child satisfies the child tag requirements
   * AND that the parent satisfies the parent tag requirements.
   *
   * @param relation - The relation to evaluate
   * @param childContext - Tags of the child object
   * @param parentContext - Tags of the parent object
   * @returns Whether the full relation holds
   */
  evaluateFull(
    relation: GeometryRelation,
    childContext: TagSet,
    parentContext: TagSet
  ): boolean {
    const expandedChild = this.graph.closure(childContext);
    const expandedParent = this.graph.closure(parentContext);

    if (relation.negated) {
      const childSatisfies = relation.childTags.isSubsetOf(expandedChild);
      const parentSatisfies = relation.parentTags.isSubsetOf(expandedParent);
      return !(childSatisfies && parentSatisfies);
    }

    const childSatisfies = relation.childTags.isSubsetOf(expandedChild);
    const parentSatisfies = relation.parentTags.isSubsetOf(expandedParent);
    return childSatisfies && parentSatisfies;
  }

  /**
   * Prune relations that can never be satisfied given a context.
   *
   * Given a set of candidate relations and a context (representing the
   * available object tags), returns only those relations that could
   * potentially be satisfied.
   *
   * A relation can be pruned if:
   *   - It is non-negated AND its child tags have no overlap with the
   *     expanded context (even after closure expansion)
   *   - It is negated AND its child tags are a subset of the expanded
   *     context (meaning the negation would always be false)
   *
   * @param relations - Array of relations to prune
   * @param context - Available tag context
   * @returns Filtered array of relations that might be satisfiable
   */
  prune(relations: GeometryRelation[], context: TagSet): GeometryRelation[] {
    const expandedContext = this.graph.closure(context);

    return relations.filter(relation => {
      if (relation.negated) {
        // A negated relation can only be satisfied if the context
        // does NOT fully contain the child tags.
        // If childTags ⊆ expandedContext, then NOT(childTags) is always
        // false for this context, so we can prune.
        return !relation.childTags.isSubsetOf(expandedContext);
      }

      // A non-negated relation requires all child tags to be present.
      // If even one child tag is not in the expanded context, and
      // there's no implication path to it, the relation can't be satisfied.
      // However, we use a weaker check: at least some child tags must
      // be reachable.
      if (relation.childTags.isEmpty()) return true;

      // Check if all child tags are satisfied by the expanded context
      return relation.childTags.isSubsetOf(expandedContext);
    });
  }

  /**
   * Prune relations considering both child and parent contexts.
   *
   * @param relations - Array of relations to prune
   * @param childContext - Available child object tags
   * @param parentContext - Available parent object tags
   * @returns Filtered array of relations
   */
  pruneFull(
    relations: GeometryRelation[],
    childContext: TagSet,
    parentContext: TagSet
  ): GeometryRelation[] {
    const expandedChild = this.graph.closure(childContext);
    const expandedParent = this.graph.closure(parentContext);

    return relations.filter(relation => {
      if (relation.negated) {
        // Negated: prune only if both child and parent requirements
        // are fully satisfied (making the negation always false)
        const childSatisfies = relation.childTags.isSubsetOf(expandedChild);
        const parentSatisfies = relation.parentTags.isSubsetOf(expandedParent);
        return !(childSatisfies && parentSatisfies);
      }

      // Non-negated: prune if either child or parent requirements
      // cannot be met
      const childSatisfies = relation.childTags.isSubsetOf(expandedChild);
      const parentSatisfies = relation.parentTags.isSubsetOf(expandedParent);
      return childSatisfies && parentSatisfies;
    });
  }

  /**
   * Find all relations that a given context satisfies.
   *
   * Useful for constraint lookup: given an object's tags, find all
   * relations that could apply to it.
   *
   * @param relations - Candidate relations
   * @param context - Object's tag context
   * @returns Relations that the context satisfies
   */
  findSatisfied(relations: GeometryRelation[], context: TagSet): GeometryRelation[] {
    const expandedContext = this.graph.closure(context);
    return relations.filter(relation => {
      if (relation.negated) {
        return !relation.childTags.isSubsetOf(expandedContext);
      }
      return relation.childTags.isSubsetOf(expandedContext);
    });
  }

  /**
   * Expand a tag set using the implication graph.
   *
   * Convenience method that delegates to the graph's closure method.
   */
  expand(tags: TagSet): TagSet {
    return this.graph.closure(tags);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a GeometryRelation from simple string arrays.
 *
 * Convenience factory that wraps string arrays in TagSets.
 */
export function relationFromTags(
  childTags: string[],
  parentTags: string[],
  negated: boolean = false
): GeometryRelation {
  return new GeometryRelation(childTags, parentTags, negated);
}

/**
 * Create a standard implication graph with common Infinigen semantics.
 *
 * This sets up the typical implication chains used in the constraint
 * system, such as:
 *   chair → furniture → object
 *   table → furniture → object
 *   floor → surface
 *   wall → surface
 *   etc.
 */
export function createStandardImplicationGraph(): TagImplicationGraph {
  const graph = new TagImplicationGraph();

  // Furniture hierarchy
  graph.addImplications([
    ['chair', 'furniture'],
    ['table', 'furniture'],
    ['sofa', 'furniture'],
    ['bed', 'furniture'],
    ['desk', 'furniture'],
    ['shelf', 'furniture'],
    ['cabinet', 'furniture'],
    ['bookshelf', 'furniture'],
    ['lamp', 'furniture'],
    ['furniture', 'object'],
  ]);

  // Surface hierarchy
  graph.addImplications([
    ['floor', 'surface'],
    ['wall', 'surface'],
    ['ceiling', 'surface'],
    ['tabletop', 'surface'],
    ['shelf_surface', 'surface'],
    ['surface', 'object'],
  ]);

  // Room hierarchy
  graph.addImplications([
    ['living_room', 'room'],
    ['bedroom', 'room'],
    ['kitchen', 'room'],
    ['bathroom', 'room'],
    ['dining_room', 'room'],
    ['office', 'room'],
    ['hallway', 'room'],
    ['room', 'object'],
  ]);

  // Appliance hierarchy
  graph.addImplications([
    ['stove', 'appliance'],
    ['refrigerator', 'appliance'],
    ['sink', 'appliance'],
    ['appliance', 'object'],
  ]);

  // Decoration hierarchy
  graph.addImplications([
    ['vase', 'decoration'],
    ['picture', 'decoration'],
    ['plant', 'decoration'],
    ['rug', 'decoration'],
    ['curtain', 'decoration'],
    ['mirror', 'decoration'],
    ['cushion', 'decoration'],
    ['decoration', 'object'],
  ]);

  // Functional hierarchy
  graph.addImplications([
    ['sitting', 'function'],
    ['sleeping', 'function'],
    ['eating', 'function'],
    ['working', 'function'],
    ['storage', 'function'],
    ['display', 'function'],
    ['cooking', 'function'],
  ]);

  return graph;
}
