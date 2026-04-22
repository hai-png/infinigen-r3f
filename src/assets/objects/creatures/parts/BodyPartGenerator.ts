import { Group, Mesh } from 'three';
export class BodyPartGenerator {
  constructor(private seed?: number) {}
  generateHead(size: number): Mesh { return new Mesh(new this.SphereGeometry(size), new this.MeshStandardMaterial({ color: 0xff0000 })); }
  generateTorso(size: number): Mesh { return new Mesh(new this.BoxGeometry(size, size * 1.5, size * 0.8), new this.MeshStandardMaterial({ color: 0xff0000 })); }
  generateLimb(type: string, size: number): Mesh { return new Mesh(new this.CylinderGeometry(size * 0.1, size * 0.08, size), new this.MeshStandardMaterial({ color: 0xff0000 })); }
}
