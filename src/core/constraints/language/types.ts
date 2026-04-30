/**
 * Base Node class for constraint language AST
 */
export abstract class Node {
  /** Node type discriminator for pattern matching */
  abstract readonly type: string;

  /**
   * Get all children of this node as a Map of field names to child nodes
   */
  abstract children(): Map<string, Node>;

  /**
   * Traverse the AST in depth-first order
   * @param inorder - If true, traverse in inorder (left, root, right)
   */
  *traverse(inorder: boolean = false): Generator<Node> {
    if (!inorder) {
      yield this;
    }

    for (const [, child] of this.children()) {
      yield* child.traverse(inorder);
    }

    if (inorder) {
      yield this;
    }
  }

  /**
   * Get the size of the subtree rooted at this node
   */
  size(): number {
    let count = 1;
    for (const [, child] of this.children()) {
      count += child.size();
    }
    return count;
  }

  /**
   * Deep clone this node and all its children
   */
  abstract clone(): Node;
}

/**
 * Represents a variable in the constraint language
 */
export class Variable extends Node {
  readonly type = 'Variable';

  /** Unique identifier for this variable */
  readonly id: string;

  /** Domain of this variable */
  domain: Domain;

  /** Current value of this variable */
  currentValue: any;

  /** Whether this variable is fixed (cannot be changed by solver) */
  isFixed: boolean;

  constructor(
    public readonly name: string,
    domain?: Domain,
    id?: string
  ) {
    super();
    this.id = id ?? name;
    this.domain = domain ?? new NumericDomain();
    this.currentValue = undefined;
    this.isFixed = false;
  }

  /** Get/set the value of this variable (alias for currentValue) */
  get value(): any {
    return this.currentValue;
  }
  set value(v: any) {
    this.currentValue = v;
  }

  children(): Map<string, Node> {
    return new Map();
  }

  clone(): Variable {
    const v = new Variable(this.name, this.domain.clone(), this.id);
    v.currentValue = this.currentValue;
    v.isFixed = this.isFixed;
    return v;
  }

  equals(other: Variable): boolean {
    return this.name === other.name;
  }

  toString(): string {
    return `Var(${this.name})`;
  }
}

/**
 * Domain types for variables
 */
export type DomainType = 'object_set' | 'numeric' | 'pose' | 'bbox' | 'boolean' | 'NumericDomain' | 'ObjectSetDomain' | 'PoseDomain' | 'BBoxDomain' | 'BooleanDomain';

/**
 * Base class for domains
 */
export abstract class Domain {
  abstract readonly type: DomainType;
  
  /**
   * Check if this domain implies another domain
   */
  abstract implies(other: Domain): boolean;

  /**
   * Check if a value satisfies this domain
   */
  abstract satisfies(value: any): boolean;

  /**
   * Check if this domain intersects with another
   */
  abstract intersects(other: Domain): boolean;

  /**
   * Compute the intersection of two domains
   */
  abstract intersect(other: Domain): Domain;

  /**
   * Compute the union of two domains
   */
  abstract union(other: Domain): Domain;

  /**
   * Substitute a variable with another domain
   */
  abstract substitute(variable: Variable, replacement: Domain): Domain;

  /**
   * Check if this domain is a subset of another
   */
  isSubset(other: Domain): boolean {
    return this.implies(other);
  }

  /**
   * Get a sample value from this domain
   */
  abstract sample(seed?: number): any;
}

/**
 * Domain representing a set of objects
 */
export class ObjectSetDomain extends Domain {
  readonly type: DomainType = 'object_set';

  /** Allowed objects in this domain */
  allowedObjects: any[];

  /** Minimum set size */
  minSize?: number;

  /** Maximum set size */
  maxSize?: number;

  /** Set of explicitly included object IDs */
  includes?: Set<string>;

  constructor(
    includesOrObjects?: Set<string> | any[],
    public readonly excludes?: Set<string>,
    public readonly tagFilter?: any, // TagExpression
    /** Alias for includes - objects in this domain */
    public readonly objects?: Set<string>
  ) {
    super();
    this.allowedObjects = [];
    if (includesOrObjects) {
      if (includesOrObjects instanceof Set) {
        this.includes = includesOrObjects;
      } else if (Array.isArray(includesOrObjects)) {
        // Accept arrays (e.g., from unionDomains in constraint-domain.ts)
        this.allowedObjects = includesOrObjects;
        this.includes = new Set(includesOrObjects.map((o: any) => 
          typeof o === 'string' ? o : (o.id ?? String(o))
        ));
      }
    }
  }

