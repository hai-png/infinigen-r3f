/**
 * CabinetGenerator - Procedural cabinet generation
 */

import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';

export interface CabinetParams {
  width: number;
  height: number;
  depth: number;
  style: ObjectStylePreset;
  cabinetType: 'base' | 'wall' | 'tall' | 'corner';
  doorCount: number;
  drawerCount: number;
  hasGlassDoors: boolean;
  hasShelves: boolean;
  variationSeed?: number;
}

export class CabinetGenerator extends BaseObjectGenerator<CabinetParams> {
  static readonly GENERATOR_ID = 'cabinet_generator';
  
  getDefaultParams(): CabinetParams {
    return {
      width: 0.8,
      height: 0.9,
      depth: 0.6,
      style: 'modern',
      cabinetType: 'base',
      doorCount: 2,
      drawerCount: 0,
      hasGlassDoors: false,
      hasShelves: true,
      variationSeed: undefined,
    };
  }

  generate(params: Partial<CabinetParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    const group = new THREE.Group();
    group.name = 'Cabinet';
    
    const carcass = this.createCarcass(finalParams, rng);
    group.add(carcass);
    
    if (finalParams.drawerCount > 0) {
      const drawers = this.createDrawers(finalParams, rng);
      group.add(drawers);
    }
    
    const doors = this.createDoors(finalParams, rng);
    group.add(doors);
    
    if (finalParams.hasShelves) {
      const shelves = this.createInteriorShelves(finalParams, rng);
      group.add(shelves);
    }
    
    const countertop = this.createCountertop(finalParams, rng);
    group.add(countertop);
    
    const collisionMesh = this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    group.userData.params = finalParams;
    group.userData.generatorId = CabinetGenerator.GENERATOR_ID;
    
    return group;
  }

  private createCarcass(params: CabinetParams, rng: SeededRandom): THREE.Group {
    const carcass = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    const thickness = 0.02;
    
    // Bottom
    const bottomGeom = new THREE.BoxGeometry(params.width, thickness, params.depth);
    const bottom = new THREE.Mesh(bottomGeom, material);
    bottom.position.y = thickness / 2;
    carcass.add(bottom);
    
    // Sides
    const sideHeight = params.cabinetType === 'tall' ? params.height : params.height - thickness;
    const sideGeom = new THREE.BoxGeometry(thickness, sideHeight, params.depth);
    
    const leftSide = new THREE.Mesh(sideGeom, material);
    leftSide.position.set(-params.width / 2 + thickness / 2, sideHeight / 2, 0);
    carcass.add(leftSide);
    
    const rightSide = new THREE.Mesh(sideGeom.clone(), material);
    rightSide.position.set(params.width / 2 - thickness / 2, sideHeight / 2, 0);
    carcass.add(rightSide);
    
    // Back
    if (params.cabinetType !== 'wall') {
      const backGeom = new THREE.BoxGeometry(params.width, sideHeight, thickness);
      const back = new THREE.Mesh(backGeom, material);
      back.position.set(0, sideHeight / 2, -params.depth / 2 + thickness / 2);
      carcass.add(back);
    }
    
    return carcass;
  }

