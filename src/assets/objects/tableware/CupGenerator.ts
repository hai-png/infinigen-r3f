import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { FixedSeed } from '../../../../core/util/MathUtils';

export interface CupParams {
  type: 'mug' | 'teacup' | 'coffee' | 'espresso' | 'tumbler' | 'wine' | 'beer';
  capacity: number; // in ml
  material: 'ceramic' | 'glass' | 'metal' | 'plastic' | 'porcelain';
  hasHandle: boolean;
  handleStyle: 'classic' | 'modern' | 'ornate' | 'minimal';
  hasSaucer: boolean;
  color: string;
  transparent?: boolean;
}

export class CupGenerator extends BaseObjectGenerator<CupParams> {
  protected defaultParams: CupParams = {
    type: 'mug',
    capacity: 350,
    material: 'ceramic',
    hasHandle: true,
    handleStyle: 'classic',
    hasSaucer: false,
    color: '#ffffff',
    transparent: false,
  };

  generate(params: Partial<CupParams> = {}): THREE.Group {
    const finalParams = { ...this.defaultParams, ...params };
    this.validateParams(finalParams);
    
    const group = new THREE.Group();
    const seed = new FixedSeed(this.seed);
    
    // Set capacity based on type
    if (finalParams.type === 'mug') {
      finalParams.capacity = 350;
    } else if (finalParams.type === 'teacup') {
      finalParams.capacity = 200;
    } else if (finalParams.type === 'coffee') {
      finalParams.capacity = 250;
    } else if (finalParams.type === 'espresso') {
      finalParams.capacity = 60;
    } else if (finalParams.type === 'tumbler') {
      finalParams.capacity = 300;
      finalParams.hasHandle = false;
    } else if (finalParams.type === 'wine') {
      finalParams.capacity = 350;
      finalParams.hasHandle = false;
    } else if (finalParams.type === 'beer') {
      finalParams.capacity = 500;
      finalParams.hasHandle = finalParams.material !== 'glass';
    }
    
    // Calculate dimensions from capacity
    const radius = Math.pow((finalParams.capacity * 3) / (Math.PI * 4), 1/3) * 0.01;
    const height = radius * 1.5;
    
    // Generate cup body
    this.createCupBody(group, finalParams, radius, height, seed);
    
    // Add handle if requested
    if (finalParams.hasHandle && !['wine', 'tumbler'].includes(finalParams.type)) {
      this.addHandle(group, finalParams, radius, height, seed);
    }
    
    // Add saucer if requested
    if (finalParams.hasSaucer && ['teacup', 'coffee', 'espresso'].includes(finalParams.type)) {
      this.addSaucer(group, finalParams, radius, seed);
    }
    
    return group;
  }

  private createCupBody(group: THREE.Group, params: CupParams, radius: number, height: number, seed: FixedSeed): void {
    const material = this.getMaterial(params);
    
    if (params.type === 'wine') {
      this.createWineGlass(group, params, material, radius, height);
    } else if (params.type === 'beer' && params.material === 'glass') {
      this.createBeerMug(group, params, material, radius, height);
    } else {
      this.createStandardCup(group, params, material, radius, height);
    }
  }

  private createStandardCup(group: THREE.Group, params: CupParams, material: THREE.Material, radius: number, height: number): void {
    // Cup body (hollow cylinder)
    const cupShape = new THREE.Shape();
    cupShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    cupShape.absarc(0, 0, radius * 0.85, 0, Math.PI * 2, true);
    
    const cupGeo = new THREE.ExtrudeGeometry(cupShape, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const cup = new THREE.Mesh(cupGeo, material);
    cup.position.z = height / 2;
    group.add(cup);
    
    // Cup bottom
    const bottomGeo = new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.005, 32);
    const bottom = new THREE.Mesh(bottomGeo, material);
    bottom.position.z = 0.0025;
    group.add(bottom);
  }

  private createWineGlass(group: THREE.Group, params: CupParams, material: THREE.Material, radius: number, height: number): void {
    // Bowl
    const bowlGeo = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
    const bowl = new THREE.Mesh(bowlGeo, material);
    bowl.position.z = height * 0.7;
    group.add(bowl);
    
    // Stem
    const stemGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.2, height * 0.5, 16);
    const stem = new THREE.Mesh(stemGeo, material);
    stem.position.z = height * 0.35;
    group.add(stem);
    
