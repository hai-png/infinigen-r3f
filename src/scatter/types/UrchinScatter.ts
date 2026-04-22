/**
 * Urchin Scatter
 * Scatters sea urchins on underwater surfaces
 * Based on: infinigen/assets/scatters/urchin.py
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface UrchinScatterParams extends ScatterParams {
  /** Number of urchin variations to generate (default: 2-3) */
  variationCount?: number;
  /** Volume density for distribution (default: 0.5-2.0) */
  volumeDensity?: number;
  /** Scale range (default: 0.1-0.8) */
  scaleMin?: number;
  scaleMax?: number;
  /** Scale randomization factor (default: 0.2-0.4) */
  scaleRandomMin?: number;
  scaleRandomMax?: number;
  /** Height offset above surface (default: 0.4-0.8 * scale) */
  heightOffsetMultiplierMin?: number;
  heightOffsetMultiplierMax?: number;
  /** Urchin type: 'regular', 'long-spined', 'pencil', 'mixed' */
  urchinType?: 'regular' | 'longSpined' | 'pencil' | 'mixed';
  /** Color variation: 'purple', 'green', 'red', 'black', 'mixed' */
  colorVariation?: 'purple' | 'green' | 'red' | 'black' | 'mixed';
}

export class UrchinScatter {
  private params: Required<UrchinScatterParams>;

  constructor(params: UrchinScatterParams = {}) {
    this.params = {
      count: 30,
      variationCount: 2,
      volumeDensity: 1.0,
      scaleMin: 0.1,
      scaleMax: 0.8,
      scaleRandomMin: 0.2,
      scaleRandomMax: 0.4,
      heightOffsetMultiplierMin: 0.4,
      heightOffsetMultiplierMax: 0.8,
      urchinType: 'mixed',
      colorVariation: 'mixed',
      ...params,
    };
  }

  /**
   * Apply urchin scattering to underwater surfaces
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const instances: ScatterInstance[] = [];
    const group = new THREE.Group();

    // Generate urchin geometries
    const geometries = this.generateUrchinGeometries();
    const materials = this.createUrchinMaterials();

    // Calculate positions on surface
    const positions = this.calculateSurfacePositions(surface);

    // Create instances
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const normal = this.getSurfaceNormal(surface, pos);

      const geoIndex = Math.floor(Math.random() * geometries.length);
      const geometry = geometries[geoIndex];
      const material = materials[geoIndex % materials.length];

      const mesh = new THREE.Mesh(geometry, material);

      // Position with height offset
      const scale = THREE.MathUtils.lerp(this.params.scaleMin, this.params.scaleMax, Math.random());
      const heightOffset = THREE.MathUtils.lerp(
        this.params.heightOffsetMultiplierMin,
        this.params.heightOffsetMultiplierMax,
        Math.random()
      ) * scale;

      mesh.position.copy(pos);
      if (normal) {
        mesh.position.add(normal.clone().multiplyScalar(heightOffset));
      } else {
        mesh.position.y += heightOffset;
      }

      // Apply scale with randomness
      const scaleVar = THREE.MathUtils.lerp(
        this.params.scaleRandomMin,
        this.params.scaleRandomMax,
        Math.random()
      );
      const finalScale = scale * (1 + scaleVar);
      mesh.scale.setScalar(finalScale);

      // Align to surface normal
      if (normal) {
        this.alignToNormal(mesh, normal);
      }

      // Random rotation around normal
      mesh.rotation.z = Math.random() * Math.PI * 2;

      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;

      instances.push({
        mesh,
        position: mesh.position.clone(),
        rotation: mesh.rotation.clone(),
        scale: mesh.scale.clone(),
      });

      group.add(mesh);
    }

    group.name = 'UrchinScatter';
    group.userData.scatterType = 'urchin';
    group.userData.instanceCount = instances.length;

    return {
      scatterObject: group,
      instances,
      metadata: {
        type: 'urchin',
        count: instances.length,
        urchinType: this.params.urchinType,
        colorVariation: this.params.colorVariation,
      },
    };
  }

  /**
   * Generate procedural urchin geometries
   */
  private generateUrchinGeometries(): THREE.BufferGeometry[] {
    const geometries: THREE.BufferGeometry[] = [];
    const type = this.params.urchinType;

    const typesToGenerate = type === 'mixed'
      ? ['regular', 'longSpined', 'pencil']
      : [type];

    for (const urchinType of typesToGenerate) {
      switch (urchinType) {
        case 'regular':
          geometries.push(this.createRegularUrchin());
          break;
        case 'longSpined':
          geometries.push(this.createLongSpinedUrchin());
          break;
        case 'pencil':
          geometries.push(this.createPencilUrchin());
          break;
      }
    }

    return geometries;
  }

  /**
   * Create regular sea urchin with medium spines
   */
  private createRegularUrchin(): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Central body (test) - sphere
    const bodyRadius = 0.5;
    const bodyGeometry = new THREE.SphereGeometry(bodyRadius, 16, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a2c6d,
      roughness: 0.7,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Spines radiating outward
    const spineCount = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < spineCount; i++) {
      // Distribute spines using Fibonacci sphere algorithm
      const phi = Math.acos(1 - 2 * (i + 0.5) / spineCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);

      const spineLength = 0.8 + Math.random() * 0.6;
      const spineBaseRadius = 0.03;
      const spineTipRadius = 0.005;

      const spineGeometry = new THREE.CylinderGeometry(
        spineBaseRadius,
        spineTipRadius,
        spineLength,
        8
      );
      
      // Rotate to point outward
      spineGeometry.rotateX(-Math.PI / 2);
      spineGeometry.translate(0, spineLength / 2, 0);

      const spine = new THREE.Mesh(spineGeometry, bodyMaterial.clone());
      
      // Position at surface and orient outward
      spine.position.set(x * bodyRadius, y * bodyRadius, z * bodyRadius);
      spine.lookAt(new THREE.Vector3(x * 2, y * 2, z * 2));

      group.add(spine);
    }

