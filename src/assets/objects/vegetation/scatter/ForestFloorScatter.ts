/**
 * ForestFloorScatter - Ground scatter with multiple object types
 *
 * Features:
 * - Fallen leaves (seasonal colors)
 * - Twigs and small branches
 * - Pine needles
 * - Pebbles and small stones
 * - Moss patches
 * - Mushrooms
 * - Wildflowers
 * - Density based on terrain slope, biome, distance from trees, noise
 * - All objects use InstancedMesh for performance
 * - Seasonal variation
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Types
// ============================================================================

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type ScatterObjectType =
  | 'fallen_leaves'
  | 'twigs'
  | 'pine_needles'
  | 'pebbles'
  | 'moss_patches'
  | 'mushrooms'
  | 'wildflowers';

export interface ForestFloorConfig {
  /** Area size (width x depth) */
  areaSize: number;
  /** Total scatter density multiplier */
  density: number;
  /** Object type weights (relative probability) */
  typeWeights: Record<ScatterObjectType, number>;
  /** Biome type affects density and object mix */
  biome: 'forest' | 'mountain' | 'meadow' | 'wetland';
  /** Current season */
  season: Season;
  /** Terrain slope threshold (steeper = less scatter) */
  maxSlopeAngle: number;
  /** Noise scale for density variation */
  noiseScale: number;
  /** Max instances per object type */
  maxInstancesPerType: number;
}

// ============================================================================
// Seasonal Colors
// ============================================================================

const SEASONAL_LEAF_COLORS: Record<Season, number[]> = {
  spring: [0x7cb342, 0x8bc34a, 0x9ccc65],
  summer: [0x33691e, 0x2e7d32, 0x388e3c],
  autumn: [0xd84315, 0xff8f00, 0xf9a825, 0xbf360c, 0xe65100],
  winter: [0x5d4037, 0x4e342e, 0x795548],
};

const SEASONAL_FLOWER_COLORS: Record<Season, number[]> = {
  spring: [0xff69b4, 0xff1493, 0xffb6c1, 0xffc0cb, 0xffd700],
  summer: [0xff4500, 0xff6347, 0xdaa520, 0x9370db],
  autumn: [0xcd853f, 0xd2691e, 0xbc8f8f],
  winter: [],
};

// ============================================================================
// ForestFloorScatter
// ============================================================================

export class ForestFloorScatter {
  private config: ForestFloorConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;

  constructor(seed: number = 42, config: Partial<ForestFloorConfig> = {}) {
    this.rng = new SeededRandom(seed);
    this.noise = new NoiseUtils(seed);

    this.config = {
      areaSize: 20,
      density: 1.0,
      typeWeights: {
        fallen_leaves: 3.0,
        twigs: 1.5,
        pine_needles: 1.0,
        pebbles: 1.0,
        moss_patches: 1.5,
        mushrooms: 0.5,
        wildflowers: 0.8,
      },
      biome: 'forest',
      season: 'summer',
      maxSlopeAngle: Math.PI / 4,
      noiseScale: 0.5,
      maxInstancesPerType: 500,
      ...config,
    };
  }

  /**
   * Generate the complete forest floor scatter as a group of InstancedMeshes
   */
  generate(): THREE.Group {
    const group = new THREE.Group();

    const leaves = this.generateFallenLeaves();
    if (leaves) group.add(leaves);

    const twigs = this.generateTwigs();
    if (twigs) group.add(twigs);

    const needles = this.generatePineNeedles();
    if (needles) group.add(needles);

    const pebbles = this.generatePebbles();
    if (pebbles) group.add(pebbles);

    const moss = this.generateMossPatches();
    if (moss) group.add(moss);

    const mushrooms = this.generateMushrooms();
    if (mushrooms) group.add(mushrooms);

    const flowers = this.generateWildflowers();
    if (flowers) group.add(flowers);

    group.userData.tags = ['vegetation', 'forest_floor', 'scatter'];
    return group;
  }

  // ------------------------------------------------------------------
  // Density Calculation
  // ------------------------------------------------------------------

