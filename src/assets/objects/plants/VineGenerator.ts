import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Vine species configuration
 */
export interface VineSpeciesConfig {
  name: string;
  growthPattern: 'climbing' | 'hanging' | 'spreading' | 'twining';
  segmentLength: { min: number; max: number };
  segmentRadius: { min: number; max: number };
  leafSpacing: number; // distance between leaves
  leafSize: { min: number; max: number };
  curliness: number; // 0-1, how much the vine curls
  color: THREE.Color;
  leafColor: THREE.Color;
  hasFlowers?: boolean;
  flowerColor?: THREE.Color;
  prefersShade?: boolean;
}

/**
 * Predefined vine species configurations
 */
export const VineSpeciesPresets: Record<string, VineSpeciesConfig> = {
  ivy: {
    name: 'Ivy',
    growthPattern: 'climbing',
    segmentLength: { min: 0.3, max: 0.6 },
    segmentRadius: { min: 0.02, max: 0.04 },
    leafSpacing: 0.15,
    leafSize: { min: 0.08, max: 0.15 },
    curliness: 0.3,
    color: new THREE.Color(0x5d4037),
    leafColor: new THREE.Color(0x2e7d32),
    prefersShade: true,
  },
  wisteria: {
    name: 'Wisteria',
    growthPattern: 'hanging',
    segmentLength: { min: 0.4, max: 0.8 },
    segmentRadius: { min: 0.03, max: 0.06 },
    leafSpacing: 0.2,
    leafSize: { min: 0.1, max: 0.2 },
    curliness: 0.5,
    color: new THREE.Color(0x6d4c41),
    leafColor: new THREE.Color(0x43a047),
    hasFlowers: true,
    flowerColor: new THREE.Color(0x7e57c2),
    prefersShade: false,
  },
  grapevine: {
    name: 'Grapevine',
    growthPattern: 'twining',
    segmentLength: { min: 0.3, max: 0.5 },
    segmentRadius: { min: 0.04, max: 0.08 },
    leafSpacing: 0.18,
    leafSize: { min: 0.12, max: 0.25 },
    curliness: 0.7,
    color: new THREE.Color(0x5d4037),
    leafColor: new THREE.Color(0x388e3c),
    hasFlowers: false,
    prefersShade: false,
  },
  moss: {
    name: 'Moss Vine',
    growthPattern: 'spreading',
    segmentLength: { min: 0.1, max: 0.3 },
    segmentRadius: { min: 0.01, max: 0.02 },
    leafSpacing: 0.05,
    leafSize: { min: 0.02, max: 0.05 },
    curliness: 0.2,
    color: new THREE.Color(0x4e342e),
    leafColor: new THREE.Color(0x689f38),
    prefersShade: true,
  },
};

/**
 * Generated vine segment
 */
interface VineSegment {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  length: number;
  radius: number;
}

/**
 * Procedural vine generator for climbing plants
 */
