/**
 * Vase Generator
 * 
 * Procedural vase generation with various shapes,
 * materials, patterns, and decorative elements.
 */

import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface VaseConfig {
  shape: 'cylinder' | 'sphere' | 'cone' | 'hourglass' | 'amphora' | 'bud' | 'flute';
  material: 'ceramic' | 'glass' | 'crystal' | 'metal' | 'clay' | 'porcelain';
  color: string;
  height: number;
  radius: number;
  neckRadius: number;
  baseRadius: number;
  hasHandles: boolean;
  handleStyle: 'loop' | 'angular' | 'organic' | 'rope';
  handleCount: 0 | 1 | 2 | 3 | 4;
  pattern: 'none' | 'stripes' | 'checkered' | 'floral' | 'geometric' | 'swirls';
  patternColor: string;
  rimStyle: 'flat' | 'rounded' | 'flared' | 'notched';
  baseStyle: 'flat' | 'rounded' | 'pedestal' | 'wide';
  surfaceFinish: 'matte' | 'glossy' | 'textured' | 'cracked';
  seed?: number;
}

export class VaseGenerator extends BaseObjectGenerator<VaseConfig> {
  protected readonly defaultParams: VaseConfig = {
    shape: 'cylinder',
    material: 'ceramic',
    color: '#FFFFFF',
    height: 0.3,
    radius: 0.1,
    neckRadius: 0.08,
    baseRadius: 0.12,
    hasHandles: false,
    handleStyle: 'loop',
    handleCount: 0,
    pattern: 'none',
    patternColor: '#000000',
    rimStyle: 'rounded',
    baseStyle: 'flat',
    surfaceFinish: 'glossy',
    seed: undefined
  };

  getDefaultConfig(): VaseConfig {
    return { ...this.defaultParams };
  }

  generate(params: Partial<VaseConfig> = {}): THREE.Group {
    const config = { ...this.defaultParams, ...params };
    const group = new THREE.Group();

    // Main vase body
    const vaseBody = this.createVaseBody(config);
    group.add(vaseBody);

    // Handles
    if (config.hasHandles && config.handleCount > 0) {
      const handles = this.createHandles(config);
      group.add(handles);
    }

    // Rim detail
    const rim = this.createRim(config);
    group.add(rim);

    // Base detail
    if (config.baseStyle !== 'flat') {
      const base = this.createBase(config);
      group.add(base);
    }

    return group;
  }

  private createVaseBody(config: VaseConfig): THREE.Mesh {
    let geometry: THREE.BufferGeometry;

    switch (config.shape) {
      case 'sphere':
        geometry = this.createSphereVaseGeometry(config);
        break;
      case 'cone':
        geometry = this.createConeVaseGeometry(config);
        break;
      case 'hourglass':
        geometry = this.createHourglassVaseGeometry(config);
        break;
      case 'amphora':
        geometry = this.createAmphoraVaseGeometry(config);
        break;
      case 'bud':
        geometry = this.createBudVaseGeometry(config);
        break;
      case 'flute':
        geometry = this.createFluteVaseGeometry(config);
        break;
      default: // cylinder
        geometry = this.createCylinderVaseGeometry(config);
    }

    const material = this.getVaseMaterial(config);
    const vase = new THREE.Mesh(geometry, material);

    // Apply pattern if specified
    if (config.pattern !== 'none') {
      this.applyPattern(vase, config);
    }

    return vase;
  }

