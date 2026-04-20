/**
 * Fish & Aquatic Vertebrate Generators - Phase 4B
 * 
 * Procedural generation of fish and aquatic vertebrates including:
 * - Basic fish (various body types)
 * - Eel-like creatures
 * - Rays and flatfish
 * - Seahorses
 * - Anglerfish
 * 
 * Based on original InfiniGen fish generators
 */

import * as THREE from 'three';
import { BaseAssetGenerator, type AssetGenerationParams, type LODLevel } from './base-generator';
import { createSeededRandom } from '../../utils/math-utils';

export interface FishParams extends AssetGenerationParams {
  /** Fish type */
  fishType: 'basic' | 'eel' | 'ray' | 'flatfish' | 'seahorse' | 'anglerfish';
  /** Scale multiplier */
  scale?: number;
  /** Animation phase for swimming motion */
  animationPhase?: number;
  /** Detail level for geometry complexity */
  detail?: number;
  /** Body pattern/coloration */
  pattern?: 'striped' | 'spotted' | 'gradient' | 'solid';
  /** Fin style */
  finStyle?: 'rounded' | 'pointed' | 'filamentous';
}

/**
 * Base fish generator with common functionality
 */
export class FishGenerator extends BaseAssetGenerator<FishParams> {
  protected readonly category = 'creature';
  
  generate(params: FishParams): THREE.Group {
    const group = new THREE.Group();
    const rng = createSeededRandom(params.seed);
    
    const scale = params.scale ?? 1.0;
    const detail = params.detail ?? 1.0;
    const animationPhase = params.animationPhase ?? 0;
    const pattern = params.pattern ?? 'solid';
    const finStyle = params.finStyle ?? 'rounded';
    
    let fish: THREE.Group;
    
    switch (params.fishType) {
      case 'basic':
        fish = this.generateBasicFish(rng, scale, detail, animationPhase, pattern, finStyle);
        break;
      case 'eel':
        fish = this.generateEel(rng, scale, detail, animationPhase, pattern);
        break;
      case 'ray':
        fish = this.generateRay(rng, scale, detail, animationPhase, finStyle);
        break;
      case 'flatfish':
        fish = this.generateFlatfish(rng, scale, detail, animationPhase, pattern);
        break;
      case 'seahorse':
        fish = this.generateSeahorse(rng, scale, detail, animationPhase);
        break;
      case 'anglerfish':
        fish = this.generateAnglerfish(rng, scale, detail, animationPhase);
        break;
      default:
        throw new Error(`Unknown fish type: ${params.fishType}`);
    }
    
    // Apply semantic tags
    this.addSemanticTags(fish, {
      category: 'creature',
      type: 'fish',
      subtype: params.fishType,
      animated: true,
      hasPhysics: true,
      habitat: 'aquatic',
    });
    
    // Generate LOD levels
    this.generateLODs(fish, params);
    
    // Generate collision geometry
    this.generateCollisionGeometry(fish);
    
    group.add(fish);
    return group;
  }
  
