/**
 * Creature Generators - Phase 4A: Basic Invertebrates & Simple Creatures
 * 
 * Procedural generation of basic creature types including:
 * - Jellyfish
 * - Worms
 * - Slugs
 * - Snails
 * - Crabs
 * - Starfish
 * 
 * Based on original InfiniGen creature generators
 */

import * as THREE from 'three';
import { BaseAssetGenerator, type AssetGenerationParams, type LODLevel } from './base-generator';
import { createSeededRandom } from '../../utils/math-utils';

export interface CreatureParams extends AssetGenerationParams {
  /** Creature type */
  creatureType: 'jellyfish' | 'worm' | 'slug' | 'snail' | 'crab' | 'starfish';
  /** Scale multiplier */
  scale?: number;
  /** Animation phase for procedural animation */
  animationPhase?: number;
  /** Detail level for geometry complexity */
  detail?: number;
}

/**
 * Base creature generator with common functionality
 */
export class CreatureGenerator extends BaseAssetGenerator<CreatureParams> {
  protected readonly category = 'creature';
  
  generate(params: CreatureParams): THREE.Group {
    const group = new THREE.Group();
    const rng = createSeededRandom(params.seed);
    
    const scale = params.scale ?? 1.0;
    const detail = params.detail ?? 1.0;
    const animationPhase = params.animationPhase ?? 0;
    
    let creature: THREE.Group;
    
    switch (params.creatureType) {
      case 'jellyfish':
        creature = this.generateJellyfish(rng, scale, detail, animationPhase);
        break;
      case 'worm':
        creature = this.generateWorm(rng, scale, detail, animationPhase);
        break;
      case 'slug':
        creature = this.generateSlug(rng, scale, detail, animationPhase);
        break;
      case 'snail':
        creature = this.generateSnail(rng, scale, detail, animationPhase);
        break;
      case 'crab':
        creature = this.generateCrab(rng, scale, detail, animationPhase);
        break;
      case 'starfish':
        creature = this.generateStarfish(rng, scale, detail, animationPhase);
        break;
      default:
        throw new Error(`Unknown creature type: ${params.creatureType}`);
    }
    
    // Apply semantic tags
    this.addSemanticTags(creature, {
      category: 'creature',
      type: params.creatureType,
      animated: true,
      hasPhysics: true,
    });
    
    // Generate LOD levels
    this.generateLODs(creature, params);
    
    // Generate collision geometry
    this.generateCollisionGeometry(creature);
    
    group.add(creature);
    return group;
  }
  
  /**
   * Generate jellyfish with bell and tentacles
   */
  private generateJellyfish(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Bell parameters
    const bellRadius = 0.3 * scale * (0.8 + rng() * 0.4);
    const bellHeight = 0.25 * scale * (0.8 + rng() * 0.4);
    const bellSegments = Math.max(16, Math.floor(32 * detail));
    const bellRings = Math.max(8, Math.floor(16 * detail));
    
    // Create bell using lathe geometry
    const bellProfile: [number, number][] = [];
    for (let i = 0; i <= bellRings; i++) {
      const t = i / bellRings;
      const y = t * bellHeight;
      // Parabolic bell shape
      const r = bellRadius * Math.sin(t * Math.PI * 0.7) * (1 - t * 0.3);
      bellProfile.push([r, y]);
    }
    
    const bellGeometry = new THREE.LatheGeometry(bellProfile, bellSegments);
    bellGeometry.computeVertexNormals();
    
    const bellMaterial = this.createTranslucentMaterial(rng);
    const bell = new THREE.Mesh(bellGeometry, bellMaterial);
    bell.position.y = bellHeight * 0.5;
    group.add(bell);
    
    // Tentacles
    const numTentacles = Math.floor(8 + rng() * 16);
    const tentacleLength = bellRadius * (1.5 + rng() * 1.0);
    const tentacleSegments = Math.max(8, Math.floor(16 * detail));
    
    for (let i = 0; i < numTentacles; i++) {
      const angle = (i / numTentacles) * Math.PI * 2;
      const radius = bellRadius * 0.8 * (0.7 + rng() * 0.3);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const tentacle = this.createTentacle(
        rng,
        tentacleLength,
        tentacleSegments,
        detail,
        animationPhase + i * 0.5
      );
      tentacle.position.set(x, 0, z);
      group.add(tentacle);
    }
    
    // Oral arms
    const numArms = Math.floor(3 + rng() * 4);
    for (let i = 0; i < numArms; i++) {
      const angle = (i / numArms) * Math.PI * 2;
      const armLength = bellRadius * (0.8 + rng() * 0.4);
      
      const arm = this.createOralArm(rng, armLength, detail, animationPhase);
      arm.rotation.y = angle;
      group.add(arm);
    }
    
    return group;
  }
  
