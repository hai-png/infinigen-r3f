/**
 * Fruits Generator
 * 
 * Procedural generation of various fruit types with realistic shapes, colors, and variations.
 * Supports apples, oranges, bananas, grapes, strawberries, and more.
 */

import * as THREE from 'three';
import { AssetFactory } from '../../placement/factory';
import { registerResource } from '../../util/ResourceRegistry';

export type FruitType = 
  | 'apple' | 'orange' | 'banana' | 'grape' | 'strawberry' 
  | 'lemon' | 'lime' | 'pear' | 'peach' | 'plum' | 'cherry' | 'watermelon';

export interface FruitParams {
  type?: FruitType;
  count?: number;
  scale?: number;
  scaleVariation?: number;
  ripeness?: number; // 0-1, affects color
  includeStem?: boolean;
  includeLeaves?: boolean;
  seed?: number;
}

interface FruitSpec {
  shape: 'sphere' | 'ellipsoid' | 'cylinder' | 'curved' | 'cluster' | 'cone' | 'heart';
  baseColor: THREE.Color;
  ripeColor: THREE.Color;
  sizeRange: [number, number];
  hasStem?: boolean;
  hasLeaves?: boolean;
  texture?: 'smooth' | 'dimpled' | 'rough' | 'bumpy';
}

const FRUIT_SPECS: Record<FruitType, FruitSpec> = {
  apple: {
    shape: 'heart',
    baseColor: new THREE.Color(0x88cc44),
    ripeColor: new THREE.Color(0xcc2222),
    sizeRange: [0.07, 0.09],
    hasStem: true,
    hasLeaves: true,
    texture: 'smooth'
  },
  orange: {
    shape: 'sphere',
    baseColor: new THREE.Color(0xffaa44),
    ripeColor: new THREE.Color(0xff8822),
    sizeRange: [0.07, 0.09],
    texture: 'dimpled'
  },
  banana: {
    shape: 'curved',
    baseColor: new THREE.Color(0xaacc44),
    ripeColor: new THREE.Color(0xffee44),
    sizeRange: [0.15, 0.20],
    texture: 'smooth'
  },
  grape: {
    shape: 'cluster',
    baseColor: new THREE.Color(0x66aa44),
    ripeColor: new THREE.Color(0x6622aa),
    sizeRange: [0.015, 0.02],
    texture: 'smooth'
  },
  strawberry: {
    shape: 'cone',
    baseColor: new THREE.Color(0xeeaaaa),
    ripeColor: new THREE.Color(0xdd2222),
    sizeRange: [0.025, 0.035],
    hasLeaves: true,
    texture: 'bumpy'
  },
  lemon: {
    shape: 'ellipsoid',
    baseColor: new THREE.Color(0xccdd44),
    ripeColor: new THREE.Color(0xffee44),
    sizeRange: [0.06, 0.08],
    texture: 'dimpled'
  },
  lime: {
    shape: 'ellipsoid',
    baseColor: new THREE.Color(0x88aa44),
    ripeColor: new THREE.Color(0x44cc44),
    sizeRange: [0.05, 0.07],
    texture: 'dimpled'
  },
  pear: {
    shape: 'ellipsoid',
    baseColor: new THREE.Color(0x99bb44),
    ripeColor: new THREE.Color(0xccaa44),
    sizeRange: [0.08, 0.10],
    hasStem: true,
    texture: 'smooth'
  },
  peach: {
    shape: 'sphere',
    baseColor: new THREE.Color(0xeebb88),
    ripeColor: new THREE.Color(0xff8866),
    sizeRange: [0.07, 0.09],
    texture: 'rough'
  },
  plum: {
    shape: 'sphere',
    baseColor: new THREE.Color(0x8866aa),
    ripeColor: new THREE.Color(0x663388),
    sizeRange: [0.05, 0.07],
    texture: 'smooth'
  },
  cherry: {
    shape: 'sphere',
    baseColor: new THREE.Color(0xaa4444),
    ripeColor: new THREE.Color(0x881111),
    sizeRange: [0.02, 0.025],
    hasStem: true,
    texture: 'smooth'
  },
  watermelon: {
    shape: 'ellipsoid',
    baseColor: new THREE.Color(0x44aa44),
    ripeColor: new THREE.Color(0x226622),
    sizeRange: [0.20, 0.30],
    texture: 'smooth'
  }
};

export class FruitsGenerator extends AssetFactory<FruitParams, THREE.Group> {
  private static instance: FruitsGenerator;

  private constructor() {
    super();
  }

  static getInstance(): FruitsGenerator {
    if (!FruitsGenerator.instance) {
      FruitsGenerator.instance = new FruitsGenerator();
    }
    return FruitsGenerator.instance;
  }

