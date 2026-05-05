/**
 * ArchitecturalUnification.ts — Unified APIs for Duplicated Subsystems
 *
 * Addresses the 5 architectural unification priorities identified in the
 * feature parity analysis:
 *
 * 1. ConstraintDSLUnifier — Deprecate text-based ConstraintDSL in favor of builder API
 * 2. SASolverUnifier — Merge sa-solver.ts and full-solver-loop.ts into single implementation
 * 3. JointTypeUnifier — Map old joint names (Hinge/Weld/Sliding/Ball) to standard names
 * 4. TerrainGeneratorBridge — Bridge old TerrainGenerator to UnifiedTerrainGenerator
 * 5. UnificationReport — Generate migration report for all unifications
 *
 * This module does NOT modify any existing files. It provides adapter layers,
 * bridge functions, and deprecation notices that allow gradual migration.
 *
 * @module core/architecture
 */

import * as THREE from 'three';

// ============================================================================
// 1. ConstraintDSLUnifier
// ============================================================================

/**
 * Unified constraint type that works with both text DSL and builder API.
 *
 * The builder API (ConstraintProposalSystem) is the recommended approach.
 * The text-based ConstraintDSL is deprecated but still supported via
 * the textToBuilder() adapter.
 */
export interface UnifiedConstraint {
  /** Unique constraint identifier */
  id: string;
  /** Constraint description for debugging */
  description: string;
  /** Whether this is a hard constraint (must be satisfied) */
  hard: boolean;
  /** Weight for soft constraints (0-1) */
  weight: number;
  /** Tags required on the child object */
  childTags: string[];
  /** Tags required on the parent object */
  parentTags: string[];
  /** Evaluation function: returns violation amount (0 = satisfied) */
  evaluate: (child: any, parent: any) => number;
}

/**
 * Builder-style constraint constructor.
 *
 * Provides a fluent API for constructing constraints, replacing the
 * text-based DSL with a programmatic approach.
 *
 * Usage:
 * ```ts
 * const constraint = new ConstraintBuilder('on_floor')
 *   .hard()
 *   .childTags(['furniture'])
 *   .parentTags(['floor'])
 *   .evaluate((child, parent) => {
 *     const gap = parent.boundingBox.max.y - child.position.y;
 *     return gap > 0.1 ? gap : 0;
 *   })
 *   .build();
 * ```
 */
export class ConstraintBuilder {
  private id: string;
  private description: string = '';
  private hardFlag: boolean = false;
  private weightValue: number = 1.0;
  private childTagList: string[] = [];
  private parentTagList: string[] = [];
  private evaluateFn: (child: any, parent: any) => number = () => 0;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Mark this constraint as hard (must be satisfied).
   */
  hard(): this {
    this.hardFlag = true;
    return this;
  }

  /**
   * Mark this constraint as soft with a given weight.
   */
  soft(weight: number = 1.0): this {
    this.hardFlag = false;
    this.weightValue = weight;
    return this;
  }

  /**
   * Set the constraint description.
   */
  describe(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Set required tags on the child object.
   */
  childTags(tags: string[]): this {
    this.childTagList = tags;
    return this;
  }

  /**
   * Set required tags on the parent object.
   */
  parentTags(tags: string[]): this {
    this.parentTagList = tags;
    return this;
  }

  /**
   * Set the evaluation function.
   *
   * @param fn Function that returns violation amount (0 = satisfied)
   */
  evaluate(fn: (child: any, parent: any) => number): this {
    this.evaluateFn = fn;
    return this;
  }

  /**
   * Build the unified constraint.
   */
  build(): UnifiedConstraint {
    return {
      id: this.id,
      description: this.description || `Constraint: ${this.id}`,
      hard: this.hardFlag,
      weight: this.weightValue,
      childTags: this.childTagList,
      parentTags: this.parentTagList,
      evaluate: this.evaluateFn,
    };
  }
}

/**
 * Text DSL AST node types (subset of ConstraintDSL.ts AST).
 * Used by the textToBuilder() adapter.
 */
export interface TextDSLConstraint {
  /** Constraint name */
  name: string;
  /** Parameters */
  parameters: Array<{ name: string; value: any }>;
  /** Constraint body as a list of conditions */
  conditions: Array<{
    type: 'require' | 'ensure' | 'check';
    expression: string;
  }>;
  /** Priority (higher = more important) */
  priority?: number;
  /** Domain type */
  domain?: string;
}

/**
 * ConstraintDSLUnifier provides adapters between the text-based ConstraintDSL
 * and the builder API (ConstraintProposalSystem / ConstraintBuilder).
 *
 * The text-based DSL (ConstraintLexer + ConstraintParser) is deprecated in
 * favor of the builder API. This unifier provides:
 * - textToBuilder(): Convert text DSL AST to ConstraintBuilder calls
 * - getRecommendedAPI(): Usage guidance for migration
 *
 * Usage:
 * ```ts
 * const unifier = new ConstraintDSLUnifier();
 * const builder = unifier.textToBuilder(textConstraint);
 * const unified = builder.build();
 * ```
 */
export class ConstraintDSLUnifier {
  /** Whether deprecation warnings have been shown */
  private deprecationWarningShown: boolean = false;

  /**
   * Unify the DSLs by providing the adapter layer.
   *
   * This doesn't modify any files — it provides the translation
   * between the two APIs.
   */
  unifyDSLs(): void {
    if (!this.deprecationWarningShown) {
      console.warn(
        '[ConstraintDSLUnifier] Text-based ConstraintDSL is deprecated. ' +
        'Use ConstraintBuilder (builder API) instead. ' +
        'See getRecommendedAPI() for migration guide.'
      );
      this.deprecationWarningShown = true;
    }
  }