    group.updateMatrixWorld(true);
    return this.mergeGeometries(group);
  }

  /**
   * Create long-spined sea urchin (Diadema-like)
   */
  private createLongSpinedUrchin(): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Smaller central body
    const bodyRadius = 0.4;
    const bodyGeometry = new THREE.SphereGeometry(bodyRadius, 16, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.6,
      metalness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Very long, thin spines
    const spineCount = 30 + Math.floor(Math.random() * 15);
    for (let i = 0; i < spineCount; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / spineCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);

      const spineLength = 2.0 + Math.random() * 1.5;
      const spineRadius = 0.015;

      const spineGeometry = new THREE.CylinderGeometry(
        spineRadius,
        spineRadius * 0.3,
        spineLength,
        6
      );
      
      spineGeometry.rotateX(-Math.PI / 2);
      spineGeometry.translate(0, spineLength / 2, 0);

      const spine = new THREE.Mesh(spineGeometry, bodyMaterial.clone());
      spine.position.set(x * bodyRadius, y * bodyRadius, z * bodyRadius);
      spine.lookAt(new THREE.Vector3(x * 2, y * 2, z * 2));

      group.add(spine);
    }

    group.updateMatrixWorld(true);
    return this.mergeGeometries(group);
  }

  /**
   * Create pencil urchin with thick, blunt spines
   */
  private createPencilUrchin(): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Elongated body
    const bodyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    bodyGeometry.scale(1, 0.7, 1);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4a6d,
      roughness: 0.8,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Thick, pencil-like spines
    const spineCount = 20 + Math.floor(Math.random() * 10);
    for (let i = 0; i < spineCount; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / spineCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);

      const spineLength = 0.6 + Math.random() * 0.4;
      const spineRadius = 0.08;

      const spineGeometry = new THREE.CylinderGeometry(
        spineRadius,
        spineRadius * 0.7,
        spineLength,
        12
      );
      
      spineGeometry.rotateX(-Math.PI / 2);
      spineGeometry.translate(0, spineLength / 2, 0);

      // Add tip detail
      const tipGeometry = new THREE.ConeGeometry(spineRadius * 0.5, 0.1, 12);
      tipGeometry.rotateX(-Math.PI / 2);
      tipGeometry.translate(0, spineLength + 0.05, 0);

      const spine = new THREE.Mesh(spineGeometry, bodyMaterial.clone());
      const tip = new THREE.Mesh(tipGeometry, bodyMaterial.clone());
      
      spine.position.set(x * 0.5, y * 0.35, z * 0.5);
      spine.lookAt(new THREE.Vector3(x * 2, y * 2, z * 2));
      
      tip.position.copy(spine.position);
      tip.quaternion.copy(spine.quaternion);

      group.add(spine);
      group.add(tip);
    }

    group.updateMatrixWorld(true);
    return this.mergeGeometries(group);
  }

  /**
   * Merge geometries from group
   */
  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        meshes.push(child);
      }
    });

    if (meshes.length === 0) {
      return new THREE.BufferGeometry();
    }

    // Simplified merge
    const totalVertices = meshes.reduce((sum, mesh) => {
      return sum + mesh.geometry.attributes.position.count;
    }, 0);

    const positions = new Float32Array(totalVertices * 3);
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
   * Create urchin materials with color variations
   */
  private createUrchinMaterials(): THREE.MeshStandardMaterial[] {
    const materials: THREE.MeshStandardMaterial[] = [];
    const colorVar = this.params.colorVariation;

    const colors = [];

    if (colorVar === 'mixed') {
      colors.push(
        { hex: 0x4a2c6d, name: 'purple' },
        { hex: 0x2d5c2e, name: 'green' },
        { hex: 0x6d2c2c, name: 'red' },
        { hex: 0x1a1a1a, name: 'black' }
      );
    } else {
      const colorMap: Record<string, number> = {
        purple: 0x4a2c6d,
        green: 0x2d5c2e,
        red: 0x6d2c2c,
        black: 0x1a1a1a,
      };
      colors.push({ hex: colorMap[colorVar], name: colorVar });
    }

    for (const color of colors) {
      materials.push(
        new THREE.MeshStandardMaterial({
          color: color.hex,
          roughness: 0.7,
          metalness: 0.1,
        })
      );
    }

    return materials;
  }

  /**
   * Calculate positions on surface
   */
  private calculateSurfacePositions(surface: THREE.Object3D): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const bbox = new THREE.Box3().setFromObject(surface);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const area = size.x * size.z;
    const targetCount = Math.floor(area * this.params.volumeDensity * 20);
    const count = Math.min(targetCount, this.params.count);

    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random());
      const z = THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random());
      positions.push(new THREE.Vector3(x, 0, z));
    }

    return positions;
  }

  /**
   * Get surface normal at position
   */
  private getSurfaceNormal(surface: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 | null {
    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Align mesh to surface normal
   */
  private alignToNormal(mesh: THREE.Mesh, normal: THREE.Vector3): void {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    mesh.quaternion.copy(quaternion);
  }
}

export type { UrchinScatterParams };
