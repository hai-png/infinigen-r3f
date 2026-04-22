/**
 * Grassland & Ground Cover Generators
 * 
 * Procedural generation of grass tufts, dandelions, wildflowers, and ground cover vegetation
 * Inspired by InfiniGen's grassland asset generators
 * 
 * @module assets/objects/grassland
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetOptions, LODLevel } from './base-generator';
import { SemanticTag, TagType } from '../../constraints/types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface GrassTuftOptions extends AssetOptions {
  /** Number of blades in the tuft (default: 30-60) */
  bladeCount?: number;
  /** Average blade length in meters (default: 0.05-0.15) */
  bladeLength?: number;
  /** Length variation (0-1, default: 0.3) */
  lengthVariation?: number;
  /** Curl amount in degrees (default: 10-70) */
  curlAmount?: number;
  /** Curl power for gradient effect (default: 1.2) */
  curlPower?: number;
  /** Blade width as percentage of length (default: 0.01-0.03) */
  bladeWidthPct?: number;
  /** Taper variation (0-1, default: 0.05) */
  taperVariation?: number;
  /** Base spread radius (default: length/4) */
  baseSpread?: number;
  /** Base angle variation in degrees (default: 15) */
  baseAngleVar?: number;
  /** Grass type: lawn, meadow, tall, reed (default: 'meadow') */
  grassType?: 'lawn' | 'meadow' | 'tall' | 'reed';
}

export interface DandelionOptions extends AssetOptions {
  /** Stem height (default: 0.15-0.3) */
  stemHeight?: number;
  /** Stem thickness (default: 0.002-0.004) */
  stemThickness?: number;
  /** Flower head radius (default: 0.015-0.025) */
  headRadius?: number;
  /** Number of seeds/petals (default: 80-150) */
  seedCount?: number;
  /** Seed parachute radius (default: 0.008-0.012) */
  parachuteRadius?: number;
  /** Growth stage: bud, blooming, seeded (default: 'blooming') */
  growthStage?: 'bud' | 'blooming' | 'seeded';
  /** Randomize seed positions (default: true) */
  randomizeSeeds?: boolean;
}

export interface FlowerOptions extends AssetOptions {
  /** Flower type: daisy, tulip, rose, sunflower, lavender (default: 'daisy') */
  flowerType?: 'daisy' | 'tulip' | 'rose' | 'sunflower' | 'lavender' | 'wildcard';
  /** Stem height (default: 0.1-0.4) */
  stemHeight?: number;
  /** Stem thickness (default: 0.002-0.005) */
  stemThickness?: number;
  /** Petal count (default: varies by type) */
  petalCount?: number;
  /** Petal length (default: 0.02-0.06) */
  petalLength?: number;
  /** Petal width (default: 0.01-0.03) */
  petalWidth?: number;
  /** Center radius (default: 0.01-0.03) */
  centerRadius?: number;
  /** Petal curl (0-1, default: 0.2) */
  petalCurl?: number;
  /** Wrinkle amount (0-1, default: 0.1) */
  wrinkleAmount?: number;
  /** Color preset: white, yellow, pink, purple, red, blue, mixed (default: 'mixed') */
  colorPreset?: 'white' | 'yellow' | 'pink' | 'purple' | 'red' | 'blue' | 'mixed';
}

export interface FlowerPlantOptions extends AssetOptions {
  /** Plant type: single, cluster, bush (default: 'cluster') */
  plantType?: 'single' | 'cluster' | 'bush';
  /** Number of flowers per plant (default: 1-8) */
  flowerCount?: number;
  /** Plant spread radius (default: 0.05-0.15) */
  spreadRadius?: number;
  /** Height variation (0-1, default: 0.3) */
  heightVariation?: number;
  /** Leaf density (0-1, default: 0.5) */
  leafDensity?: number;
  /** Flower options for each bloom */
  flowerOptions?: Partial<FlowerOptions>;
}

export interface GroundCoverOptions extends AssetOptions {
  /** Cover type: moss, lichen, clover, pebbles, leaves (default: 'clover') */
  coverType?: 'moss' | 'lichen' | 'clover' | 'pebbles' | 'leaves' | 'mixed';
  /** Coverage area radius (default: 0.2-0.5) */
  coverageRadius?: number;
  /** Density of elements (default: 50-200) */
  density?: number;
  /** Height range (default: 0.005-0.02) */
  heightRange?: [number, number];
  /** Scale variation (0-1, default: 0.4) */
  scaleVariation?: number;
  /** Rotation variation in degrees (default: 360) */
  rotationVariation?: number;
}

export type GrasslandOptions = 
  | GrassTuftOptions 
  | DandelionOptions 
  | FlowerOptions 
  | FlowerPlantOptions 
  | GroundCoverOptions;

// ============================================================================
// GRASS TUFT GENERATOR
// ============================================================================

