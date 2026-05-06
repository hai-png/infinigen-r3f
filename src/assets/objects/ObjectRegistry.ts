/**
 * Object Registry - Central registration system for all object generators
 *
 * This module provides two registry systems:
 * 1. ObjectRegistry (singleton) - Registers named object instances with category/tags metadata
 * 2. ClassObjectRegistry (static) - Registers Object3D class constructors by type string
 */

import * as THREE from 'three';
import { CactusGenerator, CACTUS_VARIANTS } from './vegetation/cactus';
import { DeformedTreeGenerator, DEFORMED_TREE_VARIANTS } from './vegetation/trees/deformed-index';
import { FruitGenerator, FruitBowlGenerator, FRUIT_TYPES } from './food';

// ---------------------------------------------------------------------------
// Instance-based registry (ObjectRegistry)
// ---------------------------------------------------------------------------

export interface RegisteredObject {
  name: string;
  category: string;
  generator: any;
  tags?: string[];
}

export class ObjectRegistry {
  private static instance: ObjectRegistry;
  private objects: Map<string, RegisteredObject> = new Map();

  private constructor() {}

  static getInstance(): ObjectRegistry {
    if (!ObjectRegistry.instance) {
      ObjectRegistry.instance = new ObjectRegistry();
    }
    return ObjectRegistry.instance;
  }

  register(name: string, categoryOrGenerator?: string | any, generatorOrTags?: any, tags?: string[]): void {
    // Support both register(name, category, generator, tags?) and register(name, generator)
    if (typeof categoryOrGenerator === 'string') {
      this.objects.set(name, { name, category: categoryOrGenerator, generator: generatorOrTags, tags });
    } else {
      this.objects.set(name, { name, category: 'uncategorized', generator: categoryOrGenerator, tags: generatorOrTags });
    }
  }

  /**
   * Static convenience method to register an object on the singleton instance
   */
  static register(name: string, categoryOrGenerator?: string | any, generatorOrTags?: any, tags?: string[]): void {
    ObjectRegistry.getInstance().register(name, categoryOrGenerator, generatorOrTags, tags);
  }

  get(name: string): RegisteredObject | undefined {
    return this.objects.get(name);
  }

  getByCategory(category: string): RegisteredObject[] {
    return Array.from(this.objects.values()).filter(obj => obj.category === category);
  }

  getAll(): RegisteredObject[] {
    return Array.from(this.objects.values());
  }

  has(name: string): boolean {
    return this.objects.has(name);
  }
}

// ---------------------------------------------------------------------------
// Class-based registry (ClassObjectRegistry) - consolidates functionality
// previously in assets/objects/utils/ObjectRegistry.ts
// ---------------------------------------------------------------------------

export interface RegistrableObject {
  new(...args: any[]): THREE.Object3D;
  type: string;
}

export class ClassObjectRegistry {
  private static registry: Map<string, RegistrableObject> = new Map();

  static register(obj: RegistrableObject): void {
    if (this.registry.has(obj.type)) {
      throw new Error(`Object type ${obj.type} is already registered`);
    }
    this.registry.set(obj.type, obj);
  }

  static get(type: string): RegistrableObject | undefined {
    return this.registry.get(type);
  }

  static getAll(): RegistrableObject[] {
    return Array.from(this.registry.values());
  }

  static has(type: string): boolean {
    return this.registry.has(type);
  }
}

export const registry = ObjectRegistry.getInstance();

// ============================================================================
// Auto-register cactus generators
// ============================================================================

// Register the main CactusGenerator under the 'vegetation/cactus' category
ObjectRegistry.register(
  'CactusGenerator',
  'vegetation/cactus',
  CactusGenerator,
  ['cactus', 'vegetation', 'procedural', 'desert'],
);

// Register each variant as a named entry for convenient lookup
for (const variant of CACTUS_VARIANTS) {
  ObjectRegistry.register(
    `Cactus_${variant}`,
    'vegetation/cactus',
    { generator: CactusGenerator, variant },
    ['cactus', 'vegetation', 'procedural', 'desert', variant.toLowerCase()],
  );
}

// ============================================================================
// Auto-register deformed tree generators
// ============================================================================

// Register the main DeformedTreeGenerator under the 'vegetation/deformed-tree' category
ObjectRegistry.register(
  'DeformedTreeGenerator',
  'vegetation/deformed-tree',
  DeformedTreeGenerator,
  ['tree', 'vegetation', 'procedural', 'deformed', 'forest'],
);