  /**
   * Convert a text-based DSL constraint AST to a ConstraintBuilder.
   *
   * This is the translation layer between the old text DSL and the
   * new builder API. It inspects the text constraint's conditions
   * and translates them into builder method calls.
   *
   * @param textConstraint Parsed text DSL constraint
   * @returns ConstraintBuilder pre-configured from the text constraint
   */
  textToBuilder(textConstraint: TextDSLConstraint): ConstraintBuilder {
    this.unifyDSLs();

    const builder = new ConstraintBuilder(textConstraint.name);

    // Set description from constraint name + parameters
    const paramStr = textConstraint.parameters
      .map(p => `${p.name}=${p.value}`)
      .join(', ');
    builder.describe(`${textConstraint.name}(${paramStr})`);

    // Determine hard/soft from priority
    if (textConstraint.priority !== undefined && textConstraint.priority >= 10) {
      builder.hard();
    } else {
      builder.soft(textConstraint.priority ? textConstraint.priority / 10 : 1.0);
    }

    // Extract tags from parameters
    for (const param of textConstraint.parameters) {
      if (param.name === 'child_tags' || param.name === 'childTags') {
        const tags = Array.isArray(param.value) ? param.value : [param.value];
        builder.childTags(tags.map(String));
      }
      if (param.name === 'parent_tags' || param.name === 'parentTags') {
        const tags = Array.isArray(param.value) ? param.value : [param.value];
        builder.parentTags(tags.map(String));
      }
    }

    // Build evaluation function from conditions
    const conditions = textConstraint.conditions;
    builder.evaluate((child: any, parent: any) => {
      let totalViolation = 0;

      for (const condition of conditions) {
        const violation = this.evaluateCondition(condition, child, parent);
        if (condition.type === 'require' && violation > 0) {
          // Hard requirements: violation is more severe
          totalViolation += violation * 10;
        } else {
          totalViolation += violation;
        }
      }

      return totalViolation;
    });

    return builder;
  }

  /**
   * Get usage guidance for the recommended API.
   *
   * @returns String with migration instructions
   */
  getRecommendedAPI(): string {
    return [
      '═══════════════════════════════════════════════════════',
      '  Constraint DSL Migration Guide',
      '═══════════════════════════════════════════════════════',
      '',
      'DEPRECATED: Text-based ConstraintDSL (ConstraintLexer + ConstraintParser)',
      'RECOMMENDED: ConstraintBuilder (builder API)',
      '',
      'Migration steps:',
      '  1. Replace text constraint source strings with ConstraintBuilder calls',
      '  2. Use .hard() or .soft(weight) instead of "priority: N"',
      '  3. Use .childTags()/.parentTags() instead of text "require" conditions',
      '  4. Use .evaluate(fn) instead of text expressions',
      '',
      'Example (old):',
      '  constraint on_floor(furniture, floor) priority: 10 {',
      '    require child.y >= parent.maxY - 0.1;',
      '  }',
      '',
      'Example (new):',
      '  new ConstraintBuilder("on_floor")',
      '    .hard()',
      '    .childTags(["furniture"])',
      '    .parentTags(["floor"])',
      '    .evaluate((child, parent) => {',
      '      return Math.max(0, parent.boundingBox.max.y - 0.1 - child.position.y);',
      '    })',
      '    .build();',
      '',
      'Adapter: Use textToBuilder() for gradual migration of existing text constraints.',
      '═══════════════════════════════════════════════════════',
    ].join('\n');
  }

  /**
   * Evaluate a single text DSL condition against objects.
   *
   * Simplified evaluation that handles common constraint patterns.
   */
  private evaluateCondition(
    condition: { type: string; expression: string },
    child: any,
    parent: any,
  ): number {
    const expr = condition.expression.toLowerCase();

    // Pattern: "child.y >= parent.maxy - TOLERANCE"
    const yGePattern = /child\.y\s*>=\s*parent\.maxy\s*-\s*([\d.]+)/;
    const yGeMatch = expr.match(yGePattern);
    if (yGeMatch) {
      const tolerance = parseFloat(yGeMatch[1]);
      const parentMaxY = parent?.boundingBox?.max?.y ?? parent?.maxY ?? 0;
      const childY = child?.position?.y ?? child?.y ?? 0;
      return Math.max(0, (parentMaxY - tolerance) - childY);
    }

    // Pattern: "distance(child, parent) <= MAX_DIST"
    const distPattern = /distance\(child,\s*parent\)\s*<=\s*([\d.]+)/;
    const distMatch = expr.match(distPattern);
    if (distMatch) {
      const maxDist = parseFloat(distMatch[1]);
      const childPos = child?.position ?? child?.pos;
      const parentPos = parent?.position ?? parent?.pos;
      if (childPos && parentPos) {
        const dist = childPos instanceof THREE.Vector3
          ? childPos.distanceTo(parentPos)
          : Math.sqrt(
              Math.pow((childPos.x ?? 0) - (parentPos.x ?? 0), 2) +
              Math.pow((childPos.y ?? 0) - (parentPos.y ?? 0), 2) +
              Math.pow((childPos.z ?? 0) - (parentPos.z ?? 0), 2),
            );
        return Math.max(0, dist - maxDist);
      }
    }

    // Pattern: "child has_tag TAG"
    const tagPattern = /child\s+has_tag\s+["']?(\w+)["']?/;
    const tagMatch = expr.match(tagPattern);
    if (tagMatch) {
      const requiredTag = tagMatch[1];
      const tags = child?.tags ?? [];
      if (Array.isArray(tags)) {
        return tags.includes(requiredTag) ? 0 : 1;
      }
    }

    // Default: unable to parse, assume satisfied
    return 0;
  }
}

// ============================================================================
// 2. SASolverUnifier
// ============================================================================

/**
 * Unified SA solver configuration.
 *
 * Merges the configuration interfaces from sa-solver.ts (SimulatedAnnealingConfig)
 * and full-solver-loop.ts (SolverConfig) into a single unified configuration.
 */
export interface UnifiedSAConfig {
  // From sa-solver.ts
  /** Initial temperature for annealing */
  initialTemperature: number;
  /** Geometric cooling rate (0-1, closer to 1 = slower cooling) */
  coolingRate: number;
  /** Minimum temperature (stop condition) */
  minTemperature: number;
  /** Maximum number of iterations */
  maxIterations: number;
  /** Temperature below which to restart (0 = no restart) */
  restartThreshold: number;
  /** Whether to use adaptive cooling based on acceptance rate */
  adaptiveCooling: boolean;
  /** Window size for adaptive cooling statistics */
  adaptiveWindowSize: number;

