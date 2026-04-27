/**
 * Floor Lamp Generator
 * Generates various floor-standing lamp designs
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';

export interface FloorLampParams extends BaseGeneratorConfig {
  lampType: 'arc' | 'torchere' | 'tripod' | 'shelf' | 'tree' | 'standard';
  height: number;
  baseWidth: number;
  baseDepth: number;
  shadeHeight: number;
  shadeDiameter: number;
  style: 'modern' | 'traditional' | 'industrial' | 'scandinavian' | 'art-deco';
  material: 'metal' | 'wood' | 'brass' | 'chrome' | 'bamboo';
  color: string;
  shadeMaterial: 'fabric' | 'paper' | 'glass' | 'metal' | 'plastic';
  shadeColor: string;
  bulbType: 'edison' | 'standard' | 'globe';
  dimmable: boolean;
  adjustable: boolean;
  numShades: number;
}

export class FloorLamps extends BaseObjectGenerator<FloorLampParams> {
  constructor() {
    super();
    this.category = 'lighting';
    this.subcategory = 'floor';
  }

  getDefaultConfig(): FloorLampParams {
    return {
      lampType: 'standard',
      height: 1.5,
      baseWidth: 0.3,
      baseDepth: 0.3,
      shadeHeight: 0.3,
      shadeDiameter: 0.35,
      style: 'modern',
      material: 'metal',
      color: '#000000',
      shadeMaterial: 'fabric',
      shadeColor: '#FFFFFF',
      bulbType: 'standard',
      dimmable: false,
      adjustable: false,
      numShades: 1,
    };
  }

  generate(params: Partial<FloorLampParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const group = new THREE.Group();
    
    let lamp: THREE.Object3D;
    
    switch (finalParams.lampType) {
      case 'arc':
        lamp = this.createArcLamp(finalParams);
        break;
      case 'torchere':
        lamp = this.createTorchiere(finalParams);
        break;
      case 'tripod':
        lamp = this.createTripodLamp(finalParams);
        break;
      case 'shelf':
        lamp = this.createShelfLamp(finalParams);
        break;
      case 'tree':
        lamp = this.createTreeLamp(finalParams);
        break;
      case 'standard':
      default:
        lamp = this.createStandardLamp(finalParams);
    }
    
    // Generate collision mesh
    const collisionMesh: THREE.Object3D | undefined = undefined; // this.generateCollisionMesh(lamp);
    lamp.userData.collisionMesh = collisionMesh;
    
    // Add light sources
    this.addLightSources(lamp, finalParams);
    
    group.add(lamp);
    return group;
  }

  private createArcLamp(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    // Heavy base
    const baseGeometry = new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2 * 1.2, 0.05, 32);
    const baseMaterial = this.getMaterial(params.material === 'wood' ? 'metal' : params.material, params.color);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.025;
    base.userData.weight = 5.0; // Heavy base for stability
    group.add(base);
    
    // Arc pole
    const poleHeight = params.height * 0.8;
    const poleRadius = 0.02;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, poleHeight * 0.7, params.baseWidth * 0.8),
      new THREE.Vector3(0, poleHeight, params.baseWidth * 1.5)
    );
    
    const tubeGeometry = new THREE.TubeGeometry(curve, 32, poleRadius, 16, false);
    const pole = new THREE.Mesh(tubeGeometry, baseMaterial);
    group.add(pole);
    
    // Shade arm
    const armLength = params.baseWidth * 0.5;
    const armGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, armLength, 16);
    const arm = new THREE.Mesh(armGeometry, baseMaterial);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, poleHeight, params.baseWidth * 1.5 + armLength / 2);
    group.add(arm);
    
    // Shade
    const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    shade.position.set(0, poleHeight - params.shadeHeight * 0.3, params.baseWidth * 1.5 + armLength);
    group.add(shade);
    
    // Counterweight (optional decorative element)
    if (params.style === 'industrial') {
      const weightGeometry = new THREE.SphereGeometry(0.08, 16, 16);
      const weight = new THREE.Mesh(weightGeometry, baseMaterial);
      weight.position.y = 0.1;
      group.add(weight);
    }
    
    return group;
  }

  private createTorchiere(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    // Base
    const baseGeometry = new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2 * 1.1, 0.04, 32);
    const baseMaterial = this.getMaterial(params.material, params.color);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.02;
    group.add(base);
    
    // Pole
    const poleHeight = params.height - params.shadeHeight;
    const poleRadius = 0.025;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius * 0.9, poleHeight, 16);
    const pole = new THREE.Mesh(poleGeometry, baseMaterial);
    pole.position.y = poleHeight / 2 + 0.02;
    group.add(pole);
    
    // Uplight shade (bowl shape)
    const shadeGeometry = new THREE.SphereGeometry(params.shadeDiameter / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const shadeMaterial = this.getShadeMaterial(params);
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    shade.position.y = params.height - params.shadeHeight * 0.3;
    shade.rotation.y = Math.PI; // Flip to face up
    group.add(shade);
    
    // Decorative collar
    if (params.style === 'traditional' || params.style === 'art-deco') {
      const collarGeometry = new THREE.TorusGeometry(params.shadeDiameter / 2 + 0.02, 0.015, 16, 32);
      const collar = new THREE.Mesh(collarGeometry, baseMaterial);
      collar.position.y = params.height - params.shadeHeight * 0.5;
      group.add(collar);
    }
    
    return group;
  }

  private createTripodLamp(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    const legMaterial = this.getMaterial(params.material, params.color);
    const legLength = params.height * 0.7;
    const legSpread = params.baseWidth / 2;
    
    // Three legs
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const legGroup = new THREE.Group();
      
      // Leg pole
      const legGeometry = new THREE.CylinderGeometry(0.015, 0.02, legLength, 12);
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.rotation.x = Math.PI / 8; // Slight outward angle
      legGroup.add(leg);
      
      // Foot
      const footGeometry = new THREE.SphereGeometry(0.025, 12, 12);
      const foot = new THREE.Mesh(footGeometry, legMaterial);
      foot.position.y = -legLength / 2 + 0.025;
      legGroup.add(foot);
      
      legGroup.rotation.y = angle;
      legGroup.position.set(Math.cos(angle) * legSpread * 0.3, legLength / 2, Math.sin(angle) * legSpread * 0.3);
      group.add(legGroup);
    }
    
    // Central column
    const columnHeight = params.height * 0.3;
    const columnGeometry = new THREE.CylinderGeometry(0.02, 0.025, columnHeight, 16);
    const column = new THREE.Mesh(columnGeometry, legMaterial);
    column.position.y = params.height * 0.7 + columnHeight / 2;
    group.add(column);
    
    // Shade
    const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    shade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(shade);
    
    return group;
  }

  private createShelfLamp(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    // Main pole
    const poleMaterial = this.getMaterial(params.material, params.color);
    const poleGeometry = new THREE.CylinderGeometry(0.03, 0.035, params.height, 16);
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = params.height / 2;
    group.add(pole);
    
    // Shelves with integrated lights
    const numShelves = Math.max(1, params.numShades);
    const shelfSpacing = params.height / (numShelves + 1);
    
    for (let i = 0; i < numShelves; i++) {
      const shelfY = shelfSpacing * (i + 1);
      
      // Shelf
      const shelfGeometry = new THREE.BoxGeometry(params.baseWidth, 0.02, params.baseDepth);
      const shelfMaterial = params.material === 'metal' ? this.getMaterial('wood', '#8B4513') : poleMaterial;
      const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
      shelf.position.y = shelfY;
      group.add(shelf);
      
      // Light under shelf
      const shade = this.createShade(params.shadeDiameter * 0.7, params.shadeHeight * 0.6, params);
      shade.position.y = shelfY - params.shadeHeight * 0.3;
      group.add(shade);
    }
    
    // Top light
    const topShade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    topShade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(topShade);
    
    return group;
  }

  private createTreeLamp(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    // Trunk
    const trunkMaterial = this.getMaterial(params.material, params.color);
    const trunkGeometry = new THREE.CylinderGeometry(0.04, 0.05, params.height * 0.6, 16);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = params.height * 0.3;
    group.add(trunk);
    
    // Branches with lights
    const numBranches = Math.max(3, params.numShades);
    const branchAngles = Array.from({ length: numBranches }, (_, i) => (i / numBranches) * Math.PI * 2);
    const branchHeights = Array.from({ length: numBranches }, (_, i) => 
      params.height * 0.5 + (i / numBranches) * params.height * 0.4
    );
    
    branchAngles.forEach((angle, index) => {
      const branchGroup = new THREE.Group();
      
      // Branch arm
      const branchLength = params.baseWidth * 0.6;
      const branchGeometry = new THREE.CylinderGeometry(0.015, 0.02, branchLength, 12);
      const branch = new THREE.Mesh(branchGeometry, trunkMaterial);
      branch.rotation.x = Math.PI / 6; // Angle upward
      branchGroup.add(branch);
      
      // Shade at end
      const shade = this.createShade(params.shadeDiameter * 0.6, params.shadeHeight * 0.7, params);
      shade.position.set(0, branchLength * 0.5, branchLength * 0.8);
      shade.rotation.x = -Math.PI / 6;
      branchGroup.add(shade);
      
      branchGroup.position.y = branchHeights[index];
      branchGroup.rotation.y = angle;
      group.add(branchGroup);
    });
    
    return group;
  }

  private createStandardLamp(params: FloorLampParams): THREE.Object3D {
    const group = new THREE.Group();
    
    // Base
    const baseGeometry = params.style === 'traditional' 
      ? new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2 * 1.2, 0.05, 32)
      : new THREE.BoxGeometry(params.baseWidth, 0.04, params.baseDepth);
    
    const baseMaterial = this.getMaterial(params.material, params.color);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.025;
    group.add(base);
    
    // Pole
    const poleHeight = params.height - params.shadeHeight - 0.05;
    const poleRadius = params.style === 'industrial' ? 0.03 : 0.02;
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 16);
    const pole = new THREE.Mesh(poleGeometry, baseMaterial);
    pole.position.y = poleHeight / 2 + 0.05;
    group.add(pole);
    
    // Adjustable joint (if applicable)
    if (params.adjustable) {
      const jointGeometry = new THREE.SphereGeometry(poleRadius * 1.5, 16, 16);
      const joint = new THREE.Mesh(jointGeometry, baseMaterial);
      joint.position.y = params.height - params.shadeHeight * 0.5;
      group.add(joint);
    }
    
    // Shade
    const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    shade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(shade);
    
    return group;
  }

  private createShade(diameter: number, height: number, params: FloorLampParams): THREE.Object3D {
    const shadeGroup = new THREE.Group();
    
    // Shade geometry based on style
    let shadeGeometry: THREE.BufferGeometry;
    
    if (params.style === 'modern') {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 32, 1, true);
    } else if (params.style === 'traditional') {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2 * 0.8, diameter / 2, height, 32, 1, true);
    } else if (params.style === 'art-deco') {
      shadeGeometry = new THREE.ConeGeometry(diameter / 2, height, 32, 1, true);
    } else {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2 * 0.9, diameter / 2 * 1.1, height, 32, 1, true);
    }
    
    const shadeMaterial = this.getShadeMaterial(params);
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    shadeGroup.add(shade);
    
    // Shade rim (decorative)
    if (params.style === 'traditional' || params.style === 'art-deco') {
      const rimMaterial = this.getMaterial('brass', '#D4AF37');
      const topRimGeometry = new THREE.TorusGeometry(diameter / 2 * 0.8, 0.01, 16, 32);
      const bottomRimGeometry = new THREE.TorusGeometry(diameter / 2, 0.012, 16, 32);
      
      const topRim = new THREE.Mesh(topRimGeometry, rimMaterial);
      topRim.rotation.x = Math.PI / 2;
      topRim.position.y = height / 2;
      
      const bottomRim = new THREE.Mesh(bottomRimGeometry, rimMaterial);
      bottomRim.rotation.x = Math.PI / 2;
      bottomRim.position.y = -height / 2;
      
      shadeGroup.add(topRim, bottomRim);
    }
    
    return shadeGroup;
  }

  private getShadeMaterial(params: FloorLampParams): THREE.Material {
    if (params.shadeMaterial === 'fabric') {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    } else if (params.shadeMaterial === 'paper') {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
    } else if (params.shadeMaterial === 'glass') {
      return new THREE.MeshPhysicalMaterial({
        color: params.shadeColor,
        roughness: 0.2,
        metalness: 0.0,
        transmission: 0.7,
        transparent: true,
        opacity: 0.5,
      });
    } else if (params.shadeMaterial === 'metal') {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.3,
        metalness: 0.8,
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.5,
        metalness: 0.2,
      });
    }
  }

  private addLightSources(object: THREE.Object3D, params: FloorLampParams): void {
    const bulbColor = params.bulbType === 'edison' ? '#FFD7A0' : '#FFF5E1';
    const intensity = 400;
    
    // Find all shades and add lights
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry.type.includes('Cylinder') || 
          child.geometry.type.includes('Sphere') || child.geometry.type.includes('Cone')) {
        const light = new THREE.PointLight(bulbColor, intensity, 8);
        light.position.y = -0.1;
        child.add(light);
        
        // Add visible bulb for edison style
        if (params.bulbType === 'edison') {
          const bulbGeometry = new THREE.SphereGeometry(0.05, 16, 16);
          const bulbMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFD7A0,
            emissive: 0xFFD7A0,
            emissiveIntensity: 0.5,
          });
          const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
          bulb.position.y = -0.1;
          child.add(bulb);
        }
      }
    });
    
    if (params.dimmable) {
      object.userData.dimmable = true;
      object.userData.baseIntensity = intensity;
    }
  }

  getRandomParams(): Partial<FloorLampParams> {
    const lampTypes: FloorLampParams['lampType'][] = ['arc', 'torchere', 'tripod', 'shelf', 'tree', 'standard'];
    const styles: FloorLampParams['style'][] = ['modern', 'traditional', 'industrial', 'scandinavian', 'art-deco'];
    const materials: FloorLampParams['material'][] = ['metal', 'wood', 'brass', 'chrome', 'bamboo'];
    const shadeMaterials: FloorLampParams['shadeMaterial'][] = ['fabric', 'paper', 'glass', 'metal', 'plastic'];
    const bulbTypes: FloorLampParams['bulbType'][] = ['edison', 'standard', 'globe'];
    
    return {
      lampType: lampTypes[Math.floor(Math.random() * lampTypes.length)],
      height: 1.2 + Math.random() * 0.8,
      baseWidth: 0.25 + Math.random() * 0.2,
      shadeDiameter: 0.25 + Math.random() * 0.2,
      style: styles[Math.floor(Math.random() * styles.length)],
      material: materials[Math.floor(Math.random() * materials.length)],
      shadeMaterial: shadeMaterials[Math.floor(Math.random() * shadeMaterials.length)],
      bulbType: bulbTypes[Math.floor(Math.random() * bulbTypes.length)],
      numShades: Math.floor(Math.random() * 3) + 1,
      dimmable: Math.random() > 0.6,
      adjustable: Math.random() > 0.7,
    };
  }

  validateParams(params: FloorLampParams): boolean {
    return (
      params.height > 0.8 && params.height < 2.5 &&
      params.baseWidth > 0.15 && params.baseWidth < 0.6 &&
      params.shadeDiameter > 0.15 && params.shadeDiameter < 0.6 &&
      params.numShades >= 1 && params.numShades <= 5
    );
  }
}

// Register the generator
ObjectRegistry.register('floor_lamps', FloorLamps, {
  category: 'lighting',
  subcategory: 'floor',
  description: 'Floor-standing lamps including arc, torchiere, tripod, and multi-shade designs',
});
