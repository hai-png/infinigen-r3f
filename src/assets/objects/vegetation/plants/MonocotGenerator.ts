/**
 * MonocotGenerator - Generates monocotyledon plants (grasses, lilies, palms, etc.)
 * Stem + blade leaves. All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface MonocotConfig {
  species: 'tall_grass' | 'reed' | 'lily' | 'iris' | 'agave' | 'yucca' | 'bamboo' | 'cattail' | 'rush';
  height: number;
  stemRadius: number;
  leafLength: number;
  leafWidth: number;
  clusterSize: number;
  spreadRadius: number;
  leafCount: number;
  leafCurvature: number;
  leafDroop: number;
  leafTwist: number;
  primaryColor: THREE.Color;
  secondaryColor: THREE.Color;
  colorVariation: number;
  windSensitivity: number;
  seasonalTint: number;
  segments: number;
  useInstancing: boolean;
}

export const MonocotSpeciesPresets: Record<string, Partial<MonocotConfig>> = {
  tall_grass: { height: 0.8, stemRadius: 0.003, leafLength: 1.0, leafWidth: 0.02, clusterSize: 8, spreadRadius: 0.3, leafCount: 5, leafCurvature: 0.4, leafDroop: 0.3, primaryColor: new THREE.Color(0x7cba6b), secondaryColor: new THREE.Color(0x5a8f4a) },
  reed: { height: 2.5, stemRadius: 0.008, leafLength: 0.8, leafWidth: 0.03, clusterSize: 12, spreadRadius: 0.5, leafCount: 8, leafCurvature: 0.2, leafDroop: 0.5, primaryColor: new THREE.Color(0x8bb860), secondaryColor: new THREE.Color(0x6b8f45) },
  lily: { height: 0.6, stemRadius: 0.004, leafLength: 1.2, leafWidth: 0.08, clusterSize: 5, spreadRadius: 0.4, leafCount: 6, leafCurvature: 0.6, leafDroop: 0.2, primaryColor: new THREE.Color(0x6baa5c), secondaryColor: new THREE.Color(0x4a7a3a) },
  iris: { height: 0.7, stemRadius: 0.003, leafLength: 1.0, leafWidth: 0.04, clusterSize: 6, spreadRadius: 0.3, leafCount: 7, leafCurvature: 0.3, leafDroop: 0.4, primaryColor: new THREE.Color(0x7ab868), secondaryColor: new THREE.Color(0x5a8a48) },
  agave: { height: 0.5, stemRadius: 0.01, leafLength: 1.5, leafWidth: 0.15, clusterSize: 1, spreadRadius: 0.1, leafCount: 15, leafCurvature: 0.5, leafDroop: 0.6, primaryColor: new THREE.Color(0x5a8f5a), secondaryColor: new THREE.Color(0x3a6f3a) },
  yucca: { height: 1.2, stemRadius: 0.015, leafLength: 1.3, leafWidth: 0.08, clusterSize: 1, spreadRadius: 0.1, leafCount: 20, leafCurvature: 0.2, leafDroop: 0.7, primaryColor: new THREE.Color(0x6a9f6a), secondaryColor: new THREE.Color(0x4a7f4a) },
  bamboo: { height: 4.0, stemRadius: 0.03, leafLength: 0.6, leafWidth: 0.04, clusterSize: 10, spreadRadius: 0.8, leafCount: 12, leafCurvature: 0.3, leafDroop: 0.4, primaryColor: new THREE.Color(0x8acb76), secondaryColor: new THREE.Color(0x6a9b56) },
  cattail: { height: 1.8, stemRadius: 0.006, leafLength: 0.9, leafWidth: 0.025, clusterSize: 8, spreadRadius: 0.4, leafCount: 6, leafCurvature: 0.4, leafDroop: 0.5, primaryColor: new THREE.Color(0x7fb868), secondaryColor: new THREE.Color(0x5f8a48) },
  rush: { height: 1.0, stemRadius: 0.004, leafLength: 0.5, leafWidth: 0.015, clusterSize: 15, spreadRadius: 0.5, leafCount: 4, leafCurvature: 0.2, leafDroop: 0.3, primaryColor: new THREE.Color(0x85bc70), secondaryColor: new THREE.Color(0x659c50) },
};

const defaultConfig: MonocotConfig = {
  species: 'tall_grass', height: 0.8, stemRadius: 0.003, leafLength: 1.0, leafWidth: 0.02,
  clusterSize: 8, spreadRadius: 0.3, leafCount: 5, leafCurvature: 0.4, leafDroop: 0.3,
  leafTwist: 0.2, primaryColor: new THREE.Color(0x7cba6b), secondaryColor: new THREE.Color(0x5a8f4a),
  colorVariation: 0.15, windSensitivity: 0.6, seasonalTint: 0.0, segments: 8, useInstancing: true,
};

export class MonocotGenerator {
  private config: MonocotConfig;
  private seed: number;

  constructor(config: Partial<MonocotConfig> = {}, seed: number = 12345) {
    this.seed = seed;
    this.config = { ...defaultConfig, ...config };
    if (config.species && MonocotSpeciesPresets[config.species]) {
      this.config = { ...this.config, ...MonocotSpeciesPresets[config.species], ...config };
    }
  }

  generateCluster(position?: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    if (position) group.position.copy(position);
    const rng = new SeededRandom(this.seed);
    const { clusterSize, spreadRadius } = this.config;

    for (let i = 0; i < clusterSize; i++) {
      const angle = (i / clusterSize) * Math.PI * 2;
      const radius = rng.uniform(0, spreadRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const stem = this.generateStem(new THREE.Vector3(x, 0, z), rng);
      group.add(stem);
    }
    return group;
  }

  generateStem(offset: THREE.Vector3 = new THREE.Vector3(), rng?: SeededRandom): THREE.Group {
    if (!rng) rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    group.position.copy(offset);

    // Stem
    const stemGeometry = new THREE.CylinderGeometry(this.config.stemRadius * 0.8, this.config.stemRadius, this.config.height, 6, this.config.segments);
    const stemMaterial = new THREE.MeshStandardMaterial({ color: this.config.primaryColor, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = this.config.height / 2;
    stem.castShadow = true;
    group.add(stem);

    // Blade leaves
    for (let i = 0; i < this.config.leafCount; i++) {
      const leafAngle = (i / this.config.leafCount) * Math.PI * 2 + this.config.leafTwist * Math.PI;
      const leafHeight = 0.3 + (i / this.config.leafCount) * 0.5;
      const leaf = this.createLeaf(leafAngle, leafHeight, rng);
      group.add(leaf);
    }
    return group;
  }

  private createLeaf(angle: number, heightRatio: number, rng: SeededRandom): THREE.Mesh {
    const length = this.config.leafLength * this.config.height * 0.5;
    const width = this.config.leafWidth;
    const geometry = new THREE.PlaneGeometry(width, length, 1, this.config.segments);

    // Taper and curve the leaf
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + length / 2) / length;
      positions[i] *= (1.0 - t * 0.7); // Taper
      positions[i + 2] += Math.sin(t * Math.PI) * this.config.leafCurvature * length * 0.1;
      positions[i + 1] -= this.config.leafDroop * t * t * length * 0.3;
    }

    geometry.computeVertexNormals();

    const t = rng.uniform(0, this.config.colorVariation);
    const color = new THREE.Color().lerpColors(this.config.primaryColor, this.config.secondaryColor, t);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide });
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.set(0, this.config.height * heightRatio, 0);
    leaf.rotation.y = angle;
    leaf.castShadow = true;
    return leaf;
  }

  generateField(count: number, areaSize: number, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    const { clusterSize } = this.config;
    const totalStems = count * clusterSize;

    const stemGroup = this.generateStem(undefined, rng);
    const stemMesh = stemGroup.children[0] as THREE.Mesh;
    const geometry = stemMesh.geometry as THREE.BufferGeometry;
    const material = stemMesh.material as THREE.MeshStandardMaterial;

    const instancedMesh = new THREE.InstancedMesh(geometry, material, totalStems);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    let instanceIndex = 0;
    for (let i = 0; i < count; i++) {
      const x = (rng.next() - 0.5) * areaSize;
      const z = (rng.next() - 0.5) * areaSize;

      for (let j = 0; j < clusterSize; j++) {
        if (instanceIndex >= totalStems) break;
        const angle = (j / clusterSize) * Math.PI * 2;
        const radius = rng.uniform(0, this.config.spreadRadius);
        position.set(x + Math.cos(angle) * radius, 0, z + Math.sin(angle) * radius);
        const rotationY = rng.uniform(0, Math.PI * 2);
        const scaleVar = 0.8 + rng.uniform(0, 0.4);
        scale.set(scaleVar, scaleVar, scaleVar);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
        matrix.compose(position, quaternion, scale);
        instancedMesh.setMatrixAt(instanceIndex++, matrix);
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  setConfig(config: Partial<MonocotConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.species && MonocotSpeciesPresets[config.species]) {
      this.config = { ...this.config, ...MonocotSpeciesPresets[config.species] };
    }
  }

  getConfig(): MonocotConfig { return { ...this.config }; }
}

export default MonocotGenerator;
