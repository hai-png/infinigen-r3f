/**
 * Monocots Scatter
 * Scatters non-grass herbaceous plants (ferns, reeds, rushes, sedges)
 * Based on: infinigen/assets/scatters/monocots.py
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface MonocotsScatterParams extends ScatterParams {
  /** Number of monocot variations to generate (default: 4) */
  variationCount?: number;
  /** Volume density for distribution (default: 0.2-4.0) */
  volumeDensity?: number;
  /** Minimum spacing between instances (default: 0.1) */
  minSpacing?: number;
  /** Ground offset for proper placement (default: -0.05) */
  groundOffset?: number;
  /** Base scale range (default: 0.05-0.4) */
  scaleMin?: number;
  scaleMax?: number;
  /** Scale randomization factor (default: 0.5-0.95) */
  scaleRandomness?: number;
  /** Wind strength for rotation offset (default: 20) */
  windStrength?: number;
  /** Normal alignment factor (default: 0.3) */
  normalFactor?: number;
  /** Type of monocot: 'fern', 'reed', 'rush', 'sedge', 'mixed' */
  monocotType?: 'fern' | 'reed' | 'rush' | 'sedge' | 'mixed';
  /** Growth pattern: 'clumping' for ferns, 'linear' for reeds/rushes */
  growthPattern?: 'clumping' | 'linear' | 'random';
  /** Wetland preference for riparian zones (default: false) */
  wetlandSpecies?: boolean;
}

export class MonocotsScatter {
  private params: Required<MonocotsScatterParams>;

  constructor(params: MonocotsScatterParams = {}) {
    this.params = {
      count: 50,
      variationCount: 4,
      volumeDensity: 2.0,
      minSpacing: 0.1,
      groundOffset: -0.05,
      scaleMin: 0.05,
      scaleMax: 0.4,
      scaleRandomness: 0.7,
      windStrength: 20,
      normalFactor: 0.3,
      monocotType: 'mixed',
      growthPattern: 'random',
      wetlandSpecies: false,
      ...params,
    };
  }

  /**
   * Apply monocot scattering to a surface
   */
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const instances: ScatterInstance[] = [];
    const group = new THREE.Group();

    // Generate monocot geometries based on type
    const geometries = this.generateMonocotGeometries();
    
    // Create materials for different monocot types
    const materials = this.createMonocotMaterials();

    // Calculate distribution based on growth pattern
    const positions = this.calculatePositions(surface);

    // Create instances
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const normal = this.getSurfaceNormal(surface, pos);
      
      const geoIndex = Math.floor(Math.random() * geometries.length);
      const geometry = geometries[geoIndex];
      const material = materials[geoIndex % materials.length];

      const mesh = new THREE.Mesh(geometry, material);
      
      // Position with ground offset
      mesh.position.copy(pos);
      mesh.position.y += this.params.groundOffset;

      // Align to surface normal
      if (normal && this.params.normalFactor > 0) {
        this.alignToNormal(mesh, normal, this.params.normalFactor);
      }

      // Apply scale with randomness
      const scale = THREE.MathUtils.lerp(
        this.params.scaleMin,
        this.params.scaleMax,
        Math.random()
      );
      const scaleVar = scale * (1 - this.params.scaleRandomness * Math.random());
      mesh.scale.setScalar(scaleVar);

      // Apply wind rotation
      const windRotation = this.applyWindRotation();
      mesh.rotation.y += windRotation;

      // Tilt based on wind strength for natural look
      const tilt = windRotation * 0.5;
      mesh.rotateX(tilt);

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

    group.name = 'MonocotsScatter';
    group.userData.scatterType = 'monocots';
    group.userData.instanceCount = instances.length;

