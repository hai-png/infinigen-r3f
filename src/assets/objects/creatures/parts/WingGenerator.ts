import { Group, Mesh } from 'three';
export class WingGenerator {
  constructor(private seed?: number) {}
  generate(side: 'left' | 'right', span: number, pattern: string): Group {
    const wing = new Group();
    const geometry = new this.BoxGeometry(span * 0.3, span, 0.02);
    const material = new this.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    const mesh = new Mesh(geometry, material);
    wing.add(mesh);
    return wing;
  }
}
