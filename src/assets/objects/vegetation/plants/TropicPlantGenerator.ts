/**
 * TropicPlantGenerator - Large-leafed tropical plants
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface TropicPlantConfig {
  species: 'monstera' | 'bird_of_paradise' | 'banana' | 'philodendron' | 'calathea' | 'anthurium' | 'palm_small';
  height: number;
  stemRadius: number;
  leafSize: number;
  leafCount: number;
  leafSplitDepth: number;
  leafFenestration: number;
  leafWaviness: number;
  leafDroop: number;
  primaryColor: THREE.Color;
  secondaryColor: THREE.Color;
  variegation: number;
  glossiness: number;
  spiralAngle: number;
  internodeLength: number;
  humidity: number;
  lightExposure: number;
}

export const TropicSpeciesPresets: Record<string, Partial<TropicPlantConfig>> = {
  monstera: { height: 2.0, stemRadius: 0.04, leafSize: 1.2, leafCount: 12, leafSplitDepth: 0.7, leafFenestration: 0.6, leafWaviness: 0.3, leafDroop: 0.4, primaryColor: new THREE.Color(0x2d5a27), secondaryColor: new THREE.Color(0x1a3d16), variegation: 0.0, glossiness: 0.6, spiralAngle: Math.PI / 3, internodeLength: 0.15 },
  bird_of_paradise: { height: 2.5, stemRadius: 0.03, leafSize: 1.5, leafCount: 10, leafSplitDepth: 0.8, leafFenestration: 0.0, leafWaviness: 0.2, leafDroop: 0.5, primaryColor: new THREE.Color(0x3a6b35), secondaryColor: new THREE.Color(0x254d20), variegation: 0.0, glossiness: 0.5, spiralAngle: Math.PI / 4, internodeLength: 0.12 },
  banana: { height: 5.0, stemRadius: 0.15, leafSize: 2.0, leafCount: 8, leafSplitDepth: 0.3, leafFenestration: 0.0, leafWaviness: 0.4, leafDroop: 0.6, primaryColor: new THREE.Color(0x4a7a40), secondaryColor: new THREE.Color(0x305a2a), variegation: 0.0, glossiness: 0.4, spiralAngle: Math.PI / 2, internodeLength: 0.25 },
  philodendron: { height: 1.5, stemRadius: 0.02, leafSize: 0.8, leafCount: 15, leafSplitDepth: 0.0, leafFenestration: 0.0, leafWaviness: 0.2, leafDroop: 0.3, primaryColor: new THREE.Color(0x356030), secondaryColor: new THREE.Color(0x20401a), variegation: 0.15, glossiness: 0.7, spiralAngle: Math.PI / 3, internodeLength: 0.1 },
  calathea: { height: 0.8, stemRadius: 0.015, leafSize: 0.6, leafCount: 12, leafSplitDepth: 0.0, leafFenestration: 0.0, leafWaviness: 0.5, leafDroop: 0.2, primaryColor: new THREE.Color(0x406540), secondaryColor: new THREE.Color(0x2a452a), variegation: 0.4, glossiness: 0.5, spiralAngle: Math.PI / 4, internodeLength: 0.08 },
  anthurium: { height: 1.0, stemRadius: 0.02, leafSize: 0.7, leafCount: 10, leafSplitDepth: 0.0, leafFenestration: 0.0, leafWaviness: 0.3, leafDroop: 0.3, primaryColor: new THREE.Color(0x355535), secondaryColor: new THREE.Color(0x254025), variegation: 0.0, glossiness: 0.8, spiralAngle: Math.PI / 3, internodeLength: 0.1 },
  palm_small: { height: 3.0, stemRadius: 0.08, leafSize: 1.8, leafCount: 12, leafSplitDepth: 0.9, leafFenestration: 0.0, leafWaviness: 0.2, leafDroop: 0.7, primaryColor: new THREE.Color(0x3d6b38), secondaryColor: new THREE.Color(0x285023), variegation: 0.0, glossiness: 0.5, spiralAngle: Math.PI / 6, internodeLength: 0.08 },
};

const defaultConfig: TropicPlantConfig = {
  species: 'monstera', height: 2.0, stemRadius: 0.04, leafSize: 1.2, leafCount: 12,
  leafSplitDepth: 0.7, leafFenestration: 0.6, leafWaviness: 0.3, leafDroop: 0.4,
  primaryColor: new THREE.Color(0x2d5a27), secondaryColor: new THREE.Color(0x1a3d16),
  variegation: 0.0, glossiness: 0.6, spiralAngle: Math.PI / 3, internodeLength: 0.15,
  humidity: 0.8, lightExposure: 0.6,
};

export class TropicPlantGenerator {
  private config: TropicPlantConfig;
  private seed: number;

  constructor(config: Partial<TropicPlantConfig> = {}, seed: number = 12345) {
    this.seed = seed;
    this.config = { ...defaultConfig, ...config };
    if (config.species && TropicSpeciesPresets[config.species]) {
      this.config = { ...this.config, ...TropicSpeciesPresets[config.species], ...config };
    }
  }

  generate(position?: THREE.Vector3, seed?: number): THREE.Group {
    const rng = new SeededRandom(seed ?? this.seed);
    const group = new THREE.Group();
    if (position) group.position.copy(position);

    const { height, leafCount, spiralAngle } = this.config;

    // Main stem
    const stem = this.generateStem(rng);
    group.add(stem);

    // Large leaves in spiral pattern
    for (let i = 0; i < leafCount; i++) {
      const t = i / leafCount;
      const y = t * height * 0.8;
      const angle = i * spiralAngle;
      const leaf = this.generateLeaf(rng);
      leaf.position.y = y;
      leaf.rotation.y = angle;
      leaf.rotation.x = -this.config.leafDroop * t * 0.5;
      group.add(leaf);
    }

    // Aerial roots for certain species
    if (this.config.species === 'monstera' || this.config.species === 'philodendron') {
      group.add(this.generateAerialRoots(rng));
    }

    return group;
  }

  private generateStem(rng: SeededRandom): THREE.Mesh {
    const { height, stemRadius } = this.config;
    const geometry = new THREE.CylinderGeometry(stemRadius * 0.8, stemRadius, height * 0.8, 8, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9, metalness: 0.0 });
    const stem = new THREE.Mesh(geometry, material);
    stem.position.y = height * 0.4;
    stem.castShadow = true;
    return stem;
  }

  private generateLeaf(rng: SeededRandom): THREE.Mesh {
    const { leafSize, primaryColor, secondaryColor, variegation, glossiness } = this.config;

    // Large tropical leaf shape
    const width = leafSize * 0.8;
    const length = leafSize * 1.2;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(width * 0.5, length * 0.3, width * 0.6, length * 0.7, 0, length);
    shape.bezierCurveTo(-width * 0.6, length * 0.7, -width * 0.5, length * 0.3, 0, 0);

    const geometry = new THREE.ShapeGeometry(shape, 8);

    // Add droop and waviness
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = y / length;
      // Droop
      positions[i + 2] -= t * t * this.config.leafDroop * length * 0.3;
      // Waviness
      positions[i + 2] += Math.sin(positions[i] * 10 + rng.uniform(0, 1)) * this.config.leafWaviness * 0.05;
    }
    geometry.computeVertexNormals();

    const t = rng.uniform(0, variegation);
    const color = new THREE.Color().lerpColors(primaryColor, secondaryColor, t);
    const material = new THREE.MeshStandardMaterial({
      color, roughness: 1.0 - glossiness * 0.8, metalness: 0.0, side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }

  private generateAerialRoots(rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const rootCount = rng.nextInt(3, 8);
    for (let i = 0; i < rootCount; i++) {
      const y = rng.uniform(0, this.config.height * 0.6);
      const angle = rng.uniform(0, Math.PI * 2);
      const length = rng.uniform(0.2, 0.5);
      const rootGeometry = new THREE.CylinderGeometry(0.005, 0.01, length, 6);
      const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.9, metalness: 0.0 });
      const root = new THREE.Mesh(rootGeometry, rootMaterial);
      root.position.set(Math.cos(angle) * 0.05, y, Math.sin(angle) * 0.05);
      root.rotation.x = Math.PI / 3;
      root.rotation.z = angle;
      group.add(root);
    }
    return group;
  }

  setConfig(config: Partial<TropicPlantConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.species && TropicSpeciesPresets[config.species]) {
      this.config = { ...this.config, ...TropicSpeciesPresets[config.species] };
    }
  }

  getConfig(): TropicPlantConfig { return { ...this.config }; }
}

export default TropicPlantGenerator;
