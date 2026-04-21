/**
 * Ground Debris Scatter Generator
 * 
 * Generates natural ground debris including:
 * - Leaves (various types and decay states)
 * - Twigs and small branches
 * - Pine needles
 * - Small stones and pebbles
 * - Organic matter
 * 
 * @module GroundDebrisScatter
 */

import * as THREE from 'three';
import { ScatterGenerator, ScatterOptions, ScatterInstance } from '../../terrain/scatter/ScatterGenerator';
import { TerrainSurface } from '../../terrain/TerrainSurface';
import { DensityVolume } from '../../placement/DensityVolume';

/**
 * Configuration for ground debris scatter
 */
export interface GroundDebrisOptions extends ScatterOptions {
  /** Density of debris per square meter (default: 2.0) */
  density?: number;
  
  /** Mix of leaf types: 'deciduous', 'coniferous', 'mixed' (default: 'mixed') */
  leafType?: 'deciduous' | 'coniferous' | 'mixed';
  
  /** Decay state: 'fresh', 'drying', 'decayed', 'mixed' (default: 'mixed') */
  decayState?: 'fresh' | 'drying' | 'decayed' | 'mixed';
  
  /** Include twigs and small branches (default: true) */
  includeTwigs?: boolean;
  
  /** Include pine needles (default: false) */
  includePineNeedles?: boolean;
  
  /** Include small stones/pebbles (default: true) */
  includeStones?: boolean;
  
  /** Size variation multiplier (default: 0.3) */
  sizeVariation?: number;
  
  /** Rotation randomness in radians (default: Math.PI) */
  rotationRandomness?: number;
  
  /** Cluster tendency 0-1 (default: 0.4) */
  clusterFactor?: number;
  
  /** Minimum distance between instances (default: 0.05) */
  minSpacing?: number;
}

/**
 * Leaf geometry types
 */
type LeafShape = 'oval' | 'lanceolate' | 'cordate' | 'palmate' | 'needle';

/**
 * Ground debris instance data
 */
interface DebrisInstance extends ScatterInstance {
  shape: LeafShape;
  decayLevel: number;
  colorVariation: THREE.Color;
}

/**
 * Ground Debris Scatter Generator
 * 
 * Creates realistic ground cover from natural debris materials.
 * Optimized for forest floors, garden beds, and natural landscapes.
 */
export class GroundDebrisScatter extends ScatterGenerator<GroundDebrisOptions> {
  private leafGeometries: Map<LeafShape, THREE.BufferGeometry>;
  private twigGeometries: THREE.BufferGeometry[];
  private stoneGeometries: THREE.BufferGeometry[];
  private needleGeometry: THREE.BufferGeometry;
  
  constructor(options: GroundDebrisOptions = {}) {
    super(options);
    
    this.leafGeometries = new Map();
    this.twigGeometries = [];
    this.stoneGeometries = [];
    this.needleGeometry = new THREE.BufferGeometry();
    
    this.initializeGeometries();
  }
  
  /**
   * Initialize procedural geometries for debris types
   */
  private initializeGeometries(): void {
    // Generate leaf geometries
    const shapes: LeafShape[] = ['oval', 'lanceolate', 'cordate', 'palmate'];
    shapes.forEach(shape => {
      this.leafGeometries.set(shape, this.createLeafGeometry(shape));
    });
    
    // Generate twig geometries
    for (let i = 0; i < 5; i++) {
      this.twigGeometries.push(this.createTwigGeometry(i));
    }
    
    // Generate stone geometries
    for (let i = 0; i < 4; i++) {
      this.stoneGeometries.push(this.createStoneGeometry(i));
    }
    
    // Generate pine needle geometry
    this.needleGeometry = this.createPineNeedleGeometry();
  }
  
  /**
   * Create procedural leaf geometry based on shape type
   */
  private createLeafGeometry(shape: LeafShape): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    let vertices: number[] = [];
    const uv: number[] = [];
    
    switch (shape) {
      case 'oval':
        // Oval leaf (like oak or beech)
        vertices = this.generateOvalLeaf();
        break;
      case 'lanceolate':
        // Lance-shaped leaf (like willow)
        vertices = this.generateLanceolateLeaf();
        break;
      case 'cordate':
        // Heart-shaped leaf (like linden)
        vertices = this.generateCordateLeaf();
        break;
      case 'palmate':
        // Palmate leaf (like maple)
        vertices = this.generatePalmateLeaf();
        break;
      case 'needle':
        // Pine needle
        vertices = this.generatePineNeedle();
        break;
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Generate oval leaf vertices
   */
  private generateOvalLeaf(): number[] {
    const segments = 8;
    const width = 0.03;
    const length = 0.06;
    const vertices: number[] = [];
    
    // Center vertex
    vertices.push(0, 0, 0);
    
    // Outer ring
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      
      // Elliptical shape with pointed ends
      const x = Math.cos(angle) * width * (1 + 0.3 * Math.sin(angle * 2));
      const y = Math.sin(angle) * length;
      const z = 0.001 * Math.sin(angle * 3); // Slight curvature
      
      vertices.push(x, y, z);
    }
    
    // Generate triangles from center
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      indices.push(0, i + 1, ((i + 1) % segments) + 1);
    }
    