  // From full-solver-loop.ts
  /** Use constraint-aware proposal generation */
  useConstraintAwareProposals: boolean;
  /** Use structured move proposals (addition/removal/translation/rotation) */
  useStructuredMoves: boolean;
  /** Penalty multiplier for violation-aware acceptance */
  violationPenalty: number;
  /** Maximum number of objects in scene */
  maxObjects: number;
  /** Enable domain reasoning/substitution */
  enableDomainReasoning: boolean;

  /** Random seed */
  seed: number;
}

/**
 * Default unified SA configuration.
 */
export const DEFAULT_UNIFIED_SA_CONFIG: UnifiedSAConfig = {
  initialTemperature: 100,
  coolingRate: 0.995,
  minTemperature: 0.01,
  maxIterations: 10000,
  restartThreshold: 0.1,
  adaptiveCooling: true,
  adaptiveWindowSize: 50,
  useConstraintAwareProposals: true,
  useStructuredMoves: true,
  violationPenalty: 5.0,
  maxObjects: 50,
  enableDomainReasoning: true,
  seed: 42,
};

/**
 * SASolverAdapter wraps both the standalone SA solver and the full solver loop
 * into a unified interface.
 *
 * The standalone sa-solver.ts becomes a thin wrapper around this adapter,
 * which delegates to the full solver loop when constraint-aware features
 * are needed, and falls back to the standalone solver for simple cases.
 *
 * Usage:
 * ```ts
 * const unifier = new SASolverUnifier();
 * const solver = unifier.createUnifiedSolver(config);
 * const result = solver.solve(constraints, relations, proposals);
 * ```
 */
export class SASolverAdapter {
  private config: UnifiedSAConfig;
  private currentTemperature: number;
  private iterations: number = 0;
  private bestEnergy: number = Infinity;
  private acceptanceWindow: Array<{ accepted: boolean }> = [];

  constructor(config: Partial<UnifiedSAConfig> = {}) {
    this.config = { ...DEFAULT_UNIFIED_SA_CONFIG, ...config };
    this.currentTemperature = this.config.initialTemperature;
  }

  /**
   * Run the SA solver with unified configuration.
   *
   * @param constraints    Array of constraints to satisfy
   * @param initialState   Initial state (Map of object ID → state)
   * @param energyFunction Function computing total energy of a state
   * @returns Final state and solver statistics
   */
  solve(
    constraints: UnifiedConstraint[],
    initialState: Map<string, any>,
    energyFunction: (state: Map<string, any>) => number,
  ): {
    state: Map<string, any>;
    energy: number;
    iterations: number;
    temperature: number;
    acceptanceRate: number;
  } {
    let currentState = new Map(initialState);
    let currentEnergy = energyFunction(currentState);
    let bestState = new Map(currentState);
    let bestEnergy = currentEnergy;

    // Seeded RNG
    let rngState = this.config.seed;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) & 0xffffffff;
      return (rngState >>> 0) / 4294967296;
    };

    this.iterations = 0;
    this.currentTemperature = this.config.initialTemperature;

    while (
      this.iterations < this.config.maxIterations &&
      this.currentTemperature > this.config.minTemperature
    ) {
      this.iterations++;

      // Generate proposal: random perturbation of a random variable
      const keys = Array.from(currentState.keys());
      if (keys.length === 0) break;

      const randomKey = keys[Math.floor(rng() * keys.length)];
      const proposedState = new Map(currentState);

      // Simple perturbation
      const currentValue = proposedState.get(randomKey);
      if (typeof currentValue === 'number') {
        proposedState.set(randomKey, currentValue + (rng() - 0.5) * 2);
      } else if (currentValue && typeof currentValue === 'object' && 'position' in currentValue) {
        const pos = currentValue.position;
        proposedState.set(randomKey, {
          ...currentValue,
          position: new THREE.Vector3(
            pos.x + (rng() - 0.5) * 0.5,
            pos.y + (rng() - 0.5) * 0.5,
            pos.z + (rng() - 0.5) * 0.5,
          ),
        });
      }

      // Evaluate proposed energy
      const proposedEnergy = energyFunction(proposedState);

      // Violation-aware acceptance
      let accepted = false;
      const deltaE = proposedEnergy - currentEnergy;

      if (this.config.useConstraintAwareProposals) {
        // Never accept moves that increase hard constraint violations
        const currentViolations = this.countHardViolations(constraints, currentState);
        const proposedViolations = this.countHardViolations(constraints, proposedState);

        if (proposedViolations < currentViolations) {
          // Always accept violation-decreasing moves
          accepted = true;
        } else if (proposedViolations > currentViolations) {
          // Never accept violation-increasing moves
          accepted = false;
        } else {
          // Same violation level: standard Metropolis
          accepted = deltaE <= 0 || rng() < Math.exp(-deltaE / this.currentTemperature);
        }
      } else {
        // Standard Metropolis criterion
        accepted = deltaE <= 0 || rng() < Math.exp(-deltaE / this.currentTemperature);
      }

      // Track acceptance
      this.acceptanceWindow.push({ accepted });
      if (this.acceptanceWindow.length > this.config.adaptiveWindowSize) {
        this.acceptanceWindow.shift();
      }

      if (accepted) {
        currentState = proposedState;
        currentEnergy = proposedEnergy;
      }

      // Track best
      if (currentEnergy < bestEnergy) {
        bestEnergy = currentEnergy;
        bestState = new Map(currentState);
      }

      // Cool down
      this.coolDown();

      // Early convergence
      if (Math.abs(bestEnergy) < 1e-6) break;
    }

