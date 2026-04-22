/**
 * InfiniGen R3F - Insects & Arthropods Generators
 * 
 * Procedural generation of insects and arthropods including:
 * - Beetles (various species)
 * - Ants (workers, soldiers, queens)
 * - Butterflies & Moths
 * - Dragonflies & Damselflies
 * - Grasshoppers & Crickets
 * - Spiders (various families)
 * 
 * Features:
 * - Segmented body parts (head, thorax, abdomen)
 * - Multiple leg pairs with joint articulation
 * - Wing systems (elytra, membranous, scaled)
 * - Antennae variations
 * - Parametric proportions
 * - Seeded randomization
 * - LOD support
 * - Collision geometry
 * - Semantic tagging for constraints
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetOptions, LODLevel } from './base-generator';
import { createSeededRandom } from '../../utils/math-utils';

export interface InsectOptions extends AssetOptions {
  // Body proportions
  bodyLength?: number;
  bodyWidth?: number;
  bodyHeight?: number;
  
  // Segmentation
  abdominalSegments?: number;
  
  // Legs
  legCount?: number;
  legLength?: number;
  legThickness?: number;
  
  // Wings
  hasWings?: boolean;
  wingSpan?: number;
  wingType?: 'elytra' | 'membranous' | 'scaled' | 'none';
  wingPattern?: 'solid' | 'striped' | 'spotted' | 'veined';
  
  // Antennae
  antennaLength?: number;
  antennaType?: 'filiform' | 'clavate' | 'lamellate' | 'geniculate';
  
  // Coloration
  primaryColor?: THREE.Color;
  secondaryColor?: THREE.Color;
  patternIntensity?: number;
  
  // Specific types
  insectType?: 'beetle' | 'ant' | 'butterfly' | 'dragonfly' | 'grasshopper' | 'spider';
  caste?: 'worker' | 'soldier' | 'queen' | 'male'; // For social insects
  
  // Behavior hints
  isFlying?: boolean;
  isJumping?: boolean;
}

const defaultInsectOptions: InsectOptions = {
  ...AssetOptions.default(),
  bodyLength: 1.0,
  bodyWidth: 0.3,
  bodyHeight: 0.25,
  abdominalSegments: 6,
  legCount: 6,
  legLength: 0.4,
  legThickness: 0.05,
  hasWings: true,
  wingSpan: 1.5,
  wingType: 'membranous',
  wingPattern: 'veined',
  antennaLength: 0.3,
  antennaType: 'filiform',
  primaryColor: new THREE.Color(0x3d2817),
  secondaryColor: new THREE.Color(0x1a1a1a),
  patternIntensity: 0.5,
  insectType: 'beetle',
  caste: 'worker',
  isFlying: false,
  isJumping: false,
};

/**
 * Base Insect Generator
 * Provides common functionality for all insect types
 */
export class InsectGenerator extends BaseAssetGenerator<InsectOptions> {
  protected readonly defaultOptions: InsectOptions = defaultInsectOptions;
  
  constructor(options: Partial<InsectOptions> = {}) {
    super(options);
  }
  
  /**
   * Generate complete insect mesh
   */
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(options);
    const rng = createSeededRandom(opts.seed);
    const group = new THREE.Group();
    
    // Apply randomization to key parameters
    const bodyLength = opts.bodyLength! * (0.8 + rng() * 0.4);
    const bodyWidth = opts.bodyWidth! * (0.8 + rng() * 0.4);
    const bodyHeight = opts.bodyHeight! * (0.8 + rng() * 0.4);
    const legLength = opts.legLength! * (0.9 + rng() * 0.2);
    
    // Generate body segments
    const body = this.generateBody(bodyLength, bodyWidth, bodyHeight, opts);
    group.add(body);
    
    // Generate head with antennae
    const head = this.generateHead(bodyLength, bodyWidth, opts);
    group.add(head);
    
    // Generate legs
    const legs = this.generateLegs(bodyLength, bodyWidth, bodyHeight, legLength, opts);
    legs.forEach(leg => group.add(leg));
    
    // Generate wings if applicable
    if (opts.hasWings && opts.wingType !== 'none') {
      const wings = this.generateWings(bodyLength, opts);
      wings.forEach(wing => group.add(wing));
    }
    
