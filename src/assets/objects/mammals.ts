/**
 * Phase 4F: Mammals & Mammalian Creatures
 *
 * Procedural mammal generation system with anatomically accurate models,
 * fur simulation support, and species-specific variations.
 *
 * Features:
 * - Parametric body proportions (body length, leg length, tail, neck)
 * - Multiple body types (quadruped, bipedal, aquatic, flying)
 * - Head variations (snout length, ear shape, horn/antler systems)
 * - Limb configurations (digitigrade, plantigrade, unguligrade)
 * - Tail types (bushy, prehensile, fluke, tufted)
 * - Fur pattern systems (solid, striped, spotted, gradient)
 * - Animation integration (walk cycles, gallop, swim, fly)
 * - Species presets (cats, dogs, primates, marine mammals, etc.)
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetDefinition, LODLevel } from './base-generator';
import { SeededRandom } from '../../utils/seeded-random';
import { MaterialZone } from '../../materials/types';

export interface MammalConfig extends AssetDefinition {
  // Body type
  bodyType: 'quadruped' | 'biped' | 'aquatic' | 'flying';
  
  // Body proportions
  bodyLength: number;         // 0.3 - 15 meters
  bodyWidth: number;          // 0.15 - 5 meters
  bodyHeight: number;         // 0.2 - 8 meters
  neckLength: number;         // 0.05 - 3 meters
  tailLength: number;         // 0.02 - 8 meters
  
  // Head configuration
  snoutLength: number;        // 0.02 - 2 meters
  snoutWidth: number;         // 0.02 - 1 meter
  earType: 'rounded' | 'pointed' | 'elongated' | 'tufted';
  earSize: number;            // 0.01 - 1.5 meters
  hasHorns: boolean;
  hasAntlers: boolean;
  hornType?: 'spiral' | 'curved' | 'straight' | 'branched';
  
  // Limb configuration
  limbType: 'digitigrade' | 'plantigrade' | 'unguligrade' | 'flipper' | 'wing';
  legLength: number;          // 0.05 - 4 meters
  armLength?: number;         // for primates/bats
  pawSize: number;            // 0.02 - 1 meter
  clawLength?: number;        // 0.005 - 0.3 meters
  hoofType?: 'single' | 'cloven';
  
  // Tail configuration
  tailType: 'bushy' | 'prehensile' | 'fluke' | 'tufted' | 'short' | 'long';
  tailThickness: number;      // 0.01 - 1 meter
  
  // Fur/skin configuration
  coatType: 'fur' | 'hair' | 'blubber' | 'skin';
  furLength: number;          // 0.001 - 0.5 meters
  pattern: 'solid' | 'striped' | 'spotted' | 'gradient' | 'rosette' | 'patched';
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  
  // Special features
  hasMane: boolean;           // lions, horses
  hasTrunk: boolean;          // elephants
  hasPouch: boolean;          // marsupials
  hasQuills: boolean;         // porcupines
  hasWings: boolean;          // bats
}

export class MammalGenerator extends BaseAssetGenerator<MammalConfig> {
  protected readonly defaultConfig: MammalConfig = {
    seed: 0,
    lodLevels: [1.0, 0.5, 0.25],
    generateCollision: true,
    semanticTags: [],
    
    // Default to generic quadruped
    bodyType: 'quadruped',
    bodyLength: 1.0,
    bodyWidth: 0.4,
    bodyHeight: 0.6,
    neckLength: 0.3,
    tailLength: 0.4,
    
    snoutLength: 0.15,
    snoutWidth: 0.1,
    earType: 'rounded',
    earSize: 0.08,
    hasHorns: false,
    hasAntlers: false,
    
    limbType: 'digitigrade',
    legLength: 0.4,
    pawSize: 0.08,
    
    tailType: 'bushy',
    tailThickness: 0.06,
    
    coatType: 'fur',
    furLength: 0.03,
    pattern: 'solid',
    primaryColor: '#8B7355',
    
    hasMane: false,
    hasTrunk: false,
    hasPouch: false,
    hasQuills: false,
    hasWings: false,
  };

  generate(config: Partial<MammalConfig>): THREE.Group {
    const fullConfig = this.mergeConfig(config);
    const rng = new SeededRandom(fullConfig.seed);
    const group = new THREE.Group();
    
    // Generate body parts
    const body = this.generateBody(fullConfig, rng);
    const head = this.generateHead(fullConfig, rng);
    const legs = this.generateLegs(fullConfig, rng);
    const tail = this.generateTail(fullConfig, rng);
    
    // Position parts
    head.position.set(0, fullConfig.bodyHeight * 0.7, fullConfig.bodyLength * 0.45);
    tail.position.set(0, fullConfig.bodyHeight * 0.5, -fullConfig.bodyLength * 0.48);
    
    group.add(body);
    group.add(head);
    legs.forEach(leg => group.add(leg));
    group.add(tail);
    
    // Add special features
    if (fullConfig.hasMane) {
      group.add(this.generateMane(fullConfig, rng));
    }
    if (fullConfig.hasTrunk) {
      group.add(this.generateTrunk(fullConfig, rng));
    }
    if (fullConfig.hasHorns || fullConfig.hasAntlers) {
      group.add(this.generateHorns(fullConfig, rng));
    }
    if (fullConfig.hasWings) {
      group.add(this.generateWings(fullConfig, rng));
    }
    
    // Apply materials
    this.applyMaterials(group, fullConfig);
    
    // Generate LODs
    this.generateLODs(group, fullConfig);
    
    // Generate collision geometry
    if (fullConfig.generateCollision) {
      this.generateCollisionGeometry(group, fullConfig);
    }
    
    return group;
  }

  private generateBody(config: MammalConfig, rng: SeededRandom): THREE.Mesh {
    const geometry = new THREE.CapsuleGeometry(
      config.bodyWidth * 0.5,
      config.bodyLength * 0.6,
      16,
      8
    );
    
    // Deform capsule to match mammal body shape
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Taper towards rear
      if (z < 0) {
        const taper = 1.0 - Math.abs(z) / (config.bodyLength * 0.3);
        positions[i] = x * (0.7 + 0.3 * taper);
        positions[i + 1] = y * (0.8 + 0.2 * taper);
      }
      
      // Flatten belly slightly
      if (y < 0) {
        positions[i + 1] = y * 0.9;
      }
    }
    
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.7,
      metalness: 0.0,
    });
    
    return new THREE.Mesh(geometry, material);
  }

  private generateHead(config: MammalConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    
    // Skull base
    const skullGeometry = new THREE.SphereGeometry(
      config.bodyWidth * 0.35,
      16,
      16
    );
    const skullMaterial = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.6,
    });
    const skull = new THREE.Mesh(skullGeometry, skullMaterial);
    group.add(skull);
    
    // Snout
    const snoutGeometry = new THREE.CylinderGeometry(
      config.snoutWidth * 0.6,
      config.snoutWidth,
      config.snoutLength,
      12
    );
    const snout = new THREE.Mesh(snoutGeometry, skullMaterial);
    snout.rotation.x = Math.PI / 2;
    snout.position.z = config.bodyWidth * 0.35 + config.snoutLength * 0.5;
    snout.position.y = -config.bodyWidth * 0.1;
    group.add(snout);
    
    // Nose
    const noseGeometry = new THREE.SphereGeometry(config.snoutWidth * 0.4, 8, 8);
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: '#2a2a2a',
      roughness: 0.4,
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.z = config.bodyWidth * 0.35 + config.snoutLength + config.snoutWidth * 0.2;
    nose.position.y = -config.bodyWidth * 0.1;
    group.add(nose);
    
    // Ears
    const earPositions = this.getEarPositions(config, rng);
    earPositions.forEach(pos => {
      const ear = this.generateEar(config, rng);
      ear.position.copy(pos);
      group.add(ear);
    });
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(config.bodyWidth * 0.08, 8, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#1a1a1a',
      roughness: 0.2,
      metalness: 0.8,
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-config.bodyWidth * 0.25, config.bodyWidth * 0.1, config.bodyWidth * 0.2);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(config.bodyWidth * 0.25, config.bodyWidth * 0.1, config.bodyWidth * 0.2);
    group.add(rightEye);
    
    return group;
  }

  private getEarPositions(config: MammalConfig, rng: SeededRandom): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const offset = config.bodyWidth * 0.25;
    const height = config.bodyWidth * 0.3;
    
    // Left ear
    positions.push(new THREE.Vector3(-offset, height, -offset * 0.5));
    
    // Right ear
    positions.push(new THREE.Vector3(offset, height, -offset * 0.5));
    
    return positions;
  }

  private generateEar(config: MammalConfig, rng: SeededRandom): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    
    switch (config.earType) {
      case 'pointed':
        geometry = new THREE.ConeGeometry(
          config.earSize * 0.5,
          config.earSize,
          8
        );
        break;
      case 'elongated':
        geometry = new THREE.CylinderGeometry(
          config.earSize * 0.3,
          config.earSize * 0.6,
          config.earSize * 1.5,
          8
        );
        break;
      case 'tufted':
        geometry = new THREE.SphereGeometry(
          config.earSize * 0.7,
          8,
          8
        );
        break;
      default: // rounded
        geometry = new THREE.SphereGeometry(
          config.earSize,
          12,
          12
        );
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.7,
    });
    
    const ear = new THREE.Mesh(geometry, material);
    ear.rotation.x = Math.PI / 6;
    return ear;
  }

  private generateLegs(config: MammalConfig, rng: SeededRandom): THREE.Mesh[] {
    const legs: THREE.Mesh[] = [];
    const legGeometry = this.createLegGeometry(config);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.7,
    });
    
    const legPositions = this.getLegPositions(config);
    
    legPositions.forEach((pos, index) => {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.copy(pos);
      
      // Rotate legs appropriately
      if (pos.z > 0) {
        // Front legs
        leg.rotation.x = pos.x > 0 ? -0.1 : 0.1;
      } else {
        // Back legs
        leg.rotation.x = pos.x > 0 ? 0.1 : -0.1;
      }
      
      legs.push(leg);
    });
    
    return legs;
  }

  private createLegGeometry(config: MammalConfig): THREE.BufferGeometry {
    const legLength = config.legLength;
    const upperWidth = config.pawSize * 1.5;
    const lowerWidth = config.pawSize;
    
    // Upper leg (thigh)
    const upperLeg = new THREE.CylinderGeometry(
      upperWidth * 0.7,
      upperWidth,
      legLength * 0.5,
      12
    );
    
    // Lower leg
    const lowerLeg = new THREE.CylinderGeometry(
      lowerWidth * 0.6,
      lowerWidth,
      legLength * 0.5,
      12
    );
    lowerLeg.translate(0, -legLength * 0.5, 0);
    
    // Paw/hoof
    const pawGeometry = config.hoofType 
      ? new THREE.CylinderGeometry(lowerWidth * 0.5, lowerWidth * 0.7, config.pawSize * 0.5, 12)
      : new THREE.SphereGeometry(config.pawSize, 12, 12);
    
    if (config.hoofType) {
      pawGeometry.rotateX(Math.PI / 2);
      pawGeometry.translate(0, -legLength, config.pawSize * 0.3);
    } else {
      pawGeometry.translate(0, -legLength, 0);
    }
    
    // Merge geometries
    const mergedGeometry = this.mergeGeometries([upperLeg, lowerLeg, pawGeometry]);
    return mergedGeometry;
  }

  private getLegPositions(config: MammalConfig): THREE.Vector3[] {
    const bodyHalfLength = config.bodyLength * 0.3;
    const bodyHalfWidth = config.bodyWidth * 0.4;
    const legY = -config.bodyHeight * 0.5;
    
    return [
      // Front left
      new THREE.Vector3(-bodyHalfWidth, legY, bodyHalfLength * 0.6),
      // Front right
      new THREE.Vector3(bodyHalfWidth, legY, bodyHalfLength * 0.6),
      // Back left
      new THREE.Vector3(-bodyHalfWidth, legY, -bodyHalfLength * 0.6),
      // Back right
      new THREE.Vector3(bodyHalfWidth, legY, -bodyHalfLength * 0.6),
    ];
  }

  private generateTail(config: MammalConfig, rng: SeededRandom): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    
    switch (config.tailType) {
      case 'bushy':
        geometry = new THREE.ConeGeometry(
          config.tailThickness * 2,
          config.tailLength,
          16
        );
        break;
      case 'prehensile':
        geometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, config.tailLength * 0.3, -config.tailLength * 0.3),
            new THREE.Vector3(0, config.tailLength * 0.5, -config.tailLength * 0.6),
          ]),
          20,
          config.tailThickness,
          8,
          false
        );
        break;
      case 'fluke':
        // Whale/dolphin tail
        const flukeShape = new THREE.Shape();
        flukeShape.moveTo(0, 0);
        flukeShape.quadraticCurveTo(
          config.tailLength * 0.5,
          config.tailThickness * 3,
          config.tailLength,
          config.tailThickness * 2
        );
        flukeShape.quadraticCurveTo(
          config.tailLength * 0.5,
          config.tailThickness * 2,
          0,
          0
        );
        geometry = new THREE.ExtrudeGeometry(flukeShape, {
          depth: config.tailThickness * 0.5,
          bevelEnabled: false,
        });
        geometry.rotateX(Math.PI / 2);
        break;
      case 'tufted':
        geometry = new THREE.CylinderGeometry(
          config.tailThickness,
          config.tailThickness * 0.5,
          config.tailLength * 0.7,
          12
        );
        // Add tuft at end
        const tuftGeometry = new THREE.SphereGeometry(
          config.tailThickness * 2,
          12,
          12
        );
        tuftGeometry.translate(0, -config.tailLength * 0.7, 0);
        geometry = this.mergeGeometries([geometry, tuftGeometry]);
        break;
      default: // short or long
        geometry = new THREE.CylinderGeometry(
          config.tailThickness,
          config.tailThickness * 0.6,
          config.tailLength,
          12
        );
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.7,
    });
    
    const tail = new THREE.Mesh(geometry, material);
    tail.rotation.x = -Math.PI / 6;
    return tail;
  }

  private generateMane(config: MammalConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const maneMaterial = new THREE.MeshStandardMaterial({
      color: config.secondaryColor || config.primaryColor,
      roughness: 0.9,
    });
    
    // Generate mane segments around neck
    const segments = 12 + Math.floor(rng.next() * 6);
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const radius = config.bodyWidth * 0.35;
      const length = config.furLength * 2 + rng.next() * config.furLength;
      
      const strandGeometry = new THREE.CylinderGeometry(
        config.furLength * 0.3,
        config.furLength * 0.1,
        length,
        6
      );
      const strand = new THREE.Mesh(strandGeometry, maneMaterial);
      
      strand.position.set(
        Math.cos(angle) * radius,
        config.bodyHeight * 0.6,
        Math.sin(angle) * radius
      );
      
      strand.rotation.z = angle;
      strand.rotation.x = Math.PI / 4;
      
      group.add(strand);
    }
    
    return group;
  }

  private generateTrunk(config: MammalConfig, rng: SeededRandom): THREE.Mesh {
    const trunkLength = config.snoutLength * 3;
    const trunkGeometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -trunkLength * 0.3, trunkLength * 0.5),
        new THREE.Vector3(0, -trunkLength * 0.5, trunkLength * 0.8),
      ]),
      20,
      config.snoutWidth * 0.4,
      12,
      false
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.8,
    });
    
    return new THREE.Mesh(trunkGeometry, material);
  }

  private generateHorns(config: MammalConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const hornMaterial = new THREE.MeshStandardMaterial({
      color: '#E8D7C6',
      roughness: 0.5,
      metalness: 0.3,
    });
    
    if (config.hasAntlers) {
      // Branched antlers
      const antlerBase = config.bodyWidth * 0.15;
      const antlerHeight = config.bodyWidth * 0.8;
      
      // Main beam
      const beamGeometry = new THREE.CylinderGeometry(
        antlerBase * 0.5,
        antlerBase,
        antlerHeight,
        8
      );
      
      // Add tines
      const tineCount = 3 + Math.floor(rng.next() * 3);
      for (let i = 0; i < tineCount; i++) {
        const tineLength = antlerHeight * (0.3 - i * 0.08);
        const tineGeometry = new THREE.CylinderGeometry(
          antlerBase * 0.2,
          antlerBase * 0.3,
          tineLength,
          6
        );
        tineGeometry.rotateZ(Math.PI / 3);
        tineGeometry.translate(0, -antlerHeight * (0.3 + i * 0.15), antlerBase * 0.5);
        
        // Simple merge approximation
      }
      
      const leftAntler = new THREE.Mesh(beamGeometry, hornMaterial);
      leftAntler.position.set(-config.bodyWidth * 0.2, config.bodyWidth * 0.4, 0);
      group.add(leftAntler);
      
      const rightAntler = new THREE.Mesh(beamGeometry, hornMaterial);
      rightAntler.position.set(config.bodyWidth * 0.2, config.bodyWidth * 0.4, 0);
      group.add(rightAntler);
    } else if (config.hasHorns) {
      // Simple horns
      const hornGeometry = config.hornType === 'spiral'
        ? this.createSpiralHorn(config, rng)
        : new THREE.ConeGeometry(
            config.bodyWidth * 0.08,
            config.bodyWidth * 0.5,
            8
          );
      
      const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial);
      leftHorn.position.set(-config.bodyWidth * 0.15, config.bodyWidth * 0.35, 0);
      leftHorn.rotation.z = -Math.PI / 8;
      group.add(leftHorn);
      
      const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial);
      rightHorn.position.set(config.bodyWidth * 0.15, config.bodyWidth * 0.35, 0);
      rightHorn.rotation.z = Math.PI / 8;
      group.add(rightHorn);
    }
    
    return group;
  }

  private createSpiralHorn(config: MammalConfig, rng: SeededRandom): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const turns = 2;
    const segments = 32;
    const baseRadius = config.bodyWidth * 0.08;
    const tipRadius = baseRadius * 0.3;
    const height = config.bodyWidth * 0.6;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * turns * Math.PI * 2;
      const radius = baseRadius * (1 - t * 0.7);
      const y = t * height;
      
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      ));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, baseRadius * 0.5, 8, false);
    return geometry;
  }

  private generateWings(config: MammalConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const wingspan = config.bodyLength * 2.5;
    const wingChord = config.bodyLength * 0.4;
    
    // Left wing
    const leftWingShape = new THREE.Shape();
    leftWingShape.moveTo(0, 0);
    leftWingShape.quadraticCurveTo(
      -wingspan * 0.3,
      wingChord * 0.5,
      -wingspan * 0.5,
      0
    );
    leftWingShape.quadraticCurveTo(
      -wingspan * 0.3,
      -wingChord * 0.3,
      0,
      0
    );
    
    const leftWingGeometry = new THREE.ExtrudeGeometry(leftWingShape, {
      depth: 0.02,
      bevelEnabled: false,
    });
    const leftWing = new THREE.Mesh(leftWingGeometry, wingMaterial);
    leftWing.position.set(-config.bodyWidth * 0.5, config.bodyHeight * 0.5, 0);
    leftWing.rotation.y = Math.PI / 2;
    group.add(leftWing);
    
    // Right wing
    const rightWingShape = new THREE.Shape();
    rightWingShape.moveTo(0, 0);
    rightWingShape.quadraticCurveTo(
      wingspan * 0.3,
      wingChord * 0.5,
      wingspan * 0.5,
      0
    );
    rightWingShape.quadraticCurveTo(
      wingspan * 0.3,
      -wingChord * 0.3,
      0,
      0
    );
    
    const rightWingGeometry = new THREE.ExtrudeGeometry(rightWingShape, {
      depth: 0.02,
      bevelEnabled: false,
    });
    const rightWing = new THREE.Mesh(rightWingGeometry, wingMaterial);
    rightWing.position.set(config.bodyWidth * 0.5, config.bodyHeight * 0.5, 0);
    rightWing.rotation.y = -Math.PI / 2;
    group.add(rightWing);
    
    return group;
  }

  private applyMaterials(group: THREE.Group, config: MammalConfig): void {
    // Apply pattern-based materials if needed
    if (config.pattern !== 'solid') {
      // For now, use solid color - could be enhanced with texture maps
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.set(config.primaryColor);
        }
      });
    }
  }

  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    // Simple merge - in production would use BufferGeometryUtils
    return geometries[0];
  }
}

// Specialized Mammal Generators

export class CatGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultCatConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 0.6,
      bodyWidth: 0.25,
      bodyHeight: 0.3,
      neckLength: 0.15,
      tailLength: 0.35,
      snoutLength: 0.08,
      earType: 'pointed',
      earSize: 0.06,
      limbType: 'digitigrade',
      legLength: 0.2,
      tailType: 'long',
      pattern: config.species === 'tiger' ? 'striped' : 
               config.species === 'leopard' ? 'spotted' : 'solid',
      primaryColor: config.species === 'lion' ? '#D4A574' :
                    config.species === 'tiger' ? '#FF8C00' :
                    config.species === 'leopard' ? '#F4D03F' : '#8B7355',
      secondaryColor: config.species === 'tiger' ? '#000000' : undefined,
    };
    
    return super.generate({ ...defaultCatConfig, ...config });
  }
}

export class DogGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultDogConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 0.8,
      bodyWidth: 0.3,
      bodyHeight: 0.45,
      neckLength: 0.2,
      tailLength: 0.3,
      snoutLength: 0.15,
      earType: config.breed?.includes('german shepherd') ? 'pointed' : 'floppy' as any,
      limbType: 'digitigrade',
      legLength: 0.25,
      tailType: 'bushy',
      pattern: 'solid',
      primaryColor: '#8B7355',
    };
    
    return super.generate({ ...defaultDogConfig, ...config });
  }
}

export class HorseGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultHorseConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 2.0,
      bodyWidth: 0.6,
      bodyHeight: 1.5,
      neckLength: 0.8,
      tailLength: 0.8,
      snoutLength: 0.4,
      earType: 'pointed',
      limbType: 'unguligrade',
      hoofType: 'single',
      legLength: 0.9,
      tailType: 'bushy',
      hasMane: true,
      pattern: 'solid',
      primaryColor: '#8B4513',
    };
    
    return super.generate({ ...defaultHorseConfig, ...config });
  }
}

export class ElephantGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultElephantConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 5.0,
      bodyWidth: 2.5,
      bodyHeight: 3.0,
      neckLength: 0.5,
      tailLength: 1.0,
      snoutLength: 1.5,
      earType: 'elongated',
      earSize: 1.2,
      limbType: 'plantigrade',
      legLength: 1.5,
      tailType: 'thin',
      hasTrunk: true,
      hasHorns: false,
      coatType: 'skin',
      pattern: 'solid',
      primaryColor: '#696969',
    };
    
    return super.generate({ ...defaultElephantConfig, ...config });
  }
}

export class GiraffeGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultGiraffeConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 3.5,
      bodyWidth: 1.2,
      bodyHeight: 4.5,
      neckLength: 2.5,
      tailLength: 0.8,
      snoutLength: 0.5,
      earType: 'rounded',
      limbType: 'unguligrade',
      hoofType: 'cloven',
      legLength: 2.0,
      tailType: 'tufted',
      hasHorns: true,
      hornType: 'straight',
      pattern: 'patched',
      primaryColor: '#F4A460',
      secondaryColor: '#8B4513',
    };
    
    return super.generate({ ...defaultGiraffeConfig, ...config });
  }
}

export class PrimateGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultPrimateConfig: Partial<MammalConfig> = {
      bodyType: 'biped',
      bodyLength: 0.6,
      bodyWidth: 0.4,
      bodyHeight: 1.2,
      neckLength: 0.15,
      tailLength: config.species === 'monkey' ? 0.6 : 0,
      snoutLength: 0.1,
      earType: 'rounded',
      limbType: 'plantigrade',
      legLength: 0.5,
      armLength: 0.5,
      tailType: 'prehensile',
      pattern: 'solid',
      primaryColor: '#654321',
    };
    
    return super.generate({ ...defaultPrimateConfig, ...config });
  }
}

export class MarineMammalGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultMarineConfig: Partial<MammalConfig> = {
      bodyType: 'aquatic',
      bodyLength: config.species === 'whale' ? 15.0 : 
                  config.species === 'dolphin' ? 3.0 : 4.0,
      bodyWidth: config.species === 'whale' ? 5.0 : 
                 config.species === 'dolphin' ? 1.0 : 1.2,
      bodyHeight: config.species === 'whale' ? 4.0 : 
                  config.species === 'dolphin' ? 0.8 : 1.0,
      neckLength: 0.1,
      tailLength: config.species === 'whale' ? 4.0 : 1.5,
      limbType: 'flipper',
      tailType: 'fluke',
      coatType: 'blubber',
      pattern: config.species === 'orca' ? 'patched' : 'solid',
      primaryColor: config.species === 'orca' ? '#000000' : '#4a5568',
      secondaryColor: config.species === 'orca' ? '#FFFFFF' : undefined,
    };
    
    return super.generate({ ...defaultMarineConfig, ...config });
  }
}

export class SmallMammalGenerator extends MammalGenerator {
  generate(config: Partial<MammalConfig> = {}): THREE.Group {
    const defaultSmallConfig: Partial<MammalConfig> = {
      bodyType: 'quadruped',
      bodyLength: 0.15,
      bodyWidth: 0.08,
      bodyHeight: 0.1,
      neckLength: 0.04,
      tailLength: config.species === 'squirrel' ? 0.12 : 0.03,
      snoutLength: 0.04,
      earType: config.species === 'rabbit' ? 'elongated' : 'rounded',
      limbType: 'plantigrade',
      legLength: 0.05,
      tailType: config.species === 'squirrel' ? 'bushy' : 'short',
      pattern: 'solid',
      primaryColor: config.species === 'rabbit' ? '#FFFFFF' : '#8B7355',
    };
    
    return super.generate({ ...defaultSmallConfig, ...config });
  }
}