  /**
   * Create a single tentacle with sinusoidal animation
   */
  private createTentacle(
    rng: () => number,
    length: number,
    segments: number,
    detail: number,
    animationPhase: number
  ): THREE.Mesh {
    const points: THREE.Vector3[] = [];
    const thickness = 0.02 * (0.6 + rng() * 0.4);
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = -t * length;
      
      // Sinusoidal curve with animation
      const wave = Math.sin(t * Math.PI * 4 + animationPhase * 0.5) * 0.05 * (1 - t);
      const x = Math.cos(animationPhase + i * 0.3) * wave;
      const z = Math.sin(animationPhase + i * 0.3) * wave;
      
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, thickness, 8, false);
    geometry.computeVertexNormals();
    
    const material = this.createTranslucentMaterial(rng);
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Create oral arm
   */
  private createOralArm(
    rng: () => number,
    length: number,
    detail: number,
    animationPhase: number
  ): THREE.Mesh {
    const segments = Math.max(6, Math.floor(12 * detail));
    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = -t * length;
      const thickness = 0.04 * (1 - t * 0.5);
      
      const wave = Math.sin(t * Math.PI * 2 + animationPhase * 0.3) * 0.03;
      points.push(new THREE.Vector3(wave, y, 0));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, 0.03, 6, false);
    geometry.computeVertexNormals();
    
    const material = this.createTranslucentMaterial(rng);
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Generate worm/segmented creature
   */
  private generateWorm(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyLength = 0.8 * scale * (0.8 + rng() * 0.4);
    const bodyRadius = 0.04 * scale * (0.8 + rng() * 0.4);
    const numSegments = Math.floor(12 + rng() * 8);
    
    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const progress = t * bodyLength;
      
      // Sinusoidal body curve with animation
      const wave = Math.sin(progress * Math.PI * 3 + animationPhase * 2) * 0.1;
      const x = Math.cos(animationPhase + t * Math.PI) * wave * 0.5;
      const y = wave;
      const z = Math.sin(animationPhase + t * Math.PI) * wave * 0.5;
      
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    
    // Tapered tube
    const geometry = new THREE.TubeGeometry(curve, numSegments, bodyRadius, 12, false);
    
    // Apply tapering
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const segmentIndex = Math.floor((i / 3) / (geometry.parameters.tubularSegments * 12));
      const t = segmentIndex / numSegments;
      const taper = 1 - t * 0.6;
      
      positions[i] *= taper;
      positions[i + 1] *= taper;
      positions[i + 2] *= taper;
    }
    
    geometry.computeVertexNormals();
    
    const material = this.createFleshyMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    
    // Add head
    const headGeometry = new THREE.SphereGeometry(bodyRadius * 1.3, 12, 12);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.copy(points[0]);
    group.add(head);
    