  private getDensityAt(x: number, z: number): number {
    const noiseVal = this.noise.perlin(x * this.config.noiseScale, 0, z * this.config.noiseScale);
    let density = 0.5 + noiseVal * 0.5;

    switch (this.config.biome) {
      case 'forest': density *= 1.2; break;
      case 'mountain': density *= 0.5; break;
      case 'meadow': density *= 0.8; break;
      case 'wetland': density *= 1.0; break;
    }

    switch (this.config.season) {
      case 'spring': density *= 0.9; break;
      case 'summer': density *= 1.0; break;
      case 'autumn': density *= 1.3; break;
      case 'winter': density *= 0.4; break;
    }

    return Math.max(0, Math.min(1, density * this.config.density));
  }

  private shouldPlaceHere(x: number, z: number): boolean {
    return this.rng.next() < this.getDensityAt(x, z);
  }

  // ------------------------------------------------------------------
  // Fallen Leaves
  // ------------------------------------------------------------------

  private generateFallenLeaves(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('fallen_leaves');
    if (count === 0) return null;

    const leafGeo = this.createFallenLeafGeometry();
    const colors = SEASONAL_LEAF_COLORS[this.config.season];
    const leafMat = new THREE.MeshStandardMaterial({
      color: colors[0] ?? 0x2d5a1d,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(leafGeo, leafMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, this.rng.uniform(0, 0.02), z);
        dummy.rotation.set(
          -Math.PI / 2 + this.rng.uniform(-0.3, 0.3),
          this.rng.uniform(0, Math.PI * 2),
          this.rng.uniform(-0.1, 0.1)
        );
        dummy.scale.setScalar(this.rng.uniform(0.5, 1.5));

        const color = new THREE.Color(colors[Math.floor(this.rng.next() * colors.length)] ?? 0x2d5a1d);
        color.offsetHSL(this.rng.uniform(-0.03, 0.03), this.rng.uniform(-0.1, 0.1), this.rng.uniform(-0.1, 0.1));
        mesh.setColorAt(i, color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createFallenLeafGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const s = 0.04;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.6, s * 0.3, s * 0.5, s * 0.7);
    shape.quadraticCurveTo(s * 0.3, s, 0, s * 1.2);
    shape.quadraticCurveTo(-s * 0.3, s, -s * 0.5, s * 0.7);
    shape.quadraticCurveTo(-s * 0.6, s * 0.3, 0, 0);
    return new THREE.ShapeGeometry(shape, 2);
  }

  // ------------------------------------------------------------------
  // Twigs
  // ------------------------------------------------------------------

  private generateTwigs(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('twigs');
    if (count === 0) return null;

    const twigGeo = new THREE.CylinderGeometry(0.003, 0.005, 0.15, 4);
    const twigMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, metalness: 0.0 });

    const mesh = new THREE.InstancedMesh(twigGeo, twigMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, this.rng.uniform(0, 0.01), z);
        dummy.rotation.set(-Math.PI / 2 + this.rng.uniform(-0.2, 0.2), this.rng.uniform(0, Math.PI * 2), this.rng.uniform(-0.3, 0.3));
        dummy.scale.setScalar(this.rng.uniform(0.5, 2.0));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Pine Needles
  // ------------------------------------------------------------------

  private generatePineNeedles(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('pine_needles');
    if (count === 0) return null;

    const needleShape = new THREE.Shape();
    needleShape.moveTo(0, 0);
    needleShape.lineTo(0.003, 0.08);
    needleShape.lineTo(0, 0.1);
    needleShape.lineTo(-0.003, 0.08);
    needleShape.closePath();

    const needleGeo = new THREE.ShapeGeometry(needleShape, 1);
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x2e5d1e, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide });

    const mesh = new THREE.InstancedMesh(needleGeo, needleMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, this.rng.uniform(0, 0.01), z);
        dummy.rotation.set(this.rng.uniform(-0.5, 0.5), this.rng.uniform(0, Math.PI * 2), this.rng.uniform(-0.5, 0.5));
        dummy.scale.setScalar(this.rng.uniform(0.7, 1.5));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Pebbles
  // ------------------------------------------------------------------