  private createCylinderVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    return new THREE.CylinderGeometry(
      config.radius,
      config.baseRadius,
      config.height,
      32,
      1,
      true
    );
  }

  private createSphereVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(config.radius, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.7);
    
    // Scale to create sphere-like vase
    geometry.scale(1, 1.2, 1);
    
    return geometry;
  }

  private createConeVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    return new THREE.CylinderGeometry(
      config.neckRadius,
      config.baseRadius,
      config.height,
      32,
      1,
      true
    );
  }

  private createHourglassVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    const points: THREE.Vector2[] = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * config.height;
      
      // Hourglass profile
      const radius = config.radius * (1 - Math.abs(t - 0.5) * 0.6) + 
                     config.neckRadius * Math.abs(t - 0.5) * 1.2;
      
      points.push(new THREE.Vector2(radius, y));
    }
    
    return new THREE.LatheGeometry(points, 32);
  }

  private createAmphoraVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    const points: THREE.Vector2[] = [];
    const segments = 25;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * config.height;
      
      // Amphora profile - wide body, narrow neck
      let radius: number;
      if (t < 0.2) {
        // Base flare
        radius = config.baseRadius * (1 - t * 0.5);
      } else if (t < 0.5) {
        // Wide body
        radius = config.radius * (1 + Math.sin((t - 0.2) * Math.PI * 1.5) * 0.3);
      } else if (t < 0.7) {
        // Narrowing to neck
        radius = config.radius * (1 - (t - 0.5) * 2) + config.neckRadius * ((t - 0.5) * 2);
      } else {
        // Neck
        radius = config.neckRadius;
      }
      
      points.push(new THREE.Vector2(radius, y));
    }
    
    return new THREE.LatheGeometry(points, 32);
  }

  private createBudVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    const points: THREE.Vector2[] = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * config.height;
      
      // Bud profile - narrow at both ends, wide in middle
      const radius = config.neckRadius + (config.radius - config.neckRadius) * 
                     Math.sin(t * Math.PI);
      
      points.push(new THREE.Vector2(radius, y));
    }
    
    return new THREE.LatheGeometry(points, 32);
  }

  private createFluteVaseGeometry(config: VaseConfig): THREE.BufferGeometry {
    const points: THREE.Vector2[] = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * config.height;
      
      // Flute profile - tall and slender with slight flare
      const radius = config.neckRadius + (config.radius - config.neckRadius) * 
                     Math.pow(t, 0.5);
      
      points.push(new THREE.Vector2(radius, y));
    }
    
    return new THREE.LatheGeometry(points, 32);
  }

  private getVaseMaterial(config: VaseConfig): THREE.Material {
    let roughness = 0.3;
    let metalness = 0.0;
    let transmission = 0;
    let opacity = 1;

    switch (config.material) {
      case 'glass':
        roughness = 0.1;
        transmission = 0.9;
        opacity = 0.7;
        break;
      case 'crystal':
        roughness = 0.05;
        transmission = 0.95;
        opacity = 0.5;
        break;
      case 'metal':
        roughness = 0.2;
        metalness = 0.9;
        break;
      case 'clay':
        roughness = 0.9;
        break;
      case 'porcelain':
        roughness = 0.2;
        break;
      default: // ceramic
        roughness = 0.4;
    }

    if (config.surfaceFinish === 'matte') {
      roughness = 0.8;
    } else if (config.surfaceFinish === 'textured') {
      roughness = 0.7;
    } else if (config.surfaceFinish === 'cracked') {
      roughness = 0.6;
    }

    return new THREE.MeshPhysicalMaterial({
      color: config.color,
      roughness,
      metalness,
      transmission,
      transparent: opacity < 1,
      opacity,
      clearcoat: config.surfaceFinish === 'glossy' ? 1.0 : 0.0,
      clearcoatRoughness: config.surfaceFinish === 'glossy' ? 0.1 : 0.5
    });
  }

  private createHandles(config: VaseConfig): THREE.Group {
    const handles = new THREE.Group();
    const handleMaterial = this.getVaseMaterial(config);

    for (let i = 0; i < config.handleCount; i++) {
      const angle = (i / config.handleCount) * Math.PI * 2;
      const handle = this.createSingleHandle(config, angle);
      handles.add(handle);
    }

    return handles;
  }

  private createSingleHandle(config: VaseConfig, angle: number): THREE.Mesh {
    let handleShape: THREE.Shape;

    switch (config.handleStyle) {
      case 'angular':
        handleShape = this.createAngularHandleShape();
        break;
      case 'organic':
        handleShape = this.createOrganicHandleShape();
        break;
      case 'rope':
        handleShape = this.createRopeHandleShape();
        break;
      default: // loop
        handleShape = this.createLoopHandleShape();
    }

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 20,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 3,
      depth: 0.015
    };

    const geometry = new THREE.ExtrudeGeometry(handleShape, extrudeSettings);
    const handle = new THREE.Mesh(geometry, this.getVaseMaterial(config));

    // Position and rotate handle
    const x = Math.cos(angle) * config.radius;
    const z = Math.sin(angle) * config.radius;
    handle.position.set(x, 0, z);
    handle.rotation.y = -angle;

    return handle;
  }

  private createLoopHandleShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const width = 0.03;
    const height = 0.15;

    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width, height * 0.25, width, height * 0.5);
    shape.quadraticCurveTo(width, height * 0.75, 0, height);
    shape.lineTo(-width, height);
    shape.quadraticCurveTo(-width * 1.2, height * 0.75, -width * 1.2, height * 0.5);
    shape.quadraticCurveTo(-width * 1.2, height * 0.25, -width, 0);
    shape.closePath();

    return shape;
  }

  private createAngularHandleShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const width = 0.025;
    const height = 0.15;

    shape.moveTo(0, 0);
    shape.lineTo(width, height * 0.3);
    shape.lineTo(width, height * 0.7);
    shape.lineTo(0, height);
    shape.lineTo(-width, height);
    shape.lineTo(-width * 1.3, height * 0.7);
    shape.lineTo(-width * 1.3, height * 0.3);
    shape.lineTo(-width, 0);
    shape.closePath();

    return shape;
  }

  private createOrganicHandleShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const height = 0.15;

    shape.moveTo(0, 0);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = t * height;
      const x = Math.sin(t * Math.PI) * 0.04 * Math.sin(t * Math.PI * 3) * 0.3;
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    for (let i = 10; i >= 0; i--) {
      const t = i / 10;
      const y = t * height;
      const x = -Math.sin(t * Math.PI) * 0.04 - Math.sin(t * Math.PI * 3) * 0.01;
      shape.lineTo(x, y);
    }
    shape.closePath();

    return shape;
  }

  private createRopeHandleShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const height = 0.15;
    const twists = 5;

    shape.moveTo(0, 0);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const y = t * height;
      const twist = Math.sin(t * Math.PI * twists) * 0.015;
      const curve = Math.sin(t * Math.PI) * 0.035;
      shape.lineTo(curve + twist, y);
    }
    for (let i = 40; i >= 0; i--) {
      const t = i / 40;
      const y = t * height;
      const twist = Math.sin(t * Math.PI * twists) * 0.015;
      const curve = -Math.sin(t * Math.PI) * 0.035;
      shape.lineTo(curve + twist, y);
    }
    shape.closePath();

    return shape;
  }

  private createRim(config: VaseConfig): THREE.Mesh {
    let rimGeometry: THREE.BufferGeometry;

    switch (config.rimStyle) {
      case 'flared':
        rimGeometry = new THREE.TorusGeometry(config.radius + 0.02, 0.008, 16, 32);
        break;
      case 'notched':
        rimGeometry = this.createNotchedRimGeometry(config);
        break;
      default: // flat or rounded
        rimGeometry = new THREE.TorusGeometry(config.radius, 0.006, 16, 32);
    }

    const rim = new THREE.Mesh(rimGeometry, this.getVaseMaterial(config));
    rim.position.y = config.height / 2;
    rim.rotation.x = Math.PI / 2;

    return rim;
  }

  private createNotchedRimGeometry(config: VaseConfig): THREE.BufferGeometry {
    const points: THREE.Vector2[] = [];
    const notches = 8;

    for (let i = 0; i <= notches * 4; i++) {
      const angle = (i / (notches * 4)) * Math.PI * 2;
      const radius = config.radius + (i % 4 === 0 ? 0.02 : 0);
      points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }

    const shape = new THREE.Shape(points);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  }

  private createBase(config: VaseConfig): THREE.Mesh {
    let baseGeometry: THREE.BufferGeometry;

    switch (config.baseStyle) {
      case 'rounded':
        baseGeometry = new THREE.SphereGeometry(config.baseRadius * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
        break;
      case 'pedestal':
        baseGeometry = new THREE.CylinderGeometry(
          config.baseRadius * 0.5,
          config.baseRadius * 0.7,
          0.05,
          16
        );
        break;
      case 'wide':
        baseGeometry = new THREE.CylinderGeometry(
          config.baseRadius * 1.3,
          config.baseRadius * 1.5,
          0.03,
          16
        );
        break;
      default:
        baseGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    }

    const base = new THREE.Mesh(baseGeometry, this.getVaseMaterial(config));
    base.position.y = -config.height / 2;

    return base;
  }

  private applyPattern(vase: THREE.Mesh, config: VaseConfig): void {
    // Simplified pattern application via vertex colors or texture
    // In production, this would use custom shaders or texture mapping
    const material = vase.material as THREE.MeshPhysicalMaterial;
    
    if (config.pattern === 'stripes') {
      // Would apply stripe texture in full implementation
      material.emissive = new THREE.Color(config.patternColor);
      material.emissiveIntensity = 0.1;
    } else if (config.pattern === 'checkered') {
      // Would apply checker texture
      material.emissive = new THREE.Color(config.patternColor);
      material.emissiveIntensity = 0.05;
    }
    // Other patterns would use similar approach with textures
  }


  getVariations(count: number = 4, baseConfig?: Partial<VaseConfig>): THREE.Object3D[] {
    const variations: THREE.Object3D[] = [];

    const configs: VaseConfig[] = [];
    for (let i = 0; i < count; i++) {
      configs.push({
        ...this.defaultParams,
        shape: ['cylinder', 'amphora', 'bud', 'hourglass', 'flute'][Math.floor(Math.random() * 5)] as any,
        material: ['ceramic', 'clay', 'glass', 'crystal', 'porcelain'][Math.floor(Math.random() * 5)] as any,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        hasHandles: Math.random() > 0.5,
        handleCount: Math.floor(Math.random() * 3) + 1,
        surfaceFinish: ['glossy', 'matte', 'textured'][Math.floor(Math.random() * 3)] as any,
        rimStyle: ['straight', 'flared', 'rolled'][Math.floor(Math.random() * 3)] as any,
        pattern: ['none', 'stripes', 'floral'][Math.floor(Math.random() * 3)] as any,
        patternColor: '#' + Math.floor(Math.random()*16777215).toString(16),
        seed: Math.floor(Math.random() * 10000)
      });
    }

    for (let i = 0; i < count && i < configs.length; i++) {
      const config = baseConfig ? { ...configs[i], ...baseConfig } : configs[i];
      variations.push(this.generate(config));
    }
    
    return variations;
  }
}