  /**
   * Generate basic fish with typical body plan
   */
  private generateBasicFish(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number,
    pattern: string,
    finStyle: string
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Body parameters
    const bodyLength = 0.4 * scale * (0.8 + rng() * 0.4);
    const bodyHeight = bodyLength * 0.35 * (0.8 + rng() * 0.4);
    const bodyWidth = bodyLength * 0.2 * (0.8 + rng() * 0.4);
    const bodySegments = Math.max(16, Math.floor(32 * detail));
    
    // Create fusiform body using scaled sphere
    const bodyGeometry = new THREE.SphereGeometry(1, bodySegments, bodySegments);
    const positions = bodyGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Elongate along X axis
      positions[i] = x * bodyLength * 0.5;
      positions[i + 1] = y * bodyHeight * 0.5;
      positions[i + 2] = z * bodyWidth * 0.5;
      
      // Taper tail
      if (x > 0.3) {
        const taper = 1 - (x - 0.3) * 2.5;
        positions[i + 1] *= taper;
        positions[i + 2] *= taper;
      }
      
      // Flatten belly slightly
      if (y < -0.2) {
        positions[i + 1] *= 0.85;
      }
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createFishSkinMaterial(rng, pattern);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Tail fin (caudal fin)
    const tailFin = this.createTailFin(rng, bodyLength, bodyHeight, detail, finStyle, animationPhase);
    tailFin.position.set(bodyLength * 0.48, 0, 0);
    group.add(tailFin);
    
    // Dorsal fin
    const dorsalFin = this.createDorsalFin(rng, bodyLength, bodyHeight, detail, finStyle);
    dorsalFin.position.set(0, bodyHeight * 0.5, 0);
    group.add(dorsalFin);
    
    // Pectoral fins (pair)
    for (let side of [-1, 1]) {
      const pectoralFin = this.createPectoralFin(rng, bodyLength, bodyHeight, detail, finStyle, animationPhase);
      pectoralFin.position.set(-bodyLength * 0.2, -bodyHeight * 0.2, side * bodyWidth * 0.5);
      pectoralFin.rotation.z = side * Math.PI * 0.3;
      group.add(pectoralFin);
    }
    
    // Pelvic fins (pair)
    for (let side of [-1, 1]) {
      const pelvicFin = this.createPelvicFin(rng, bodyLength, bodyHeight, detail, finStyle);
      pelvicFin.position.set(bodyLength * 0.1, -bodyHeight * 0.45, side * bodyWidth * 0.4);
      group.add(pelvicFin);
    }
    
    // Anal fin
    const analFin = this.createAnalFin(rng, bodyLength, bodyHeight, detail, finStyle);
    analFin.position.set(bodyLength * 0.25, -bodyHeight * 0.45, 0);
    group.add(analFin);
    
    // Eyes
    const eyeRadius = bodyHeight * 0.12;
    for (let side of [-1, 1]) {
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);
      const eyeMaterial = this.createEyeMaterial(rng);
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(-bodyLength * 0.35, bodyHeight * 0.15, side * bodyWidth * 0.55);
      group.add(eye);
    }
    
    // Scales texture detail (optional based on detail level)
    if (detail > 0.5) {
      this.addScaleDetail(body, bodyLength, bodyHeight, bodyWidth, rng);
    }
    
