import * as THREE from 'three';

export interface RegistrableObject {
  new (...args: any[]): THREE.Object3D;
  type: string;
}

export class ObjectRegistry {
  private static registry: Map<string, RegistrableObject> = new Map();

  static register(id: string, generatorClass: any, metadata: any) {
    if (this.registry.has(id)) {
      console.warn(`Object type ${id} is already registered`);
      return;
    }
    this.registry.set(id, { generatorClass, metadata } as any);
  }

  static get(type: string): RegistrableObject | undefined {
    return this.registry.get(type);
  }

  static getAll(): RegistrableObject[] {
    return Array.from(this.registry.values());
  }
}
