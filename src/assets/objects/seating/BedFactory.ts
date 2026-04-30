/**
 * BedFactory - Procedural bed generator
 *
 * Ported from Infinigen's BedFactory (Princeton VL)
 * Generates complete beds with frame, mattress, pillows, and optional bedding
 */

import * as THREE from 'three';
import { AssetFactory, AssetParameters } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../core/util/math/index';
import { MeshUtils } from '../../utils/mesh';
import { BezierCurveGenerator } from '../../utils/curves';

export interface BedConfig {
  // Dimensions
  width: number;
  size: number;
  thickness: number;
  
  // Frame parameters
  legThickness: number;
  legHeight: number;
  backHeight: number;
  hasAllLegs: boolean;
  legDecorType: 'coiled' | 'pad' | 'plain' | 'legs';
  legDecorWrapped: boolean;
  
  // Mattress parameters
  mattressType: 'coiled' | 'wrapped';
  mattressWidthRatio: number;
  mattressSizeRatio: number;
  
  // Bedding parameters
  sheetType: 'quilt' | 'comforter' | 'box_comforter' | 'none';
  sheetFolded: boolean;
  hasCover: boolean;
  
  // Pillow parameters
  pillowCount: number;
  pillowType: 'standard' | 'king' | 'body';
  
  // Decorations
  seatSubdivisionsX: number;
  seatSubdivisionsY: number;
  dotDistance: number;
  dotSize: number;
  dotDepth: number;
  panelDistance: number;
  panelMargin: number;
}

export interface BedResult {
  mesh: THREE.Group;
  config: BedConfig;
  materials: THREE.Material[];
}

/**
 * Procedural bed generator with configurable frame, mattress, and bedding
 */
