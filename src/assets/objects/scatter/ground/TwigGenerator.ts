import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Twig and branch types for forest floor debris
 */
export enum TwigType {
  SMALL_TWIG = 'small_twig',
  MEDIUM_BRANCH = 'medium_branch',
  LARGE_BRANCH = 'large_branch',
  TWISTED = 'twisted',
  STRAIGHT = 'straight'
}

/**
 * Bark texture types
 */
export enum BarkType {
  SMOOTH = 'smooth',
  ROUGH = 'rough',
  FURROWED = 'furrowed',
  PEELING = 'peeling'
}

export interface TwigConfig {
  twigType: TwigType;
  barkType: BarkType;
  density: number;           // twigs per square meter
  area: THREE.Vector2;       // coverage area
  lengthVariation: [number, number];
  radiusVariation: [number, number];
  mossCoverage?: number;     // 0-1 probability
  lichenCoverage?: number;   // 0-1 probability
  breakagePatterns?: boolean;
}

/**
 * Generates realistic twig and branch scatter for forest floors
 */
export class TwigGenerator {
  private static readonly BARK_COLORS: Record<BarkType, THREE.Color[]> = {
    [BarkType.SMOOTH]: [
      new THREE.Color(0x8b7355), new THREE.Color(0x9c8466),
      new THREE.Color(0xa89070), new THREE.Color(0x7d6548)
    ],
    [BarkType.ROUGH]: [
      new THREE.Color(0x6b5344), new THREE.Color(0x7a6251),
      new THREE.Color(0x8a7160), new THREE.Color(0x5c4638)
    ],
    [BarkType.FURROWED]: [
      new THREE.Color(0x4a3828), new THREE.Color(0x5a4635),
      new THREE.Color(0x6a5442), new THREE.Color(0x3a2a1f)
    ],
    [BarkType.PEELING]: [
      new THREE.Color(0x9c8b75), new THREE.Color(0xb09d85),
      new THREE.Color(0xc4af95), new THREE.Color(0x887760)
    ]
  };

  private static readonly MOSS_COLOR = new THREE.Color(0x4a7c23);
  private static readonly LICHEN_COLOR = new THREE.Color(0x8ba87f);

