/**
 * Jellyfish Scatter
 * Scatters jellyfish in volumetric water spaces
 * Based on: infinigen/assets/scatters/jellyfish.py
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface JellyfishScatterParams extends ScatterParams {
  /** Number of jellyfish variations to generate (default: 2-3) */
  variationCount?: number;
  /** Volume density for distribution (default: 1.0) */
  density?: number;
  /** Minimum spacing between instances (default: scale * 4) */
  minSpacing?: number;
  /** Base scale for jellyfish (default: 1) */
  scale?: number;
  /** Scale randomization range (default: 0.2-0.9) */
  scaleRandomMin?: number;
  scaleRandomMax?: number;
  /** Height offset above surface for floating effect (default: 4-8 * scale) */
  heightOffsetMin?: number;
  heightOffsetMax?: number;
  /** Rotation range in radians (default: π/3) */
  rotationRange?: number;
  /** Normal alignment factor (default: 0.0 for free-floating) */
  normalFactor?: number;
  /** Water depth for volume distribution (default: 10) */
  waterDepth?: number;
  /** Enable pulsing animation (default: true) */
  animate?: boolean;
  /** Animation speed multiplier (default: 1.0) */
  animationSpeed?: number;
}

interface JellyfishInstance extends ScatterInstance {
  pulseOffset: number;
  driftVelocity: THREE.Vector3;
}

export class JellyfishScatter {
  private params: Required<JellyfishScatterParams>;
  private time: number = 0;
  private animationId: number | null = null;

  constructor(params: JellyfishScatterParams = {}) {
    this.params = {
      count: 20,
      variationCount: 2,
      density: 1.0,
      minSpacing: 4,
      scale: 1,
      scaleRandomMin: 0.2,
      scaleRandomMax: 0.9,
      heightOffsetMin: 4,
      heightOffsetMax: 8,
      rotationRange: Math.PI / 3,
      normalFactor: 0.0,
      waterDepth: 10,
      animate: true,
      animationSpeed: 1.0,
      ...params,
    };
    
    // Adjust minSpacing based on scale
    this.params.minSpacing = this.params.scale * 4;
  }

  /**
   * Apply jellyfish scattering in volumetric water space
   */
  async apply(volume: THREE.Object3D): Promise<ScatterResult> {
    const instances: JellyfishInstance[] = [];
    const group = new THREE.Group();

    // Generate jellyfish geometries
    const geometries = this.generateJellyfishGeometries();
    const materials = this.createJellyfishMaterials();

    // Calculate volumetric positions
    const positions = this.calculateVolumetricPositions(volume);

    // Create instances
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      const geoIndex = Math.floor(Math.random() * geometries.length);
      const geometry = geometries[geoIndex];
      const material = materials[geoIndex % materials.length];

      const mesh = new THREE.Mesh(geometry, material);
      
      // Position with height offset for floating
      const heightOffset = THREE.MathUtils.lerp(
        this.params.heightOffsetMin,
        this.params.heightOffsetMax,
        Math.random()
      );
      mesh.position.copy(pos);
      mesh.position.y += heightOffset * this.params.scale;

      // Apply scale with randomness
      const scaleVar = THREE.MathUtils.lerp(
        this.params.scaleRandomMin,
        this.params.scaleRandomMax,
        Math.random()
      );
      const finalScale = this.params.scale * scaleVar;
      mesh.scale.setScalar(finalScale);

      // Random rotation (jellyfish float freely)
      mesh.rotation.x = (Math.random() - 0.5) * this.params.rotationRange;
      mesh.rotation.z = (Math.random() - 0.5) * this.params.rotationRange;
      mesh.rotation.y = Math.random() * Math.PI * 2;

      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;

      // Store instance data with animation properties
      const instance: JellyfishInstance = {
        mesh,
        position: mesh.position.clone(),
        rotation: mesh.rotation.clone(),
        scale: mesh.scale.clone(),
        pulseOffset: Math.random() * Math.PI * 2,
        driftVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.005,
          (Math.random() - 0.5) * 0.01
        ),
      };