    return group;
  }
  
  /**
   * Generate slug
   */
  private generateSlug(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyLength = 0.5 * scale * (0.8 + rng() * 0.4);
    const bodyWidth = 0.12 * scale * (0.8 + rng() * 0.4);
    const bodyHeight = 0.08 * scale * (0.8 + rng() * 0.4);
    const segments = Math.max(8, Math.floor(16 * detail));
    
    // Elongated body
    const geometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = geometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Flatten and elongate
      positions[i] = x * bodyLength * 0.5;
      positions[i + 1] = y * bodyHeight;
      positions[i + 2] = z * bodyWidth * 0.5;
      
      // Flatten bottom
      if (y < 0) {
        positions[i + 1] *= 0.5;
      }
    }
    
    geometry.computeVertexNormals();
    
    const material = this.createFleshyMaterial(rng);
    const body = new THREE.Mesh(geometry, material);
    group.add(body);
    
    // Eye stalks
    const stalkLength = bodyHeight * 0.8;
    const stalkRadius = bodyWidth * 0.15;
    
    for (let side of [-1, 1]) {
      const stalkGeometry = new THREE.CylinderGeometry(stalkRadius, stalkRadius * 0.8, stalkLength, 8);
      const stalk = new THREE.Mesh(stalkGeometry, material);
      stalk.position.set(side * bodyWidth * 0.3, bodyHeight * 0.8, bodyLength * 0.4);
      stalk.rotation.z = side * Math.PI * 0.15;
      group.add(stalk);
      
      // Eye
      const eyeGeometry = new THREE.SphereGeometry(stalkRadius * 1.5, 8, 8);
      const eye = new THREE.Mesh(eyeGeometry, this.createDarkMaterial(rng));
      eye.position.set(side * bodyWidth * 0.35, bodyHeight * 0.8 + stalkLength * 0.9, bodyLength * 0.42);
      group.add(eye);
    }
    
    return group;
  }
  
  /**
   * Generate snail with shell
   */
  private generateSnail(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Body (similar to slug but smaller)
    const bodyLength = 0.3 * scale * (0.8 + rng() * 0.4);
    const bodyWidth = 0.1 * scale * (0.8 + rng() * 0.4);
    const bodyHeight = 0.06 * scale * (0.8 + rng() * 0.4);
    const segments = Math.max(8, Math.floor(16 * detail));
    
    const bodyGeometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = bodyGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      positions[i] = x * bodyLength * 0.5;
      positions[i + 1] = y * bodyHeight;
      positions[i + 2] = z * bodyWidth * 0.5;
      
      if (y < 0) {
        positions[i + 1] *= 0.5;
      }
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createFleshyMaterial(rng);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Spiral shell
    const shellRadius = bodyWidth * 1.2;
    const shellTurns = 4 + Math.floor(rng() * 2);
    const shellSegments = Math.max(32, Math.floor(64 * detail));
    
    const shellPoints: THREE.Vector3[] = [];
    
    for (let i = 0; i <= shellSegments; i++) {
      const t = i / shellSegments;
      const angle = t * shellTurns * Math.PI * 2;
      const radius = shellRadius * (1 - t * 0.7);
      const height = t * shellRadius * 0.8;
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = height;
      
      shellPoints.push(new THREE.Vector3(x, y, z));
    }
    
    const shellCurve = new THREE.CatmullRomCurve3(shellPoints);
    const shellGeometry = new THREE.TubeGeometry(shellCurve, shellSegments, shellRadius * 0.3, 8, false);
    shellGeometry.computeVertexNormals();
    
    const shellMaterial = this.createShellMaterial(rng);
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.position.set(0, bodyHeight * 0.5, -bodyLength * 0.2);
    shell.rotation.x = Math.PI * 0.1;
    group.add(shell);
    
    // Eye stalks (smaller than slug)
    const stalkLength = bodyHeight * 0.6;
    const stalkRadius = bodyWidth * 0.12;
    
    for (let side of [-1, 1]) {
      const stalkGeometry = new THREE.CylinderGeometry(stalkRadius, stalkRadius * 0.8, stalkLength, 8);
      const stalk = new THREE.Mesh(stalkGeometry, bodyMaterial);
      stalk.position.set(side * bodyWidth * 0.25, bodyHeight * 0.7, bodyLength * 0.35);
      stalk.rotation.z = side * Math.PI * 0.12;
      group.add(stalk);
      
      const eyeGeometry = new THREE.SphereGeometry(stalkRadius * 1.3, 8, 8);
      const eye = new THREE.Mesh(eyeGeometry, this.createDarkMaterial(rng));
      eye.position.set(side * bodyWidth * 0.3, bodyHeight * 0.7 + stalkLength * 0.85, bodyLength * 0.37);
      group.add(eye);
    }
    
    return group;
  }
  
  /**
   * Generate crab
   */
  private generateCrab(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const carapaceWidth = 0.25 * scale * (0.8 + rng() * 0.4);
    const carapaceLength = 0.2 * scale * (0.8 + rng() * 0.4);
    const carapaceHeight = 0.08 * scale * (0.8 + rng() * 0.4);
    
    // Carapace (main body)
    const carapaceGeometry = new THREE.SphereGeometry(1, 16, 16);
    const positions = carapaceGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Flatten and shape
      positions[i] = x * carapaceWidth;
      positions[i + 1] = y * carapaceHeight;
      positions[i + 2] = z * carapaceLength;
      
      // Flatten bottom
      if (y < 0) {
        positions[i + 1] *= 0.3;
      }
    }
    
    carapaceGeometry.computeVertexNormals();
    
    const carapaceMaterial = this.createShellMaterial(rng);
    const carapace = new THREE.Mesh(carapaceGeometry, carapaceMaterial);
    group.add(carapace);
    
    // Legs (8 total, 4 per side)
    const legBaseLength = carapaceWidth * 0.6;
    const legSegments = Math.max(2, Math.floor(4 * detail));
    
    for (let side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const legAngle = (i / 4) * Math.PI * 0.6 - Math.PI * 0.3;
        const legZ = (i - 1.5) * carapaceLength * 0.4;
        
        const leg = this.createCrabLeg(
          rng,
          legBaseLength,
          legSegments,
          detail,
          animationPhase
        );
        leg.position.set(side * carapaceWidth * 0.5, -carapaceHeight * 0.3, legZ);
        leg.rotation.y = side * legAngle;
        leg.rotation.z = Math.PI * 0.3;
        group.add(leg);
      }
    }
    
    // Claws (2)
    for (let side of [-1, 1]) {
      const claw = this.createCrabClaw(rng, carapaceWidth * 0.6, detail, animationPhase);
      claw.position.set(side * carapaceWidth * 0.6, -carapaceHeight * 0.2, carapaceLength * 0.3);
      claw.rotation.y = side * Math.PI * 0.2;
      group.add(claw);
    }
    
    // Eyes
    const eyeStalkLength = carapaceHeight * 0.6;
    const eyeStalkRadius = carapaceWidth * 0.08;
    
    for (let side of [-1, 1]) {
      const stalkGeometry = new THREE.CylinderGeometry(eyeStalkRadius, eyeStalkRadius * 0.8, eyeStalkLength, 8);
      const stalk = new THREE.Mesh(stalkGeometry, carapaceMaterial);
      stalk.position.set(side * carapaceWidth * 0.2, carapaceHeight * 0.8, carapaceLength * 0.4);
      stalk.rotation.z = side * Math.PI * 0.1;
      group.add(stalk);
      
      const eyeGeometry = new THREE.SphereGeometry(eyeStalkRadius * 1.5, 8, 8);
      const eye = new THREE.Mesh(eyeGeometry, this.createDarkMaterial(rng));
      eye.position.set(side * carapaceWidth * 0.22, carapaceHeight * 0.8 + eyeStalkLength * 0.9, carapaceLength * 0.42);
      group.add(eye);
    }
    
    return group;
  }
  
  /**
   * Create crab leg segment
   */
  private createCrabLeg(
    rng: () => number,
    length: number,
    segments: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const jointRadius = 0.015 * (0.8 + rng() * 0.4);
    
    // Multiple segments
    const numSegments = 3;
    let currentPos = new THREE.Vector3(0, 0, 0);
    
    for (let i = 0; i < numSegments; i++) {
      const segLength = length / numSegments * (1 - i * 0.2);
      const segGeometry = new THREE.CylinderGeometry(jointRadius * (1 - i * 0.2), jointRadius * (0.8 - i * 0.15), segLength, 8);
      const seg = new THREE.Mesh(segGeometry, this.createShellMaterial(rng));
      
      const angle = Math.PI * 0.3 * (i % 2 === 0 ? 1 : -1);
      seg.position.y = -segLength * 0.5;
      seg.rotation.x = angle;
      
      seg.position.add(currentPos);
      group.add(seg);
      
      currentPos.y -= segLength;
      currentPos.x += Math.sin(angle) * segLength;
    }
    
    return group;
  }
  
  /**
   * Create crab claw
   */
  private createCrabClaw(
    rng: () => number,
    size: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Arm
    const armLength = size * 0.6;
    const armGeometry = new THREE.CylinderGeometry(size * 0.12, size * 0.1, armLength, 8);
    const arm = new THREE.Mesh(armGeometry, this.createShellMaterial(rng));
    arm.rotation.x = Math.PI * 0.5;
    arm.position.y = -armLength * 0.5;
    group.add(arm);
    
    // Fixed finger
    const fixedFingerGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.4, 8);
    const fixedFinger = new THREE.Mesh(fixedFingerGeometry, this.createShellMaterial(rng));
    fixedFinger.position.y = -armLength;
    fixedFinger.rotation.x = Math.PI * 0.3;
    group.add(fixedFinger);
    
    // Movable finger (animated)
    const movableFingerGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.4, 8);
    const movableFinger = new THREE.Mesh(movableFingerGeometry, this.createShellMaterial(rng));
    movableFinger.position.y = -armLength;
    movableFinger.rotation.x = -Math.PI * 0.2 + Math.sin(animationPhase * 2) * 0.1;
    group.add(movableFinger);
    
    return group;
  }
  
  /**
   * Generate starfish
   */
  private generateStarfish(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const armLength = 0.2 * scale * (0.8 + rng() * 0.4);
    const armWidth = 0.06 * scale * (0.8 + rng() * 0.4);
    const armThickness = 0.03 * scale * (0.8 + rng() * 0.4);
    const numArms = 5; // Can be extended to support more arms
    
    const centerMaterial = this.createShellMaterial(rng);
    
    // Center disk
    const centerRadius = armWidth * 0.8;
    const centerGeometry = new THREE.SphereGeometry(centerRadius, 12, 12);
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.scale.y = 0.5; // Flatten
    group.add(center);
    
    // Arms
    for (let i = 0; i < numArms; i++) {
      const angle = (i / numArms) * Math.PI * 2;
      
      const arm = this.createStarfishArm(
        rng,
        armLength,
        armWidth,
        armThickness,
        detail
      );
      arm.position.set(
        Math.cos(angle) * centerRadius * 0.5,
        0,
        Math.sin(angle) * centerRadius * 0.5
      );
      arm.rotation.y = -angle;
      group.add(arm);
    }
    
    return group;
  }
  
  /**
   * Create starfish arm
   */
  private createStarfishArm(
    rng: () => number,
    length: number,
    width: number,
    thickness: number,
    detail: number
  ): THREE.Mesh {
    const segments = Math.max(4, Math.floor(8 * detail));
    
    const geometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = geometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Elongate and taper
      const t = (x + 1) * 0.5; // 0 at base, 1 at tip
      const taper = 1 - t * 0.6;
      
      positions[i] = x * length * 0.5;
      positions[i + 1] = y * thickness * taper;
      positions[i + 2] = z * width * taper;
      
      // Flatten bottom
      if (y < 0) {
        positions[i + 1] *= 0.7;
      }
    }
    
    geometry.computeVertexNormals();
    
    const material = this.createShellMaterial(rng);
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Create translucent material for jellyfish
   */
  private createTranslucentMaterial(rng: () => number): THREE.MeshPhysicalMaterial {
    const hue = 0.5 + rng() * 0.1; // Blue-cyan range
    const saturation = 0.3 + rng() * 0.3;
    const lightness = 0.6 + rng() * 0.2;
    
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(hue, saturation, lightness),
      transparent: true,
      opacity: 0.6 + rng() * 0.3,
      transmission: 0.5,
      thickness: 0.5,
      roughness: 0.2,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide,
    });
  }
  
  /**
   * Create fleshy material for worms/slugs
   */
  private createFleshyMaterial(rng: () => number): THREE.MeshStandardMaterial {
    const hue = 0.02 + rng() * 0.05; // Pink-brown range
    const saturation = 0.3 + rng() * 0.3;
    const lightness = 0.4 + rng() * 0.2;
    
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, saturation, lightness),
      roughness: 0.6,
      metalness: 0.0,
      bumpScale: 0.01,
    });
  }
  
  /**
   * Create shell material for crabs/snails
   */
  private createShellMaterial(rng: () => number): THREE.MeshStandardMaterial {
    const hue = 0.02 + rng() * 0.1; // Red-orange-brown range
    const saturation = 0.4 + rng() * 0.3;
    const lightness = 0.3 + rng() * 0.2;
    
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, saturation, lightness),
      roughness: 0.4,
      metalness: 0.1,
      bumpScale: 0.02,
    });
  }
  
  /**
   * Create dark material for eyes
   */
  private createDarkMaterial(rng: () => number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0, 0, 0.1 + rng() * 0.2),
      roughness: 0.3,
      metalness: 0.5,
    });
  }
}

