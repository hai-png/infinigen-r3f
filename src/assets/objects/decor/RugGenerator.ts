/**
 * RugGenerator - Procedural rug/carpet generation
 */
import { Group, Mesh, PlaneGeometry, BoxGeometry, Material, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export type RugStyle = 'persian' | 'modern' | 'shag' | 'oriental' | 'geometric' | 'traditional';
export type RugShape = 'rectangular' | 'round' | 'oval' | 'runner';

export interface RugConfig {
  style: RugStyle;
  shape: RugShape;
  width: number;
  length: number;
  pileHeight: number;
  hasFringe: boolean;
  seed?: number;
}

export class RugGenerator extends BaseObjectGenerator<RugConfig> {
  protected readonly defaultParams: RugConfig = {
    style: 'modern', shape: 'rectangular', width: 2.0, length: 3.0,
    pileHeight: 0.02, hasFringe: false, seed: undefined
  };

  generate(params: Partial<RugConfig> = {}): Group {
    const finalParams = { ...this.defaultParams, ...params };
    const group = new Group();
    this.createRug(group, finalParams);
    return group;
  }

  private createRug(group: Group, params: RugConfig): void {
    const geom = new PlaneGeometry(params.width, params.length, 32, 32);
    const positions = geom.attributes.position.array as Float32Array;
    
    // Add pile texture
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 2] = (Math.random() - 0.5) * params.pileHeight;
    }
    geom.computeVertexNormals();
    
    const mat = this.getMaterial(params.style);
    const rug = new Mesh(geom, mat);
    rug.rotation.x = -Math.PI / 2;
    group.add(rug);
    
    if (params.hasFringe) this.addFringe(group, params);
  }

  private addFringe(group: Group, params: RugConfig): void {
    const fringeGeom = new BoxGeometry(params.width, 0.05, 0.01);
    const fringeMat = new MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9 });
    const fringe1 = new Mesh(fringeGeom, fringeMat);
    fringe1.position.set(0, params.length / 2 + 0.025, 0);
    group.add(fringe1);
    const fringe2 = new Mesh(fringeGeom, fringeMat);
    fringe2.position.set(0, -params.length / 2 - 0.025, 0);
    group.add(fringe2);
  }

  private getMaterial(style: RugStyle): Material {
    const configs = {
      persian: { color: 0x8b0000, roughness: 0.9 },
      modern: { color: 0x4a4a4a, roughness: 0.8 },
      shag: { color: 0xf5f5dc, roughness: 1.0 },
      oriental: { color: 0x1e3a5f, roughness: 0.9 },
      geometric: { color: 0x2f4f4f, roughness: 0.8 },
      traditional: { color: 0x5c4033, roughness: 0.9 }
    };
    return new MeshStandardMaterial(configs[style]);
  }

  getVariations(): Params[] {
    const styles: RugStyle[] = ['persian', 'modern', 'shag', 'oriental', 'geometric', 'traditional'];
    const shapes: RugShape[] = ['rectangular', 'round', 'oval', 'runner'];
    return styles.map(s => ({
      style: s, shape: shapes[Math.floor(Math.random() * 4)],
      width: 1.5 + Math.random() * 2, length: 2 + Math.random() * 3,
      pileHeight: 0.01 + Math.random() * 0.05, hasFringe: Math.random() > 0.5, seed: Math.floor(Math.random() * 10000)
    }));
  }
}
