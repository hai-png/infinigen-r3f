/**
 * Greedy Pre-Solver Phase
 *
 * Ports: infinigen/core/constraints/example_solver/greedy/
 * Original: constraint_partition.py, active_for_stage.py
 *
 * Provides a greedy pre-solve phase that runs before simulated annealing.
 * Partitions constraints into groups by variable overlap, topologically
 * sorts them by dependencies, and greedily assigns values that minimize
 * constraint violations within each group.
 *
 * This produces a reasonable initial assignment that the SA solver can
 * refine, dramatically reducing the number of SA iterations needed.
 */

import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * A group of constraints that share variables and can be solved together.
 *
 * Dependencies track which other groups must be solved before this one
 * (i.e., groups whose variables overlap with this group's constraints).
 */
export interface ConstraintGroup {
  /** Unique identifier for this group */
  id: number;
  /** Constraints belonging to this group */
  constraints: any[];
  /** Variable names referenced by constraints in this group */
  variables: Set<string>;
  /** IDs of groups whose variables overlap with this group (must be solved first) */
  dependencies: Set<number>;
  /** Whether this group has been solved */
  solved: boolean;
}

/**
 * A simple constraint wrapper that tracks which variables a constraint references.
 * This is used internally by ConstraintPartition for grouping logic.
 */
export interface VariableConstraint {
  /** Unique constraint identifier */
  id: string;
  /** The original constraint object */
  constraint: any;
  /** Set of variable names this constraint references */
  variables: Set<string>;
}

// ============================================================================
// ConstraintPartition
// ============================================================================

/**
 * Partitions constraints into groups based on which variables they reference.
 *
 * Two constraints belong to the same group if they share at least one variable.
 * This is essentially a union-find / connected-components problem over the
 * variable-constraint bipartite graph.
 *
 * Algorithm:
 *  1. For each constraint, collect its referenced variables.
 *  2. Build a variable-to-constraint-index mapping.
 *  3. Use union-find to merge constraints that share variables.
 *  4. Extract connected components as groups.
 *  5. Compute inter-group dependencies from variable overlap.
 */
export class ConstraintPartition {
  /**
   * Partition a set of constraints into groups based on variable overlap.
   *
   * @param constraints - Array of constraint objects. Each must have a
   *   `getVariables()` method or a `variables` property returning variable names.
   * @param variables - Map of variable name → variable info (used for reference)
   * @returns Array of ConstraintGroups, each containing constraints that share variables
   */
  partition(constraints: any[], variables: Map<string, any>): ConstraintGroup[] {
    if (constraints.length === 0) return [];

    // Step 1: Extract variable references for each constraint
    const varConstraints: VariableConstraint[] = constraints.map((c, idx) => {
      const vars = this.extractVariables(c);
      return { id: `c_${idx}`, constraint: c, variables: vars };
    });

    // Step 2: Union-Find to group constraints sharing variables
    const parent: number[] = varConstraints.map((_, i) => i);

    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]; // path compression
        x = parent[x];
      }
      return x;
    };

    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // Build variable → constraint indices mapping
    const varToConstraints = new Map<string, number[]>();
    for (let i = 0; i < varConstraints.length; i++) {
      for (const v of varConstraints[i].variables) {
        if (!varToConstraints.has(v)) {
          varToConstraints.set(v, []);
        }
        varToConstraints.get(v)!.push(i);
      }
    }

    // Union constraints that share any variable
    for (const [, indices] of varToConstraints) {
      for (let i = 1; i < indices.length; i++) {
        union(indices[0], indices[i]);
      }
    }

    // Step 3: Collect connected components
    const componentMap = new Map<number, number[]>();
    for (let i = 0; i < varConstraints.length; i++) {
      const root = find(i);
      if (!componentMap.has(root)) {
        componentMap.set(root, []);
      }
      componentMap.get(root)!.push(i);
    }

    // Step 4: Build ConstraintGroup objects
    const groups: ConstraintGroup[] = [];
    let groupId = 0;

    for (const [, indices] of componentMap) {
      const groupConstraints: any[] = [];
      const groupVars = new Set<string>();

      for (const idx of indices) {
        groupConstraints.push(varConstraints[idx].constraint);
        for (const v of varConstraints[idx].variables) {
          groupVars.add(v);
        }
      }

      groups.push({
        id: groupId++,
        constraints: groupConstraints,
        variables: groupVars,
        dependencies: new Set(),
        solved: false,
      });
    }

    // Step 5: Compute inter-group dependencies
    // Group A depends on Group B if they share variables and B has fewer constraints
    // (smaller groups should be solved first as they constrain the larger ones)
    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups.length; j++) {
        if (i === j) continue;
        // Check for variable overlap
        for (const v of groups[i].variables) {
          if (groups[j].variables.has(v)) {
            // i depends on j if j is smaller (solved first)
            if (groups[j].constraints.length <= groups[i].constraints.length) {
              groups[i].dependencies.add(groups[j].id);
            }
            break;
          }
        }
      }
    }

    return groups;
  }

  /**
   * Extract variable names from a constraint object.
   * Handles multiple constraint representations used in the codebase.
   */
  private extractVariables(constraint: any): Set<string> {
    const vars = new Set<string>();

    // Method 1: getVariables() method (Relation class)
    if (typeof constraint.getVariables === 'function') {
      const varSet = constraint.getVariables();
      if (varSet instanceof Set) {
        for (const v of varSet) {
          vars.add(typeof v === 'string' ? v : v.name ?? String(v));
        }
      }
    }

    // Method 2: variables property (array or set of strings)
    if (!vars.size && constraint.variables) {
      const vList = Array.isArray(constraint.variables)
        ? constraint.variables
        : constraint.variables instanceof Set
          ? Array.from(constraint.variables)
          : [];
      for (const v of vList) {
        vars.add(typeof v === 'string' ? v : v.name ?? String(v));
      }
    }

    // Method 3: variableId property
    if (!vars.size && constraint.variableId) {
      vars.add(constraint.variableId);
    }

    // Method 4: objectId property
    if (constraint.objectId) {
      vars.add(constraint.objectId);
    }

    // Method 5: names property (from Move classes)
    if (constraint.names) {
      for (const n of constraint.names) {
        vars.add(n);
      }
    }

    return vars;
  }
}

