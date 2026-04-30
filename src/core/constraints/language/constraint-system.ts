/**
 * Constraint System - High-level constraint definition API
 * 
 * Ported from: infinigen/core/constraints/constraint_language/__init__.py
 * Provides a builder API for constructing constraint problems.
 */

import { Node, Variable, Domain } from './types';
import { Problem } from './constants';
import { Expression, ScalarExpression, BoolExpression } from './expression';

export class ConstraintSystem {
  private variables: Map<string, Variable> = new Map();
  private constraints: Map<string, BoolExpression> = new Map();
  private scoreTerms: Map<string, ScalarExpression> = new Map();

  addVariable(nameOrVariable: string | Variable, domain?: Domain): Variable {
    if (nameOrVariable instanceof Variable) {
      this.variables.set(nameOrVariable.name, nameOrVariable);
      return nameOrVariable;
    }
    const variable = new Variable(nameOrVariable, domain);
    this.variables.set(nameOrVariable, variable);
    return variable;
  }

  addConstraint(name: string, constraint: BoolExpression): void {
    this.constraints.set(name, constraint);
  }

  addScoreTerm(name: string, term: ScalarExpression): void {
    this.scoreTerms.set(name, term);
  }

  buildProblem(): Problem {
    return new Problem(this.constraints, this.scoreTerms);
  }

  getVariable(name: string): Variable | undefined {
    return this.variables.get(name);
  }

  getVariables(): Map<string, Variable> {
    return this.variables;
  }

  getDomain(name: string): Domain | undefined {
    return this.variables.get(name)?.domain;
  }

  simplify(): void {
    // Simplify constraints - basic implementation
  }

  getAllVariables(): Variable[] {
    return Array.from(this.variables.values());
  }

  reset(): void {
    this.variables.clear();
    this.constraints.clear();
    this.scoreTerms.clear();
  }
}
