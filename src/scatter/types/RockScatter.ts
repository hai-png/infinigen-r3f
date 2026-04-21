/**
 * RockScatter
 * Scatters large rocks and boulders across terrain surfaces
 */

import {
  InstancedMesh,
  Matrix4,
  Vector3,
  Color,
  MeshStandardMaterial,
  DodecahedronGeometry,
  Group,
  Raycaster,
} from 'three';
import type { ScatterParams, ScatterResult } from './types';

export interface RockScatterParams extends ScatterParams {
  /** Number of rocks to scatter (default: 15) */
  count?: number;
  /** Size scale of rocks (default: 1.0) */
  scale?: number;
  /** Scale variation range (default: 0.6) */
  scaleVariation?: number;
  /** Minimum distance between rocks (default: 1.5) */
  minDistance?: number;
  /** Rotation randomness around Y axis (default: Math.PI) */
  rotationRandomness?: number;
  /** Tilt amount for natural appearance (default: 0.3) */
  tiltAmount?: number;
  /** Volume density for distribution (default: 0.15) */
  volumeDensity?: number;
  /** Ground offset to prevent z-fighting (default: 0.05) */
  groundOffset?: number;
  /** Enable density tapering at edges (default: true) */
  taperDensity?: boolean;
  /** Rock shape complexity (default: 3) */
  detail?: number;
}

interface RockInstance {
  position: Vector3;
  rotation: Vector3;
  scale: number;
  seed: number;
}

export class RockScatter {
  private params: Required<RockScatterParams>;
  private raycaster: Raycaster;

  constructor(params: RockScatterParams = {}) {
    this.params = {
      count: params.count ?? 15,
      scale: params.scale ?? 1.0,
      scaleVariation: params.scaleVariation ?? 0.6,
      minDistance: params.minDistance ?? 1.5,
      rotationRandomness: params.rotationRandomness ?? Math.PI,
      tiltAmount: params.tiltAmount ?? 0.3,
      volumeDensity: params.volumeDensity ?? 0.15,
      groundOffset: params.groundOffset ?? 0.05,
      taperDensity: params.taperDensity ?? true,
      detail: params.detail ?? 3,
      ...params,
    };
    this.raycaster = new Raycaster();
  }

  /**
   * Apply rock scatter to a terrain mesh
   */
  async apply(terrainMesh: any): Promise<ScatterResult> {
    const rocks: RockInstance[] = [];
    
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

    // Generate rock positions
    while (rocks.length < effectiveCount && attempts < maxAttempts) {
      attempts++;

      // Random position on terrain surface
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
        const tooClose = rocks.some((rock) => {
          const dx = rock.position.x - hitPoint.x;
          const dz = rock.position.z - hitPoint.z;
          return Math.sqrt(dx * dx + dz * dz) < this.params.minDistance;
        });

        if (!tooClose) {
          // Apply density tapering at edges
          if (this.params.taperDensity) {
            const edgeDistanceX = Math.abs(x) / (boundingBox.x / 2);
            const edgeDistanceZ = Math.abs(z) / (boundingBox.z / 2);
            const edgeFactor = Math.max(edgeDistanceX, edgeDistanceZ);
            
            if (Math.random() > (1 - edgeFactor) * this.params.volumeDensity * 2) {
              continue;
            }
          }

          // Calculate rotation with tilt
          const normal = intersects[0].face?.normal ?? new Vector3(0, 1, 0);
          const rotY = Math.random() * this.params.rotationRandomness;
          const tiltX = (Math.random() - 0.5) * this.params.tiltAmount;
          const tiltZ = (Math.random() - 0.5) * this.params.tiltAmount;

          rocks.push({
            position: hitPoint,
            rotation: new Vector3(tiltX, rotY, tiltZ),
            scale: this.params.scale * (1 + (Math.random() - 0.5) * this.params.scaleVariation),
            seed: Math.random(),
          });
        }
      }
    }

    // Create instanced mesh for rocks
    const geometry = new DodecahedronGeometry(1, this.params.detail);
    const material = new MeshStandardMaterial({
      color: 0x8b8b8b,
      roughness: 0.9,
      metalness: 0.1,
    });

    const mesh = new InstancedMesh(geometry, material, rocks.length);
    mesh.instanceMatrix.setUsage(3); // DynamicDrawUsage

    const matrix = new Matrix4();
    const color = new Color();

    rocks.forEach((rock, index) => {
      // Create variation matrix
      matrix.makeScale(rock.scale, rock.scale, rock.scale);
      
      // Apply rotation
      const rotMatrix = new Matrix4();
      rotMatrix.makeRotationFromEuler(rock.rotation);
      matrix.premultiply(rotMatrix);
      
      // Set position
      matrix.setPosition(rock.position);
      mesh.setMatrixAt(index, matrix);

      // Color variation
      const grayValue = 0.6 + Math.random() * 0.3;
      color.setRGB(grayValue, grayValue, grayValue);
      color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
      mesh.setColorAt(index, color);
    });

    mesh.userData.isRockScatter = true;
    mesh.userData.rockData = rocks;

    // Store metadata
    const metadata = {
      count: rocks.length,
      surfaceArea,
      density: rocks.length / surfaceArea,
      averageScale: rocks.reduce((sum, r) => sum + r.scale, 0) / rocks.length,
    };

    const scatterGroup = new Group();
    scatterGroup.add(mesh);

    return {
      scatterObject: scatterGroup,
      instances: rocks.map((rock) => ({
        position: rock.position.clone(),
        rotation: rock.rotation.toVector3 ? rock.rotation.toVector3() : rock.rotation,
        scale: rock.scale,
        metadata: { seed: rock.seed },
      })),
      metadata,
    };
  }

  /**
   * Update rock colors based on material type
   */
  updateColors(mesh: InstancedMesh, baseColor: number, variation: number = 0.15): void {
    const color = new Color(baseColor);
    
    for (let i = 0; i < mesh.count; i++) {
      const instanceColor = color.clone();
      instanceColor.offsetHSL(0, 0, (Math.random() - 0.5) * variation);
      mesh.setColorAt(i, instanceColor);
    }
    
    mesh.instanceColor!.needsUpdate = true;
  }
}
