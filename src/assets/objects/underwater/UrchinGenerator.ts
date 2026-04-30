import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Sea urchin types with specific characteristics
 */
export enum UrchinType {
  REGULAR = 'regular',
  LONG_SPINED = 'long_spined',
  PENCIL = 'pencil',
  FIRE = 'fire',
  COLLECTOR = 'collector'
}

export interface UrchinConfig {
  type: UrchinType;
  bodySize: number;
  spineLength: number;
  spineCount: number;
  spineThickness: number;
  color: THREE.Color;
  spineColor: THREE.Color;
  tipColor?: THREE.Color;
  venomous: boolean;
  roughness: number;
}

/**
 * Generates procedural sea urchin meshes with detailed spines
 */
export class UrchinGenerator {
  private static materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private static spineGeometryCache = new Map<string, THREE.BufferGeometry>();

  /**
   * Generate a single sea urchin mesh
   */
  static generateUrchin(config: UrchinConfig): THREE.Group {
    const group = new THREE.Group();
    
    // Create body
    const bodyGeometry = this.createBodyGeometry(config);
    const bodyMaterial = this.getBodyMaterial(config);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Create spines
    const spineGeometry = this.getSpineGeometry(config);
    const spineMaterial = this.getSpineMaterial(config);
    
    // Distribute spines on sphere surface
    const spinePositions = this.distributeSpines(config.spineCount);
    
    for (const position of spinePositions) {
      const spine = new THREE.Mesh(spineGeometry, spineMaterial);
      
      // Position at body surface
      const direction = position.clone().normalize();
      spine.position.copy(direction.multiplyScalar(config.bodySize * 0.5));
      
      // Orient spine to point outward
      spine.lookAt(position);
      spine.rotateX(Math.PI / 2);
      
      // Random rotation around axis for variation
      spine.rotation.z = Math.random() * Math.PI * 2;
      
      group.add(spine);
    }
    
    group.userData.urchinData = { config };
    
    return group;
  }

