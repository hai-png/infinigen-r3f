/**
 * SlimeMoldScatter - Organic growth patterns on surfaces
 * 
 * Generates slime mold-like organic structures with branching
 * patterns, color variation, and surface-following growth.
 * 
 * @author Infinigen R3F Port Team
 * @license BSD 3-Clause
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterInstance, ScatterResult } from '../types';

export interface SlimeMoldParams extends ScatterParams {
  /** Base hue for coloration (0-1) (default: 0.08) */
  baseHue?: number;
  /** Number of growth centers (default: 5) */
  growthCenters?: number;
  /** Maximum growth length (default: 2.0) */
  maxLength?: number;
  /** Branch thickness (default: 0.01) */
  thickness?: number;
  /** Branching frequency (default: 0.3) */
  branchFrequency?: number;
  /** Color variation amount (default: 0.04) */
  colorVariation?: number;
  /** Enable pulsing animation */
  animated?: boolean;
}

export interface SlimeMoldInstance extends ScatterInstance {
  hue: number;
  age: number;
  branchCount: number;
}

const SLIME_COLORS = {
  yellow: { hue: 0.13, sat: 0.9, val: 0.8 },
  orange: { hue: 0.08, sat: 0.85, val: 0.75 },
  green: { hue: 0.25, sat: 0.7, val: 0.6 },
} as const;

type SlimeColor = typeof SLIME_COLORS[keyof typeof SLIME_COLORS];

/**
 * Slime mold scatter for organic growth effects
 */
export class SlimeMoldScatter {
  private params: Required<SlimeMoldParams>;
  private tubeGeometry: THREE.TubeGeometry | null = null;
  private slimeMaterial: THREE.MeshStandardMaterial | null = null;
  private time: number = 0;

  constructor(params: SlimeMoldParams = {}) {
    this.params = {
      count: 1,
      baseHue: 0.08,
      growthCenters: 5,
      maxLength: 2.0,
      thickness: 0.01,
      branchFrequency: 0.3,
      colorVariation: 0.04,
      animated: false,
      scale: 1,
      scaleVariation: 0.2,
      rotationRandom: Math.PI * 2,
      volumeDensity: 0.5,
      minSpacing: 0.1,
      seed: Math.random(),
      ...params,
    };
  }

  /**
   * Convert HSV to RGB color
   */
  private hsvToRgb(h: number, s: number, v: number): THREE.Color {
    let r = 0, g = 0, b = 0;
    
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return new THREE.Color(r, g, b);
  }

  /**
   * Create slime material with organic appearance
   */
  private createSlimeMaterial(hue: number): THREE.MeshStandardMaterial {
    const variation = (Math.random() - 0.5) * this.params.colorVariation;
    const adjustedHue = (hue + variation + 1) % 1;
    
    const brightColor = this.hsvToRgb(
      adjustedHue,
      0.8 + Math.random() * 0.2,
      0.7 + Math.random() * 0.1
    );
    
    const darkColor = this.hsvToRgb(
      hue,
      0.4 + Math.random() * 0.2,
      0.2 + Math.random() * 0.1
    );

    // Use vertex colors for variation
    const material = new THREE.MeshStandardMaterial({
      color: brightColor,
      roughness: 0.8,
      metalness: 0.0,
      emissive: darkColor,
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });

    return material;
  }

  /**
   * Generate branching path using random walk with constraints
   */
  private generateBranchPath(
    startPoint: THREE.Vector3,
    startNormal: THREE.Vector3,
    maxLength: number,
    maxBranches: number
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [startPoint.clone()];
    let currentPoint = startPoint.clone();
    let currentDirection = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0.5,
      (Math.random() - 0.5) * 2
    ).normalize();
    
    const segmentLength = 0.05;
    let totalLength = 0;
    let branches = 0;

