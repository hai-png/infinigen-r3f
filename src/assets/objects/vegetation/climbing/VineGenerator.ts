import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Vine Configuration Interface
 * Defines all parameters for vine generation
 */
export interface VineConfig {
  /** Vine species */
  species: 'ivy' | 'wisteria' | 'grapevine' | 'creeper';
  /** Growth pattern */
  growthPattern: 'climbing' | 'hanging' | 'spreading';
  /** Total length in meters */
  length: number;
  /** Stem thickness */
  stemThickness: number;
  /** Leaf density (0-1) */
  leafDensity: number;
  /** Leaf size */
  leafSize: number;
  /** Include flowers/fruits */
  hasFlowers: boolean;
  /** Flower/fruit color */
  flowerColor?: THREE.Color;
  /** Attachment points for climbing */
  attachmentPoints?: THREE.Vector3[];
  /** Growth direction */
  growthDirection: THREE.Vector3;
}

/**
 * Vine Generator
 * Generates climbing and hanging vines with realistic growth simulation
 * 
 * Features:
 * - Multiple species (ivy, wisteria, grapevine, creeper)
 * - Various growth patterns (climbing, hanging, spreading)
 * - Procedural stem generation with natural curves
 * - Leaf placement with density control
 * - Optional flowers/fruits
 * - Attachment point system for climbing surfaces
 */
export class VineGenerator {
  private defaultConfig: VineConfig = {
    species: 'ivy',
    growthPattern: 'climbing',
    length: 2.0,
    stemThickness: 0.01,
    leafDensity: 0.7,
    leafSize: 0.05,
    hasFlowers: false,
    growthDirection: new THREE.Vector3(0, 1, 0),
  };

  /**
   * Generate a vine system
   * @deprecated Use the canonical VineGenerator from '@assets/objects/vegetation'
   */
  public generate(config: Partial<VineConfig> = {}): THREE.Group {
    console.warn('VineGenerator.generate() is deprecated. Please migrate to the canonical VineGenerator from @assets/objects/vegetation');
    const finalConfig = { ...this.defaultConfig, ...config };
    const group = new THREE.Group();

    // Generate main stem(s)
    const stems = this.generateStems(finalConfig);
    stems.forEach(stem => group.add(stem));

    // Generate leaves along stems
    if (finalConfig.leafDensity > 0) {
      const leaves = this.generateLeaves(stems, finalConfig);
      leaves.forEach(leaf => group.add(leaf));
    }

    // Generate flowers/fruits if requested
    if (finalConfig.hasFlowers && finalConfig.flowerColor) {
      const flowers = this.generateFlowers(stems, finalConfig);
      flowers.forEach(flower => group.add(flower));
    }

    return group;
  }

  /**
   * Generate vine stems based on growth pattern
   */
  private generateStems(config: VineConfig): THREE.Mesh[] {
    switch (config.growthPattern) {
      case 'climbing':
        return this.generateClimbingStems(config);
      case 'hanging':
        return this.generateHangingStems(config);
      case 'spreading':
        return this.generateSpreadingStems(config);
      default:
        return this.generateClimbingStems(config);
    }
  }

  /**
   * Generate climbing stems (wall-climbing vines)
   */
  private generateClimbingStems(config: VineConfig): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const stemCount = Math.max(1, Math.floor(config.length / 0.5));
    const material = this.getStemMaterial(config);

    for (let i = 0; i < stemCount; i++) {
      const segments = Math.floor(config.length / 0.1);
      const points: THREE.Vector3[] = [];
      
      let currentPos = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        0,
        (Math.random() - 0.5) * 0.3
      );
      
      points.push(currentPos.clone());

      // Generate path with noise-based wandering
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const noiseScale = 0.5;
        const wanderX = this.perlin2D(t * noiseScale, i) * 0.1;
        const wanderZ = this.perlin2D(t * noiseScale, i + 100) * 0.1;
        
        currentPos = new THREE.Vector3(
          currentPos.x + wanderX,
          currentPos.y + config.length / segments,
          currentPos.z + wanderZ
        );
        