    return group;
  }
  
  /**
   * Create tail fin with animation
   */
  private createTailFin(
    rng: () => number,
    bodyLength: number,
    bodyHeight: number,
    detail: number,
    finStyle: string,
    animationPhase: number
  ): THREE.Mesh {
    const finHeight = bodyHeight * 0.9 * (0.8 + rng() * 0.4);
    const finWidth = bodyLength * 0.25 * (0.8 + rng() * 0.4);
    const segments = Math.max(4, Math.floor(8 * detail));
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    
    if (finStyle === 'pointed') {
      // Forked tail
      shape.lineTo(finWidth, finHeight * 0.3);
      shape.lineTo(finWidth * 0.7, 0);
      shape.lineTo(finWidth, -finHeight * 0.3);
    } else if (finStyle === 'filamentous') {
      // Extended filaments
      shape.lineTo(finWidth * 0.5, finHeight * 0.8);
      shape.lineTo(finWidth * 0.3, 0);
      shape.lineTo(finWidth * 0.5, -finHeight * 0.8);
    } else {
      // Rounded tail
      shape.lineTo(finWidth, finHeight * 0.4);
      shape.lineTo(finWidth * 0.8, 0);
      shape.lineTo(finWidth, -finHeight * 0.4);
    }
    
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.02,
      bevelEnabled: false,
    });
    
    // Animate tail oscillation
    geometry.rotateZ(Math.sin(animationPhase * 2) * 0.3);
    
    const material = this.createFinMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI * 0.5;
    
    return mesh;
  }
  
  /**
   * Create dorsal fin
   */
  private createDorsalFin(
    rng: () => number,
    bodyLength: number,
    bodyHeight: number,
    detail: number,
    finStyle: string
  ): THREE.Mesh {
    const finHeight = bodyHeight * 0.6 * (0.7 + rng() * 0.5);
    const finBase = bodyLength * 0.3 * (0.8 + rng() * 0.4);
    const segments = Math.max(4, Math.floor(8 * detail));
    
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0));
    
    if (finStyle === 'pointed') {
      points.push(new THREE.Vector2(finBase * 0.3, finHeight));
      points.push(new THREE.Vector2(finBase, 0));
    } else if (finStyle === 'filamentous') {
      points.push(new THREE.Vector2(finBase * 0.2, finHeight * 1.5));
      points.push(new THREE.Vector2(finBase, 0));
    } else {
      points.push(new THREE.Vector2(finBase * 0.5, finHeight));
      points.push(new THREE.Vector2(finBase, 0));
    }
    
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.02,
      bevelEnabled: false,
    });
    
    const material = this.createFinMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    
    return mesh;
  }
  
  /**
   * Create pectoral fin with animation
   */
  private createPectoralFin(
    rng: () => number,
    bodyLength: number,
    bodyHeight: number,
    detail: number,
    finStyle: string,
    animationPhase: number
  ): THREE.Mesh {
    const finLength = bodyLength * 0.25 * (0.7 + rng() * 0.4);
    const finHeight = bodyHeight * 0.4 * (0.7 + rng() * 0.5);
    
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(finLength, finHeight * 0.3));
    points.push(new THREE.Vector2(finLength * 0.8, 0));
    
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.015,
      bevelEnabled: false,
    });
    
    // Animate fin flapping
    geometry.rotateX(Math.sin(animationPhase * 3) * 0.2);
    
    const material = this.createFinMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.z = -Math.PI * 0.3;
    
    return mesh;
  }
  
  /**
   * Create pelvic fin
   */
  private createPelvicFin(
    rng: () => number,
    bodyLength: number,
    bodyHeight: number,
    detail: number,
    finStyle: string
  ): THREE.Mesh {
    const finLength = bodyLength * 0.15 * (0.7 + rng() * 0.4);
    const finHeight = bodyHeight * 0.25 * (0.7 + rng() * 0.5);
    
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(finLength, finHeight * 0.5));
    points.push(new THREE.Vector2(finLength * 0.7, 0));
    
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.015,
      bevelEnabled: false,
    });
    
    const material = this.createFinMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    
    return mesh;
  }
  
  /**
   * Create anal fin
   */
  private createAnalFin(
    rng: () => number,
    bodyLength: number,
    bodyHeight: number,
    detail: number,
    finStyle: string
  ): THREE.Mesh {
    const finLength = bodyLength * 0.12 * (0.7 + rng() * 0.4);
    const finHeight = bodyHeight * 0.2 * (0.7 + rng() * 0.5);
    
    const points: THREE.Vector2[] = [];
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(finLength, -finHeight));
    points.push(new THREE.Vector2(finLength * 0.7, 0));
    
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.015,
      bevelEnabled: false,
    });
    
    const material = this.createFinMaterial(rng);
    const mesh = new THREE.Mesh(geometry, material);
    
    return mesh;
  }
  
  /**
   * Add scale detail to body
   */
  private addScaleDetail(
    mesh: THREE.Mesh,
    length: number,
    height: number,
    width: number,
    rng: () => number
  ): void {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    
    // Add subtle scale bumps using vertex displacement
    const scaleSize = Math.min(length, height) * 0.08;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Create scale pattern based on position
      const scaleU = (x / length + 0.5) * 20;
      const scaleV = (y / height + 0.5) * 20;
      
      const scaleNoise = Math.sin(scaleU * Math.PI) * Math.cos(scaleV * Math.PI);
      const displacement = Math.max(0, scaleNoise) * scaleSize * 0.02;
      
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
   * Generate eel-like creature
   */
  private generateEel(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number,
    pattern: string
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyLength = 0.8 * scale * (0.8 + rng() * 0.4);
    const bodyRadius = 0.04 * scale * (0.7 + rng() * 0.4);
    const numSegments = Math.floor(24 + rng() * 12);
    
    // Create serpentine body using tube geometry
    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const progress = t * bodyLength;
      
      // Sinusoidal curve with animation
      const wave = Math.sin(progress * Math.PI * 4 + animationPhase * 3) * 0.15;
      const x = Math.cos(animationPhase * 2 + t * Math.PI * 2) * wave * 0.5;
      const y = wave;
      const z = Math.sin(animationPhase * 2 + t * Math.PI * 2) * wave * 0.5;
      
      points.push(new THREE.Vector3(x - bodyLength * 0.5, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    
    // Tapered tube - thicker in middle, thinner at ends
    const geometry = new THREE.TubeGeometry(curve, numSegments, bodyRadius, 12, false);
    
    // Apply tapering
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      // Find which segment this vertex belongs to
      const segmentIndex = Math.floor((i / 3) / (geometry.parameters.tubularSegments * 12));
      const t = segmentIndex / numSegments;
      
      // Taper at both ends
      let taper = 1;
      if (t < 0.1) {
        taper = t * 10;
      } else if (t > 0.9) {
        taper = (1 - t) * 10;
      }
      
      positions[i] *= taper;
      positions[i + 1] *= taper;
      positions[i + 2] *= taper;
    }
    
    geometry.computeVertexNormals();
    
    const material = this.createFishSkinMaterial(rng, pattern);
    const body = new THREE.Mesh(geometry, material);
    group.add(body);
    
    // Small pectoral fins (reduced in eels)
    for (let side of [-1, 1]) {
      const finGeometry = new THREE.PlaneGeometry(bodyLength * 0.08, bodyLength * 0.04);
      const fin = new THREE.Mesh(finGeometry, this.createFinMaterial(rng));
      fin.position.set(-bodyLength * 0.4, 0, side * bodyRadius * 1.5);
      fin.rotation.y = side * Math.PI * 0.5;
      group.add(fin);
    }
    
    // Continuous dorsal/anal fins
    const finHeight = bodyRadius * 1.5;
    const finGeometry = new THREE.PlaneGeometry(bodyLength * 0.7, finHeight);
    
    // Dorsal fin
    const dorsalFin = new THREE.Mesh(finGeometry, this.createFinMaterial(rng));
    dorsalFin.position.set(0, bodyRadius * 1.2, 0);
    group.add(dorsalFin);
    
    // Anal fin
    const analFin = new THREE.Mesh(finGeometry, this.createFinMaterial(rng));
    analFin.position.set(0, -bodyRadius * 1.2, 0);
    analFin.rotation.x = Math.PI;
    group.add(analFin);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(bodyRadius * 1.4, 8, 8);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.set(-bodyLength * 0.48, 0, 0);
    head.scale.set(0.7, 1, 1);
    group.add(head);
    
    // Eyes
    const eyeRadius = bodyRadius * 0.4;
    for (let side of [-1, 1]) {
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 6, 6);
      const eye = new THREE.Mesh(eyeGeometry, this.createEyeMaterial(rng));
      eye.position.set(-bodyLength * 0.45, bodyRadius * 0.3, side * bodyRadius * 1.3);
      group.add(eye);
    }
    
    return group;
  }
  
  /**
   * Generate ray (flat cartilaginous fish)
   */
  private generateRay(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number,
    finStyle: string
  ): THREE.Group {
    const group = new THREE.Group();
    
    const discWidth = 0.5 * scale * (0.8 + rng() * 0.4);
    const discLength = 0.4 * scale * (0.8 + rng() * 0.4);
    const tailLength = discLength * (0.8 + rng() * 0.4);
    const segments = Math.max(16, Math.floor(32 * detail));
    
    // Create flattened disc body
    const bodyGeometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = bodyGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Flatten vertically
      positions[i + 1] *= 0.15;
      
      // Create wing-like extensions
      const wingFactor = 1 + Math.abs(x) * 0.8;
      positions[i] = x * discWidth * 0.5 * wingFactor;
      positions[i + 2] = z * discLength * 0.5;
      
      // Round the edges
      const dist = Math.sqrt(x * x + z * z);
      if (dist > 0.7) {
        const taper = 1 - (dist - 0.7) * 1.5;
        positions[i + 1] *= taper;
      }
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createFishSkinMaterial(rng, 'solid');
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Tail
    const tailPoints: THREE.Vector3[] = [];
    const tailSegments = Math.max(8, Math.floor(16 * detail));
    
    for (let i = 0; i <= tailSegments; i++) {
      const t = i / tailSegments;
      const radius = bodyGeometry.parameters.radius * (1 - t * 0.8);
      tailPoints.push(new THREE.Vector3(discLength * 0.5 + t * tailLength, 0, 0));
    }
    
    const tailCurve = new THREE.CatmullRomCurve3(tailPoints);
    const tailGeometry = new THREE.TubeGeometry(tailCurve, tailSegments, 0.03 * scale, 8, false);
    
    // Animate tail undulation
    const tailPositions = tailGeometry.attributes.position.array;
    for (let i = 0; i < tailPositions.length; i += 3) {
      const t = i / tailPositions.length;
      const wave = Math.sin(t * Math.PI * 3 + animationPhase * 2) * 0.1;
      tailPositions[i + 2] += wave;
    }
    
    tailGeometry.computeVertexNormals();
    
    const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
    group.add(tail);
    
    // Pectoral fin tips (wingtips)
    for (let side of [-1, 1]) {
      const tipGeometry = new THREE.ConeGeometry(0.02 * scale, 0.08 * scale, 8);
      const tip = new THREE.Mesh(tipGeometry, bodyMaterial);
      tip.position.set(0, 0, side * discWidth * 0.52);
      tip.rotation.x = Math.PI * 0.5;
      tip.rotation.z = side * Math.PI * 0.1;
      group.add(tip);
    }
    
    // Eyes on top
    const eyeRadius = 0.03 * scale;
    for (let side of [-1, 1]) {
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);
      const eye = new THREE.Mesh(eyeGeometry, this.createEyeMaterial(rng));
      eye.position.set(-discLength * 0.2, 0.08 * scale, side * discWidth * 0.15);
      group.add(eye);
    }
    
    return group;
  }
  
  /**
   * Generate flatfish (flounder, sole)
   */
  private generateFlatfish(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number,
    pattern: string
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyLength = 0.4 * scale * (0.8 + rng() * 0.4);
    const bodyWidth = bodyLength * 0.6 * (0.8 + rng() * 0.4);
    const bodyThickness = bodyLength * 0.08 * (0.8 + rng() * 0.4);
    const segments = Math.max(16, Math.floor(32 * detail));
    
    // Create oval flattened body
    const bodyGeometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = bodyGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Flatten significantly
      positions[i] = x * bodyLength * 0.5;
      positions[i + 1] = y * bodyThickness;
      positions[i + 2] = z * bodyWidth * 0.5;
      
      // Asymmetric - eyed side slightly convex
      if (y > 0 && rng() > 0.3) {
        positions[i + 1] *= 1.2;
      }
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createFishSkinMaterial(rng, pattern);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Both eyes on one side (top)
    const eyeRadius = bodyThickness * 0.6;
    for (let i = 0; i < 2; i++) {
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 8, 8);
      const eye = new THREE.Mesh(eyeGeometry, this.createEyeMaterial(rng));
      const xOffset = -bodyLength * 0.2 + i * bodyLength * 0.15;
      const zOffset = bodyWidth * 0.1 * (i === 0 ? -1 : 1);
      eye.position.set(xOffset, bodyThickness * 1.5, zOffset);
      group.add(eye);
    }
    
    // Continuous fins around edge
    const finHeight = bodyThickness * 2;
    const finSegments = Math.max(8, Math.floor(16 * detail));
    
    // Dorsal fin (along top edge)
    const dorsalPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= finSegments; i++) {
      const t = i / finSegments;
      const x = (t - 0.5) * bodyLength;
      dorsalPoints.push(new THREE.Vector3(x, bodyThickness, 0));
    }
    
    const dorsalCurve = new THREE.CatmullRomCurve3(dorsalPoints);
    const dorsalGeometry = new THREE.TubeGeometry(dorsalCurve, finSegments, finHeight * 0.3, 4, false);
    const dorsalFin = new THREE.Mesh(dorsalGeometry, this.createFinMaterial(rng));
    group.add(dorsalFin);
    
    // Anal fin (along bottom edge)
    const analPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= finSegments; i++) {
      const t = i / finSegments;
      const x = (t - 0.5) * bodyLength;
      analPoints.push(new THREE.Vector3(x, -bodyThickness, 0));
    }
    
    const analCurve = new THREE.CatmullRomCurve3(analPoints);
    const analGeometry = new THREE.TubeGeometry(analCurve, finSegments, finHeight * 0.3, 4, false);
    const analFin = new THREE.Mesh(analGeometry, this.createFinMaterial(rng));
    group.add(analFin);
    
    // Caudal fin (tail)
    const tailFinGeometry = new THREE.PlaneGeometry(bodyThickness * 2, bodyWidth * 0.6);
    const tailFin = new THREE.Mesh(tailFinGeometry, this.createFinMaterial(rng));
    tailFin.position.set(-bodyLength * 0.48, 0, 0);
    tailFin.rotation.y = Math.PI * 0.5;
    group.add(tailFin);
    
    return group;
  }
  
  /**
   * Generate seahorse
   */
  private generateSeahorse(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyHeight = 0.3 * scale * (0.8 + rng() * 0.4);
    const bodyWidth = bodyHeight * 0.25 * (0.8 + rng() * 0.4);
    const tailLength = bodyHeight * 0.8 * (0.8 + rng() * 0.4);
    const segments = Math.max(12, Math.floor(24 * detail));
    
    // Create upright body with horse-like head
    const bodyPoints: THREE.Vector3[] = [];
    
    // S-shaped curve for seahorse body
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * bodyHeight - bodyHeight * 0.5;
      
      // S-curve
      const xCurve = Math.sin(t * Math.PI * 2) * bodyWidth * 0.3;
      const zCurve = Math.cos(t * Math.PI) * bodyWidth * 0.1;
      
      bodyPoints.push(new THREE.Vector3(xCurve, y, zCurve));
    }
    
    const bodyCurve = new THREE.CatmullRomCurve3(bodyPoints);
    
    // Variable radius along body
    const radii: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let radius = bodyWidth * 0.4;
      
      // Thicker in middle, thinner at ends
      if (t < 0.2) {
        radius *= 0.6 + t * 2;
      } else if (t > 0.8) {
        radius *= 1.4 - (t - 0.8) * 2;
      }
      
      radii.push(radius);
    }
    
    const bodyGeometry = new THREE.TubeGeometry(bodyCurve, segments, bodyWidth * 0.35, 8, false);
    
    // Apply variable radius
    const positions = bodyGeometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const segmentIndex = Math.floor((i / 3) / (geometry.parameters.tubularSegments * 8));
      const t = segmentIndex / segments;
      const radiusFactor = radii[segmentIndex] / (bodyWidth * 0.35);
      
      positions[i] *= radiusFactor;
      positions[i + 1] *= radiusFactor;
      positions[i + 2] *= radiusFactor;
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createFishSkinMaterial(rng, 'spotted');
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Snout
    const snoutLength = bodyWidth * 0.8;
    const snoutGeometry = new THREE.CylinderGeometry(bodyWidth * 0.15, bodyWidth * 0.2, snoutLength, 8);
    const snout = new THREE.Mesh(snoutGeometry, bodyMaterial);
    snout.position.set(bodyWidth * 0.3, bodyHeight * 0.35, 0);
    snout.rotation.z = -Math.PI * 0.3;
    group.add(snout);
    
    // Crown/coronet on head
    const crownPoints: THREE.Vector3[] = [];
    const numSpikes = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < numSpikes; i++) {
      const angle = (i / numSpikes) * Math.PI * 2;
      const spikeLength = bodyWidth * 0.15 * (0.7 + rng() * 0.5);
      const x = Math.cos(angle) * spikeLength;
      const z = Math.sin(angle) * spikeLength;
      crownPoints.push(new THREE.Vector3(x, bodyHeight * 0.45, z));
    }
    
    for (const point of crownPoints) {
      const spikeGeometry = new THREE.ConeGeometry(bodyWidth * 0.03, bodyWidth * 0.15, 4);
      const spike = new THREE.Mesh(spikeGeometry, bodyMaterial);
      spike.position.copy(point);
      group.add(spike);
    }
    
    // Eye
    const eyeGeometry = new THREE.SphereGeometry(bodyWidth * 0.12, 8, 8);
    const eye = new THREE.Mesh(eyeGeometry, this.createEyeMaterial(rng));
    eye.position.set(bodyWidth * 0.25, bodyHeight * 0.38, bodyWidth * 0.25);
    group.add(eye);
    
    // Dorsal fin (small, on back)
    const dorsalFinGeometry = new THREE.PlaneGeometry(bodyWidth * 0.2, bodyWidth * 0.15);
    const dorsalFin = new THREE.Mesh(dorsalFinGeometry, this.createFinMaterial(rng));
    dorsalFin.position.set(0, bodyHeight * 0.1, bodyWidth * 0.35);
    dorsalFin.rotation.x = Math.PI * 0.5;
    group.add(dorsalFin);
    
    // Pectoral fins
    for (let side of [-1, 1]) {
      const pectoralGeometry = new THREE.PlaneGeometry(bodyWidth * 0.12, bodyWidth * 0.08);
      const pectoralFin = new THREE.Mesh(pectoralGeometry, this.createFinMaterial(rng));
      pectoralFin.position.set(0, bodyHeight * 0.25, side * bodyWidth * 0.45);
      pectoralFin.rotation.z = side * Math.PI * 0.3;
      group.add(pectoralFin);
    }
    
    // Prehensile tail
    const tailPoints: THREE.Vector3[] = [];
    const tailSegments = Math.max(8, Math.floor(16 * detail));
    
    for (let i = 0; i <= tailSegments; i++) {
      const t = i / tailSegments;
      const y = -bodyHeight * 0.5 - t * tailLength;
      
      // Curl inward
      const curl = Math.sin(t * Math.PI * 1.5) * bodyWidth * 0.5;
      const x = curl;
      const z = Math.cos(t * Math.PI) * bodyWidth * 0.2;
      
      tailPoints.push(new THREE.Vector3(x, y, z));
    }
    
    const tailCurve = new THREE.CatmullRomCurve3(tailPoints);
    const tailGeometry = new THREE.TubeGeometry(tailCurve, tailSegments, bodyWidth * 0.15, 6, false);
    const tail = new THREE.Mesh(tailGeometry, bodyMaterial);
    group.add(tail);
    
    return group;
  }
  
  /**
   * Generate anglerfish with bioluminescent lure
   */
  private generateAnglerfish(
    rng: () => number,
    scale: number,
    detail: number,
    animationPhase: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bodyLength = 0.35 * scale * (0.8 + rng() * 0.4);
    const bodyHeight = bodyLength * 0.7 * (0.8 + rng() * 0.4);
    const bodyWidth = bodyLength * 0.5 * (0.8 + rng() * 0.4);
    const segments = Math.max(16, Math.floor(32 * detail));
    
    // Create bulky, rounded body
    const bodyGeometry = new THREE.SphereGeometry(1, segments, segments);
    const positions = bodyGeometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      positions[i] = x * bodyLength * 0.5;
      positions[i + 1] = y * bodyHeight * 0.5;
      positions[i + 2] = z * bodyWidth * 0.5;
      
      // Make very round and bulbous
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist > 0.5) {
        const bulge = 1 + (dist - 0.5) * 0.3;
        positions[i] *= bulge;
        positions[i + 1] *= bulge;
        positions[i + 2] *= bulge;
      }
    }
    
    bodyGeometry.computeVertexNormals();
    
    const bodyMaterial = this.createDarkFishMaterial(rng);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    
    // Large mouth
    const mouthGeometry = new THREE.SphereGeometry(bodyLength * 0.25, 16, 16);
    const mouth = new THREE.Mesh(mouthGeometry, this.createDarkMaterial(rng));
    mouth.position.set(-bodyLength * 0.35, -bodyHeight * 0.15, 0);
    mouth.scale.set(1.2, 0.8, 1);
    group.add(mouth);
    
    // Teeth
    const toothGeometry = new THREE.ConeGeometry(bodyLength * 0.02, bodyLength * 0.06, 4);
    const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    
    const numTeeth = 8 + Math.floor(rng() * 6);
    for (let i = 0; i < numTeeth; i++) {
      const angle = (i / numTeeth) * Math.PI * 2;
      const radius = bodyLength * 0.22;
      const x = Math.cos(angle) * radius - bodyLength * 0.35;
      const z = Math.sin(angle) * radius;
      
      const tooth = new THREE.Mesh(toothGeometry, toothMaterial);
      tooth.position.set(x, -bodyHeight * 0.2, z);
      tooth.rotation.x = Math.PI * 0.5;
      tooth.lookAt(new THREE.Vector3(x - 0.1, -bodyHeight * 0.3, z));
      group.add(tooth);
    }
    
    // Bioluminescent lure (illicium and esca)
    const lureLength = bodyLength * (0.6 + rng() * 0.4);
    const lureSegments = Math.max(4, Math.floor(8 * detail));
    
    const lurePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= lureSegments; i++) {
      const t = i / lureSegments;
      const x = -bodyLength * 0.3 - t * lureLength * 0.3;
      const y = bodyHeight * 0.3 + t * lureLength * 0.8;
      const z = bodyWidth * 0.2 * Math.sin(t * Math.PI);
      lurePoints.push(new THREE.Vector3(x, y, z));
    }
    
    const lureCurve = new THREE.CatmullRomCurve3(lurePoints);
    const lureGeometry = new THREE.TubeGeometry(lureCurve, lureSegments, bodyLength * 0.015, 6, false);
    const lure = new THREE.Mesh(lureGeometry, bodyMaterial);
    group.add(lure);
    
    // Glowing esca (lure tip)
    const escaGeometry = new THREE.SphereGeometry(bodyLength * 0.08, 8, 8);
    const escaMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2,
    });
    const esca = new THREE.Mesh(escaGeometry, escaMaterial);
    esca.position.copy(lurePoints[lurePoints.length - 1]);
    group.add(esca);
    
    // Small eyes
    const eyeRadius = bodyLength * 0.05;
    for (let side of [-1, 1]) {
      const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 6, 6);
      const eye = new THREE.Mesh(eyeGeometry, this.createDarkMaterial(rng));
      eye.position.set(-bodyLength * 0.25, bodyHeight * 0.25, side * bodyWidth * 0.55);
      group.add(eye);
    }
    
    // Reduced fins
    const pectoralFinGeometry = new THREE.PlaneGeometry(bodyLength * 0.15, bodyLength * 0.1);
    for (let side of [-1, 1]) {
      const fin = new THREE.Mesh(pectoralFinGeometry, this.createFinMaterial(rng));
      fin.position.set(-bodyLength * 0.1, 0, side * bodyWidth * 0.55);
      fin.rotation.z = side * Math.PI * 0.4;
      group.add(fin);
    }
    
    return group;
  }
  
  /**
   * Create fish skin material with patterns
   */
  private createFishSkinMaterial(rng: () => number, pattern: string): THREE.Material {
    const baseColor = new THREE.Color().setHSL(
      rng() * 0.3 + 0.5, // Blue-green range
      0.5 + rng() * 0.3,
      0.3 + rng() * 0.3
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.4 + rng() * 0.3,
      metalness: 0.1 + rng() * 0.2,
    });
    
    // Pattern handling would go here with texture generation
    // For now, use solid color with slight variation
    
    return material;
  }
  
  /**
   * Create fin material
   */
  private createFinMaterial(rng: () => number): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.5 + rng() * 0.2, 0.4, 0.5),
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
  }
  
  /**
   * Create eye material
   */
  private createEyeMaterial(rng: () => number): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.8,
    });
  }
  
  /**
   * Create dark fish material (for deep sea fish)
   */
  private createDarkFishMaterial(rng: () => number): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6 + rng() * 0.1, 0.3, 0.15 + rng() * 0.1),
      roughness: 0.7,
      metalness: 0.2,
    });
  }
}