    while (totalLength < maxLength && branches < maxBranches) {
      // Add some randomness to direction
      const randomTurn = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      
      currentDirection.add(randomTurn).normalize();
      
      // Keep generally upward/outward
      if (currentDirection.y < 0.1) {
        currentDirection.y = 0.1;
        currentDirection.normalize();
      }

      const nextPoint = currentPoint.clone().addScaledVector(currentDirection, segmentLength);
      points.push(nextPoint);
      
      currentPoint = nextPoint;
      totalLength += segmentLength;
      
      // Chance to branch
      if (Math.random() < this.params.branchFrequency && branches < maxBranches) {
        branches++;
        // Create a branch point (simplified - just add extra points)
        for (let i = 0; i < 3; i++) {
          const branchPoint = currentPoint.clone().addScaledVector(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.2,
              Math.random() * 0.1,
              (Math.random() - 0.5) * 0.2
            ),
            0.5
          );
          points.push(branchPoint);
        }
      }
    }

    return points;
  }

  /**
   * Create tube geometry from path points
   */
  private createTubeFromPath(
    points: THREE.Vector3[],
    radius: number
  ): THREE.TubeGeometry {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, 6, false);
  }

  /**
   * Apply slime mold growth to target object
   */
  async apply(targetObject: THREE.Object3D): Promise<ScatterResult> {
    const instances: SlimeMoldInstance[] = [];
    const slimeObjects: THREE.Object3D[] = [];
    
    // Get bounding box
    const bbox = new THREE.Box3().setFromObject(targetObject);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // Create growth centers
    const growthCenters: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }> = [];
    
    for (let i = 0; i < this.params.growthCenters; i++) {
      const x = center.x + (Math.random() - 0.5) * size.x * 0.8;
      const z = center.z + (Math.random() - 0.5) * size.z * 0.8;
      
      // Raycast to find surface
      const rayOrigin = new THREE.Vector3(x, bbox.max.y + 1, z);
      const rayDirection = new THREE.Vector3(0, -1, 0);
      const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
      
      const intersects = raycaster.intersectObject(targetObject, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        growthCenters.push({
          position: hit.point,
          normal: hit.face?.normal || new THREE.Vector3(0, 1, 0),
        });
      }
    }

    // Generate slime mold from each center
    const hue = this.params.baseHue;
    
    growthCenters.forEach((center, index) => {
      const pathPoints = this.generateBranchPath(
        center.position,
        center.normal,
        this.params.maxLength * (0.8 + Math.random() * 0.4),
        Math.floor(5 + Math.random() * 10)
      );

      if (pathPoints.length < 2) return;

      // Create tube geometry
      const baseRadius = this.params.thickness * (0.8 + Math.random() * 0.4);
      const tubeGeometry = this.createTubeFromPath(pathPoints, baseRadius);
      
      // Create material
      const material = this.createSlimeMaterial(hue);
      
      const slimeMesh = new THREE.Mesh(tubeGeometry, material);
      slimeMesh.castShadow = true;
      slimeMesh.receiveShadow = true;
      slimeMesh.userData.isSlimeMold = true;
      slimeMesh.userData.hue = hue;
      
      instances.push({
        position: center.position.clone(),
        scale: this.params.scale,
        rotation: 0,
        hue,
        age: Math.random(),
        branchCount: pathPoints.length,
      });
      
      slimeObjects.push(slimeMesh);
    });

    // Create parent container
    const scatterObject = new THREE.Group();
    scatterObject.name = 'SlimeMold';
    scatterObject.userData.scatterType = 'slime_mold';
    scatterObject.userData.instanceCount = instances.length;
    
    slimeObjects.forEach(obj => scatterObject.add(obj));

    // Setup animation if enabled
    if (this.params.animated) {
      this.animate(scatterObject);
    }

    return {
      scatterObject,
      instances,
      metadata: {
        scatterType: 'slime_mold',
        baseHue: hue,
        growthCenters: growthCenters.length,
        instanceCount: instances.length,
        animated: this.params.animated,
      },
    };
  }

  /**
   * Animate slime mold pulsing
   */
  private animate(object: THREE.Group): void {
    const animate = () => {
      this.time += 0.01;
      
      object.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const pulse = Math.sin(this.time * 2 + index) * 0.05 + 0.95;
          child.scale.setScalar(pulse);
          
          if (child.material.emissive) {
            const intensity = (Math.sin(this.time * 3 + index * 0.5) * 0.5 + 0.5) * 0.2;
            child.material.emissiveIntensity = intensity;
          }
        }
      });

      requestAnimationFrame(animate);
    };
    
    animate();
  }

  /**
   * Update parameters dynamically
   */
  updateParams(params: Partial<SlimeMoldParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.tubeGeometry) {
      this.tubeGeometry.dispose();
      this.tubeGeometry = null;
    }
    
    if (this.slimeMaterial) {
      this.slimeMaterial.dispose();
      this.slimeMaterial = null;
    }
  }
}

export default SlimeMoldScatter;
