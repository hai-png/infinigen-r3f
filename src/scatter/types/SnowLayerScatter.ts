/**
 * SnowLayerScatter - Snow accumulation on surfaces
 * 
 * Simulates natural snow coverage with thickness variation,
 * edge fading, and terrain-aware distribution.
 * 
 * @author Infinigen R3F Port Team
 * @license BSD 3-Clause
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterInstance, ScatterResult } from '../types';

export interface SnowLayerParams extends ScatterParams {
  /** Snow thickness (default: 0.1) */
  thickness?: number;
  /** Coverage density 0-1 (default: 0.8) */
  coverage?: number;
  /** Edge fade distance (default: 0.2) */
  edgeFade?: number;
  /** Temperature affects snow type (default: -5) */
  temperature?: number;
  /** Wind direction affects drift patterns */
  windDirection?: THREE.Vector3;
  /** Enable powder snow effect */
  powderSnow?: boolean;
}

export interface SnowLayerInstance extends ScatterInstance {
  thickness: number;
  temperature: number;
  isPowder: boolean;
}

const SNOW_TYPES = ['fresh', 'packed', 'powder', 'ice'] as const;
type SnowType = typeof SNOW_TYPES[number];

/**
 * Snow layer scatter for winter scenes and cold environments
 */
export class SnowLayerScatter {
  private params: Required<SnowLayerParams>;
  private snowGeometry: THREE.BufferGeometry | null = null;
  private snowMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(params: SnowLayerParams = {}) {
    this.params = {
      count: 1,
      thickness: 0.1,
      coverage: 0.8,
      edgeFade: 0.2,
      temperature: -5,
      windDirection: new THREE.Vector3(1, 0, 0),
      powderSnow: false,
      scale: 1,
      scaleVariation: 0.2,
      rotationRandom: Math.PI * 2,
      volumeDensity: 1,
      minSpacing: 0,
      seed: Math.random(),
      ...params,
    };
  }

  /**
   * Determine snow type based on temperature
   */
  private getSnowType(temperature: number): SnowType {
    if (temperature > -2) return 'ice';
    if (temperature > -8) return 'packed';
    if (temperature > -15) return 'fresh';
    return 'powder';
  }

  /**
   * Calculate snow thickness with variation
   */
  private calculateThickness(instance: SnowLayerInstance): number {
    const baseThickness = this.params.thickness;
    const tempFactor = Math.max(0, 1 - Math.abs(this.params.temperature + 10) / 20);
    const variation = (Math.random() - 0.5) * this.params.scaleVariation;
    
    return baseThickness * (0.5 + tempFactor) * (1 + variation);
  }

  /**
   * Check if position should have snow based on coverage and orientation
   */
  private shouldPlaceSnow(position: THREE.Vector3, normal: THREE.Vector3): boolean {
    // Only place on upward-facing surfaces
    if (normal.y < 0.3) return false;
    
    // Random coverage pattern
    const noise = this.hashNoise(position, this.params.seed);
    return noise < this.params.coverage;
  }