      instances.push(instance);
      group.add(mesh);
    }

    group.name = 'JellyfishScatter';
    group.userData.scatterType = 'jellyfish';
    group.userData.instanceCount = instances.length;

    // Start animation if enabled
    if (this.params.animate) {
      this.startAnimation(group, instances);
    }

    return {
      scatterObject: group,
      instances: instances as ScatterInstance[],
      metadata: {
        type: 'jellyfish',
        count: instances.length,
        animated: this.params.animate,
        waterDepth: this.params.waterDepth,
      },
    };
  }

  /**
   * Generate procedural jellyfish geometries
   */
  private generateJellyfishGeometries(): THREE.BufferGeometry[] {
    const geometries: THREE.BufferGeometry[] = [];

    // Generate different jellyfish species
    for (let i = 0; i < this.params.variationCount; i++) {
      geometries.push(this.createJellyfish(i));
    }

    return geometries;
  }

  /**
   * Create individual jellyfish geometry with bell and tentacles
   */
  private createJellyfish(variation: number): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Bell (main body) - semi-sphere
    const bellRadius = 0.5 + variation * 0.1;
    const bellHeight = 0.3 + variation * 0.05;
    
    const bellGeometry = new THREE.SphereGeometry(bellRadius, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const bellMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6 + variation * 0.05, 0.5, 0.7),
      transparent: true,
      opacity: 0.6,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    
    const bell = new THREE.Mesh(bellGeometry, bellMaterial);
    bell.scale.y = bellHeight / bellRadius;
    group.add(bell);

    // Tentacles
    const tentacleCount = 8 + Math.floor(variation * 4);
    for (let i = 0; i < tentacleCount; i++) {
      const angle = (i / tentacleCount) * Math.PI * 2;
      const radius = bellRadius * 0.7;
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Create tentacle as curved tube
      const tentacleLength = 1.5 + Math.random() * 1.0;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(x, -bellHeight * 0.5, z),
        new THREE.Vector3(x * 1.2, -tentacleLength * 0.5, z * 1.2),
        new THREE.Vector3(x * 0.8, -tentacleLength, z * 0.8)
      );

      const tubeGeometry = new THREE.TubeGeometry(curve, 8, 0.03, 8, false);
      const tentacle = new THREE.Mesh(tubeGeometry, bellMaterial.clone());
      group.add(tentacle);
    }

    // Merge geometries for performance
    group.updateMatrixWorld(true);
    const mergedGeometry = this.mergeGeometries(group);
    
    // Clean up temporary objects
    group.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    return mergedGeometry;
  }

  /**
   * Merge all geometries from a group into single geometry
   */
  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.updateMatrixWorld(true);
        meshes.push(child);
      }
    });

    if (meshes.length === 0) {
      return new THREE.BufferGeometry();
    }

    return this.mergeBufferGeometries(meshes);
  }

  /**
   * Merge multiple buffer geometries with transforms
   */
  private mergeBufferGeometries(meshes: THREE.Mesh[]): THREE.BufferGeometry {
    // Simplified merge - in production use BufferGeometryUtils
    const totalVertices = meshes.reduce((sum, mesh) => {
      return sum + mesh.geometry.attributes.position.count;
    }, 0);

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const uvs = new Float32Array(totalVertices * 2);

    let vertexOffset = 0;

    meshes.forEach(mesh => {
      const geom = mesh.geometry;
      const matrix = mesh.matrixWorld;

      const posAttr = geom.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);

        const transformed = new THREE.Vector3(vx, vy, vz).applyMatrix4(matrix);

        positions[vertexOffset * 3] = transformed.x;
        positions[vertexOffset * 3 + 1] = transformed.y;
        positions[vertexOffset * 3 + 2] = transformed.z;
        vertexOffset++;
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create translucent materials for jellyfish
   */
  private createJellyfishMaterials(): THREE.MeshStandardMaterial[] {
    const materials: THREE.MeshStandardMaterial[] = [];

    // Bioluminescent color palette
    const colors = [
      { h: 0.6, s: 0.5, l: 0.7 }, // Blue
      { h: 0.7, s: 0.4, l: 0.75 }, // Purple-blue
      { h: 0.55, s: 0.5, l: 0.65 }, // Cyan
      { h: 0.65, s: 0.6, l: 0.8 }, // Light blue
    ];

    for (const color of colors) {
      materials.push(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(color.h, color.s, color.l),
          transparent: true,
          opacity: 0.5 + Math.random() * 0.3,
          roughness: 0.2,
          metalness: 0.1,
          side: THREE.DoubleSide,
          emissive: new THREE.Color().setHSL(color.h, color.s * 0.5, color.l * 0.3),
          emissiveIntensity: 0.2,
        })
      );
    }

    return materials;
  }

  /**
   * Calculate positions within volumetric water space
   */
  private calculateVolumetricPositions(volume: THREE.Object3D): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const bbox = new THREE.Box3().setFromObject(volume);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const volumeSize = size.x * size.y * size.z;
    const targetCount = Math.floor(volumeSize * this.params.density * 0.01);
    const count = Math.min(targetCount, this.params.count);

    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random());
      const y = THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.random());
      const z = THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random());
      
      positions.push(new THREE.Vector3(x, y, z));
    }

    return positions;
  }

  /**
   * Start pulsing and drifting animation
   */
  private startAnimation(group: THREE.Group, instances: JellyfishInstance[]): void {
    const animate = () => {
      this.time += 0.016 * this.params.animationSpeed;

      instances.forEach((instance, idx) => {
        const mesh = instance.mesh;

        // Pulsing motion (bell contraction/expansion)
        const pulse = Math.sin(this.time * 2 + instance.pulseOffset) * 0.1 + 1;
        const baseScale = instance.scale.x;
        mesh.scale.set(
          baseScale * pulse,
          baseScale * (2 - pulse),
          baseScale * pulse
        );

        // Gentle drifting
        mesh.position.add(instance.driftVelocity.clone().multiplyScalar(pulse));

        // Subtle rotation
        mesh.rotation.y += 0.005 * this.params.animationSpeed;

        // Keep within bounds (simple wrap-around)
        const bbox = new THREE.Box3().setFromObject(group.parent || group);
        if (mesh.position.y < bbox.min.y + 2) {
          mesh.position.y = bbox.max.y - 2;
        } else if (mesh.position.y > bbox.max.y - 2) {
          mesh.position.y = bbox.min.y + 2;
        }

        mesh.updateMatrix();
      });

      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * Stop animation and cleanup
   */
  public stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Update animation parameters at runtime
   */
  public updateAnimationSpeed(speed: number): void {
    this.params.animationSpeed = speed;
  }
}

export type { JellyfishScatterParams };
