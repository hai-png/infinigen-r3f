import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Configuration for small plant generation
 */
export interface SmallPlantConfig {
  /** Plant species type */
  species: 'succulent' | 'cactus' | 'fern' | 'aloe' | 'jade' | 'spider_plant';
  /** Plant height in meters */
  height: number;
  /** Pot size (0 = no pot) */
  potSize: number;
  /** Number of leaves/fronds */
  leafCount: number;
  /** Leaf color variation */
  leafColor: THREE.Color;
  /** Add randomness to leaf positions */
  randomness: number;
  /** Include flowers */
  hasFlowers: boolean;
  /** Flower color */
  flowerColor?: THREE.Color;
}

/**
 * Generator for small indoor and decorative plants
 * Creates succulents, cacti, aloe, jade plants, spider plants, and small ferns
 */
export class SmallPlantGenerator {
  private readonly defaultConfig: SmallPlantConfig = {
    species: 'succulent',
    height: 0.15,
    potSize: 0.1,
    leafCount: 8,
    leafColor: new THREE.Color(0x2d5a27),
    randomness: 0.2,
    hasFlowers: false,
  };

  /**
   * Generate a small plant mesh group
   */
  public generate(config: Partial<SmallPlantConfig> = {}): THREE.Group {
    const finalConfig = { ...this.defaultConfig, ...config };
    const group = new THREE.Group();

    // Generate pot if requested
    if (finalConfig.potSize > 0) {
      const pot = this.createPot(finalConfig.potSize);
      group.add(pot);
    }

    // Generate plant based on species
    switch (finalConfig.species) {
      case 'succulent':
        this.createSucculent(group, finalConfig);
        break;
      case 'cactus':
        this.createCactus(group, finalConfig);
        break;
      case 'fern':
        this.createSmallFern(group, finalConfig);
        break;
      case 'aloe':
        this.createAloe(group, finalConfig);
        break;
      case 'jade':
        this.createJade(group, finalConfig);
        break;
      case 'spider_plant':
        this.createSpiderPlant(group, finalConfig);
        break;
    }

    return group;
  }

  /**
   * Create multiple small plants for clustering
   */
  public generateCluster(
    config: Partial<SmallPlantConfig> & { count: number; spread: number }
  ): THREE.Group {
    const group = new THREE.Group();
    const { count, spread, ...plantConfig } = config;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = Math.random() * spread;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const rotation = Math.random() * Math.PI * 2;

      const plant = this.generate(plantConfig);
      plant.position.set(x, 0, z);
      plant.rotation.y = rotation;
      group.add(plant);
    }

