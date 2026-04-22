import { Group, Mesh } from 'three';
export class EyeGenerator {
  constructor(private seed?: number) {}
  generate(type: 'compound' | 'camera', count: number, size: number): Group {
    const eyes = new Group();
    for (let i = 0; i < count; i++) {
      const eye = new Mesh(new this.SphereGeometry(size), new this.MeshStandardMaterial({ color: 0x000000 }));
      eye.position.set(i === 0 ? -size : size, 0, size * 0.8);
      eyes.add(eye);
    }
    return eyes;
  }
}
