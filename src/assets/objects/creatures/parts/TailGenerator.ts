import { Mesh } from 'three';
export class TailGenerator {
  constructor(private seed?: number) {}
  generate(type: string, length: number): Mesh {
    const geometry = type === 'bushy' ? new this.ConeGeometry(length * 0.15, length, 8) : new this.CylinderGeometry(length * 0.05, length * 0.02, length);
    return new Mesh(geometry, new this.MeshStandardMaterial({ color: 0x8B4513 }));
  }
}
