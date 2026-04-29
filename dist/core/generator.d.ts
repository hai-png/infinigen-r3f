/**
 * Copyright (C) 2025, Princeton University.
 * This source code is licensed under the BSD 3-Clause license.
 *
 * Authors: Ported from Python InfiniGen
 * - Alexander Raistrick (original Python author)
 */
/**
 * Base Generator class for procedural generation
 * All generators should extend this class
 */
export declare abstract class Generator<T = any, P = any> {
    protected distribution: () => P;
    params: P;
    constructor(distribution: () => P);
    toString(): string;
    /**
     * Subclasses must implement this method
     */
    abstract generate(...args: any[]): T;
    /**
     * Call method to trigger generation
     * Prevents direct access to generate method
     */
    call(...args: any[]): T;
}
export default Generator;
//# sourceMappingURL=generator.d.ts.map