  implies(other: Domain): boolean {
    if (!(other instanceof ObjectSetDomain)) {
      return false;
    }
    
    // If we have explicit includes, they must be a superset of other's includes
    if (this.includes && other.includes) {
      for (const obj of other.includes) {
        if (!this.includes.has(obj)) {
          return false;
        }
      }
    }
    
    // If we have explicit excludes, they must be a subset of other's excludes
    if (this.excludes && other.excludes) {
      for (const obj of this.excludes) {
        if (!other.excludes.has(obj)) {
          return false;
        }
      }
    }
    
    return true;
  }

  satisfies(value: any): boolean {
    if (this.includes && !this.includes.has(value)) {
      return false;
    }
    if (this.excludes && this.excludes.has(value)) {
      return false;
    }
    return true;
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof ObjectSetDomain)) {
      return false;
    }
    
    // Check if includes conflict with excludes
    if (this.includes && other.excludes) {
      for (const obj of this.includes) {
        if (other.excludes.has(obj)) {
          return false;
        }
      }
    }
    
    if (other.includes && this.excludes) {
      for (const obj of other.includes) {
        if (this.excludes.has(obj)) {
          return false;
        }
      }
    }
    
    return true;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof ObjectSetDomain)) {
      return this;
    }

    const includes = new Set<string>();
    const excludes = new Set<string>();

    // Intersection of includes
    if (this.includes && other.includes) {
      for (const obj of this.includes) {
        if (other.includes.has(obj)) {
          includes.add(obj);
        }
      }
    } else if (this.includes) {
      for (const obj of this.includes) {
        includes.add(obj);
      }
    } else if (other.includes) {
      for (const obj of other.includes) {
        includes.add(obj);
      }
    }

    // Union of excludes
    if (this.excludes) {
      for (const obj of this.excludes) {
        excludes.add(obj);
      }
    }
    if (other.excludes) {
      for (const obj of other.excludes) {
        excludes.add(obj);
      }
    }

    return new ObjectSetDomain(includes, excludes);
  }

  union(other: Domain): Domain {
    if (!(other instanceof ObjectSetDomain)) {
      return this;
    }

    const excludes = new Set<string>();

    // Intersection of excludes (both must exclude)
    if (this.excludes && other.excludes) {
      for (const obj of this.excludes) {
        if (other.excludes.has(obj)) {
          excludes.add(obj);
        }
      }
    }

    return new ObjectSetDomain(undefined, excludes);
  }

  substitute(variable: Variable, replacement: Domain): Domain {
    return this; // ObjectSetDomain doesn't contain variables
  }

  sample(seed?: number): any {
    if (this.includes && this.includes.size > 0) {
      const idx = seed ? Math.floor(Math.abs(Math.sin(seed) * 1000000) % this.includes.size) : 0;
      return Array.from(this.includes)[idx];
    }
    return null;
  }

  clone(): ObjectSetDomain {
    return new ObjectSetDomain(
      this.includes ? new Set(this.includes) : undefined,
      this.excludes ? new Set(this.excludes) : undefined,
      this.tagFilter
    );
  }

  children(): Map<string, Node> {
    return new Map();
  }
}

/**
 * Domain representing numeric ranges
 */
export class NumericDomain extends Domain {
  readonly type: DomainType = 'numeric';

  /** Lower bound (alias for min) */
  readonly lower: number;

  /** Upper bound (alias for max) */
  readonly upper: number;

  /** Unit of measurement */
  unit?: string;

  /** Whether only integer values are allowed */
  isInteger: boolean;

  constructor(
    public readonly min: number = -Infinity,
    public readonly max: number = Infinity,
    public readonly discrete?: Set<number>
  ) {
    super();
    this.lower = min;
    this.upper = max;
    this.isInteger = false;
  }

  implies(other: Domain): boolean {
    if (!(other instanceof NumericDomain)) {
      return false;
    }

    if (this.discrete && other.discrete) {
      for (const val of this.discrete) {
        if (!other.discrete.has(val)) {
          return false;
        }
      }
      return true;
    }

    if (this.discrete) {
      for (const val of this.discrete) {
        if (val < other.min || val > other.max) {
          return false;
        }
      }
      return true;
    }

    if (other.discrete) {
      return false; // Range can't imply discrete set
    }

    return this.min >= other.min && this.max <= other.max;
  }

