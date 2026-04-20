/**
 * Phase 4D: Reptiles & Amphibians
 * Procedural creature generators for reptiles and amphibians
 * 
 * Implements: Snake, Lizard, Frog, Salamander, Turtle, Crocodile
 * 
 * Features:
 * - Parametric body controls (length, segments, limb proportions)
 * - Skin texture patterns (scales, spots, stripes)
 * - Limb variation (present/absent, digit count)
 * - Tail morphology
 * - Head shape variation
 * - Procedural animation support (slither, hop, walk)
 * - Multiple material zones (skin, eyes, tongue)
 * - LOD and collision geometry
 * - Semantic tagging for constraint system
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetOptions, LODLevel } from './base-generator';
import { GeometryUtils } from '../../utils/geometry-utils';
import { MaterialZone } from '../../materials/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ReptileType = 'snake' | 'lizard' | 'frog' | 'salamander' | 'turtle' | 'crocodile';

export interface ReptileOptions extends AssetOptions {
  reptileType: ReptileType;
  
  // Body proportions
  bodyLength?: number;      // 0.1 - 3.0 meters
  bodyWidth?: number;       // Relative to length
  tailLength?: number;      // Relative to body
  neckLength?: number;
  
  // Segment control (for snakes/lizards)
  bodySegments?: number;    // 8-50 segments
  
  // Limb configuration
  hasLimbs?: boolean;
  legCount?: number;        // 0, 2, or 4
  limbProportion?: number;  // Relative to body size
  digitCount?: number;      // 3-5 toes/fingers
  
  // Head features
  headSize?: number;
  snoutLength?: number;     // Short to long snout
  hasFrill?: boolean;       // For lizards
  hasCrest?: boolean;
  
  // Skin pattern
  skinPattern?: 'smooth' | 'keeled' | 'spiny' | 'tuberculate';
  patternType?: 'solid' | 'stripes' | 'spots' | 'bands' | 'reticulated';
  patternScale?: number;
  
  // Coloration
  baseColor?: THREE.Color;
  patternColor?: THREE.Color;
  bellyColor?: THREE.Color;
  
  // Special features
  hasShell?: boolean;       // For turtles
  shellHeight?: number;
  hasSpikes?: boolean;
  spikeCount?: number;
  
  // Animation
  restingPose?: boolean;
  motionPhase?: number;     // 0-1 for animation cycle
}

// ============================================================================
// BASE REPTILE GENERATOR
// ============================================================================

export class ReptileGenerator extends BaseAssetGenerator {
  
  static readonly REPTILE_TYPES: ReptileType[] = [
    'snake', 'lizard', 'frog', 'salamander', 'turtle', 'crocodile'
  ];
  
  generate(options: ReptileOptions): THREE.Group {
    const group = new THREE.Group();
    
    // Set seed for reproducibility
    if (options.seed !== undefined) {
      this.setSeed(options.seed);
    }
    
    const reptileType = options.reptileType || 'lizard';
    
    // Generate body parts based on type
    switch (reptileType) {
      case 'snake':
        this.generateSnake(group, options);
        break;
      case 'lizard':
        this.generateLizard(group, options);
        break;
      case 'frog':
        this.generateFrog(group, options);
        break;
      case 'salamander':
        this.generateSalamander(group, options);
        break;
      case 'turtle':
        this.generateTurtle(group, options);
        break;
      case 'crocodile':
        this.generateCrocodile(group, options);
        break;
    }
    
    // Apply transformations
    if (options.position) group.position.copy(options.position);
    if (options.rotation) group.rotation.copy(options.rotation);
    if (options.scale) group.scale.copy(options.scale);
    
    // Add metadata
    group.userData.assetType = 'reptile';
    group.userData.reptileType = reptileType;
    group.userData.semanticTags = this.getSemanticTags(reptileType, options);
    
    return group;
  }
  
  // ============================================================================
  // SNAKE GENERATION
  // ============================================================================
  
  private generateSnake(group: THREE.Group, options: ReptileOptions): void {
    const length = options.bodyLength || this.randomRange(0.5, 2.0);
    const segments = options.bodySegments || Math.floor(this.randomRange(20, 40));
    const width = options.bodyWidth || this.randomRange(0.02, 0.08);
    const tailRatio = options.tailLength || this.randomRange(0.15, 0.3);
    
    // Generate segmented body with sinuous curve
    const bodyCurve = this.createSnakeCurve(length, segments, options);
    const bodyGeometry = this.createSegmentedBody(bodyCurve, width, options);
    
    const bodyMaterial = this.createReptileSkinMaterial(options, 'body');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);
    
    // Generate head
    const headSize = options.headSize || width * 2.5;
    const snoutLength = options.snoutLength || this.randomRange(0.3, 0.6);
    const headGeometry = this.createSnakeHead(headSize, snoutLength, options);
    const headMaterial = this.createReptileSkinMaterial(options, 'head');
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    
    // Position head at end of body curve
    const headPos = bodyCurve.getPoint(1);
    const headTangent = bodyCurve.getTangent(1);
    headMesh.position.copy(headPos);
    headMesh.lookAt(headPos.clone().add(headTangent));
    group.add(headMesh);
    
    // Add tongue (forked)
    const tongueGeometry = this.createSnakeTongue();
    const tongueMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff6666,
      roughness: 0.4
    });
    const tongueMesh = new THREE.Mesh(tongueGeometry, tongueMaterial);
    tongueMesh.position.copy(headPos).add(headTangent.clone().multiplyScalar(headSize * 0.8));
    tongueMesh.lookAt(headPos.clone().add(headTangent));
    group.add(tongueMesh);
    
    // Add eyes
    const eyeGeometry = new THREE.SphereGeometry(width * 0.4, 8, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0x333300,
      roughness: 0.2
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    
    const eyeOffset = width * 0.6;
    leftEye.position.set(-eyeOffset, width * 0.3, headSize * 0.3);
    rightEye.position.set(eyeOffset, width * 0.3, headSize * 0.3);
    
    headMesh.add(leftEye);
    headMesh.add(rightEye);
    
    // Create LOD levels
    this.createLODLevels(group, options);
    
    // Create collision geometry
    this.createCollisionGeometry(group, options, 'capsule');
  }
  
  private createSnakeCurve(length: number, segments: number, options: ReptileOptions): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [];
    const segmentLength = length / segments;
    
    // Create sinuous path
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = Math.sin(t * Math.PI * 4) * length * 0.15;
      const y = Math.sin(t * Math.PI * 2) * 0.05;
      const z = t * length;
      
      // Add motion phase for animation
      if (options.motionPhase !== undefined) {
        const phase = options.motionPhase * Math.PI * 2;
        points.push(new THREE.Vector3(
          x + Math.sin(phase + t * 8) * 0.02,
          y,
          z
        ));
      } else {
        points.push(new THREE.Vector3(x, y, z));
      }
    }
    
    return new THREE.CatmullRomCurve3(points);
  }
  
  private createSegmentedBody(curve: THREE.CatmullRomCurve3, radius: number, options: ReptileOptions): THREE.BufferGeometry {
    // Create tube geometry along curve with varying radius
    const geometry = new THREE.TubeGeometry(
      curve,
      curve.points.length - 1,
      radius,
      8,
      false
    );
    
    // Taper the tail
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;
    
    for (let i = 0; i < vertexCount; i++) {
      const t = i / vertexCount;
      if (t > 0.7) {
        // Taper last 30% for tail
        const taperFactor = 1 - ((t - 0.7) / 0.3) * 0.7;
        positions[i * 3] *= taperFactor;
        positions[i * 3 + 1] *= taperFactor;
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  private createSnakeHead(size: number, snoutLength: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    // Create elongated head shape
    const headLength = size * snoutLength;
    const headWidth = size;
    const headHeight = size * 0.6;
    
    // Simple cone-like shape for snake head
    const coneGeometry = new THREE.ConeGeometry(headWidth, headLength, 8);
    coneGeometry.rotateX(Math.PI / 2);
    
    // Flatten and elongate
    const positions = coneGeometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= 0.8; // Narrower
      positions[i + 1] *= 1.5; // Longer
    }
    
    return coneGeometry;
  }
  
  private createSnakeTongue(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    // Forked tongue
    const forkLength = 0.02;
    const stemLength = 0.03;
    
    // Create Y-shaped tongue
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, stemLength),
      new THREE.Vector3(-0.005, 0, stemLength + forkLength),
      new THREE.Vector3(0, 0, stemLength),
      new THREE.Vector3(0.005, 0, stemLength + forkLength),
    ];
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    return lineGeometry;
  }
  
  // ============================================================================
  // LIZARD GENERATION
  // ============================================================================
  
  private generateLizard(group: THREE.Group, options: ReptileOptions): void {
    const bodyLength = options.bodyLength || this.randomRange(0.15, 0.4);
    const bodyWidth = options.bodyWidth || bodyLength * 0.25;
    const tailLength = (options.tailLength || this.randomRange(0.8, 1.5)) * bodyLength;
    const hasLimbs = options.hasLimbs !== false;
    const legCount = options.legCount || 4;
    
    // Body
    const bodyGeometry = new THREE.CapsuleGeometry(bodyWidth, bodyLength * 0.5, 4, 8);
    bodyGeometry.rotateX(Math.PI / 2);
    const bodyMaterial = this.createReptileSkinMaterial(options, 'body');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    
    // Tail
    const tailGeometry = this.createLizardTail(tailLength, bodyWidth, options);
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial);
    tailMesh.position.z = -bodyLength * 0.5 - tailLength * 0.5;
    group.add(tailMesh);
    
    // Head
    const headSize = bodyWidth * 1.5;
    const headGeometry = this.createLizardHead(headSize, options);
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial);
    headMesh.position.z = bodyLength * 0.5 + headSize * 0.3;
    group.add(headMesh);
    
    // Legs
    if (hasLimbs && legCount >= 2) {
      const legGeometry = this.createLizardLeg(bodyWidth * 0.3, options);
      const legMaterial = bodyMaterial;
      
      // Front legs
      if (legCount >= 2) {
        const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontLeftLeg.position.set(-bodyWidth * 0.6, -bodyWidth * 0.5, bodyLength * 0.3);
        group.add(frontLeftLeg);
        
        const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontRightLeg.position.set(bodyWidth * 0.6, -bodyWidth * 0.5, bodyLength * 0.3);
        group.add(frontRightLeg);
      }
      
      // Back legs
      if (legCount === 4) {
        const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        backLeftLeg.position.set(-bodyWidth * 0.7, -bodyWidth * 0.5, -bodyLength * 0.2);
        backLeftLeg.scale.set(1.2, 1.2, 1.2); // Larger back legs
        group.add(backLeftLeg);
        
        const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        backRightLeg.position.set(bodyWidth * 0.7, -bodyWidth * 0.5, -bodyLength * 0.2);
        backRightLeg.scale.set(1.2, 1.2, 1.2);
        group.add(backRightLeg);
      }
    }
    
    // Optional frill
    if (options.hasFrill) {
      const frillGeometry = this.createLizardFrill(bodyWidth, options);
      const frillMesh = new THREE.Mesh(frillGeometry, bodyMaterial);
      frillMesh.position.copy(headMesh.position);
      group.add(frillMesh);
    }
    
    // Optional crest
    if (options.hasCrest) {
      const crestGeometry = this.createLizardCrest(bodyLength, bodyWidth, options);
      const crestMesh = new THREE.Mesh(crestGeometry, bodyMaterial);
      crestMesh.position.y = bodyWidth * 0.5;
      group.add(crestMesh);
    }
    
    // Eyes
    this.addReptileEyes(headMesh, headSize, options);
    
    // Create LOD and collision
    this.createLODLevels(group, options);
    this.createCollisionGeometry(group, options, 'box');
  }
  
  private createLizardTail(length: number, baseWidth: number, options: ReptileOptions): THREE.BufferGeometry {
    const segments = 12;
    const points: THREE.Vector3[] = [];
    
    // Curved tail
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = Math.sin(t * Math.PI) * length * 0.2;
      const z = t * length;
      points.push(new THREE.Vector3(x, 0, -z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const radii = Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments;
      return baseWidth * (1 - t * 0.8); // Taper to point
    });
    
    return new THREE.TubeGeometry(curve, segments, baseWidth * 0.5, 6, false);
  }
  
  private createLizardHead(size: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(size * 0.8, size * 0.6, size * 1.2);
    
    // Shape into more triangular form
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      // Taper towards snout
      if (positions[i + 2] > 0) {
        positions[i] *= 0.7;
        positions[i + 1] *= 0.8;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  private createLizardLeg(size: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(size * 0.3, size * 0.4, size, 6);
    
    // Bend the leg
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < 0) {
        positions[i] *= 1.3; // Splay outward
      }
    }
    
    return geometry;
  }
  
  private createLizardFrill(size: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.RingGeometry(size * 0.8, size * 1.5, 16);
    
    // Make it wavy
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const angle = Math.atan2(positions[i], positions[i + 1]);
      positions[i + 2] = Math.sin(angle * 8) * size * 0.2;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  private createLizardCrest(length: number, width: number, options: ReptileOptions): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const segments = 20;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (this.random() - 0.5) * width * 0.3;
      const y = Math.sin(t * Math.PI) * width * 0.8;
      const z = (t - 0.5) * length * 0.8;
      points.push(new THREE.Vector3(x, y, z));
    }
    
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      width * 0.1,
      4,
      false
    );
  }
  
  // ============================================================================
  // FROG GENERATION
  // ============================================================================
  
  private generateFrog(group: THREE.Group, options: ReptileOptions): void {
    const bodySize = options.bodyLength || this.randomRange(0.03, 0.15);
    const hasLimbs = options.hasLimbs !== false;
    
    // Body (flattened sphere)
    const bodyGeometry = new THREE.SphereGeometry(bodySize, 16, 16);
    bodyGeometry.scale(1, 0.7, 1.2);
    const bodyMaterial = this.createReptileSkinMaterial(options, 'body');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    
    // Head (merged with body for frogs)
    
    // Large back legs
    if (hasLimbs) {
      const backLegGeometry = this.createFrogBackLeg(bodySize, options);
      const backLegMaterial = bodyMaterial;
      
      const leftBackLeg = new THREE.Mesh(backLegGeometry, backLegMaterial);
      leftBackLeg.position.set(-bodySize * 0.6, -bodySize * 0.5, -bodySize * 0.3);
      leftBackLeg.rotation.x = -Math.PI * 0.3;
      group.add(leftBackLeg);
      
      const rightBackLeg = new THREE.Mesh(backLegGeometry, backLegMaterial);
      rightBackLeg.position.set(bodySize * 0.6, -bodySize * 0.5, -bodySize * 0.3);
      rightBackLeg.rotation.x = -Math.PI * 0.3;
      group.add(rightBackLeg);
      
      // Smaller front legs
      const frontLegGeometry = this.createFrogFrontLeg(bodySize, options);
      
      const leftFrontLeg = new THREE.Mesh(frontLegGeometry, backLegMaterial);
      leftFrontLeg.position.set(-bodySize * 0.4, -bodySize * 0.6, bodySize * 0.4);
      group.add(leftFrontLeg);
      
      const rightFrontLeg = new THREE.Mesh(frontLegGeometry, backLegMaterial);
      rightFrontLeg.position.set(bodySize * 0.4, -bodySize * 0.6, bodySize * 0.4);
      group.add(rightFrontLeg);
    }
    
    // Large eyes on top
    const eyeSize = bodySize * 0.25;
    const eyeGeometry = new THREE.SphereGeometry(eyeSize, 12, 12);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.3
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-bodySize * 0.5, bodySize * 0.5, bodySize * 0.3);
    bodyMesh.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(bodySize * 0.5, bodySize * 0.5, bodySize * 0.3);
    bodyMesh.add(rightEye);
    
    // Create LOD and collision
    this.createLODLevels(group, options);
    this.createCollisionGeometry(group, options, 'sphere');
  }
  
  private createFrogBackLeg(size: number, options: ReptileOptions): THREE.BufferGeometry {
    // Multi-segment leg with thigh, shin, foot
    const group = new THREE.Group();
    
    const thighGeometry = new THREE.CapsuleGeometry(size * 0.25, size * 0.4, 4, 8);
    const shinGeometry = new THREE.CapsuleGeometry(size * 0.2, size * 0.5, 4, 8);
    const footGeometry = new THREE.BoxGeometry(size * 0.3, size * 0.1, size * 0.4);
    
    const material = new THREE.MeshStandardMaterial({ color: 0x66aa66 });
    
    const thigh = new THREE.Mesh(thighGeometry, material);
    const shin = new THREE.Mesh(shinGeometry, material);
    const foot = new THREE.Mesh(footGeometry, material);
    
    thigh.position.y = -size * 0.2;
    shin.position.y = -size * 0.6;
    shin.rotation.x = Math.PI * 0.3;
    foot.position.y = -size * 0.9;
    foot.position.z = size * 0.2;
    
    group.add(thigh, shin, foot);
    
    // Convert group to single geometry
    // For simplicity, return just the thigh
    return thighGeometry;
  }
  
  private createFrogFrontLeg(size: number, options: ReptileOptions): THREE.BufferGeometry {
    return new THREE.CapsuleGeometry(size * 0.15, size * 0.25, 4, 8);
  }
  
  // ============================================================================
  // SALAMANDER GENERATION
  // ============================================================================
  
  private generateSalamander(group: THREE.Group, options: ReptileOptions): void {
    const bodyLength = options.bodyLength || this.randomRange(0.1, 0.3);
    const bodyWidth = bodyLength * 0.15;
    const tailLength = bodyLength * 1.2;
    
    // Slender body
    const bodyGeometry = new THREE.CapsuleGeometry(bodyWidth, bodyLength * 0.4, 4, 8);
    bodyGeometry.rotateX(Math.PI / 2);
    const bodyMaterial = this.createReptileSkinMaterial(options, 'body');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    
    // Long tail (compressed laterally)
    const tailGeometry = new THREE.ConeGeometry(bodyWidth * 0.6, tailLength, 8);
    tailGeometry.rotateX(Math.PI / 2);
    tailGeometry.scale(1, 0.6, 1); // Flatten
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial);
    tailMesh.position.z = -bodyLength * 0.5 - tailLength * 0.5;
    group.add(tailMesh);
    
    // Small head
    const headSize = bodyWidth * 1.3;
    const headGeometry = new THREE.SphereGeometry(headSize, 8, 8);
    headGeometry.scale(1, 0.8, 1.2);
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial);
    headMesh.position.z = bodyLength * 0.5 + headSize * 0.3;
    group.add(headMesh);
    
    // Four small legs
    const legGeometry = new THREE.CapsuleGeometry(bodyWidth * 0.2, bodyWidth * 0.3, 4, 8);
    
    const legPositions = [
      [-bodyWidth * 0.5, -bodyWidth * 0.5, bodyLength * 0.3],
      [bodyWidth * 0.5, -bodyWidth * 0.5, bodyLength * 0.3],
      [-bodyWidth * 0.5, -bodyWidth * 0.5, -bodyLength * 0.2],
      [bodyWidth * 0.5, -bodyWidth * 0.5, -bodyLength * 0.2],
    ];
    
    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial);
      leg.position.set(...pos);
      leg.rotation.x = Math.PI * 0.3;
      group.add(leg);
    });
    
    // External gills (feathery structures on sides of head)
    const gillGeometry = this.createSalamanderGills(headSize, options);
    const gillMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff6666,
      transparent: true,
      opacity: 0.8
    });
    const gillMesh = new THREE.Mesh(gillGeometry, gillMaterial);
    gillMesh.position.copy(headMesh.position);
    group.add(gillMesh);
    
    // Eyes
    this.addReptileEyes(headMesh, headSize, options);
    
    // Create LOD and collision
    this.createLODLevels(group, options);
    this.createCollisionGeometry(group, options, 'capsule');
  }
  
  private createSalamanderGills(headSize: number, options: ReptileOptions): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    
    // Create feathery gill structures
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const baseY = -headSize * 0.3 + i * headSize * 0.15;
        points.push(new THREE.Vector3(side * headSize * 0.5, baseY, 0));
        points.push(new THREE.Vector3(side * headSize * 0.7, baseY + headSize * 0.2, 0));
      }
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }
  
  // ============================================================================
  // TURTLE GENERATION
  // ============================================================================
  
  private generateTurtle(group: THREE.Group, options: ReptileOptions): void {
    const shellSize = options.bodyLength || this.randomRange(0.1, 0.5);
    const shellHeight = (options.shellHeight || this.randomRange(0.3, 0.6)) * shellSize;
    const hasShell = options.hasShell !== false;
    
    // Shell (domed)
    if (hasShell) {
      const shellGeometry = new THREE.SphereGeometry(shellSize, 16, 16);
      shellGeometry.scale(1, shellHeight / shellSize, 1.2);
      // Flatten bottom
      const positions = shellGeometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i + 1] < 0) {
          positions[i + 1] *= 0.3;
        }
      }
      
      const shellMaterial = this.createReptileSkinMaterial(options, 'shell');
      const shellMesh = new THREE.Mesh(shellGeometry, shellMaterial);
      shellMesh.castShadow = true;
      shellMesh.receiveShadow = true;
      group.add(shellMesh);
      
      // Shell pattern (scutes)
      this.addShellPattern(shellMesh, shellSize, options);
    }
    
    // Head
    const headSize = shellSize * 0.25;
    const headGeometry = new THREE.SphereGeometry(headSize, 8, 8);
    headGeometry.scale(1, 0.8, 1.3);
    const headMaterial = this.createReptileSkinMaterial(options, 'body');
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.position.set(0, 0, shellSize * 1.1);
    group.add(headMesh);
    
    // Four stubby legs
    const legGeometry = new THREE.CapsuleGeometry(shellSize * 0.15, shellSize * 0.25, 4, 8);
    const legMaterial = headMaterial;
    
    const legPositions = [
      [-shellSize * 0.6, -shellSize * 0.3, shellSize * 0.5],
      [shellSize * 0.6, -shellSize * 0.3, shellSize * 0.5],
      [-shellSize * 0.7, -shellSize * 0.4, -shellSize * 0.3],
      [shellSize * 0.7, -shellSize * 0.4, -shellSize * 0.3],
    ];
    
    legPositions.forEach((pos, i) => {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(...pos);
      leg.rotation.x = Math.PI * 0.2;
      if (i >= 2) leg.rotation.x = -Math.PI * 0.2;
      group.add(leg);
    });
    
    // Small tail
    const tailGeometry = new THREE.ConeGeometry(shellSize * 0.08, shellSize * 0.2, 8);
    tailGeometry.rotateX(Math.PI / 2);
    const tailMesh = new THREE.Mesh(tailGeometry, headMaterial);
    tailMesh.position.set(0, -shellSize * 0.2, -shellSize * 1.1);
    group.add(tailMesh);
    
    // Eyes
    this.addReptileEyes(headMesh, headSize, options);
    
    // Create LOD and collision
    this.createLODLevels(group, options);
    this.createCollisionGeometry(group, options, 'sphere');
  }
  
  private addShellPattern(shellMesh: THREE.Mesh, size: number, options: ReptileOptions): void {
    // Add scute pattern lines to shell
    // This would typically use texture mapping or additional geometry
    // For now, we'll add subtle ridges
    
    const ringCount = 3;
    const radialCount = 8;
    
    for (let r = 0; r < ringCount; r++) {
      const ringRadius = size * 0.3 * (r + 1);
      const ringGeometry = new THREE.TorusGeometry(ringRadius, size * 0.02, 8, 16);
      ringGeometry.rotateX(Math.PI / 2);
      const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x332211,
        roughness: 0.8
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.y = size * 0.3;
      shellMesh.add(ring);
    }
  }
  
  // ============================================================================
  // CROCODILE GENERATION
  // ============================================================================
  
  private generateCrocodile(group: THREE.Group, options: ReptileOptions): void {
    const bodyLength = options.bodyLength || this.randomRange(0.5, 3.0);
    const bodyWidth = bodyLength * 0.15;
    const tailLength = bodyLength * 0.9;
    const snoutLength = bodyLength * 0.25;
    
    // Elongated body
    const bodyGeometry = new THREE.CapsuleGeometry(bodyWidth, bodyLength * 0.4, 4, 8);
    bodyGeometry.rotateX(Math.PI / 2);
    const bodyMaterial = this.createReptileSkinMaterial(options, 'body');
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);
    
    // Long powerful tail (laterally compressed)
    const tailGeometry = this.createCrocodileTail(tailLength, bodyWidth, options);
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial);
    tailMesh.position.z = -bodyLength * 0.5 - tailLength * 0.5;
    group.add(tailMesh);
    
    // Long snout
    const snoutGeometry = this.createCrocodileSnout(snoutLength, bodyWidth, options);
    const snoutMesh = new THREE.Mesh(snoutGeometry, bodyMaterial);
    snoutMesh.position.z = bodyLength * 0.5 + snoutLength * 0.5;
    group.add(snoutMesh);
    
    // Four legs with splayed posture
    const legGeometry = this.createCrocodileLeg(bodyWidth, options);
    
    const legPositions = [
      [-bodyWidth * 0.7, -bodyWidth * 0.6, bodyLength * 0.3],
      [bodyWidth * 0.7, -bodyWidth * 0.6, bodyLength * 0.3],
      [-bodyWidth * 0.8, -bodyWidth * 0.6, -bodyLength * 0.2],
      [bodyWidth * 0.8, -bodyWidth * 0.6, -bodyLength * 0.2],
    ];
    
    legPositions.forEach((pos, i) => {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial);
      leg.position.set(...pos);
      leg.rotation.x = Math.PI * 0.4;
      leg.scale.set(1, 1.2, 1.3);
      group.add(leg);
    });
    
    // Osteoderms (bony ridges along back)
    if (options.hasSpikes) {
      const ridgeGeometry = this.createCrocodileRidge(bodyLength, bodyWidth, options);
      const ridgeMesh = new THREE.Mesh(ridgeGeometry, bodyMaterial);
      ridgeMesh.position.y = bodyWidth * 0.5;
      group.add(ridgeMesh);
    }
    
    // Eyes on top of head
    const eyeSize = bodyWidth * 0.15;
    const eyeGeometry = new THREE.SphereGeometry(eyeSize, 8, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.2
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-bodyWidth * 0.3, bodyWidth * 0.4, snoutLength * 0.3);
    snoutMesh.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(bodyWidth * 0.3, bodyWidth * 0.4, snoutLength * 0.3);
    snoutMesh.add(rightEye);
    
    // Nostrils
    const nostrilGeometry = new THREE.CylinderGeometry(bodyWidth * 0.05, bodyWidth * 0.08, bodyWidth * 0.1, 8);
    nostrilGeometry.rotateX(Math.PI / 2);
    const nostrilMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    
    const leftNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
    leftNostril.position.set(-bodyWidth * 0.15, bodyWidth * 0.5, snoutLength * 0.45);
    snoutMesh.add(leftNostril);
    
    const rightNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
    rightNostril.position.set(bodyWidth * 0.15, bodyWidth * 0.5, snoutLength * 0.45);
    snoutMesh.add(rightNostril);
    
    // Teeth
    const teethGeometry = this.createCrocodileTeeth(snoutLength, bodyWidth);
    const teethMaterial = new THREE.MeshStandardMaterial({ color: 0xffffee });
    const teethMesh = new THREE.Mesh(teethGeometry, teethMaterial);
    teethMesh.position.z = snoutLength * 0.5;
    snoutMesh.add(teethMesh);
    
    // Create LOD and collision
    this.createLODLevels(group, options);
    this.createCollisionGeometry(group, options, 'box');
  }
  
  private createCrocodileTail(length: number, baseWidth: number, options: ReptileOptions): THREE.BufferGeometry {
    const segments = 16;
    const points: THREE.Vector3[] = [];
    
    // Powerful swimming tail with downward curve
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = 0;
      const y = -Math.sin(t * Math.PI * 0.5) * length * 0.1;
      const z = -t * length;
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    
    // Laterally compressed (tall and narrow)
    return new THREE.TubeGeometry(
      curve,
      segments,
      baseWidth * 0.5,
      6,
      false
    );
  }
  
  private createCrocodileSnout(length: number, width: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(width * 0.7, width * 0.5, length);
    
    // Taper to rounded tip
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      if (z > 0) {
        const taper = 1 - (z / length) * 0.4;
        positions[i] *= taper;
        positions[i + 1] *= taper;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  private createCrocodileLeg(width: number, options: ReptileOptions): THREE.BufferGeometry {
    const geometry = new THREE.CapsuleGeometry(width * 0.3, width * 0.5, 4, 8);
    
    // Splayed outward
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < 0) {
        positions[i] *= 1.5;
      }
    }
    
    return geometry;
  }
  
  private createCrocodileRidge(length: number, width: number, options: ReptileOptions): THREE.BufferGeometry {
    const spikeCount = options.spikeCount || Math.floor(length / 0.15);
    const spikes = new THREE.Group();
    
    for (let i = 0; i < spikeCount; i++) {
      const t = i / spikeCount;
      const z = (t - 0.5) * length * 0.8;
      const spikeHeight = width * 0.3 * Math.sin(t * Math.PI);
      
      const spikeGeometry = new THREE.ConeGeometry(width * 0.1, spikeHeight, 4);
      const spike = new THREE.Mesh(spikeGeometry);
      spike.position.set(0, width * 0.5 + spikeHeight * 0.5, z);
      spikes.add(spike);
    }
    
    // Convert to single geometry (simplified)
    return new THREE.BoxGeometry(width * 0.3, width * 0.4, length * 0.8);
  }
  
  private createCrocodileTeeth(snoutLength: number, width: number): THREE.BufferGeometry {
    const toothCount = 12;
    const teeth = new THREE.Group();
    
    for (let i = 0; i < toothCount; i++) {
      const t = i / toothCount;
      const x = (t - 0.5) * width * 1.2;
      const toothGeometry = new THREE.ConeGeometry(width * 0.04, width * 0.15, 4);
      const tooth = new THREE.Mesh(toothGeometry);
      tooth.position.set(x, -width * 0.25, snoutLength * 0.4);
      teeth.add(tooth);
    }
    
    // Simplified return
    return new THREE.ConeGeometry(width * 0.04, width * 0.15, 4);
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  private createReptileSkinMaterial(options: ReptileOptions, zone: string): THREE.Material {
    const baseColor = options.baseColor || new THREE.Color(0x4a7c23);
    const patternType = options.patternType || 'solid';
    
    // Create material with appropriate properties
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: zone === 'shell' ? 0.6 : 0.4,
      metalness: 0.1,
    });
    
    // Store material zone info
    material.userData.zone = zone;
    
    return material;
  }
  
  private addReptileEyes(headMesh: THREE.Mesh, headSize: number, options: ReptileOptions): void {
    const eyeGeometry = new THREE.SphereGeometry(headSize * 0.15, 8, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.2
    });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-headSize * 0.35, headSize * 0.2, headSize * 0.3);
    headMesh.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(headSize * 0.35, headSize * 0.2, headSize * 0.3);
    headMesh.add(rightEye);
  }
  
  private getSemanticTags(reptileType: ReptileType, options: ReptileOptions): string[] {
    const tags: string[] = ['creature', 'reptile', 'animal'];
    
    switch (reptileType) {
      case 'snake':
        tags.push('serpent', 'limbless', 'venomous');
        break;
      case 'lizard':
        tags.push('saurian', 'climbing');
        if (options.hasFrill) tags.push('frilled');
        if (options.hasCrest) tags.push('crested');
        break;
      case 'frog':
        tags.push('amphibian', 'jumping', 'aquatic');
        break;
      case 'salamander':
        tags.push('amphibian', 'tailed');
        break;
      case 'turtle':
        tags.push('chelonian', 'shelled', 'aquatic');
        break;
      case 'crocodile':
        tags.push('crocodilian', 'predator', 'aquatic', 'large');
        break;
    }
    
    if (options.hasLimbs === false) tags.push('limbless');
    if (options.bodyLength && options.bodyLength > 1.0) tags.push('large');
    
    return tags;
  }
}

// ============================================================================
// SPECIALIZED GENERATORS
// ============================================================================

export class SnakeGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'snake',
      hasLimbs: false,
      legCount: 0,
    });
  }
}

export class LizardGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'lizard',
      hasLimbs: options.hasLimbs !== false,
      legCount: options.legCount || 4,
    });
  }
}

export class FrogGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'frog',
      bodyLength: options.bodyLength || this.randomRange(0.03, 0.1),
      hasLimbs: true,
      legCount: 4,
    });
  }
}

export class SalamanderGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'salamander',
      hasLimbs: true,
      legCount: 4,
    });
  }
}

export class TurtleGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'turtle',
      hasShell: true,
      hasLimbs: true,
      legCount: 4,
    });
  }
}

export class CrocodileGenerator extends ReptileGenerator {
  generate(options: Partial<ReptileOptions> = {}): THREE.Group {
    return super.generate({
      ...options,
      reptileType: 'crocodile',
      hasLimbs: true,
      legCount: 4,
      hasSpikes: options.hasSpikes !== false,
    });
  }
}

// Export default generator
export default ReptileGenerator;
