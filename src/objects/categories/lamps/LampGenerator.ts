/**
 * Lamp Generator for Infinigen R3F
 * Generates various indoor/outdoor lamp models with procedural materials
 * Includes: Table lamps, floor lamps, ceiling lights, wall sconces, street lamps
 */

import * as THREE from 'three';
import { MaterialGenerator } from '../../materials';

export interface LampParams {
  type: 'table' | 'floor' | 'ceiling' | 'sconce' | 'street';
  style: 'modern' | 'vintage' | 'industrial' | 'classic' | 'minimalist';
  lightColor?: THREE.Color;
  intensity?: number;
  bulbType?: 'edison' | 'led' | 'fluorescent' | 'candle';
  shadeMaterial?: 'fabric' | 'glass' | 'metal' | 'paper';
  baseMaterial?: 'wood' | 'metal' | 'ceramic' | 'plastic';
  height?: number;
  radius?: number;
  emitLight?: boolean;
}

export class LampGenerator {
  private materialGen: MaterialGenerator;

  constructor(materialGen: MaterialGenerator) {
    this.materialGen = materialGen;
  }

  async generate(params: LampParams): Promise<THREE.Group> {
    const group = new THREE.Group();
    
    const {
      type,
      style,
      lightColor = new THREE.Color(0xffaa77),
      intensity = 1.0,
      bulbType = 'led',
      shadeMaterial = 'fabric',
      baseMaterial = 'metal',
      height = 1.0,
      radius = 0.3,
      emitLight = true,
    } = params;

    // Generate base
    const base = this.createBase(type, style, baseMaterial, radius, height);
    group.add(base);

    // Generate pole/stand
    const pole = this.createPole(type, style, baseMaterial, radius, height);
    group.add(pole);

    // Generate bulb socket
    const socket = this.createSocket(bulbType, baseMaterial);
    group.add(socket);

    // Generate bulb
    const bulb = this.createBulb(bulbType, lightColor, intensity, emitLight);
    group.add(bulb);

    // Generate shade
    if (style !== 'minimalist' || type === 'table' || type === 'floor') {
      const shade = await this.createShade(style, shadeMaterial, radius, height, lightColor);
      group.add(shade);
    }

    // Add specific features based on type
    if (type === 'street') {
      const streetFeatures = this.createStreetFeatures(style, height);
      group.add(streetFeatures);
    } else if (type === 'sconce') {
      const wallMount = this.createWallMount(style, baseMaterial);
      group.add(wallMount);
    } else if (type === 'ceiling') {
      const ceilingMount = this.createCeilingMount(style, baseMaterial);
      group.add(ceilingMount);
    }

    // Apply style-specific modifications
    this.applyStyleModifiers(group, style, type);

    return group;
  }

  private createBase(
    type: LampParams['type'],
    style: LampParams['style'],
    materialType: string,
    radius: number,
    height: number
  ): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    const baseHeight = height * 0.15;

    switch (type) {
      case 'table':
        geometry = new THREE.CylinderGeometry(radius * 1.2, radius * 1.4, baseHeight, 8);
        break;
      case 'floor':
        geometry = new THREE.CylinderGeometry(radius * 1.5, radius * 1.8, baseHeight * 0.8, 8);
        break;
      case 'street':
        geometry = new THREE.CylinderGeometry(radius * 0.8, radius * 1.2, baseHeight * 2, 6);
        break;
      default:
        geometry = new THREE.CylinderGeometry(radius, radius * 1.1, baseHeight * 0.5, 6);
    }

