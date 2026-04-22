/**
 * Ground Debris Scatter System
 * Generates natural ground debris including leaves, twigs, pinecones, and organic matter
 * with biome-specific variations and decay states
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult } from './types';

export interface GroundDebrisParams extends ScatterParams {
  /** Number of debris items to scatter (default: 100) */
  count?: number;
  /** Debris types to include (default: all) */
  debrisTypes?: Array<'leaf' | 'twig' | 'pinecone' | 'acorn' | 'bark' | 'seed'>;
  /** Biome affects debris selection: forest, desert, grassland, autumn (default: 'forest') */
  biome?: 'forest' | 'desert' | 'grassland' | 'autumn';
  /** Decay state: fresh, decaying, decomposed, mixed (default: 'mixed') */
  decayState?: 'fresh' | 'decaying' | 'decomposed' | 'mixed';
  /** Scale variation multiplier (0-1, default: 0.7) */
  scaleVariation?: number;
  /** Clustering factor (0=random, 1=highly clustered, default: 0.5) */
  clustering?: number;
  /** Include very small particles (default: true) */
  includeMicro?: boolean;
}

interface DebrisType {
  name: string;
  baseSize: number;
  shape: 'leaf' | 'stick' | 'round' | 'irregular';
  biomes: Array<'forest' | 'desert' | 'grassland' | 'autumn'>;
  colors: {
    fresh: string;
    decaying: string;
    decomposed: string;
  };
}

const DEBRIS_TYPES: Record<string, DebrisType> = {
  leaf: {
    name: 'Leaf',
    baseSize: 0.08,
    shape: 'leaf',
    biomes: ['forest', 'grassland', 'autumn'],
    colors: {
      fresh: '#228B22',
      decaying: '#DAA520',
      decomposed: '#8B4513',
    },
  },
  twig: {
    name: 'Twig',
    baseSize: 0.12,
    shape: 'stick',
    biomes: ['forest', 'grassland', 'autumn'],
    colors: {
      fresh: '#8B4513',
      decaying: '#A0522D',
      decomposed: '#696969',
    },
  },
  pinecone: {
    name: 'Pinecone',
    baseSize: 0.06,
    shape: 'round',
    biomes: ['forest'],
    colors: {
      fresh: '#8B4513',
      decaying: '#A0522D',
      decomposed: '#696969',
    },
  },
  acorn: {
    name: 'Acorn',
    baseSize: 0.04,
    shape: 'round',
    biomes: ['forest', 'autumn'],
    colors: {
      fresh: '#8B4513',
      decaying: '#A0522D',
      decomposed: '#696969',
    },
  },
  bark: {
    name: 'Bark',
    baseSize: 0.1,
    shape: 'irregular',
    biomes: ['forest'],
    colors: {
      fresh: '#654321',
      decaying: '#8B7355',
      decomposed: '#696969',
    },
  },
  seed: {
    name: 'Seed',
    baseSize: 0.02,
    shape: 'round',
    biomes: ['forest', 'grassland', 'autumn'],
    colors: {
      fresh: '#DAA520',
      decaying: '#8B7355',
      decomposed: '#696969',
    },
  },
};

/**
 * Creates leaf geometry with varied shapes
 */
function createLeafGeometry(shape: 'maple' | 'oak' | 'pine' | 'generic'): THREE.ShapeGeometry {
  const leafShape = new THREE.Shape();
  
  switch (shape) {
    case 'maple':
      // Maple leaf shape (simplified)
      leafShape.moveTo(0, 0);
      leafShape.lineTo(-0.3, 0.2);
      leafShape.lineTo(-0.5, 0.1);
      leafShape.lineTo(-0.3, 0.5);
      leafShape.lineTo(0, 0.8);
      leafShape.lineTo(0.3, 0.5);
      leafShape.lineTo(0.5, 0.1);
      leafShape.lineTo(0.3, 0.2);
      leafShape.lineTo(0, 0);
      break;
      
    case 'oak':
      // Oak leaf shape (lobed)
      leafShape.moveTo(0, 0);
      for (let i = 0; i <= 1; i += 0.1) {
        const x = -0.5 + i;
        const y = Math.sin(i * Math.PI * 3) * 0.2 + 0.3 * i;
        if (i === 0) leafShape.moveTo(x, y);
        else leafShape.lineTo(x, y);
      }
      leafShape.lineTo(0, 0);
      break;
      
    case 'pine':
      // Pine needle (thin rectangle)
      leafShape.moveTo(-0.02, 0);
      leafShape.lineTo(0.02, 0);
      leafShape.lineTo(0.01, 1);
      leafShape.lineTo(-0.01, 1);
      leafShape.lineTo(-0.02, 0);
      break;
      
    case 'generic':
    default:
      // Simple oval leaf
      leafShape.moveTo(0, 0);
      leafShape.quadraticCurveTo(-0.3, 0.3, 0, 0.6);
      leafShape.quadraticCurveTo(0.3, 0.3, 0, 0);
      break;
  }
  
  return new THREE.ShapeGeometry(leafShape);
}

