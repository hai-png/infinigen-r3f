import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export interface PlateParams {
  type: 'dinner' | 'salad' | 'dessert' | 'soup' | 'appetizer';
  shape: 'round' | 'square' | 'oval' | 'rectangular';
  diameter: number;
  rimWidth: number;
  depth: number;
  material: 'ceramic' | 'porcelain' | 'stoneware' | 'glass' | 'melamine';
  pattern: 'plain' | 'rim' | 'floral' | 'geometric' | 'striped';
  color: string;
  rimColor?: string;
}

export class PlateGenerator extends BaseObjectGenerator<PlateParams> {
  protected defaultParams: PlateParams = {
    type: 'dinner',
    shape: 'round',
    diameter: 0.27,
    rimWidth: 0.025,
    depth: 0.03,
    material: 'ceramic',
    pattern: 'plain',
    color: '#ffffff',
    rimColor: undefined,
  };

  generate(params: Partial<PlateParams> = {}): THREE.Group {
    const finalParams = { ...this.defaultParams, ...params };
    this.validateParams(finalParams);
    
    const group = new THREE.Group();
    const seed = new SeededRandom(this.seed);
    
    // Set dimensions based on type
    if (finalParams.type === 'dinner') {
      finalParams.diameter = 0.27;
      finalParams.depth = 0.03;
    } else if (finalParams.type === 'salad') {
      finalParams.diameter = 0.22;
      finalParams.depth = 0.025;
    } else if (finalParams.type === 'dessert') {
      finalParams.diameter = 0.18;
      finalParams.depth = 0.02;
    } else if (finalParams.type === 'soup') {
      finalParams.diameter = 0.23;
      finalParams.depth = 0.05;
    } else if (finalParams.type === 'appetizer') {
      finalParams.diameter = 0.15;
      finalParams.depth = 0.015;
    }
    
    // Generate plate based on shape
    switch (finalParams.shape) {
      case 'round':
        this.createRoundPlate(group, finalParams, seed);
        break;
      case 'square':
        this.createSquarePlate(group, finalParams, seed);
        break;
      case 'oval':
        this.createOvalPlate(group, finalParams, seed);
        break;
      case 'rectangular':
        this.createRectangularPlate(group, finalParams, seed);
        break;
    }
    
    return group;
  }