  generate(params: FruitParams = {}): THREE.Group {
    const {
      type = 'apple',
      count = 1,
      scale = 1,
      scaleVariation = 0.2,
      ripeness = 0.8,
      includeStem = true,
      includeLeaves = true,
      seed
    } = params;

    this.seedRandom(seed);
    
    const group = new THREE.Group();
    const spec = FRUIT_SPECS[type];

    for (let i = 0; i < count; i++) {
      const fruitScale = scale * (1 + this.random() * scaleVariation - scaleVariation / 2);
      const fruit = this.createFruit(type, spec, ripeness, fruitScale, includeStem, includeLeaves);
      
      // Random rotation
      fruit.rotation.set(
        this.random() * Math.PI * 2,
        this.random() * Math.PI * 2,
        this.random() * Math.PI * 2
      );
      
      group.add(fruit);
    }

    return group;
  }

  private createFruit(
    type: FruitType,
    spec: FruitSpec,
    ripeness: number,
    scale: number,
    includeStem: boolean,
    includeLeaves: boolean
  ): THREE.Group {
    const fruitGroup = new THREE.Group();
    
    // Create main fruit body
    const geometry = this.createFruitGeometry(spec.shape, type);
    const color = spec.baseColor.clone().lerp(spec.ripeColor, ripeness);
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: spec.texture === 'smooth' ? 0.3 : spec.texture === 'rough' ? 0.6 : 0.5,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Apply texture variation
    if (spec.texture === 'dimpled') {
      this.applyDimpledTexture(geometry);
    } else if (spec.texture === 'bumpy') {
      this.applyBumpyTexture(geometry);
    }

    // Scale based on fruit type
    const [minSize, maxSize] = spec.sizeRange;
    const size = minSize + this.random() * (maxSize - minSize);
    mesh.scale.setScalar(size * scale);
    
    fruitGroup.add(mesh);

    // Add stem if applicable
    if (includeStem && spec.hasStem) {
      const stem = this.createStem(type);
      stem.position.y = size * 0.4;
      fruitGroup.add(stem);
    }

    // Add leaves if applicable
    if (includeLeaves && spec.hasLeaves) {
      const leaves = this.createLeaves(type);
      if (spec.hasStem) {
        leaves.position.y = size * 0.45;
      } else {
        leaves.position.y = size * 0.3;
      }
      fruitGroup.add(leaves);
    }

    // Special handling for clusters (grapes)
    if (spec.shape === 'cluster') {
      return this.createGrapeCluster(spec, ripeness, scale);
    }

    return fruitGroup;
  }

  private createFruitGeometry(shape: string, type: FruitType): THREE.BufferGeometry {
    switch (shape) {
      case 'sphere':
        return new THREE.SphereGeometry(0.5, 32, 32);
      
      case 'ellipsoid':
        const ellipsoid = new THREE.SphereGeometry(0.5, 32, 32);
        ellipsoid.scale(1, 1.2, 1);
        return ellipsoid;
      
      case 'cylinder':
        return new THREE.CylinderGeometry(0.4, 0.4, 1, 32);
      
      case 'curved': // Banana
        return this.createCurvedGeometry();
      
      case 'cluster': // Grapes (single grape)
        return new THREE.SphereGeometry(0.5, 16, 16);
      
      case 'cone': // Strawberry
        const cone = new THREE.ConeGeometry(0.4, 0.6, 32);
        cone.translate(0, 0.1, 0);
        return cone;
      
      case 'heart': // Apple
        return this.createHeartGeometry();
      
      default:
        return new THREE.SphereGeometry(0.5, 32, 32);
    }
  }

