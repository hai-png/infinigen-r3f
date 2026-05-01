/**
 * GrassGenerator - Procedural grass field generation with blade clusters
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface GrassConfig {
  bladeHeight: number;
  bladeWidth: number;
  density: number;
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  windAmplitude: number;
  windFrequency: number;
  count: number;
  spreadArea: { width: number; depth: number };
  variety: 'fine' | 'coarse' | 'mixed';
}

export class GrassGenerator {
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.materialCache = new Map();
  }

  generateGrassField(config: Partial<GrassConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    const finalConfig: GrassConfig = {
      bladeHeight: 0.3 + rng.uniform(0, 0.2),
      bladeWidth: 0.02 + rng.uniform(0, 0.01),
      density: 0.7,
      colorBase: new THREE.Color(0x4a7c23),
      colorVariation: new THREE.Color(0x3d6b1f),
      windAmplitude: 0.05,
      windFrequency: 0.5,
      count: 1000,
      spreadArea: { width: 10, depth: 10 },
      variety: 'mixed',
      ...config,
    };

    const baseGeometry = this.createGrassBladeGeometry(finalConfig);
    const material = this.getGrassMaterial(finalConfig);

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      const x = (rng.next() - 0.5) * finalConfig.spreadArea.width;
      const z = (rng.next() - 0.5) * finalConfig.spreadArea.depth;

      if (rng.next() > finalConfig.density) continue;

      const heightVariation = 0.7 + rng.uniform(0, 0.6);
      const scale = finalConfig.bladeWidth * heightVariation;

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, heightVariation, scale);
      dummy.rotation.y = rng.uniform(0, Math.PI * 2);
      dummy.rotation.x = (rng.next() - 0.5) * 0.2;
      dummy.rotation.z = (rng.next() - 0.5) * 0.2;
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);

      // Color variation
      if (rng.next() > 0.5) {
        const color = finalConfig.colorBase.clone();
        const variation = (rng.next() - 0.5) * 0.2;
        color.offsetHSL(0, 0, variation);
        instancedMesh.setColorAt(instanceIndex - 1, color);
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    return instancedMesh;
  }

  private createGrassBladeGeometry(config: GrassConfig): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(config.bladeWidth, config.bladeHeight, 1, 3);
    const positions = geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + config.bladeHeight / 2) / config.bladeHeight;
      const taper = 0.3 + 0.7 * (1 - t);
      positions[i] *= taper;
      if (y > 0) positions[i + 2] = Math.sin(t * Math.PI) * config.bladeWidth * 0.3;
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  private getGrassMaterial(config: GrassConfig): THREE.MeshStandardMaterial {
    const cacheKey = `grass-${config.colorBase.getHex()}-${config.variety}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey)!;
    const material = new THREE.MeshStandardMaterial({ color: config.colorBase.clone(), roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
    this.materialCache.set(cacheKey, material);
    return material;
  }

  generateGrassClumps(config: Partial<GrassConfig> & { clumpCount: number; clumpSize: number }, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const group = new THREE.Group();
    const clumpConfig = {
      bladeHeight: 0.35, bladeWidth: 0.025, density: 0.9,
      colorBase: new THREE.Color(0x508025), colorVariation: new THREE.Color(0x407020),
      windAmplitude: 0.06, windFrequency: 0.6, count: 50,
      spreadArea: { width: 1, depth: 1 }, variety: 'mixed' as const,
      clumpCount: 20, clumpSize: 0.5, ...config,
    };

    for (let i = 0; i < clumpConfig.clumpCount; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const radius = rng.uniform(0, clumpConfig.clumpSize);
      const clump = this.generateGrassField({
        count: clumpConfig.count,
        spreadArea: { width: clumpConfig.clumpSize, depth: clumpConfig.clumpSize },
        bladeHeight: clumpConfig.bladeHeight * rng.uniform(0.8, 1.2),
        density: clumpConfig.density,
        colorBase: clumpConfig.colorBase.clone(),
      }, seed + i);
      clump.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      group.add(clump);
    }
    return group;
  }

  generateTallGrass(config: Partial<GrassConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    return this.generateGrassField({
      bladeHeight: 0.6 + rng.uniform(0, 0.4),
      bladeWidth: 0.03 + rng.uniform(0, 0.015),
      density: 0.5,
      colorBase: new THREE.Color(0x6b8e3a),
      variety: 'coarse',
      ...config,
    }, seed);
  }

  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}