export class GrassTuftGenerator extends BaseAssetGenerator<GrassTuftOptions> {
  readonly generatorName = 'GrassTuftGenerator';
  readonly version = '1.0.0';
  
  protected getDefaultOptions(): GrassTuftOptions {
    return {
      ...super.getDefaultOptions(),
      bladeCount: 45,
      bladeLength: 0.1,
      lengthVariation: 0.3,
      curlAmount: 40,
      curlPower: 1.2,
      bladeWidthPct: 0.02,
      taperVariation: 0.05,
      baseSpread: 0.025,
      baseAngleVar: 15,
      grassType: 'meadow',
    };
  }

  generate(options: Partial<GrassTuftOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    const group = new THREE.Group();
    
    const rng = this.createRNG(opts.seed);
    
    // Type-specific presets
    const presets = this.getGrassTypePreset(opts.grassType);
    const bladeCount = opts.bladeCount ?? presets.bladeCount;
    const bladeLength = opts.bladeLength ?? presets.bladeLength;
    const curlAmount = opts.curlAmount ?? presets.curlAmount;
    
    // Generate individual blades
    const blades: THREE.Mesh[] = [];
    const baseSpread = opts.baseSpread ?? (bladeLength / 4);
    
    for (let i = 0; i < bladeCount; i++) {
      // Random blade parameters
      const length = bladeLength * (1 + rng.gaussian() * opts.lengthVariation!);
      const width = length * (opts.bladeWidthPct! + rng.uniform(-0.005, 0.005));
      const curl = curlAmount * Math.pow(rng.uniform(0, 1), opts.curlPower!);
      const baseAngle = rng.uniform(0, Math.PI * 2);
      const baseRadius = rng.uniform(0, baseSpread);
      const angleOffset = rng.gaussian(0, THREE.MathUtils.degToRad(opts.baseAngleVar!));
      
      // Create curved blade geometry
      const bladeGeometry = this.createBladeGeometry(length, width, curl, opts.taperVariation!);
      
      // Position and rotate blade
      const blade = new THREE.Mesh(bladeGeometry, this.getGrassMaterial());
      
      const x = -baseRadius * Math.cos(baseAngle);
      const y = baseRadius * Math.sin(baseAngle);
      const z = -0.05 * bladeLength;
      
      blade.position.set(x, y, z);
      blade.rotation.set(Math.PI / 2, -Math.PI / 2, -baseAngle + angleOffset);
      blade.updateMatrix();
      blade.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      blade.applyMatrix4(new THREE.Matrix4().makeRotationZ(-baseAngle + angleOffset));
      
      blades.push(blade);
    }
    
    // Merge all blades into single mesh for performance
    const mergedGeometry = this.mergeGeometries(blades.map(b => b.geometry), blades.map(b => b.matrixWorld));
    const mergedMesh = new THREE.Mesh(mergedGeometry, this.getGrassMaterial());
    
    // Add semantic tags
    this.addSemanticTags(mergedMesh, [
      { type: TagType.OBJECT_CLASS, value: 'grass_tuft' },
      { type: TagType.MATERIAL_TYPE, value: 'grass' },
      { type: TagType.GROWTH_FORM, value: 'tuft' },
      { type: TagType.SIZE_CATEGORY, value: 'small' },
    ]);
    
    group.add(mergedMesh);
    
    // Generate LODs
    if (opts.generateLOD) {
      this.generateLODs(group, opts.lodLevels || this.getDefaultLODLevels());
    }
    
    // Generate collision geometry
    if (opts.generateCollision) {
      this.addCollisionGeometry(group, 'convex');
    }
    
    return group;
  }
  
  private getGrassTypePreset(type: string): any {
    const presets: Record<string, any> = {
      lawn: { bladeCount: 40, bladeLength: 0.05, curlAmount: 20 },
      meadow: { bladeCount: 45, bladeLength: 0.1, curlAmount: 40 },
      tall: { bladeCount: 35, bladeLength: 0.2, curlAmount: 60 },
      reed: { bladeCount: 25, bladeLength: 0.3, curlAmount: 30 },
    };
    return presets[type] || presets.meadow;
  }
  
  private createBladeGeometry(
    length: number,
    width: number,
    curlDegrees: number,
    taperVar: number
  ): THREE.BufferGeometry {
    const segments = 4;
    const curlRad = THREE.MathUtils.degToRad(curlDegrees);
    
    // Create curved path points
    const points: THREE.Vector3[] = [];
    let currentAngle = 0;
    const segmentLength = length / segments;
    
    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const angle = curlRad * Math.pow(progress, 1.2); // Curl power
      const arcLength = segmentLength * i;
      
      const x = (arcLength / curlRad) * Math.sin(angle);
      const z = (arcLength / curlRad) * (1 - Math.cos(angle));
      const y = 0;
      
      points.push(new THREE.Vector3(x, y, z));
    }
    
