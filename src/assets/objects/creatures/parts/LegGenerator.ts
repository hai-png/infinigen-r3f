import { Group, Mesh, CylinderGeometry, MeshStandardMaterial } from 'three';
export class LegGenerator {
  constructor(private seed?: number) {}
  generate(type: string, count: number, size: number): Group {
    const legs = new Group();
    for (let i = 0; i < count; i++) {
      const leg = new Mesh(new CylinderGeometry(size * 0.1, size * 0.08, size), new MeshStandardMaterial({ color: 0x8B4513 }));
      leg.position.set((i % 2 === 0 ? -1 : 1) * size * 0.15, -size * 0.5, (i < 2 ? 1 : -1) * size * 0.2);
      legs.add(leg);
    }
    return legs;
  }
}