  satisfies(value: number): boolean {
    if (this.discrete) {
      return this.discrete.has(value);
    }
    return value >= this.min && value <= this.max;
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof NumericDomain)) {
      return false;
    }

    if (this.discrete && other.discrete) {
      for (const val of this.discrete) {
        if (other.discrete.has(val)) {
          return true;
        }
      }
      return false;
    }

    if (this.discrete) {
      for (const val of this.discrete) {
        if (val >= other.min && val <= other.max) {
          return true;
        }
      }
      return false;
    }

    if (other.discrete) {
      for (const val of other.discrete) {
        if (val >= this.min && val <= this.max) {
          return true;
        }
      }
      return false;
    }

    return this.min <= other.max && this.max >= other.min;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof NumericDomain)) {
      return this;
    }

    if (this.discrete && other.discrete) {
      const intersection = new Set<number>();
      for (const val of this.discrete) {
        if (other.discrete.has(val)) {
          intersection.add(val);
        }
      }
      return new NumericDomain(-Infinity, Infinity, intersection);
    }

    if (this.discrete) {
      const filtered = new Set<number>();
      for (const val of this.discrete) {
        if (val >= other.min && val <= other.max) {
          filtered.add(val);
        }
      }
      return new NumericDomain(-Infinity, Infinity, filtered);
    }

    if (other.discrete) {
      const filtered = new Set<number>();
      for (const val of other.discrete) {
        if (val >= this.min && val <= this.max) {
          filtered.add(val);
        }
      }
      return new NumericDomain(-Infinity, Infinity, filtered);
    }

    return new NumericDomain(
      Math.max(this.min, other.min),
      Math.min(this.max, other.max)
    );
  }

  union(other: Domain): Domain {
    if (!(other instanceof NumericDomain)) {
      return this;
    }

    if (this.discrete && other.discrete) {
      const union = new Set<number>([...this.discrete, ...other.discrete]);
      return new NumericDomain(-Infinity, Infinity, union);
    }

    // For continuous ranges, return unbounded if they don't overlap
    if (!this.intersects(other)) {
      return new NumericDomain(-Infinity, Infinity);
    }

    return new NumericDomain(
      Math.min(this.min, other.min),
      Math.max(this.max, other.max)
    );
  }

  substitute(variable: Variable, replacement: Domain): Domain {
    return this;
  }

  sample(seed?: number): number {
    if (this.discrete && this.discrete.size > 0) {
      const arr = Array.from(this.discrete);
      const idx = seed ? Math.floor(Math.abs(Math.sin(seed) * 1000000) % arr.length) : 0;
      return arr[idx];
    }
    
    const range = this.max - this.min;
    if (!isFinite(range)) {
      return 0;
    }
    
    const random = seed ? Math.abs(Math.sin(seed)) : Math.random();
    return this.min + random * range;
  }

  clone(): NumericDomain {
    return new NumericDomain(
      this.min,
      this.max,
      this.discrete ? new Set(this.discrete) : undefined
    );
  }

  children(): Map<string, Node> {
    return new Map();
  }
}

/**
 * Domain representing a pose (position + rotation)
 */
export class PoseDomain extends Domain {
  readonly type: DomainType = 'pose';

  /** Position bounds */
  positionBounds?: {
    x: { min: number; max: number };
    y: { min: number; max: number };
    z: { min: number; max: number };
  };

  /** Rotation bounds */
  rotationBounds?: {
    x: { min: number; max: number };
    y: { min: number; max: number };
    z: { min: number; max: number };
  };

  constructor(
    public readonly positionDomain?: BBoxDomain,
    public readonly rotationDomain?: NumericDomain // Euler angles
  ) {
    super();
  }

  implies(other: Domain): boolean {
    if (!(other instanceof PoseDomain)) {
      return false;
    }

    if (this.positionDomain && other.positionDomain) {
      if (!this.positionDomain.implies(other.positionDomain)) {
        return false;
      }
    }

    if (this.rotationDomain && other.rotationDomain) {
      if (!this.rotationDomain.implies(other.rotationDomain)) {
        return false;
      }
    }

    return true;
  }

