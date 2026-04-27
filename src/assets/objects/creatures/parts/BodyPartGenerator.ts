import { Mesh, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
export class BodyPartGenerator {
  constructor(private seed?: number) {}
  generateHead(size: number): Mesh { return new Mesh(new SphereGeometry(size), new MeshStandardMaterial({ color: 0xff0000 })); }
  generateTorso(size: number): Mesh { return new Mesh(new BoxGeometry(size, size * 1.5, size * 0.8), new MeshStandardMaterial({ color: 0xff0000 })); }
  generateLimb(type: string, size: number): Mesh { return new Mesh(new CylinderGeometry(size * 0.1, size * 0.08, size), new MeshStandardMaterial({ color: 0xff0000 })); }
}