  /**
   * Create urchin body geometry (hemispherical test)
   */
  private static createBodyGeometry(config: UrchinConfig): THREE.BufferGeometry {
    const { bodySize, type } = config;
    
    // Start with icosahedron for natural shape
    const geometry = new THREE.IcosahedronGeometry(bodySize * 0.5, 2);
    
    const positions = geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Flatten bottom slightly
      if (y < 0) {
        positions.setY(i, y * 0.7);
      }
      
      // Add surface texture based on type
      const noise = NoiseUtils.perlin3D(x * 2, y * 2, z * 2, 3);
      
      if (type === UrchinType.REGULAR || type === UrchinType.FIRE) {
        // Bumpy surface
        const bump = noise * 0.05 * bodySize;
        const scale = 1 + bump / bodySize;
        
        positions.setX(i, x * scale);
        positions.setY(i, y * scale);
        positions.setZ(i, z * scale);
      } else if (type === UrchinType.COLLECTOR) {
        // Smoother surface
        const smooth = noise * 0.02 * bodySize;
        const scale = 1 + smooth / bodySize;
        
        positions.setX(i, x * scale);
        positions.setZ(i, z * scale);
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Get or create spine geometry
   */
  private static getSpineGeometry(config: UrchinConfig): THREE.BufferGeometry {
    const key = `${config.type}-${config.spineLength}-${config.spineThickness}`;
    
    if (this.spineGeometryCache.has(key)) {
      return this.spineGeometryCache.get(key)!;
    }

    let geometry: THREE.BufferGeometry;
    
    switch (config.type) {
      case UrchinType.LONG_SPINED:
        // Long, thin spines
        geometry = this.createTaperedCylinder(
          config.spineLength,
          config.spineThickness * 0.3,
          config.spineThickness,
          8
        );
        break;
      
      case UrchinType.PENCIL:
        // Thick, blunt spines
        geometry = this.createTaperedCylinder(
          config.spineLength,
          config.spineThickness * 0.8,
          config.spineThickness,
          10
        );
        break;
      
      case UrchinType.FIRE:
        // Spines with barbs (simplified as segmented)
        geometry = this.createBarbedSpine(
          config.spineLength,
          config.spineThickness,
          6
        );
        break;
      
      case UrchinType.COLLECTOR:
        // Short, thick spines
        geometry = this.createTaperedCylinder(
          config.spineLength * 0.7,
          config.spineThickness * 0.6,
          config.spineThickness * 1.2,
          8
        );
        break;
      
      default:
        // Regular urchin - medium spines
        geometry = this.createTaperedCylinder(
          config.spineLength,
          config.spineThickness * 0.4,
          config.spineThickness,
          8
        );
    }

    this.spineGeometryCache.set(key, geometry);
    return geometry;
  }

  /**
   * Create tapered cylinder geometry
   */
  private static createTaperedCylinder(
    height: number,
    topRadius: number,
    baseRadius: number,
    radialSegments: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      topRadius,
      baseRadius,
      height,
      radialSegments,
      1,
      false
    );
    
    // Rotate to align with Y axis
    geometry.rotateX(Math.PI / 2);
    
    return geometry;
  }

  /**
   * Create barbed spine geometry (for fire urchin)
   */
  private static createBarbedSpine(
    height: number,
    baseThickness: number,
    segments: number
  ): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const segmentHeight = height / segments;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * height;
      
      // Taper from base to tip
      const radius = baseThickness * (1 - t * 0.8);
      
      // Add barbs (periodic bulges)
      const barbFreq = 4;
      const barbAmp = baseThickness * 0.15 * (1 - t);
      const barb = Math.sin(t * barbFreq * Math.PI) * barbAmp;
      
      points.push(new THREE.Vector3(radius + barb, y, 0));
    }
    
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, 0);
    
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].y);
    }
    
    shape.lineTo(0, height);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.LatheGeometry(shape, 8);
    return geometry;
  }

  /**
   * Distribute spine positions on sphere surface using Fibonacci sphere
   */
  private static distributeSpines(count: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    
    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      
      positions.push(new THREE.Vector3(x, y, z));
    }
    
    return positions;
  }

  /**
   * Get material for urchin body
   */
  private static getBodyMaterial(config: UrchinConfig): THREE.MeshStandardMaterial {
    const key = `body-${config.color.getHexString()}-${config.roughness}`;
    
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: 0.0
    });

    this.materialCache.set(key, material);
    return material;
  }

  /**
   * Get material for spines
   */
  private static getSpineMaterial(config: UrchinConfig): THREE.MeshStandardMaterial {
    const key = `spine-${config.spineColor.getHexString()}-${config.venomous}`;
    
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.spineColor,
      roughness: 0.3,
      metalness: 0.1,
      emissive: config.venomous ? (config.tipColor || config.spineColor) : new THREE.Color(0x000000),
      emissiveIntensity: config.venomous ? 0.2 : 0
    });

    this.materialCache.set(key, material);
    return material;
  }

  /**
   * Generate cluster of sea urchins
   */
  static generateCluster(
    config: UrchinConfig,
    count: number,
    area: { width: number; depth: number }
  ): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const urchin = this.generateUrchin(config);
      
      // Random position
      urchin.position.set(
        (Math.random() - 0.5) * area.width,
        config.bodySize * 0.5,
        (Math.random() - 0.5) * area.depth
      );
      
      // Random rotation
      urchin.rotation.y = Math.random() * Math.PI * 2;
      
      // Slight size variation
      const scale = 0.85 + Math.random() * 0.3;
      urchin.scale.set(scale, scale, scale);
      
      group.add(urchin);
    }
    
    return group;
  }

  /**
   * Get preset configurations for different urchin types
   */
  static getPreset(type: UrchinType): UrchinConfig {
    switch (type) {
      case UrchinType.REGULAR:
        return {
          type: UrchinType.REGULAR,
          bodySize: 0.12,
          spineLength: 0.08,
          spineCount: 80,
          spineThickness: 0.015,
          color: new THREE.Color(0x4a0080),
          spineColor: new THREE.Color(0x2d004d),
          venomous: false,
          roughness: 0.6
        };
      
      case UrchinType.LONG_SPINED:
        return {
          type: UrchinType.LONG_SPINED,
          bodySize: 0.1,
          spineLength: 0.25,
          spineCount: 100,
          spineThickness: 0.008,
          color: new THREE.Color(0x1a1a1a),
          spineColor: new THREE.Color(0x0d0d0d),
          tipColor: new THREE.Color(0xffffff),
          venomous: true,
          roughness: 0.4
        };
      
      case UrchinType.PENCIL:
        return {
          type: UrchinType.PENCIL,
          bodySize: 0.15,
          spineLength: 0.12,
          spineCount: 60,
          spineThickness: 0.025,
          color: new THREE.Color(0x8b4513),
          spineColor: new THREE.Color(0xa0522d),
          venomous: false,
          roughness: 0.5
        };
      
      case UrchinType.FIRE:
        return {
          type: UrchinType.FIRE,
          bodySize: 0.08,
          spineLength: 0.1,
          spineCount: 90,
          spineThickness: 0.01,
          color: new THREE.Color(0xff4500),
          spineColor: new THREE.Color(0xff6347),
          tipColor: new THREE.Color(0xffff00),
          venomous: true,
          roughness: 0.3
        };
      
      case UrchinType.COLLECTOR:
        return {
          type: UrchinType.COLLECTOR,
          bodySize: 0.18,
          spineLength: 0.06,
          spineCount: 50,
          spineThickness: 0.02,
          color: new THREE.Color(0x2f4f4f),
          spineColor: new THREE.Color(0x708090),
          venomous: false,
          roughness: 0.7
        };
      
      default:
        return this.getPreset(UrchinType.REGULAR);
    }
  }
}
