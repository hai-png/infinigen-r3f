/**
 * FloorGenerator - Procedural flooring generation
 * FIX: All floor elements are Mesh objects with proper MeshStandardMaterial
 */
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Color } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface FloorParams extends BaseGeneratorConfig {
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
    super(seed);
  }

  getDefaultConfig(): FloorParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<FloorParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, thickness, floorType, pattern, plankWidth, tileWidth, hasBorder, borderWidth, material } = finalParams;

    const floorMaterial = this.getFloorMaterial(floorType, material);

    // Main floor surface
    const mainGeom = new BoxGeometry(width, thickness, depth);
    const floor = new Mesh(mainGeom, floorMaterial);
    floor.position.set(0, thickness / 2, 0);
    floor.receiveShadow = true;
    floor.name = 'floor';
    group.add(floor);

    // Add plank lines for hardwood
    if (floorType === 'hardwood' || floorType === 'laminate') {
      this.addPlankLines(group, width, depth, thickness, plankWidth, pattern);
    }

    // Add tile lines
    if (floorType === 'tile') {
      this.addTileLines(group, width, depth, thickness, tileWidth);
    }

    // Add border if requested
    if (hasBorder) {
      const borderMat = this.getFloorMaterial(floorType, finalParams.borderMaterial);

      const topBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth), borderMat);
      topBorder.position.set(0, thickness / 2, -depth / 2 + borderWidth / 2);
      topBorder.receiveShadow = true;
      topBorder.name = 'border_top';
      group.add(topBorder);

      const bottomBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth), borderMat);
      bottomBorder.position.set(0, thickness / 2, depth / 2 - borderWidth / 2);
      bottomBorder.receiveShadow = true;
      bottomBorder.name = 'border_bottom';
      group.add(bottomBorder);

      const innerDepth = depth - borderWidth * 2;
      const leftBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth), borderMat);
      leftBorder.position.set(-width / 2 + borderWidth / 2, thickness / 2, 0);
      leftBorder.receiveShadow = true;
      leftBorder.name = 'border_left';
      group.add(leftBorder);

      const rightBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth), borderMat);
      rightBorder.position.set(width / 2 - borderWidth / 2, thickness / 2, 0);
      rightBorder.receiveShadow = true;
      rightBorder.name = 'border_right';
      group.add(rightBorder);
    }

    return group;
  }

  private addPlankLines(group: Group, width: number, depth: number, thickness: number, plankWidth: number, pattern: string): void {
    const lineMat = new MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
    const lineDepth = 0.005;
    const numPlanks = Math.floor(depth / plankWidth);

    for (let i = 1; i < numPlanks; i++) {
      const z = -depth / 2 + i * plankWidth;
      const lineGeo = new BoxGeometry(width, thickness + 0.001, lineDepth);
      const line = new Mesh(lineGeo, lineMat);
      line.position.set(0, thickness / 2, z);
      line.name = `plank_line_${i}`;
      group.add(line);
    }
  }

  private addTileLines(group: Group, width: number, depth: number, thickness: number, tileWidth: number): void {
    const lineMat = new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 });
    const lineDepth = 0.003;

    // Horizontal lines
    const numH = Math.floor(depth / tileWidth);
    for (let i = 1; i < numH; i++) {
      const z = -depth / 2 + i * tileWidth;
      const lineGeo = new BoxGeometry(width, thickness + 0.001, lineDepth);
      const line = new Mesh(lineGeo, lineMat);
      line.position.set(0, thickness / 2, z);
      group.add(line);
    }

    // Vertical lines
    const numV = Math.floor(width / tileWidth);
    for (let i = 1; i < numV; i++) {
      const x = -width / 2 + i * tileWidth;
      const lineGeo = new BoxGeometry(lineDepth, thickness + 0.001, depth);
      const line = new Mesh(lineGeo, lineMat);
      line.position.set(x, thickness / 2, 0);
      group.add(line);
    }
  }

  private getFloorMaterial(floorType: string, material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      oak: { color: 0x8b6914, roughness: 0.6, metalness: 0.0 },
      walnut: { color: 0x5c4033, roughness: 0.65, metalness: 0.0 },
      maple: { color: 0xc4a35a, roughness: 0.55, metalness: 0.0 },
      porcelain: { color: 0xeeeeee, roughness: 0.3, metalness: 0.05 },
      ceramic: { color: 0xdddddd, roughness: 0.4, metalness: 0.0 },
      wool: { color: 0x8b7d6b, roughness: 0.95, metalness: 0.0 },
      polished_concrete: { color: 0xaaaaaa, roughness: 0.2, metalness: 0.1 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
    };
    const config = configs[material] || configs.oak;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
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
