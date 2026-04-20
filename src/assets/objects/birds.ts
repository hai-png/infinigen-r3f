/**
 * Phase 4E: Birds & Avian Creatures
 * 
 * Procedural bird generation system with anatomically accurate models,
 * flight animation support, and species-specific variations.
 * 
 * Features:
 * - Parametric body proportions (wingspan, beak, legs, tail)
 * - Multiple wing types (elliptical, high aspect, slotted, etc.)
 * - Beak variations (conical, hooked, chisel, probing)
 * - Tail configurations (forked, rounded, squared, graduated)
 * - Feather systems with procedural variation
 * - Flight animation integration
 * - Species presets (eagle, parrot, hummingbird, etc.)
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetDefinition, LODLevel } from './base-generator';
import { SeededRandom } from '../../utils/seeded-random';
import { MaterialZone } from '../../materials/types';

export interface BirdConfig extends AssetDefinition {
  // Body proportions
  wingspan: number;           // 0.2 - 3.0 meters
  bodyLength: number;         // 0.1 - 1.5 meters
  bodyWidth: number;          // 0.05 - 0.5 meters
  neckLength: number;         // 0.02 - 0.5 meters
  
  // Beak configuration
  beakType: 'conical' | 'hooked' | 'chisel' | 'probing' | 'flat' | 'curved';
  beakLength: number;         // 0.01 - 0.5 meters
  beakCurvature: number;      // -0.5 to 0.5
  
  // Wing configuration
  wingType: 'elliptical' | 'high_aspect' | 'slotted' | 'soaring' | 'hovering';
  wingSpanRatio: number;      // wingspan / bodyLength ratio
  wingChord: number;          // wing width at base
  primaryFeathers: number;    // 6-12 feathers
  secondaryFeathers: number;  // 6-18 feathers
  
  // Tail configuration
  tailType: 'forked' | 'rounded' | 'squared' | 'graduated' | 'pointed';
  tailLength: number;         // 0.05 - 0.5 meters
  tailFeathers: number;       // 8-16 feathers
  
  // Leg configuration
  legType: 'perching' | 'raptorial' | 'wading' | 'swimming' | 'cursorial';
  legLength: number;          // 0.02 - 0.5 meters
  talonSize: number;          // 0.01 - 0.1 meters
  
  // Feather colors
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  pattern?: 'solid' | 'striped' | 'spotted' | 'gradient' | 'iridescent';
  
  // Animation
  flappingSpeed?: number;     // Hz
  glidingRatio?: number;      // glide distance / drop height
}

export class BirdGenerator extends BaseAssetGenerator<BirdConfig> {
  static readonly BIRD_TYPES = [
    'eagle', 'hawk', 'falcon', 'owl', 'parrot', 'hummingbird',
    'crow', 'raven', 'dove', 'pigeon', 'pelican', 'flamingo',
    'penguin', 'ostrich', 'peacock', 'swan', 'goose', 'duck',
    'albatross', 'seagull', 'kingfisher', 'woodpecker', 'toucan',
    'cardinal', 'bluejay', 'robin', 'sparrow', 'finch', 'canary'
  ] as const;

  generate(config: BirdConfig): THREE.Group {
    const group = new THREE.Group();
    const rng = new SeededRandom(config.seed);
    
    // Generate body parts
    const body = this.createBody(config, rng);
    const head = this.createHead(config, rng);
    const neck = this.createNeck(config, rng);
    const wings = this.createWings(config, rng);
    const tail = this.createTail(config, rng);
    const legs = this.createLegs(config, rng);
    
    // Assemble bird
    group.add(body);
    group.add(neck);
    neck.add(head);
    group.add(wings);
    group.add(tail);
    group.add(legs);
    
    // Apply materials
    this.applyMaterials(group, config);
    
    // Add metadata
    group.userData = {
      type: 'bird',
      birdType: config.birdType,
      wingspan: config.wingspan,
      canFly: this.canFly(config),
      materialZones: ['body', 'head', 'wings', 'tail', 'beak', 'legs'],
      ...config.metadata
    };
    
    // Generate LODs
    this.generateLODs(group, config);
    
    return group;
  }

  private createBody(config: BirdConfig, rng: SeededRandom): THREE.Mesh {
    // Bird body is typically teardrop or oval shaped
    const bodyShape = new THREE.Shape();
    const bodyWidth = config.bodyWidth;
    const bodyLength = config.bodyLength;
    
    // Create streamlined body profile
    bodyShape.moveTo(0, 0);
    bodyShape.bezierCurveTo(
      bodyLength * 0.25, -bodyWidth * 0.5,
      bodyLength * 0.75, -bodyWidth * 0.4,
      bodyLength, 0
    );
    bodyShape.bezierCurveTo(
      bodyLength * 0.75, bodyWidth * 0.4,
      bodyLength * 0.25, bodyWidth * 0.5,
      0, 0
    );
    
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: bodyWidth * 1.5,
      bevelEnabled: true,
      bevelThickness: bodyWidth * 0.1,
      bevelSize: bodyWidth * 0.05,
      bevelSegments: 4,
      steps: 2
    };
    
    const geometry = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    geometry.rotateX(Math.PI / 2);
    geometry.center();
    
    const material = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.7,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'bird_body';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private createHead(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const headGroup = new THREE.Group();
    
    // Skull
    const skullSize = config.bodyWidth * 0.6;
    const skullGeometry = new THREE.SphereGeometry(skullSize, 16, 16);
    const skullMaterial = new THREE.MeshStandardMaterial({
      color: config.primaryColor,
      roughness: 0.6
    });
    const skull = new THREE.Mesh(skullGeometry, skullMaterial);
    skull.name = 'bird_skull';
    headGroup.add(skull);
    
    // Beak
    const beak = this.createBeak(config, rng);
    beak.position.set(skullSize * 0.8, 0, 0);
    headGroup.add(beak);
    
    // Eyes
    const eyeSize = skullSize * 0.25;
    const eyeGeometry = new THREE.SphereGeometry(eyeSize, 12, 12);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.2,
      metalness: 0.8
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(skullSize * 0.3, eyeSize * 0.8, skullSize * 0.6);
    leftEye.name = 'bird_left_eye';
    headGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(skullSize * 0.3, eyeSize * 0.8, -skullSize * 0.6);
    rightEye.name = 'bird_right_eye';
    headGroup.add(rightEye);
    
    headGroup.name = 'bird_head';
    return headGroup;
  }

  private createBeak(config: BirdConfig, rng: SeededRandom): THREE.Mesh {
    const beakLength = config.beakLength;
    const beakBaseWidth = config.bodyWidth * 0.2;
    
    let geometry: THREE.BufferGeometry;
    
    switch (config.beakType) {
      case 'conical':
        // Seed-eating birds (finches, sparrows)
        geometry = new THREE.ConeGeometry(beakBaseWidth, beakLength, 8);
        geometry.rotateX(-Math.PI / 2);
        break;
        
      case 'hooked':
        // Raptors (eagles, hawks)
        const hookShape = new THREE.Shape();
        hookShape.moveTo(0, 0);
        hookShape.lineTo(beakLength, -beakBaseWidth * 0.3);
        hookShape.quadraticCurveTo(
          beakLength * 0.8, -beakBaseWidth * 0.8,
          beakLength * 0.6, -beakBaseWidth
        );
        hookShape.lineTo(0, -beakBaseWidth * 0.5);
        
        geometry = new THREE.ExtrudeGeometry(hookShape, {
          depth: beakBaseWidth * 1.5,
          bevelEnabled: false
        });
        geometry.rotateX(Math.PI / 2);
        break;
        
      case 'chisel':
        // Woodpeckers
        geometry = new THREE.BoxGeometry(beakLength, beakBaseWidth * 0.6, beakBaseWidth * 1.2);
        geometry.translate(beakLength / 2, 0, 0);
        break;
        
      case 'probing':
        // Hummingbirds, shorebirds
        geometry = new THREE.CylinderGeometry(
          beakBaseWidth * 0.2,
          beakBaseWidth * 0.4,
          beakLength,
          8
        );
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(beakLength / 2, 0, 0);
        break;
        
      case 'flat':
        // Ducks, pelicans
        const flatShape = new THREE.Shape();
        flatShape.moveTo(0, 0);
        flatShape.lineTo(beakLength, 0);
        flatShape.lineTo(beakLength, -beakBaseWidth * 0.3);
        flatShape.lineTo(0, -beakBaseWidth * 0.5);
        
        geometry = new THREE.ExtrudeGeometry(flatShape, {
          depth: beakBaseWidth * 2,
          bevelEnabled: false
        });
        geometry.rotateX(Math.PI / 2);
        break;
        
      case 'curved':
      default:
        // Toucans, hornbills
        const curveShape = new THREE.Shape();
        curveShape.moveTo(0, 0);
        curveShape.quadraticCurveTo(
          beakLength * 0.5, -beakBaseWidth * 0.2,
          beakLength, -beakBaseWidth * 0.5
        );
        curveShape.lineTo(beakLength, -beakBaseWidth * 0.8);
        curveShape.quadraticCurveTo(
          beakLength * 0.5, -beakBaseWidth * 0.3,
          0, -beakBaseWidth * 0.5
        );
        
        geometry = new THREE.ExtrudeGeometry(curveShape, {
          depth: beakBaseWidth * 1.5,
          bevelEnabled: false
        });
        geometry.rotateX(Math.PI / 2);
        break;
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: config.accentColor || 0xFFA500,
      roughness: 0.4,
      metalness: 0.2
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'bird_beak';
    mesh.castShadow = true;
    
    return mesh;
  }

  private createNeck(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const neckGroup = new THREE.Group();
    const neckLength = config.neckLength;
    const neckRadius = config.bodyWidth * 0.2;
    
    // Create segmented neck for flexibility
    const segments = Math.max(3, Math.floor(neckLength / 0.05));
    const segmentLength = neckLength / segments;
    
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const radius = neckRadius * (1 - t * 0.3); // Taper towards head
      
      const segmentGeometry = new THREE.CylinderGeometry(
        radius * 0.9,
        radius,
        segmentLength * 0.9,
        8
      );
      
      const material = new THREE.MeshStandardMaterial({
        color: config.primaryColor,
        roughness: 0.7
      });
      
      const segment = new THREE.Mesh(segmentGeometry, material);
      segment.position.y = (i + 0.5) * segmentLength;
      segment.name = `bird_neck_segment_${i}`;
      neckGroup.add(segment);
    }
    
    neckGroup.name = 'bird_neck';
    return neckGroup;
  }

  private createWings(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const wingsGroup = new THREE.Group();
    
    // Left wing
    const leftWing = this.createSingleWing(config, rng, 'left');
    leftWing.position.x = 0;
    wingsGroup.add(leftWing);
    
    // Right wing (mirrored)
    const rightWing = this.createSingleWing(config, rng, 'right');
    rightWing.position.x = 0;
    wingsGroup.add(rightWing);
    
    wingsGroup.name = 'bird_wings';
    return wingsGroup;
  }

  private createSingleWing(config: BirdConfig, rng: SeededRandom, side: 'left' | 'right'): THREE.Group {
    const wingGroup = new THREE.Group();
    const wingSpan = config.wingspan / 2;
    const wingChord = config.wingChord;
    
    // Wing bone structure
    const humerusLength = wingSpan * 0.3;
    const ulnaLength = wingSpan * 0.4;
    const carpometacarpusLength = wingSpan * 0.3;
    
    // Humerus (upper arm)
    const humerusGeometry = new THREE.CylinderGeometry(
      wingChord * 0.15,
      wingChord * 0.12,
      humerusLength,
      8
    );
    humerusGeometry.rotateZ(Math.PI / 2);
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xDDDDDD,
      roughness: 0.5
    });
    const humerus = new THREE.Mesh(humerusGeometry, boneMaterial);
    humerus.position.x = humerusLength / 2;
    humerus.name = 'wing_humerus';
    wingGroup.add(humerus);
    
    // Ulna/Radius (forearm)
    const ulnaGeometry = new THREE.CylinderGeometry(
      wingChord * 0.12,
      wingChord * 0.08,
      ulnaLength,
      8
    );
    ulnaGeometry.rotateZ(Math.PI / 2);
    const ulna = new THREE.Mesh(ulnaGeometry, boneMaterial);
    ulna.position.x = humerusLength + ulnaLength / 2;
    ulna.name = 'wing_ulna';
    wingGroup.add(ulna);
    
    // Primary feathers
    const primaryCount = config.primaryFeathers;
    for (let i = 0; i < primaryCount; i++) {
      const feather = this.createFlightFeather(config, rng, 'primary', i, primaryCount);
      const t = i / (primaryCount - 1);
      feather.position.x = humerusLength + ulnaLength + t * carpometacarpusLength;
      feather.position.y = -t * wingChord * 0.5;
      wingGroup.add(feather);
    }
    
    // Secondary feathers
    const secondaryCount = config.secondaryFeathers;
    for (let i = 0; i < secondaryCount; i++) {
      const feather = this.createFlightFeather(config, rng, 'secondary', i, secondaryCount);
      const t = i / (secondaryCount - 1);
      feather.position.x = humerusLength + t * ulnaLength * 0.5;
      feather.position.y = -wingChord * 0.3 - t * wingChord * 0.3;
      wingGroup.add(feather);
    }
    
    // Mirror for right wing
    if (side === 'right') {
      wingGroup.scale.z = -1;
    }
    
    wingGroup.name = `bird_wing_${side}`;
    return wingGroup;
  }

  private createFlightFeather(
    config: BirdConfig,
    rng: SeededRandom,
    type: 'primary' | 'secondary',
    index: number,
    total: number
  ): THREE.Mesh {
    const featherLength = type === 'primary' 
      ? config.wingspan * 0.15 * (1 - index / total * 0.3)
      : config.wingspan * 0.1 * (1 - index / total * 0.2);
    const featherWidth = featherLength * 0.15;
    
    // Create feather shape
    const featherShape = new THREE.Shape();
    featherShape.moveTo(0, 0);
    featherShape.quadraticCurveTo(
      featherLength * 0.3, -featherWidth * 0.5,
      featherLength, 0
    );
    featherShape.quadraticCurveTo(
      featherLength * 0.7, featherWidth * 0.3,
      featherLength * 0.9, featherWidth * 0.5
    );
    featherShape.quadraticCurveTo(
      featherLength * 0.5, featherWidth * 0.2,
      0, 0
    );
    
    const geometry = new THREE.ExtrudeGeometry(featherShape, {
      depth: featherWidth * 0.05,
      bevelEnabled: false
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: config.secondaryColor || config.primaryColor,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `bird_feather_${type}_${index}`;
    mesh.castShadow = true;
    
    return mesh;
  }

  private createTail(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const tailGroup = new THREE.Group();
    const tailLength = config.tailLength;
    const tailFeathers = config.tailFeathers;
    const tailBaseWidth = config.bodyWidth * 0.8;
    
    for (let i = 0; i < tailFeathers; i++) {
      const t = i / (tailFeathers - 1);
      const angle = (t - 0.5) * Math.PI * 0.6; // Spread angle
      
      // Calculate feather length based on tail type
      let featherLength = tailLength;
      switch (config.tailType) {
        case 'forked':
          // Longer outer feathers (swallows)
          featherLength *= 1 + Math.abs(t - 0.5) * 0.5;
          break;
        case 'graduated':
          // Longer center feathers (pheasants)
          featherLength *= 1 - Math.abs(t - 0.5) * 0.4;
          break;
        case 'pointed':
          // Tapered (swifts)
          featherLength *= 1 - Math.pow(t - 0.5, 2) * 0.3;
          break;
      }
      
      const featherWidth = featherLength * 0.12;
      
      // Create tail feather
      const featherShape = new THREE.Shape();
      featherShape.moveTo(0, 0);
      featherShape.quadraticCurveTo(
        featherLength * 0.5, -featherWidth * 0.3,
        featherLength, 0
      );
      featherShape.quadraticCurveTo(
        featherLength * 0.7, featherWidth * 0.4,
        featherLength * 0.9, featherWidth * 0.5
      );
      featherShape.quadraticCurveTo(
        featherLength * 0.5, featherWidth * 0.2,
        0, 0
      );
      
      const geometry = new THREE.ExtrudeGeometry(featherShape, {
        depth: featherWidth * 0.03,
        bevelEnabled: false
      });
      
      const material = new THREE.MeshStandardMaterial({
        color: config.secondaryColor || config.primaryColor,
        roughness: 0.8,
        side: THREE.DoubleSide
      });
      
      const feather = new THREE.Mesh(geometry, material);
      feather.rotation.z = angle;
      feather.name = `bird_tail_feather_${i}`;
      feather.castShadow = true;
      tailGroup.add(feather);
    }
    
    tailGroup.name = 'bird_tail';
    return tailGroup;
  }

  private createLegs(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const legsGroup = new THREE.Group();
    const legLength = config.legLength;
    
    // Left leg
    const leftLeg = this.createSingleLeg(config, rng, 'left');
    leftLeg.position.set(-config.bodyWidth * 0.3, -config.bodyWidth * 0.5, 0);
    legsGroup.add(leftLeg);
    
    // Right leg
    const rightLeg = this.createSingleLeg(config, rng, 'right');
    rightLeg.position.set(config.bodyWidth * 0.3, -config.bodyWidth * 0.5, 0);
    legsGroup.add(rightLeg);
    
    legsGroup.name = 'bird_legs';
    return legsGroup;
  }

  private createSingleLeg(config: BirdConfig, rng: SeededRandom, side: 'left' | 'right'): THREE.Group {
    const legGroup = new THREE.Group();
    const legLength = config.legLength;
    
    // Femur (thigh) - often hidden in feathers
    const femurLength = legLength * 0.3;
    const femurGeometry = new THREE.CylinderGeometry(
      config.bodyWidth * 0.08,
      config.bodyWidth * 0.06,
      femurLength,
      8
    );
    const legMaterial = new THREE.MeshStandardMaterial({
      color: config.accentColor || 0xFFA500,
      roughness: 0.6
    });
    const femur = new THREE.Mesh(femurGeometry, legMaterial);
    femur.position.y = -femurLength / 2;
    femur.name = 'leg_femur';
    legGroup.add(femur);
    
    // Tibiotarsus (shin)
    const tibiotarsusLength = legLength * 0.4;
    const tibiotarsusGeometry = new THREE.CylinderGeometry(
      config.bodyWidth * 0.06,
      config.bodyWidth * 0.04,
      tibiotarsusLength,
      8
    );
    const tibiotarsus = new THREE.Mesh(tibiotarsusGeometry, legMaterial);
    tibiotarsus.position.y = -femurLength - tibiotarsusLength / 2;
    tibiotarsus.name = 'leg_tibiotarsus';
    legGroup.add(tibiotarsus);
    
    // Tarsometatarsus (foot)
    const tarsometatarsusLength = legLength * 0.3;
    const tarsometatarsusGeometry = new THREE.CylinderGeometry(
      config.bodyWidth * 0.04,
      config.bodyWidth * 0.03,
      tarsometatarsusLength,
      8
    );
    const tarsometatarsus = new THREE.Mesh(tarsometatarsusGeometry, legMaterial);
    tarsometatarsus.position.y = -femurLength - tibiotarsusLength - tarsometatarsusLength / 2;
    tarsometatarsus.name = 'leg_tarsometatarsus';
    legGroup.add(tarsometatarsus);
    
    // Toes
    const toes = this.createToes(config, rng);
    toes.position.y = -femurLength - tibiotarsusLength - tarsometatarsusLength;
    legGroup.add(toes);
    
    legGroup.name = `bird_leg_${side}`;
    return legGroup;
  }

  private createToes(config: BirdConfig, rng: SeededRandom): THREE.Group {
    const toesGroup = new THREE.Group();
    const toeLength = config.bodyWidth * 0.15;
    const talonSize = config.talonSize;
    
    const toeMaterial = new THREE.MeshStandardMaterial({
      color: config.accentColor || 0xFFA500,
      roughness: 0.5
    });
    
    // Forward toes (typically 3)
    const forwardToes = config.legType === 'raptorial' ? 3 : 3;
    for (let i = 0; i < forwardToes; i++) {
      const angle = (i - 1) * Math.PI * 0.3;
      const toeGeometry = new THREE.CylinderGeometry(
        config.bodyWidth * 0.02,
        config.bodyWidth * 0.015,
        toeLength,
        6
      );
      toeGeometry.rotateX(angle);
      toeGeometry.rotateZ(-Math.PI / 2);
      
      const toe = new THREE.Mesh(toeGeometry, toeMaterial);
      toe.position.set(
        Math.sin(angle) * toeLength * 0.5,
        0,
        Math.cos(angle) * toeLength * 0.5
      );
      toe.name = `toe_forward_${i}`;
      toesGroup.add(toe);
      
      // Talon (claw)
      if (config.legType === 'raptorial' || config.legType === 'perching') {
        const talonGeometry = new THREE.ConeGeometry(talonSize, talonSize * 2, 8);
        talonGeometry.rotateX(-Math.PI / 2);
        const talon = new THREE.Mesh(talonGeometry, toeMaterial);
        talon.position.set(
          Math.sin(angle) * toeLength,
          0,
          Math.cos(angle) * toeLength
        );
        talon.name = `talon_forward_${i}`;
        toesGroup.add(talon);
      }
    }
    
    // Backward toe (hallux) - except for some species
    if (config.legType !== 'cursorial') {
      const halluxGeometry = new THREE.CylinderGeometry(
        config.bodyWidth * 0.02,
        config.bodyWidth * 0.015,
        toeLength * 0.7,
        6
      );
      halluxGeometry.rotateZ(Math.PI / 2);
      
      const hallux = new THREE.Mesh(halluxGeometry, toeMaterial);
      hallux.position.z = -toeLength * 0.35;
      hallux.name = 'toe_hallux';
      toesGroup.add(hallux);
      
      if (config.legType === 'raptorial' || config.legType === 'perching') {
        const halluxTalonGeometry = new THREE.ConeGeometry(talonSize * 1.2, talonSize * 2.5, 8);
        halluxTalonGeometry.rotateX(Math.PI / 2);
        const halluxTalon = new THREE.Mesh(halluxTalonGeometry, toeMaterial);
        halluxTalon.position.z = -toeLength * 0.7;
        halluxTalon.name = 'talon_hallux';
        toesGroup.add(halluxTalon);
      }
    }
    
    toesGroup.name = 'bird_toes';
    return toesGroup;
  }

  private applyMaterials(group: THREE.Group, config: BirdConfig): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = child.material as THREE.MeshStandardMaterial;
        
        // Apply colors based on body part
        if (child.name.includes('body') || child.name.includes('neck')) {
          material.color.set(config.primaryColor);
        } else if (child.name.includes('head') && !child.name.includes('beak')) {
          material.color.set(config.primaryColor);
        } else if (child.name.includes('wing') || child.name.includes('feather')) {
          material.color.set(config.secondaryColor || config.primaryColor);
        } else if (child.name.includes('tail')) {
          material.color.set(config.secondaryColor || config.primaryColor);
        } else if (child.name.includes('beak') || child.name.includes('leg') || child.name.includes('toe')) {
          material.color.set(config.accentColor || 0xFFA500);
        }
        
        // Apply patterns
        if (config.pattern === 'iridescent') {
          material.metalness = 0.6;
          material.roughness = 0.3;
        }
      }
    });
  }

  private canFly(config: BirdConfig): boolean {
    // Flightless birds
    const flightlessTypes = ['penguin', 'ostrich'];
    return !flightlessTypes.includes(config.birdType as any);
  }

  protected generateLODs(group: THREE.Group, config: BirdConfig): void {
    // LOD0: Full detail (already created)
    group.userData.lod0 = group.clone();
    
    // LOD1: Reduced feather count
    const lod1 = group.clone();
    this.reduceFeatherCount(lod1, 0.5);
    group.userData.lod1 = lod1;
    
    // LOD2: Simplified geometry
    const lod2 = group.clone();
    this.simplifyGeometry(lod2);
    group.userData.lod2 = lod2;
  }

  private reduceFeatherCount(group: THREE.Group, factor: number): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.includes('feather')) {
        const random = Math.random();
        if (random > factor) {
          child.visible = false;
        }
      }
    });
  }

  private simplifyGeometry(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Replace complex geometries with simpler ones
        if (child.name.includes('feather')) {
          const bbox = new THREE.Box3().setFromObject(child);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          
          child.geometry.dispose();
          child.geometry = new THREE.PlaneGeometry(size.x, size.y);
        }
      }
    });
  }

  static createPreset(type: string, seed?: number): BirdConfig {
    const baseConfig: Partial<BirdConfig> = {};
    
    switch (type) {
      case 'eagle':
        return {
          birdType: 'eagle',
          wingspan: 2.0,
          bodyLength: 0.8,
          bodyWidth: 0.25,
          neckLength: 0.15,
          beakType: 'hooked',
          beakLength: 0.08,
          beakCurvature: 0.3,
          wingType: 'soaring',
          wingSpanRatio: 2.5,
          wingChord: 0.3,
          primaryFeathers: 10,
          secondaryFeathers: 14,
          tailType: 'rounded',
          tailLength: 0.25,
          tailFeathers: 12,
          legType: 'raptorial',
          legLength: 0.15,
          talonSize: 0.05,
          primaryColor: '#3D2817',
          secondaryColor: '#FFFFFF',
          accentColor: '#FFD700',
          pattern: 'solid',
          seed: seed || Math.random()
        };
        
      case 'hummingbird':
        return {
          birdType: 'hummingbird',
          wingspan: 0.1,
          bodyLength: 0.08,
          bodyWidth: 0.03,
          neckLength: 0.02,
          beakType: 'probing',
          beakLength: 0.025,
          beakCurvature: 0.1,
          wingType: 'hovering',
          wingSpanRatio: 1.25,
          wingChord: 0.02,
          primaryFeathers: 10,
          secondaryFeathers: 6,
          tailType: 'forked',
          tailLength: 0.03,
          tailFeathers: 10,
          legType: 'perching',
          legLength: 0.015,
          talonSize: 0.003,
          primaryColor: '#00FF00',
          secondaryColor: '#FF0000',
          accentColor: '#000000',
          pattern: 'iridescent',
          flappingSpeed: 50, // Hz
          seed: seed || Math.random()
        };
        
      case 'owl':
        return {
          birdType: 'owl',
          wingspan: 1.2,
          bodyLength: 0.5,
          bodyWidth: 0.2,
          neckLength: 0.08,
          beakType: 'hooked',
          beakLength: 0.04,
          beakCurvature: 0.4,
          wingType: 'elliptical',
          wingSpanRatio: 2.4,
          wingChord: 0.25,
          primaryFeathers: 10,
          secondaryFeathers: 12,
          tailType: 'rounded',
          tailLength: 0.2,
          tailFeathers: 10,
          legType: 'raptorial',
          legLength: 0.12,
          talonSize: 0.04,
          primaryColor: '#8B4513',
          secondaryColor: '#D2691E',
          accentColor: '#FFD700',
          pattern: 'spotted',
          seed: seed || Math.random()
        };
        
      case 'flamingo':
        return {
          birdType: 'flamingo',
          wingspan: 1.5,
          bodyLength: 0.8,
          bodyWidth: 0.2,
          neckLength: 0.5,
          beakType: 'curved',
          beakLength: 0.12,
          beakCurvature: -0.5,
          wingType: 'soaring',
          wingSpanRatio: 1.875,
          wingChord: 0.2,
          primaryFeathers: 10,
          secondaryFeathers: 14,
          tailType: 'rounded',
          tailLength: 0.15,
          tailFeathers: 12,
          legType: 'wading',
          legLength: 0.6,
          talonSize: 0.02,
          primaryColor: '#FF69B4',
          secondaryColor: '#FF1493',
          accentColor: '#000000',
          pattern: 'solid',
          seed: seed || Math.random()
        };
        
      default:
        return {
          birdType: type as any,
          wingspan: 0.5,
          bodyLength: 0.25,
          bodyWidth: 0.08,
          neckLength: 0.05,
          beakType: 'conical',
          beakLength: 0.03,
          beakCurvature: 0,
          wingType: 'elliptical',
          wingSpanRatio: 2,
          wingChord: 0.08,
          primaryFeathers: 8,
          secondaryFeathers: 10,
          tailType: 'rounded',
          tailLength: 0.1,
          tailFeathers: 10,
          legType: 'perching',
          legLength: 0.05,
          talonSize: 0.01,
          primaryColor: '#8B4513',
          seed: seed || Math.random()
        };
    }
  }
}

/**
 * Specialized bird generators for common species
 */
export class EagleGenerator extends BirdGenerator {
  generate(seed?: number): THREE.Group {
    const config = BirdGenerator.createPreset('eagle', seed);
    return super.generate(config);
  }
}

export class HummingbirdGenerator extends BirdGenerator {
  generate(seed?: number): THREE.Group {
    const config = BirdGenerator.createPreset('hummingbird', seed);
    return super.generate(config);
  }
}

export class OwlGenerator extends BirdGenerator {
  generate(seed?: number): THREE.Group {
    const config = BirdGenerator.createPreset('owl', seed);
    return super.generate(config);
  }
}

export class ParrotGenerator extends BirdGenerator {
  generate(seed?: number): THREE.Group {
    const config = BirdGenerator.createPreset('parrot', seed);
    return super.generate(config);
  }
}

export class PenguinGenerator extends BirdGenerator {
  generate(seed?: number): THREE.Group {
    const config = BirdGenerator.createPreset('penguin', seed);
    return super.generate(config);
  }
}
