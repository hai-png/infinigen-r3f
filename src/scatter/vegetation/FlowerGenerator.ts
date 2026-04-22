/**
 * FlowerGenerator - Procedural flowering plants
 */
import { Group, Color } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';

export interface FlowerParameters {
  type: 'daisy' | 'tulip' | 'rose' | 'sunflower' | 'mixed';
  petalCount: number;
  stemHeight: number;
  density: number;
  color: Color;
  windIntensity: number;
  lodDistance: [number, number, number, number];
}

const DEFAULT: FlowerParameters = {
  type: 'mixed',
  petalCount: 8,
  stemHeight: 0.2,
  density: 50,
  color: new Color(0xff69b4),
  windIntensity: 0.5,
  lodDistance: [0, 8, 20, 40],
};

export class FlowerGenerator extends BaseObjectGenerator<FlowerParameters> {
  protected readonly defaultParams = DEFAULT;
  protected readonly paramName = 'FlowerGenerator';

  generate(params: Partial<FlowerParameters> = {}): Group {
    const p = { ...DEFAULT, ...params, color: params.color?.clone() || DEFAULT.color };
    const group = new Group();
    const count = Math.floor(p.density * this.area * 0.02);
    
    for (let i = 0; i < count; i++) {
      const flower = new Group();
      const type = p.type === 'mixed' ? ['daisy', 'tulip', 'rose', 'sunflower'][Math.floor(Math.random()*4)] : p.type;
      
      // Stem
      const stemGeom = new THREE.CylinderGeometry(0.003, 0.005, p.stemHeight, 6);
      const stemMat = new THREE.MeshStandardMaterial({ color: new Color(0x228b22) });
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.y = p.stemHeight / 2;
      flower.add(stem);
      
      // Petals
      const petalShape = new THREE.Shape();
      petalShape.moveTo(0, 0);
      petalShape.quadraticCurveTo(0.01, 0.03, 0, 0.05);
      petalShape.quadraticCurveTo(-0.01, 0.03, 0, 0);
      const petals = p.petalCount;
      for (let j = 0; j < petals; j++) {
        const petalGeom = new THREE.ShapeGeometry(petalShape);
        const petalMat = new THREE.MeshStandardMaterial({ color: p.color, side: THREE.DoubleSide });
        const petal = new THREE.Mesh(petalGeom, petalMat);
        petal.position.y = p.stemHeight;
        petal.rotation.z = (j / petals) * Math.PI * 2;
        flower.add(petal);
      }
      
      // Center
      const centerGeom = new THREE.SphereGeometry(0.015, 6, 6);
      const centerMat = new THREE.MeshStandardMaterial({ color: new Color(0xffd700) });
      const center = new THREE.Mesh(centerGeom, centerMat);
      center.position.y = p.stemHeight;
      flower.add(center);
      
      flower.position.set(
        (Math.random()-0.5)*this.bounds.x,
        0,
        (Math.random()-0.5)*this.bounds.z
      );
      flower.rotation.y = Math.random() * Math.PI * 2;
      group.add(flower);
    }
    return group;
  }

  protected validateParameters(p: Partial<FlowerParameters>): FlowerParameters {
    return { ...DEFAULT, ...p, color: p.color?.clone() || DEFAULT.color };
  }

  getRandomParameters(): FlowerParameters {
    return {
      type: ['daisy', 'tulip', 'rose', 'sunflower'][Math.floor(Math.random()*4)] as any,
      petalCount: 5 + Math.floor(Math.random()*10),
      stemHeight: 0.1 + Math.random()*0.25,
      density: 30 + Math.random()*60,
      color: new Color().setHSL(Math.random(), 0.7, 0.5+Math.random()*0.2),
      windIntensity: 0.3 + Math.random()*0.5,
      lodDistance: [0, 6, 15, 30],
    };
  }
}