// Register each variant as a named entry for convenient lookup
for (const variant of DEFORMED_TREE_VARIANTS) {
  ObjectRegistry.register(
    `DeformedTree_${variant}`,
    'vegetation/deformed-tree',
    { generator: DeformedTreeGenerator, variant },
    ['tree', 'vegetation', 'procedural', 'deformed', 'forest', variant.toLowerCase()],
  );
}

// ============================================================================
// Auto-register fruit generators
// ============================================================================

// Register the main FruitGenerator under the 'food/fruit' category
ObjectRegistry.register(
  'FruitGenerator',
  'food/fruit',
  FruitGenerator,
  ['fruit', 'food', 'procedural', 'nature'],
);

// Register each fruit type as a named entry for convenient lookup
for (const fruitType of FRUIT_TYPES) {
  ObjectRegistry.register(
    `Fruit_${fruitType}`,
    'food/fruit',
    { generator: FruitGenerator, variant: fruitType },
    ['fruit', 'food', 'procedural', 'nature', fruitType.toLowerCase()],
  );
}

// Register the FruitBowlGenerator under the 'food/fruit-bowl' category
ObjectRegistry.register(
  'FruitBowlGenerator',
  'food/fruit-bowl',
  FruitBowlGenerator,
  ['fruit', 'food', 'procedural', 'bowl', 'decor'],
);

// ============================================================================
// Auto-register indoor furniture generators in ObjectRegistry
// ============================================================================

import { ChairGenerator } from './seating/ChairGenerator';
import { TableFactory } from './tables/TableFactory';
import { CoffeeTable } from './tables/CoffeeTable';
import { DiningTable } from './tables/DiningTable';
import { DeskGenerator } from './tables/DeskGenerator';
import { SofaFactory } from './seating/SofaFactory';
import { OfficeChairFactory } from './seating/OfficeChairFactory';
import { StoolGenerator } from './seating/StoolGenerator';
import { BathroomFixtures } from './bathroom/BathroomFixtures';
import { DoorGenerator } from './architectural/DoorGenerator';
import { WindowGenerator } from './architectural/WindowGenerator';
import { StaircaseGenerator } from './architectural/StaircaseGenerator';

// ChairGenerator with 3 variants
const chairGen = new ChairGenerator();
ObjectRegistry.register('ChairGenerator', 'furniture/chair', chairGen, ['chair', 'seating', 'furniture', 'indoor']);
ObjectRegistry.register('Chair_Dining', 'furniture/chair', { generator: ChairGenerator, variant: 'dining' }, ['chair', 'dining', 'seating', 'furniture', 'indoor']);
ObjectRegistry.register('Chair_Office', 'furniture/chair', { generator: ChairGenerator, variant: 'office' }, ['chair', 'office', 'seating', 'furniture', 'indoor']);
ObjectRegistry.register('Chair_BarStool', 'furniture/chair', { generator: ChairGenerator, variant: 'bar_stool' }, ['chair', 'bar_stool', 'seating', 'furniture', 'indoor']);

// Table generators
ObjectRegistry.register('TableFactory', 'furniture/table', TableFactory, ['table', 'furniture', 'indoor']);
ObjectRegistry.register('CoffeeTable', 'furniture/table', CoffeeTable, ['table', 'coffee_table', 'furniture', 'indoor', 'living_room']);
ObjectRegistry.register('DiningTable', 'furniture/table', DiningTable, ['table', 'dining', 'furniture', 'indoor', 'dining_room']);
ObjectRegistry.register('DeskGenerator', 'furniture/table', DeskGenerator, ['table', 'desk', 'furniture', 'indoor', 'office']);

// Seating generators
ObjectRegistry.register('SofaFactory', 'furniture/sofa', SofaFactory, ['sofa', 'seating', 'furniture', 'indoor', 'living_room']);
ObjectRegistry.register('OfficeChairFactory', 'furniture/chair', OfficeChairFactory, ['chair', 'office', 'seating', 'furniture', 'indoor']);
ObjectRegistry.register('StoolGenerator', 'furniture/chair', StoolGenerator, ['stool', 'seating', 'furniture', 'indoor']);

// Bathroom fixtures
ObjectRegistry.register('BathroomFixtures', 'bathroom', BathroomFixtures, ['bathroom', 'toilet', 'sink', 'bathtub', 'shower', 'indoor']);

// Architectural generators
ObjectRegistry.register('DoorGenerator', 'architectural/door', DoorGenerator, ['door', 'architectural', 'indoor']);
ObjectRegistry.register('WindowGenerator', 'architectural/window', WindowGenerator, ['window', 'architectural', 'indoor']);
ObjectRegistry.register('StaircaseGenerator', 'architectural/staircase', StaircaseGenerator, ['staircase', 'stairs', 'architectural', 'indoor']);