  satisfies(value: any): boolean {
    // value should be { position: Vector3, rotation: Vector3 }
    if (this.positionDomain && !this.positionDomain.satisfies(value.position)) {
      return false;
    }
    if (this.rotationDomain && !this.rotationDomain.satisfies(value.rotation)) {
      return false;
    }
    return true;
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof PoseDomain)) {
      return false;
    }

    if (this.positionDomain && other.positionDomain) {
      if (!this.positionDomain.intersects(other.positionDomain)) {
        return false;
      }
    }

    if (this.rotationDomain && other.rotationDomain) {
      if (!this.rotationDomain.intersects(other.rotationDomain)) {
        return false;
      }
    }

    return true;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof PoseDomain)) {
      return this;
    }

    const posIntersect = this.positionDomain?.intersect(other.positionDomain || new BBoxDomain());
    const rotIntersect = this.rotationDomain?.intersect(other.rotationDomain || new NumericDomain());

    return new PoseDomain(
      posIntersect instanceof BBoxDomain ? posIntersect : undefined,
      rotIntersect instanceof NumericDomain ? rotIntersect : undefined
    );
  }

  union(other: Domain): Domain {
    if (!(other instanceof PoseDomain)) {
      return this;
    }

    const posUnion = this.positionDomain?.union(other.positionDomain || new BBoxDomain());
    const rotUnion = this.rotationDomain?.union(other.rotationDomain || new NumericDomain());

    return new PoseDomain(
      posUnion instanceof BBoxDomain ? posUnion : undefined,
      rotUnion instanceof NumericDomain ? rotUnion : undefined
    );
  }

  substitute(variable: Variable, replacement: Domain): Domain {
    return this;
  }

  sample(seed?: number): any {
    return {
      position: this.positionDomain?.sample(seed) || [0, 0, 0],
      rotation: this.rotationDomain?.sample(seed) || [0, 0, 0]
    };
  }

  clone(): PoseDomain {
    return new PoseDomain(
      this.positionDomain?.clone(),
      this.rotationDomain?.clone()
    );
  }

  children(): Map<string, Node> {
    return new Map();
  }
}

/**
 * Domain representing a bounding box
 */
export class BBoxDomain extends Domain {
  readonly type: DomainType = 'bbox';

  /** Minimum size constraints [x, y, z] */
  minSize?: number[];

  /** Maximum size constraints [x, y, z] */
  maxSize?: number[];

  constructor(
    public readonly mins: number[] = [-Infinity, -Infinity, -Infinity],
    public readonly maxs: number[] = [Infinity, Infinity, Infinity]
  ) {
    super();
  }

  implies(other: Domain): boolean {
    if (!(other instanceof BBoxDomain)) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      if (this.mins[i] < other.mins[i] || this.maxs[i] > other.maxs[i]) {
        return false;
      }
    }
    return true;
  }

  satisfies(value: number[]): boolean {
    for (let i = 0; i < 3; i++) {
      if (value[i] < this.mins[i] || value[i] > this.maxs[i]) {
        return false;
      }
    }
    return true;
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof BBoxDomain)) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      if (this.mins[i] > other.maxs[i] || this.maxs[i] < other.mins[i]) {
        return false;
      }
    }
    return true;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof BBoxDomain)) {
      return this;
    }

    const mins = this.mins.map((v, i) => Math.max(v, other.mins[i]));
    const maxs = this.maxs.map((v, i) => Math.min(v, other.maxs[i]));
    return new BBoxDomain(mins, maxs);
  }

  union(other: Domain): Domain {
    if (!(other instanceof BBoxDomain)) {
      return this;
    }

    const mins = this.mins.map((v, i) => Math.min(v, other.mins[i]));
    const maxs = this.maxs.map((v, i) => Math.max(v, other.maxs[i]));
    return new BBoxDomain(mins, maxs);
  }

  substitute(variable: Variable, replacement: Domain): Domain {
    return this;
  }

  sample(seed?: number): number[] {
    return this.mins.map((min, i) => {
      const max = this.maxs[i];
      const range = max - min;
      if (!isFinite(range)) {
        return 0;
      }
      const random = seed ? Math.abs(Math.sin(seed + i)) : Math.random();
      return min + random * range;
    });
  }

  clone(): BBoxDomain {
    return new BBoxDomain([...this.mins], [...this.maxs]);
  }

  children(): Map<string, Node> {
    return new Map();
  }
}

/**
 * Boolean domain (true/false)
 */
export class BooleanDomain extends Domain {
  readonly type: DomainType = 'boolean';

  constructor(public readonly value?: boolean) {
    super();
  }

  implies(other: Domain): boolean {
    if (!(other instanceof BooleanDomain)) {
      return false;
    }

    if (this.value !== undefined && other.value !== undefined) {
      return this.value === other.value;
    }

    if (other.value !== undefined) {
      return false; // Unspecified can't imply specific
    }

    return true;
  }

