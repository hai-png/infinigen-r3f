/**
 * Flower Scatter System
 * Generates diverse flower distributions with species variation, seasonal selection, and natural clustering
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult } from './types';

export interface FlowerScatterParams extends ScatterParams {
  /** Number of flowers to scatter (default: 50) */
  count?: number;
  /** Flower species to use (default: all) */
  species?: Array<'daisy' | 'tulip' | 'rose' | 'sunflower' | 'lavender' | 'poppy' | 'orchid' | 'lily'>;
  /** Size category: small, medium, large, or mixed (default: 'mixed') */
  sizeCategory?: 'small' | 'medium' | 'large' | 'mixed';
  /** Season affects species selection: spring, summer, autumn (default: 'summer') */
  season?: 'spring' | 'summer' | 'autumn';
  /** Color diversity multiplier (0-1, default: 0.8) */
  colorDiversity?: number;
  /** Include stems with flowers (default: true) */
  includeStems?: boolean;
  /** Stem length range [min, max] in meters (default: [0.1, 0.3]) */
  stemLength?: [number, number];
  /** Clustering factor (0=random, 1=highly clustered, default: 0.6) */
  clustering?: number;
  /** Wind animation strength (0-1, default: 0.3) */
  windStrength?: number;
}

interface FlowerSpecies {
  name: string;
  petalCount: number;
  petalShape: 'round' | 'pointed' | 'elongated';
  colors: string[];
  sizeRange: [number, number];
  seasons: Array<'spring' | 'summer' | 'autumn'>;
}

const FLOWER_SPECIES: Record<string, FlowerSpecies> = {
  daisy: {
    name: 'Daisy',
    petalCount: 12,
    petalShape: 'elongated',
    colors: ['#FFFFFF', '#FFFACD', '#FFB6C1'],
    sizeRange: [0.03, 0.06],
    seasons: ['spring', 'summer'],
  },
  tulip: {
    name: 'Tulip',
    petalCount: 6,
    petalShape: 'elongated',
    colors: ['#FF0000', '#FFFF00', '#FF69B4', '#800080', '#FFFFFF'],
    sizeRange: [0.08, 0.15],
    seasons: ['spring'],
  },
  rose: {
    name: 'Rose',
    petalCount: 20,
    petalShape: 'round',
    colors: ['#FF0000', '#FF69B4', '#FFFFFF', '#FFFF66', '#FF6600'],
    sizeRange: [0.06, 0.12],
    seasons: ['summer'],
  },
  sunflower: {
    name: 'Sunflower',
    petalCount: 24,
    petalShape: 'elongated',
    colors: ['#FFD700', '#FFA500'],
    sizeRange: [0.15, 0.3],
    seasons: ['summer', 'autumn'],
  },
  lavender: {
    name: 'Lavender',
    petalCount: 8,
    petalShape: 'pointed',
    colors: ['#967BB6', '#B19CD9', '#E6E6FA'],
    sizeRange: [0.05, 0.1],
    seasons: ['summer'],
  },
  poppy: {
    name: 'Poppy',
    petalCount: 4,
    petalShape: 'round',
    colors: ['#FF0000', '#FF6600', '#FFFFFF'],
    sizeRange: [0.04, 0.08],
    seasons: ['spring', 'summer'],
  },
  orchid: {
    name: 'Orchid',
    petalCount: 6,
    petalShape: 'pointed',
    colors: ['#FF69B4', '#800080', '#FFFFFF', '#FFD700'],
    sizeRange: [0.06, 0.12],
    seasons: ['summer', 'autumn'],
  },
  lily: {
    name: 'Lily',
    petalCount: 6,
    petalShape: 'elongated',
    colors: ['#FFFFFF', '#FF69B4', '#FFA500', '#FFFF00'],
    sizeRange: [0.08, 0.15],
    seasons: ['summer'],
  },
};

/**
 * Creates a procedural flower geometry
 */