    // Create taper curve
    const taperPoints: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const widthScale = (1 - t) * (1 + rng?.gaussian(0, taperVar) || 0);
      taperPoints.push([t, Math.max(0, widthScale)]);
    }
    
    // Extrude along path with tapering
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, 0.001); // Thin blade
    shape.lineTo(-width / 2, 0.001);
    shape.closePath();
    
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: segments,
      bevelEnabled: false,
      extrudePath: new THREE.CatmullRomCurve3(points),
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Apply vertex colors for natural variation
    this.applyGrassVertexColors(geometry);
    
    return geometry;
  }
  
  private applyGrassVertexColors(geometry: THREE.BufferGeometry): void {
    const positionAttribute = geometry.getAttribute('position');
    const colors: number[] = [];
    
    const baseColor = new THREE.Color(0x4a7c23); // Grass green
    const tipColor = new THREE.Color(0x6b9b3a); // Lighter green
    
    for (let i = 0; i < positionAttribute.count; i++) {
      const y = positionAttribute.getY(i);
      const t = Math.max(0, Math.min(1, (y + 0.05) / 0.15)); // Normalize height
      
      const color = baseColor.clone().lerp(tipColor, t);
      colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  
  private getGrassMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x4a7c23,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
  }
  
  protected getDefaultLODLevels(): LODLevel[] {
    return [
      { distance: 0, complexity: 1.0 },
      { distance: 5, complexity: 0.7 },
      { distance: 15, complexity: 0.4 },
      { distance: 30, complexity: 0.2 },
    ];
  }
}

// ============================================================================
// DANDELION GENERATOR
// ============================================================================

export class DandelionGenerator extends BaseAssetGenerator<DandelionOptions> {
  readonly generatorName = 'DandelionGenerator';
  readonly version = '1.0.0';
  
  protected getDefaultOptions(): DandelionOptions {
    return {
      ...super.getDefaultOptions(),
      stemHeight: 0.22,
      stemThickness: 0.003,
      headRadius: 0.02,
      seedCount: 120,
      parachuteRadius: 0.01,
      growthStage: 'blooming',
      randomizeSeeds: true,
    };
  }
  