  satisfies(value: boolean): boolean {
    if (this.value !== undefined) {
      return value === this.value;
    }
    return true;
  }

  intersects(other: Domain): boolean {
    if (!(other instanceof BooleanDomain)) {
      return false;
    }

    if (this.value !== undefined && other.value !== undefined) {
      return this.value === other.value;
    }

    return true;
  }

  intersect(other: Domain): Domain {
    if (!(other instanceof BooleanDomain)) {
      return this;
    }

    if (this.value !== undefined && other.value !== undefined) {
      if (this.value !== other.value) {
        return new BooleanDomain(); // Empty domain
      }
      return new BooleanDomain(this.value);
    }

    if (this.value !== undefined) {
      return new BooleanDomain(this.value);
    }

    if (other.value !== undefined) {
      return new BooleanDomain(other.value);
    }

    return new BooleanDomain();
  }

  union(other: Domain): Domain {
    if (!(other instanceof BooleanDomain)) {
      return this;
    }

    if (this.value !== undefined && other.value !== undefined) {
      if (this.value !== other.value) {
        return new BooleanDomain(); // All values
      }
      return new BooleanDomain(this.value);
    }

    return new BooleanDomain();
  }

  substitute(variable: Variable, replacement: Domain): Domain {
    return this;
  }

  sample(seed?: number): boolean {
    if (this.value !== undefined) {
      return this.value;
    }
    return seed ? Math.abs(Math.sin(seed)) > 0.5 : Math.random() > 0.5;
  }

  clone(): BooleanDomain {
    return new BooleanDomain(this.value);
  }

  children(): Map<string, Node> {
    return new Map();
  }
}

// ============================================================================
// Constraint Language Types
// ============================================================================

/**
 * Constraint types for the constraint language
 */
export type ConstraintType = 
  | 'equality'
  | 'inequality'
  | 'distance'
  | 'alignment'
  | 'containment'
  | 'collision_avoidance'
  | 'visibility'
  | 'accessibility'
  | 'proportion'
  | 'custom';

/**
 * Constraint operators
 */
export type ConstraintOperator = 
  | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'in' | 'not_in'
  | 'contains' | 'overlaps'
  | 'aligned' | 'parallel' | 'perpendicular';

/**
 * Comparison operators for expressions
 */
export type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';

/**
 * Arithmetic operators for expressions
 */
export type ArithmeticOperator = '+' | '-' | '*' | '/' | '^' | '%' | 'min' | 'max';

/**
 * Boolean operators for expressions
 */
export type BooleanOperator = 'and' | 'or' | 'not' | 'xor' | 'implies';

/**
 * Constraint node in the AST - union of all constraint node types
 */
export type ConstraintNode =
  | AndNode
  | OrNode
  | NotNode
  | ConstantConstraintNode
  | ComparisonNode;

/**
 * And constraint node
 */
export interface AndNode {
  type: 'And';
  children: ConstraintNode[];
}

/**
 * Or constraint node
 */
export interface OrNode {
  type: 'Or';
  children: ConstraintNode[];
}

/**
 * Not constraint node
 */
export interface NotNode {
  type: 'Not';
  child: ConstraintNode;
}

/**
 * Constant boolean constraint node
 */
export interface ConstantConstraintNode {
  type: 'Constant';
  value: boolean;
}

/**
 * Comparison constraint node
 */
