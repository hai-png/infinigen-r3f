/**
 * ApplianceBase - Abstract base class for procedural appliance generation
 * 
 * Provides common functionality for kitchen and laundry appliances including:
 * - Standard appliance dimensions and proportions
 * - Door/handle systems
 * - Control panel generation
 * - Material slots for stainless steel, plastic, glass
 * - Integration with lighting for indicator LEDs
 */

import { Object3D, Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
import { BBox } from '../../../core/util/math/transforms';

export interface ApplianceParams {
  width: number;
  height: number;
  depth: number;
  style: 'modern' | 'retro' | 'industrial' | 'minimal';
  finish: 'stainless' | 'black' | 'white' | 'colored';
  hasDisplay: boolean;
  hasHandle: boolean;
  handleStyle: 'bar' | 'tube' | 'recessed' | 'knob';
  doorCount: number;
  vented: boolean;
}

export abstract class ApplianceBase extends BaseObjectGenerator<ApplianceParams> {
  protected defaultParams: ApplianceParams = {
    width: 0.6,
    height: 0.85,
    depth: 0.65,
    style: 'modern',
    finish: 'stainless',
    hasDisplay: false,
    hasHandle: true,
    handleStyle: 'bar',
    doorCount: 1,
    vented: false,
  };

  constructor() {
    super();
  }

  protected validateParams(params: Partial<ApplianceParams>): Partial<ApplianceParams> {
    const validated: Partial<ApplianceParams> = { ...params };
    
    if (validated.width !== undefined) validated.width = Math.max(0.3, Math.min(1.2, validated.width));
    if (validated.height !== undefined) validated.height = Math.max(0.5, Math.min(2.0, validated.height));
    if (validated.depth !== undefined) validated.depth = Math.max(0.4, Math.min(0.9, validated.depth));
    if (validated.doorCount !== undefined) validated.doorCount = Math.max(1, Math.min(4, validated.doorCount));
    
    return validated;
  }

  protected generateMainBody(params: ApplianceParams): Group {
    const group = new Group();
    
    // Main cabinet body
    const bodyGeo = new BoxGeometry(params.width, params.height, params.depth);
    const body = this.createMesh(bodyGeo, this.getFinishMaterial(params.finish));
    group.add(body);
    
    // Add trim/molding based on style
    if (params.style === 'retro') {
      this.addRetroTrim(group, params);
    } else if (params.style === 'industrial') {
      this.addIndustrialDetails(group, params);
    }
    
    return group;
  }

  protected createDoor(params: ApplianceParams, position: { x: number; y: number; z: number }, size: { w: number; h: number }): Group {
    const doorGroup = new Group();
    
    // Door panel
    const doorGeo = new BoxGeometry(size.w * 0.95, size.h * 0.95, 0.03);
    const door = this.createMesh(doorGeo, this.getFinishMaterial(params.finish));
    door.position.set(position.x, position.y, position.z + params.depth / 2 + 0.015);
    doorGroup.add(door);
    
    // Add handle if requested
    if (params.hasHandle) {
      const handle = this.createHandle(params.handleStyle, size.h, params.finish);
      handle.position.set(position.x + (size.w * 0.3), position.y, position.z + params.depth / 2 + 0.05);
      doorGroup.add(handle);
    }
    
    // Add display panel if requested
    if (params.hasDisplay && position.y > 0) {
      const display = this.createDisplayPanel(params);
      display.position.set(position.x, position.y + size.h * 0.3, position.z + params.depth / 2 + 0.02);
      doorGroup.add(display);
    }
    
    return doorGroup;
  }

  protected createHandle(style: string, height: number, finish: string): Mesh {
    let geometry: any;
    
    switch (style) {
      case 'bar':
        geometry = new BoxGeometry(0.02, height * 0.6, 0.03);
        break;
      case 'tube':
        geometry = new CylinderGeometry(0.015, 0.015, height * 0.5, 16);
        geometry.rotateX(Math.PI / 2);
        break;
      case 'knob':
        geometry = new SphereGeometry(0.025, 16, 16);
        break;
      case 'recessed':
      default:
        // Recessed handles are simulated with darker material on door
        geometry = new BoxGeometry(0.03, height * 0.4, 0.01);
        break;
    }
    
    const material = this.getHandleMaterial(finish);
    return new Mesh(geometry, material);
  }

  protected createDisplayPanel(params: ApplianceParams): Mesh {
    const geometry = new BoxGeometry(0.15, 0.05, 0.01);
    const material = this.createEmissiveMaterial(0x00ffff, 0.3);
    return new Mesh(geometry, material);
  }

  protected addRetroTrim(group: Group, params: ApplianceParams): void {
    // Add chrome trim typical of retro appliances
    const trimMaterial = this.getHandleMaterial('stainless');
    
    // Top trim
    const topTrim = new Mesh(
      new BoxGeometry(params.width + 0.02, 0.02, params.depth + 0.02),
      trimMaterial
    );
    topTrim.position.y = params.height / 2 + 0.01;
    group.add(topTrim);
    
    // Bottom trim
    const bottomTrim = new Mesh(
      new BoxGeometry(params.width + 0.02, 0.02, params.depth + 0.02),
      trimMaterial
    );
    bottomTrim.position.y = -params.height / 2 + 0.01;
    group.add(bottomTrim);
  }

  protected addIndustrialDetails(group: Group, params: ApplianceParams): void {
    // Add visible bolts, exposed elements
    const boltMaterial = this.getHandleMaterial('stainless');
    const boltGeo = new CylinderGeometry(0.01, 0.01, 0.02, 8);
    
    const corners = [
      { x: -params.width / 2 + 0.03, y: params.height / 2 - 0.03 },
      { x: params.width / 2 - 0.03, y: params.height / 2 - 0.03 },
      { x: -params.width / 2 + 0.03, y: -params.height / 2 + 0.03 },
      { x: params.width / 2 - 0.03, y: -params.height / 2 + 0.03 },
    ];
    
    corners.forEach(pos => {
      const bolt = new Mesh(boltGeo, boltMaterial);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(pos.x, pos.y, params.depth / 2 + 0.01);
      group.add(bolt);
    });
  }

  protected getFinishMaterial(finish: string): any {
    // Returns appropriate material based on finish type
    return this.createPBRMaterial({
      color: finish === 'stainless' ? 0xdddddd :
             finish === 'black' ? 0x222222 :
             finish === 'white' ? 0xf5f5f5 : 0x8b4513,
      metalness: finish === 'stainless' ? 0.9 : 0.1,
      roughness: finish === 'stainless' ? 0.2 : 0.5,
    });
  }

  protected getHandleMaterial(finish: string): any {
    return this.createPBRMaterial({
      color: 0xcccccc,
      metalness: 0.95,
      roughness: 0.15,
    });
  }

  protected createEmissiveMaterial(color: number, intensity: number): any {
    return this.createPBRMaterial({
      color: 0x111111,
      emissive: color,
      emissiveIntensity: intensity,
    });
  }

  public getBoundingBox(params: ApplianceParams): BBox {
    return {
      min: { x: -params.width / 2, y: 0, z: -params.depth / 2 },
      max: { x: params.width / 2, y: params.height, z: params.depth / 2 },
    };
  }

  public getCollisionMesh(params: ApplianceParams): Object3D {
    const geometry = new BoxGeometry(params.width, params.height, params.depth);
    return this.createMesh(geometry, this.getCollisionMaterial());
  }

  public getRandomParams(): ApplianceParams {
    const styles = ['modern', 'retro', 'industrial', 'minimal'] as const;
    const finishes = ['stainless', 'black', 'white', 'colored'] as const;
    const handleStyles = ['bar', 'tube', 'recessed', 'knob'] as const;
    
    return {
      width: 0.5 + Math.random() * 0.4,
      height: 0.7 + Math.random() * 0.5,
      depth: 0.55 + Math.random() * 0.2,
      style: styles[Math.floor(Math.random() * styles.length)],
      finish: finishes[Math.floor(Math.random() * finishes.length)],
      hasDisplay: Math.random() > 0.5,
      hasHandle: Math.random() > 0.2,
      handleStyle: handleStyles[Math.floor(Math.random() * handleStyles.length)],
      doorCount: 1 + Math.floor(Math.random() * 3),
      vented: Math.random() > 0.6,
    };
  }
}
