/**
 * Flower Scatter Generator
 * 
 * Generates diverse flowering plants including:
 * - Wildflowers (various species)
 * - Garden flowers
 * - Seasonal blooms
 * - Grassland flowers
 * 
 * @module FlowerScatter
 */

import * as THREE from 'three';
import { ScatterGenerator, ScatterOptions, ScatterInstance } from '../../terrain/scatter/ScatterGenerator';
import { TerrainSurface } from '../../terrain/TerrainSurface';

/**
 * Configuration for flower scatter
 */
export interface FlowerScatterOptions extends ScatterOptions {
  /** Density of flowers per square meter (default: 1.5) */
  density?: number;
  
  /** Flower type mix: 'wild', 'garden', 'mixed' (default: 'mixed') */
  flowerType?: 'wild' | 'garden' | 'mixed';
  
  /** Seasonal variation: 'spring', 'summer', 'autumn', 'mixed' (default: 'mixed') */
  season?: 'spring' | 'summer' | 'autumn' | 'mixed';
  
  /** Include tall flowers (>0.3m) (default: true) */
  includeTallFlowers?: boolean;
  
  /** Include medium flowers (0.1-0.3m) (default: true) */
  includeMediumFlowers?: boolean;
  
  /** Include small flowers (<0.1m) (default: true) */
  includeSmallFlowers?: boolean;
  
  /** Color diversity 0-1 (default: 0.8) */
  colorDiversity?: number;
  
  /** Size variation multiplier (default: 0.4) */
  sizeVariation?: number;
  
  /** Rotation randomness in radians (default: Math.PI) */
  rotationRandomness?: number;
  
  /** Cluster tendency 0-1 (default: 0.6) */
  clusterFactor?: number;
  
  /** Minimum distance between instances (default: 0.08) */
  minSpacing?: number;
}

/**
 * Flower species types
 */
type FlowerSpecies = 
  | 'daisy'
  | 'tulip'
  | 'rose'
  | 'sunflower'
  | 'lavender'
  | 'poppy'
  | 'iris'
  | 'orchid'
  | 'lily'
  | 'dandelion'
  | 'clover'
  | 'buttercup';

/**
 * Flower size categories
 */
type FlowerSize = 'small' | 'medium' | 'tall';

/**
 * Flower instance data
 */
interface FlowerInstance extends ScatterInstance {
  species: FlowerSpecies;
  size: FlowerSize;
  bloomStage: number;
  colorPrimary: THREE.Color;
  colorSecondary?: THREE.Color;
}

/**
 * Flower Scatter Generator
 * 
 * Creates realistic flower distributions for meadows, gardens, and natural landscapes.
 * Supports seasonal variations and diverse species mixing.
 */
export class FlowerScatter extends ScatterGenerator<FlowerScatterOptions> {
  private flowerGeometries: Map<FlowerSpecies, THREE.BufferGeometry>;
  private stemGeometries: Map<FlowerSize, THREE.BufferGeometry>;
  private leafGeometries: THREE.BufferGeometry[];
  
  constructor(options: FlowerScatterOptions = {}) {
    super(options);
    
    this.flowerGeometries = new Map();
    this.stemGeometries = new Map();
    this.leafGeometries = [];
    
    this.initializeGeometries();
  }
  
  /**
   * Initialize procedural geometries for flower types
   */
  private initializeGeometries(): void {
    // Generate flower head geometries
    const species: FlowerSpecies[] = [
      'daisy', 'tulip', 'rose', 'sunflower', 'lavender',
      'poppy', 'iris', 'orchid', 'lily', 'dandelion',
      'clover', 'buttercup'
    ];
    
    species.forEach(species => {
      this.flowerGeometries.set(species, this.createFlowerGeometry(species));
    });
    
    // Generate stem geometries for each size
    this.stemGeometries.set('small', this.createStemGeometry('small'));
    this.stemGeometries.set('medium', this.createStemGeometry('medium'));
    this.stemGeometries.set('tall', this.createStemGeometry('tall'));
    
    // Generate leaf geometries
    for (let i = 0; i < 4; i++) {
      this.leafGeometries.push(this.createLeafGeometry(i));
    }
  }
  