export interface ComparisonNode {
  type: 'Comparison';
  op: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

/**
 * Expression node type - union of all expression node types
 */
export type ExpressionNode =
  | ConstantExprNode
  | VariableExprNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallExprNode
  | IfElseNode;

/**
 * Constant value expression
 */
export interface ConstantExprNode {
  type: 'Constant';
  value: number | boolean | string;
  domain?: Domain;
}

/**
 * Variable reference expression
 */
export interface VariableExprNode {
  type: 'Variable';
  name: string;
  domain?: Domain;
}

/**
 * Binary operation expression
 */
export interface BinaryOpNode {
  type: 'BinaryOp';
  op: string;
  left: ExpressionNode;
  right: ExpressionNode;
  domain?: Domain;
}

/**
 * Unary operation expression
 */
export interface UnaryOpNode {
  type: 'UnaryOp';
  op: string;
  child: ExpressionNode;
  domain?: Domain;
}

/**
 * Function call expression
 */
export interface FunctionCallExprNode {
  type: 'FunctionCall';
  name: string;
  args: ExpressionNode[];
  domain?: Domain;
}

/**
 * If-else expression
 */
export interface IfElseNode {
  type: 'IfElse';
  condition: ExpressionNode;
  thenExpr: ExpressionNode;
  elseExpr: ExpressionNode;
}

/**
 * Alias for expression (used by some consumers)
 */
export type Expression = ExpressionNode;

/**
 * Alias for constant in constraint language
 */
export type Constant = ConstantExprNode;

/**
 * A constraint in the constraint language (structured form)
 */
export interface Constraint {
  id: string;
  type: ConstraintType;
  operator: ConstraintOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  weight?: number;
  priority?: number;
  description?: string;
  tags?: string[];
}

/**
 * Named constraint with metadata
 */
export interface NamedConstraint extends Constraint {
  name: string;
  source?: string;
}

/**
 * A problem definition for the constraint solver
 */
export interface Problem {
  id: string;
  name: string;
  variables: Variable[];
  constraints: Constraint[];
  objective?: ExpressionNode;
  domains?: Record<string, Domain>;
  metadata?: Record<string, any>;
}

/**
 * Scene constant definition
 */
export interface SceneConstant {
  name: string;
  value: number | string | boolean;
  type: 'numeric' | 'string' | 'boolean';
}

/**
 * InRange check expression
 */
export interface InRange {
  type: 'in_range';
  value: ExpressionNode;
  min: ExpressionNode;
  max: ExpressionNode;
}

/**
 * Relation types for object relationships
 */
export type RelationType = 
  | 'on' | 'inside' | 'next_to' | 'facing' | 'against'
  | 'above' | 'below' | 'left_of' | 'right_of' | 'between'
  | 'attached' | 'supports' | 'covers' | 'surrounds';

/**
 * Relation node in the constraint language
 */
export interface RelationNode {
  type: 'relation';
  relation: RelationType;
  subject: ExpressionNode;
  object: ExpressionNode;
  negated?: boolean;
}

/**
 * Set expression node
 */
export interface SetExpressionNode {
  type: 'set';
  operation: 'union' | 'intersection' | 'difference' | 'complement';
  operands: ExpressionNode[];
}

/**
 * Filter objects node
 */
export interface FilterObjectsNode {
  type: 'filter';
  predicate: ExpressionNode;
  source?: ExpressionNode;
}

/**
 * Quantifier shortcuts
 */
export type ForAll = ConstraintNode;
export type SumOver = ConstraintNode;
export type MeanOver = ConstraintNode;
export type Addition = BinaryOpNode;
export type Deletion = BinaryOpNode;
export type Resample = FunctionCallExprNode;
export type DebugPrint = FunctionCallExprNode;
export type Tagged = ExpressionNode;
export type Item = VariableExprNode;

/**
 * Violation report for constraint evaluation
 */
export interface ViolationReport {
  constraintId: string;
  description: string;
  severity: 'error' | 'warning';
  value: any;
  expected: any;
}

/**
 * Scene object in the constraint language
 */
export interface SceneObject {
  id: string;
  type: string;
  tags: string[];
  properties: Record<string, any>;
  children?: SceneObject[];
}

/**
 * Node domain mapping
 */
export type NodeDomain = Domain;

/**
 * Node execution context
 */
export interface NodeExecutionContext {
  variables: Map<string, any>;
  functions: Map<string, (...args: any[]) => any>;
  depth: number;
  maxDepth: number;
  metadata: Record<string, any>;
}

/**
 * Node context for evaluation
 */
export interface NodeContext {
  bindings: Map<string, any>;
  parent?: NodeContext;
  scope: Map<string, any>;
}

/**
 * Neighbor type for spatial relations
 */
export type NeighborType = 'adjacent' | 'diagonal' | 'cardinal' | 'all';

/**
 * Relation plane change for constraint solver moves
 */
export interface RelationPlaneChange {
  relation: string;
  fromPlane: string;
  toPlane: string;
}

/**
 * Reinit pose move for constraint solver
 */
export interface ReinitPoseMove {
  variable: string;
  newDomain: Domain;
}

/**
 * Quaternion inputs/outputs
 */
export interface QuaternionInputs {
  angle: number;
  axis: [number, number, number];
}
export interface QuaternionOutputs {
  quaternion: [number, number, number, number];
}

/**
 * Geometry node definition
 */
export interface GeometryNodeDefinition {
  type: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  execute?: (...args: any[]) => any;
}

/**
 * Satisfies function alias for constraint checking
 */
export function satisfies(constraint: Constraint, assignment: Map<string, any>): boolean {
  return true; // Placeholder - actual implementation would evaluate the constraint
}