    return group;
  }

  private createPot(size: number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(size * 0.8, size, size * 0.7, 8);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8b4513),
      roughness: 0.8,
      metalness: 0.1,
    });
    const pot = new THREE.Mesh(geometry, material);
    pot.position.y = size * 0.35;
    return pot;
  }

  private createSucculent(group: THREE.Group, config: SmallPlantConfig): void {
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Rosette pattern
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
        
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        leaf.position.set(x, currentHeight, z);
        leaf.rotation.x = Math.PI / 4;
        leaf.rotation.y = -angle;
        
        // Add randomness
        leaf.position.x += (Math.random() - 0.5) * config.randomness * 0.02;
        leaf.position.z += (Math.random() - 0.5) * config.randomness * 0.02;
        
        group.add(leaf);
      }

      currentHeight += 0.015;
    }

    // Add flowers if requested
    if (config.hasFlowers && config.flowerColor) {
      this.addSucculentFlowers(group, config);
    }
  }

  private addSucculentFlowers(group: THREE.Group, config: SmallPlantConfig): void {
    const flowerMaterial = new THREE.MeshStandardMaterial({
      color: config.flowerColor!,
      emissive: config.flowerColor!,
      emissiveIntensity: 0.2,
    });

    const stemHeight = config.height * 1.5;
    const flowerPositions = [
      { x: 0, y: stemHeight, z: 0 },
    ];

    flowerPositions.forEach(pos => {
      const flowerGeometry = new THREE.SphereGeometry(0.015, 8, 8);
      const flower = new THREE.Mesh(flowerGeometry, flowerMaterial);
      flower.position.set(pos.x, pos.y, pos.z);
      group.add(flower);
    });
  }

  private createCactus(group: THREE.Group, config: SmallPlantConfig): void {
    const cactusMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.7,
      metalness: 0.0,
    });

    // Main stem
    const stemHeight = config.height;
    const stemRadius = 0.03;
    const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius * 0.9, stemHeight, 8);
    const stem = new THREE.Mesh(stemGeometry, cactusMaterial);
    stem.position.y = config.potSize * 0.7 + stemHeight / 2;
    group.add(stem);

    // Add ribs
    const ribCount = 8;
    for (let i = 0; i < ribCount; i++) {
      const angle = (i / ribCount) * Math.PI * 2;
      const ribGeometry = new THREE.BoxGeometry(0.005, stemHeight * 0.9, 0.02);
      const rib = new THREE.Mesh(ribGeometry, cactusMaterial);
      
      const x = Math.cos(angle) * (stemRadius + 0.005);
      const z = Math.sin(angle) * (stemRadius + 0.005);
      
      rib.position.set(x, stem.position.y, z);
      rib.rotation.y = -angle;
      group.add(rib);
    }

    // Optional arms
    if (config.randomness > 0.3) {
      this.addCactusArms(group, stemHeight, stemRadius, cactusMaterial);
    }
  }

  private addCactusArms(
    group: THREE.Group,
    stemHeight: number,
    stemRadius: number,
    material: THREE.Material
  ): void {
    const armCount = Math.floor(Math.random() * 2) + 1;
    
    for (let i = 0; i < armCount; i++) {
      const armHeight = stemHeight * 0.4;
      const armGeometry = new THREE.CylinderGeometry(0.02, 0.015, armHeight, 8);
      const arm = new THREE.Mesh(armGeometry, material);
      
      const attachHeight = config.potSize * 0.7 + stemHeight * (0.4 + i * 0.2);
      const angle = Math.random() * Math.PI * 2;
      
      const x = Math.cos(angle) * (stemRadius + 0.01);
      const z = Math.sin(angle) * (stemRadius + 0.01);
      
      arm.position.set(x, attachHeight, z);
      arm.rotation.x = Math.PI / 3;
      arm.rotation.z = angle + Math.PI / 2;
      
      group.add(arm);
    }
  }

  private createSmallFern(group: THREE.Group, config: SmallPlantConfig): void {
    const frondMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const frondCount = config.leafCount;
    const baseHeight = config.potSize * 0.7;

    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const length = 0.08 + Math.random() * 0.04;
      
      // Create curved frond using multiple segments
      const segments = 5;
      let prevPosition = new THREE.Vector3(0, baseHeight, 0);
      
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const segmentLength = length * (1 - t * 0.5);
        const segmentAngle = angle + Math.sin(t * Math.PI) * 0.3;
        
        const x = Math.cos(segmentAngle) * segmentLength * t;
        const z = Math.sin(segmentAngle) * segmentLength * t;
        const y = baseHeight + t * 0.06;
        
        const leafletGeometry = new THREE.BoxGeometry(0.003, 0.015, 0.02 * (1 - t));
        const leaflet = new THREE.Mesh(leafletGeometry, frondMaterial);
        leaflet.position.set(x, y, z);
        leaflet.rotation.y = -segmentAngle;
        leaflet.rotation.x = -t * 0.5;
        
        group.add(leaflet);
      }
    }
  }

  private createAloe(group: THREE.Group, config: SmallPlantConfig): void {
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const leafCount = config.leafCount;
    const baseHeight = config.potSize * 0.7;

    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leafLength = 0.06 + Math.random() * 0.03;
      const leafWidth = 0.015 + Math.random() * 0.005;
      
      // Aloe leaf shape (thick at base, tapering)
      const leafGeometry = new THREE.ConeGeometry(leafWidth, leafLength, 8);
      leafGeometry.rotateX(Math.PI / 2);
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      
      const x = Math.cos(angle) * 0.02;
      const z = Math.sin(angle) * 0.02;
      
      leaf.position.set(x, baseHeight, z);
      leaf.rotation.y = angle;
      leaf.rotation.z = Math.PI / 4;
      
      // Add serrated edges
      if (Math.random() > 0.5) {
        this.addAloeTeeth(leaf, leafLength, leafMaterial);
      }
      
      group.add(leaf);
    }
  }

  private addAloeTeeth(leaf: THREE.Mesh, length: number, material: THREE.Material): void {
    const toothCount = 5;
    for (let i = 0; i < toothCount; i++) {
      const toothGeometry = new THREE.ConeGeometry(0.002, 0.005, 4);
      const tooth = new THREE.Mesh(toothGeometry, material);
      tooth.position.z = length * (i / toothCount) - length / 2;
      tooth.position.y = 0.008;
      leaf.add(tooth);
    }
  }

  private createJade(group: THREE.Group, config: SmallPlantConfig): void {
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Jade plant has thick, oval leaves on branching stems
    const branches = 3;
    const baseHeight = config.potSize * 0.7;

    for (let b = 0; b < branches; b++) {
      const branchAngle = (b / branches) * Math.PI * 2;
      const branchHeight = 0.04 + Math.random() * 0.03;
      
      // Stem
      const stemGeometry = new THREE.CylinderGeometry(0.005, 0.004, branchHeight, 6);
      const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
      const stem = new THREE.Mesh(stemGeometry, stemMaterial);
      stem.position.y = baseHeight + branchHeight / 2;
      group.add(stem);

      // Leaves at top
      const leafPairs = 3;
      for (let i = 0; i < leafPairs; i++) {
        const leafY = baseHeight + branchHeight * (0.3 + i * 0.25);
        const leafLength = 0.025 - i * 0.005;
        
        for (let side = -1; side <= 1; side += 2) {
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

  private createSpiderPlant(group: THREE.Group, config: SmallPlantConfig): void {
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: config.leafColor,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const leafCount = config.leafCount + 4;
    const baseHeight = config.potSize * 0.7;

    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leafLength = 0.1 + Math.random() * 0.05;
      const leafWidth = 0.008;
      
      // Long, thin arching leaves
      const segments = 8;
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const segmentWidth = leafWidth * (1 - t * 0.5);
        const segmentLength = leafLength / segments;
        
        const x = Math.cos(angle) * segmentLength * t * 1.2;
        const z = Math.sin(angle) * segmentLength * t * 1.2;
        const y = baseHeight + t * 0.08 - t * t * 0.04; // Arch
        
        const segmentGeometry = new THREE.BoxGeometry(segmentLength, 0.002, segmentWidth);
        const segment = new THREE.Mesh(segmentGeometry, leafMaterial);
        segment.position.set(x, y, z);
        segment.rotation.y = -angle;
        segment.rotation.x = -t * 0.8;
        
        group.add(segment);
      }
    }

    // Add baby plantlets on runners
    if (config.randomness > 0.5) {
      this.addSpiderPlantlets(group, config);
    }
  }

  private addSpiderPlantlets(group: THREE.Group, config: SmallPlantConfig): void {
    const plantletCount = 2;
    const runnerLength = 0.15;

    for (let i = 0; i < plantletCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const plantletGroup = new THREE.Group();
      
      // Tiny leaves
      for (let l = 0; l < 4; l++) {
        const leafGeometry = new THREE.BoxGeometry(0.03, 0.002, 0.005);
        const leaf = new THREE.Mesh(leafGeometry, new THREE.MeshStandardMaterial({ color: config.leafColor }));
        leaf.rotation.y = (l / 4) * Math.PI * 2;
        plantletGroup.add(leaf);
      }
      
      plantletGroup.position.set(
        Math.cos(angle) * runnerLength,
        0.02,
        Math.sin(angle) * runnerLength
      );
      
      group.add(plantletGroup);
    }
  }
}
