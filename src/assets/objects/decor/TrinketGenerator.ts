/**
 * TrinketGenerator - Procedural small decorative objects
 */
import { Group, Mesh, SphereGeometry, TorusGeometry, IcosahedronGeometry, Material, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export type TrinketType = 'figurine' | 'vase_mini' | 'crystal' | 'coin' | 'jewelry' | 'ornament';
export type TrinketMaterial = 'ceramic' | 'metal' | 'glass' | 'stone' | 'wood';

export interface TrinketConfig {
  type: TrinketType;
  materialType: TrinketMaterial;
  size: 'tiny' | 'small' | 'medium';
  seed?: number;
}

export class TrinketGenerator extends BaseObjectGenerator<TrinketConfig> {
  protected readonly defaultParams: TrinketConfig = {
    type: 'figurine', materialType: 'ceramic', size: 'small', seed: undefined
  };

  getDefaultConfig(): TrinketConfig {
    return { ...this.defaultParams };
  }

  generate(params: Partial<TrinketConfig> = {}): Group {
    const finalParams = { ...this.defaultParams, ...params };
    const group = new Group();
    this.createTrinket(group, finalParams);
    return group;
  }

  private createTrinket(group: Group, params: TrinketConfig): void {
    const sizes = { tiny: 0.03, small: 0.06, medium: 0.1 };
    const size = sizes[params.size];
    const mat = this.getMaterial(params.materialType);
    let geom: any;

    switch (params.type) {
      case 'figurine': geom = new IcosahedronGeometry(size, 0); break;
      case 'vase_mini': geom = new SphereGeometry(size, 16, 16); break;
      case 'crystal': geom = new IcosahedronGeometry(size * 0.8, 1); break;
      case 'coin': geom = new SphereGeometry(size * 0.5, 16, 16); break;
      case 'jewelry': geom = new TorusGeometry(size * 0.4, size * 0.1, 8, 16); break;
      case 'ornament': geom = new SphereGeometry(size, 16, 16); break;
    }

    const trinket = new Mesh(geom, mat);
    group.add(trinket);
  }

  private getMaterial(type: TrinketMaterial): Material {
    const configs = {
      ceramic: { color: 0xf5f5dc, roughness: 0.4 },
      metal: { color: 0xffd700, roughness: 0.2, metalness: 0.9 },
      glass: { color: 0xe0ffff, roughness: 0.1, transparent: true, opacity: 0.7 },
      stone: { color: 0x808080, roughness: 0.7 },
      wood: { color: 0x8b4513, roughness: 0.6 }
    };
    return new MeshStandardMaterial(configs[type]);
  }

  getVariations(): TrinketConfig[] {
    const types: TrinketType[] = ['figurine', 'vase_mini', 'crystal', 'coin', 'jewelry', 'ornament'];
    const materials: TrinketMaterial[] = ['ceramic', 'metal', 'glass', 'stone', 'wood'];
    const sizes: ('tiny' | 'small' | 'medium')[] = ['tiny', 'small', 'medium'];
    return types.flatMap(t => materials.map(m => ({
      type: t, materialType: m, size: sizes[Math.floor(Math.random() * 3)], seed: Math.floor(Math.random() * 10000)
    })));
  }
}