        points.push(currentPos.clone());
      }

      // Create tube geometry from path
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness, 6, false);
      const stem = new THREE.Mesh(geometry, material);
      stems.push(stem);
    }

    return stems;
  }

  /**
   * Generate hanging stems (jungle vines, wisteria)
   */
  private generateHangingStems(config: VineConfig): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const stemCount = Math.max(1, Math.floor(config.length / 0.3));
    const material = this.getStemMaterial(config);

    for (let i = 0; i < stemCount; i++) {
      const segments = Math.floor(config.length / 0.1);
      const points: THREE.Vector3[] = [];
      
      const startX = (Math.random() - 0.5) * 0.5;
      const startZ = (Math.random() - 0.5) * 0.5;
      let currentPos = new THREE.Vector3(startX, config.length, startZ);
      
      points.push(currentPos.clone());

      // Generate hanging path with gravity and wind influence
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const swayAmount = Math.sin(t * Math.PI * 2) * 0.05;
        
        currentPos = new THREE.Vector3(
          currentPos.x + swayAmount * 0.1,
          currentPos.y - config.length / segments,
          currentPos.z + (Math.random() - 0.5) * 0.02
        );
        
        points.push(currentPos.clone());
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness * (1 - t), 6, false);
      const stem = new THREE.Mesh(geometry, material);
      stems.push(stem);
    }

    return stems;
  }

  /**
   * Generate spreading stems (ground cover, creepers)
   */
  private generateSpreadingStems(config: VineConfig): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const material = this.getStemMaterial(config);

    // Main horizontal stem
    const segments = Math.floor(config.length / 0.1);
    const points: THREE.Vector3[] = [];
    
    let currentPos = new THREE.Vector3(0, 0.02, 0);
    points.push(currentPos.clone());

    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const angle = t * Math.PI * 4; // Spiral pattern
      const radius = 0.05 * t;
      
      currentPos = new THREE.Vector3(
        currentPos.x + Math.cos(angle) * radius,
        0.02,
        currentPos.z + Math.sin(angle) * radius
      );
      
      points.push(currentPos.clone());
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness, 6, false);
    const mainStem = new THREE.Mesh(geometry, material);
    stems.push(mainStem);

    // Add branching stems
    const branchCount = Math.floor(config.length / 0.3);
    for (let b = 0; b < branchCount; b++) {
      const branchLength = config.length * 0.3;
      const branchSegments = Math.floor(branchLength / 0.1);
      const branchPoints: THREE.Vector3[] = [];
      
      const attachIndex = Math.floor((b / branchCount) * segments);
      const attachPos = points[attachIndex];
      branchPoints.push(attachPos.clone());
      
      let branchPos = attachPos.clone();
      const branchAngle = (b / branchCount) * Math.PI * 2;
      
      for (let s = 0; s < branchSegments; s++) {
        branchPos = new THREE.Vector3(
          branchPos.x + Math.cos(branchAngle) * 0.03,
          0.02,
          branchPos.z + Math.sin(branchAngle) * 0.03
        );
        branchPoints.push(branchPos.clone());
      }

      const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
      const branchGeometry = new THREE.TubeGeometry(
        branchCurve, 
        branchSegments, 
        config.stemThickness * 0.7, 
        6, 
        false
      );
      const branch = new THREE.Mesh(branchGeometry, material);
      stems.push(branch);
    }

    return stems;
  }

  /**
   * Generate leaves along stems
   */
  private generateLeaves(stems: THREE.Mesh[], config: VineConfig): THREE.Mesh[] {
    const leaves: THREE.Mesh[] = [];
    const material = this.getLeafMaterial(config);

    stems.forEach((stem, stemIndex) => {
      // Sample points along the stem
      const leafCount = Math.floor(config.length * config.leafDensity * 5);
      
      for (let i = 0; i < leafCount; i++) {
        const t = i / leafCount;
        const point = new THREE.Vector3();
        
        // Get position along stem (simplified - would need curve reference in production)
        point.set(
          (Math.random() - 0.5) * config.length * 0.3,
          t * config.length,
          (Math.random() - 0.5) * config.length * 0.3
        );

        // Create leaf
        const leafGeometry = this.createLeafGeometry(config.species, config.leafSize);
        const leaf = new THREE.Mesh(leafGeometry, material);
        
        leaf.position.copy(point);
        leaf.rotation.set(
          (Math.random() - 0.5) * 0.5,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.5
        );
        
        leaves.push(leaf);
      }
    });

    return leaves;
  }

  /**
   * Generate flowers/fruits
   */
  private generateFlowers(stems: THREE.Mesh[], config: VineConfig): THREE.Mesh[] {
    const flowers: THREE.Mesh[] = [];
    const material = new THREE.MeshStandardMaterial({
      color: config.flowerColor!,
      roughness: 0.5,
      metalness: 0.0,
    });

    const flowerCount = Math.floor(config.length * 2);
    
    for (let i = 0; i < flowerCount; i++) {
      const flowerGeometry = this.createFlowerGeometry(config.species);
      const flower = new THREE.Mesh(flowerGeometry, material);
      
      flower.position.set(
        (Math.random() - 0.5) * config.length * 0.3,
        Math.random() * config.length,
        (Math.random() - 0.5) * config.length * 0.3
      );
      
      flowers.push(flower);
    }

    return flowers;
  }

  /**
   * Get stem material based on species
   */
  private getStemMaterial(config: VineConfig): THREE.MeshStandardMaterial {
    let color = 0x4a5d23; // Default green-brown
    
    switch (config.species) {
      case 'ivy':
        color = 0x3d4a23;
        break;
      case 'wisteria':
        color = 0x5c4a3d;
        break;
      case 'grapevine':
        color = 0x4a3d23;
        break;
      case 'creeper':
        color = 0x2d3a18;
        break;
    }

    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
      metalness: 0.0,
    });
  }

  /**
   * Get leaf material based on species
   */
  private getLeafMaterial(config: VineConfig): THREE.MeshStandardMaterial {
    let color = 0x2d5a27;
    
    switch (config.species) {
      case 'ivy':
        color = 0x1a3d1a;
        break;
      case 'wisteria':
        color = 0x3d5a2d;
        break;
      case 'grapevine':
        color = 0x4a6b3a;
        break;
      case 'creeper':
        color = 0x2d4a1a;
        break;
    }

    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Create leaf geometry based on species
   */
  private createLeafGeometry(species: string, size: number): THREE.BufferGeometry {
    switch (species) {
      case 'ivy':
        return this.createIvyLeafGeometry(size);
      case 'wisteria':
        return this.createWisteriaLeafGeometry(size);
      case 'grapevine':
        return this.createGrapevineLeafGeometry(size);
      default:
        return this.createSimpleLeafGeometry(size);
    }
  }

  private createIvyLeafGeometry(size: number): THREE.BufferGeometry {
    // Ivy has distinctive lobed shape
    const shape = new THREE.Shape();
    const points = 8;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const radius = size * (0.5 + 0.5 * Math.sin(angle * 3));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }

    const geometry = new THREE.ShapeGeometry(shape);
    return geometry;
  }

  private createWisteriaLeafGeometry(size: number): THREE.BufferGeometry {
    // Compound leaf with multiple leaflets
    const leafletGeometry = new THREE.SphereGeometry(size * 0.3, 8, 8);
    leafletGeometry.scale(1, 0.3, 0.5);
    return leafletGeometry;
  }

  private createGrapevineLeafGeometry(size: number): THREE.BufferGeometry {
    // Grapevine has large, palmate leaves
    const shape = new THREE.Shape();
    const points = 10;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const radius = size * (0.6 + 0.4 * Math.sin(angle * 5));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }

    return new THREE.ShapeGeometry(shape);
  }

  private createSimpleLeafGeometry(size: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(size * 0.5, 8, 8);
    geometry.scale(1, 0.3, 0.6);
    return geometry;
  }

  /**
   * Create flower geometry based on species
   */
  private createFlowerGeometry(species: string): THREE.BufferGeometry {
    switch (species) {
      case 'wisteria':
        return this.createWisteriaFlowerGeometry();
      case 'grapevine':
        return this.createGrapeFlowerGeometry();
      default:
        return new THREE.SphereGeometry(0.03, 8, 8);
    }
  }

  private createWisteriaFlowerGeometry(): THREE.BufferGeometry {
    const flowerGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    return flowerGeometry;
  }

  private createGrapeFlowerGeometry(): THREE.BufferGeometry {
    return new THREE.SphereGeometry(0.015, 8, 8);
  }

  /**
   * Simple 2D perlin noise implementation for backward compatibility
   */
  private perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = (X + Y) % 256;
    const B = (X + Y + 1) % 256;
    return this.lerp(v, this.lerp(u, this.grad(A, x, y), this.grad(B, x, y - 1)),
                        this.lerp(u, this.grad(A + 1, x - 1, y), this.grad(B + 1, x - 1, y - 1)));
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}
