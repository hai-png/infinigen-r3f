/**
 * FloorGenerator - Procedural flooring generation
 */
import { Group, Mesh, BoxGeometry, PlaneGeometry } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';

export interface FloorParams {
  width: number;
  depth: number;
  thickness: number;
  floorType: 'hardwood' | 'tile' | 'carpet' | 'concrete' | 'laminate';
  pattern: 'plank' | 'parquet' | 'herringbone' | 'basketweave' | 'uniform';
  plankWidth: number;
  tileWidth: number;
  material: string;
  hasBorder: boolean;
  borderWidth: number;
  borderMaterial: string;
}

const DEFAULT_PARAMS: FloorParams = {
  width: 5.0,
  depth: 5.0,
  thickness: 0.05,
  floorType: 'hardwood',
  pattern: 'plank',
  plankWidth: 0.15,
  tileWidth: 0.3,
  material: 'oak',
  hasBorder: false,
  borderWidth: 0.1,
  borderMaterial: 'walnut',
};

export class FloorGenerator extends BaseObjectGenerator<FloorParams> {
  constructor(seed?: number) {
    super('Floor', seed);
  }

  getDefaultParams(): FloorParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<FloorParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, thickness, floorType, pattern, plankWidth, tileWidth, hasBorder, borderWidth } = finalParams;

    // Main floor surface
    const mainGeom = new BoxGeometry(width, thickness, depth);
    const floor = new Mesh(mainGeom);
    floor.position.set(0, thickness / 2, 0);
    floor.receiveShadow = true;
    group.add(floor);

    // Add border if requested
    if (hasBorder) {
      const innerWidth = width - borderWidth * 2;
      const innerDepth = depth - borderWidth * 2;
      
      // Border strips
      const topBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth));
      topBorder.position.set(0, thickness / 2, -depth / 2 + borderWidth / 2);
      group.add(topBorder);

      const bottomBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth));
      bottomBorder.position.set(0, thickness / 2, depth / 2 - borderWidth / 2);
      group.add(bottomBorder);

      const leftBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth));
      leftBorder.position.set(-width / 2 + borderWidth / 2, thickness / 2, 0);
      group.add(leftBorder);

      const rightBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth));
      rightBorder.position.set(width / 2 - borderWidth / 2, thickness / 2, 0);
      group.add(rightBorder);
    }

    return group;
  }

  getStylePresets(): Record<string, Partial<FloorParams>> {
    return {
      hardwood_plank: { floorType: 'hardwood', pattern: 'plank', material: 'oak' },
      hardwood_parquet: { floorType: 'hardwood', pattern: 'parquet', material: 'walnut' },
      tile_modern: { floorType: 'tile', pattern: 'uniform', tileWidth: 0.6, material: 'porcelain' },
      carpet: { floorType: 'carpet', material: 'wool' },
      concrete: { floorType: 'concrete', pattern: 'uniform', material: 'polished_concrete' },
    };
  }
}
