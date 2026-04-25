import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Seashell types with specific characteristics
 */
export enum SeashellType {
  CLAM = 'clam',
  SCALLOP = 'scallop',
  CONCH = 'conch',
  NAUTILUS = 'nautilus',
  COWRIE = 'cowrie',
  MUSSEL = 'mussel',
  OYSTER = 'oyster',
  COCKLE = 'cockle'
}

export interface SeashellConfig {
  type: SeashellType;
  size: number;
  color: THREE.Color;
  secondaryColor: THREE.Color;
  patternIntensity: number;
  roughness: number;
  metalness: number;
  iridescence: boolean;
  damageLevel: number; // 0-1, 0 = pristine, 1 = heavily damaged
}

/**
 * Generates procedural seashell meshes with various species and patterns
 */
export class SeashellGenerator {
  private static materialCache = new Map<string, THREE.MeshStandardMaterial>();

  /**
   * Generate a single seashell mesh
   */
  static generateShell(config: SeashellConfig): THREE.Mesh {
    const geometry = this.createShellGeometry(config);
    const material = this.getMaterial(config);
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.userData.seashellData = { config };
    
    return mesh;
  }

  /**
   * Create shell geometry based on type
   */
  private static createShellGeometry(config: SeashellConfig): THREE.BufferGeometry {
    switch (config.type) {
      case SeashellType.CLAM:
        return this.createBivalveShell(config, true);
      case SeashellType.SCALLOP:
        return this.createScallopShell(config);
      case SeashellType.CONCH:
        return this.createSpiralShell(config, 'conch');
      case SeashellType.NAUTILUS:
        return this.createSpiralShell(config, 'nautilus');
      case SeashellType.COWRIE:
        return this.createCowrieShell(config);
      case SeashellType.MUSSEL:
        return this.createBivalveShell(config, false);
      case SeashellType.OYSTER:
        return this.createOysterShell(config);
      case SeashellType.COCKLE:
        return this.createCockleShell(config);
      default:
        return this.createBivalveShell(config, true);
    }
  }

