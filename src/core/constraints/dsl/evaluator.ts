/**
 * Constraint DSL Evaluator
 *
 * Walks the DSL AST recursively and evaluates constraint expressions
 * against a variable-binding context object.
 *
 * Supported features:
 * - Arithmetic: +, -, *, /, %, ** (power)
 * - Comparisons: ==, !=, <, >, <=, >=, ===, !==
 * - Logical: &&, ||, !
 * - Unary: -, +, ~
 * - Function calls: distance(), contains(), overlaps(), min(), max(),
 *   abs(), sqrt(), floor(), ceil(), round(), pow(), clamp(), len(), etc.
 * - Member access: obj.prop, obj[prop]
 * - Variable binding via context object
 * - if/for/return statements
 * - Variable declarations (let/const/var)
 * - Assignment expressions: =, +=, -=, *=, /=, %=
 * - Array and object literals
 * - Arrow functions and function expressions
 * - Conditional (ternary) expressions
 */

import {
  ASTNodeType,
  type Program,
  type ConstraintDeclaration,
  type FunctionDeclaration,
  type BlockStatement,
  type Statement,
  type ReturnStatement,
  type IfStatement,
  type ForStatement,
  type ExpressionStatement,
  type VariableDeclaration,
  type Expression,
  type BinaryExpression,
  type UnaryExpression,
  type MemberExpression,
  type CallExpression,
  type Identifier,
  type Literal,
  type ArrayLiteral,
  type ObjectLiteral,
  type Property,
  type FunctionExpression,
  type ArrowFunction,
  type ConditionalExpression,
  type AssignmentExpression,
  type VariableDeclarator,
} from './ConstraintDSL';

// ---------------------------------------------------------------------------
// Return-signal – thrown to unwind the call stack when a `return` is hit
// ---------------------------------------------------------------------------
class ReturnSignal {
  constructor(public readonly value: unknown) {}
}

// ---------------------------------------------------------------------------
// Built-in function registry
// ---------------------------------------------------------------------------
type BuiltinFn = (...args: unknown[]) => unknown;

