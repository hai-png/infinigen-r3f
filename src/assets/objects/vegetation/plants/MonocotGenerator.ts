/**
 * MonocotGenerator - Generates monocotyledon plants (grasses, lilies, palms, etc.)
 * 
 * Monocots are characterized by:
 * - Parallel leaf venation
 * - Flower parts in multiples of three
 * - Single seed leaf (cotyledon)
 * - Fibrous root systems
 * 
 * This generator covers:
 * - Tall grasses and reeds
 * - Lilies and irises
 * - Agaves and yuccas
 * - Bamboo (grass family)
 * - Cattails and rushes
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';

export interface MonocotConfig {
  // Plant type
  species: 'tall_grass' | 'reed' | 'lily' | 'iris' | 'agave' | 'yucca' | 'bamboo' | 'cattail' | 'rush';
  
  // Size parameters
  height: number;           // Overall plant height (0.2 - 5.0)
  stemRadius: number;       // Stem thickness (0.001 - 0.1)
  leafLength: number;       // Leaf length multiplier (0.3 - 2.0)
  leafWidth: number;        // Leaf width (0.01 - 0.5)
  
  // Density and clustering
  clusterSize: number;      // Number of stems per cluster (1 - 20)
  spreadRadius: number;     // Cluster spread (0.1 - 2.0)
  
  // Leaf properties
  leafCount: number;        // Leaves per stem (3 - 20)
  leafCurvature: number;    // How much leaves curve (0.0 - 1.0)
  leafDroop: number;        // Downward droop (0.0 - 1.0)
  leafTwist: number;        // Spiral twist along stem (0.0 - 1.0)
  
  // Color variation
  primaryColor: THREE.Color;
  secondaryColor: THREE.Color;
  colorVariation: number;   // Random color variation (0.0 - 1.0)
  
  // Environmental factors
  windSensitivity: number;  // Response to wind (0.0 - 1.0)
  seasonalTint: number;     // Seasonal color shift (0.0 - 1.0)
  
  // Detail level
  segments: number;         // Geometry segments per leaf (4 - 20)
  useInstancing: boolean;   // Use instanced rendering for clusters
}

export const MonocotSpeciesPresets: Record<string, Partial<MonocotConfig>> = {
  tall_grass: {
    height: 0.8,
    stemRadius: 0.003,
    leafLength: 1.0,
    leafWidth: 0.02,
    clusterSize: 8,
    spreadRadius: 0.3,
    leafCount: 5,
    leafCurvature: 0.4,
    leafDroop: 0.3,
    primaryColor: new THREE.Color(0x7cba6b),
    secondaryColor: new THREE.Color(0x5a8f4a),
  },
  
  reed: {
    height: 2.5,
    stemRadius: 0.008,
    leafLength: 0.8,
    leafWidth: 0.03,
    clusterSize: 12,
    spreadRadius: 0.5,
    leafCount: 8,
    leafCurvature: 0.2,
    leafDroop: 0.5,
    primaryColor: new THREE.Color(0x8bb860),
    secondaryColor: new THREE.Color(0x6b8f45),
  },
  
  lily: {
    height: 0.6,
    stemRadius: 0.004,
    leafLength: 1.2,
    leafWidth: 0.08,
    clusterSize: 5,
    spreadRadius: 0.4,
    leafCount: 6,
    leafCurvature: 0.6,
    leafDroop: 0.2,
    primaryColor: new THREE.Color(0x6baa5c),
    secondaryColor: new THREE.Color(0x4a7a3a),
  },
  
  iris: {
    height: 0.7,
    stemRadius: 0.003,
    leafLength: 1.0,
    leafWidth: 0.04,
    clusterSize: 6,
    spreadRadius: 0.3,
    leafCount: 7,
    leafCurvature: 0.3,
    leafDroop: 0.4,
    primaryColor: new THREE.Color(0x7ab868),
    secondaryColor: new THREE.Color(0x5a8a48),
  },
  
  agave: {
    height: 0.5,
    stemRadius: 0.01,
    leafLength: 1.5,
    leafWidth: 0.15,
    clusterSize: 1,
    spreadRadius: 0.1,
    leafCount: 15,
    leafCurvature: 0.5,
    leafDroop: 0.6,
    primaryColor: new THREE.Color(0x5a8f5a),
    secondaryColor: new THREE.Color(0x3a6f3a),
  },
  
  yucca: {
    height: 1.2,
    stemRadius: 0.015,
    leafLength: 1.3,
    leafWidth: 0.08,
    clusterSize: 1,
    spreadRadius: 0.1,
    leafCount: 20,
    leafCurvature: 0.2,
    leafDroop: 0.7,
    primaryColor: new THREE.Color(0x6a9f6a),
    secondaryColor: new THREE.Color(0x4a7f4a),
  },
  
  bamboo: {
    height: 4.0,
    stemRadius: 0.03,
    leafLength: 0.6,
    leafWidth: 0.04,
    clusterSize: 10,
    spreadRadius: 0.8,
    leafCount: 12,
    leafCurvature: 0.3,
    leafDroop: 0.4,
    primaryColor: new THREE.Color(0x8acb76),
    secondaryColor: new THREE.Color(0x6a9b56),
  },
  
  cattail: {
    height: 1.8,
    stemRadius: 0.006,
    leafLength: 0.9,
    leafWidth: 0.025,
    clusterSize: 8,
    spreadRadius: 0.4,
    leafCount: 6,
    leafCurvature: 0.4,
    leafDroop: 0.5,
    primaryColor: new THREE.Color(0x7fb868),
    secondaryColor: new THREE.Color(0x5f8a48),
  },
  
  rush: {
    height: 1.0,
    stemRadius: 0.004,
    leafLength: 0.5,
    leafWidth: 0.015,
    clusterSize: 15,
    spreadRadius: 0.5,
    leafCount: 4,
    leafCurvature: 0.2,
    leafDroop: 0.3,
    primaryColor: new THREE.Color(0x85bc70),
    secondaryColor: new THREE.Color(0x659c50),
  },
};

const defaultConfig: MonocotConfig = {
  species: 'tall_grass',
  height: 0.8,
  stemRadius: 0.003,
  leafLength: 1.0,
  leafWidth: 0.02,
  clusterSize: 8,
  spreadRadius: 0.3,
  leafCount: 5,
  leafCurvature: 0.4,
  leafDroop: 0.3,
  leafTwist: 0.2,
  primaryColor: new THREE.Color(0x7cba6b),
  secondaryColor: new THREE.Color(0x5a8f4a),
  colorVariation: 0.15,
  windSensitivity: 0.6,
  seasonalTint: 0.0,
  segments: 8,
  useInstancing: true,
};

export class MonocotGenerator {
  private noise: NoiseFunction3D;
  private config: MonocotConfig;
  
  constructor(config: Partial<MonocotConfig> = {}) {
    this.noise = createNoise3D();
    this.config = { ...defaultConfig, ...config };
    
    // Apply preset if species is specified
    if (config.species && MonocotSpeciesPresets[config.species]) {
      this.config = {
        ...this.config,
        ...MonocotSpeciesPresets[config.species],
        ...config,
      };
    }
  }
  
  /**
   * Generate a complete monocot cluster
   */
  generateCluster(position?: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    
    if (position) {
      group.position.copy(position);
    }
    
    const { clusterSize, spreadRadius } = this.config;
    
    for (let i = 0; i < clusterSize; i++) {
      const angle = (i / clusterSize) * Math.PI * 2;
      const radius = Math.random() * spreadRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const stem = this.generateStem(new THREE.Vector3(x, 0, z));
      group.add(stem);
    }
    
    return group;
  }
  
  /**
   * Generate a single monocot stem with leaves
   */
  generateStem(offset: THREE.Vector3 = new THREE.Vector3()): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(offset);
    
    // Generate stem
    const stemGeometry = this.createStemGeometry();
    const stemMaterial = this.createStemMaterial();
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    group.add(stem);
    
    // Generate leaves
    const { leafCount, leafTwist } = this.config;
    for (let i = 0; i < leafCount; i++) {
      const leafAngle = (i / leafCount) * Math.PI * 2 + leafTwist * Math.PI;
      const leafHeight = 0.3 + (i / leafCount) * 0.5; // Leaves distributed along stem
      
      const leaf = this.createLeaf(leafAngle, leafHeight);
      group.add(leaf);
    }
    
    return group;
  }
  
  /**
   * Create stem geometry based on species
   */
  private createStemGeometry(): THREE.CylinderGeometry {
    const { height, stemRadius, segments } = this.config;
    
    // Add slight taper and noise variation
    const topRadius = stemRadius * (0.7 + Math.random() * 0.2);
    const bottomRadius = stemRadius * (1.0 + Math.random() * 0.1);
    
    return new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      height,
      Math.max(6, segments),
      segments,
      false
    );
  }
  
  /**
   * Create stem material with color variation
   */
  private createStemMaterial(): THREE.MeshStandardMaterial {
    const { primaryColor, secondaryColor, colorVariation } = this.config;
    
    const t = Math.random() * colorVariation;
    const color = new THREE.Color().lerpColors(primaryColor, secondaryColor, t);
    
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  
  /**
   * Create a single leaf
   */
  private createLeaf(angle: number, heightRatio: number): THREE.Mesh {
    const { height, leafLength, leafWidth, leafCurvature, leafDroop, segments } = this.config;
    
    const leafGeometry = this.createLeafGeometry(segments);
    const leafMaterial = this.createLeafMaterial();
    
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    
    // Position leaf on stem
    const leafY = height * heightRatio;
    leaf.position.set(0, leafY, 0);
    
    // Rotate leaf around stem
    leaf.rotation.y = angle;
    
    // Apply curvature and droop
    this.applyLeafDeformation(leaf, leafCurvature, leafDroop);
    
    return leaf;
  }
  
  /**
   * Create leaf geometry (long, narrow blade shape)
   */
  private createLeafGeometry(segments: number): THREE.PlaneGeometry {
    const { leafLength, leafWidth, height } = this.config;
    
    const length = leafLength * height * 0.5;
    const width = leafWidth;
    
    // Create tapered leaf shape using custom vertices
    const geometry = new THREE.PlaneGeometry(width, length, 1, segments);
    
    // Taper the leaf (narrower at tip)
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]; // Along leaf length
      const t = (y + length / 2) / length; // 0 at base, 1 at tip
      
      // Taper width towards tip
      const taperFactor = 1.0 - t * 0.7;
      positions[i] *= taperFactor;
      
      // Add slight wave along length
      positions[i + 1] += Math.sin(t * Math.PI * 2) * length * 0.05;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  /**
   * Create leaf material
   */
  private createLeafMaterial(): THREE.MeshStandardMaterial {
    const { primaryColor, secondaryColor, colorVariation, seasonalTint } = this.config;
    
    const t = Math.random() * colorVariation;
    const baseColor = new THREE.Color().lerpColors(primaryColor, secondaryColor, t);
    
    // Apply seasonal tint (shift towards yellow/brown in autumn)
    if (seasonalTint > 0) {
      const autumnColor = new THREE.Color(0xd4a574);
      baseColor.lerp(autumnColor, seasonalTint * 0.5);
    }
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });
  }
  
  /**
   * Apply deformation to leaf mesh for natural curvature
   */
  private applyLeafDeformation(leaf: THREE.Mesh, curvature: number, droop: number): void {
    const geometry = leaf.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]; // Along leaf length
      const x = positions[i];     // Across leaf width
      
      // Apply curvature (bend outward from stem)
      const bendAmount = curvature * (y / (geometry.parameters.height / 2)) * 0.3;
      positions[i + 2] = x * bendAmount; // Z-axis bend
      
      // Apply droop (downward curve)
      const droopAmount = droop * Math.pow((y + geometry.parameters.height / 2) / geometry.parameters.height, 2) * 0.5;
      positions[i + 1] -= Math.abs(x) * droopAmount;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  
  /**
   * Generate instanced monocot field for performance
   */
  generateField(
    count: number,
    areaSize: number,
    terrainHeightmap?: (x: number, z: number) => number
  ): THREE.InstancedMesh {
    const { clusterSize } = this.config;
    const totalStems = count * clusterSize;
    
    // Create prototype geometry and material
    const stemGroup = this.generateStem();
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
      // Random position in area
      const x = (Math.random() - 0.5) * areaSize;
      const z = (Math.random() - 0.5) * areaSize;
      let y = 0;
      
      // Sample terrain height if provided
      if (terrainHeightmap) {
        y = terrainHeightmap(x, z);
      }
      
      // Generate cluster at this position
      for (let j = 0; j < clusterSize; j++) {
        if (instanceIndex >= totalStems) break;
        
        const angle = (j / clusterSize) * Math.PI * 2;
        const radius = Math.random() * this.config.spreadRadius;
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;
        
        position.set(x + offsetX, y, z + offsetZ);
        
        // Random rotation and slight scale variation
        const rotationY = Math.random() * Math.PI * 2;
        const scaleVar = 0.8 + Math.random() * 0.4;
        
        scale.set(scaleVar, scaleVar, scaleVar);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
        
        matrix.compose(position, quaternion, scale);
        instancedMesh.setMatrixAt(instanceIndex++, matrix);
      }
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<MonocotConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Re-apply preset if species changed
    if (config.species && MonocotSpeciesPresets[config.species]) {
      this.config = {
        ...this.config,
        ...MonocotSpeciesPresets[config.species],
      };
    }
  }
  
  /**
   * Get current configuration
   */
  getConfig(): MonocotConfig {
    return { ...this.config };
  }
}

export default MonocotGenerator;
