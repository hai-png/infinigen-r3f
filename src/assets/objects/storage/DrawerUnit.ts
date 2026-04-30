/**
 * DrawerUnit - Procedural drawer system generation
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig, ObjectStylePreset } from '../utils';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';

export interface DrawerUnitParams extends BaseGeneratorConfig {
  width: number;
  height: number;
  depth: number;
  style: ObjectStylePreset;
  unitType: 'chest' | 'filing' | 'nightstand' | 'dresser';
  drawerCount: number;
  hasWheels: boolean;
  lockable: boolean;
  variationSeed?: number;
}

export class DrawerUnit extends BaseObjectGenerator<DrawerUnitParams> {
  static readonly GENERATOR_ID = 'drawer_unit';
  
  getDefaultConfig(): DrawerUnitParams {
    return {
      width: 0.6,
      height: 1.2,
      depth: 0.5,
      style: 'modern',
      unitType: 'chest',
      drawerCount: 4,
      hasWheels: false,
      lockable: false,
      variationSeed: undefined,
    };
  }

  getDefaultParams() {
    return this.getDefaultConfig();
  }

  generate(params: Partial<DrawerUnitParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    const group = new THREE.Group();
    group.name = 'DrawerUnit';
    
    const frame = this.createFrame(finalParams, rng);
    group.add(frame);
    
    const drawers = this.createDrawers(finalParams, rng);
    group.add(drawers);
    
    if (finalParams.hasWheels) {
      const wheels = this.createWheels(finalParams, rng);
      group.add(wheels);
    }
    
    const top = this.createTop(finalParams, rng);
    group.add(top);
    
    const collisionMesh: THREE.Object3D | undefined = undefined; // this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    group.userData.params = finalParams;
    group.userData.generatorId = DrawerUnit.GENERATOR_ID;
    
    return group;
  }

  private createFrame(params: DrawerUnitParams, rng: SeededRandom): THREE.Group {
    const frame = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    const thickness = 0.02;
    
    // Sides
    const sideGeom = new THREE.BoxGeometry(thickness, params.height, params.depth);
    const leftSide = new THREE.Mesh(sideGeom, material);
    leftSide.position.set(-params.width / 2 + thickness / 2, params.height / 2, 0);
    frame.add(leftSide);
    
    const rightSide = new THREE.Mesh(sideGeom.clone(), material);
    rightSide.position.set(params.width / 2 - thickness / 2, params.height / 2, 0);
    frame.add(rightSide);
    
    // Back
    const backGeom = new THREE.BoxGeometry(params.width, params.height, thickness);
    const back = new THREE.Mesh(backGeom, material);
    back.position.set(0, params.height / 2, -params.depth / 2 + thickness / 2);
    frame.add(back);
    
    // Bottom
    const bottomGeom = new THREE.BoxGeometry(params.width, thickness, params.depth);
    const bottom = new THREE.Mesh(bottomGeom, material);
    bottom.position.y = thickness / 2;
    frame.add(bottom);
    
    return frame;
  }

  private createDrawers(params: DrawerUnitParams, rng: SeededRandom): THREE.Group {
    const drawerGroup = new THREE.Group();
    const drawerWidth = params.width - 0.05;
    const drawerHeight = (params.height - 0.1) / params.drawerCount - 0.01;
    const drawerDepth = params.depth - 0.04;
    
    const drawerMat = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.4,
      metalness: params.style === 'modern' ? 0.0 : 0.1,
    });
    
    const handleMat = new THREE.MeshStandardMaterial({
      color: this.getHandleColor(rng, params.style),
      roughness: 0.3,
      metalness: 0.9,
    });
    
    for (let i = 0; i < params.drawerCount; i++) {
      const drawerBox = new THREE.Group();
      
      // Drawer front
      const frontGeom = new THREE.BoxGeometry(drawerWidth, drawerHeight, 0.025);
      const front = new THREE.Mesh(frontGeom, drawerMat);
      front.position.z = drawerDepth / 2 + 0.01;
      drawerBox.add(front);
      
      // Drawer box sides
      const sideThickness = 0.012;
      const sideGeom = new THREE.BoxGeometry(sideThickness, drawerHeight - 0.02, drawerDepth - 0.02);
      
      const leftSide = new THREE.Mesh(sideGeom, drawerMat);
      leftSide.position.set(-drawerWidth / 2 + sideThickness / 2, 0, 0);
      drawerBox.add(leftSide);
      
      const rightSide = new THREE.Mesh(sideGeom.clone(), drawerMat);
      rightSide.position.set(drawerWidth / 2 - sideThickness / 2, 0, 0);
      drawerBox.add(rightSide);
      
      // Drawer bottom
      const bottomGeom = new THREE.BoxGeometry(drawerWidth - sideThickness * 2, 0.01, drawerDepth - 0.03);
      const bottom = new THREE.Mesh(bottomGeom, drawerMat);
      bottom.position.y = -(drawerHeight - 0.02) / 2;
      drawerBox.add(bottom);
      
      // Handle
      const handleType = params.style === 'modern' ? 'bar' : params.style === 'traditional' ? 'knob' : 'cup';
      const handle = this.createHandle(handleType, handleMat, drawerWidth, drawerDepth);
      handle.position.z = drawerDepth / 2 + 0.02;
      drawerBox.add(handle);
      
      // Lock if applicable
      if (params.lockable && i === 0) {
        const lockGeom = new THREE.BoxGeometry(0.02, 0.03, 0.01);
        const lock = new THREE.Mesh(lockGeom, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 }));
        lock.position.set(drawerWidth / 2 - 0.08, 0, drawerDepth / 2 + 0.015);
        drawerBox.add(lock);
      }
      
      drawerBox.position.set(0, -params.height / 2 + 0.05 + drawerHeight / 2 + i * (drawerHeight + 0.01), 0);
      drawerGroup.add(drawerBox);
    }
    
    return drawerGroup;
  }

  private createHandle(type: string, material: THREE.Material, width: number, depth: number): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    
    switch (type) {
      case 'bar':
        geometry = new THREE.BoxGeometry(0.2, 0.015, 0.02);
        break;
      case 'knob':
        geometry = new THREE.SphereGeometry(0.02, 16, 16);
        break;
      case 'cup':
        geometry = new THREE.TorusGeometry(0.03, 0.005, 8, 16, Math.PI);
        geometry.rotateX(Math.PI);
        break;
      default:
        geometry = new THREE.BoxGeometry(0.15, 0.01, 0.02);
    }
    
    return new THREE.Mesh(geometry, material);
  }

  private createWheels(params: DrawerUnitParams, rng: SeededRandom): THREE.Group {
    const wheelGroup = new THREE.Group();
    const wheelRadius = 0.03;
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.02, 16);
    wheelGeom.rotateX(Math.PI / 2);
    
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.7,
      metalness: 0.3,
    });
    
    const positions = [
      { x: -params.width / 2 + 0.05, z: -params.depth / 2 + 0.05 },
      { x: params.width / 2 - 0.05, z: -params.depth / 2 + 0.05 },
      { x: -params.width / 2 + 0.05, z: params.depth / 2 - 0.05 },
      { x: params.width / 2 - 0.05, z: params.depth / 2 - 0.05 },
    ];
    
    positions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(pos.x, wheelRadius, pos.z);
      wheelGroup.add(wheel);
    });
    
    return wheelGroup;
  }

  private createTop(params: DrawerUnitParams, rng: SeededRandom): THREE.Mesh {
    const overhang = 0.02;
    const thickness = 0.025;
    const geometry = new THREE.BoxGeometry(
      params.width + overhang * 2,
      thickness,
      params.depth + overhang
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.4,
      metalness: 0.1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.height + thickness / 2;
    mesh.castShadow = true;
    return mesh;
  }

  private getWoodColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const colors: Record<ObjectStylePreset, number[]> = {
      modern: [0xFFFFFF, 0xE8E8E8, 0x4A4A4A],
      traditional: [0x8B4513, 0xA0522D, 0x654321],
      industrial: [0x3E3E3E, 0x5C5C5C, 0x4A3728],
      scandinavian: [0xF5F5F5, 0xD2B48C, 0xFFFFFF],
      rustic: [0x8B4513, 0xCD853F, 0xA0522D],
    };
    return colors[style][Math.floor(rng.next() * colors[style].length)];
  }

  private getHandleColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const colors: Record<ObjectStylePreset, number[]> = {
      modern: [0x333333, 0x888888, 0xC0C0C0],
      traditional: [0xC9A961, 0x8B4513, 0x2F4F4F],
      industrial: [0x333333, 0x5C5C5C],
      scandinavian: [0x333333, 0xC0C0C0],
      rustic: [0x8B4513, 0x2F4F4F],
    };
    return colors[style][Math.floor(rng.next() * colors[style].length)];
  }

  getVariationCount(): number { return 4 * 4 * 5 * 2 * 2; }
  register(): void { ObjectRegistry.register(DrawerUnit.GENERATOR_ID, this); }
}

if (typeof window !== 'undefined') { new DrawerUnit().register(); }
export default DrawerUnit;
