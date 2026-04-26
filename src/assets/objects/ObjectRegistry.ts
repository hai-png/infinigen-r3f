/**
 * Object Registry - Central registration system for all object generators
 */

import { Group } from 'three';

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

  register(name: string, category: string, generator: any, tags?: string[]): void {
    this.objects.set(name, { name, category, generator, tags });
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

export const registry = ObjectRegistry.getInstance();
