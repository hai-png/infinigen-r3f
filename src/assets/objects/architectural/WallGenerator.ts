/**
 * WallGenerator - Procedural wall segment generation
 */
import { Group, Mesh, BoxGeometry, ExtrudeGeometry, Shape } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface WallParams {
  width: number;
  height: number;
  thickness: number;
  wallType: 'solid' | 'curtain' | 'partition' | 'retaining';
  hasDoorOpening: boolean;
  doorWidth: number;
  doorHeight: number;
  hasWindowOpenings: boolean;
  windowCount: number;
  windowWidth: number;
  windowHeight: number;
  material: string;
  style: 'modern' | 'traditional' | 'industrial' | 'rustic';
}

const DEFAULT_PARAMS: WallParams = {
  width: 4.0,
  height: 3.0,
  thickness: 0.2,
  wallType: 'solid',
  hasDoorOpening: false,
  doorWidth: 0.9,
  doorHeight: 2.1,
  hasWindowOpenings: false,
  windowCount: 2,
  windowWidth: 1.2,
  windowHeight: 1.5,
  material: 'concrete',
  style: 'modern',
};

export class WallGenerator extends BaseObjectGenerator<WallParams> {
  constructor(seed?: number) {
    super('Wall', seed);
  }

  getDefaultParams(): WallParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<WallParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, height, thickness, wallType, hasDoorOpening, doorWidth, doorHeight, hasWindowOpenings, windowCount, windowWidth, windowHeight } = finalParams;

    // Create wall shape with openings
    const shape = new Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height);
    shape.lineTo(-width / 2, height);
    shape.lineTo(-width / 2, 0);

    // Add door opening
    if (hasDoorOpening) {
      const doorHole = new Shape();
      const doorX = 0;
      doorHole.moveTo(doorX - doorWidth / 2, 0);
      doorHole.lineTo(doorX + doorWidth / 2, 0);
      doorHole.lineTo(doorX + doorWidth / 2, doorHeight);
      doorHole.lineTo(doorX - doorWidth / 2, doorHeight);
      doorHole.lineTo(doorX - doorWidth / 2, 0);
      shape.holes.push(doorHole);
    }

    // Add window openings
    if (hasWindowOpenings && windowCount > 0) {
      const windowY = height * 0.6;
      const spacing = width / (windowCount + 1);
      
      for (let i = 1; i <= windowCount; i++) {
        const windowX = -width / 2 + i * spacing;
        const windowHole = new Shape();
        windowHole.moveTo(windowX - windowWidth / 2, windowY - windowHeight / 2);
        windowHole.lineTo(windowX + windowWidth / 2, windowY - windowHeight / 2);
        windowHole.lineTo(windowX + windowWidth / 2, windowY + windowHeight / 2);
        windowHole.lineTo(windowX - windowWidth / 2, windowY + windowHeight / 2);
        windowHole.lineTo(windowX - windowWidth / 2, windowY - windowHeight / 2);
        shape.holes.push(windowHole);
      }
    }

    const extrudeSettings = { depth: thickness, bevelEnabled: false };
    const geom = new ExtrudeGeometry(shape, extrudeSettings);
    const wall = new Mesh(geom);
    wall.position.set(0, 0, -thickness / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    return group;
  }

  getStylePresets(): Record<string, Partial<WallParams>> {
    return {
      modern: { wallType: 'curtain', thickness: 0.15, material: 'glass' },
      traditional: { wallType: 'solid', thickness: 0.3, material: 'brick' },
      industrial: { wallType: 'solid', material: 'concrete' },
      rustic: { wallType: 'solid', material: 'stone' },
    };
  }
}
