/**
 * BaseObjectGenerator - Abstract base class for all procedural object generators
 *
 * Provides common functionality including:
 * - Seeded random number generation
 * - Default configuration management
 * - Variation generation
 * - Metadata tagging
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../core/util/math/index';
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
    validateAndMergeParams(userConfig = {}) {
        return this.mergeConfig(userConfig);
    }
    validateAndMerge(userConfig = {}) {
        return this.mergeConfig(userConfig);
    }
    seededRandom() {
        return this.rng.random();
    }
    createMesh(geometry, material) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
    createPBRMaterial(params) {
        return new THREE.MeshStandardMaterial({
            roughness: 0.8,
            metalness: 0.2,
            ...params
        });
    }
    getCollisionMaterial() {
        return new THREE.MeshBasicMaterial({
            visible: false,
            wireframe: true
        });
    }
    getMetalMaterial(type = 'steel') {
        const configs = {
            'steel': { color: 0xaaaaaa, metalness: 0.9, roughness: 0.2 },
            'aluminum': { color: 0xdddddd, metalness: 0.9, roughness: 0.15 },
            'brass': { color: 0xffd700, metalness: 0.9, roughness: 0.25 },
            'copper': { color: 0xb87333, metalness: 0.9, roughness: 0.3 },
            'iron': { color: 0x666666, metalness: 0.8, roughness: 0.4 },
        };
        const config = configs[type] || configs['steel'];
        return this.createPBRMaterial(config);
    }
}
//# sourceMappingURL=BaseObjectGenerator.js.map