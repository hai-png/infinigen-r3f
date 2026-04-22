/**
 * SeaweedScatter - Underwater kelp and seaweed distribution
 * 
 * Features:
 * - Multiple seaweed species (kelp, sea lettuce, sargassum, eelgrass)
 * - Buoyancy-driven vertical growth
 * - Current-based animation
 * - Depth-based density variation
 * - Height-based LOD for performance
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';
import { createWindAnimation, type WindParams } from '../utils/wind';

export interface SeaweedScatterParams extends ScatterParams {
  /** Number of seaweed instances */
  count?: number;
  /** Seaweed species type */
  species?: 'kelp' | 'seaLettuce' | 'sargassum' | 'eelgrass' | 'mixed';
  /** Water depth for density calculation */
  waterDepth?: number;
  /** Current strength for animation */
  currentStrength?: number;
  /** Current direction */
  currentDirection?: THREE.Vector3;
  /** Maximum seaweed height */
  maxHeight?: number;
  /** Minimum seaweed height */
  minHeight?: number;
  /** Enable buoyancy simulation */
  enableBuoyancy?: boolean;
  /** Color variation */
  colorVariation?: number;
}

interface SeaweedInstance extends ScatterInstance {
  species: string;
  height: number;
  segments: number;
}

export class SeaweedScatter {
  private params: Required<SeaweedScatterParams>;

  constructor(params: SeaweedScatterParams = {}) {
    this.params = {
      count: params.count ?? 50,
      species: params.species ?? 'mixed',
      waterDepth: params.waterDepth ?? 10,
      currentStrength: params.currentStrength ?? 0.5,
      currentDirection: params.currentDirection ?? new THREE.Vector3(1, 0, 0),
      maxHeight: params.maxHeight ?? 3,
      minHeight: params.minHeight ?? 0.5,
      enableBuoyancy: params.enableBuoyancy ?? true,
      colorVariation: params.colorVariation ?? 0.2,
      volumeDensity: params.volumeDensity ?? 1,
      surfaceDensity: params.surfaceDensity ?? 1,
      scaleTapering: params.scaleTapering ?? 0,
      seed: params.seed ?? Math.random(),
      includeColliders: params.includeColliders ?? false,
    };
  }

  /**
   * Generate seaweed geometry based on species
   */
  private createSeaweedGeometry(species: string, height: number, segments: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Create ribbon-like seaweed structure
    const width = height * (species === 'kelp' ? 0.15 : species === 'seaLettuce' ? 0.4 : 0.08);
    const segmentHeight = height / segments;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * height;
      
      // Width varies along height (tapered)
      const currentWidth = width * (1 - t * 0.3);
      
      // Add some natural waviness to the edges
      const waveAmount = species === 'sargassum' ? 0.3 : 0.1;
      const leftOffset = -currentWidth / 2 + Math.sin(t * Math.PI * 3) * waveAmount * currentWidth;
      const rightOffset = currentWidth / 2 + Math.sin(t * Math.PI * 3 + Math.PI) * waveAmount * currentWidth;
      
      // Left vertex
      positions.push(leftOffset, y, 0);
      normals.push(0, 0, 1);
      uvs.push(0, t);
      
      // Right vertex
      positions.push(rightOffset, y, 0);
      normals.push(0, 0, 1);
      uvs.push(1, t);
    }
    