  generate(options: Partial<DandelionOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    const group = new THREE.Group();
    const rng = this.createRNG(opts.seed);
    
    // Generate stem
    const stemGeometry = new THREE.CylinderGeometry(
      opts.stemThickness! * 0.8,
      opts.stemThickness!,
      opts.stemHeight!,
      8,
      1
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d5c2e,
      roughness: 0.7,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = opts.stemHeight! / 2;
    group.add(stem);
    
    // Generate flower head based on growth stage
    if (opts.growthStage === 'bud') {
      this.addBudHead(group, opts, rng);
    } else if (opts.growthStage === 'blooming') {
      this.addBloomingHead(group, opts, rng);
    } else if (opts.growthStage === 'seeded') {
      this.addSeededHead(group, opts, rng);
    }
    
    // Add semantic tags
    this.addSemanticTags(group, [
      { type: TagType.OBJECT_CLASS, value: 'dandelion' },
      { type: TagType.PLANT_PART, value: opts.growthStage === 'seeded' ? 'seed_head' : 'flower' },
      { type: TagType.GROWTH_FORM, value: 'herbaceous' },
      { type: TagType.LIFE_CYCLE, value: 'perennial' },
    ]);
    
    // Generate LODs
    if (opts.generateLOD) {
      this.generateLODs(group, opts.lodLevels || this.getDefaultLODLevels());
    }
    
    // Generate collision geometry
    if (opts.generateCollision) {
      this.addCollisionGeometry(group, 'convex');
    }
    
    return group;
  }
  
  private addBudHead(group: THREE.Group, opts: DandelionOptions, rng: any): void {
    // Closed green bud
    const budGeometry = new THREE.SphereGeometry(opts.headRadius! * 0.7, 8, 8);
    const budMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d4a1e,
      roughness: 0.6,
    });
    const bud = new THREE.Mesh(budGeometry, budMaterial);
    bud.position.y = opts.stemHeight!;
    group.add(bud);
  }
  
  private addBloomingHead(group: THREE.Group, opts: DandelionOptions, rng: any): void {
    // Yellow flower head with petals
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    // Central disk
    const diskGeometry = new THREE.SphereGeometry(opts.headRadius! * 0.4, 8, 8);
    const diskMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.5,
    });
    const disk = new THREE.Mesh(diskGeometry, diskMaterial);
    headCenter.add(disk);
    
    // Petals arranged radially
    const petalCount = Math.floor(opts.seedCount! / 2);
    const petalLength = opts.headRadius! * 1.5;
    const petalWidth = opts.headRadius! * 0.3;
    
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petalShape = new THREE.Shape();
      petalShape.moveTo(0, -petalWidth / 2);
      petalShape.quadraticCurveTo(petalLength * 0.5, -petalWidth, petalLength, 0);
      petalShape.quadraticCurveTo(petalLength * 0.5, petalWidth, 0, petalWidth / 2);
      petalShape.closePath();
      
      const petalGeometry = new THREE.ExtrudeGeometry(petalShape, {
        depth: 0.001,
        bevelEnabled: false,
      });
      
      const petalMaterial = new THREE.MeshStandardMaterial({
        color: 0xffeb3b,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      
      const petal = new THREE.Mesh(petalGeometry, petalMaterial);
      petal.rotation.z = angle;
      petal.position.set(
        Math.cos(angle) * opts.headRadius! * 0.4,
        Math.sin(angle) * opts.headRadius! * 0.4,
        0
      );
      
      headCenter.add(petal);
    }
    
    group.add(headCenter);
  }
  
  private addSeededHead(group: THREE.Group, opts: DandelionOptions, rng: any): void {
    // White fluffy seed head
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    // Central receptacle
    const receptacleGeometry = new THREE.SphereGeometry(opts.headRadius! * 0.5, 8, 8);
    const receptacleMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
    });
    const receptacle = new THREE.Mesh(receptacleGeometry, receptacleMaterial);
    headCenter.add(receptacle);
    
    // Seeds with parachutes
    const seedCount = opts.seedCount!;
    const sphereRadius = opts.headRadius! * 1.8;
    
    for (let i = 0; i < seedCount; i++) {
      // Fibonacci sphere distribution for even spacing
      const phi = Math.acos(1 - 2 * (i + 0.5) / seedCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      
      const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
      const y = sphereRadius * Math.sin(phi) * Math.sin(theta);
      const z = sphereRadius * Math.cos(phi);
      
      // Seed
      const seedGeometry = new THREE.CylinderGeometry(0.0005, 0.001, 0.003, 4);
      const seedMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.8,
      });
      const seed = new THREE.Mesh(seedGeometry, seedMaterial);
      
      // Parachute (pappus)
      const parachuteGroup = new THREE.Group();
      const filamentCount = 8;
      const filamentLength = opts.parachuteRadius!;
      
      for (let j = 0; j < filamentCount; j++) {
        const filamentAngle = (j / filamentCount) * Math.PI * 2;
        const filamentGeometry = new THREE.CylinderGeometry(0.0002, 0.0002, filamentLength, 3);
        const filamentMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.3,
          transparent: true,
          opacity: 0.7,
        });
        const filament = new THREE.Mesh(filamentGeometry, filamentMaterial);
        filament.rotation.x = Math.PI / 4;
        filament.rotation.z = filamentAngle;
        filament.position.y = filamentLength / 2;
        parachuteGroup.add(filament);
      }
      
      seed.add(parachuteGroup);
      seed.position.set(x, y, z);
      seed.lookAt(new THREE.Vector3(0, 0, 0));
      
      headCenter.add(seed);
    }
    
    group.add(headCenter);
  }
  
  protected getDefaultLODLevels(): LODLevel[] {
    return [
      { distance: 0, complexity: 1.0 },
      { distance: 3, complexity: 0.6 },
      { distance: 10, complexity: 0.3 },
      { distance: 20, complexity: 0.1 },
    ];
  }
}

// ============================================================================
// FLOWER GENERATOR
// ============================================================================

export class FlowerGenerator extends BaseAssetGenerator<FlowerOptions> {
  readonly generatorName = 'FlowerGenerator';
  readonly version = '1.0.0';
  
  protected getDefaultOptions(): FlowerOptions {
    return {
      ...super.getDefaultOptions(),
      flowerType: 'daisy',
      stemHeight: 0.2,
      stemThickness: 0.003,
      petalCount: 12,
      petalLength: 0.04,
      petalWidth: 0.015,
      centerRadius: 0.015,
      petalCurl: 0.2,
      wrinkleAmount: 0.1,
      colorPreset: 'mixed',
    };
  }
  
