/**
 * MushroomGenerator - Procedural mushroom varieties
 */
import { Group, Color } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';

export interface MushroomParameters {
  species: 'button' | 'shiitake' | 'fly_agaric' | 'puffball' | 'mixed';
  capSize: number;
  stemHeight: number;
  density: number;
  color: Color;
  windIntensity: number;
  lodDistance: [number, number, number, number];
}

const DEFAULT: MushroomParameters = {
  species: 'mixed',
  capSize: 0.05,
  stemHeight: 0.08,
  density: 30,
  color: new Color(0x8b4513),
  windIntensity: 0.1,
  lodDistance: [0, 5, 12, 25],
};

export class MushroomGenerator extends BaseObjectGenerator<MushroomParameters> {
  protected readonly defaultParams = DEFAULT;
  protected readonly paramName = 'MushroomGenerator';

  generate(params: Partial<MushroomParameters> = {}): Group {
    const p = { ...DEFAULT, ...params, color: params.color?.clone() || DEFAULT.color };
    const group = new Group();
    const count = Math.floor(p.density * this.area * 0.01);
    
    for (let i = 0; i < count; i++) {
      const mushroom = new Group();
      const species = p.species === 'mixed' ? ['button', 'shiitake', 'fly_agaric', 'puffball'][Math.floor(Math.random()*4)] : p.species;
      
      // Stem
      const stemGeom = new THREE.CylinderGeometry(0.005, 0.008, p.stemHeight, 7);
      const stemMat = new THREE.MeshStandardMaterial({ color: new Color(0xf5deb3) });
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.y = p.stemHeight / 2;
      mushroom.add(stem);
      
      // Cap
      const capGeom = species === 'puffball' 
        ? new THREE.SphereGeometry(p.capSize, 8, 8)
        : new THREE.SphereGeometry(p.capSize, 8, 8, 0, Math.PI*2, 0, Math.PI/2);
      const capColor = species === 'fly_agaric' ? new Color(0xff0000) : p.color;
      const capMat = new THREE.MeshStandardMaterial({ color: capColor });
      const cap = new THREE.Mesh(capGeom, capMat);
      cap.position.y = p.stemHeight;
      if (species !== 'puffball') cap.rotation.x = Math.PI;
      mushroom.add(cap);
      
      mushroom.position.set(
        (Math.random()-0.5)*this.bounds.x,
        0,
        (Math.random()-0.5)*this.bounds.z
      );
      mushroom.rotation.y = Math.random() * Math.PI * 2;
      group.add(mushroom);
    }
    return group;
  }

  protected validateParameters(p: Partial<MushroomParameters>): MushroomParameters {
    return { ...DEFAULT, ...p, color: p.color?.clone() || DEFAULT.color };
  }

  getRandomParameters(): MushroomParameters {
    return {
      species: ['button', 'shiitake', 'fly_agaric', 'puffball'][Math.floor(Math.random()*4)] as any,
      capSize: 0.03 + Math.random()*0.08,
      stemHeight: 0.05 + Math.random()*0.1,
      density: 20 + Math.random()*40,
      color: new Color().setHSL(0.05+Math.random()*0.1, 0.6, 0.4+Math.random()*0.2),
      windIntensity: 0.05 + Math.random()*0.15,
      lodDistance: [0, 4, 10, 20],
    };
  }
}
