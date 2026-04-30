/**
 * DeskGenerator - Procedural desk generation
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig, ObjectStylePreset } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';

export interface DeskParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  height: number;
  style: ObjectStylePreset;
  deskType: 'writing' | 'computer' | 'executive' | 'standing';
  hasDrawers: boolean;
  drawerCount: number;
  hasHutch: boolean;
  cableManagement: boolean;
  variationSeed?: number;
}

export class DeskGenerator extends BaseObjectGenerator<DeskParams> {
  static readonly GENERATOR_ID = 'desk_generator';
  
  getDefaultConfig(): DeskParams {
    return {
      width: 1.4,
      depth: 0.7,
      height: 0.75,
      style: 'modern',
      deskType: 'computer',
      hasDrawers: true,
      drawerCount: 3,
      hasHutch: false,
      cableManagement: true,
      variationSeed: undefined,
    };
  }

  getDefaultParams() {
    return this.getDefaultConfig();
  }

  generate(params: Partial<DeskParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    const group = new THREE.Group();
    group.name = 'Desk';
    
    const top = this.createTop(finalParams, rng);
    group.add(top);
    
    const base = this.createBase(finalParams, rng);
    group.add(base);
    
    if (finalParams.hasDrawers) {
      const drawers = this.createDrawers(finalParams, rng);
      group.add(drawers);
    }
    
    if (finalParams.hasHutch) {
      const hutch = this.createHutch(finalParams, rng);
      group.add(hutch);
    }
    
    if (finalParams.cableManagement) {
      const cableTray = this.createCableManagement(finalParams, rng);
      group.add(cableTray);
    }
    
    const collisionMesh: THREE.Object3D | undefined = undefined; // this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    group.userData.params = finalParams;
    group.userData.generatorId = DeskGenerator.GENERATOR_ID;
    
    return group;
  }

  private createTop(params: DeskParams, rng: SeededRandom): THREE.Mesh {
    const thickness = params.deskType === 'executive' ? 0.05 : 0.03;
    const geometry = new THREE.BoxGeometry(params.width, thickness, params.depth);
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.4,
      metalness: 0.1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createBase(params: DeskParams, rng: SeededRandom): THREE.Group {
    const base = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: params.style === 'industrial' ? 0x333333 : this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: params.style === 'industrial' ? 0.8 : 0.1,
    });
    
    if (params.deskType === 'standing') {
      // Two-panel legs for standing desk
      const panelGeom = new THREE.BoxGeometry(0.05, params.height, params.depth * 0.8);
      const leftPanel = new THREE.Mesh(panelGeom, material);
      leftPanel.position.set(-params.width / 2 + 0.1, params.height / 2, 0);
      base.add(leftPanel);
      
      const rightPanel = new THREE.Mesh(panelGeom.clone(), material);
      rightPanel.position.set(params.width / 2 - 0.1, params.height / 2, 0);
      base.add(rightPanel);
    } else {
      // Four legs
      const legPositions = [
        { x: params.width / 2 - 0.05, z: params.depth / 2 - 0.05 },
        { x: -(params.width / 2 - 0.05), z: params.depth / 2 - 0.05 },
        { x: params.width / 2 - 0.05, z: -(params.depth / 2 - 0.05) },
        { x: -(params.width / 2 - 0.05), z: -(params.depth / 2 - 0.05) },
      ];
      
      legPositions.forEach(pos => {
        const legGeom = new THREE.BoxGeometry(0.06, params.height, 0.06);
        const leg = new THREE.Mesh(legGeom, material);
        leg.position.set(pos.x, params.height / 2, pos.z);
        leg.castShadow = true;
        base.add(leg);
      });
    }
    
    return base;
  }

  private createDrawers(params: DeskParams, rng: SeededRandom): THREE.Group {
    const drawerGroup = new THREE.Group();
    const drawerWidth = params.width * 0.25;
    const drawerHeight = (params.height - 0.1) / params.drawerCount;
    const drawerDepth = params.depth * 0.9;
    
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.9,
    });
    
    for (let i = 0; i < params.drawerCount; i++) {
      const drawerGeom = new THREE.BoxGeometry(drawerWidth, drawerHeight - 0.01, drawerDepth);
      const drawer = new THREE.Mesh(drawerGeom, material);
      drawer.position.set(
        params.width / 2 - drawerWidth / 2 - 0.05,
        0.05 + i * drawerHeight + drawerHeight / 2,
        0
      );
      drawer.castShadow = true;
      drawerGroup.add(drawer);
      
      // Handle
      const handleGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 8);
      handleGeom.rotateX(Math.PI / 2);
      const handle = new THREE.Mesh(handleGeom, handleMaterial);
      handle.position.set(
        params.width / 2 - 0.02,
        0.05 + i * drawerHeight + drawerHeight / 2,
        drawerDepth / 2 + 0.01
      );
      drawerGroup.add(handle);
    }
    
    return drawerGroup;
  }

  private createHutch(params: DeskParams, rng: SeededRandom): THREE.Group {
    const hutchGroup = new THREE.Group();
    const hutchHeight = 0.5;
    const hutchDepth = params.depth * 0.6;
    const material = new THREE.MeshStandardMaterial({
      color: this.getWoodColor(rng, params.style),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    // Back panel
    const backGeom = new THREE.BoxGeometry(params.width * 0.8, hutchHeight, 0.02);
    const back = new THREE.Mesh(backGeom, material);
    back.position.set(0, params.height + hutchHeight / 2, -hutchDepth / 2 + 0.01);
    hutchGroup.add(back);
    
    // Side panels
    const sideGeom = new THREE.BoxGeometry(0.02, hutchHeight, hutchDepth);
    const leftSide = new THREE.Mesh(sideGeom, material);
    leftSide.position.set(-params.width * 0.4, params.height + hutchHeight / 2, 0);
    hutchGroup.add(leftSide);
    
    const rightSide = new THREE.Mesh(sideGeom.clone(), material);
    rightSide.position.set(params.width * 0.4, params.height + hutchHeight / 2, 0);
    hutchGroup.add(rightSide);
    
    // Shelves
    const shelfGeom = new THREE.BoxGeometry(params.width * 0.76, 0.02, hutchDepth - 0.04);
    const shelf1 = new THREE.Mesh(shelfGeom, material);
    shelf1.position.set(0, params.height + hutchHeight * 0.5, 0);
    hutchGroup.add(shelf1);
    
    return hutchGroup;
  }

  private createCableManagement(params: DeskParams, rng: SeededRandom): THREE.Group {
    const cableGroup = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.7,
      metalness: 0.3,
    });
    
    // Under-desk tray
    const trayGeom = new THREE.BoxGeometry(params.width * 0.6, 0.05, 0.15);
    const tray = new THREE.Mesh(trayGeom, material);
    tray.position.set(0, params.height - 0.1, -params.depth / 2 + 0.2);
    cableGroup.add(tray);
    
    // Grommet hole (simplified as a black cylinder)
    const grommetGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16);
    const grommet = new THREE.Mesh(grommetGeom, material);
    grommet.position.set(params.width * 0.3, params.height, 0);
    cableGroup.add(grommet);
    
    return cableGroup;
  }

  private getWoodColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const colors: Record<ObjectStylePreset, number[]> = {
      modern: [0x654321, 0x8B4513, 0x4A4A4A],
      traditional: [0x654321, 0x8B4513, 0x5C4033],
      industrial: [0x4A3728, 0x3E3E3E, 0x5C5C5C],
      scandinavian: [0xD2B48C, 0xC19A6B, 0xF5F5F5],
      rustic: [0x8B4513, 0xA0522D, 0xCD853F],
    };
    const palette = colors[style] || colors.modern;
    return palette[Math.floor(rng.next() * palette.length)];
  }

  getVariationCount(): number { return 4 * 4 * 2 * 2 * 2; }
  register(): void { ObjectRegistry.register(DeskGenerator.GENERATOR_ID, this); }
}

if (typeof window !== 'undefined') { new DeskGenerator().register(); }
export default DeskGenerator;