  generate(options: Partial<FlowerOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    const group = new THREE.Group();
    const rng = this.createRNG(opts.seed);
    
    // Get type-specific defaults
    const typeDefaults = this.getFlowerTypeDefaults(opts.flowerType!);
    const finalOpts = { ...opts, ...typeDefaults };
    
    // Generate stem
    const stemGeometry = new THREE.CylinderGeometry(
      finalOpts.stemThickness! * 0.7,
      finalOpts.stemThickness!,
      finalOpts.stemHeight!,
      8,
      1
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d5c2e,
      roughness: 0.7,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = finalOpts.stemHeight! / 2;
    group.add(stem);
    
    // Generate flower head based on type
    switch (finalOpts.flowerType) {
      case 'daisy':
        this.addDaisyHead(group, finalOpts, rng);
        break;
      case 'tulip':
        this.addTulipHead(group, finalOpts, rng);
        break;
      case 'rose':
        this.addRoseHead(group, finalOpts, rng);
        break;
      case 'sunflower':
        this.addSunflowerHead(group, finalOpts, rng);
        break;
      case 'lavender':
        this.addLavenderHead(group, finalOpts, rng);
        break;
      default:
        this.addWildcardHead(group, finalOpts, rng);
    }
    
    // Add semantic tags
    this.addSemanticTags(group, [
      { type: TagType.OBJECT_CLASS, value: `flower_${finalOpts.flowerType}` },
      { type: TagType.PLANT_PART, value: 'flower' },
      { type: TagType.COLOR, value: finalOpts.colorPreset || 'mixed' },
    ]);
    
    // Generate LODs
    if (opts.generateLOD) {
      this.generateLODs(group, opts.lodLevels || this.getDefaultLODLevels());
    }
    
    // Generate collision geometry
    if (opts.generateCollision) {
      this.addCollisionGeometry(group, 'convex');
    }
    
    return group;
  }
  
  private getFlowerTypeDefaults(type: string): Partial<FlowerOptions> {
    const defaults: Record<string, Partial<FlowerOptions>> = {
      daisy: { petalCount: 12, petalLength: 0.04, centerRadius: 0.015, colorPreset: 'white' },
      tulip: { petalCount: 6, petalLength: 0.05, petalCurl: 0.4, colorPreset: 'mixed' },
      rose: { petalCount: 20, petalLength: 0.03, petalCurl: 0.5, wrinkleAmount: 0.2, colorPreset: 'red' },
      sunflower: { petalCount: 24, petalLength: 0.06, centerRadius: 0.03, colorPreset: 'yellow' },
      lavender: { petalCount: 8, petalLength: 0.015, stemHeight: 0.3, colorPreset: 'purple' },
      wildcard: { colorPreset: 'mixed' },
    };
    return defaults[type] || {};
  }
  
  private addDaisyHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    // Center disk
    const diskGeometry = new THREE.SphereGeometry(opts.centerRadius!, 8, 8);
    const diskMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.5,
    });
    const disk = new THREE.Mesh(diskGeometry, diskMaterial);
    headCenter.add(disk);
    
    // White petals
    const petalColor = this.getPetalColor(opts.colorPreset, rng);
    for (let i = 0; i < opts.petalCount!; i++) {
      const angle = (i / opts.petalCount!) * Math.PI * 2;
      const petal = this.createSimplePetal(opts.petalLength!, opts.petalWidth!, opts.petalCurl!, petalColor);
      petal.rotation.z = angle;
      petal.position.set(
        Math.cos(angle) * opts.centerRadius! * 0.8,
        Math.sin(angle) * opts.centerRadius! * 0.8,
        0
      );
      headCenter.add(petal);
    }
    
    group.add(headCenter);
  }
  
  private addTulipHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    const petalColor = this.getPetalColor(opts.colorPreset, rng);
    
    // Cup-shaped arrangement of petals
    for (let i = 0; i < opts.petalCount!; i++) {
      const angle = (i / opts.petalCount!) * Math.PI * 2;
      const petal = this.createTulipPetal(opts.petalLength!, opts.petalWidth!, opts.petalCurl!, petalColor);
      petal.rotation.z = angle;
      petal.rotation.x = Math.PI / 6; // Tilt outward
      headCenter.add(petal);
    }
    
    group.add(headCenter);
  }
  
  private addRoseHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    const petalColor = this.getPetalColor(opts.colorPreset, rng);
    
    // Spiral arrangement of layered petals
    const layers = 3;
    const petalsPerLayer = Math.floor(opts.petalCount! / layers);
    
    for (let layer = 0; layer < layers; layer++) {
      const layerRadius = opts.centerRadius! * (0.3 + layer * 0.4);
      const layerPetalLength = opts.petalLength! * (1 - layer * 0.2);
      
      for (let i = 0; i < petalsPerLayer; i++) {
        const angle = (i / petalsPerLayer) * Math.PI * 2 + layer * 0.3;
        const petal = this.createRosePetal(layerPetalLength, opts.petalWidth!, opts.petalCurl!, opts.wrinkleAmount!, petalColor);
        petal.rotation.z = angle;
        petal.position.set(
          Math.cos(angle) * layerRadius,
          Math.sin(angle) * layerRadius,
          layer * 0.005
        );
        headCenter.add(petal);
      }
    }
    
    group.add(headCenter);
  }
  
  private addSunflowerHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    // Large central disk with seeds pattern
    const diskGeometry = new THREE.CircleGeometry(opts.centerRadius!, 32);
    const diskMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(diskGeometry, diskMaterial);
    disk.rotation.x = Math.PI / 2;
    headCenter.add(disk);
    
    // Yellow ray petals
    const petalColor = new THREE.Color(0xffd700);
    const rayCount = opts.petalCount!;
    
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const petal = this.createSimplePetal(opts.petalLength!, opts.petalWidth! * 1.5, 0.1, petalColor);
      petal.rotation.z = angle;
      petal.position.set(
        Math.cos(angle) * opts.centerRadius! * 0.9,
        Math.sin(angle) * opts.centerRadius! * 0.9,
        0
      );
      headCenter.add(petal);
    }
    
    group.add(headCenter);
  }
  
  private addLavenderHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    const headCenter = new THREE.Group();
    headCenter.position.y = opts.stemHeight!;
    
    const petalColor = new THREE.Color(0x9b7ebd); // Lavender purple
    
    // Spike of small flowers
    const spikeLength = opts.petalLength! * 3;
    const whorlCount = 8;
    
    for (let w = 0; w < whorlCount; w++) {
      const whorlY = (w / whorlCount) * spikeLength;
      const whorlRadius = opts.centerRadius! * (1 - w / whorlCount);
      const flowersInWhorl = 4;
      
      for (let i = 0; i < flowersInWhorl; i++) {
        const angle = (i / flowersInWhorl) * Math.PI * 2;
        const floret = this.createLavenderFloret(opts.petalLength! * 0.5, petalColor);
        floret.position.set(
          Math.cos(angle) * whorlRadius,
          Math.sin(angle) * whorlRadius,
          whorlY
        );
        headCenter.add(floret);
      }
    }
    
    group.add(headCenter);
  }
  
  private addWildcardHead(group: THREE.Group, opts: FlowerOptions, rng: any): void {
    // Random wildflower type
    const types = ['daisy', 'tulip', 'rose'] as const;
    const randomType = types[Math.floor(rng.uniform(0, types.length))];
    const wildcardOpts = { ...opts, flowerType: randomType };
    const typeDefaults = this.getFlowerTypeDefaults(randomType);
    const finalOpts = { ...wildcardOpts, ...typeDefaults };
    
    switch (randomType) {
      case 'daisy':
        this.addDaisyHead(group, finalOpts, rng);
        break;
      case 'tulip':
        this.addTulipHead(group, finalOpts, rng);
        break;
      case 'rose':
        this.addRoseHead(group, finalOpts, rng);
        break;
    }
  }
  
  private createSimplePetal(length: number, width: number, curl: number, color: THREE.Color): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, -width / 2);
    shape.quadraticCurveTo(length * 0.5, -width * 0.8, length, 0);
    shape.quadraticCurveTo(length * 0.5, width * 0.8, 0, width / 2);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const petal = new THREE.Mesh(geometry, material);
    petal.rotation.x = curl * Math.PI;
    
    return petal;
  }
  
  private createTulipPetal(length: number, width: number, curl: number, color: THREE.Color): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, -width / 2);
    shape.quadraticCurveTo(length * 0.3, -width, length, 0);
    shape.quadraticCurveTo(length * 0.3, width, 0, width / 2);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    
    const petal = new THREE.Mesh(geometry, material);
    petal.rotation.x = curl * Math.PI;
    
    return petal;
  }
  
  private createRosePetal(length: number, width: number, curl: number, wrinkle: number, color: THREE.Color): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, -width / 2);
    shape.bezierCurveTo(length * 0.3, -width * 0.9, length * 0.7, -width * 0.9, length, 0);
    shape.bezierCurveTo(length * 0.7, width * 0.9, length * 0.3, width * 0.9, 0, width / 2);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false,
    });
    
    // Add wrinkle vertices
    this.addWrinkles(geometry, wrinkle);
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    
    const petal = new THREE.Mesh(geometry, material);
    petal.rotation.x = curl * Math.PI;
    
    return petal;
  }
  
  private createLavenderFloret(length: number, color: THREE.Color): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, -length / 3);
    shape.lineTo(length / 3, -length / 2);
    shape.lineTo(length / 2, 0);
    shape.lineTo(length / 3, length / 2);
    shape.lineTo(0, length / 3);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private addWrinkles(geometry: THREE.ExtrudeGeometry, amount: number): void {
    // Simplified wrinkle implementation
    // In production, would modify vertex positions
  }
  
  private getPetalColor(preset: string, rng: any): THREE.Color {
    const colors: Record<string, THREE.Color> = {
      white: new THREE.Color(0xffffff),
      yellow: new THREE.Color(0xffeb3b),
      pink: new THREE.Color(0xffb6c1),
      purple: new THREE.Color(0x9b7ebd),
      red: new THREE.Color(0xdc143c),
      blue: new THREE.Color(0x6495ed),
      mixed: new THREE.Color().setHSL(rng.uniform(0, 1), 0.7, 0.6),
    };
    return colors[preset] || colors.mixed;
  }
  
  protected getDefaultLODLevels(): LODLevel[] {
    return [
      { distance: 0, complexity: 1.0 },
      { distance: 2, complexity: 0.6 },
      { distance: 8, complexity: 0.3 },
      { distance: 15, complexity: 0.1 },
    ];
  }
}

