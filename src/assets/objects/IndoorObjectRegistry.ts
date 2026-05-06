/**
 * IndoorObjectRegistry - Central registry for indoor object generators
 *
 * Provides:
 * 1. IndoorObjectFactory interface - common contract with generate(), getBoundingBox(), getMaterial()
 * 2. IndoorObjectRegistry singleton - maps semantic tags to factory instances
 * 3. Auto-registration of all indoor generators
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from './utils/BaseObjectGenerator';

// ============================================================================
// IndoorObjectFactory Interface
// ============================================================================

/** Bounding box descriptor for indoor objects */
export interface IndoorBBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** Material descriptor returned by getMaterial() */
export interface IndoorMaterialDescriptor {
  material: THREE.Material;
  category: 'wood' | 'metal' | 'fabric' | 'glass' | 'ceramic' | 'plastic' | 'stone' | 'composite';
  color: THREE.Color;
}

/** Configuration for indoor object generation */
export interface IndoorObjectConfig extends BaseGeneratorConfig {
  style?: string;
  seed?: number;
  [key: string]: any;
}

/**
 * IndoorObjectFactory - Common interface that all indoor object generators should implement.
 *
 * Every generator must provide:
 * - generate(config): Create the Three.js Group for this object
 * - getBoundingBox(config): Compute the bounding box without generating the full mesh
 * - getMaterial(config): Get the primary material descriptor for this object
 */
export interface IndoorObjectFactory {
  /** Unique identifier for this factory */
  readonly factoryId: string;

  /** Semantic category (e.g., 'furniture', 'architectural', 'bathroom') */
  readonly category: string;

  /** Semantic tags for lookup (e.g., ['chair', 'seating', 'dining']) */
  readonly tags: string[];

  /** Generate the object with the given configuration */
  generate(config?: Partial<IndoorObjectConfig>): THREE.Object3D;

  /** Compute the bounding box for the given configuration (without generating) */
  getBoundingBox(config?: Partial<IndoorObjectConfig>): IndoorBBox;

  /** Get the primary material descriptor for this object */
  getMaterial(config?: Partial<IndoorObjectConfig>): IndoorMaterialDescriptor;
}

// ============================================================================
// BaseIndoorObjectFactory - Abstract base class implementing IndoorObjectFactory
// ============================================================================

/**
 * Abstract base class that adapts BaseObjectGenerator to IndoorObjectFactory.
 * Subclasses only need to implement the abstract methods; getBoundingBox() and
 * getMaterial() have sensible default implementations.
 */
export abstract class BaseIndoorObjectFactory<TConfig extends BaseGeneratorConfig = BaseGeneratorConfig>
  extends BaseObjectGenerator<TConfig>
  implements IndoorObjectFactory
{
  abstract readonly factoryId: string;
  abstract readonly category: string;
  abstract readonly tags: string[];

  /**
   * Default getBoundingBox implementation: generates the object and computes
   * its bounding box. Subclasses can override for efficiency.
   */
  getBoundingBox(config?: Partial<IndoorObjectConfig>): IndoorBBox {
    const obj = this.generate(config as Partial<TConfig>);
    const box = new THREE.Box3().setFromObject(obj);
    return {
      min: box.min.clone(),
      max: box.max.clone(),
    };
  }

  /**
   * Default getMaterial implementation: returns a generic material descriptor.
   * Subclasses should override to provide accurate material info.
   */
  getMaterial(config?: Partial<IndoorObjectConfig>): IndoorMaterialDescriptor {
    return {
      material: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 }),
      category: 'composite',
      color: new THREE.Color(0x888888),
    };
  }

  /**
   * Helper: create a material descriptor from a MeshStandardMaterial
   */
  protected createMaterialDescriptor(
    material: THREE.MeshStandardMaterial,
    category: IndoorMaterialDescriptor['category'],
  ): IndoorMaterialDescriptor {
    const color = material.color instanceof THREE.Color
      ? material.color.clone()
      : new THREE.Color(material.color as number);
    return { material, category, color };
  }
}

// ============================================================================
// IndoorObjectRegistry - Singleton registry
// ============================================================================

export interface RegistryEntry {
  factory: IndoorObjectFactory;
  factoryId: string;
  category: string;
  tags: string[];
}

