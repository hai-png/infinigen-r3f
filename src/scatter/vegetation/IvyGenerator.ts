/**
 * IvyGenerator - Climbing ivy plants
 */
import { Group, Color, Vector3 } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';

export interface IvyParameters {
  species: 'english' | 'boston' | 'mixed';
  leafSize: number;
  vineLength: number;
  density: number;
  color: Color;
  windIntensity: number;
  lodDistance: [number, number, number, number];
}

const DEFAULT: IvyParameters = {
  species: 'mixed',
  leafSize: 0.05,
  vineLength: 1.5,
  density: 80,
  color: new Color(0x2d4a1e),
  windIntensity: 0.4,
  lodDistance: [0, 10, 25, 50],
};

export class IvyGenerator extends BaseObjectGenerator<IvyParameters> {
  protected readonly defaultParams = DEFAULT;
  protected readonly paramName = 'IvyGenerator';

  generate(params: Partial<IvyParameters> = {}): Group {
    const p = { ...DEFAULT, ...params, color: params.color?.clone() || DEFAULT.color };
    const group = new Group();
    const count = Math.floor(p.density * this.area * 0.02);
    
    for (let i = 0; i < count; i++) {
      const ivy = new Group();
      const segments = 10;
      const len = p.vineLength * (0.8 + Math.random() * 0.4);
      
      for (let j = 0; j < segments; j++) {
        const t = j / segments;
        const vineGeom = new THREE.CylinderGeometry(0.002, 0.003, len/segments, 5);
        const vineMat = new THREE.MeshStandardMaterial({ color: new Color(0x1a3d12) });
        const segment = new THREE.Mesh(vineGeom, vineMat);
        segment.position.y = (t + 0.5) * len/segments;
        segment.rotation.z = Math.sin(t * Math.PI * 3) * 0.3;
        ivy.add(segment);
        
        if (j % 2 === 0) {
          const leafShape = new THREE.Shape();
          const size = p.leafSize * (0.7 + Math.random() * 0.5);
          leafShape.moveTo(0, 0);
          leafShape.quadraticCurveTo(size*0.5, size*0.3, 0, size);
          leafShape.quadraticCurveTo(-size*0.5, size*0.3, 0, 0);
          const leafGeom = new THREE.ShapeGeometry(leafShape);
          const leafMat = new THREE.MeshStandardMaterial({ color: p.color, side: THREE.DoubleSide });
          const leaf = new THREE.Mesh(leafGeom, leafMat);
          leaf.position.set(Math.sin(t*Math.PI)*0.1, t*len, 0);
          leaf.rotation.set(0.3, Math.random()*Math.PI, 0);
          ivy.add(leaf);
        }
      }
      
      ivy.position.set((Math.random()-0.5)*this.bounds.x, 0, (Math.random()-0.5)*this.bounds.z);
      ivy.rotation.y = Math.random() * Math.PI * 2;
      group.add(ivy);
    }
    return group;
  }

  protected validateParameters(p: Partial<IvyParameters>): IvyParameters {
    return { ...DEFAULT, ...p, color: p.color?.clone() || DEFAULT.color };
  }

  getRandomParameters(): IvyParameters {
    return {
      species: ['english', 'boston'][Math.floor(Math.random()*2)] as any,
      leafSize: 0.03 + Math.random()*0.05,
      vineLength: 1.0 + Math.random()*1.5,
      density: 50 + Math.random()*100,
      color: new Color().setHSL(0.25+Math.random()*0.1, 0.5, 0.2+Math.random()*0.15),
      windIntensity: 0.3 + Math.random()*0.4,
      lodDistance: [0, 8, 20, 40],
    };
  }
}