// ============================================================================
// FLOWER PLANT GENERATOR (Cluster/Bush)
// ============================================================================

export class FlowerPlantGenerator extends BaseAssetGenerator<FlowerPlantOptions> {
  readonly generatorName = 'FlowerPlantGenerator';
  readonly version = '1.0.0';
  
  protected getDefaultOptions(): FlowerPlantOptions {
    return {
      ...super.getDefaultOptions(),
      plantType: 'cluster',
      flowerCount: 4,
      spreadRadius: 0.1,
      heightVariation: 0.3,
      leafDensity: 0.5,
      flowerOptions: {},
    };
  }
  
  generate(options: Partial<FlowerPlantOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    const group = new THREE.Group();
    const rng = this.createRNG(opts.seed);
    
    const flowerGen = new FlowerGenerator(opts.seed);
    
    // Generate multiple flowers based on plant type
    const actualFlowerCount = opts.plantType === 'single' ? 1 : 
                              opts.plantType === 'cluster' ? opts.flowerCount! :
                              opts.flowerCount! * 2; // bush has more
    
    for (let i = 0; i < actualFlowerCount; i++) {
      // Position flowers with variation
      let angle: number, radius: number;
      
      if (opts.plantType === 'single') {
        angle = 0;
        radius = 0;
      } else {
        angle = (i / actualFlowerCount) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
        radius = opts.spreadRadius! * rng.uniform(0.5, 1.0);
      }
      
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const heightVariation = 1 + rng.gaussian(0, opts.heightVariation!);
      
      // Create individual flower
      const flowerOpts = {
        ...opts.flowerOptions,
        stemHeight: 0.2 * heightVariation,
        seed: opts.seed + i,
        generateLOD: false, // LOD at plant level
        generateCollision: false,
      };
      
      const flower = flowerGen.generate(flowerOpts);
      flower.position.set(x, 0, z);
      group.add(flower);
      
      // Add leaves for cluster/bush types
      if (opts.plantType !== 'single' && rng.uniform(0, 1) < opts.leafDensity!) {
        const leafGroup = this.createLeafCluster(x, z, rng);
        group.add(leafGroup);
      }
    }
    
    // Add semantic tags
    this.addSemanticTags(group, [
      { type: TagType.OBJECT_CLASS, value: `flower_plant_${opts.plantType}` },
      { type: TagType.GROWTH_FORM, value: opts.plantType },
      { type: TagType.FLOWER_COUNT, value: actualFlowerCount.toString() },
    ]);
    
    // Generate LODs at plant level
    if (opts.generateLOD) {
      this.generateLODs(group, opts.lodLevels || this.getDefaultLODLevels());
    }
    
    // Generate collision geometry
    if (opts.generateCollision) {
      this.addCollisionGeometry(group, 'convex');
    }
    
    return group;
  }
  