export class BedFactory extends AssetFactory<BedConfig, BedResult> {
  protected readonly sheetTypes = ['quilt', 'comforter', 'box_comforter', 'none'] as const;
  protected readonly mattressTypes = ['coiled', 'wrapped'] as const;
  protected readonly legDecorTypes = ['coiled', 'pad', 'plain', 'legs'] as const;
  protected readonly pillowTypes = ['standard', 'king', 'body'] as const;

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): BedConfig {
    return this.generateConfig();
  }

  generate(config?: Partial<BedConfig>): BedResult {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    return this.create(fullConfig);
  }

  /**
   * Create bed from configuration
   */
  generateConfig(): BedConfig {
    const rng = new SeededRandom(this.seed);
    
    return {
      // Base dimensions (1.4-2.4m width, 2-2.4m length)
      width: rng.logUniform(1.4, 2.4),
      size: rng.uniform(2, 2.4),
      thickness: rng.uniform(0.05, 0.12),
      
      // Frame
      legThickness: rng.uniform(0.08, 0.12),
      legHeight: rng.uniform(0.2, 0.6),
      backHeight: rng.uniform(0.5, 1.3),
      hasAllLegs: rng.uniform() < 0.2,
      legDecorType: weightedSample(this.legDecorTypes, rng),
      legDecorWrapped: rng.uniform() < 0.5,
      
      // Mattress
      mattressType: weightedSample(this.mattressTypes, rng),
      mattressWidthRatio: rng.uniform(0.88, 0.96),
      mattressSizeRatio: rng.uniform(0.88, 0.96),
      
      // Bedding
      sheetType: weightedSample(this.sheetTypes, rng),
      sheetFolded: rng.uniform() < 0.5,
      hasCover: rng.uniform() < 0.5,
      
      // Pillows
      pillowCount: Math.floor(rng.uniform(2, 6)),
      pillowType: weightedSample(this.pillowTypes, rng),
      
      // Decorations
      seatSubdivisionsX: Math.floor(rng.uniform(1, 4)),
      seatSubdivisionsY: Math.floor(rng.logUniform(4, 10)),
      dotDistance: rng.logUniform(0.16, 0.2),
      dotSize: rng.uniform(0.005, 0.02),
      dotDepth: rng.uniform(0.04, 0.08),
      panelDistance: rng.uniform(0.3, 0.5),
      panelMargin: rng.uniform(0.01, 0.02),
    };
  }

  /**
   * Create bed from configuration
   */
  create(config: BedConfig): BedResult {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];

    // Create bed frame
    const frame = this.createFrame(config);
    group.add(frame.mesh);
    materials.push(...frame.materials);

    // Create mattress
    const mattress = this.createMattress(config);
    group.add(mattress.mesh);
    materials.push(...mattress.materials);

    // Create pillows
    const pillows = this.createPillows(config);
    group.add(pillows.mesh);
    materials.push(...pillows.materials);

    // Create bedding if applicable
    if (config.sheetType !== 'none') {
      const bedding = this.createBedding(config);
      group.add(bedding.mesh);
      materials.push(...bedding.materials);
    }

    return {
      mesh: group,
      config,
      materials,
    };
  }

  /**
   * Create bed frame with headboard and legs
   */
  protected createFrame(config: BedConfig): BedResult {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];

    // Create base platform
    const platformGeometry = new THREE.BoxGeometry(
      config.width,
      config.thickness,
      config.size
    );
    const platformMaterial = this.createWoodMaterial();
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = config.legHeight + config.thickness / 2;
    group.add(platform);
    materials.push(platformMaterial);

    // Create legs
    const legPositions = [
      [-config.width / 2 + config.legThickness / 2, 0, -config.size / 2 + config.legThickness / 2],
      [config.width / 2 - config.legThickness / 2, 0, -config.size / 2 + config.legThickness / 2],
      [-config.width / 2 + config.legThickness / 2, 0, config.size / 2 - config.legThickness / 2],
      [config.width / 2 - config.legThickness / 2, 0, config.size / 2 - config.legThickness / 2],
    ];

    for (let i = 0; i < (config.hasAllLegs ? 4 : 2); i++) {
      const [x, y, z] = legPositions[i];
      const legGeometry = new THREE.BoxGeometry(
        config.legThickness,
        config.legHeight,
        config.legThickness
      );
      const legMaterial = this.createWoodMaterial();
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(x, config.legHeight / 2, z);
      group.add(leg);
      materials.push(legMaterial);

      // Add leg decorations
      if (config.legDecorType === 'coiled' || config.legDecorType === 'pad') {
        const decor = this.createLegDecor(config);
        decor.position.copy(leg.position);
        group.add(decor);
      }
    }

    // Create headboard
    const headboardGeometry = new THREE.BoxGeometry(
      config.width,
      config.backHeight,
      config.thickness
    );
    const headboardMaterial = this.createWoodMaterial();
    const headboard = new THREE.Mesh(headboardGeometry, headboardMaterial);
    headboard.position.set(0, config.legHeight + config.thickness + config.backHeight / 2, -config.size / 2 + config.thickness / 2);
    group.add(headboard);
    materials.push(headboardMaterial);

    // Add headboard decorations based on type
    this.decorateHeadboard(headboard, config);

    return {
      mesh: group,
      config,
      materials,
    };
  }

  /**
   * Create mattress
   */
  protected createMattress(config: BedConfig): BedResult {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];

    const mattressWidth = config.width * config.mattressWidthRatio;
    const mattressSize = config.size * config.mattressSizeRatio;
    const mattressThickness = 0.25;

    // Create mattress base
    const geometry = new THREE.BoxGeometry(mattressWidth, mattressThickness, mattressSize);
    const material = this.createFabricMaterial();
    const mattress = new THREE.Mesh(geometry, material);
    mattress.position.y = config.legHeight + config.thickness + mattressThickness / 2;
    group.add(mattress);
    materials.push(material);

    // Add quilted pattern for wrapped type
    if (config.mattressType === 'wrapped') {
      this.addQuiltingPattern(mattress, config);
    }

    return {
      mesh: group,
      config,
      materials,
    };
  }

  /**
   * Create pillows
   */
  protected createPillows(config: BedConfig): BedResult {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];

    const pillowDimensions = this.getPillowDimensions(config.pillowType);
    const material = this.createFabricMaterial();

    for (let i = 0; i < config.pillowCount; i++) {
      const geometry = new THREE.BoxGeometry(
        pillowDimensions[0],
        pillowDimensions[1],
        pillowDimensions[2]
      );
      const pillow = new THREE.Mesh(geometry, material);
      
      // Position pillows along headboard
      const spacing = config.width * 0.8 / config.pillowCount;
      const x = -config.width * 0.4 + spacing * (i + 0.5);
      pillow.position.set(
        x,
        config.legHeight + config.thickness + 0.25 + pillowDimensions[1] / 2,
        -config.size * 0.35
      );
      
      // Slight rotation for natural look
      pillow.rotation.z = (this.rng.uniform() - 0.5) * 0.2;
      pillow.rotation.x = (this.rng.uniform() - 0.5) * 0.1;
      
      group.add(pillow);
    }
    
    materials.push(material);

    return {
      mesh: group,
      config,
      materials,
    };
  }

  /**
   * Create bedding (quilt/comforter)
   */
  protected createBedding(config: BedConfig): BedResult {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];

    const material = this.createFabricMaterial();
    let geometry: THREE.BufferGeometry;

    switch (config.sheetType) {
      case 'quilt':
        geometry = new THREE.BoxGeometry(
          config.width * 1.5,
          0.05,
          config.size * 1.0
        );
        break;
      case 'comforter':
        geometry = new THREE.BoxGeometry(
          config.width * 1.6,
          0.08,
          config.size * 1.1
        );
        break;
      case 'box_comforter':
        geometry = new THREE.BoxGeometry(
          config.width * 1.7,
          0.1,
          config.size * 1.15
        );
        break;
      default:
        geometry = new THREE.BoxGeometry(0, 0, 0);
    }

    const bedding = new THREE.Mesh(geometry, material);
    bedding.position.y = config.legHeight + config.thickness + 0.25 + 0.05;
    
    if (config.sheetFolded) {
      // Fold at foot of bed
      bedding.position.z += config.size * 0.2;
      bedding.rotation.x = Math.PI * 0.1;
    }
    
    group.add(bedding);
    materials.push(material);

    // Add cover if applicable
    if (config.hasCover && config.sheetType !== 'none') {
      const coverGeometry = new THREE.BoxGeometry(
        config.width * 1.7,
        0.03,
        config.size * 0.35
      );
      const cover = new THREE.Mesh(coverGeometry, material);
      cover.position.set(
        0,
        bedding.position.y + 0.06,
        bedding.position.z - config.size * 0.3
      );
      group.add(cover);
    }

    return {
      mesh: group,
      config,
      materials,
    };
  }

  /**
   * Create leg decoration
   */
  protected createLegDecor(config: BedConfig): THREE.Mesh {
    const geometry = config.legDecorType === 'coiled'
      ? new THREE.CylinderGeometry(0.06, 0.04, 0.15, 8)
      : new THREE.BoxGeometry(0.1, 0.1, 0.1);
    
    const material = this.createWoodMaterial();
    const decor = new THREE.Mesh(geometry, material);
    decor.position.y = config.legHeight * 0.3;
    
    return decor;
  }

  /**
   * Add decorations to headboard
   */
  protected decorateHeadboard(headboard: THREE.Mesh, config: BedConfig): void {
    // Add panel details
    if (config.seatSubdivisionsX > 1) {
      const panelGroup = new THREE.Group();
      
      for (let i = 0; i < config.seatSubdivisionsX; i++) {
        const panelGeometry = new THREE.BoxGeometry(
          config.width / config.seatSubdivisionsX - config.panelMargin,
          config.backHeight * 0.6,
          0.02
        );
        const panel = new THREE.Mesh(panelGeometry, headboard.material);
        panel.position.set(
          -config.width / 2 + (config.width / config.seatSubdivisionsX) * (i + 0.5),
          config.backHeight * 0.3,
          config.thickness / 2 + 0.01
        );
        panelGroup.add(panel);
      }
      
      headboard.add(panelGroup);
    }
  }

  /**
   * Add quilting pattern to mattress
   */
  protected addQuiltingPattern(mattress: THREE.Mesh, config: BedConfig): void {
    // Could add bump map or displacement for quilting effect
    // For now, simple visual indication through material
  }

  /**
   * Get pillow dimensions based on type
   */
  protected getPillowDimensions(type: string): [number, number, number] {
    switch (type) {
      case 'king':
        return [0.9, 0.15, 0.5];
      case 'body':
        return [0.4, 0.15, 1.2];
      default: // standard
        return [0.65, 0.12, 0.45];
    }
  }

  /**
   * Create wood material for frame
   */
  protected createWoodMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: this.getRandomWoodColor(),
      roughness: 0.6,
      metalness: 0.1,
    });
  }

  /**
   * Create fabric material for mattress/bedding
   */
  protected createFabricMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: this.getRandomFabricColor(),
      roughness: 0.8,
      metalness: 0.0,
    });
  }

  /**
   * Get random wood color
   */
  protected getRandomWoodColor(): number {
    const colors = [0x8B4513, 0xA0522D, 0xCD853F, 0xDEB887, 0xD2691E];
    return colors[Math.floor(this.rng.uniform() * colors.length)];
  }

  /**
   * Get random fabric color
   */
  protected getRandomFabricColor(): number {
    const colors = [0xFFFFFF, 0xF5F5DC, 0xE6E6FA, 0xFFB6C1, 0xADD8E6, 0x90EE90];
    return colors[Math.floor(this.rng.uniform() * colors.length)];
  }
}