    // Add collision geometry
    if (opts.generateCollision) {
      const collision = this.createCollisionGeometry(bodyLength, bodyWidth, bodyHeight);
      collision.name = `${opts.name || 'insect'}_collision`;
      collision.userData.isCollision = true;
      group.add(collision);
    }
    
    // Generate LODs
    if (opts.lodLevels && opts.lodLevels.length > 0) {
      this.generateLODs(group, opts);
    }
    
    // Tag for constraint system
    group.userData.semanticTags = {
      category: 'creature',
      subcategory: 'insect',
      type: opts.insectType,
      caste: opts.caste,
      isFlying: opts.isFlying,
      isJumping: opts.isJumping,
      legCount: opts.legCount,
      size: 'small',
      ...opts.extraTags,
    };
    
    return group;
  }
  
  /**
   * Generate segmented insect body
   */
  protected generateBody(length: number, width: number, height: number, opts: InsectOptions): THREE.Mesh {
    const segments = opts.abdominalSegments || 6;
    const segmentLength = length / segments;
    
    const bodyGroup = new THREE.Group();
    
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const segWidth = width * (0.7 + 0.3 * Math.sin(t * Math.PI));
      const segHeight = height * (0.8 + 0.2 * Math.cos(t * Math.PI));
      
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      geometry.scale(segmentLength * 0.5, segWidth * 0.5, segHeight * 0.5);
      
      const material = this.createInsectMaterial(opts, i / segments);
      const segment = new THREE.Mesh(geometry, material);
      segment.position.x = (i - segments / 2 + 0.5) * segmentLength;
      
      bodyGroup.add(segment);
    }
    
    bodyGroup.name = `${opts.name || 'insect'}_body`;
    return bodyGroup;
  }
  
  /**
   * Generate insect head with antennae
   */
  protected generateHead(bodyLength: number, bodyWidth: number, opts: InsectOptions): THREE.Group {
    const headGroup = new THREE.Group();
    
    // Head capsule
    const headSize = bodyWidth * 0.6;
    const headGeometry = new THREE.SphereGeometry(headSize, 16, 16);
    const headMaterial = this.createInsectMaterial(opts, 0);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.x = -(bodyLength / 2 + headSize * 0.3);
    headGroup.add(head);
    
    // Compound eyes
    const eyeSize = headSize * 0.35;
    const eyeGeometry = new THREE.SphereGeometry(eyeSize, 12, 12);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: opts.primaryColor || new THREE.Color(0x1a1a1a),
      roughness: 0.2,
      metalness: 0.1,
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-bodyLength / 2, eyeSize * 0.3, eyeSize * 0.8);
    headGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(-bodyLength / 2, eyeSize * 0.3, -eyeSize * 0.8);
    headGroup.add(rightEye);
    
    // Antennae
    const antennae = this.generateAntennae(opts);
    antennae.forEach(antenna => {
      antenna.position.x = -bodyLength / 2;
      headGroup.add(antenna);
    });
    
    headGroup.name = `${opts.name || 'insect'}_head`;
    return headGroup;
  }
  
  /**
   * Generate insect antennae based on type
   */
  protected generateAntennae(opts: InsectOptions): THREE.Mesh[] {
    const antennae: THREE.Mesh[] = [];
    const length = opts.antennaLength || 0.3;
    const type = opts.antennaType || 'filiform';
    const rng = createSeededRandom(opts.seed + 1000);
    
    const segments = type === 'lamellate' ? 8 : (type === 'geniculate' ? 3 : 12);
    const segmentLength = length / segments;
    
    for (let side = -1; side <= 1; side += 2) {
      const antennaGroup = new THREE.Group();
      
      for (let i = 0; i < segments; i++) {
        const segRadius = this.getAntennaSegmentRadius(i, segments, type, rng());
        const geometry = new THREE.CylinderGeometry(segRadius * 0.7, segRadius, segmentLength, 8);
        geometry.rotateZ(Math.PI / 2);
        
        const material = this.createInsectMaterial(opts, i / segments);
        const segment = new THREE.Mesh(geometry, material);
        
        if (i === 0) {
          segment.position.x = segmentLength * 0.5;
        } else {
          segment.position.x = segmentLength * 0.5;
          // Add angle for geniculate (elbowed) antennae
          if (type === 'geniculate' && i === 1) {
            segment.rotation.z = Math.PI / 3 * side;
          }
        }
        
        antennaGroup.add(segment);
        
        if (i < segments - 1) {
          antennaGroup.position.x += segmentLength;
        }
      }
      
      antennaGroup.position.y = 0.05;
      antennaGroup.position.z = side * 0.08;
      antennaGroup.rotation.y = side * Math.PI / 6;
      antennaGroup.rotation.z = -Math.PI / 8;
      
      antennae.push(antennaGroup);
    }
    
    return antennae;
  }
  
  /**
   * Get antenna segment radius based on type
   */
  protected getAntennaSegmentRadius(index: number, total: number, type: string, rng: number): number {
    const baseRadius = 0.02;
    
    switch (type) {
      case 'clavate': // Clubbed - thicker at end
        return baseRadius * (0.5 + 0.5 * (index / total));
      case 'lamellate': // Plate-like at end
        return index > total - 3 ? baseRadius * 2 : baseRadius;
      case 'geniculate': // Elbowed
        return baseRadius * (1 - 0.3 * index / total);
      default: // Filiform - thread-like, uniform
        return baseRadius * (1 - 0.3 * index / total);
    }
  }
  
  /**
   * Generate insect legs
   */
  protected generateLegs(
    bodyLength: number,
    bodyWidth: number,
    bodyHeight: number,
    legLength: number,
    opts: InsectOptions
  ): THREE.Mesh[] {
    const legs: THREE.Mesh[] = [];
    const legCount = opts.legCount || 6;
    const legPairs = legCount / 2;
    
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < legPairs; i++) {
        const leg = this.generateSingleLeg(legLength, i, legPairs, side, opts);
        
        // Position along body
        const t = i / (legPairs - 1);
        leg.position.x = (t - 0.5) * bodyLength * 0.8;
        leg.position.y = -bodyHeight * 0.5;
        leg.position.z = side * bodyWidth * 0.6;
        
        legs.push(leg);
      }
    }
    
    return legs;
  }
  
  /**
   * Generate a single insect leg with segments
   */
  protected generateSingleLeg(
    length: number,
    legIndex: number,
    totalLegs: number,
    side: number,
    opts: InsectOptions
  ): THREE.Group {
    const legGroup = new THREE.Group();
    const thickness = opts.legThickness || 0.05;
    const rng = createSeededRandom(opts.seed + legIndex * 100 + (side > 0 ? 500 : 0));
    
    // Leg segments: coxa, trochanter, femur, tibia, tarsus
    const segmentNames = ['coxa', 'trochanter', 'femur', 'tibia', 'tarsus'];
    const segmentRatios = [0.15, 0.1, 0.35, 0.3, 0.1];
    
    let cumulativeLength = 0;
    
    segmentNames.forEach((name, i) => {
      const segLength = length * segmentRatios[i];
      const segRadius = thickness * (1 - i * 0.15);
      
      const geometry = new THREE.CylinderGeometry(segRadius * 0.7, segRadius, segLength, 8);
      geometry.rotateZ(Math.PI / 2);
      
      const material = this.createInsectMaterial(opts, i / segmentNames.length);
      const segment = new THREE.Mesh(geometry, material);
      segment.position.x = cumulativeLength + segLength * 0.5;
      
      legGroup.add(segment);
      cumulativeLength += segLength;
      
      // Add joint spheres
      if (i < segmentNames.length - 1) {
        const jointGeometry = new THREE.SphereGeometry(segRadius * 1.2, 8, 8);
        const joint = new THREE.Mesh(jointGeometry, material);
        joint.position.x = cumulativeLength;
        legGroup.add(joint);
      }
    });
    
    // Rotate leg based on position
    const frontAngle = legIndex === 0 ? -Math.PI / 6 : (legIndex === 1 ? 0 : Math.PI / 6);
    legGroup.rotation.z = frontAngle * side;
    legGroup.rotation.y = side * Math.PI / 4;
    
    // Add variation
    legGroup.rotation.x = (rng() - 0.5) * 0.3;
    
    legGroup.name = `leg_${side > 0 ? 'right' : 'left'}_${legIndex + 1}`;
    return legGroup;
  }
  
  /**
   * Generate insect wings
   */
  protected generateWings(bodyLength: number, opts: InsectOptions): THREE.Mesh[] {
    const wings: THREE.Mesh[] = [];
    const wingSpan = opts.wingSpan || 1.5;
    const wingType = opts.wingType || 'membranous';
    const rng = createSeededRandom(opts.seed + 2000);
    
    // Wing shape based on type
    const wingShapes = this.getWingShape(wingType, wingSpan, bodyLength);
    
    for (let side = -1; side <= 1; side += 2) {
      const wingGeometry = new THREE.BufferGeometry();
      wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wingShapes[side > 0 ? 1 : 0], 3));
      wingGeometry.computeVertexNormals();
      
      const material = this.createWingMaterial(opts, wingType);
      const wing = new THREE.Mesh(wingGeometry, material);
      
      // Position at thorax
      wing.position.x = -bodyLength * 0.1;
      wing.position.y = 0.05;
      wing.position.z = side * 0.02;
      
      // Angle wings slightly
      wing.rotation.x = Math.PI / 2;
      wing.rotation.z = side * (opts.isFlying ? 0 : Math.PI / 8);
      
      if (side < 0) {
        wing.scale.z = -1;
      }
      
      wings.push(wing);
    }
    
    return wings;
  }
  
  /**
   * Get wing vertex positions based on type
   */
  protected getWingShape(type: string, span: number, bodyLength: number): number[][] {
    const halfSpan = span / 2;
    const wingLength = bodyLength * 0.8;
    
    // Simple wing shapes - can be expanded
    const shapes: { [key: string]: number[][] } = {
      elytra: [ // Beetle forewings (hardened)
        [
          0, 0, 0,
          wingLength, -halfSpan * 0.3, 0,
          wingLength, -halfSpan, 0,
          0, -halfSpan * 0.8, 0,
        ],
        [
          0, 0, 0,
          0, halfSpan * 0.8, 0,
          wingLength, halfSpan, 0,
          wingLength, halfSpan * 0.3, 0,
        ],
      ],
      membranous: [ // Dragonfly, wasp
        [
          0, 0, 0,
          wingLength * 0.3, -halfSpan * 0.5, 0,
          wingLength, -halfSpan * 0.3, 0,
          wingLength * 0.7, -halfSpan, 0,
          0, -halfSpan * 0.7, 0,
        ],
        [
          0, 0, 0,
          0, halfSpan * 0.7, 0,
          wingLength * 0.7, halfSpan, 0,
          wingLength, halfSpan * 0.3, 0,
          wingLength * 0.3, halfSpan * 0.5, 0,
        ],
      ],
      scaled: [ // Butterfly
        [
          0, 0, 0,
          wingLength * 0.5, -halfSpan * 0.8, 0,
          wingLength, -halfSpan, 0,
          wingLength * 0.3, -halfSpan * 1.2, 0,
          0, -halfSpan * 0.6, 0,
        ],
        [
          0, 0, 0,
          0, halfSpan * 0.6, 0,
          wingLength * 0.3, halfSpan * 1.2, 0,
          wingLength, halfSpan, 0,
          wingLength * 0.5, halfSpan * 0.8, 0,
        ],
      ],
    };
    
    return shapes[type] || shapes.membranous;
  }
  
  /**
   * Create insect exoskeleton material
   */
  protected createInsectMaterial(opts: InsectOptions, position: number): THREE.Material {
    const primaryColor = opts.primaryColor || new THREE.Color(0x3d2817);
    const secondaryColor = opts.secondaryColor || new THREE.Color(0x1a1a1a);
    const intensity = opts.patternIntensity || 0.5;
    
    // Mix colors based on position
    const color = primaryColor.clone().lerp(secondaryColor, position * intensity);
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4 + position * 0.3,
      metalness: 0.1 + position * 0.2,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
  }
  
  /**
   * Create wing material
   */
  protected createWingMaterial(opts: InsectOptions, wingType: string): THREE.Material {
    const primaryColor = opts.primaryColor || new THREE.Color(0x3d2817);
    
    if (wingType === 'elytra') {
      // Hardened forewings (beetles)
      return new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.3,
        metalness: 0.2,
      });
    } else if (wingType === 'scaled') {
      // Butterfly wings with scales
      return new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
    } else {
      // Membranous wings (transparent)
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffffff),
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
    }
  }
  
  /**
   * Create collision geometry for insect
   */
  protected createCollisionGeometry(length: number, width: number, height: number): THREE.Mesh {
    const geometry = new THREE.CapsuleGeometry(width * 0.5, length - width, 4, 8);
    geometry.rotateY(Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({ visible: false });
    return new THREE.Mesh(geometry, material);
  }
}