/**
 * Creates twig/stick geometry
 */
function createTwigGeometry(length: number): THREE.CylinderGeometry {
  const radiusTop = length * 0.03;
  const radiusBottom = length * 0.05;
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 6);
}

/**
 * Creates pinecone/acorn geometry
 */
function createRoundDebrisGeometry(size: number, type: 'pinecone' | 'acorn'): THREE.Geometry {
  if (type === 'pinecone') {
    // Elongated sphere for pinecone
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    geometry.scale(1, 1.5, 1);
    return geometry;
  } else {
    // Acorn shape (sphere with cap)
    const group = new THREE.Group();
    
    const nutGeometry = new THREE.SphereGeometry(size, 8, 8);
    const nutMaterial = new THREE.MeshStandardMaterial({ color: '#8B4513' });
    const nut = new THREE.Mesh(nutGeometry, nutMaterial);
    group.add(nut);
    
    const capGeometry = new THREE.SphereGeometry(size * 0.9, 8, 8);
    capGeometry.scale(1, 0.5, 1);
    const capMaterial = new THREE.MeshStandardMaterial({ color: '#654321' });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = size * 0.5;
    group.add(cap);
    
    return group as any;
  }
}

/**
 * Selects debris types based on biome
 */
function selectDebrisForBiome(
  availableTypes: string[],
  biome: 'forest' | 'desert' | 'grassland' | 'autumn'
): string[] {
  return availableTypes.filter(typeKey => {
    const debris = DEBRIS_TYPES[typeKey];
    return debris.biomes.includes(biome);
  });
}

/**
 * Determines color based on decay state
 */
function getDecayColor(debris: DebrisType, decayState: 'fresh' | 'decaying' | 'decomposed'): string {
  return debris.colors[decayState];
}

/**
 * Main ground debris scatter function
 */
