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
import { SeededRandom } from '../../../../core/util/math/index';

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

export abstract class BaseObjectGenerator<TConfig extends BaseGeneratorConfig> {
  protected seed: number;
  protected rng: SeededRandom;
  
  constructor(seed: number = Math.random() * 10000) {
    this.seed = seed;
    this.rng = new SeededRandom(seed);
  }
  
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
  getVariations(count: number, baseConfig?: Partial<TConfig>): THREE.Object3D[] {
    const variations: THREE.Object3D[] = [];
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
  setSeed(seed: number): void {
    this.seed = seed;
    this.rng = new SeededRandom(seed);
  }
  
  /**
   * Get current seed
   */
  getSeed(): number {
    return this.seed;
  }
  
  /**
   * Add tags to generated object metadata
   */
  protected addTags(object: THREE.Object3D, tags: string[]): void {
    if (!object.userData.tags) {
      object.userData.tags = [];
    }
    object.userData.tags.push(...tags);
  }
  
  /**
   * Create standard metadata for generated objects
   */
  protected createMetadata(generatorName: string): any {
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
  protected mergeConfig(userConfig: Partial<TConfig> = {}): TConfig {
    return {
      ...this.getDefaultConfig(),
      ...userConfig,
      seed: userConfig.seed ?? this.seed
    };
  }
}