/**
 * Specialized Beetle Generator
 */
export class BeetleGenerator extends InsectGenerator {
  constructor(options: Partial<InsectOptions> = {}) {
    super({
      ...options,
      insectType: 'beetle',
      wingType: 'elytra',
      bodyWidth: 0.4,
      bodyHeight: 0.3,
      hasWings: true,
    });
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const beetleTypes = ['ground', 'stag', 'rhinoceros', 'ladybug', 'longhorn', 'jewel'];
    const type = options.beetleType || beetleTypes[Math.floor(createSeededRandom(options.seed || 0)() * beetleTypes.length)];
    
    const opts: Partial<InsectOptions> = {
      ...options,
      name: `beetle_${type}`,
    };
    
    // Customize based on type
    switch (type) {
      case 'stag':
        opts.bodyLength = 1.5;
        opts.primaryColor = new THREE.Color(0x4a3728);
        break;
      case 'rhinoceros':
        opts.bodyLength = 1.8;
        opts.bodyHeight = 0.5;
        opts.primaryColor = new THREE.Color(0x3d2817);
        break;
      case 'ladybug':
        opts.bodyLength = 0.6;
        opts.bodyWidth = 0.5;
        opts.primaryColor = new THREE.Color(0xcc0000);
        opts.patternIntensity = 0.8;
        break;
      case 'jewel':
        opts.primaryColor = new THREE.Color(0x00aa66);
        opts.secondaryColor = new THREE.Color(0x004422);
        break;
    }
    
    return super.generate(opts);
  }
}