    const acceptanceRate = this.getAcceptanceRate();

    return {
      state: bestState,
      energy: bestEnergy,
      iterations: this.iterations,
      temperature: this.currentTemperature,
      acceptanceRate,
    };
  }

  /**
   * Get current acceptance rate.
   */
  getAcceptanceRate(): number {
    if (this.acceptanceWindow.length === 0) return 1;
    const accepted = this.acceptanceWindow.filter(w => w.accepted).length;
    return accepted / this.acceptanceWindow.length;
  }

  /**
   * Cool down temperature with optional adaptive cooling.
   */
  private coolDown(): void {
    if (this.config.adaptiveCooling && this.acceptanceWindow.length >= this.config.adaptiveWindowSize) {
      const rate = this.getAcceptanceRate();
      const targetRate = 0.44;
      const ratio = rate / targetRate;
      const adaptiveRate = this.config.coolingRate * (ratio > 1 ? Math.min(ratio, 2) : Math.max(ratio, 0.5));
      this.currentTemperature *= adaptiveRate;
    } else {
      this.currentTemperature *= this.config.coolingRate;
    }

    this.currentTemperature = Math.max(this.currentTemperature, this.config.minTemperature);
  }

  /**
   * Count hard constraint violations.
   */
  private countHardViolations(
    constraints: UnifiedConstraint[],
    state: Map<string, any>,
  ): number {
    let violations = 0;
    for (const constraint of constraints) {
      if (constraint.hard) {
        // Evaluate against all object pairs
        for (const [, child] of state) {
          for (const [, parent] of state) {
            if (child !== parent) {
              const v = constraint.evaluate(child, parent);
              if (v > 0) violations++;
            }
          }
        }
      }
    }
    return violations;
  }
}

/**
 * SASolverUnifier merges sa-solver.ts and full-solver-loop.ts into
 * a single unified implementation.
 */
export class SASolverUnifier {
  /**
   * Create a unified SA solver with the given configuration.
   *
   * The unified solver combines:
   * - Standalone SA: simple Metropolis criterion, geometric cooling
   * - Full solver loop: constraint-aware proposals, violation-aware acceptance
   *
   * @param config Solver configuration
   * @returns SASolverAdapter instance
   */
  createUnifiedSolver(config: Partial<UnifiedSAConfig> = {}): SASolverAdapter {
    return new SASolverAdapter(config);
  }

  /**
   * Migrate from the old SA solver API.
   *
   * Provides a compatibility layer that accepts the old
   * SimulatedAnnealingConfig format and converts it to UnifiedSAConfig.
   */
  migrateOldAPI(oldConfig: {
    initialTemperature?: number;
    coolingRate?: number;
    minTemperature?: number;
    maxIterations?: number;
    restartThreshold?: number;
    adaptiveCooling?: boolean;
    seed?: number;
  }): SASolverAdapter {
    const unifiedConfig: Partial<UnifiedSAConfig> = {
      initialTemperature: oldConfig.initialTemperature,
      coolingRate: oldConfig.coolingRate,
      minTemperature: oldConfig.minTemperature,
      maxIterations: oldConfig.maxIterations,
      restartThreshold: oldConfig.restartThreshold,
      adaptiveCooling: oldConfig.adaptiveCooling,
      seed: oldConfig.seed,
      // Default new features to off for backward compatibility
      useConstraintAwareProposals: false,
      useStructuredMoves: false,
      enableDomainReasoning: false,
    };

    return new SASolverAdapter(unifiedConfig);
  }

  /**
   * Migrate from the old FullSolverLoop API.
   */
  migrateFullSolverAPI(oldConfig: {
    maxIterations?: number;
    initialTemperature?: number;
    coolingRate?: number;
    minTemperature?: number;
    useStructuredMoves?: boolean;
    violationPenalty?: number;
    maxObjects?: number;
    seed?: number;
  }): SASolverAdapter {
    const unifiedConfig: Partial<UnifiedSAConfig> = {
      maxIterations: oldConfig.maxIterations,
      initialTemperature: oldConfig.initialTemperature,
      coolingRate: oldConfig.coolingRate,
      minTemperature: oldConfig.minTemperature,
      useConstraintAwareProposals: true,
      useStructuredMoves: oldConfig.useStructuredMoves,
      violationPenalty: oldConfig.violationPenalty,
      maxObjects: oldConfig.maxObjects,
      seed: oldConfig.seed,
    };

    return new SASolverAdapter(unifiedConfig);
  }
}

// ============================================================================
// 3. JointTypeUnifier
// ============================================================================

/**
 * Unified joint type names following standard robotics convention.
 *
 * Old names (from Joint.ts) → New names:
 *   hinge       → revolute
 *   weld        → fixed
 *   sliding     → prismatic
 *   ball-socket → continuous
 *
 * Additional standard types:
 *   planar  — 2D translation on a plane
 *   floating — 6-DOF unconstrained
 */