const BUILTINS: Record<string, BuiltinFn> = {
  // Math
  abs: (x) => Math.abs(toNumber(x)),
  sqrt: (x) => Math.sqrt(toNumber(x)),
  floor: (x) => Math.floor(toNumber(x)),
  ceil: (x) => Math.ceil(toNumber(x)),
  round: (x) => Math.round(toNumber(x)),
  pow: (a, b) => Math.pow(toNumber(a), toNumber(b)),
  min: (...args) => Math.min(...(args as number[]).map(toNumber)),
  max: (...args) => Math.max(...(args as number[]).map(toNumber)),
  clamp: (v, lo, hi) => Math.min(Math.max(toNumber(v), toNumber(lo)), toNumber(hi)),
  log: (x) => Math.log(toNumber(x)),
  exp: (x) => Math.exp(toNumber(x)),
  sin: (x) => Math.sin(toNumber(x)),
  cos: (x) => Math.cos(toNumber(x)),
  tan: (x) => Math.tan(toNumber(x)),

  // Type / introspection
  typeof_: (x) => typeof x,
  len: (x) => {
    if (Array.isArray(x)) return x.length;
    if (typeof x === 'string') return x.length;
    if (x instanceof Map) return x.size;
    if (x && typeof x === 'object') return Object.keys(x).length;
    return 0;
  },

  // Collection helpers
  contains: (collection, item) => {
    if (Array.isArray(collection)) return collection.includes(item);
    if (collection instanceof Set) return collection.has(item);
    if (collection instanceof Map) return collection.has(item);
    if (typeof collection === 'string') return collection.includes(String(item));
    if (collection && typeof collection === 'object') return (item as string | number | symbol) in collection;
    return false;
  },

  // Spatial / geometry helpers (operates on context objects with x,y,z or position)
  distance: (a, b) => {
    const ax = toVec3(a);
    const bx = toVec3(b);
    const dx = ax[0] - bx[0];
    const dy = ax[1] - bx[1];
    const dz = ax[2] - bx[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  overlaps: (a, b) => {
    // Simple AABB overlap check – expects objects with {min:[x,y,z], max:[x,y,z]}
    // or {position:{x,y,z}, size:{x,y,z}} shapes
    const aBox = toAABB(a as Record<string, unknown>);
    const bBox = toAABB(b as Record<string, unknown>);
    if (!aBox || !bBox) return false;
    for (let i = 0; i < 3; i++) {
      if (aBox.max[i] < bBox.min[i] || aBox.min[i] > bBox.max[i]) return false;
    }
    return true;
  },

  // Assertion helpers used in constraints
  require: (condition, _msg) => {
    if (!condition) throw new ConstraintViolationError(String(_msg ?? 'require() failed'));
    return true;
  },
  ensure: (condition, _msg) => {
    if (!condition) throw new ConstraintViolationError(String(_msg ?? 'ensure() failed'));
    return true;
  },
  check: (condition) => !!condition,
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
export class ConstraintViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConstraintViolationError';
  }
}

export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------
export class EvalContext {
  private scopes: Map<string, unknown>[];

  constructor(initial: Record<string, unknown> = {}) {
    const root = new Map<string, unknown>();
    for (const [k, v] of Object.entries(initial)) {
      root.set(k, v);
    }
    // Pre-populate builtins
    for (const [name, fn] of Object.entries(BUILTINS)) {
      if (!root.has(name)) root.set(name, fn);
    }
    this.scopes = [root];
  }

  /** Push a new scope */
  pushScope(vars?: Map<string, unknown>): void {
    this.scopes.push(vars ?? new Map());
  }

  /** Pop the top scope */
  popScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }

  /** Look up a variable by name, searching from innermost scope outward */
  get(name: string): unknown {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return undefined;
  }

  /** Set a variable in the innermost scope */
  set(name: string, value: unknown): void {
    this.scopes[this.scopes.length - 1].set(name, value);
  }

  /** Update an existing variable in the nearest scope where it's defined */
  update(name: string, value: unknown): void {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        this.scopes[i].set(name, value);
        return;
      }
    }
    // Not found – create in current scope
    this.set(name, value);
  }

  /** Create a child context (shared read-only parent scopes) */
  child(): EvalContext {
    const ctx = new EvalContext();
    ctx.scopes = [...this.scopes, new Map()];
    return ctx;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return Number(v);
  if (v == null) return 0;
  return Number(v);
}

function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v == null) return false;
  return true;
}

function toVec3(v: unknown): [number, number, number] {
  if (v == null) return [0, 0, 0];
  if (Array.isArray(v)) {
    return [
      typeof v[0] === 'number' ? v[0] : 0,
      typeof v[1] === 'number' ? v[1] : 0,
      typeof v[2] === 'number' ? v[2] : 0,
    ];
  }
  const obj = v as Record<string, unknown>;
  // {x, y, z} or {position: {x, y, z}}
  if (obj.position && typeof obj.position === 'object') {
    const p = obj.position as Record<string, unknown>;
    return [
      typeof p.x === 'number' ? p.x : 0,
      typeof p.y === 'number' ? p.y : 0,
      typeof p.z === 'number' ? p.z : 0,
    ];
  }
  return [
    typeof obj.x === 'number' ? obj.x : 0,
    typeof obj.y === 'number' ? obj.y : 0,
    typeof obj.z === 'number' ? obj.z : 0,
  ];
}

interface AABB {
  min: number[];
  max: number[];
}

