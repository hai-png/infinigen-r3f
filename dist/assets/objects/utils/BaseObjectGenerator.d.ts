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
import { SeededRandom } from '../../../../core/util/math/distributions';
export interface BaseGeneratorConfig {
    seed?: number;
    tags?: string[];
    lodLevel?: number;
}
export interface GeneratedObject<T extends THREE.Object3D = THREE.Object3D> {
    mesh: T;
    config: any;
    metadata: {
        generator: string;
        seed: number;
        tags: string[];
        timestamp: number;
    };
}
export declare abstract class BaseObjectGenerator<TConfig extends BaseGeneratorConfig> {
    protected seed: number;
    protected rng: SeededRandom;
    constructor(seed?: number);
    /**
     * Get the default configuration for this generator type
     */
    abstract getDefaultConfig(): TConfig;
    /**
     * Generate the primary object with the given configuration
     */
    abstract generate(config?: Partial<TConfig>): THREE.Object3D;
    /**
     * Generate multiple variations of the object
     */
    getVariations(count: number, baseConfig?: Partial<TConfig>): THREE.Object3D[];
    /**
     * Set the seed for reproducible generation
     */
    setSeed(seed: number): void;
    /**
     * Get current seed
     */
    getSeed(): number;
    /**
     * Add tags to generated object metadata
     */
    protected addTags(object: THREE.Object3D, tags: string[]): void;
    /**
     * Create standard metadata for generated objects
     */
    protected createMetadata(generatorName: string): any;
    /**
     * Merge user config with defaults
     */
    protected mergeConfig(userConfig?: Partial<TConfig>): TConfig;
}
//# sourceMappingURL=BaseObjectGenerator.d.ts.map