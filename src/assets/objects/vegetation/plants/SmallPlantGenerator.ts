/**
 * SmallPlantGenerator - Simple small indoor and decorative plants
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface SmallPlantConfig {
  species: 'succulent' | 'cactus' | 'fern' | 'aloe' | 'jade' | 'spider_plant';
  height: number;
  potSize: number;
  leafCount: number;
  leafColor: THREE.Color;
  randomness: number;
  hasFlowers: boolean;
  flowerColor?: THREE.Color;
}

export class SmallPlantGenerator {
  private readonly defaultConfig: SmallPlantConfig = {
    species: 'succulent', height: 0.15, potSize: 0.1, leafCount: 8,
    leafColor: new THREE.Color(0x2d5a27), randomness: 0.2, hasFlowers: false,
  };

  public generate(config: Partial<SmallPlantConfig> = {}, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const finalConfig = { ...this.defaultConfig, ...config };
    const group = new THREE.Group();

    if (finalConfig.potSize > 0) group.add(this.createPot(finalConfig));

    switch (finalConfig.species) {
      case 'succulent': this.createSucculent(group, finalConfig, rng); break;
      case 'cactus': this.createCactus(group, finalConfig, rng); break;
      case 'fern': this.createSmallFern(group, finalConfig, rng); break;
      case 'aloe': this.createAloe(group, finalConfig, rng); break;
      case 'jade': this.createJade(group, finalConfig, rng); break;
      case 'spider_plant': this.createSpiderPlant(group, finalConfig, rng); break;
    }
    return group;
  }

  public generateCluster(config: Partial<SmallPlantConfig> & { count: number; spread: number }, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const group = new THREE.Group();
    const { count, spread, ...plantConfig } = config;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = rng.uniform(0, spread);
      const plant = this.generate(plantConfig, seed + i);
      plant.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      plant.rotation.y = rng.uniform(0, Math.PI * 2);
      group.add(plant);
    }
    return group;
  }

  private createPot(config: SmallPlantConfig): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(config.potSize * 0.8, config.potSize, config.potSize * 0.7, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, metalness: 0.1 });
    const pot = new THREE.Mesh(geometry, material);
    pot.position.y = config.potSize * 0.35;
    return pot;
  }

  private createSucculent(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const leafMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    const layers = 3;
    let currentHeight = config.potSize * 0.7;
    for (let layer = 0; layer < layers; layer++) {
      const leavesInLayer = config.leafCount - layer * 2;
      const radius = (layers - layer) * 0.03;
      const leafScale = 1 - layer * 0.2;
      for (let i = 0; i < leavesInLayer; i++) {
        const angle = (i / leavesInLayer) * Math.PI * 2 + (layer * Math.PI / leavesInLayer);
        const leafGeometry = new THREE.SphereGeometry(0.02 * leafScale, 8, 8);
        leafGeometry.scale(1, 0.5, 0.3);
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        leaf.position.set(Math.cos(angle) * radius + rng.uniform(-0.002, 0.002), currentHeight, Math.sin(angle) * radius + rng.uniform(-0.002, 0.002));
        leaf.rotation.x = Math.PI / 4;
        leaf.rotation.y = -angle;
        group.add(leaf);
      }
      currentHeight += 0.015;
    }
    if (config.hasFlowers && config.flowerColor) {
      const flowerMaterial = new THREE.MeshStandardMaterial({ color: config.flowerColor, emissive: config.flowerColor, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.0 });
      const flowerGeometry = new THREE.SphereGeometry(0.015, 8, 8);
      const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
      flower.position.y = currentHeight;
      group.add(flower);
    }
  }

  private createCactus(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const cactusMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.7, metalness: 0.0 });
    const stemHeight = config.height;
    const stemRadius = 0.03;
    const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius * 0.9, stemHeight, 8);
    const stem = new THREE.Mesh(stemGeometry, cactusMaterial);
    stem.position.y = config.potSize * 0.7 + stemHeight / 2;
    group.add(stem);

    // Ribs
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ribGeometry = new THREE.BoxGeometry(0.005, stemHeight * 0.9, 0.02);
      const rib = new THREE.Mesh(ribGeometry, cactusMaterial);
      rib.position.set(Math.cos(angle) * (stemRadius + 0.005), stem.position.y, Math.sin(angle) * (stemRadius + 0.005));
      rib.rotation.y = -angle;
      group.add(rib);
    }

    if (rng.boolean(config.randomness)) {
      const armCount = rng.nextInt(1, 3);
      for (let i = 0; i < armCount; i++) {
        const armHeight = stemHeight * 0.4;
        const armGeometry = new THREE.CylinderGeometry(0.02, 0.015, armHeight, 8);
        const arm = new THREE.Mesh(armGeometry, cactusMaterial);
        const attachHeight = config.potSize * 0.7 + stemHeight * rng.uniform(0.4, 0.7);
        const armAngle = rng.uniform(0, Math.PI * 2);
        arm.position.set(Math.cos(armAngle) * (stemRadius + 0.01), attachHeight, Math.sin(armAngle) * (stemRadius + 0.01));
        arm.rotation.x = Math.PI / 3;
        arm.rotation.z = armAngle + Math.PI / 2;
        group.add(arm);
      }
    }
  }

  private createSmallFern(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const frondMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
    for (let i = 0; i < config.leafCount; i++) {
      const angle = (i / config.leafCount) * Math.PI * 2;
      const segments = 5;
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const segmentLength = (0.08 + rng.uniform(0, 0.04)) * (1 - t * 0.5);
        const segmentAngle = angle + Math.sin(t * Math.PI) * 0.3;
        const x = Math.cos(segmentAngle) * segmentLength * t * 1.2;
        const z = Math.sin(segmentAngle) * segmentLength * t * 1.2;
        const y = config.potSize * 0.7 + t * 0.06;
        const leafletGeometry = new THREE.BoxGeometry(0.003, 0.015, 0.02 * (1 - t));
        const leaflet = new THREE.Mesh(leafletGeometry, frondMaterial);
        leaflet.position.set(x, y, z);
        leaflet.rotation.y = -segmentAngle;
        leaflet.rotation.x = -t * 0.5;
        group.add(leaflet);
      }
    }
  }

  private createAloe(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const leafMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    for (let i = 0; i < config.leafCount; i++) {
      const angle = (i / config.leafCount) * Math.PI * 2;
      const leafLength = 0.06 + rng.uniform(0, 0.03);
      const leafWidth = 0.015 + rng.uniform(0, 0.005);
      const leafGeometry = new THREE.ConeGeometry(leafWidth, leafLength, 8);
      leafGeometry.rotateX(Math.PI / 2);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.set(Math.cos(angle) * 0.02, config.potSize * 0.7, Math.sin(angle) * 0.02);
      leaf.rotation.y = angle;
      leaf.rotation.z = Math.PI / 4;
      group.add(leaf);
    }
  }

  private createJade(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const leafMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
    const branches = 3;
    for (let b = 0; b < branches; b++) {
      const branchAngle = (b / branches) * Math.PI * 2;
      const branchHeight = 0.04 + rng.uniform(0, 0.03);
      const stemGeometry = new THREE.CylinderGeometry(0.005, 0.004, branchHeight, 6);
      const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.0 });
      const stem = new THREE.Mesh(stemGeometry, stemMaterial);
      stem.position.y = config.potSize * 0.7 + branchHeight / 2;
      group.add(stem);
      for (let i = 0; i < 3; i++) {
        const leafY = config.potSize * 0.7 + branchHeight * (0.3 + i * 0.25);
        const leafLength = 0.025 - i * 0.005;
        for (const side of [-1, 1]) {
          const leafGeometry = new THREE.SphereGeometry(leafLength * 0.6, 8, 8);
          leafGeometry.scale(1, 0.4, 0.6);
          const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
          leaf.position.set(side * 0.015, leafY, 0);
          leaf.rotation.z = side * Math.PI / 6;
          leaf.rotation.y = branchAngle;
          group.add(leaf);
        }
      }
    }
  }

  private createSpiderPlant(group: THREE.Group, config: SmallPlantConfig, rng: SeededRandom): void {
    const leafMaterial = new THREE.MeshStandardMaterial({ color: config.leafColor, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide });
    const leafCount = config.leafCount + 4;
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leafLength = 0.1 + rng.uniform(0, 0.05);
      const segments = 8;
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const segmentWidth = 0.008 * (1 - t * 0.5);
        const segmentLength = leafLength / segments;
        const x = Math.cos(angle) * segmentLength * t * 1.2;
        const z = Math.sin(angle) * segmentLength * t * 1.2;
        const y = config.potSize * 0.7 + t * 0.08 - t * t * 0.04;
        const segmentGeometry = new THREE.BoxGeometry(segmentLength, 0.002, segmentWidth);
        const segment = new THREE.Mesh(segmentGeometry, leafMaterial);
        segment.position.set(x, y, z);
        segment.rotation.y = -angle;
        segment.rotation.x = -t * 0.8;
        group.add(segment);
      }
    }
  }
}