  private createDrawers(params: CabinetParams, rng: SeededRandom): THREE.Group {
    const drawerGroup = new THREE.Group();
    const drawerWidth = params.width - 0.06;
    const drawerHeight = (params.height - 0.1) / (params.drawerCount + 1);
    const drawerDepth = params.depth - 0.04;
    
    const drawerMat = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.4,
      metalness: 0.1,
    });
    
    const handleMat = new THREE.MeshStandardMaterial({
      color: params.style === 'modern' ? 0x333333 : 0x888888,
      roughness: 0.3,
      metalness: 0.9,
    });
    
    for (let i = 0; i < params.drawerCount; i++) {
      const drawerBox = new THREE.Group();
      
      // Drawer front
      const frontGeom = new THREE.BoxGeometry(drawerWidth, drawerHeight - 0.01, 0.02);
      const front = new THREE.Mesh(frontGeom, drawerMat);
      front.position.z = drawerDepth / 2;
      drawerBox.add(front);
      
      // Drawer sides
      const sideGeom = new THREE.BoxGeometry(0.015, drawerHeight - 0.02, drawerDepth - 0.03);
      const leftSide = new THREE.Mesh(sideGeom, drawerMat);
      leftSide.position.set(-drawerWidth / 2 + 0.0075, 0, 0);
      drawerBox.add(leftSide);
      
      const rightSide = new THREE.Mesh(sideGeom.clone(), drawerMat);
      rightSide.position.set(drawerWidth / 2 - 0.0075, 0, 0);
      drawerBox.add(rightSide);
      
      // Drawer bottom
      const bottomGeom = new THREE.BoxGeometry(drawerWidth - 0.03, 0.01, drawerDepth - 0.03);
      const bottom = new THREE.Mesh(bottomGeom, drawerMat);
      bottom.position.y = -(drawerHeight - 0.02) / 2;
      drawerBox.add(bottom);
      
      // Handle
      const handleGeom = params.style === 'modern' 
        ? new THREE.BoxGeometry(0.15, 0.01, 0.02)
        : new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8);
      
      if (params.style === 'modern') {
        handleGeom.rotateX(Math.PI / 2);
      } else {
        handleGeom.rotateZ(Math.PI / 2);
      }
      
      const handle = new THREE.Mesh(handleGeom, handleMat);
      handle.position.set(0, 0, drawerDepth / 2 + 0.015);
      drawerBox.add(handle);
      
      drawerBox.position.set(0, 0.05 + i * drawerHeight + drawerHeight / 2, 0);
      drawerGroup.add(drawerBox);
    }
    
    return drawerGroup;
  }

  private createDoors(params: CabinetParams, rng: SeededRandom): THREE.Group {
    const doorGroup = new THREE.Group();
    const doorHeight = params.height - (params.drawerCount > 0 ? (params.drawerCount * ((params.height - 0.1) / (params.drawerCount + 1))) + 0.05 : 0.02);
    const doorWidth = (params.width - 0.04) / params.doorCount;
    const doorY = params.drawerCount > 0 
      ? params.drawerCount * ((params.height - 0.1) / (params.drawerCount + 1)) + 0.05 + doorHeight / 2
      : doorHeight / 2;
    
    const frameMat = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.4,
      metalness: 0.1,
    });
    
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: params.hasGlassDoors ? 0.3 : 1.0,
      roughness: 0.1,
      metalness: 0.0,
      transmission: params.hasGlassDoors ? 0.9 : 0.0,
    });
    
    for (let i = 0; i < params.doorCount; i++) {
      const door = new THREE.Group();
      
      if (params.hasGlassDoors) {
        // Frame with glass panel
        const stileGeom = new THREE.BoxGeometry(0.05, doorHeight, 0.02);
        const railGeom = new THREE.BoxGeometry(doorWidth - 0.1, 0.05, 0.02);
        
        const leftStile = new THREE.Mesh(stileGeom, frameMat);
        leftStile.position.set(-doorWidth / 2 + 0.025, 0, 0);
        door.add(leftStile);
        
        const rightStile = new THREE.Mesh(stileGeom.clone(), frameMat);
        rightStile.position.set(doorWidth / 2 - 0.025, 0, 0);
        door.add(rightStile);
        
        const topRail = new THREE.Mesh(railGeom, frameMat);
        topRail.position.set(0, doorHeight / 2 - 0.025, 0);
        door.add(topRail);
        
        const bottomRail = new THREE.Mesh(railGeom.clone(), frameMat);
        bottomRail.position.set(0, -doorHeight / 2 + 0.025, 0);
        door.add(bottomRail);
        
        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.12, doorHeight - 0.12, 0.015), glassMat);
        glassPanel.position.z = 0.002;
        door.add(glassPanel);
      } else {
        // Solid door with panel detail
        const doorGeom = new THREE.BoxGeometry(doorWidth, doorHeight, 0.02);
        const doorMesh = new THREE.Mesh(doorGeom, frameMat);
        door.add(doorMesh);
        
        // Recessed panel
        const panelGeom = new THREE.BoxGeometry(doorWidth - 0.1, doorHeight - 0.1, 0.005);
        const panelMat = new THREE.MeshStandardMaterial({
          color: this.getWoodColor(rng, params.style),
          roughness: 0.5,
        });
        const panel = new THREE.Mesh(panelGeom, panelMat);
        panel.position.z = 0.01;
        door.add(panel);
      }
      
      // Handle
      const handleGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8);
      handleGeom.rotateX(Math.PI / 2);
      const handleMat = new THREE.MeshStandardMaterial({
        color: params.style === 'modern' ? 0x333333 : 0xC9A961,
        roughness: 0.3,
        metalness: 0.9,
      });
      const handle = new THREE.Mesh(handleGeom, handleMat);
      handle.position.set(
        i === 0 ? doorWidth / 2 - 0.03 : -doorWidth / 2 + 0.03,
        0,
        params.hasGlassDoors ? 0.025 : 0.015
      );
      door.add(handle);
      
      door.position.set(-params.width / 2 + 0.02 + i * doorWidth + doorWidth / 2, doorY, params.depth / 2);
      doorGroup.add(door);
    }
    
    return doorGroup;
  }

  private createInteriorShelves(params: CabinetParams, rng: SeededRandom): THREE.Group {
    const shelfGroup = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    const shelfCount = params.cabinetType === 'tall' ? 4 : 2;
    const shelfSpacing = (params.height - 0.1) / (shelfCount + 1);
    
    for (let i = 1; i <= shelfCount; i++) {
      const shelfGeom = new THREE.BoxGeometry(params.width - 0.05, 0.02, params.depth - 0.03);
      const shelf = new THREE.Mesh(shelfGeom, material);
      shelf.position.set(0, i * shelfSpacing, 0);
      shelfGroup.add(shelf);
    }
    
    return shelfGroup;
  }

  private createCountertop(params: CabinetParams, rng: SeededRandom): THREE.Mesh {
    if (params.cabinetType === 'wall') return null as any;
    
    const overhang = 0.03;
    const thickness = params.style === 'modern' ? 0.03 : 0.04;
    const geometry = new THREE.BoxGeometry(
      params.width + overhang * 2,
      thickness,
      params.depth + overhang
    );
    
    const material = params.style === 'modern'
      ? new THREE.MeshStandardMaterial({
          color: this.getStoneColor(rng),
          roughness: 0.3,
          metalness: 0.1,
        })
      : new THREE.MeshStandardMaterial({
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

  private getStoneColor(rng: SeededRandom): number {
    const colors = [0xFFFFFF, 0xF5F5F5, 0xE8E8E8, 0x333333];
    return colors[Math.floor(rng.next() * colors.length)];
  }

  getVariationCount(): number { return 4 * 4 * 3 * 4 * 2 * 2; }
  register(): void { ObjectRegistry.register(CabinetGenerator.GENERATOR_ID, this); }
}

if (typeof window !== 'undefined') { new CabinetGenerator().register(); }
export default CabinetGenerator;
