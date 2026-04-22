/**
 * BushScatter
 * Scatters medium-sized bushes and shrubs across terrain
 */

import {
  InstancedMesh,
  Matrix4,
  Vector3,
  Color,
  MeshStandardMaterial,
  IcosahedronGeometry,
  Group,
  Raycaster,
} from 'three';
import type { ScatterParams, ScatterResult } from './types';

export interface BushScatterParams extends ScatterParams {
  /** Number of bushes to scatter (default: 12) */
  count?: number;
  /** Size scale of bushes (default: 1.0) */
  scale?: number;
  /** Scale variation range (default: 0.5) */
  scaleVariation?: number;
  /** Minimum distance between bushes (default: 2.0) */
  minDistance?: number;
  /** Rotation randomness (default: Math.PI) */
  rotationRandomness?: number;
  /** Volume density for distribution (default: 0.1) */
  volumeDensity?: number;
  /** Ground offset (default: 0.02) */
  groundOffset?: number;
  /** Enable density tapering at edges (default: true) */
  taperDensity?: boolean;
  /** Bush type variation (default: 'mixed') */
  bushType?: 'round' | 'irregular' | 'conical' | 'mixed';
  /** Foliage density 0-1 (default: 0.8) */
  foliageDensity?: number;
  /** Seasonal color variation (default: 'summer') */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

interface BushInstance {
  position: Vector3;
  rotation: number;
  scale: number;
  type: string;
  color: Color;
}

export class BushScatter {
  private params: Required<BushScatterParams>;
  private raycaster: Raycaster;

  constructor(params: BushScatterParams = {}) {
    this.params = {
      count: params.count ?? 12,
      scale: params.scale ?? 1.0,
      scaleVariation: params.scaleVariation ?? 0.5,
      minDistance: params.minDistance ?? 2.0,
      rotationRandomness: params.rotationRandomness ?? Math.PI,
      volumeDensity: params.volumeDensity ?? 0.1,
      groundOffset: params.groundOffset ?? 0.02,
      taperDensity: params.taperDensity ?? true,
      bushType: params.bushType ?? 'mixed',
      foliageDensity: params.foliageDensity ?? 0.8,
      season: params.season ?? 'summer',
      ...params,
    };
    this.raycaster = new Raycaster();
  }