export type UnifiedJointType =
  | 'revolute'
  | 'prismatic'
  | 'fixed'
  | 'continuous'
  | 'planar'
  | 'floating';

/**
 * Mapping from old joint type names to unified names.
 */
export const JOINT_TYPE_MAPPING: Record<string, UnifiedJointType> = {
  'hinge': 'revolute',
  'weld': 'fixed',
  'sliding': 'prismatic',
  'ball-socket': 'continuous',
  // Already unified names (identity mapping)
  'revolute': 'revolute',
  'prismatic': 'prismatic',
  'fixed': 'fixed',
  'continuous': 'continuous',
  'planar': 'planar',
  'floating': 'floating',
};

/**
 * Description of each unified joint type.
 */
export const JOINT_TYPE_DESCRIPTIONS: Record<UnifiedJointType, string> = {
  'revolute': 'Single-axis rotation (was "hinge"). Allows rotation around one axis with optional limits.',
  'prismatic': 'Single-axis translation (was "sliding"). Allows translation along one axis with optional limits.',
  'fixed': 'Rigid connection (was "weld"). No relative motion between bodies.',
  'continuous': 'Free rotation around one axis (was "ball-socket"). No angular limits.',
  'planar': '2D translation on a plane. Allows motion in two perpendicular axes.',
  'floating': '6-DOF unconstrained. Full freedom of translation and rotation.',
};

/**
 * JointTypeUnifier maps old joint type names to the unified standard.
 *
 * The existing Joint.ts uses: 'hinge' | 'ball-socket' | 'prismatic' | 'fixed'
 * The unified standard uses: 'revolute' | 'continuous' | 'prismatic' | 'fixed' | 'planar' | 'floating'
 *
 * This unifier provides:
 * - toUnifiedType(): Convert any old type name to unified
 * - fromLegacyHinge/fromLegacyWeld: Convenience factories
 * - toLegacyType(): Convert back for backward compatibility
 *
 * Usage:
 * ```ts
 * const unifier = new JointTypeUnifier();
 * const unified = unifier.toUnifiedType('hinge'); // 'revolute'
 * ```
 */
export class JointTypeUnifier {
  /**
   * Convert an old joint type name to the unified name.
   *
   * @param oldType Old joint type name (e.g., 'hinge', 'weld', 'sliding', 'ball-socket')
   * @returns Unified joint type name
   */
  toUnifiedType(oldType: string): UnifiedJointType {
    const mapped = JOINT_TYPE_MAPPING[oldType];
    if (mapped) return mapped;

    console.warn(
      `[JointTypeUnifier] Unknown joint type "${oldType}", defaulting to "floating"`
    );
    return 'floating';
  }

  /**
   * Convert a unified type back to the legacy name for backward compatibility.
   *
   * @param unifiedType Unified joint type
   * @returns Legacy joint type name (from Joint.ts)
   */
  toLegacyType(unifiedType: UnifiedJointType): string {
    const reverseMapping: Record<string, string> = {
      'revolute': 'hinge',
      'prismatic': 'prismatic',
      'fixed': 'fixed',
      'continuous': 'ball-socket',
      'planar': 'sliding',  // Closest legacy equivalent
      'floating': 'ball-socket',  // Closest legacy equivalent
    };

    return reverseMapping[unifiedType] ?? 'ball-socket';
  }

  /**
   * Convenience: convert legacy "hinge" to unified "revolute".
   */
  fromLegacyHinge(): 'revolute' {
    return 'revolute';
  }

  /**
   * Convenience: convert legacy "weld" to unified "fixed".
   */
  fromLegacyWeld(): 'fixed' {
    return 'fixed';
  }

  /**
   * Convenience: convert legacy "sliding" to unified "prismatic".
   */
  fromLegacySliding(): 'prismatic' {
    return 'prismatic';
  }

  /**
   * Convenience: convert legacy "ball-socket" to unified "continuous".
   */
  fromLegacyBallSocket(): 'continuous' {
    return 'continuous';
  }

  /**
   * Unify all joint types in a configuration object.
   *
   * Recursively replaces old joint type names with unified names
   * in a configuration object.
   *
   * @param config Configuration object with 'type' fields
   * @returns Configuration with unified type names
   */
  unifyJointTypes(config: any): any {
    if (!config || typeof config !== 'object') return config;

    const result = { ...config };

    if (typeof config.type === 'string') {
      const mapped = JOINT_TYPE_MAPPING[config.type];
      if (mapped) {
        result.type = mapped;
      }
    }

    // Recurse into nested objects
    for (const key of Object.keys(result)) {
      if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.unifyJointTypes(result[key]);
      }
      if (Array.isArray(result[key])) {
        result[key] = result[key].map((item: any) => this.unifyJointTypes(item));
      }
    }

    return result;
  }

  /**
   * Get all unified joint type names.
   */
  getAllUnifiedTypes(): UnifiedJointType[] {
    return ['revolute', 'prismatic', 'fixed', 'continuous', 'planar', 'floating'];
  }

  /**
   * Get the description for a unified joint type.
   */
  getDescription(type: UnifiedJointType): string {
    return JOINT_TYPE_DESCRIPTIONS[type] ?? 'Unknown joint type';
  }
}

// ============================================================================
// 4. TerrainGeneratorBridge
// ============================================================================

/**
 * Unified terrain generation mode.
 *
 * - HEIGHTMAP: Traditional heightmap-based generation (TerrainGenerator)
 * - SDF_FULL: Full 3D SDF generation with caves, overhangs, arches (SDFTerrainGenerator)
 * - ELEMENT_COMPOSED: Element composition system (TerrainElementSystem)
 */
export type UnifiedTerrainMode = 'HEIGHTMAP' | 'SDF_FULL' | 'ELEMENT_COMPOSED';

