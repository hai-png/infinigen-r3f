import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Blind Generator
 * 
 * Procedural generation of window blinds including
 * vertical blinds, horizontal blinds, roller shades,
 * roman shades, and shutters.
 * 
 * @module BlindGenerator
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';

export type BlindType = 'horizontal' | 'vertical' | 'roller' | 'roman' | 'venetian' | 'shutter' | 'pleated';
export type BlindMaterial = 'aluminum' | 'wood' | 'fabric' | 'vinyl' | 'bamboo';
export type ControlType = 'manual' | 'motorized' | 'smart';

export interface BlindParams extends BaseGeneratorConfig {
  type: BlindType;
  material: BlindMaterial;
  width: number;
  height: number;
  slatWidth?: number;
  slatThickness?: number;
  color: THREE.Color;
  tiltAngle: number;
  openRatio: number;
  controlType: ControlType;
  cordColor: THREE.Color;
  mountingType: 'inside' | 'outside' | 'ceiling';
}

export interface BlindResult {
  mesh: THREE.Group;
  mount: THREE.Mesh;
  controls: THREE.Group;
  params: BlindParams;
}

export class BlindGenerator {
  private noise: NoiseFunction3D;

  constructor() {
    this.noise = createNoise3D();
  }

  /**
   * Generate window blinds
   */
  generate(params: Partial<BlindParams> = {}): BlindResult {
    const finalParams: BlindParams = {
      type: params.type || 'horizontal',
      material: params.material || 'aluminum',
      width: params.width || 1.5,
      height: params.height || 2.0,
      slatWidth: params.slatWidth,
      slatThickness: params.slatThickness,
      color: params.color || new THREE.Color(0xffffff),
      tiltAngle: params.tiltAngle ?? 0,
      openRatio: params.openRatio ?? 0,
      controlType: params.controlType || 'manual',
      cordColor: params.cordColor || new THREE.Color(0x333333),
      mountingType: params.mountingType || 'inside'
    };

    // Set default slat dimensions based on type
    if (finalParams.slatWidth === undefined) {
      finalParams.slatWidth = this.getDefaultSlatWidth(finalParams.type);
    }
    if (finalParams.slatThickness === undefined) {
      finalParams.slatThickness = this.getDefaultSlatThickness(finalParams.type, finalParams.material);
    }

    const group = new THREE.Group();
    
    // Create mounting bracket
    const mount = this.createMount(finalParams);
    group.add(mount);

    // Create blind system based on type
    let controls: THREE.Group;
    
    switch (finalParams.type) {
      case 'horizontal':
      case 'venetian':
        controls = this.createHorizontalBlinds(finalParams);
        break;
      case 'vertical':
        controls = this.createVerticalBlinds(finalParams);
        break;
      case 'roller':
        controls = this.createRollerShade(finalParams);
        break;
      case 'roman':
        controls = this.createRomanShade(finalParams);
        break;
      case 'shutter':
        controls = this.createShutters(finalParams);
        break;
      case 'pleated':
        controls = this.createPleatedShade(finalParams);
        break;
      default:
        controls = this.createHorizontalBlinds(finalParams);
    }

    group.add(controls);

    // Add control mechanism
    const controlSystem = this.createControlSystem(finalParams);
    group.add(controlSystem);

    return {
      mesh: group,
      mount,
      controls: controlSystem,
      params: finalParams
    };
  }

  /**
   * Get default slat width for blind type
   */
  private getDefaultSlatWidth(type: BlindType): number {
    switch (type) {
      case 'horizontal':
        return 0.05; // 5cm standard
      case 'venetian':
        return 0.07; // 7cm wide slats
      case 'vertical':
        return 0.12; // 12cm vanes
      case 'shutter':
        return 0.15; // 15cm louvers
      default:
        return 0.05;
    }
  }

  /**
   * Get default slat thickness
   */
  private getDefaultSlatThickness(type: BlindType, material: BlindMaterial): number {
    const baseThickness = 0.002; // 2mm base
    
    switch (material) {
      case 'wood':
        return baseThickness * 3;
      case 'bamboo':
        return baseThickness * 2.5;
      case 'aluminum':
        return baseThickness;
      case 'vinyl':
        return baseThickness * 1.5;
      case 'fabric':
        return baseThickness * 0.8;
      default:
        return baseThickness;
    }
  }

  /**
   * Create mounting bracket
   */
  private createMount(params: BlindParams): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(
      params.width + 0.04,
      0.05,
      0.08
    );

