/**
 * Storage & Shelving Units - Phase 1D: Furniture Assets
 * 
 * Procedural storage unit generation system ported from InfiniGen's shelves module.
 * Implements parametric bookcases, cabinets, shelving units, and storage systems.
 */

import { Vector3, BufferGeometry, BoxGeometry, CylinderGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SemanticsTag, MaterialTag, SizeTag, StyleTag } from '../../tags';
import { BBox } from '../../math/bbox';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters } from './furniture';
import { SeededRandom } from '../../util/MathUtils';

export type StorageType = 'bookcase' | 'cabinet' | 'wall_shelf' | 'cube_storage' | 'kitchen_cabinet' | 'display_case';
export type DoorType = 'none' | 'single' | 'double' | 'sliding' | 'glass';
export type DrawerConfig = 'none' | 'top' | 'bottom' | 'middle' | 'multiple';

export interface StorageParameters extends AssetParameters {
  storageType?: StorageType;
  doorType?: DoorType;
  drawerConfig?: DrawerConfig;
  width?: number;
  height?: number;
  depth?: number;
  shelfCount?: number;
  columnCount?: number;
  hasBackPanel?: boolean;
  hasBase?: boolean;
  hasTopCap?: boolean;
  doorHandleStyle?: 'knob' | 'bar' | 'recessed' | 'ring';
  drawerCount?: number;
  legStyle?: 'none' | 'block' | 'tapered' | 'bracket';
  seed?: number;
}

export class StorageGenerator extends BaseAssetGenerator {
  private static readonly STORAGE_TYPES: StorageType[] = [
    'bookcase', 'cabinet', 'wall_shelf', 'cube_storage', 'kitchen_cabinet', 'display_case'
  ];
  
  constructor() {
    super('furniture');
  }
  
  getSupportedTypes(): string[] {
    return ['bookcase', 'cabinet', 'shelf', 'storage'];
  }
  
  getDefaultParameters(type: string): StorageParameters {
    const baseParams: StorageParameters = {
      storageType: 'bookcase',
      doorType: 'none',
      drawerConfig: 'none',
      width: 0.8,
      height: 1.8,
      depth: 0.35,
      shelfCount: 4,
      columnCount: 1,
      hasBackPanel: true,
      hasBase: true,
      hasTopCap: false,
      doorHandleStyle: 'knob',
      drawerCount: 0,
      legStyle: 'block',
      style: 'modern',
      lod: 'medium',
      seed: Math.random()
    };
    
    switch (type) {
      case 'wall_shelf':
        return { ...baseParams, height: 0.4, depth: 0.25, shelfCount: 1, hasBackPanel: false };
      case 'cube_storage':
        return { ...baseParams, width: 1.0, height: 1.0, depth: 0.4, shelfCount: 2, columnCount: 2 };
      case 'kitchen_cabinet':
        return { ...baseParams, height: 0.9, depth: 0.6, doorType: 'solid_door' as any };
      case 'display_case':
        return { ...baseParams, doorType: 'glass', hasBackPanel: false };
      default:
        return baseParams;
    }
  }
  