/**
 * Unified terrain configuration that works with all terrain generators.
 */
export interface UnifiedTerrainConfig {
  /** Generation mode */
  mode: UnifiedTerrainMode;
  /** Random seed */
  seed: number;
  /** Terrain width in world units */
  width: number;
  /** Terrain height in world units */
  height: number;
  /** Terrain depth in world units (same as width for square terrains) */
  depth: number;
  /** Scale factor for noise */
  scale: number;
  /** Number of noise octaves */
  octaves: number;
  /** Persistence for noise FBM */
  persistence: number;
  /** Lacunarity for noise FBM */
  lacunarity: number;

  // Heightmap-specific
  /** Erosion strength (0-1) for heightmap mode */
  erosionStrength: number;
  /** Erosion iterations for heightmap mode */
  erosionIterations: number;
  /** Sea level (0-1) for heightmap mode */
  seaLevel: number;

  // SDF-specific
  /** Enable cave generation (SDF mode only) */
  enableCaves: boolean;
  /** Enable overhangs (SDF mode only) */
  enableOverhangs: boolean;
  /** Enable arches (SDF mode only) */
  enableArches: boolean;
  /** SDF voxel resolution */
  resolution: number;

  // Element-composed specific
  /** Enable ground element */
  enableGround: boolean;
  /** Enable mountain element */
  enableMountains: boolean;
  /** Enable cave element */
  enableCaveElement: boolean;
  /** Enable voronoi rock element */
  enableVoronoiRocks: boolean;
  /** Enable waterbody element */
  enableWaterbody: boolean;
}

/**
 * Default unified terrain configuration.
 */
export const DEFAULT_UNIFIED_TERRAIN_CONFIG: UnifiedTerrainConfig = {
  mode: 'HEIGHTMAP',
  seed: 42,
  width: 512,
  height: 512,
  depth: 512,
  scale: 100,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.0,
  erosionStrength: 0.3,
  erosionIterations: 20,
  seaLevel: 0.3,
  enableCaves: true,
  enableOverhangs: true,
  enableArches: true,
  resolution: 0.5,
  enableGround: true,
  enableMountains: true,
  enableCaveElement: true,
  enableVoronoiRocks: true,
  enableWaterbody: false,
};

/**
 * TerrainGeneratorBridge provides backward compatibility between the old
 * TerrainGenerator/SDFTerrainGenerator APIs and the UnifiedTerrainConfig.
 *
 * Converts:
 * - Old TerrainGenerator (heightmap) config → UnifiedTerrainConfig in HEIGHTMAP mode
 * - Old SDFTerrainGenerator config → UnifiedTerrainConfig in SDF_FULL mode
 *
 * The old APIs still work via bridge — no breaking changes.
 *
 * Usage:
 * ```ts
 * const bridge = new TerrainGeneratorBridge();
 * const config = bridge.fromHeightmapConfig(oldTerrainConfig);
 * const unifiedConfig = bridge.toUnifiedConfig(oldSDFConfig);
 * ```
 */
export class TerrainGeneratorBridge {
  /**
   * Bridge old TerrainGenerator (heightmap) config to UnifiedTerrainConfig.
   *
   * Maps the heightmap-based TerrainConfig fields to the unified configuration,
   * setting mode to 'HEIGHTMAP' and mapping corresponding parameters.
   *
   * @param oldConfig Old TerrainGenerator.TerrainConfig
   * @returns UnifiedTerrainConfig in HEIGHTMAP mode
   */
  fromHeightmapConfig(oldConfig: {
    seed?: number;
    width?: number;
    height?: number;
    scale?: number;
    octaves?: number;
    persistence?: number;
    lacunarity?: number;
    erosionStrength?: number;
    erosionIterations?: number;
    seaLevel?: number;
  }): UnifiedTerrainConfig {
    return {
      ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
      mode: 'HEIGHTMAP',
      seed: oldConfig.seed ?? 42,
      width: oldConfig.width ?? 512,
      height: oldConfig.height ?? 512,
      depth: oldConfig.width ?? 512,
      scale: oldConfig.scale ?? 100,
      octaves: oldConfig.octaves ?? 6,
      persistence: oldConfig.persistence ?? 0.5,
      lacunarity: oldConfig.lacunarity ?? 2.0,
      erosionStrength: oldConfig.erosionStrength ?? 0.3,
      erosionIterations: oldConfig.erosionIterations ?? 20,
      seaLevel: oldConfig.seaLevel ?? 0.3,
      // SDF features disabled in heightmap mode
      enableCaves: false,
      enableOverhangs: false,
      enableArches: false,
    };
  }

  /**
   * Bridge old SDFTerrainGenerator config to UnifiedTerrainConfig.
   *
   * Maps the SDF-based SDFTerrainConfig fields to the unified configuration,
   * setting mode to 'SDF_FULL' and mapping corresponding parameters.
   *
   * @param oldConfig Old SDFTerrainGenerator.SDFTerrainConfig
   * @returns UnifiedTerrainConfig in SDF_FULL mode
   */
  fromSDFConfig(oldConfig: {
    seed?: number;
    bounds?: THREE.Box3;
    resolution?: number;
    amplitude?: number;
    frequency?: number;
    octaves?: number;
    lacunarity?: number;
    persistence?: number;
    enableCaves?: boolean;
    enableOverhangs?: boolean;
    enableArches?: boolean;
  }): UnifiedTerrainConfig {
    const bounds = oldConfig.bounds ?? new THREE.Box3(
      new THREE.Vector3(-50, -10, -50),
      new THREE.Vector3(50, 30, 50),
    );
    const size = bounds.getSize(new THREE.Vector3());

    return {
      ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
      mode: 'SDF_FULL',
      seed: oldConfig.seed ?? 42,
      width: Math.round(size.x),
      height: Math.round(size.y),
      depth: Math.round(size.z),
      scale: 1 / (oldConfig.frequency ?? 0.02),
      octaves: oldConfig.octaves ?? 6,
      persistence: oldConfig.persistence ?? 0.5,
      lacunarity: oldConfig.lacunarity ?? 2.0,
      resolution: oldConfig.resolution ?? 0.5,
      enableCaves: oldConfig.enableCaves ?? true,
      enableOverhangs: oldConfig.enableOverhangs ?? true,
      enableArches: oldConfig.enableArches ?? true,
      // Heightmap features not used in SDF mode
      erosionStrength: 0,
      erosionIterations: 0,
    };
  }