    const material = this.getMaterial(params.material, params.color);
    const mount = new THREE.Mesh(geometry, material);
    mount.position.y = params.height + 0.025;
    mount.castShadow = true;

    return mount;
  }

  /**
   * Create horizontal blinds (standard or venetian)
   */
  private createHorizontalBlinds(params: BlindParams): THREE.Group {
    const group = new THREE.Group();
    const slatCount = Math.floor(params.height / (params.slatWidth! + params.slatThickness!));
    const effectiveSlatWidth = params.slatWidth! + params.slatThickness!;

    // Create individual slats
    for (let i = 0; i < slatCount; i++) {
      const slat = this.createSlat(params, params.width, params.slatWidth!, params.slatThickness!);
      const y = params.height - (i * effectiveSlatWidth) - (params.slatWidth! / 2);
      slat.position.set(0, y, 0);
      
      // Apply tilt
      slat.rotation.x = params.tiltAngle;
      
      // Apply opening offset
      if (params.openRatio > 0) {
        slat.position.z += params.openRatio * params.height * 0.5;
      }
      
      group.add(slat);
    }

    // Create ladder tapes/strings
    const ladderTapes = this.createLadderTapes(params, slatCount);
    group.add(ladderTapes);

    // Create bottom rail
    const bottomRail = this.createBottomRail(params);
    bottomRail.position.y = params.slatWidth! / 2;
    group.add(bottomRail);

    return group;
  }

  /**
   * Create vertical blinds
   */
  private createVerticalBlinds(params: BlindParams): THREE.Group {
    const group = new THREE.Group();
    const vaneCount = Math.floor(params.width / (params.slatWidth! + params.slatThickness!));
    const effectiveVaneWidth = params.slatWidth! + params.slatThickness!;

    for (let i = 0; i < vaneCount; i++) {
      const vane = this.createSlat(
        params,
        params.slatWidth!,
        params.height,
        params.slatThickness!
      );
      
      const x = (i * effectiveVaneWidth) - (params.width / 2) + (effectiveVaneWidth / 2);
      vane.position.set(x, params.height / 2, 0);
      
      // Apply rotation for vertical vanes
      vane.rotation.y = params.tiltAngle;
      
      // Apply opening offset (stack to side)
      if (params.openRatio > 0) {
        vane.position.x += params.openRatio * params.width * 0.5;
      }
      
      group.add(vane);
    }

    // Create headrail with carriers
    const headrail = this.createHeadrail(params);
    headrail.position.y = params.height;
    group.add(headrail);

    return group;
  }

  /**
   * Create roller shade
   */
  private createRollerShade(params: BlindParams): THREE.Group {
    const group = new THREE.Group();

    // Create roller tube
    const tubeGeometry = new THREE.CylinderGeometry(0.03, 0.03, params.width + 0.04, 16);
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.3,
      metalness: 0.8
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.rotation.z = Math.PI / 2;
    tube.position.y = params.height;
    group.add(tube);

    // Create fabric shade
    const fabricGeometry = new THREE.PlaneGeometry(params.width, params.height * (1 - params.openRatio));
    const fabricMaterial = this.getFabricMaterial(params.color, params.material);
    const fabric = new THREE.Mesh(fabricGeometry, fabricMaterial);
    fabric.position.set(0, params.height * (1 - params.openRatio) / 2, 0.01);
    group.add(fabric);

    // Create bottom bar
    const bottomBarGeometry = new THREE.BoxGeometry(params.width, 0.03, 0.03);
    const bottomBarMaterial = this.getMaterial(params.material, params.color);
    const bottomBar = new THREE.Mesh(bottomBarGeometry, bottomBarMaterial);
    bottomBar.position.y = fabric.position.y - fabric.geometry.parameters.height / 2 - 0.015;
    group.add(bottomBar);

    return group;
  }

  /**
   * Create roman shade
   */
  private createRomanShade(params: BlindParams): THREE.Group {
    const group = new THREE.Group();
    const foldCount = 5;
    const foldHeight = params.height / foldCount;

    // Create fabric panel with folds
    const fabricGeometry = new THREE.PlaneGeometry(params.width, params.height);
    const fabricMaterial = this.getFabricMaterial(params.color, params.material);
    const fabric = new THREE.Mesh(fabricGeometry, fabricMaterial);
    
    // Create fold effect by modifying vertices
    const positions = fabric.geometry.attributes.position.array;
    for (let i = 0; i < positions.length / 3; i++) {
      const y = positions[i * 3 + 1];
      const foldIndex = Math.floor((y + params.height / 2) / foldHeight);
      
      if (foldIndex % 2 === 0 && params.openRatio > 0) {
        positions[i * 3 + 2] = Math.sin(foldIndex * Math.PI) * params.openRatio * 0.1;
      }
    }
    fabric.geometry.attributes.position.needsUpdate = true;
    
    fabric.position.y = params.height / 2;
    group.add(fabric);

    // Create support rods
    for (let i = 0; i < foldCount - 1; i++) {
      const rodGeometry = new THREE.CylinderGeometry(0.005, 0.005, params.width, 8);
      const rodMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.5,
        metalness: 0.5
      });
      const rod = new THREE.Mesh(rodGeometry, rodMaterial);
      rod.rotation.z = Math.PI / 2;
      rod.position.y = (i + 1) * foldHeight;
      group.add(rod);
    }

    return group;
  }

  /**
   * Create plantation shutters
   */
  private createShutters(params: BlindParams): THREE.Group {
    const group = new THREE.Group();
    const panelCount = 2; // Typical double panel
    const panelWidth = params.width / panelCount;

    for (let p = 0; p < panelCount; p++) {
      const panel = new THREE.Group();
      
      // Create frame
      const frameGeometry = new THREE.BoxGeometry(panelWidth, params.height, 0.03);
      const frameMaterial = this.getMaterial(params.material, params.color);
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      panel.add(frame);

      // Create louvers
      const louverCount = Math.floor(params.height / 0.15);
      for (let i = 0; i < louverCount; i++) {
        const louver = this.createSlat(
          params,
          panelWidth - 0.04,
          params.slatWidth!,
          params.slatThickness!
        );
        louver.position.y = params.height / 2 - (i * 0.15) - 0.075;
        louver.rotation.x = params.tiltAngle;
        panel.add(louver);
      }

      // Position panel
      panel.position.x = (p - 0.5) * panelWidth + panelWidth / 2;
      
      // Apply opening (swing out)
      if (params.openRatio > 0) {
        panel.rotation.y = params.openRatio * Math.PI / 2 * (p === 0 ? -1 : 1);
      }
      
      group.add(panel);
    }

    return group;
  }

  /**
   * Create pleated shade
   */
  private createPleatedShade(params: BlindParams): THREE.Group {
    const group = new THREE.Group();
    const pleatCount = Math.floor(params.height / 0.05);
    const pleatDepth = 0.025;

    // Create pleated fabric
    const pleatGeometry = new THREE.BufferGeometry();
    const vertices: number[] = [];

    for (let i = 0; i <= pleatCount; i++) {
      const y = (i / pleatCount) * params.height - params.height / 2;
      const z = (i % 2 === 0 ? 1 : -1) * pleatDepth * (1 - params.openRatio);
      
      // Left vertex
      vertices.push(-params.width / 2, y, z);
      // Right vertex
      vertices.push(params.width / 2, y, z);
    }

    pleatGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    // Create indices for triangle faces
    const indices: number[] = [];
    for (let i = 0; i < pleatCount; i++) {
      indices.push(i * 2, i * 2 + 1, i * 2 + 2);
      indices.push(i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    pleatGeometry.setIndex(indices);
    pleatGeometry.computeVertexNormals();

    const fabricMaterial = this.getFabricMaterial(params.color, params.material);
    const fabric = new THREE.Mesh(pleatGeometry, fabricMaterial);
    fabric.position.y = params.height / 2;
    group.add(fabric);

    return group;
  }

  /**
   * Create individual slat/vane
   */
  private createSlat(
    params: BlindParams,
    width: number,
    height: number,
    thickness: number
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, thickness);
    const material = this.getMaterial(params.material, params.color);
    const slat = new THREE.Mesh(geometry, material);
    slat.castShadow = true;
    slat.receiveShadow = true;
    return slat;
  }

  /**
   * Create ladder tapes for horizontal blinds
   */
  private createLadderTapes(params: BlindParams, slatCount: number): THREE.Group {
    const group = new THREE.Group();
    const tapeCount = 3;
    const tapeSpacing = params.width / tapeCount;

    for (let i = 0; i < tapeCount; i++) {
      const x = (i - (tapeCount - 1) / 2) * tapeSpacing;
      
      // Create vertical strings
      const stringGeometry = new THREE.CylinderGeometry(0.001, 0.001, params.height, 4);
      const stringMaterial = new THREE.MeshBasicMaterial({ color: params.cordColor });
      
      const leftString = new THREE.Mesh(stringGeometry, stringMaterial);
      leftString.position.set(x - 0.03, params.height / 2, 0);
      group.add(leftString);
      
      const rightString = new THREE.Mesh(stringGeometry, stringMaterial);
      rightString.position.set(x + 0.03, params.height / 2, 0);
      group.add(rightString);
    }

    return group;
  }

  /**
   * Create bottom rail for horizontal blinds
   */
  private createBottomRail(params: BlindParams): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(params.width, 0.03, 0.04);
    const material = this.getMaterial(params.material, params.color);
    const rail = new THREE.Mesh(geometry, material);
    rail.castShadow = true;
    return rail;
  }

  /**
   * Create headrail for vertical blinds
   */
  private createHeadrail(params: BlindParams): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(params.width, 0.06, 0.08);
    const material = this.getMaterial(params.material, new THREE.Color(0xdddddd));
    const headrail = new THREE.Mesh(geometry, material);
    headrail.castShadow = true;
    return headrail;
  }

  /**
   * Create control system (cords, wands, motors)
   */
  private createControlSystem(params: BlindParams): THREE.Group {
    const group = new THREE.Group();

    if (params.controlType === 'manual') {
      // Create pull cords
      const cordGeometry = new THREE.CylinderGeometry(0.002, 0.002, params.height * 0.8, 8);
      const cordMaterial = new THREE.MeshBasicMaterial({ color: params.cordColor });
      const cord = new THREE.Mesh(cordGeometry, cordMaterial);
      cord.position.set(params.width / 2 + 0.05, params.height * 0.4, 0.02);
      group.add(cord);

      // Create cord tassel
      const tasselGeometry = new THREE.ConeGeometry(0.01, 0.03, 8);
      const tasselMaterial = new THREE.MeshStandardMaterial({ color: params.cordColor });
      const tassel = new THREE.Mesh(tasselGeometry, tasselMaterial);
      tassel.position.copy(cord.position).add(new THREE.Vector3(0, -params.height * 0.4, 0));
      group.add(tassel);

      // Create tilt wand for horizontal/venetian
      if (params.type === 'horizontal' || params.type === 'venetian') {
        const wandGeometry = new THREE.CylinderGeometry(0.005, 0.005, params.height * 0.9, 8);
        const wandMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.3,
          metalness: 0.5
        });
        const wand = new THREE.Mesh(wandGeometry, wandMaterial);
        wand.position.set(params.width / 2 + 0.1, params.height * 0.45, 0.02);
        group.add(wand);
      }
    } else if (params.controlType === 'motorized' || params.controlType === 'smart') {
      // Create motor housing
      const motorGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.05);
      const motorMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.4,
        metalness: 0.6
      });
      const motor = new THREE.Mesh(motorGeometry, motorMaterial);
      motor.position.set(params.width / 2, params.height + 0.05, 0);
      group.add(motor);

      // Add LED indicator for smart controls
      if (params.controlType === 'smart') {
        const ledGeometry = new THREE.SphereGeometry(0.005, 8, 8);
        const ledMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const led = new THREE.Mesh(ledGeometry, ledMaterial);
        led.position.set(params.width / 2 + 0.05, params.height + 0.05, 0.026);
        group.add(led);
      }
    }

    return group;
  }

  /**
   * Get appropriate material based on type
   */
  private getMaterial(materialType: BlindMaterial, color: THREE.Color): THREE.Material {
    switch (materialType) {
      case 'wood':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.6,
          metalness: 0
        });
      case 'aluminum':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.3,
          metalness: 0.8
        });
      case 'vinyl':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1
        });
      case 'bamboo':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xd2b48c),
          roughness: 0.7,
          metalness: 0
        });
      case 'fabric':
      default:
        return this.getFabricMaterial(color, materialType);
    }
  }

  /**
   * Get fabric material with appropriate properties
   */
  private getFabricMaterial(color: THREE.Color, materialType: BlindMaterial): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }

  /**
   * Generate a set of matching blinds for multiple windows
   */
  generateSet(
    windowCount: number,
    windowWidth: number,
    windowHeight: number,
    spacing: number,
    params: Partial<BlindParams> = {}
  ): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < windowCount; i++) {
      const blind = this.generate({
        ...params,
        width: windowWidth,
        height: windowHeight
      });
      
      blind.mesh.position.x = i * (windowWidth + spacing);
      group.add(blind.mesh);
    }
    
    return group;
  }
}

export default BlindGenerator;