    const material = this.materialGen.generate({
      type: baseMaterial,
      style,
      color: this.getBaseColor(style, materialType),
      roughness: 0.6,
      metalness: materialType === 'metal' ? 0.8 : 0.2,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = baseHeight / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  private createPole(
    type: LampParams['type'],
    style: LampParams['style'],
    materialType: string,
    radius: number,
    height: number
  ): THREE.Mesh {
    const poleHeight = height * 0.6;
    const poleRadius = radius * 0.15;
    
    let geometry: THREE.BufferGeometry;
    
    if (style === 'vintage' || style === 'classic') {
      // Ornate pole with varying radius
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = poleRadius * (1 + 0.3 * Math.sin(t * Math.PI * 3));
        points.push(new THREE.Vector2(r, t * poleHeight));
      }
      geometry = new THREE.LatheGeometry(points, 8);
    } else if (style === 'industrial') {
      // Segmented industrial pipe
      geometry = new THREE.CylinderGeometry(poleRadius * 0.9, poleRadius * 1.1, poleHeight, 6);
    } else {
      // Simple modern pole
      geometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 6);
    }

    const material = this.materialGen.generate({
      type: materialType,
      style,
      color: this.getBaseColor(style, materialType),
      roughness: style === 'modern' ? 0.3 : 0.7,
      metalness: materialType === 'metal' ? 0.9 : 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height * 0.15 + poleHeight / 2;
    mesh.castShadow = true;

    return mesh;
  }

  private createSocket(bulbType: string, materialType: string): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8);
    const material = this.materialGen.generate({
      type: 'metal',
      style: 'modern',
      color: new THREE.Color(0x888888),
      roughness: 0.4,
      metalness: 0.9,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.85;
    return mesh;
  }

  private createBulb(
    bulbType: string,
    color: THREE.Color,
    intensity: number,
    emitLight: boolean
  ): THREE.Group {
    const group = new THREE.Group();

    // Bulb geometry based on type
    let bulbGeometry: THREE.BufferGeometry;
    switch (bulbType) {
      case 'edison':
        bulbGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        // Add filament
        const filament = this.createEdisonFilament();
        filament.position.y = 0.02;
        group.add(filament);
        break;
      case 'candle':
        bulbGeometry = new THREE.CylinderGeometry(0.03, 0.04, 0.15, 8);
        // Add flame
        const flame = this.createFlame();
        flame.position.y = 0.12;
        group.add(flame);
        break;
      case 'fluorescent':
        bulbGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
        break;
      default: // LED
        bulbGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    }

    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff),
      emissive: color,
      emissiveIntensity: emitLight ? intensity * 0.8 : 0,
      transparent: true,
      opacity: 0.9,
      roughness: 0.2,
    });

    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.y = 0.05;
    group.add(bulb);

    // Add actual light source
    if (emitLight) {
      const light = new THREE.PointLight(color, intensity * 2, 5);
      light.position.y = 0.05;
      light.castShadow = true;
      light.shadow.mapSize.width = 512;
      light.shadow.mapSize.height = 512;
      group.add(light);
    }