  private createCurvedGeometry(): THREE.BufferGeometry {
    // Create curved banana shape
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 0.3, 0),
      new THREE.Vector3(0, 0.6, 0)
    );
    
    const geometry = new THREE.TubeGeometry(curve, 20, 0.08, 16, false);
    // Taper ends
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const taper = 1 - Math.pow((y - 0.3) / 0.3, 2) * 0.3;
      positions[i] *= taper;
      positions[i + 2] *= taper;
    }
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private createHeartGeometry(): THREE.BufferGeometry {
    // Create apple-like heart shape
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Indent top for heart shape
      if (y > 0.3) {
        positions[i + 1] -= Math.abs(x) * 0.3;
      }
      
      // Slight bottom point
      if (y < -0.4) {
        positions[i + 1] += Math.abs(x) * 0.2;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createStem(type: FruitType): THREE.Mesh {
    const height = type === 'cherry' ? 0.04 : 0.02;
    const radius = type === 'cherry' ? 0.005 : 0.008;
    
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.8, height, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x446622,
      roughness: 0.8
    });
    
    const stem = new THREE.Mesh(geometry, material);
    
    // Curve for cherries
    if (type === 'cherry') {
      stem.rotation.z = Math.PI * 0.15;
    }
    
    return stem;
  }

  private createLeaves(type: FruitType): THREE.Group {
    const leavesGroup = new THREE.Group();
    const leafCount = type === 'strawberry' ? 5 : type === 'cherry' ? 2 : 3;
    
    for (let i = 0; i < leafCount; i++) {
      const leaf = this.createLeaf();
      const angle = (i / leafCount) * Math.PI * 2;
      leaf.rotation.y = angle;
      leaf.rotation.x = Math.PI * 0.3;
      leaf.position.set(
        Math.cos(angle) * 0.02,
        0,
        Math.sin(angle) * 0.02
      );
      leavesGroup.add(leaf);
    }
    
    return leavesGroup;
  }

  private createLeaf(): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.03, 0.02, 0.06, 0);
    shape.quadraticCurveTo(0.03, -0.02, 0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({
      color: 0x44aa44,
      roughness: 0.6,
      side: THREE.DoubleSide
    });
    
    return new THREE.Mesh(geometry, material);
  }

  private createGrapeCluster(spec: FruitSpec, ripeness: number, scale: number): THREE.Group {
    const clusterGroup = new THREE.Group();
    const grapeCount = 15 + Math.floor(this.random() * 10);
    
    for (let i = 0; i < grapeCount; i++) {
      const geometry = new THREE.SphereGeometry(0.5, 16, 16);
      const color = spec.baseColor.clone().lerp(spec.ripeColor, ripeness);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.1
      });
      
      const grape = new THREE.Mesh(geometry, material);
      
      // Position in cluster pattern
      const layer = Math.floor(i / 5);
      const indexInLayer = i % 5;
      const angle = (indexInLayer / 5) * Math.PI * 2 + layer * 0.5;
      const radius = 0.03 * (1 - layer * 0.15);
      
      grape.position.set(
        Math.cos(angle) * radius,
        -layer * 0.025,
        Math.sin(angle) * radius
      );
      
      const grapeScale = 0.02 * scale;
      grape.scale.setScalar(grapeScale);
      
      clusterGroup.add(grape);
    }
    
    // Add stem
    const stemGeo = new THREE.CylinderGeometry(0.003, 0.002, 0.04, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x446622 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.02;
    clusterGroup.add(stem);
    
    return clusterGroup;
  }

  private applyDimpledTexture(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    
    // Add small dimples
    for (let i = 0; i < positions.length; i += 3) {
      if (this.random() < 0.1) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];
        const depth = 0.005 * this.random();
        
        positions[i] -= nx * depth;
        positions[i + 1] -= ny * depth;
        positions[i + 2] -= nz * depth;
      }
    }
    
    geometry.computeVertexNormals();
  }

  private applyBumpyTexture(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;
    
    // Add small bumps (seeds for strawberry)
    for (let i = 0; i < positions.length; i += 3) {
      if (this.random() < 0.15) {
        const nx = normals[i];
        const ny = normals[i + 1];
        const nz = normals[i + 2];
        const height = 0.003 * this.random();
        
        positions[i] += nx * height;
        positions[i + 1] += ny * height;
        positions[i + 2] += nz * height;
      }
    }
    
    geometry.computeVertexNormals();
  }

  generateBasket(basketParams: {
    fruits?: Array<{ type: FruitType; count: number }>;
    arrangement?: 'random' | 'organized';
    basketSize?: number;
    seed?: number;
  } = {}): THREE.Group {
    const {
      fruits = [{ type: 'apple', count: 3 }, { type: 'orange', count: 2 }],
      arrangement = 'random',
      basketSize = 0.3,
      seed
    } = basketParams;

    this.seedRandom(seed);
    
    const basketGroup = new THREE.Group();
    
    // Create simple basket
    const basketGeo = new THREE.CylinderGeometry(basketSize, basketSize * 0.8, basketSize * 0.4, 32, 1, true);
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0x886644,
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basketGroup.add(basket);

    // Add fruits
    fruits.forEach(({ type, count }) => {
      const fruitGen = this.generate({ type, count, scale: 0.8, seed: this.randomInt(0, 10000) });
      
      // Position in basket
      fruitGen.children.forEach((fruit, idx) => {
        if (arrangement === 'random') {
          const angle = this.random() * Math.PI * 2;
          const radius = this.random() * basketSize * 0.6;
          fruit.position.set(
            Math.cos(angle) * radius,
            basketSize * 0.2 + this.random() * 0.05,
            Math.sin(angle) * radius
          );
          fruit.rotation.set(
            this.random() * Math.PI,
            this.random() * Math.PI,
            this.random() * Math.PI
          );
        } else {
          // Organized circular arrangement
          const totalFruits = fruits.reduce((sum, f) => sum + f.count, 0);
          const angle = (idx / totalFruits) * Math.PI * 2;
          const radius = basketSize * 0.4;
          fruit.position.set(
            Math.cos(angle) * radius,
            basketSize * 0.2,
            Math.sin(angle) * radius
          );
        }
        
        basketGroup.add(fruit);
      });
    });

    return basketGroup;
  }
}

// Export singleton instance
export const fruitsGenerator = FruitsGenerator.getInstance();

// Register for resource system
registerResource('fruits', fruitsGenerator);
