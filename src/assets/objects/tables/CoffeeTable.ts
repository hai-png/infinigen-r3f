/**
 * CoffeeTable - Procedural coffee table generation
 */

import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';
import { extrudeShape } from '../../utils/curves';

export interface CoffeeTableParams {
  width: number;
  depth: number;
  height: number;
  style: ObjectStylePreset;
  topShape: 'rectangular' | 'round' | 'oval' | 'organic';
  topMaterial: 'wood' | 'glass' | 'stone' | 'marble';
  baseType: 'four_legs' | 'pedestal' | 'nested' | 'sculptural';
  hasShelf: boolean;
  variationSeed?: number;
}

export class CoffeeTable extends BaseObjectGenerator<CoffeeTableParams> {
  static readonly GENERATOR_ID = 'coffee_table';
  
  getDefaultParams(): CoffeeTableParams {
    return {
      width: 1.2,
      depth: 0.6,
      height: 0.45,
      style: 'modern',
      topShape: 'rectangular',
      topMaterial: 'wood',
      baseType: 'four_legs',
      hasShelf: false,
      variationSeed: undefined,
    };
  }

  generate(params: Partial<CoffeeTableParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    const group = new THREE.Group();
    group.name = 'CoffeeTable';
    
    const top = this.createTop(finalParams, rng);
    group.add(top);
    
    const base = this.createBase(finalParams, rng);
    group.add(base);
    
    if (finalParams.hasShelf) {
      const shelf = this.createShelf(finalParams, rng);
      group.add(shelf);
    }
    
    const collisionMesh = this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    group.userData.params = finalParams;
    group.userData.generatorId = CoffeeTable.GENERATOR_ID;
    
    return group;
  }

  private createTop(params: CoffeeTableParams, rng: SeededRandom): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    
    switch (params.topShape) {
      case 'round':
        geometry = new THREE.CylinderGeometry(params.width / 2, params.width / 2, 0.04, 32);
        break;
      case 'oval':
        const shape = new THREE.Shape();
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          const x = (params.width / 2) * Math.cos(angle);
          const z = (params.depth / 2) * Math.sin(angle);
          i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
        }
        geometry = extrudeShape(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.01 });
        break;
      case 'organic':
        const orgShape = new THREE.Shape();
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          const r = (Math.min(params.width, params.depth) / 2) * (0.8 + 0.2 * Math.sin(angle * 3));
          const x = r * Math.cos(angle);
          const z = r * Math.sin(angle);
          i === 0 ? orgShape.moveTo(x, z) : orgShape.lineTo(x, z);
        }
        geometry = extrudeShape(orgShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.01 });
        break;
      default:
        geometry = new THREE.BoxGeometry(params.width, 0.04, params.depth);
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: params.topMaterial === 'glass' ? 0xffffff : this.getMaterialColor(rng, params),
      roughness: params.topMaterial === 'glass' ? 0.1 : 0.4,
      metalness: params.topMaterial === 'glass' ? 0.0 : 0.1,
      transparent: params.topMaterial === 'glass',
      opacity: params.topMaterial === 'glass' ? 0.5 : 1.0,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createBase(params: CoffeeTableParams, rng: SeededRandom): THREE.Group {
    const base = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.getMaterialColor(rng, params),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    if (params.baseType === 'four_legs') {
      const legPositions = [
        { x: params.width / 2 - 0.08, z: params.depth / 2 - 0.08 },
        { x: -(params.width / 2 - 0.08), z: params.depth / 2 - 0.08 },
        { x: params.width / 2 - 0.08, z: -(params.depth / 2 - 0.08) },
        { x: -(params.width / 2 - 0.08), z: -(params.depth / 2 - 0.08) },
      ];
      legPositions.forEach(pos => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, params.height - 0.04, 8), material);
        leg.position.set(pos.x, (params.height - 0.04) / 2, pos.z);
        leg.castShadow = true;
        base.add(leg);
      });
    } else if (params.baseType === 'pedestal') {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, params.height - 0.04, 16), material);
      column.position.y = (params.height - 0.04) / 2;
      column.castShadow = true;
      base.add(column);
      
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.05, 16), material);
      foot.position.y = 0.025;
      foot.castShadow = true;
      base.add(foot);
    } else if (params.baseType === 'nested') {
      for (let i = 0; i < 3; i++) {
        const size = 0.3 - i * 0.08;
        const nested = new THREE.Mesh(new THREE.CylinderGeometry(size, size, params.height * (0.4 + i * 0.2), 16), material);
        nested.position.set(-0.2 + i * 0.2, params.height * (0.2 + i * 0.1), -0.1 + i * 0.1);
        nested.castShadow = true;
        base.add(nested);
      }
    } else {
      const雕塑 = new THREE.Mesh(new THREE.TorusKnotGeometry(0.15, 0.05, 64, 8), material);
      雕塑.position.y = (params.height - 0.04) / 2;
      雕塑.castShadow = true;
      base.add(雕塑);
    }
    
    return base;
  }

  private createShelf(params: CoffeeTableParams, rng: SeededRandom): THREE.Mesh {
    const geometry = params.topShape === 'round' 
      ? new THREE.CylinderGeometry(params.width / 2 - 0.1, params.width / 2 - 0.1, 0.03, 32)
      : new THREE.BoxGeometry(params.width - 0.2, 0.03, params.depth - 0.2);
    
    const material = new THREE.MeshStandardMaterial({
      color: this.getMaterialColor(rng, params),
      roughness: 0.5,
      metalness: 0.1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.height / 2;
    mesh.castShadow = true;
    return mesh;
  }

  private getMaterialColor(rng: SeededRandom, params: CoffeeTableParams): number {
    const colors: Record<string, number[]> = {
      wood: [0x654321, 0x8B4513, 0xA0522D, 0xD2B48C],
      stone: [0xF5F5F5, 0xE8E8E8, 0x808080],
      marble: [0xFFFFFF, 0xF5F5F5, 0xFFFAF0],
    };
    const palette = colors[params.topMaterial] || colors.wood;
    return palette[Math.floor(rng.next() * palette.length)];
  }

  getVariationCount(): number { return 4 * 4 * 4 * 2; }
  register(): void { ObjectRegistry.register(CoffeeTable.GENERATOR_ID, this); }
}

if (typeof window !== 'undefined') { new CoffeeTable().register(); }
export default CoffeeTable;
