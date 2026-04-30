/**
 * Table Lamp Generator
 * Generates various table-top lamp designs
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { ObjectRegistry } from '../ObjectRegistry';

export interface TableLampParams extends BaseGeneratorConfig {
  lampType: 'desk' | 'bedside' | 'banker' | 'piano' | 'buffet' | 'accent';
  baseWidth: number;
  baseDepth: number;
  height: number;
  shadeDiameter: number;
  shadeHeight: number;
  style: 'modern' | 'traditional' | 'industrial' | 'art-deco' | 'minimalist' | 'rustic';
  baseMaterial: 'metal' | 'wood' | 'ceramic' | 'glass' | 'stone' | 'brass';
  baseColor: string;
  shadeMaterial: 'fabric' | 'paper' | 'glass' | 'metal' | 'plastic';
  shadeColor: string;
  bulbVisible: boolean;
  dimmable: boolean;
  adjustable: boolean;
  switchType: 'pull-chain' | 'rotary' | 'touch' | 'inline';
}

export class TableLamps extends BaseObjectGenerator<TableLampParams> {
  constructor() {
    super();
    this.category = 'lighting';
    this.subcategory = 'table';
  }

  getDefaultConfig(): TableLampParams {
    return {
      lampType: 'bedside',
      baseWidth: 0.15,
      baseDepth: 0.15,
      height: 0.5,
      shadeDiameter: 0.25,
      shadeHeight: 0.2,
      style: 'modern',
      baseMaterial: 'metal',
      baseColor: '#000000',
      shadeMaterial: 'fabric',
      shadeColor: '#FFFFFF',
      bulbVisible: false,
      dimmable: false,
      adjustable: false,
      switchType: 'pull-chain',
    };
  }

  private getMaterial(materialType: string, color: string): THREE.Material {
    switch (materialType) {
      case 'metal':
        return this.getMetalMaterial('steel');
      case 'wood':
        return new THREE.MeshStandardMaterial({ color: Number(color), roughness: 0.8, metalness: 0 });
      default:
        return new THREE.MeshStandardMaterial({ color: Number(color) });
    }
  }

  generate(params: Partial<TableLampParams> = {}): THREE.Object3D {
    const finalParams = { ...this.getDefaultConfig(), ...params };
    const group = new THREE.Group();

    let lamp: THREE.Object3D;

    switch (finalParams.lampType) {
      case 'desk':
        lamp = this.createDeskLamp(finalParams);
        break;
      case 'bedside':
        lamp = this.createBedsideLamp(finalParams);
        break;
      case 'banker':
        lamp = this.createBankerLamp(finalParams);
        break;
      case 'piano':
        lamp = this.createPianoLamp(finalParams);
        break;
      case 'buffet':
        lamp = this.createBuffetLamp(finalParams);
        break;
      case 'accent':
      default:
        lamp = this.createAccentLamp(finalParams);
    }

    // Generate collision mesh
    const collisionMesh: THREE.Object3D | undefined = undefined; // this.generateCollisionMesh(lamp);
    lamp.userData.collisionMesh = collisionMesh;

    // Add light source
    this.addLightSource(lamp, finalParams);

    // Add switch indicator
    this.addSwitchIndicator(lamp, finalParams);

    group.add(lamp);
    return group;
  }

  private createDeskLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Base (weighted)
    const baseGeometry = params.style === 'modern'
      ? new THREE.BoxGeometry(params.baseWidth, 0.03, params.baseDepth)
      : new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2 * 1.1, 0.04, 32);

    const baseMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.02;
    base.userData.weight = 2.0;
    group.add(base);

    // Adjustable arm system
    if (params.adjustable) {
      // Lower arm
      const lowerArmLength = params.height * 0.4;
      const lowerArmGeometry = new THREE.CylinderGeometry(0.015, 0.015, lowerArmLength, 16);
      const armMaterial = this.getMaterial(params.baseMaterial === 'wood' ? 'metal' : params.baseMaterial, params.baseColor);
      const lowerArm = new THREE.Mesh(lowerArmGeometry, armMaterial);
      lowerArm.rotation.x = Math.PI / 3;
      lowerArm.position.y = params.height * 0.3;
      group.add(lowerArm);

      // Joint
      const jointGeometry = new THREE.SphereGeometry(0.025, 16, 16);
      const joint = new THREE.Mesh(jointGeometry, armMaterial);
      joint.position.y = params.height * 0.5;
      group.add(joint);

      // Upper arm
      const upperArmLength = params.height * 0.35;
      const upperArmGeometry = new THREE.CylinderGeometry(0.012, 0.012, upperArmLength, 16);
      const upperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
      upperArm.rotation.x = -Math.PI / 6;
      upperArm.position.set(0, params.height * 0.7, lowerArmLength * 0.4);
      group.add(upperArm);

      // Shade holder
      const holderGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 16);
      const holder = new THREE.Mesh(holderGeometry, armMaterial);
      holder.position.set(0, params.height * 0.85, lowerArmLength * 0.6 + upperArmLength * 0.3);
      group.add(holder);

      // Shade
      const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params, true);
      shade.position.set(0, params.height * 0.9, lowerArmLength * 0.6 + upperArmLength * 0.4);
      group.add(shade);
    } else {
      // Fixed stem
      const stemHeight = params.height - params.shadeHeight;
      const stemGeometry = new THREE.CylinderGeometry(0.02, 0.025, stemHeight, 16);
      const stemMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
      const stem = new THREE.Mesh(stemGeometry, stemMaterial);
      stem.position.y = stemHeight / 2 + 0.04;
      group.add(stem);

      // Shade
      const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
      shade.position.y = params.height - params.shadeHeight * 0.5;
      group.add(shade);
    }

    return group;
  }

  private createBedsideLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Decorative base
    const baseGeometry = this.getBaseGeometry(params);
    const baseMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = baseGeometry.boundingBox?.max.y ?? 0.03 ? baseGeometry.boundingBox?.max.y ?? 0.03 / 2 : 0.03;
    group.add(base);

    // Stem
    const stemHeight = params.height - params.shadeHeight - 0.05;
    const stemRadius = params.style === 'traditional' ? 0.03 : 0.02;
    const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius * 0.9, stemHeight, 16);
    const stemMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemHeight / 2 + 0.05;
    group.add(stem);

    // Decorative element between stem and shade
    if (params.style === 'traditional' || params.style === 'art-deco') {
      const decorGeometry = new THREE.SphereGeometry(stemRadius * 2, 16, 16);
      const decor = new THREE.Mesh(decorGeometry, stemMaterial);
      decor.position.y = params.height - params.shadeHeight * 0.8;
      group.add(decor);
    }

    // Shade
    const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    shade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(shade);

    return group;
  }

  private createBankerLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Heavy rectangular base
    const baseGeometry = new THREE.BoxGeometry(params.baseWidth * 1.3, 0.04, params.baseDepth * 0.8);
    const baseMaterial = this.getMaterial('brass', '#B8860B');
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.02;
    group.add(base);

    // Curved neck
    const neckCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.04, 0),
      new THREE.Vector3(0, params.height * 0.5, params.baseDepth * 0.3),
      new THREE.Vector3(0, params.height - params.shadeHeight, params.baseDepth * 0.5)
    );

    const neckGeometry = new THREE.TubeGeometry(neckCurve, 24, 0.015, 12, false);
    const neckMaterial = this.getMaterial('brass', '#B8860B');
    const neck = new THREE.Mesh(neckGeometry, neckMaterial);
    group.add(neck);

    // Classic green glass shade (or custom)
    const shadeGeometry = new THREE.ConeGeometry(params.shadeDiameter / 2, params.shadeHeight, 32, 1, true);
    const shadeMaterial = new THREE.MeshPhysicalMaterial({
      color: params.shadeColor || '#2E8B57',
      roughness: 0.2,
      metalness: 0.0,
      transmission: 0.6,
      transparent: true,
    });
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    shade.position.set(0, params.height - params.shadeHeight * 0.7, params.baseDepth * 0.5);
    shade.rotation.x = Math.PI; // Point down
    group.add(shade);

    // Brass trim
    const trimGeometry = new THREE.TorusGeometry(params.shadeDiameter / 2, 0.008, 16, 32);
    const trim = new THREE.Mesh(trimGeometry, neckMaterial);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, params.height - params.shadeHeight * 0.3, params.baseDepth * 0.5);
    group.add(trim);

    return group;
  }

  private createPianoLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Long horizontal base
    const baseGeometry = new THREE.BoxGeometry(params.baseWidth * 2, 0.03, params.baseDepth * 0.6);
    const baseMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.015;
    group.add(base);

    // Vertical support
    const supportHeight = params.height - params.shadeHeight;
    const supportGeometry = new THREE.CylinderGeometry(0.02, 0.025, supportHeight, 16);
    const support = new THREE.Mesh(supportGeometry, baseMaterial);
    support.position.x = params.baseWidth * 0.8;
    support.position.y = supportHeight / 2 + 0.015;
    group.add(support);

    // Horizontal arm
    const armLength = params.baseWidth * 0.8;
    const armGeometry = new THREE.CylinderGeometry(0.015, 0.015, armLength, 16);
    const arm = new THREE.Mesh(armGeometry, baseMaterial);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(params.baseWidth * 0.8, params.height - params.shadeHeight * 0.8, armLength / 2);
    group.add(arm);

    // Elongated shade
    const shadeGeometry = new THREE.CapsuleGeometry(params.shadeDiameter / 2, params.shadeHeight * 0.5, 8, 16);
    const shadeMaterial = this.getShadeMaterial(params);
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);
    shade.rotation.x = Math.PI / 2;
    shade.position.set(params.baseWidth * 0.8, params.height - params.shadeHeight, params.baseDepth * 0.5 + armLength / 2);
    group.add(shade);

    return group;
  }

  private createBuffetLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Ornate base
    const baseGeometry = this.getBaseGeometry(params);
    const baseMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = baseGeometry.boundingBox?.max.y ?? 0.03 ? baseGeometry.boundingBox?.max.y ?? 0.03 / 2 : 0.04;
    group.add(base);

    // Tall elegant stem
    const stemHeight = params.height - params.shadeHeight - 0.05;
    const stemGeometry = new THREE.CylinderGeometry(0.025, 0.03, stemHeight, 24);
    const stem = new THREE.Mesh(stemGeometry, baseMaterial);
    stem.position.y = stemHeight / 2 + 0.05;
    group.add(stem);

    // Decorative finial
    if (params.style === 'traditional' || params.style === 'art-deco') {
      const finialGeometry = new THREE.SphereGeometry(0.03, 16, 16);
      const finial = new THREE.Mesh(finialGeometry, baseMaterial);
      finial.position.y = params.height - params.shadeHeight * 0.9;
      group.add(finial);
    }

    // Large decorative shade
    const shade = this.createShade(params.shadeDiameter * 1.2, params.shadeHeight * 1.1, params);
    shade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(shade);

    return group;
  }

  private createAccentLamp(params: TableLampParams): THREE.Object3D {
    const group = new THREE.Group();

    // Sculptural base
    const baseGeometry = params.style === 'modern' || params.style === 'minimalist'
      ? new THREE.TorusGeometry(params.baseWidth / 2, 0.03, 16, 32)
      : new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 3, 0.08, 24);

    const baseMaterial = this.getMaterial(params.baseMaterial, params.baseColor);
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = params.style === 'modern' || params.style === 'minimalist' ? params.baseWidth / 2 : 0.04;
    if (params.style === 'modern' || params.style === 'minimalist') {
      base.rotation.x = Math.PI / 2;
    }
    group.add(base);

    // Minimal stem or direct shade mount
    if (!(params.style === 'modern' || params.style === 'minimalist')) {
      const stemHeight = params.height - params.shadeHeight - 0.08;
      const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, stemHeight, 16);
      const stem = new THREE.Mesh(stemGeometry, baseMaterial);
      stem.position.y = stemHeight / 2 + 0.08;
      group.add(stem);
    }

    // Unique shade
    const shade = this.createShade(params.shadeDiameter, params.shadeHeight, params);
    shade.position.y = params.height - params.shadeHeight * 0.5;
    group.add(shade);

    return group;
  }

  private getBaseGeometry(params: TableLampParams): THREE.BufferGeometry {
    if (params.style === 'traditional') {
      return new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2 * 1.2, 0.08, 32);
    } else if (params.style === 'art-deco') {
      return new THREE.CylinderGeometry(params.baseWidth / 3, params.baseWidth / 2, 0.1, 8);
    } else if (params.style === 'rustic') {
      return new THREE.CylinderGeometry(params.baseWidth / 2 * 0.9, params.baseWidth / 2 * 1.1, 0.06, 12);
    } else {
      return new THREE.CylinderGeometry(params.baseWidth / 2, params.baseWidth / 2, 0.05, 32);
    }
  }

  private createShade(diameter: number, height: number, params: TableLampParams, directional: boolean = false): THREE.Object3D {
    const shadeGroup = new THREE.Group();

    let shadeGeometry: THREE.BufferGeometry;

    if (directional) {
      // Directional shade for desk lamps
      shadeGeometry = new THREE.ConeGeometry(diameter / 2, height, 32, 1, true);
    } else if (params.style === 'modern' || params.style === 'minimalist') {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 32, 1, true);
    } else if (params.style === 'traditional') {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2 * 0.7, diameter / 2, height, 32, 1, true);
    } else if (params.style === 'art-deco') {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2 * 0.6, diameter / 2 * 1.2, height, 24, 1, true);
    } else {
      shadeGeometry = new THREE.CylinderGeometry(diameter / 2 * 0.8, diameter / 2 * 1.1, height, 32, 1, true);
    }

    const shadeMaterial = this.getShadeMaterial(params);
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial);

    if (directional) {
      shade.rotation.x = Math.PI; // Point down
    }

    shadeGroup.add(shade);

    // Add harp and finial for traditional styles
    if (!directional && (params.style === 'traditional' || params.style === 'art-deco')) {
      const harpGeometry = new THREE.TorusGeometry(diameter / 2 * 0.4, 0.005, 8, 16, Math.PI);
      const harpMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
      const harp = new THREE.Mesh(harpGeometry, harpMaterial);
      harp.rotation.y = Math.PI / 2;
      harp.position.y = height / 2;
      shadeGroup.add(harp);
    }

    return shadeGroup;
  }

  private getShadeMaterial(params: TableLampParams): THREE.Material {
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
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
    } else if (params.shadeMaterial === 'glass') {
      return new THREE.MeshPhysicalMaterial({
        color: params.shadeColor,
        roughness: 0.1,
        metalness: 0.0,
        transmission: 0.8,
        transparent: true,
        opacity: 0.4,
      });
    } else if (params.shadeMaterial === 'metal') {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.3,
        metalness: 0.9,
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: params.shadeColor,
        roughness: 0.5,
        metalness: 0.1,
      });
    }
  }

  private addLightSource(object: THREE.Object3D, params: TableLampParams): void {
    const bulbColor = params.bulbVisible ? '#FFD7A0' : '#FFF5E1';
    const intensity = 250;

    // Find shades and add lights
    object.traverse((child) => {
      if (child instanceof THREE.Mesh &&
        (child.geometry.type.includes('Cylinder') ||
          child.geometry.type.includes('Cone') ||
          child.geometry.type.includes('Capsule'))) {

        const light = new THREE.PointLight(bulbColor, intensity, 6);
        light.position.y = child.geometry.type.includes('Cone') ? -0.05 : -0.1;
        child.add(light);

        // Visible bulb
        if (params.bulbVisible) {
          const bulbGeometry = new THREE.SphereGeometry(0.03, 16, 16);
          const bulbMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFD7A0,
            emissive: 0xFFD7A0,
            emissiveIntensity: 0.6,
          });
          const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
          bulb.position.y = child.geometry.type.includes('Cone') ? -0.05 : -0.1;
          child.add(bulb);
        }
      }
    });

    if (params.dimmable) {
      object.userData.dimmable = true;
      object.userData.baseIntensity = intensity;
    }
  }

  private addSwitchIndicator(object: THREE.Object3D, params: TableLampParams): void {
    object.userData.switchType = params.switchType;

    // Add visual indicator for touch switches
    if (params.switchType === 'touch') {
      const indicatorGeometry = new THREE.SphereGeometry(0.008, 8, 8);
      const indicatorMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00,
        emissive: 0x00FF00,
        emissiveIntensity: 0.3,
      });
      const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
      indicator.position.set(params.baseWidth / 2 - 0.02, 0.05, 0);
      object.add(indicator);
      object.userData.touchSensor = indicator;
    }
  }

  getRandomParams(): Partial<TableLampParams> {
    const lampTypes: TableLampParams['lampType'][] = ['desk', 'bedside', 'banker', 'piano', 'buffet', 'accent'];
    const styles: TableLampParams['style'][] = ['modern', 'traditional', 'industrial', 'art-deco', 'minimalist', 'rustic'];
    const baseMaterials: TableLampParams['baseMaterial'][] = ['metal', 'wood', 'ceramic', 'glass', 'stone', 'brass'];
    const shadeMaterials: TableLampParams['shadeMaterial'][] = ['fabric', 'paper', 'glass', 'metal', 'plastic'];
    const switchTypes: TableLampParams['switchType'][] = ['pull-chain', 'rotary', 'touch', 'inline'];

    return {
      lampType: lampTypes[Math.floor(Math.random() * lampTypes.length)],
      baseWidth: 0.12 + Math.random() * 0.15,
      height: 0.35 + Math.random() * 0.35,
      shadeDiameter: 0.18 + Math.random() * 0.15,
      style: styles[Math.floor(Math.random() * styles.length)],
      baseMaterial: baseMaterials[Math.floor(Math.random() * baseMaterials.length)],
      shadeMaterial: shadeMaterials[Math.floor(Math.random() * shadeMaterials.length)],
      switchType: switchTypes[Math.floor(Math.random() * switchTypes.length)],
      bulbVisible: Math.random() > 0.6,
      dimmable: Math.random() > 0.5,
      adjustable: Math.random() > 0.7,
    };
  }

  validateParams(params: TableLampParams): boolean {
    return (
      params.baseWidth > 0.08 && params.baseWidth < 0.4 &&
      params.height > 0.2 && params.height < 1.0 &&
      params.shadeDiameter > 0.1 && params.shadeDiameter < 0.5
    );
  }
}

// Register the generator
ObjectRegistry.register('table_lamps', TableLamps, {
  category: 'lighting',
  subcategory: 'table',
  description: 'Table-top lamps including desk, bedside, banker, piano, and accent lamps',
});