  private createLeafCluster(x: number, z: number, rng: any): THREE.Group {
    const leafGroup = new THREE.Group();
    const leafCount = Math.floor(rng.uniform(3, 8));
    
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7c23,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    
    for (let i = 0; i < leafCount; i++) {
      const leafGeometry = new THREE.CircleGeometry(0.02, 6);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      
      const angle = rng.uniform(0, Math.PI * 2);
      const radius = rng.uniform(0, 0.05);
      
      leaf.position.set(
        x + radius * Math.cos(angle),
        rng.uniform(0, 0.05),
        z + radius * Math.sin(angle)
      );
      leaf.rotation.set(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, Math.PI * 2));
      
      leafGroup.add(leaf);
    }
    
    return leafGroup;
  }
  
  protected getDefaultLODLevels(): LODLevel[] {
    return [
      { distance: 0, complexity: 1.0 },
      { distance: 3, complexity: 0.7 },
      { distance: 10, complexity: 0.4 },
      { distance: 20, complexity: 0.2 },
    ];
  }
}

// ============================================================================
// GROUND COVER GENERATOR
// ============================================================================

export class GroundCoverGenerator extends BaseAssetGenerator<GroundCoverOptions> {
  readonly generatorName = 'GroundCoverGenerator';
  readonly version = '1.0.0';
  
  protected getDefaultOptions(): GroundCoverOptions {
    return {
      ...super.getDefaultOptions(),
      coverType: 'clover',
      coverageRadius: 0.3,
      density: 100,
      heightRange: [0.005, 0.015],
      scaleVariation: 0.4,
      rotationVariation: 360,
    };
  }
  