  /**
   * Generate twig scatter with instanced rendering
   */
  static generate(config: TwigConfig): THREE.InstancedMesh {
    const twigCount = Math.floor(config.density * config.area.x * config.area.y);
    const geometry = this.createTwigGeometry(config.twigType, config.barkType);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.1
    });

    const mesh = new THREE.InstancedMesh(geometry, material, twigCount);
    const dummy = new THREE.Object3D();
    const barkColors = this.BARK_COLORS[config.barkType];

    for (let i = 0; i < twigCount; i++) {
      const x = (Math.random() - 0.5) * config.area.x;
      const z = (Math.random() - 0.5) * config.area.y;
      const y = this.calculateHeight(x, z, config.area);

      dummy.position.set(x, y, z);

      // Random rotation
      dummy.rotation.set(
        (Math.random() - 0.5) * Math.PI,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI
      );

      // Length and radius variation
      const lengthRange = config.lengthVariation;
      const radiusRange = config.radiusVariation;
      const length = lengthRange[0] + Math.random() * (lengthRange[1] - lengthRange[0]);
      const radius = radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0]);
      
      dummy.scale.set(radius, length, radius);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Bark color variation
      const colorIndex = Math.floor(Math.random() * barkColors.length);
      const color = barkColors[colorIndex].clone();
      color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return mesh;
  }

  /**
   * Create twig/branch geometry based on type
   */
  private static createTwigGeometry(twigType: TwigType, barkType: BarkType): THREE.BufferGeometry {
    let geometry: THREE.BufferGeometry;

    switch (twigType) {
      case TwigType.SMALL_TWIG:
        geometry = new THREE.CylinderGeometry(0.02, 0.01, 0.3, 8);
        break;
      
      case TwigType.MEDIUM_BRANCH:
        geometry = new THREE.CylinderGeometry(0.05, 0.03, 0.6, 10);
        break;
      
      case TwigType.LARGE_BRANCH:
        geometry = new THREE.CylinderGeometry(0.08, 0.05, 1.0, 12);
        break;
      
      case TwigType.TWISTED:
        geometry = this.createTwistedBranch();
        break;
      
      case TwigType.STRAIGHT:
      default:
        geometry = new THREE.CylinderGeometry(0.04, 0.03, 0.5, 10);
        break;
    }

    geometry.rotateX(Math.PI / 2);

    // Add breakage patterns at ends
    if (TwigGenerator.shouldAddBreakage(twigType)) {
      this.addBreakagePatterns(geometry);
    }

    // Add bark detail using noise displacement
    this.addBarkDetail(geometry, barkType);

    return geometry;
  }

  /**
   * Create twisted branch geometry
   */
  private static createTwistedBranch(): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (t - 0.5) * 0.6;
      const y = Math.sin(t * Math.PI * 2) * 0.05;
      const z = Math.cos(t * Math.PI * 3) * 0.03;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 64, 0.03, 8, false);
    
    return geometry;
  }

  /**
   * Add breakage patterns to branch ends
   */
  private static addBreakagePatterns(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const length = positions.length / 3;

    for (let i = 0; i < length; i++) {
      const x = positions[i * 3];
      
      // Splinter effect at ends
      if (Math.abs(x) > 0.4) {
        const noise = NoiseUtils.perlin2D(i * 0.5, 0) * 0.02;
        positions[i * 3 + 1] += noise;
        positions[i * 3 + 2] += NoiseUtils.perlin2D(0, i * 0.5) * 0.02;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Add bark texture detail using vertex displacement
   */
  private static addBarkDetail(geometry: THREE.BufferGeometry, barkType: BarkType): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      let displacement = 0;
      switch (barkType) {
        case BarkType.SMOOTH:
          displacement = NoiseUtils.perlin2D(x * 10, y * 10) * 0.005;
          break;
        case BarkType.ROUGH:
          displacement = NoiseUtils.perlin2D(x * 15, y * 15) * 0.015;
          break;
        case BarkType.FURROWED:
          displacement = Math.sin(y * 20) * 0.02 + NoiseUtils.perlin2D(x * 5, z * 5) * 0.01;
          break;
        case BarkType.PEELING:
          displacement = NoiseUtils.perlin2D(x * 8, z * 8) * 0.01;
          if (displacement > 0.005) displacement *= 1.5; // Exaggerate peeling
          break;
      }

      // Apply displacement along normal
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      positions[i] += nx * displacement;
      positions[i + 1] += ny * displacement;
      positions[i + 2] += nz * displacement;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Determine if breakage patterns should be added
   */
  private static shouldAddBreakage(twigType: TwigType): boolean {
    return twigType !== TwigType.SMALL_TWIG;
  }

  /**
   * Calculate height based on terrain
   */
  private static calculateHeight(x: number, z: number, area: THREE.Vector2): number {
    const normalizedX = (x / area.x + 0.5) * 10;
    const normalizedZ = (z / area.y + 0.5) * 10;
    return NoiseUtils.perlin2D(normalizedX, normalizedZ) * 0.03;
  }

  /**
   * Generate twig clusters (fallen branch piles)
   */
  static generateClusters(config: TwigConfig, clusterCount: number): THREE.Group {
    const group = new THREE.Group();

    for (let i = 0; i < clusterCount; i++) {
      const clusterConfig: TwigConfig = {
        ...config,
        area: new THREE.Vector2(0.5, 0.5),
        density: config.density * 3
      };

      const cluster = this.generate(clusterConfig);
      
      const x = (Math.random() - 0.5) * config.area.x * 0.8;
      const z = (Math.random() - 0.5) * config.area.y * 0.8;
      cluster.position.set(x, 0, z);
      
      group.add(cluster);
    }

    return group;
  }

  /**
   * Add moss growth to twigs
   */
  static addMossGrowth(mesh: THREE.InstancedMesh, coverage: number): void {
    if (!mesh.instanceColor) return;

    const colors = mesh.instanceColor;
    for (let i = 0; i < mesh.count; i++) {
      if (Math.random() < coverage) {
        const baseColor = new THREE.Color();
        colors.getColorAt(i, baseColor);
        
        // Blend with moss color
        baseColor.lerp(TwigGenerator.MOSS_COLOR, 0.3 + Math.random() * 0.4);
        colors.setColorAt(i, baseColor);
      }
    }
    colors.needsUpdate = true;
  }

  /**
   * Add lichen growth to twigs
   */
  static addLichenGrowth(mesh: THREE.InstancedMesh, coverage: number): void {
    if (!mesh.instanceColor) return;

    const colors = mesh.instanceColor;
    for (let i = 0; i < mesh.count; i++) {
      if (Math.random() < coverage) {
        const baseColor = new THREE.Color();
        colors.getColorAt(i, baseColor);
        
        // Blend with lichen color
        baseColor.lerp(TwigGenerator.LICHEN_COLOR, 0.2 + Math.random() * 0.3);
        colors.setColorAt(i, baseColor);
      }
    }
    colors.needsUpdate = true;
  }
}