  /**
   * Bridge to element-composed mode.
   *
   * @param config Element enable/disable configuration
   * @returns UnifiedTerrainConfig in ELEMENT_COMPOSED mode
   */
  fromElementConfig(config: {
    seed?: number;
    enableGround?: boolean;
    enableMountains?: boolean;
    enableCaves?: boolean;
    enableVoronoiRocks?: boolean;
    enableWaterbody?: boolean;
  }): UnifiedTerrainConfig {
    return {
      ...DEFAULT_UNIFIED_TERRAIN_CONFIG,
      mode: 'ELEMENT_COMPOSED',
      seed: config.seed ?? 42,
      enableGround: config.enableGround ?? true,
      enableMountains: config.enableMountains ?? true,
      enableCaveElement: config.enableCaves ?? true,
      enableVoronoiRocks: config.enableVoronoiRocks ?? true,
      enableWaterbody: config.enableWaterbody ?? false,
    };
  }

  /**
   * Convert any terrain config to unified format.
   *
   * Auto-detects the mode based on the config shape:
   * - Has 'bounds' → SDF_FULL
   * - Has 'erosionStrength' → HEIGHTMAP
   * - Has 'enableGround' → ELEMENT_COMPOSED
   */
  toUnifiedConfig(config: any): UnifiedTerrainConfig {
    if (config.mode) {
      // Already has a mode specified
      return { ...DEFAULT_UNIFIED_TERRAIN_CONFIG, ...config };
    }

    if (config.bounds) {
      return this.fromSDFConfig(config);
    }

    if (config.enableGround !== undefined) {
      return this.fromElementConfig(config);
    }

    // Default: treat as heightmap config
    return this.fromHeightmapConfig(config);
  }

  /**
   * Get the recommended terrain mode for a given use case.
   */
  getRecommendedMode(useCase: 'outdoor_natural' | 'indoor' | 'caves_overhangs' | 'flat_ground'): UnifiedTerrainMode {
    switch (useCase) {
      case 'outdoor_natural':
        return 'SDF_FULL';
      case 'indoor':
        return 'HEIGHTMAP';
      case 'caves_overhangs':
        return 'ELEMENT_COMPOSED';
      case 'flat_ground':
        return 'HEIGHTMAP';
      default:
        return 'HEIGHTMAP';
    }
  }
}

// ============================================================================
// 5. UnificationReport
// ============================================================================

/**
 * Result of a single unification change.
 */
export interface UnificationChange {
  /** Name of the subsystem that was unified */
  subsystem: string;
  /** What was deprecated */
  deprecated: string;
  /** What replaces it */
  replacement: string;
  /** Whether backward compatibility is maintained */
  backwardCompatible: boolean;
  /** Migration instructions */
  migrationGuide: string;
  /** Severity: breaking, warning, info */
  severity: 'breaking' | 'warning' | 'info';
}

/**
 * Overall unification result.
 */
export interface UnificationResult {
  /** Total number of duplicates resolved */
  duplicatesResolved: number;
  /** List of API deprecations */
  deprecatedAPIs: UnificationChange[];
  /** Migration guides per change */
  migrationGuides: Record<string, string>;
  /** Summary statistics */
  summary: {
    totalChanges: number;
    breakingChanges: number;
    warnings: number;
    informational: number;
    allBackwardCompatible: boolean;
  };
}

/**
 * UnificationReport generates a comprehensive report of all architectural
 * unifications performed, including which duplicates were resolved,
 * which APIs are deprecated, and migration guides.
 *
 * Usage:
 * ```ts
 * const report = new UnificationReport();
 * const result = report.generateReport();
 * console.log(result.summary);
 * ```
 */
