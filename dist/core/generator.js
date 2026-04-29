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
export class Generator {
    constructor(distribution) {
        this.distribution = distribution;
        this.params = distribution();
    }
    toString() {
        return `${this.constructor.name}(${this.distribution.name || 'anonymous'})`;
    }
    /**
     * Call method to trigger generation
     * Prevents direct access to generate method
     */
    call(...args) {
        return this.generate(...args);
    }
}
export default Generator;
//# sourceMappingURL=generator.js.map