  /**
   * Simple hash-based noise for deterministic randomness
   */
  private hashNoise(pos: THREE.Vector3, seed: number): number {
    const x = Math.floor(pos.x * 10 + seed);
    const y = Math.floor(pos.y * 10 + seed);
    const z = Math.floor(pos.z * 10 + seed);
    
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Create snow material based on type
   */
  private createSnowMaterial(snowType: SnowType): THREE.MeshStandardMaterial {
    let color: THREE.Color;
    let roughness: number;
    let metalness: number;

    switch (snowType) {
      case 'ice':
        color = new THREE.Color(0xe8f4f8);
        roughness = 0.3;
        metalness = 0.1;
        break;
      case 'packed':
        color = new THREE.Color(0xf0f5f9);
        roughness = 0.6;
        metalness = 0.0;
        break;
      case 'powder':
        color = new THREE.Color(0xffffff);
        roughness = 0.9;
        metalness = 0.0;
        break;
      default: // fresh
        color = new THREE.Color(0xfff8f0);
        roughness = 0.8;
        metalness = 0.0;
    }

    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      transparent: snowType === 'ice',
      opacity: snowType === 'ice' ? 0.9 : 1.0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Generate procedural snow geometry
   */
  private createSnowGeometry(width: number, depth: number, segments: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    const positions = geometry.attributes.position.array;
    const vertexCount = positions.length / 3;

    // Add height variation
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      
      // Multi-frequency noise for natural snow surface
      const noise = 
        Math.sin(x * 2.0) * Math.cos(y * 2.0) * 0.02 +
        Math.sin(x * 5.0 + 1.5) * Math.cos(y * 5.0 - 0.8) * 0.01 +
        Math.sin(x * 10.0 + 2.3) * Math.cos(y * 10.0 + 1.2) * 0.005;
      
      positions[i * 3 + 2] = noise;
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Apply snow layer to target object
   */
  async apply(targetObject: THREE.Object3D): Promise<ScatterResult> {
    const instances: SnowLayerInstance[] = [];
    const snowObjects: THREE.Object3D[] = [];
    const snowType = this.getSnowType(this.params.temperature);
    
    // Get bounding box for area calculation
    const bbox = new THREE.Box3().setFromObject(targetObject);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    const area = size.x * size.z;
    const instanceCount = Math.ceil(area * this.params.volumeDensity);
    
    // Create shared material
    if (!this.snowMaterial) {
      this.snowMaterial = this.createSnowMaterial(snowType);
    }

    // Generate snow patches
    for (let i = 0; i < instanceCount; i++) {
      const x = (Math.random() - 0.5) * size.x;
      const z = (Math.random() - 0.5) * size.z;
      const position = new THREE.Vector3(x, 0, z);
      
      // Raycast to find surface
      const rayOrigin = new THREE.Vector3(x, bbox.max.y + 1, z);
      const rayDirection = new THREE.Vector3(0, -1, 0);
      const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
      
      const intersects = raycaster.intersectObject(targetObject, true);
      if (intersects.length === 0) continue;
      
      const hit = intersects[0];
      const surfacePosition = hit.point;
      const surfaceNormal = hit.face?.normal || new THREE.Vector3(0, 1, 0);
      
      // Check if snow should be placed here
      if (!this.shouldPlaceSnow(surfacePosition, surfaceNormal)) continue;
      
      const thickness = this.calculateThickness({
        position: surfacePosition,
        scale: this.params.scale * (0.8 + Math.random() * 0.4),
        rotation: Math.random() * this.params.rotationRandom,
        thickness: this.params.thickness,
        temperature: this.params.temperature,
        isPowder: this.params.powderSnow,
      });
      
      // Create snow patch
      const patchWidth = 0.5 + Math.random() * 1.5;
      const patchDepth = 0.5 + Math.random() * 1.5;
      const segments = 8;
      
      if (!this.snowGeometry) {
        this.snowGeometry = this.createSnowGeometry(patchWidth, patchDepth, segments);
      }
      
      const snowMesh = new THREE.Mesh(this.snowGeometry, this.snowMaterial);
      snowMesh.position.copy(surfacePosition);
      snowMesh.position.y += thickness / 2;
      
      // Align to surface normal
      const upVector = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, surfaceNormal);
      snowMesh.quaternion.copy(quaternion);
      
      // Add wind drift offset
      const driftAmount = thickness * 0.3;
      snowMesh.position.addScaledVector(this.params.windDirection, driftAmount);
      
      // Edge fading (scale down at edges)
      const distFromCenter = new THREE.Vector2(x, z).length();
      const maxDist = Math.max(size.x, size.z) / 2;
      const edgeFactor = Math.max(0, 1 - distFromCenter / (maxDist - this.params.edgeFade));
      
      if (edgeFactor < 1) {
        const scale = this.params.scale * (0.8 + Math.random() * 0.4) * edgeFactor;
        snowMesh.scale.set(scale, scale, scale);
      } else {
        const scale = this.params.scale * (0.8 + Math.random() * 0.4);
        snowMesh.scale.set(scale, scale, scale);
      }
      
      snowMesh.castShadow = true;
      snowMesh.receiveShadow = true;
      snowMesh.userData.isSnow = true;
      snowMesh.userData.snowType = snowType;
      
      instances.push({
        position: surfacePosition.clone(),
        scale: snowMesh.scale.x,
        rotation: snowMesh.rotation.y,
        thickness,
        temperature: this.params.temperature,
        isPowder: this.params.powderSnow,
      });
      
      snowObjects.push(snowMesh);
    }

    // Create parent container
    const scatterObject = new THREE.Group();
    scatterObject.name = 'SnowLayer';
    scatterObject.userData.scatterType = 'snow_layer';
    scatterObject.userData.instanceCount = instances.length;
    
    snowObjects.forEach(obj => scatterObject.add(obj));

    // Clean up temporary geometry if we created multiple
    if (this.snowGeometry && snowObjects.length > 1) {
      // Keep geometry for potential reuse
    }

    return {
      scatterObject,
      instances,
      metadata: {
        scatterType: 'snow_layer',
        snowType,
        temperature: this.params.temperature,
        coverage: this.params.coverage,
        instanceCount: instances.length,
        totalArea: area,
      },
    };
  }

  /**
   * Update parameters dynamically
   */
  updateParams(params: Partial<SnowLayerParams>): void {
    this.params = { ...this.params, ...params };
    
    // Recreate material if temperature changed significantly
    if (params.temperature !== undefined && this.snowMaterial) {
      const newSnowType = this.getSnowType(this.params.temperature);
      const updatedMaterial = this.createSnowMaterial(newSnowType);
      
      if (this.snowMaterial) {
        this.snowMaterial.dispose();
      }
      
      this.snowMaterial = updatedMaterial;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.snowGeometry) {
      this.snowGeometry.dispose();
      this.snowGeometry = null;
    }
    
    if (this.snowMaterial) {
      this.snowMaterial.dispose();
      this.snowMaterial = null;
    }
  }
}

export default SnowLayerScatter;