function createFlowerGeometry(
  species: FlowerSpecies,
  size: number,
  stemLength: number,
  includeStem: boolean
): THREE.Group {
  const group = new THREE.Group();

  // Create petals
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: species.colors[Math.floor(Math.random() * species.colors.length)],
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.1,
  });

  const petalGeometry = createPetalGeometry(species.petalShape, size / 3);
  
  for (let i = 0; i < species.petalCount; i++) {
    const petal = new THREE.Mesh(petalGeometry, petalMaterial);
    const angle = (i / species.petalCount) * Math.PI * 2;
    petal.rotation.z = angle;
    petal.rotation.y = Math.random() * 0.2 - 0.1;
    
    if (includeStem) {
      petal.position.y = stemLength;
    }
    
    group.add(petal);
  }

  // Create center
  const centerGeometry = new THREE.SphereGeometry(size / 4, 8, 8);
  const centerMaterial = new THREE.MeshStandardMaterial({
    color: species.name === 'sunflower' ? '#3D2817' : '#FFD700',
    roughness: 0.8,
  });
  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  center.position.y = includeStem ? stemLength : 0;
  group.add(center);

  // Create stem if requested
  if (includeStem && stemLength > 0) {
    const stemGeometry = new THREE.CylinderGeometry(size / 20, size / 15, stemLength, 6);
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: '#228B22',
      roughness: 0.7,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemLength / 2;
    group.add(stem);

    // Add leaves
    const leafCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < leafCount; i++) {
      const leaf = createLeafGeometry(size / 8);
      const leafMesh = new THREE.Mesh(leaf, stemMaterial);
      const leafY = (stemLength * 0.3) + (i * stemLength * 0.3);
      leafMesh.position.y = leafY;
      leafMesh.rotation.z = Math.PI / 3;
      leafMesh.rotation.y = Math.random() * Math.PI * 2;
      group.add(leafMesh);
    }
  }

  return group;
}

/**
 * Creates petal geometry based on shape type
 */
function createPetalGeometry(shape: 'round' | 'pointed' | 'elongated', size: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const halfSize = size / 2;

  shape.moveTo(0, 0);
  
  if (shape === 'round') {
    shape.quadraticCurveTo(-halfSize, halfSize, 0, size);
    shape.quadraticCurveTo(halfSize, halfSize, 0, 0);
  } else if (shape === 'pointed') {
    shape.lineTo(-halfSize, halfSize * 0.7);
    shape.lineTo(0, size);
    shape.lineTo(halfSize, halfSize * 0.7);
    shape.lineTo(0, 0);
  } else { // elongated
    shape.quadraticCurveTo(-halfSize * 0.5, halfSize, 0, size);
    shape.quadraticCurveTo(halfSize * 0.5, halfSize, 0, 0);
  }

  return new THREE.ShapeGeometry(shape);
}

/**
 * Creates leaf geometry
 */
function createLeafGeometry(size: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-size, size * 0.5, 0, size * 2);
  shape.quadraticCurveTo(size, size * 0.5, 0, 0);
  return new THREE.ShapeGeometry(shape);
}

/**
 * Selects appropriate species based on season
 */
function selectSpeciesForSeason(
  availableSpecies: string[],
  season: 'spring' | 'summer' | 'autumn'
): string[] {
  return availableSpecies.filter(speciesKey => {
    const species = FLOWER_SPECIES[speciesKey];
    return species.seasons.includes(season);
  });
}

/**
 * Generates clustered positions using a simple clustering algorithm
 */
function generateClusteredPositions(
  count: number,
  clustering: number,
  bounds: THREE.Box3
): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const clusterCenters: THREE.Vector3[] = [];
  const numClusters = Math.max(3, Math.floor(count * (1 - clustering) / 3));

  // Generate cluster centers
  for (let i = 0; i < numClusters; i++) {
    const center = new THREE.Vector3(
      bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
      bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
      bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z)
    );
    clusterCenters.push(center);
  }

  // Generate points around clusters
  for (let i = 0; i < count; i++) {
    const clusterIndex = Math.floor(Math.random() * clusterCenters.length);
    const center = clusterCenters[clusterIndex];
    const spread = (bounds.max.x - bounds.min.x) * 0.15 * (1 - clustering);
    
    const position = new THREE.Vector3(
      center.x + (Math.random() - 0.5) * spread,
      center.y + (Math.random() - 0.5) * spread,
      center.z + (Math.random() - 0.5) * spread
    );
    
    // Clamp to bounds
    position.clamp(bounds.min, bounds.max);
    positions.push(position);
  }

  return positions;
}