export async function GroundDebrisScatter(params: GroundDebrisParams = {}): Promise<ScatterResult> {
  const {
    count = 100,
    debrisTypes = Object.keys(DEBRIS_TYPES),
    biome = 'forest',
    decayState = 'mixed',
    scaleVariation = 0.7,
    clustering = 0.5,
    includeMicro = true,
    surface,
    bounds,
  } = params;

  // Filter debris by biome
  const biomeApplicable = selectDebrisForBiome(debrisTypes, biome);
  const finalTypes = biomeApplicable.length > 0 ? biomeApplicable : debrisTypes;

  // Determine decay states to use
  let decayStates: Array<'fresh' | 'decaying' | 'decomposed'>;
  switch (decayState) {
    case 'fresh':
      decayStates = ['fresh'];
      break;
    case 'decaying':
      decayStates = ['decaying'];
      break;
    case 'decomposed':
      decayStates = ['decomposed'];
      break;
    case 'mixed':
    default:
      decayStates = ['fresh', 'decaying', 'decomposed'];
  }

  // Generate positions with clustering
  const defaultBounds = new THREE.Box3(
    new THREE.Vector3(-5, 0, -5),
    new THREE.Vector3(5, 0.1, 5)
  );
  const effectiveBounds = bounds || defaultBounds;
  
  const positions = generateClusteredPositions(count, clustering, effectiveBounds);

  // Create debris instances
  const debrisObjects: THREE.Group[] = [];
  
  for (const position of positions) {
    // Select random debris type
    const typeKey = finalTypes[Math.floor(Math.random() * finalTypes.length)];
    const debrisData = DEBRIS_TYPES[typeKey];
    
    // Select decay state
    const currentDecay = decayStates[Math.floor(Math.random() * decayStates.length)];
    
    // Determine size with variation
    const baseSize = debrisData.baseSize;
    const variation = 0.5 + Math.random() * scaleVariation;
    const size = baseSize * variation;
    
    // Create debris geometry
    const debris = createDebrisMesh(debrisData, size, currentDecay);
    
    // Position
    debris.position.copy(position);
    
    // Random rotation
    debris.rotation.set(
      (Math.random() - 0.5) * Math.PI,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * Math.PI
    );
    
    // Ensure it's lying on the ground
    if (debrisData.shape !== 'stick') {
      debris.rotation.x = Math.PI / 2;
    }
    
    debrisObjects.push(debris);
  }

  // Add micro debris if enabled
  if (includeMicro) {
    const microCount = Math.floor(count * 0.3);
    for (let i = 0; i < microCount; i++) {
      const micro = createMicroDebris();
      const x = effectiveBounds.min.x + Math.random() * (effectiveBounds.max.x - effectiveBounds.min.x);
      const z = effectiveBounds.min.z + Math.random() * (effectiveBounds.max.z - effectiveBounds.min.z);
      micro.position.set(x, effectiveBounds.min.y, z);
      micro.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      debrisObjects.push(micro);
    }
  }

  // Group all debris
  const scatterObject = new THREE.Group();
  debrisObjects.forEach(obj => scatterObject.add(obj));

  return {
    scatterObject,
    instances: debrisObjects.map((obj, i) => ({
      id: `debris_${i}`,
      position: obj.position.clone(),
      rotation: obj.rotation.clone(),
      scale: obj.scale.clone(),
      metadata: {
        type: 'ground_debris',
        debrisType: finalTypes[Math.floor(Math.random() * finalTypes.length)],
        biome,
        decayState,
      },
    })),
    bounds: effectiveBounds,
    count: debrisObjects.length,
  };
}

/**
 * Creates a debris mesh based on type and decay
 */
function createDebrisMesh(
  debris: DebrisType,
  size: number,
  decayState: 'fresh' | 'decaying' | 'decomposed'
): THREE.Mesh {
  const color = getDecayColor(debris, decayState);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
  });

  let geometry: THREE.BufferGeometry;

  switch (debris.shape) {
    case 'leaf':
      const leafShapes: Array<'maple' | 'oak' | 'pine' | 'generic'> = ['maple', 'oak', 'pine', 'generic'];
      const leafShape = leafShapes[Math.floor(Math.random() * leafShapes.length)];
      geometry = createLeafGeometry(leafShape);
      break;
      
    case 'stick':
      const length = size * 2;
      geometry = createTwigGeometry(length);
      break;
      
    case 'round':
      const type = debris.name.toLowerCase() as 'pinecone' | 'acorn';
      const roundGeom = createRoundDebrisGeometry(size, type);
      if ((roundGeom as any).isGroup) {
        const group = new THREE.Group();
        (roundGeom as any).children.forEach((child: THREE.Mesh) => {
          child.material = material;
          group.add(child);
        });
        return group as any;
      }
      geometry = roundGeom;
      break;
      
    case 'irregular':
    default:
      geometry = new THREE.DodecahedronGeometry(size, 0);
      geometry.scale(1, 0.3, 1);
      break;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(size / debris.baseSize, size / debris.baseSize, size / debris.baseSize);
  
  return mesh;
}

/**
 * Creates micro debris particles
 */
function createMicroDebris(): THREE.Mesh {
  const size = 0.005 + Math.random() * 0.01;
  const geometry = new THREE.BoxGeometry(size, size * 0.2, size);
  const material = new THREE.MeshStandardMaterial({
    color: Math.random() > 0.5 ? '#8B7355' : '#696969',
    roughness: 0.9,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Generates clustered positions
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
      bounds.min.y,
      bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z)
    );
    clusterCenters.push(center);
  }

  // Generate points around clusters
  for (let i = 0; i < count; i++) {
    const clusterIndex = Math.floor(Math.random() * clusterCenters.length);
    const center = clusterCenters[clusterIndex];
    const spread = (bounds.max.x - bounds.min.x) * 0.2 * (1 - clustering);
    
    const position = new THREE.Vector3(
      center.x + (Math.random() - 0.5) * spread,
      bounds.min.y,
      center.z + (Math.random() - 0.5) * spread
    );
    
    positions.push(position);
  }

  return positions;
}