  private createRoundPlate(group: THREE.Group, params: PlateParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const rimMaterial = params.rimColor ? this.getRimMaterial(params) : material;
    
    // Main plate body (concave center)
    const bodyShape = new THREE.Shape();
    bodyShape.absarc(0, 0, params.diameter / 2 - params.rimWidth, 0, Math.PI * 2, false);
    
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: params.depth,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.z = -params.depth / 2;
    group.add(body);
    
    // Rim
    const rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, params.diameter / 2, 0, Math.PI * 2, false);
    rimShape.absarc(0, 0, params.diameter / 2 - params.rimWidth, 0, Math.PI * 2, true);
    
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: params.depth * 0.5,
      bevelEnabled: false,
    });
    
    const rim = new THREE.Mesh(rimGeo, rimMaterial);
    rim.position.z = 0;
    group.add(rim);
    
    // Add pattern if requested
    if (params.pattern !== 'plain') {
      this.addPattern(group, params, seed);
    }
  }

  private createSquarePlate(group: THREE.Group, params: PlateParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const size = params.diameter;
    const cornerRadius = size * 0.1;
    
    // Square plate with rounded corners
    const bodyShape = new THREE.Shape();
    const halfSize = size / 2 - params.rimWidth;
    
    bodyShape.moveTo(-halfSize + cornerRadius, -halfSize);
    bodyShape.lineTo(halfSize - cornerRadius, -halfSize);
    bodyShape.quadraticCurveTo(halfSize, -halfSize, halfSize, -halfSize + cornerRadius);
    bodyShape.lineTo(halfSize, halfSize - cornerRadius);
    bodyShape.quadraticCurveTo(halfSize, halfSize, halfSize - cornerRadius, halfSize);
    bodyShape.lineTo(-halfSize + cornerRadius, halfSize);
    bodyShape.quadraticCurveTo(-halfSize, halfSize, -halfSize, halfSize - cornerRadius);
    bodyShape.lineTo(-halfSize, -halfSize + cornerRadius);
    bodyShape.quadraticCurveTo(-halfSize, -halfSize, -halfSize + cornerRadius, -halfSize);
    bodyShape.closePath();
    
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: params.depth,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.z = -params.depth / 2;
    group.add(body);
    
    // Square rim
    const rimShape = new THREE.Shape();
    const outerHalf = size / 2;
    const innerHalf = size / 2 - params.rimWidth;
    
    rimShape.moveTo(-outerHalf + cornerRadius, -outerHalf);
    rimShape.lineTo(outerHalf - cornerRadius, -outerHalf);
    rimShape.quadraticCurveTo(outerHalf, -outerHalf, outerHalf, -outerHalf + cornerRadius);
    rimShape.lineTo(outerHalf, outerHalf - cornerRadius);
    rimShape.quadraticCurveTo(outerHalf, outerHalf, outerHalf - cornerRadius, outerHalf);
    rimShape.lineTo(-outerHalf + cornerRadius, outerHalf);
    rimShape.quadraticCurveTo(-outerHalf, outerHalf, -outerHalf, outerHalf - cornerRadius);
    rimShape.lineTo(-outerHalf, -outerHalf + cornerRadius);
    rimShape.quadraticCurveTo(-outerHalf, -outerHalf, -outerHalf + cornerRadius, -outerHalf);
    rimShape.closePath();
    
    // Inner cutout
    rimShape.moveTo(-innerHalf + cornerRadius, -innerHalf);
    rimShape.lineTo(innerHalf - cornerRadius, -innerHalf);
    rimShape.quadraticCurveTo(innerHalf, -innerHalf, innerHalf, -innerHalf + cornerRadius);
    rimShape.lineTo(innerHalf, innerHalf - cornerRadius);
    rimShape.quadraticCurveTo(innerHalf, innerHalf, innerHalf - cornerRadius, innerHalf);
    rimShape.lineTo(-innerHalf + cornerRadius, innerHalf);
    rimShape.quadraticCurveTo(-innerHalf, innerHalf, -innerHalf, innerHalf - cornerRadius);
    rimShape.lineTo(-innerHalf, -innerHalf + cornerRadius);
    rimShape.quadraticCurveTo(-innerHalf, -innerHalf, -innerHalf + cornerRadius, -innerHalf);
    rimShape.closePath();
    
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: params.depth * 0.5,
      bevelEnabled: false,
    });
    
    const rim = new THREE.Mesh(rimGeo, rimMaterial);
    rim.position.z = 0;
    group.add(rim);
  }

  private createOvalPlate(group: THREE.Group, params: PlateParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const majorAxis = params.diameter;
    const minorAxis = params.diameter * 0.7;
    
    // Oval plate
    const bodyShape = new THREE.Shape();
    bodyShape.ellipse(0, 0, majorAxis / 2 - params.rimWidth, minorAxis / 2 - params.rimWidth, 0, 0, Math.PI * 2, false);
    
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: params.depth,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.z = -params.depth / 2;
    group.add(body);
    
    // Oval rim
    const rimShape = new THREE.Shape();
    rimShape.ellipse(0, 0, majorAxis / 2, minorAxis / 2, 0, 0, Math.PI * 2, false);
    rimShape.ellipse(0, 0, majorAxis / 2 - params.rimWidth, minorAxis / 2 - params.rimWidth, 0, 0, Math.PI * 2, true);
    
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: params.depth * 0.5,
      bevelEnabled: false,
    });
    
    const rim = new THREE.Mesh(rimGeo, rimMaterial);
    rim.position.z = 0;
    group.add(rim);
  }

  private createRectangularPlate(group: THREE.Group, params: PlateParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const width = params.diameter;
    const height = params.diameter * 0.6;
    
    // Rectangular plate
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-width / 2 + params.rimWidth, -height / 2 + params.rimWidth);
    bodyShape.lineTo(width / 2 - params.rimWidth, -height / 2 + params.rimWidth);
    bodyShape.lineTo(width / 2 - params.rimWidth, height / 2 - params.rimWidth);
    bodyShape.lineTo(-width / 2 + params.rimWidth, height / 2 - params.rimWidth);
    bodyShape.closePath();
    
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: params.depth,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    
    const body = new THREE.Mesh(bodyGeo, material);
    body.position.z = -params.depth / 2;
    group.add(body);
  }

  private addPattern(group: THREE.Group, params: PlateParams, seed: SeededRandom): void {
    const patternMaterial = new THREE.MeshStandardMaterial({
      color: params.rimColor || '#cccccc',
      metalness: 0.1,
      roughness: 0.5,
    });
    
    if (params.pattern === 'rim') {
      // Simple colored rim band
      const rimBandShape = new THREE.Shape();
      rimBandShape.absarc(0, 0, params.diameter / 2 - params.rimWidth * 0.5, 0, Math.PI * 2, false);
      rimBandShape.absarc(0, 0, params.diameter / 2 - params.rimWidth * 1.5, 0, Math.PI * 2, true);
      
      const rimBandGeo = new THREE.ExtrudeGeometry(rimBandShape, {
        depth: 0.001,
        bevelEnabled: false,
      });
      
      const rimBand = new THREE.Mesh(rimBandGeo, patternMaterial);
      rimBand.position.z = params.depth * 0.25 + 0.001;
      group.add(rimBand);
    } else if (params.pattern === 'geometric') {
      // Geometric pattern in center
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const lineGeo = new THREE.CylinderGeometry(0.001, 0.001, params.diameter * 0.3, 8);
        const line = new THREE.Mesh(lineGeo, patternMaterial);
        line.position.set(Math.cos(angle) * params.diameter * 0.15, Math.sin(angle) * params.diameter * 0.15, params.depth * 0.25 + 0.001);
        line.rotation.z = angle;
        group.add(line);
      }
    } else if (params.pattern === 'striped') {
      // Concentric stripes
      for (let r = params.diameter * 0.1; r < params.diameter / 2 - params.rimWidth; r += params.diameter * 0.05) {
        const stripeShape = new THREE.Shape();
        stripeShape.absarc(0, 0, r, 0, Math.PI * 2, false);
        stripeShape.absarc(0, 0, r - 0.005, 0, Math.PI * 2, true);
        
        const stripeGeo = new THREE.ExtrudeGeometry(stripeShape, {
          depth: 0.001,
          bevelEnabled: false,
        });
        
        const stripe = new THREE.Mesh(stripeGeo, patternMaterial);
        stripe.position.z = params.depth * 0.25 + 0.001;
        group.add(stripe);
      }
    }
  }

  private getMaterial(params: PlateParams): THREE.Material {
    const color = new THREE.Color(params.color);
    
    if (params.material === 'glass') {
      return new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.1,
        transmission: 0.9,
        transparent: true,
      });
    } else if (params.material === 'porcelain') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.3,
      });
    } else if (params.material === 'stoneware') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.6,
      });
    } else if (params.material === 'melamine') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.7,
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

  private getRimMaterial(params: PlateParams): THREE.Material {
    const color = new THREE.Color(params.rimColor || '#cccccc');
    
    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.0,
      roughness: 0.4,
    });
  }

  protected validateParams(params: PlateParams): void {
    if (params.diameter < 0.1 || params.diameter > 0.35) {
      throw new Error('Plate diameter must be between 0.1 and 0.35 meters');
    }
    if (params.depth < 0.01 || params.depth > 0.08) {
      throw new Error('Plate depth must be between 0.01 and 0.08 meters');
    }
  }
}
