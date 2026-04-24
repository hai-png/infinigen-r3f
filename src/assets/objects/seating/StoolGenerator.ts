/**
 * StoolGenerator - Procedural stool and bench generation
 * 
 * Generates various stool types including bar stools, dining stools, 
 * benches, and ottomans with parametric controls.
 */

import * as THREE from 'three';
import { BaseObjectGenerator, ObjectStylePreset } from './BaseObjectGenerator';
import { ObjectRegistry } from './ObjectRegistry';
import { SeededRandom } from '../../../core/util/math/distributions';
import { extrudeShape } from '../../assets/utils/curves';
import { mirrorMesh, mergeMeshes } from '../../assets/utils/mesh';

export interface StoolParams {
  // Dimensions
  width: number;
  depth: number;
  height: number;
  seatHeight: number;
  
  // Style
  style: ObjectStylePreset;
  
  // Seat
  seatShape: 'round' | 'square' | 'rectangular' | 'saddle';
  seatThickness: number;
  upholstered: boolean;
  
  // Legs
  legType: 'four' | 'three' | 'single' | 'sled';
  legStyle: 'straight' | 'tapered' | 'curved' | 'hairpin';
  legMaterial: 'wood' | 'metal' | 'plastic';
  
  // Features
  backrest: boolean;
  backrestHeight: number;
  footrest: boolean;
  swivel: boolean;
  
  // Variation seed
  variationSeed?: number;
}

export class StoolGenerator extends BaseObjectGenerator<StoolParams> {
  static readonly GENERATOR_ID = 'stool_generator';
  
  constructor() {
    super();
  }

  getDefaultParams(): StoolParams {
    return {
      width: 0.45,
      depth: 0.45,
      height: 0.45,
      seatHeight: 0.45,
      style: 'modern',
      seatShape: 'round',
      seatThickness: 0.05,
      upholstered: false,
      legType: 'four',
      legStyle: 'straight',
      legMaterial: 'wood',
      backrest: false,
      backrestHeight: 0.3,
      footrest: false,
      swivel: false,
      variationSeed: undefined,
    };
  }

  generate(params: Partial<StoolParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const rng = new SeededRandom(finalParams.variationSeed || this.seed);
    
    const group = new THREE.Group();
    group.name = 'Stool';
    
    // Generate seat
    const seat = this.createSeat(finalParams, rng);
    group.add(seat);
    
    // Generate legs
    const legs = this.createLegs(finalParams, rng);
    group.add(legs);
    
    // Add backrest if requested
    if (finalParams.backrest) {
      const backrest = this.createBackrest(finalParams, rng);
      group.add(backrest);
    }
    
    // Add footrest if requested
    if (finalParams.footrest) {
      const footrest = this.createFootrest(finalParams, rng);
      group.add(footrest);
    }
    
    // Add swivel mechanism if requested
    if (finalParams.swivel && finalParams.legType === 'single') {
      const swivel = this.createSwivelMechanism(finalParams, rng);
      group.add(swivel);
    }
    
    // Generate collision mesh
    const collisionMesh = this.generateCollisionMesh(group);
    group.userData.collisionMesh = collisionMesh;
    
    // Store parameters for reference
    group.userData.params = finalParams;
    group.userData.generatorId = StoolGenerator.GENERATOR_ID;
    
    return group;
  }

