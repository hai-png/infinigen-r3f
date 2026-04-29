import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';

/**
 * Enhanced mushroom species for diverse fungal varieties
 */
export enum MushroomSpecies {
  // Edible
  CHANTERELLE = 'chanterelle',
  PORCINI = 'porcini',
  MOREL = 'morel',
  HEN_OF_WOODS = 'hen_of_woods',
  
  // Poisonous
  AMANITA = 'amanita',
  DEATH_CAP = 'death_cap',
  FLY_AGARIC = 'fly_agaric',
  
  // Common
  BUTTON = 'button',
  OYSTER = 'oyster',
  SHITAKE = 'shiitake',
  PUFFBALL = 'puffball',
  
  // Fantasy
  BIOLUMINESCENT = 'bioluminescent',
  GHOST_FUNGUS = 'ghost_fungus',
  CRYSTAL_MUSHROOM = 'crystal_mushroom'
}

/**
 * Growth stage for decay progression
 */
export enum GrowthStage {
  YOUNG = 'young',      // Just emerged, small
  MATURE = 'mature',    // Full size, spore-ready
  AGING = 'aging',      // Starting to decay
  DECAYING = 'decaying' // Breaking down, dark colors
}

export interface MushroomVarietyConfig {
  species: MushroomSpecies;
  growthStage: GrowthStage;
  density: number;           // mushrooms per square meter
  area: THREE.Vector2;       // coverage area
  clusterGrowth?: boolean;   // grow in clusters
  bioluminescence?: number;  // 0-1 glow intensity (fantasy)
  sporeCloud?: boolean;      // visible spores (mature only)
}

/**
 * Enhanced mushroom generator with multiple species and realistic features
 */
export class MushroomVarieties {
  private static readonly SPECIES_DATA: Record<MushroomSpecies, {
    capColor: THREE.Color;
    stemColor: THREE.Color;
    capShape: 'convex' | 'flat' | 'concave' | 'conical' | 'irregular';
    hasSpots: boolean;
    spotColor?: THREE.Color;
    glowColor?: THREE.Color;
  }> = {
    [MushroomSpecies.CHANTERELLE]: {
      capColor: new THREE.Color(0xffd700),
      stemColor: new THREE.Color(0xffe55c),
      capShape: 'concave',
      hasSpots: false
    },
    [MushroomSpecies.PORCINI]: {
      capColor: new THREE.Color(0x8b6f47),
      stemColor: new THREE.Color(0xd2b48c),
      capShape: 'convex',
      hasSpots: false
    },
    [MushroomSpecies.MOREL]: {
      capColor: new THREE.Color(0x6b5344),
      stemColor: new THREE.Color(0xd2b48c),
      capShape: 'conical',
      hasSpots: false
    },
    [MushroomSpecies.HEN_OF_WOODS]: {
      capColor: new THREE.Color(0x8b7355),
      stemColor: new THREE.Color(0xd2b48c),
      capShape: 'irregular',
      hasSpots: false
    },
    [MushroomSpecies.AMANITA]: {
      capColor: new THREE.Color(0xff4500),
      stemColor: new THREE.Color(0xf5f5dc),
      capShape: 'convex',
      hasSpots: true,
      spotColor: new THREE.Color(0xffffff)
    },
    [MushroomSpecies.DEATH_CAP]: {
      capColor: new THREE.Color(0x6b8e23),
      stemColor: new THREE.Color(0xf5f5dc),
      capShape: 'convex',
      hasSpots: false
    },
    [MushroomSpecies.FLY_AGARIC]: {
      capColor: new THREE.Color(0xff0000),
      stemColor: new THREE.Color(0xf5f5dc),
      capShape: 'convex',
      hasSpots: true,
      spotColor: new THREE.Color(0xffffff)
    },
    [MushroomSpecies.BUTTON]: {
      capColor: new THREE.Color(0xf5f5dc),
      stemColor: new THREE.Color(0xf5f5dc),
      capShape: 'convex',
      hasSpots: false
    },
    [MushroomSpecies.OYSTER]: {
      capColor: new THREE.Color(0x708090),
      stemColor: new THREE.Color(0xf5f5dc),
      capShape: 'flat',
      hasSpots: false
    },
    [MushroomSpecies.SHITAKE]: {
      capColor: new THREE.Color(0x8b4513),
      stemColor: new THREE.Color(0xd2b48c),
      capShape: 'convex',
      hasSpots: false
    },
    [MushroomSpecies.PUFFBALL]: {
      capColor: new THREE.Color(0xffffff),
      stemColor: new THREE.Color(0xffffff),
      capShape: 'spherical',
      hasSpots: false
    } as any,
    [MushroomSpecies.BIOLUMINESCENT]: {
      capColor: new THREE.Color(0x00ff00),
      stemColor: new THREE.Color(0x00cc00),
      capShape: 'conical',
      hasSpots: false,
      glowColor: new THREE.Color(0x00ff00)
    },
    [MushroomSpecies.GHOST_FUNGUS]: {
      capColor: new THREE.Color(0xffffff),
      stemColor: new THREE.Color(0xffffff),
      capShape: 'irregular',
      hasSpots: false,
      glowColor: new THREE.Color(0x00ffff)
    },
    [MushroomSpecies.CRYSTAL_MUSHROOM]: {
      capColor: new THREE.Color(0xff69b4),
      stemColor: new THREE.Color(0xffb6c1),
      capShape: 'conical',
      hasSpots: false,
      glowColor: new THREE.Color(0xff69b4)
    }
  };

