/**
 * MossGenerator - Moss and lichen ground cover
 */
import { Group, Color } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';

export interface MossParameters {
  type: 'sheet' | 'clump' | 'lichen' | 'mixed';
  thickness: number;
  coverage: number;
  density: number;
  color: Color;
  windIntensity: number;
  lodDistance: [number, number, number, number];
}

const DEFAULT: MossParameters = {
  type: 'mixed',
  thickness: 0.02,
  coverage: 0.8,
  density: 200,
  color: new Color(0x3d5a2e),
  windIntensity: 0.1,
  lodDistance: [0, 5, 15, 30],
};

export class MossGenerator extends BaseObjectGenerator<MossParameters> {
  protected readonly defaultParams = DEFAULT;
  protected readonly paramName = 'MossGenerator';

  generate(params: Partial<MossParameters> = {}): Group {
    const p = { ...DEFAULT, ...params, color: params.color?.clone() || DEFAULT.color };
    const group = new Group();
    const count = Math.floor(p.density * this.area * 0.1);
    
    for (let i = 0; i < count; i++) {
      const shape = new THREE.Shape();
      const r = 0.05 + Math.random()*0.1;
      const pts = 8;
      for (let j = 0; j <= pts; j++) {
        const a = (j/pts)*Math.PI*2;
        const rad = r*(0.7+Math.random()*0.5);
        if (j===0) shape.moveTo(Math.cos(a)*rad, Math.sin(a)*rad);
        else shape.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
      }
      const geom = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.9, side: THREE.DoubleSide });
      const patch = new THREE.Mesh(geom, mat);
      patch.rotation.x = -Math.PI/2;
      patch.position.set(
        (Math.random()-0.5)*this.bounds.x,
        p.thickness*0.5,
        (Math.random()-0.5)*this.bounds.z
      );
      group.add(patch);
    }
    return group;
  }

  protected validateParameters(p: Partial<MossParameters>): MossParameters {
    return { ...DEFAULT, ...p, color: p.color?.clone() || DEFAULT.color };
  }

  getRandomParameters(): MossParameters {
    return {
      type: ['sheet', 'clump', 'lichen'][Math.floor(Math.random()*3)] as any,
      thickness: 0.01+Math.random()*0.03,
      coverage: 0.5+Math.random()*0.5,
      density: 150+Math.random()*150,
      color: new Color().setHSL(0.28+Math.random()*0.08, 0.4, 0.25+Math.random()*0.1),
      windIntensity: 0.05+Math.random()*0.15,
      lodDistance: [0, 4, 12, 25],
    };
  }
}
