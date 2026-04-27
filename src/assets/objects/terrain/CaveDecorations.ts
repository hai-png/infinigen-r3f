/**
 * CaveDecorations - Stalactites, stalagmites, crystals, and cave features
 * 
 * Generates procedural cave decorations:
 * - Stalactites (hanging from ceiling)
 * - Stalagmites (rising from floor)
 * - Crystal formations
 * - Rock columns
 * - Water drips and pools
 */

import * as THREE from 'three';
import { NoiseUtils } from '../../../terrain/utils/NoiseUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export type CaveDecorationType = 'stalactite' | 'stalagmite' | 'crystal' | 'column' | 'flowstone';

export interface CaveDecorationConfig {
  // Density and distribution
  density: number;
  sizeVariation: number;
  
  // Type-specific settings
  decorationTypes: CaveDecorationType[];
  stalactiteLength: [number, number]; // min, max
  stalagmiteHeight: [number, number];
  crystalSize: [number, number];
  
  // Material
  rockColor: THREE.Color;
  crystalColor: THREE.Color;
  wetness: number; // 0-1, affects shininess
  
  // Generation
  seed: number;
}

export interface CaveDecorationInstance {
  type: CaveDecorationType;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  mesh: THREE.Mesh;
}

// ============================================================================
// CaveDecorations Class
// ============================================================================

export class CaveDecorations {
  private config: CaveDecorationConfig;
  private noise: NoiseUtils;
  private instances: CaveDecorationInstance[];
  
  constructor(config: Partial<CaveDecorationConfig> = {}) {
    this.config = {
      density: 50,
      sizeVariation: 0.4,
      decorationTypes: ['stalactite', 'stalagmite', 'crystal'],
      stalactiteLength: [0.5, 3],
      stalagmiteHeight: [0.3, 2],
      crystalSize: [0.2, 1],
      rockColor: new THREE.Color(0x4a4540),
      crystalColor: new THREE.Color(0x88ccff),
      wetness: 0.3,
      seed: Math.random() * 10000,
      ...config
    };
    
    this.noise = new NoiseUtils(this.config.seed);
    this.instances = [];
  }
  
  /**
   * Generate cave decorations for a cave area
   */
  generate(area: number): THREE.Group {
    const group = new THREE.Group();
    this.instances = [];
    
    // Generate decorations based on density and area
    const count = Math.floor(this.config.density * area);
    
    for (let i = 0; i < count; i++) {
      const decoration = this.generateRandomDecoration();
      if (decoration) {
        this.instances.push(decoration);
        group.add(decoration.mesh);
      }
    }
    
    return group;
  }
  
  /**
   * Generate a random decoration
   */
  private generateRandomDecoration(): CaveDecorationInstance | null {
    // Select random type
    const typeIndex = Math.floor(Math.random() * this.config.decorationTypes.length);
    const type = this.config.decorationTypes[typeIndex];
    
    // Random position
    const x = (Math.random() - 0.5) * 10;
    const z = (Math.random() - 0.5) * 10;
    const y = type === 'stalactite' ? 2 : -2; // Ceiling or floor
    
    // Create mesh based on type
    let mesh: THREE.Mesh;
    switch (type) {
      case 'stalactite':
        mesh = this.createStalactite();
        break;
      case 'stalagmite':
        mesh = this.createStalagmite();
        break;
      case 'crystal':
        mesh = this.createCrystal();
        break;
      case 'column':
        mesh = this.createColumn();
        break;
      case 'flowstone':
        mesh = this.createFlowstone();
        break;
      default:
        return null;
    }
    
    // Position and rotate
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    
    // Scale variation
    const scale = 1 + (Math.random() - 0.5) * this.config.sizeVariation;
    mesh.scale.setScalar(scale);
    
    return {
      type,
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone(),
      mesh
    };
  }
  
  /**
   * Create stalactite mesh (hanging from ceiling)
   */
  private createStalactite(): THREE.Mesh {
    const length = THREE.MathUtils.lerp(
      this.config.stalactiteLength[0],
      this.config.stalactiteLength[1],
      Math.random()
    );
    
    const geometry = new THREE.ConeGeometry(0.1, length, 7);
    geometry.translate(0, -length / 2, 0); // Pivot at top
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.rockColor,
      roughness: 0.9,
      metalness: 0.05
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.x = Math.PI; // Hang downward
    
    return mesh;
  }
  
  /**
   * Create stalagmite mesh (rising from floor)
   */
  private createStalagmite(): THREE.Mesh {
    const height = THREE.MathUtils.lerp(
      this.config.stalagmiteHeight[0],
      this.config.stalagmiteHeight[1],
      Math.random()
    );
    
    const geometry = new THREE.ConeGeometry(0.15, height, 7);
    geometry.translate(0, height / 2, 0); // Pivot at bottom
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.rockColor,
      roughness: 0.85,
      metalness: 0.05
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Create crystal formation
   */
  private createCrystal(): THREE.Mesh {
    const size = THREE.MathUtils.lerp(
      this.config.crystalSize[0],
      this.config.crystalSize[1],
      Math.random()
    );
    
    // Use octahedron for crystal shape
    const geometry = new THREE.OctahedronGeometry(size);
    
    const material = new THREE.MeshPhysicalMaterial({
      color: this.config.crystalColor,
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.6, // Glass-like
      thickness: 0.5,
      clearcoat: 1.0
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Create column (connected stalactite + stalagmite)
   */
  private createColumn(): THREE.Mesh {
    const height = THREE.MathUtils.lerp(2, 5, Math.random());
    
    // Combine cone geometries
    const topCone = new THREE.ConeGeometry(0.2, height * 0.5, 7);
    topCone.translate(0, -height * 0.25, 0);
    
    const bottomCone = new THREE.ConeGeometry(0.2, height * 0.5, 7);
    bottomCone.translate(0, height * 0.25, 0);
    
    // Merge would require BufferGeometryUtils, using Group instead
    const group = new THREE.Group();
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.rockColor,
      roughness: 0.8,
      metalness: 0.05
    });
    
    const topMesh = new THREE.Mesh(topCone, material);
    const bottomMesh = new THREE.Mesh(bottomCone, material);
    
    group.add(topMesh);
    group.add(bottomMesh);
    
    // Wrap in a single mesh-like object
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, height, 7),
      material
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Create flowstone (water-worn rock formation)
   */
  private createFlowstone(): THREE.Mesh {
    const width = 0.5 + Math.random() * 1;
    const height = 0.3 + Math.random() * 0.5;
    
    const geometry = new THREE.SphereGeometry(width, 7, 7);
    geometry.scale(1, height / width, 0.5);
    geometry.translate(0, height / 2, 0);
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.rockColor,
      roughness: 0.6,
      metalness: 0.1
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Get all decoration instances
   */
  getInstances(): CaveDecorationInstance[] {
    return [...this.instances];
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<CaveDecorationConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): CaveDecorationConfig {
    return { ...this.config };
  }
  
  /**
   * Clear all instances
   */
  clear(): void {
    this.instances = [];
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.instances.forEach(inst => {
      inst.mesh.geometry.dispose();
      (inst.mesh.material as THREE.Material).dispose();
    });
    this.instances = [];
  }
}

export default CaveDecorations;