  private createSeat(params: StoolParams, rng: SeededRandom): THREE.Mesh {
    const geometry = this.getSeatGeometry(params, rng);
    const material = this.getSeatMaterial(params, rng);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = params.seatHeight;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private getSeatGeometry(params: StoolParams, rng: SeededRandom): THREE.BufferGeometry {
    switch (params.seatShape) {
      case 'round':
        return this.createRoundSeat(params, rng);
      case 'square':
        return this.createSquareSeat(params, rng);
      case 'rectangular':
        return this.createRectangularSeat(params, rng);
      case 'saddle':
        return this.createSaddleSeat(params, rng);
      default:
        return this.createRoundSeat(params, rng);
    }
  }

  private createRoundSeat(params: StoolParams, rng: SeededRandom): THREE.BufferGeometry {
    const radius = Math.min(params.width, params.depth) / 2;
    const segments = 32;
    
    if (params.upholstered) {
      // Soft cushion shape
      const shape = new THREE.Shape();
      shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      
      const extrudeSettings = {
        depth: params.seatThickness,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 8,
        steps: 1,
      };
      
      const geometry = extrudeShape(shape, extrudeSettings);
      
      // Add cushion puff
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        // Bulge center slightly
        const dist = Math.sqrt(x * x + y * y) / radius;
        if (dist < 0.8 && z > 0) {
          positions[i + 2] = z + (1 - dist) * 0.03;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      
      return geometry;
    } else {
      // Simple cylinder
      return new THREE.CylinderGeometry(radius, radius * 0.95, params.seatThickness, segments);
    }
  }

  private createSquareSeat(params: StoolParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.width;
    const depth = params.depth;
    
    if (params.upholstered) {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -depth / 2);
      shape.lineTo(width / 2, -depth / 2);
      shape.lineTo(width / 2, depth / 2);
      shape.lineTo(-width / 2, depth / 2);
      shape.closePath();
      
      const extrudeSettings = {
        depth: params.seatThickness,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 4,
      };
      
      return extrudeShape(shape, extrudeSettings);
    } else {
      return new THREE.BoxGeometry(width, params.seatThickness, depth);
    }
  }

  private createRectangularSeat(params: StoolParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.width * 1.5;
    const depth = params.depth;
    return this.createSquareSeat({ ...params, width, depth }, rng);
  }

  private createSaddleSeat(params: StoolParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.width;
    const depth = params.depth;
    
    // Create saddle curve
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -depth / 2);
    shape.quadraticCurveTo(0, -depth / 2 + 0.03, width / 2, -depth / 2);
    shape.lineTo(width / 2, depth / 2);
    shape.quadraticCurveTo(0, depth / 2 + 0.03, -width / 2, depth / 2);
    shape.closePath();
    
    const extrudeSettings = {
      depth: params.seatThickness,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 3,
    };
    
    const geometry = extrudeShape(shape, extrudeSettings);
    
    // Add saddle dip in the middle
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Create concave curve along length
      const t = (x + width / 2) / width;
      const dip = Math.sin(t * Math.PI) * 0.02;
      positions[i + 2] = z - dip;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private createLegs(params: StoolParams, rng: SeededRandom): THREE.Group {
    const legs = new THREE.Group();
    
    switch (params.legType) {
      case 'four':
        this.addFourLegs(legs, params, rng);
        break;
      case 'three':
        this.addThreeLegs(legs, params, rng);
        break;
      case 'single':
        this.addSingleLeg(legs, params, rng);
        break;
      case 'sled':
        this.addSledBase(legs, params, rng);
        break;
    }
    
    return legs;
  }

  private addFourLegs(legs: THREE.Group, params: StoolParams, rng: SeededRandom): void {
    const legHeight = params.seatHeight - params.seatThickness;
    const legPositions = [
      { x: params.width / 2 - 0.05, z: params.depth / 2 - 0.05 },
      { x: -(params.width / 2 - 0.05), z: params.depth / 2 - 0.05 },
      { x: params.width / 2 - 0.05, z: -(params.depth / 2 - 0.05) },
      { x: -(params.width / 2 - 0.05), z: -(params.depth / 2 - 0.05) },
    ];
    
    legPositions.forEach((pos, idx) => {
      const leg = this.createSingleLegGeometry(params, legHeight, rng);
      leg.position.set(pos.x, legHeight / 2, pos.z);
      
      // Slight outward angle for stability
      if (params.legStyle === 'tapered' || params.legStyle === 'curved') {
        const angle = 0.05;
        if (pos.x > 0) leg.rotation.z = -angle;
        else leg.rotation.z = angle;
        if (pos.z > 0) leg.rotation.x = -angle;
        else leg.rotation.x = angle;
      }
      
      leg.castShadow = true;
      legs.add(leg);
    });
  }

  private addThreeLegs(legs: THREE.Group, params: StoolParams, rng: SeededRandom): void {
    const legHeight = params.seatHeight - params.seatThickness;
    const radius = Math.min(params.width, params.depth) / 2 - 0.05;
    
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const leg = this.createSingleLegGeometry(params, legHeight, rng);
      leg.position.set(x, legHeight / 2, z);
      leg.castShadow = true;
      legs.add(leg);
    }
  }

