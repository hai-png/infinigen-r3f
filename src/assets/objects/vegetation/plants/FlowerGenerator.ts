/**
 * FlowerGenerator - Procedural flower generation with stem + petals + center
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface FlowerConfig {
  petalCount: number;
  petalLength: number;
  petalWidth: number;
  stemHeight: number;
  stemThickness: number;
  colorBase: THREE.Color;
  colorCenter: THREE.Color;
  leafCount: number;
  variety: 'daisy' | 'tulip' | 'rose' | 'wildflower' | 'mixed';
  count: number;
  spreadArea: { width: number; depth: number };
  density: number;
}

export class FlowerGenerator {
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.materialCache = new Map();
  }

  /**
   * Generate a single flower mesh: stem + petals + center
   */
  generateFlower(config: Partial<FlowerConfig> = {}, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const finalConfig: FlowerConfig = {
      petalCount: 8,
      petalLength: 0.15,
      petalWidth: 0.08,
      stemHeight: 0.4 + rng.uniform(0, 0.2),
      stemThickness: 0.02,
      colorBase: new THREE.Color(0xffffff),
      colorCenter: new THREE.Color(0xffdd00),
      leafCount: 2,
      variety: 'daisy',
      count: 1,
      spreadArea: { width: 1, depth: 1 },
      density: 1.0,
      ...config,
    };

    const group = new THREE.Group();

    // Stem
    const stem = this.createStem(finalConfig);
    group.add(stem);

    // Leaves on stem
    for (let i = 0; i < finalConfig.leafCount; i++) {
      const leaf = this.createLeaf(finalConfig, (i + 1) / (finalConfig.leafCount + 1), rng);
      group.add(leaf);
    }

    // Flower head (petals + center)
    const flowerHead = this.createFlowerHead(finalConfig, rng);
    flowerHead.position.y = finalConfig.stemHeight;
    group.add(flowerHead);

    return group;
  }

  /**
   * Generate flower field with instanced rendering
   */
  generateFlowerField(config: Partial<FlowerConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    const finalConfig: FlowerConfig = {
      petalCount: 6,
      petalLength: 0.12,
      petalWidth: 0.06,
      stemHeight: 0.35,
      stemThickness: 0.015,
      colorBase: new THREE.Color(0xff69b4),
      colorCenter: new THREE.Color(0xffff00),
      leafCount: 2,
      variety: 'mixed',
      count: 200,
      spreadArea: { width: 10, depth: 10 },
      density: 0.6,
      ...config,
    };

    const baseGeometry = this.createSimpleFlowerGeometry(finalConfig);
    const material = this.getFlowerMaterial(finalConfig);

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      if (rng.next() > finalConfig.density) continue;

      const x = (rng.next() - 0.5) * finalConfig.spreadArea.width;
      const z = (rng.next() - 0.5) * finalConfig.spreadArea.depth;
      const scale = 0.8 + rng.uniform(0, 0.4);

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = rng.uniform(0, Math.PI * 2);
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  private createStem(config: FlowerConfig): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
    const material = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.7, metalness: 0.0 });
    const stem = new THREE.Mesh(geometry, material);
    stem.position.y = config.stemHeight / 2;
    return stem;
  }

  private createLeaf(config: FlowerConfig, heightRatio: number, rng: SeededRandom): THREE.Mesh {
    // Leaf as a small elongated shape
    const leafLength = config.stemThickness * 6;
    const leafWidth = config.stemThickness * 3;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(leafWidth, leafLength * 0.5, 0, leafLength);
    shape.quadraticCurveTo(-leafWidth, leafLength * 0.5, 0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.y = config.stemHeight * heightRatio;
    leaf.rotation.z = Math.PI / 3 * (rng.boolean() ? 1 : -1);
    leaf.rotation.y = rng.uniform(0, Math.PI * 2);
    return leaf;
  }

  /**
   * Create flower head: petals arranged radially + center sphere
   */
  private createFlowerHead(config: FlowerConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    // Petals — each is a visible elliptical shape
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: config.colorBase.clone(),
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < config.petalCount; i++) {
      const angle = (i / config.petalCount) * Math.PI * 2;
      // Create petal as an elongated shape
      const petalShape = new THREE.Shape();
      const pw = config.petalWidth;
      const pl = config.petalLength;
      petalShape.moveTo(0, 0);
      petalShape.quadraticCurveTo(pw, pl * 0.5, 0, pl);
      petalShape.quadraticCurveTo(-pw, pl * 0.5, 0, 0);
      const petalGeometry = new THREE.ShapeGeometry(petalShape, 4);
      const petal = new THREE.Mesh(petalGeometry, petalMaterial);
      petal.rotation.y = angle;
      petal.rotation.x = Math.PI / 4;
      group.add(petal);
    }

    // Center — a small sphere
    const centerGeometry = new THREE.SphereGeometry(config.stemThickness * 2.5, 8, 8);
    const centerMaterial = new THREE.MeshStandardMaterial({ color: config.colorCenter.clone(), roughness: 0.8, metalness: 0.0 });
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    group.add(center);

    return group;
  }

  /**
   * Create simplified flower geometry for instanced rendering
   */
  private createSimpleFlowerGeometry(config: FlowerConfig): THREE.BufferGeometry {
    const stemGeo = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
    const headGeo = new THREE.SphereGeometry(config.petalLength, 8, 8);
    headGeo.translate(0, config.stemHeight, 0);

    // Merge stem and head
    const stemPos = stemGeo.attributes.position;
    const headPos = headGeo.attributes.position;
    const totalVerts = stemPos.count + headPos.count;

    const mergedPositions = new Float32Array(totalVerts * 3);
    const mergedNormals = new Float32Array(totalVerts * 3);

    for (let i = 0; i < stemPos.count; i++) {
      mergedPositions[i * 3] = stemPos.getX(i);
      mergedPositions[i * 3 + 1] = stemPos.getY(i);
      mergedPositions[i * 3 + 2] = stemPos.getZ(i);
      mergedNormals[i * 3] = stemGeo.attributes.normal.getX(i);
      mergedNormals[i * 3 + 1] = stemGeo.attributes.normal.getY(i);
      mergedNormals[i * 3 + 2] = stemGeo.attributes.normal.getZ(i);
    }

    const offset = stemPos.count;
    for (let i = 0; i < headPos.count; i++) {
      mergedPositions[(offset + i) * 3] = headPos.getX(i);
      mergedPositions[(offset + i) * 3 + 1] = headPos.getY(i);
      mergedPositions[(offset + i) * 3 + 2] = headPos.getZ(i);
      mergedNormals[(offset + i) * 3] = headGeo.attributes.normal.getX(i);
      mergedNormals[(offset + i) * 3 + 1] = headGeo.attributes.normal.getY(i);
      mergedNormals[(offset + i) * 3 + 2] = headGeo.attributes.normal.getZ(i);
    }

    const indices: number[] = [];
    if (stemGeo.index) {
      for (let i = 0; i < stemGeo.index.count; i++) indices.push(stemGeo.index.getX(i));
    }
    if (headGeo.index) {
      for (let i = 0; i < headGeo.index.count; i++) indices.push(headGeo.index.getX(i) + offset);
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    if (indices.length > 0) merged.setIndex(indices);
    merged.computeVertexNormals();
    return merged;
  }

  private getFlowerMaterial(config: FlowerConfig): THREE.MeshStandardMaterial {
    const cacheKey = `flower-${config.colorBase.getHex()}-${config.variety}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey)!;
    const material = new THREE.MeshStandardMaterial({ color: config.colorBase.clone(), roughness: 0.5, metalness: 0.0 });
    this.materialCache.set(cacheKey, material);
    return material;
  }

  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}