  generate(params: StorageParameters): GeneratedAsset {
    const rng = new SeededRandom(params.seed ?? Date.now());
    const storageType = params.storageType || rng.choice(StorageGenerator.STORAGE_TYPES);
    const shelfCount = params.shelfCount ?? rng.nextInt(3, 6);
    const columnCount = params.columnCount ?? rng.nextInt(1, 3);
    const width = params.width ?? rng.uniform(0.6, 1.5);
    const height = params.height ?? rng.uniform(1.2, 2.2);
    const depth = params.depth ?? rng.uniform(0.3, 0.5);
    
    const thickness = this.calculateThickness(width, height, params.lod);
    const shelfThickness = Math.max(0.02, thickness * 0.8);
    
    const geometries: BufferGeometry[] = [];
    
    // Side panels
    geometries.push(...this.createSidePanels(width, height, depth, thickness));
    
    // Shelves
    geometries.push(...this.createShelves(width, depth, shelfCount, shelfThickness, thickness, height));
    
    // Back panel
    if (params.hasBackPanel !== false) {
      geometries.push(this.createBackPanel(width, height, thickness));
    }
    
    // Base
    if (params.hasBase !== false) {
      geometries.push(...this.createBase(width, depth, thickness, params.legStyle));
    }
    
    // Top cap
    if (params.hasTopCap) {
      geometries.push(this.createTopCap(width, depth, thickness));
    }
    
    // Doors
    if (params.doorType && params.doorType !== 'none') {
      geometries.push(...this.createDoors(width, height, shelfCount, thickness, depth, params.doorType, params.doorHandleStyle));
    }
    
    // Drawers
    if (params.drawerConfig && params.drawerConfig !== 'none') {
      const drawerCount = params.drawerCount || rng.nextInt(1, 4);
      geometries.push(...this.createDrawers(width, depth, thickness, drawerCount, params.doorHandleStyle));
    }
    
    // Dividers
    if (columnCount > 1) {
      geometries.push(...this.createDividers(height, depth, columnCount, shelfThickness, thickness, width));
    }
    
    let geometry = mergeGeometries(geometries);
    const bbox = BBox.fromGeometry(geometry);
    const sizeTag = this.calculateSizeTag(width, height, depth);
    
    const materialTags: MaterialTag[] = ['wood_solid'];
    if (params.doorType === 'glass') materialTags.push('glass_clear');
    if (params.doorHandleStyle) materialTags.push('metal_brass');
    
    return {
      geometry,
      bbox,
      tags: {
        semantics: this.getSemanticsTag(storageType),
        material: materialTags,
        size: sizeTag,
        style: params.style || 'modern'
      },
      parameters: params,
      lod: params.lod || 'medium',
      collisionGeometry: geometry.clone()
    };
  }
  
  private calculateThickness(width: number, height: number, lod?: string): number {
    const base = Math.max(0.015, Math.min(0.04, width * 0.025));
    return lod === 'low' ? base * 1.2 : base;
  }
  
  private createSidePanels(width: number, height: number, depth: number, thickness: number): BufferGeometry[] {
    const left = new BoxGeometry(thickness, height, depth);
    left.translate(-(width / 2 - thickness / 2), 0, 0);
    
    const right = new BoxGeometry(thickness, height, depth);
    right.translate((width / 2 - thickness / 2), 0, 0);
    
    return [left, right];
  }
  
  private createShelves(width: number, depth: number, shelfCount: number, shelfThickness: number, sideThickness: number, totalHeight: number): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    const innerWidth = width - 2 * sideThickness;
    const shelfDepth = depth - sideThickness;
    const availableHeight = totalHeight - shelfThickness * 2;
    const spacing = availableHeight / (shelfCount + 1);
    
    for (let i = 0; i < shelfCount; i++) {
      const y = -totalHeight / 2 + shelfThickness + spacing * (i + 1);
      const shelf = new BoxGeometry(innerWidth, shelfThickness, shelfDepth);
      shelf.translate(0, y, 0);
      geometries.push(shelf);
    }
    