  private addSingleLeg(legs: THREE.Group, params: StoolParams, rng: SeededRandom): void {
    const legHeight = params.seatHeight - params.seatThickness;
    const leg = this.createSingleLegGeometry(params, legHeight, rng, true);
    leg.position.y = legHeight / 2;
    leg.castShadow = true;
    legs.add(leg);
  }

  private addSledBase(legs: THREE.Group, params: StoolParams, rng: SeededRandom): void {
    const legHeight = params.seatHeight - params.seatThickness;
    const baseLength = params.depth * 0.8;
    
    // Create two curved runners
    const runnerShape = new THREE.Shape();
    const runnerWidth = 0.04;
    const runnerHeight = 0.03;
    
    runnerShape.moveTo(-baseLength / 2, 0);
    runnerShape.quadraticCurveTo(0, -0.1, baseLength / 2, 0);
    runnerShape.lineTo(baseLength / 2, runnerHeight);
    runnerShape.quadraticCurveTo(0, runnerHeight - 0.05, -baseLength / 2, runnerHeight);
    runnerShape.closePath();
    
    const extrudeSettings = {
      depth: runnerWidth,
      bevelEnabled: false,
    };
    
    const runnerGeometry = extrudeShape(runnerShape, extrudeSettings);
    runnerGeometry.rotateX(Math.PI / 2);
    runnerGeometry.rotateY(Math.PI / 2);
    
    const material = this.getLegMaterial(params, rng);
    
    // Left runner
    const leftRunner = new THREE.Mesh(runnerGeometry, material);
    leftRunner.position.set(-(params.width / 2 - 0.1), legHeight / 2, 0);
    leftRunner.castShadow = true;
    legs.add(leftRunner);
    
    // Right runner
    const rightRunner = new THREE.Mesh(runnerGeometry.clone(), material);
    rightRunner.position.set(params.width / 2 - 0.1, legHeight / 2, 0);
    rightRunner.castShadow = true;
    legs.add(rightRunner);
    
    // Add vertical supports
    const supportGeometry = new THREE.CylinderGeometry(0.02, 0.02, legHeight, 8);
    const supportPositions = [
      { x: -(params.width / 2 - 0.1), z: -baseLength / 3 },
      { x: -(params.width / 2 - 0.1), z: baseLength / 3 },
      { x: params.width / 2 - 0.1, z: -baseLength / 3 },
      { x: params.width / 2 - 0.1, z: baseLength / 3 },
    ];
    
    supportPositions.forEach(pos => {
      const support = new THREE.Mesh(supportGeometry, material);
      support.position.set(pos.x, legHeight / 2, pos.z);
      support.castShadow = true;
      legs.add(support);
    });
  }

  private createSingleLegGeometry(
    params: StoolParams,
    height: number,
    rng: SeededRandom,
    isCenter = false
  ): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    const topRadius = isCenter ? 0.06 : 0.035;
    const bottomRadius = isCenter ? 0.08 : 0.03;
    
    switch (params.legStyle) {
      case 'straight':
        if (params.legMaterial === 'metal' && !isCenter) {
          // Hairpin-style or square metal leg
          geometry = new THREE.BoxGeometry(0.03, height, 0.03);
        } else {
          geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8);
        }
        break;
        
      case 'tapered':
        geometry = new THREE.CylinderGeometry(topRadius * 0.7, bottomRadius * 1.3, height, 8);
        break;
        