    // Base
    const baseGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.65, 0.01, 32);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.z = 0.005;
    group.add(base);
  }

  private createBeerMug(group: THREE.Group, params: CupParams, material: THREE.Material, radius: number, height: number): void {
    // Mug body (thicker walls)
    const mugShape = new THREE.Shape();
    mugShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    mugShape.absarc(0, 0, radius * 0.8, 0, Math.PI * 2, true);
    
    const mugGeo = new THREE.ExtrudeGeometry(mugShape, {
      depth: height,
      bevelEnabled: false,
    });
    
    const mug = new THREE.Mesh(mugGeo, material);
    mug.position.z = height / 2;
    group.add(mug);
    
    // Handle attachment points (thickened areas)
    const thickGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, height * 0.4, 32);
    const thick = new THREE.Mesh(thickGeo, material);
    thick.position.set(radius, height * 0.5, 0);
    group.add(thick);
  }

  private addHandle(group: THREE.Group, params: CupParams, radius: number, height: number, seed: FixedSeed): void {
    const material = this.getMaterial(params);
    const handleCenterY = height * 0.5;
    const handleOffset = radius * 0.3;
    
    let handleGeo: THREE.BufferGeometry;
    
    if (params.handleStyle === 'classic') {
      // Classic C-shaped handle
      const handleShape = new THREE.Shape();
      handleShape.absarc(0, 0, radius * 0.6, -Math.PI * 0.3, Math.PI * 1.3, false);
      handleShape.absarc(0, 0, radius * 0.4, Math.PI * 1.3, -Math.PI * 0.3, true);
      
      handleGeo = new THREE.ExtrudeGeometry(handleShape, {
        depth: radius * 0.3,
        bevelEnabled: false,
      });
      
      const handle = new THREE.Mesh(handleGeo, material);
      handle.position.set(radius, handleCenterY, 0);
      handle.rotation.z = Math.PI / 2;
      group.add(handle);
      
    } else if (params.handleStyle === 'modern') {
      // Modern angular handle
      const points: THREE.Vector3[] = [];
      points.push(new THREE.Vector3(radius, height * 0.3, 0));
      points.push(new THREE.Vector3(radius + radius * 0.8, height * 0.3, 0));
      points.push(new THREE.Vector3(radius + radius * 0.8, height * 0.7, 0));
      points.push(new THREE.Vector3(radius, height * 0.7, 0));
      
      handleGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, radius * 0.1, 8, false);
      const handle = new THREE.Mesh(handleGeo, material);
      group.add(handle);
      
    } else if (params.handleStyle === 'ornate') {
      // Ornate decorative handle
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(radius, height * 0.3, 0),
        new THREE.Vector3(radius + radius * 1.2, height * 0.5, 0),
        new THREE.Vector3(radius, height * 0.7, 0)
      );
      
      handleGeo = new THREE.TubeGeometry(curve, 30, radius * 0.12, 12, false);
      const handle = new THREE.Mesh(handleGeo, material);
      group.add(handle);
      
      // Add decorative element
      const decorGeo = new THREE.SphereGeometry(radius * 0.15, 16, 16);
      const decor = new THREE.Mesh(decorGeo, material);
      decor.position.set(radius + radius * 0.9, height * 0.5, 0);
      group.add(decor);
      
    } else {
      // Minimal thin handle
      handleGeo = new THREE.TorusGeometry(radius * 0.5, radius * 0.05, 8, 24, Math.PI);
      const handle = new THREE.Mesh(handleGeo, material);
      handle.position.set(radius + radius * 0.3, handleCenterY, 0);
      handle.rotation.y = Math.PI / 2;
      group.add(handle);
    }
  }

  private addSaucer(group: THREE.Group, params: CupParams, radius: number, seed: FixedSeed): void {
    const material = this.getMaterial(params);
    const saucerRadius = radius * 2.5;
    const saucerDepth = 0.015;
    
    // Saucer plate
    const saucerShape = new THREE.Shape();
    saucerShape.absarc(0, 0, saucerRadius, 0, Math.PI * 2, false);
    saucerShape.absarc(0, 0, saucerRadius * 0.9, 0, Math.PI * 2, true);
    
    const saucerGeo = new THREE.ExtrudeGeometry(saucerShape, {
      depth: saucerDepth,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const saucer = new THREE.Mesh(saucerGeo, material);
    saucer.position.z = -saucerDepth;
    group.add(saucer);
    
    // Small depression for cup
    const depressionGeo = new THREE.CylinderGeometry(radius * 1.1, radius * 1.05, 0.005, 32);
    const depression = new THREE.Mesh(depressionGeo, material);
    depression.position.z = saucerDepth * 0.5;
    group.add(depression);
  }

  private getMaterial(params: CupParams): THREE.Material {
    const color = new THREE.Color(params.color);
    
    if (params.material === 'glass' || params.transparent) {
      return new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.1,
        transmission: 0.95,
        transparent: true,
      });
    } else if (params.material === 'metal') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.9,
        roughness: 0.2,
      });
    } else if (params.material === 'plastic') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.6,
      });
    } else if (params.material === 'porcelain') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.3,
      });
    } else {
      // Ceramic
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.4,
      });
    }
  }

  protected validateParams(params: CupParams): void {
    if (params.capacity < 30 || params.capacity > 1000) {
      throw new Error('Cup capacity must be between 30 and 1000 ml');
    }
  }
}