/**
 * Main flower scatter function
 */
export async function FlowerScatter(params: FlowerScatterParams = {}): Promise<ScatterResult> {
  const {
    count = 50,
    species = Object.keys(FLOWER_SPECIES),
    sizeCategory = 'mixed',
    season = 'summer',
    colorDiversity = 0.8,
    includeStems = true,
    stemLength = [0.1, 0.3],
    clustering = 0.6,
    windStrength = 0.3,
    surface,
    bounds,
  } = params;

  // Filter species by season
  const seasonallyAvailable = selectSpeciesForSeason(species, season);
  const finalSpecies = seasonallyAvailable.length > 0 ? seasonallyAvailable : species;

  // Determine size range based on category
  let sizeRange: [number, number];
  switch (sizeCategory) {
    case 'small':
      sizeRange = [0.03, 0.06];
      break;
    case 'medium':
      sizeRange = [0.06, 0.12];
      break;
    case 'large':
      sizeRange = [0.12, 0.3];
      break;
    case 'mixed':
    default:
      sizeRange = [0.03, 0.3];
  }

  // Generate positions
  const defaultBounds = new THREE.Box3(
    new THREE.Vector3(-5, 0, -5),
    new THREE.Vector3(5, 0.5, 5)
  );
  const effectiveBounds = bounds || defaultBounds;
  
  const positions = generateClusteredPositions(count, clustering, effectiveBounds);

  // Create flower instances
  const flowers: THREE.Group[] = [];
  
  for (const position of positions) {
    // Select random species
    const speciesKey = finalSpecies[Math.floor(Math.random() * finalSpecies.length)];
    const speciesData = FLOWER_SPECIES[speciesKey];
    
    // Determine size
    const baseSize = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    const size = baseSize * (0.8 + Math.random() * 0.4); // ±20% variation
    
    // Determine stem length
    const stemLen = stemLength[0] + Math.random() * (stemLength[1] - stemLength[0]);
    
    // Create flower
    const flower = createFlowerGeometry(speciesData, size, stemLen, includeStems);
    
    // Position and orient
    flower.position.copy(position);
    
    // Random rotation around Y axis
    flower.rotation.y = Math.random() * Math.PI * 2;
    
    // Slight tilt for natural look
    flower.rotation.x = (Math.random() - 0.5) * 0.3;
    flower.rotation.z = (Math.random() - 0.5) * 0.3;
    
    // Apply wind effect if enabled
    if (windStrength > 0) {
      applyWindEffect(flower, windStrength);
    }
    
    flowers.push(flower);
  }

  // Group all flowers
  const scatterObject = new THREE.Group();
  flowers.forEach(flower => scatterObject.add(flower));

  return {
    scatterObject,
    instances: flowers.map((flower, i) => ({
      id: `flower_${i}`,
      position: flower.position.clone(),
      rotation: flower.rotation.clone(),
      scale: flower.scale.clone(),
      metadata: {
        type: 'flower',
        species: finalSpecies[Math.floor(Math.random() * finalSpecies.length)],
        sizeCategory,
        season,
      },
    })),
    bounds: effectiveBounds,
    count: flowers.length,
  };
}

/**
 * Applies wind animation effect to flower
 */
function applyWindEffect(flower: THREE.Group, strength: number): void {
  // Store wind parameters in userData for animation system to access
  flower.userData.windStrength = strength;
  flower.userData.windType = 'flower';
  flower.userData.windOffset = Math.random() * Math.PI * 2;
}