// ============================================================================
// ActiveForStage
// ============================================================================

/**
 * Manages which objects/variables are active during each greedy solve stage.
 *
 * In Infinigen's greedy solver, constraints are solved in stages.
 * At each stage, only a subset of objects are "active" — meaning they
 * can be modified. Inactive objects retain their current values but
 * are not re-optimized.
 *
 * This staged approach ensures that foundational objects (e.g., walls, floors)
 * are placed first, and then dependent objects (e.g., furniture on floors)
 * are placed in later stages.
 */
export class ActiveForStage {
  /** Map of stage number → set of active object/variable names */
  private stageMap: Map<number, Set<string>> = new Map();

  /** Total number of stages */
  private numStages: number = 0;

  /**
   * Compute the number of stages from a constraint partition.
   *
   * The number of stages equals the length of the longest dependency
   * chain in the partition DAG (i.e., the critical path length).
   *
   * @param partition - The partitioned constraint groups
   * @returns Number of stages
   */
  getStages(partition: ConstraintGroup[]): number {
    if (partition.length === 0) return 1;

    // Topological sort to compute longest path
    const inDegree = new Map<number, number>();
    const longestPath = new Map<number, number>();

    for (const g of partition) {
      inDegree.set(g.id, 0);
      longestPath.set(g.id, 1);
    }

    for (const g of partition) {
      for (const depId of g.dependencies) {
        inDegree.set(depId, (inDegree.get(depId) ?? 0) + 1);
      }
    }

    // Kahn's algorithm with longest path tracking
    const queue: number[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentGroup = partition.find(g => g.id === current);
      if (!currentGroup) continue;

      // For each group that depends on current
      for (const g of partition) {
        if (g.dependencies.has(current)) {
          longestPath.set(g.id, Math.max(
            longestPath.get(g.id) ?? 1,
            (longestPath.get(current) ?? 1) + 1
          ));
          const newDeg = (inDegree.get(g.id) ?? 1) - 1;
          inDegree.set(g.id, newDeg);
          if (newDeg === 0) queue.push(g.id);
        }
      }
    }

    this.numStages = Math.max(1, ...Array.from(longestPath.values()));

    // Build the stage map: assign each group to its longest-path level
    for (const g of partition) {
      const stage = (longestPath.get(g.id) ?? 1) - 1; // 0-indexed
      if (!this.stageMap.has(stage)) {
        this.stageMap.set(stage, new Set());
      }
      for (const v of g.variables) {
        this.stageMap.get(stage)!.add(v);
      }
    }

    return this.numStages;
  }

