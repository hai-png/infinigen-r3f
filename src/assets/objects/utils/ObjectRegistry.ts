import * as THREE from 'three';

export interface RegistrableObject {
  new(...args: any[]): THREE.Object3D;
  type: string;
}

export class ObjectRegistry {
  private static registry: Map<string, RegistrableObject> = new Map();

  static register(obj: RegistrableObject) {
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
}