function toAABB(v: Record<string, unknown>): AABB | null {
  if (!v) return null;
  // Direct {min:[], max:[]}
  if (Array.isArray(v.min) && Array.isArray(v.max)) {
    return { min: v.min as number[], max: v.max as number[] };
  }
  // {position:{x,y,z}, size:{x,y,z}} → compute AABB
  const pos = v.position as Record<string, unknown> | undefined;
  const size = v.size as Record<string, unknown> | undefined;
  if (pos && size) {
    const px = typeof pos.x === 'number' ? pos.x : 0;
    const py = typeof pos.y === 'number' ? pos.y : 0;
    const pz = typeof pos.z === 'number' ? pos.z : 0;
    const sx = typeof size.x === 'number' ? size.x : 0;
    const sy = typeof size.y === 'number' ? size.y : 0;
    const sz = typeof size.z === 'number' ? size.z : 0;
    return {
      min: [px - sx / 2, py - sy / 2, pz - sz / 2],
      max: [px + sx / 2, py + sy / 2, pz + sz / 2],
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a complete DSL program and return the result of the last
 * top-level statement / declaration.
 *
 * @param ast  - Parsed Program AST from `parseConstraintSource()`
 * @param context - Variable bindings (e.g. object states, constants)
 */
export function evaluateProgram(ast: Program, context: Record<string, unknown> = {}): unknown {
  const ctx = new EvalContext(context);
  let result: unknown = undefined;

  for (const node of ast.body) {
    // Top-level constraint / function declarations are registered but not
    // immediately executed – they become callable values.
    if (node.type === ASTNodeType.CONSTRAINT_DECLARATION) {
      result = registerConstraint(node as ConstraintDeclaration, ctx);
    } else if (node.type === ASTNodeType.FUNCTION_DECLARATION) {
      result = registerFunction(node as FunctionDeclaration, ctx);
    } else {
      result = evaluateStatement(node as Statement, ctx);
    }
  }

  return result;
}

/**
 * Evaluate a single constraint declaration and return a callable that
 * returns a boolean when invoked with the constraint's parameters.
 */
export function evaluateConstraint(
  decl: ConstraintDeclaration,
  context: Record<string, unknown> = {}
): (...args: unknown[]) => boolean {
  const ctx = new EvalContext(context);

  // Return a closure that, when called, executes the constraint body
  return (...args: unknown[]): boolean => {
    const localCtx = ctx.child();
    localCtx.pushScope();

    // Bind parameters
    decl.parameters.forEach((param, idx) => {
      const val = idx < args.length ? args[idx] : (param.defaultValue !== undefined ? evaluateExpression(param.defaultValue, localCtx) : undefined);
      localCtx.set(param.name.name, val);
    });

    try {
      const result = evaluateBlock(decl.body, localCtx);
      return toBoolean(result);
    } catch (e) {
      if (e instanceof ReturnSignal) {
        return toBoolean(e.value);
      }
      if (e instanceof ConstraintViolationError) {
        return false;
      }
      throw e;
    }
  };
}

// ---------------------------------------------------------------------------
// Internal: declarations
// ---------------------------------------------------------------------------

function registerConstraint(decl: ConstraintDeclaration, ctx: EvalContext): (...args: unknown[]) => boolean {
  const fn = (...args: unknown[]): boolean => {
    const localCtx = ctx.child();
    localCtx.pushScope();

    decl.parameters.forEach((param, idx) => {
      const val = idx < args.length ? args[idx] : (param.defaultValue !== undefined ? evaluateExpression(param.defaultValue, localCtx) : undefined);
      localCtx.set(param.name.name, val);
    });

    try {
      const result = evaluateBlock(decl.body, localCtx);
      return toBoolean(result);
    } catch (e) {
      if (e instanceof ReturnSignal) return toBoolean(e.value);
      if (e instanceof ConstraintViolationError) return false;
      throw e;
    }
  };

  ctx.set(decl.name.name, fn);
  return fn;
}

function registerFunction(decl: FunctionDeclaration, ctx: EvalContext): (...args: unknown[]) => unknown {
  const fn = (...args: unknown[]): unknown => {
    const localCtx = ctx.child();
    localCtx.pushScope();

    decl.params.forEach((param, idx) => {
      const val = idx < args.length ? args[idx] : (param.defaultValue !== undefined ? evaluateExpression(param.defaultValue, localCtx) : undefined);
      localCtx.set(param.name.name, val);
    });

    try {
      const result = evaluateBlock(decl.body, localCtx);
      return result;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  };

  ctx.set(decl.id.name, fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Internal: statements
// ---------------------------------------------------------------------------

function evaluateBlock(block: BlockStatement, ctx: EvalContext): unknown {
  ctx.pushScope();
  let result: unknown = undefined;
  try {
    for (const stmt of block.body) {
      result = evaluateStatement(stmt, ctx);
    }
  } catch (e) {
    ctx.popScope();
    throw e;
  }
  ctx.popScope();
  return result;
}

function evaluateStatement(stmt: Statement, ctx: EvalContext): unknown {
  switch (stmt.type) {
    case ASTNodeType.RETURN_STATEMENT:
      return evaluateReturnStatement(stmt as ReturnStatement, ctx);

    case ASTNodeType.IF_STATEMENT:
      return evaluateIfStatement(stmt as IfStatement, ctx);

    case ASTNodeType.FOR_STATEMENT:
      return evaluateForStatement(stmt as ForStatement, ctx);

    case ASTNodeType.VARIABLE_DECLARATION:
      return evaluateVariableDeclaration(stmt as VariableDeclaration, ctx);

    case ASTNodeType.EXPRESSION_STATEMENT:
      return evaluateExpression((stmt as ExpressionStatement).expression, ctx);

    default:
      throw new EvaluationError(`Unknown statement type: ${(stmt as any).type}`);
  }
}

function evaluateReturnStatement(stmt: ReturnStatement, ctx: EvalContext): never {
  const value = stmt.argument ? evaluateExpression(stmt.argument, ctx) : undefined;
  throw new ReturnSignal(value);
}

function evaluateIfStatement(stmt: IfStatement, ctx: EvalContext): unknown {
  const condition = toBoolean(evaluateExpression(stmt.test, ctx));
  if (condition) {
    return evaluateBlock(stmt.consequent, ctx);
  } else if (stmt.alternate) {
    return evaluateBlock(stmt.alternate, ctx);
  }
  return undefined;
}

function evaluateForStatement(stmt: ForStatement, ctx: EvalContext): unknown {
  ctx.pushScope();
  try {
    // Init
    if (stmt.init) {
      if (stmt.init.type === ASTNodeType.VARIABLE_DECLARATION) {
        evaluateVariableDeclaration(stmt.init as VariableDeclaration, ctx);
      } else {
        evaluateExpression(stmt.init as Expression, ctx);
      }
    }

    let result: unknown = undefined;
    let iterations = 0;
    const maxIter = 100_000; // Safety cap

    while (iterations < maxIter) {
      // Test
      if (stmt.test && !toBoolean(evaluateExpression(stmt.test, ctx))) break;

      // Body
      try {
        result = evaluateBlock(stmt.body, ctx);
      } catch (e) {
        if (e instanceof ReturnSignal) {
          ctx.popScope();
          throw e;
        }
        throw e;
      }

      // Update
      if (stmt.update) {
        evaluateExpression(stmt.update, ctx);
      }

      iterations++;
    }

    ctx.popScope();
    return result;
  } catch (e) {
    ctx.popScope();
    throw e;
  }
}

function evaluateVariableDeclaration(stmt: VariableDeclaration, ctx: EvalContext): unknown {
  for (const declarator of stmt.declarations) {
    const name = (declarator.id as Identifier).name;
    const value = declarator.init ? evaluateExpression(declarator.init, ctx) : undefined;
    ctx.set(name, value);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Internal: expressions
// ---------------------------------------------------------------------------

function evaluateExpression(expr: Expression, ctx: EvalContext): unknown {
  switch (expr.type) {
    case ASTNodeType.LITERAL:
      return (expr as Literal).value;

    case ASTNodeType.IDENTIFIER: {
      const name = (expr as Identifier).name;
      const val = ctx.get(name);
      if (val === undefined && !ctx.get(name)) {
        // Allow undefined references – they just resolve to undefined
      }
      return val;
    }

    case ASTNodeType.BINARY_EXPRESSION:
      return evaluateBinaryExpression(expr as BinaryExpression, ctx);

    case ASTNodeType.UNARY_EXPRESSION:
      return evaluateUnaryExpression(expr as UnaryExpression, ctx);

    case ASTNodeType.MEMBER_EXPRESSION:
      return evaluateMemberExpression(expr as MemberExpression, ctx);

    case ASTNodeType.CALL_EXPRESSION:
      return evaluateCallExpression(expr as CallExpression, ctx);

    case ASTNodeType.ARRAY_LITERAL:
      return evaluateArrayLiteral(expr as ArrayLiteral, ctx);

    case ASTNodeType.OBJECT_LITERAL:
      return evaluateObjectLiteral(expr as ObjectLiteral, ctx);

    case ASTNodeType.FUNCTION_DECLARATION:
      return evaluateFunctionExpression(expr as FunctionExpression, ctx);

    case 'ArrowFunction':
      return evaluateArrowFunction(expr as ArrowFunction, ctx);

    case 'ConditionalExpression':
      return evaluateConditionalExpression(expr as ConditionalExpression, ctx);

    case 'AssignmentExpression':
      return evaluateAssignmentExpression(expr as AssignmentExpression, ctx);

    default:
      throw new EvaluationError(`Unknown expression type: ${(expr as any).type}`);
  }
}

function evaluateBinaryExpression(expr: BinaryExpression, ctx: EvalContext): unknown {
  const op = String(expr.operator);

  // Short-circuit logical operators
  if (op === '&&') {
    const left = evaluateExpression(expr.left, ctx);
    return toBoolean(left) ? evaluateExpression(expr.right, ctx) : left;
  }
  if (op === '||') {
    const left = evaluateExpression(expr.left, ctx);
    return toBoolean(left) ? left : evaluateExpression(expr.right, ctx);
  }

  // Eager evaluation for all other operators
  const left = evaluateExpression(expr.left, ctx);
  const right = evaluateExpression(expr.right, ctx);

  switch (op) {
    // Arithmetic
    case '+':
      if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
      return toNumber(left) + toNumber(right);
    case '-': return toNumber(left) - toNumber(right);
    case '*': return toNumber(left) * toNumber(right);
    case '/': {
      const r = toNumber(right);
      if (r === 0) throw new EvaluationError('Division by zero');
      return toNumber(left) / r;
    }
    case '%': return toNumber(left) % toNumber(right);
    case '**': return Math.pow(toNumber(left), toNumber(right));

    // Equality
    case '==': return left == right;   // eslint-disable-line eqeqeq
    case '!=': return left != right;   // eslint-disable-line eqeqeq
    case '===': return left === right;
    case '!==': return left !== right;

    // Comparison
    case '<': return toNumber(left) < toNumber(right);
    case '>': return toNumber(left) > toNumber(right);
    case '<=': return toNumber(left) <= toNumber(right);
    case '>=': return toNumber(left) >= toNumber(right);

    default:
      throw new EvaluationError(`Unknown binary operator: ${op}`);
  }
}

function evaluateUnaryExpression(expr: UnaryExpression, ctx: EvalContext): unknown {
  const arg = evaluateExpression(expr.argument, ctx);
  switch (expr.operator) {
    case '!': return !toBoolean(arg);
    case '-': return -toNumber(arg);
    case '+': return toNumber(arg);
    case '~': return ~toNumber(arg);
    default:
      throw new EvaluationError(`Unknown unary operator: ${expr.operator}`);
  }
}

function evaluateMemberExpression(expr: MemberExpression, ctx: EvalContext): unknown {
  const object = evaluateExpression(expr.object, ctx);

  let key: string | number;
  if (expr.computed) {
    // obj[expr]
    const propVal = evaluateExpression(expr.property as Expression, ctx);
    key = typeof propVal === 'number' ? propVal : String(propVal);
  } else {
    // obj.ident
    key = (expr.property as Identifier).name;
  }

  if (object == null) return undefined;

  if (Array.isArray(object)) {
    if (typeof key === 'number') return object[key];
    // Array methods
    if (key === 'length') return object.length;
    return undefined;
  }

  if (object instanceof Map) {
    return object.get(key);
  }

  if (typeof object === 'object') {
    return (object as Record<string, unknown>)[String(key)];
  }

  return undefined;
}

function evaluateCallExpression(expr: CallExpression, ctx: EvalContext): unknown {
  // Evaluate callee – could be an identifier, member expression, etc.
  const callee = evaluateExpression(expr.callee, ctx);
  const args = expr.arguments.map((a) => evaluateExpression(a, ctx));

  if (typeof callee === 'function') {
    return (callee as (...a: unknown[]) => unknown)(...args);
  }

  throw new EvaluationError(`Cannot call non-function value: ${callee}`);
}

function evaluateArrayLiteral(expr: ArrayLiteral, ctx: EvalContext): unknown[] {
  return expr.elements.map((el) => (el !== null ? evaluateExpression(el, ctx) : undefined));
}

function evaluateObjectLiteral(expr: ObjectLiteral, ctx: EvalContext): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const prop of expr.properties) {
    const key = typeof prop.key === 'object' && 'name' in prop.key
      ? (prop.key as Identifier).name
      : String((prop.key as Literal).value);
    obj[key] = evaluateExpression(prop.value, ctx);
  }
  return obj;
}

function evaluateFunctionExpression(expr: FunctionExpression, ctx: EvalContext): (...args: unknown[]) => unknown {
  const capturedCtx = ctx.child();

  const fn = (...args: unknown[]): unknown => {
    const localCtx = capturedCtx.child();
    localCtx.pushScope();

    // Bind parameters
    expr.params.forEach((param, idx) => {
      const val = idx < args.length ? args[idx] : (param.defaultValue !== undefined ? evaluateExpression(param.defaultValue, localCtx) : undefined);
      localCtx.set(param.name.name, val);
    });

    try {
      return evaluateBlock(expr.body, localCtx);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  };

  // If named, register in context
  if (expr.id) {
    ctx.set(expr.id.name, fn);
  }

  return fn;
}

function evaluateArrowFunction(expr: ArrowFunction, ctx: EvalContext): (...args: unknown[]) => unknown {
  const capturedCtx = ctx.child();

  return (...args: unknown[]): unknown => {
    const localCtx = capturedCtx.child();
    localCtx.pushScope();

    expr.params.forEach((param, idx) => {
      const val = idx < args.length ? args[idx] : (param.defaultValue !== undefined ? evaluateExpression(param.defaultValue, localCtx) : undefined);
      localCtx.set(param.name.name, val);
    });

    try {
      if (expr.expression) {
        // Arrow function with expression body: (x) => x + 1
        return evaluateExpression(expr.body as Expression, localCtx);
      } else {
        // Arrow function with block body: (x) => { return x + 1; }
        return evaluateBlock(expr.body as BlockStatement, localCtx);
      }
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  };
}

function evaluateConditionalExpression(expr: ConditionalExpression, ctx: EvalContext): unknown {
  const test = toBoolean(evaluateExpression(expr.test, ctx));
  return test ? evaluateExpression(expr.consequent, ctx) : evaluateExpression(expr.alternate, ctx);
}

function evaluateAssignmentExpression(expr: AssignmentExpression, ctx: EvalContext): unknown {
  const right = evaluateExpression(expr.right, ctx);

  // Target must be an identifier or member expression
  if (expr.left.type === ASTNodeType.IDENTIFIER) {
    const name = (expr.left as Identifier).name;
    let value = right;
    switch (expr.operator) {
      case '=': value = right; break;
      case '+=': value = toNumber(ctx.get(name)) + toNumber(right); break;
      case '-=': value = toNumber(ctx.get(name)) - toNumber(right); break;
      case '*=': value = toNumber(ctx.get(name)) * toNumber(right); break;
      case '/=': value = toNumber(ctx.get(name)) / toNumber(right); break;
      case '%=': value = toNumber(ctx.get(name)) % toNumber(right); break;
    }
    ctx.update(name, value);
    return value;
  }

  if (expr.left.type === ASTNodeType.MEMBER_EXPRESSION) {
    const memberExpr = expr.left as MemberExpression;
    const object = evaluateExpression(memberExpr.object, ctx);
    let key: string | number;
    if (memberExpr.computed) {
      const propVal = evaluateExpression(memberExpr.property as Expression, ctx);
      key = typeof propVal === 'number' ? propVal : String(propVal);
    } else {
      key = (memberExpr.property as Identifier).name;
    }

    let value = right;
    const current = object != null
      ? (Array.isArray(object)
          ? object[typeof key === 'number' ? key : Number(key)]
          : (object as Record<string, unknown>)[String(key)])
      : undefined;

    switch (expr.operator) {
      case '=': value = right; break;
      case '+=': value = toNumber(current) + toNumber(right); break;
      case '-=': value = toNumber(current) - toNumber(right); break;
      case '*=': value = toNumber(current) * toNumber(right); break;
      case '/=': value = toNumber(current) / toNumber(right); break;
      case '%=': value = toNumber(current) % toNumber(right); break;
    }

    if (object != null) {
      if (Array.isArray(object)) {
        (object as unknown[])[typeof key === 'number' ? key : Number(key)] = value;
      } else {
        (object as Record<string, unknown>)[String(key)] = value;
      }
    }
    return value;
  }

  throw new EvaluationError(`Invalid assignment target: ${(expr.left as any).type}`);
}