  /**
   * Deactivate objects that are not in the current stage.
   * Objects not active in this stage retain their values but cannot be modified.
   *
   * @param stage - The current stage number (0-indexed)
   * @param objects - Map of object/variable name → current value
   * @returns Map with only the active objects for this stage
   */
  deactivate(stage: number, objects: Map<string, any>): Map<string, any> {
    const activeVars = this.stageMap.get(stage);
    if (!activeVars) return new Map(objects); // If no stage info, keep all

    const result = new Map<string, any>();
    for (const [key, value] of objects) {
      if (activeVars.has(key)) {
        result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Reactivate objects for the current stage.
   * Merges the stage-specific active objects back into the full set.
   *
   * @param stage - The current stage number
   * @param objects - Full map of all objects
   * @returns Map with only objects active at this stage
   */
  activate(stage: number, objects: Map<string, any>): Map<string, any> {
    return this.deactivate(stage, objects);
  }

  /**
   * Get all variable names active at a given stage.
   */
  getActiveVariables(stage: number): Set<string> {
    return this.stageMap.get(stage) ?? new Set();
  }
}

// ============================================================================
// GreedyPreSolver
// ============================================================================

/**
 * Greedy pre-solver that produces an initial variable assignment before SA.
 *
 * Algorithm:
 *  1. Partition constraints into groups by variable overlap
 *  2. Topologically sort groups by their dependencies
 *  3. For each group in order:
 *     a. For each variable in the group:
 *        - Try each value in the variable's domain
 *        - Evaluate constraint violations for this group
 *        - Pick the value with fewest violations
 *     b. Mark group as solved
 *  4. Return the partial assignment
 *
 * The resulting assignment is not guaranteed to be optimal but provides
 * a much better starting point than random initialization for the SA solver.
 */
export class GreedyPreSolver {
  private partitioner: ConstraintPartition;
  private activeForStage: ActiveForStage;
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.partitioner = new ConstraintPartition();
    this.activeForStage = new ActiveForStage();
    this.rng = new SeededRandom(seed);
  }

  /**
   * Perform greedy pre-solve.
   *
   * @param constraintSystem - The constraint system containing constraints to satisfy
   * @param variables - Map of variable name → current value (initial state)
   * @param domains - Map of variable name → domain (set of possible values or range info)
   * @returns Map of variable name → assigned value (partial assignment)
   */
  solve(
    constraintSystem: any,
    variables: Map<string, any>,
    domains: Map<string, any>
  ): Map<string, any> {
    // Step 1: Extract constraints from the system
    const constraints = this.extractConstraints(constraintSystem);

    if (constraints.length === 0) {
      // No constraints — just sample from domains
      return this.sampleAll(variables, domains);
    }

    // Step 2: Partition constraints into groups
    const groups = this.partitioner.partition(constraints, variables);

    if (groups.length === 0) {
      return this.sampleAll(variables, domains);
    }

    // Step 3: Topologically sort groups
    const sortedGroups = this.topologicalSort(groups);

    // Step 4: Compute stages
    this.activeForStage.getStages(groups);

    // Step 5: Initialize assignment from current values
    const assignment = new Map<string, any>(variables);

    // Step 6: Greedily solve each group
    for (const group of sortedGroups) {
      this.solveGroup(group, assignment, domains);
      group.solved = true;
    }

    return assignment;
  }

  /**
   * Solve a single constraint group greedily.
   *
   * For each variable in the group, tries each domain value and picks
   * the one that minimizes violations within the group.
   */
  private solveGroup(
    group: ConstraintGroup,
    assignment: Map<string, any>,
    domains: Map<string, any>
  ): void {
    // Get ordered list of variables in this group
    const varList = Array.from(group.variables);

    // Shuffle to avoid systematic bias (but seeded for reproducibility)
    this.rng.shuffle(varList);

    for (const varName of varList) {
      const domain = domains.get(varName);
      if (!domain) continue;

      // Get candidate values from the domain
      const candidates = this.getDomainValues(domain);
      if (candidates.length === 0) continue;

      let bestValue = assignment.get(varName) ?? candidates[0];
      let bestViolations = Infinity;

      for (const value of candidates) {
        // Temporarily assign this value
        assignment.set(varName, value);

        // Evaluate violations for constraints in this group
        const violations = this.evaluateGroupViolations(group, assignment);

        if (violations < bestViolations) {
          bestViolations = violations;
          bestValue = value;
        }

        // Early exit if no violations
        if (violations === 0) break;
      }

      // Set the best value
      assignment.set(varName, bestValue);
    }
  }

  /**
   * Filter constraints to only those relevant to the current group.
   *
   * A constraint is relevant to a group if it references at least one
   * variable in the group. Since groups are built by variable overlap,
   * all constraints in a group are already relevant — but this method
   * also checks against the current assignment for constraints that
   * become trivially satisfied.
   */
  filterConstraints(group: ConstraintGroup, assignment: Map<string, any>): any[] {
    return group.constraints.filter(c => {
      // Check if all variables required by the constraint are assigned
      const vars = this.partitioner['extractVariables'](c);
      for (const v of vars) {
        if (!assignment.has(v)) return false;
      }
      return true;
    });
  }

  /**
   * Count constraint violations within a group for the current assignment.
   *
   * Uses the constraint's evaluate/isSatisfied method if available,
   * otherwise falls back to a generic violation counting heuristic.
   *
   * @param group - The constraint group to evaluate
   * @param assignment - Current variable assignment
   * @returns Number of violated constraints in the group
   */
  evaluateGroupViolations(group: ConstraintGroup, assignment: Map<string, any>): number {
    let violations = 0;

    for (const constraint of group.constraints) {
      const satisfied = this.evaluateConstraint(constraint, assignment);
      if (!satisfied) {
        violations++;
      }
    }

    return violations;
  }

  /**
   * Evaluate a single constraint against the current assignment.
   *
   * Supports multiple constraint representations:
   * - Objects with evaluate()/isSatisfied() methods (Relation classes)
   * - Objects with a weight and check function
   * - Plain constraint descriptors with operator/operands
   */
  private evaluateConstraint(constraint: any, assignment: Map<string, any>): boolean {
    // Method 1: isSatisfied method (Relation class)
    if (typeof constraint.isSatisfied === 'function') {
      try {
        return constraint.isSatisfied(assignment);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.debug('[GreedyPreSolver] isSatisfied fallback:', err);
        return false;
      }
    }

    // Method 2: evaluate method returning boolean
    if (typeof constraint.evaluate === 'function') {
      try {
        const result = constraint.evaluate(assignment);
        return !!result;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.debug('[GreedyPreSolver] evaluate fallback:', err);
        return false;
      }
    }

    // Method 3: check method
    if (typeof constraint.check === 'function') {
      try {
        return constraint.check(assignment);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.debug('[GreedyPreSolver] check fallback:', err);
        return false;
      }
    }

    // Method 4: Simple comparison constraint { left, operator, right }
    if (constraint.operator && constraint.left !== undefined && constraint.right !== undefined) {
      const leftVal = this.resolveValue(constraint.left, assignment);
      const rightVal = this.resolveValue(constraint.right, assignment);

      switch (constraint.operator) {
        case 'eq': case '==':  return leftVal === rightVal;
        case 'neq': case '!=': return leftVal !== rightVal;
        case 'lt': case '<':   return leftVal < rightVal;
        case 'lte': case '<=': return leftVal <= rightVal;
        case 'gt': case '>':   return leftVal > rightVal;
        case 'gte': case '>=': return leftVal >= rightVal;
        default: return true;
      }
    }

    // Method 5: Weighted constraint with satisfied flag
    if (constraint.satisfied !== undefined) {
      return !!constraint.satisfied;
    }

    // Default: assume satisfied (no violation)
    return true;
  }

  /**
   * Resolve a value that might be a variable reference or a literal.
   */
  private resolveValue(value: any, assignment: Map<string, any>): any {
    if (typeof value === 'string' && assignment.has(value)) {
      return assignment.get(value);
    }
    return value;
  }

  /**
   * Get candidate values from a domain specification.
   *
   * Domains can be:
   * - An array of discrete values
   * - A Set of values
   * - An object with { min, max, step } for continuous domains
   * - An object with sample() method
   * - An object with allowedValues array
   */
  private getDomainValues(domain: any): any[] {
    // Array of values
    if (Array.isArray(domain)) {
      return domain;
    }

    // Set of values
    if (domain instanceof Set) {
      return Array.from(domain);
    }

    // Object with sample() method (Domain class)
    if (typeof domain.sample === 'function') {
      const samples: any[] = [];
      for (let seed = 0; seed < 20; seed++) {
        samples.push(domain.sample(seed));
      }
      return samples;
    }

    // Object with allowedValues
    if (domain.allowedValues) {
      return domain.allowedValues;
    }

    // Object with discrete set
    if (domain.discrete instanceof Set) {
      return Array.from(domain.discrete);
    }

    // Continuous range: { min, max, step } or { min, max }
    if (domain.min !== undefined && domain.max !== undefined) {
      const step = domain.step ?? this.computeDefaultStep(domain.min, domain.max);
      const values: any[] = [];
      const maxSamples = 20;
      let count = 0;
      for (let v = domain.min; v <= domain.max && count < maxSamples; v += step) {
        values.push(v);
        count++;
      }
      if (values.length === 0) {
        values.push((domain.min + domain.max) / 2);
      }
      return values;
    }

    // NumericDomain with lower/upper bounds
    if (domain.lower !== undefined && domain.upper !== undefined) {
      const step = this.computeDefaultStep(domain.lower, domain.upper);
      const values: any[] = [];
      const maxSamples = 20;
      let count = 0;
      for (let v = domain.lower; v <= domain.upper && count < maxSamples; v += step) {
        values.push(v);
        count++;
      }
      if (values.length === 0) {
        values.push((domain.lower + domain.upper) / 2);
      }
      return values;
    }

    // Pose domain — sample positions
    if (domain.positionDomain || domain.rotationDomain) {
      return [domain.sample?.(0) ?? { position: [0, 0, 0], rotation: [0, 0, 0] }];
    }

    return [];
  }

  /**
   * Compute a reasonable step size for sampling a continuous domain.
   */
  private computeDefaultStep(min: number, max: number): number {
    const range = max - min;
    if (!isFinite(range) || range <= 0) return 1;
    // Aim for ~20 samples across the range
    return range / 20;
  }

  /**
   * Topologically sort constraint groups by their dependencies.
   *
   * Uses Kahn's algorithm. Groups with no dependencies come first.
   * Among groups with the same depth, smaller groups are prioritized.
   */
  private topologicalSort(groups: ConstraintGroup[]): ConstraintGroup[] {
    if (groups.length === 0) return [];
    if (groups.length === 1) return groups;

    // Build adjacency list: group id → set of group ids that depend on it
    const dependents = new Map<number, Set<number>>();
    const inDegree = new Map<number, number>();

    for (const g of groups) {
      dependents.set(g.id, new Set());
      inDegree.set(g.id, g.dependencies.size);
    }

    for (const g of groups) {
      for (const depId of g.dependencies) {
        dependents.get(depId)?.add(g.id);
      }
    }

    // Start with groups that have no dependencies
    const queue: number[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    // Sort queue by group size (smaller first for better constraint propagation)
    queue.sort((a, b) => {
      const ga = groups.find(g => g.id === a)!;
      const gb = groups.find(g => g.id === b)!;
      return ga.constraints.length - gb.constraints.length;
    });

    const sorted: ConstraintGroup[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentGroup = groups.find(g => g.id === currentId)!;
      sorted.push(currentGroup);

      const deps = dependents.get(currentId) ?? new Set();
      const newReady: number[] = [];

      for (const depId of deps) {
        const newDeg = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) {
          newReady.push(depId);
        }
      }

      // Sort newly ready groups by size
      newReady.sort((a, b) => {
        const ga = groups.find(g => g.id === a)!;
        const gb = groups.find(g => g.id === b)!;
        return ga.constraints.length - gb.constraints.length;
      });

      queue.push(...newReady);
    }

    // If not all groups were sorted (cycle detected), add remaining groups
    if (sorted.length < groups.length) {
      const sortedIds = new Set(sorted.map(g => g.id));
      for (const g of groups) {
        if (!sortedIds.has(g.id)) {
          sorted.push(g);
        }
      }
    }

    return sorted;
  }

  /**
   * Extract constraints from a constraint system.
   *
   * The constraint system can be:
   * - An array of constraints
   * - A Problem object with a constraints property
   * - An object with a constraints() method
   */
  private extractConstraints(system: any): any[] {
    if (Array.isArray(system)) {
      return system;
    }

    if (system && typeof system.constraints === 'function') {
      return system.constraints();
    }

    if (system && Array.isArray(system.constraints)) {
      return system.constraints;
    }

    // If the system itself looks like a single constraint
    if (system && (typeof system.evaluate === 'function' || typeof system.isSatisfied === 'function')) {
      return [system];
    }

    return [];
  }

  /**
   * Sample initial values for all variables from their domains.
   * Used as a fallback when there are no constraints.
   */
  private sampleAll(variables: Map<string, any>, domains: Map<string, any>): Map<string, any> {
    const assignment = new Map<string, any>();

    for (const [name, currentValue] of variables) {
      const domain = domains.get(name);
      if (domain) {
        const values = this.getDomainValues(domain);
        assignment.set(name, values.length > 0 ? values[0] : currentValue);
      } else {
        assignment.set(name, currentValue);
      }
    }

    // Also sample any variables that appear in domains but not in variables
    for (const [name, domain] of domains) {
      if (!assignment.has(name)) {
        const values = this.getDomainValues(domain);
        if (values.length > 0) {
          assignment.set(name, values[0]);
        }
      }
    }

    return assignment;
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Convenience function that creates a GreedyPreSolver and runs it.
 *
 * @param constraintSystem - The constraint system to solve
 * @param variables - Map of variable name → current value
 * @param domains - Map of variable name → domain specification
 * @param seed - Random seed for reproducibility (default 42)
 * @returns Map of variable name → assigned value
 */
export function greedyPreSolve(
  constraintSystem: any,
  variables: Map<string, any>,
  domains: Map<string, any>,
  seed: number = 42
): Map<string, any> {
  const solver = new GreedyPreSolver(seed);
  return solver.solve(constraintSystem, variables, domains);
}
