/**
 * DiningTable - Procedural dining table generation
 * 
 * Generates various dining table styles with configurable tops, legs,
 * and extension mechanisms.
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig, ObjectStylePreset } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';
import { extrudeShape } from '../../utils/curves';

export interface DiningTableParams extends BaseGeneratorConfig {
  // Dimensions
  width: number;
  depth: number;
  height: number;
  
  // Style
  style: ObjectStylePreset;
  
  // Top
  topShape: 'rectangular' | 'round' | 'oval' | 'square';
  topThickness: number;
  topMaterial: 'wood' | 'glass' | 'stone' | 'metal';
  
  // Base
  baseType: 'four_legs' | 'pedestal' | 'trestle' | 'sled';
  legStyle: 'straight' | 'tapered' | 'cabriole' | 'hairpin';
  
  // Features
  extendable: boolean;
  extensionLeaves: number;
  apron: boolean;
  apronHeight: number;
  
  variationSeed?: number;
}

export class DiningTable extends BaseObjectGenerator<DiningTableParams> {
  static readonly GENERATOR_ID = 'dining_table';
  
  getDefaultConfig(): DiningTableParams {
    return {
      width: 1.2,
      depth: 2.0,
      height: 0.75,
      style: 'modern',
      topShape: 'rectangular',
      topThickness: 0.04,
      topMaterial: 'wood',
      baseType: 'four_legs',
      legStyle: 'straight',
      extendable: false,
      extensionLeaves: 1,
      apron: true,
      apronHeight: 0.1,
      variationSeed: undefined,
    };
  }

  generate(params: Partial<DiningTableParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    
    const group = new THREE.Group();
    group.name = 'DiningTable';
    
    // Generate table top
    const top = this.createTop(finalParams, rng);
    group.add(top);
    
    // Generate base
    const base = this.createBase(finalParams, rng);
    group.add(base);
    
    // Add apron if requested
    if (finalParams.apron) {
      const apron = this.createApron(finalParams, rng);
      group.add(apron);
    }
    
    // Add extension mechanism if extendable
    if (finalParams.extendable) {
      const extension = this.createExtensionMechanism(finalParams, rng);
      group.add(extension);
    }
    
    // Generate collision mesh
    const collisionMesh: THREE.Object3D | undefined = undefined; // this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    group.userData.params = finalParams;
    group.userData.generatorId = DiningTable.GENERATOR_ID;
    
    return group;
  }

  private createTop(params: DiningTableParams, rng: SeededRandom): THREE.Mesh {
    const geometry = this.getTopGeometry(params, rng);
    const material = this.getTopMaterial(params, rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private getTopGeometry(params: DiningTableParams, rng: SeededRandom): THREE.BufferGeometry {
    switch (params.topShape) {
      case 'rectangular':
        return this.createRectangularTop(params, rng);
      case 'round':
        return this.createRoundTop(params, rng);
      case 'oval':
        return this.createOvalTop(params, rng);
      case 'square':
        return this.createSquareTop(params, rng);
      default:
        return this.createRectangularTop(params, rng);
    }
  }

  private createRectangularTop(params: DiningTableParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.extendable 
      ? params.width + (params.extensionLeaves * 0.4) 
      : params.width;
    
    if (params.style === 'traditional') {
      // Add decorative edge profile
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -params.depth / 2);
      
      // Bullnose edge
      shape.lineTo(width / 2, -params.depth / 2);
      shape.quadraticCurveTo(width / 2 + 0.01, -params.depth / 2, width / 2, -params.depth / 2 + 0.01);
      shape.lineTo(width / 2, params.depth / 2);
      shape.quadraticCurveTo(width / 2 + 0.01, params.depth / 2, width / 2, params.depth / 2 - 0.01);
      shape.lineTo(-width / 2, params.depth / 2);
      shape.quadraticCurveTo(-width / 2 - 0.01, params.depth / 2, -width / 2, params.depth / 2 - 0.01);
      shape.lineTo(-width / 2, -params.depth / 2);
      shape.quadraticCurveTo(-width / 2 - 0.01, -params.depth / 2, -width / 2, -params.depth / 2 + 0.01);
      
      const extrudeSettings = {
        depth: params.topThickness,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.01,
        bevelSegments: 4,
      };
      
      return extrudeShape(shape, extrudeSettings);
    } else {
      // Simple box
      return new THREE.BoxGeometry(width, params.topThickness, params.depth);
    }
  }

  private createRoundTop(params: DiningTableParams, rng: SeededRandom): THREE.BufferGeometry {
    const diameter = Math.min(params.width, params.depth);
    const segments = 64;
    
    if (params.topMaterial === 'glass') {
      return new THREE.CylinderGeometry(diameter / 2, diameter / 2, params.topThickness, segments);
    } else {
      // Add slight dome for wood/stone
      const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, params.topThickness, segments);
      const positions = geometry.attributes.position.array;
      
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const dist = Math.sqrt(x * x + z * z) / (diameter / 2);
        
        if (dist < 0.9 && positions[i + 1] > 0) {
          positions[i + 1] += (1 - dist) * 0.01;
        }
      }
      
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      return geometry;
    }
  }

  private createOvalTop(params: DiningTableParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.extendable 
      ? params.width + (params.extensionLeaves * 0.4) 
      : params.width;
    const segments = 64;
    
    const shape = new THREE.Shape();
    const a = width / 2;
    const b = params.depth / 2;
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = a * Math.cos(angle);
      const z = b * Math.sin(angle);
      
      if (i === 0) {
        shape.moveTo(x, z);
      } else {
        shape.lineTo(x, z);
      }
    }
    
    const extrudeSettings = {
      depth: params.topThickness,
      bevelEnabled: params.style !== 'modern',
      bevelThickness: 0.005,
      bevelSize: 0.01,
      bevelSegments: 3,
    };
    
    return extrudeShape(shape, extrudeSettings);
  }

  private createSquareTop(params: DiningTableParams, rng: SeededRandom): THREE.BufferGeometry {
    const size = Math.min(params.width, params.depth);
    return new THREE.BoxGeometry(size, params.topThickness, size);
  }

  private getTopMaterial(params: DiningTableParams, rng: SeededRandom): THREE.Material {
    switch (params.topMaterial) {
      case 'wood':
        return new THREE.MeshStandardMaterial({
          color: this.getWoodColor(rng, params.style),
          roughness: 0.5,
          metalness: 0.0,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.3,
          roughness: 0.1,
          metalness: 0.0,
          transmission: 0.9,
          thickness: params.topThickness,
        });
      case 'stone':
        return new THREE.MeshStandardMaterial({
          color: this.getStoneColor(rng, params.style),
          roughness: 0.4,
          metalness: 0.1,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: params.style === 'industrial' ? 0x444444 : 0x888888,
          roughness: 0.3,
          metalness: 0.9,
        });
      default:
        return new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    }
  }

  private createBase(params: DiningTableParams, rng: SeededRandom): THREE.Group {
    const base = new THREE.Group();
    
    switch (params.baseType) {
      case 'four_legs':
        this.addFourLegs(base, params, rng);
        break;
      case 'pedestal':
        this.addPedestalBase(base, params, rng);
        break;
      case 'trestle':
        this.addTrestleBase(base, params, rng);
        break;
      case 'sled':
        this.addSledBase(base, params, rng);
        break;
    }
    
    return base;
  }

  private addFourLegs(base: THREE.Group, params: DiningTableParams, rng: SeededRandom): void {
    const legHeight = params.height - params.topThickness - (params.apron ? params.apronHeight : 0);
    const legPositions = [
      { x: params.width / 2 - 0.1, z: params.depth / 2 - 0.1 },
      { x: -(params.width / 2 - 0.1), z: params.depth / 2 - 0.1 },
      { x: params.width / 2 - 0.1, z: -(params.depth / 2 - 0.1) },
      { x: -(params.width / 2 - 0.1), z: -(params.depth / 2 - 0.1) },
    ];
    
    legPositions.forEach(pos => {
      const leg = this.createLegGeometry(params, legHeight, rng);
      leg.position.set(pos.x, legHeight / 2 + (params.apron ? params.apronHeight : 0), pos.z);
      
      // Slight outward angle
      if (params.legStyle === 'tapered' || params.legStyle === 'cabriole') {
        const angle = 0.03;
        if (pos.x > 0) leg.rotation.z = -angle;
        else leg.rotation.z = angle;
        if (pos.z > 0) leg.rotation.x = -angle;
        else leg.rotation.x = angle;
      }
      
      leg.castShadow = true;
      base.add(leg);
    });
  }

  private addPedestalBase(base: THREE.Group, params: DiningTableParams, rng: SeededRandom): void {
    const pedestalHeight = params.height - params.topThickness;
    const material = this.getLegMaterial(params, rng);
    
    // Central column
    const columnRadius = Math.min(params.width, params.depth) / 6;
    const columnGeometry = new THREE.CylinderGeometry(columnRadius * 0.9, columnRadius, pedestalHeight * 0.7, 16);
    const column = new THREE.Mesh(columnGeometry, material);
    column.position.y = pedestalHeight * 0.35;
    column.castShadow = true;
    base.add(column);
    
    // Base foot
    const footGeometry = new THREE.CylinderGeometry(columnRadius * 2, columnRadius * 2.5, 0.05, 16);
    const foot = new THREE.Mesh(footGeometry, material);
    foot.position.y = 0.025;
    foot.castShadow = true;
    base.add(foot);
    
    // Top support
    const supportGeometry = new THREE.CylinderGeometry(columnRadius * 1.5, columnRadius, 0.1, 16);
    const support = new THREE.Mesh(supportGeometry, material);
    support.position.y = pedestalHeight - 0.05;
    support.castShadow = true;
    base.add(support);
  }

  private addTrestleBase(base: THREE.Group, params: DiningTableParams, rng: SeededRandom): void {
    const trestleHeight = params.height - params.topThickness;
    const material = this.getLegMaterial(params, rng);
    
    // Two end panels
    const panelWidth = 0.15;
    const panelDepth = params.depth * 0.6;
    const panelGeometry = new THREE.BoxGeometry(panelWidth, trestleHeight, panelDepth);
    
    const leftPanel = new THREE.Mesh(panelGeometry, material);
    leftPanel.position.set(-(params.width / 2 - 0.3), trestleHeight / 2, 0);
    leftPanel.castShadow = true;
    base.add(leftPanel);
    
    const rightPanel = new THREE.Mesh(panelGeometry.clone(), material);
    rightPanel.position.set(params.width / 2 - 0.3, trestleHeight / 2, 0);
    rightPanel.castShadow = true;
    base.add(rightPanel);
    
    // Connecting beam
    const beamGeometry = new THREE.BoxGeometry(params.width - 0.6, 0.1, 0.1);
    const beam = new THREE.Mesh(beamGeometry, material);
    beam.position.set(0, trestleHeight * 0.3, 0);
    beam.castShadow = true;
    base.add(beam);
  }

  private addSledBase(base: THREE.Group, params: DiningTableParams, rng: SeededRandom): void {
    const sledHeight = params.height - params.topThickness;
    const material = this.getLegMaterial(params, rng);
    
    // Two curved runners
    const runnerLength = params.depth * 0.8;
    const runnerShape = new THREE.Shape();
    runnerShape.moveTo(-runnerLength / 2, 0);
    runnerShape.quadraticCurveTo(0, -0.05, runnerLength / 2, 0);
    runnerShape.lineTo(runnerLength / 2, 0.05);
    runnerShape.quadraticCurveTo(0, 0, -runnerLength / 2, 0.05);
    runnerShape.closePath();
    
    const extrudeSettings = { depth: 0.08, bevelEnabled: false };
    const runnerGeometry = extrudeShape(runnerShape, extrudeSettings);
    runnerGeometry.rotateX(Math.PI / 2);
    runnerGeometry.rotateY(Math.PI / 2);
    
    const leftRunner = new THREE.Mesh(runnerGeometry, material);
    leftRunner.position.set(-(params.width / 2 - 0.2), sledHeight / 2, 0);
    leftRunner.castShadow = true;
    base.add(leftRunner);
    
    const rightRunner = new THREE.Mesh(runnerGeometry.clone(), material);
    rightRunner.position.set(params.width / 2 - 0.2, sledHeight / 2, 0);
    rightRunner.castShadow = true;
    base.add(rightRunner);
    
    // Vertical supports
    const supportGeometry = new THREE.CylinderGeometry(0.03, 0.03, sledHeight, 8);
    const supportPositions = [
      { x: -(params.width / 2 - 0.2), z: -runnerLength / 3 },
      { x: -(params.width / 2 - 0.2), z: runnerLength / 3 },
      { x: params.width / 2 - 0.2, z: -runnerLength / 3 },
      { x: params.width / 2 - 0.2, z: runnerLength / 3 },
    ];
    
    supportPositions.forEach(pos => {
      const support = new THREE.Mesh(supportGeometry, material);
      support.position.set(pos.x, sledHeight / 2, pos.z);
      support.castShadow = true;
      base.add(support);
    });
  }

  private createLegGeometry(params: DiningTableParams, height: number, rng: SeededRandom): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    const topRadius = 0.05;
    const bottomRadius = 0.06;
    
    switch (params.legStyle) {
      case 'straight':
        geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8);
        break;
      case 'tapered':
        geometry = new THREE.CylinderGeometry(topRadius * 0.6, bottomRadius * 1.2, height, 8);
        break;
      case 'cabriole':
        geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16);
        // Add S-curve
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const y = positions[i + 1];
          const t = (y + height / 2) / height;
          const bulge = Math.sin(t * Math.PI) * 0.02;
          positions[i] += bulge;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        break;
      case 'hairpin':
        const rodRadius = 0.01;
        const rodGeometry = new THREE.CylinderGeometry(rodRadius, rodRadius, height, 8);
        return new THREE.Mesh(rodGeometry, this.getLegMaterial(params, rng));
      default:
        geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8);
    }
    
    return new THREE.Mesh(geometry, this.getLegMaterial(params, rng));
  }

  private createApron(params: DiningTableParams, rng: SeededRandom): THREE.Group {
    const apronGroup = new THREE.Group();
    const material = this.getLegMaterial(params, rng);
    const apronY = params.height - params.topThickness - params.apronHeight / 2;
    
    // Four apron boards
    const frontBackLength = params.width - 0.2;
    const sideLength = params.depth - 0.2;
    
    const frontApron = new THREE.Mesh(
      new THREE.BoxGeometry(frontBackLength, params.apronHeight, 0.03),
      material
    );
    frontApron.position.set(0, apronY, params.depth / 2 - 0.05);
    apronGroup.add(frontApron);
    
    const backApron = new THREE.Mesh(
      new THREE.BoxGeometry(frontBackLength, params.apronHeight, 0.03),
      material
    );
    backApron.position.set(0, apronY, -(params.depth / 2 - 0.05));
    apronGroup.add(backApron);
    
    const leftApron = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, params.apronHeight, sideLength - 0.06),
      material
    );
    leftApron.position.set(-(params.width / 2 - 0.05), apronY, 0);
    apronGroup.add(leftApron);
    
    const rightApron = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, params.apronHeight, sideLength - 0.06),
      material
    );
    rightApron.position.set(params.width / 2 - 0.05, apronY, 0);
    apronGroup.add(rightApron);
    
    return apronGroup;
  }

  private createExtensionMechanism(params: DiningTableParams, rng: SeededRandom): THREE.Group {
    const mechanism = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.9,
      roughness: 0.3,
    });
    
    // Sliding rails
    const railLength = params.depth * 0.8;
    const railGeometry = new THREE.BoxGeometry(0.05, 0.03, railLength);
    
    const leftRail = new THREE.Mesh(railGeometry, material);
    leftRail.position.set(-(params.width / 2 - 0.15), params.height - params.topThickness - 0.05, 0);
    mechanism.add(leftRail);
    
    const rightRail = new THREE.Mesh(railGeometry.clone(), material);
    rightRail.position.set(params.width / 2 - 0.15, params.height - params.topThickness - 0.05, 0);
    mechanism.add(rightRail);
    
    return mechanism;
  }

  private getLegMaterial(params: DiningTableParams, rng: SeededRandom): THREE.Material {
    if (params.topMaterial === 'glass' || params.topMaterial === 'metal') {
      return new THREE.MeshStandardMaterial({
        color: params.style === 'industrial' ? 0x333333 : 0x888888,
        roughness: 0.3,
        metalness: 0.9,
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: this.getWoodColor(rng, params.style),
        roughness: 0.5,
        metalness: 0.0,
      });
    }
  }

  private getWoodColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const colors: Record<ObjectStylePreset, number[]> = {
      modern: [0x654321, 0x8B4513, 0xA0522D],
      traditional: [0x654321, 0x8B4513, 0x5C4033],
      industrial: [0x4A3728, 0x654321, 0x3E2723],
      scandinavian: [0xD2B48C, 0xC19A6B, 0xDEB887],
      rustic: [0x8B4513, 0xA0522D, 0xCD853F],
    };
    const palette = colors[style] || colors.modern;
    return palette[Math.floor(rng.next() * palette.length)];
  }

  private getStoneColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const colors = [0xF5F5F5, 0xE8E8E8, 0xD3D3D3, 0xC0C0C0, 0x808080];
    return colors[Math.floor(rng.next() * colors.length)];
  }

  getVariationCount(): number {
    return 4 * 4 * 4 * 4 * 2 * 2; // shapes * bases * leg styles * materials * extendable * apron
  }

  register(): void {
    ObjectRegistry.register(DiningTable.GENERATOR_ID, this);
  }
}

if (typeof window !== 'undefined') {
  new DiningTable().register();
}

export default DiningTable;