/**
 * Specialized Ant Generator
 */
export class AntGenerator extends InsectGenerator {
  constructor(options: Partial<InsectOptions> = {}) {
    super({
      ...options,
      insectType: 'ant',
      wingType: 'none',
      hasWings: false,
      bodyWidth: 0.15,
      antennaType: 'geniculate',
    });
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const castes: Array<'worker' | 'soldier' | 'queen' | 'male'> = ['worker', 'soldier', 'queen', 'male'];
    const caste = options.caste || castes[Math.floor(createSeededRandom(options.seed || 0)() * castes.length)];
    
    const opts: Partial<InsectOptions> = {
      ...options,
      caste,
      name: `ant_${caste}`,
    };
    
    // Customize based on caste
    switch (caste) {
      case 'worker':
        opts.bodyLength = 0.5;
        opts.bodyWidth = 0.12;
        break;
      case 'soldier':
        opts.bodyLength = 0.7;
        opts.bodyWidth = 0.18;
        opts.headSize = 1.5;
        break;
      case 'queen':
        opts.bodyLength = 1.2;
        opts.bodyWidth = 0.25;
        opts.hasWings = true;
        opts.wingType = 'membranous';
        break;
      case 'male':
        opts.bodyLength = 0.6;
        opts.hasWings = true;
        opts.wingType = 'membranous';
        break;
    }
    
    return super.generate(opts);
  }
}