  /**
   * Create bivalve shell (clam, mussel)
   */
  private static createBivalveShell(config: SeashellConfig, isClam: boolean): THREE.BufferGeometry {
    const { size, damageLevel } = config;
    
    // Create half-sphere base
    const geometry = new THREE.SphereGeometry(size, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    
    // Add ridges using vertex displacement
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Calculate distance from center in XZ plane
      const radius = Math.sqrt(x * x + z * z);
      const angle = Math.atan2(z, x);
      
      // Add concentric ridges
      const ridgeCount = isClam ? 8 + Math.floor(damageLevel * 4) : 12;
      const ridgeFreq = ridgeCount / size;
      const ridgeAmp = 0.02 * size * (1 - damageLevel);
      
      const ridge = Math.sin(radius * ridgeFreq * Math.PI) * ridgeAmp * Math.exp(-radius * 0.5);
      
      // Add radial ribs
      const ribCount = isClam ? 20 : 30;
      const ribFreq = ribCount / (Math.PI * 2);
      const ribAmp = 0.015 * size;
      
      const rib = Math.sin(angle * ribFreq) * ribAmp;
      
      // Apply displacement
      const displacement = ridge + rib;
      
      // Reduce height near edges for damage effect
      const edgeFactor = 1 - damageLevel * (radius / size) * 0.5;
      
      positions.setY(i, y + displacement * edgeFactor);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create scallop shell with fan shape
   */
  private static createScallopShell(config: SeashellConfig): THREE.BufferGeometry {
    const { size, damageLevel } = config;
    
    // Create fan-shaped geometry
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    
    // Fan outline
    for (let i = 0; i <= 20; i++) {
      const angle = Math.PI + (i / 20) * Math.PI;
      const radius = size * (0.3 + 0.7 * Math.abs(Math.sin(angle * 3)));
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    
    const geometry = new THREE.ShapeGeometry(shape);
    
    // Add 3D depth
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      
      // Create dome shape
      const distFromCenter = Math.sqrt(x * x + y * y) / size;
      const z = Math.sqrt(Math.max(0, 1 - distFromCenter * distFromCenter)) * size * 0.4;
      
      // Add radial ribs
      const angle = Math.atan2(y, x);
      const ribCount = 15;
      const rib = Math.sin(angle * ribCount) * 0.02 * size * (1 - distFromCenter);
      
      positions.setZ(i, z + rib);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create spiral shell (conch, nautilus)
   */
  private static createSpiralShell(config: SeashellConfig, variant: 'conch' | 'nautilus'): THREE.BufferGeometry {
    const { size, damageLevel } = config;
    
    const points: THREE.Vector3[] = [];
    const turns = variant === 'conch' ? 3 : 4;
    const segments = 100;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * turns * Math.PI * 2;
      
      // Spiral growth
      const radius = size * (0.1 + 0.9 * t);
      const expansion = variant === 'nautilus' ? Math.pow(1.3, t * 2) : 1 + t * 0.5;
      
      const x = Math.cos(angle) * radius * expansion;
      const y = t * size * (variant === 'conch' ? 0.8 : 0.3);
      const z = Math.sin(angle) * radius * expansion;
      
      points.push(new THREE.Vector3(x, y, z));
    }
    
    // Create tube along spiral
    const path = new THREE.CatmullRomCurve3(points);
    const tubeRadius = size * 0.15 * (1 - damageLevel * 0.3);
    
    const geometry = new THREE.TubeGeometry(path, segments, tubeRadius, 12, false);
    
    // Add opening flare for conch
    if (variant === 'conch') {
      this.addConchFlare(geometry, size, points[points.length - 1]);
    }
    
    return geometry;
  }

  /**
   * Add flared opening to conch shell
   */
  private static addConchFlare(
    geometry: THREE.BufferGeometry,
    size: number,
    endPoint: THREE.Vector3
  ): void {
    // Simplified - in production would merge additional geometry
    // This creates the characteristic flared lip of a conch
  }

  /**
   * Create cowrie shell (smooth, egg-shaped)
   */
  private static createCowrieShell(config: SeashellConfig): THREE.BufferGeometry {
    const { size } = config;
    
    // Create elongated sphere
    const geometry = new THREE.SphereGeometry(size, 32, 24);
    
    // Flatten bottom and add slit
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Flatten bottom
      if (y < 0) {
        positions.setY(i, y * 0.3);
      }
      
      // Elongate slightly
      positions.setX(i, x * 1.3);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create oyster shell (irregular, rough)
   */
  private static createOysterShell(config: SeashellConfig): THREE.BufferGeometry {
    const { size, damageLevel } = config;
    
    // Start with irregular shape
    const geometry = new THREE.DodecahedronGeometry(size, 1);
    
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Add noise-based irregularity
      const noise = NoiseUtils.perlin3D(x * 0.5, y * 0.5, z * 0.5, 2);
      const irregularity = 0.3 * size * (1 + damageLevel);
      
      const scale = 1 + noise * irregularity / size;
      
      positions.setX(i, x * scale);
      positions.setY(i, Math.max(0, y * scale * 0.5)); // Flat bottom
      positions.setZ(i, z * scale);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create cockle shell (heart-shaped with prominent ribs)
   */
  private static createCockleShell(config: SeashellConfig): THREE.BufferGeometry {
    const { size, damageLevel } = config;
    
    // Heart-shaped base
    const shape = new THREE.Shape();
    const heartSize = size * 0.8;
    
    for (let t = 0; t <= Math.PI * 2; t += 0.05) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      shape.lineTo(x * heartSize / 16, y * heartSize / 16);
    }
    
    const geometry = new THREE.ShapeGeometry(shape);
    
    // Add 3D form with prominent ribs
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      
      const distFromCenter = Math.sqrt(x * x + y * y) / heartSize;
      
      // Dome shape
      let z = Math.sqrt(Math.max(0, 1 - distFromCenter * distFromCenter)) * size * 0.5;
      
      // Prominent radial ribs
      const angle = Math.atan2(y, x);
      const ribCount = 18;
      const ribHeight = 0.04 * size * (1 - damageLevel * 0.5);
      const rib = Math.pow(Math.sin(angle * ribCount), 2) * ribHeight * (1 - distFromCenter);
      
      z += rib;
      positions.setZ(i, z);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Get or create material for seashell
   */
  private static getMaterial(config: SeashellConfig): THREE.MeshStandardMaterial {
    const key = `${config.type}-${config.color.getHexString()}-${config.iridescence}`;
    
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
      emissive: config.secondaryColor,
      emissiveIntensity: config.patternIntensity * 0.1
    });

    // Enable iridescence if supported (Three.js r137+)
    if (config.iridescence && 'iridescence' in material) {
      (material as any).iridescence = 0.5;
      (material as any).iridescenceIOR = 1.3;
      (material as any).iridescenceThicknessRange = [100, 400];
    }

    this.materialCache.set(key, material);
    return material;
  }

  /**
   * Generate scattered seashells on seabed
   */
  static generateScatter(
    types: SeashellType[],
    count: number,
    area: { width: number; depth: number }
  ): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const preset = this.getPreset(type);
      
      // Randomize some properties
      const config: SeashellConfig = {
        ...preset,
        size: preset.size * (0.7 + Math.random() * 0.6),
        damageLevel: Math.random() * 0.7
      };
      
      const shell = this.generateShell(config);
      
      // Position on seabed
      shell.position.set(
        (Math.random() - 0.5) * area.width,
        0,
        (Math.random() - 0.5) * area.depth
      );
      
      // Random rotation
      shell.rotation.set(
        Math.random() * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * 0.3
      );
      
      group.add(shell);
    }
    
    return group;
  }

  /**
   * Get preset configurations for different seashell types
   */
  static getPreset(type: SeashellType): SeashellConfig {
    switch (type) {
      case SeashellType.CLAM:
        return {
          type: SeashellType.CLAM,
          size: 0.15,
          color: new THREE.Color(0xf5deb3),
          secondaryColor: new THREE.Color(0xd2b48c),
          patternIntensity: 0.6,
          roughness: 0.4,
          metalness: 0.1,
          iridescence: true,
          damageLevel: 0.2
        };
      
      case SeashellType.SCALLOP:
        return {
          type: SeashellType.SCALLOP,
          size: 0.12,
          color: new THREE.Color(0xff6b6b),
          secondaryColor: new THREE.Color(0xffffff),
          patternIntensity: 0.8,
          roughness: 0.3,
          metalness: 0.05,
          iridescence: false,
          damageLevel: 0.1
        };
      
      case SeashellType.CONCH:
        return {
          type: SeashellType.CONCH,
          size: 0.25,
          color: new THREE.Color(0xffb6c1),
          secondaryColor: new THREE.Color(0xffa07a),
          patternIntensity: 0.5,
          roughness: 0.5,
          metalness: 0.0,
          iridescence: false,
          damageLevel: 0.3
        };
      
      case SeashellType.NAUTILUS:
        return {
          type: SeashellType.NAUTILUS,
          size: 0.2,
          color: new THREE.Color(0xf5f5dc),
          secondaryColor: new THREE.Color(0x8b4513),
          patternIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.1,
          iridescence: true,
          damageLevel: 0.0
        };
      
      case SeashellType.COWRIE:
        return {
          type: SeashellType.COWRIE,
          size: 0.08,
          color: new THREE.Color(0xffd700),
          secondaryColor: new THREE.Color(0x8b4513),
          patternIntensity: 0.7,
          roughness: 0.1,
          metalness: 0.2,
          iridescence: true,
          damageLevel: 0.1
        };
      
      case SeashellType.MUSSEL:
        return {
          type: SeashellType.MUSSEL,
          size: 0.1,
          color: new THREE.Color(0x2f4f4f),
          secondaryColor: new THREE.Color(0x4682b4),
          patternIntensity: 0.4,
          roughness: 0.6,
          metalness: 0.0,
          iridescence: true,
          damageLevel: 0.4
        };
      
      case SeashellType.OYSTER:
        return {
          type: SeashellType.OYSTER,
          size: 0.18,
          color: new THREE.Color(0x808080),
          secondaryColor: new THREE.Color(0xa9a9a9),
          patternIntensity: 0.3,
          roughness: 0.8,
          metalness: 0.0,
          iridescence: true,
          damageLevel: 0.5
        };
      
      case SeashellType.COCKLE:
        return {
          type: SeashellType.COCKLE,
          size: 0.11,
          color: new THREE.Color(0xfffaf0),
          secondaryColor: new THREE.Color(0xd2691e),
          patternIntensity: 0.6,
          roughness: 0.4,
          metalness: 0.05,
          iridescence: false,
          damageLevel: 0.2
        };
      
      default:
        return this.getPreset(SeashellType.CLAM);
    }
  }
}