    return geometries;
  }
  
  private createBackPanel(width: number, height: number, thickness: number): BufferGeometry {
    const panel = new BoxGeometry(width - thickness * 2, height - thickness * 2, thickness * 0.5);
    panel.translate(0, 0, thickness * 0.75);
    return panel;
  }
  
  private createBase(width: number, depth: number, thickness: number, legStyle?: string): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    
    if (legStyle === 'none') {
      const toeKick = new BoxGeometry(width - thickness * 2, thickness * 2, depth - thickness * 2);
      toeKick.translate(0, -thickness * 2, 0);
      geometries.push(toeKick);
    } else if (legStyle === 'block') {
      const legSize = thickness * 2;
      const legHeight = thickness * 3;
      const positions = [
        [-width / 2 + legSize / 2, -legHeight / 2, depth / 2 - legSize / 2],
        [width / 2 - legSize / 2, -legHeight / 2, depth / 2 - legSize / 2],
        [-width / 2 + legSize / 2, -legHeight / 2, -depth / 2 + legSize / 2],
        [width / 2 - legSize / 2, -legHeight / 2, -depth / 2 + legSize / 2]
      ];
      
      for (const pos of positions) {
        const leg = new BoxGeometry(legSize, legHeight, legSize);
        leg.translate(...pos);
        geometries.push(leg);
      }
    } else if (legStyle === 'tapered') {
      const legRadius = thickness * 0.8;
      const legHeight = thickness * 4;
      const positions = [
        [-width / 2 + legRadius, -legHeight / 2, depth / 2 - legRadius],
        [width / 2 - legRadius, -legHeight / 2, depth / 2 - legRadius],
        [-width / 2 + legRadius, -legHeight / 2, -depth / 2 + legRadius],
        [width / 2 - legRadius, -legHeight / 2, -depth / 2 + legRadius]
      ];
      
      for (const pos of positions) {
        const leg = new CylinderGeometry(legRadius * 0.7, legRadius, legHeight, 8);
        leg.translate(...pos);
        geometries.push(leg);
      }
    }
    
    return geometries;
  }
  
  private createTopCap(width: number, depth: number, thickness: number): BufferGeometry {
    const overhang = thickness * 2;
    const cap = new BoxGeometry(width + overhang * 2, thickness * 1.5, depth + overhang);
    cap.translate(0, thickness + thickness * 0.75, 0);
    return cap;
  }
  
  private createDoors(width: number, height: number, shelfCount: number, thickness: number, depth: number, doorType: DoorType, handleStyle?: string): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    const innerWidth = width - thickness * 2;
    const doorHeight = (height - thickness * 2) / shelfCount;
    const doorDepth = thickness * 0.8;
    
    if (doorType === 'single') {
      const door = new BoxGeometry(innerWidth, height - thickness * 2, doorDepth);
      door.translate(thickness / 2, 0, thickness);
      geometries.push(door);
      
      if (handleStyle) {
        const handle = this.createHandle(handleStyle, 0.03);
        handle.translate(innerWidth / 2 - 0.05, 0, thickness + doorDepth + 0.01);
        geometries.push(handle);
      }
    } else if (doorType === 'double') {
      const doorWidth = innerWidth / 2 - thickness / 2;
      
      for (let i = 0; i < shelfCount; i++) {
        const y = -height / 2 + thickness + doorHeight / 2 + i * doorHeight;
        
        const leftDoor = new BoxGeometry(doorWidth, doorHeight - thickness, doorDepth);
        leftDoor.translate(-thickness / 2 - doorWidth / 2, y, thickness);
        geometries.push(leftDoor);
        
        const rightDoor = new BoxGeometry(doorWidth, doorHeight - thickness, doorDepth);
        rightDoor.translate(thickness / 2 + doorWidth / 2, y, thickness);
        geometries.push(rightDoor);
        
        if (handleStyle) {
          const leftHandle = this.createHandle(handleStyle, 0.025);
          leftHandle.translate(-thickness - 0.03, y, thickness + doorDepth + 0.01);
          geometries.push(leftHandle);
          
          const rightHandle = this.createHandle(handleStyle, 0.025);
          rightHandle.translate(thickness + 0.03, y, thickness + doorDepth + 0.01);
          geometries.push(rightHandle);
        }
      }
    } else if (doorType === 'glass') {
      const glassThickness = 0.005;
      const doorWidth = innerWidth / 2 - thickness / 2;
      
      for (let i = 0; i < shelfCount; i++) {
        const y = -height / 2 + thickness + doorHeight / 2 + i * doorHeight;
        
        const leftGlass = new BoxGeometry(doorWidth, doorHeight - thickness, glassThickness);
        leftGlass.translate(-thickness / 2 - doorWidth / 2, y, thickness + doorDepth / 2);
        geometries.push(leftGlass);
        
        const rightGlass = new BoxGeometry(doorWidth, doorHeight - thickness, glassThickness);
        rightGlass.translate(thickness / 2 + doorWidth / 2, y, thickness + doorDepth / 2);
        geometries.push(rightGlass);
      }
    }
    
    return geometries;
  }
  
  private createHandle(style: string, size: number): BufferGeometry {
    if (style === 'bar') {
      return new BoxGeometry(size * 0.3, size * 2, size * 0.5);
    }
    return new CylinderGeometry(size, size, size * 0.5, 16);
  }
  
  private createDrawers(width: number, depth: number, thickness: number, drawerCount: number, handleStyle?: string): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    const innerWidth = width - thickness * 2;
    const drawerHeight = (depth - thickness * 2) / drawerCount;
    const drawerFrontDepth = thickness * 2;
    
    for (let i = 0; i < drawerCount; i++) {
      const y = -depth / 2 + thickness + drawerHeight / 2 + i * drawerHeight;
      
      const front = new BoxGeometry(innerWidth, drawerHeight - thickness, drawerFrontDepth);
      front.translate(0, y, -depth / 2 + drawerFrontDepth / 2);
      geometries.push(front);
      
      const box = new BoxGeometry(innerWidth - thickness * 2, drawerHeight - thickness * 2, depth - thickness * 3 - drawerFrontDepth);
      box.translate(0, y, -thickness * 1.5);
      geometries.push(box);
      
      if (handleStyle) {
        const handle = this.createHandle(handleStyle, 0.03);
        handle.translate(0, y, -depth / 2 + drawerFrontDepth + 0.01);
        geometries.push(handle);
      }
    }
    
    return geometries;
  }
  
  private createDividers(height: number, depth: number, columnCount: number, shelfThickness: number, thickness: number, width: number): BufferGeometry[] {
    const geometries: BufferGeometry[] = [];
    const dividerCount = columnCount - 1;
    const innerWidth = width - thickness * 2;
    const spacing = innerWidth / columnCount;
    
    for (let i = 1; i <= dividerCount; i++) {
      const x = -innerWidth / 2 + spacing * i;
      const divider = new BoxGeometry(thickness, height - shelfThickness * 2, depth - thickness * 2);
      divider.translate(x, 0, 0);
      geometries.push(divider);
    }
    
    return geometries;
  }
  
  private getSemanticsTag(type: StorageType): SemanticsTag {
    const map: Record<StorageType, SemanticsTag> = {
      bookcase: 'storage_furniture',
      cabinet: 'storage_furniture',
      wall_shelf: 'wall_mounted_shelf',
      cube_storage: 'storage_furniture',
      kitchen_cabinet: 'kitchen_cabinet',
      display_case: 'display_furniture'
    };
    return map[type] || 'storage_furniture';
  }
  
  private calculateSizeTag(width: number, height: number, depth: number): SizeTag {
    const volume = width * height * depth;
    if (volume < 0.3) return 'small';
    if (volume < 1.0) return 'medium';
    if (volume < 2.0) return 'large';
    return 'extra_large';
  }
}