  /**
   * Generate single mushroom with detailed geometry
   */
  static generateMushroom(config: MushroomVarietyConfig): THREE.Group {
    const group = new THREE.Group();
    const speciesData = this.SPECIES_DATA[config.species];
    
    // Determine size based on growth stage
    const sizeMultiplier = this.getGrowthStageMultiplier(config.growthStage);
    
    // Create stem
    const stem = this.createStem(config.species, sizeMultiplier);
    group.add(stem);
    
    // Create cap
    const cap = this.createCap(config.species, config.growthStage, sizeMultiplier);
    cap.position.y = stem.geometry.parameters.height * sizeMultiplier;
    group.add(cap);
    
    // Add spots if species has them
    if (speciesData.hasSpots && speciesData.spotColor) {
      const spots = this.createCapSpots(cap, speciesData.spotColor);
      group.add(spots);
    }
    
    // Add bioluminescence glow for fantasy species
    if (config.bioluminescence && speciesData.glowColor) {
      this.addBioluminescence(group, speciesData.glowColor, config.bioluminescence);
    }
    
    // Add spore cloud for mature mushrooms
    if (config.sporeCloud && config.growthStage === GrowthStage.MATURE) {
      const spores = this.createSporeCloud(config.species);
      spores.position.y = cap.position.y + 0.05;
      group.add(spores);
    }
    
    // Apply decay coloring if aging/decaying
    if (config.growthStage === GrowthStage.AGING || config.growthStage === GrowthStage.DECAYING) {
      this.applyDecayColors(group, config.growthStage);
    }
    
    return group;
  }

  /**
   * Create mushroom stem
   */
  private static createStem(species: MushroomSpecies, sizeMultiplier: number): THREE.Mesh {
    const height = 0.15 * sizeMultiplier;
    const topRadius = 0.025 * sizeMultiplier;
    const bottomRadius = 0.03 * sizeMultiplier;
    
    const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 8);
    