    return group;
  }

  private createEdisonFilament(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xffaa00,
      emissiveIntensity: 2,
    });

    // Create zigzag filament
    const points = [
      new THREE.Vector3(-0.03, 0, 0),
      new THREE.Vector3(-0.015, 0.04, 0),
      new THREE.Vector3(0.015, 0.04, 0),
      new THREE.Vector3(0.03, 0, 0),
    ];
    
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.005, 4, false);
    const filament = new THREE.Mesh(tubeGeometry, material);
    group.add(filament);

    return group;
  }

  private createFlame(): THREE.Group {
    const group = new THREE.Group();
    
    // Flickering flame shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.02, 0.03, 0, 0.06);
    shape.quadraticCurveTo(-0.02, 0.03, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 3,
    });
    
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    
    const flame = new THREE.Mesh(geometry, material);
    flame.position.z = -0.01;
    
    // Add point light for flame glow
    const light = new THREE.PointLight(0xff6600, 0.5, 1);
    light.position.y = 0.03;
    group.add(light);
    
    group.add(flame);
    
    // Animate flame flicker
    const time = Date.now() * 0.001;
    flame.scale.x = 1 + 0.1 * Math.sin(time * 10);
    flame.scale.y = 1 + 0.15 * Math.sin(time * 15);
    
    return group;
  }

  private async createShade(
    style: string,
    materialType: string,
    radius: number,
    height: number,
    lightColor: THREE.Color
  ): Promise<THREE.Mesh> {
    const shadeHeight = height * 0.25;
    const topRadius = radius * 0.6;
    const bottomRadius = radius * 1.2;

    let geometry: THREE.BufferGeometry;
    
    if (style === 'modern' || style === 'minimalist') {
      geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, shadeHeight, 8, 1, true);
    } else if (style === 'vintage' || style === 'classic') {
      // Curved vintage shade
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = topRadius + (bottomRadius - topRadius) * t + 0.05 * Math.sin(t * Math.PI);
        points.push(new THREE.Vector2(r, t * shadeHeight));
      }
      geometry = new THREE.LatheGeometry(points, 12);
    } else {
      geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, shadeHeight, 8, 1, true);
    }

    let material: THREE.Material;
    
    if (materialType === 'fabric') {
      material = this.materialGen.generate({
        type: 'fabric',
        style,
        color: new THREE.Color(0xf5f5dc),
        roughness: 0.9,
        transmission: 0.3,
        opacity: 0.8,
      });
    } else if (materialType === 'glass') {
      material = this.materialGen.generate({
        type: 'glass',
        style,
        color: lightColor.clone().multiplyScalar(0.3),
        roughness: 0.1,
        transmission: 0.9,
        opacity: 0.6,
      });
    } else if (materialType === 'paper') {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xfffff0),
        roughness: 0.8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
    } else {
      // Metal shade with holes
      material = this.materialGen.generate({
        type: 'metal',
        style,
        color: new THREE.Color(0x333333),
        roughness: 0.5,
        metalness: 0.8,
      });
    }

    const shade = new THREE.Mesh(geometry, material);
    shade.position.y = 0.9;
    shade.castShadow = true;
    shade.receiveShadow = true;

    return shade;
  }

  private createStreetFeatures(style: string, height: number): THREE.Group {
    const group = new THREE.Group();
    
    // Crossbar for street lamp
    const barGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6);
    const barMaterial = this.materialGen.generate({
      type: 'metal',
      style,
      color: new THREE.Color(0x222222),
      roughness: 0.6,
      metalness: 0.8,
    });
    
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = height * 0.85;
    group.add(bar);
    
    // Decorative elements for vintage style
    if (style === 'vintage' || style === 'classic') {
      const ornamentGeometry = new THREE.SphereGeometry(0.08, 8, 8);
      const ornament = new THREE.Mesh(ornamentGeometry, barMaterial);
      ornament.position.y = height * 0.85;
      group.add(ornament);
    }
    
    return group;
  }

  private createWallMount(style: string, materialType: string): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(0.15, 0.2, 0.1);
    const material = this.materialGen.generate({
      type: materialType,
      style,
      color: this.getBaseColor(style, materialType),
      roughness: 0.5,
      metalness: materialType === 'metal' ? 0.8 : 0.3,
    });
    
    const mount = new THREE.Mesh(geometry, material);
    mount.position.set(0, 0.7, -0.05);
    mount.castShadow = true;
    
    return mount;
  }

  private createCeilingMount(style: string, materialType: string): THREE.Group {
    const group = new THREE.Group();
    
    // Ceiling plate
    const plateGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 8);
    const plateMaterial = this.materialGen.generate({
      type: materialType,
      style,
      color: new THREE.Color(0xffffff),
      roughness: 0.4,
      metalness: 0.2,
    });
    
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.y = 1.0;
    group.add(plate);
    
    // Chain or rod
    if (style === 'vintage' || style === 'classic') {
      const chainGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6);
      const chainMaterial = this.materialGen.generate({
        type: 'metal',
        style,
        color: new THREE.Color(0xcc9900),
        roughness: 0.3,
        metalness: 0.9,
      });
      
      const chain = new THREE.Mesh(chainGeometry, chainMaterial);
      chain.position.y = 0.9;
      group.add(chain);
    }
    
    return group;
  }

  private applyStyleModifiers(group: THREE.Group, style: string, type: string): void {
    // Apply style-specific transformations and details
    if (style === 'art_deco') {
      // Add geometric patterns
      group.scale.set(1.05, 1.1, 1.05);
    } else if (style === 'industrial') {
      // Add visible bolts and joints
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = this.materialGen.generate({
            ...(child.material as any).userData,
            roughness: 0.8,
            metalness: 0.9,
          });
        }
      });
    }
  }

  private getBaseColor(style: string, materialType: string): THREE.Color {
    const colors: Record<string, THREE.Color> = {
      modern: new THREE.Color(0x222222),
      vintage: new THREE.Color(0x8b4513),
      industrial: new THREE.Color(0x444444),
      classic: new THREE.Color(0xd4af37),
      minimalist: new THREE.Color(0xffffff),
    };

    if (materialType === 'wood') {
      return new THREE.Color(0x8b4513);
    } else if (materialType === 'ceramic') {
      return new THREE.Color(0xf5f5dc);
    } else if (materialType === 'plastic') {
      return new THREE.Color(0x333333);
    }

    return colors[style] || new THREE.Color(0x888888);
  }
}
