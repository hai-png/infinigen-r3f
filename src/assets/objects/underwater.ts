/**
 * Underwater & Aquatic Plant Generators for InfiniGen R3F Port
 * 
 * Implements procedural generation of underwater vegetation including:
 * - Seaweed and kelp forests
 * - Sea anemones and coral tentacles
 * - Lily pads and water surface plants
 * - Underwater ground cover (sea grass, algae)
 * 
 * Based on original InfiniGen underwater scatter systems
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetResult, LODLevel } from './base-generator';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type SeaweedType = 'kelp' | 'ribbon' | 'feather' | 'spiral' | 'blade';
export type AnemoneType = 'tube' | 'bubble-tip' | 'carpet' | 'magnificent';
export type WaterPlantType = 'lily_pad' | 'lotus' | 'water_lily' | 'duckweed' | 'water_hyacinth';
export type GroundCoverType = 'sea_grass' | 'algae_mat' | 'coralline' | 'sand_dollar_field';

export interface SeaweedOptions {
  type: SeaweedType;
  height: number;
  width: number;
  segments: number;
  curvature: number;
  density: number;
  colorBase: THREE.Color;
  colorTip: THREE.Color;
  animationWave: boolean;
  seed?: number;
}

export interface AnemoneOptions {
  type: AnemoneType;
  baseRadius: number;
  height: number;
  tentacleCount: number;
  tentacleLength: number;
  tentacleThickness: number;
  colorBase: THREE.Color;
  colorTips: THREE.Color;
  pulseAnimation: boolean;
  seed?: number;
}

export interface WaterPlantOptions {
  type: WaterPlantType;
  padRadius: number;
  padSegments: number;
  stemHeight: number;
  flowerEnabled: boolean;
  flowerSize: number;
  petalCount: number;
  colorPad: THREE.Color;
  colorFlower: THREE.Color;
  seed?: number;
}

export interface UnderwaterGroundCoverOptions {
  type: GroundCoverType;
  coverageArea: number;
  density: number;
  height: number;
  colorPrimary: THREE.Color;
  colorSecondary: THREE.Color;
  variation: number;
  seed?: number;
}

export interface CoralTentacleOptions {
  baseRadius: number;
  height: number;
  tentacleCount: number;
  tentacleLength: number;
  curlAmount: number;
  color: THREE.Color;
  translucent: boolean;
  seed?: number;
}

// ============================================================================
// Seaweed Generator
// ============================================================================

export class SeaweedGenerator extends BaseAssetGenerator<SeaweedOptions> {
  protected getDefaultOptions(): SeaweedOptions {
    return {
      type: 'kelp',
      height: 2.0,
      width: 0.3,
      segments: 8,
      curvature: 0.5,
      density: 1.0,
      colorBase: new THREE.Color(0x2d5016),
      colorTip: new THREE.Color(0x4a7c23),
      animationWave: true,
      seed: undefined,
    };
  }

  generate(options: Partial<SeaweedOptions> = {}): AssetResult {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    this.seedRandom(opts.seed);

    let geometry: THREE.BufferGeometry;

    switch (opts.type) {
      case 'kelp':
        geometry = this.generateKelp(opts);
        break;
      case 'ribbon':
        geometry = this.generateRibbonSeaweed(opts);
        break;
      case 'feather':
        geometry = this.generateFeatherSeaweed(opts);
        break;
      case 'spiral':
        geometry = this.generateSpiralSeaweed(opts);
        break;
      case 'blade':
        geometry = this.generateBladeSeaweed(opts);
        break;
      default:
        geometry = this.generateKelp(opts);
    }

    const material = new THREE.MeshStandardMaterial({
      color: opts.colorBase,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      roughness: 0.6,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add wave animation data if enabled
    if (opts.animationWave) {
      mesh.userData.waveAnimation = {
        amplitude: 0.1 * opts.curvature,
        frequency: 2.0,
        speed: 1.5,
      };
    }

    return {
      mesh,
      geometry,
      materials: [material],
      boundingBox: new THREE.Box3().setFromObject(mesh),
      lodLevels: this.generateLODLevels(geometry, opts),
      collisionGeometry: this.createSimpleCollider(opts.height, opts.width),
      semanticTags: {
        category: 'underwater',
        subcategory: 'vegetation',
        type: 'seaweed',
        seaweedType: opts.type,
        height: opts.height,
        habitat: 'underwater',
      },
    };
  }

  private generateKelp(opts: SeaweedOptions): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const stipeCount = Math.floor(3 + this.random() * 3); // 3-5 stipes

    // Generate main stipes (stalks)
    for (let i = 0; i < stipeCount; i++) {
      const stipeHeight = opts.height * (0.7 + this.random() * 0.3);
      const points: THREE.Vector3[] = [];
      
      // Create curved path for stipe
      for (let j = 0; j <= opts.segments; j++) {
        const t = j / opts.segments;
        const y = t * stipeHeight;
        const curveOffset = Math.sin(t * Math.PI * 2) * opts.curvature * 0.3;
        points.push(new THREE.Vector3(curveOffset, y, 0));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const stipeGeometry = new THREE.TubeGeometry(curve, opts.segments, opts.width * 0.15, 6, false);
      geometries.push(stipeGeometry);

      // Add blades along stipe
      const bladeCount = Math.floor(4 + this.random() * 4);
      for (let b = 0; b < bladeCount; b++) {
        const bladePos = (b + 1) / (bladeCount + 1);
        const bladeY = bladePos * stipeHeight;
        const bladeGeometry = this.createKelpBlade(opts, bladeY);
        geometries.push(bladeGeometry);
      }
    }

    return geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];
  }

  private createKelpBlade(opts: SeaweedOptions, yPos: number): THREE.BufferGeometry {
    const bladeLength = opts.height * 0.3 * (0.8 + this.random() * 0.4);
    const bladeWidth = opts.width * (0.6 + this.random() * 0.4);
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(bladeWidth * 0.3, bladeLength * 0.5, 0, bladeLength);
    shape.quadraticCurveTo(-bladeWidth * 0.3, bladeLength * 0.5, 0, 0);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: opts.width * 0.05,
      bevelEnabled: false,
      steps: 1,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.translate(0, yPos, 0);
    geometry.rotateZ(Math.PI * 0.5 * (this.random() - 0.5));
    
    return geometry;
  }

  private generateRibbonSeaweed(opts: SeaweedOptions): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const ribbonCount = Math.floor(2 + this.random() * 3);

    for (let i = 0; i < ribbonCount; i++) {
      const height = opts.height * (0.8 + this.random() * 0.4);
      const width = opts.width * (0.5 + this.random() * 0.5);
      
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      
      // Wavy ribbon shape
      const segments = 12;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = Math.sin(t * Math.PI * 3) * width * 0.5;
        const y = t * height;
        if (j === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      
      // Complete the shape
      shape.lineTo(width * 0.3, height);
      shape.lineTo(-width * 0.3, height);
      shape.lineTo(0, 0);

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: opts.width * 0.03,
        bevelEnabled: false,
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(Math.PI * 0.5);
      geometries.push(geometry);
    }

    return geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];
  }

  private generateFeatherSeaweed(opts: SeaweedOptions): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    // Central stem
    const stemGeometry = new THREE.CylinderGeometry(
      opts.width * 0.08,
      opts.width * 0.12,
      opts.height,
      8
    );
    geometries.push(stemGeometry);

    // Feather-like branches
    const branchCount = Math.floor(8 + this.random() * 8);
    for (let i = 0; i < branchCount; i++) {
      const t = (i + 1) / (branchCount + 1);
      const y = t * opts.height * 0.9;
      const branchLength = opts.width * (0.8 - t * 0.4);
      
      // Left branch
      const leftBranch = new THREE.CylinderGeometry(
        opts.width * 0.03,
        opts.width * 0.02,
        branchLength,
        6
      );
      leftBranch.translate(branchLength * 0.5, y, 0);
      leftBranch.rotateZ(-Math.PI * 0.4);
      geometries.push(leftBranch);

      // Right branch
      const rightBranch = new THREE.CylinderGeometry(
        opts.width * 0.03,
        opts.width * 0.02,
        branchLength,
        6
      );
      rightBranch.translate(-branchLength * 0.5, y, 0);
      rightBranch.rotateZ(Math.PI * 0.4);
      geometries.push(rightBranch);
    }

    return geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];
  }

  private generateSpiralSeaweed(opts: SeaweedOptions): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const turns = 3;
    const totalPoints = opts.segments * turns;

    for (let i = 0; i <= totalPoints; i++) {
      const t = i / totalPoints;
      const angle = t * Math.PI * 2 * turns;
      const radius = opts.width * (0.3 + t * 0.4);
      const y = t * opts.height;

      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        )
      );
    }

    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, totalPoints, opts.width * 0.1, 8, false);
  }

  private generateBladeSeaweed(opts: SeaweedOptions): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const bladeCount = Math.floor(3 + this.random() * 4);

    for (let i = 0; i < bladeCount; i++) {
      const height = opts.height * (0.7 + this.random() * 0.5);
      const width = opts.width * (0.6 + this.random() * 0.4);
      
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(width * 0.5, height * 0.3, width, height * 0.7);
      shape.quadraticCurveTo(width * 0.5, height, 0, height);
      shape.quadraticCurveTo(-width * 0.5, height, -width, height * 0.7);
      shape.quadraticCurveTo(-width * 0.5, height * 0.3, 0, 0);

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: opts.width * 0.04,
        bevelEnabled: false,
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(Math.PI * 0.5);
      geometry.rotateY((this.random() - 0.5) * Math.PI * 0.5);
      geometries.push(geometry);
    }

    return geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];
  }

  private generateLODLevels(geometry: THREE.BufferGeometry, opts: SeaweedOptions): LODLevel[] {
    const levels: LODLevel[] = [];
    
    // LOD0: Full detail
    levels.push({ level: 0, geometry: geometry.clone() });
    
    // LOD1: Reduced segments
    const lod1 = geometry.clone();
    // Simplify by reducing vertex density (placeholder)
    levels.push({ level: 1, geometry: lod1 });
    
    // LOD2: Simple billboard proxy
    const lod2 = new THREE.PlaneGeometry(opts.width, opts.height, 1, 1);
    levels.push({ level: 2, geometry: lod2 });
    
    return levels;
  }

  private createSimpleCollider(height: number, width: number): THREE.BufferGeometry {
    return new THREE.CylinderGeometry(width * 0.5, width * 0.3, height, 8);
  }
}

// ============================================================================
// Sea Anemone Generator
// ============================================================================

export class AnemoneGenerator extends BaseAssetGenerator<AnemoneOptions> {
  protected getDefaultOptions(): AnemoneOptions {
    return {
      type: 'tube',
      baseRadius: 0.3,
      height: 0.4,
      tentacleCount: 24,
      tentacleLength: 0.5,
      tentacleThickness: 0.04,
      colorBase: new THREE.Color(0xff6b9d),
      colorTips: new THREE.Color(0x00ffcc),
      pulseAnimation: true,
      seed: undefined,
    };
  }

  generate(options: Partial<AnemoneOptions> = {}): AssetResult {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    this.seedRandom(opts.seed);

    const geometries: THREE.BufferGeometry[] = [];

    // Generate base body
    const baseGeometry = new THREE.CylinderGeometry(
      opts.baseRadius * 0.8,
      opts.baseRadius,
      opts.height * 0.3,
      16
    );
    geometries.push(baseGeometry);

    // Generate tentacles in spiral pattern
    for (let i = 0; i < opts.tentacleCount; i++) {
      const angle = (i / opts.tentacleCount) * Math.PI * 2;
      const radius = opts.baseRadius * (0.9 + this.random() * 0.2);
      
      const tentacleGeometry = this.createTentacle(opts, angle, radius);
      geometries.push(tentacleGeometry);
    }

    const geometry = geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];

    const material = new THREE.MeshStandardMaterial({
      color: opts.colorBase,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (opts.pulseAnimation) {
      mesh.userData.pulseAnimation = {
        amplitude: 0.05,
        frequency: 1.0,
        speed: 2.0,
      };
    }

    return {
      mesh,
      geometry,
      materials: [material],
      boundingBox: new THREE.Box3().setFromObject(mesh),
      lodLevels: this.generateLODLevels(geometry, opts),
      collisionGeometry: new THREE.CylinderGeometry(opts.baseRadius, opts.baseRadius, opts.height, 8),
      semanticTags: {
        category: 'underwater',
        subcategory: 'fauna',
        type: 'anemone',
        anemoneType: opts.type,
        habitat: 'reef',
      },
    };
  }

  private createTentacle(opts: AnemoneOptions, angle: number, radius: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const segments = 8;

    // Start at base
    const startX = Math.cos(angle) * radius;
    const startZ = Math.sin(angle) * radius;
    points.push(new THREE.Vector3(startX, opts.height * 0.3, startZ));

    // Curved tentacle path
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const yOffset = t * opts.tentacleLength;
      const curveOut = (1 - t) * 0.1;
      
      const x = Math.cos(angle) * (radius - t * radius * 0.5) + Math.cos(angle + Math.PI * 0.5) * curveOut;
      const z = Math.sin(angle) * (radius - t * radius * 0.5) + Math.sin(angle + Math.PI * 0.5) * curveOut;
      const y = opts.height * 0.3 + yOffset;

      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const thickness = opts.tentacleThickness * (1 - 0.5 * (1 - t));
    
    return new THREE.TubeGeometry(curve, segments, opts.tentacleThickness, 6, false);
  }

  private generateLODLevels(geometry: THREE.BufferGeometry, opts: AnemoneOptions): LODLevel[] {
    const levels: LODLevel[] = [];
    
    levels.push({ level: 0, geometry: geometry.clone() });
    
    // LOD1: Fewer tentacles
    const lod1 = geometry.clone();
    levels.push({ level: 1, geometry: lod1 });
    
    // LOD2: Simple sphere proxy
    const lod2 = new THREE.SphereGeometry(opts.baseRadius, 8, 8);
    levels.push({ level: 2, geometry: lod2 });
    
    return levels;
  }
}

// ============================================================================
// Water Surface Plant Generator
// ============================================================================

export class WaterPlantGenerator extends BaseAssetGenerator<WaterPlantOptions> {
  protected getDefaultOptions(): WaterPlantOptions {
    return {
      type: 'lily_pad',
      padRadius: 0.4,
      padSegments: 16,
      stemHeight: 0.0,
      flowerEnabled: false,
      flowerSize: 0.15,
      petalCount: 8,
      colorPad: new THREE.Color(0x228b22),
      colorFlower: new THREE.Color(0xffffff),
      seed: undefined,
    };
  }

  generate(options: Partial<WaterPlantOptions> = {}): AssetResult {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    this.seedRandom(opts.seed);

    const geometries: THREE.BufferGeometry[] = [];

    // Generate lily pad
    const padGeometry = this.createLilyPad(opts);
    geometries.push(padGeometry);

    // Generate stem if enabled
    if (opts.stemHeight > 0) {
      const stemGeometry = new THREE.CylinderGeometry(
        opts.padRadius * 0.05,
        opts.padRadius * 0.08,
        opts.stemHeight,
        8
      );
      stemGeometry.translate(0, opts.stemHeight * 0.5, 0);
      geometries.push(stemGeometry);
    }

    // Generate flower if enabled
    if (opts.flowerEnabled) {
      const flowerGeometry = this.createWaterFlower(opts);
      flowerGeometry.translate(0, opts.stemHeight, 0);
      geometries.push(flowerGeometry);
    }

    const geometry = geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];

    const material = new THREE.MeshStandardMaterial({
      color: opts.colorPad,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      geometry,
      materials: [material],
      boundingBox: new THREE.Box3().setFromObject(mesh),
      lodLevels: this.generateLODLevels(geometry, opts),
      collisionGeometry: new THREE.CylinderGeometry(opts.padRadius, opts.padRadius, 0.05, 8),
      semanticTags: {
        category: 'aquatic',
        subcategory: 'surface_plant',
        type: 'water_plant',
        waterPlantType: opts.type,
        hasFlower: opts.flowerEnabled,
        habitat: 'water_surface',
      },
    };
  }

  private createLilyPad(opts: WaterPlantOptions): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const centerCutout = opts.padRadius * 0.15;

    // Draw outer circle with notch
    for (let i = 0; i <= opts.padSegments; i++) {
      const angle = (i / opts.padSegments) * Math.PI * 2;
      const r = opts.padRadius * (0.95 + this.random() * 0.1);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    // Create V-shaped notch
    const notchAngle = Math.PI * 0.25;
    shape.lineTo(Math.cos(notchAngle) * centerCutout, Math.sin(notchAngle) * centerCutout);
    shape.lineTo(0, 0);
    shape.lineTo(Math.cos(-notchAngle) * centerCutout, Math.sin(-notchAngle) * centerCutout);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: opts.padRadius * 0.05,
      bevelEnabled: true,
      bevelThickness: opts.padRadius * 0.02,
      bevelSize: opts.padRadius * 0.02,
      bevelSegments: 2,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI * 0.5);
    
    // Add slight curvature to edges
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const dist = Math.sqrt(x * x + y * y);
      if (dist > opts.padRadius * 0.5) {
        positions[i + 2] = -Math.pow((dist - opts.padRadius * 0.5) / (opts.padRadius * 0.5), 2) * opts.padRadius * 0.2;
      }
    }
    geometry.attributes.position.needsUpdate = true;

    return geometry;
  }

  private createWaterFlower(opts: WaterPlantOptions): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    // Generate petals in circular arrangement
    for (let i = 0; i < opts.petalCount; i++) {
      const angle = (i / opts.petalCount) * Math.PI * 2;
      
      const petalShape = new THREE.Shape();
      petalShape.moveTo(0, 0);
      petalShape.quadraticCurveTo(
        opts.flowerSize * 0.3,
        opts.flowerSize * 0.5,
        0,
        opts.flowerSize
      );
      petalShape.quadraticCurveTo(
        -opts.flowerSize * 0.3,
        opts.flowerSize * 0.5,
        0,
        0
      );

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: opts.flowerSize * 0.05,
        bevelEnabled: false,
      };

      const petalGeometry = new THREE.ExtrudeGeometry(petalShape, extrudeSettings);
      petalGeometry.translate(0, 0, opts.flowerSize * 0.5);
      petalGeometry.rotateX(Math.PI * 0.3);
      petalGeometry.rotateZ(angle);
      
      geometries.push(petalGeometry);
    }

    // Center pistil
    const pistilGeometry = new THREE.SphereGeometry(opts.flowerSize * 0.3, 8, 8);
    pistilGeometry.translate(0, 0, opts.flowerSize * 0.2);
    geometries.push(pistilGeometry);

    return geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];
  }

  private generateLODLevels(geometry: THREE.BufferGeometry, opts: WaterPlantOptions): LODLevel[] {
    const levels: LODLevel[] = [];
    
    levels.push({ level: 0, geometry: geometry.clone() });
    
    const lod1 = geometry.clone();
    levels.push({ level: 1, geometry: lod1 });
    
    // LOD2: Simple disk proxy
    const lod2 = new THREE.CircleGeometry(opts.padRadius, 8);
    lod2.rotateX(-Math.PI * 0.5);
    levels.push({ level: 2, geometry: lod2 });
    
    return levels;
  }
}

// ============================================================================
// Underwater Ground Cover Generator
// ============================================================================

export class UnderwaterGroundCoverGenerator extends BaseAssetGenerator<UnderwaterGroundCoverOptions> {
  protected getDefaultOptions(): UnderwaterGroundCoverOptions {
    return {
      type: 'sea_grass',
      coverageArea: 2.0,
      density: 50,
      height: 0.3,
      colorPrimary: new THREE.Color(0x3d5c1f),
      colorSecondary: new THREE.Color(0x5a7c32),
      variation: 0.3,
      seed: undefined,
    };
  }

  generate(options: Partial<UnderwaterGroundCoverOptions> = {}): AssetResult {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    this.seedRandom(opts.seed);

    const geometries: THREE.BufferGeometry[] = [];

    switch (opts.type) {
      case 'sea_grass':
        this.generateSeaGrass(geometries, opts);
        break;
      case 'algae_mat':
        this.generateAlgaeMat(geometries, opts);
        break;
      case 'coralline':
        this.generateCoralline(geometries, opts);
        break;
      case 'sand_dollar_field':
        this.generateSandDollarField(geometries, opts);
        break;
    }

    const geometry = geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];

    const material = new THREE.MeshStandardMaterial({
      color: opts.colorPrimary,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      geometry,
      materials: [material],
      boundingBox: new THREE.Box3().setFromObject(mesh),
      lodLevels: [],
      collisionGeometry: new THREE.PlaneGeometry(opts.coverageArea, opts.coverageArea),
      semanticTags: {
        category: 'underwater',
        subcategory: 'ground_cover',
        type: 'underwater_ground_cover',
        groundCoverType: opts.type,
        coverage: opts.coverageArea,
        habitat: 'seafloor',
      },
    };
  }

  private generateSeaGrass(geometries: THREE.BufferGeometry[], opts: UnderwaterGroundCoverOptions) {
    const bladeCount = Math.floor(opts.density * (0.8 + this.random() * 0.4));
    
    for (let i = 0; i < bladeCount; i++) {
      const x = (this.random() - 0.5) * opts.coverageArea;
      const z = (this.random() - 0.5) * opts.coverageArea;
      const height = opts.height * (0.7 + this.random() * 0.6);
      const width = opts.height * 0.1 * (0.8 + this.random() * 0.4);

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(width * 0.3, height * 0.5, 0, height);
      shape.quadraticCurveTo(-width * 0.3, height * 0.5, 0, 0);

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: width * 0.1,
        bevelEnabled: false,
      };

      const bladeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      bladeGeometry.translate(x, height * 0.5, z);
      bladeGeometry.rotateX(Math.PI * 0.5);
      bladeGeometry.rotateY((this.random() - 0.5) * Math.PI * 0.5);
      
      geometries.push(bladeGeometry);
    }
  }

  private generateAlgaeMat(geometries: THREE.BufferGeometry[], opts: UnderwaterGroundCoverOptions) {
    const patchCount = Math.floor(opts.density * 0.3);
    
    for (let i = 0; i < patchCount; i++) {
      const x = (this.random() - 0.5) * opts.coverageArea;
      const z = (this.random() - 0.5) * opts.coverageArea;
      const radius = opts.height * (0.5 + this.random() * 1.0);

      const shape = new THREE.Shape();
      const segments = 12;
      for (let j = 0; j <= segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const r = radius * (0.8 + this.random() * 0.4);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (j === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      }
      shape.closePath();

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: opts.height * 0.1,
        bevelEnabled: false,
      };

      const patchGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      patchGeometry.translate(x, opts.height * 0.05, z);
      patchGeometry.rotateX(-Math.PI * 0.5);
      
      geometries.push(patchGeometry);
    }
  }

  private generateCoralline(geometries: THREE.BufferGeometry[], opts: UnderwaterGroundCoverOptions) {
    const crustCount = Math.floor(opts.density * 0.5);
    
    for (let i = 0; i < crustCount; i++) {
      const x = (this.random() - 0.5) * opts.coverageArea;
      const z = (this.random() - 0.5) * opts.coverageArea;
      const radius = opts.height * 0.3 * (0.5 + this.random() * 0.5);

      const crustGeometry = new THREE.DodecahedronGeometry(radius, 0);
      crustGeometry.scale(1, 0.3, 1);
      crustGeometry.translate(x, radius * 0.3, z);
      
      geometries.push(crustGeometry);
    }
  }

  private generateSandDollarField(geometries: THREE.BufferGeometry[], opts: UnderwaterGroundCoverOptions) {
    const count = Math.floor(opts.density * 0.1);
    
    for (let i = 0; i < count; i++) {
      const x = (this.random() - 0.5) * opts.coverageArea;
      const z = (this.random() - 0.5) * opts.coverageArea;
      const radius = opts.height * 0.5 * (0.8 + this.random() * 0.4);

      // Sand dollar shape (flat disk with pattern)
      const sandDollarGeometry = new THREE.CylinderGeometry(radius, radius, radius * 0.1, 16);
      sandDollarGeometry.translate(x, radius * 0.05, z);
      sandDollarGeometry.rotateX((this.random() - 0.5) * Math.PI * 0.5);
      sandDollarGeometry.rotateY(this.random() * Math.PI * 2);
      
      geometries.push(sandDollarGeometry);
    }
  }
}

// ============================================================================
// Coral Tentacle Generator (for soft corals)
// ============================================================================

export class CoralTentacleGenerator extends BaseAssetGenerator<CoralTentacleOptions> {
  protected getDefaultOptions(): CoralTentacleOptions {
    return {
      baseRadius: 0.5,
      height: 0.8,
      tentacleCount: 32,
      tentacleLength: 0.6,
      curlAmount: 0.5,
      color: new THREE.Color(0xff7f50),
      translucent: true,
      seed: undefined,
    };
  }

  generate(options: Partial<CoralTentacleOptions> = {}): AssetResult {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    this.seedRandom(opts.seed);

    const geometries: THREE.BufferGeometry[] = [];

    // Generate base polyp structure
    const baseGeometry = new THREE.CylinderGeometry(
      opts.baseRadius * 0.7,
      opts.baseRadius,
      opts.height * 0.2,
      16
    );
    geometries.push(baseGeometry);

    // Generate tentacles
    for (let i = 0; i < opts.tentacleCount; i++) {
      const angle = (i / opts.tentacleCount) * Math.PI * 2;
      const radius = opts.baseRadius * (0.9 + this.random() * 0.2);
      
      const tentacleGeometry = this.createCoralTentacle(opts, angle, radius);
      geometries.push(tentacleGeometry);
    }

    const geometry = geometries.length > 1 ? mergeGeometries(geometries)! : geometries[0];

    const material = new THREE.MeshStandardMaterial({
      color: opts.color,
      roughness: 0.3,
      metalness: 0.1,
      transparent: opts.translucent,
      opacity: opts.translucent ? 0.8 : 1.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return {
      mesh,
      geometry,
      materials: [material],
      boundingBox: new THREE.Box3().setFromObject(mesh),
      lodLevels: [],
      collisionGeometry: new THREE.CylinderGeometry(opts.baseRadius, opts.baseRadius, opts.height, 8),
      semanticTags: {
        category: 'underwater',
        subcategory: 'coral',
        type: 'soft_coral',
        coralType: 'tentacle',
        habitat: 'reef',
      },
    };
  }

  private createCoralTentacle(opts: CoralTentacleOptions, angle: number, radius: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const segments = 10;

    // Start position
    const startX = Math.cos(angle) * radius;
    const startZ = Math.sin(angle) * radius;
    points.push(new THREE.Vector3(startX, opts.height * 0.2, startZ));

    // Curved tentacle with spiral
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const yOffset = t * opts.tentacleLength;
      const spiral = Math.sin(t * Math.PI * 2) * opts.curlAmount * 0.2;
      const curveOut = (1 - t) * 0.15;
      
      const x = Math.cos(angle) * (radius - t * radius * 0.3) + Math.cos(angle + Math.PI * 0.5) * (curveOut + spiral);
      const z = Math.sin(angle) * (radius - t * radius * 0.3) + Math.sin(angle + Math.PI * 0.5) * (curveOut + spiral);
      const y = opts.height * 0.2 + yOffset;

      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const thickness = opts.baseRadius * 0.05 * (1 - t * 0.5);
    
    return new THREE.TubeGeometry(curve, segments, thickness, 6, false);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSeaweed(params: Partial<SeaweedOptions> = {}): AssetResult {
  const generator = new SeaweedGenerator();
  return generator.generate(params);
}

export function createAnemone(params: Partial<AnemoneOptions> = {}): AssetResult {
  const generator = new AnemoneGenerator();
  return generator.generate(params);
}

export function createWaterPlant(params: Partial<WaterPlantOptions> = {}): AssetResult {
  const generator = new WaterPlantGenerator();
  return generator.generate(params);
}

export function createUnderwaterGroundCover(params: Partial<UnderwaterGroundCoverOptions> = {}): AssetResult {
  const generator = new UnderwaterGroundCoverGenerator();
  return generator.generate(params);
}

export function createCoralTentacles(params: Partial<CoralTentacleOptions> = {}): AssetResult {
  const generator = new CoralTentacleGenerator();
  return generator.generate(params);
}