/**
 * Specialized Butterfly Generator
 */
export class ButterflyGenerator extends InsectGenerator {
  constructor(options: Partial<InsectOptions> = {}) {
    super({
      ...options,
      insectType: 'butterfly',
      wingType: 'scaled',
      wingSpan: 2.0,
      bodyWidth: 0.15,
      antennaType: 'clavate',
      isFlying: true,
    });
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const butterflyTypes = ['monarch', 'swallowtail', 'morphism', 'blue', 'owl'];
    const type = options.butterflyType || butterflyTypes[Math.floor(createSeededRandom(options.seed || 0)() * butterflyTypes.length)];
    
    const opts: Partial<InsectOptions> = {
      ...options,
      name: `butterfly_${type}`,
    };
    
    // Customize based on type
    switch (type) {
      case 'monarch':
        opts.primaryColor = new THREE.Color(0xff6600);
        opts.secondaryColor = new THREE.Color(0x000000);
        opts.wingPattern = 'striped';
        break;
      case 'swallowtail':
        opts.primaryColor = new THREE.Color(0xffff00);
        opts.secondaryColor = new THREE.Color(0x000000);
        opts.wingSpan = 2.5;
        break;
      case 'blue':
        opts.primaryColor = new THREE.Color(0x4488ff);
        opts.secondaryColor = new THREE.Color(0x224488);
        break;
      case 'owl':
        opts.primaryColor = new THREE.Color(0x8b4513);
        opts.wingPattern = 'spotted';
        break;
    }
    
    return super.generate(opts);
  }
}