      case 'curved':
        geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16);
        // Add slight curve by modifying vertices
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const y = positions[i + 1];
          const t = (y + height / 2) / height;
          const bulge = Math.sin(t * Math.PI) * 0.01;
          positions[i] += bulge;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        break;
        
      case 'hairpin':
        // V-shaped hairpin leg
        const rodRadius = 0.008;
        const rodLength = height * 0.95;
        const spread = 0.15;
        
        const rodGeometry = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 8);
        rodGeometry.rotateZ(Math.PI / 2);
        
        const material = this.getLegMaterial(params, rng);
        const group = new THREE.Group();
        
        // Two angled rods
        const leftRod = new THREE.Mesh(rodGeometry.clone(), material);
        leftRod.position.set(-spread / 2, height / 2, 0);
        leftRod.rotation.z = Math.PI / 2 - 0.3;
        group.add(leftRod);
        
        const rightRod = new THREE.Mesh(rodGeometry.clone(), material);
        rightRod.position.set(spread / 2, height / 2, 0);
        rightRod.rotation.z = Math.PI / 2 + 0.3;
        group.add(rightRod);
        
        // Top connector
        const connectorGeometry = new THREE.CylinderGeometry(rodRadius, rodRadius, spread, 8);
        connectorGeometry.rotateZ(Math.PI / 2);
        const connector = new THREE.Mesh(connectorGeometry, material);
        connector.position.set(0, height - 0.02, 0);
        group.add(connector);
        
        return group as any;
        
      default:
        geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8);
    }
    
    const material = this.getLegMaterial(params, rng);
    return new THREE.Mesh(geometry, material);
  }

  private createBackrest(params: StoolParams, rng: SeededRandom): THREE.Mesh {
    const backrestHeight = params.backrestHeight;
    const backrestWidth = params.width * 0.6;
    const thickness = 0.02;
    
    let geometry: THREE.BufferGeometry;
    
    // Simple curved backrest
    const shape = new THREE.Shape();
    shape.moveTo(-backrestWidth / 2, 0);
    shape.quadraticCurveTo(0, backrestHeight * 0.3, backrestWidth / 2, 0);
    shape.lineTo(backrestWidth / 2, backrestHeight);
    shape.quadraticCurveTo(0, backrestHeight * 0.7, -backrestWidth / 2, backrestHeight);
    shape.closePath();
    
    const extrudeSettings = {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
    };
    
    geometry = extrudeShape(shape, extrudeSettings);
    
    const material = this.getSeatMaterial(params, rng);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, params.seatHeight + backrestHeight / 2, -params.depth / 2 + 0.02);
    mesh.rotation.x = -0.1; // Slight backward tilt
    mesh.castShadow = true;
    
    return mesh;
  }

  private createFootrest(params: StoolParams, rng: SeededRandom): THREE.Group {
    const footrestGroup = new THREE.Group();
    const footrestHeight = params.seatHeight * 0.6;
    const material = this.getLegMaterial(params, rng);
    
    if (params.legType === 'four') {
      // Ring footrest connecting all legs
      const ringRadius = Math.min(params.width, params.depth) / 2 - 0.08;
      const tubeRadius = 0.01;
      const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 8, 32);
      const ring = new THREE.Mesh(geometry, material);
      ring.position.y = footrestHeight;
      ring.rotation.x = Math.PI / 2;
      footrestGroup.add(ring);
      
      // Add vertical connectors to legs
      const connectorPositions = [
        { x: params.width / 2 - 0.05, z: params.depth / 2 - 0.05 },
        { x: -(params.width / 2 - 0.05), z: params.depth / 2 - 0.05 },
        { x: params.width / 2 - 0.05, z: -(params.depth / 2 - 0.05) },
        { x: -(params.width / 2 - 0.05), z: -(params.depth / 2 - 0.05) },
      ];
      
      connectorPositions.forEach(pos => {
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        const angle = Math.atan2(pos.z, pos.x);
        const connectorGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8);
        connectorGeometry.rotateX(Math.PI / 2);
        const connector = new THREE.Mesh(connectorGeometry, material);
        connector.position.set(
          Math.cos(angle) * ringRadius,
          footrestHeight,
          Math.sin(angle) * ringRadius
        );
        footrestGroup.add(connector);
      });
    } else if (params.legType === 'single') {
      // Circular footrest for single-leg stool
      const ringRadius = 0.15;
      const tubeRadius = 0.012;
      const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 8, 32);
      const ring = new THREE.Mesh(geometry, material);
      ring.position.y = footrestHeight;
      ring.rotation.x = Math.PI / 2;
      footrestGroup.add(ring);
      
      // Central connector
      const connectorGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8);
      const connector = new THREE.Mesh(connectorGeometry, material);
      connector.position.y = footrestHeight;
      footrestGroup.add(connector);
    }
    
    return footrestGroup;
  }

  private createSwivelMechanism(params: StoolParams, rng: SeededRandom): THREE.Group {
    const swivelGroup = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.9,
      roughness: 0.3,
    });
    
    // Base plate
    const plateGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16);
    const plate = new THREE.Mesh(plateGeometry, material);
    plate.position.y = params.seatHeight - params.seatThickness - 0.015;
    swivelGroup.add(plate);
    
    // Swivel joint
    const jointGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
    const joint = new THREE.Mesh(jointGeometry, material);
    joint.position.y = params.seatHeight - params.seatThickness - 0.03;
    swivelGroup.add(joint);
    
    return swivelGroup;
  }

  private getSeatMaterial(params: StoolParams, rng: SeededRandom): THREE.Material {
    if (params.upholstered) {
      // Fabric material
      return new THREE.MeshStandardMaterial({
        color: this.getRandomColor(rng, params.style),
        roughness: 0.9,
        metalness: 0.0,
      });
    } else {
      // Wood or plastic seat
      return new THREE.MeshStandardMaterial({
        color: params.legMaterial === 'wood' ? 0x8B4513 : 0x333333,
        roughness: params.legMaterial === 'wood' ? 0.6 : 0.4,
        metalness: 0.0,
      });
    }
  }

  private getLegMaterial(params: StoolParams, rng: SeededRandom): THREE.Material {
    switch (params.legMaterial) {
      case 'wood':
        return new THREE.MeshStandardMaterial({
          color: this.getWoodColor(rng, params.style),
          roughness: 0.6,
          metalness: 0.0,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: params.style === 'industrial' ? 0x444444 : 0x888888,
          roughness: 0.3,
          metalness: 0.8,
        });
      case 'plastic':
        return new THREE.MeshStandardMaterial({
          color: this.getRandomColor(rng, params.style),
          roughness: 0.5,
          metalness: 0.1,
        });
      default:
        return new THREE.MeshStandardMaterial({ color: 0x8B4513 });
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

  private getRandomColor(rng: SeededRandom, style: ObjectStylePreset): number {
    const neutralColors = [0xF5F5F5, 0xE8E8E8, 0xD3D3D3, 0xC0C0C0, 0xA9A9A9];
    const accentColors = [0x8B0000, 0x006400, 0x00008B, 0x8B008B, 0xFF8C00];
    
    if (style === 'modern' || style === 'scandinavian') {
      return neutralColors[Math.floor(rng.next() * neutralColors.length)];
    } else {
      return rng.next() > 0.7 
        ? accentColors[Math.floor(rng.next() * accentColors.length)]
        : neutralColors[Math.floor(rng.next() * neutralColors.length)];
    }
  }

  getVariationCount(): number {
    // Calculate total possible variations
    const seatShapes = 4;
    const legTypes = 4;
    const legStyles = 4;
    const legMaterials = 3;
    const upholsteryOptions = 2;
    const backrestOptions = 2;
    const footrestOptions = 2;
    const swivelOptions = 2;
    
    return seatShapes * legTypes * legStyles * legMaterials * 
           upholsteryOptions * backrestOptions * footrestOptions * swivelOptions;
  }

  register(): void {
    ObjectRegistry.register(StoolGenerator.GENERATOR_ID, this);
  }
}

// Auto-register on import
if (typeof window !== 'undefined') {
  new StoolGenerator().register();
}

export default StoolGenerator;