  generate(options: Partial<GroundCoverOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(this.getDefaultOptions(), options);
    const group = new THREE.Group();
    const rng = this.createRNG(opts.seed);
    
    const elements: THREE.Mesh[] = [];
    
    for (let i = 0; i < opts.density!; i++) {
      // Random position within coverage area
      const angle = rng.uniform(0, Math.PI * 2);
      const radius = rng.uniform(0, opts.coverageRadius!);
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      
      // Random scale and rotation
      const scale = 1 + rng.gaussian(0, opts.scaleVariation!);
      const rotation = rng.uniform(0, THREE.MathUtils.degToRad(opts.rotationVariation!));
      
      // Create element based on cover type
      let element: THREE.Mesh;
      
      switch (opts.coverType) {
        case 'moss':
          element = this.createMossElement(rng);
          break;
        case 'lichen':
          element = this.createLichenElement(rng);
          break;
        case 'clover':
          element = this.createCloverElement(rng);
          break;
        case 'pebbles':
          element = this.createPebbleElement(rng);
          break;
        case 'leaves':
          element = this.createLeafElement(rng);
          break;
        default:
          element = this.createMixedElement(rng);
      }
      
      element.position.set(x, rng.uniform(opts.heightRange![0], opts.heightRange![1]), z);
      element.scale.setScalar(scale);
      element.rotation.y = rotation;
      
      elements.push(element);
    }
    
    // Merge geometries for better performance
    if (elements.length > 0) {
      const mergedGeometry = this.mergeGeometries(
        elements.map(e => e.geometry),
        elements.map(e => e.matrixWorld)
      );
      const material = elements[0].material as THREE.Material;
      const mergedMesh = new THREE.Mesh(mergedGeometry, material);
      
      group.add(mergedMesh);
    }
    
    // Add semantic tags
    this.addSemanticTags(group, [
      { type: TagType.OBJECT_CLASS, value: `ground_cover_${opts.coverType}` },
      { type: TagType.COVERAGE_TYPE, value: opts.coverType || 'mixed' },
      { type: TagType.DENSITY, value: opts.density!.toString() },
    ]);
    
    // Generate LODs
    if (opts.generateLOD) {
      this.generateLODs(group, opts.lodLevels || this.getDefaultLODLevels());
    }
    
    // Generate collision geometry
    if (opts.generateCollision) {
      this.addCollisionGeometry(group, 'convex');
    }
    
    return group;
  }
  
  private createMossElement(rng: any): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(0.02, 0.02, 3, 3);
    
    // Add height variation for moss texture
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, rng.uniform(-0.002, 0.002));
    }
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x2d4a1e,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private createLichenElement(rng: any): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(0.015, 6);
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rng.uniform(0.2, 0.3), 0.5, 0.6),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private createCloverElement(rng: any): THREE.Mesh {
    const shape = new THREE.Shape();
    const leafSize = 0.01;
    
    // Three-leaf clover shape
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const cx = Math.cos(angle) * leafSize;
      const cy = Math.sin(angle) * leafSize;
      
      shape.moveTo(cx, cy);
      shape.absarc(cx, cy, leafSize * 0.6, 0, Math.PI * 2);
    }
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a7c23,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private createPebbleElement(rng: any): THREE.Mesh {
    const geometry = new THREE.DodecahedronGeometry(0.008, 0);
    
    // Slightly deform for natural look
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      positions.setX(i, positions.getX(i) * rng.uniform(0.8, 1.2));
      positions.setY(i, positions.getY(i) * rng.uniform(0.8, 1.2));
      positions.setZ(i, positions.getZ(i) * rng.uniform(0.8, 1.2));
    }
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rng.uniform(0.05, 0.15), 0.3, rng.uniform(0.4, 0.6)),
      roughness: 0.6,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private createLeafElement(rng: any): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(0.012, 6);
    
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rng.uniform(0.25, 0.35), 0.6, rng.uniform(0.3, 0.5)),
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    
    return new THREE.Mesh(geometry, material);
  }
  
  private createMixedElement(rng: any): THREE.Mesh {
    const types = ['moss', 'lichen', 'clover', 'pebbles', 'leaves'] as const;
    const randomType = types[Math.floor(rng.uniform(0, types.length))];
    
    switch (randomType) {
      case 'moss': return this.createMossElement(rng);
      case 'lichen': return this.createLichenElement(rng);
      case 'clover': return this.createCloverElement(rng);
      case 'pebbles': return this.createPebbleElement(rng);
      case 'leaves': return this.createLeafElement(rng);
      default: return this.createCloverElement(rng);
    }
  }
  
  protected getDefaultLODLevels(): LODLevel[] {
    return [
      { distance: 0, complexity: 1.0 },
      { distance: 2, complexity: 0.6 },
      { distance: 8, complexity: 0.3 },
      { distance: 15, complexity: 0.1 },
    ];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  GrassTuftGenerator,
  DandelionGenerator,
  FlowerGenerator,
  FlowerPlantGenerator,
  GroundCoverGenerator,
};

export type {
  GrassTuftOptions,
  DandelionOptions,
  FlowerOptions,
  FlowerPlantOptions,
  GroundCoverOptions,
  GrasslandOptions,
};