export class IndoorObjectRegistry {
  private static instance: IndoorObjectRegistry;
  private entries: Map<string, RegistryEntry> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map(); // tag → Set of factoryIds
  private categoryIndex: Map<string, Set<string>> = new Map(); // category → Set of factoryIds

  private constructor() {}

  static getInstance(): IndoorObjectRegistry {
    if (!IndoorObjectRegistry.instance) {
      IndoorObjectRegistry.instance = new IndoorObjectRegistry();
    }
    return IndoorObjectRegistry.instance;
  }

  /**
   * Register an indoor object factory
   */
  register(factory: IndoorObjectFactory): void {
    const entry: RegistryEntry = {
      factory,
      factoryId: factory.factoryId,
      category: factory.category,
      tags: [...factory.tags],
    };

    this.entries.set(factory.factoryId, entry);

    // Index by category
    if (!this.categoryIndex.has(factory.category)) {
      this.categoryIndex.set(factory.category, new Set());
    }
    this.categoryIndex.get(factory.category)!.add(factory.factoryId);

    // Index by tags
    for (const tag of factory.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(factory.factoryId);
    }
  }

  /**
   * Get a factory by its ID
   */
  get(factoryId: string): IndoorObjectFactory | undefined {
    return this.entries.get(factoryId)?.factory;
  }

  /**
   * Get all factories matching a semantic tag
   */
  getByTag(tag: string): IndoorObjectFactory[] {
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.entries.get(id)?.factory)
      .filter((f): f is IndoorObjectFactory => f !== undefined);
  }

  /**
   * Get all factories in a category
   */
  getByCategory(category: string): IndoorObjectFactory[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.entries.get(id)?.factory)
      .filter((f): f is IndoorObjectFactory => f !== undefined);
  }

  /**
   * Get all registered factories
   */
  getAll(): IndoorObjectFactory[] {
    return Array.from(this.entries.values()).map(e => e.factory);
  }

  /**
   * Get all registered entries with metadata
   */
  getAllEntries(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Check if a factory is registered
   */
  has(factoryId: string): boolean {
    return this.entries.has(factoryId);
  }

  /**
   * Get all available semantic tags
   */
  getAvailableTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }

  /**
   * Get all available categories
   */
  getAvailableCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }
}

export const indoorRegistry = IndoorObjectRegistry.getInstance();

// ============================================================================
// Auto-register all indoor object factories
// ============================================================================

import { ChairGenerator } from './seating/ChairGenerator';

// Register ChairGenerator and its variant-specific entries
const chairDining = new ChairGenerator();
const chairOffice = new ChairGenerator();
const chairBarStool = new ChairGenerator();

// Wrap each variant as its own IndoorObjectFactory entry
class ChairVariantFactory implements IndoorObjectFactory {
  readonly factoryId: string;
  readonly category = 'furniture';
  readonly tags: string[];

  constructor(
    private variant: 'dining' | 'office' | 'bar_stool',
    private generator: ChairGenerator,
  ) {
    this.factoryId = `chair_${variant}`;
    const variantTags: Record<string, string[]> = {
      dining: ['chair', 'dining', 'seating', 'furniture', 'indoor', 'dining_room'],
      office: ['chair', 'office', 'seating', 'furniture', 'indoor', 'office'],
      bar_stool: ['chair', 'bar_stool', 'seating', 'furniture', 'indoor', 'kitchen', 'bar'],
    };
    this.tags = variantTags[variant] || ['chair', 'seating', 'furniture', 'indoor'];
  }

  generate(config?: Partial<IndoorObjectConfig>): THREE.Object3D {
    return this.generator.generate({ ...config, variant: this.variant });
  }

  getBoundingBox(config?: Partial<IndoorObjectConfig>): IndoorBBox {
    return this.generator.getBoundingBox({ ...config, variant: this.variant } as any);
  }

  getMaterial(config?: Partial<IndoorObjectConfig>): IndoorMaterialDescriptor {
    return this.generator.getMaterial({ ...config, variant: this.variant } as any);
  }
}

indoorRegistry.register(chairDining); // The base factory (dining by default)
indoorRegistry.register(new ChairVariantFactory('dining', chairDining));
indoorRegistry.register(new ChairVariantFactory('office', chairOffice));
indoorRegistry.register(new ChairVariantFactory('bar_stool', chairBarStool));