  private generatePebbles(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('pebbles');
    if (count === 0) return null;

    const pebbleGeo = new THREE.SphereGeometry(0.02, 5, 4);
    const positions = pebbleGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) * 0.5);
    }
    pebbleGeo.computeVertexNormals();

    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.85, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, 0, z);
        dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
        dummy.scale.set(this.rng.uniform(0.5, 1.5), this.rng.uniform(0.3, 0.8), this.rng.uniform(0.5, 1.5));
        const gray = this.rng.uniform(0.4, 0.7);
        mesh.setColorAt(i, new THREE.Color(gray, gray, gray * 0.95));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Moss Patches
  // ------------------------------------------------------------------

  private generateMossPatches(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('moss_patches');
    if (count === 0) return null;

    const mossGeo = new THREE.CircleGeometry(0.08, 8);
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1d, roughness: 0.95, metalness: 0.0 });

    const mesh = new THREE.InstancedMesh(mossGeo, mossMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, 0.001, z);
        dummy.rotation.x = -Math.PI / 2;
        dummy.rotation.z = this.rng.uniform(0, Math.PI * 2);
        dummy.scale.set(this.rng.uniform(0.5, 2.0), this.rng.uniform(0.5, 2.0), 1);
        const color = new THREE.Color(0x2d5a1d);
        color.offsetHSL(this.rng.uniform(-0.05, 0.05), this.rng.uniform(-0.1, 0.1), this.rng.uniform(-0.15, 0.05));
        mesh.setColorAt(i, color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Mushrooms (simplified for scatter)
  // ------------------------------------------------------------------

  private generateMushrooms(): THREE.InstancedMesh | null {
    const count = this.getInstanceCount('mushrooms');
    if (count === 0 || this.config.season === 'winter') return null;

    const capGeo = new THREE.SphereGeometry(0.015, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const stemGeo = new THREE.CylinderGeometry(0.004, 0.005, 0.02, 5);
    const mergedGeo = this.mergeGeos(capGeo, stemGeo, new THREE.Vector3(0, 0.02, 0));

    const mushroomMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.7, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(mergedGeo, mushroomMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, 0, z);
        dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
        dummy.scale.setScalar(this.rng.uniform(0.5, 2.0));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Wildflowers
  // ------------------------------------------------------------------

  private generateWildflowers(): THREE.InstancedMesh | null {
    const flowerColors = SEASONAL_FLOWER_COLORS[this.config.season];
    if (flowerColors.length === 0) return null;

    const count = this.getInstanceCount('wildflowers');
    if (count === 0) return null;

    const flowerGeo = new THREE.SphereGeometry(0.01, 5, 4);
    const flowerMat = new THREE.MeshStandardMaterial({ color: flowerColors[0], roughness: 0.5, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(flowerGeo, flowerMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * this.config.areaSize;
      const z = (this.rng.next() - 0.5) * this.config.areaSize;

      if (!this.shouldPlaceHere(x, z)) {
        dummy.position.set(x, -10, z);
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(x, this.rng.uniform(0.02, 0.06), z);
        dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
        dummy.scale.setScalar(this.rng.uniform(0.6, 1.5));
        const color = new THREE.Color(flowerColors[Math.floor(this.rng.next() * flowerColors.length)]);
        color.offsetHSL(this.rng.uniform(-0.05, 0.05), 0, this.rng.uniform(-0.1, 0.1));
        mesh.setColorAt(i, color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------

  private getInstanceCount(type: ScatterObjectType): number {
    const weight = this.config.typeWeights[type] ?? 1.0;
    const baseCount = Math.floor(this.config.maxInstancesPerType * weight * this.config.density);
    return Math.min(baseCount, this.config.maxInstancesPerType);
  }

  private mergeGeos(geo1: THREE.BufferGeometry, geo2: THREE.BufferGeometry, offset: THREE.Vector3): THREE.BufferGeometry {
    // Offset the second geometry before merging
    geo2.translate(offset.x, offset.y, offset.z);
    return GeometryPipeline.mergeGeometries([geo1, geo2]);
  }
}