    return vertices;
  }
  
  /**
   * Generate lanceolate leaf vertices
   */
  private generateLanceolateLeaf(): number[] {
    const segments = 6;
    const width = 0.015;
    const length = 0.08;
    const vertices: number[] = [];
    
    // Center line
    vertices.push(0, 0, 0);
    vertices.push(0, length * 0.5, 0);
    vertices.push(0, -length * 0.5, 0);
    
    // Side points
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const y = (t - 0.5) * length;
      const taper = Math.sin(t * Math.PI);
      const x = width * taper;
      const z = 0.001 * taper * Math.sin(t * Math.PI * 2);
      
      vertices.push(x, y, z);
      vertices.push(-x, y, z);
    }
    
    return vertices;
  }
  
  /**
   * Generate cordate (heart-shaped) leaf vertices
   */
  private generateCordateLeaf(): number[] {
    const segments = 10;
    const size = 0.05;
    const vertices: number[] = [];
    
    // Center
    vertices.push(0, 0, 0);
    
    // Heart shape using parametric equation
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      
      // Heart curve parametric equations
      const x = size * 0.6 * Math.sin(t);
      const y = size * (Math.cos(t) - 0.5 * Math.cos(2 * t) - 0.3);
      const z = 0.002 * Math.sin(t * 3);
      
      vertices.push(x, y, z);
    }
    
    return vertices;
  }
  
  /**
   * Generate palmate (maple-like) leaf vertices
   */
  private generatePalmateLeaf(): number[] {
    const lobes = 5;
    const size = 0.06;
    const vertices: number[] = [];
    
    // Center
    vertices.push(0, 0, 0);
    
    // Generate points for each lobe
    for (let lobe = 0; lobe < lobes; lobe++) {
      const baseAngle = (lobe / lobes) * Math.PI * 2 - Math.PI / 2;
      const pointsPerLobe = 4;
      
      for (let p = 0; p < pointsPerLobe; p++) {
        const t = p / pointsPerLobe;
        const angle = baseAngle + (t - 0.5) * 0.6;
        
        // Lobe extends outward with tapering
        const dist = size * (0.3 + 0.7 * Math.cos((t - 0.5) * Math.PI));
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const z = 0.002 * Math.sin(t * Math.PI) * Math.cos(lobe);
        
        vertices.push(x, y, z);
      }
    }
    
    return vertices;
  }
  
  /**
   * Generate single pine needle
   */
  private generatePineNeedle(): number[] {
    const length = 0.04;
    const radius = 0.002;
    const vertices: number[] = [];
    
    // Simple quad for needle
    vertices.push(-radius, -length, 0);
    vertices.push(radius, -length, 0);
    vertices.push(radius, length, 0);
    vertices.push(-radius, length, 0);
    
    return vertices;
  }
  
  /**
   * Create twig geometry
   */
  private createTwigGeometry(variant: number): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      0.002 + variant * 0.001,
      0.001 + variant * 0.0005,
      0.05 + variant * 0.02,
      6
    );
    
    // Add some bending
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const bend = Math.sin(y * 2) * 0.01 * variant;
      positions[i] += bend;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Create small stone/pebble geometry
   */
  private createStoneGeometry(variant: number): THREE.BufferGeometry {
    const geometry = new THREE.DodecahedronGeometry(
      0.01 + variant * 0.005,
      0
    );
    
    // Add irregularity
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const noise = (Math.random() - 0.5) * 0.3;
      positions[i] *= (1 + noise);
      positions[i + 1] *= (1 + noise);
      positions[i + 2] *= (1 + noise);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Create pine needle cluster geometry
   */
  private createPineNeedleGeometry(): THREE.BufferGeometry {
    const group = new THREE.BufferGeometry();
    const needles: THREE.BufferGeometry[] = [];
    
    // Create cluster of 3-5 needles
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const needle = this.generatePineNeedleGeometry();
      needle.translate(
        (Math.random() - 0.5) * 0.005,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.005
      );
      needle.rotateZ((Math.random() - 0.5) * 0.3);
      needles.push(needle);
    }
    
    // Merge geometries
    return THREE.BufferGeometryUtils ? 
      THREE.BufferGeometryUtils.mergeBufferGeometries(needles) : 
      needles[0];
  }
  
  /**
   * Get debris color based on decay state and type
   */
  private getDebrisColor(
    decayState: GroundDebrisOptions['decayState'],
    leafType: GroundDebrisOptions['leafType']
  ): THREE.Color {
    const colors: Record<string, THREE.Color[]> = {
      fresh: [
        new THREE.Color(0x2d5a27), // Dark green
        new THREE.Color(0x3d7a37), // Medium green
        new THREE.Color(0x4a8a47), // Light green
      ],
      drying: [
        new THREE.Color(0x5a7a27), // Yellow-green
        new THREE.Color(0x7a8a37), // Yellow
        new THREE.Color(0x8a7a47), // Brown-yellow
      ],
      decayed: [
        new THREE.Color(0x5a4a27), // Brown
        new THREE.Color(0x4a3a17), // Dark brown
        new THREE.Color(0x3a2a07), // Very dark brown
      ],
    };
    
    let palette: THREE.Color[];
    if (decayState === 'mixed') {
      const keys = Object.keys(colors) as Array<keyof typeof colors>;
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      palette = colors[randomKey];
    } else {
      palette = colors[decayState] || colors.fresh;
    }
    
    return palette[Math.floor(Math.random() * palette.length)].clone();
  }
  
  /**
   * Generate scatter instances
   */
  async generate(
    surface: TerrainSurface,
    options: GroundDebrisOptions = {}
  ): Promise<ScatterInstance[]> {
    const config: Required<GroundDebrisOptions> = {
      density: 2.0,
      leafType: 'mixed',
      decayState: 'mixed',
      includeTwigs: true,
      includePineNeedles: false,
      includeStones: true,
      sizeVariation: 0.3,
      rotationRandomness: Math.PI,
      clusterFactor: 0.4,
      minSpacing: 0.05,
      ...options,
    };
    
    const instances: DebrisInstance[] = [];
    const area = surface.getArea();
    const targetCount = Math.floor(area * config.density);
    
    // Get sampling points from surface
    const points = surface.samplePoints(targetCount, config.minSpacing);
    
    for (const point of points) {
      const position = new THREE.Vector3(point.x, point.y, point.z);
      const normal = surface.getNormal(point.x, point.z);
      
      // Determine debris type at this position
      const rand = Math.random();
      let debrisType: 'leaf' | 'twig' | 'stone' | 'needle';
      
      if (config.includePineNeedles && config.leafType === 'coniferous') {
        debrisType = rand < 0.7 ? 'needle' : rand < 0.85 ? 'twig' : 'stone';
      } else {
        if (rand < 0.6) {
          debrisType = 'leaf';
        } else if (config.includeTwigs && rand < 0.8) {
          debrisType = 'twig';
        } else if (config.includeStones && rand < 0.9) {
          debrisType = 'stone';
        } else {
          debrisType = 'leaf';
        }
      }
      
      // Create instance based on type
      let instance: DebrisInstance;
      
      switch (debrisType) {
        case 'leaf':
          instance = this.createLeafInstance(position, normal, config);
          break;
        case 'twig':
          instance = this.createTwigInstance(position, normal, config);
          break;
        case 'stone':
          instance = this.createStoneInstance(position, normal, config);
          break;
        case 'needle':
          instance = this.createNeedleInstance(position, normal, config);
          break;
      }
      
      instances.push(instance);
    }
    
    // Apply clustering if enabled
    if (config.clusterFactor > 0) {
      this.applyClustering(instances, config.clusterFactor);
    }
    
    return instances;
  }
  
  /**
   * Create leaf instance
   */
  private createLeafInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    config: Required<GroundDebrisOptions>
  ): DebrisInstance {
    const shapes = Object.keys(this.leafGeometries) as LeafShape[];
    const shape = config.leafType === 'mixed' 
      ? shapes[Math.floor(Math.random() * shapes.length)]
      : (config.leafType === 'coniferous' ? 'needle' : shapes[0]);
    
    const geometry = this.leafGeometries.get(shape) || this.leafGeometries.get('oval')!;
    const color = this.getDebrisColor(config.decayState, config.leafType);
    
    const scale = 1 + (Math.random() - 0.5) * config.sizeVariation;
    const rotationY = Math.random() * config.rotationRandomness;
    
    return {
      position: position.clone(),
      rotation: new THREE.Euler(
        -normal.x * 0.2,
        rotationY,
        -normal.z * 0.2
      ),
      scale: new THREE.Vector3(scale, scale, scale),
      geometry: geometry,
      material: this.createDebrisMaterial(color),
      metadata: {
        shape,
        decayLevel: config.decayState === 'decayed' ? 1 : config.decayState === 'drying' ? 0.5 : 0,
        colorVariation: color,
      },
    };
  }
  
  /**
   * Create twig instance
   */
  private createTwigInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    config: Required<GroundDebrisOptions>
  ): DebrisInstance {
    const geometry = this.twigGeometries[Math.floor(Math.random() * this.twigGeometries.length)];
    const color = new THREE.Color(0x4a3a27); // Brown
    
    const scale = 1 + (Math.random() - 0.5) * config.sizeVariation;
    const rotationY = Math.random() * config.rotationRandomness;
    
    return {
      position: position.clone(),
      rotation: new THREE.Euler(
        -normal.x * 0.3,
        rotationY,
        -normal.z * 0.3
      ),
      scale: new THREE.Vector3(scale, scale, scale),
      geometry: geometry,
      material: this.createDebrisMaterial(color),
      metadata: {
        shape: 'lanceolate' as LeafShape,
        decayLevel: 0.3,
        colorVariation: color,
      },
    };
  }
  
  /**
   * Create stone instance
   */
  private createStoneInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    config: Required<GroundDebrisOptions>
  ): DebrisInstance {
    const geometry = this.stoneGeometries[Math.floor(Math.random() * this.stoneGeometries.length)];
    const grayValue = 0.3 + Math.random() * 0.4;
    const color = new THREE.Color(grayValue, grayValue, grayValue * 0.95);
    
    const scale = 0.5 + Math.random() * 1.0;
    const rotationY = Math.random() * config.rotationRandomness;
    
    return {
      position: position.clone(),
      rotation: new THREE.Euler(
        -normal.x * 0.1,
        rotationY,
        -normal.z * 0.1
      ),
      scale: new THREE.Vector3(scale, scale, scale),
      geometry: geometry,
      material: this.createDebrisMaterial(color, 0.8),
      metadata: {
        shape: 'oval' as LeafShape,
        decayLevel: 0,
        colorVariation: color,
      },
    };
  }
  
  /**
   * Create pine needle cluster instance
   */
  private createNeedleInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    config: Required<GroundDebrisOptions>
  ): DebrisInstance {
    const geometry = this.needleGeometry;
    const color = this.getDebrisColor(config.decayState, 'coniferous');
    
    const scale = 1 + (Math.random() - 0.5) * config.sizeVariation;
    const rotationY = Math.random() * config.rotationRandomness;
    
    return {
      position: position.clone(),
      rotation: new THREE.Euler(
        -normal.x * 0.2,
        rotationY,
        -normal.z * 0.2
      ),
      scale: new THREE.Vector3(scale, scale, scale),
      geometry: geometry,
      material: this.createDebrisMaterial(color),
      metadata: {
        shape: 'needle' as LeafShape,
        decayLevel: config.decayState === 'decayed' ? 1 : 0,
        colorVariation: color,
      },
    };
  }
  
  /**
   * Create material for debris
   */
  private createDebrisMaterial(color: THREE.Color, roughness: number = 0.9): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  
  /**
   * Apply clustering to instances
   */
  private applyClustering(
    instances: DebrisInstance[],
    clusterFactor: number
  ): void {
    if (clusterFactor <= 0 || instances.length < 10) return;
    
    // Simple clustering: move some instances closer together
    const numClusters = Math.max(3, Math.floor(instances.length * 0.1));
    const clusterCenters: THREE.Vector3[] = [];
    
    // Create cluster centers
    for (let i = 0; i < numClusters; i++) {
      const randomIndex = Math.floor(Math.random() * instances.length);
      clusterCenters.push(instances[randomIndex].position.clone());
    }
    
    // Move instances toward nearest cluster
    for (const instance of instances) {
      if (Math.random() > clusterFactor) continue;
      
      let nearestCenter = clusterCenters[0];
      let nearestDist = instance.position.distanceTo(nearestCenter);
      
      for (const center of clusterCenters) {
        const dist = instance.position.distanceTo(center);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestCenter = center;
        }
      }
      
      // Move 30% toward cluster center
      const direction = new THREE.Vector3().subVectors(nearestCenter, instance.position);
      direction.multiplyScalar(0.3);
      instance.position.add(direction);
    }
  }
  
  /**
   * Get recommended density for different biomes
   */
  static getBiomeDensity(biome: string): number {
    const densities: Record<string, number> = {
      'temperate_forest': 3.0,
      'tropical_rainforest': 4.0,
      'boreal_forest': 2.5,
      'deciduous_forest': 3.5,
      'grassland': 0.5,
      'savanna': 0.3,
      'desert': 0.1,
      'urban': 0.2,
      'garden': 2.0,
    };
    
    return densities[biome] || 2.0;
  }
}

export default GroundDebrisScatter;
