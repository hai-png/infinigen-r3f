/**
 * Base Node class for constraint language AST
 */
export class Node {
    /**
     * Traverse the AST in depth-first order
     * @param inorder - If true, traverse in inorder (left, root, right)
     */
    *traverse(inorder = false) {
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
    size() {
        let count = 1;
        for (const [, child] of this.children()) {
            count += child.size();
        }
        return count;
    }
}
/**
 * Represents a variable in the constraint language
 */
export class Variable extends Node {
    constructor(name) {
        super();
        this.name = name;
    }
    children() {
        return new Map();
    }
    clone() {
        return new Variable(this.name);
    }
    equals(other) {
        return this.name === other.name;
    }
    toString() {
        return `Var(${this.name})`;
    }
}
/**
 * Base class for domains
 */
export class Domain {
    /**
     * Check if this domain is a subset of another
     */
    isSubset(other) {
        return this.implies(other);
    }
}
/**
 * Domain representing a set of objects
 */
export class ObjectSetDomain extends Domain {
    constructor(includes, excludes, tagFilter // TagExpression
    ) {
        super();
        this.includes = includes;
        this.excludes = excludes;
        this.tagFilter = tagFilter;
        this.type = 'object_set';
    }
    implies(other) {
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
    satisfies(value) {
        if (this.includes && !this.includes.has(value)) {
            return false;
        }
        if (this.excludes && this.excludes.has(value)) {
            return false;
        }
        return true;
    }
    intersects(other) {
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
    intersect(other) {
        if (!(other instanceof ObjectSetDomain)) {
            return this;
        }
        const includes = new Set();
        const excludes = new Set();
        // Intersection of includes
        if (this.includes && other.includes) {
            for (const obj of this.includes) {
                if (other.includes.has(obj)) {
                    includes.add(obj);
                }
            }
        }
        else if (this.includes) {
            for (const obj of this.includes) {
                includes.add(obj);
            }
        }
        else if (other.includes) {
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
    union(other) {
        if (!(other instanceof ObjectSetDomain)) {
            return this;
        }
        const excludes = new Set();
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
    substitute(variable, replacement) {
        return this; // ObjectSetDomain doesn't contain variables
    }
    sample(seed) {
        if (this.includes && this.includes.size > 0) {
            const idx = seed ? Math.floor(Math.abs(Math.sin(seed) * 1000000) % this.includes.size) : 0;
            return Array.from(this.includes)[idx];
        }
        return null;
    }
    clone() {
        return new ObjectSetDomain(this.includes ? new Set(this.includes) : undefined, this.excludes ? new Set(this.excludes) : undefined, this.tagFilter);
    }
    children() {
        return new Map();
    }
}
/**
 * Domain representing numeric ranges
 */
export class NumericDomain extends Domain {
    constructor(min = -Infinity, max = Infinity, discrete) {
        super();
        this.min = min;
        this.max = max;
        this.discrete = discrete;
        this.type = 'numeric';
    }
    implies(other) {
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
    satisfies(value) {
        if (this.discrete) {
            return this.discrete.has(value);
        }
        return value >= this.min && value <= this.max;
    }
    intersects(other) {
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
    intersect(other) {
        if (!(other instanceof NumericDomain)) {
            return this;
        }
        if (this.discrete && other.discrete) {
            const intersection = new Set();
            for (const val of this.discrete) {
                if (other.discrete.has(val)) {
                    intersection.add(val);
                }
            }
            return new NumericDomain(-Infinity, Infinity, intersection);
        }
        if (this.discrete) {
            const filtered = new Set();
            for (const val of this.discrete) {
                if (val >= other.min && val <= other.max) {
                    filtered.add(val);
                }
            }
            return new NumericDomain(-Infinity, Infinity, filtered);
        }
        if (other.discrete) {
            const filtered = new Set();
            for (const val of other.discrete) {
                if (val >= this.min && val <= this.max) {
                    filtered.add(val);
                }
            }
            return new NumericDomain(-Infinity, Infinity, filtered);
        }
        return new NumericDomain(Math.max(this.min, other.min), Math.min(this.max, other.max));
    }
    union(other) {
        if (!(other instanceof NumericDomain)) {
            return this;
        }
        if (this.discrete && other.discrete) {
            const union = new Set([...this.discrete, ...other.discrete]);
            return new NumericDomain(-Infinity, Infinity, union);
        }
        // For continuous ranges, return unbounded if they don't overlap
        if (!this.intersects(other)) {
            return new NumericDomain(-Infinity, Infinity);
        }
        return new NumericDomain(Math.min(this.min, other.min), Math.max(this.max, other.max));
    }
    substitute(variable, replacement) {
        return this;
    }
    sample(seed) {
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
    clone() {
        return new NumericDomain(this.min, this.max, this.discrete ? new Set(this.discrete) : undefined);
    }
    children() {
        return new Map();
    }
}
/**
 * Domain representing a pose (position + rotation)
 */
export class PoseDomain extends Domain {
    constructor(positionDomain, rotationDomain // Euler angles
    ) {
        super();
        this.positionDomain = positionDomain;
        this.rotationDomain = rotationDomain;
        this.type = 'pose';
    }
    implies(other) {
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
    satisfies(value) {
        // value should be { position: Vector3, rotation: Vector3 }
        if (this.positionDomain && !this.positionDomain.satisfies(value.position)) {
            return false;
        }
        if (this.rotationDomain && !this.rotationDomain.satisfies(value.rotation)) {
            return false;
        }
        return true;
    }
    intersects(other) {
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
    intersect(other) {
        if (!(other instanceof PoseDomain)) {
            return this;
        }
        return new PoseDomain(this.positionDomain?.intersect(other.positionDomain || new BBoxDomain()), this.rotationDomain?.intersect(other.rotationDomain || new NumericDomain()));
    }
    union(other) {
        if (!(other instanceof PoseDomain)) {
            return this;
        }
        return new PoseDomain(this.positionDomain?.union(other.positionDomain || new BBoxDomain()), this.rotationDomain?.union(other.rotationDomain || new NumericDomain()));
    }
    substitute(variable, replacement) {
        return this;
    }
    sample(seed) {
        return {
            position: this.positionDomain?.sample(seed) || [0, 0, 0],
            rotation: this.rotationDomain?.sample(seed) || [0, 0, 0]
        };
    }
    clone() {
        return new PoseDomain(this.positionDomain?.clone(), this.rotationDomain?.clone());
    }
    children() {
        return new Map();
    }
}
/**
 * Domain representing a bounding box
 */
export class BBoxDomain extends Domain {
    constructor(mins = [-Infinity, -Infinity, -Infinity], maxs = [Infinity, Infinity, Infinity]) {
        super();
        this.mins = mins;
        this.maxs = maxs;
        this.type = 'bbox';
    }
    implies(other) {
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
    satisfies(value) {
        for (let i = 0; i < 3; i++) {
            if (value[i] < this.mins[i] || value[i] > this.maxs[i]) {
                return false;
            }
        }
        return true;
    }
    intersects(other) {
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
    intersect(other) {
        if (!(other instanceof BBoxDomain)) {
            return this;
        }
        const mins = this.mins.map((v, i) => Math.max(v, other.mins[i]));
        const maxs = this.maxs.map((v, i) => Math.min(v, other.maxs[i]));
        return new BBoxDomain(mins, maxs);
    }
    union(other) {
        if (!(other instanceof BBoxDomain)) {
            return this;
        }
        const mins = this.mins.map((v, i) => Math.min(v, other.mins[i]));
        const maxs = this.maxs.map((v, i) => Math.max(v, other.maxs[i]));
        return new BBoxDomain(mins, maxs);
    }
    substitute(variable, replacement) {
        return this;
    }
    sample(seed) {
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
    clone() {
        return new BBoxDomain([...this.mins], [...this.maxs]);
    }
    children() {
        return new Map();
    }
}
/**
 * Boolean domain (true/false)
 */
export class BooleanDomain extends Domain {
    constructor(value) {
        super();
        this.value = value;
        this.type = 'boolean';
    }
    implies(other) {
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
    satisfies(value) {
        if (this.value !== undefined) {
            return value === this.value;
        }
        return true;
    }
    intersects(other) {
        if (!(other instanceof BooleanDomain)) {
            return false;
        }
        if (this.value !== undefined && other.value !== undefined) {
            return this.value === other.value;
        }
        return true;
    }
    intersect(other) {
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
    union(other) {
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
    substitute(variable, replacement) {
        return this;
    }
    sample(seed) {
        if (this.value !== undefined) {
            return this.value;
        }
        return seed ? Math.abs(Math.sin(seed)) > 0.5 : Math.random() > 0.5;
    }
    clone() {
        return new BooleanDomain(this.value);
    }
    children() {
        return new Map();
    }
}
//# sourceMappingURL=types.js.map