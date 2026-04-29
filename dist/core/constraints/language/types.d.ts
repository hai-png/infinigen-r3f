/**
 * Base Node class for constraint language AST
 */
export declare abstract class Node {
    /**
     * Get all children of this node as a Map of field names to child nodes
     */
    abstract children(): Map<string, Node>;
    /**
     * Traverse the AST in depth-first order
     * @param inorder - If true, traverse in inorder (left, root, right)
     */
    traverse(inorder?: boolean): Generator<Node>;
    /**
     * Get the size of the subtree rooted at this node
     */
    size(): number;
    /**
     * Deep clone this node and all its children
     */
    abstract clone(): Node;
}
/**
 * Represents a variable in the constraint language
 */
export declare class Variable extends Node {
    readonly name: string;
    constructor(name: string);
    children(): Map<string, Node>;
    clone(): Variable;
    equals(other: Variable): boolean;
    toString(): string;
}
/**
 * Domain types for variables
 */
export type DomainType = 'object_set' | 'numeric' | 'pose' | 'bbox' | 'boolean';
/**
 * Base class for domains
 */
export declare abstract class Domain {
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
    isSubset(other: Domain): boolean;
    /**
     * Get a sample value from this domain
     */
    abstract sample(seed?: number): any;
}
/**
 * Domain representing a set of objects
 */
export declare class ObjectSetDomain extends Domain {
    readonly includes?: Set<string> | undefined;
    readonly excludes?: Set<string> | undefined;
    readonly tagFilter?: any | undefined;
    readonly type: DomainType;
    constructor(includes?: Set<string> | undefined, excludes?: Set<string> | undefined, tagFilter?: any | undefined);
    implies(other: Domain): boolean;
    satisfies(value: any): boolean;
    intersects(other: Domain): boolean;
    intersect(other: Domain): Domain;
    union(other: Domain): Domain;
    substitute(variable: Variable, replacement: Domain): Domain;
    sample(seed?: number): any;
    clone(): ObjectSetDomain;
    children(): Map<string, Node>;
}
/**
 * Domain representing numeric ranges
 */
export declare class NumericDomain extends Domain {
    readonly min: number;
    readonly max: number;
    readonly discrete?: Set<number> | undefined;
    readonly type: DomainType;
    constructor(min?: number, max?: number, discrete?: Set<number> | undefined);
    implies(other: Domain): boolean;
    satisfies(value: number): boolean;
    intersects(other: Domain): boolean;
    intersect(other: Domain): Domain;
    union(other: Domain): Domain;
    substitute(variable: Variable, replacement: Domain): Domain;
    sample(seed?: number): number;
    clone(): NumericDomain;
    children(): Map<string, Node>;
}
/**
 * Domain representing a pose (position + rotation)
 */
export declare class PoseDomain extends Domain {
    readonly positionDomain?: BBoxDomain | undefined;
    readonly rotationDomain?: NumericDomain | undefined;
    readonly type: DomainType;
    constructor(positionDomain?: BBoxDomain | undefined, rotationDomain?: NumericDomain | undefined);
    implies(other: Domain): boolean;
    satisfies(value: any): boolean;
    intersects(other: Domain): boolean;
    intersect(other: Domain): Domain;
    union(other: Domain): Domain;
    substitute(variable: Variable, replacement: Domain): Domain;
    sample(seed?: number): any;
    clone(): PoseDomain;
    children(): Map<string, Node>;
}
/**
 * Domain representing a bounding box
 */
export declare class BBoxDomain extends Domain {
    readonly mins: number[];
    readonly maxs: number[];
    readonly type: DomainType;
    constructor(mins?: number[], maxs?: number[]);
    implies(other: Domain): boolean;
    satisfies(value: number[]): boolean;
    intersects(other: Domain): boolean;
    intersect(other: Domain): Domain;
    union(other: Domain): Domain;
    substitute(variable: Variable, replacement: Domain): Domain;
    sample(seed?: number): number[];
    clone(): BBoxDomain;
    children(): Map<string, Node>;
}
/**
 * Boolean domain (true/false)
 */
export declare class BooleanDomain extends Domain {
    readonly value?: boolean | undefined;
    readonly type: DomainType;
    constructor(value?: boolean | undefined);
    implies(other: Domain): boolean;
    satisfies(value: boolean): boolean;
    intersects(other: Domain): boolean;
    intersect(other: Domain): Domain;
    union(other: Domain): Domain;
    substitute(variable: Variable, replacement: Domain): Domain;
    sample(seed?: number): boolean;
    clone(): BooleanDomain;
    children(): Map<string, Node>;
}
//# sourceMappingURL=types.d.ts.map