    return {
      scatterObject: group,
      instances,
      metadata: {
        type: 'monocots',
        count: instances.length,
        monocotType: this.params.monocotType,
        growthPattern: this.params.growthPattern,
      },
    };
  }

  /**
   * Generate procedural monocot geometries
   */
  private generateMonocotGeometries(): THREE.BufferGeometry[] {
    const geometries: THREE.BufferGeometry[] = [];
    const type = this.params.monocotType;

    const typesToGenerate = type === 'mixed' 
      ? ['fern', 'reed', 'rush', 'sedge']
      : [type];

    for (const monocotType of typesToGenerate) {
      switch (monocotType) {
        case 'fern':
          geometries.push(this.createFernFrond());
          break;
        case 'reed':
          geometries.push(this.createReedBlade());
          break;
        case 'rush':
          geometries.push(this.createRushStem());
          break;
        case 'sedge':
          geometries.push(this.createSedgeBlade());
          break;
      }
    }

    return geometries;
  }

  /**
   * Create fern frond geometry with multiple leaflets
   */
  private createFernFrond(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const leafletCount = 8 + Math.floor(Math.random() * 6);
    const frondLength = 0.3;
    const leafletWidth = 0.04;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create central stem
    for (let i = 0; i < leafletCount; i++) {
      const t = i / (leafletCount - 1);
      const stemY = t * frondLength;
      const stemWidth = 0.005 * (1 - t * 0.5);

      // Add leaflet on both sides
      for (const side of [-1, 1]) {
        const leafletBase = geometry.vertices || [];
        
        // Simple quad for leaflet
        const lx = side * leafletWidth * (1 - t * 0.3);
        const ly = stemY;
        const lz = 0;

        // Leaflet vertices
        positions.push(
          // Base
          0, ly, 0,
          lx, ly, 0,
          lx * 0.8, ly + 0.03, 0,
          // Triangle 2
          0, ly, 0,
          lx * 0.8, ly + 0.03, 0,
          0, ly + 0.03, 0
        );
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create reed blade geometry (long, narrow leaves)
   */
  private createReedBlade(): THREE.BufferGeometry {
    const height = 0.5 + Math.random() * 0.3;
    const width = 0.02 + Math.random() * 0.01;
    
    const geometry = new THREE.PlaneGeometry(width, height, 1, 8);
    
    // Add slight curve to blade
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + height / 2) / height;
      // Bend at tip
      positions[i + 2] = Math.sin(t * Math.PI) * 0.02 * (Math.random() - 0.5);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create rush stem geometry (cylindrical, upright)
   */
  private createRushStem(): THREE.BufferGeometry {
    const height = 0.4 + Math.random() * 0.2;
    const radius = 0.008 + Math.random() * 0.004;
    
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.9, height, 6, 4);
    geometry.translate(0, height / 2, 0);
    
    return geometry;
  }

  /**
   * Create sedge blade geometry (triangular cross-section)
   */
  private createSedgeBlade(): THREE.BufferGeometry {
    const height = 0.3 + Math.random() * 0.15;
    const width = 0.015 + Math.random() * 0.01;
    
    // Triangular prism for characteristic sedge shape
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();

    const extrudeSettings = { depth: 0.002, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.random() * Math.PI / 6 - Math.PI / 12);
    
    return geometry;
  }

  /**
   * Create materials for monocots
   */
  private createMonocotMaterials(): THREE.MeshStandardMaterial[] {
    const materials: THREE.MeshStandardMaterial[] = [];
    
    // Green palette for different monocot types
    const greenVariations = [
      { r: 0.2, g: 0.4, b: 0.15 }, // Fern green
      { r: 0.3, g: 0.5, b: 0.2 },  // Reed green
      { r: 0.25, g: 0.45, b: 0.18 }, // Rush green
      { r: 0.35, g: 0.55, b: 0.25 }, // Sedge green
    ];

    // Adjust for wetland species
    if (this.params.wetlandSpecies) {
      greenVariations.forEach(v => {
        v.g *= 1.1; // Brighter green for wetland plants
        v.b *= 1.05;
      });
    }

    for (const color of greenVariations) {
      materials.push(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color.r, color.g, color.b),
          roughness: 0.7,
          metalness: 0.0,
          side: THREE.DoubleSide,
        })
      );
    }

    return materials;
  }

  /**
   * Calculate positions based on growth pattern
   */
  private calculatePositions(surface: THREE.Object3D): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const bbox = new THREE.Box3().setFromObject(surface);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const area = size.x * size.z;
    const targetCount = Math.floor(area * this.params.volumeDensity * 10);
    const count = Math.min(targetCount, this.params.count * 5);

    if (this.params.growthPattern === 'clumping') {
      // Fern-like clumping distribution
      const clusterCount = Math.floor(count / 5);
      for (let c = 0; c < clusterCount; c++) {
        const centerX = THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random());
        const centerZ = THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random());
        const clusterRadius = 0.2 + Math.random() * 0.3;

        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * clusterRadius;
          const x = centerX + Math.cos(angle) * radius;
          const z = centerZ + Math.sin(angle) * radius;
          positions.push(new THREE.Vector3(x, 0, z));
        }
      }
    } else if (this.params.growthPattern === 'linear') {
      // Reed/rush linear distribution along water edges
      const lines = 3 + Math.floor(Math.random() * 3);
      for (let l = 0; l < lines; l++) {
        const lineX = THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, l / lines);
        const pointsPerLine = Math.floor(count / lines);
        
        for (let i = 0; i < pointsPerLine; i++) {
          const t = i / pointsPerLine;
          const x = lineX + (Math.random() - 0.5) * 0.1;
          const z = THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, t);
          positions.push(new THREE.Vector3(x, 0, z));
        }
      }
    } else {
      // Random distribution
      for (let i = 0; i < count; i++) {
        const x = THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random());
        const z = THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random());
        positions.push(new THREE.Vector3(x, 0, z));
      }
    }

    return positions;
  }

  /**
   * Get surface normal at position
   */
  private getSurfaceNormal(surface: THREE.Object3D, position: THREE.Vector3): THREE.Vector3 | null {
    // Simplified normal estimation
    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Align mesh to surface normal
   */
  private alignToNormal(mesh: THREE.Mesh, normal: THREE.Vector3, factor: number): void {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    mesh.quaternion.slerp(quaternion, factor);
  }

  /**
   * Apply wind rotation offset
   */
  private applyWindRotation(): number {
    const strength = this.params.windStrength * 0.01;
    return (Math.random() - 0.5) * strength;
  }
}

export type { MonocotsScatterParams };