  /**
   * Create flower geometry based on species
   */
  private createFlowerGeometry(species: FlowerSpecies): THREE.BufferGeometry {
    switch (species) {
      case 'daisy':
        return this.createDaisyGeometry();
      case 'tulip':
        return this.createTulipGeometry();
      case 'rose':
        return this.createRoseGeometry();
      case 'sunflower':
        return this.createSunflowerGeometry();
      case 'lavender':
        return this.createLavenderGeometry();
      case 'poppy':
        return this.createPoppyGeometry();
      case 'iris':
        return this.createIrisGeometry();
      case 'orchid':
        return this.createOrchidGeometry();
      case 'lily':
        return this.createLilyGeometry();
      case 'dandelion':
        return this.createDandelionGeometry();
      case 'clover':
        return this.createCloverGeometry();
      case 'buttercup':
        return this.createButtercupGeometry();
      default:
        return this.createDaisyGeometry();
    }
  }
  
  /**
   * Create daisy flower geometry
   */
  private createDaisyGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 12;
    const petalLength = 0.03;
    const petalWidth = 0.01;
    const centerRadius = 0.008;
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Create petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      
      // Petal base vertices
      const baseX = Math.cos(angle) * centerRadius;
      const baseY = Math.sin(angle) * centerRadius;
      
      // Petal tip
      const tipX = Math.cos(angle) * petalLength;
      const tipY = Math.sin(angle) * petalLength;
      
      // Petal width offset
      const perpX = -Math.sin(angle) * petalWidth;
      const perpY = Math.cos(angle) * petalWidth;
      