    // Add texture detail using noise
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const noise = NoiseUtils.perlin2D(0, y * 20) * 0.005;
      positions[i] += noise;
      positions[i + 2] += NoiseUtils.perlin2D(y * 20, 0) * 0.005;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
      color: this.SPECIES_DATA[species].stemColor,
      roughness: 0.7
    });
    
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create mushroom cap based on species
   */
  private static createCap(
    species: MushroomSpecies,
    stage: GrowthStage,
    sizeMultiplier: number
  ): THREE.Mesh {
    const data = this.SPECIES_DATA[species];
    const capSize = 0.08 * sizeMultiplier;
    
    let geometry: THREE.BufferGeometry;
    
    switch (data.capShape) {
      case 'convex':
        geometry = new THREE.SphereGeometry(capSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2.5);
        break;
      case 'flat':
        geometry = new THREE.CylinderGeometry(capSize, capSize * 0.9, 0.02, 16);
        break;
      case 'concave':
        geometry = new THREE.SphereGeometry(capSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 3);
        break;
      case 'conical':
        geometry = new THREE.ConeGeometry(capSize, capSize * 1.5, 16);
        break;
      case 'irregular':
        geometry = this.createIrregularCap(capSize);
        break;
      default:
        geometry = new THREE.SphereGeometry(capSize, 16, 16);
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: data.capColor,
      roughness: 0.6,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Rotate conical caps to point upward
    if (data.capShape === 'conical') {
      mesh.rotation.x = Math.PI;
    }
    
    return mesh;
  }

  /**
   * Create irregular cap shape for species like hen-of-woods
   */
  private static createIrregularCap(baseSize: number): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(baseSize, 16, 16);
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Add wavy irregularity
      const noise = NoiseUtils.perlin2D(x * 5 + z * 5, y * 5) * 0.02;
      positions[i] *= 1 + noise;
      positions[i + 1] *= 1 + noise;
      positions[i + 2] *= 1 + noise;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create white spots on caps (e.g., fly agaric)
   */
  private static createCapSpots(cap: THREE.Mesh, spotColor: THREE.Color): THREE.Group {
    const group = new THREE.Group();
    const spotCount = 8 + Math.floor(Math.random() * 8);
    
    for (let i = 0; i < spotCount; i++) {
      const spotGeometry = new THREE.SphereGeometry(0.01, 8, 8);
      const spotMaterial = new THREE.MeshStandardMaterial({
        color: spotColor,
        roughness: 0.8
      });
      const spot = new THREE.Mesh(spotGeometry, spotMaterial);
      
      // Position on cap surface
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI / 3;
      const radius = cap.geometry.parameters.radius || 0.08;
      
      spot.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      
      group.add(spot);
    }
    
    return group;
  }

  /**
   * Add bioluminescent glow effect
   */
  private static addBioluminescence(
    group: THREE.Group,
    glowColor: THREE.Color,
    intensity: number
  ): void {
    const light = new THREE.PointLight(glowColor, intensity, 0.5);
    light.position.y = 0.1;
    group.add(light);
    
    // Add emissive material to mushroom parts
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive = glowColor.clone();
        child.material.emissiveIntensity = intensity * 0.5;
      }
    });
  }

  /**
   * Create spore cloud particle effect
   */
  private static createSporeCloud(species: MushroomSpecies): THREE.Points {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = Math.random() * 0.15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: this.SPECIES_DATA[species].capColor,
      size: 0.005,
      transparent: true,
      opacity: 0.6
    });
    
    return new THREE.Points(geometry, material);
  }

  /**
   * Apply decay colors to aging mushrooms
   */
  private static applyDecayColors(group: THREE.Group, stage: GrowthStage): void {
    const decayColor = stage === GrowthStage.AGING 
      ? new THREE.Color(0x6b5344)
      : new THREE.Color(0x3d2f22);
    
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.lerp(decayColor, stage === GrowthStage.AGING ? 0.3 : 0.6);
      }
    });
  }

  /**
   * Get size multiplier based on growth stage
   */
  private static getGrowthStageMultiplier(stage: GrowthStage): number {
    switch (stage) {
      case GrowthStage.YOUNG:
        return 0.5;
      case GrowthStage.MATURE:
        return 1.0;
      case GrowthStage.AGING:
        return 1.1;
      case GrowthStage.DECAYING:
        return 0.9;
      default:
        return 1.0;
    }
  }

  /**
   * Generate mushroom cluster
   */
  static generateCluster(config: MushroomVarietyConfig, count: number): THREE.Group {
    const group = new THREE.Group();
    const clusterRadius = 0.3;
    
    for (let i = 0; i < count; i++) {
      const mushroom = this.generateMushroom(config);
      
      // Position in cluster
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * clusterRadius;
      mushroom.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      
      // Slight rotation variation
      mushroom.rotation.y = Math.random() * Math.PI * 2;
      
      group.add(mushroom);
    }
    
    return group;
  }

  /**
   * Generate scattered mushrooms across area
   */
  static generateScattered(config: MushroomVarietyConfig): THREE.Group {
    const group = new THREE.Group();
    const mushroomCount = Math.floor(config.density * config.area.x * config.area.y);
    
    for (let i = 0; i < mushroomCount; i++) {
      const mushroomConfig: MushroomVarietyConfig = {
        ...config,
        growthStage: this.getRandomGrowthStage()
      };
      
      const mushroom = this.generateMushroom(mushroomConfig);
      
      // Position in area
      const x = (Math.random() - 0.5) * config.area.x;
      const z = (Math.random() - 0.5) * config.area.y;
      const y = this.calculateHeight(x, z, config.area);
      
      mushroom.position.set(x, y, z);
      mushroom.rotation.y = Math.random() * Math.PI * 2;
      
      if (config.clusterGrowth && Math.random() > 0.7) {
        const clusterSize = 3 + Math.floor(Math.random() * 5);
        const cluster = this.generateCluster(mushroomConfig, clusterSize);
        cluster.position.copy(mushroom.position);
        group.add(cluster);
      } else {
        group.add(mushroom);
      }
    }
    
    return group;
  }

  /**
   * Calculate height based on terrain
   */
  private static calculateHeight(x: number, z: number, area: THREE.Vector2): number {
    const normalizedX = (x / area.x + 0.5) * 10;
    const normalizedZ = (z / area.y + 0.5) * 10;
    return NoiseUtils.perlin2D(normalizedX, normalizedZ) * 0.02;
  }

  /**
   * Get random growth stage with weighted distribution
   */
  private static getRandomGrowthStage(): GrowthStage {
    const rand = Math.random();
    if (rand < 0.2) return GrowthStage.YOUNG;
    if (rand < 0.6) return GrowthStage.MATURE;
    if (rand < 0.85) return GrowthStage.AGING;
    return GrowthStage.DECAYING;
  }
}
