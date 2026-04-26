/**
 * BaseObjectGenerator - Abstract base class for all procedural object generators
 *
 * Provides common functionality including:
 * - Seeded random number generation
 * - Default configuration management
 * - Variation generation
 * - Metadata tagging
 */
import { SeededRandom } from '../../../../core/util/math/distributions';
export class BaseObjectGenerator {
    constructor(seed = Math.random() * 10000) {
        this.seed = seed;
        this.rng = new SeededRandom(seed);
    }
    /**
     * Generate multiple variations of the object
     */
    getVariations(count, baseConfig) {
        const variations = [];
        const baseSeed = this.seed;
        for (let i = 0; i < count; i++) {
            this.seed = baseSeed + i;
            this.rng = new SeededRandom(this.seed);
            const variation = this.generate(baseConfig);
            variation.userData.variationIndex = i;
            variations.push(variation);
        }
        // Restore original seed
        this.seed = baseSeed;
        this.rng = new SeededRandom(this.seed);
        return variations;
    }
    /**
     * Set the seed for reproducible generation
     */
    setSeed(seed) {
        this.seed = seed;
        this.rng = new SeededRandom(seed);
    }
    /**
     * Get current seed
     */
    getSeed() {
        return this.seed;
    }
    /**
     * Add tags to generated object metadata
     */
    addTags(object, tags) {
        if (!object.userData.tags) {
            object.userData.tags = [];
        }
        object.userData.tags.push(...tags);
    }
    /**
     * Create standard metadata for generated objects
     */
    createMetadata(generatorName) {
        return {
            generator: generatorName,
            seed: this.seed,
            timestamp: Date.now(),
            tags: []
        };
    }
    /**
     * Merge user config with defaults
     */
    mergeConfig(userConfig = {}) {
        return {
            ...this.getDefaultConfig(),
            ...userConfig,
            seed: userConfig.seed ?? this.seed
        };
    }
}
//# sourceMappingURL=BaseObjectGenerator.js.map