import { Mesh, ConeGeometry, BoxGeometry, MeshStandardMaterial } from 'three';
export class MouthGenerator {
  constructor(private seed?: number) {}
  generate(type: string, size: number): Mesh {
    const geometry = type === 'beak' ? new ConeGeometry(size * 0.5, size, 8) : new BoxGeometry(size, size * 0.5, size * 0.3);
    return new Mesh(geometry, new MeshStandardMaterial({ color: 0xFFD700 }));
  }
}
export const BeakGenerator = MouthGenerator;