/**
 * Constraint Validator
 *
 * Ports: infinigen/core/constraints/checks.py
 *
 * Validates constraint problems before solving:
 *  - Greedy stage coverage: all constraints covered by some greedy stage
 *  - Contradictory domains: no impossible domain requirements
 *  - Unfinalized constraints: no unfinalized constraint variables
 */

import { Variable, Domain } from '../language/types';
import { TagSet } from '../unified/UnifiedConstraintSystem';
import { domainFinalized } from '../reasoning/constraint-domain';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error messages (for failures) */
  errors: ValidationError[];
  /** Warning messages (for non-fatal issues) */
  warnings: ValidationWarning[];
}

/**
 * A validation error.
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** The variable or constraint that caused the error */
  target?: string;
}

/**
 * A validation warning.
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Human-readable message */
  message: string;
  /** The variable or constraint that caused the warning */
  target?: string;
}

/**
 * A constraint problem to validate.
 *
 * This is a simplified representation of a constraint problem,
 * compatible with both the Problem class from constants.ts and
 * the Problem interface from types.ts.
 */
export interface ConstraintProblem {
  /** All variables in the problem */
  variables: Variable[];
  /** Greedy stages (array of variable name sets) */
  greedyStages: string[][];
  /** Domains for each variable */
  domains: Map<string, Domain>;
  /** Constraint names */
  constraintNames: string[];
  /** Variables referenced by each constraint */
  constraintVariables: Map<string, string[]>;
}

// ============================================================================
// Validator Functions
// ============================================================================

/**
 * Validate that all constraints are covered by some greedy stage.
 *
 * A constraint is "covered" if at least one of its variables appears
 * in a greedy stage. Uncovered constraints may never be satisfied
 * during greedy pre-solving.
 *
 * @param problem The constraint problem to validate
 * @returns ValidationResult with errors for uncovered constraints
 */
export function validateGreedyStageCoverage(problem: ConstraintProblem): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (problem.greedyStages.length === 0) {
    warnings.push({
      code: 'no_greedy_stages',
      message: 'No greedy stages defined — all constraints will be solved by SA only',
    });
    return { valid: true, errors, warnings };
  }

  // Collect all variables covered by greedy stages
  const coveredVars = new Set<string>();
  for (const stage of problem.greedyStages) {
    for (const varName of stage) {
      coveredVars.add(varName);
    }
  }

  // Check each constraint
  for (const constraintName of problem.constraintNames) {
    const vars = problem.constraintVariables.get(constraintName);
    if (!vars || vars.length === 0) continue;

    const isCovered = vars.some(v => coveredVars.has(v));
    if (!isCovered) {
      errors.push({
        code: 'uncovered_constraint',
        message: `Constraint "${constraintName}" is not covered by any greedy stage (variables: ${vars.join(', ')})`,
        target: constraintName,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that no domains are contradictory.
 *
 * A domain is contradictory if it requires mutually exclusive conditions,
 * e.g., requiring an object to be both on the floor and on the ceiling.
 *
 * @param problem The constraint problem to validate
 * @returns ValidationResult with errors for contradictory domains
 */
export function validateContradictoryDomains(problem: ConstraintProblem): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const variable of problem.variables) {
    const domain = problem.domains.get(variable.name) ?? variable.domain;

    // Check if the domain is empty (intersects to nothing)
    if (domain) {
      // For ObjectSetDomain, check if includes and excludes conflict
      if ('includes' in domain && 'excludes' in domain) {
        const includes = (domain as any).includes as Set<string> | undefined;
        const excludes = (domain as any).excludes as Set<string> | undefined;

        if (includes && excludes) {
          for (const inc of includes) {
            if (excludes.has(inc)) {
              errors.push({
                code: 'contradictory_domain',
                message: `Variable "${variable.name}" has a contradictory domain: "${inc}" is both included and excluded`,
                target: variable.name,
              });
            }
          }
        }

        // Check if domain is empty (no possible values)
        if (includes && includes.size === 0) {
          errors.push({
            code: 'empty_domain',
            message: `Variable "${variable.name}" has an empty domain (no possible values)`,
            target: variable.name,
          });
        }
      }

      // For NumericDomain, check if min > max
      if ('min' in domain && 'max' in domain) {
        const min = (domain as any).min as number;
        const max = (domain as any).max as number;
        if (min > max) {
          errors.push({
            code: 'contradictory_numeric_domain',
            message: `Variable "${variable.name}" has a contradictory numeric domain: min (${min}) > max (${max})`,
            target: variable.name,
          });
        }
      }
    }
  }

  // Check for conflicting domain requirements across variables
  // (e.g., two variables requiring the same unique object)
  const requiredObjects = new Map<string, string[]>(); // object ID → variable names
  for (const variable of problem.variables) {
    const domain = problem.domains.get(variable.name) ?? variable.domain;
    if (domain && 'includes' in domain) {
      const includes = (domain as any).includes as Set<string> | undefined;
      if (includes && includes.size === 1) {
        const objId = Array.from(includes)[0];
        const existing = requiredObjects.get(objId) ?? [];
        existing.push(variable.name);
        requiredObjects.set(objId, existing);
      }
    }
  }

  for (const [objId, varNames] of requiredObjects) {
    if (varNames.length > 1) {
      warnings.push({
        code: 'shared_unique_object',
        message: `Object "${objId}" is uniquely required by multiple variables: ${varNames.join(', ')}`,
        target: objId,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that no constraint variables are unfinalized.
 *
 * An unfinalized variable has a domain that hasn't been fully specified,
 * meaning it could match any object. This often indicates a bug in the
 * constraint specification.
 *
 * @param problem The constraint problem to validate
 * @returns ValidationResult with warnings for unfinalized variables
 */
export function validateUnfinalizedConstraints(problem: ConstraintProblem): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const variable of problem.variables) {
    const domain = problem.domains.get(variable.name) ?? variable.domain;

    if (domain) {
      // Check if the domain is finalized
      if (!domainFinalized(domain as any)) {
        warnings.push({
          code: 'unfinalized_domain',
          message: `Variable "${variable.name}" has an unfinalized domain — it may match any object`,
          target: variable.name,
        });
      }
    } else {
      errors.push({
        code: 'missing_domain',
        message: `Variable "${variable.name}" has no domain specified`,
        target: variable.name,
      });
    }
  }

  // Check for unused variables (not referenced by any constraint)
  const usedVars = new Set<string>();
  for (const [, vars] of problem.constraintVariables) {
    for (const v of vars) {
      usedVars.add(v);
    }
  }

  for (const variable of problem.variables) {
    if (!usedVars.has(variable.name)) {
      warnings.push({
        code: 'unused_variable',
        message: `Variable "${variable.name}" is not referenced by any constraint`,
        target: variable.name,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validations on a constraint problem.
 *
 * @param problem The constraint problem to validate
 * @returns Combined ValidationResult from all validation checks
 */
export function validateConstraintProblem(problem: ConstraintProblem): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];

  const results = [
    validateGreedyStageCoverage(problem),
    validateContradictoryDomains(problem),
    validateUnfinalizedConstraints(problem),
  ];

  for (const result of results) {
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