export class BookcaseGenerator extends StorageGenerator {
  getDefaultParameters(type: string): StorageParameters {
    const base = super.getDefaultParameters(type);
    return { ...base, storageType: 'bookcase', width: 0.9, height: 2.0, depth: 0.3, shelfCount: 5, hasBackPanel: true, style: 'traditional' };
  }
}

export class KitchenCabinetGenerator extends StorageGenerator {
  getDefaultParameters(type: string): StorageParameters {
    const base = super.getDefaultParameters(type);
    return { ...base, storageType: 'kitchen_cabinet', width: 0.6, height: 0.9, depth: 0.6, doorType: 'single', drawerConfig: 'top', drawerCount: 1, legStyle: 'block' };
  }
}

export class WallShelfGenerator extends StorageGenerator {
  generate(params: StorageParameters): GeneratedAsset {
    return super.generate({ ...params, storageType: 'wall_shelf', hasBackPanel: false, hasBase: false, legStyle: 'none' });
  }
  
  getDefaultParameters(type: string): StorageParameters {
    const base = super.getDefaultParameters(type);
    return { ...base, storageType: 'wall_shelf', width: 0.8, height: 0.35, depth: 0.25, shelfCount: 1 };
  }
}

export class CubeStorageGenerator extends StorageGenerator {
  generate(params: StorageParameters): GeneratedAsset {
    return super.generate({ ...params, storageType: 'cube_storage', columnCount: params.columnCount ?? 2, shelfCount: params.shelfCount ?? 2 });
  }
  
  getDefaultParameters(type: string): StorageParameters {
    const base = super.getDefaultParameters(type);
    return { ...base, storageType: 'cube_storage', width: 0.8, height: 0.8, depth: 0.4, columnCount: 2, shelfCount: 2, hasBackPanel: false };
  }
}