      // Add petal quad
      vertices.push(
        baseX + perpX, baseY + perpY, 0,
        baseX - perpX, baseY - perpY, 0,
        tipX + perpX * 0.3, tipY + perpY * 0.3, 0.002,
        
        baseX + perpX, baseY + perpY, 0,
        tipX + perpX * 0.3, tipY + perpY * 0.3, 0.002,
        tipX - perpX * 0.3, tipY - perpY * 0.3, 0.002
      );
    }
    
    // Create center disk
    const centerSegments = 16;
    for (let i = 0; i < centerSegments; i++) {
      const angle1 = (i / centerSegments) * Math.PI * 2;
      const angle2 = ((i + 1) / centerSegments) * Math.PI * 2;
      
      vertices.push(
        0, 0, 0.003,
        Math.cos(angle1) * centerRadius, Math.sin(angle1) * centerRadius, 0.003,
        Math.cos(angle2) * centerRadius, Math.sin(angle2) * centerRadius, 0.003
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create tulip flower geometry
   */
  private createTulipGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 6;
    const height = 0.05;
    const radius = 0.02;
    
    const vertices: number[] = [];
    
    // Create cup-shaped petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      const nextAngle = ((i + 1) / petals) * Math.PI * 2;
      
      // Bottom of petal
      const x1 = Math.cos(angle) * radius * 0.5;
      const y1 = Math.sin(angle) * radius * 0.5;
      const x2 = Math.cos(nextAngle) * radius * 0.5;
      const y2 = Math.sin(nextAngle) * radius * 0.5;
      
      // Top of petal (curved outward)
      const x3 = Math.cos(angle) * radius * 1.2;
      const y3 = Math.sin(angle) * radius * 1.2;
      const x4 = Math.cos(nextAngle) * radius * 1.2;
      const y4 = Math.sin(nextAngle) * radius * 1.2;
      
      vertices.push(
        x1, y1, 0,
        x2, y2, 0,
        x3, y3, height,
        
        x2, y2, 0,
        x4, y4, height,
        x3, y3, height
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create rose flower geometry
   */
  private createRoseGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const layers = 4;
    const baseRadius = 0.025;
    
    const vertices: number[] = [];
    
    // Create spiral petal layers
    for (let layer = 0; layer < layers; layer++) {
      const layerRadius = baseRadius * (1 + layer * 0.4);
      const layerHeight = layer * 0.01;
      const petalsInLayer = 5 + layer * 2;
      
      for (let i = 0; i < petalsInLayer; i++) {
        const angle = (i / petalsInLayer) * Math.PI * 2 + layer * 0.3;
        const nextAngle = ((i + 1) / petalsInLayer) * Math.PI * 2 + layer * 0.3;
        
        const r = layerRadius * (0.7 + 0.3 * Math.sin(angle * 3));
        
        const x1 = Math.cos(angle) * r * 0.5;
        const y1 = Math.sin(angle) * r * 0.5;
        const x2 = Math.cos(nextAngle) * r * 0.5;
        const y2 = Math.sin(nextAngle) * r * 0.5;
        const x3 = Math.cos(angle) * r;
        const y3 = Math.sin(angle) * r;
        const x4 = Math.cos(nextAngle) * r;
        const y4 = Math.sin(nextAngle) * r;
        
        vertices.push(
          x1, y1, layerHeight,
          x2, y2, layerHeight,
          x3, y3, layerHeight + 0.005,
          
          x2, y2, layerHeight,
          x4, y4, layerHeight + 0.005,
          x3, y3, layerHeight + 0.005
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create sunflower geometry
   */
  private createSunflowerGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 21;
    const petalLength = 0.06;
    const petalWidth = 0.015;
    const centerRadius = 0.02;
    
    const vertices: number[] = [];
    
    // Create long petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      
      const baseX = Math.cos(angle) * centerRadius;
      const baseY = Math.sin(angle) * centerRadius;
      const tipX = Math.cos(angle) * petalLength;
      const tipY = Math.sin(angle) * petalLength;
      const perpX = -Math.sin(angle) * petalWidth;
      const perpY = Math.cos(angle) * petalWidth;
      
      vertices.push(
        baseX + perpX, baseY + perpY, 0,
        baseX - perpX, baseY - perpY, 0,
        tipX, tipY, 0.003,
        
        baseX + perpX, baseY + perpY, 0,
        tipX, tipY, 0.003,
        tipX - perpX * 0.5, tipY - perpY * 0.5, 0.003
      );
    }
    
    // Create textured center
    const centerSegments = 24;
    for (let i = 0; i < centerSegments; i++) {
      const angle1 = (i / centerSegments) * Math.PI * 2;
      const angle2 = ((i + 1) / centerSegments) * Math.PI * 2;
      
      vertices.push(
        0, 0, 0.005,
        Math.cos(angle1) * centerRadius, Math.sin(angle1) * centerRadius, 0.005,
        Math.cos(angle2) * centerRadius, Math.sin(angle2) * centerRadius, 0.005
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create lavender spike geometry
   */
  private createLavenderGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const florets = 12;
    const spikeHeight = 0.08;
    const floretRadius = 0.004;
    
    const vertices: number[] = [];
    
    // Create stacked florets along spike
    for (let i = 0; i < florets; i++) {
      const t = i / florets;
      const y = t * spikeHeight;
      const radius = floretRadius * (1 + Math.sin(t * Math.PI) * 0.5);
      const segments = 8;
      
      for (let j = 0; j < segments; j++) {
        const angle1 = (j / segments) * Math.PI * 2;
        const angle2 = ((j + 1) / segments) * Math.PI * 2;
        
        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;
        
        vertices.push(
          x1, y, z1,
          x2, y, z2,
          x1 * 0.7, y + 0.005, z1 * 0.7,
          
          x2, y, z2,
          x2 * 0.7, y + 0.005, z2 * 0.7,
          x1 * 0.7, y + 0.005, z1 * 0.7
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create poppy geometry
   */
  private createPoppyGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 4;
    const petalSize = 0.035;
    
    const vertices: number[] = [];
    
    // Create wide, delicate petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      
      for (let j = 0; j < 6; j++) {
        const t1 = j / 6;
        const t2 = (j + 1) / 6;
        
        const r1 = petalSize * (0.3 + 0.7 * t1);
        const r2 = petalSize * (0.3 + 0.7 * t2);
        
        const a1 = angle + (t1 - 0.5) * 0.8;
        const a2 = angle + (t2 - 0.5) * 0.8;
        
        vertices.push(
          Math.cos(a1) * r1, Math.sin(a1) * r1, 0.002 * t1,
          Math.cos(a2) * r1, Math.sin(a2) * r1, 0.002 * t1,
          Math.cos(a1) * r2, Math.sin(a1) * r2, 0.002 * t2,
          
          Math.cos(a2) * r1, Math.sin(a2) * r1, 0.002 * t1,
          Math.cos(a2) * r2, Math.sin(a2) * r2, 0.002 * t2,
          Math.cos(a1) * r2, Math.sin(a1) * r2, 0.002 * t2
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create iris geometry
   */
  private createIrisGeometry(): THREE.BufferGeometry {
    // Simplified iris with upright and drooping petals
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    
    // Upright petals (standards)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const height = 0.05;
      const width = 0.02;
      
      vertices.push(
        Math.cos(angle) * width, Math.sin(angle) * width, 0,
        Math.cos(angle + 0.3) * width * 0.5, Math.sin(angle + 0.3) * width * 0.5, height,
        Math.cos(angle - 0.3) * width * 0.5, Math.sin(angle - 0.3) * width * 0.5, height,
        
        Math.cos(angle) * width, Math.sin(angle) * width, 0,
        Math.cos(angle) * width * 0.5, Math.sin(angle) * width * 0.5, height,
        Math.cos(angle + 0.3) * width * 0.5, Math.sin(angle + 0.3) * width * 0.5, height
      );
    }
    
    // Drooping petals (falls)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const length = 0.04;
      const width = 0.025;
      
      vertices.push(
        Math.cos(angle) * width * 0.3, Math.sin(angle) * width * 0.3, 0,
        Math.cos(angle) * width, Math.sin(angle) * width, -0.01,
        Math.cos(angle) * length, Math.sin(angle) * length, -0.02,
        
        Math.cos(angle) * width * 0.3, Math.sin(angle) * width * 0.3, 0,
        Math.cos(angle) * length, Math.sin(angle) * length, -0.02,
        Math.cos(angle + 0.2) * length, Math.sin(angle + 0.2) * length, -0.015
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create orchid geometry
   */
  private createOrchidGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    
    // Orchid has distinctive lip and petals
    const petalSize = 0.025;
    
    // Dorsal sepal (top)
    vertices.push(
      0, petalSize, 0,
      -petalSize * 0.5, 0, 0,
      petalSize * 0.5, 0, 0,
      0, petalSize, 0,
      petalSize * 0.5, 0, 0,
      0, -petalSize * 0.3, 0.01
    );
    
    // Side petals
    for (let side of [-1, 1]) {
      vertices.push(
        0, 0, 0,
        side * petalSize, petalSize * 0.5, 0,
        side * petalSize * 0.8, -petalSize * 0.3, 0.01,
        
        0, 0, 0,
        side * petalSize * 0.8, -petalSize * 0.3, 0.01,
        side * petalSize * 0.5, -petalSize * 0.5, 0.02
      );
    }
    
    // Lip (labellum)
    vertices.push(
      0, -petalSize * 0.3, 0,
      -petalSize * 0.6, -petalSize, -0.01,
      petalSize * 0.6, -petalSize, -0.01,
      
      0, -petalSize * 0.3, 0.01,
      petalSize * 0.6, -petalSize, -0.01,
      -petalSize * 0.6, -petalSize, -0.01
    );
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create lily geometry
   */
  private createLilyGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 6;
    const petalLength = 0.05;
    const petalWidth = 0.015;
    
    const vertices: number[] = [];
    
    // Create trumpet-shaped petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      
      for (let j = 0; j < 4; j++) {
        const t1 = j / 4;
        const t2 = (j + 1) / 4;
        
        const r1 = petalWidth * (0.2 + 0.8 * t1);
        const r2 = petalWidth * (0.2 + 0.8 * t2);
        const y1 = t1 * petalLength;
        const y2 = t2 * petalLength;
        
        const curl = Math.sin(t1 * Math.PI) * 0.02;
        
        vertices.push(
          Math.cos(angle) * r1, y1, Math.sin(angle) * r1 + curl,
          Math.cos(angle) * r2, y2, Math.sin(angle) * r2 + curl * 0.8,
          Math.cos(angle + 0.15) * r2, y2, Math.sin(angle + 0.15) * r2 + curl * 0.8,
          
          Math.cos(angle) * r1, y1, Math.sin(angle) * r1 + curl,
          Math.cos(angle + 0.15) * r2, y2, Math.sin(angle + 0.15) * r2 + curl * 0.8,
          Math.cos(angle + 0.15) * r1, y1, Math.sin(angle + 0.15) * r1 + curl
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create dandelion geometry
   */
  private createDandelionGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const seeds = 30;
    const radius = 0.02;
    
    const vertices: number[] = [];
    
    // Create spherical puffball of seed filaments
    for (let i = 0; i < seeds; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = Math.sin(phi) * Math.cos(theta) * radius;
      const y = Math.sin(phi) * Math.sin(theta) * radius;
      const z = Math.cos(phi) * radius;
      
      // Filament
      vertices.push(0, 0, 0, x, y, z);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create clover geometry
   */
  private createCloverGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const leaflets = 3;
    const leafletSize = 0.015;
    
    const vertices: number[] = [];
    
    // Create heart-shaped leaflets
    for (let i = 0; i < leaflets; i++) {
      const angle = (i / leaflets) * Math.PI * 2;
      
      for (let j = 0; j < 8; j++) {
        const t1 = j / 8;
        const t2 = (j + 1) / 8;
        
        // Heart shape parametric
        const r1 = leafletSize * (0.5 + 0.5 * Math.sin(t1 * Math.PI * 2));
        const r2 = leafletSize * (0.5 + 0.5 * Math.sin(t2 * Math.PI * 2));
        
        const a1 = angle + (t1 - 0.5) * 1.2;
        const a2 = angle + (t2 - 0.5) * 1.2;
        
        vertices.push(
          Math.cos(a1) * r1, Math.sin(a1) * r1, 0,
          Math.cos(a2) * r1, Math.sin(a2) * r1, 0,
          Math.cos(a1) * r2, Math.sin(a1) * r2, 0.002,
          
          Math.cos(a2) * r1, Math.sin(a2) * r1, 0,
          Math.cos(a2) * r2, Math.sin(a2) * r2, 0.002,
          Math.cos(a1) * r2, Math.sin(a1) * r2, 0.002
        );
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create buttercup geometry
   */
  private createButtercupGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const petals = 5;
    const petalSize = 0.02;
    
    const vertices: number[] = [];
    
    // Create glossy cup-shaped petals
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      
      vertices.push(
        Math.cos(angle) * petalSize * 0.3,
        Math.sin(angle) * petalSize * 0.3,
        0,
        
        Math.cos(angle + 0.3) * petalSize,
        Math.sin(angle + 0.3) * petalSize,
        0.005,
        
        Math.cos(angle - 0.3) * petalSize,
        Math.sin(angle - 0.3) * petalSize,
        0.005,
        
        Math.cos(angle) * petalSize * 0.3,
        Math.sin(angle) * petalSize * 0.3,
        0,
        
        Math.cos(angle - 0.3) * petalSize,
        Math.sin(angle - 0.3) * petalSize,
        0.005,
        
        Math.cos(angle + 0.3) * petalSize,
        Math.sin(angle + 0.3) * petalSize,
        0.005
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create stem geometry
   */
  private createStemGeometry(size: FlowerSize): THREE.BufferGeometry {
    const heights: Record<FlowerSize, number> = {
      small: 0.05,
      medium: 0.15,
      tall: 0.35,
    };
    
    const radii: Record<FlowerSize, number> = {
      small: 0.001,
      medium: 0.002,
      tall: 0.003,
    };
    
    const geometry = new THREE.CylinderGeometry(
      radii[size] * 0.7,
      radii[size],
      heights[size],
      6,
      1
    );
    
    // Add slight curve
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + heights[size] / 2) / heights[size];
      const bend = Math.sin(t * Math.PI) * 0.01 * (size === 'tall' ? 2 : 1);
      positions[i] += bend;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Create leaf geometry
   */
  private createLeafGeometry(variant: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const length = 0.02 + variant * 0.01;
    const width = 0.008 + variant * 0.004;
    
    const vertices: number[] = [];
    
    // Simple lanceolate leaf
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      
      const w1 = width * Math.sin(t1 * Math.PI);
      const w2 = width * Math.sin(t2 * Math.PI);
      const y1 = (t1 - 0.5) * length;
      const y2 = (t2 - 0.5) * length;
      
      vertices.push(
        -w1, y1, 0,
        w1, y1, 0,
        -w2, y2, 0.001,
        
        w1, y1, 0,
        w2, y2, 0.001,
        -w2, y2, 0.001
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Get flower color based on species and season
   */
  private getFlowerColor(
    species: FlowerSpecies,
    season: FlowerScatterOptions['season'],
    diversity: number
  ): { primary: THREE.Color; secondary?: THREE.Color } {
    const colorPalettes: Record<FlowerSpecies, THREE.Color[]> = {
      daisy: [new THREE.Color(0xffffff), new THREE.Color(0xffffee)],
      tulip: [new THREE.Color(0xff6b9d), new THREE.Color(0xffd700), new THREE.Color(0xff6347)],
      rose: [new THREE.Color(0xdc143c), new THREE.Color(0xff69b4), new THREE.Color(0xffffff)],
      sunflower: [new THREE.Color(0xffd700), new THREE.Color(0xffa500)],
      lavender: [new THREE.Color(0x967bb6), new THREE.Color(0xb19cd9)],
      poppy: [new THREE.Color(0xff4500), new THREE.Color(0xff6347)],
      iris: [new THREE.Color(0x6a5acd), new THREE.Color(0x9370db), new THREE.Color(0xffffff)],
      orchid: [new THREE.Color(0xda70d6), new THREE.Color(0xff69b4), new THREE.Color(0xffffff)],
      lily: [new THREE.Color(0xffffff), new THREE.Color(0xffd700), new THREE.Color(0xff69b4)],
      dandelion: [new THREE.Color(0xffd700), new THREE.Color(0xffa500)],
      clover: [new THREE.Color(0xff69b4), new THREE.Color(0xffffff)],
      buttercup: [new THREE.Color(0xffd700), new THREE.Color(0xffa500)],
    };
    
    let palette = colorPalettes[species];
    
    // Add diversity variation
    if (diversity > 0 && Math.random() < diversity) {
      const variation = (Math.random() - 0.5) * 0.2;
      palette = palette.map(c => {
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        hsl.h = (hsl.h + variation) % 1;
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
      });
    }
    
    const primary = palette[Math.floor(Math.random() * palette.length)].clone();
    const secondary = palette.length > 1 && Math.random() > 0.5
      ? palette[Math.floor(Math.random() * palette.length)].clone()
      : undefined;
    
    return { primary, secondary };
  }
  
  /**
   * Determine flower size category
   */
  private getSizeCategory(
    species: FlowerSpecies,
    options: Required<FlowerScatterOptions>
  ): FlowerSize {
    const tallFlowers: FlowerSpecies[] = ['sunflower', 'hollyhock', 'delphinium'];
    const smallFlowers: FlowerSpecies[] = ['clover', 'buttercup', 'daisy'];
    
    if (!options.includeTallFlowers && tallFlowers.includes(species)) {
      return 'medium';
    }
    if (!options.includeSmallFlowers && smallFlowers.includes(species)) {
      return 'medium';
    }
    
    if (tallFlowers.includes(species) && options.includeTallFlowers) {
      return 'tall';
    }
    if (smallFlowers.includes(species) && options.includeSmallFlowers) {
      return 'small';
    }
    
    return options.includeMediumFlowers ? 'medium' : 'small';
  }
  
  /**
   * Select flower species based on type and season
   */
  private selectSpecies(
    flowerType: FlowerScatterOptions['flowerType'],
    season: FlowerScatterOptions['season']
  ): FlowerSpecies {
    const wildFlowers: FlowerSpecies[] = ['daisy', 'poppy', 'clover', 'buttercup', 'dandelion'];
    const gardenFlowers: FlowerSpecies[] = ['tulip', 'rose', 'iris', 'orchid', 'lily'];
    const allFlowers: FlowerSpecies[] = [...wildFlowers, ...gardenFlowers, 'sunflower', 'lavender'];
    
    const seasonalRestrictions: Record<string, FlowerSpecies[]> = {
      spring: ['tulip', 'daisy', 'dandelion', 'iris', 'lily'],
      summer: ['sunflower', 'rose', 'lavender', 'poppy', 'buttercup'],
      autumn: ['aster', 'chrysanthemum', 'dahlia'],
    };
    
    let pool: FlowerSpecies[];
    
    if (flowerType === 'wild') {
      pool = wildFlowers;
    } else if (flowerType === 'garden') {
      pool = gardenFlowers;
    } else {
      pool = allFlowers;
    }
    
    if (season !== 'mixed' && seasonalRestrictions[season]) {
      pool = pool.filter(s => seasonalRestrictions[season].includes(s));
      if (pool.length === 0) {
        pool = allFlowers;
      }
    }
    
    return pool[Math.floor(Math.random() * pool.length)];
  }
  
  /**
   * Generate scatter instances
   */
  async generate(
    surface: TerrainSurface,
    options: FlowerScatterOptions = {}
  ): Promise<ScatterInstance[]> {
    const config: Required<FlowerScatterOptions> = {
      density: 1.5,
      flowerType: 'mixed',
      season: 'mixed',
      includeTallFlowers: true,
      includeMediumFlowers: true,
      includeSmallFlowers: true,
      colorDiversity: 0.8,
      sizeVariation: 0.4,
      rotationRandomness: Math.PI,
      clusterFactor: 0.6,
      minSpacing: 0.08,
      ...options,
    };
    
    const instances: FlowerInstance[] = [];
    const area = surface.getArea();
    const targetCount = Math.floor(area * config.density);
    
    const points = surface.samplePoints(targetCount, config.minSpacing);
    
    for (const point of points) {
      const position = new THREE.Vector3(point.x, point.y, point.z);
      const normal = surface.getNormal(point.x, point.z);
      
      // Select species and properties
      const species = this.selectSpecies(config.flowerType, config.season);
      const size = this.getSizeCategory(species, config);
      const colors = this.getFlowerColor(species, config.season, config.colorDiversity);
      
      // Create stem
      const stemGeometry = this.stemGeometries.get(size)!;
      const stemMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x2d5a27),
        roughness: 0.8,
      });
      
      const stemHeight: Record<FlowerSize, number> = {
        small: 0.05,
        medium: 0.15,
        tall: 0.35,
      };
      
      const stemInstance: FlowerInstance = {
        position: position.clone(),
        rotation: new THREE.Euler(
          -normal.x * 0.1,
          Math.random() * config.rotationRandomness,
          -normal.z * 0.1
        ),
        scale: new THREE.Vector3(1, 1, 1),
        geometry: stemGeometry,
        material: stemMaterial,
        metadata: {
          species,
          size,
          bloomStage: 0.8 + Math.random() * 0.2,
          colorPrimary: colors.primary,
          colorSecondary: colors.secondary,
        },
      };
      
      instances.push(stemInstance);
      
      // Create flower head (offset from stem top)
      const flowerGeometry = this.flowerGeometries.get(species)!;
      const flowerMaterial = new THREE.MeshStandardMaterial({
        color: colors.primary,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      
      const scale = 1 + (Math.random() - 0.5) * config.sizeVariation;
      const flowerPosition = position.clone();
      flowerPosition.y += stemHeight[size];
      
      const flowerInstance: FlowerInstance = {
        position: flowerPosition,
        rotation: new THREE.Euler(
          (Math.random() - 0.5) * 0.3,
          Math.random() * config.rotationRandomness,
          (Math.random() - 0.5) * 0.3
        ),
        scale: new THREE.Vector3(scale, scale, scale),
        geometry: flowerGeometry,
        material: flowerMaterial,
        metadata: {
          species,
          size,
          bloomStage: 0.8 + Math.random() * 0.2,
          colorPrimary: colors.primary,
          colorSecondary: colors.secondary,
        },
      };
      
      instances.push(flowerInstance);
      
      // Add leaves for medium and tall flowers
      if (size !== 'small' && Math.random() > 0.5) {
        const leafGeometry = this.leafGeometries[Math.floor(Math.random() * this.leafGeometries.length)];
        const leafMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x3d7a37),
          roughness: 0.7,
          side: THREE.DoubleSide,
        });
        
        const leafPosition = position.clone();
        leafPosition.y += stemHeight[size] * (0.3 + Math.random() * 0.4);
        
        const leafInstance: FlowerInstance = {
          position: leafPosition,
          rotation: new THREE.Euler(
            Math.PI / 2 + (Math.random() - 0.5) * 0.5,
            Math.random() * config.rotationRandomness,
            (Math.random() - 0.5) * 0.5
          ),
          scale: new THREE.Vector3(1, 1, 1),
          geometry: leafGeometry,
          material: leafMaterial,
          metadata: {
            species,
            size,
            bloomStage: 1,
            colorPrimary: colors.primary,
          },
        };
        
        instances.push(leafInstance);
      }
    }
    
    // Apply clustering
    if (config.clusterFactor > 0) {
      this.applyClustering(instances, config.clusterFactor);
    }
    
    return instances;
  }
  
  /**
   * Apply clustering to flower instances
   */
  private applyClustering(
    instances: FlowerInstance[],
    clusterFactor: number
  ): void {
    if (clusterFactor <= 0 || instances.length < 10) return;
    
    const numClusters = Math.max(5, Math.floor(instances.length * 0.15));
    const clusterCenters: THREE.Vector3[] = [];
    
    for (let i = 0; i < numClusters; i++) {
      const randomIndex = Math.floor(Math.random() * instances.length);
      clusterCenters.push(instances[randomIndex].position.clone());
    }
    
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
      
      const direction = new THREE.Vector3().subVectors(nearestCenter, instance.position);
      direction.multiplyScalar(0.25);
      instance.position.add(direction);
    }
  }
  
  /**
   * Get recommended density for different biomes
   */
  static getBiomeDensity(biome: string): number {
    const densities: Record<string, number> = {
      'meadow': 3.0,
      'grassland': 2.0,
      'alpine': 1.5,
      'prairie': 2.5,
      'garden': 4.0,
      'forest_clearing': 1.5,
      'savanna': 0.8,
      'tundra': 0.5,
    };
    
    return densities[biome] || 1.5;
  }
}

export default FlowerScatter;