export class VineGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.Material>;

  constructor() {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
  }

  /**
   * Generate a complete vine system
   */
  generateVine(
    species: string | VineSpeciesConfig,
    seed: number,
    options: {
      startPoint?: THREE.Vector3;
      endPoint?: THREE.Vector3;
      length?: number;
      lod?: number;
      attachToSurface?: boolean;
      surfaceNormal?: THREE.Vector3;
    } = {}
  ): THREE.Group {
    const config = typeof species === 'string'
      ? VineSpeciesPresets[species] || VineSpeciesPresets.ivy
      : species;
    
    const lod = options.lod || 0;
    const length = options.length || this.randomInRange(2, 5, seed);
    
    const vineGroup = new THREE.Group();
    
    // Set start point
    const startPoint = options.startPoint || new THREE.Vector3(0, 0, 0);
    
    // Generate vine segments
    const segments = this.generateVineSegments(config, startPoint, length, seed, options);
    
    // Create vine stem mesh
    const stemMesh = this.generateVineStem(segments, config, lod);
    vineGroup.add(stemMesh);
    
    // Add leaves
    const leavesMesh = this.generateVineLeaves(segments, config, seed, lod);
    vineGroup.add(leavesMesh);
    
    // Add flowers if applicable
    if (config.hasFlowers && config.flowerColor) {
      const flowersMesh = this.generateVineFlowers(segments, config, seed, lod);
      vineGroup.add(flowersMesh);
    }
    
    return vineGroup;
  }

  /**
   * Generate vine segments following growth pattern
   */
  private generateVineSegments(
    config: VineSpeciesConfig,
    startPoint: THREE.Vector3,
    totalLength: number,
    seed: number,
    options: any
  ): VineSegment[] {
    const segments: VineSegment[] = [];
    let currentPosition = startPoint.clone();
    let currentDirection = new THREE.Vector3(0, 1, 0);
    
    // For hanging vines, start downward
    if (config.growthPattern === 'hanging') {
      currentDirection.set(0, -1, 0);
    }
    
    let remainingLength = totalLength;
    let segmentIndex = 0;
    
    while (remainingLength > 0 && segmentIndex < 100) {
      const segmentSeed = seed + segmentIndex;
      const segmentLength = this.randomInRange(
        config.segmentLength.min,
        config.segmentLength.max,
        segmentSeed
      );
      const radius = this.randomInRange(
        config.segmentRadius.min,
        config.segmentRadius.max,
        segmentSeed + 1000
      );
      
      // Calculate new direction with curliness
      const curlAmount = config.curliness * 0.3;
      const rotationX = this.randomInRange(-curlAmount, curlAmount, segmentSeed + 2000);
      const rotationZ = this.randomInRange(-curlAmount, curlAmount, segmentSeed + 3000);
      
      const newDirection = currentDirection.clone();
      newDirection.applyAxisAngle(new THREE.Vector3(1, 0, 0), rotationX);
      newDirection.applyAxisAngle(new THREE.Vector3(0, 0, 1), rotationZ);
      newDirection.normalize();
      
      // For climbing vines, bias upward
      if (config.growthPattern === 'climbing') {
        newDirection.y = Math.max(0.3, newDirection.y);
        newDirection.normalize();
      }
      
      // For spreading vines, bias outward horizontally
      if (config.growthPattern === 'spreading') {
        newDirection.y = Math.min(0.2, Math.abs(newDirection.y));
        newDirection.normalize();
      }
      
      segments.push({
        position: currentPosition.clone(),
        rotation: new THREE.Euler(
          Math.atan2(newDirection.y, Math.sqrt(newDirection.x ** 2 + newDirection.z ** 2)),
          Math.atan2(newDirection.x, newDirection.z),
          0
        ),
        length: segmentLength,
        radius: radius,
      });
      
      currentPosition.add(newDirection.multiplyScalar(segmentLength));
      currentDirection = newDirection;
      remainingLength -= segmentLength;
      segmentIndex++;
    }
    
    return segments;
  }

  /**
   * Generate vine stem from segments
   */
  private generateVineStem(
    segments: VineSegment[],
    config: VineSpeciesConfig,
    lod: number
  ): THREE.Group {
    const stemGroup = new THREE.Group();
    
    for (const segment of segments) {
      const geometry = new THREE.CylinderGeometry(
        segment.radius * 0.8,
        segment.radius,
        segment.length,
        Math.max(4, 6 - lod)
      );
      
      const material = this.getVineMaterial(config.color, config.name, lod);
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.copy(segment.position);
      mesh.position.y += segment.length / 2;
      mesh.rotation.copy(segment.rotation);
      
      stemGroup.add(mesh);
    }
    
    return stemGroup;
  }

  /**
   * Generate leaves along the vine
   */
  private generateVineLeaves(
    segments: VineSegment[],
    config: VineSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Group {
    const leavesGroup = new THREE.Group();
    const leafGeometry = this.createLeafGeometry(config, lod);
    const leafMaterial = this.getLeafMaterial(config.leafColor, config.name, lod);
    
    let distanceAlongVine = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      distanceAlongVine += segment.length;
      
      // Add leaf at regular intervals
      if (distanceAlongVine % config.leafSpacing < segment.length) {
        const leafSeed = seed + i;
        const leafSize = this.randomInRange(config.leafSize.min, config.leafSize.max, leafSeed);
        
        const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
        
        // Position leaf at segment end
        const leafPosition = segment.position.clone();
        leafPosition.y += segment.length;
        
        // Offset leaf perpendicular to vine direction
        const offsetAngle = (leafSeed % 8) * (Math.PI / 4);
        const offsetDistance = segment.radius * 2;
        leafPosition.x += Math.cos(offsetAngle) * offsetDistance;
        leafPosition.z += Math.sin(offsetAngle) * offsetDistance;
        
        leafMesh.position.copy(leafPosition);
        leafMesh.scale.setScalar(leafSize);
        leafMesh.rotation.set(Math.PI / 2, offsetAngle, Math.random() * 0.3);
        leafMesh.castShadow = true;
        
        leavesGroup.add(leafMesh);
      }
    }
    
    return leavesGroup;
  }

  /**
   * Create leaf geometry
   */
  private createLeafGeometry(config: VineSpeciesConfig, lod: number): THREE.BufferGeometry {
    // Simple oval leaf shape
    const geometry = new THREE.CircleGeometry(1, Math.max(4, 8 - lod));
    
    // Scale to make oval
    geometry.scale(0.6, 1, 1);
    
    // Add slight noise for natural shape
    this.applyNoiseDisplacement(geometry, 0, 0.2, 0.15);
    
    return geometry;
  }

  /**
   * Generate flowers on vine
   */
  private generateVineFlowers(
    segments: VineSegment[],
    config: VineSpeciesConfig,
    seed: number,
    lod: number
  ): THREE.Group {
    const flowersGroup = new THREE.Group();
    const flowerCount = Math.floor(segments.length * 0.3);
    
    const flowerGeometry = new THREE.SphereGeometry(0.05, Math.max(4, 6 - lod), Math.max(3, 4 - lod));
    const flowerMaterial = new THREE.MeshStandardMaterial({
      color: config.flowerColor,
      roughness: 0.5,
      metalness: 0.0,
    });
    
    for (let i = 0; i < flowerCount; i++) {
      const flowerSeed = seed + i + 5000;
      const segmentIndex = Math.floor(this.randomInRange(0, segments.length, flowerSeed));
      const segment = segments[segmentIndex];
      
      const flowerMesh = new THREE.Mesh(flowerGeometry, flowerMaterial);
      
      // Position near segment
      const flowerPosition = segment.position.clone();
      flowerPosition.y += segment.length * 0.7;
      
      const offsetAngle = (flowerSeed % 6) * (Math.PI / 3);
      const offsetDistance = segment.radius * 3;
      flowerPosition.x += Math.cos(offsetAngle) * offsetDistance;
      flowerPosition.z += Math.sin(offsetAngle) * offsetDistance;
      
      flowerMesh.position.copy(flowerPosition);
      flowerMesh.scale.setScalar(1.5);
      
      flowersGroup.add(flowerMesh);
    }
    
    return flowersGroup;
  }

  /**
   * Get cached vine material
   */
  private getVineMaterial(color: THREE.Color, key: string, lod: number): THREE.Material {
    const cacheKey = `vine_${key}_${lod}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.0,
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Get cached leaf material
   */
  private getLeafMaterial(color: THREE.Color, key: string, lod: number): THREE.Material {
    const cacheKey = `leaf_${key}_${lod}`;
    
    if (!this.materialCache.has(cacheKey)) {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
      this.materialCache.set(cacheKey, material);
    }
    
    return this.materialCache.get(cacheKey)!;
  }

  /**
   * Apply noise displacement to geometry
   */
  private applyNoiseDisplacement(
    geometry: THREE.BufferGeometry,
    seed: number,
    frequency: number,
    amplitude: number
  ): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      const noiseValue = this.noiseUtils.perlin3D(
        vertex.x * frequency + seed,
        vertex.y * frequency,
        vertex.z * frequency
      );
      
      const displacement = 1 + noiseValue * amplitude;
      vertex.multiplyScalar(displacement);
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
  }

  /**
   * Generate vine cluster on a surface
   */
  generateVineCluster(
    count: number,
    speciesList: string[],
    seed: number,
    options: {
      startPoint?: THREE.Vector3;
      maxLength?: number;
      lod?: number;
      biome?: string;
    } = {}
  ): THREE.Group {
    const clusterGroup = new THREE.Group();
    const maxLength = options.maxLength || 4;
    
    for (let i = 0; i < count; i++) {
      const vineSeed = seed + i;
      const species = speciesList[Math.floor(Math.random() * speciesList.length)];
      
      const vine = this.generateVine(species, vineSeed, {
        startPoint: options.startPoint,
        length: this.randomInRange(maxLength * 0.5, maxLength, vineSeed),
        lod: options.lod,
      });
      
      // Offset each vine slightly
      vine.position.x += this.randomInRange(-0.3, 0.3, vineSeed + 1000);
      vine.position.z += this.randomInRange(-0.3, 0.3, vineSeed + 2000);
      vine.rotation.y = this.randomInRange(-0.2, 0.2, vineSeed + 3000);
      
      clusterGroup.add(vine);
    }
    
    return clusterGroup;
  }

  /**
   * Utility: random float in range
   */
  private randomInRange(min: number, max: number, seed: number): number {
    const normalized = (Math.sin(seed * 12.9898) + 1) / 2;
    return min + normalized * (max - min);
  }
}