/**
 * Specialized Dragonfly Generator
 */
export class DragonflyGenerator extends InsectGenerator {
  constructor(options: Partial<InsectOptions> = {}) {
    super({
      ...options,
      insectType: 'dragonfly',
      wingType: 'membranous',
      wingSpan: 2.5,
      bodyLength: 1.5,
      bodyWidth: 0.12,
      antennaLength: 0.1,
      isFlying: true,
    });
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const dragonflyTypes = ['darner', 'skimmer', 'hawker', 'darter', 'emperor'];
    const type = options.dragonflyType || dragonflyTypes[Math.floor(createSeededRandom(options.seed || 0)() * dragonflyTypes.length)];
    
    const opts: Partial<InsectOptions> = {
      ...options,
      name: `dragonfly_${type}`,
    };
    
    // Customize based on type
    switch (type) {
      case 'emperor':
        opts.primaryColor = new THREE.Color(0x0066cc);
        opts.bodyLength = 2.0;
        opts.wingSpan = 3.0;
        break;
      case 'skimmer':
        opts.primaryColor = new THREE.Color(0xff4444);
        break;
      case 'hawker':
        opts.primaryColor = new THREE.Color(0x228822);
        break;
    }
    
    return super.generate(opts);
  }
}

/**
 * Specialized Grasshopper Generator
 */
export class GrasshopperGenerator extends InsectGenerator {
  constructor(options: Partial<InsectOptions> = {}) {
    super({
      ...options,
      insectType: 'grasshopper',
      wingType: 'elytra',
      bodyLength: 1.2,
      legLength: 0.8,
      isJumping: true,
    });
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const grasshopperTypes = ['locust', 'katydid', 'cricket', 'short-horn', 'long-horn'];
    const type = options.grasshopperType || grasshopperTypes[Math.floor(createSeededRandom(options.seed || 0)() * grasshopperTypes.length)];
    
    const opts: Partial<InsectOptions> = {
      ...options,
      name: `grasshopper_${type}`,
    };
    
    // Customize based on type
    switch (type) {
      case 'locust':
        opts.primaryColor = new THREE.Color(0x8b8000);
        opts.bodyLength = 1.5;
        break;
      case 'katydid':
        opts.primaryColor = new THREE.Color(0x228822);
        opts.wingSpan = 2.0;
        break;
      case 'cricket':
        opts.primaryColor = new THREE.Color(0x3d2817);
        opts.bodyLength = 0.8;
        break;
    }
    
    return super.generate(opts);
  }
}

/**
 * Specialized Spider Generator (Arachnid, not insect, but included here)
 */
export class SpiderGenerator extends BaseAssetGenerator<InsectOptions> {
  protected readonly defaultOptions: InsectOptions = {
    ...defaultInsectOptions,
    insectType: 'spider',
    legCount: 8,
    bodyWidth: 0.4,
    bodyHeight: 0.35,
    hasWings: false,
    wingType: 'none',
  };
  
  constructor(options: Partial<InsectOptions> = {}) {
    super(options);
  }
  
  generate(options: Partial<InsectOptions> = {}): THREE.Group {
    const opts = this.mergeOptions(options);
    const rng = createSeededRandom(opts.seed);
    const group = new THREE.Group();
    
    const spiderTypes = ['wolf', 'jumping', 'orb-weaver', 'tarantula', 'black-widow'];
    const type = options.spiderType || spiderTypes[Math.floor(rng() * spiderTypes.length)];
    
    // Cephalothorax and abdomen
    const cephalothorax = this.generateCephalothorax(opts);
    group.add(cephalothorax);
    
    const abdomen = this.generateAbdomen(opts);
    group.add(abdomen);
    
    // 8 legs
    const legs = this.generateSpiderLegs(opts);
    legs.forEach(leg => group.add(leg));
    
    // Pedipalps
    const pedipalps = this.generatePedipalps(opts);
    pedipalps.forEach(palp => group.add(palp));
    
    // Spinnerets (for web-building spiders)
    if (type === 'orb-weaver' || type === 'black-widow') {
      const spinnerets = this.generateSpinnerets(opts);
      group.add(spinnerets);
    }
    
    // Tag for constraint system
    group.userData.semanticTags = {
      category: 'creature',
      subcategory: 'arachnid',
      type: 'spider',
      spiderType: type,
      legCount: 8,
      isVenomous: type === 'black-widow',
      size: type === 'tarantula' ? 'large' : 'small',
      ...opts.extraTags,
    };
    
    return group;
  }
  
