import { Group, Mesh } from 'three';
export class AntennaGenerator {
  constructor(private seed?: number) {}
  generate(type: string, length: number): Group {
    const antennas = new Group();
    const left = new Mesh(new this.CylinderGeometry(0.01, 0.01, length), new this.MeshStandardMaterial({ color: 0x333333 }));
    const right = left.clone();
    left.position.x = -0.05;
    right.position.x = 0.05;
    antennas.add(left, right);
    return antennas;
  }
}