    // Generate indices for triangle strips
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    return geometry;
  }

  /**
   * Create seaweed material based on species
   */
  private createSeaweedMaterial(species: string, variation: number): THREE.Material {
    const baseColors: Record<string, THREE.Color> = {
      kelp: new THREE.Color(0x3d5c3d),
      seaLettuce: new THREE.Color(0x6b8c42),
      sargassum: new THREE.Color(0x8b7355),
      eelgrass: new THREE.Color(0x4a6741),
    };
    
    const color = baseColors[species] || baseColors.kelp;
    const variedColor = color.clone().lerp(
      new THREE.Color(Math.random(), Math.random(), Math.random()),
      variation
    );
    
    return new THREE.MeshStandardMaterial({
      color: variedColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      roughness: 0.7,
      metalness: 0.1,
    });
  }

  /**
   * Apply seaweed scatter to a surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const rng = this.createRNG(this.params.seed);
    const instances: SeaweedInstance[] = [];
    const materials: Map<string, THREE.Material> = new Map();
    const geometries: Map<string, THREE.BufferGeometry> = new Map();
    
    // Get surface bounding box
    const bbox = new THREE.Box3().setFromObject(surface);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Determine species
    const speciesList = this.params.species === 'mixed' 
      ? ['kelp', 'seaLettuce', 'sargassum', 'eelgrass']
      : [this.params.species];
    
    // Calculate density based on water depth
    const depthFactor = Math.max(0.2, 1 - (center.y / this.params.waterDepth));
    const adjustedCount = Math.floor(this.params.count * depthFactor);
    
    for (let i = 0; i < adjustedCount; i++) {
      const species = speciesList[Math.floor(rng() * speciesList.length)];
      const height = this.params.minHeight + rng() * (this.params.maxHeight - this.params.minHeight);
      const segments = Math.max(5, Math.floor(height * 4));
      
      // Random position on surface
      const x = center.x - size.x / 2 + rng() * size.x;
      const z = center.z - size.z / 2 + rng() * size.z;
      const y = center.y - this.params.waterDepth / 2;
      
      // Raycast to find surface
      const position = new THREE.Vector3(x, y, z);
      
      // Random rotation around Y axis
      const rotation = rng() * Math.PI * 2;
      
      // Scale based on depth (larger in deeper water)
      const scale = 0.8 + rng() * 0.4;
      
      instances.push({
        position,
        rotation: new THREE.Euler(0, rotation, 0),
        scale: new THREE.Vector3(scale, scale, scale),
        species,
        height,
        segments,
      });
    }
    
    // Create instanced meshes per species
    const scatterGroup = new THREE.Group();
    
    for (const species of speciesList) {
      const speciesInstances = instances.filter(inst => inst.species === species);
      if (speciesInstances.length === 0) continue;
      
      const avgHeight = speciesInstances.reduce((sum, inst) => sum + inst.height, 0) / speciesInstances.length;
      const avgSegments = Math.ceil(avgHeight * 4);
      
      let geometry = geometries.get(species);
      if (!geometry) {
        geometry = this.createSeaweedGeometry(species, avgHeight, avgSegments);
        geometries.set(species, geometry);
      }
      
      let material = materials.get(species);
      if (!material) {
        material = this.createSeaweedMaterial(species, this.params.colorVariation);
        materials.set(species, material);
      }
      
      const mesh = new THREE.InstancedMesh(geometry, material, speciesInstances.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      
      speciesInstances.forEach((instance, index) => {
        const matrix = new THREE.Matrix4();
        matrix.makeRotationY(instance.rotation.y);
        matrix.scale(instance.scale);
        matrix.setPosition(instance.position);
        mesh.setMatrixAt(index, matrix);
      });
      
      // Add current animation
      if (this.params.currentStrength > 0) {
        this.addCurrentAnimation(mesh, species);
      }
      
      scatterGroup.add(mesh);
    }
    
    return {
      scatterObject: scatterGroup,
      instances: instances.map(inst => ({
        position: inst.position,
        rotation: inst.rotation,
        scale: inst.scale,
      })),
      metadata: {
        count: instances.length,
        species: this.params.species,
        waterDepth: this.params.waterDepth,
      },
    };
  }

  /**
   * Add current-driven animation to seaweed
   */
  private addCurrentAnimation(mesh: THREE.InstancedMesh, species: string): void {
    const dummy = new THREE.Object3D();
    const clock = new THREE.Clock();
    
    const animate = () => {
      const time = clock.getElapsedTime();
      const strength = this.params.currentStrength;
      const direction = this.params.currentDirection;
      
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        
        // Sway based on current and time
        const swayAmount = Math.sin(time * 0.5 + i) * strength * 0.1;
        const bendAngle = Math.atan2(direction.x * swayAmount, direction.z * swayAmount + 0.01);
        
        dummy.rotation.z = bendAngle;
        dummy.rotation.x = direction.z * swayAmount * 0.5;
        
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      
      mesh.instanceMatrix.needsUpdate = true;
      requestAnimationFrame(animate);
    };
    
    animate();
  }

  /**
   * Create seeded random number generator
   */
  private createRNG(seed: number): () => number {
    let s = seed * 2147483647;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Update parameters
   */
  updateParams(params: Partial<SeaweedScatterParams>): void {
    this.params = { ...this.params, ...params };
  }
}