  protected generateCephalothorax(opts: InsectOptions): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    geometry.scale(1.0, 0.8, 0.9);
    
    const material = this.createSpiderMaterial(opts);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${opts.name || 'spider'}_cephalothorax`;
    
    return mesh;
  }
  
  protected generateAbdomen(opts: InsectOptions): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.4, 16, 16);
    geometry.scale(1.2, 0.9, 1.0);
    
    const material = this.createSpiderMaterial(opts);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = 0.5;
    mesh.name = `${opts.name || 'spider'}_abdomen`;
    
    return mesh;
  }
  
  protected generateSpiderLegs(opts: InsectOptions): THREE.Group[] {
    const legs: THREE.Group[] = [];
    const legLength = opts.legLength || 0.6;
    
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const legGroup = new THREE.Group();
        
        // Femur
        const femurGeom = new THREE.CylinderGeometry(0.04, 0.05, legLength * 0.4, 8);
        femurGeom.rotateZ(Math.PI / 2);
        const femur = new THREE.Mesh(femurGeom, this.createSpiderMaterial(opts));
        femur.position.x = legLength * 0.2;
        legGroup.add(femur);
        
        // Patella/Tibia
        const tibiaGeom = new THREE.CylinderGeometry(0.03, 0.04, legLength * 0.35, 8);
        tibiaGeom.rotateZ(Math.PI / 2);
        const tibia = new THREE.Mesh(tibiaGeom, this.createSpiderMaterial(opts));
        tibia.position.x = legLength * 0.55;
        tibia.rotation.z = -Math.PI / 6;
        legGroup.add(tibia);
        
        // Metatarsus/Tarsus
        const tarsusGeom = new THREE.CylinderGeometry(0.02, 0.03, legLength * 0.35, 8);
        tarsusGeom.rotateZ(Math.PI / 2);
        const tarsus = new THREE.Mesh(tarsusGeom, this.createSpiderMaterial(opts));
        tarsus.position.x = legLength * 0.85;
        tarsus.rotation.z = Math.PI / 8;
        legGroup.add(tarsus);
        
        // Position leg
        const angle = (i / 3) * Math.PI / 3 - Math.PI / 6;
        legGroup.position.y = 0;
        legGroup.position.z = side * (0.15 + i * 0.12);
        legGroup.rotation.z = side * angle;
        legGroup.rotation.y = side * Math.PI / 4;
        
        legs.push(legGroup);
      }
    }
    
    return legs;
  }
  
  protected generatePedipalps(opts: InsectOptions): THREE.Mesh[] {
    const pedipalps: THREE.Mesh[] = [];
    
    for (let side = -1; side <= 1; side += 2) {
      const geom = new THREE.CylinderGeometry(0.02, 0.03, 0.2, 8);
      geom.rotateZ(Math.PI / 2);
      const palp = new THREE.Mesh(geom, this.createSpiderMaterial(opts));
      palp.position.set(-0.25, 0.05, side * 0.12);
      palp.rotation.z = -Math.PI / 6 * side;
      
      pedipalps.push(palp);
    }
    
    return pedipalps;
  }
  
  protected generateSpinnerets(opts: InsectOptions): THREE.Mesh {
    const geom = new THREE.SphereGeometry(0.05, 8, 8);
    const mesh = new THREE.Mesh(geom, this.createSpiderMaterial(opts));
    mesh.position.x = 1.0;
    return mesh;
  }
  
  protected createSpiderMaterial(opts: InsectOptions): THREE.Material {
    const primaryColor = opts.primaryColor || new THREE.Color(0x1a1a1a);
    
    return new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.5,
      metalness: 0.1,
    });
  }
}

/**
 * Export all insect generators
 */
export {
  InsectGenerator,
  BeetleGenerator,
  AntGenerator,
  ButterflyGenerator,
  DragonflyGenerator,
  GrasshopperGenerator,
  SpiderGenerator,
};
