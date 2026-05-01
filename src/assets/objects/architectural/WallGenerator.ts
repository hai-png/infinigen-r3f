/**
 * WallGenerator - Procedural wall segment generation
 * FIX: Walls are now Mesh objects with proper MeshStandardMaterial
 */
import { Group, Mesh, BoxGeometry, ExtrudeGeometry, Shape, MeshStandardMaterial, Color } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface WallParams extends BaseGeneratorConfig {
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
    super(seed);
  }

  getDefaultConfig(): WallParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<WallParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, height, thickness, wallType, hasDoorOpening, doorWidth, doorHeight, hasWindowOpenings, windowCount, windowWidth, windowHeight, material, style } = finalParams;

    const wallMaterial = this.getWallMaterial(material, style);

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
    const wall = new Mesh(geom, wallMaterial);
    wall.position.set(0, 0, -thickness / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.name = 'wall';
    group.add(wall);

    return group;
  }

  private getWallMaterial(material: string, style: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      brick: { color: 0x8b4513, roughness: 0.95, metalness: 0.0 },
      stone: { color: 0x808080, roughness: 0.85, metalness: 0.0 },
      wood: { color: 0x8b6914, roughness: 0.75, metalness: 0.0 },
      glass: { color: 0x88ccff, roughness: 0.1, metalness: 0.1 },
      drywall: { color: 0xeeeeee, roughness: 0.8, metalness: 0.0 },
    };
    const config = configs[material] || configs.concrete;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
      transparent: material === 'glass',
      opacity: material === 'glass' ? 0.3 : 1.0,
    });
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