/**
 * Specialized fish generator for creating schools
 */
export class SchoolGenerator extends BaseAssetGenerator<any> {
  protected readonly category = 'creature';
  
  generateSchool(params: {
    count: number;
    fishType: string;
    seed: number;
    scale?: number;
    spread?: number;
  }): THREE.Group {
    const group = new THREE.Group();
    const rng = createSeededRandom(params.seed);
    
    const count = params.count || 20;
    const spread = params.spread || 2.0;
    const fishGenerator = new FishGenerator();
    
    for (let i = 0; i < count; i++) {
      const fishParams: FishParams = {
        fishType: params.fishType as any,
        seed: params.seed + i,
        scale: params.scale ? params.scale * (0.8 + rng() * 0.4) : 1.0,
        animationPhase: rng() * Math.PI * 2,
      };
      
      const fish = fishGenerator.generate(fishParams);
      
      // Position in school formation
      const angle = rng() * Math.PI * 2;
      const radius = rng() * spread;
      fish.position.set(
        Math.cos(angle) * radius,
        (rng() - 0.5) * spread * 0.5,
        Math.sin(angle) * radius
      );
      
      // Orient fish
      fish.rotation.y = angle + Math.PI;
      
      group.add(fish);
    }
    
    return group;
  }
}

export { FishGenerator, SchoolGenerator };