/**
 * Specialized jellyfish generator with presets
 */
export class JellyfishGenerator extends CreatureGenerator {
  generatePreset(preset: string, params?: Partial<CreatureParams>): THREE.Group {
    const baseParams: CreatureParams = {
      creatureType: 'jellyfish',
      seed: Math.random(),
      ...params,
    };
    
    switch (preset) {
      case 'moon':
        baseParams.scale = 1.2;
        baseParams.detail = 1.0;
        break;
      case 'lion-mane':
        baseParams.scale = 2.0;
        baseParams.detail = 1.5;
        break;
      case 'box':
        baseParams.scale = 0.8;
        baseParams.detail = 0.8;
        break;
      default:
        break;
    }
    
    return this.generate(baseParams);
  }
}

/**
 * Specialized crab generator with presets
 */
export class CrabGenerator extends CreatureGenerator {
  generatePreset(preset: string, params?: Partial<CreatureParams>): THREE.Group {
    const baseParams: CreatureParams = {
      creatureType: 'crab',
      seed: Math.random(),
      ...params,
    };
    
    switch (preset) {
      case 'blue':
        baseParams.scale = 1.0;
        break;
      case 'king':
        baseParams.scale = 2.5;
        baseParams.detail = 1.5;
        break;
      case 'hermit':
        baseParams.scale = 0.6;
        break;
      default:
        break;
    }
    
    return this.generate(baseParams);
  }
}

// Export main generator and specialized variants
export { CreatureGenerator as BaseCreatureGenerator };
export default CreatureGenerator;