  /**
   * Apply bush scatter to a terrain mesh
   */
  async apply(terrainMesh: any): Promise<ScatterResult> {
    const bushes: BushInstance[] = [];
    
    // Get terrain bounding box
    const boundingBox = new Vector3();
    if (terrainMesh.geometry.boundingBox) {
      terrainMesh.geometry.boundingBox.getSize(boundingBox);
    } else {
      terrainMesh.geometry.computeBoundingBox();
      terrainMesh.geometry.boundingBox!.getSize(boundingBox);
    }

    const surfaceArea = boundingBox.x * boundingBox.z;
    const effectiveCount = Math.floor(this.params.count * (surfaceArea / 100));
    const maxAttempts = effectiveCount * 50;
    let attempts = 0;

    // Generate bush positions
    while (bushes.length < effectiveCount && attempts < maxAttempts) {
      attempts++;

      const x = (Math.random() - 0.5) * boundingBox.x;
      const z = (Math.random() - 0.5) * boundingBox.z;
      const position = new Vector3(x, boundingBox.y * 2, z);

      // Raycast to find surface
      this.raycaster.set(position, new Vector3(0, -1, 0));
      const intersects = this.raycaster.intersectObject(terrainMesh);

      if (intersects.length > 0) {
        const hitPoint = intersects[0].point.clone();
        hitPoint.y += this.params.groundOffset;

        // Check minimum distance
        const tooClose = bushes.some((bush) => {
          const dx = bush.position.x - hitPoint.x;
          const dz = bush.position.z - hitPoint.z;
          return Math.sqrt(dx * dx + dz * dz) < this.params.minDistance;
        });

        if (!tooClose) {
          // Apply density tapering
          if (this.params.taperDensity) {
            const edgeDistanceX = Math.abs(x) / (boundingBox.x / 2);
            const edgeDistanceZ = Math.abs(z) / (boundingBox.z / 2);
            const edgeFactor = Math.max(edgeDistanceX, edgeDistanceZ);
            
            if (Math.random() > (1 - edgeFactor) * this.params.volumeDensity * 2) {
              continue;
            }
          }

          // Determine bush type
          let bushType = this.params.bushType;
          if (bushType === 'mixed') {
            const types = ['round', 'irregular', 'conical'];
            bushType = types[Math.floor(Math.random() * types.length)] as any;
          }

          const rotation = Math.random() * this.params.rotationRandomness;
          const scale = this.params.scale * (1 + (Math.random() - 0.5) * this.params.scaleVariation);
          const color = this.getSeasonalColor();

          bushes.push({
            position: hitPoint,
            rotation,
            scale,
            type: bushType,
            color,
          });
        }
      }
    }

    // Create instanced meshes grouped by type
    const scatterGroup = new Group();
    const typeGroups = new Map<string, BushInstance[]>();

    bushes.forEach((bush) => {
      if (!typeGroups.has(bush.type)) {
        typeGroups.set(bush.type, []);
      }
      typeGroups.get(bush.type)!.push(bush);
    });

    typeGroups.forEach((typeBushes, type) => {
      const geometry = this.createGeometryForType(type);
      const material = new MeshStandardMaterial({
        color: 0x2d5a27,
        roughness: 0.8,
        metalness: 0.0,
      });

      const mesh = new InstancedMesh(geometry, material, typeBushes.length);
      mesh.instanceMatrix.setUsage(3);

      const matrix = new Matrix4();
      const color = new Color();

      typeBushes.forEach((bush, index) => {
        matrix.makeScale(bush.scale, bush.scale * 0.8, bush.scale);
        matrix.setPosition(bush.position);
        
        const rotMatrix = new Matrix4();
        rotMatrix.makeRotationY(bush.rotation);
        matrix.premultiply(rotMatrix);
        
        mesh.setMatrixAt(index, matrix);
        color.copy(bush.color);
        mesh.setColorAt(index, color);
      });

      mesh.userData.isBushScatter = true;
      mesh.userData.bushType = type;
      scatterGroup.add(mesh);
    });

    const metadata = {
      count: bushes.length,
      surfaceArea,
      density: bushes.length / surfaceArea,
      averageScale: bushes.reduce((sum, b) => sum + b.scale, 0) / bushes.length,
      season: this.params.season,
    };

    return {
      scatterObject: scatterGroup,
      instances: bushes.map((bush) => ({
        position: bush.position.clone(),
        rotation: bush.rotation,
        scale: bush.scale,
        metadata: { type: bush.type },
      })),
      metadata,
    };
  }

  private createGeometryForType(type: string) {
    switch (type) {
      case 'round':
        return new IcosahedronGeometry(1, 2);
      case 'irregular':
        return this.createIrregularBushGeometry();
      case 'conical':
        return this.createConicalBushGeometry();
      default:
        return new IcosahedronGeometry(1, 2);
    }
  }

  private createIrregularBushGeometry() {
    const geometry = new IcosahedronGeometry(1, 1);
    const positions = geometry.attributes.position.array;
    
    // Add irregularity
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const noise = (Math.random() - 0.5) * 0.3;
      positions[i] = x + noise;
      positions[i + 1] = y + noise * 0.5;
      positions[i + 2] = z + noise;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private createConicalBushGeometry() {
    return new (require('three').ConeGeometry)(1, 1.5, 8);
  }

  private getSeasonalColor(): Color {
    const color = new Color();
    
    switch (this.params.season) {
      case 'spring':
        color.setHSL(0.35 + Math.random() * 0.05, 0.6, 0.4 + Math.random() * 0.1);
        break;
      case 'summer':
        color.setHSL(0.3 + Math.random() * 0.05, 0.7, 0.3 + Math.random() * 0.1);
        break;
      case 'autumn':
        const autumnHues = [0.08, 0.12, 0.15, 0.35]; // orange, yellow, red, green
        const hue = autumnHues[Math.floor(Math.random() * autumnHues.length)];
        color.setHSL(hue, 0.7, 0.4 + Math.random() * 0.1);
        break;
      case 'winter':
        color.setHSL(0.3, 0.3, 0.25 + Math.random() * 0.1);
        break;
      default:
        color.setHSL(0.3, 0.6, 0.35);
    }
    
    return color;
  }
}