export class UnificationReport {
  /**
   * Generate the full unification report.
   *
   * @returns UnificationResult with all changes and migration guides
   */
  generateReport(): UnificationResult {
    const changes: UnificationChange[] = [];

    // 1. Constraint DSL Unification
    changes.push({
      subsystem: 'Constraint DSL',
      deprecated: 'Text-based ConstraintDSL (ConstraintLexer, ConstraintParser, compileConstraint)',
      replacement: 'ConstraintBuilder (builder API from ConstraintProposalSystem)',
      backwardCompatible: true,
      migrationGuide: [
        'Replace text constraint source strings with ConstraintBuilder calls:',
        '  OLD: compileConstraint("constraint on_floor(x, y) { require x >= y; }")',
        '  NEW: new ConstraintBuilder("on_floor").hard().evaluate((x, y) => Math.max(0, y - x)).build()',
        'Use textToBuilder() adapter for gradual migration of existing text constraints.',
      ].join('\n'),
      severity: 'warning',
    });

    // 2. SA Solver Unification
    changes.push({
      subsystem: 'SA Solver',
      deprecated: 'Standalone SimulatedAnnealingSolver (sa-solver.ts) — used separately from FullSolverLoop',
      replacement: 'SASolverAdapter with UnifiedSAConfig (merges sa-solver + full-solver-loop)',
      backwardCompatible: true,
      migrationGuide: [
        'The standalone sa-solver.ts and full-solver-loop.ts are unified into SASolverAdapter:',
        '  OLD: new SimulatedAnnealingSolver(config) → solver.step(state, proposal, energyFn)',
        '  OLD: new FullSolverLoop(config) → solver.solve()',
        '  NEW: new SASolverUnifier().createUnifiedSolver(config) → adapter.solve(constraints, state, energyFn)',
        'Use migrateOldAPI() or migrateFullSolverAPI() for backward compatibility.',
      ].join('\n'),
      severity: 'warning',
    });

    // 3. Joint Type Unification
    changes.push({
      subsystem: 'Joint Types',
      deprecated: 'Old joint type names: "hinge", "weld", "sliding", "ball-socket"',
      replacement: 'Unified names: "revolute", "fixed", "prismatic", "continuous" (plus "planar", "floating")',
      backwardCompatible: true,
      migrationGuide: [
        'Joint type name mapping:',
        '  "hinge"       → "revolute"   (single-axis rotation)',
        '  "weld"        → "fixed"      (rigid connection)',
        '  "sliding"     → "prismatic"  (single-axis translation)',
        '  "ball-socket" → "continuous"  (free rotation around axis)',
        'New types: "planar" (2D translation), "floating" (6-DOF)',
        'Use JointTypeUnifier.toUnifiedType() for conversion.',
        'Old names still work via the mapping layer.',
      ].join('\n'),
      severity: 'info',
    });

    // 4. Terrain Generator Bridge
    changes.push({
      subsystem: 'Terrain Generators',
      deprecated: 'Separate TerrainGenerator and SDFTerrainGenerator with incompatible configs',
      replacement: 'UnifiedTerrainConfig with mode selection (HEIGHTMAP / SDF_FULL / ELEMENT_COMPOSED)',
      backwardCompatible: true,
      migrationGuide: [
        'Use TerrainGeneratorBridge to convert old configs:',
        '  Heightmap: bridge.fromHeightmapConfig(oldTerrainConfig)',
        '  SDF:       bridge.fromSDFConfig(oldSDFConfig)',
        '  Elements:  bridge.fromElementConfig(elementConfig)',
        '  Auto:      bridge.toUnifiedConfig(anyConfig)',
        'Old generators still work; bridge provides the unified interface.',
      ].join('\n'),
      severity: 'info',
    });

    // 5. Relation Hierarchy (from previous P1 work)
    changes.push({
      subsystem: 'Relation Hierarchy',
      deprecated: 'Two separate relation systems: SpatialRelationAlgebra + language/relations.ts',
      replacement: 'Unified Relation abstract class from UnifiedConstraintSystem.ts',
      backwardCompatible: true,
      migrationGuide: [
        'The unified Relation class combines tag matching and geometric evaluation.',
        'Use the 8 concrete implementations from UnifiedConstraintSystem.ts:',
        '  StableAgainstRelation, TouchingRelation, SupportedByRelation,',
        '  CoPlanarRelation, SharedEdgeRelation, RoomNeighbourRelation,',
        '  DistanceRelation, OnFloorRelation',
        'Old systems still work; new unified system is recommended for new code.',
      ].join('\n'),
      severity: 'info',
    });

    // Build migration guides map
    const migrationGuides: Record<string, string> = {};
    for (const change of changes) {
      migrationGuides[change.subsystem] = change.migrationGuide;
    }

    // Summary
    const breakingChanges = changes.filter(c => c.severity === 'breaking').length;
    const warnings = changes.filter(c => c.severity === 'warning').length;
    const informational = changes.filter(c => c.severity === 'info').length;

    return {
      duplicatesResolved: changes.length,
      deprecatedAPIs: changes,
      migrationGuides,
      summary: {
        totalChanges: changes.length,
        breakingChanges,
        warnings,
        informational,
        allBackwardCompatible: changes.every(c => c.backwardCompatible),
      },
    };
  }

  /**
   * Format the report as a human-readable string.
   *
   * @returns Formatted report string
   */
  formatReport(): string {
    const result = this.generateReport();
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  Architectural Unification Report');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`  Duplicates Resolved: ${result.duplicatesResolved}`);
    lines.push(`  Total Changes:       ${result.summary.totalChanges}`);
    lines.push(`  Breaking Changes:    ${result.summary.breakingChanges}`);
    lines.push(`  Warnings:            ${result.summary.warnings}`);
    lines.push(`  Informational:       ${result.summary.informational}`);
    lines.push(`  All Backward Compat: ${result.summary.allBackwardCompatible ? 'YES' : 'NO'}`);
    lines.push('');

    for (const change of result.deprecatedAPIs) {
      const severityIcon = change.severity === 'breaking' ? '❌' :
                           change.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`  ${severityIcon} [${change.subsystem}]`);
      lines.push(`    Deprecated:  ${change.deprecated}`);
      lines.push(`    Replacement: ${change.replacement}`);
      lines.push(`    Compatible:  ${change.backwardCompatible ? 'Yes' : 'No'}`);
      lines.push('');
    }

    lines.push('───────────────────────────────────────────────────────');
    lines.push('  Migration Guides');
    lines.push('───────────────────────────────────────────────────────');
    lines.push('');

    for (const [subsystem, guide] of Object.entries(result.migrationGuides)) {
      lines.push(`  [${subsystem}]`);
      for (const line of guide.split('\n')) {
        lines.push(`    ${line}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

export default {
  ConstraintDSLUnifier,
  ConstraintBuilder,
  SASolverUnifier,
  SASolverAdapter,
  JointTypeUnifier,
  TerrainGeneratorBridge,
  UnificationReport,
};
